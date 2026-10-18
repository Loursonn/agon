/**
 * athleteTrends — calculs purs des tendances athlète (Mon profil).
 * Fenêtre glissante de N jours comparée à la fenêtre précédente de même durée.
 */
import { localISO, normalizeDayKey } from "@/lib/date";
import type { WellnessData } from "@/features/shared/types/athlete";

export interface Window { start: string; end: string }

export interface TrendPoint { date: string; value: number | null }

export interface Trend {
  value: number | null;   // moyenne (ou dernière valeur pour le poids) sur la période
  prev: number | null;    // idem sur la période précédente
  delta: number | null;   // value - prev
  series: TrendPoint[];   // une valeur par jour de la période
}

export interface SleepScore {
  score: number;          // 0–100
  regularity: number;     // 0–50
  quantity: number;       // 0–50
  avgHours: number;
  targetHours: number;
  bedtimeDeviationMin: number; // écart moyen à l'heure de coucher cible (ou à la moyenne)
}

export interface SleepGoals {
  sleepTarget?: number;
  sleepBedtime?: { h: number; m: number };
}

// ── Fenêtres ──────────────────────────────────────────────────────────────────

export function windows(days: number, today = new Date()): { cur: Window; prev: Window } {
  const shift = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return localISO(d); };
  return {
    cur:  { start: shift(-(days - 1)),      end: shift(0) },
    prev: { start: shift(-(2 * days - 1)),  end: shift(-days) },
  };
}

function eachDay(w: Window): string[] {
  const out: string[] = [];
  const d = new Date(w.start + "T12:00:00");
  const end = new Date(w.end + "T12:00:00");
  while (d <= end) { out.push(localISO(d)); d.setDate(d.getDate() + 1); }
  return out;
}

const inWin = (iso: string, w: Window) => iso >= w.start && iso <= w.end;

function normalize<T>(m: Record<string, T> | null | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(m ?? {})) {
    const key = normalizeDayKey(k);
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) out[key] = v;
  }
  return out;
}

const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const round1 = (x: number | null) => x === null ? null : Math.round(x * 10) / 10;

// ── Tendances wellness (moyennes) ─────────────────────────────────────────────

type NumField = "score" | "fatigue" | "sommeil" | "stress" | "energie" | "sleepDur";

export function wellnessTrend(history: Record<string, WellnessData>, field: NumField, days: number, today = new Date()): Trend {
  const wh = normalize(history);
  const { cur, prev } = windows(days, today);
  const val = (iso: string) => { const v = wh[iso]?.[field]; return typeof v === "number" && !isNaN(v) ? v : null; };
  const series = eachDay(cur).map(date => ({ date, value: val(date) }));
  const value = avg(series.map(p => p.value).filter((v): v is number => v !== null));
  const prevVal = avg(eachDay(prev).map(val).filter((v): v is number => v !== null));
  return {
    value: round1(value), prev: round1(prevVal),
    delta: value !== null && prevVal !== null ? round1(value - prevVal) : null,
    series,
  };
}

// ── Poids : dernière mesure de la période vs dernière mesure de la période précédente ──

export function weightTrend(weightLog: Record<string, number>, days: number, today = new Date()): Trend {
  const wl = normalize(weightLog);
  const { cur, prev } = windows(days, today);
  const lastIn = (w: Window) => {
    const keys = Object.keys(wl).filter(k => inWin(k, w) && wl[k] > 0).sort();
    return keys.length ? wl[keys[keys.length - 1]] : null;
  };
  const series = eachDay(cur).map(date => ({ date, value: wl[date] > 0 ? wl[date] : null }));
  const value = lastIn(cur);
  const prevVal = lastIn(prev);
  return {
    value: round1(value), prev: round1(prevVal),
    delta: value !== null && prevVal !== null ? round1(value - prevVal) : null,
    series,
  };
}

// ── Score de sommeil : régularité du coucher (/50) + quantité vs objectif (/50) ──

/** Minutes depuis 18h (23h → 300, 1h → 420) pour moyenner des heures autour de minuit. */
const bedMinutes = (t: { h: number; m: number }) => ((t.h * 60 + t.m - 18 * 60) + 1440) % 1440;

export function sleepScore(history: Record<string, WellnessData>, goals: SleepGoals, w: Window): SleepScore | null {
  const entries = Object.entries(normalize(history)).filter(([k]) => inWin(k, w)).map(([, v]) => v);
  const durs = entries.map(e => e.sleepDur).filter((v): v is number => typeof v === "number" && v > 0);
  const beds = entries.map(e => e.coucher).filter((v): v is { h: number; m: number } => !!v && typeof v.h === "number").map(bedMinutes);
  if (!durs.length && !beds.length) return null;

  const targetHours = goals.sleepTarget && goals.sleepTarget > 0 ? goals.sleepTarget : 8;
  const avgHours = avg(durs) ?? 0;
  // Quantité : pleine note si objectif atteint, 0 à 2h de déficit
  const quantity = durs.length ? Math.round(50 * Math.min(1, Math.max(0, 1 - Math.max(0, targetHours - avgHours) / 2))) : 0;

  // Régularité : écart moyen à l'heure cible (ou à la moyenne si pas d'objectif). ≤15 min = 50, ≥60 min = 0
  let deviation = 0;
  let regularity = 0;
  if (beds.length) {
    const ref = goals.sleepBedtime ? bedMinutes(goals.sleepBedtime) : (avg(beds) ?? 0);
    deviation = Math.round(avg(beds.map(b => Math.abs(b - ref))) ?? 0);
    regularity = Math.round(50 * Math.min(1, Math.max(0, 1 - (deviation - 15) / 45)));
  }
  // Une seule composante renseignée → on la ramène sur 100
  const score = durs.length && beds.length ? quantity + regularity : (durs.length ? quantity : regularity) * 2;
  return { score, regularity, quantity, avgHours: Math.round(avgHours * 10) / 10, targetHours, bedtimeDeviationMin: deviation };
}

// ── Progrès : records (exercise_pr_logs) battus dans la période ───────────────

export interface PRRow { exercise_ref: string; kg: number; date: string }
export interface Progress { exercise: string; kg: number; prevKg: number | null; gain: number | null; date: string }

export function recentProgress(prs: PRRow[], days: number, today = new Date()): Progress[] {
  const { cur } = windows(days, today);
  const byEx = new Map<string, PRRow[]>();
  for (const p of prs) {
    if (!p.exercise_ref || !(p.kg > 0)) continue;
    const arr = byEx.get(p.exercise_ref) ?? [];
    arr.push(p);
    byEx.set(p.exercise_ref, arr);
  }
  const out: Progress[] = [];
  for (const [exercise, rows] of byEx) {
    const inPeriod = rows.filter(r => inWin(r.date.slice(0, 10), cur));
    if (!inPeriod.length) continue;
    const best = inPeriod.reduce((m, r) => r.kg > m.kg ? r : m);
    const before = rows.filter(r => r.date.slice(0, 10) < cur.start);
    const prevKg = before.length ? Math.max(...before.map(r => r.kg)) : null;
    if (prevKg !== null && best.kg <= prevKg) continue; // pas de nouveau record
    out.push({ exercise, kg: best.kg, prevKg, gain: prevKg !== null ? round1(best.kg - prevKg) : null, date: best.date.slice(0, 10) });
  }
  // Plus gros gain relatif d'abord, puis les plus récents
  return out.sort((a, b) => ((b.gain ?? 0) / (b.prevKg || 1)) - ((a.gain ?? 0) / (a.prevKg || 1)) || (a.date < b.date ? 1 : -1));
}

// ── Assiduité : séances réalisées / séances prescrites ───────────────────────
// Séances prescrites = muscu (workout_logs) + énergie / spécifique
// (energy_session_assignments) de la période, hors « skipped » (séance retirée
// ou déplacée par le coach / l'athlète : plus prescrite à cette date).
// Une séance du jour pas encore faite n'est pas encore due : comptée seulement
// une fois réalisée.

export interface WorkoutRow { scheduled_date: string; status: string }
export interface Attendance { done: number; planned: number; pct: number | null }

export function attendance(logs: WorkoutRow[], w: Window, today = localISO(new Date())): Attendance {
  const inP = logs.filter(l =>
    l.scheduled_date && inWin(l.scheduled_date, w)
    && l.status !== "skipped"
    && (l.scheduled_date < today || l.status === "completed"),
  );
  const done = inP.filter(l => l.status === "completed").length;
  const planned = inP.length;
  return { done, planned, pct: planned ? Math.round((done / planned) * 100) : null };
}

// ── Phrases automatiques (règles) ─────────────────────────────────────────────

export interface TrendSummary {
  days: number;
  health: Trend;
  weight: Trend;
  weightTarget: number | null;
  sleep: SleepScore | null;
  prevSleep: SleepScore | null;
  fatigue: Trend;
  stress: Trend;
  attendance: Attendance;
  prevAttendance: Attendance;
  progress: Progress[];
}

export function ruleInsights(s: TrendSummary): string[] {
  const out: { prio: number; text: string }[] = [];
  const per = s.days === 7 ? "cette semaine" : `sur ${s.days} jours`;

  if (s.health.delta !== null && Math.abs(s.health.delta) >= 4) {
    out.push({ prio: Math.abs(s.health.delta), text: s.health.delta > 0
      ? `Ton score de santé progresse de ${s.health.delta} points ${per} : continue comme ça.`
      : `Ton score de santé baisse de ${Math.abs(s.health.delta)} points ${per}, pense à bien récupérer.` });
  }
  if (s.sleep) {
    const deficit = Math.round((s.sleep.targetHours - s.sleep.avgHours) * 10) / 10;
    if (deficit >= 0.5) out.push({ prio: 8 + deficit * 4, text: `Tu dors en moyenne ${s.sleep.avgHours} h, soit ${deficit} h de moins que ton objectif de ${s.sleep.targetHours} h.` });
    else if (s.sleep.avgHours > 0) out.push({ prio: 3, text: `Objectif sommeil tenu : ${s.sleep.avgHours} h en moyenne ${per}.` });
    if (s.sleep.bedtimeDeviationMin >= 40) out.push({ prio: 7, text: `Tes heures de coucher varient d'environ ${s.sleep.bedtimeDeviationMin} min : un coucher plus régulier améliorera ta récupération.` });
    if (s.prevSleep && s.sleep.score - s.prevSleep.score >= 8) out.push({ prio: 6, text: `Ton score de sommeil passe de ${s.prevSleep.score} à ${s.sleep.score}.` });
  }
  if (s.progress.length) {
    const p = s.progress[0];
    out.push({ prio: 9, text: p.gain !== null
      ? `Nouveau record sur ${p.exercise} : ${p.kg} kg (+${p.gain} kg).`
      : `Premier record enregistré sur ${p.exercise} : ${p.kg} kg.` });
    if (s.progress.length > 2) out.push({ prio: 5, text: `${s.progress.length} records battus ${per}.` });
  }
  if (s.attendance.pct !== null && s.attendance.planned >= 2) {
    out.push({ prio: s.attendance.pct < 70 ? 8 : 4, text: s.attendance.pct >= 90
      ? `Assiduité excellente : ${s.attendance.done}/${s.attendance.planned} séances réalisées.`
      : `${s.attendance.done}/${s.attendance.planned} séances réalisées (${s.attendance.pct} %).` });
  }
  if (s.weight.delta !== null && Math.abs(s.weight.delta) >= 0.5) {
    const towards = s.weightTarget !== null && s.weight.prev !== null
      ? Math.abs(s.weightTarget - (s.weight.value ?? 0)) < Math.abs(s.weightTarget - s.weight.prev) : null;
    out.push({ prio: 5, text: `Poids ${s.weight.delta > 0 ? "+" : ""}${s.weight.delta} kg ${per}${towards === true ? ", dans le sens de ton objectif" : towards === false ? ", à l'opposé de ton objectif" : ""}.` });
  }
  if (s.fatigue.value !== null && s.fatigue.value <= 2.5) out.push({ prio: 7, text: "Ta fatigue ressentie est élevée en ce moment, parles-en à ton coach si ça dure." });
  if (s.stress.value !== null && s.stress.value <= 2.5) out.push({ prio: 6, text: "Ton niveau de stress est élevé en ce moment." });

  return out.sort((a, b) => b.prio - a.prio).slice(0, 4).map(o => o.text);
}
