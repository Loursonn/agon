/**
 * « Modifier tours » : tableau des tours entièrement modifiable (demande d'Hugo du 16/11/2026).
 *
 * Décisions d'Hugo (16/11) :
 * - durée modifiée = la limite du tour se déplace sur la courbe, le voisin suit ;
 * - supprimer un tour = son temps rejoint le tour voisin ;
 * - ajouter un tour = couper la courbe, ou un tour tapé à la main hors courbe
 *   (montre oubliée / arrêtée) : durée, distance, type, sans FC ;
 * - allure tapée = la distance se recalcule (la durée reste) ;
 * - tout se corrige sauf la FC (données de la montre) ;
 * - les chiffres corrigés ne valent que pour l'écran de la séance.
 *
 * Le flux brut de la montre n'est jamais touché : les corrections vivent dans
 * les tours enregistrés (`activity_laps`), « Revenir aux tours de la montre » les efface.
 */

import type { LapMetrics } from "@shared/domain/lapMetrics";
import { sampleWeights } from "@shared/domain/hrZones";

// ── Type de tour ───────────────────────────────────────────────────────────

export type LapPhase = "warmup" | "work" | "recovery" | "cooldown";

export const LAP_PHASES: ReadonlyArray<{ id: LapPhase; label: string; short: string }> = [
  { id: "warmup", label: "Échauffement", short: "Échauff." },
  { id: "work", label: "Effort", short: "Effort" },
  { id: "recovery", label: "Récupération", short: "Récup" },
  { id: "cooldown", label: "Retour au calme", short: "Calme" },
];

export function phaseLabel(p: LapPhase | null | undefined, short = false): string | null {
  const f = LAP_PHASES.find((x) => x.id === p);
  return f ? (short ? f.short : f.label) : null;
}

export function isLapPhase(v: unknown): v is LapPhase {
  return typeof v === "string" && LAP_PHASES.some((p) => p.id === v);
}

// ── Valeurs corrigées (jamais la FC) ─────────────────────────────────────────

export const OVERRIDE_KEYS = ["maxPaceSPerKm", "avgCadence", "maxCadence", "ascentM", "descentM", "avgPower", "maxPower"] as const;
export type OverrideKey = (typeof OVERRIDE_KEYS)[number];
export type LapOverrides = Partial<Record<OverrideKey, number>>;

/** Garde seulement les clés connues, nombres finis ≥ 0 (même règle que la base). `null` si vide. */
export function cleanOverrides(o: unknown): LapOverrides | null {
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const out: LapOverrides = {};
  for (const k of OVERRIDE_KEYS) {
    const v = (o as Record<string, unknown>)[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100000) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Corrige (ou efface avec `null`) une valeur ; renvoie `null` si plus rien n'est corrigé. */
export function setOverride(o: LapOverrides | null | undefined, key: OverrideKey, value: number | null): LapOverrides | null {
  const next: Record<string, unknown> = { ...(o ?? {}) };
  if (value === null) delete next[key];
  else next[key] = value;
  return cleanOverrides(next);
}

// ── Tour tapé à la main (hors courbe) ─────────────────────────────────────────

export interface EditFields {
  startS: number;
  endS: number;
  distanceOverrideM: number | null;
  lapType?: LapPhase | null;
  manualDurationS?: number | null;
  overrides?: LapOverrides | null;
}

export const isManualLap = (l: { manualDurationS?: number | null }): boolean =>
  typeof l.manualDurationS === "number" && l.manualDurationS > 0;

/** Un tour porte-t-il une correction de valeur (pas seulement un nom, un type ou des limites) ? */
export function hasValueEdit(l: EditFields): boolean {
  return isManualLap(l) || l.distanceOverrideM != null || !!cleanOverrides(l.overrides);
}

const pace = (speed: number | null): number | null => (speed && speed > 0 ? 1000 / speed : null);
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Métriques d'un tour tapé à la main : durée et distance saisies, pas de FC (pas de montre). */
export function manualLapMetrics(l: EditFields): LapMetrics {
  const d = Math.round(l.manualDurationS ?? 0);
  const dist = l.distanceOverrideM ?? null;
  const avgSpeed = dist !== null && d > 0 ? Math.round((dist / d) * 1000) / 1000 : null;
  return {
    durationS: d,
    elapsedS: d,
    distanceM: dist,
    avgSpeed,
    maxSpeed: null,
    avgPaceSPerKm: pace(avgSpeed),
    maxPaceSPerKm: null,
    avgHr: null,
    maxHr: null,
    avgCadence: null,
    maxCadence: null,
    ascentM: null,
    descentM: null,
    avgPower: null,
    maxPower: null,
    timeInZones: null,
    meanZone: null,
    source: "computed",
  };
}

/** Champs du tableau qu'une correction peut remplacer (la valeur d'avant s'affiche au survol). */
export type EditedField = OverrideKey | "distanceM" | "avgPaceSPerKm";
export type OriginalValues = Partial<Record<EditedField, number | null>>;

/**
 * Applique les valeurs corrigées sur les métriques calculées / de la montre.
 * La FC n'est jamais touchée. Renvoie aussi les valeurs d'avant (survol « montre : … »).
 */
export function applyOverrides(m: LapMetrics, overrides: LapOverrides | null | undefined): { metrics: LapMetrics; original: OriginalValues } {
  const o = cleanOverrides(overrides);
  const original: OriginalValues = {};
  if (!o) return { metrics: m, original };
  const out: LapMetrics = { ...m };
  for (const k of OVERRIDE_KEYS) {
    const v = o[k];
    if (v === undefined) continue;
    original[k] = m[k];
    out[k] = v;
  }
  if (o.maxPaceSPerKm !== undefined) out.maxSpeed = o.maxPaceSPerKm > 0 ? Math.round((1000 / o.maxPaceSPerKm) * 1000) / 1000 : null;
  return { metrics: out, original };
}

// ── Saisie dans les cases ────────────────────────────────────────────────────

/** « 1,25 », « 1.25 », « 1250 m » → mètres. `null` si illisible. */
export function parseKm(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, "").replace(",", ".");
  if (!t) return null;
  const m = /^(\d+(?:\.\d+)?)(km|m)?$/.exec(t);
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.round(m[2] === "m" ? v : v * 1000);
}

/** Allure « 4'05 », « 4:05 », « 4.05 » → s/km. `null` si illisible. */
export function parsePace(text: string): number | null {
  const m = /^\s*(\d{1,2})\s*['’:.,]\s*(\d{1,2})\s*(?:"|\/km)?\s*$/.exec(text) ?? /^\s*(\d{1,2})\s*$/.exec(text);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = m[2] !== undefined ? Number(m[2]) : 0;
  if (sec > 59) return null;
  const v = min * 60 + sec;
  return v > 0 ? v : null;
}

/** Vitesse « 27,1 » km/h → s/km (vélo). */
export function parseSpeedAsPace(text: string): number | null {
  const v = Number(text.trim().replace(",", "."));
  return Number.isFinite(v) && v > 0 ? 3600 / v : null;
}

/** Entier ≥ 0 (« 172 »). */
export function parseCount(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(t)) return null;
  return Math.round(Number(t.replace(",", ".")));
}

/** Allure tapée → distance (la durée reste). */
export function distanceFromPace(durationS: number, paceSPerKm: number): number | null {
  if (!(durationS > 0) || !(paceSPerKm > 0)) return null;
  return Math.round((durationS / paceSPerKm) * 1000);
}

// ── Opérations sur la liste des tours (tours manuels compris) ────────────────

export interface LapBounds {
  startS: number;
  endS: number;
  manualDurationS?: number | null;
}

/** Indice du tour de courbe précédent / suivant (les tours manuels sont sautés). */
export function prevStreamLap(laps: readonly LapBounds[], i: number): number {
  for (let k = i - 1; k >= 0; k--) if (!isManualLap(laps[k])) return k;
  return -1;
}
export function nextStreamLap(laps: readonly LapBounds[], i: number): number {
  for (let k = i + 1; k < laps.length; k++) if (!isManualLap(laps[k])) return k;
  return -1;
}

/**
 * Un tour manuel est posé juste après le tour de courbe qui le précède
 * (start = end = fin de ce tour), ou au début du suivant s'il est en tête.
 */
export function anchorManualLaps<T extends LapBounds>(laps: readonly T[]): T[] {
  const firstStream = laps.find((l) => !isManualLap(l));
  let anchor = firstStream ? firstStream.startS : 0;
  return laps.map((l) => {
    if (!isManualLap(l)) {
      anchor = l.endS;
      return l;
    }
    return l.startS === anchor && l.endS === anchor ? l : { ...l, startS: anchor, endS: anchor };
  });
}

/** Ajoute un tour tapé à la main après le tour `after` (-1 = en tête). */
export function insertManualLap<T extends LapBounds>(laps: readonly T[], after: number, make: (anchorS: number) => T): T[] {
  const at = Math.max(-1, Math.min(laps.length - 1, after));
  const out = [...laps.slice(0, at + 1), make(0), ...laps.slice(at + 1)];
  return anchorManualLaps(out);
}

/**
 * Supprime le tour `i` : un tour manuel disparaît ; un tour de courbe donne son
 * temps au tour précédent (au suivant s'il est le premier). Le dernier tour de
 * courbe ne peut pas être supprimé.
 */
export function deleteLap<T extends LapBounds>(laps: readonly T[], i: number): T[] {
  if (i < 0 || i >= laps.length) return [...laps];
  const l = laps[i];
  if (isManualLap(l)) return anchorManualLaps(laps.filter((_, k) => k !== i));
  const p = prevStreamLap(laps, i);
  if (p >= 0) {
    const out = laps.map((x, k) => (k === p ? { ...x, endS: l.endS } : x)).filter((_, k) => k !== i);
    return anchorManualLaps(out);
  }
  const n = nextStreamLap(laps, i);
  if (n < 0) return [...laps];
  const out = laps.map((x, k) => (k === n ? { ...x, startS: l.startS } : x)).filter((_, k) => k !== i);
  return anchorManualLaps(out);
}

/** Peut-on supprimer ce tour ? (pas le seul tour de courbe) */
export function canDeleteLap(laps: readonly LapBounds[], i: number): boolean {
  if (!laps[i]) return false;
  if (isManualLap(laps[i])) return true;
  return prevStreamLap(laps, i) >= 0 || nextStreamLap(laps, i) >= 0;
}

/** Instant où le chrono a tourné `durS` secondes depuis `startS` (pauses non comptées). */
export function timeAfter(stream: { t: readonly number[]; timer: ReadonlyArray<number | null> | null }, startS: number, durS: number): number {
  const { t } = stream;
  if (!t.length) return startS + durS;
  const w = sampleWeights(t, stream.timer);
  let acc = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] < startS) continue;
    if (acc + w[i] >= durS) return Math.round(t[i] + (durS - acc));
    acc += w[i];
  }
  return Math.round(t[t.length - 1] + 1);
}

/** Instant `durS` secondes de chrono avant `endS`. */
export function timeBefore(stream: { t: readonly number[]; timer: ReadonlyArray<number | null> | null }, endS: number, durS: number): number {
  const { t } = stream;
  if (!t.length) return endS - durS;
  const w = sampleWeights(t, stream.timer);
  let acc = 0;
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i] >= endS) continue;
    if (acc + w[i] >= durS) return Math.round(t[i] + w[i] - (durS - acc));
    acc += w[i];
  }
  return Math.round(t[0]);
}

/**
 * Durée tapée : tour manuel → sa durée ; tour de courbe → sa fin se déplace (le
 * tour suivant suit) ; le dernier tour avance son début. Bornée pour laisser 1 s au voisin.
 */
export function setLapDuration<T extends LapBounds>(
  laps: readonly T[],
  i: number,
  durS: number,
  stream: { t: readonly number[]; timer: ReadonlyArray<number | null> | null },
): T[] {
  const l = laps[i];
  if (!l || !(durS > 0)) return [...laps];
  if (isManualLap(l)) return laps.map((x, k) => (k === i ? { ...x, manualDurationS: Math.min(86400, Math.round(durS)) } : x));
  const n = nextStreamLap(laps, i);
  if (n >= 0) {
    const to = Math.min(laps[n].endS - 1, Math.max(l.startS + 1, timeAfter(stream, l.startS, durS)));
    return anchorManualLaps(laps.map((x, k) => (k === i ? { ...x, endS: to } : k === n ? { ...x, startS: to } : x)));
  }
  const p = prevStreamLap(laps, i);
  if (p < 0) return [...laps];
  const from = Math.max(laps[p].startS + 1, Math.min(l.endS - 1, timeBefore(stream, l.endS, durS)));
  return anchorManualLaps(laps.map((x, k) => (k === p ? { ...x, endS: from } : k === i ? { ...x, startS: from } : x)));
}

/** La durée d'un tour se modifie-t-elle ? (un voisin de courbe, ou tour manuel) */
export function canSetDuration(laps: readonly LapBounds[], i: number): boolean {
  if (!laps[i]) return false;
  return isManualLap(laps[i]) || prevStreamLap(laps, i) >= 0 || nextStreamLap(laps, i) >= 0;
}

// ── Total de la séance quand des valeurs sont corrigées ──────────────────────

/**
 * Ligne « Total » et chiffres clés quand des tours sont corrigés : durée,
 * distance, allure, cadence, dénivelé suivent les tours ; la FC et les zones
 * restent celles de la montre (série complète).
 */
export function totalFromLaps(laps: ReadonlyArray<{ metrics: LapMetrics }>, streamTotal: LapMetrics | null): LapMetrics | null {
  if (!laps.length) return streamTotal;
  const ms = laps.map((l) => l.metrics);
  const sum = (f: (m: LapMetrics) => number | null) => {
    const vs = ms.map(f).filter((v): v is number => v !== null && Number.isFinite(v));
    return vs.length ? vs.reduce((a, b) => a + b, 0) : null;
  };
  const weighted = (f: (m: LapMetrics) => number | null) => {
    let s = 0;
    let w = 0;
    for (const m of ms) {
      const v = f(m);
      if (v === null || !Number.isFinite(v) || !(m.durationS > 0)) continue;
      s += v * m.durationS;
      w += m.durationS;
    }
    return w > 0 ? Math.round(s / w) : null;
  };
  const max = (f: (m: LapMetrics) => number | null) => {
    const vs = ms.map(f).filter((v): v is number => v !== null && Number.isFinite(v));
    return vs.length ? Math.max(...vs) : null;
  };
  const durationS = sum((m) => m.durationS) ?? 0;
  const distanceM = sum((m) => m.distanceM);
  const avgSpeed = distanceM !== null && durationS > 0 ? Math.round((distanceM / durationS) * 1000) / 1000 : null;
  const maxSpeed = max((m) => m.maxSpeed);
  return {
    durationS,
    elapsedS: sum((m) => m.elapsedS) ?? durationS,
    distanceM: distanceM !== null ? round1(distanceM) : null,
    avgSpeed,
    maxSpeed,
    avgPaceSPerKm: pace(avgSpeed),
    maxPaceSPerKm: pace(maxSpeed),
    avgHr: streamTotal?.avgHr ?? null,
    maxHr: streamTotal?.maxHr ?? null,
    avgCadence: weighted((m) => m.avgCadence),
    maxCadence: max((m) => m.maxCadence),
    ascentM: sum((m) => m.ascentM),
    descentM: sum((m) => m.descentM),
    avgPower: weighted((m) => m.avgPower),
    maxPower: max((m) => m.maxPower),
    timeInZones: streamTotal?.timeInZones ?? null,
    meanZone: streamTotal?.meanZone ?? null,
    source: "computed",
  };
}

// ── Une case du tableau modifiée ─────────────────────────────────────────────

export interface EditableDetail extends LapBounds {
  name: string | null;
  distanceOverrideM: number | null;
  lapType?: LapPhase | null;
  overrides?: LapOverrides | null;
}

export type CellEdit =
  | { field: "name"; value: string }
  | { field: "phase"; value: LapPhase | null }
  /** Secondes de chrono. */
  | { field: "duration"; value: number }
  /** Mètres ; `null` = distance de la montre. */
  | { field: "distance"; value: number | null }
  /** s/km ; la distance se recalcule sur la durée affichée du tour. `null` = distance de la montre. */
  | { field: "pace"; value: number | null; durationS: number }
  | { field: OverrideKey; value: number | null };

/**
 * Applique la saisie d'une case sur le tour `i` (jamais la FC). Les voisins
 * suivent quand la durée change (la limite bouge sur la courbe).
 */
export function applyCellEdit<T extends EditableDetail>(
  laps: readonly T[],
  i: number,
  edit: CellEdit,
  stream: { t: readonly number[]; timer: ReadonlyArray<number | null> | null },
): T[] {
  const l = laps[i];
  if (!l) return [...laps];
  const patch = (p: Partial<T>) => laps.map((x, k) => (k === i ? { ...x, ...p } : x));
  switch (edit.field) {
    case "name":
      return patch({ name: edit.value.trim() || null } as Partial<T>);
    case "phase":
      return patch({ lapType: edit.value } as Partial<T>);
    case "duration":
      return setLapDuration(laps, i, edit.value, stream);
    case "distance":
      return patch({ distanceOverrideM: edit.value === null ? null : Math.max(0, Math.round(edit.value)) } as Partial<T>);
    case "pace": {
      if (edit.value === null) return patch({ distanceOverrideM: null } as Partial<T>);
      const d = distanceFromPace(edit.durationS, edit.value);
      return d === null ? [...laps] : patch({ distanceOverrideM: d } as Partial<T>);
    }
    default:
      return patch({ overrides: setOverride(l.overrides, edit.field, edit.value) } as Partial<T>);
  }
}

// ── Texte tapé → modification (même règle à l'ordinateur et au téléphone) ────

export type TableField = "name" | "duration" | "distance" | "pace" | "maxPace" | "avgCadence" | "maxCadence" | "ascent" | "descent";

const OVERRIDE_OF: Partial<Record<TableField, OverrideKey>> = {
  avgCadence: "avgCadence", maxCadence: "maxCadence", ascent: "ascentM", descent: "descentM",
};

/** Lecture d'une durée « 4:05 », « 1:02:05 », « 90 ». */
function readClock(text: string): number | null {
  const parts = text.trim().split(":").map((p) => p.trim());
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  if (parts.slice(1).some((p) => Number(p) > 59)) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

/**
 * Texte tapé dans une case → modification à appliquer. Case vidée = retour à la
 * valeur de la montre (sauf nom et durée). `null` si illisible.
 */
export function cellEditFromText(field: TableField, text: string, ctx: { speed: boolean; durationS: number }): CellEdit | null {
  const t = text.trim();
  if (field === "name") return { field: "name", value: t };
  if (field === "duration") {
    const v = readClock(t);
    return v !== null && v > 0 ? { field: "duration", value: v } : null;
  }
  if (field === "distance") {
    if (!t) return { field: "distance", value: null };
    const v = parseKm(t);
    return v === null ? null : { field: "distance", value: v };
  }
  if (field === "pace" || field === "maxPace") {
    const v = t ? (ctx.speed ? parseSpeedAsPace(t) : parsePace(t)) : null;
    if (t && v === null) return null;
    return field === "pace" ? { field: "pace", value: v, durationS: ctx.durationS } : { field: "maxPaceSPerKm", value: v };
  }
  const key = OVERRIDE_OF[field];
  if (!key) return null;
  if (!t) return { field: key, value: null };
  const v = parseCount(t);
  return v === null ? null : { field: key, value: v };
}

/**
 * « Tours modifiés par ton coach » (choix d'Hugo du 16/11/2026, mention discrète, sans notification) :
 * les tours enregistrés en dernier l'ont été par quelqu'un d'autre que l'athlète (coach référent ou co-coach,
 * seuls autres à pouvoir les modifier).
 */
export function lapsEditedByCoach(d: { lapsEdited: boolean; lapsEditedBy: string | null; activity: { athleteId: string } }): boolean {
  return d.lapsEdited && !!d.lapsEditedBy && d.lapsEditedBy !== d.activity.athleteId;
}
