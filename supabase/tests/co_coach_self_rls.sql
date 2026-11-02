-- Tests : coach-athlète co-coach de lui-même (migration 20261102110000_co_coach_self).
-- Toujours annulé (ROLLBACK final) : rien ne reste en base.
--   supabase db query --linked -f supabase/tests/co_coach_self_rls.sql
-- Chaque ligne k → v : la valeur attendue est dans le libellé.

BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;
-- Un coach-athlète (avec code), suivi par un autre coach (forcé dans la transaction)
CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT me.id AS me, me.coach_code AS my_code,
  (SELECT p.id FROM profiles p WHERE p.role IN ('coach','coach_athlete') AND p.id <> me.id
     AND p.coach_code IS NOT NULL ORDER BY p.created_at LIMIT 1) AS ext_coach
FROM profiles me
WHERE me.role = 'coach_athlete' AND me.coach_code IS NOT NULL
ORDER BY (me.coach_id IS NOT NULL AND me.coach_id <> me.id) DESC, me.created_at LIMIT 1;
GRANT SELECT ON ids TO authenticated;
UPDATE profiles SET coach_id = (SELECT ext_coach FROM ids) WHERE id = (SELECT me FROM ids)
  AND coach_id IS DISTINCT FROM (SELECT ext_coach FROM ids);
-- Sécurité : la ligne existante ne doit pas déjà avoir de co-coach
DELETE FROM athlete_co_coaches WHERE athlete_id = (SELECT me FROM ids);
INSERT INTO r(k,v) SELECT '00 jeu de test (true)', (me IS NOT NULL AND ext_coach IS NOT NULL)::text FROM ids;

SET LOCAL ROLE authenticated;

-- Le coach externe ne peut pas déclarer l'athlète co-coach de lui-même
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', ext_coach, 'role','authenticated')::text FROM ids), true);
DO $$ BEGIN
  PERFORM add_co_coach((SELECT me FROM ids), (SELECT my_code FROM ids));
  INSERT INTO r(k,v) VALUES ('A1 référent déclare l''athlète co-coach de lui-même', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A1 référent déclare l''athlète co-coach de lui-même', 'refusé (OK)'); END $$;

-- Avant : pas coach de lui-même
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', me, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'B0 avant : is_coach_of(soi) (false)', is_coach_of(me)::text FROM ids;
-- L'athlète s'ajoute lui-même avec son propre code
INSERT INTO r(k,v) SELECT 'B1 s''ajoute co-coach (co_coach = soi : true)', ((add_co_coach(me, my_code)->>'co_coach_id')::uuid = me)::text FROM ids;
INSERT INTO r(k,v) SELECT 'B2 is_coach_of(soi) (true)', is_coach_of(me)::text FROM ids;
INSERT INTO r(k,v) SELECT 'B3 can_coach_athlete(soi) (true)', can_coach_athlete(me)::text FROM ids;
DO $$ BEGIN
  UPDATE profiles SET coach_id = auth.uid() WHERE id = auth.uid();
  INSERT INTO r(k,v) VALUES ('B4 se met référent (profil perso, déjà permis avant)', 'permis');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('B4 se met référent', 'refusé'); END $$;
RESET ROLE;
-- B4 a changé coach_id → le lien co-coach doit avoir disparu (trigger)
INSERT INTO r(k,v) SELECT 'B5 après changement de référent : lien (0)', count(*)::text FROM athlete_co_coaches WHERE athlete_id=(SELECT me FROM ids);
UPDATE profiles SET coach_id = (SELECT ext_coach FROM ids) WHERE id = (SELECT me FROM ids);
SET LOCAL ROLE authenticated;

-- Le référent voit le lien et peut le retirer
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', me, 'role','authenticated')::text FROM ids), true);
SELECT add_co_coach((SELECT me FROM ids), (SELECT my_code FROM ids));
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', ext_coach, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'C1 référent voit le lien (1)', count(*)::text FROM athlete_co_coaches WHERE athlete_id=(SELECT me FROM ids);
INSERT INTO r(k,v) SELECT 'C2 référent garde is_coach_of (true)', is_coach_of(me)::text FROM ids;
SELECT remove_co_coach((SELECT me FROM ids));
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', me, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'C3 après retrait : is_coach_of(soi) (false)', is_coach_of(me)::text FROM ids;

RESET ROLE;
SELECT k, v FROM r ORDER BY n;
ROLLBACK;
