-- Tests de 20261112160000_history_zones_garmin_ai.sql. Toujours annulé. Données fictives (2001).
--
-- Avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261112160000_history_zones_garmin_ai.sql; \
--    sed -e '/^BEGIN;$/d' supabase/tests/history_zones_garmin_ai.sql) > "$TMPDIR/hz.sql"
--   supabase db query --linked -f "$TMPDIR/hz.sql"
-- Après application : supabase db query --linked -f supabase/tests/history_zones_garmin_ai.sql

BEGIN;

CREATE TEMP TABLE t_res (n serial, name text, ok boolean, detail text) ON COMMIT DROP;
CREATE TEMP TABLE t_ids ON COMMIT DROP AS
SELECT (SELECT a.id FROM profiles a
         WHERE a.role = 'athlete' AND a.coach_id IS NOT NULL AND NOT coalesce(a.is_pending, false)
         ORDER BY a.id LIMIT 1) AS athlete, NULL::uuid AS model, NULL::jsonb AS r;

SELECT set_config('request.jwt.claims', '', true);

-- ---------- IA : appareil Garmin ----------
UPDATE t_ids SET r = public.merge_provider_activity(athlete, 'file_import', 'file', jsonb_build_object(
  'external_id', 'file:garmin-fit', 'started_at', '2001-02-01T07:00:00Z', 'local_date', '2001-02-01', 'sport', 'running',
  'raw', jsonb_build_object('format', 'fit', 'manufacturer', 1), 'origin_quality', 'fit'));
UPDATE t_ids SET r = public.merge_provider_activity(athlete, 'file_import', 'file', jsonb_build_object(
  'external_id', 'file:coros-fit', 'started_at', '2001-02-02T07:00:00Z', 'local_date', '2001-02-02', 'sport', 'running',
  'raw', jsonb_build_object('format', 'fit', 'manufacturer', 294), 'origin_quality', 'fit'));
UPDATE t_ids SET r = public.merge_provider_activity(athlete, 'file_import', 'file', jsonb_build_object(
  'external_id', 'file:garmin-tcx', 'started_at', '2001-02-03T07:00:00Z', 'local_date', '2001-02-03', 'sport', 'running',
  'raw', jsonb_build_object('format', 'tcx', 'creator', 'Garmin Forerunner test'), 'origin_quality', 'tcx'));
INSERT INTO t_res (name, ok, detail)
SELECT 'IA : FIT Garmin et TCX Garmin exclus, autre montre autorisée',
       bool_and(CASE external_id WHEN 'file:coros-fit' THEN ai_allowed ELSE NOT ai_allowed END) AND count(*) = 3,
       string_agg(external_id || '=' || ai_allowed, ', ')
  FROM provider_activities WHERE athlete_id = (SELECT athlete FROM t_ids) AND local_date BETWEEN '2001-02-01' AND '2001-02-03';
INSERT INTO t_res (name, ok, detail)
SELECT 'IA : la vue de l''IA ne voit pas les sorties Garmin', count(*) = 1, count(*)::text
  FROM ai_provider_activities WHERE athlete_id = (SELECT athlete FROM t_ids) AND local_date BETWEEN '2001-02-01' AND '2001-02-03';
-- Une mise à jour ne peut pas rendre l'autorisation.
UPDATE provider_activities SET ai_allowed = true
 WHERE athlete_id = (SELECT athlete FROM t_ids) AND external_id = 'file:garmin-fit';
INSERT INTO t_res (name, ok, detail)
SELECT 'IA : impossible de réautoriser une sortie Garmin', NOT ai_allowed, ai_allowed::text
  FROM provider_activities WHERE athlete_id = (SELECT athlete FROM t_ids) AND external_id = 'file:garmin-fit';

-- ---------- Zones : modèle actuel pour l'historique ----------
WITH m AS (
  INSERT INTO hr_zone_models (athlete_id, kind, bounds, valid_from, status)
  SELECT athlete, 'three', '{150,170}', current_date + 1, 'active' FROM t_ids RETURNING id)
UPDATE t_ids SET model = (SELECT id FROM m);
SELECT public.activity_detail_upsert(
  (SELECT id FROM provider_activities WHERE athlete_id = (SELECT athlete FROM t_ids) AND external_id = 'file:coros-fit'),
  jsonb_build_object('source', 'fit', 'stream', jsonb_build_object(
    't', (SELECT jsonb_agg(i) FROM generate_series(0, 9) i),
    'hr', '[140,140,140,160,160,160,160,180,180,180]'::jsonb)));
INSERT INTO t_res (name, ok, detail)
SELECT 'zones : sortie de 2001 calculée avec le modèle actuel',
       z.model_id = (SELECT model FROM t_ids) AND z.kind = 'three' AND z.seconds = '{3,4,2}',
       coalesce(z.kind || ' ' || z.seconds::text, 'aucun résumé')
  FROM provider_activities a LEFT JOIN activity_zone_summaries z ON z.activity_id = a.id
 WHERE a.athlete_id = (SELECT athlete FROM t_ids) AND a.external_id = 'file:coros-fit';

SELECT n, name, ok, detail FROM t_res ORDER BY n;

ROLLBACK;
