-- Tests de 20261109130000_energy_rpcs.sql (RPC des séances énergie programmées).
-- Usage (base liée, rien n'est conservé) :
--   { echo 'BEGIN;'; cat supabase/migrations/20261109130000_energy_rpcs.sql; cat supabase/tests/energy_rpcs.sql; echo 'ROLLBACK;'; } > /tmp/x.sql
--   supabase db query --linked -f /tmp/x.sql
-- Chaque ligne de résultat doit avoir ok = true.
-- La séance et les assignations de test sont créées dans la transaction (annulée à la fin).

-- ===== Préparation =====
CREATE TEMP TABLE t_ids AS
SELECT
  (SELECT a.id FROM profiles a JOIN profiles c ON c.id = a.coach_id
    WHERE a.role = 'athlete' AND a.coach_id <> a.id AND NOT coalesce(a.is_pending, false) ORDER BY c.is_admin LIMIT 1) AS athlete,
  NULL::uuid AS coach, NULL::uuid AS other_coach,
  gen_random_uuid() AS session, gen_random_uuid() AS esa, gen_random_uuid() AS foreign_esa;
UPDATE t_ids SET coach = (SELECT coach_id FROM profiles WHERE id = t_ids.athlete);
UPDATE t_ids SET other_coach = (
  SELECT id FROM profiles p WHERE p.role IN ('coach', 'coach_athlete') AND p.id <> t_ids.coach
     AND p.id <> t_ids.athlete
     AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = t_ids.athlete AND cc.co_coach_id = p.id)
     AND coalesce(p.coach_id::text, '') <> t_ids.coach::text
   LIMIT 1);
INSERT INTO energy_sessions (id, name, session_kind, structure_type, intervals, created_by)
SELECT session, 'Test RPC énergie', 'vo2', 'fractionne', '[]'::jsonb, coach FROM t_ids;
-- Séance de l'athlète : un bloc déjà coché.
INSERT INTO energy_session_assignments (id, athlete_id, coach_id, energy_session_id, scheduled_date, status, block_logs)
SELECT esa, athlete, coach, session, current_date + 400, 'planned', '{"b1":{"done":true}}'::jsonb FROM t_ids;
-- Séance d'un autre (l'autre coach, sans lien avec l'athlète ni son coach).
INSERT INTO energy_session_assignments (id, athlete_id, energy_session_id, scheduled_date, status)
SELECT foreign_esa, other_coach, session, current_date + 400, 'planned' FROM t_ids;

CREATE TEMP TABLE t_res (name text, ok boolean, detail text);
GRANT ALL ON t_ids, t_res TO anon, authenticated;

-- ---------- DROITS ----------
DO $$ DECLARE ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  INSERT INTO t_res VALUES ('prépa: athlète, coach, autre coach trouvés',
    ids.athlete IS NOT NULL AND ids.coach IS NOT NULL AND ids.other_coach IS NOT NULL, '');
  INSERT INTO t_res VALUES ('droits: anon sans EXECUTE',
    NOT has_function_privilege('anon', 'public.complete_energy_assignment(uuid,jsonb,text,integer,text,text,numeric,smallint)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.reopen_energy_assignment(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.set_energy_rpe(uuid,smallint)', 'EXECUTE'), '');
  INSERT INTO t_res VALUES ('droits: authenticated a EXECUTE',
    has_function_privilege('authenticated', 'public.complete_energy_assignment(uuid,jsonb,text,integer,text,text,numeric,smallint)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.reopen_energy_assignment(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.set_energy_rpe(uuid,smallint)', 'EXECUTE'), '');
  INSERT INTO t_res VALUES ('droits: helper interne fermé à authenticated',
    NOT has_function_privilege('authenticated', 'public._energy_assignment_for_write(uuid)', 'EXECUTE'), '');
  INSERT INTO t_res VALUES ('SECURITY DEFINER + search_path',
    (SELECT bool_and(prosecdef AND proconfig @> ARRAY['search_path=public']) FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname IN ('complete_energy_assignment', 'reopen_energy_assignment', 'set_energy_rpe', '_energy_assignment_for_write')), '');
END $$;

-- ---------- ANON ----------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$ DECLARE ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  BEGIN PERFORM complete_energy_assignment(ids.esa); INSERT INTO t_res VALUES ('anon: valider refusé', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('anon: valider refusé', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM set_energy_rpe(ids.esa, 5::smallint); INSERT INTO t_res VALUES ('anon: RPE refusé', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('anon: RPE refusé', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
END $$;
RESET ROLE;

-- ---------- ATHLÈTE ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT athlete FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; r energy_session_assignments; BEGIN
  SELECT * INTO ids FROM t_ids;

  r := complete_energy_assignment(ids.esa, '{"b2":{"done":true,"note":"dur"}}', 'bonnes sensations', 42, NULL, 'course', 8.5, 7::smallint);
  INSERT INTO t_res VALUES ('athlète: validation en un appel (statut, blocs, durée, course, RPE)',
    r.status = 'completed' AND r.actual_duration_min = 42 AND r.activity_type = 'course' AND r.distance_km = 8.5
    AND r.rpe_score = 7 AND r.notes = 'bonnes sensations', row_to_json(r)::text);
  INSERT INTO t_res VALUES ('athlète: blocs fusionnés (bloc déjà coché gardé)',
    r.block_logs -> 'b1' ->> 'done' = 'true' AND r.block_logs -> 'b2' ->> 'note' = 'dur', r.block_logs::text);

  r := complete_energy_assignment(ids.esa, '{}', '', NULL, '  ', NULL, NULL, NULL);
  INSERT INTO t_res VALUES ('athlète: 2e validation sans saisie = rien d''effacé (idempotent)',
    r.status = 'completed' AND r.block_logs ? 'b1' AND r.block_logs ? 'b2' AND r.actual_duration_min = 42
    AND r.distance_km = 8.5 AND r.rpe_score = 7 AND r.notes = 'bonnes sensations' AND r.activity_url IS NULL, row_to_json(r)::text);

  r := complete_energy_assignment(ids.esa, NULL, NULL, NULL, NULL, 'velo', NULL, NULL);
  INSERT INTO t_res VALUES ('athlète: changer d''activité remplace la distance',
    r.activity_type = 'velo' AND r.distance_km IS NULL, row_to_json(r)::text);

  r := set_energy_rpe(ids.esa, 8::smallint);
  r := set_energy_rpe(ids.esa, 9::smallint);
  INSERT INTO t_res VALUES ('athlète: RPE modifié', r.rpe_score = 9, r.rpe_score::text);
  BEGIN PERFORM set_energy_rpe(ids.esa, 11::smallint); INSERT INTO t_res VALUES ('athlète: RPE 11 refusé', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: RPE 11 refusé', SQLSTATE = '22023', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM complete_energy_assignment(ids.esa, '[1]'); INSERT INTO t_res VALUES ('athlète: blocs non objet refusés', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: blocs non objet refusés', SQLSTATE = '22023', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM complete_energy_assignment(ids.esa, NULL, NULL, NULL, NULL, 'marche'); INSERT INTO t_res VALUES ('athlète: activité inconnue refusée', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: activité inconnue refusée', SQLSTATE = '22023', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM complete_energy_assignment(ids.esa, NULL, NULL, -5); INSERT INTO t_res VALUES ('athlète: durée négative refusée', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: durée négative refusée', SQLSTATE = '22023', SQLSTATE || ' ' || SQLERRM); END;

  BEGIN PERFORM complete_energy_assignment(ids.foreign_esa); INSERT INTO t_res VALUES ('athlète: séance d''un autre refusée', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: séance d''un autre refusée', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM complete_energy_assignment(gen_random_uuid()); INSERT INTO t_res VALUES ('athlète: séance inexistante = P0002', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: séance inexistante = P0002', SQLSTATE = 'P0002', SQLSTATE || ' ' || SQLERRM); END;

  -- Remettre la course pour vérifier que la réouverture l'efface.
  r := complete_energy_assignment(ids.esa, NULL, NULL, NULL, 'https://exemple.test/act', 'course', 10, NULL);
  r := reopen_energy_assignment(ids.esa);
  INSERT INTO t_res VALUES ('athlète: réouverture (blocs, RPE, durée, activité, distance effacés)',
    r.status = 'planned' AND r.block_logs = '{}'::jsonb AND r.rpe_score IS NULL AND r.actual_duration_min IS NULL
    AND r.activity_type IS NULL AND r.distance_km IS NULL, row_to_json(r)::text);
  INSERT INTO t_res VALUES ('athlète: réouverture garde notes et lien',
    r.notes = 'bonnes sensations' AND r.activity_url = 'https://exemple.test/act', row_to_json(r)::text);
  r := reopen_energy_assignment(ids.esa);
  INSERT INTO t_res VALUES ('athlète: réouverture rejouée sans effet', r.status = 'planned', r.status);
END $$;
RESET ROLE;

-- ---------- COACH ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT coach FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; r energy_session_assignments; BEGIN
  SELECT * INTO ids FROM t_ids;
  r := complete_energy_assignment(ids.esa, NULL, NULL, NULL, NULL, NULL, NULL, 6::smallint);
  INSERT INTO t_res VALUES ('coach: valide pour son athlète', r.status = 'completed' AND r.rpe_score = 6, r.status);
  r := reopen_energy_assignment(ids.esa);
  INSERT INTO t_res VALUES ('coach: annule la validation', r.status = 'planned', r.status);
  BEGIN PERFORM complete_energy_assignment(ids.foreign_esa); INSERT INTO t_res VALUES ('coach: séance d''un étranger refusée', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('coach: séance d''un étranger refusée', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
END $$;
RESET ROLE;

-- ---------- AUTRE COACH ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT other_coach FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  BEGIN PERFORM complete_energy_assignment(ids.esa); INSERT INTO t_res VALUES ('autre coach: validation refusée', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('autre coach: validation refusée', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM reopen_energy_assignment(ids.esa); INSERT INTO t_res VALUES ('autre coach: réouverture refusée', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('autre coach: réouverture refusée', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM set_energy_rpe(ids.esa, 5::smallint); INSERT INTO t_res VALUES ('autre coach: RPE refusé', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('autre coach: RPE refusé', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
END $$;
RESET ROLE;

SELECT name, ok, left(detail, 90) AS detail FROM t_res;
