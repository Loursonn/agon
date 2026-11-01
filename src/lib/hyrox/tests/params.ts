/**
 * Paramètres versionnés du moteur « Tests HYROX ».
 *
 * GRID_SET_V1 = seed v1 des tables hyrox_test_grids, hyrox_axes_params et
 * hyrox_work_axes_rules : exactement les grilles, poids et seuils du radar bilan
 * YOXX du 31/10/2026. Le moteur ne lit jamais ces constantes directement : il
 * reçoit un GridSet (celui de la base en prod, celui-ci par défaut et en test).
 *
 * Analyse course : modèle vitesse critique (Monod-Scherrer / Jones) + loi de
 * puissance de Riegel, seuils selon la méthode Rivet.
 */
import type { GridRow, GridSet, HyroxCategory, Sex, WorkAxisRule } from "./types";

export const ALGO_VERSION = "hyrox-tests@1.0.0";
export const GRID_VERSION_V1 = "v1";

/** Charges de course par catégorie et sexe. */
export const RACE_LOADS: Record<HyroxCategory, Record<Sex, { sled_push_kg: number; sled_pull_kg: number; wall_ball: string }>> = {
  Open: {
    H: { sled_push_kg: 152, sled_pull_kg: 103, wall_ball: "6 kg / 3,00 m" },
    F: { sled_push_kg: 102, sled_pull_kg: 78, wall_ball: "4 kg / 2,70 m" },
  },
  Pro: {
    H: { sled_push_kg: 202, sled_pull_kg: 153, wall_ball: "9 kg / 3,00 m" },
    F: { sled_push_kg: 152, sled_pull_kg: 103, wall_ball: "6 kg / 2,70 m" },
  },
};

const both = (
  r: Omit<GridRow, "sex" | "category">,
): GridRow[] => [{ ...r, sex: null, category: null }];
const bySex = (
  r: Omit<GridRow, "sex" | "category" | "thresholds">,
  H: GridRow["thresholds"],
  F: GridRow["thresholds"],
): GridRow[] => [
  { ...r, sex: "H", category: null, thresholds: H },
  { ...r, sex: "F", category: null, thresholds: F },
];

const ROWS_V1: GridRow[] = [
  // Système cardio-respiratoire
  ...bySex({ metric_key: "vma", axis: "cardio", direction: "higher", source: "calée chrono", weight: 0.7 }, [11.8, 13.6, 16.1, 18.5], [11.6, 13.4, 16, 18.3]),
  ...bySex({ metric_key: "cooper", axis: "cardio", direction: "higher", source: "calée chrono", weight: 0.3 }, [2170, 2500, 2960, 3400], [2130, 2470, 2940, 3370]),
  // Seuils
  ...bySex({ metric_key: "cs", axis: "seuils", direction: "higher", source: "calée chrono", weight: 0.6 }, [10.4, 12, 14.2, 16.3], [10.2, 11.8, 14.1, 16.1]),
  ...both({ metric_key: "cs_vma", axis: "seuils", direction: "higher", source: "ma méthode", weight: 0.4, thresholds: [0.82, 0.85, 0.88, 0.91] }),
  // Ergos (temps en s)
  ...bySex({ metric_key: "row_2000", axis: "ergos", direction: "lower", source: "ma méthode", weight: 0.5 }, [500, 480, 455, 430], [580, 555, 525, 495]),
  ...bySex({ metric_key: "ski_2000", axis: "ergos", direction: "lower", source: "ma méthode", weight: 0.5 }, [560, 520, 480, 450], [645, 600, 555, 520]),
  // Force (1RM estimé / poids)
  ...bySex({ metric_key: "press_rel", axis: "force", direction: "higher", source: "ma méthode", weight: 0.5 }, [0.5, 0.6, 0.75, 0.9], [0.3, 0.4, 0.5, 0.65]),
  ...bySex({ metric_key: "thruster_rel", axis: "force", direction: "higher", source: "ma méthode", weight: 0.5 }, [0.7, 0.85, 1, 1.15], [0.5, 0.63, 0.75, 0.9]),
  // Endurance de force
  ...both({ metric_key: "wall_balls", axis: "endf", direction: "higher", source: "ma méthode", weight: 0.35, thresholds: [60, 80, 100, 120] }),
  ...both({ metric_key: "sled_push_reserve", axis: "endf", direction: "lower", source: "ma méthode", weight: 0.175, thresholds: [0.855, 0.755, 0.655, 0.555], notes: "À recaler : L0 surestime la charge max réelle." }),
  ...both({ metric_key: "sled_pull_reserve", axis: "endf", direction: "lower", source: "ma méthode", weight: 0.175, thresholds: [0.855, 0.755, 0.655, 0.555], notes: "À recaler : L0 surestime la charge max réelle." }),
  ...bySex({ metric_key: "bbj_80", axis: "endf", direction: "lower", source: "ma méthode", weight: 0.3 }, [330, 270, 225, 180], [375, 315, 265, 220]),
  // Puissance
  ...bySex({ metric_key: "broad_jump", axis: "puissance", direction: "higher", source: "ma méthode", weight: 0.5 }, [190, 215, 240, 265], [145, 165, 185, 205]),
  ...both({ metric_key: "triple_ratio", axis: "puissance", direction: "higher", source: "ma méthode", weight: 0.25, thresholds: [0.8, 0.85, 0.9, 0.95] }),
  ...bySex({ metric_key: "hop_height", axis: "puissance", direction: "higher", source: "ma méthode", weight: 0.25 }, [0.7, 0.8, 0.9, 1], [0.55, 0.65, 0.75, 0.85]),
  // Grip
  ...bySex({ metric_key: "dead_hang", axis: "grip", direction: "higher", source: "ma méthode", weight: 1 }, [30, 60, 90, 120], [20, 45, 75, 105]),
  // Robustesse (côté faible)
  ...bySex({ metric_key: "calf_raise", axis: "robustesse", direction: "higher", source: "publiée", weight: 1 }, [18, 23, 30, 38], [15, 20, 27, 35]),
  ...both({ metric_key: "knee_to_wall", axis: "robustesse", direction: "higher", source: "publiée", weight: 1, thresholds: [6, 8, 11, 13] }),
  ...both({ metric_key: "bridge", axis: "robustesse", direction: "higher", source: "publiée", weight: 1, thresholds: [15, 20, 28, 35] }),
  ...both({ metric_key: "sit_to_stand", axis: "robustesse", direction: "higher", source: "ma méthode", weight: 1, thresholds: [5, 10, 15, 25] }),
];

/**
 * Règles d'axes de travail validées par Hugo le 31/10/2026
 * (03-Evaluation-athlete.md, « Axes de travail »). Les règles de course
 * (VC vs minimum du chrono visé) et la matrice des stations vivent dans
 * insights.ts : elles dépendent du chrono visé, pas d'un seul test.
 */
const RULES_V1: WorkAxisRule[] = [
  // Sécurité
  { id: "sec_asym", step: "sécurité", group: "robustesse", condition: { metric: "lsi.min", op: "<", value: 0.85 }, axis: "Robustesse", means: "Unilatéral côté faible", rationale: "Asymétrie sur 1 jambe sous 85 %.", active: true },
  { id: "sec_calf", step: "sécurité", group: "robustesse", condition: { metric: "note.calf_raise", op: "<=", value: 2 }, axis: "Robustesse", means: "Mollet et tendon d'Achille", rationale: "Montées sur pointe sous le repère publié (23 H / 20 F).", active: true },
  { id: "sec_ktw", step: "sécurité", group: "robustesse", condition: { metric: "val.knee_to_wall", op: "<", value: 8 }, axis: "Robustesse", means: "Mobilité de cheville selon le suspect", rationale: "Knee-to-wall côté faible sous 8 cm.", active: true },
  { id: "sec_bridge", step: "sécurité", group: "robustesse", condition: { metric: "note.bridge", op: "<=", value: 2 }, axis: "Robustesse", means: "Chaîne postérieure, le maillon faible", rationale: "Pont 1 jambe note 2 ou moins.", active: true },
  { id: "sec_sts", step: "sécurité", group: "robustesse", condition: { metric: "note.sit_to_stand", op: "<=", value: 2 }, axis: "Robustesse", means: "Quadriceps et contrôle du genou, le maillon faible", rationale: "Assis-debout 1 jambe note 2 ou moins.", active: true },
  // Course
  { id: "run_seuils", step: "course", group: "course", condition: { metric: "e", op: "<", value: 0.9 }, axis: "Seuils", means: "Zone 2 longue près de la VC (ex. 6 × 1000 m à 95-98 % de la VC)", rationale: "Facteur d'endurance sous 0,90 : la vitesse se perd vite avec la durée.", active: true },
  { id: "run_vitesse", step: "course", group: "course", condition: { metric: "e", op: ">=", value: 0.9 }, axis: "Vitesse", means: "Zone 3 courte (ex. 10 × 400 m à 102-105 % de la VC)", rationale: "Facteur d'endurance de 0,90 ou plus : profil endurant, il manque de la vitesse.", active: true },
  { id: "run_vo2", step: "course", group: "course", condition: { metric: "note.vma", op: "<=", value: 2 }, axis: "Système cardio-respiratoire", means: "VO2 toute l'année", rationale: "VMA note 2 ou moins.", active: true },
  // Sleds
  { id: "sled_push_force", step: "stations", group: "sleds", condition: { metric: "note.sled_push_reserve", op: "<=", value: 2 }, axis: "Force spécifique", means: "Force au Sled Push", rationale: "La charge de course dépasse 75 % de la charge max estimée.", active: true },
  { id: "sled_pull_force", step: "stations", group: "sleds", condition: { metric: "note.sled_pull_reserve", op: "<=", value: 2 }, axis: "Force spécifique", means: "Force au Sled Pull", rationale: "La charge de course dépasse 75 % de la charge max estimée.", active: true },
  { id: "sled_push_endf", step: "stations", group: "sleds", condition: { all: [{ metric: "week1.sled_push_drop", op: "<", value: 0.85 }, { metric: "note.sled_push_reserve", op: ">=", value: 3 }] }, axis: "Endurance de force", means: "Endurance de force au Sled Push", rationale: "Chute en semaine 1 (dernier tronçon sous 85 % du premier) malgré une bonne réserve.", to_recalibrate: true, active: true },
  { id: "sled_pull_endf", step: "stations", group: "sleds", condition: { all: [{ metric: "week1.sled_pull_drop", op: "<", value: 0.85 }, { metric: "note.sled_pull_reserve", op: ">=", value: 3 }] }, axis: "Endurance de force", means: "Endurance de force au Sled Pull", rationale: "Chute en semaine 1 (dernier tronçon sous 85 % du premier) malgré une bonne réserve.", to_recalibrate: true, active: true },
  { id: "sled_pull_gap", step: "stations", group: "sleds", condition: { metric: "note.sled_pull_reserve", op: "<=_metric_minus", other: "note.sled_push_reserve", value: 2 }, axis: "Force du haut du corps", means: "Dos, bras et grip", rationale: "Sled Pull 2 notes sous le Sled Push.", to_recalibrate: true, active: true },
  // Wall balls, BBJ, puissance
  { id: "wb_tech", step: "stations", group: "wall balls", condition: { all: [{ metric: "val.wb_no_reps", op: ">", value: 0 }, { metric: "note.wall_balls", op: "<=", value: 2 }] }, axis: "Technique", means: "Technique des wall balls (cible, squat complet)", rationale: "No-reps et note 2 ou moins.", active: true },
  { id: "wb_endf", step: "stations", group: "wall balls", condition: { metric: "val.wb_last_first", op: "<", value: 0.75 }, axis: "Endurance de force", means: "Endurance de force aux wall balls", rationale: "Dernière minute sous 75 % de la première.", to_recalibrate: true, active: true },
  { id: "bbj_endf", step: "stations", group: "BBJ", condition: { all: [{ metric: "val.bbj_80", op: ">", value: { H: 270, F: 315 } }, { metric: "note.broad_jump", op: ">=", value: 3 }] }, axis: "Endurance de force", means: "Endurance de force des jambes", rationale: "BBJ lent (plus de 4:30 H / 5:15 F) avec un broad jump correct.", active: true },
  { id: "bj_force", step: "stations", group: "puissance", condition: { metric: "note.broad_jump", op: "<=", value: 2 }, axis: "Force", means: "Force, puis puissance", rationale: "Broad jump note 2 ou moins.", active: true },
  { id: "triple_react", step: "stations", group: "puissance", condition: { metric: "val.triple_ratio", op: "<", value: 0.85 }, axis: "Puissance", means: "Réactivité (enchaînement des sauts)", rationale: "Triple sous 85 % de 3 sauts uniques.", active: true },
  // Ergos, force, grip
  { id: "ergo_tech", step: "stations", group: "ergos", condition: { all: [{ any: [{ metric: "note.row_2000", op: "<=", value: 2 }, { metric: "note.ski_2000", op: "<=", value: 2 }] }, { metric: "note.cs", op: ">=", value: 3 }] }, axis: "Technique", means: "Technique d'ergo", rationale: "Ergo note 2 ou moins avec une bonne VC.", active: true },
  { id: "ergo_run_first", step: "stations", group: "ergos", condition: { all: [{ any: [{ metric: "note.row_2000", op: "<=", value: 2 }, { metric: "note.ski_2000", op: "<=", value: 2 }] }, { metric: "note.cs", op: "<=", value: 2 }] }, axis: "Système cardio-respiratoire", means: "La course d'abord", rationale: "Ergo et VC bas tous les deux.", active: true },
  { id: "press_std", step: "stations", group: "force", condition: { metric: "val.press_rel", op: "<", value: { H: 0.6, F: 0.4 } }, axis: "Force", means: "Force jusqu'au standard, pas au-delà", rationale: "Press sous 0,6 × poids (H) / 0,4 (F).", active: true },
  { id: "ratio_legs", step: "stations", group: "force", condition: { metric: "val.thruster_press", op: "<", value: 1.2 }, axis: "Force", means: "Jambes au thruster", rationale: "Thruster / press sous 1,2 : jambes peu utilisées.", active: true },
  { id: "ratio_shoulders", step: "stations", group: "force", condition: { metric: "val.thruster_press", op: ">", value: 1.7 }, axis: "Force", means: "Épaules", rationale: "Thruster / press au-dessus de 1,7 : épaules limitantes.", active: true },
  { id: "grip", step: "stations", group: "grip", condition: { metric: "val.dead_hang", op: "<", value: { H: 60, F: 45 } }, axis: "Grip", means: "Grip", rationale: "Dead hang sous 60 s (H) / 45 s (F).", active: true },
];

export const GRID_SET_V1: GridSet = {
  version: GRID_VERSION_V1,
  rows: ROWS_V1,
  scoring: {
    vma_from_1200_factor: 0.906,
    cooper_age_adjust: { from_age: 40, base_age: 30, per_decade_m: 100 },
    one_rm: { num: 36, den: 37, max_reps: 6 },
    robustness_caps: { asymmetry_below: 0.85, asymmetry_cap: 2.5, ktw_below_cm: 8, ktw_cap: 2.5, note1_cap: 2, ktw_diff_flag_cm: 2 },
    thruster_press_expected: [1.3, 1.6],
    thruster_press_flags: [1.2, 1.7],
  },
  running: {
    s1_factor: { below_090: 0.82, from_090_to_093: 0.84, above_093: 0.85 },
    s1_e_bounds: [0.9, 0.93],
    zone_shift: 0.03,
    zone_shift_from_e: 0.9,
    zone_bounds: { z1_low: 0.6, z1_z2: 0.7, z3_z4: 0.88, z4_z5: 0.96, z5_z6: 1.05 },
    chr_factor: 0.98,
    hr_zone_bounds: [0.85, 0.9, 0.95, 1],
    hr_z1_max: 0.85,
    profile_e: 0.85,
    profile_vmax_kmh: 27,
    profile_vmax_intermittent_kmh: 28,
    e_reading_cut: 0.9,
    min_abs_e_minus_1: 0.01,
    pct_vc_table: [1.3, 1.25, 1.2, 1.15, 1.1, 1.05, 1, 0.95, 0.9, 0.85, 0.8],
  },
  axes: {
    gain_big: 0.075,
    gain_medium: 0.033,
    note_up: 2,
    note_down: 4,
    target_margin_s: 60,
    shift_s: 600,
    stations_strong: 3.75,
    stations_weak: 2.25,
    standard_dprime_m: 150,
    short_prep_weeks: 8,
    older_age: 45,
    rox_points: 15,
    rox_ratio: 1.1,
  },
  rules: RULES_V1,
};

/** Ligne de grille applicable (sexe et catégorie précis d'abord, puis génériques). */
export function gridRowFor(set: GridSet, key: GridRow["metric_key"], sex: Sex, category: HyroxCategory): GridRow | null {
  const rows = set.rows.filter(r => r.metric_key === key && (r.sex == null || r.sex === sex) && (r.category == null || r.category === category));
  rows.sort((a, b) => (b.sex ? 1 : 0) + (b.category ? 1 : 0) - ((a.sex ? 1 : 0) + (a.category ? 1 : 0)));
  return rows[0] ?? null;
}
