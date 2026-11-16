/**
 * Grille de l'objectif HYROX v1 (obj@1), validée par Hugo le 15/11/2026
 * (docs/HYROX_OBJECTIF_CONCEPTION.md §3.4).
 *
 * Pour chaque division et chaque run moyen (s/km, hors Roxzone), tous les
 * 30 s/km : temps médians des 8 stations et de la Roxzone chez les athlètes
 * qui ont couru le même temps total de course, arrondis à 5 s, et forme des
 * 8 runs (coefficient de chaque run, moyenne ≈ 1, 2 décimales).
 * En doubles, stations de la paire (travail partagé), runs courus à deux.
 *
 * Source : RoxHype, splits à temps de course égal (1,2 M de résultats,
 * 07/2024-10/2026), recoupés avec pyrox S7-S9. Ne pas modifier à la main :
 * toute recalibration passe par une nouvelle version (OBJECTIVE_GRID_VERSION).
 */
import type { StationKey } from "@/features/shared/types/hyrox";

export const OBJECTIVE_GRID_VERSION = "obj@1";
export const OBJECTIVE_GRID_SOURCE = "RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9";

/** Divisions de la grille (mêmes clés que les catégories de référence). */
export const GRID_DIVISIONS = ["men", "women", "men_pro", "women_pro", "doubles_men", "doubles_women", "doubles_mixed"] as const;
export type GridDivision = (typeof GRID_DIVISIONS)[number];

/** Ordre des stations dans une ligne de la grille (ordre de course). */
export const GRID_STATIONS: readonly StationKey[] = ["ski", "sled_push", "sled_pull", "bbj", "row", "farmers", "lunges", "wall_balls"];

export interface GridRow {
  /** Run moyen (s/km). */
  run: number;
  /** 8 stations (s), ordre GRID_STATIONS. */
  stations: readonly number[];
  /** Roxzone totale (s). */
  roxzone: number;
  /** Forme des runs 1 à 8. */
  shape: readonly number[];
}

export const OBJECTIVE_GRID_V1: Record<GridDivision, readonly GridRow[]> = {
  men: [
    { run: 210, stations: [250, 140, 205, 200, 255, 95, 205, 265], roxzone: 285, shape: [0.91, 0.95, 1.01, 1.00, 1.02, 1.01, 1.01, 1.09] },
    { run: 240, stations: [255, 155, 225, 235, 265, 105, 235, 305], roxzone: 305, shape: [0.92, 0.95, 1.00, 1.00, 1.02, 1.01, 1.01, 1.09] },
    { run: 270, stations: [265, 170, 255, 275, 280, 115, 270, 355], roxzone: 350, shape: [0.91, 0.94, 1.00, 1.00, 1.03, 1.01, 1.01, 1.10] },
    { run: 300, stations: [270, 185, 285, 320, 290, 125, 305, 405], roxzone: 400, shape: [0.90, 0.94, 1.01, 1.00, 1.03, 1.01, 1.01, 1.11] },
    { run: 330, stations: [280, 195, 310, 355, 300, 135, 340, 455], roxzone: 455, shape: [0.88, 0.93, 1.00, 1.00, 1.04, 1.01, 1.01, 1.13] },
    { run: 360, stations: [285, 210, 340, 400, 310, 145, 370, 510], roxzone: 510, shape: [0.85, 0.92, 1.00, 1.00, 1.04, 1.01, 1.01, 1.16] },
    { run: 390, stations: [290, 225, 365, 430, 320, 155, 405, 555], roxzone: 570, shape: [0.83, 0.91, 0.99, 1.00, 1.05, 1.01, 1.02, 1.19] },
    { run: 420, stations: [295, 235, 385, 465, 325, 165, 430, 600], roxzone: 620, shape: [0.80, 0.90, 1.00, 1.00, 1.05, 1.01, 1.02, 1.22] },
    { run: 450, stations: [300, 250, 405, 495, 335, 170, 455, 635], roxzone: 660, shape: [0.78, 0.88, 0.98, 1.00, 1.06, 1.02, 1.02, 1.26] },
    { run: 480, stations: [305, 255, 425, 515, 340, 175, 485, 680], roxzone: 705, shape: [0.74, 0.87, 0.99, 0.99, 1.06, 1.02, 1.03, 1.30] },
  ],
  women: [
    { run: 240, stations: [285, 135, 250, 260, 295, 105, 215, 265], roxzone: 315, shape: [0.91, 0.96, 1.01, 1.00, 1.03, 1.01, 1.01, 1.08] },
    { run: 270, stations: [295, 150, 275, 290, 305, 115, 235, 295], roxzone: 340, shape: [0.91, 0.96, 1.00, 1.00, 1.03, 1.01, 1.01, 1.08] },
    { run: 300, stations: [305, 160, 295, 330, 315, 125, 260, 330], roxzone: 380, shape: [0.92, 0.96, 1.00, 1.00, 1.03, 1.01, 1.01, 1.08] },
    { run: 330, stations: [310, 170, 320, 370, 325, 135, 290, 370], roxzone: 425, shape: [0.91, 0.95, 1.00, 1.00, 1.03, 1.01, 1.01, 1.09] },
    { run: 360, stations: [320, 180, 350, 415, 335, 140, 320, 420], roxzone: 470, shape: [0.90, 0.95, 1.00, 1.00, 1.03, 1.01, 1.01, 1.11] },
    { run: 390, stations: [330, 190, 380, 460, 345, 150, 350, 465], roxzone: 520, shape: [0.88, 0.94, 0.99, 1.00, 1.03, 1.01, 1.01, 1.13] },
    { run: 420, stations: [335, 200, 405, 510, 350, 160, 385, 515], roxzone: 570, shape: [0.86, 0.93, 0.99, 1.00, 1.04, 1.02, 1.02, 1.15] },
    { run: 450, stations: [340, 210, 425, 555, 360, 165, 415, 560], roxzone: 605, shape: [0.84, 0.92, 0.98, 1.00, 1.04, 1.02, 1.02, 1.18] },
    { run: 480, stations: [345, 220, 445, 605, 370, 170, 450, 610], roxzone: 640, shape: [0.81, 0.91, 0.98, 1.00, 1.05, 1.02, 1.03, 1.21] },
  ],
  men_pro: [
    { run: 210, stations: [240, 170, 220, 170, 245, 95, 195, 265], roxzone: 275, shape: [0.92, 0.95, 1.00, 1.00, 1.01, 1.00, 1.01, 1.09] },
    { run: 240, stations: [250, 205, 275, 210, 260, 110, 245, 340], roxzone: 295, shape: [0.90, 0.94, 1.00, 1.01, 1.02, 1.00, 1.02, 1.10] },
    { run: 270, stations: [255, 230, 330, 255, 275, 130, 295, 400], roxzone: 345, shape: [0.88, 0.93, 1.01, 1.01, 1.03, 1.01, 1.02, 1.11] },
    { run: 300, stations: [265, 255, 375, 295, 285, 145, 330, 455], roxzone: 400, shape: [0.86, 0.92, 1.01, 1.02, 1.03, 1.01, 1.03, 1.13] },
    { run: 330, stations: [270, 280, 420, 330, 290, 160, 365, 510], roxzone: 455, shape: [0.84, 0.91, 1.00, 1.01, 1.04, 1.01, 1.03, 1.15] },
    { run: 360, stations: [275, 305, 465, 355, 300, 175, 400, 560], roxzone: 515, shape: [0.81, 0.89, 1.00, 1.01, 1.04, 1.02, 1.04, 1.18] },
    { run: 390, stations: [280, 320, 500, 395, 310, 190, 435, 615], roxzone: 570, shape: [0.79, 0.89, 0.99, 1.01, 1.04, 1.01, 1.04, 1.23] },
    { run: 420, stations: [285, 340, 525, 420, 320, 190, 460, 650], roxzone: 635, shape: [0.75, 0.87, 0.99, 1.00, 1.05, 1.01, 1.04, 1.27] },
  ],
  women_pro: [
    { run: 240, stations: [275, 190, 260, 225, 280, 115, 225, 270], roxzone: 285, shape: [0.85, 0.96, 1.02, 1.02, 1.03, 1.02, 1.02, 1.08] },
    { run: 270, stations: [285, 220, 300, 265, 295, 135, 265, 320], roxzone: 325, shape: [0.89, 0.95, 1.01, 1.01, 1.03, 1.01, 1.02, 1.09] },
    { run: 300, stations: [295, 245, 340, 305, 305, 155, 305, 370], roxzone: 375, shape: [0.89, 0.94, 1.00, 1.01, 1.03, 1.01, 1.02, 1.10] },
    { run: 330, stations: [300, 265, 375, 350, 315, 175, 340, 425], roxzone: 415, shape: [0.88, 0.94, 1.00, 1.01, 1.02, 1.01, 1.02, 1.11] },
    { run: 360, stations: [310, 285, 410, 390, 325, 190, 375, 475], roxzone: 475, shape: [0.88, 0.93, 1.00, 1.01, 1.03, 1.01, 1.03, 1.12] },
    { run: 390, stations: [315, 300, 440, 420, 335, 200, 405, 525], roxzone: 525, shape: [0.85, 0.92, 0.99, 1.00, 1.03, 1.02, 1.03, 1.16] },
    { run: 420, stations: [320, 330, 465, 460, 340, 215, 435, 570], roxzone: 575, shape: [0.84, 0.91, 0.97, 1.00, 1.03, 1.02, 1.04, 1.18] },
  ],
  doubles_men: [
    { run: 240, stations: [230, 100, 170, 150, 250, 85, 170, 230], roxzone: 280, shape: [0.93, 0.95, 1.00, 1.00, 1.02, 1.01, 1.02, 1.06] },
    { run: 270, stations: [235, 105, 185, 170, 260, 95, 190, 245], roxzone: 320, shape: [0.93, 0.94, 1.01, 1.00, 1.03, 1.01, 1.02, 1.06] },
    { run: 300, stations: [240, 110, 195, 185, 270, 95, 205, 260], roxzone: 360, shape: [0.93, 0.94, 1.01, 1.01, 1.03, 1.01, 1.02, 1.06] },
    { run: 330, stations: [250, 115, 210, 200, 275, 105, 225, 270], roxzone: 410, shape: [0.91, 0.94, 1.00, 1.01, 1.03, 1.02, 1.02, 1.08] },
    { run: 360, stations: [255, 120, 220, 215, 285, 110, 240, 290], roxzone: 460, shape: [0.89, 0.93, 1.00, 1.01, 1.04, 1.02, 1.02, 1.09] },
    { run: 390, stations: [260, 125, 235, 230, 290, 110, 255, 305], roxzone: 515, shape: [0.88, 0.92, 1.00, 1.01, 1.05, 1.02, 1.02, 1.11] },
    { run: 420, stations: [265, 135, 245, 245, 300, 115, 270, 320], roxzone: 570, shape: [0.84, 0.91, 1.00, 1.01, 1.05, 1.03, 1.03, 1.14] },
    { run: 450, stations: [270, 140, 255, 255, 305, 120, 285, 335], roxzone: 605, shape: [0.82, 0.90, 0.99, 1.01, 1.06, 1.03, 1.03, 1.16] },
    { run: 480, stations: [275, 145, 265, 260, 310, 120, 300, 345], roxzone: 645, shape: [0.80, 0.90, 0.99, 1.01, 1.07, 1.03, 1.03, 1.16] },
  ],
  doubles_women: [
    { run: 270, stations: [265, 100, 210, 195, 285, 95, 180, 225], roxzone: 330, shape: [0.91, 0.96, 1.01, 1.00, 1.02, 1.01, 1.02, 1.07] },
    { run: 300, stations: [275, 100, 220, 210, 295, 100, 190, 235], roxzone: 355, shape: [0.92, 0.96, 1.00, 1.00, 1.02, 1.01, 1.02, 1.06] },
    { run: 330, stations: [280, 105, 235, 230, 300, 105, 210, 245], roxzone: 395, shape: [0.93, 0.96, 1.00, 1.00, 1.02, 1.01, 1.01, 1.06] },
    { run: 360, stations: [290, 110, 250, 250, 310, 110, 225, 260], roxzone: 435, shape: [0.93, 0.96, 1.00, 1.01, 1.02, 1.01, 1.01, 1.07] },
    { run: 390, stations: [295, 115, 265, 270, 320, 115, 240, 275], roxzone: 480, shape: [0.91, 0.95, 0.99, 1.00, 1.03, 1.02, 1.02, 1.08] },
    { run: 420, stations: [300, 120, 275, 295, 325, 120, 255, 290], roxzone: 525, shape: [0.90, 0.95, 0.99, 1.00, 1.03, 1.02, 1.02, 1.10] },
    { run: 450, stations: [305, 125, 290, 320, 335, 125, 270, 310], roxzone: 570, shape: [0.88, 0.94, 0.98, 1.00, 1.03, 1.03, 1.03, 1.12] },
    { run: 480, stations: [310, 130, 300, 340, 340, 125, 285, 325], roxzone: 600, shape: [0.86, 0.93, 0.98, 1.01, 1.04, 1.03, 1.03, 1.13] },
  ],
  doubles_mixed: [
    { run: 240, stations: [235, 110, 180, 155, 255, 90, 170, 220], roxzone: 275, shape: [0.91, 0.96, 1.01, 1.00, 1.02, 1.01, 1.02, 1.07] },
    { run: 270, stations: [245, 120, 200, 175, 270, 100, 195, 235], roxzone: 315, shape: [0.91, 0.96, 1.01, 1.00, 1.02, 1.01, 1.02, 1.07] },
    { run: 300, stations: [255, 125, 220, 190, 275, 105, 215, 250], roxzone: 355, shape: [0.92, 0.95, 1.01, 1.00, 1.02, 1.01, 1.02, 1.06] },
    { run: 330, stations: [260, 135, 235, 210, 285, 110, 235, 270], roxzone: 395, shape: [0.92, 0.95, 1.00, 1.00, 1.02, 1.01, 1.02, 1.07] },
    { run: 360, stations: [265, 140, 250, 225, 290, 115, 255, 290], roxzone: 440, shape: [0.91, 0.95, 1.00, 1.01, 1.03, 1.01, 1.02, 1.08] },
    { run: 390, stations: [270, 145, 265, 245, 300, 120, 275, 310], roxzone: 485, shape: [0.90, 0.94, 0.99, 1.00, 1.03, 1.02, 1.02, 1.09] },
    { run: 420, stations: [275, 155, 275, 265, 310, 125, 290, 335], roxzone: 535, shape: [0.88, 0.93, 0.99, 1.00, 1.03, 1.02, 1.03, 1.12] },
    { run: 450, stations: [280, 160, 290, 275, 315, 125, 305, 350], roxzone: 575, shape: [0.85, 0.93, 0.99, 1.00, 1.04, 1.03, 1.03, 1.13] },
    { run: 480, stations: [285, 165, 300, 290, 320, 130, 320, 375], roxzone: 620, shape: [0.83, 0.92, 0.98, 1.00, 1.04, 1.03, 1.04, 1.16] },
  ],
};
