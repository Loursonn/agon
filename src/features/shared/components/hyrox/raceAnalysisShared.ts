import { C } from "@/lib/theme";
import { hyroxPictoColor, type HyroxStation } from "@/features/shared/components/hyroxStation";
import { DASH } from "@/lib/seance";

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
