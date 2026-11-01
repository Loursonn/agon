/**
 * Notes 1 à 5 par mesure, note par axe (moyenne pondérée) et radar 8 axes.
 * Port fidèle de compute() / axisScores() du radar bilan YOXX (31/10/2026).
 * Les grilles et poids viennent du GridSet reçu (jamais en dur).
 */
import { RACE_LOADS, gridRowFor } from "./params";
import { analyzeRunning, type RunningAnalysis } from "./running";
import { sledProfile, sledWeek1, type SledProfile, type SledWeek1Analysis } from "./sled";
import type { AthleteTestProfile, AxisKey, GridRow, GridSet, HyroxTestInputs, MetricKey, MetricSource } from "./types";
import { fmtTime, fr, lsi, minNullable, num, pos } from "./util";

export const AXES: { key: AxisKey; label: string; what: string }[] = [
  { key: "cardio", label: "Système cardio-respiratoire", what: "Capter, transporter et utiliser l'oxygène : VMA, 12 min." },
  { key: "seuils", label: "Seuils", what: "Seuil 1, vitesse critique (seuil 2), FC seuil." },
  { key: "ergos", label: "Ergos", what: "Rameur et SkiErg 2000 m, damper 4." },
  { key: "force", label: "Force", what: "Poussée verticale rapportée au poids." },
  { key: "endf", label: "Endurance de force", what: "Maintenir une production de force élevée sur des contractions répétées malgré la fatigue : wall balls, sleds, BBJ." },
  { key: "puissance", label: "Puissance", what: "Sauts : puissance et enchaînement." },
  { key: "grip", label: "Grip", what: "Dead hang au temps." },
  { key: "robustesse", label: "Robustesse", what: "Côté faible, asymétries, cheville." },
];

export interface Measure {
  /** Clé de grille si la mesure est notée, sinon clé de lecture. */
  key: MetricKey | string;
  axis: AxisKey;
  label: string;
  value: number | null;
  display: string;
  /** Note 1-5, null si non notée ou non mesurée. */
  note: number | null;
  source: MetricSource;
  /** Mesure de lecture seule (pas de note par construction). */
  reading?: boolean;
}

export interface AxisScore { key: AxisKey; label: string; score: number | null; flags: string[] }

export interface ScoreResult {
  measures: Measure[];
  axes: AxisScore[];
  running: RunningAnalysis;
  sled_push: SledProfile;
  sled_pull: SledProfile;
  week1_push: SledWeek1Analysis | null;
  week1_pull: SledWeek1Analysis | null;
  vma_kmh: number | null;
  /** 1RM estimés (kg). */
  press_1rm: number | null;
  thruster_1rm: number | null;
  thruster_press: number | null;
  /** Indices de symétrie (côté faible / côté fort). */
  lsi: { pointes: number | null; pont: number | null; "assis-debout": number | null; hop: number | null };
  asymmetries: { key: string; lsi: number }[];
  ktw_weak_cm: number | null;
  ktw_diff_cm: number | null;
  wb_last_first: number | null;
}

/** Note 1-5 selon une ligne de grille. */
export function noteFor(x: number | null, row: GridRow | null, offset = 0): number | null {
  if (x == null || !row) return null;
  let n = 1;
  for (const t0 of row.thresholds) {
    const t = t0 - offset;
    if (row.direction === "higher" ? x >= t : x < t) n++;
  }
  return n;
}

export function oneRm(kg: number | null, reps: number | null, p: GridSet["scoring"]["one_rm"]): number | null {
  if (kg == null || reps == null || reps < 1 || reps > p.max_reps) return null;
  return (kg * p.num) / (p.den - reps);
}

export function scoreTests(inputs: HyroxTestInputs, profile: AthleteTestProfile, set: GridSet): ScoreResult {
  const { sex, category } = profile;
  const loads = RACE_LOADS[category][sex];
  const sc = set.scoring;
  const measures: Measure[] = [];
  const row = (k: MetricKey) => gridRowFor(set, k, sex, category);
  const add = (k: MetricKey, axis: AxisKey, label: string, value: number | null, display: string, offset = 0) => {
    const r = row(k);
    measures.push({ key: k, axis, label, value, display: value == null ? "—" : display, note: noteFor(value, r, offset), source: r?.source ?? "ma méthode" });
  };
  const read = (key: string, axis: AxisKey, label: string, value: number | null, display: string, source: MetricSource) =>
    measures.push({ key, axis, label, value, display: value == null ? "—" : display, note: null, source, reading: true });

  // ── Système cardio-respiratoire
  const t1200 = pos(inputs.run_1200m?.duration_s);
  const d12 = pos(inputs.run_12min?.distance_m);
  const vma = t1200 ? (1200 / t1200) * 3.6 * sc.vma_from_1200_factor : null;
  add("vma", "cardio", "VMA (1200 m)", vma, `${fr(vma)} km/h`);
  const age = num(profile.age);
  const ca = sc.cooper_age_adjust;
  const adj = age != null && age >= ca.from_age ? ca.per_decade_m * Math.floor((age - ca.base_age) / 10) : 0;
  add("cooper", "cardio", "12 min", d12, `${d12} m`, adj);

  // ── Seuils
  const running = analyzeRunning(
    [
      inputs.run_1200m ? { ...inputs.run_1200m, distance_m: inputs.run_1200m.distance_m ?? 1200 } : null,
      inputs.run_6min ? { ...inputs.run_6min, duration_s: inputs.run_6min.duration_s ?? 360 } : null,
      inputs.run_12min ? { ...inputs.run_12min, duration_s: inputs.run_12min.duration_s ?? 720 } : null,
    ],
    set.running,
    { vmax_kmh: inputs.vmax_kmh, sprint_100m_s: inputs.sprint_100m_s },
  );
  const cs = running.cs_kmh;
  add("cs", "seuils", running.n_points === 2 ? "Vitesse critique (2 points)" : "Vitesse critique", cs, `${fr(cs)} km/h · D′ ${Math.round(running.dprime_m ?? 0)} m`);
  const csVma = cs != null && vma != null ? cs / vma : null;
  add("cs_vma", "seuils", "Vitesse critique / VMA", csVma, `${Math.round((csVma ?? 0) * 100)} %`);
  read("e", "seuils", "Facteur d'endurance", running.e, fr(running.e, 2), "méthode vitesse critique / Riegel");
  read("s2", "seuils", "Seuil 2 = vitesse critique", cs, `${fr(cs)} km/h`, "méthode vitesse critique / Riegel");
  read("s1", "seuils", `Seuil 1 = ${running.s1_factor ? Math.round(running.s1_factor * 100) : "82-85"} % de la vitesse critique`, running.s1_kmh, `${fr(running.s1_kmh)} km/h`, "méthode vitesse critique / Riegel");
  read("hr_threshold", "seuils", "FC seuil", running.hr_threshold, `${Math.round(running.hr_threshold ?? 0)} bpm`, "méthode vitesse critique / Riegel");

  // ── Ergos
  const row2k = pos(inputs.row_2000m_s), ski2k = pos(inputs.ski_2000m_s);
  add("row_2000", "ergos", "Rameur 2000 m", row2k, fmtTime(row2k));
  add("ski_2000", "ergos", "SkiErg 2000 m", ski2k, fmtTime(ski2k));

  // ── Force
  const pdc = pos(profile.weight_kg);
  const p1 = oneRm(pos(inputs.strict_press?.kg), pos(inputs.strict_press?.reps), sc.one_rm);
  const t1 = oneRm(pos(inputs.thruster?.kg), pos(inputs.thruster?.reps), sc.one_rm);
  const pr = p1 != null && pdc ? p1 / pdc : null;
  const tr = t1 != null && pdc ? t1 / pdc : null;
  add("press_rel", "force", "Press assis (1RM estimé)", pr, `${Math.round(p1 ?? 0)} kg · ${fr(pr, 2)} × poids`);
  add("thruster_rel", "force", "Thruster (1RM estimé)", tr, `${Math.round(t1 ?? 0)} kg · ${fr(tr, 2)} × poids`);
  const thrPress = p1 != null && t1 != null ? t1 / p1 : null;
  const [lowF, highF] = sc.thruster_press_flags;
  read("thruster_press", "force", "Thruster / press", thrPress,
    `${fr(thrPress, 2)}${thrPress == null ? "" : thrPress < lowF ? " · jambes peu utilisées" : thrPress > highF ? " · épaules limitantes" : ` · attendu ${fr(sc.thruster_press_expected[0])}-${fr(sc.thruster_press_expected[1])}`}`,
    "ma méthode");

  // ── Endurance de force
  const wbPerMin = (inputs.wall_balls_5min?.per_minute ?? []).map(pos);
  const wbSum = wbPerMin.length && wbPerMin.every(x => x != null) ? (wbPerMin as number[]).reduce((s, x) => s + x, 0) : null;
  const wb = num(inputs.wall_balls_5min?.total) ?? wbSum;
  add("wall_balls", "endf", `Wall balls 5 min (${loads.wall_ball})`, wb, `${wb} reps`);
  const push = sledProfile(loads.sled_push_kg, inputs.sled_push);
  const pull = sledProfile(loads.sled_pull_kg, inputs.sled_pull);
  const sledDisplay = (s: SledProfile) =>
    s.usable === false
      ? s.reason === "slope_not_negative" ? "— (la vitesse ne baisse pas avec la charge : profil non exploitable)" : "—"
      : `${Math.round(s.reserve * 100)} % · max estimé ${Math.round(s.l0_kg)} kg · ${fr(s.v_race, 2)} m/s à charge de course${s.two_points ? " · 2 points" : ""}${s.low_fit ? ` · profil peu fiable (R² ${fr(s.r2, 2)})` : ""}`;
  const addSled = (k: MetricKey, label: string, s: SledProfile) => {
    const r = row(k);
    const v = s.usable ? s.reserve : null;
    measures.push({ key: k, axis: "endf", label, value: v, display: sledDisplay(s), note: noteFor(v, r), source: r?.source ?? "ma méthode" });
  };
  addSled("sled_push_reserve", `Sled Push : ${loads.sled_push_kg} kg en % de la charge max estimée`, push);
  addSled("sled_pull_reserve", `Sled Pull : ${loads.sled_pull_kg} kg en % de la charge max estimée`, pull);
  const bbj = pos(inputs.bbj_80m?.time_s);
  add("bbj_80", "endf", "BBJ 80 m", bbj, fmtTime(bbj));

  // ── Puissance
  const bj = pos(inputs.broad_jump_cm), tbj = pos(inputs.triple_broad_jump_cm);
  const tri = bj && tbj ? tbj / (3 * bj) : null;
  add("broad_jump", "puissance", "Broad jump", bj, `${bj} cm`);
  add("triple_ratio", "puissance", "Triple / (3 × unique)", tri, `${Math.round((tri ?? 0) * 100)} %`);
  const hopG = pos(inputs.single_leg_hop_cm?.left), hopD = pos(inputs.single_leg_hop_cm?.right);
  const hopMin = minNullable(hopG, hopD);
  const height = pos(profile.height_cm);
  const hopH = hopMin != null && height ? hopMin / height : null;
  add("hop_height", "puissance", "Hop 1 jambe, côté faible / taille", hopH, fr(hopH, 2));

  // ── Grip
  const hang = pos(inputs.dead_hang_s);
  add("dead_hang", "grip", "Dead hang", hang, `${hang} s`);

  // ── Robustesse (côté faible)
  const side = (s?: { left?: number | null; right?: number | null }) => [num(s?.left), num(s?.right)] as const;
  const [hrG, hrD] = side(inputs.calf_raise_reps);
  const [ktG, ktD] = side(inputs.knee_to_wall_cm);
  const [brG, brD] = side(inputs.single_leg_bridge_reps);
  const [stG, stD] = side(inputs.single_leg_sit_to_stand_reps);
  const hrMin = minNullable(hrG, hrD), ktMin = minNullable(ktG, ktD), brMin = minNullable(brG, brD), stMin = minNullable(stG, stD);
  add("calf_raise", "robustesse", "Montées sur pointe, côté faible", hrMin, `${hrMin} reps`);
  add("knee_to_wall", "robustesse", "Knee-to-wall, côté faible", ktMin, `${fr(ktMin)} cm`);
  add("bridge", "robustesse", "Pont 1 jambe, côté faible", brMin, `${brMin} reps`);
  add("sit_to_stand", "robustesse", "Assis-debout 1 jambe, côté faible", stMin, `${stMin} reps`);

  const L = { pointes: lsi(hrG, hrD), pont: lsi(brG, brD), "assis-debout": lsi(stG, stD), hop: lsi(hopG, hopD) };
  const caps = sc.robustness_caps;
  const asymmetries = Object.entries(L).filter(([, x]) => x != null && x < caps.asymmetry_below).map(([key, x]) => ({ key, lsi: x as number }));
  const ktDiff = ktG != null && ktD != null ? Math.abs(ktG - ktD) : null;

  // ── Notes d'axes
  const axes: AxisScore[] = AXES.map(a => {
    const ms = measures.filter(m => m.axis === a.key && !m.reading);
    let s = 0, t = 0;
    for (const m of ms) {
      const w = row(m.key as MetricKey)?.weight ?? 0;
      if (m.note != null && w) { s += m.note * w; t += w; }
    }
    let v = t ? s / t : null;
    const flags: string[] = [];
    if (a.key === "robustesse" && v != null) {
      const notes = ms.map(m => m.note).filter(n => n != null);
      if (asymmetries.length) {
        flags.push(`Asymétrie > ${Math.round((1 - caps.asymmetry_below) * 100)} % : ${asymmetries.map(x => `${x.key} ${Math.round(x.lsi * 100)} %`).join(", ")}`);
        v = Math.min(v, caps.asymmetry_cap);
      }
      if (ktMin != null && ktMin < caps.ktw_below_cm) { flags.push(`Knee-to-wall côté faible < ${caps.ktw_below_cm} cm`); v = Math.min(v, caps.ktw_cap); }
      if (notes.includes(1)) { flags.push(`Une note 1 : axe plafonné à ${caps.note1_cap}`); v = Math.min(v, caps.note1_cap); }
      if (ktDiff != null && ktDiff > caps.ktw_diff_flag_cm) flags.push(`Écart knee-to-wall G/D de ${fr(ktDiff)} cm (à surveiller)`);
    }
    return { key: a.key, label: a.label, score: v == null ? null : Math.round(v * 2) / 2, flags };
  });

  const w1push = sledWeek1(inputs.week1_sled_push, push.usable ? push.v_race : null);
  const w1pull = sledWeek1(inputs.week1_sled_pull, pull.usable ? pull.v_race : null);
  const wbFirst = wbPerMin[0], wbLast = wbPerMin[wbPerMin.length - 1];

  return {
    measures, axes, running, sled_push: push, sled_pull: pull, week1_push: w1push, week1_pull: w1pull,
    vma_kmh: vma, press_1rm: p1, thruster_1rm: t1, thruster_press: thrPress, lsi: L, asymmetries,
    ktw_weak_cm: ktMin, ktw_diff_cm: ktDiff,
    wb_last_first: wbPerMin.length > 1 && wbFirst != null && wbLast != null ? wbLast / wbFirst : null,
  };
}

export const noteOf = (r: ScoreResult, key: MetricKey): number | null => r.measures.find(m => m.key === key)?.note ?? null;
export const valueOf = (r: ScoreResult, key: string): number | null => r.measures.find(m => m.key === key)?.value ?? null;
export const axisScore = (r: ScoreResult, key: AxisKey): number | null => r.axes.find(a => a.key === key)?.score ?? null;
