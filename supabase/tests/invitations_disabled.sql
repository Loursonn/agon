-- Tests de 20261113162000_invitations_disabled.sql : aucun ancien lien d'invitation coach
-- n'est utilisable. Toujours annulé. Le jeton de test est créé dans la transaction.
-- Avant application : (echo 'BEGIN;'; cat supabase/migrations/20261113162000_invitations_disabled.sql; \
--   sed -e '/^BEGIN;$/d' supabase/tests/invitations_disabled.sql) > "$TMPDIR/inv.sql"; supabase db query --linked -f "$TMPDIR/inv.sql"
-- Après application : supabase db query --linked -f supabase/tests/invitations_disabled.sql

BEGIN;

CREATE TEMP TABLE t_res (n serial, name text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t_res TO authenticated; GRANT ALL ON SEQUENCE t_res_n_seq TO authenticated;
CREATE TEMP TABLE t_ids ON COMMIT DROP AS
SELECT (SELECT id FROM profiles WHERE role IN ('coach', 'coach_athlete') ORDER BY created_at LIMIT 1) AS coach,
       (SELECT id FROM profiles WHERE role = 'athlete' ORDER BY created_at LIMIT 1) AS athlete,
       gen_random_uuid()::text AS token, NULL::uuid AS coach_before;
UPDATE t_ids SET coach_before = (SELECT coach_id FROM profiles WHERE id = t_ids.athlete);
GRANT SELECT ON t_ids TO authenticated;
INSERT INTO invitations (coach_id, token) SELECT coach, token FROM t_ids;

INSERT INTO t_res (name, ok, detail)
SELECT 'I1 jeton neuf jamais utilisé : invalide', NOT invitation_is_valid(token), '' FROM t_ids;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role', 'authenticated')::text FROM t_ids), true);
DO $$ BEGIN
  PERFORM redeem_invitation((SELECT token FROM t_ids));
  INSERT INTO t_res (name, ok, detail) VALUES ('I2 utilisation refusée', false, 'acceptée');
EXCEPTION WHEN OTHERS THEN INSERT INTO t_res (name, ok, detail) VALUES ('I2 utilisation refusée', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END $$;
RESET ROLE;

INSERT INTO t_res (name, ok, detail)
SELECT 'I3 rattachement de l''athlète inchangé', p.coach_id IS NOT DISTINCT FROM i.coach_before, '' FROM profiles p, t_ids i WHERE p.id = i.athlete;
INSERT INTO t_res (name, ok, detail)
SELECT 'I4 aucun jeton existant n''est valide', NOT EXISTS (SELECT 1 FROM invitations WHERE invitation_is_valid(token)), '';
INSERT INTO t_res (name, ok, detail)
SELECT 'Z1 anon ne peut pas utiliser un lien', NOT has_function_privilege('anon', 'public.redeem_invitation(text)', 'EXECUTE'), '';

SELECT n, ok, name, detail FROM t_res ORDER BY ok, n;
ROLLBACK;
