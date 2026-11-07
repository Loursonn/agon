import { C } from "@/lib/theme";
import { readWellnessItems, scoreOfRaw, wellnessBand, wellnessScore, type WellnessItems, type WellnessTone } from "@shared/domain/wellness";

export const WELL_ITEMS = [
  { k: "fatigue", q: "Récupération",        lo: "Épuisé",       hi: "Très reposé",  inv: false },
  { k: "sommeil", q: "Qualité du sommeil",   lo: "Très mauvais", hi: "Excellent",    inv: false },
  { k: "stress",  q: "Sérénité / mental",    lo: "Très stressé", hi: "Très détendu", inv: false },
  { k: "energie", q: "Niveau d'énergie",     lo: "Très bas",     hi: "Très élevé",   inv: false },
  { k: "doms",    q: "Fraîcheur musculaire", lo: "DOMS intenses", hi: "Aucune douleur", inv: false },
] as const;

/**
 * Score et paliers : délèguent au domaine (`@shared/domain/wellness`), seul
 * calcul partagé par l'athlète, le coach, le staff et l'assistant IA.
 * Ces exports restent pour les appelants historiques.
 */

/** Couleur d'un palier : vert (Optimal, Bon), orange (Modéré), rouge (Fatigué, Surmenage). */
export const TONE_COLOR: Record<WellnessTone, string> = { good: C.g, warn: C.o, bad: C.r };

/** Score 0-100 recalculé depuis les 5 notes ; null si une note manque (afficher « — », jamais 0). */
export const calcScore = (w: unknown): number | null => scoreOfRaw(w);

/** Couleur d'un score ; gris si pas de score. */
export const wellnessColor = (score: number | null | undefined): string => {
  const b = wellnessBand(score);
  return b ? TONE_COLOR[b.tone] : C.tx3;
};

/** Palier d'un score (5 paliers 80 / 65 / 50 / 35) ; « — » si pas de score. */
export const getReco = (score: number | null | undefined) => {
  const b = wellnessBand(score);
  if (!b) return { key: null, label: "—", desc: "Pas de saisie", c: C.tx3, tone: null };
  return { key: b.key, label: b.label, desc: b.advice, c: TONE_COLOR[b.tone], tone: b.tone };
};

/**
 * Ce qu'un écran affiche d'une saisie, quel que soit son format (`WellnessData`
 * de l'app, `WellnessDay` des Retours, `WellnessEntry` du domaine) : notes 1-5
 * ou null, score recalculé (null → « — »), palier, réponse « blessé/malade ».
 */
export function wellnessView(raw: unknown): {
  items: WellnessItems;
  score: number | null;
  reco: ReturnType<typeof getReco>;
  injuryNote: string | null;
} {
  const items = readWellnessItems(raw);
  const score = wellnessScore({ items });
  const o = (raw ?? {}) as { injuryNote?: unknown; injComment?: unknown };
  const note = [o.injuryNote, o.injComment].find((v): v is string => typeof v === "string" && v.trim() !== "");
  return { items, score, reco: getReco(score), injuryNote: note?.trim() ?? null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getAlerts = (w: any): string[] => {
  const a: string[] = [];
  if (w?.fatigue <= 2) a.push("Récupération faible: surveiller la technique");
  if (w?.doms    <= 2) a.push("DOMS intenses: adapter les muscles cibles");
  if (w?.stress  <= 2) a.push("Stress élevé: séance technique recommandée");
  if (w?.energie <= 2) a.push("Énergie faible: réduire le volume");
  return a;
};
