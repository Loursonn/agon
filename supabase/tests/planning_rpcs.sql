-- Tests de 20261109100000_planning_rpcs.sql (création de cycle, dates de cycle).
-- Usage (base liée, rien n'est conservé) :
--   { echo 'BEGIN;'; cat supabase/migrations/20261109100000_planning_rpcs.sql; cat supabase/tests/planning_rpcs.sql; echo 'ROLLBACK;'; } > /tmp/x.sql
--   supabase db query --linked -f /tmp/x.sql
-- Chaque ligne de résultat doit avoir ok = true.
-- Tout est créé dans la transaction (annulée à la fin), loin dans le futur.

-- ===== Préparation =====
CREATE TEMP TABLE t_ids AS
SELECT
  (SELECT a.id FROM profiles a JOIN profiles c ON c.id = a.coach_id
    WHERE a.role = 'athlete' AND a.coach_id <> a.id AND NOT coalesce(a.is_pending, false) ORDER BY c.is_admin LIMIT 1) AS athlete,
  NULL::uuid AS coach, NULL::uuid AS other_coach,
  date_trunc('week', current_date + 900)::date AS mon,   -- un lundi
  NULL::uuid AS cycle, NULL::uuid AS meso;
UPDATE t_ids SET coach = (SELECT coach_id FROM profiles WHERE id = t_ids.athlete);
UPDATE t_ids SET other_coach = (
  SELECT id FROM profiles p WHERE p.role IN ('coach', 'coach_athlete') AND p.id <> t_ids.coach
     AND p.id <> t_ids.athlete
     AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = t_ids.athlete AND cc.co_coach_id = p.id)
     AND coalesce(p.coach_id::text, '') <> t_ids.coach::text
   LIMIT 1);

-- Séances déjà posées avant le cycle : une réalisée (S1 lundi), une prévue
-- sans trace (S1 lundi de la semaine 2), même séance-type « tst-a ».
INSERT INTO workout_logs (athlete_id, session_id, session_name, scheduled_date, status)
SELECT athlete, 'tst-a', 'Ancien nom', mon, 'completed' FROM t_ids;
INSERT INTO workout_logs (athlete_id, session_id, session_name, scheduled_date, status)
SELECT athlete, 'tst-a', 'Ancien nom', mon + 7, 'missed' FROM t_ids;

-- Un mésocycle d'un autre athlète (pour le refus de rattachement).
CREATE TEMP TABLE t_foreign AS
SELECT gen_random_uuid() AS macro, gen_random_uuid() AS meso;
INSERT INTO macrocycles (id, athlete_id, coach_id, name, start_date, end_date)
SELECT f.macro, i.other_coach, i.other_coach, 'Test macro étranger', i.mon, i.mon + 90 FROM t_foreign f, t_ids i;
INSERT INTO mesocycles (id, macrocycle_id, name, start_date, end_date)
SELECT f.meso, f.macro, 'Test méso étranger', i.mon, i.mon + 60 FROM t_foreign f, t_ids i;

CREATE TEMP TABLE t_res (name text, ok boolean, detail text);
GRANT ALL ON t_ids, t_res, t_foreign TO anon, authenticated;

-- ---------- DROITS ----------
DO $$ DECLARE ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  INSERT INTO t_res VALUES ('prépa: athlète, coach, autre coach trouvés',
    ids.athlete IS NOT NULL AND ids.coach IS NOT NULL AND ids.other_coach IS NOT NULL, '');
  INSERT INTO t_res VALUES ('droits: anon sans EXECUTE',
    NOT has_function_privilege('anon', 'public.create_cycle(uuid,text,date,date,uuid,integer,jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.set_cycle_dates(uuid,date,date,uuid,boolean,boolean,boolean)', 'EXECUTE'), '');
  INSERT INTO t_res VALUES ('droits: authenticated a EXECUTE',
    has_function_privilege('authenticated', 'public.create_cycle(uuid,text,date,date,uuid,integer,jsonb)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.set_cycle_dates(uuid,date,date,uuid,boolean,boolean,boolean)', 'EXECUTE'), '');
END $$;

-- ---------- ANON ----------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$ DECLARE ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  BEGIN PERFORM create_cycle(ids.athlete, 'x', ids.mon, ids.mon + 13); INSERT INTO t_res VALUES ('anon: création refusée', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('anon: création refusée', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
END $$;
RESET ROLE;

-- ---------- ATHLÈTE (pas coach) ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT athlete FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  BEGIN PERFORM create_cycle(ids.athlete, 'x', ids.mon, ids.mon + 13); INSERT INTO t_res VALUES ('athlète: créer son cycle refusé (policy cycles)', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('athlète: créer son cycle refusé (policy cycles)', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
END $$;
RESET ROLE;

-- ---------- COACH : création ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT coach FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; res jsonb; v_cycle uuid; BEGIN
  SELECT * INTO ids FROM t_ids;
  -- 3 semaines, semaine 2 allégée ; tst-a le lundi, tst-b le jeudi.
  res := create_cycle(ids.athlete, '  Test cycle  ', ids.mon + 2, ids.mon + 20, NULL, 2,
    '[{"session_id":"tst-a","session_name":"Force","day_of_week":0},
      {"session_id":"tst-b","session_name":"","day_of_week":3},
      {"session_id":"tst-c","session_name":"Hors semaine","day_of_week":9},
      {"session_id":"tst-a","session_name":"Doublon","day_of_week":0}]');
  v_cycle := (res -> 'cycle' ->> 'id')::uuid;
  UPDATE t_ids SET cycle = v_cycle;
  INSERT INTO t_res VALUES ('coach: cycle créé (nom nettoyé, coach = moi)',
    (res -> 'cycle' ->> 'name') = 'Test cycle' AND (res -> 'cycle' ->> 'coach_id')::uuid = ids.coach
    AND (res -> 'cycle' ->> 'athlete_id')::uuid = ids.athlete AND (res -> 'cycle' ->> 'mesocycle_id') IS NULL, res::text);
  INSERT INTO t_res VALUES ('coach: 3 semaines lundi→dimanche, S2 allégée',
    (res ->> 'weeks')::int = 3
    AND (SELECT array_agg(start_date ORDER BY week_number) FROM microcycles WHERE cycle_id = v_cycle) = ARRAY[ids.mon, ids.mon + 7, ids.mon + 14]
    AND (SELECT bool_and(end_date = start_date + 6) FROM microcycles WHERE cycle_id = v_cycle)
    AND (SELECT array_agg(is_deload ORDER BY week_number) FROM microcycles WHERE cycle_id = v_cycle) = ARRAY[false, true, false], res::text);
  INSERT INTO t_res VALUES ('coach: 6 séances posées (doublon et jour invalide ignorés)',
    (res ->> 'sessions')::int = 6
    AND (SELECT count(*) FROM workout_logs WHERE athlete_id = ids.athlete AND session_id IN ('tst-a','tst-b')) = 6
    AND NOT EXISTS (SELECT 1 FROM workout_logs WHERE athlete_id = ids.athlete AND session_id = 'tst-c')
    AND (SELECT session_name FROM workout_logs WHERE athlete_id = ids.athlete AND session_id = 'tst-b' LIMIT 1) = 'Séance', res::text);
  INSERT INTO t_res VALUES ('coach: séance RÉALISÉE gardée (statut et nom), rattachée à S1',
    EXISTS (SELECT 1 FROM workout_logs w JOIN microcycles m ON m.id = w.microcycle_id
             WHERE w.athlete_id = ids.athlete AND w.session_id = 'tst-a' AND w.scheduled_date = ids.mon
               AND w.status = 'completed' AND w.session_name = 'Ancien nom' AND m.week_number = 1), '');
  INSERT INTO t_res VALUES ('coach: séance sans trace remise en prévue et renommée',
    EXISTS (SELECT 1 FROM workout_logs w WHERE w.athlete_id = ids.athlete AND w.session_id = 'tst-a'
             AND w.scheduled_date = ids.mon + 7 AND w.status = 'planned' AND w.session_name = 'Force'
             AND w.coach_id = ids.coach), '');

  BEGIN PERFORM create_cycle(ids.athlete, 'x', ids.mon, ids.mon + 13, (SELECT meso FROM t_foreign)); INSERT INTO t_res VALUES ('coach: méso d''un autre athlète refusé', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('coach: méso d''un autre athlète refusé', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM create_cycle(ids.athlete, 'x', ids.mon + 13, ids.mon); INSERT INTO t_res VALUES ('coach: dates inversées refusées', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('coach: dates inversées refusées', SQLSTATE = '22023', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM create_cycle(ids.athlete, ' ', ids.mon, ids.mon + 13); INSERT INTO t_res VALUES ('coach: nom vide refusé', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('coach: nom vide refusé', SQLSTATE = '22023', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM create_cycle(ids.athlete, 'x', ids.mon, ids.mon + 13, NULL, NULL, '{"pas":"liste"}'); INSERT INTO t_res VALUES ('coach: séances non liste refusées', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('coach: séances non liste refusées', SQLSTATE = '22023', SQLSTATE || ' ' || SQLERRM); END;
END $$;
RESET ROLE;

-- Saisie commencée par l'athlète sur tst-b semaine 3 (jeudi), RPE sur tst-a semaine 3.
UPDATE workout_logs SET athlete_modifications = '{"sessionForme":3}'
 WHERE athlete_id = (SELECT athlete FROM t_ids) AND session_id = 'tst-b' AND scheduled_date = (SELECT mon + 17 FROM t_ids);
UPDATE workout_logs SET rpe_score = 6
 WHERE athlete_id = (SELECT athlete FROM t_ids) AND session_id = 'tst-a' AND scheduled_date = (SELECT mon + 14 FROM t_ids);
-- Séance prévue sans trace au-delà de la future fin (retirée par l'« arrêt »).
INSERT INTO workout_logs (athlete_id, session_id, session_name, scheduled_date, status)
SELECT athlete, 'tst-d', 'À retirer', mon + 15, 'planned' FROM t_ids;

-- ---------- AUTRE COACH ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT other_coach FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  BEGIN PERFORM set_cycle_dates(ids.cycle, ids.mon, ids.mon + 6); INSERT INTO t_res VALUES ('autre coach: dates refusées', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('autre coach: dates refusées', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM create_cycle(ids.athlete, 'x', ids.mon, ids.mon + 13); INSERT INTO t_res VALUES ('autre coach: création refusée', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('autre coach: création refusée', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
END $$;
RESET ROLE;

-- ---------- COACH : dates ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT coach FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; r cycles; BEGIN
  SELECT * INTO ids FROM t_ids;

  -- Décale le début d'une semaine (S1 sort) et raccourcit : S2..S3 restent, sans S4.
  r := set_cycle_dates(ids.cycle, ids.mon + 7, ids.mon + 20, NULL, false, true, false);
  INSERT INTO t_res VALUES ('dates: cycle mis à jour', r.start_date = ids.mon + 7 AND r.end_date = ids.mon + 20, r::text);
  INSERT INTO t_res VALUES ('dates: semaines gardées, renumérotées 1..2, allégée conservée',
    (SELECT array_agg(start_date ORDER BY week_number) FROM microcycles WHERE cycle_id = ids.cycle) = ARRAY[ids.mon + 7, ids.mon + 14]
    AND (SELECT array_agg(week_number ORDER BY start_date) FROM microcycles WHERE cycle_id = ids.cycle) = ARRAY[1, 2]::smallint[]
    AND (SELECT is_deload FROM microcycles WHERE cycle_id = ids.cycle AND start_date = ids.mon + 7), '');
  INSERT INTO t_res VALUES ('dates: séance réalisée de la semaine sortie gardée (détachée)',
    EXISTS (SELECT 1 FROM workout_logs WHERE athlete_id = ids.athlete AND session_id = 'tst-a'
             AND scheduled_date = ids.mon AND status = 'completed' AND microcycle_id IS NULL), '');
  INSERT INTO t_res VALUES ('dates: séance prévue sans trace de la semaine sortie retirée',
    NOT EXISTS (SELECT 1 FROM workout_logs WHERE athlete_id = ids.athlete AND session_id = 'tst-b' AND scheduled_date = ids.mon + 3), '');

  -- Avance le début (S0 créée), fin raccourcie avec « arrêt » : les séances prévues
  -- sans trace au-delà de la nouvelle fin sont retirées, les réelles gardées.
  r := set_cycle_dates(ids.cycle, ids.mon, ids.mon + 13, NULL, false, false, true);
  INSERT INTO t_res VALUES ('arrêt: semaines lundi S1, S2 ; numérotées 1..2',
    (SELECT array_agg(start_date ORDER BY week_number) FROM microcycles WHERE cycle_id = ids.cycle) = ARRAY[ids.mon, ids.mon + 7]
    AND (SELECT array_agg(week_number ORDER BY start_date) FROM microcycles WHERE cycle_id = ids.cycle) = ARRAY[1, 2]::smallint[], '');
  INSERT INTO t_res VALUES ('arrêt: séance commencée et séance notée au-delà de la fin gardées',
    EXISTS (SELECT 1 FROM workout_logs WHERE athlete_id = ids.athlete AND session_id = 'tst-b' AND scheduled_date = ids.mon + 17)
    AND EXISTS (SELECT 1 FROM workout_logs WHERE athlete_id = ids.athlete AND session_id = 'tst-a' AND scheduled_date = ids.mon + 14), '');
  INSERT INTO t_res VALUES ('arrêt: séance prévue sans trace au-delà de la fin retirée',
    NOT EXISTS (SELECT 1 FROM workout_logs WHERE athlete_id = ids.athlete AND session_id = 'tst-d'), '');

  BEGIN PERFORM set_cycle_dates(ids.cycle, ids.mon, ids.mon + 13, (SELECT meso FROM t_foreign), true); INSERT INTO t_res VALUES ('dates: rattacher au méso d''un autre refusé', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('dates: rattacher au méso d''un autre refusé', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM set_cycle_dates(gen_random_uuid(), ids.mon, ids.mon + 13); INSERT INTO t_res VALUES ('dates: cycle inexistant = P0002', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('dates: cycle inexistant = P0002', SQLSTATE = 'P0002', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM set_cycle_dates(ids.cycle, ids.mon, ids.mon); INSERT INTO t_res VALUES ('dates: début = fin refusé', false, 'exécuté');
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res VALUES ('dates: début = fin refusé', SQLSTATE = '22023', SQLSTATE || ' ' || SQLERRM); END;
END $$;
RESET ROLE;

SELECT name, ok, detail FROM t_res ORDER BY ok, name;
