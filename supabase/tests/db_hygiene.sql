-- Tests de 20261109180000_db_hygiene.sql (index des FK, updated_at, policies
-- en double, banque de tests coach_athlete, RPC énergie admin, set_own_coach).
-- Toujours annulé (BEGIN … ROLLBACK dans ce fichier) : rien n'est conservé.
-- Avant application :
--   { echo 'BEGIN;'; cat supabase/migrations/20261109180000_db_hygiene.sql; sed '/^BEGIN;$/d' supabase/tests/db_hygiene.sql; } > "$TMPDIR/x.sql"
--   supabase db query --linked -f "$TMPDIR/x.sql"
-- Après application : supabase db query --linked -f supabase/tests/db_hygiene.sql
-- Chaque ligne de résultat doit avoir ok = true. Aucune donnée réelle n'est
-- affichée : seulement des noms de cas et des compteurs.

BEGIN;

-- ===== Préparation =====
CREATE TEMP TABLE t_ids AS
SELECT
  (SELECT a.id FROM profiles a JOIN profiles c ON c.id = a.coach_id
    WHERE a.role = 'athlete' AND a.coach_id <> a.id AND NOT coalesce(a.is_pending, false)
      AND NOT coalesce(c.is_admin, false)
    ORDER BY EXISTS (SELECT 1 FROM medical_entries m WHERE m.athlete_id = a.id) DESC LIMIT 1) AS athlete,
  NULL::uuid AS coach,
  NULL::uuid AS other_coach,
  (SELECT id FROM profiles WHERE is_admin LIMIT 1) AS admin,
  (SELECT id FROM profiles WHERE role = 'coach' AND NOT coalesce(is_admin, false) LIMIT 1) AS a_coach,
  (SELECT id FROM profiles WHERE role = 'coach_athlete' AND NOT coalesce(is_admin, false) LIMIT 1) AS coach_athlete,
  gen_random_uuid() AS session, gen_random_uuid() AS esa, gen_random_uuid() AS wlog,
  (SELECT id FROM test_definitions WHERE created_by IS NULL LIMIT 1) AS lib_def;
UPDATE t_ids SET coach = (SELECT coach_id FROM profiles WHERE id = t_ids.athlete);
UPDATE t_ids SET other_coach = (
  SELECT id FROM profiles p WHERE p.role IN ('coach', 'coach_athlete') AND p.id <> t_ids.coach
     AND p.id <> t_ids.athlete AND NOT coalesce(p.is_admin, false)
     AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = t_ids.athlete AND cc.co_coach_id = p.id)
   LIMIT 1);
-- Coach-athlète absent en base : on en simule un (le rôle d'un profil coach,
-- changé dans la transaction annulée ; postgres n'est pas bloqué par le trigger).
UPDATE profiles SET role = 'coach_athlete'
 WHERE id = (SELECT a_coach FROM t_ids) AND (SELECT coach_athlete FROM t_ids) IS NULL;
UPDATE t_ids SET coach_athlete = coalesce(coach_athlete, a_coach);

INSERT INTO energy_sessions (id, name, session_kind, structure_type, intervals, created_by)
SELECT session, 'Test hygiène BDD', 'vo2', 'fractionne', '[]'::jsonb, coach FROM t_ids;
INSERT INTO energy_session_assignments (id, athlete_id, coach_id, energy_session_id, scheduled_date, status)
SELECT esa, athlete, coach, session, current_date + 400, 'planned' FROM t_ids;
INSERT INTO workout_logs (id, athlete_id, session_id, session_name, scheduled_date)
SELECT wlog, athlete, 'test-hygiene', 'Test hygiène BDD', current_date + 400 FROM t_ids;

CREATE TEMP TABLE t_res (name text, ok boolean, detail text);
GRANT ALL ON t_ids, t_res TO anon, authenticated;

-- ---------- STRUCTURE ----------
DO $$ DECLARE ids record; n int; BEGIN
  SELECT * INTO ids FROM t_ids;
  INSERT INTO t_res VALUES ('prépa: athlète, coach, autre coach, admin, coach-athlète, test de banque',
    ids.athlete IS NOT NULL AND ids.coach IS NOT NULL AND ids.other_coach IS NOT NULL
    AND ids.admin IS NOT NULL AND ids.coach_athlete IS NOT NULL AND ids.lib_def IS NOT NULL, '');

  -- FK sans index commençant par leur colonne
  SELECT count(*) INTO n FROM pg_constraint c
   WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
     AND NOT EXISTS (
       SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid
          AND (string_to_array(i.indkey::text, ' ')::int2[])[1:array_length(c.conkey, 1)] @> c.conkey
          AND (string_to_array(i.indkey::text, ' ')::int2[])[1:array_length(c.conkey, 1)] <@ c.conkey);
  INSERT INTO t_res VALUES ('index: plus aucune FK sans index', n = 0, n || ' restantes');
  INSERT INTO t_res VALUES ('index: profiles.coach_id indexé',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'profiles_coach_id_fk_idx'), '');

  -- updated_at
  SELECT count(*) INTO n FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE p.proname = 'set_updated_at' AND NOT t.tgisinternal
     AND t.tgrelid::regclass::text IN ('app_feedback', 'athlete_profile_items', 'athlete_test_results',
                                       'exercises', 'test_definitions', 'test_sessions', 'weekly_retours');
  INSERT INTO t_res VALUES ('updated_at: trigger sur les 7 tables', n = 7, n::text);
  INSERT INTO t_res VALUES ('updated_at: app_data volontairement sans trigger',
    NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
                 WHERE t.tgrelid = 'public.app_data'::regclass AND p.proname = 'set_updated_at'), '');
END $$;

-- updated_at réellement mis à jour (postgres : pas de RLS)
DO $$ DECLARE v timestamptz; BEGIN
  UPDATE test_definitions SET updated_at = '2000-01-01'
   WHERE id = (SELECT lib_def FROM t_ids) RETURNING updated_at INTO v;
  INSERT INTO t_res VALUES ('updated_at: test_definitions passe à now()', v = now(), coalesce(v::text, 'aucune ligne'));
END $$;

-- ---------- POLICIES ----------
DO $$ BEGIN
  INSERT INTO t_res VALUES ('policies: doublons supprimés',
    NOT EXISTS (SELECT 1 FROM pg_policies WHERE (tablename, policyname) IN (
      ('exercises', 'Public read'),
      ('workout_rpe', 'workout_rpe_insert'), ('workout_rpe', 'workout_rpe_update'),
      ('workout_rpe', 'workout_rpe_delete'), ('objects', 'coach_delete_test_media'))), '');
  INSERT INTO t_res VALUES ('policies: policies couvrantes gardées',
    (SELECT count(*) FROM pg_policies WHERE (tablename, policyname) IN (
      ('exercises', 'exercises_select_all'),
      ('workout_rpe', 'athlete_own_rpe'), ('objects', 'athlete_delete_test_media'))) = 3, '');
  INSERT INTO t_res VALUES ('policies: plus aucun doublon strict (même cmd, rôles, USING, CHECK)',
    NOT EXISTS (SELECT 1 FROM pg_policies GROUP BY schemaname, tablename, cmd, roles, permissive, qual, with_check
                 HAVING count(*) > 1), '');
  INSERT INTO t_res VALUES ('policies: banque de tests ouverte à coach_athlete',
    (SELECT count(*) FROM pg_policies
      WHERE policyname IN ('td_update_coach_library', 'td_delete_coach_library', 'tv_write_coach_library')
        AND qual LIKE '%coach_athlete%') = 3, '');
END $$;

-- Mesures de référence (postgres, sans RLS), pour comparer avec chaque rôle
CREATE TEMP TABLE t_ref AS
SELECT
  (SELECT count(*) FROM medical_entries WHERE athlete_id = (SELECT athlete FROM t_ids)) AS med,
  (SELECT count(*) FROM exercises) AS exos;
GRANT ALL ON t_ref TO anon, authenticated;

-- ---------- ANON ----------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$ DECLARE n int; BEGIN
  INSERT INTO t_res VALUES ('anon: pas d''EXECUTE sur set_own_coach',
    NOT has_function_privilege('anon', 'public.set_own_coach(uuid)', 'EXECUTE'), '');
  SELECT count(*) INTO n FROM medical_entries;
  INSERT INTO t_res VALUES ('anon: ne voit aucune blessure', n = 0, n::text);
  SELECT count(*) INTO n FROM exercises;
  INSERT INTO t_res VALUES ('anon: banque d''exercices toujours lisible (comme avant)', n = (SELECT exos FROM t_ref), n::text);
END $$;
RESET ROLE;

-- ---------- COACH (référent de l'athlète) ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT coach FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; n int; BEGIN
  SELECT * INTO ids FROM t_ids;
  SELECT count(*) INTO n FROM medical_entries WHERE athlete_id = ids.athlete;
  INSERT INTO t_res VALUES ('coach: lit toujours les blessures de son athlète', n = (SELECT med FROM t_ref), n::text);
END $$;
RESET ROLE;

-- ---------- AUTRE COACH ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT other_coach FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; n int; BEGIN
  SELECT * INTO ids FROM t_ids;
  SELECT count(*) INTO n FROM medical_entries WHERE athlete_id = ids.athlete;
  INSERT INTO t_res VALUES ('autre coach: ne lit pas les blessures', n = 0, n::text);
  BEGIN PERFORM complete_energy_assignment(ids.esa); INSERT INTO t_res VALUES ('autre coach: séance énergie refusée', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('autre coach: séance énergie refusée', SQLSTATE = '42501', SQLSTATE); END;
END $$;
RESET ROLE;

-- ---------- ATHLÈTE ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT athlete FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; n int; v uuid; BEGIN
  SELECT * INTO ids FROM t_ids;
  -- workout_rpe : écriture toujours permise par athlete_own_rpe
  INSERT INTO workout_rpe (athlete_id, workout_log_id, rpe_score) VALUES (ids.athlete, ids.wlog, 5);
  UPDATE workout_rpe SET rpe_score = 6 WHERE workout_log_id = ids.wlog;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO t_res VALUES ('athlète: RPE inséré et modifié (policy ALL)', n = 1, n::text);
  DELETE FROM workout_rpe WHERE workout_log_id = ids.wlog;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO t_res VALUES ('athlète: RPE supprimé (policy ALL)', n = 1, n::text);

  BEGIN PERFORM set_own_coach(ids.other_coach); INSERT INTO t_res VALUES ('athlète: set_own_coach vers un autre coach refusé', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: set_own_coach vers un autre coach refusé', SQLSTATE = '42501', SQLSTATE); END;
  BEGIN PERFORM set_own_coach(ids.athlete); INSERT INTO t_res VALUES ('athlète: se coacher soi-même refusé', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: se coacher soi-même refusé', SQLSTATE = '42501', SQLSTATE); END;
  -- Écriture directe interdite elle aussi (trigger, inchangé)
  BEGIN UPDATE profiles SET coach_id = ids.other_coach WHERE id = ids.athlete;
    INSERT INTO t_res VALUES ('athlète: coach_id vers un autre coach en direct refusé', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: coach_id vers un autre coach en direct refusé', SQLSTATE = '42501', SQLSTATE); END;

  v := set_own_coach(NULL);
  SELECT count(*) INTO n FROM profiles WHERE id = ids.athlete AND coach_id IS NULL;
  INSERT INTO t_res VALUES ('athlète: quitte son coach par set_own_coach', v IS NULL AND n = 1, n::text);
END $$;
RESET ROLE;
-- Remis pour la suite (postgres, sans utilisateur : le trigger laisse passer)
SELECT set_config('request.jwt.claims', '{}', true);
UPDATE profiles SET coach_id = (SELECT coach FROM t_ids) WHERE id = (SELECT athlete FROM t_ids);

-- ---------- COACH-ATHLÈTE ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT coach_athlete FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; n int; v uuid; BEGIN
  SELECT * INTO ids FROM t_ids;
  v := set_own_coach(ids.coach_athlete);
  SELECT count(*) INTO n FROM profiles WHERE id = ids.coach_athlete AND coach_id = ids.coach_athlete;
  INSERT INTO t_res VALUES ('coach-athlète: redevient son propre coach', v = ids.coach_athlete AND n = 1, n::text);
  v := set_own_coach(NULL);
  SELECT count(*) INTO n FROM profiles WHERE id = ids.coach_athlete AND coach_id IS NULL;
  INSERT INTO t_res VALUES ('coach-athlète: se retire de ses athlètes', n = 1, n::text);

  UPDATE test_definitions SET description = description WHERE id = ids.lib_def;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO t_res VALUES ('coach-athlète: modifie un test de la banque commune', n = 1, n::text);
  UPDATE test_variables SET label = label WHERE test_definition_id = ids.lib_def;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO t_res VALUES ('coach-athlète: modifie les variables d''un test de la banque',
    n = (SELECT count(*) FROM test_variables WHERE test_definition_id = ids.lib_def), n::text);
END $$;
RESET ROLE;

-- ---------- ATHLÈTE : pas la banque commune ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT athlete FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; n int; BEGIN
  SELECT * INTO ids FROM t_ids;
  UPDATE test_definitions SET description = description WHERE id = ids.lib_def;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO t_res VALUES ('athlète: ne modifie pas la banque commune', n = 0, n::text);
END $$;
RESET ROLE;

-- ---------- ADMIN ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT admin FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; r energy_session_assignments; BEGIN
  SELECT * INTO ids FROM t_ids;
  INSERT INTO t_res VALUES ('admin: n''est pas coach de l''athlète (cas pertinent)', NOT is_coach_of(ids.athlete), '');
  r := complete_energy_assignment(ids.esa, NULL, NULL, NULL, NULL, NULL, NULL, 7::smallint);
  INSERT INTO t_res VALUES ('admin: valide une séance énergie (aligné sur la RLS)', r.status = 'completed' AND r.rpe_score = 7, r.status);
  r := reopen_energy_assignment(ids.esa);
  INSERT INTO t_res VALUES ('admin: annule la validation', r.status = 'planned', r.status);
END $$;
RESET ROLE;

SELECT name, ok, left(detail, 60) AS detail FROM t_res;
ROLLBACK;
