-- Tests de 20261112150000_activity_merge.sql (fusion des sources d'une sortie).
-- Toujours annulé. Données fictives uniquement (jours de 2001, aucune vraie sortie).
--
-- Avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261112150000_activity_merge.sql; \
--    sed -e '/^BEGIN;$/d' supabase/tests/activity_merge.sql) > "$TMPDIR/am.sql"
--   supabase db query --linked -f "$TMPDIR/am.sql"
-- Après application : supabase db query --linked -f supabase/tests/activity_merge.sql

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
  NULL::uuid AS coach, NULL::uuid AS other_coach, NULL::jsonb AS r;
UPDATE t_ids SET coach = (SELECT coach_id FROM profiles WHERE id = t_ids.athlete);
UPDATE t_ids SET other_coach = (SELECT c.id FROM profiles c
    WHERE c.role IN ('coach', 'coach_athlete') AND c.id <> t_ids.coach
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = t_ids.athlete AND cc.co_coach_id = c.id)
    ORDER BY c.id LIMIT 1);
GRANT SELECT, UPDATE ON t_ids TO anon, authenticated;

-- Pas d'activité de test résiduelle sur ces jours.
INSERT INTO t_res (name, ok, detail)
SELECT 'fixtures : jours de test vides', count(*) = 0, count(*)::text
  FROM provider_activities WHERE athlete_id = (SELECT athlete FROM t_ids) AND local_date BETWEEN '2001-01-01' AND '2001-01-31';

-- Sorties fictives : même sortie vue par Garmin (FIT) et par l'archive Strava (GPX + CSV).
CREATE TEMP TABLE t_g ON COMMIT DROP AS SELECT d, jsonb_build_object(
  'external_id', 'g-test-' || d, 'started_at', ('2001-01-' || d || 'T07:00:00Z'), 'local_date', ('2001-01-' || d),
  'sport', 'running', 'duration_s', 3600, 'distance_m', 10000, 'avg_hr', 150, 'device_name', 'Forerunner test',
  'origin_quality', 'fit') AS j FROM (VALUES ('10'), ('11')) v(d);
CREATE TEMP TABLE t_s ON COMMIT DROP AS SELECT d, jsonb_build_object(
  'external_id', 'strava:9' || d, 'started_at', ('2001-01-' || d || 'T07:00:30Z'), 'local_date', ('2001-01-' || d),
  'sport', 'running', 'duration_s', 3590, 'distance_m', 10050, 'avg_hr', 149, 'calories', 700,
  'title', 'Sortie fictive', 'description', 'Texte fictif', 'rpe', 6, 'gear', 'Chaussures test',
  'strava_activity_id', '9' || d, 'origin_quality', 'gpx') AS j FROM (VALUES ('10'), ('11')) v(d);
GRANT SELECT ON t_g, t_s TO authenticated;

CREATE TEMP TABLE t_detail ON COMMIT DROP AS SELECT
  jsonb_build_object('source', 'fit', 'stream', jsonb_build_object('t', (SELECT jsonb_agg(i) FROM generate_series(0, 9) i),
    'hr', (SELECT jsonb_agg(140 + i) FROM generate_series(0, 9) i)), 'laps', '[{"startS":0,"endS":9}]'::jsonb) AS fit,
  jsonb_build_object('source', 'gpx', 'stream', jsonb_build_object('t', (SELECT jsonb_agg(i) FROM generate_series(0, 4) i)),
    'laps', '[]'::jsonb) AS gpx;
GRANT SELECT ON t_detail TO authenticated;

-- Le serveur : pas de jeton (auth.uid() nul). L'athlète : jeton.
CREATE FUNCTION pg_temp.as_server() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true); $$;
CREATE FUNCTION pg_temp.act(p_day text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM provider_activities WHERE athlete_id = (SELECT athlete FROM t_ids) AND local_date = ('2001-01-' || p_day)::date
   ORDER BY started_at LIMIT 1; $$;
GRANT EXECUTE ON FUNCTION pg_temp.act(text) TO authenticated;

-- ---------- Ordre 1 (jour 10) : Garmin puis Strava ----------
SELECT pg_temp.as_server();
UPDATE t_ids SET r = public.merge_provider_activity(athlete, 'garmin', 'garmin', (SELECT j FROM t_g WHERE d = '10'));
INSERT INTO t_res (name, ok, detail) SELECT 'Garmin seul : créée', r->>'status' = 'created', r::text FROM t_ids;
SELECT public.activity_detail_upsert(pg_temp.act('10'), fit) FROM t_detail;

SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
UPDATE t_ids SET r = public.merge_provider_activity(athlete, 'file_import', 'strava_archive', (SELECT j FROM t_s WHERE d = '10'));
INSERT INTO t_res (name, ok, detail)
SELECT 'Strava après Garmin : complétée (pas de 2e ligne)', r->>'status' = 'merged' AND (r->>'stream_rank')::int = 3, r::text FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT 'Strava après Garmin : série GPX refusée (FIT déjà là)',
       (public.activity_detail_upsert(pg_temp.act('10'), gpx)->>'stream_kept')::boolean, '' FROM t_detail;
-- Ré-import identique.
UPDATE t_ids SET r = public.merge_provider_activity(athlete, 'file_import', 'strava_archive', (SELECT j FROM t_s WHERE d = '10'));
INSERT INTO t_res (name, ok, detail) SELECT 'ré-import identique : unchanged', r->>'status' = 'unchanged', r::text FROM t_ids;
-- Un autre fichier avec un RPE différent : le RPE déjà présent reste.
UPDATE t_ids SET r = public.merge_provider_activity(athlete, 'file_import', 'file',
  (SELECT j || '{"external_id":"file:autre","rpe":9,"title":"Autre titre","strava_activity_id":null}'::jsonb FROM t_s WHERE d = '10'));
RESET ROLE;

-- ---------- Ordre 2 (jour 11) : Strava puis Garmin ----------
SET LOCAL ROLE authenticated;
UPDATE t_ids SET r = public.merge_provider_activity(athlete, 'file_import', 'strava_archive', (SELECT j FROM t_s WHERE d = '11'));
INSERT INTO t_res (name, ok, detail) SELECT 'Strava seul : créée', r->>'status' = 'created', r::text FROM t_ids;
SELECT public.activity_detail_upsert(pg_temp.act('11'), gpx) FROM t_detail;
RESET ROLE;
SELECT pg_temp.as_server();
UPDATE t_ids SET r = public.merge_provider_activity(athlete, 'garmin', 'garmin', (SELECT j FROM t_g WHERE d = '11'));
INSERT INTO t_res (name, ok, detail) SELECT 'Garmin après Strava : complétée', r->>'status' = 'merged', r::text FROM t_ids;
SELECT public.activity_detail_upsert(pg_temp.act('11'), fit) FROM t_detail;
UPDATE t_ids SET r = public.merge_provider_activity(athlete, 'file_import', 'file',
  (SELECT j || '{"external_id":"file:autre2","rpe":9,"title":"Autre titre","strava_activity_id":null}'::jsonb FROM t_s WHERE d = '11'));

-- ---------- Même résultat dans les deux ordres ----------
CREATE TEMP TABLE t_cmp ON COMMIT DROP AS
SELECT local_date, count(*) OVER (PARTITION BY local_date) AS n,
       to_jsonb(a) - ARRAY['id', 'external_id', 'started_at', 'local_date', 'imported_at', 'strava_activity_id'] AS v,
       a.started_at::time AS t, s.normalized_from, s.sample_count, s.source::text AS stream_source,
       (SELECT count(*) FROM activity_laps l WHERE l.activity_id = a.id) AS laps
  FROM provider_activities a LEFT JOIN activity_streams s ON s.activity_id = a.id
 WHERE a.athlete_id = (SELECT athlete FROM t_ids) AND a.local_date IN ('2001-01-10', '2001-01-11');

INSERT INTO t_res (name, ok, detail)
SELECT 'une seule ligne par sortie, dans les deux ordres', bool_and(n = 1) AND count(*) = 2, string_agg(n::text, ',') FROM t_cmp;
INSERT INTO t_res (name, ok, detail)
SELECT 'Garmin puis Strava = Strava puis Garmin',
       (SELECT (v, t, normalized_from, sample_count, stream_source, laps) FROM t_cmp WHERE local_date = '2001-01-10')
       IS NOT DISTINCT FROM
       (SELECT (v, t, normalized_from, sample_count, stream_source, laps) FROM t_cmp WHERE local_date = '2001-01-11'),
       (SELECT string_agg(v::text || ' ' || normalized_from, ' | ') FROM t_cmp);
INSERT INTO t_res (name, ok, detail)
SELECT 'résultat : source garmin, mesures Garmin, texte Strava, RPE 6, série FIT, IA exclue',
       v->>'source' = 'garmin' AND (v->>'distance_m')::numeric = 10000 AND (v->>'avg_hr')::int = 150
       AND (v->>'calories')::int = 700 AND v->>'title' = 'Sortie fictive' AND (v->>'rpe')::int = 6
       AND v->>'gear' = 'Chaussures test' AND v->>'origin_quality' = 'fit'
       AND v->'sources' = '["file", "garmin", "strava_archive"]'::jsonb AND NOT (v->>'ai_allowed')::boolean
       AND normalized_from = 'fit' AND sample_count = 10 AND stream_source = 'garmin' AND t = '07:00:00',
       v::text
  FROM t_cmp WHERE local_date = '2001-01-11';

-- ---------- Tours modifiés à la main : préservés ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
UPDATE t_ids SET r = public.merge_provider_activity(athlete, 'file_import', 'file', jsonb_build_object(
  'external_id', 'file:laps', 'started_at', '2001-01-12T07:00:00Z', 'local_date', '2001-01-12', 'sport', 'cycling',
  'duration_s', 600, 'origin_quality', 'gpx'));
SELECT public.activity_detail_upsert(pg_temp.act('12'), gpx) FROM t_detail;
SELECT public.save_activity_laps(pg_temp.act('12'), 0, '[{"start_s":0,"end_s":3,"name":"Tour à la main"}]'::jsonb);
RESET ROLE;
SELECT pg_temp.as_server();
UPDATE t_ids SET r = public.merge_provider_activity(athlete, 'garmin', 'garmin', jsonb_build_object(
  'external_id', 'g-test-12', 'started_at', '2001-01-12T07:00:10Z', 'local_date', '2001-01-12', 'sport', 'cycling',
  'duration_s', 610, 'origin_quality', 'fit'));
SELECT public.activity_detail_upsert(pg_temp.act('12'), fit) FROM t_detail;
INSERT INTO t_res (name, ok, detail)
SELECT 'série FIT remplace le GPX, tour modifié à la main gardé',
       s.normalized_from = 'fit' AND s.laps_edited AND count(l.*) = 1 AND min(l.name) = 'Tour à la main',
       s.normalized_from || ' ' || count(l.*)
  FROM activity_streams s LEFT JOIN activity_laps l USING (activity_id)
 WHERE s.activity_id = pg_temp.act('12') GROUP BY s.normalized_from, s.laps_edited;

-- ---------- Ce qui ne doit PAS fusionner ----------
UPDATE t_ids SET r = public.merge_provider_activity(athlete, 'garmin', 'garmin', jsonb_build_object(
  'external_id', 'g-test-13a', 'started_at', '2001-01-13T07:00:00Z', 'local_date', '2001-01-13', 'sport', 'swimming'));
UPDATE t_ids SET r = public.merge_provider_activity(athlete, 'garmin', 'garmin', jsonb_build_object(
  'external_id', 'g-test-13b', 'started_at', '2001-01-13T07:01:00Z', 'local_date', '2001-01-13', 'sport', 'cycling'));
UPDATE t_ids SET r = public.merge_provider_activity(athlete, 'garmin', 'garmin', jsonb_build_object(
  'external_id', 'g-test-13c', 'started_at', '2001-01-13T07:01:30Z', 'local_date', '2001-01-13', 'sport', 'cycling'));
INSERT INTO t_res (name, ok, detail)
SELECT 'triathlon et deux activités d''une même montre : 3 lignes', count(*) = 3, count(*)::text
  FROM provider_activities WHERE athlete_id = (SELECT athlete FROM t_ids) AND local_date = '2001-01-13';
-- HYROX Garmin ↔ « Entraînement » Strava : la même sortie.
UPDATE t_ids SET r = public.merge_provider_activity(athlete, 'garmin', 'garmin', jsonb_build_object(
  'external_id', 'g-test-14', 'started_at', '2001-01-14T07:00:00Z', 'local_date', '2001-01-14', 'sport', 'hyrox'));
UPDATE t_ids SET r = public.merge_provider_activity(athlete, 'file_import', 'strava_archive', jsonb_build_object(
  'external_id', 'strava:914', 'started_at', '2001-01-14T07:00:20Z', 'local_date', '2001-01-14', 'sport', 'training',
  'strava_activity_id', '914', 'title', 'HYROX fictif'));
INSERT INTO t_res (name, ok, detail)
SELECT 'HYROX Garmin + Entraînement Strava : 1 ligne', count(*) = 1 AND min(sport) = 'hyrox' AND min(title) = 'HYROX fictif',
       count(*)::text FROM provider_activities WHERE athlete_id = (SELECT athlete FROM t_ids) AND local_date = '2001-01-14';

-- ---------- Droits ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
UPDATE t_ids SET r = public.merge_provider_activity(athlete, 'file_import', 'strava_archive', jsonb_build_object(
  'external_id', 'strava:915', 'started_at', '2001-01-15T07:00:00Z', 'local_date', '2001-01-15', 'sport', 'running',
  'strava_activity_id', '915', 'origin_quality', 'summary'));
INSERT INTO t_res (name, ok, detail) SELECT 'coach : dépose pour son athlète', r->>'status' = 'created', r::text FROM t_ids;
UPDATE t_ids SET r = public.merge_provider_activities(athlete, 'file_import', 'strava_archive', jsonb_build_array(
  jsonb_build_object('external_id', 'strava:915', 'started_at', '2001-01-15T07:00:00Z', 'local_date', '2001-01-15',
                     'sport', 'running', 'strava_activity_id', '915', 'origin_quality', 'summary'),
  jsonb_build_object('external_id', 'strava:916', 'started_at', '2001-01-16T07:00:00Z', 'local_date', '2001-01-16',
                     'avg_hr', 400)));
INSERT INTO t_res (name, ok, detail)
SELECT 'paquet : ré-import unchanged, valeur hors bornes en erreur sans annuler',
       r->0->>'status' = 'unchanged' AND r->1->>'status' = 'error', r::text FROM t_ids;
DO $$ BEGIN
  PERFORM public.merge_provider_activity((SELECT athlete FROM t_ids), 'garmin', 'garmin', jsonb_build_object(
    'external_id', 'g-faux', 'started_at', '2001-01-17T07:00:00Z', 'local_date', '2001-01-17'));
  INSERT INTO t_res (name, ok, detail) VALUES ('coach : ne peut pas se faire passer pour Garmin', false, 'accepté');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('coach : ne peut pas se faire passer pour Garmin', true, SQLERRM);
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', other_coach, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM public.merge_provider_activity((SELECT athlete FROM t_ids), 'file_import', 'strava_archive', jsonb_build_object(
    'external_id', 'strava:918', 'started_at', '2001-01-18T07:00:00Z', 'local_date', '2001-01-18'));
  INSERT INTO t_res (name, ok, detail) VALUES ('coach d''un autre athlète refusé', false, 'accepté');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('coach d''un autre athlète refusé', true, SQLERRM);
END $$;
DO $$ BEGIN
  PERFORM public.activity_detail_upsert(pg_temp.act('12'), (SELECT gpx FROM t_detail));
  INSERT INTO t_res (name, ok, detail) VALUES ('coach d''un autre athlète : détail refusé', false, 'accepté');
EXCEPTION WHEN insufficient_privilege OR no_data_found THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('coach d''un autre athlète : détail refusé', true, SQLERRM);
END $$;
INSERT INTO t_res (name, ok, detail)
SELECT 'coach d''un autre athlète : ne voit rien', count(*) = 0, count(*)::text
  FROM provider_activities WHERE athlete_id = (SELECT athlete FROM t_ids);
RESET ROLE;

SELECT n, name, ok, detail FROM t_res ORDER BY n;

ROLLBACK;
