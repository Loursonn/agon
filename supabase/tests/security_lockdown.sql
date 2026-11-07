-- Tests de la migration sécurité du 2026-11-07 (20261107100000 + 20261107110000).
-- Usage (base liée, rien n'est conservé) :
--   { echo BEGIN; cat <les 2 migrations si pas encore appliquées>; cat supabase/tests/security_lockdown.sql; echo ROLLBACK; } > /tmp/x.sql
--   supabase db query --linked -f /tmp/x.sql
-- Chaque ligne de résultat doit avoir ok = true.
-- Note : un coach qui retire son athlète passe par la RPC unlink_athlete
-- (l'UPDATE direct était déjà refusé avant cette migration).

-- ===== TESTS (dans la même transaction, annulée à la fin) =====
CREATE TEMP TABLE t_ids AS
SELECT
  (SELECT a.id FROM profiles a JOIN profiles c ON c.id=a.coach_id
    WHERE a.role='athlete' AND a.coach_id<>a.id AND NOT coalesce(a.is_pending,false) ORDER BY c.is_admin LIMIT 1) AS athlete,
  NULL::uuid AS coach, NULL::uuid AS other_coach, NULL::text AS other_code;
UPDATE t_ids SET coach = (SELECT coach_id FROM profiles WHERE id = t_ids.athlete);
UPDATE t_ids SET other_coach = (SELECT id FROM profiles WHERE role IN ('coach','coach_athlete') AND id <> t_ids.coach
    AND coalesce(coach_id::text,'') <> t_ids.coach::text AND id NOT IN (SELECT a.coach_id FROM profiles a WHERE a.coach_id IS NOT NULL AND a.id IN (SELECT id FROM profiles WHERE coach_id=t_ids.coach)) AND id NOT IN (SELECT cc.co_coach_id FROM athlete_co_coaches cc JOIN profiles a ON a.id=cc.athlete_id WHERE a.coach_id=t_ids.coach) AND id NOT IN (SELECT co_coach_id FROM athlete_co_coaches WHERE athlete_id=t_ids.athlete) LIMIT 1);
UPDATE t_ids SET other_code = (SELECT coach_code FROM profiles WHERE id = t_ids.other_coach);
CREATE TEMP TABLE t_res (name text, ok boolean, detail text);
GRANT ALL ON t_ids, t_res TO anon, authenticated;

-- ---------- ANON ----------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$ DECLARE n int; b boolean; BEGIN
  SELECT count(*) INTO n FROM profiles;   INSERT INTO t_res VALUES ('anon: 0 profil visible', n=0, n::text);
  SELECT count(*) INTO n FROM invitations; INSERT INTO t_res VALUES ('anon: 0 invitation visible', n=0, n::text);
  SELECT coach_code_exists('ZZZZZZ') INTO b; INSERT INTO t_res VALUES ('anon: coach_code_exists marche', b IS NOT NULL, b::text);
  SELECT coach_code_exists((SELECT other_code FROM t_ids)) INTO b; INSERT INTO t_res VALUES ('anon: code réel trouvé', b, b::text);
  BEGIN PERFORM set_active_performance_reference(gen_random_uuid(), gen_random_uuid(), 'x');
        INSERT INTO t_res VALUES ('anon: set_active_perf refusé', false, 'exécuté');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res VALUES ('anon: set_active_perf refusé', true, SQLERRM); END;
  BEGIN PERFORM list_user_storage_objects(gen_random_uuid());
        INSERT INTO t_res VALUES ('anon: list_user_storage refusé', false, 'exécuté');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res VALUES ('anon: list_user_storage refusé', true, SQLERRM); END;
END $$;
RESET ROLE;

-- ---------- ATHLÈTE ----------
SELECT set_config('request.jwt.claims', json_build_object('sub',(SELECT athlete FROM t_ids),'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  SELECT count(*) INTO n FROM profiles WHERE id = ids.coach; INSERT INTO t_res VALUES ('athlète: voit son coach', n=1, n::text);
  SELECT count(*) INTO n FROM profiles WHERE id = ids.other_coach; INSERT INTO t_res VALUES ('athlète: ne voit pas un autre coach', n=0, n::text);
  SELECT count(*) INTO n FROM profiles WHERE id = ids.athlete; INSERT INTO t_res VALUES ('athlète: voit son profil', n=1, n::text);
  BEGIN UPDATE profiles SET role='coach' WHERE id=ids.athlete; INSERT INTO t_res VALUES ('athlète: changer son rôle refusé', false, 'modifié');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res VALUES ('athlète: changer son rôle refusé', true, SQLERRM); END;
  BEGIN UPDATE profiles SET coach_id=ids.other_coach WHERE id=ids.athlete; INSERT INTO t_res VALUES ('athlète: coach_id arbitraire refusé', false, 'modifié');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res VALUES ('athlète: coach_id arbitraire refusé', true, SQLERRM); END;
  BEGIN UPDATE profiles SET is_admin=true WHERE id=ids.athlete; INSERT INTO t_res VALUES ('athlète: se passer admin refusé', false, 'modifié');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: se passer admin refusé', true, SQLERRM); END;
  BEGIN UPDATE profiles SET coach_id=NULL WHERE id=ids.athlete; GET DIAGNOSTICS n = ROW_COUNT; RAISE EXCEPTION 'undo:%', n;
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: quitter son coach autorisé', SQLERRM='undo:1', SQLERRM); END;
  BEGIN PERFORM link_to_coach_by_code(ids.other_code);
        SELECT count(*) INTO n FROM profiles WHERE id=ids.athlete AND coach_id=ids.other_coach; RAISE EXCEPTION 'undo:%', n;
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: rejoindre par code autorisé', SQLERRM='undo:1', SQLERRM); END;
  BEGIN UPDATE profiles SET first_name=first_name WHERE id=ids.athlete; GET DIAGNOSTICS n = ROW_COUNT; RAISE EXCEPTION 'undo:%', n;
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: modifier son prénom autorisé', SQLERRM='undo:1', SQLERRM); END;
  BEGIN PERFORM set_active_performance_reference(gen_random_uuid(), ids.other_coach, 'vma');
        INSERT INTO t_res VALUES ('athlète: perf d''un autre refusée', false, 'exécuté');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res VALUES ('athlète: perf d''un autre refusée', true, SQLERRM); END;
  BEGIN INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date)
          VALUES (ids.athlete, 'garmin', 'fake-'||gen_random_uuid(), now(), current_date);
        INSERT INTO t_res VALUES ('athlète: fausse activité garmin refusée', false, 'insérée');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res VALUES ('athlète: fausse activité garmin refusée', true, SQLERRM);
            WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: fausse activité garmin refusée', SQLSTATE='42501', SQLSTATE||' '||SQLERRM); END;
END $$;
RESET ROLE;

-- ---------- COACH ----------
SELECT set_config('request.jwt.claims', json_build_object('sub',(SELECT coach FROM t_ids),'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  SELECT count(*) INTO n FROM profiles WHERE id = ids.athlete; INSERT INTO t_res VALUES ('coach: voit son athlète', n=1, n::text);
  SELECT count(*) INTO n FROM profiles WHERE id = ids.other_coach; INSERT INTO t_res VALUES ('coach: ne voit pas un coach sans lien', n=0, n::text);
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id IN ('test-files','garmin-screenshots')
     AND (storage.foldername(name))[1] <> auth.uid()::text AND NOT public.is_coach_of_folder((storage.foldername(name))[1]);
  INSERT INTO t_res VALUES ('coach: aucun fichier test/garmin hors de ses athlètes', n=0, n::text);
  BEGIN INSERT INTO weekly_retours (athlete_id, coach_id, week_start) VALUES (ids.other_coach, ids.coach, current_date);
        INSERT INTO t_res VALUES ('coach: retour chez un athlète étranger refusé', false, 'inséré');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res VALUES ('coach: retour chez un athlète étranger refusé', true, SQLERRM);
            WHEN OTHERS THEN INSERT INTO t_res VALUES ('coach: retour chez un athlète étranger refusé', SQLSTATE='42501', SQLSTATE||' '||SQLERRM); END;
END $$;
RESET ROLE;

SELECT name, ok, left(detail, 90) AS detail FROM t_res;
