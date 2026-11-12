-- Tests de 20261112100000_hr_zone_models.sql (modèles de zones, temps par zone).
-- Toujours annulé. Données fictives uniquement.
--
-- Avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261112100000_hr_zone_models.sql; \
--    sed -e '/^BEGIN;$/d' supabase/tests/hr_zone_models.sql) > "$TMPDIR/hz.sql"
--   supabase db query --linked -f "$TMPDIR/hz.sql"
-- Après application : supabase db query --linked -f supabase/tests/hr_zone_models.sql

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
  NULL::uuid AS coach, NULL::uuid AS other_coach, NULL::uuid AS act, NULL::uuid AS model;
UPDATE t_ids SET coach = (SELECT coach_id FROM profiles WHERE id = t_ids.athlete);
UPDATE t_ids SET other_coach = (SELECT c.id FROM profiles c
    WHERE c.role IN ('coach', 'coach_athlete') AND c.id <> t_ids.coach
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = t_ids.athlete AND cc.co_coach_id = c.id)
    ORDER BY c.id LIMIT 1);
GRANT SELECT, UPDATE ON t_ids TO anon, authenticated;

WITH a AS (
  INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, duration_s)
  SELECT athlete, 'file_import', 'test-hz-1', '2026-11-03T17:30:00Z', '2026-11-03', 'running', 600 FROM t_ids
  RETURNING id)
UPDATE t_ids SET act = (SELECT id FROM a);

INSERT INTO t_res (name, ok, detail)
SELECT 'fixtures', athlete IS NOT NULL AND coach IS NOT NULL AND other_coach IS NOT NULL AND act IS NOT NULL, '' FROM t_ids;

-- ---------- Calcul pur ----------
INSERT INTO t_res (name, ok, detail)
SELECT 'activity_zone_seconds : 152 = zone 2, trou plafonné à 10 s, pause = 0',
       public.activity_zone_seconds(ARRAY[0,1,2,3,13,14,15], ARRAY[0,1,2,3,13,13,14],
                                    ARRAY[140,151,152,175,172,180,NULL]::smallint[], ARRAY[152,172]::smallint[])
       = ARRAY[2,1,11,0],
       public.activity_zone_seconds(ARRAY[0,1,2,3,13,14,15], ARRAY[0,1,2,3,13,13,14],
                                    ARRAY[140,151,152,175,172,180,NULL]::smallint[], ARRAY[152,172]::smallint[])::text;

-- ---------- Modèle à 3 zones enregistré par l'athlète ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
UPDATE t_ids SET model = public.save_hr_zone_model(athlete, 'three', ARRAY[152,172], '2026-01-01');
DO $$ BEGIN
  PERFORM public.save_hr_zone_model((SELECT athlete FROM t_ids), 'three', ARRAY[172,152], '2026-01-01');
  INSERT INTO t_res (name, ok, detail) VALUES ('bornes décroissantes refusées', false, 'acceptées');
EXCEPTION WHEN check_violation THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('bornes décroissantes refusées', true, SQLERRM);
END $$;
RESET ROLE;

INSERT INTO t_res (name, ok, detail)
SELECT 'bornes valides à la date de la séance', b.kind = 'three' AND b.bounds = ARRAY[152,172]::smallint[], b.bounds::text
  FROM t_ids, public.hr_zone_bounds_at(t_ids.athlete, '2026-11-03') b;

-- Série reçue → résumé calculé par le trigger.
SELECT public.activity_detail_upsert(act, '{"source":"fit","stream":{"t":[0,1,2,3,13],"hr":[140,150,160,175,null]},"laps":[]}'::jsonb)
  FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT 'résumé stocké : secondes par zone + bornes utilisées',
       z.seconds = ARRAY[2,1,10] AND z.bounds = ARRAY[152,172]::smallint[] AND z.kind = 'three',
       concat_ws(' ', z.seconds::text, z.bounds::text)
  FROM activity_zone_summaries z JOIN t_ids ON z.activity_id = t_ids.act;

-- Séance antérieure au modèle : pas ces bornes.
INSERT INTO t_res (name, ok, detail)
SELECT 'avant valid_from : pas de modèle 3 zones',
       NOT EXISTS (SELECT 1 FROM public.hr_zone_bounds_at(t_ids.athlete, '2025-12-31') b WHERE b.kind = 'three'), ''
  FROM t_ids;

-- ---------- Autre coach : ni lecture ni écriture ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', other_coach, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
INSERT INTO t_res (name, ok, detail)
SELECT 'rls: autre coach ne lit pas les modèles', count(*) = 0, count(*)::text
  FROM hr_zone_models WHERE athlete_id = (SELECT athlete FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT 'rls: autre coach ne lit pas le résumé', count(*) = 0, count(*)::text
  FROM activity_zone_summaries WHERE athlete_id = (SELECT athlete FROM t_ids);
DO $$ BEGIN
  PERFORM public.save_hr_zone_model((SELECT athlete FROM t_ids), 'three', ARRAY[150,170], current_date);
  INSERT INTO t_res (name, ok, detail) VALUES ('rpc: autre coach ne peut pas écrire', false, 'accepté');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('rpc: autre coach ne peut pas écrire', true, SQLERRM);
END $$;
RESET ROLE;

-- ---------- Test SV1 / SV2 en bpm → proposition, validée par le coach ----------
WITH r AS (
  INSERT INTO athlete_test_results (athlete_id, test_definition_id, performed_at)
  SELECT athlete, '00000000-0000-0000-0000-0000000000f1', '2026-11-05' FROM t_ids RETURNING id)
INSERT INTO athlete_test_values (result_id, variable_id, value)
SELECT r.id, tv.id, CASE tv.key WHEN 'sv1_hr' THEN 150 ELSE 170 END FROM r, test_variables tv
 WHERE tv.test_definition_id = '00000000-0000-0000-0000-0000000000f1';

INSERT INTO t_res (name, ok, detail)
SELECT 'test SV1/SV2 → modèle proposé, non appliqué',
       count(*) = 1 AND bool_and(bounds = ARRAY[150,170]::smallint[]),
       count(*)::text
  FROM hr_zone_models h JOIN t_ids ON h.athlete_id = t_ids.athlete WHERE h.status = 'proposed';

SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM public.decide_hr_zone_model((SELECT id FROM hr_zone_models WHERE athlete_id = auth.uid() AND status = 'proposed'), true);
  INSERT INTO t_res (name, ok, detail) VALUES ('rpc: l''athlète ne valide pas une proposition', false, 'accepté');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('rpc: l''athlète ne valide pas une proposition', true, SQLERRM);
END $$;
RESET ROLE;

-- Le coach référent valide (proposition lue en tant que propriétaire, transmise à la session coach).
CREATE TEMP TABLE t_prop ON COMMIT DROP AS
  SELECT h.id FROM hr_zone_models h JOIN t_ids ON h.athlete_id = t_ids.athlete WHERE h.status = 'proposed';
GRANT SELECT ON t_prop TO authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
SELECT public.decide_hr_zone_model((SELECT id FROM t_prop), true);
RESET ROLE;

INSERT INTO t_res (name, ok, detail)
SELECT 'proposition validée → bornes du test à partir du 05/11',
       (SELECT b.bounds FROM public.hr_zone_bounds_at(t_ids.athlete, '2026-11-06') b) = ARRAY[150,170]::smallint[]
       AND (SELECT b.bounds FROM public.hr_zone_bounds_at(t_ids.athlete, '2026-11-03') b) = ARRAY[152,172]::smallint[],
       '' FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT 'séance du 03/11 garde ses bornes du 03/11', z.bounds = ARRAY[152,172]::smallint[], z.bounds::text
  FROM activity_zone_summaries z JOIN t_ids ON z.activity_id = t_ids.act;

SELECT n, ok, name, detail FROM t_res ORDER BY ok, n;

ROLLBACK;
