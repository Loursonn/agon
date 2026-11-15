import { C, alpha } from "@/lib/theme";
import type { ObjectiveState } from "@/lib/hyrox/objective/vsObjective";
import { hyroxPictoColor, type HyroxStation } from "@/features/shared/components/hyroxStation";
import { DASH, fmtClock } from "@/lib/seance";
import { fmtPace } from "@/lib/hyrox/raceDebrief";
import type { RaceObjective } from "@/lib/hyrox/objective/model";

/** Constantes et formats communs de l'analyse de course HYROX. */

export type RaceAudience = "athlete" | "coach";

export const STATION_PICTO: Record<string, HyroxStation> = {
  ski: "skierg", sled_push: "sled_push", sled_pull: "sled_pull", bbj: "burpee_broad_jump",
  row: "rameur", farmers: "farmers_carry", lunges: "sandbag_lunges", wall_balls: "wall_balls",
};

export const segColor = (s: { kind: string }): string =>
  s.kind === "run" ? hyroxPictoColor("course") : s.kind === "station" ? hyroxPictoColor("skierg") : C.brdL;

export const PROFILE_LABEL = { runner: "Runner", hybrid: "Hybride", powerhouse: "Powerhouse" } as const;

/** Couleurs des courbes complémentaires de la frise (coach) : allure par run et cadence. */
export const FRISE_PACE_COLOR = C.b;
export const FRISE_CADENCE_COLOR = C.ame;

/** « +0:13 », « −0:02 », « 0 » ; `null` → « — ». */
export function fmtDelta(d: number | null, fmt: (s: number) => string): string {
  if (d == null) return DASH;
  const r = Math.round(d);
  if (r === 0) return "0";
  return `${r > 0 ? "+" : "−"}${fmt(Math.abs(r))}`;
}

/** « 1:13 » au-delà d'une minute, « 43 s » en dessous. */
export function fmtGap(s: number): string {
  const r = Math.round(Math.abs(s));
  return r >= 60 ? `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}` : `${r} s`;
}

/** « 14/09 » depuis « 2026-09-14 ». */
export const ddmm = (date: string): string => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** « 1 min 47 s », « 46 s ». */
export function fmtDuration(s: number): string {
  const r = Math.round(Math.abs(s));
  const m = Math.floor(r / 60);
  return m > 0 ? `${m} min ${String(r % 60).padStart(2, "0")} s` : `${r} s`;
}

/** Couleur d'un écart à l'objectif : vert en avance, gris dans l'objectif, orange en retard ou départ rapide. */
export function objectiveColor(s: ObjectiveState | null): string {
  if (s === "ahead") return C.g;
  if (s === "behind" || s === "fast_start") return C.o;
  return s === "on" ? alpha(C.tx2, 0.6) : "transparent";
}

export const OBJECTIVE_LEGEND: Array<{ s: ObjectiveState; label: string }> = [
  { s: "ahead", label: "En avance" },
  { s: "on", label: "Dans l'objectif" },
  { s: "behind", label: "En retard (run 1 : départ rapide)" },
];

/** « objectif 1:22:45 · run moyen 5′00 /km · plan de course ». */
export function objectiveText(o: RaceObjective | null): string {
  if (!o) return "pas d'objectif (temps de run manquants)";
  const parts = [`objectif ${fmtClock(o.totalS)}`];
  if (o.runAvgS != null) parts.push(`run moyen ${fmtPace(o.runAvgS)} /km`);
  parts.push(o.source === "plan" ? "plan de course" : "construit sur le run du jour");
  if (o.estimate) parts.push("estimé");
  return parts.join(" · ");
}
