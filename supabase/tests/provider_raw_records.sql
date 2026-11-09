-- Tests de 20261110120000_provider_raw_records.sql (stockage brut Garmin).
-- Toujours annulé : rien ne reste en base.
--
-- Avant application (migration rejouée dans la même transaction, puis annulée) :
--   (echo 'BEGIN;'; cat supabase/migrations/20261110120000_provider_raw_records.sql; \
--    sed -e '/^BEGIN;$/d' supabase/tests/provider_raw_records.sql) > "$TMPDIR/prr.sql"
--   supabase db query --linked -f "$TMPDIR/prr.sql"
-- Après application :
--   supabase db query --linked -f supabase/tests/provider_raw_records.sql
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
  NULL::uuid AS coach, NULL::uuid AS other_athlete;
UPDATE t_ids SET coach = (SELECT coach_id FROM profiles WHERE id = t_ids.athlete);
UPDATE t_ids SET other_athlete = (SELECT a.id FROM profiles a
    WHERE a.role = 'athlete' AND a.id <> t_ids.athlete AND NOT coalesce(a.is_pending, false)
    ORDER BY a.id LIMIT 1);
GRANT SELECT ON t_ids TO anon, authenticated;

INSERT INTO t_res (name, ok, detail)
SELECT 'fixtures trouvées', athlete IS NOT NULL AND coach IS NOT NULL AND other_athlete IS NOT NULL,
       concat_ws(' ', athlete, coach, other_athlete) FROM t_ids;

-- ---------- Écriture service_role, ai_allowed imposé ----------
INSERT INTO provider_raw_records (athlete_id, source, summary_type, summary_id, payload, ai_allowed)
SELECT athlete, 'garmin', 'stressDetails', 'test-sd-1', '{"summaryId":"test-sd-1"}'::jsonb, true FROM t_ids;
INSERT INTO provider_raw_records (athlete_id, source, summary_type, summary_id, payload)
SELECT athlete, 'garmin', 'activityDetails', 'test-ad-1', '{"summaryId":"test-ad-1"}'::jsonb FROM t_ids;

INSERT INTO t_res (name, ok, detail)
SELECT 'ai_allowed forcé à false pour garmin', bool_and(NOT ai_allowed), count(*)::text
  FROM provider_raw_records r JOIN t_ids ON r.athlete_id = t_ids.athlete WHERE r.summary_id LIKE 'test-%';

-- Upsert : même résumé reçu deux fois = une seule ligne, contenu remplacé.
INSERT INTO provider_raw_records (athlete_id, source, summary_type, summary_id, payload)
SELECT athlete, 'garmin', 'stressDetails', 'test-sd-1', '{"summaryId":"test-sd-1","v":2}'::jsonb FROM t_ids
ON CONFLICT (athlete_id, source, summary_type, summary_id) DO UPDATE SET payload = EXCLUDED.payload;
INSERT INTO t_res (name, ok, detail)
SELECT 'upsert: une ligne, version remplacée', count(*) = 1 AND max(payload->>'v') = '2', count(*)::text
  FROM provider_raw_records r JOIN t_ids ON r.athlete_id = t_ids.athlete WHERE r.summary_id = 'test-sd-1';

DO $$ BEGIN
  INSERT INTO provider_raw_records (athlete_id, source, summary_type, summary_id, payload)
  SELECT athlete, 'garmin', '', 'x', '{}'::jsonb FROM t_ids;
  INSERT INTO t_res (name, ok, detail) VALUES ('contrainte: type vide refusé', false, 'accepté');
EXCEPTION WHEN check_violation THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('contrainte: type vide refusé', true, SQLERRM);
END $$;

-- ---------- Bucket ----------
INSERT INTO t_res (name, ok, detail)
SELECT 'bucket provider-raw privé', count(*) = 1 AND bool_and(NOT public), count(*)::text
  FROM storage.buckets WHERE id = 'provider-raw';

-- ---------- RLS : l'athlète lit ses lignes, rien d'autre ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;

INSERT INTO t_res (name, ok, detail)
SELECT 'rls: athlète lit ses lignes brutes', count(*) = 2, count(*)::text
  FROM provider_raw_records WHERE summary_id LIKE 'test-%';

DO $$ BEGIN
  INSERT INTO provider_raw_records (athlete_id, source, summary_type, summary_id, payload)
  VALUES (auth.uid(), 'garmin', 'dailies', 'faux', '{}'::jsonb);
  INSERT INTO t_res (name, ok, detail) VALUES ('rls: athlète ne peut pas écrire', false, 'insertion acceptée');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('rls: athlète ne peut pas écrire', true, SQLERRM);
END $$;

DO $$ BEGIN
  PERFORM public.provider_raw_objects(auth.uid(), 'garmin', NULL);
  INSERT INTO t_res (name, ok, detail) VALUES ('rpc provider_raw_objects refusée au client', false, 'exécutée');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('rpc provider_raw_objects refusée au client', true, SQLERRM);
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
INSERT INTO t_res (name, ok, detail)
SELECT 'rls: coach ne lit pas le brut', count(*) = 0, count(*)::text
  FROM provider_raw_records WHERE summary_id LIKE 'test-%';
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', other_athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
INSERT INTO t_res (name, ok, detail)
SELECT 'rls: autre athlète ne lit rien', count(*) = 0, count(*)::text
  FROM provider_raw_records WHERE summary_id LIKE 'test-%';
RESET ROLE;

-- ---------- provider_forget supprime le brut ----------
DO $$ DECLARE r jsonb; BEGIN
  SELECT public.provider_forget((SELECT athlete FROM t_ids), 'garmin') INTO r;
  INSERT INTO t_res (name, ok, detail) VALUES ('forget: compte des lignes brutes', (r->>'raw')::int >= 2, r::text);
END $$;
INSERT INTO t_res (name, ok, detail)
SELECT 'forget: plus aucune ligne brute garmin', count(*) = 0, count(*)::text
  FROM provider_raw_records r JOIN t_ids ON r.athlete_id = t_ids.athlete WHERE r.source = 'garmin';

-- ---------- Suppression de compte : bucket couvert ----------
INSERT INTO t_res (name, ok, detail)
SELECT 'list_user_storage_objects couvre provider-raw',
       pg_get_functiondef('public.list_user_storage_objects(uuid)'::regprocedure) LIKE '%provider-raw%', '';

SELECT n, ok, name, detail FROM t_res ORDER BY ok, n;

ROLLBACK;
