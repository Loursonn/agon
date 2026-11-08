-- Tests : RPC save_athlete_test_result (migration 20261109120000_tests_rpcs).
-- Toujours annulé (ROLLBACK final) : rien ne reste en base. À lancer AVEC la
-- migration, dans la même transaction :
--   (echo 'BEGIN;'; cat supabase/migrations/20261109120000_tests_rpcs.sql \
--      supabase/tests/tests_rpcs.sql) > /tmp/t.sql
--   supabase db query --linked -f /tmp/t.sql
-- (ce fichier se termine par ROLLBACK ; son BEGIN ci-dessous est alors un simple
-- avertissement « transaction déjà ouverte »).
-- Chaque ligne k → v : la valeur attendue est dans le libellé. Aucune donnée
-- d'athlète n'est affichée : seulement des booléens et des comptes.

BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated, anon; GRANT ALL ON SEQUENCE r_n_seq TO authenticated, anon;

-- Un athlète avec un coach référent ; un coach qui n'est ni son référent ni
-- son co-coach ; un test à au moins deux variables SANS extrapolation (aucune
-- référence créée) et une variable d'un autre test.
CREATE TEMP TABLE ids ON COMMIT DROP AS
WITH def AS (
  SELECT td.id FROM test_definitions td
   WHERE (SELECT count(*) FROM test_variables tv WHERE tv.test_definition_id = td.id) >= 2
     AND NOT EXISTS (SELECT 1 FROM test_variables tv WHERE tv.test_definition_id = td.id AND tv.extrap_metric IS NOT NULL)
   ORDER BY td.created_at LIMIT 1
)
SELECT a.id AS ath, a.coach_id AS coach,
  (SELECT p.id FROM profiles p
    WHERE p.role IN ('coach', 'coach_athlete') AND p.id <> a.id AND p.id <> a.coach_id
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = a.id AND cc.co_coach_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM profiles x WHERE x.id = p.id AND x.is_admin)
    ORDER BY p.created_at LIMIT 1) AS other_coach,
  (SELECT id FROM def) AS def,
  (SELECT tv.id FROM test_variables tv WHERE tv.test_definition_id = (SELECT id FROM def) ORDER BY tv.key LIMIT 1) AS v1,
  (SELECT tv.id FROM test_variables tv WHERE tv.test_definition_id = (SELECT id FROM def) ORDER BY tv.key OFFSET 1 LIMIT 1) AS v2,
  (SELECT tv.id FROM test_variables tv WHERE tv.test_definition_id <> (SELECT id FROM def) ORDER BY tv.created_at LIMIT 1) AS foreign_var,
  (SELECT count(*) FROM athlete_test_results x WHERE x.athlete_id = a.id) AS results_before,
  (SELECT count(*) FROM performance_logs x WHERE x.athlete_id = a.id) AS perf_before,
  NULL::uuid AS res
FROM profiles a
WHERE a.role = 'athlete' AND a.coach_id IS NOT NULL AND a.coach_id <> a.id
  AND NOT EXISTS (SELECT 1 FROM profiles c WHERE c.id = a.coach_id AND c.is_admin)
ORDER BY a.created_at LIMIT 1;
GRANT SELECT, UPDATE ON ids TO authenticated, anon;

INSERT INTO r(k,v) SELECT '00 jeu de test complet (true)',
  (ath IS NOT NULL AND coach IS NOT NULL AND other_coach IS NOT NULL AND def IS NOT NULL
   AND v1 IS NOT NULL AND v2 IS NOT NULL AND foreign_var IS NOT NULL)::text FROM ids;
INSERT INTO r(k,v) VALUES
  ('01 droit anon (false)', has_function_privilege('anon', 'public.save_athlete_test_result(uuid,uuid,date,text,jsonb,uuid)', 'EXECUTE')::text),
  ('02 droit authenticated (true)', has_function_privilege('authenticated', 'public.save_athlete_test_result(uuid,uuid,date,text,jsonb,uuid)', 'EXECUTE')::text),
  ('03 SECURITY DEFINER + search_path (true)', (SELECT prosecdef AND proconfig @> ARRAY['search_path=public']
     FROM pg_proc WHERE oid = 'public.save_athlete_test_result(uuid,uuid,date,text,jsonb,uuid)'::regprocedure)::text);

SET LOCAL ROLE authenticated;

-- ── Le coach référent ─────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role', 'authenticated')::text FROM ids), true);
UPDATE ids SET res = save_athlete_test_result(ath, def, '1999-01-02', '  note  ',
  jsonb_build_object(v1::text, 12.5, v2::text, 3));
INSERT INTO r(k,v) SELECT 'A1 crée le résultat (true)', (res IS NOT NULL)::text FROM ids;
INSERT INTO r(k,v) SELECT 'A2 deux valeurs (2)', (SELECT count(*) FROM athlete_test_values WHERE result_id = res)::text FROM ids;
INSERT INTO r(k,v) SELECT 'A3 notes rognées (true)', ((SELECT notes FROM athlete_test_results WHERE id = res) = 'note')::text FROM ids;
INSERT INTO r(k,v) SELECT 'A4 un résultat de plus (1)',
  ((SELECT count(*) FROM athlete_test_results x WHERE x.athlete_id = ath) - results_before)::text FROM ids;

SELECT save_athlete_test_result(ath, def, '1999-01-03', '', jsonb_build_object(v1::text, 14), res) FROM ids;
INSERT INTO r(k,v) SELECT 'B1 valeur modifiée (14)', (SELECT value FROM athlete_test_values WHERE result_id = res AND variable_id = v1)::text FROM ids;
INSERT INTO r(k,v) SELECT 'B2 valeur retirée (1)', (SELECT count(*) FROM athlete_test_values WHERE result_id = res)::text FROM ids;
INSERT INTO r(k,v) SELECT 'B3 date et notes à jour (true)',
  ((SELECT performed_at = '1999-01-03' AND notes IS NULL FROM athlete_test_results WHERE id = res))::text FROM ids;
INSERT INTO r(k,v) SELECT 'B4 toujours un seul résultat de plus (1)',
  ((SELECT count(*) FROM athlete_test_results x WHERE x.athlete_id = ath) - results_before)::text FROM ids;

DO $$ BEGIN
  PERFORM save_athlete_test_result(ath, def, '1999-01-09', 'x', jsonb_build_object(v1::text, 99, foreign_var::text, 1), res) FROM ids;
  INSERT INTO r(k,v) VALUES ('C1 variable d''un autre test', 'ACCEPTÉE (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('C1 variable d''un autre test', 'refusée (OK)'); END $$;
INSERT INTO r(k,v) SELECT 'C2 rien n''a changé après le refus (true)',
  ((SELECT performed_at = '1999-01-03' FROM athlete_test_results WHERE id = res)
   AND (SELECT value FROM athlete_test_values WHERE result_id = res AND variable_id = v1) = 14)::text FROM ids;
DO $$ BEGIN
  PERFORM save_athlete_test_result(ath, def, '1999-01-09', '', jsonb_build_object(v1::text, 'beaucoup'), res) FROM ids;
  INSERT INTO r(k,v) VALUES ('C3 valeur non numérique', 'ACCEPTÉE (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('C3 valeur non numérique', 'refusée (OK)'); END $$;
DO $$ BEGIN
  PERFORM save_athlete_test_result(coach, def, '1999-01-09', '', '{}'::jsonb, res) FROM ids;
  INSERT INTO r(k,v) VALUES ('C4 résultat rattaché à un autre athlète', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('C4 résultat rattaché à un autre athlète', 'refusé (OK)'); END $$;
DO $$ BEGIN
  PERFORM save_athlete_test_result(ath, def, NULL, '', '{}'::jsonb) FROM ids;
  INSERT INTO r(k,v) VALUES ('C5 date manquante', 'ACCEPTÉE (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('C5 date manquante', 'refusée (OK)'); END $$;
INSERT INTO r(k,v) SELECT 'C6 aucune référence créée (test sans extrapolation) (0)',
  ((SELECT count(*) FROM performance_logs x WHERE x.athlete_id = ath) - perf_before)::text FROM ids;

-- ── Un autre coach ────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', other_coach, 'role', 'authenticated')::text FROM ids), true);
DO $$ BEGIN
  PERFORM save_athlete_test_result(ath, def, '1999-01-04', '', '{}'::jsonb) FROM ids;
  INSERT INTO r(k,v) VALUES ('D1 autre coach crée un résultat', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('D1 autre coach crée un résultat', 'refusé (OK)'); END $$;
DO $$ BEGIN
  PERFORM save_athlete_test_result(ath, def, '1999-01-04', '', '{}'::jsonb, res) FROM ids;
  INSERT INTO r(k,v) VALUES ('D2 autre coach modifie le résultat', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('D2 autre coach modifie le résultat', 'refusé (OK)'); END $$;

-- ── L'athlète lui-même ────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', ath, 'role', 'authenticated')::text FROM ids), true);
DO $$ BEGIN
  PERFORM save_athlete_test_result(ath, def, '1999-01-05', '', '{}'::jsonb) FROM ids;
  INSERT INTO r(k,v) VALUES ('E1 l''athlète écrit directement un résultat', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('E1 l''athlète écrit directement un résultat', 'refusé (OK)'); END $$;
INSERT INTO r(k,v) SELECT 'E2 l''athlète lit toujours son résultat (1)',
  (SELECT count(*) FROM athlete_test_results WHERE id = res)::text FROM ids;

-- ── anon ──────────────────────────────────────────────────────────────────────
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$ BEGIN
  PERFORM save_athlete_test_result(gen_random_uuid(), gen_random_uuid(), '1999-01-06', '', '{}'::jsonb);
  INSERT INTO r(k,v) VALUES ('F1 anon appelle la RPC', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('F1 anon appelle la RPC', 'refusé (OK)'); END $$;

RESET ROLE;
SELECT k, v FROM r ORDER BY n;
ROLLBACK;
