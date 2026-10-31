/**
 * Analyse course à pied à partir de 2 ou 3 efforts maximaux (1200 m, 6 min, 12 min).
 *
 * Modèle vitesse critique (Monod-Scherrer / Jones) : distance = VC × t + D′.
 * Loi de puissance de Riegel : v(t) = S × t^(E−1).
 * Seuils, zones et FC seuil (méthode CHR) selon la méthode Rivet.
 * Paramètres : GridSet.running (versionnés, jamais en dur).
 */
import type { RunEffort, RunningParams } from "./types";
import { linreg, pos } from "./util";

export interface RunPoint { t: number; d: number; hr: number | null }

export interface SpeedZone { key: string; label: string; low_kmh: number | null; high_kmh: number | null }

export interface AthleteZone {
  key: "z1" | "z2" | "z3";
  label: "Zone 1 · Endurance" | "Zone 2 · Seuils" | "Zone 3 · Haute intensité";
  /** Bornes de vitesse (km/h) : null = ouverte. */
  low_kmh: number | null;
  high_kmh: number | null;
  /** Bornes FC (bpm), si FC seuil connue. */
  hr_low: number | null;
  hr_high: number | null;
  /** Bornes FC en part de la FC seuil. */
  hr_low_pct: number | null;
  hr_high_pct: number | null;
  feel: "phrases complètes" | "phrases courtes" | "quelques mots";
}

export type RunProfileKey = "complet" | "vitesse" | "endurance" | "moyen";

export interface RunningAnalysis {
  points: RunPoint[];
  n_points: number;
  /** Vitesse critique (km/h) = seuil 2. */
  cs_kmh: number | null;
  dprime_m: number | null;
  /** Facteur d'endurance (exposant de Riegel). */
  e: number | null;
  /** S de Riegel, en km/h·s^(1−E). */
  s_kmh: number | null;
  s1_factor: number | null;
  s1_kmh: number | null;
  /** Lecture de E : seuils (E < coupure) ou vitesse. */
  e_reading: "seuils" | "vitesse" | null;
  /** FC seuil (bpm), méthode CHR, dès 2 FC moyennes. */
  hr_threshold: number | null;
  /** 3 zones montrées à l'athlète. */
  athlete_zones: AthleteZone[];
  /** 6 zones de vitesse : côté coach seulement. */
  coach_speed_zones: SpeedZone[];
  /** 5 zones FC : côté coach seulement. */
  coach_hr_zones: { key: string; low: number | null; high: number | null }[];
  predictions: { km5_s: number | null; km10_s: number | null };
  /** Réserve de vitesse (si Vmax saisie). */
  speed_reserve: { vmax_kmh: number; reserve_kmh: number; aerobic_share: number; anaerobic_share: number } | null;
  profile: RunProfileKey | null;
  /** Tableau % de VC -> durée tenable (Riegel). Coach seulement. */
  pct_vc_table: { pct: number; kmh: number; sustain_s: number | null }[];
}

/** Point de course depuis une durée et une allure (s/km), comme une saisie montre. */
export function pointFromPace(duration_s: number, pace_s_per_km: number, hr_avg?: number | null): RunEffort {
  return { duration_s, distance_m: (duration_s / pace_s_per_km) * 1000, hr_avg: hr_avg ?? null };
}

export function runPoints(efforts: Array<RunEffort | undefined | null>): RunPoint[] {
  const pts: RunPoint[] = [];
  for (const e of efforts) {
    const t = pos(e?.duration_s), d = pos(e?.distance_m);
    if (t != null && d != null) pts.push({ t, d, hr: pos(e?.hr_avg) });
  }
  return pts;
}

/** Durée (s) tenable à une vitesse (km/h) selon Riegel. */
export function sustainableDuration(kmh: number, s_kmh: number, e: number, p: RunningParams): number | null {
  let k = e - 1;
  if (Math.abs(k) <= p.min_abs_e_minus_1) k = (k < 0 ? -1 : 1) * p.min_abs_e_minus_1;
  const t = Math.pow(kmh / s_kmh, 1 / k);
  return Number.isFinite(t) && t > 0 ? t : null;
}

/** Temps (s) prédit sur une distance (km) selon Riegel. */
export function riegelTime(km: number, s_kmh: number, e: number): number | null {
  const t = Math.pow((km * 3600) / s_kmh, 1 / e);
  return Number.isFinite(t) && t > 0 ? t : null;
}

export function s1FactorFor(e: number, p: RunningParams): number {
  const [lo, hi] = p.s1_e_bounds;
  return e > hi ? p.s1_factor.above_093 : e >= lo ? p.s1_factor.from_090_to_093 : p.s1_factor.below_090;
}

export function analyzeRunning(
  efforts: Array<RunEffort | undefined | null>,
  p: RunningParams,
  opts: { vmax_kmh?: number | null; sprint_100m_s?: number | null; intermittent?: boolean } = {},
): RunningAnalysis {
  const points = runPoints(efforts);
  const empty: RunningAnalysis = {
    points, n_points: points.length, cs_kmh: null, dprime_m: null, e: null, s_kmh: null, s1_factor: null, s1_kmh: null,
    e_reading: null, hr_threshold: null, athlete_zones: [], coach_speed_zones: [], coach_hr_zones: [],
    predictions: { km5_s: null, km10_s: null }, speed_reserve: null, profile: null, pct_vc_table: [],
  };
  // VC : régression distance (m) sur temps (s) ; pente en m/s.
  const cv = linreg(points.map(q => [q.t, q.d] as const));
  // Riegel : ln(v) sur ln(t).
  const rg = linreg(points.map(q => [Math.log(q.t), Math.log((q.d / q.t) * 3.6)] as const));
  if (!cv || !rg || !(cv.b > 0)) return empty;

  const cs = cv.b * 3.6;
  const dprime = cv.a;
  const e = rg.b + 1;
  const s = Math.exp(rg.a);
  const f1 = s1FactorFor(e, p);
  const s1 = cs * f1;

  // FC seuil (CHR) : battements = FC moyenne × minutes, régressés sur les minutes.
  const hrPts = points.filter(q => q.hr != null).map(q => [q.t / 60, (q.hr as number) * (q.t / 60)] as const);
  const chr = linreg(hrPts);
  const hrT = chr && chr.b > 0 ? chr.b * p.chr_factor : null;

  const athlete_zones: AthleteZone[] = [
    { key: "z1", label: "Zone 1 · Endurance", low_kmh: null, high_kmh: s1, hr_low: null, hr_high: hrT ? hrT * p.hr_z1_max : null, hr_low_pct: null, hr_high_pct: p.hr_z1_max, feel: "phrases complètes" },
    { key: "z2", label: "Zone 2 · Seuils", low_kmh: s1, high_kmh: cs, hr_low: hrT ? hrT * p.hr_z1_max : null, hr_high: hrT, hr_low_pct: p.hr_z1_max, hr_high_pct: 1, feel: "phrases courtes" },
    { key: "z3", label: "Zone 3 · Haute intensité", low_kmh: cs, high_kmh: null, hr_low: hrT, hr_high: null, hr_low_pct: 1, hr_high_pct: null, feel: "quelques mots" },
  ];

  const k = e >= p.zone_shift_from_e ? p.zone_shift : 0;
  const z = p.zone_bounds;
  const coach_speed_zones: SpeedZone[] = [
    { key: "Z1", label: "Récupération", low_kmh: (z.z1_low + k) * cs, high_kmh: (z.z1_z2 + k) * cs },
    { key: "Z2", label: "Endurance", low_kmh: (z.z1_z2 + k) * cs, high_kmh: s1 },
    { key: "Z3", label: "Tempo", low_kmh: s1, high_kmh: (z.z3_z4 + k) * cs },
    { key: "Z4", label: "Seuil", low_kmh: (z.z3_z4 + k) * cs, high_kmh: (z.z4_z5 + k) * cs },
    { key: "Z5", label: "VO2", low_kmh: (z.z4_z5 + k) * cs, high_kmh: (z.z5_z6 + k) * cs },
    { key: "Z6", label: "Vitesse", low_kmh: (z.z5_z6 + k) * cs, high_kmh: null },
  ];
  const hb = p.hr_zone_bounds;
  const coach_hr_zones = hrT
    ? [
        { key: "Z1", low: null, high: hrT * hb[0] },
        { key: "Z2", low: hrT * hb[0], high: hrT * hb[1] },
        { key: "Z3", low: hrT * hb[1], high: hrT * hb[2] },
        { key: "Z4", low: hrT * hb[2], high: hrT * hb[3] },
        { key: "Z5", low: hrT * hb[3], high: null },
      ]
    : [];

  const vmax = pos(opts.vmax_kmh) ?? (pos(opts.sprint_100m_s) ? 360 / (opts.sprint_100m_s as number) : null);
  const speed_reserve = vmax ? { vmax_kmh: vmax, reserve_kmh: vmax - cs, aerobic_share: cs / vmax, anaerobic_share: (vmax - cs) / vmax } : null;
  let profile: RunProfileKey | null = null;
  if (vmax) {
    const fast = vmax > (opts.intermittent ? p.profile_vmax_intermittent_kmh : p.profile_vmax_kmh);
    const endur = e > p.profile_e;
    profile = fast ? (endur ? "complet" : "vitesse") : endur ? "endurance" : "moyen";
  }

  return {
    points, n_points: points.length, cs_kmh: cs, dprime_m: dprime, e, s_kmh: s, s1_factor: f1, s1_kmh: s1,
    e_reading: e < p.e_reading_cut ? "seuils" : "vitesse",
    hr_threshold: hrT, athlete_zones, coach_speed_zones, coach_hr_zones,
    predictions: { km5_s: riegelTime(5, s, e), km10_s: riegelTime(10, s, e) },
    speed_reserve, profile,
    pct_vc_table: p.pct_vc_table.map(pct => ({ pct, kmh: cs * pct, sustain_s: sustainableDuration(cs * pct, s, e, p) })),
  };
}
