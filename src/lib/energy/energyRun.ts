/**
 * Séance d'énergie côté athlète téléphone (canvas « Agon · maquettes app »,
 * planche EnergieTel, variante A retenue par Hugo le 14/11/2026).
 *
 * Deux usages, tout en fonctions pures :
 *  - lecture avant la séance : blocs lus comme des phrases, UNE cible principale
 *    par bloc, profil en barres (hauteur = intensité, couleur = zone) ;
 *  - minuteur plein écran : liste à plat des pas, état du chrono (pause, départ
 *    fixe, blocs finis au bouton), « n / N », « Ensuite ».
 *
 * Les couleurs ne sont pas choisies ici : on renvoie une « teinte » (zone 1..5,
 * récup ou libre) que l'écran traduit avec `zoneColor` (src/lib/seance.ts).
 */
import type { EnergyGroup, EnergyInterval, EnergyStep, EnergyTarget, ExerciseInterval } from "@/types/energy";
import { estimateIntervalDuration, targetToIntensityPct } from "@/lib/energy";
import { paceBounds } from "./paceCompat";

export const DASH = "—";

export type Refs = Record<string, number> | null | undefined;
type Leaf = EnergyInterval | ExerciseInterval;

const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nf = (v: number, digits = 1) => v.toLocaleString("fr-FR", { maximumFractionDigits: digits });

// ── Formats ────────────────────────────────────────────────────────────────

/** 696 → « 11 min 36 s » ; 45 → « 45 s » ; 900 → « 15 min » ; 3900 → « 1 h 05 min ». */
export function fmtDur(s: number | null | undefined): string {
  if (!ok(s) || s < 0) return DASH;
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  if (h) return m ? `${h} h ${String(m).padStart(2, "0")} min` : `${h} h`;
  if (!m) return `${sec} s`;
  return sec ? `${m} min ${sec} s` : `${m} min`;
}

/** Chrono : 52 → « 0:52 » ; 3725 → « 1:02:05 ». */
export function fmtChrono(s: number | null | undefined): string {
  if (!ok(s)) return DASH;
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** 222 s/km → « 3:42 ». */
export function fmtPace(sPerKm: number | null | undefined): string {
  if (!ok(sPerKm) || sPerKm <= 0) return DASH;
  const t = Math.round(sPerKm);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** 400 → « 400 m » ; 1500 → « 1,5 km ». */
export function fmtDist(m: number | null | undefined): string {
  if (!ok(m) || m <= 0) return DASH;
  return m >= 1000 ? `${nf(m / 1000, 2)} km` : `${Math.round(m)} m`;
}

function range(min: number, max: number, f: (v: number) => string): string {
  if (!ok(min) && !ok(max)) return "";
  if (!ok(min) || !ok(max) || Math.abs(min - max) < 1e-9) return f(ok(min) ? min : max);
  return `${f(Math.min(min, max))}–${f(Math.max(min, max))}`;
}

const mid = (a: number, b: number) => (ok(a) && ok(b) ? (a + b) / 2 : ok(a) ? a : b);

/** Durée d'un pas lue dans une phrase : « 15 min », « 400 m », « 20 kcal », « au bouton ». */
export function durPhrase(step: Leaf): string {
  const d = step.duration;
  if (!d) return step.type === "exercise" ? step.exercise_name : DASH;
  switch (d.kind) {
    case "time": return fmtDur(d.value ?? 0);
    case "distance": return fmtDist(d.value ?? 0);
    case "calories": return `${d.value ?? 0} kcal`;
    case "lap_button": return "jusqu'au bouton";
  }
}

// ── Cible principale ──────────────────────────────────────────────────────

export interface MainTarget {
  /** En grand : « 3:42 », « 230 », « Z3 », « 1:45 ». */
  value: string;
  /** Unité collée en petit : « /km », « W », « /500 m ». */
  unit: string;
  /** Ligne secondaire en petit : « 95 % VMA », « 88 % PMA », « 150–160 bpm ». */
  secondary: string | null;
}

function refOf(refs: Refs, metric: string | undefined): number | null {
  if (!refs || !metric) return null;
  const v = refs[metric];
  return ok(v) && v > 0 ? v : null;
}

/** UNE cible principale pour un pas, ou null s'il n'y a pas de cible. */
export function mainTarget(step: Leaf, refs?: Refs): MainTarget | null {
  const t = step.target as EnergyTarget | undefined;
  if (!t) return null;
  switch (t.kind) {
    case "none": return null;
    case "hr_zone": return ok(t.zone) ? { value: `Z${t.zone}`, unit: "", secondary: null } : null;
    case "hr_pct": {
      const v = range(t.min, t.max, (x) => nf(x, 0));
      return v ? { value: v, unit: " % FCmax", secondary: null } : null;
    }
    case "hr_bpm": {
      const v = range(t.min, t.max, (x) => nf(x, 0));
      return v ? { value: v, unit: " bpm", secondary: null } : null;
    }
    case "pace": {
      const { min, max } = paceBounds(t);
      if (!(min > 0) && !(max > 0)) return null;
      const vma = refOf(refs, "VMA");
      const avg = mid(min, max);
      const secondary = vma && avg > 0 ? `${nf((3600 / avg / vma) * 100, 0)} % VMA` : null;
      if (t.unit === "kmh") return { value: range(3600 / max, 3600 / min, (x) => nf(x, 1)), unit: " km/h", secondary };
      return { value: range(min, max, fmtPace), unit: "/km", secondary };
    }
    case "pace_test_pct": {
      const pct = range(t.min, t.max, (x) => nf(x, 0));
      if (!pct) return null;
      const label = `${pct} % ${t.test_metric ?? ""}`.trim();
      const ref = refOf(refs, t.test_metric);
      if (!ref) return { value: pct, unit: ` % ${t.test_metric ?? ""}`.trimEnd(), secondary: null };
      // allure (s/km) = 3600 / (vitesse de référence × %)
      const pace = (p: number) => 3600 / ((ref * p) / 100);
      return { value: range(pace(t.max), pace(t.min), fmtPace), unit: "/km", secondary: label };
    }
    case "power": {
      const v = range(t.min, t.max, (x) => nf(x, 0));
      if (!v) return null;
      const ftp = refOf(refs, "FTP") ?? refOf(refs, "PMA");
      const avg = mid(t.min, t.max);
      const which = refOf(refs, "FTP") ? "FTP" : "PMA";
      return { value: v, unit: " W", secondary: ftp ? `${nf((avg / ftp) * 100, 0)} % ${which}` : null };
    }
    case "power_test_pct": {
      const pct = range(t.min, t.max, (x) => nf(x, 0));
      if (!pct) return null;
      const label = `${pct} % ${t.test_metric ?? ""}`.trim();
      const ref = refOf(refs, t.test_metric);
      if (!ref) return { value: pct, unit: ` % ${t.test_metric ?? ""}`.trimEnd(), secondary: null };
      return { value: range(t.min, t.max, (p) => nf((ref * p) / 100, 0)), unit: " W", secondary: label };
    }
    case "cadence": {
      const v = range(t.min, t.max, (x) => nf(x, 0));
      return v ? { value: v, unit: t.unit === "rpm" ? " tr/min" : " pas/min", secondary: null } : null;
    }
    case "x_per_y": {
      if (!ok(t.x_value) || !ok(t.y_value)) return null;
      const per = t.y_kind === "distance" ? `/${fmtDist(t.y_value)}` : `/${fmtDur(t.y_value)}`;
      if (t.x_kind === "time") return { value: fmtChrono(t.x_value), unit: per, secondary: null };
      if (t.x_kind === "cal") return { value: nf(t.x_value, 0), unit: ` kcal${per}`, secondary: null };
      return { value: nf(t.x_value, 0), unit: ` W${per}`, secondary: null };
    }
    case "text": return t.value?.trim() ? { value: t.value.trim(), unit: "", secondary: null } : null;
    default: return null;
  }
}

// ── Teinte (zone) ──────────────────────────────────────────────────────────

/** Zone 1..5 (modèle à 5 zones), « recup » (bleu) ou « libre » (pas de cible chiffrable). */
export type Tint = { kind: "zone"; zone: 1 | 2 | 3 | 4 | 5 } | { kind: "recup" } | { kind: "libre" };

const zoneFrom = (v: number, bounds: readonly [number, number, number, number]): 1 | 2 | 3 | 4 | 5 =>
  (v < bounds[0] ? 1 : v < bounds[1] ? 2 : v < bounds[2] ? 3 : v < bounds[3] ? 4 : 5);

// Seuils usuels du modèle à 5 zones selon la référence.
const VMA_BOUNDS = [70, 80, 88, 95] as const;   // % VMA
const FCMAX_BOUNDS = [60, 70, 80, 90] as const; // % FCmax
const FTP_BOUNDS = [56, 76, 91, 106] as const;  // % FTP / PMA
const GENERIC_BOUNDS = [30, 50, 70, 85] as const; // intensité estimée (src/lib/energy)

export function isRecovery(step: Leaf): boolean {
  return step.role === "recovery" || step.role === "rest";
}

/** Zone d'un pas (5 zones). Récup / repos → « recup », quelle que soit la cible. */
export function stepTint(step: Leaf, refs?: Refs): Tint {
  if (isRecovery(step)) return { kind: "recup" };
  const t = step.target as EnergyTarget | undefined;
  if (!t) return { kind: "libre" };
  const z = (v: number | null, b: readonly [number, number, number, number]): Tint =>
    (v == null || !ok(v) ? { kind: "libre" } : { kind: "zone", zone: zoneFrom(v, b) });
  switch (t.kind) {
    case "hr_zone": return ok(t.zone) ? { kind: "zone", zone: Math.max(1, Math.min(5, t.zone)) as 1 | 2 | 3 | 4 | 5 } : { kind: "libre" };
    case "hr_pct": return z(mid(t.min, t.max), FCMAX_BOUNDS);
    case "pace_test_pct": return z(mid(t.min, t.max), VMA_BOUNDS);
    case "power_test_pct": return z(mid(t.min, t.max), FTP_BOUNDS);
    case "pace": {
      const vma = refOf(refs, "VMA");
      const { min, max } = paceBounds(t);
      const avg = mid(min, max);
      if (vma && avg > 0) return z((3600 / avg / vma) * 100, VMA_BOUNDS);
      return z(targetToIntensityPct(t, refs ?? undefined), GENERIC_BOUNDS);
    }
    case "power": {
      const ref = refOf(refs, "FTP") ?? refOf(refs, "PMA");
      return ref ? z((mid(t.min, t.max) / ref) * 100, FTP_BOUNDS) : { kind: "libre" };
    }
    case "hr_bpm": return z(targetToIntensityPct(t, refs ?? undefined), GENERIC_BOUNDS);
    default: return { kind: "libre" };
  }
}

/** Hauteur d'une barre du profil, entre 0,2 (récup) et 1 (zone 5). */
export function tintHeight(t: Tint): number {
  if (t.kind === "recup") return 0.2;
  if (t.kind === "libre") return 0.35;
  return 0.2 + t.zone * 0.16;
}

// ── Liste à plat (minuteur) ────────────────────────────────────────────────

export interface RunStep {
  step: Leaf;
  /** Répétitions en cours, du groupe extérieur au groupe intérieur. */
  reps: { n: number; of: number }[];
  /** Départ fixe : chaque répétition dure `every` s ; `gap` = repos jusqu'au départ suivant. */
  emom?: { every: number; round: number; rounds: number; gap?: true };
  /** Index du bloc de premier niveau (lecture). */
  block: number;
}

export function flattenRun(steps: readonly EnergyStep[]): RunStep[] {
  const out: RunStep[] = [];
  const walk = (s: EnergyStep, reps: RunStep["reps"], block: number, emom?: RunStep["emom"]) => {
    if (s.type !== "group") {
      out.push({ step: s, reps, block, ...(emom ? { emom } : {}) });
      return;
    }
    const g = s as EnergyGroup;
    const every = g.departure_every_s && g.departure_every_s > 0 ? g.departure_every_s : 0;
    const n = Math.max(1, Math.round(g.repeat || 1));
    for (let rep = 1; rep <= n; rep++) {
      const r = n > 1 ? [...reps, { n: rep, of: n }] : reps;
      const em = every ? { every, round: rep, rounds: n } : emom;
      for (const c of g.children) walk(c, r, block, em);
      if (every) {
        out.push({
          step: {
            type: "interval", id: `${g.id}-depart-${rep}`, role: "rest",
            duration: { kind: "time", value: every }, target: { kind: "none" },
            notes: rep < n ? "jusqu'au départ suivant" : "fin du dernier départ",
          },
          reps: r, block, emom: { every, round: rep, rounds: n, gap: true },
        });
      } else if (g.rest_between && rep < n) {
        out.push({ step: g.rest_between, reps: r, block, ...(emom ? { emom } : {}) });
      }
    }
  };
  steps.forEach((s, i) => walk(s, [], i));
  return out;
}

/** Le pas se termine-t-il au bouton (distance, calories, bouton tour, exercice sans durée) ? */
export function endsByButton(step: Leaf): boolean {
  const k = step.duration?.kind;
  return !k || k === "distance" || k === "calories" || k === "lap_button";
}

/** Durée prévue (s) d'un pas chronométré, 0 s'il se termine au bouton. */
export function timedSeconds(step: Leaf): number {
  if (endsByButton(step)) return 0;
  return Math.max(0, step.duration?.value ?? 0);
}

/** Durée estimée (s), y compris pour un pas au bouton (allure de la cible, VMA…). */
export function estimatedSeconds(step: Leaf, refs?: Refs): number {
  if (step.duration?.kind === "lap_button") return 0;
  if (step.type === "exercise" && !step.duration) return 0;
  return estimateIntervalDuration(step, { athleteReferences: refs ?? undefined });
}

/** Temps visé pour un pas en distance si la cible donne une allure : 400 m à 3:42/km → 89 s. */
export function aimedSeconds(step: Leaf, refs?: Refs): number | null {
  if (step.duration?.kind !== "distance") return null;
  const t = step.target;
  if (t.kind === "pace" || (t.kind === "pace_test_pct" && refOf(refs, t.test_metric))) {
    const s = estimatedSeconds(step, refs);
    return s > 0 ? s : null;
  }
  return null;
}

/** « 3 / 5 » ou « Série 1 · 3 / 5 » (groupe dans un groupe). null hors répétition. */
export function repLabel(rs: RunStep | null | undefined): string | null {
  if (!rs || rs.reps.length === 0) return null;
  const inner = rs.reps[rs.reps.length - 1];
  const base = `${inner.n} / ${inner.of}`;
  if (rs.reps.length === 1) return base;
  return `Série ${rs.reps[rs.reps.length - 2].n} · ${base}`;
}

const ROLE_WORD: Record<string, string> = {
  warmup: "Échauffement", work: "Effort", recovery: "Récup", rest: "Repos", cooldown: "Retour au calme", open: "Libre",
};

export function roleWord(step: Leaf): string {
  if (step.type === "exercise") return step.exercise_name || "Exercice";
  return ROLE_WORD[step.role] ?? "Bloc";
}

/** Libellé court d'un pas : « récup 1 min 30 s trot », « 400 m à 3:42/km ». */
export function stepPhrase(step: Leaf, refs?: Refs): string {
  if (step.type === "exercise") return [step.exercise_name, durPhrase(step) !== step.exercise_name ? durPhrase(step) : ""].filter(Boolean).join(" · ");
  const dur = durPhrase(step);
  const notes = step.notes?.trim();
  if (isRecovery(step)) return [step.role === "rest" ? "repos" : "récup", dur, notes].filter(Boolean).join(" ");
  const tg = mainTarget(step, refs);
  const head = step.role === "work" ? dur : `${roleWord(step).toLowerCase()} ${dur}`;
  return [head, tg ? `à ${tg.value}${tg.unit}` : "", notes].filter(Boolean).join(" ");
}

/** Libellé du bouton qui termine un pas au bouton : « 400 m fait », « Tour fait ». */
export function doneLabel(step: Leaf): string {
  const d = step.duration;
  if (d?.kind === "distance") return `${fmtDist(d.value ?? 0)} fait`;
  if (d?.kind === "calories") return `${d.value ?? 0} kcal fait`;
  if (d?.kind === "lap_button") return "Tour fait";
  return "Fait";
}

// ── État du minuteur ───────────────────────────────────────────────────────

export interface RunState {
  index: number;
  /** Début du pas en cours (ms). */
  stepStartMs: number;
  /** Début de la séance (ms), décalé des pauses. */
  sessionStartMs: number;
  /** Départ fixe : début de la répétition en cours (ms). */
  roundStartMs: number | null;
  /** En pause depuis (ms), null sinon. */
  pausedAtMs: number | null;
  finished: boolean;
}

const isRoundStart = (flat: readonly RunStep[], i: number) => {
  const cur = flat[i]?.emom;
  if (!cur || cur.gap) return false;
  const prev = flat[i - 1]?.emom;
  return !prev || prev.gap === true || prev.round !== cur.round || prev.every !== cur.every;
};

export function runStart(flat: readonly RunStep[], now: number): RunState {
  return {
    index: 0, stepStartMs: now, sessionStartMs: now,
    roundStartMs: isRoundStart(flat, 0) ? now : null,
    pausedAtMs: null, finished: flat.length === 0,
  };
}

const clock = (st: RunState, now: number) => st.pausedAtMs ?? now;

/** Secondes écoulées dans le pas en cours. */
export function stepElapsed(st: RunState, now: number): number {
  return Math.max(0, (clock(st, now) - st.stepStartMs) / 1000);
}

/** Secondes écoulées depuis le début de la séance (pauses exclues). */
export function sessionElapsed(st: RunState, now: number): number {
  return Math.max(0, (clock(st, now) - st.sessionStartMs) / 1000);
}

/** Secondes restantes du pas en cours, null s'il se termine au bouton. */
export function stepRemaining(flat: readonly RunStep[], st: RunState, now: number): number | null {
  const rs = flat[st.index];
  if (!rs || st.finished) return null;
  if (rs.emom?.gap && st.roundStartMs != null) {
    return Math.max(0, rs.emom.every - (clock(st, now) - st.roundStartMs) / 1000);
  }
  const dur = timedSeconds(rs.step);
  if (!dur) return null;
  return Math.max(0, dur - stepElapsed(st, now));
}

/** Départ fixe : secondes avant le départ suivant, null hors départ fixe. */
export function roundRemaining(flat: readonly RunStep[], st: RunState, now: number): number | null {
  const em = flat[st.index]?.emom;
  if (!em || st.roundStartMs == null || st.finished) return null;
  return Math.max(0, em.every - (clock(st, now) - st.roundStartMs) / 1000);
}

function goTo(flat: readonly RunStep[], st: RunState, index: number, at: number): RunState {
  if (index >= flat.length) return { ...st, index: flat.length, stepStartMs: at, finished: true, roundStartMs: null };
  const roundStartMs = isRoundStart(flat, index) ? at : flat[index].emom ? st.roundStartMs : null;
  return { ...st, index, stepStartMs: at, roundStartMs };
}

/** Pas suivant (« Passer », « 400 m fait »). */
export function runNext(flat: readonly RunStep[], st: RunState, now: number): RunState {
  if (st.finished) return st;
  return goTo(flat, st, st.index + 1, clock(st, now));
}

export function runPause(st: RunState, now: number): RunState {
  return st.pausedAtMs != null || st.finished ? st : { ...st, pausedAtMs: now };
}

/** Reprise : tous les repères sont décalés de la durée de la pause. */
export function runResume(st: RunState, now: number): RunState {
  if (st.pausedAtMs == null) return st;
  const d = now - st.pausedAtMs;
  return {
    ...st,
    pausedAtMs: null,
    stepStartMs: st.stepStartMs + d,
    sessionStartMs: st.sessionStartMs + d,
    roundStartMs: st.roundStartMs != null ? st.roundStartMs + d : null,
  };
}

/**
 * Avance tout seul quand le temps d'un pas chronométré est écoulé (plusieurs pas
 * si l'écran a dormi) ; en départ fixe, la répétition suivante part à l'heure
 * même si l'athlète n'a pas fini.
 */
export function runTick(flat: readonly RunStep[], st: RunState, now: number): RunState {
  let s = st;
  for (let guard = 0; guard <= flat.length && !s.finished && s.pausedAtMs == null; guard++) {
    const rs = flat[s.index];
    if (rs.emom && s.roundStartMs != null) {
      const roundEnd = s.roundStartMs + rs.emom.every * 1000;
      if (now >= roundEnd) {
        let k = s.index;
        while (k < flat.length && !(flat[k].emom?.gap && flat[k].emom?.round === rs.emom.round)) k++;
        s = goTo(flat, s, k + 1, roundEnd);
        continue;
      }
      if (rs.emom.gap) break;
    }
    const dur = timedSeconds(rs.step);
    if (!dur) break;
    const end = s.stepStartMs + dur * 1000;
    if (now < end) break;
    s = goTo(flat, s, s.index + 1, end);
  }
  return s;
}

/** Temps restant estimé de la séance (s) : reste du pas en cours + pas suivants. */
export function sessionRemaining(flat: readonly RunStep[], st: RunState, now: number, refs?: Refs): number {
  if (st.finished) return 0;
  const cur = flat[st.index];
  const curRem = stepRemaining(flat, st, now) ?? Math.max(0, estimatedSeconds(cur.step, refs) - stepElapsed(st, now));
  let rest = 0;
  for (let k = st.index + 1; k < flat.length; k++) rest += estimatedSeconds(flat[k].step, refs);
  return curRem + rest;
}

// ── Lecture avant la séance ────────────────────────────────────────────────

export interface ReadBlock {
  id: string;
  /** « 1 · Échauffement ». */
  title: string;
  /** « 2 × (5 × 400 m, récup 1 min 30 s trot), 3 min entre les séries ». */
  phrase: string;
  target: MainTarget | null;
  tint: Tint;
  /** Zones présentes dans le bloc, pour la petite barre de couleur. */
  tints: Tint[];
  /** Consignes du coach rattachées au bloc. */
  instructions: string[];
  durationS: number;
}

function firstWork(s: EnergyStep): Leaf | null {
  if (s.type !== "group") return s;
  let fallback: Leaf | null = null;
  const visit = (x: EnergyStep): Leaf | null => {
    if (x.type !== "group") {
      if (!isRecovery(x)) return x;
      fallback = fallback ?? x;
      return null;
    }
    for (const c of x.children) {
      const f = visit(c);
      if (f) return f;
    }
    return null;
  };
  return visit(s) ?? fallback;
}

function groupPhrase(g: EnergyGroup, refs: Refs, top: boolean): string {
  // Récup en dernier pas du groupe : lue comme « 4 × 6 min, récup 2 min ».
  const last = g.children[g.children.length - 1];
  const tailRest = g.children.length > 1 && last && last.type !== "group" && isRecovery(last) ? last : null;
  const kids = tailRest ? g.children.slice(0, -1) : g.children;
  const inner = kids.map((c) => (c.type === "group" ? groupPhrase(c, refs, false) : leafInGroup(c, refs))).join(" + ");
  const n = Math.max(1, Math.round(g.repeat || 1));
  const hasSub = g.children.some((c) => c.type === "group");
  const body = n > 1 ? (kids.length > 1 || hasSub ? `${n} × (${inner})` : `${n} × ${inner}`) : inner;
  const extras: string[] = [];
  if (tailRest) extras.push(stepPhrase(tailRest, refs));
  if (g.departure_every_s) extras.push(`départ toutes les ${fmtDur(g.departure_every_s)}`);
  else if (g.rest_between && n > 1) {
    const r = g.rest_between;
    const what = [durPhrase(r), r.notes?.trim()].filter(Boolean).join(" ");
    extras.push(hasSub ? `${what} entre les séries` : `récup ${what}`);
  }
  void top;
  return [body, ...extras].join(", ");
}

function leafInGroup(s: Leaf, refs: Refs): string {
  if (isRecovery(s)) return stepPhrase(s, refs);
  if (s.type === "exercise") return stepPhrase(s, refs);
  return [durPhrase(s), s.notes?.trim()].filter(Boolean).join(" ");
}

function collectInstructions(s: EnergyStep, out: string[]) {
  if (s.type === "group") {
    if (s.instructions?.trim()) out.push(s.instructions.trim());
    s.children.forEach((c) => collectInstructions(c, out));
  }
}

export function readBlocks(steps: readonly EnergyStep[], refs?: Refs): ReadBlock[] {
  const flat = flattenRun(steps);
  return steps.map((s, i) => {
    const main = firstWork(s);
    const mine = flat.filter((f) => f.block === i);
    const tints: Tint[] = [];
    for (const f of mine) {
      const t = stepTint(f.step, refs);
      if (!tints.some((x) => JSON.stringify(x) === JSON.stringify(t))) tints.push(t);
    }
    const role = s.type === "group" ? (s.role === "open" || !ROLE_WORD[s.role] ? "Effort" : ROLE_WORD[s.role]) : roleWord(s);
    const phrase = s.type === "group"
      ? groupPhrase(s, refs, true)
      : [durPhrase(s), s.type === "interval" ? s.notes?.trim() : ""].filter(Boolean).join(" ");
    const instructions: string[] = [];
    collectInstructions(s, instructions);
    return {
      id: s.id,
      title: `${i + 1} · ${role}`,
      phrase,
      target: main ? mainTarget(main, refs) : null,
      tint: main ? stepTint(main, refs) : { kind: "libre" },
      tints,
      instructions,
      durationS: mine.reduce((acc, f) => acc + estimatedSeconds(f.step, refs), 0),
    };
  });
}

export interface ProfileBar {
  /** Part de la largeur (somme = 1). */
  width: number;
  /** Hauteur relative (0..1). */
  height: number;
  tint: Tint;
}

/** Profil de la séance : une barre par pas, largeur = durée estimée. */
export function profileBars(steps: readonly EnergyStep[], refs?: Refs): ProfileBar[] {
  const flat = flattenRun(steps);
  const durs = flat.map((f) => estimatedSeconds(f.step, refs) || 60);
  const total = durs.reduce((a, b) => a + b, 0) || 1;
  return flat.map((f, i) => {
    const tint = stepTint(f.step, refs);
    return { width: durs[i] / total, height: tintHeight(tint), tint };
  });
}

/** « 52 min · 10,1 km » ; mesure absente → « — ». */
export function sessionLine(totalS: number | null | undefined, totalM: number | null | undefined): string {
  const d = ok(totalS) && totalS > 0 ? fmtDur(totalS) : DASH;
  const km = ok(totalM) && totalM > 0 ? `${nf(totalM / 1000, 1)} km` : DASH;
  return `${d} · ${km}`;
}

// ── Après : faite sur la montre ────────────────────────────────────────────

export interface DoneRow {
  label: string;
  planned: string;
  done: string;
}

/** Prévu / fait d'une séance d'énergie faite avec une montre (planche EnergieTel, écran 05). */
export function plannedVsDoneRows(
  plan: { durationS: number | null | undefined; distanceM: number | null | undefined },
  act: { durationS: number | null | undefined; distanceM: number | null | undefined; avgPaceSPerKm?: number | null; avgHr?: number | null },
): DoneRow[] {
  const dist = (m: number | null | undefined) => (ok(m) && m > 0 ? `${nf(m / 1000, 1)} km` : DASH);
  const dur = (s: number | null | undefined) => (ok(s) && s > 0 ? fmtDur(s) : DASH);
  const planPace = ok(plan.durationS) && ok(plan.distanceM) && plan.distanceM > 0 && plan.durationS > 0
    ? (plan.durationS / plan.distanceM) * 1000 : null;
  const pace = (p: number | null | undefined) => (ok(p) && p > 0 ? `${fmtPace(p)}/km` : DASH);
  return [
    { label: "Durée", planned: dur(plan.durationS), done: dur(act.durationS) },
    { label: "Distance", planned: dist(plan.distanceM), done: dist(act.distanceM) },
    { label: "Allure moyenne", planned: pace(planPace), done: pace(act.avgPaceSPerKm) },
    { label: "FC moyenne", planned: DASH, done: ok(act.avgHr) && act.avgHr > 0 ? `${Math.round(act.avgHr)} bpm` : DASH },
  ];
}
