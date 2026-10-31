-- Tests RLS Tests HYROX — simulation coach / athlète / autre athlète / autre coach.
-- Toujours annulé (ROLLBACK final) : rien ne reste en base.
-- Lancer : supabase db query --linked -f supabase/tests/hyrox_tests_rls.sql
-- Chaque ligne k → v : la valeur attendue est dans le libellé.

BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;
CREATE TEMP TABLE ids(athlete uuid, coach uuid, other_athlete uuid, other_coach uuid, analysis uuid) ON COMMIT DROP;
INSERT INTO ids(athlete, coach, other_athlete, other_coach)
SELECT a.id, a.coach_id, b.id, b.coach_id
FROM profiles a
JOIN profiles c ON c.id = a.coach_id AND NOT c.is_admin
JOIN LATERAL (
  SELECT o.id, o.coach_id FROM profiles o JOIN profiles oc ON oc.id = o.coach_id AND NOT oc.is_admin
  WHERE o.role = 'athlete' AND o.coach_id IS DISTINCT FROM a.coach_id AND o.id <> a.coach_id AND o.coach_id <> a.id
  ORDER BY o.created_at LIMIT 1
) b ON true
WHERE a.role = 'athlete' AND a.coach_id IS NOT NULL AND a.coach_id <> a.id AND NOT a.is_admin AND NOT b.id = a.id
ORDER BY a.created_at LIMIT 1;
GRANT ALL ON ids TO authenticated;
INSERT INTO r(k,v) SELECT 'setup ids (true)', (athlete IS NOT NULL AND other_athlete IS NOT NULL AND other_coach IS NOT NULL)::text FROM ids;

SET LOCAL ROLE authenticated;

-- ===== Athlète =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'A1 grilles v1 lisibles (32)', count(*)::text FROM hyrox_test_grids WHERE version = 'v1';
INSERT INTO r(k,v) SELECT 'A2 batterie v3 lisible (21)', count(*)::text FROM test_definitions WHERE battery = 'hyrox_v3';
DO $$ BEGIN
  INSERT INTO hyrox_test_grid_versions(version) VALUES ('test-rls');
  INSERT INTO r(k,v) VALUES ('A3 écriture des grilles', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A3 écriture des grilles', 'refusé (OK)'); END $$;
DO $$ BEGIN
  INSERT INTO hyrox_test_analyses(athlete_id, kind, date, inputs, profile, outputs, algo_version, grid_version)
  SELECT athlete, 'bilan', current_date, '{}', '{}', '{}', 'x', 'v1' FROM ids;
  INSERT INTO r(k,v) VALUES ('A4 l''athlète crée son analyse', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A4 l''athlète crée son analyse', 'refusé (OK)'); END $$;
-- Saisie par le circuit existant : le BBJ du bilan va sur le preset v3, pas sur l'ancien du même nom
INSERT INTO test_sessions(athlete_id, coach_id, title, type, date, completed, results_structured)
SELECT athlete, coach, 'Burpee broad jump 80 m · bilan', 'autre', DATE '2000-01-02', true, '{"variables":{"time":250,"jumps":38,"rpe":9}}' FROM ids;
INSERT INTO r(k,v) SELECT 'A5 saisie BBJ -> preset e2, 3 valeurs (e2|3)', string_agg(right(res.test_definition_id::text, 2) || '|' || (SELECT count(*) FROM athlete_test_values v WHERE v.result_id = res.id), ',')
  FROM athlete_test_results res WHERE res.athlete_id = (SELECT athlete FROM ids) AND res.performed_at = DATE '2000-01-02';

-- ===== Coach de l'athlète =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role', 'authenticated')::text FROM ids), true);
WITH ins AS (
  INSERT INTO hyrox_test_analyses(athlete_id, kind, date, inputs, profile, outputs, algo_version, grid_version, created_by)
  SELECT athlete, 'bilan', DATE '2000-01-02', '{"dead_hang_s":75}', '{"sex":"H","category":"Open"}', '{}', 'hyrox-tests@1.0.0', 'v1', coach FROM ids
  RETURNING id
) UPDATE ids SET analysis = (SELECT id FROM ins);
INSERT INTO r(k,v) SELECT 'C1 le coach crée l''analyse (true)', (analysis IS NOT NULL)::text FROM ids;
INSERT INTO hyrox_test_axes_drafts(analysis_id, context) SELECT analysis, '{"competition":"A"}' FROM ids;
INSERT INTO r(k,v) SELECT 'C2 brouillon lisible par le coach (1)', count(*)::text FROM hyrox_test_axes_drafts WHERE analysis_id = (SELECT analysis FROM ids);
DO $$ BEGIN
  UPDATE hyrox_test_analyses SET inputs = '{"dead_hang_s":90}' WHERE id = (SELECT analysis FROM ids);
  INSERT INTO r(k,v) VALUES ('C3 modifier les entrées (gel)', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('C3 modifier les entrées (gel)', 'refusé (OK)'); END $$;

-- ===== Athlète avant validation =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'A6 analyse non validée invisible (0)', count(*)::text FROM hyrox_test_analyses WHERE id = (SELECT analysis FROM ids);

-- ===== Validation par le coach =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role', 'authenticated')::text FROM ids), true);
UPDATE hyrox_test_analyses SET axes_validated = '{"principal1":{"label":"Course","detail":""}}', validated_at = now(), validated_by = (SELECT coach FROM ids), target_s = 4800
 WHERE id = (SELECT analysis FROM ids);

-- ===== Athlète après validation =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'A7 analyse validée visible (1)', count(*)::text FROM hyrox_test_analyses WHERE id = (SELECT analysis FROM ids);
INSERT INTO r(k,v) SELECT 'A8 brouillon jamais visible (0)', count(*)::text FROM hyrox_test_axes_drafts WHERE analysis_id = (SELECT analysis FROM ids);
UPDATE hyrox_test_analyses SET target_s = 1 WHERE id = (SELECT analysis FROM ids);
INSERT INTO r(k,v) SELECT 'A9 l''athlète ne modifie pas (4800)', target_s::text FROM hyrox_test_analyses WHERE id = (SELECT analysis FROM ids);

-- ===== Autre athlète, autre coach =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', other_athlete, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'O1 autre athlète (0)', count(*)::text FROM hyrox_test_analyses WHERE id = (SELECT analysis FROM ids);
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', other_coach, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'O2 autre coach (0)', count(*)::text FROM hyrox_test_analyses WHERE id = (SELECT analysis FROM ids);
INSERT INTO r(k,v) SELECT 'O3 autre coach, brouillon (0)', count(*)::text FROM hyrox_test_axes_drafts WHERE analysis_id = (SELECT analysis FROM ids);
DO $$ BEGIN
  INSERT INTO hyrox_test_analyses(athlete_id, kind, date, inputs, profile, outputs, algo_version, grid_version)
  SELECT athlete, 'retest', current_date, '{}', '{}', '{}', 'x', 'v1' FROM ids;
  INSERT INTO r(k,v) VALUES ('O4 autre coach crée une analyse', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('O4 autre coach crée une analyse', 'refusé (OK)'); END $$;

RESET ROLE;
SELECT k, v FROM r ORDER BY n;
ROLLBACK;
