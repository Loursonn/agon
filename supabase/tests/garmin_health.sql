-- Tests de 20261112140000_garmin_health.sql (santé Garmin en tables).
-- Toujours annulé. Données fictives uniquement (jour 2031-03-04).
--
-- Avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261112140000_garmin_health.sql; \
--    sed -e '/^BEGIN;$/d' supabase/tests/garmin_health.sql) > "$TMPDIR/gh.sql"
--   supabase db query --linked -f "$TMPDIR/gh.sql"
-- Après application : supabase db query --linked -f supabase/tests/garmin_health.sql

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
  NULL::uuid AS other_coach;
UPDATE t_ids SET other_coach = (SELECT c.id FROM profiles c
    WHERE c.role IN ('coach', 'coach_athlete') AND c.id <> (SELECT coach_id FROM profiles WHERE id = t_ids.athlete)
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = t_ids.athlete AND cc.co_coach_id = c.id)
    ORDER BY c.id LIMIT 1);
GRANT SELECT ON t_ids TO anon, authenticated;

-- Fusion : le sommeil n'efface pas les pas ; null explicite = mesuré absent.
SELECT public.provider_daily_merge(athlete, 'garmin', '2031-03-04', 'dailies',
  '{"steps": 12000, "hr_min": 44, "total_kcal": 2600, "stress_max": 88, "body_battery_charged": 60}'::jsonb,
  '{"summaryId": "x"}'::jsonb) FROM t_ids;
SELECT public.provider_daily_merge(athlete, 'garmin', '2031-03-04', 'sleeps',
  '{"sleep_total_min": 450, "sleep_light_min": 220, "sleep_start_at": "2031-03-03T22:40:00Z",
    "sleep_subscores": {"stress": {"qualifierKey": "GOOD"}}, "hr_avg": null}'::jsonb,
  '{"summaryId": "y"}'::jsonb) FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT 'fusion : champs de chaque type gardés, brut rangé par type',
       steps = 12000 AND hr_min = 44 AND total_kcal = 2600 AND sleep_total_min = 450 AND sleep_light_min = 220
       AND sleep_start_at = '2031-03-03T22:40:00Z' AND sleep_subscores->'stress'->>'qualifierKey' = 'GOOD'
       AND raw ? 'dailies' AND raw ? 'sleeps',
       concat_ws(' ', steps, hr_min, sleep_total_min)
  FROM provider_dailies d JOIN t_ids ON d.athlete_id = t_ids.athlete
 WHERE d.source = 'garmin' AND d.day = '2031-03-04';

DO $$ BEGIN
  PERFORM public.provider_daily_merge((SELECT athlete FROM t_ids), 'garmin', '2031-03-04', 'x; drop', '{}'::jsonb, NULL);
  INSERT INTO t_res (name, ok, detail) VALUES ('type de résumé invalide refusé', false, 'accepté');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('type de résumé invalide refusé', true, SQLERRM);
END $$;
-- Clé inconnue : ignorée (liste blanche), jamais une colonne arbitraire.
SELECT public.provider_daily_merge(athlete, 'garmin', '2031-03-04', 'dailies', '{"id": "00000000-0000-0000-0000-000000000000", "athlete_id": null}'::jsonb, NULL) FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT 'fusion : colonnes hors liste blanche ignorées', count(*) = 1, count(*)::text
  FROM provider_dailies d JOIN t_ids ON d.athlete_id = t_ids.athlete WHERE d.day = '2031-03-04';

-- Séries : fusion de deux envois, le même instant remplacé, moyennes du jour.
SELECT public.provider_intraday_merge(athlete, 'garmin', '2031-03-04', 'spo2', ARRAY[0, 60, 120], ARRAY[97, 95, 96]::real[], 3600) FROM t_ids;
SELECT public.provider_intraday_merge(athlete, 'garmin', '2031-03-04', 'spo2', ARRAY[120, 180], ARRAY[93, 98]::real[], 3600) FROM t_ids;
SELECT public.provider_intraday_merge(athlete, 'garmin', '2031-03-04', 'body_battery', ARRAY[0, 180], ARRAY[35, 80]::real[], 3600) FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT 'intraday : points fusionnés et triés, nouvel envoi prioritaire',
       offsets = ARRAY[0, 60, 120, 180] AND "values" = ARRAY[97, 95, 93, 98]::real[], "values"::text
  FROM provider_intraday i JOIN t_ids ON i.athlete_id = t_ids.athlete WHERE i.day = '2031-03-04' AND measure = 'spo2';
INSERT INTO t_res (name, ok, detail)
SELECT 'intraday → jour : SpO2 moyenne / minimale, Body Battery min / max',
       spo2_avg = 95.8::real AND spo2_min = 93 AND body_battery_min = 35 AND body_battery_max = 80 AND steps = 12000,
       concat_ws(' ', spo2_avg, spo2_min, body_battery_min, body_battery_max)
  FROM provider_dailies d JOIN t_ids ON d.athlete_id = t_ids.athlete WHERE d.day = '2031-03-04';
INSERT INTO t_res (name, ok, detail)
SELECT 'intraday garmin exclu de l''IA', bool_and(NOT ai_allowed), ''
  FROM provider_intraday i JOIN t_ids ON i.athlete_id = t_ids.athlete WHERE i.day = '2031-03-04';

INSERT INTO provider_moveiq (athlete_id, source, external_id, day, started_at, duration_s, activity_type)
SELECT athlete, 'garmin', 'test-miq', '2031-03-04', '2031-03-04T12:00:00Z', 900, 'WALKING' FROM t_ids;

-- RLS : autre coach ne voit rien ; aucune écriture directe.
SELECT set_config('request.jwt.claims', json_build_object('sub', other_coach, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
INSERT INTO t_res (name, ok, detail)
SELECT 'rls : autre coach ne lit ni séries ni Move IQ',
       (SELECT count(*) FROM provider_intraday WHERE athlete_id = (SELECT athlete FROM t_ids)) = 0
       AND (SELECT count(*) FROM provider_moveiq WHERE athlete_id = (SELECT athlete FROM t_ids)) = 0, '';
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
INSERT INTO t_res (name, ok, detail)
SELECT 'rls : l''athlète lit ses séries', count(*) = 2, count(*)::text
  FROM provider_intraday WHERE athlete_id = auth.uid() AND day = '2031-03-04';
DO $$ BEGIN
  INSERT INTO provider_intraday (athlete_id, source, day, measure, offsets, "values")
  VALUES (auth.uid(), 'garmin', '2031-03-05', 'hr', '{0}', '{60}');
  INSERT INTO t_res (name, ok, detail) VALUES ('écriture directe refusée', false, 'acceptée');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('écriture directe refusée', true, SQLERRM);
END $$;
DO $$ BEGIN
  PERFORM public.provider_intraday_merge(auth.uid(), 'garmin', '2031-03-05', 'hr', '{0}', '{60}', 0);
  INSERT INTO t_res (name, ok, detail) VALUES ('fusion réservée au serveur', false, 'acceptée');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('fusion réservée au serveur', true, SQLERRM);
END $$;
RESET ROLE;

-- Désinscription : tout part.
CREATE TEMP TABLE t_forget ON COMMIT DROP AS
  SELECT public.provider_forget(athlete, 'garmin') AS r FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT 'provider_forget : séries et Move IQ supprimées',
       NOT EXISTS (SELECT 1 FROM provider_intraday i, t_ids WHERE i.athlete_id = t_ids.athlete AND i.source = 'garmin')
       AND NOT EXISTS (SELECT 1 FROM provider_moveiq m, t_ids WHERE m.athlete_id = t_ids.athlete AND m.source = 'garmin')
       AND (SELECT (r->>'intraday')::int >= 2 FROM t_forget),
       (SELECT r::text FROM t_forget);

SELECT n, ok, name, detail FROM t_res ORDER BY ok, n;

ROLLBACK;
