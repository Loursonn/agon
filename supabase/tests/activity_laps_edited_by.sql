-- Tests de 20261116223000_activity_laps_edited_by.sql
-- (« Tours modifiés par ton coach » : qui a enregistré les tours en dernier).
-- Toujours annulé. Données fictives uniquement (activité et jour inventés).
--
-- Avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261116223000_activity_laps_edited_by.sql; \
--    sed -e '/^BEGIN;$/d' supabase/tests/activity_laps_edited_by.sql) > "$TMPDIR/laps_by.sql"
--   supabase db query --linked -f "$TMPDIR/laps_by.sql"
-- Après application : supabase db query --linked -f supabase/tests/activity_laps_edited_by.sql

BEGIN;

CREATE TEMP TABLE t_res (n serial, name text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t_res TO anon, authenticated;
GRANT ALL ON SEQUENCE t_res_n_seq TO anon, authenticated;

CREATE TEMP TABLE t_ids ON COMMIT DROP AS
SELECT a.id AS athlete, a.coach_id AS coach, NULL::uuid AS act, 0 AS v
FROM profiles a WHERE a.full_name = 'Léa Démo' AND a.coach_id IS NOT NULL LIMIT 1;
GRANT SELECT, UPDATE ON t_ids TO anon, authenticated;

WITH a AS (
  INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, duration_s)
  SELECT athlete, 'file_import', 'test-laps-edited-by', '2001-01-03T17:30:00Z', '2001-01-03', 'running', 100 FROM t_ids
  RETURNING id)
UPDATE t_ids SET act = (SELECT id FROM a);
SELECT public.activity_detail_upsert(act, jsonb_build_object(
  'source', 'fit',
  'stream', jsonb_build_object('t', (SELECT jsonb_agg(i) FROM generate_series(0, 99) i)),
  'laps', '[{"startS":0,"endS":40},{"startS":40,"endS":99}]'::jsonb)) FROM t_ids;

INSERT INTO t_res (name, ok, detail)
SELECT '00 jeu de test complet', athlete IS NOT NULL AND coach IS NOT NULL AND act IS NOT NULL, NULL FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT '01 nouvelle séance : personne', s.laps_edited_by IS NULL, s.laps_edited_by::text
  FROM activity_streams s JOIN t_ids ON s.activity_id = t_ids.act;

-- Le coach enregistre : son id est retenu.
SELECT set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
UPDATE t_ids SET v = public.save_activity_laps(act, 0, '[{"start_s":0,"end_s":100,"lap_type":"work"}]'::jsonb);
RESET ROLE;
INSERT INTO t_res (name, ok, detail)
SELECT '02 coach enregistre : laps_edited_by = coach', s.laps_edited_by = t_ids.coach AND s.laps_edited, s.laps_edited_by::text
  FROM activity_streams s JOIN t_ids ON s.activity_id = t_ids.act;

-- L'athlète enregistre ensuite : c'est elle.
SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
UPDATE t_ids SET v = public.save_activity_laps(act, v, '[{"start_s":0,"end_s":50},{"start_s":50,"end_s":100}]'::jsonb);
INSERT INTO t_res (name, ok, detail)
SELECT '03 athlète lit sa propre colonne', s.laps_edited_by = t_ids.athlete, s.laps_edited_by::text
  FROM activity_streams s JOIN t_ids ON s.activity_id = t_ids.act;

-- Retour aux tours de la montre : effacé.
UPDATE t_ids SET v = public.reset_activity_laps_to_watch(act, v);
RESET ROLE;
INSERT INTO t_res (name, ok, detail)
SELECT '04 retour montre : personne', s.laps_edited_by IS NULL AND NOT s.laps_edited, s.laps_edited_by::text
  FROM activity_streams s JOIN t_ids ON s.activity_id = t_ids.act;

-- Les droits n'ont pas bougé : anon ne peut appeler aucune des deux.
INSERT INTO t_res (name, ok, detail)
SELECT '05 anon sans droit', NOT has_function_privilege('anon', 'public.save_activity_laps(uuid, integer, jsonb)', 'EXECUTE')
       AND NOT has_function_privilege('anon', 'public.reset_activity_laps_to_watch(uuid, integer)', 'EXECUTE'), NULL;

SELECT name, ok, detail FROM t_res ORDER BY n;
ROLLBACK;
