-- Tests de 20261108100000_workout_rpcs.sql (RPC des séances réalisées).
-- Usage (base liée, rien n'est conservé) :
--   { echo BEGIN; cat supabase/migrations/20261108100000_workout_rpcs.sql; cat supabase/tests/workout_rpcs.sql; echo ROLLBACK; } > /tmp/x.sql
--   supabase db query --linked -f /tmp/x.sql
-- Chaque ligne de résultat doit avoir ok = true.
-- Les séances de test sont créées dans la transaction (annulée à la fin).

-- ===== Préparation =====
CREATE TEMP TABLE t_ids AS
SELECT
  (SELECT a.id FROM profiles a JOIN profiles c ON c.id = a.coach_id
    WHERE a.role = 'athlete' AND a.coach_id <> a.id AND NOT coalesce(a.is_pending, false) ORDER BY c.is_admin LIMIT 1) AS athlete,
  NULL::uuid AS coach, NULL::uuid AS other_coach,
  gen_random_uuid() AS log, gen_random_uuid() AS foreign_log;
UPDATE t_ids SET coach = (SELECT coach_id FROM profiles WHERE id = t_ids.athlete);
UPDATE t_ids SET other_coach = (
  SELECT id FROM profiles p WHERE p.role IN ('coach', 'coach_athlete') AND p.id <> t_ids.coach
     AND p.id <> t_ids.athlete
     AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = t_ids.athlete AND cc.co_coach_id = p.id)
     AND coalesce(p.coach_id::text, '') <> t_ids.coach::text
   LIMIT 1);
-- Séance de l'athlète : une série saisie + une adaptation du coach déjà posée.
INSERT INTO workout_logs (id, athlete_id, session_id, session_name, scheduled_date, status, athlete_modifications)
SELECT log, athlete, 'test-rpc-' || log, 'Test RPC', current_date + 400, 'planned',
       '{"sessionSets":{"e1":[{"done":true,"kg":80,"reps":5}]},"coachOverride":{"blocs":["coach"],"createdAt":"2026-01-01"}}'::jsonb
FROM t_ids;
-- Séance d'un autre (l'autre coach, sans lien avec l'athlète ni son coach).
INSERT INTO workout_logs (id, athlete_id, session_id, session_name, scheduled_date, status)
SELECT foreign_log, other_coach, 'test-rpc-' || foreign_log, 'Test RPC autre', current_date + 400, 'planned' FROM t_ids;

CREATE TEMP TABLE t_res (name text, ok boolean, detail text);
GRANT ALL ON t_ids, t_res TO anon, authenticated;

-- ---------- DROITS & PARITÉ ----------
DO $$ DECLARE ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  INSERT INTO t_res VALUES ('prépa: athlète, coach, autre coach trouvés',
    ids.athlete IS NOT NULL AND ids.coach IS NOT NULL AND ids.other_coach IS NOT NULL, '');
  INSERT INTO t_res VALUES ('droits: anon sans EXECUTE',
    NOT has_function_privilege('anon', 'public.complete_workout(uuid,jsonb,numeric,smallint)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.patch_workout_entries(uuid,jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.set_coach_override(uuid,jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.reopen_workout(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.set_workout_rpe(uuid,smallint)', 'EXECUTE'), '');
  INSERT INTO t_res VALUES ('droits: authenticated a EXECUTE',
    has_function_privilege('authenticated', 'public.complete_workout(uuid,jsonb,numeric,smallint)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.set_coach_override(uuid,jsonb)', 'EXECUTE'), '');
  INSERT INTO t_res VALUES ('droits: helper interne fermé à authenticated',
    NOT has_function_privilege('authenticated', 'public._workout_log_for_write(uuid,boolean)', 'EXECUTE'), '');
  -- Parité front/SQL : mêmes cas que domain/__tests__/athleteMods.test.ts
  INSERT INTO t_res VALUES ('parité has_entries',
        workout_log_has_entries(NULL) = false
    AND workout_log_has_entries('{}') = false
    AND workout_log_has_entries('{"sessionSets":{"e":[{"done":true}]}}') = false
    AND workout_log_has_entries('{"sessionSets":{"e":[{"done":true,"kg":null,"reps":null}]}}') = false
    AND workout_log_has_entries('{"sessionSets":{"e":[{"done":false,"reps":0}]}}') = true
    AND workout_log_has_entries('{"sessionSets":{"e":[{"kg":""}]}}') = true
    AND workout_log_has_entries('{"sessionSets":{"e":"x","f":[null,3,{"reps":8}]}}') = true
    AND workout_log_has_entries('{"sessionSets":[{"kg":1}]}') = false
    AND workout_log_has_entries('{"sessionSets":"x"}') = false
    AND workout_log_has_entries('"pas un objet"') = false, '');
  -- Aucune séance existante ne change de verdict avec la version durcie.
  INSERT INTO t_res VALUES ('has_entries durcie: même verdict sur toutes les séances',
    (SELECT count(*) FROM workout_logs WHERE athlete_modifications IS NOT NULL
        AND workout_log_has_entries(athlete_modifications)) =
    (SELECT count(*) FROM workout_logs WHERE jsonb_typeof(athlete_modifications -> 'sessionSets') = 'object'
        AND EXISTS (SELECT 1 FROM jsonb_each(athlete_modifications -> 'sessionSets') ex(k, v),
                    jsonb_array_elements(CASE WHEN jsonb_typeof(ex.v) = 'array' THEN ex.v ELSE '[]' END) s(i)
                    WHERE jsonb_typeof(s.i) = 'object'
                      AND ((s.i ? 'kg' AND jsonb_typeof(s.i -> 'kg') <> 'null') OR (s.i ? 'reps' AND jsonb_typeof(s.i -> 'reps') <> 'null')))), '');
  INSERT INTO t_res VALUES ('rattrapage RPE: plus de séance validée sans rpe_score alors que workout_rpe en a un',
    NOT EXISTS (SELECT 1 FROM workout_rpe r JOIN workout_logs w ON w.id = r.workout_log_id
                 WHERE w.rpe_score IS NULL AND w.status = 'completed'), '');
END $$;

-- ---------- ANON ----------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$ DECLARE ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  BEGIN PERFORM complete_workout(ids.log); INSERT INTO t_res VALUES ('anon: valider refusé', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('anon: valider refusé', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM patch_workout_entries(ids.log, '{"sessionForme":1}'); INSERT INTO t_res VALUES ('anon: saisie refusée', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('anon: saisie refusée', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
END $$;
RESET ROLE;

-- ---------- ATHLÈTE ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT athlete FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; r workout_logs; BEGIN
  SELECT * INTO ids FROM t_ids;

  r := patch_workout_entries(ids.log, '{"sessionSets":{"e1":[{"done":true,"kg":82.5,"reps":5}]},"sessionForme":4,"coachOverride":{"blocs":["périmé"]}}');
  INSERT INTO t_res VALUES ('athlète: saisie fusionnée',
    r.athlete_modifications -> 'sessionSets' -> 'e1' -> 0 ->> 'kg' = '82.5' AND (r.athlete_modifications ->> 'sessionForme') = '4', r.athlete_modifications::text);
  INSERT INTO t_res VALUES ('athlète: adaptation du coach gardée (P5)',
    r.athlete_modifications -> 'coachOverride' -> 'blocs' = '["coach"]'::jsonb, r.athlete_modifications::text);

  r := patch_workout_entries(ids.log, '{"coachOverride":null}');
  INSERT INTO t_res VALUES ('athlète: patch qui ne porte que coachOverride = sans effet',
    r.athlete_modifications -> 'coachOverride' -> 'blocs' = '["coach"]'::jsonb, '');

  r := complete_workout(ids.log, '{"sessionComment":"bien"}', 5.2, NULL);
  INSERT INTO t_res VALUES ('athlète: validation',
    r.status = 'completed' AND r.completed_at IS NOT NULL AND r.run_distance_km = 5.2
    AND r.athlete_modifications ->> 'sessionComment' = 'bien'
    AND r.athlete_modifications -> 'sessionSets' -> 'e1' -> 0 ->> 'kg' = '82.5'
    AND r.athlete_modifications -> 'coachOverride' -> 'blocs' = '["coach"]'::jsonb, r.status);

  r := set_workout_rpe(ids.log, 7::smallint);
  r := set_workout_rpe(ids.log, 8::smallint);
  INSERT INTO t_res VALUES ('athlète: 2e RPE accepté (plus d''échec workout_rpe)', r.rpe_score = 8, r.rpe_score::text);
  BEGIN PERFORM set_workout_rpe(ids.log, 11::smallint); INSERT INTO t_res VALUES ('athlète: RPE 11 refusé', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: RPE 11 refusé', SQLSTATE = '22023', SQLSTATE || ' ' || SQLERRM); END;

  BEGIN PERFORM set_coach_override(ids.log, '{"blocs":[]}'); INSERT INTO t_res VALUES ('athlète: poser une adaptation refusé', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: poser une adaptation refusé', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;

  BEGIN PERFORM patch_workout_entries(ids.foreign_log, '{"sessionForme":1}'); INSERT INTO t_res VALUES ('athlète: séance d''un autre refusée', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: séance d''un autre refusée', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;

  BEGIN PERFORM patch_workout_entries(gen_random_uuid(), '{"sessionForme":1}'); INSERT INTO t_res VALUES ('athlète: séance inexistante = P0002', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: séance inexistante = P0002', SQLSTATE = 'P0002', SQLSTATE || ' ' || SQLERRM); END;

  BEGIN PERFORM patch_workout_entries(ids.log, '[1]'); INSERT INTO t_res VALUES ('athlète: saisie non objet refusée', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: saisie non objet refusée', SQLSTATE = '22023', SQLSTATE || ' ' || SQLERRM); END;
END $$;
RESET ROLE;

-- Idempotence : completed_at déjà posé n'est pas réécrit par un 2e appel.
UPDATE workout_logs SET completed_at = '2026-01-01T10:00:00Z' WHERE id = (SELECT log FROM t_ids);
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT athlete FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; r workout_logs; BEGIN
  SELECT * INTO ids FROM t_ids;
  r := complete_workout(ids.log, NULL, NULL, NULL);
  INSERT INTO t_res VALUES ('athlète: validation rejouée = idempotente',
    r.completed_at = '2026-01-01T10:00:00Z'::timestamptz AND r.rpe_score = 8 AND r.run_distance_km = 5.2, r.completed_at::text);

  r := reopen_workout(ids.log);
  INSERT INTO t_res VALUES ('athlète: réouverture',
    r.status = 'planned' AND r.completed_at IS NULL AND r.rpe_score IS NULL
    AND r.athlete_modifications -> 'sessionSets' -> 'e1' -> 0 ->> 'kg' = '82.5', r.status);
  r := reopen_workout(ids.log);
  INSERT INTO t_res VALUES ('athlète: réouverture rejouée sans effet', r.status = 'planned', r.status);
END $$;
RESET ROLE;

-- ---------- COACH ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT coach FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; r workout_logs; BEGIN
  SELECT * INTO ids FROM t_ids;
  r := set_coach_override(ids.log, '{"blocs":["nouveau"],"note":"allégé"}');
  INSERT INTO t_res VALUES ('coach: adaptation posée, saisie de l''athlète gardée',
    r.athlete_modifications -> 'coachOverride' -> 'blocs' = '["nouveau"]'::jsonb
    AND r.athlete_modifications -> 'coachOverride' ? 'createdAt'
    AND r.athlete_modifications -> 'sessionSets' -> 'e1' -> 0 ->> 'kg' = '82.5', r.athlete_modifications::text);
  r := set_coach_override(ids.log, NULL);
  INSERT INTO t_res VALUES ('coach: adaptation retirée',
    NOT (r.athlete_modifications ? 'coachOverride') AND r.athlete_modifications ? 'sessionSets', r.athlete_modifications::text);
  BEGIN PERFORM set_coach_override(ids.log, '{"note":"sans blocs"}'); INSERT INTO t_res VALUES ('coach: adaptation sans blocs refusée', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('coach: adaptation sans blocs refusée', SQLSTATE = '22023', SQLSTATE || ' ' || SQLERRM); END;
  r := complete_workout(ids.log, NULL, NULL, 6::smallint);
  INSERT INTO t_res VALUES ('coach: valide pour son athlète', r.status = 'completed' AND r.rpe_score = 6, r.status);
  BEGIN PERFORM set_coach_override(ids.foreign_log, '{"blocs":[]}'); INSERT INTO t_res VALUES ('coach: adaptation chez un étranger refusée', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('coach: adaptation chez un étranger refusée', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
END $$;
RESET ROLE;

-- Retirer la dernière clé remet NULL (séance sans trace).
UPDATE workout_logs SET athlete_modifications = '{"coachOverride":{"blocs":[]}}' WHERE id = (SELECT log FROM t_ids);
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT coach FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; r workout_logs; BEGIN
  SELECT * INTO ids FROM t_ids;
  r := set_coach_override(ids.log, NULL);
  INSERT INTO t_res VALUES ('coach: retirer la seule adaptation → NULL', r.athlete_modifications IS NULL, coalesce(r.athlete_modifications::text, 'NULL'));
  r := patch_workout_entries(ids.log, '{}');
  INSERT INTO t_res VALUES ('patch vide: NULL reste NULL', r.athlete_modifications IS NULL, coalesce(r.athlete_modifications::text, 'NULL'));
END $$;
RESET ROLE;

-- ---------- AUTRE COACH ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT other_coach FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  BEGIN PERFORM patch_workout_entries(ids.log, '{"sessionForme":1}'); INSERT INTO t_res VALUES ('autre coach: saisie refusée', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('autre coach: saisie refusée', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM set_coach_override(ids.log, '{"blocs":[]}'); INSERT INTO t_res VALUES ('autre coach: adaptation refusée', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('autre coach: adaptation refusée', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM complete_workout(ids.log); INSERT INTO t_res VALUES ('autre coach: validation refusée', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('autre coach: validation refusée', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM reopen_workout(ids.log); INSERT INTO t_res VALUES ('autre coach: réouverture refusée', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('autre coach: réouverture refusée', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM set_workout_rpe(ids.log, 5::smallint); INSERT INTO t_res VALUES ('autre coach: RPE refusé', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('autre coach: RPE refusé', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
END $$;
RESET ROLE;

SELECT name, ok, left(detail, 90) AS detail FROM t_res;
