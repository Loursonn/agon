/**
 * Alertes wellness par comparaison à l'habitude de l'athlète.
 *
 * Un athlète qui dort mal « 3/5 » tous les jours n'a pas de problème : c'est son
 * habitude. Un athlète habituellement à 4,8 qui tombe à 3 vient de changer. Un
 * seuil fixe ne voit ni l'un ni l'autre — on compare donc chaque saisie à la
 * moyenne et à la dispersion des 28 jours précédents (écart-type, « z-score »).
 *
 * Convention de signe : tous les items sont orientés « 5 = bon » (cf.
 * `WELL_ITEMS` dans src/lib/wellness.ts — « Récupération » 1 épuisé → 5 très
 * reposé, « Fraîcheur musculaire » 1 DOMS intenses → 5 aucune douleur). Un
 * z négatif veut donc toujours dire « moins bien que d'habitude », sans
 * inversion à faire.
 */
import { WELL_ITEMS, calcScore } from "@/lib/wellness";
import type { WellnessData } from "@/features/shared/types/athlete";

// ── Réglages ─────────────────────────────────────────────────────────────────

/** Fenêtre d'habitude, en jours avant la saisie évaluée (celle-ci exclue). */
export const BASELINE_DAYS = 28;

/** Sous ce nombre de saisies, l'habitude n'est pas fiable : aucune alerte. */
export const MIN_BASELINE_ENTRIES = 7;

/**
 * Plancher d'écart-type. Un athlète qui a toujours répondu « 4 » a un écart-type
 * de 0 : le moindre « 3 » donnerait un z infini. Le plancher borne la sensibilité.
 */
export const SD_FLOOR_ITEM = 0.5;
export const SD_FLOOR_SCORE = 5;

/** Seuils de z. Négatif = moins bien que d'habitude. */
export const Z_ITEM_VIGILANCE = -1.5;
export const Z_ITEM_ALERTE = -2;
export const Z_SCORE_VIGILANCE = -1;
export const Z_SCORE_ALERTE = -1.5;

// ── Types ────────────────────────────────────────────────────────────────────

export type WellnessItemKey = "fatigue" | "sommeil" | "stress" | "energie" | "doms";

export const ITEM_KEYS: WellnessItemKey[] = ["fatigue", "sommeil", "stress", "energie", "doms"];

/** Libellé vu par l'athlète lors de la saisie — on garde le même mot côté coach. */
export const ITEM_LABEL: Record<WellnessItemKey, string> = Object.fromEntries(
  WELL_ITEMS.map((i) => [i.k, i.q]),
) as Record<WellnessItemKey, string>;

export type AlertLevel = "none" | "vigilance" | "alerte";

export interface WellnessDeviation {
  /** `score` pour le score global /100, sinon l'item. */
  item: WellnessItemKey | "score";
  label: string;
  value: number;
  /** Moyenne des 28 jours précédents. */
  mean: number;
  sd: number;
  z: number;
  level: "vigilance" | "alerte";
}

export interface WellnessAssessment {
  level: AlertLevel;
  /** Date de la saisie évaluée, ou null si aucune saisie exploitable. */
  date: string | null;
  /** Moins de `MIN_BASELINE_ENTRIES` saisies dans la fenêtre : habitude en construction. */
  baselineBuilding: boolean;
  baselineCount: number;
  /** Écarts retenus, le plus grave d'abord. Vide si `level === "none"`. */
  deviations: WellnessDeviation[];
  /** Vrai si l'alerte tient au score global bas sur deux saisies de suite. */
  twoConsecutive: boolean;
}

// ── Statistiques ─────────────────────────────────────────────────────────────

/** Moyenne et écart-type d'échantillon (n−1). `sd` vaut 0 si moins de 2 valeurs. */
export function meanSd(values: number[]): { mean: number; sd: number; n: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, sd: 0, n: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { mean, sd: 0, n };
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return { mean, sd: Math.sqrt(variance), n };
}

/** z = (valeur − moyenne) / max(écart-type, plancher). */
export function zScore(value: number, mean: number, sd: number, floor: number): number {
  return (value - mean) / Math.max(sd, floor);
}

// ── Dates ────────────────────────────────────────────────────────────────────

/** Décale une date ISO (yyyy-MM-dd) de `days`, sans passer par le fuseau local. */
export function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Nombre de jours entre deux dates ISO (b − a). */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

// ── Évaluation ───────────────────────────────────────────────────────────────

/** Dates de saisie exploitables, les plus récentes d'abord. */
function sortedDates(history: Record<string, WellnessData>): string[] {
  return Object.keys(history ?? {})
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && history[d])
    .sort()
    .reverse();
}

function numeric(w: WellnessData | undefined, key: WellnessItemKey): number | null {
  const v = w?.[key];
  return typeof v === "number" && isFinite(v) ? v : null;
}

/**
 * Évalue une saisie contre les `BASELINE_DAYS` jours qui la précèdent.
 * Ne regarde que le niveau, sans la règle « deux saisies de suite ».
 */
function assessEntry(
  history: Record<string, WellnessData>,
  date: string,
): { level: AlertLevel; baselineCount: number; deviations: WellnessDeviation[]; scoreZ: number | null } {
  const from = shiftIso(date, -BASELINE_DAYS);
  // Fenêtre [date − 28 j ; date − 1 j] : la saisie évaluée n'entre pas dans sa
  // propre habitude, sinon elle tirerait la moyenne vers elle.
  const window = sortedDates(history).filter((d) => d < date && d >= from);
  const baselineCount = window.length;

  if (baselineCount < MIN_BASELINE_ENTRIES) {
    return { level: "none", baselineCount, deviations: [], scoreZ: null };
  }

  const entry = history[date];
  const deviations: WellnessDeviation[] = [];

  for (const key of ITEM_KEYS) {
    const value = numeric(entry, key);
    if (value === null) continue;
    const past = window.map((d) => numeric(history[d], key)).filter((v): v is number => v !== null);
    if (past.length < MIN_BASELINE_ENTRIES) continue;
    const { mean, sd } = meanSd(past);
    const z = zScore(value, mean, sd, SD_FLOOR_ITEM);
    if (z <= Z_ITEM_ALERTE || z <= Z_ITEM_VIGILANCE) {
      deviations.push({
        item: key, label: ITEM_LABEL[key], value, mean, sd, z,
        level: z <= Z_ITEM_ALERTE ? "alerte" : "vigilance",
      });
    }
  }

  // Score global : capte une baisse diffuse que chaque item pris seul ne voit pas.
  const scoreValue = calcScore(entry);
  const pastScores = window.map((d) => calcScore(history[d]));
  const { mean: scoreMean, sd: scoreSd } = meanSd(pastScores);
  const scoreZ = zScore(scoreValue, scoreMean, scoreSd, SD_FLOOR_SCORE);
  if (scoreZ <= Z_SCORE_VIGILANCE) {
    deviations.push({
      item: "score", label: "Score global", value: scoreValue, mean: scoreMean, sd: scoreSd, z: scoreZ,
      level: scoreZ <= Z_SCORE_ALERTE ? "alerte" : "vigilance",
    });
  }

  deviations.sort((a, b) => a.z - b.z);
  const level: AlertLevel = deviations.some((d) => d.level === "alerte")
    ? "alerte"
    : deviations.length > 0 ? "vigilance" : "none";

  return { level, baselineCount, deviations, scoreZ };
}

/**
 * Évalue la dernière saisie d'un athlète.
 *
 * `today` est la date de référence (yyyy-MM-dd). Une saisie plus vieille qu'hier
 * ne dit rien de l'état actuel : on ne la transforme pas en alerte.
 */
export function assessWellness(
  history: Record<string, WellnessData> | null | undefined,
  today: string,
): WellnessAssessment {
  const empty: WellnessAssessment = {
    level: "none", date: null, baselineBuilding: false,
    baselineCount: 0, deviations: [], twoConsecutive: false,
  };
  if (!history) return empty;

  const dates = sortedDates(history);
  const last = dates[0];
  if (!last) return empty;

  const age = daysBetween(last, today);
  if (age < 0 || age > 1) return { ...empty, date: last };

  const main = assessEntry(history, last);
  const baselineBuilding = main.baselineCount < MIN_BASELINE_ENTRIES;

  // Deux saisies de suite sous le seuil de vigilance globale : la baisse n'est
  // plus un accident de la veille, elle s'installe.
  let twoConsecutive = false;
  if (!baselineBuilding && main.scoreZ !== null && main.scoreZ <= Z_SCORE_VIGILANCE) {
    const prev = dates[1];
    if (prev) {
      const prevAssess = assessEntry(history, prev);
      twoConsecutive =
        prevAssess.scoreZ !== null && prevAssess.scoreZ <= Z_SCORE_VIGILANCE;
    }
  }

  const level: AlertLevel =
    main.level === "alerte" || (twoConsecutive && main.level !== "none")
      ? "alerte"
      : main.level;

  return {
    level,
    date: last,
    baselineBuilding,
    baselineCount: main.baselineCount,
    deviations: main.deviations,
    twoConsecutive,
  };
}

// ── Formatage ────────────────────────────────────────────────────────────────

/** Nombre à une décimale, virgule française, sans « ,0 » inutile. */
export function fmtFr(n: number): string {
  const r = Math.round(n * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace(".", ",");
}

/**
 * Les courbatures se lisent à l'envers de l'intitulé : l'athlète note sa
 * « Fraîcheur musculaire », donc 2/5 veut dire beaucoup de courbatures. Le coach
 * qui survole sa liste d'alertes n'a pas à faire cette conversion de tête.
 */
export function domsReading(value: number): string {
  if (value <= 1) return "courbatures intenses";
  if (value <= 2) return "courbatures marquées";
  if (value <= 3) return "courbatures modérées";
  if (value <= 4) return "courbatures légères";
  return "aucune courbature";
}

/**
 * « Fraîcheur musculaire 2/5 — courbatures marquées (habitude 4,1) »,
 * « Score global 48/100 (habitude 72) ».
 */
export function formatDeviation(d: WellnessDeviation): string {
  const scale = d.item === "score" ? "/100" : "/5";
  const reading = d.item === "doms" ? ` — ${domsReading(d.value)}` : "";
  return `${d.label} ${fmtFr(d.value)}${scale}${reading} (habitude ${fmtFr(d.mean)})`;
}

/** Résumé d'un athlète en une ligne : les deux écarts les plus marqués. */
export function formatAssessment(a: WellnessAssessment, max = 2): string {
  if (a.baselineBuilding) return "Habitude en construction";
  return a.deviations.slice(0, max).map(formatDeviation).join(" · ");
}
