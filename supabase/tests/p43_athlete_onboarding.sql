-- Tests de 20261113150000_p43_athlete_onboarding.sql. Toujours annulé.
-- Avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261113150000_p43_athlete_onboarding.sql; \
--    sed -e '/^BEGIN;$/d' supabase/tests/p43_athlete_onboarding.sql) > "$TMPDIR/p43ob.sql"
--   supabase db query --linked -f "$TMPDIR/p43ob.sql"
BEGIN;

CREATE TEMP TABLE t_res (n serial, name text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t_res TO anon, authenticated;
GRANT ALL ON SEQUENCE t_res_n_seq TO anon, authenticated;

CREATE TEMP TABLE t_ids ON COMMIT DROP AS
SELECT a.id AS athlete, a.coach_id AS coach FROM profiles a WHERE a.full_name = 'Léa Démo' LIMIT 1;
GRANT SELECT ON t_ids TO anon, authenticated;

-- (À l'application, les comptes existants ont été datés : vérifié en prod, pas rejouable sur la base de CI.)
INSERT INTO t_res (name, ok, detail)
SELECT '01 jeu de test', count(*) = 1, count(*)::text FROM t_ids WHERE athlete IS NOT NULL AND coach IS NOT NULL;

-- Simule un nouvel athlète : Léa sans date.
UPDATE profiles SET onboarded_at = NULL WHERE id = (SELECT athlete FROM t_ids);

SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
SELECT public.mark_onboarded();
INSERT INTO t_res (name, ok, detail)
SELECT '02 athlète : marquée accueillie', onboarded_at IS NOT NULL, onboarded_at::text FROM profiles WHERE id = (SELECT athlete FROM t_ids);

-- Le coach appelle : seule sa propre ligne bouge (déjà datée), Léa inchangée.
RESET ROLE;
UPDATE profiles SET onboarded_at = NULL WHERE id = (SELECT athlete FROM t_ids);
SELECT set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
SELECT public.mark_onboarded();
RESET ROLE;
INSERT INTO t_res (name, ok, detail)
SELECT '03 un autre utilisateur ne touche pas Léa', onboarded_at IS NULL, coalesce(onboarded_at::text, 'null') FROM profiles WHERE id = (SELECT athlete FROM t_ids);

-- Anonyme refusé.
SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM public.mark_onboarded();
  INSERT INTO t_res (name, ok, detail) VALUES ('04 anonyme refusé', false, 'ACCEPTÉ');
EXCEPTION WHEN OTHERS THEN INSERT INTO t_res (name, ok, detail) VALUES ('04 anonyme refusé', true, SQLERRM); END $$;

RESET ROLE;
SELECT name, ok, detail FROM t_res ORDER BY n;
ROLLBACK;
