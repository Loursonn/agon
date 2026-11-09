-- Tests de 20261110110000_client_build.sql (profiles.client_build / client_build_at,
-- RPC report_client_build). Toujours annulé (BEGIN … ROLLBACK dans ce fichier).
-- Avant application :
--   { echo 'BEGIN;'; cat supabase/migrations/20261110110000_client_build.sql; sed '/^BEGIN;$/d' supabase/tests/client_build.sql; } > "$TMPDIR/x.sql"
--   supabase db query --linked -f "$TMPDIR/x.sql"
-- Après application : supabase db query --linked -f supabase/tests/client_build.sql
-- Chaque ligne de résultat doit avoir ok = true. Aucune donnée réelle affichée.

BEGIN;

CREATE TEMP TABLE t_ids AS
SELECT
  (SELECT id FROM profiles WHERE role = 'athlete' ORDER BY id LIMIT 1) AS me,
  (SELECT id FROM profiles WHERE role = 'athlete' ORDER BY id DESC LIMIT 1) AS other;
CREATE TEMP TABLE t_res (n int, name text, ok boolean);
GRANT ALL ON t_res, t_ids TO authenticated, anon;

-- Remise à zéro (en tant que postgres, dans la transaction annulée).
UPDATE profiles SET client_build = NULL, client_build_at = NULL;

-- ===== 1. L'athlète rapporte sa version =====
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT me FROM t_ids), 'role', 'authenticated')::text, true);
SELECT report_client_build('abc123');
INSERT INTO t_res SELECT 1, 'écrit sa version',
  (SELECT client_build = 'abc123' AND client_build_at IS NOT NULL FROM profiles WHERE id = (SELECT me FROM t_ids));
INSERT INTO t_res SELECT 2, 'ne touche pas les autres profils',
  (SELECT count(*) = 0 FROM profiles WHERE client_build IS NOT NULL AND id <> (SELECT me FROM t_ids));

-- ===== 2. Même build vu à l'instant : pas de réécriture =====
RESET ROLE;
UPDATE profiles SET client_build_at = now() - interval '10 minutes' WHERE id = (SELECT me FROM t_ids);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT me FROM t_ids), 'role', 'authenticated')::text, true);
SELECT report_client_build('abc123');
INSERT INTO t_res SELECT 3, 'même build < 1 h : horodatage inchangé',
  (SELECT client_build_at < now() - interval '5 minutes' FROM profiles WHERE id = (SELECT me FROM t_ids));

-- ===== 3. Même build vu depuis plus d'une heure : horodatage rafraîchi =====
RESET ROLE;
UPDATE profiles SET client_build_at = now() - interval '2 hours' WHERE id = (SELECT me FROM t_ids);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT me FROM t_ids), 'role', 'authenticated')::text, true);
SELECT report_client_build('abc123');
INSERT INTO t_res SELECT 4, 'même build > 1 h : horodatage rafraîchi',
  (SELECT client_build_at > now() - interval '1 minute' FROM profiles WHERE id = (SELECT me FROM t_ids));

-- ===== 4. Nouveau build : remplacé tout de suite =====
SELECT report_client_build('def456');
INSERT INTO t_res SELECT 5, 'nouveau build remplace l''ancien',
  (SELECT client_build = 'def456' FROM profiles WHERE id = (SELECT me FROM t_ids));

-- ===== 5. Entrées invalides =====
DO $$ BEGIN
  BEGIN PERFORM report_client_build(NULL); INSERT INTO t_res VALUES (6, 'NULL refusé', false);
  EXCEPTION WHEN sqlstate '22023' THEN INSERT INTO t_res VALUES (6, 'NULL refusé', true); END;
  BEGIN PERFORM report_client_build(''); INSERT INTO t_res VALUES (7, 'vide refusé', false);
  EXCEPTION WHEN sqlstate '22023' THEN INSERT INTO t_res VALUES (7, 'vide refusé', true); END;
  BEGIN PERFORM report_client_build(repeat('x', 81)); INSERT INTO t_res VALUES (8, '81 caractères refusé', false);
  EXCEPTION WHEN sqlstate '22023' THEN INSERT INTO t_res VALUES (8, '81 caractères refusé', true); END;
END $$;

-- ===== 6. Anonyme : refusé =====
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
DO $$ BEGIN
  BEGIN PERFORM report_client_build('zzz'); INSERT INTO t_res VALUES (9, 'anon refusé', false);
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res VALUES (9, 'anon refusé', true); END;
END $$;

RESET ROLE;
SELECT n, name, ok FROM t_res ORDER BY n;

ROLLBACK;
