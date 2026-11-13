/**
 * Charge d'entraînement, modèle YOXX (P28) — calcul pur, partagé.
 *
 * Source : `regles.md` (coach-chef, arbitrage d'Hugo du 2026-11-07) et
 * `~/agon-roadmap/ref/suivi-charge-yoxx-2026-11-07.md`. Décisions du
 * 2026-11-13 : ratio aigu / chronique affiché, jamais dans un feu (D13) ;
 * modèles 5 et 7 zones ramenés aux 3 zones YOXX par numéro de zone ;
 * catégorie d'exercice déduite de la fiche, k = 6 pour tous.
 *
 * - **Point YOXX** = 1 minute en Zone 1. Zones athlète : Zone 1 sous le
 *   seuil 1, Zone 2 du seuil 1 à la vitesse critique, Zone 3 au-delà.
 * - **Course, ergos, vélo** (TRIMP de Lucia) : min Z1 × 1 + min Z2 × 2 + min Z3 × 3.
 *   Course avec tours et VC : un tour plus rapide que le seuil 1 est classé à
 *   l'allure (Z2 jusqu'à la VC, Z3 au-delà), sinon chaque seconde à la FC.
 * - **Séance mixte / spécifique / HYROX** : même formule sur la FC de toute la
 *   séance ; ses km vont dans « km compromised ».
 * - **Musculation** : séries dures pondérées (SDP) = Σ séries × f(RIR) × f(exercice),
 *   points = SDP × k. Jamais RPE × durée.
 * - **Prévu** : même calcul sur la séance programmée (étapes, cibles, séries × RIR prévus).
 * - Une mesure absente vaut `null` (« — »), jamais 0.
 */

import type { IsoDay } from "./dates.ts";
import { addDays } from "./dates.ts";
import { timeInZones } from "./hrZones.ts";

// ── Réglages (versionnés, à recalibrer après 3 à 6 mois) ─────────────────────

export const LOAD_PARAMS = {
  version: "yoxx-2026-11-13",
  /** Poids des minutes par zone YOXX (TRIMP de Lucia). */
  zoneWeights: [1, 2, 3] as const,
  /** Points salle = SDP × k. */
  k: 6,
  /** f(RIR) : RIR 0-1 → 1 · 2-3 → 0,75 · 4-5 → 0,4 · au-delà → 0. */
  rirFactor(rir: number): number {
    if (rir <= 1) return 1;
    if (rir <= 3) return 0.75;
    if (rir <= 5) return 0.4;
    return 0;
  },
  /** RIR ni saisi ni prévu : 0,75 (signalé au coach). */
  defaultRirFactor: 0.75,
  /** f(exercice). */
  exFactor: { heavyLower: 1.5, compound: 1, other: 0.5 },
  /** Ratio aigu / chronique : zone affichée (contexte seulement, D13). */
  acwrZone: [0.8, 1.3] as const,
  /** Plafond de séance = 1,10 × la plus longue course des 30 derniers jours. */
  ceilingFactor: 1.1,
} as const;

export type YoxxMinutes = [number, number, number];

// ── Zones FC du coach → 3 zones YOXX ─────────────────────────────────────────

/**
 * Zone YOXX d'une zone d'un modèle à N zones (décision d'Hugo, 13/11) :
 * 3 zones telles quelles ; 5 zones : Z1-Z2 → 1, Z3-Z4 → 2, Z5 → 3 ;
 * 7 zones : Z1-Z3 → 1, Z4-Z5 → 2, Z6-Z7 → 3. Autre nombre : `null`.
 */
export function yoxxZoneOf(zone: number, nZones: number): 1 | 2 | 3 | null {
  if (!Number.isInteger(zone) || zone < 1 || zone > nZones) return null;
  if (nZones === 3) return zone as 1 | 2 | 3;
  if (nZones === 5) return zone <= 2 ? 1 : zone <= 4 ? 2 : 3;
  if (nZones === 7) return zone <= 3 ? 1 : zone <= 5 ? 2 : 3;
  return null;
}

/** Secondes par zone du modèle → minutes par zone YOXX. `null` si non convertible ou vide. */
export function yoxxMinutesFromZoneSeconds(seconds: readonly number[] | null | undefined): YoxxMinutes | null {
  if (!seconds || seconds.length === 0) return null;
  const out: YoxxMinutes = [0, 0, 0];
  for (let i = 0; i < seconds.length; i++) {
    const z = yoxxZoneOf(i + 1, seconds.length);
    if (z === null) return null;
    out[z - 1] += (seconds[i] ?? 0) / 60;
  }
  return out[0] + out[1] + out[2] > 0 ? out : null;
}

export function pointsFromMinutes(m: YoxxMinutes): number {
  const w = LOAD_PARAMS.zoneWeights;
  return m[0] * w[0] + m[1] * w[1] + m[2] * w[2];
}

// ── Course : tours classés à l'allure ou à la FC ─────────────────────────────

export interface RunStreamForLoad {
  t: readonly number[];
  timer: ReadonlyArray<number | null> | null;
  hr: ReadonlyArray<number | null> | null;
  /** Mètres cumulés. */
  dist: ReadonlyArray<number | null> | null;
}

export interface LapRange {
  startS: number;
  endS: number;
}

/**
 * Minutes YOXX d'une course avec tours (règle de pilotage : basse intensité à
 * la FC, haute intensité à l'allure). Tour plus rapide que le seuil 1 → toute
 * sa durée en Z2 (≤ VC) ou Z3 (> VC) ; sinon chaque seconde classée à la FC
 * avec les bornes du modèle de la date. `null` si rien n'est classable.
 */
export function runYoxxMinutes(
  stream: RunStreamForLoad,
  laps: readonly LapRange[],
  bounds: readonly number[] | null,
  speeds: { s1Kmh: number | null; csKmh: number | null },
): YoxxMinutes | null {
  const out: YoxxMinutes = [0, 0, 0];
  const n = bounds ? bounds.length + 1 : 0;
  const ranges = laps.length > 0 ? laps : [{ startS: stream.t[0] ?? 0, endS: (stream.t[stream.t.length - 1] ?? 0) + 1 }];
  let any = false;
  for (const lap of ranges) {
    const dur = lap.endS - lap.startS;
    if (!(dur > 0)) continue;
    const kmh = lapSpeedKmh(stream, lap);
    if (kmh !== null && speeds.s1Kmh !== null && speeds.csKmh !== null && kmh > speeds.s1Kmh) {
      out[kmh > speeds.csKmh ? 2 : 1] += dur / 60;
      any = true;
      continue;
    }
    const tz = bounds ? timeInZones(stream, bounds, { fromS: lap.startS, toS: lap.endS }) : null;
    if (!tz) continue;
    for (let i = 0; i < tz.seconds.length; i++) {
      const z = yoxxZoneOf(i + 1, n);
      if (z === null) return null;
      out[z - 1] += tz.seconds[i] / 60;
    }
    any = true;
  }
  return any ? out : null;
}

function lapSpeedKmh(stream: RunStreamForLoad, lap: LapRange): number | null {
  if (!stream.dist) return null;
  let i0 = -1, i1 = -1;
  for (let i = 0; i < stream.t.length; i++) {
    const t = stream.t[i];
    if (t < lap.startS || t >= lap.endS || stream.dist[i] == null) continue;
    if (i0 < 0) i0 = i;
    i1 = i;
  }
  if (i0 < 0 || i1 <= i0) return null;
  const dt = stream.t[i1] - stream.t[i0];
  const dd = (stream.dist[i1] as number) - (stream.dist[i0] as number);
  return dt > 0 && dd > 0 ? (dd / dt) * 3.6 : null;
}

// ── Musculation ──────────────────────────────────────────────────────────────

export interface ExerciseInfo {
  name?: string | null;
  isCompound?: boolean | null;
  /** Muscle cible de la fiche (texte libre de la banque). */
  target?: string | null;
}

const LOWER = /quad|ischio|fess|glut|squat|soulev|deadlift|\bsdt\b|fente|lunge|split|step.?up|hip.?thrust|leg.?press|presse/i;
const LIGHT = /mollet|calf|gainage|plank|planche|core|abdo|crunch|copenhag/i;
const COMPOUND = /squat|soulev|deadlift|\bsdt\b|fente|lunge|split|d[ée]velopp|press|tirage|rowing|row\b|traction|pull.?up|chin|pompe|push.?up|dips|thruster|clean|snatch|arrach|[ée]paul[ée]|jet[ée]|hip.?thrust|step.?up/i;

/**
 * f(exercice), déduit de la fiche (décision d'Hugo, 13/11 : pas de colonne
 * pour l'instant) : polyarticulaire du bas du corps → 1,5 ; autre
 * polyarticulaire → 1 ; isolation, mollets, gainage → 0,5.
 */
export function exerciseFactor(ex: ExerciseInfo | null | undefined): number {
  const f = LOAD_PARAMS.exFactor;
  const text = `${ex?.name ?? ""} ${ex?.target ?? ""}`;
  if (LIGHT.test(text)) return f.other;
  const compound = ex?.isCompound ?? COMPOUND.test(ex?.name ?? "");
  if (!compound) return f.other;
  return LOWER.test(text) ? f.heavyLower : f.compound;
}

export interface StrengthSetForLoad {
  /** RIR saisi par l'athlète. */
  rir?: number | null;
  /** RIR prévu par le coach. */
  plannedRir?: number | null;
  exFactor: number;
  /** Série d'échauffement : 0. */
  warmup?: boolean;
}

export interface StrengthLoad {
  /** Séries dures pondérées. */
  sdp: number;
  points: number;
  /** Séries comptées sans RIR saisi ni prévu (0,75 appliqué) : à signaler. */
  missingRir: number;
}

export function strengthLoad(sets: readonly StrengthSetForLoad[], k: number = LOAD_PARAMS.k): StrengthLoad | null {
  if (sets.length === 0) return null;
  let sdp = 0, missingRir = 0;
  for (const s of sets) {
    if (s.warmup) continue;
    const rir = finite(s.rir) ?? finite(s.plannedRir);
    let fr: number;
    if (rir === null) {
      fr = LOAD_PARAMS.defaultRirFactor;
      missingRir++;
    } else fr = LOAD_PARAMS.rirFactor(rir);
    sdp += fr * s.exFactor;
  }
  return { sdp, points: sdp * k, missingRir };
}

const finite = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// ── Prévu : séance énergie / spécifique ──────────────────────────────────────

/** Forme minimale d'une étape (`src/types/energy.ts`). */
export interface PlanStepForLoad {
  type: "interval" | "group" | "exercise";
  role?: string;
  repeat?: number;
  children?: PlanStepForLoad[];
  rest_between?: PlanStepForLoad;
  duration?: { kind: string; value?: number };
  target?: { kind: string; [k: string]: unknown };
}

export interface PlanContext {
  /** Séance spécifique / HYROX : stations en Z3, le reste en Z2 (sans FC). */
  mixed: boolean;
  /** Bornes du modèle de zones de la date (bpm), `null` si aucun. */
  bounds: number[] | null;
  fcmax: number | null;
  /** Références de vitesse (km/h) : VMA, VC, « Allure 10K »… */
  speedRefs: Record<string, number | null | undefined>;
  s1Kmh: number | null;
  csKmh: number | null;
}

/** Durée par défaut d'une station sans durée (s) — hypothèse à revoir. */
export const DEFAULT_STATION_S = 60;

/**
 * Minutes YOXX prévues d'une séance (étapes du format YOXX). Échauffement,
 * récup, repos, retour au calme → Z1 (« les récupérations comptent en
 * Zone 1 ») ; effort classé par sa cible ; sans cible : Z2 (Z3 pour une
 * station de séance mixte). `null` si aucune durée n'est chiffrable.
 */
export function plannedYoxxMinutes(steps: readonly PlanStepForLoad[] | null | undefined, ctx: PlanContext): YoxxMinutes | null {
  if (!steps || steps.length === 0) return null;
  const out: YoxxMinutes = [0, 0, 0];
  let any = false;
  const visit = (list: readonly PlanStepForLoad[], times: number) => {
    for (const s of list) {
      if (s.type === "group") {
        const rep = Math.max(1, Math.round(s.repeat ?? 1));
        visit(s.children ?? [], times * rep);
        if (s.rest_between) visit([s.rest_between], times * rep);
        continue;
      }
      const zone = plannedZone(s, ctx);
      const sec = stepSeconds(s, zone, ctx);
      if (sec === null) continue;
      out[zone - 1] += (sec * times) / 60;
      any = true;
    }
  };
  visit(steps, 1);
  return any ? out : null;
}

const EASY_ROLES = new Set(["warmup", "recovery", "rest", "cooldown"]);

function plannedZone(s: PlanStepForLoad, ctx: PlanContext): 1 | 2 | 3 {
  if (EASY_ROLES.has(s.role ?? "")) return 1;
  if (s.type === "exercise") return ctx.mixed ? 3 : 2;
  const z = targetZone(s.target, ctx);
  if (z !== null) return z;
  if (s.role === "open") return 1;
  return 2;
}

function targetZone(t: PlanStepForLoad["target"], ctx: PlanContext): 1 | 2 | 3 | null {
  if (!t) return null;
  const mid = (a: unknown, b: unknown) => {
    const x = Number(a), y = Number(b);
    return Number.isFinite(x) && Number.isFinite(y) ? (x + y) / 2 : Number.isFinite(x) ? x : null;
  };
  switch (t.kind) {
    case "hr_zone":
      // Zone 1-5 de l'éditeur énergie.
      return yoxxZoneOf(Number(t.zone), 5);
    case "hr_bpm":
      return zoneOfBpm(mid(t.min, t.max), ctx);
    case "hr_pct": {
      const p = mid(t.min, t.max);
      return p !== null && ctx.fcmax ? zoneOfBpm((p / 100) * ctx.fcmax, ctx) : null;
    }
    case "pace":
    case "pace_test_pct":
      return zoneOfSpeed(targetSpeedKmh(t, ctx), ctx);
    default:
      return null;
  }
}

function zoneOfBpm(bpm: number | null, ctx: PlanContext): 1 | 2 | 3 | null {
  if (bpm === null || !ctx.bounds || ctx.bounds.length === 0) return null;
  let z = 1;
  for (const b of ctx.bounds) if (bpm >= b) z++;
  return yoxxZoneOf(z, ctx.bounds.length + 1);
}

function zoneOfSpeed(kmh: number | null, ctx: PlanContext): 1 | 2 | 3 | null {
  if (kmh === null || ctx.s1Kmh === null || ctx.csKmh === null) return null;
  return kmh <= ctx.s1Kmh ? 1 : kmh <= ctx.csKmh ? 2 : 3;
}

/** Vitesse visée (km/h) d'une cible d'allure, `null` si inconnue. */
function targetSpeedKmh(t: NonNullable<PlanStepForLoad["target"]>, ctx: PlanContext): number | null {
  if (t.kind === "pace") {
    const a = Number(t.min_s_per_unit), b = Number(t.max_s_per_unit);
    const sPerKm = Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : Number.isFinite(a) ? a : NaN;
    return Number.isFinite(sPerKm) && sPerKm > 0 ? 3600 / sPerKm : null;
  }
  if (t.kind === "pace_test_pct") {
    const ref = ctx.speedRefs[String(t.test_metric)] ?? (t.test_metric === "VC" ? ctx.csKmh : null);
    const a = Number(t.min), b = Number(t.max);
    const pct = Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : Number.isFinite(a) ? a : NaN;
    return ref && Number.isFinite(pct) ? (ref * pct) / 100 : null;
  }
  return null;
}

/** Durée (s) d'une étape : temps ; distance à la vitesse visée (ou celle de sa zone) ; station sans durée : 60 s. */
function stepSeconds(s: PlanStepForLoad, zone: 1 | 2 | 3, ctx: PlanContext): number | null {
  const d = s.duration;
  const v = finite(d?.value ?? null);
  if (d?.kind === "time" && v !== null && v > 0) return v;
  if (d?.kind === "distance" && v !== null && v > 0) {
    const kmh = (s.target ? targetSpeedKmh(s.target, ctx) : null)
      ?? (zone === 1 ? (ctx.s1Kmh !== null ? ctx.s1Kmh * 0.9 : null) : zone === 2 ? ctx.s1Kmh : ctx.csKmh);
    return kmh && kmh > 0 ? (v / 1000 / kmh) * 3600 : null;
  }
  if (s.type === "exercise") return DEFAULT_STATION_S;
  return null;
}

// ── Séances et semaine ───────────────────────────────────────────────────────

export type LoadFocus = "endurance" | "mixed" | "strength";

export interface SessionLoad {
  id: string;
  day: IsoDay;
  label: string;
  focus: LoadFocus;
  /** Points prévus (`null` : séance non prévue ou non chiffrable). */
  planned: number | null;
  /** Points réalisés (`null` : pas faite ou non chiffrable). */
  done: number | null;
  /** Minutes réalisées par zone YOXX (endurance et mixte). */
  minutes?: YoxxMinutes | null;
  /** Km de course réalisés. */
  km?: number | null;
  /** Dont km en compromised (défaut : tous les km d'une séance mixte). */
  compromisedKm?: number | null;
  /** Séries sans RIR (musculation). */
  missingRir?: number;
  /** Réalisé sans montre : points prévus repris (« fait comme prévu »). */
  asPlanned?: boolean;
}

export interface WeekLoad {
  from: IsoDay;
  /** Points réalisés par jour (lundi → dimanche), 0 = repos. */
  daily: number[];
  done: number;
  planned: number | null;
  /** (réalisé ÷ prévu − 1) × 100. */
  gapPct: number | null;
  /** Moyenne des 4 semaines précédentes (semaine en cours exclue). */
  chronic: number | null;
  /** Semaine ÷ charge chronique (affiché seulement, D13). */
  ratio: number | null;
  /** (semaine ÷ semaine précédente − 1) × 100. */
  variationPct: number | null;
  /** Moyenne des 7 jours ÷ écart-type (n − 1). */
  monotony: number | null;
  /** Charge × monotonie. */
  strain: number | null;
  top: { id: string; label: string; points: number; sharePct: number } | null;
  /** Points par focus : Zone 1, Zone 2, Zone 3 (endurance), mixte, salle. */
  byFocus: { z1: number; z2: number; z3: number; mixed: number; strength: number };
  /** Minutes Z1 ÷ minutes de course et d'ergos (hors mixte), en %. */
  z1SharePct: number | null;
  km: { total: number; compromised: number; other: number };
  kmVariationPct: number | null;
  /** Séances avec des minutes en Z2/Z3 + séances mixtes. */
  keySessions: number;
  /** 1,10 × plus longue course des 30 derniers jours (km). */
  ceilingKm: number | null;
  sessions: SessionLoad[];
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Écart-type d'échantillon (n − 1). */
export function sampleSd(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export interface WeekLoadInput {
  /** Lundi de la semaine. */
  from: IsoDay;
  sessions: readonly SessionLoad[];
  /** Charges réalisées des semaines précédentes, la plus récente en premier. */
  previousWeeks: readonly number[];
  previousWeekKm?: number | null;
  longestRun30dKm?: number | null;
}

export function weekLoad(input: WeekLoadInput): WeekLoad {
  const days = Array.from({ length: 7 }, (_, i) => addDays(input.from, i));
  const daily = days.map((d) =>
    input.sessions.filter((s) => s.day === d).reduce((a, s) => a + (s.done ?? 0), 0),
  );
  const done = daily.reduce((a, b) => a + b, 0);
  const plannedVals = input.sessions.map((s) => s.planned).filter((p): p is number => p !== null);
  const planned = plannedVals.length > 0 ? plannedVals.reduce((a, b) => a + b, 0) : null;
  const prev4 = input.previousWeeks.slice(0, 4);
  const chronic = prev4.length === 4 ? prev4.reduce((a, b) => a + b, 0) / 4 : null;
  const prev = input.previousWeeks[0] ?? null;
  const mean = done / 7;
  const sd = sampleSd(daily);
  const monotony = sd && sd > 0 ? mean / sd : null;

  const byFocus = { z1: 0, z2: 0, z3: 0, mixed: 0, strength: 0 };
  let z1Min = 0, enduranceMin = 0, keySessions = 0;
  let kmTotal = 0, kmComp = 0;
  let top: WeekLoad["top"] = null;
  for (const s of input.sessions) {
    const p = s.done ?? 0;
    if (s.done !== null && (!top || p > top.points)) top = { id: s.id, label: s.label, points: p, sharePct: 0 };
    if (s.focus === "strength") byFocus.strength += p;
    else if (s.focus === "mixed") {
      byFocus.mixed += p;
      if (s.done !== null) keySessions++;
    } else if (s.minutes) {
      const w = LOAD_PARAMS.zoneWeights;
      byFocus.z1 += s.minutes[0] * w[0];
      byFocus.z2 += s.minutes[1] * w[1];
      byFocus.z3 += s.minutes[2] * w[2];
      z1Min += s.minutes[0];
      enduranceMin += s.minutes[0] + s.minutes[1] + s.minutes[2];
      if (s.minutes[1] + s.minutes[2] > 0) keySessions++;
    } else if (s.done !== null) byFocus.z1 += p;
    if (s.km) {
      kmTotal += s.km;
      kmComp += s.compromisedKm ?? (s.focus === "mixed" ? s.km : 0);
    }
  }
  if (top && done > 0) top.sharePct = round1((top.points / done) * 100);

  return {
    from: input.from,
    daily,
    done,
    planned,
    gapPct: planned && planned > 0 ? ((done / planned) - 1) * 100 : null,
    chronic,
    ratio: chronic && chronic > 0 ? done / chronic : null,
    variationPct: prev && prev > 0 ? ((done / prev) - 1) * 100 : null,
    monotony,
    strain: monotony !== null ? done * monotony : null,
    top,
    byFocus,
    z1SharePct: enduranceMin > 0 ? (z1Min / enduranceMin) * 100 : null,
    km: { total: kmTotal, compromised: kmComp, other: kmTotal - kmComp },
    kmVariationPct: input.previousWeekKm && input.previousWeekKm > 0 ? ((kmTotal / input.previousWeekKm) - 1) * 100 : null,
    keySessions,
    ceilingKm: input.longestRun30dKm && input.longestRun30dKm > 0 ? input.longestRun30dKm * LOAD_PARAMS.ceilingFactor : null,
    sessions: [...input.sessions],
  };
}

/** Zone du ratio : sous 0,8, dans 0,8–1,3, au-dessus. Affichage seulement. */
export function ratioZone(ratio: number | null): "below" | "in" | "above" | null {
  if (ratio === null || !Number.isFinite(ratio)) return null;
  const [lo, hi] = LOAD_PARAMS.acwrZone;
  return ratio < lo ? "below" : ratio > hi ? "above" : "in";
}
