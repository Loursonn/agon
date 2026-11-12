-- Tests de 20261112110000_activity_laps_edit.sql (édition des tours).
-- Toujours annulé. Données fictives uniquement.
--
-- Avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261112110000_activity_laps_edit.sql; \
--    sed -e '/^BEGIN;$/d' supabase/tests/activity_laps_edit.sql) > "$TMPDIR/le.sql"
--   supabase db query --linked -f "$TMPDIR/le.sql"
-- Après application : supabase db query --linked -f supabase/tests/activity_laps_edit.sql

BEGIN;

CREATE TEMP TABLE t_res (n serial, name text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t_res TO anon, authenticated;
GRANT ALL ON SEQUENCE t_res_n_seq TO anon, authenticated;

CREATE TEMP TABLE t_ids ON COMMIT DROP AS
SELECT
  (SELECT a.id FROM profiles a
    WHERE a.role = 'athlete' AND a.coach_id IS NOT NULL AND a.coach_id <> a.id
      AND NOT coalesce(a.is_pending, false)
    ORDER BY a.id LIMIT 1) AS athlete,
  NULL::uuid AS coach, NULL::uuid AS other_coach, NULL::uuid AS act, 0 AS v;
UPDATE t_ids SET coach = (SELECT coach_id FROM profiles WHERE id = t_ids.athlete);
UPDATE t_ids SET other_coach = (SELECT c.id FROM profiles c
    WHERE c.role IN ('coach', 'coach_athlete') AND c.id <> t_ids.coach
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = t_ids.athlete AND cc.co_coach_id = c.id)
    ORDER BY c.id LIMIT 1);
GRANT SELECT, UPDATE ON t_ids TO anon, authenticated;

WITH a AS (
  INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, duration_s)
  SELECT athlete, 'file_import', 'test-laps-1', '2026-11-03T17:30:00Z', '2026-11-03', 'running', 100 FROM t_ids
  RETURNING id)
UPDATE t_ids SET act = (SELECT id FROM a);

-- 100 s de série, 2 tours de la montre (0-40, 40-99).
SELECT public.activity_detail_upsert(act, jsonb_build_object(
  'source', 'fit',
  'stream', jsonb_build_object('t', (SELECT jsonb_agg(i) FROM generate_series(0, 99) i)),
  'laps', '[{"startS":0,"endS":40},{"startS":40,"endS":99}]'::jsonb)) FROM t_ids;

INSERT INTO t_res (name, ok, detail)
SELECT 'fixtures : 2 tours montre, version 0', count(*) = 2 AND min(s.laps_version) = 0, count(*)::text
  FROM activity_laps l JOIN activity_streams s USING (activity_id) JOIN t_ids ON l.activity_id = t_ids.act
 WHERE t_ids.other_coach IS NOT NULL;

-- ---------- L'athlète découpe le 2e tour et nomme ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
UPDATE t_ids SET v = public.save_activity_laps(act, 0,
  '[{"start_s":0,"end_s":40,"name":"Échauffement","origin":"watch"},
    {"start_s":40,"end_s":70,"name":"Wall balls","reps":100,"load_kg":6,"origin":"manual"},
    {"start_s":70,"end_s":100,"distance_override_m":1000,"origin":"manual","status":"proposed","needs_review":true}]'::jsonb);
INSERT INTO t_res (name, ok, detail) SELECT 'athlète : version 1', v = 1, v::text FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT 'athlète : 3 tours enregistrés, modifiés',
       count(*) = 3 AND bool_and(s.laps_edited)
       AND (array_agg(l.name ORDER BY l.position))[2] = 'Wall balls'
       AND (array_agg(l.needs_review ORDER BY l.position))[3],
       count(*)::text
  FROM activity_laps l JOIN activity_streams s USING (activity_id) WHERE l.activity_id = (SELECT act FROM t_ids);

-- Version périmée → conflit.
DO $$ BEGIN
  PERFORM public.save_activity_laps((SELECT act FROM t_ids), 0, '[]'::jsonb);
  INSERT INTO t_res (name, ok, detail) VALUES ('version périmée refusée', false, 'acceptée');
EXCEPTION WHEN serialization_failure THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('version périmée refusée', true, SQLERRM);
END $$;

-- Chevauchement → refus.
DO $$ BEGIN
  PERFORM public.save_activity_laps((SELECT act FROM t_ids), 1,
    '[{"start_s":0,"end_s":50},{"start_s":40,"end_s":60}]'::jsonb);
  INSERT INTO t_res (name, ok, detail) VALUES ('tours qui se chevauchent refusés', false, 'acceptés');
EXCEPTION WHEN invalid_parameter_value THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('tours qui se chevauchent refusés', true, SQLERRM);
END $$;

-- Au-delà de la fin de la séance → refus.
DO $$ BEGIN
  PERFORM public.save_activity_laps((SELECT act FROM t_ids), 1, '[{"start_s":0,"end_s":500}]'::jsonb);
  INSERT INTO t_res (name, ok, detail) VALUES ('tour après la fin refusé', false, 'accepté');
EXCEPTION WHEN invalid_parameter_value THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('tour après la fin refusé', true, SQLERRM);
END $$;

-- Écriture directe interdite.
DO $$ BEGIN
  UPDATE activity_laps SET name = 'x' WHERE activity_id = (SELECT act FROM t_ids);
  INSERT INTO t_res (name, ok, detail) VALUES ('écriture directe refusée', false, 'acceptée');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('écriture directe refusée', true, SQLERRM);
END $$;
RESET ROLE;

-- La synchro ne remplace plus des tours modifiés.
SELECT public.activity_detail_upsert(act, jsonb_build_object(
  'source', 'fit',
  'stream', jsonb_build_object('t', (SELECT jsonb_agg(i) FROM generate_series(0, 99) i)),
  'laps', '[{"startS":0,"endS":99}]'::jsonb)) FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT 'synchro : tours modifiés gardés', count(*) = 3, count(*)::text
  FROM activity_laps WHERE activity_id = (SELECT act FROM t_ids);

-- ---------- Autre coach : refusé ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', other_coach, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM public.save_activity_laps((SELECT act FROM t_ids), 1, '[]'::jsonb);
  INSERT INTO t_res (name, ok, detail) VALUES ('autre coach refusé', false, 'accepté');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('autre coach refusé', true, SQLERRM);
END $$;
RESET ROLE;

-- ---------- Le coach revient aux tours de la montre ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
UPDATE t_ids SET v = public.reset_activity_laps_to_watch(act, 1);
RESET ROLE;
INSERT INTO t_res (name, ok, detail)
SELECT 'coach : retour aux tours de la montre (dernière synchro), synchro réactivée',
       count(*) = 1 AND bool_and(l.origin = 'watch') AND bool_and(NOT s.laps_edited) AND min(s.laps_version) = 2,
       count(*)::text
  FROM activity_laps l JOIN activity_streams s USING (activity_id) WHERE l.activity_id = (SELECT act FROM t_ids);

SELECT n, ok, name, detail FROM t_res ORDER BY ok, n;

ROLLBACK;
