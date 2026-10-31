/**
 * Résultats de la batterie v3 (athlete_test_results / athlete_test_values)
 * -> entrées du moteur (HyroxTestInputs), et profil de l'athlète -> AthleteTestProfile.
 *
 * Pur : aucun accès réseau. Les ids des presets sont fixés par la migration
 * 20261101130000_hyrox_tests.sql (d1 à e5).
 */
import type { AthleteTestProfile, HyroxCategory, HyroxTestInputs, Sex, SledWeek1Inputs } from "./types";

export type BatterySession = "S1" | "S2" | "S3" | "S4" | "S5" | "W1";

/** Semaine type validée par Hugo le 31/10/2026 : lun S1 · mar S2 · mer repos · jeu S3 · ven S4 · sam repos · dim S5. */
export const BATTERY_SESSIONS: { key: BatterySession; day: string; label: string; detail: string }[] = [
  { key: "S1", day: "Lundi", label: "Séance 1 · Sauts, 12 min et 1200 m", detail: "Broad jump, 3 broad jumps enchaînés, course 12 min, puis 1200 m 30 min après." },
  { key: "S2", day: "Mardi", label: "Séance 2 · Force du haut du corps et rameur", detail: "Strict press assis, thruster barre, rameur 2000 m." },
  { key: "S3", day: "Jeudi", label: "Séance 3 · Mobilité, 6 min et robustesse", detail: "Knee-to-wall à frais, course 6 min, puis robustesse sur une jambe." },
  { key: "S4", day: "Vendredi", label: "Séance 4 · Sleds, SkiErg et suspension", detail: "Profils charge-vitesse Push et Pull, SkiErg 2000 m, dead hang en dernier." },
  { key: "S5", day: "Dimanche", label: "Séance 5 · BBJ et wall balls", detail: "Burpee broad jump 80 m, wall balls 5 min." },
  { key: "W1", day: "Semaine 1", label: "Semaine 1 d'entraînement · Sleds 3 × 50 m", detail: "Endurance aux sleds à charge de course (protocole à valider)." },
];

const ID = (suffix: string) => `00000000-0000-0000-0000-0000000000${suffix}`;

/** Presets de la batterie v3, par slug. */
export const BATTERY_IDS = {
  broad_jump: ID("d1"),
  triple_broad_jump: ID("d2"),
  run_12min: ID("d3"),
  run_1200m: ID("d4"),
  strict_press: ID("d5"),
  thruster: ID("d6"),
  row_2000m: ID("d7"),
  knee_to_wall: ID("d8"),
  run_6min: ID("d9"),
  calf_raise: ID("da"),
  bridge: ID("db"),
  sit_to_stand: ID("dc"),
  hop: ID("dd"),
  sled_push: ID("de"),
  sled_pull: ID("df"),
  ski_2000m: ID("e0"),
  dead_hang: ID("e1"),
  bbj_80m: ID("e2"),
  wall_balls_5min: ID("e3"),
  week1_sled_push: ID("e4"),
  week1_sled_pull: ID("e5"),
} as const;

export type BatterySlug = keyof typeof BATTERY_IDS;

const SLUG_BY_ID: Record<string, BatterySlug> = Object.fromEntries(
  Object.entries(BATTERY_IDS).map(([slug, id]) => [id, slug as BatterySlug]),
);

export const batterySlugOf = (testDefinitionId: string): BatterySlug | null => SLUG_BY_ID[testDefinitionId] ?? null;

/** Un résultat de test, réduit à ce dont le moteur a besoin. */
export interface BatteryResult {
  id: string;
  test_definition_id: string;
  /** Date ISO (YYYY-MM-DD). */
  performed_at: string;
  /** clé de variable -> valeur. */
  values: Record<string, number>;
}

export interface InputsFromResults {
  inputs: HyroxTestInputs;
  /** Résultats retenus (le plus récent de chaque test dans la fenêtre). */
  source_result_ids: string[];
  /** Tests de la batterie sans résultat dans la fenêtre. */
  missing: BatterySlug[];
  /** Première et dernière date retenues. */
  first_date: string | null;
  last_date: string | null;
}

const v = (r: BatteryResult, k: string): number | null => {
  const x = r.values[k];
  return x == null || !Number.isFinite(Number(x)) ? null : Number(x);
};

const sides = (r: BatteryResult, unit: "cm" | "reps") => ({ left: v(r, `left_${unit}`), right: v(r, `right_${unit}`) });

function week1(r: BatteryResult): SledWeek1Inputs {
  const reps: SledWeek1Inputs = [];
  for (let i = 1; i <= 3; i++) {
    const segs = [1, 2, 3, 4].map(t => v(r, `r${i}_t${t}`));
    if (segs.some(s => s != null)) reps.push(segs);
  }
  return reps;
}

/** Applique un résultat de la batterie aux entrées du moteur. */
export function applyResult(inputs: HyroxTestInputs, slug: BatterySlug, r: BatteryResult): void {
  const rpe = (key: string) => {
    const x = { rpe: v(r, "rpe"), hr_1min: v(r, "hr_1min") };
    if (x.rpe != null || x.hr_1min != null) inputs.rpe = { ...(inputs.rpe ?? {}), [key]: x };
  };
  switch (slug) {
    case "broad_jump": inputs.broad_jump_cm = v(r, "best_cm"); break;
    case "triple_broad_jump": inputs.triple_broad_jump_cm = v(r, "distance_cm"); break;
    case "run_12min": inputs.run_12min = { duration_s: 720, distance_m: v(r, "distance_m"), hr_avg: v(r, "hr_avg"), hr_max: v(r, "hr_max") }; break;
    case "run_1200m": inputs.run_1200m = { duration_s: v(r, "time"), distance_m: 1200, hr_avg: v(r, "hr_avg"), hr_max: v(r, "hr_max") }; break;
    case "strict_press": inputs.strict_press = { kg: v(r, "load_kg"), reps: v(r, "reps") }; break;
    case "thruster": inputs.thruster = { kg: v(r, "load_kg"), reps: v(r, "reps") }; break;
    case "row_2000m": inputs.row_2000m_s = v(r, "time"); break;
    case "knee_to_wall": inputs.knee_to_wall_cm = sides(r, "cm"); break;
    case "run_6min": inputs.run_6min = { duration_s: 360, distance_m: v(r, "distance_m"), hr_avg: v(r, "hr_avg"), hr_max: v(r, "hr_max") }; break;
    case "calf_raise": inputs.calf_raise_reps = sides(r, "reps"); break;
    case "bridge": inputs.single_leg_bridge_reps = sides(r, "reps"); break;
    case "sit_to_stand": inputs.single_leg_sit_to_stand_reps = sides(r, "reps"); break;
    case "hop": inputs.single_leg_hop_cm = sides(r, "cm"); break;
    case "sled_push":
    case "sled_pull": {
      const sled = {
        times_s: [v(r, "time_80"), v(r, "time_100"), v(r, "time_120")] as [number | null, number | null, number | null],
        loads_kg: [v(r, "load_80"), v(r, "load_100"), v(r, "load_120")] as [number | null, number | null, number | null],
      };
      if (slug === "sled_push") inputs.sled_push = sled; else inputs.sled_pull = sled;
      break;
    }
    case "ski_2000m": inputs.ski_2000m_s = v(r, "time"); break;
    case "dead_hang": inputs.dead_hang_s = v(r, "time"); break;
    case "bbj_80m": inputs.bbj_80m = { time_s: v(r, "time"), jumps: v(r, "jumps") }; rpe("bbj"); break;
    case "wall_balls_5min":
      inputs.wall_balls_5min = { per_minute: [1, 2, 3, 4, 5].map(m => v(r, `min_${m}`)), total: v(r, "total"), no_reps: v(r, "no_reps") };
      rpe("wall_balls");
      break;
    case "week1_sled_push": inputs.week1_sled_push = week1(r); rpe("week1_sled_push"); break;
    case "week1_sled_pull": inputs.week1_sled_pull = week1(r); rpe("week1_sled_pull"); break;
  }
}

/**
 * Entrées du moteur depuis les résultats d'une fenêtre de dates (bornes incluses).
 * Pour chaque test, le résultat le plus récent de la fenêtre est retenu.
 */
export function inputsFromResults(results: BatteryResult[], window: { from: string; to: string }): InputsFromResults {
  const latest = new Map<BatterySlug, BatteryResult>();
  for (const r of results) {
    const slug = batterySlugOf(r.test_definition_id);
    if (!slug || r.performed_at < window.from || r.performed_at > window.to) continue;
    const cur = latest.get(slug);
    if (!cur || r.performed_at > cur.performed_at) latest.set(slug, r);
  }
  const inputs: HyroxTestInputs = {};
  // Ordre stable : celui de la batterie.
  const slugs = Object.keys(BATTERY_IDS) as BatterySlug[];
  for (const slug of slugs) {
    const r = latest.get(slug);
    if (r) applyResult(inputs, slug, r);
  }
  const kept = slugs.map(s => latest.get(s)).filter((r): r is BatteryResult => !!r);
  const dates = kept.map(r => r.performed_at).sort();
  return {
    inputs,
    source_result_ids: kept.map(r => r.id),
    missing: slugs.filter(s => !latest.has(s)),
    first_date: dates[0] ?? null,
    last_date: dates[dates.length - 1] ?? null,
  };
}

/** Fenêtre par défaut : 21 jours jusqu'au dernier résultat de la batterie. */
export function defaultWindow(results: BatteryResult[], days = 21): { from: string; to: string } | null {
  const dates = results.filter(r => batterySlugOf(r.test_definition_id)).map(r => r.performed_at).sort();
  const to = dates[dates.length - 1];
  if (!to) return null;
  const d = new Date(`${to}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return { from: d.toISOString().slice(0, 10), to };
}

// ── Profil ───────────────────────────────────────────────────────────────────

export interface ProfileSource {
  gender?: "male" | "female" | null;
  age?: number | null;
  birth_date?: string | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  hyrox_category?: "open" | "pro" | null;
}

export interface ProfileFromAthlete {
  profile: AthleteTestProfile | null;
  /** Ce qui manque ou ce qui est supposé, en clair. */
  warnings: string[];
}

/** Âge à une date (YYYY-MM-DD), depuis la date de naissance, sinon l'âge du profil. */
export function ageAt(src: ProfileSource, date: string): number | null {
  if (src.birth_date) {
    const b = new Date(`${src.birth_date}T00:00:00Z`), d = new Date(`${date}T00:00:00Z`);
    let a = d.getUTCFullYear() - b.getUTCFullYear();
    if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) a--;
    return a >= 0 ? a : null;
  }
  return src.age ?? null;
}

export function profileFromAthlete(src: ProfileSource, date: string): ProfileFromAthlete {
  const warnings: string[] = [];
  const sex: Sex | null = src.gender === "male" ? "H" : src.gender === "female" ? "F" : null;
  if (!sex) warnings.push("Sexe non renseigné au profil : les grilles en dépendent.");
  const category: HyroxCategory = src.hyrox_category === "pro" ? "Pro" : "Open";
  if (!src.hyrox_category) warnings.push("Catégorie HYROX non renseignée : Open par défaut (charges des sleds et des wall balls).");
  if (!src.weight_kg) warnings.push("Poids non renseigné : la force (rapportée au poids) ne sera pas notée.");
  if (!src.height_cm) warnings.push("Taille non renseignée : le hop 1 jambe ne sera pas noté.");
  const age = ageAt(src, date);
  if (age == null) warnings.push("Âge non renseigné : pas d'ajustement du 12 min.");
  return {
    profile: sex ? { sex, category, age, weight_kg: src.weight_kg ?? null, height_cm: src.height_cm ?? null } : null,
    warnings,
  };
}
