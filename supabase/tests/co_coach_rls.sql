-- Tests RLS double coach — coach référent A, co-coach B, coach tiers C, athlète.
-- Toujours annulé (ROLLBACK final) : rien ne reste en base.
--
-- Après application de la migration :
--   supabase db query --linked -f supabase/tests/co_coach_rls.sql
-- Avant application (migration rejouée dans la même transaction, puis annulée) :
--   (echo 'BEGIN;'; cat supabase/migrations/20261102100000_co_coach.sql; \
--    sed '/^BEGIN;$/d' supabase/tests/co_coach_rls.sql) > /tmp/cc.sql
--   supabase db query --linked -f /tmp/cc.sql
-- Chaque ligne k → v : la valeur attendue est dans le libellé.

BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;
CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT a.id AS athlete, a.coach_id AS coach_a,
  (SELECT p.id FROM profiles p WHERE p.role IN ('coach','coach_athlete') AND p.id <> a.coach_id
     AND p.coach_code IS NOT NULL ORDER BY p.created_at LIMIT 1) AS coach_b,
  (SELECT p.coach_code FROM profiles p WHERE p.role IN ('coach','coach_athlete') AND p.id <> a.coach_id
     AND p.coach_code IS NOT NULL ORDER BY p.created_at LIMIT 1) AS code_b,
  (SELECT p.id FROM profiles p WHERE p.role IN ('coach','coach_athlete') AND p.id <> a.coach_id
     AND p.coach_code IS NOT NULL ORDER BY p.created_at OFFSET 1 LIMIT 1) AS coach_c,
  (SELECT o.id FROM profiles o WHERE o.coach_id = a.coach_id AND o.id <> a.id AND o.id <> a.coach_id LIMIT 1) AS other_athlete,
  (SELECT count(*) FROM app_data d WHERE d.athlete_id = a.id) AS n_app_data,
  (SELECT count(*) FROM workout_logs w WHERE w.athlete_id = a.id) AS n_logs
FROM profiles a
WHERE a.role = 'athlete' AND a.coach_id IS NOT NULL AND a.coach_id <> a.id
  AND EXISTS (SELECT 1 FROM app_data d WHERE d.athlete_id = a.id)
  AND EXISTS (SELECT 1 FROM workout_logs w WHERE w.athlete_id = a.id)
ORDER BY a.created_at LIMIT 1;
GRANT SELECT ON ids TO authenticated;
-- Le coach B ne doit pas déjà être coach de l'athlète tiers testé
INSERT INTO r(k,v) SELECT '00 jeu de test complet (true)', (coach_b IS NOT NULL AND coach_c IS NOT NULL AND other_athlete IS NOT NULL)::text FROM ids;

SET LOCAL ROLE authenticated;

-- ===== Avant le lien : B ne voit rien =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach_b, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'A1 B sans lien : profil athlète (0)', count(*)::text FROM profiles WHERE id=(SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'A2 B sans lien : app_data (0)', count(*)::text FROM app_data WHERE athlete_id=(SELECT athlete FROM ids);
DO $$ BEGIN
  PERFORM add_co_coach((SELECT athlete FROM ids), (SELECT code_b FROM ids));
  INSERT INTO r(k,v) VALUES ('A3 B s''ajoute lui-même', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A3 B s''ajoute lui-même', 'refusé (OK)'); END $$;
DO $$ BEGIN
  INSERT INTO athlete_co_coaches(athlete_id, co_coach_id, added_by_role) SELECT athlete, coach_b, 'coach' FROM ids;
  INSERT INTO r(k,v) VALUES ('A4 insertion directe dans la table', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A4 insertion directe dans la table', 'refusé (OK)'); END $$;

-- ===== Le coach A ajoute B par son code =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach_a, 'role','authenticated')::text FROM ids), true);
DO $$ BEGIN
  PERFORM add_co_coach((SELECT athlete FROM ids), 'ZZZZZZ');
  INSERT INTO r(k,v) VALUES ('B0 code invalide', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('B0 code invalide', 'refusé (OK)'); END $$;
INSERT INTO r(k,v) SELECT 'B1 A ajoute B (co_coach = B : true)', ((add_co_coach(athlete, lower(code_b))->>'co_coach_id')::uuid = coach_b)::text FROM ids;
DO $$ BEGIN
  PERFORM add_co_coach((SELECT athlete FROM ids), (SELECT coach_code FROM profiles WHERE id=(SELECT coach_c FROM ids)));
  INSERT INTO r(k,v) VALUES ('B2 3e coach', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('B2 3e coach', 'refusé (OK)'); END $$;
INSERT INTO r(k,v) SELECT 'B3 A voit le lien (1)', count(*)::text FROM athlete_co_coaches WHERE athlete_id=(SELECT athlete FROM ids);

-- ===== B a les mêmes droits que A sur l'athlète =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach_b, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'C1 is_coach_of pour B (true)', is_coach_of(athlete)::text FROM ids;
INSERT INTO r(k,v) SELECT 'C2 B : profil athlète (1)', count(*)::text FROM profiles WHERE id=(SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'C3 B : app_data = celles de A (true)', (count(*) = (SELECT n_app_data FROM ids))::text FROM app_data WHERE athlete_id=(SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'C4 B : workout_logs = ceux de A (true)', (count(*) = (SELECT n_logs FROM ids))::text FROM workout_logs WHERE athlete_id=(SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'C5 B : autre athlète de A (0)', count(*)::text FROM profiles WHERE id=(SELECT other_athlete FROM ids);
INSERT INTO r(k,v) SELECT 'C6 B : app_data autre athlète de A (0)', count(*)::text FROM app_data WHERE athlete_id=(SELECT other_athlete FROM ids);
INSERT INTO r(k,v) SELECT 'C7 B : can_coach_athlete (true)', can_coach_athlete(athlete)::text FROM ids;
DO $$ DECLARE n int; BEGIN
  UPDATE app_data SET value = value WHERE athlete_id = (SELECT athlete FROM ids) AND key = (SELECT key FROM app_data WHERE athlete_id=(SELECT athlete FROM ids) LIMIT 1);
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO r(k,v) VALUES ('C8 B modifie un programme (app_data, 1)', n::text);
END $$;
DO $$ DECLARE n int; BEGIN
  UPDATE profiles SET weight_kg = weight_kg WHERE id = (SELECT athlete FROM ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO r(k,v) VALUES ('C9 B modifie le poids de l''athlète (1)', n::text);
END $$;
DO $$ BEGIN
  UPDATE profiles SET coach_id = auth.uid() WHERE id = (SELECT athlete FROM ids);
  INSERT INTO r(k,v) VALUES ('C10 B se met coach référent', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('C10 B se met coach référent', 'refusé (OK)'); END $$;
DO $$ BEGIN
  UPDATE profiles SET coach_hidden = true WHERE id = (SELECT athlete FROM ids);
  INSERT INTO r(k,v) VALUES ('C11 B change coach_hidden du référent', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('C11 B change coach_hidden du référent', 'refusé (OK)'); END $$;
DO $$ BEGIN
  PERFORM unlink_athlete((SELECT athlete FROM ids));
  INSERT INTO r(k,v) VALUES ('C12 B délie l''athlète', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('C12 B délie l''athlète', 'refusé (OK)'); END $$;
-- Masquage propre à B
SELECT set_athlete_hidden((SELECT athlete FROM ids), true);
INSERT INTO r(k,v) SELECT 'C13 B masque : sa ligne (true)', hidden::text FROM athlete_co_coaches WHERE athlete_id=(SELECT athlete FROM ids);
RESET ROLE;
INSERT INTO r(k,v) SELECT 'C14 masquage de B sans effet sur A (coach_hidden inchangé : false)', coalesce(coach_hidden,false)::text FROM profiles WHERE id=(SELECT athlete FROM ids);
SET LOCAL ROLE authenticated;

-- ===== Fiche perso créée par A pour l'athlète : B la lit et la modifie =====
RESET ROLE;
INSERT INTO docs(id, coach_id, athlete_id, uploaded_by, title, category, kind)
SELECT '00000000-0000-4000-8000-0000000c0c01', coach_a, athlete, coach_a, 'TEST co-coach', 'autre', 'questionnaire' FROM ids;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach_b, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'D1 B lit la fiche perso de A (1)', count(*)::text FROM docs WHERE id='00000000-0000-4000-8000-0000000c0c01';
DO $$ DECLARE n int; BEGIN
  UPDATE docs SET title = 'TEST co-coach modifié' WHERE id = '00000000-0000-4000-8000-0000000c0c01';
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO r(k,v) VALUES ('D2 B modifie la fiche perso (1)', n::text);
END $$;
DO $$ BEGIN
  UPDATE docs SET coach_id = (SELECT coach_c FROM ids) WHERE id = '00000000-0000-4000-8000-0000000c0c01';
  INSERT INTO r(k,v) VALUES ('D3 B donne la fiche à un coach tiers', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('D3 B donne la fiche à un coach tiers', 'refusé (OK)'); END $$;

-- ===== Coach tiers C : rien =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach_c, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'E1 C : profil athlète (0)', count(*)::text FROM profiles WHERE id=(SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'E2 C : app_data (0)', count(*)::text FROM app_data WHERE athlete_id=(SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'E3 C : lien (0)', count(*)::text FROM athlete_co_coaches WHERE athlete_id=(SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'E4 C : fiche perso (0)', count(*)::text FROM docs WHERE id='00000000-0000-4000-8000-0000000c0c01';
DO $$ BEGIN
  PERFORM remove_co_coach((SELECT athlete FROM ids));
  INSERT INTO r(k,v) VALUES ('E5 C retire le co-coach', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('E5 C retire le co-coach', 'refusé (OK)'); END $$;

-- ===== L'athlète voit son lien ; B se retire ; A ne perd rien =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'F1 athlète voit son co-coach (1)', count(*)::text FROM athlete_co_coaches WHERE athlete_id=(SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'F2 athlète voit le profil de B (1)', count(*)::text FROM profiles WHERE id=(SELECT coach_b FROM ids);
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach_b, 'role','authenticated')::text FROM ids), true);
SELECT remove_co_coach((SELECT athlete FROM ids));
INSERT INTO r(k,v) SELECT 'F3 B parti : app_data (0)', count(*)::text FROM app_data WHERE athlete_id=(SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'F4 B parti : profil (0)', count(*)::text FROM profiles WHERE id=(SELECT athlete FROM ids);
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach_a, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'F5 A garde tout : app_data (true)', (count(*) = (SELECT n_app_data FROM ids))::text FROM app_data WHERE athlete_id=(SELECT athlete FROM ids);

-- ===== L'athlète ajoute B ; changement de coach référent → lien supprimé =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role','authenticated')::text FROM ids), true);
SELECT add_co_coach(athlete, code_b) FROM ids;
INSERT INTO r(k,v) SELECT 'G1 athlète ajoute B (added_by_role athlete)', added_by_role FROM athlete_co_coaches WHERE athlete_id=(SELECT athlete FROM ids);
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach_a, 'role','authenticated')::text FROM ids), true);
SELECT unlink_athlete((SELECT athlete FROM ids));
RESET ROLE;
INSERT INTO r(k,v) SELECT 'G2 après unlink par A : lien (0)', count(*)::text FROM athlete_co_coaches WHERE athlete_id=(SELECT athlete FROM ids);

RESET ROLE;
SELECT k, v FROM r ORDER BY n;
ROLLBACK;
