export type TestKind    = 'preset' | 'custom';
export type ValueType   = 'number' | 'pace' | 'duration' | 'scale5';
export type BetterWhen  = 'higher' | 'lower';

export type TestCategory =
  | 'bilan_articulaire' | 'endurance' | 'force' | 'explosivite' | 'vitesse';

export const TEST_CATEGORY_LABEL: Record<TestCategory, string> = {
  bilan_articulaire: 'Bilan articulaire',
  endurance:         'Endurance',
  force:             'Force',
  explosivite:       'Explosivité',
  vitesse:           'Vitesse',
};

export const TEST_CATEGORY_COLOR: Record<TestCategory, string> = {
  bilan_articulaire: '#33B5FF', // bleu
  endurance:         '#66F03C', // vert
  force:             '#FF5A33', // rouge
  explosivite:       '#FF9500', // orange
  vitesse:           '#FFC933', // violet
};

export const TEST_CATEGORY_ORDER: TestCategory[] = [
  'bilan_articulaire', 'endurance', 'force', 'explosivite', 'vitesse',
];

export type TestFillMode = 'self' | 'coach';

export const TEST_FILL_MODE_LABEL: Record<TestFillMode, string> = {
  self:  'Rempli par l’athlète',
  coach: 'Rempli par le coach (vidéo à envoyer)',
};

export const ARTICULATIONS = ['Épaule', 'Hanche', 'Genou', 'Cheville'] as const;

export interface TestDefinition {
  id: string;
  name: string;
  kind: TestKind;
  category: TestCategory | null;
  articulation: string | null;
  media_url: string | null;
  fill_mode: TestFillMode;
  created_by: string | null;
  is_global: boolean;
  description: string | null;
  protocol: { text?: string } | null;
  created_at: string;
  updated_at: string;
}

export type ExtrapOp = 'div' | 'mul';

export const PHYSIO_METRICS: { key: string; label: string; unit: string }[] = [
  { key: 'VMA',    label: 'VMA',     unit: 'km/h' },
  { key: 'Vmax',   label: 'Vmax',    unit: 'km/h' },
  { key: 'VC',     label: 'VC',      unit: 'km/h' },
  { key: 'VO2max', label: 'VO₂max',  unit: 'mL/kg/min' },
  { key: 'PMA',    label: 'PMA',     unit: 'W' },
  { key: 'FTP',    label: 'FTP',     unit: 'W' },
  { key: 'FCmax',  label: 'FCmax',   unit: 'bpm' },
];

export interface TestVariable {
  id: string;
  test_definition_id: string;
  key: string;
  label: string;
  unit: string;
  value_type: ValueType;
  better_when: BetterWhen;
  extrap_metric: string | null;
  extrap_op: ExtrapOp | null;
  extrap_factor: number | null;
  created_at: string;
}

export interface TestDefinitionWithVariables extends TestDefinition {
  test_variables: TestVariable[];
}

export interface AthleteTestValue {
  id: string;
  result_id: string;
  variable_id: string;
  value: number;
  test_variables?: TestVariable;
}

export interface AthleteTestResult {
  id: string;
  athlete_id: string;
  test_definition_id: string;
  performed_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  test_definitions?: TestDefinitionWithVariables;
  athlete_test_values?: AthleteTestValue[];
}

export interface AthleteCurrentValue {
  athlete_id: string;
  variable_id: string;
  key: string;
  label: string;
  unit: string;
  value_type: ValueType;
  better_when: BetterWhen;
  current_value: number;
  best_performed_at: string;
}

// ── Inputs mutations ──────────────────────────────────────────────────────────

export interface CreateVariableInput {
  key: string;
  label: string;
  unit: string;
  value_type: ValueType;
  better_when: BetterWhen;
  extrap_metric: string | null;
  extrap_op: ExtrapOp | null;
  extrap_factor: number | null;
}

export interface CreateTestDefinitionInput {
  name: string;
  category: TestCategory | null;
  articulation: string | null;
  media_url: string | null;
  fill_mode: TestFillMode;
  description: string;
  protocol: string;
  variables: CreateVariableInput[];
}

export interface UpdateTestDefinitionInput {
  id: string;
  name: string;
  category: TestCategory | null;
  articulation: string | null;
  media_url: string | null;
  fill_mode: TestFillMode;
  description: string;
  protocol: string;
  variables: CreateVariableInput[];
}

export interface CreateTestResultInput {
  test_definition_id: string;
  performed_at: string;
  notes: string;
  values: Record<string, number>; // variable_id → numeric value
}
