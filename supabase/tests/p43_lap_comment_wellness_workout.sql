-- Tests de 20261113120000_p43_lap_comment_wellness_workout.sql
-- (commentaire par tour, séance d'hier rattachée au wellness).
-- Toujours annulé. Données fictives uniquement (activité et jour inventés).
--
-- Avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261113120000_p43_lap_comment_wellness_workout.sql; \
--    sed -e '/^BEGIN;$/d' supabase/tests/p43_lap_comment_wellness_workout.sql) > "$TMPDIR/p43.sql"
--   supabase db query --linked -f "$TMPDIR/p43.sql"
-- Après application : supabase db query --linked -f supabase/tests/p43_lap_comment_wellness_workout.sql

BEGIN;

CREATE TEMP TABLE t_res (n serial, name text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t_res TO anon, authenticated;
GRANT ALL ON SEQUENCE t_res_n_seq TO anon, authenticated;

CREATE TEMP TABLE t_ids ON COMMIT DROP AS
SELECT a.id AS athlete, a.coach_id AS coach,
  (SELECT c.id FROM profiles c
    WHERE c.role IN ('coach', 'coach_athlete') AND c.id <> a.coach_id
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = a.id AND cc.co_coach_id = c.id)
      AND NOT coalesce(c.is_admin, false)
    ORDER BY c.created_at LIMIT 1) AS other_coach,
  NULL::uuid AS act, 0 AS v
FROM profiles a WHERE a.full_name = 'Léa Démo' AND a.coach_id IS NOT NULL LIMIT 1;
GRANT SELECT, UPDATE ON t_ids TO anon, authenticated;

WITH a AS (
  INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, duration_s)
  SELECT athlete, 'file_import', 'test-p43-comment', '2001-01-02T17:30:00Z', '2001-01-02', 'running', 100 FROM t_ids
  RETURNING id)
UPDATE t_ids SET act = (SELECT id FROM a);
SELECT public.activity_detail_upsert(act, jsonb_build_object(
  'source', 'fit',
  'stream', jsonb_build_object('t', (SELECT jsonb_agg(i) FROM generate_series(0, 99) i)),
  'laps', '[{"startS":0,"endS":40},{"startS":40,"endS":99}]'::jsonb)) FROM t_ids;

INSERT INTO t_res (name, ok, detail)
SELECT '00 jeu de test complet', athlete IS NOT NULL AND coach IS NOT NULL AND other_coach IS NOT NULL AND act IS NOT NULL, NULL FROM t_ids;

-- ---------- 1. Commentaire par tour ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
UPDATE t_ids SET v = public.save_activity_laps(act, 0,
  ('[{"start_s":0,"end_s":40,"name":"Sled push","comment":"  Poignées glissantes, j''ai lâché 2 fois  "},
     {"start_s":40,"end_s":70,"name":"Wall balls","reps":9,"comment":"   "},
     {"start_s":70,"end_s":100,"name":"Fin","comment":"' || repeat('x', 600) || '"}]')::jsonb);
INSERT INTO t_res (name, ok, detail)
SELECT '01 athlète : commentaire enregistré, espaces retirés',
       (array_agg(l.comment ORDER BY l.position))[1] = 'Poignées glissantes, j''ai lâché 2 fois',
       (array_agg(l.comment ORDER BY l.position))[1]
  FROM activity_laps l JOIN t_ids ON l.activity_id = t_ids.act;
INSERT INTO t_res (name, ok, detail)
SELECT '02 commentaire vide → null, long → 500 car.',
       (array_agg(l.comment ORDER BY l.position))[2] IS NULL
       AND length((array_agg(l.comment ORDER BY l.position))[3]) = 500, NULL
  FROM activity_laps l JOIN t_ids ON l.activity_id = t_ids.act;

-- Un autre coach ne peut pas écrire.
SELECT set_config('request.jwt.claims', json_build_object('sub', other_coach, 'role', 'authenticated')::text, true) FROM t_ids;
DO $$ BEGIN
  PERFORM public.save_activity_laps(act, v, '[{"start_s":0,"end_s":40,"comment":"intrus"}]'::jsonb) FROM t_ids;
  INSERT INTO t_res (name, ok, detail) VALUES ('03 autre coach refusé', false, 'ACCEPTÉ');
EXCEPTION WHEN OTHERS THEN INSERT INTO t_res (name, ok, detail) VALUES ('03 autre coach refusé', true, SQLERRM); END $$;

-- Le coach référent peut écrire et lit le commentaire.
SELECT set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true) FROM t_ids;
UPDATE t_ids SET v = public.save_activity_laps(act, v,
  '[{"start_s":0,"end_s":40,"name":"Sled push","comment":"Vu, on change de gants"}]'::jsonb);
INSERT INTO t_res (name, ok, detail)
SELECT '04 coach : écrit et lit', count(*) = 1 AND min(l.comment) = 'Vu, on change de gants', count(*)::text
  FROM activity_laps l JOIN t_ids ON l.activity_id = t_ids.act;

-- ---------- 2. Wellness : séance d'hier rattachée ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SELECT public.wellness_set_day(athlete, '2001-01-03'::date,
  jsonb_build_object('fatigue', 3, 'sommeil', 3, 'stress', 3, 'energie', 3, 'doms', 4,
    'domsLevels', '{"quads_f":2}'::jsonb,
    'domsWorkout', jsonb_build_object('id', act, 'name', 'Force · chaîne postérieure'))) FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT '05 athlète : séance rattachée projetée',
       w.doms_workout_id = t_ids.act AND w.doms_workout_name = 'Force · chaîne postérieure', w.doms_workout_name
  FROM wellness_entries w JOIN t_ids ON w.athlete_id = t_ids.athlete WHERE w.day = '2001-01-03';

SELECT public.wellness_set_day(athlete, '2001-01-04'::date,
  jsonb_build_object('fatigue', 3, 'domsWorkout', jsonb_build_object('id', 'pas-un-uuid', 'name', 'X'))) FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT '06 id illisible → rien de rattaché', w.doms_workout_id IS NULL AND w.doms_workout_name IS NULL, NULL
  FROM wellness_entries w JOIN t_ids ON w.athlete_id = t_ids.athlete WHERE w.day = '2001-01-04';

-- Le coach lit le rattachement ; l'autre coach ne voit pas la ligne.
SELECT set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true) FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT '07 coach lit le rattachement', count(*) = 1, count(*)::text
  FROM wellness_entries w JOIN t_ids ON w.athlete_id = t_ids.athlete
 WHERE w.day = '2001-01-03' AND w.doms_workout_id = t_ids.act;
SELECT set_config('request.jwt.claims', json_build_object('sub', other_coach, 'role', 'authenticated')::text, true) FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT '08 autre coach ne lit rien', count(*) = 0, count(*)::text
  FROM wellness_entries w JOIN t_ids ON w.athlete_id = t_ids.athlete WHERE w.day = '2001-01-03';

RESET ROLE;
SELECT name, ok, detail FROM t_res ORDER BY n;
ROLLBACK;
