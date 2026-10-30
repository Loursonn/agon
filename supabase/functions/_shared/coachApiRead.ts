/**
 * Ce que l'API coach laisse lire à l'assistant IA d'un coach.
 *
 * Même principe que `aiGuard.ts` : on expose des champs nommés, retypés et
 * bornés, jamais le JSON brut d'`app_data`. Un champ ajouté demain dans l'app
 * ne part pas chez un tiers sans que quelqu'un l'ait ajouté ici exprès.
 *
 * Exclu volontairement : tout texte libre écrit par l'athlète (ressenti,
 * commentaires de séance, note d'interruption de sommeil, commentaire de
 * blessure). Ce sont les champs où une donnée de santé non prévue peut se
 * glisser — un diagnostic, un traitement, un cycle — et l'athlète a consenti
 * à l'analyse de ses données d'entraînement, pas de ses confidences.
 *
 * Module pur, testé par vitest.
 */
import { cleanText, type ExerciceParamsShape, isWeekRecord, type ProgSessionShape } from "./coachApiOps.ts";

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
}

/** Nombre dans une plage, sinon null — jamais un zéro inventé. */
function num(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 100) / 100;
}

/** Libellé court issu d'une liste (zone, type, sport) : borné, sans saut de ligne. */
function label(v: unknown, max = 40): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\r\n`$]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && DATE.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
}

function inRange(d: unknown, from: string, to: string): d is string {
  return isIsoDate(d) && d >= from && d <= to;
}

function hm(v: unknown): string | null {
  const o = obj(v);
  const h = num(o.h, 0, 23);
  const m = num(o.m, 0, 59);
  return h === null || m === null ? null : `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ─────────────────────────────── Période ────────────────────────────────────

export const MAX_DAYS = 90;
export const DEFAULT_DAYS = 28;

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Période demandée, bornée à 90 jours. `today` au format AAAA-MM-JJ. */
export function parsePeriod(
  fromRaw: string | null,
  toRaw: string | null,
  today: string,
): { ok: true; from: string; to: string } | { ok: false; error: string } {
  const to = toRaw ?? today;
  if (!isIsoDate(to)) return { ok: false, error: "to : date AAAA-MM-JJ attendue" };
  const from = fromRaw ?? addDays(to, -(DEFAULT_DAYS - 1));
  if (!isIsoDate(from)) return { ok: false, error: "from : date AAAA-MM-JJ attendue" };
  if (from > to) return { ok: false, error: "from doit précéder to" };
  if (addDays(from, MAX_DAYS - 1) < to) return { ok: false, error: `${MAX_DAYS} jours maximum par requête` };
  return { ok: true, from, to };
}

// ─────────────────────────────── Programme ──────────────────────────────────

const PARAM_KEYS = [
  "nb_series", "cluster", "reps", "reps_max", "reps_mode", "charge_unit", "charge", "rir", "tempo", "manual_rm",
] as const;

function pickParams(p: unknown): Obj {
  const o = obj(p);
  const out: Obj = {};
  for (const k of PARAM_KEYS) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

function readParams(p: unknown): Obj | Record<string, Obj> {
  if (!isWeekRecord(p)) return pickParams(p);
  const out: Record<string, Obj> = {};
  for (const [k, v] of Object.entries(p as Record<string, ExerciceParamsShape>)) {
    if (/^\d+$/.test(k) && v) out[k] = pickParams(v);
  }
  return out;
}

/**
 * Programme `asp:prog` sous la forme que les propositions réutilisent : mêmes
 * ids, mêmes noms de champs, mêmes paramètres. L'assistant lit ici ce qu'il
 * citera dans ses opérations.
 *
 * `prochaine_occurrence` : numéro de la prochaine fois que la séance aura lieu
 * — c'est la valeur à passer dans `a_partir_de` pour qu'une modification
 * vaille à partir de maintenant.
 */
export function readProgram(prog: unknown, nextOccurrence: Map<string, number>) {
  const sessions = Array.isArray(prog) ? (prog as ProgSessionShape[]) : [];
  return sessions.map((s) => ({
    id: s.id,
    name: label(s.name, 80),
    short: label(s.short, 8),
    day_of_week: typeof s.day_of_week === "number" ? s.day_of_week : null,
    recurrence: s.recurrence === "once" ? "once" : "weekly",
    prochaine_occurrence: nextOccurrence.get(s.id) ?? 1,
    blocs: (s.blocs ?? []).map((b) => ({
      id: b.id,
      name: label(b.name, 80),
      category: label(b.category),
      instructions: typeof b.instructions === "string" ? cleanText(b.instructions.slice(0, 1000), 1000, "instructions") : null,
      exercices: (b.exercices ?? []).map((e) => ({
        id: e.id,
        exercise_name: label(e.exercise_name, 80),
        dans_bibliotheque: !!e.exercise_id,
        mode: e.mode,
        libre_text: typeof e.libre_text === "string" ? cleanText(e.libre_text.slice(0, 500), 500, "libre_text") : null,
        comment: typeof e.comment === "string" ? cleanText(e.comment.slice(0, 500), 500, "comment") : null,
        params: e.mode === "methode" ? null : readParams(e.params),
      })),
    })),
  }));
}

// ─────────────────────────────── Synthèse ───────────────────────────────────

export interface SummaryInput {
  athlete: { id: string; first_name: string | null; full_name: string | null };
  from: string;
  to: string;
  /** Valeurs `app_data` par clé : asp:goals, asp:bw, asp:wh, asp:wlog, asp:injuries. */
  appData: Record<string, unknown>;
  prog: unknown;
  workoutLogs: Array<{
    scheduled_date: string;
    session_id: string | null;
    session_name: string | null;
    status: string;
    rpe_score: number | null;
    duration_s: number | null;
    athlete_modifications: unknown;
  }>;
  prs: Array<{ date: string; exercise_ref: string; kg: number }>;
  activities: Array<Record<string, unknown>>;
  dailies: Array<Record<string, unknown>>;
}

/** Prénom seul : l'assistant n'a pas besoin du nom de famille pour analyser. */
export function firstName(a: { first_name: string | null; full_name: string | null }): string {
  return label(a.first_name, 40) ?? label((a.full_name ?? "").split(" ")[0], 40) ?? "Athlète";
}

function exerciseNames(prog: unknown): Map<string, string> {
  const names = new Map<string, string>();
  for (const s of Array.isArray(prog) ? (prog as ProgSessionShape[]) : []) {
    for (const b of s.blocs ?? []) for (const e of b.exercices ?? []) {
      const n = label(e.exercise_name, 80);
      if (n) names.set(e.id, n);
    }
  }
  return names;
}

function performedSets(mods: unknown, names: Map<string, string>) {
  const sets = obj(obj(mods).sessionSets);
  const out: Array<{ exercice: string; series: Array<{ kg: number | null; reps: number | null; rir: number | null; faite: boolean }> }> = [];
  for (const [exId, rows] of Object.entries(sets)) {
    const name = names.get(exId);
    // Exercice retiré du programme depuis : on ne sait plus ce que c'était,
    // et un nom deviné serait une donnée fausse.
    if (!name || !Array.isArray(rows)) continue;
    out.push({
      exercice: name,
      series: rows.slice(0, 30).map((r) => {
        const o = obj(r);
        return {
          kg: num(o.kg, 0, 1000),
          reps: num(o.reps, 0, 200),
          rir: num(o.rir, 0, 10),
          faite: o.done === true && o.skipped !== true,
        };
      }),
    });
  }
  return out;
}

export function buildSummary(input: SummaryInput) {
  const { from, to, appData } = input;
  const goals = obj(appData["asp:goals"]);
  const bw = obj(appData["asp:bw"]);
  const wh = obj(appData["asp:wh"]);
  const wlog = obj(appData["asp:wlog"]);
  const injuries = Array.isArray(appData["asp:injuries"]) ? (appData["asp:injuries"] as unknown[]) : [];
  const names = exerciseNames(input.prog);

  return {
    athlete: { id: input.athlete.id, prenom: firstName(input.athlete) },
    periode: { du: from, au: to },
    echelles: {
      fatigue_sommeil_stress_energie_courbatures: "1 à 5",
      score_bien_etre: "0 à 100",
      rpe: "1 à 10",
      rir: "répétitions en réserve",
    },
    objectifs: {
      seances_par_semaine: num(goals.sessionsPerWeek, 1, 14),
      sommeil_cible_h: num(goals.sleepTarget, 0, 24),
      coucher: hm(goals.sleepBedtime),
      lever: hm(goals.sleepWakeup),
      poids_cible_kg: num(bw.target, 20, 400),
    },
    bien_etre: Object.entries(wh)
      .filter(([d]) => inRange(d, from, to))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => {
        const w = obj(v);
        return {
          date,
          score: num(w.score, 0, 100),
          fatigue: num(w.fatigue, 1, 5),
          sommeil: num(w.sommeil, 1, 5),
          stress: num(w.stress, 1, 5),
          energie: num(w.energie, 1, 5),
          courbatures: num(w.doms, 1, 5),
          sommeil_h: num(w.sleepDur, 0, 24),
        };
      }),
    poids: Object.entries(wlog)
      .filter(([d]) => inRange(d, from, to))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, kg]) => ({ date, kg: num(kg, 20, 400) }))
      .filter((p) => p.kg !== null),
    blessures: injuries
      .map((raw) => {
        const i = obj(raw);
        return {
          zones: (Array.isArray(i.zones) ? i.zones : []).map((z) => label(z)).filter(Boolean).slice(0, 10),
          type: label(i.type),
          intensite: num(i.intensity, 0, 10),
          statut: label(i.status, 20),
          debut: isIsoDate(i.date_start) ? i.date_start : null,
          fin: isIsoDate(i.date_end) ? i.date_end : null,
        };
      })
      // Blessures qui recouvrent la période, ou encore ouvertes.
      .filter((i) => (!i.debut || i.debut <= to) && (!i.fin || i.fin >= from)),
    seances: input.workoutLogs
      .filter((l) => inRange(l.scheduled_date, from, to))
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
      .map((l) => ({
        date: l.scheduled_date,
        nom: label(l.session_name, 80),
        statut: label(l.status, 20),
        rpe: num(l.rpe_score, 1, 10),
        duree_min: l.duration_s === null ? null : num(Math.round(l.duration_s / 60), 0, 600),
        forme: num(obj(l.athlete_modifications).sessionForme, 1, 5),
        exercices: performedSets(l.athlete_modifications, names),
      })),
    records: input.prs
      .filter((p) => inRange(p.date, from, to))
      .map((p) => ({ date: p.date, exercice: label(p.exercise_ref, 80), kg: num(p.kg, 0, 1000) })),
    montre: {
      activites: input.activities
        .filter((a) => inRange(a.local_date, from, to))
        .map((a) => ({
          date: a.local_date as string,
          sport: label(a.sport),
          duree_min: a.duration_s == null ? null : num(Math.round(Number(a.duration_s) / 60), 0, 2000),
          distance_km: a.distance_m == null ? null : num(Number(a.distance_m) / 1000, 0, 1000),
          fc_moy: num(a.avg_hr, 20, 250),
          fc_max: num(a.max_hr, 20, 250),
          denivele_m: num(a.elevation_gain_m, 0, 20000),
          source: label(a.source, 20),
        })),
      journees: input.dailies
        .filter((d) => inRange(d.day, from, to))
        .map((d) => ({
          date: d.day as string,
          sommeil_min: num(d.sleep_total_min, 0, 1440),
          sommeil_score: num(d.sleep_score, 0, 100),
          fc_repos: num(d.resting_hr, 20, 200),
          vfc_ms: num(d.hrv_ms, 0, 500),
          stress: num(d.stress_avg, 0, 100),
          pas: num(d.steps, 0, 200000),
          charge: num(d.training_load, 0, 10000),
          source: label(d.source, 20),
        })),
    },
  };
}
