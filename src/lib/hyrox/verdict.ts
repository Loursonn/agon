/**
 * Verdict d'une course HYROX (lot 6, maquette validée par Hugo le 16/11/2026) :
 * trois blocs en tête de l'analyse et sur la carte à partager.
 * - Niveau : « top X % » de toute la catégorie sur le chrono, palier du badge,
 *   source et taille de l'échantillon.
 * - Profil : phrase par familles d'effort, points forts et freins (rang par station).
 * - Marge : chrono possible = somme des leviers de la course (`raceStrategy`).
 *
 * Règles d'honnêteté (canvas du lot 6) : chaque phrase vient d'un chiffre
 * calculé ; « top X % » arrondi vers le haut ; pas de référence → pas de rang ;
 * « possible » n'est pas une prédiction ; un frein est toujours nommé.
 * Pur et testé.
 */
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { POSITION_BRACKET, percentile, type RefLookup } from "./calc";
import { CATEGORY_LABEL, categorySex, raceCategory, type CategorySex } from "./categories";
import { effortProfile, type EffortAxis, type EffortAxisKey } from "./effortProfile";
import type { StrategyResult } from "./objective/strategy";
import type { ObjectiveState } from "./objective/vsObjective";

// ── Niveau ───────────────────────────────────────────────────────────────────

export type VerdictTier = "elite" | "tres_haut" | "avance" | "confirme" | "progression";

/** Paliers du badge (Q1 du lot 6, validée par Hugo le 16/11/2026). */
export const TIERS: ReadonlyArray<{ tier: VerdictTier; maxPct: number }> = [
  { tier: "elite", maxPct: 1 },
  { tier: "tres_haut", maxPct: 5 },
  { tier: "avance", maxPct: 25 },
  { tier: "confirme", maxPct: 50 },
  { tier: "progression", maxPct: 100 },
];

export function tierOf(topPct: number): VerdictTier {
  return (TIERS.find((t) => topPct <= t.maxPct) ?? TIERS[TIERS.length - 1]).tier;
}

const TIER_LABEL: Record<VerdictTier, { f: string; m: string }> = {
  elite: { f: "Élite", m: "Élite" },
  tres_haut: { f: "Très haut niveau", m: "Très haut niveau" },
  avance: { f: "Avancée", m: "Avancé" },
  confirme: { f: "Confirmée", m: "Confirmé" },
  progression: { f: "En progression", m: "En progression" },
};

export function tierLabel(tier: VerdictTier, sex: CategorySex): string {
  return TIER_LABEL[tier][sex === "women" ? "f" : "m"];
}

/** « pyrox S7-S9 (n=145698) » → « saisons 7 à 9 (pyrox) » ; autre source : telle quelle, sans le n. */
export function sourceLabel(source: string): string {
  const base = source.replace(/\s*\(n=\d+\)\s*$/, "").trim();
  const m = /^(\S+)\s+S(\d+)-S(\d+)$/.exec(base);
  return m ? `saisons ${m[2]} à ${m[3]} (${m[1]})` : base;
}

export interface VerdictLevel {
  /** Position sur le chrono dans toute la catégorie, arrondie vers le haut (1-99). */
  topPct: number;
  tier: VerdictTier;
  tierLabel: string;
  categoryLabel: string;
  sampleSize: number | null;
  /** « saisons 7 à 9 (pyrox) ». */
  source: string;
}

// ── Profil ───────────────────────────────────────────────────────────────────

export type EffortFamily = "machines" | "charges" | "repetitions" | "course";

/** Familles d'effort (la Roxzone n'en fait partie d'aucune : ce sont des transitions). */
export const FAMILIES: Record<EffortFamily, readonly EffortAxisKey[]> = {
  machines: ["ski", "row"],
  charges: ["sled_push", "sled_pull", "farmers"],
  repetitions: ["bbj", "lunges", "wall_balls"],
  course: ["run"],
};

const FAMILY_TEXT: Record<EffortFamily, { title: { f: string; m: string }; noun: string }> = {
  machines: { title: { f: "Profil ergo", m: "Profil ergo" }, noun: "les machines" },
  charges: { title: { f: "Profil force", m: "Profil force" }, noun: "les charges lourdes" },
  repetitions: { title: { f: "Profil endurance", m: "Profil endurance" }, noun: "les répétitions" },
  course: { title: { f: "Profil coureuse", m: "Profil coureur" }, noun: "la course" },
};

/** Écart de rang moyen entre la meilleure et la moins bonne famille pour parler de frein (même seuil que la typologie). */
export const PROFILE_GAP = 20;
/** Un point fort est dans le top 25 % ; un frein au-delà de la médiane. */
export const STRENGTH_MAX_PCT = 25;
export const BRAKE_MIN_PCT = 50;

/** Libellés courts du verdict et de la carte (tiennent dans une demi-colonne de téléphone). */
export const VERDICT_LABEL: Record<EffortAxisKey, string> = {
  run: "Course", ski: "SkiErg", sled_push: "Sled push", sled_pull: "Sled pull", bbj: "Burpees",
  row: "Rameur", farmers: "Farmers", lunges: "Fentes", wall_balls: "Wall balls", roxzone: "Roxzone",
};

export interface VerdictAxis {
  key: EffortAxisKey;
  label: string;
  topPct: number;
}

export interface VerdictProfile {
  /** « Profil ergo : très forte sur les machines, freinée par les charges lourdes. » */
  sentence: string | null;
  /** Jusqu'à 3 axes du top 25 % ; à défaut le meilleur axe. */
  strengths: VerdictAxis[];
  /** Jusqu'à 2 axes au-delà de la médiane ; à défaut le moins bon axe. Toujours au moins un. */
  brakes: VerdictAxis[];
}

const familyMean = (axes: readonly EffortAxis[], f: EffortFamily): number | null => {
  const v = axes.filter((a) => FAMILIES[f].includes(a.key) && a.pct != null).map((a) => a.pct as number);
  return v.length ? v.reduce((n, x) => n + x, 0) / v.length : null;
};

export function profileSentence(axes: readonly EffortAxis[], sex: CategorySex): string | null {
  const fams = (Object.keys(FAMILIES) as EffortFamily[])
    .map((f) => ({ f, mean: familyMean(axes, f) }))
    .filter((x): x is { f: EffortFamily; mean: number } => x.mean != null)
    .sort((a, b) => a.mean - b.mean);
  if (fams.length < 2) return null;
  const fem = sex === "women";
  const best = fams[0];
  const worst = fams[fams.length - 1];
  if (worst.mean - best.mean < PROFILE_GAP) {
    return `Profil équilibré : moins de ${PROFILE_GAP} points d'écart de rang entre ${fams.map((x) => FAMILY_TEXT[x.f].noun).join(", ")}.`;
  }
  const strong = fem ? "forte" : "fort";
  const how = best.mean <= 5 ? `très ${strong} sur` : best.mean <= STRENGTH_MAX_PCT ? `${strong} sur` : "plus à l'aise sur";
  const title = FAMILY_TEXT[best.f].title[fem ? "f" : "m"];
  return `${title} : ${how} ${FAMILY_TEXT[best.f].noun}, ${fem ? "freinée" : "freiné"} par ${FAMILY_TEXT[worst.f].noun}.`;
}

export function verdictProfile(axes: readonly EffortAxis[], sex: CategorySex): VerdictProfile | null {
  const ranked = axes
    .filter((a) => a.pct != null)
    .map((a) => ({ key: a.key, label: VERDICT_LABEL[a.key] ?? a.label, topPct: a.pct as number }))
    .sort((a, b) => a.topPct - b.topPct);
  if (ranked.length < 2) return null;
  let strengths = ranked.filter((a) => a.topPct <= STRENGTH_MAX_PCT).slice(0, 3);
  if (!strengths.length) strengths = [ranked[0]];
  const rest = ranked.filter((a) => !strengths.some((s) => s.key === a.key)).reverse();
  let brakes = rest.filter((a) => a.topPct > BRAKE_MIN_PCT).slice(0, 2);
  if (!brakes.length) {
    // Règle 5 : un frein est toujours nommé ; si tout est fort, le moins bon des points forts cède sa place.
    if (rest.length) brakes = [rest[0]];
    else { brakes = [strengths[strengths.length - 1]]; strengths = strengths.slice(0, -1); }
  }
  return { sentence: profileSentence(axes, sex), strengths, brakes };
}

/** « top 1 % » ou « top 1 à 5 % » pour un groupe d'axes. */
export function topRange(axes: readonly VerdictAxis[]): string {
  if (!axes.length) return "";
  const lo = Math.min(...axes.map((a) => a.topPct));
  const hi = Math.max(...axes.map((a) => a.topPct));
  return lo === hi ? `top ${lo} %` : `top ${lo} à ${hi} %`;
}

// ── Verdict ──────────────────────────────────────────────────────────────────

export interface VerdictMarginLever {
  label: string;
  gainS: number;
}

export interface RaceVerdict {
  categoryLabel: string;
  sex: CategorySex;
  /** Null : simulation, ou pas de référence pour la catégorie (règle 3). */
  level: VerdictLevel | null;
  place: { rank: number; of: number } | null;
  objective: { targetS: number; deltaS: number; state: ObjectiveState } | null;
  profile: VerdictProfile | null;
  /** Axes du radar (rang arrondi vers le haut), pour la carte. */
  axes: EffortAxis[];
  margin: { possibleS: number; gainS: number; levers: VerdictMarginLever[] } | null;
}

export function raceVerdict(input: {
  race: HyroxResult;
  refs: RefLookup;
  objective: { targetS: number; deltaS: number; state: ObjectiveState } | null;
  strategy: StrategyResult | null;
}): RaceVerdict {
  const { race, refs } = input;
  const cat = raceCategory(race);
  const sex = categorySex(cat);
  const categoryLabel = CATEGORY_LABEL[cat] ?? cat;
  // Rangs : seulement sur un résultat officiel (une simulation ne se classe pas).
  const ranked = race.is_official && race.status === "finished";
  const totalRef = ranked ? refs(cat, "total", POSITION_BRACKET) : undefined;
  const topPct = totalRef ? percentile(race.total_s, totalRef, "up") : null;
  const level: VerdictLevel | null = totalRef && topPct != null
    ? {
        topPct, tier: tierOf(topPct), tierLabel: tierLabel(tierOf(topPct), sex), categoryLabel,
        sampleSize: totalRef.sample_size ?? null, source: sourceLabel(totalRef.source ?? ""),
      }
    : null;
  const axes = ranked ? effortProfile(race, refs, null, "up") : [];
  const levers = (input.strategy?.levers ?? []).filter((l) => l.gainS > 0).sort((a, b) => b.gainS - a.gainS);
  const margin = input.strategy && levers.length
    ? { possibleS: input.strategy.possibleS, gainS: input.strategy.currentS - input.strategy.possibleS, levers: levers.map((l) => ({ label: l.label, gainS: l.gainS })) }
    : null;
  return {
    categoryLabel,
    sex,
    level,
    place: race.rank_overall != null && race.participants_overall ? { rank: race.rank_overall, of: race.participants_overall } : null,
    objective: input.objective,
    profile: ranked ? verdictProfile(axes, sex) : null,
    axes,
    margin,
  };
}
