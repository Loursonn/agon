-- Tests de la migration 20261107130000_coros_sync_reliability.sql.
-- Usage (base liée, rien n'est conservé) :
--   { echo 'BEGIN;' cat supabase/migrations/20261107130000_coros_sync_reliability.sql; \
--     cat supabase/tests/coros_sync_reliability.sql; echo 'ROLLBACK;' } > /tmp/x.sql
--   tail -1 /tmp/x.sql   # doit afficher ROLLBACK;
--   supabase db query --linked -f /tmp/x.sql
-- Chaque ligne de résultat doit avoir ok = true.
--
-- Le test du déclencheur met des requêtes dans la file de pg_net
-- (net.http_request_queue) : le travailleur pg_net ne lit que des lignes
-- validées, et le ROLLBACK final les efface. Rien ne part.

-- ===== Données de test (dans la même transaction, annulée à la fin) =====
CREATE TEMP TABLE t_ids AS
SELECT
  (SELECT id FROM profiles WHERE role = 'athlete' ORDER BY id LIMIT 1 OFFSET 0) AS a1,
  (SELECT id FROM profiles WHERE role = 'athlete' ORDER BY id LIMIT 1 OFFSET 1) AS a2,
  (SELECT id FROM profiles WHERE role = 'athlete' ORDER BY id LIMIT 1 OFFSET 2) AS a3,
  NULL::uuid AS c1, NULL::uuid AS c2, NULL::uuid AS c3,
  NULL::uuid AS tok;
CREATE TEMP TABLE t_res (name text, ok boolean, detail text);
GRANT ALL ON t_ids, t_res TO anon, authenticated, service_role;

-- Consentement (sinon `require_sync_consent` refuse une connexion active).
INSERT INTO user_consents (user_id, purpose, granted, doc_version, statement)
SELECT x, 'coros_sync', true, 'test', 'test' FROM t_ids, unnest(ARRAY[a1, a2]) AS x;

-- On neutralise d'éventuelles connexions COROS existantes (aucune le 07/11/2026)
-- pour que le décompte du déclencheur ne porte que sur les nôtres.
UPDATE provider_connections SET status = 'revoked' WHERE provider = 'coros' AND status = 'active';

INSERT INTO provider_connections (athlete_id, provider, status, api_host)
SELECT a1, 'coros', 'active', 'https://mcpeu.coros.com' FROM t_ids;
INSERT INTO provider_connections (athlete_id, provider, status, api_host)
SELECT a2, 'coros', 'active', 'https://mcpeu.coros.com' FROM t_ids;
INSERT INTO provider_connections (athlete_id, provider, status, api_host)
SELECT a3, 'coros', 'needs_reauth', 'https://mcpeu.coros.com' FROM t_ids;
UPDATE t_ids SET
  c1 = (SELECT id FROM provider_connections WHERE athlete_id = t_ids.a1 AND provider = 'coros'),
  c2 = (SELECT id FROM provider_connections WHERE athlete_id = t_ids.a2 AND provider = 'coros'),
  c3 = (SELECT id FROM provider_connections WHERE athlete_id = t_ids.a3 AND provider = 'coros');

-- ---------- Structure et droits ----------
DO $$ DECLARE b boolean; n int; BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'provider_connections'
     AND column_name IN ('sync_locked_until', 'sync_lock_token');
  INSERT INTO t_res VALUES ('colonnes de verrou présentes', n = 2, n::text);

  SELECT relrowsecurity INTO b FROM pg_class WHERE oid = 'public.provider_fit_quota'::regclass;
  INSERT INTO t_res VALUES ('provider_fit_quota : RLS active', b, b::text);
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'provider_fit_quota';
  INSERT INTO t_res VALUES ('provider_fit_quota : aucune politique', n = 0, n::text);

  INSERT INTO t_res VALUES ('authenticated ne lit pas le quota',
    NOT has_table_privilege('authenticated', 'public.provider_fit_quota', 'SELECT'), NULL);
  INSERT INTO t_res VALUES ('anon ne lit pas le quota',
    NOT has_table_privilege('anon', 'public.provider_fit_quota', 'SELECT'), NULL);

  INSERT INTO t_res SELECT 'authenticated ne peut pas appeler ' || f,
    NOT has_function_privilege('authenticated', f, 'EXECUTE'), NULL
  FROM unnest(ARRAY[
    'public.provider_sync_try_lock(uuid,integer)',
    'public.provider_sync_unlock(uuid,uuid)',
    'public.provider_fit_quota_remaining(uuid,integer)',
    'public.provider_fit_quota_reserve(uuid,integer,integer)',
    'public.provider_fit_quota_exhaust(uuid,integer)',
    'public.trigger_coros_sync()']) AS f;
  INSERT INTO t_res SELECT 'anon ne peut pas appeler ' || f,
    NOT has_function_privilege('anon', f, 'EXECUTE'), NULL
  FROM unnest(ARRAY[
    'public.provider_sync_try_lock(uuid,integer)',
    'public.provider_fit_quota_reserve(uuid,integer,integer)',
    'public.trigger_coros_sync()']) AS f;
  INSERT INTO t_res SELECT 'service_role peut appeler ' || f,
    has_function_privilege('service_role', f, 'EXECUTE'), NULL
  FROM unnest(ARRAY[
    'public.provider_sync_try_lock(uuid,integer)',
    'public.provider_sync_unlock(uuid,uuid)',
    'public.provider_fit_quota_remaining(uuid,integer)',
    'public.provider_fit_quota_reserve(uuid,integer,integer)',
    'public.provider_fit_quota_exhaust(uuid,integer)']) AS f;

  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'provider_activities_athlete_started_idx';
  INSERT INTO t_res VALUES ('index (athlete_id, started_at) présent', n = 1, n::text);
END $$;

-- ---------- Appel réel refusé à un utilisateur connecté ----------
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ids.a1, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.provider_sync_try_lock(ids.c1, 600);
    INSERT INTO t_res VALUES ('athlète : prise de verrou refusée', false, 'accepté');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_res VALUES ('athlète : prise de verrou refusée', true, SQLERRM);
  END;
  BEGIN
    PERFORM public.provider_fit_quota_reserve(ids.c1, 1, 50);
    INSERT INTO t_res VALUES ('athlète : réservation de quota refusée', false, 'accepté');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_res VALUES ('athlète : réservation de quota refusée', true, SQLERRM);
  END;
END $$;
-- L'athlète lit toujours sa connexion (politique inchangée, colonnes nommées).
DO $$ DECLARE n int; ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  SELECT count(*) INTO n FROM provider_connections WHERE id = ids.c1;
  INSERT INTO t_res VALUES ('athlète : voit sa connexion', n = 1, n::text);
  SELECT count(*) INTO n FROM provider_connections WHERE id = ids.c2;
  INSERT INTO t_res VALUES ('athlète : ne voit pas celle d''un autre', n = 0, n::text);
END $$;
RESET ROLE;

-- ---------- Verrou (joué en service_role, comme l'Edge Function) ----------
SET LOCAL ROLE service_role;
DO $$ DECLARE ids record; t1 uuid; t2 uuid; t3 uuid; BEGIN
  SELECT * INTO ids FROM t_ids;
  t1 := public.provider_sync_try_lock(ids.c1, 600);
  INSERT INTO t_res VALUES ('verrou : premier appel obtient un jeton', t1 IS NOT NULL, t1::text);
  t2 := public.provider_sync_try_lock(ids.c1, 600);
  INSERT INTO t_res VALUES ('verrou : second appel refusé (cron + manuel)', t2 IS NULL, coalesce(t2::text, 'null'));
  t3 := public.provider_sync_try_lock(ids.c2, 600);
  INSERT INTO t_res VALUES ('verrou : une autre connexion n''est pas bloquée', t3 IS NOT NULL, t3::text);

  PERFORM public.provider_sync_unlock(ids.c1, gen_random_uuid());
  t2 := public.provider_sync_try_lock(ids.c1, 600);
  INSERT INTO t_res VALUES ('verrou : un autre jeton ne libère pas', t2 IS NULL, coalesce(t2::text, 'null'));

  PERFORM public.provider_sync_unlock(ids.c1, t1);
  t2 := public.provider_sync_try_lock(ids.c1, 600);
  INSERT INTO t_res VALUES ('verrou : libéré par son jeton, repris ensuite', t2 IS NOT NULL, t2::text);

  -- Bail expiré (fonction tuée en cours de route) : reprenable.
  UPDATE provider_connections SET sync_locked_until = now() - interval '1 second' WHERE id = ids.c1;
  t3 := public.provider_sync_try_lock(ids.c1, 600);
  INSERT INTO t_res VALUES ('verrou : bail expiré reprenable', t3 IS NOT NULL AND t3 <> t2, t3::text);
  PERFORM public.provider_sync_unlock(ids.c1, t2);
  INSERT INTO t_res SELECT 'verrou : l''ancien jeton ne libère pas le nouveau bail',
    sync_lock_token = t3, sync_lock_token::text FROM provider_connections WHERE id = ids.c1;

  -- Durée bornée.
  PERFORM public.provider_sync_unlock(ids.c1, t3);
  t1 := public.provider_sync_try_lock(ids.c1, 999999);
  INSERT INTO t_res SELECT 'verrou : durée plafonnée à 1 h',
    sync_locked_until <= now() + interval '1 hour', sync_locked_until::text FROM provider_connections WHERE id = ids.c1;
  PERFORM public.provider_sync_unlock(ids.c1, t1);
END $$;

-- ---------- Quota ----------
DO $$ DECLARE ids record; n int; b boolean; BEGIN
  SELECT * INTO ids FROM t_ids;
  n := public.provider_fit_quota_remaining(ids.c1, 50);
  INSERT INTO t_res VALUES ('quota : 50 au départ', n = 50, n::text);
  b := public.provider_fit_quota_reserve(ids.c1, 30, 50);
  INSERT INTO t_res VALUES ('quota : réserve 30', b, b::text);
  n := public.provider_fit_quota_remaining(ids.c1, 50);
  INSERT INTO t_res VALUES ('quota : reste 20', n = 20, n::text);
  b := public.provider_fit_quota_reserve(ids.c1, 25, 50);
  INSERT INTO t_res VALUES ('quota : 25 de plus refusé (tout ou rien)', NOT b, b::text);
  n := public.provider_fit_quota_remaining(ids.c1, 50);
  INSERT INTO t_res VALUES ('quota : refus sans effet, reste 20', n = 20, n::text);
  b := public.provider_fit_quota_reserve(ids.c1, 20, 50);
  INSERT INTO t_res VALUES ('quota : réserve les 20 derniers', b, b::text);
  b := public.provider_fit_quota_reserve(ids.c1, 1, 50);
  INSERT INTO t_res VALUES ('quota : 51e fichier refusé', NOT b, b::text);
  b := public.provider_fit_quota_reserve(ids.c1, 0, 50);
  INSERT INTO t_res VALUES ('quota : réserver 0 est sans effet', b, b::text);
  n := public.provider_fit_quota_remaining(ids.c2, 50);
  INSERT INTO t_res VALUES ('quota : propre à chaque connexion', n = 50, n::text);
  PERFORM public.provider_fit_quota_exhaust(ids.c2, 50);
  n := public.provider_fit_quota_remaining(ids.c2, 50);
  INSERT INTO t_res VALUES ('quota : épuisé sur signal COROS', n = 0, n::text);
  BEGIN
    PERFORM public.provider_fit_quota_reserve(ids.c1, -3, 50);
    INSERT INTO t_res VALUES ('quota : nombre négatif refusé', false, 'accepté');
  EXCEPTION WHEN raise_exception THEN
    INSERT INTO t_res VALUES ('quota : nombre négatif refusé', true, SQLERRM);
  END;
  SELECT count(*) INTO n FROM provider_fit_quota
   WHERE connection_id = ids.c1 AND day = (now() AT TIME ZONE 'UTC')::date;
  INSERT INTO t_res VALUES ('quota : une ligne par connexion et par jour', n = 1, n::text);
END $$;
RESET ROLE;

-- ---------- Déclencheur : un appel par connexion active ----------
DO $$ DECLARE ids record; before_max bigint; n int; n_ids int; BEGIN
  SELECT * INTO ids FROM t_ids;
  SELECT coalesce(max(id), 0) INTO before_max FROM net.http_request_queue;
  PERFORM public.trigger_coros_sync();
  SELECT count(*) INTO n FROM net.http_request_queue
   WHERE id > before_max AND url LIKE '%/functions/v1/provider-coros-sync';
  INSERT INTO t_res VALUES ('déclencheur : un appel par connexion active (2)', n = 2, n::text);
  SELECT count(*) INTO n_ids FROM net.http_request_queue
   WHERE id > before_max
     AND (convert_from(body, 'UTF8')::jsonb ->> 'connection_id')::uuid IN (ids.c1, ids.c2);
  INSERT INTO t_res VALUES ('déclencheur : connection_id dans chaque corps', n_ids = 2, n_ids::text);
  SELECT count(*) INTO n FROM net.http_request_queue
   WHERE id > before_max AND (convert_from(body, 'UTF8')::jsonb ->> 'connection_id')::uuid = ids.c3;
  INSERT INTO t_res VALUES ('déclencheur : connexion inactive ignorée', n = 0, n::text);
END $$;

-- ---------- Suppression de la connexion : quota effacé ----------
DO $$ DECLARE ids record; n int; BEGIN
  SELECT * INTO ids FROM t_ids;
  DELETE FROM provider_connections WHERE id = ids.c1;
  SELECT count(*) INTO n FROM provider_fit_quota WHERE connection_id = ids.c1;
  INSERT INTO t_res VALUES ('cascade : quota supprimé avec la connexion', n = 0, n::text);
END $$;

SELECT name, ok, left(detail, 90) AS detail FROM t_res;
