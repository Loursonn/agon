// ── HYROX Types & Constants ──────────────────────────────────────────────────

export type HyroxDivision =
  | 'women' | 'women_pro' | 'men' | 'men_pro'
  | 'doubles_women' | 'doubles_men' | 'doubles_mixed'
  | 'doubles_women_pro' | 'doubles_men_pro'
  | 'relay_women' | 'relay_men' | 'relay_mixed'
  | 'adaptive';

export type HyroxFormat = 'solo' | 'doubles' | 'relay' | 'sim_full' | 'sim_34' | 'sim_half';
export type HyroxStatus = 'finished' | 'dnf' | 'dns' | 'dq';
export type HyroxProfile = 'runner' | 'hybrid' | 'powerhouse';

export type StationKey = 'ski' | 'sled_push' | 'sled_pull' | 'bbj' | 'row' | 'farmers' | 'lunges' | 'wall_balls';
export type RunKey = 'run_1' | 'run_2' | 'run_3' | 'run_4' | 'run_5' | 'run_6' | 'run_7' | 'run_8';
export type SegmentKey = RunKey | StationKey | 'roxzone_total';

export interface HyroxResult {
  id: string;
  athlete_id: string;
  competition_id: string | null;
  created_by: string | null;
  date: string;
  event_name: string;
  venue: string | null;
  format: HyroxFormat;
  division: HyroxDivision;
  age_group: string | null;
  is_official: boolean;
  status: HyroxStatus;
  total_s: number;
  run_1_s: number | null; run_2_s: number | null; run_3_s: number | null; run_4_s: number | null;
  run_5_s: number | null; run_6_s: number | null; run_7_s: number | null; run_8_s: number | null;
  ski_s: number | null; sled_push_s: number | null; sled_pull_s: number | null; bbj_s: number | null;
  row_s: number | null; farmers_s: number | null; lunges_s: number | null; wall_balls_s: number | null;
  roxzone_total_s: number | null;
  roxzone_splits: number[] | null;
  penalties_s: number;
  penalties_note: string | null;
  rank_overall: number | null;
  rank_age_group: number | null;
  participants_overall: number | null;
  participants_age_group: number | null;
  activity_url: string | null;
  athlete_comment: string | null;
  coach_comment: string | null;
  source: 'manual' | 'import';
  created_at: string;
  updated_at: string;
}

export type HyroxResultInsert = Omit<HyroxResult, 'id' | 'created_at' | 'updated_at'>;

export interface HyroxReferenceSegment {
  id: string;
  division: string;
  bracket: string;
  segment: string;
  p1_s: number | null;
  p5_s: number | null;
  p10_s: number | null;
  p25_s: number | null;
  p50_s: number;
  p75_s: number | null;
  p90_s: number | null;
  source: string;
  is_estimate: boolean;
  sample_size: number | null;
}

export interface HyroxPlanTargets {
  run_1: number; run_2: number; run_3: number; run_4: number;
  run_5: number; run_6: number; run_7: number; run_8: number;
  ski: number; sled_push: number; sled_pull: number; bbj: number;
  row: number; farmers: number; lunges: number; wall_balls: number;
  roxzone_per_transition: number;
}

export interface HyroxRacePlan {
  id: string;
  athlete_id: string;
  competition_id: string | null;
  result_id: string | null;
  created_by: string | null;
  name: string;
  division: string;
  profile: HyroxProfile;
  target_total_s: number;
  targets: HyroxPlanTargets;
  predicted_total_s: number | null;
  predicted_high_s: number | null;
  predicted_from: Record<string, number> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HyroxAlert {
  code: string;
  level: 'info' | 'warn';
  message: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const DIVISION_LABEL: Record<HyroxDivision, string> = {
  women: 'Women', women_pro: 'Women Pro', men: 'Men', men_pro: 'Men Pro',
  doubles_women: 'Doubles femmes', doubles_men: 'Doubles hommes', doubles_mixed: 'Doubles mixte',
  doubles_women_pro: 'Doubles femmes Pro', doubles_men_pro: 'Doubles hommes Pro',
  relay_women: 'Relais femmes', relay_men: 'Relais hommes', relay_mixed: 'Relais mixte',
  adaptive: 'Adaptive',
};

export const FORMAT_LABEL: Record<HyroxFormat, string> = {
  solo: 'Solo', doubles: 'Doubles', relay: 'Relais',
  sim_full: 'Simulation complète', sim_34: 'Simulation 3/4', sim_half: 'Demi-simulation',
};

export const RACE_ORDER: SegmentKey[] = [
  'run_1', 'ski', 'run_2', 'sled_push', 'run_3', 'sled_pull', 'run_4', 'bbj',
  'run_5', 'row', 'run_6', 'farmers', 'run_7', 'lunges', 'run_8', 'wall_balls',
];

export const STATION_KEYS: StationKey[] = ['ski', 'sled_push', 'sled_pull', 'bbj', 'row', 'farmers', 'lunges', 'wall_balls'];
export const RUN_KEYS: RunKey[] = ['run_1', 'run_2', 'run_3', 'run_4', 'run_5', 'run_6', 'run_7', 'run_8'];

export const STATION_META: Record<StationKey, { label: string; short: string; weight: number }> = {
  ski:       { label: 'SkiErg',             short: 'Ski',    weight: 0.15 },
  sled_push: { label: 'Sled push',          short: 'Push',   weight: 0.45 },
  sled_pull: { label: 'Sled pull',          short: 'Pull',   weight: 0.55 },
  bbj:       { label: 'Burpee broad jump',  short: 'BBJ',    weight: 0.75 },
  row:       { label: 'Rameur',             short: 'Row',    weight: 0.20 },
  farmers:   { label: 'Farmers carry',      short: 'Farm',   weight: 0.20 },
  lunges:    { label: 'Sandbag lunges',     short: 'Lung',   weight: 0.60 },
  wall_balls:{ label: 'Wall balls',         short: 'WB',     weight: 1.00 },
};

export const ROXZONE_WEIGHT = 0.3;

const LOADS_MEN     = { sled_push: '152 kg', sled_pull: '103 kg', farmers: '2 × 24 kg', lunges: '20 kg', wall_balls: '6 kg / 3 m', ski: '1000 m', bbj: '80 m', row: '1000 m' } as const;
const LOADS_WOMEN   = { sled_push: '102 kg', sled_pull: '78 kg',  farmers: '2 × 16 kg', lunges: '10 kg', wall_balls: '4 kg / 2,70 m', ski: '1000 m', bbj: '80 m', row: '1000 m' } as const;
const LOADS_MEN_PRO = { sled_push: '202 kg', sled_pull: '153 kg', farmers: '2 × 32 kg', lunges: '30 kg', wall_balls: '9 kg / 3 m', ski: '1000 m', bbj: '80 m', row: '1000 m' } as const;
const LOADS_WOMEN_PRO = { sled_push: '152 kg', sled_pull: '103 kg', farmers: '2 × 24 kg', lunges: '20 kg', wall_balls: '6 kg / 3 m', ski: '1000 m', bbj: '80 m', row: '1000 m' } as const;

export const DIVISION_LOADS: Record<string, Record<StationKey, string>> = {
  men: LOADS_MEN, men_pro: LOADS_MEN_PRO, women: LOADS_WOMEN, women_pro: LOADS_WOMEN_PRO,
  doubles_men: LOADS_MEN, doubles_men_pro: LOADS_MEN_PRO,
  doubles_women: LOADS_WOMEN, doubles_women_pro: LOADS_WOMEN_PRO,
  doubles_mixed: LOADS_MEN,
  relay_men: LOADS_MEN, relay_women: LOADS_WOMEN, relay_mixed: LOADS_MEN,
};

export function REFERENCE_DIVISION(division: HyroxDivision): string {
  switch (division) {
    case 'men': return 'men';
    case 'men_pro': return 'men_pro';
    case 'women': return 'women';
    case 'women_pro': return 'women_pro';
    case 'doubles_men': return 'doubles_men';
    case 'doubles_men_pro': return 'doubles_men_pro';
    case 'doubles_women': return 'doubles_women';
    case 'doubles_women_pro': return 'doubles_women_pro';
    case 'doubles_mixed': return 'doubles_mixed';
    case 'relay_men': return 'relay_men';
    case 'relay_women': return 'relay_women';
    case 'relay_mixed': return 'relay_mixed';
    case 'adaptive': return 'men'; // pas assez de data adaptive, fallback men
    default: return 'men';
  }
}

export const SEGMENT_LABEL: Record<string, string> = {
  run_1: 'Run 1', run_2: 'Run 2', run_3: 'Run 3', run_4: 'Run 4',
  run_5: 'Run 5', run_6: 'Run 6', run_7: 'Run 7', run_8: 'Run 8',
  ski: 'SkiErg', sled_push: 'Sled push', sled_pull: 'Sled pull', bbj: 'Burpee broad jump',
  row: 'Rameur', farmers: 'Farmers carry', lunges: 'Sandbag lunges', wall_balls: 'Wall balls',
  roxzone_total: 'Roxzone', run_total: 'Course totale',
};
