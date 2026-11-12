-- Tests de 20261112090000_activity_detail.sql (séries, tours, séries de muscu).
-- Toujours annulé : rien ne reste en base. Lignes de test fictives uniquement.
--
-- Avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261112090000_activity_detail.sql; \
--    sed -e '/^BEGIN;$/d' supabase/tests/activity_detail.sql) > "$TMPDIR/ad.sql"
--   supabase db query --linked -f "$TMPDIR/ad.sql"
-- Après application :
--   supabase db query --linked -f supabase/tests/activity_detail.sql
-- Chaque ligne doit avoir ok = true.

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
  NULL::uuid AS coach, NULL::uuid AS other_athlete, NULL::uuid AS other_coach,
  NULL::uuid AS act_file, NULL::uuid AS act_garmin;
UPDATE t_ids SET coach = (SELECT coach_id FROM profiles WHERE id = t_ids.athlete);
UPDATE t_ids SET other_athlete = (SELECT a.id FROM profiles a
    WHERE a.role = 'athlete' AND a.id <> t_ids.athlete AND NOT coalesce(a.is_pending, false)
    ORDER BY a.id LIMIT 1);
UPDATE t_ids SET other_coach = (SELECT c.id FROM profiles c
    WHERE c.role IN ('coach', 'coach_athlete') AND c.id <> t_ids.coach
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = t_ids.athlete AND cc.co_coach_id = c.id)
    ORDER BY c.id LIMIT 1);
GRANT SELECT ON t_ids TO anon, authenticated;

-- Deux activités fictives : un import de fichier, une activité Garmin.
WITH a AS (
  INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, duration_s)
  SELECT athlete, 'file_import', 'test-ad-file', '2026-11-03T17:30:00Z', '2026-11-03', 'running', 600 FROM t_ids
  RETURNING id)
UPDATE t_ids SET act_file = (SELECT id FROM a);
WITH a AS (
  INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, duration_s)
  SELECT athlete, 'garmin', 'test-ad-garmin', '2026-11-04T17:30:00Z', '2026-11-04', 'running', 600 FROM t_ids
  RETURNING id)
UPDATE t_ids SET act_garmin = (SELECT id FROM a);

INSERT INTO t_res (name, ok, detail)
SELECT 'fixtures trouvées', athlete IS NOT NULL AND coach IS NOT NULL AND other_athlete IS NOT NULL
       AND other_coach IS NOT NULL AND act_file IS NOT NULL AND act_garmin IS NOT NULL,
       concat_ws(' ', athlete, coach, other_athlete, other_coach) FROM t_ids;

CREATE TEMP TABLE t_detail ON COMMIT DROP AS SELECT '{
  "source": "fit", "started_at": "2026-11-03T17:30:00Z", "utc_offset_s": 3600, "sport": "running",
  "stream": {"t": [0,1,2], "timer": [0,1,2], "hr": [140,null,150], "speed": [3.1,3.2,3.3],
             "dist": [0,3.2,6.5], "alt": [10.2,10.4,null], "cadence": [165,166,167], "power": null,
             "lat": [44.812345,44.81236,44.81238], "lon": [-0.5,-0.50001,-0.50002],
             "vosc": null, "stance": null, "vratio": null, "stepLen": null, "temp": null},
  "laps": [{"startS":0,"endS":1,"trigger":"manual"},{"startS":1,"endS":2,"trigger":"session_end"}],
  "sets": [{"startS":1,"durationS":20,"reps":10,"weightKg":20,"setType":"active","category":[9],"categorySubtype":[]}],
  "splits": [], "watch_time_in_zone": [], "device": {"manufacturer":1,"product":3121,"productName":null}
}'::jsonb AS d;
GRANT SELECT ON t_detail TO anon, authenticated;

-- ---------- Écriture serveur, idempotente ----------
SELECT public.activity_detail_upsert(act_file, (SELECT d FROM t_detail)) FROM t_ids;
SELECT public.activity_detail_upsert(act_file, (SELECT d FROM t_detail)) FROM t_ids;
SELECT public.activity_detail_upsert(act_garmin, (SELECT d FROM t_detail)) FROM t_ids;

INSERT INTO t_res (name, ok, detail)
SELECT 'upsert: une série, 3 points, valeurs typées',
       count(*) = 1 AND max(sample_count) = 3 AND bool_and(hr IS NOT DISTINCT FROM ARRAY[140,NULL,150]::smallint[])
       AND bool_and(abs(lat[1] - 44.812345) < 0.00001),
       count(*)::text
  FROM activity_streams s JOIN t_ids ON s.activity_id = t_ids.act_file;
INSERT INTO t_res (name, ok, detail)
SELECT 'upsert rejoué: 2 tours montre, 1 série de muscu',
       (SELECT count(*) FROM activity_laps l WHERE l.activity_id = act_file AND origin = 'watch') = 2
       AND (SELECT count(*) FROM activity_sets x WHERE x.activity_id = act_file) = 1, ''
  FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT 'ai_allowed forcé à false pour garmin (série, tours, sets)',
       NOT (SELECT bool_or(ai_allowed) FROM activity_streams WHERE activity_id = act_garmin)
       AND NOT (SELECT bool_or(ai_allowed) FROM activity_laps WHERE activity_id = act_garmin)
       AND NOT (SELECT bool_or(ai_allowed) FROM activity_sets WHERE activity_id = act_garmin), ''
  FROM t_ids;

-- Tours modifiés par un humain : la réception ne les écrase plus.
UPDATE activity_streams SET laps_edited = true WHERE activity_id = (SELECT act_file FROM t_ids);
UPDATE activity_laps SET name = 'Échauffement' WHERE activity_id = (SELECT act_file FROM t_ids) AND position = 1;
SELECT public.activity_detail_upsert(act_file, (SELECT d FROM t_detail)) FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT 'tours modifiés conservés au rejeu', count(*) = 1, count(*)::text
  FROM activity_laps l JOIN t_ids ON l.activity_id = t_ids.act_file WHERE l.name = 'Échauffement';

DO $$ BEGIN
  PERFORM public.activity_detail_upsert((SELECT act_file FROM t_ids), '{"source":"fit","stream":{"t":[0,1],"hr":[1]}}'::jsonb);
  INSERT INTO t_res (name, ok, detail) VALUES ('contrainte: colonnes de même longueur', false, 'accepté');
EXCEPTION WHEN check_violation THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('contrainte: colonnes de même longueur', true, SQLERRM);
END $$;

-- ---------- RLS : athlète ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
INSERT INTO t_res (name, ok, detail)
SELECT 'rls: athlète lit son import', count(*) = 1, count(*)::text
  FROM activity_streams WHERE activity_id = (SELECT act_file FROM t_ids);
DO $$ BEGIN
  INSERT INTO activity_laps (activity_id, athlete_id, source, position, start_s, end_s, origin, status)
  SELECT act_file, athlete, 'file_import', 9, 0, 1, 'manual', 'validated' FROM t_ids;
  INSERT INTO t_res (name, ok, detail) VALUES ('rls: écriture directe refusée', false, 'acceptée');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('rls: écriture directe refusée', true, SQLERRM);
END $$;
DO $$ BEGIN
  PERFORM public.activity_detail_upsert((SELECT act_garmin FROM t_ids), (SELECT d FROM t_detail));
  INSERT INTO t_res (name, ok, detail) VALUES ('rpc: athlète ne peut pas écrire une série Garmin', false, 'acceptée');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('rpc: athlète ne peut pas écrire une série Garmin', true, SQLERRM);
END $$;
DO $$ DECLARE r jsonb; BEGIN
  SELECT public.activity_detail_upsert((SELECT act_file FROM t_ids), (SELECT d FROM t_detail)) INTO r;
  INSERT INTO t_res (name, ok, detail) VALUES ('rpc: athlète écrit le détail de son import', r IS NOT NULL, r::text);
END $$;
RESET ROLE;

-- ---------- RLS : coach, autre coach, autre athlète, anon ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
INSERT INTO t_res (name, ok, detail)
SELECT 'rls: coach lit le détail de son athlète (import)', count(*) = 1, count(*)::text
  FROM activity_streams WHERE activity_id = (SELECT act_file FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT 'rls: coach voit le détail Garmin ssi il voit l''activité',
       (SELECT count(*) FROM activity_streams WHERE activity_id = (SELECT act_garmin FROM t_ids))
     = (SELECT count(*) FROM provider_activities WHERE id = (SELECT act_garmin FROM t_ids)), '';
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', other_coach, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
INSERT INTO t_res (name, ok, detail)
SELECT 'rls: un autre coach ne voit rien',
       (SELECT count(*) FROM activity_streams s WHERE s.athlete_id = (SELECT athlete FROM t_ids))
     + (SELECT count(*) FROM activity_laps l WHERE l.athlete_id = (SELECT athlete FROM t_ids))
     + (SELECT count(*) FROM activity_sets x WHERE x.athlete_id = (SELECT athlete FROM t_ids)) = 0, '';
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', other_athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
INSERT INTO t_res (name, ok, detail)
SELECT 'rls: un autre athlète ne voit rien', count(*) = 0, count(*)::text
  FROM activity_streams s WHERE s.athlete_id = (SELECT athlete FROM t_ids);
RESET ROLE;

SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM count(*) FROM activity_streams;
  INSERT INTO t_res (name, ok, detail) VALUES ('anon: aucune lecture', (SELECT count(*) FROM activity_streams) = 0, '');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('anon: aucune lecture', true, SQLERRM);
END $$;
RESET ROLE;

-- ---------- Cascade : supprimer l'activité supprime son détail ----------
DELETE FROM provider_activities WHERE id IN (SELECT act_file FROM t_ids UNION SELECT act_garmin FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT 'cascade: plus de série, tour ni set',
       (SELECT count(*) FROM activity_streams s WHERE s.activity_id IN (act_file, act_garmin))
     + (SELECT count(*) FROM activity_laps l WHERE l.activity_id IN (act_file, act_garmin))
     + (SELECT count(*) FROM activity_sets x WHERE x.activity_id IN (act_file, act_garmin)) = 0, ''
  FROM t_ids;

SELECT n, ok, name, detail FROM t_res ORDER BY ok, n;

ROLLBACK;
