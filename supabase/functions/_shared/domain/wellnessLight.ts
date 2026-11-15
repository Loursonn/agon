/**
 * Feu du matin (vert / orange / rouge) : règles du coach chef arbitrées par
 * Hugo le 2026-11-07 (`staff/coach-chef/regles.md`, « Charge d'entraînement,
 * surcharge et VFC »).
 *
 * Calcul local et pur. Les mesures de montre (Garmin, COROS…) entrent ici
 * brutes — VFC de nuit, FC de repos, durée de sommeil — et ce module n'est
 * appelé par aucune fonction d'IA : rien de ce qu'il lit ne part vers un modèle d'IA.
 * Jamais les scores de marque (Body Battery, readiness, sommeil…).
 *
 * Une seule marque de montre par athlète : la plus récente. Les nuits d'une
 * autre marque ne sont ni mélangées ni comparées (changement de montre =
 * nouvelle habitude, l'alerte VFC repart de J1).
 *
 * Signaux du matin tranchés par Hugo le 2026-11-14 : douleur, envie touchée,
 * sensation de fatigue, FC de repos qui augmente, VFC en déclin ou
 * anormalement au-dessus. Un signal seul = orange (vigilance) ; le même
 * signal plusieurs jours de suite (2 suffisent) = rouge. Un jour sans la
 * mesure casse la série : une mesure absente ne compte jamais.
 */
import { addDays, type IsoDay } from "./dates.ts";

export const LIGHT_PARAMS = {
  version: "feux-2026-11-14",
  /** Moyenne glissante VFC / FC de repos. */
  windowDays: 7,
  minWindowNights: 5,
  /** Habitude : les 28 jours avant la fenêtre (depuis J1 tant qu'il n'y en a pas 28). */
  baselineDays: 28,
  /** Zone normale VFC = moyenne ± 0,5 écart-type (ln RMSSD). */
  hrvZoneSd: 0.5,
  /** L'alerte VFC s'active au 14e jour de mesure (zone et moyenne sans nuit commune). */
  hrvAlertFromDay: 14,
  minBaselineNights: 5,
  restingHrSdFloor: 1,
  restingHrZ: 1,
  /** Sommeil de la montre : plancher d'écart-type (min) et seuil de baisse (z). */
  sleepSdFloorMin: 15,
  sleepDropZ: -1,
  /** Orange : réalisé > prévu + 10 %, km > +7 %, monotonie > 2 (Foster 1998). */
  loadOverPlanPct: 10,
  kmRisePct: 7,
  monotony: 2,
  /**
   * Douleur du matin : échelle 0-10 de la carte douleur (1-3 = gêne, 4 et plus
   * = douleur). Signal à partir de 4 (Hugo, 14/11).
   */
  painMin: 4,
  /**
   * Envie touchée (signal du matin) : `envieLow` ou moins, ou nettement sous
   * l'habitude (z ≤ `morningItemZ`). Fatigue : item « Récupération » (1 épuisé
   * → 5 très reposé) ≤ `fatigueLow`, ou z ≤ `morningItemZ`.
   */
  fatigueLow: 2,
  morningItemZ: -1.5,
  /** Habitude des ressentis : 28 jours avant la saisie, 7 saisies au moins, plancher d'écart-type 0,5. */
  morningMinEntries: 7,
  morningSdFloor: 0.5,
  /** VFC « anormalement au-dessus » : moyenne 7 j > moyenne + 1 écart-type de l'habitude (deux fois la demi-zone). */
  hrvHighSd: 1,
  /** Même signal ce nombre de jours de suite = rouge (Hugo : « 2-3 jours »). */
  persistDays: 2,
  /** Jours de suite comptés au plus (affichage « depuis N jours »). */
  streakMaxDays: 7,
  /** Rouge (regles.md) : envie ≤ 2, score wellness z < −1. Aussi seuil de l'envie touchée. */
  envieLow: 2,
  wellnessScoreZ: -1,
  /** Orange : 2 items du wellness à z < −1,5. */
  wellnessItemsLow: 2,
  redMinSigns: 2,
} as const;

export type Light = "green" | "orange" | "red";

/** Une nuit / un jour de montre, pour une marque. */
export interface WatchDay {
  day: IsoDay;
  /** Marque (« garmin », « coros »…) : un export Garmin compte comme Garmin. */
  brand: string;
  /** VFC de nuit (RMSSD, ms). */
  hrvMs: number | null;
  restingHr: number | null;
  sleepMin: number | null;
}

/** Saisie wellness du matin (aujourd'hui ou hier), déjà comparée à l'habitude. */
export interface WellnessSignals {
  day: IsoDay;
  /** Items à z < −1,5 (src/lib/wellnessBaseline). */
  itemsLow: number;
  /** z du score global, null si l'habitude n'est pas encore fiable. */
  scoreZ: number | null;
  /** Item « Qualité du sommeil » à z < −1,5. */
  sleepItemLow: boolean;
  envie: number | null;
  pain: number | null;
  sick: boolean | null;
  /** Douleur qui modifie la foulée : pas encore demandée dans le wellness. */
  strideChange?: boolean | null;
}

/** Saisie wellness réduite à ce que lit le feu (une `WellnessEntry` convient). */
export interface MorningEntry {
  envie: number | null;
  /** Douleur 0-10 (la plus forte des zones). */
  pain: number | null;
  items: { fatigue?: number | null };
}

/** Saisies par jour "YYYY-MM-DD" : sert à la persistance sur plusieurs jours. */
export type MorningHistory = Readonly<Record<IsoDay, MorningEntry>>;

/** Charge des 7 derniers jours (fenêtre glissante, aujourd'hui inclus). */
export interface LoadSignals {
  done: number;
  planned: number | null;
  /** Charge réalisée des 7 jours d'avant. */
  previous: number | null;
  kmVariationPct: number | null;
  monotony: number | null;
  /** Une séance non prévue a dépassé le plafond (1,10 × plus longue course de 30 j). */
  unplannedOverCeiling: boolean;
}

export interface LightInputs {
  today: IsoDay;
  watch: readonly WatchDay[];
  wellness: WellnessSignals | null;
  load: LoadSignals | null;
  /**
   * Saisies des derniers jours (et leur habitude, 28 j avant). Absent : seule
   * la saisie `wellness` du jour compte, sans persistance.
   */
  morning?: MorningHistory | null;
  /** Séance repère ratée : pas encore définie dans Agon (toujours absente). */
  missedBenchmark?: boolean | null;
}

export interface HrvStatus {
  /** Moyenne 7 j du ln RMSSD (≥ 5 nuits), sinon null. */
  mean7: number | null;
  zoneLow: number | null;
  zoneHigh: number | null;
  /** Jour de mesure (J1 = première nuit de cette montre). */
  dayIndex: number | null;
  /** Alerte possible (J14 atteint, habitude et moyenne présentes). */
  active: boolean;
  below: boolean;
  /** Jours de suite (aujourd'hui compris) sous la zone. */
  belowDays: number;
  /** Moyenne 7 j anormalement au-dessus (> moyenne + 1 écart-type de l'habitude). */
  above: boolean;
  aboveDays: number;
}

export interface RestingHrStatus {
  mean7: number | null;
  baselineMean: number | null;
  baselineSd: number | null;
  z: number | null;
}

export type SignalKey =
  | "load_over_plan" | "km_rise" | "unplanned_over_ceiling" | "monotony" | "hrv_low" | "resting_hr_high"
  | "wellness_items" | "pain" | "load_rising" | "wellness_score" | "envie_low" | "sleep_drop"
  | "missed_benchmark" | "sick" | "stride_pain" | "envie_down" | "fatigue" | "hrv_high";

export interface LightSignal {
  key: SignalKey;
  text: string;
  /** Signaux du matin : jours de suite où il est présent (1 = isolé). */
  days?: number;
}

export interface LightResult {
  light: Light;
  /** Une phrase qui dit pourquoi le feu a cette couleur. */
  sentence: string;
  /** Signaux du matin présents (douleur, envie, fatigue, FC de repos, VFC), avec leurs jours de suite. */
  morning: LightSignal[];
  /** Signaux d'orange (au moins un = orange). */
  orange: LightSignal[];
  /** Signes d'accompagnement comptés pour le rouge. */
  redSigns: LightSignal[];
  hrv: HrvStatus;
  restingHr: RestingHrStatus;
  /** Marque de montre retenue, null sans montre. */
  brand: string | null;
  version: string;
}

// ── Statistiques ─────────────────────────────────────────────────────────────

function meanSd(xs: readonly number[]): { mean: number; sd: number | null } | null {
  if (xs.length === 0) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (xs.length < 2) return { mean, sd: null };
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  return { mean, sd: Math.sqrt(v) };
}

const fr = (x: number, d = 1) => x.toFixed(d).replace(".", ",");

// ── Montre ───────────────────────────────────────────────────────────────────

/** Marque de la mesure la plus récente ; ses jours seulement, un par jour. */
export function currentWatch(watch: readonly WatchDay[], today: IsoDay): { brand: string | null; days: Map<IsoDay, WatchDay> } {
  const measured = watch.filter((w) => w.day <= today && (w.hrvMs != null || w.restingHr != null || w.sleepMin != null));
  if (measured.length === 0) return { brand: null, days: new Map() };
  const latest = measured.reduce((a, b) => (b.day > a.day ? b : a));
  const days = new Map<IsoDay, WatchDay>();
  for (const w of measured) {
    if (w.brand !== latest.brand) continue;
    const prev = days.get(w.day);
    days.set(w.day, prev ? {
      ...prev,
      hrvMs: prev.hrvMs ?? w.hrvMs,
      restingHr: prev.restingHr ?? w.restingHr,
      sleepMin: prev.sleepMin ?? w.sleepMin,
    } : w);
  }
  return { brand: latest.brand, days };
}

type Series = Map<IsoDay, number>;

function series(days: Map<IsoDay, WatchDay>, pick: (w: WatchDay) => number | null): Series {
  const s: Series = new Map();
  for (const [d, w] of days) {
    const v = pick(w);
    if (v != null && Number.isFinite(v)) s.set(d, v);
  }
  return s;
}

function valuesBetween(s: Series, from: IsoDay, to: IsoDay): number[] {
  const out: number[] = [];
  for (const [d, v] of s) if (d >= from && d <= to) out.push(v);
  return out;
}

const firstDay = (s: Series): IsoDay | null => {
  let f: IsoDay | null = null;
  for (const d of s.keys()) if (f === null || d < f) f = d;
  return f;
};

function daysFrom(a: IsoDay, b: IsoDay): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Habitude d'un jour : les 28 jours avant la fenêtre de 7 jours. Tant que
 * l'athlète n'a pas 4 semaines, depuis J1 (fenêtre comprise : avant J14 la
 * zone et la moyenne partagent des nuits, d'où l'alerte seulement à J14).
 */
function baselineValues(s: Series, day: IsoDay): number[] {
  const P = LIGHT_PARAMS;
  const windowFrom = addDays(day, -(P.windowDays - 1));
  const before = valuesBetween(s, addDays(windowFrom, -P.baselineDays), addDays(windowFrom, -1));
  if (before.length >= P.minBaselineNights) return before;
  const j1 = firstDay(s);
  return j1 ? valuesBetween(s, j1, day) : [];
}

function hrvOn(lnHrv: Series, day: IsoDay): Omit<HrvStatus, "belowDays" | "aboveDays"> {
  const P = LIGHT_PARAMS;
  const win = valuesBetween(lnHrv, addDays(day, -(P.windowDays - 1)), day);
  const mean7 = win.length >= P.minWindowNights ? win.reduce((a, b) => a + b, 0) / win.length : null;
  const j1 = firstDay(lnHrv);
  const dayIndex = j1 && j1 <= day ? daysFrom(j1, day) + 1 : null;
  const base = meanSd(baselineValues(lnHrv, day));
  const zoneLow = base?.sd != null ? base.mean - P.hrvZoneSd * base.sd : null;
  const zoneHigh = base?.sd != null ? base.mean + P.hrvZoneSd * base.sd : null;
  const active = mean7 !== null && zoneLow !== null && dayIndex !== null && dayIndex >= P.hrvAlertFromDay;
  const above = active && base?.sd != null && mean7! > base.mean + P.hrvHighSd * base.sd;
  return { mean7, zoneLow, zoneHigh, dayIndex, active, below: active && mean7! < zoneLow!, above };
}

/** Jours de suite, `day` compris, où `on` est vrai (0 si faux ce jour-là). */
function streak(day: IsoDay, on: (d: IsoDay) => boolean, max: number): number {
  let n = 0;
  while (n < max && on(addDays(day, -n))) n++;
  return n;
}

export function hrvStatus(lnHrv: Series, today: IsoDay): HrvStatus {
  const now = hrvOn(lnHrv, today);
  const belowDays = now.below ? streak(today, (d) => hrvOn(lnHrv, d).below, 28) : 0;
  const aboveDays = now.above ? streak(today, (d) => hrvOn(lnHrv, d).above, LIGHT_PARAMS.streakMaxDays) : 0;
  return { ...now, belowDays, aboveDays };
}

export function restingHrStatus(rhr: Series, today: IsoDay): RestingHrStatus {
  const P = LIGHT_PARAMS;
  const windowFrom = addDays(today, -(P.windowDays - 1));
  const win = valuesBetween(rhr, windowFrom, today);
  const mean7 = win.length >= P.minWindowNights ? win.reduce((a, b) => a + b, 0) / win.length : null;
  // FC de repos : l'habitude ne reprend jamais les jours de la fenêtre.
  const before = valuesBetween(rhr, addDays(windowFrom, -P.baselineDays), addDays(windowFrom, -1));
  const base = before.length >= P.minBaselineNights ? meanSd(before) : null;
  const sd = base ? Math.max(base.sd ?? 0, P.restingHrSdFloor) : null;
  const z = mean7 !== null && base && sd ? (mean7 - base.mean) / sd : null;
  return { mean7, baselineMean: base?.mean ?? null, baselineSd: base?.sd ?? null, z };
}

function watchSleepDrop(sleep: Series, today: IsoDay): boolean {
  const P = LIGHT_PARAMS;
  const windowFrom = addDays(today, -(P.windowDays - 1));
  const win = valuesBetween(sleep, windowFrom, today);
  const before = valuesBetween(sleep, addDays(windowFrom, -P.baselineDays), addDays(windowFrom, -1));
  if (win.length < P.minWindowNights || before.length < P.minBaselineNights) return false;
  const m7 = win.reduce((a, b) => a + b, 0) / win.length;
  const base = meanSd(before)!;
  return (m7 - base.mean) / Math.max(base.sd ?? 0, P.sleepSdFloorMin) < P.sleepDropZ;
}

// ── Ressentis du matin ───────────────────────────────────────────────────────

type MorningKey = "pain" | "envie_down" | "fatigue";

/** Habitude d'un ressenti : les 28 jours avant `day`, 7 saisies au moins. */
function morningHabit(h: MorningHistory, day: IsoDay, pick: (e: MorningEntry) => number | null): { mean: number; sd: number } | null {
  const P = LIGHT_PARAMS;
  const from = addDays(day, -P.baselineDays);
  const xs: number[] = [];
  for (const [d, e] of Object.entries(h)) {
    if (d < from || d >= day) continue;
    const v = pick(e);
    if (v != null && Number.isFinite(v)) xs.push(v);
  }
  if (xs.length < P.morningMinEntries) return null;
  const m = meanSd(xs)!;
  return { mean: m.mean, sd: Math.max(m.sd ?? 0, P.morningSdFloor) };
}

/** Texte du signal ce jour-là, ou null (signal absent ou mesure absente). */
function morningOn(h: MorningHistory, day: IsoDay, key: MorningKey): string | null {
  const P = LIGHT_PARAMS;
  const e = h[day];
  if (!e) return null;
  if (key === "pain") return e.pain != null && e.pain >= P.painMin ? `Douleur ${e.pain}/10` : null;
  const pick = key === "envie_down" ? (x: MorningEntry) => x.envie : (x: MorningEntry) => x.items.fatigue ?? null;
  const v = pick(e);
  if (v == null) return null;
  const low = key === "envie_down" ? P.envieLow : P.fatigueLow;
  const label = key === "envie_down" ? `Envie ${v}/5` : `Fatigue (récupération ${v}/5)`;
  if (v <= low) return label;
  const habit = morningHabit(h, day, pick);
  return habit && (v - habit.mean) / habit.sd <= P.morningItemZ ? `${label} (habitude ${fr(habit.mean)})` : null;
}

const MORNING_KEYS: readonly MorningKey[] = ["pain", "envie_down", "fatigue"];

/** Saisie de référence : aujourd'hui, sinon hier ; plus vieille, elle ne dit rien de ce matin. */
function morningRef(h: MorningHistory, today: IsoDay): IsoDay | null {
  if (h[today]) return today;
  const y = addDays(today, -1);
  return h[y] ? y : null;
}

const suffix = (days: number) => (days >= 2 ? ` depuis ${days} jours` : "");

// ── Feu ──────────────────────────────────────────────────────────────────────

/** Feu du jour, ou null si rien n'est mesuré (ni wellness récent, ni montre, ni charge). */
export function wellnessLight(inp: LightInputs): LightResult | null {
  const P = LIGHT_PARAMS;
  const { brand, days } = currentWatch(inp.watch, inp.today);
  const lnHrv = series(days, (w) => (w.hrvMs != null && w.hrvMs > 0 ? Math.log(w.hrvMs) : null));
  const hrv = hrvStatus(lnHrv, inp.today);
  const rhrSeries = series(days, (w) => w.restingHr);
  const restingHr = restingHrStatus(rhrSeries, inp.today);
  const sleepDropWatch = watchSleepDrop(series(days, (w) => w.sleepMin), inp.today);

  const w = inp.wellness;
  const load = inp.load && (inp.load.done > 0 || inp.load.planned != null) ? inp.load : null;
  if (!w && days.size === 0 && !load) return null;

  // Signaux du matin (Hugo, 14/11), avec leurs jours de suite.
  const hist: MorningHistory = inp.morning ?? (w ? { [w.day]: { envie: w.envie, pain: w.pain, items: {} } } : {});
  const ref = morningRef(hist, inp.today);
  const morning: LightSignal[] = [];
  if (ref) {
    for (const key of MORNING_KEYS) {
      const text = morningOn(hist, ref, key);
      if (!text) continue;
      const n = streak(ref, (d) => morningOn(hist, d, key) !== null, P.streakMaxDays);
      morning.push({ key, text: text + suffix(n), days: n });
    }
  }
  const rhrHigh = (d: IsoDay) => {
    const s = d === inp.today ? restingHr : restingHrStatus(rhrSeries, d);
    return s.z != null && s.z > P.restingHrZ;
  };
  if (rhrHigh(inp.today)) {
    const n = streak(inp.today, rhrHigh, P.streakMaxDays);
    morning.push({
      key: "resting_hr_high",
      text: `FC de repos au-dessus de l'habitude (${fr(restingHr.mean7!, 0)} contre ${fr(restingHr.baselineMean!, 0)} bpm)${suffix(n)}`,
      days: n,
    });
  }
  if (hrv.below) {
    morning.push({ key: "hrv_low", text: `VFC sous ta zone habituelle${suffix(hrv.belowDays)}`, days: hrv.belowDays });
  }
  if (hrv.above) {
    morning.push({ key: "hrv_high", text: `VFC anormalement au-dessus de ta zone${suffix(hrv.aboveDays)}`, days: hrv.aboveDays });
  }

  const orange: LightSignal[] = [...morning];
  if (load) {
    if (load.planned != null && load.planned > 0 && load.done > load.planned * (1 + P.loadOverPlanPct / 100)) {
      orange.push({ key: "load_over_plan", text: `Charge des 7 jours ${Math.round((load.done / load.planned - 1) * 100)} % au-dessus du prévu` });
    }
    if (load.kmVariationPct != null && load.kmVariationPct > P.kmRisePct) {
      orange.push({ key: "km_rise", text: `Kilomètres +${Math.round(load.kmVariationPct)} % sur 7 jours` });
    }
    if (load.unplannedOverCeiling) orange.push({ key: "unplanned_over_ceiling", text: "Sortie non prévue au-dessus du plafond" });
    if (load.monotony != null && load.monotony > P.monotony) {
      orange.push({ key: "monotony", text: `Monotonie ${fr(load.monotony, 2)} (au-dessus de 2)` });
    }
  }
  if (w && w.itemsLow >= P.wellnessItemsLow) orange.push({ key: "wellness_items", text: `${w.itemsLow} ressentis nettement sous l'habitude` });

  const redSigns: LightSignal[] = [];
  if (restingHr.z != null && restingHr.z > P.restingHrZ) redSigns.push({ key: "resting_hr_high", text: "FC de repos haute" });
  if (w?.scoreZ != null && w.scoreZ < P.wellnessScoreZ) redSigns.push({ key: "wellness_score", text: "Wellness sous l'habitude" });
  if (w?.envie != null && w.envie <= P.envieLow) redSigns.push({ key: "envie_low", text: `Envie ${w.envie}/5` });
  if (sleepDropWatch || w?.sleepItemLow) redSigns.push({ key: "sleep_drop", text: "Sommeil en baisse" });
  if (inp.missedBenchmark) redSigns.push({ key: "missed_benchmark", text: "Séance repère ratée" });

  const loadRising = !!load && (
    (load.previous != null && load.done > load.previous) || (load.planned != null && load.done > load.planned)
  );

  const repeated = morning.filter((s) => (s.days ?? 0) >= P.persistDays);
  const join = (xs: readonly LightSignal[]) => xs.map((s) => s.text).join(" · ");

  let light: Light;
  let sentence: string;
  if (w?.sick) {
    light = "red";
    sentence = "Malade ou fiévreux·se ce matin : rouge d'office";
  } else if (w?.strideChange) {
    light = "red";
    sentence = "Douleur qui modifie la foulée : rouge d'office";
  } else if (repeated.length > 0) {
    light = "red";
    sentence = `${join(repeated)} : ${repeated.length > 1 ? "les signaux se répètent" : "le signal se répète"}, à prendre au sérieux`;
  } else if (loadRising && hrv.below && redSigns.length >= P.redMinSigns) {
    light = "red";
    sentence = `Charge en hausse et VFC sous ta zone · ${redSigns.map((s) => s.text).join(" · ")}`;
  } else if (morning.length > 0) {
    light = "orange";
    sentence = morning.length > 1
      ? `${join(morning)} : signaux isolés, à surveiller (rouge s'ils se répètent demain)`
      : `${join(morning)} : signal isolé, à surveiller (rouge s'il se répète demain)`;
  } else if (orange.length > 0) {
    light = "orange";
    sentence = `${orange[0].text} : à surveiller`;
  } else {
    light = "green";
    sentence = "Rien à signaler ce matin";
  }

  return { light, sentence, morning, orange, redSigns, hrv, restingHr, brand, version: P.version };
}
