-- Tests de 20261113160000_hr_zone_bounds_fallback.sql : hr_zone_bounds_at garde les modèles
-- datés (P43, 3/5/7 zones, refs_day) ET le repli « modèle actuel » de l'historique (P42).
-- Toujours annulé. Athlète fictif créé dans la transaction (@example.invalid).
--
-- Avant application (doit échouer sur R1 et R2 : c'est la régression) :
--   (echo 'BEGIN;'; cat supabase/migrations/20261113160000_hr_zone_bounds_fallback.sql; \
--    sed -e '/^BEGIN;$/d' supabase/tests/hr_zone_bounds_fallback.sql) > "$TMPDIR/hz.sql"
--   supabase db query --linked -f "$TMPDIR/hz.sql"
-- Après application : supabase db query --linked -f supabase/tests/hr_zone_bounds_fallback.sql

BEGIN;

SELECT set_config('request.jwt.claims', '', true);
CREATE TEMP TABLE t_res (n serial, name text, ok boolean, detail text) ON COMMIT DROP;
CREATE TEMP TABLE t_ids ON COMMIT DROP AS
SELECT gen_random_uuid() AS a, gen_random_uuid() AS b, NULL::uuid AS m_old, NULL::uuid AS m_new, NULL::uuid AS m_five;

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u || '@example.invalid', '', '{}', '{}', now(), now()
  FROM t_ids, unnest(ARRAY[a, b]) u;
INSERT INTO profiles (id, role, full_name, birth_date)
SELECT u, 'athlete', 'Test zones', '2000-01-01' FROM t_ids, unnest(ARRAY[a, b]) u;

-- Athlète a : deux modèles datés (3 zones en 2020, personnalisé en 2025).
WITH m AS (INSERT INTO hr_zone_models (athlete_id, kind, bounds, valid_from, status)
           SELECT a, 'three', '{150,170}', '2020-01-01', 'active' FROM t_ids RETURNING id)
UPDATE t_ids SET m_old = (SELECT id FROM m);
WITH m AS (INSERT INTO hr_zone_models (athlete_id, kind, bounds, valid_from, status)
           SELECT a, 'custom', '{120,140,160,175}', '2025-01-01', 'active' FROM t_ids RETURNING id)
UPDATE t_ids SET m_new = (SELECT id FROM m);

INSERT INTO t_res (name, ok, detail)
SELECT 'D1 sortie de 2021 : modèle daté en vigueur (3 zones)', z.model_id = m_old AND z.kind = 'three',
       coalesce(z.kind || ' ' || z.bounds::text, 'rien')
  FROM t_ids LEFT JOIN LATERAL hr_zone_bounds_at(a, '2021-06-01') z ON true;
INSERT INTO t_res (name, ok, detail)
SELECT 'D2 sortie de 2026 : modèle daté le plus récent', z.model_id = m_new AND z.bounds = '{120,140,160,175}',
       coalesce(z.kind || ' ' || z.bounds::text, 'rien')
  FROM t_ids LEFT JOIN LATERAL hr_zone_bounds_at(a, '2026-06-01') z ON true;
INSERT INTO t_res (name, ok, detail)
SELECT 'R1 sortie de 2010, avant tout modèle : modèle actuel', z.model_id = m_new,
       coalesce(z.kind || ' ' || z.bounds::text, 'rien')
  FROM t_ids LEFT JOIN LATERAL hr_zone_bounds_at(a, '2010-06-01') z ON true;

-- Athlète b : modèle « five » daté 2024 avec jour de référence, zones saisies en 2024 puis 2025.
WITH m AS (INSERT INTO hr_zone_models (athlete_id, kind, bounds, valid_from, status, refs_day)
           SELECT b, 'five', NULL, '2024-01-01', 'active', '2024-03-01' FROM t_ids RETURNING id)
UPDATE t_ids SET m_five = (SELECT id FROM m);
INSERT INTO performance_logs (athlete_id, metric_type, metric_name, value, unit, date)
SELECT b, 'zone', k, v, 'bpm', d FROM t_ids, (VALUES
  ('FCzone_Z1_max', 129, '2024-02-01'::date), ('FCzone_Z2_max', 149, '2024-02-01'), ('FCzone_Z3_max', 164, '2024-02-01'), ('FCzone_Z4_max', 179, '2024-02-01'),
  ('FCzone_Z1_max', 134, '2025-02-01'), ('FCzone_Z2_max', 154, '2025-02-01'), ('FCzone_Z3_max', 169, '2025-02-01'), ('FCzone_Z4_max', 184, '2025-02-01')
) x(k, v, d);

INSERT INTO t_res (name, ok, detail)
SELECT 'F1 « five » : zones au jour de référence du modèle (2024)', z.model_id = m_five AND z.bounds = '{130,150,165,180}',
       coalesce(z.kind || ' ' || z.bounds::text, 'rien')
  FROM t_ids LEFT JOIN LATERAL hr_zone_bounds_at(b, '2026-01-01') z ON true;
UPDATE hr_zone_models SET refs_day = NULL WHERE id = (SELECT m_five FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT 'F2 « five » sans jour de référence : zones au jour de la sortie', z.bounds = '{135,155,170,185}',
       coalesce(z.kind || ' ' || z.bounds::text, 'rien')
  FROM t_ids LEFT JOIN LATERAL hr_zone_bounds_at(b, '2026-01-01') z ON true;
INSERT INTO t_res (name, ok, detail)
SELECT 'R2 sortie de 2010, avant modèle et zones : modèle actuel, zones les plus récentes',
       z.model_id = m_five AND z.bounds = '{135,155,170,185}',
       coalesce(z.kind || ' ' || z.bounds::text, 'rien')
  FROM t_ids LEFT JOIN LATERAL hr_zone_bounds_at(b, '2010-01-01') z ON true;

INSERT INTO t_res (name, ok, detail)
SELECT 'Z1 droits : anon sans EXECUTE', NOT has_function_privilege('anon', 'public.hr_zone_bounds_at(uuid, date)', 'EXECUTE'), '';

SELECT n, ok, name, detail FROM t_res ORDER BY ok, n;

ROLLBACK;
