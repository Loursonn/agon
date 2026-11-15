/**
 * No reps aux wall balls d'une course HYROX (demande d'Hugo, 16/11/2026) :
 * « cible ratée » et « pas sous la parallèle », saisis à la main (les
 * résultats officiels ne les donnent pas). Non renseigné = « — », jamais 0.
 * Pur et testé.
 */
import type { HyroxResult } from "@/features/shared/types/hyrox";

export interface WallBallNoReps {
  target: number | null;
  depth: number | null;
  /** Somme, seulement si les deux sont renseignés. */
  total: number | null;
}

const count = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

/** `null` si rien n'est renseigné. */
export function wallBallNoReps(r: Pick<HyroxResult, "wall_balls_no_rep_target" | "wall_balls_no_rep_depth">): WallBallNoReps | null {
  const target = count(r.wall_balls_no_rep_target);
  const depth = count(r.wall_balls_no_rep_depth);
  if (target == null && depth == null) return null;
  return { target, depth, total: target != null && depth != null ? target + depth : null };
}

const plural = (n: number) => (n > 1 ? "no reps" : "no rep");

/** « 6 no reps : 4 cible, 2 parallèle » ; « No reps : 4 cible, parallèle — » si un compteur manque. */
export function fmtNoReps(nr: WallBallNoReps | null): string {
  if (!nr) return "—";
  const t = nr.target == null ? "cible —" : `${nr.target} cible`;
  const d = nr.depth == null ? "parallèle —" : `${nr.depth} parallèle`;
  if (nr.total == null) return `No reps : ${t}, ${d}`;
  if (nr.total === 0) return "0 no rep";
  return `${nr.total} ${plural(nr.total)} : ${t}, ${d}`;
}

/** Saisie d'un compteur : vide = non renseigné ; `undefined` = valeur invalide. */
export function parseNoRepInput(s: string): number | null | undefined {
  const v = s.trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return n <= 500 ? n : undefined;
}
