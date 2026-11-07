/**
 * Références de performance et records — calculs partagés coach / athlète / IA.
 *
 * Pur, sans dépendance : importé par le front (`@shared/domain/performance`)
 * et par les Edge Functions.
 *
 * - Noms de métriques : UNE orthographe par référence. Le module énergie lit
 *   `refs.FCmax`, `refs.VMA`… : une FC max saisie « FC Max » par l'athlète
 *   n'était jamais utilisée (2026-11-08). La même table de correspondance
 *   existe côté SQL (`normalize_metric_name`, migration 20261108120000).
 * - 1RM : une formule (Epley ; 1 répétition = la charge) et un arrondi à
 *   0,5 kg partout (sauf la grille Hyrox, qui garde sa règle propre).
 */

/** Références physiologiques reconnues (ordre d'affichage). */
export const REFERENCE_KEYS = ["VMA", "Vmax", "VC", "VO2max", "PMA", "FTP", "FCmax", "FCrepos", "FCseuil"] as const;
export type ReferenceKey = (typeof REFERENCE_KEYS)[number];

/** Bornes de zones FC personnalisées (lues par le module énergie). */
export const FC_ZONE_KEYS = [
  "FCzone_Z0_min",
  "FCzone_Z1_max",
  "FCzone_Z2_max",
  "FCzone_Z3_max",
  "FCzone_Z4_max",
  "FCzone_Z5_max",
] as const;
export type FcZoneKey = (typeof FC_ZONE_KEYS)[number];

export const REFERENCE_UNITS: Record<ReferenceKey, string> = {
  VMA: "km/h",
  Vmax: "km/h",
  VC: "km/h",
  VO2max: "mL/kg/min",
  PMA: "W",
  FTP: "W",
  FCmax: "bpm",
  FCrepos: "bpm",
  FCseuil: "bpm",
};

/** Forme de comparaison : minuscules, sans accents, espaces, tirets, points ni soulignés. */
function squash(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/₂/g, "2")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s_.-]+/g, "");
}

const ALIASES: Record<string, string> = {
  vitessecritique: "VC",
  vitessemaximaleaerobie: "VMA",
  fcmaximale: "FCmax",
  frequencecardiaquemaximale: "FCmax",
  fcrep: "FCrepos",
  frequencecardiaquederepos: "FCrepos",
  fcderepos: "FCrepos",
};
for (const k of [...REFERENCE_KEYS, ...FC_ZONE_KEYS]) ALIASES[squash(k)] = k;

/**
 * Nom canonique d'une métrique (« FC Max » → « FCmax », « Vitesse Critique »
 * → « VC », « fczone z1 max » → « FCzone_Z1_max »), insensible à la casse,
 * aux accents et aux espaces. Un nom inconnu (donnée personnalisée, temps sur
 * une distance…) est gardé tel quel, sans les espaces autour.
 */
export function normalizeMetricName(raw: string): string {
  const trimmed = (raw ?? "").trim();
  return ALIASES[squash(trimmed)] ?? trimmed;
}

export function isReferenceKey(name: string): name is ReferenceKey {
  return (REFERENCE_KEYS as readonly string[]).includes(name);
}

export function isFcZoneKey(name: string): name is FcZoneKey {
  return (FC_ZONE_KEYS as readonly string[]).includes(name);
}

/** Arrondi d'une charge au pas des disques (0,5 kg par défaut). */
export function roundLoad(kg: number, step = 0.5): number {
  if (!Number.isFinite(kg) || !(step > 0)) return 0;
  return Math.round(kg / step) * step;
}

/**
 * 1RM estimé (Epley : kg × (1 + reps / 30)), arrondi à 0,5 kg.
 * 1 répétition = la charge elle-même ; entrée invalide → 0.
 */
export function estimateOneRm(kg: number, reps: number): number {
  if (!(kg > 0) || !(reps > 0)) return 0;
  if (reps === 1) return roundLoad(kg);
  return roundLoad(kg * (1 + reps / 30));
}

/** Charge correspondant à un % du 1RM, arrondie à 0,5 kg ; sans 1RM ou % → null. */
export function loadFromPctRm(oneRm: number | null | undefined, pct: number | null | undefined): number | null {
  if (oneRm == null || pct == null || !(oneRm > 0) || !(pct > 0)) return null;
  return roundLoad((oneRm * pct) / 100);
}

// ── Records ──────────────────────────────────────────────────────────────────

/** Ce qu'il faut d'un exercice pour savoir sous quel record il compte. */
export interface RecordRefSource {
  rm_ref?: string | null;
  name?: string | null;
  exercise_name?: string | null;
  exType?: string | null;
  isFlexibility?: boolean | null;
}

const STRENGTH_TYPES = new Set(["muscu", "halterophilie"]);

/**
 * Référence de record d'un exercice : `rm_ref` (plusieurs exercices peuvent
 * partager un même record), sinon le nom de l'exercice. Les exercices qui ne
 * sont pas de la force (mobilité, plio…) n'ont pas de record.
 */
export function recordRefOf(ex: RecordRefSource): string | null {
  const explicit = ex.rm_ref?.trim();
  if (explicit) return explicit;
  if (ex.isFlexibility) return null;
  if (ex.exType && !STRENGTH_TYPES.has(ex.exType)) return null;
  const name = (ex.name ?? ex.exercise_name ?? "").trim();
  return name || null;
}

/** Une série réalisée, rattachée à sa référence de record. */
export interface RecordSet {
  ref: string;
  kg: number | null | undefined;
  reps: number | null | undefined;
  /** Absent = considérée comme faite. */
  done?: boolean;
}

export interface RecordCandidate {
  ref: string;
  /** 1RM estimé, arrondi 0,5 kg. */
  kg: number;
  sourceKg: number;
  sourceReps: number;
}

/**
 * Nouveaux records d'une séance : par référence, la meilleure série (1RM
 * estimé) si elle dépasse strictement le record actuel.
 */
export function newRecordsFromSets(sets: RecordSet[], currentBest: Record<string, number>): RecordCandidate[] {
  const best = new Map<string, RecordCandidate>();
  for (const s of sets) {
    if (s.done === false || !s.ref) continue;
    const kg = Number(s.kg);
    const reps = Number(s.reps);
    const est = estimateOneRm(kg, reps);
    if (est <= 0) continue;
    const prev = best.get(s.ref);
    if (!prev || est > prev.kg) best.set(s.ref, { ref: s.ref, kg: est, sourceKg: kg, sourceReps: reps });
  }
  return [...best.values()].filter((c) => c.kg > (currentBest[c.ref] ?? 0));
}
