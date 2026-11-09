-- Tests weight_set_goal (objectif de poids : asp:bw.target -> body_weight_goals).
-- Toujours annulé (ROLLBACK final) : rien ne reste en base.
--
-- Après application de la migration :
--   supabase db query --linked -f supabase/tests/weight_set_goal.sql
-- Avant application (migration jouée dans la même transaction, puis annulée) :
--   (echo 'BEGIN;'; cat supabase/migrations/20261110110000_weight_set_goal.sql; \
--    sed '/^BEGIN;$/d' supabase/tests/weight_set_goal.sql) > "$TMPDIR/g.sql"
--   supabase db query --linked -f "$TMPDIR/g.sql"
-- Chaque ligne k → v : la valeur attendue est dans le libellé. Seules des valeurs
-- de test sont affichées (aucune donnée d'athlète).

BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated, anon; GRANT ALL ON SEQUENCE r_n_seq TO authenticated, anon;
CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT a.id AS athlete, a.coach_id AS coach,
  (SELECT p.id FROM profiles p WHERE p.role IN ('coach','coach_athlete') AND p.id <> a.coach_id
     AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = a.id AND cc.co_coach_id = p.id)
     ORDER BY p.created_at LIMIT 1) AS co_coach,
  (SELECT p.id FROM profiles p WHERE p.role IN ('coach','coach_athlete') AND p.id <> a.coach_id
     AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = a.id AND cc.co_coach_id = p.id)
     ORDER BY p.created_at DESC LIMIT 1) AS other_coach,
  (SELECT o.id FROM profiles o WHERE o.coach_id = a.coach_id AND o.id <> a.id AND o.id <> a.coach_id LIMIT 1) AS other_athlete
FROM profiles a
WHERE a.role = 'athlete' AND a.coach_id IS NOT NULL AND a.coach_id <> a.id
ORDER BY a.created_at LIMIT 1;
GRANT SELECT ON ids TO authenticated, anon;
INSERT INTO r(k,v) SELECT '00 jeu de test complet (true)',
  (athlete IS NOT NULL AND co_coach IS NOT NULL AND other_coach IS NOT NULL AND co_coach <> other_coach
   AND other_athlete IS NOT NULL)::text FROM ids;

-- État de départ maîtrisé : un palier déjà posé (current 70), pas d'objectif.
DELETE FROM app_data WHERE athlete_id = (SELECT athlete FROM ids) AND key = 'asp:bw';
INSERT INTO app_data(athlete_id, key, value) SELECT athlete, 'asp:bw', '{"current": 70, "target": 0}'::jsonb FROM ids;
-- Co-coach de l'athlète (ajouté dans la transaction, annulé avec elle).
INSERT INTO athlete_co_coaches(athlete_id, co_coach_id, added_by_role) SELECT athlete, co_coach, 'coach' FROM ids;

SET LOCAL ROLE authenticated;

-- ===== Athlète =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'A1 athlète fixe 65.5 : target (65.5)', weight_set_goal(athlete, 65.5)->>'target' FROM ids;
INSERT INTO r(k,v) SELECT 'A2 current gardé (70)', (SELECT value->>'current' FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:bw') FROM ids i;
INSERT INTO r(k,v) SELECT 'A3 body_weight_goals suivi par le trigger (65.5)',
  (SELECT target_kg::text FROM body_weight_goals WHERE athlete_id = i.athlete) FROM ids i;
-- Dans un bloc : l'instruction suivante voit l'écriture de la RPC (nouvel instantané).
DO $$ DECLARE v jsonb; BEGIN
  v := weight_set_goal((SELECT athlete FROM ids), 66);
  INSERT INTO r(k,v) SELECT 'A4 le retour est asp:bw complet (true)',
    (v = (SELECT value FROM app_data WHERE athlete_id = (SELECT athlete FROM ids) AND key = 'asp:bw'))::text;
END $$;
INSERT INTO r(k,v) SELECT 'A5 NULL = pas d''objectif (0)', weight_set_goal(athlete, NULL)->>'target' FROM ids;
INSERT INTO r(k,v) SELECT 'A6 pas d''objectif -> target_kg NULL, référence gardée (true / 70)',
  ((SELECT target_kg IS NULL FROM body_weight_goals WHERE athlete_id = i.athlete)::text || ' / ' ||
   (SELECT reference_kg::text FROM body_weight_goals WHERE athlete_id = i.athlete)) FROM ids i;
DO $$ BEGIN
  PERFORM weight_set_goal((SELECT other_athlete FROM ids), 60);
  INSERT INTO r(k,v) VALUES ('A7 athlète fixe l''objectif d''un autre', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A7 athlète fixe l''objectif d''un autre', 'refusé (OK)'); END $$;
DO $$ BEGIN
  PERFORM weight_set_goal((SELECT athlete FROM ids), -5);
  INSERT INTO r(k,v) VALUES ('A8 objectif négatif', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A8 objectif négatif', 'refusé (OK)'); END $$;
DO $$ BEGIN
  PERFORM weight_set_goal((SELECT athlete FROM ids), 500);
  INSERT INTO r(k,v) VALUES ('A9 objectif 500', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A9 objectif 500', 'refusé (OK)'); END $$;
DO $$ BEGIN
  PERFORM weight_set_goal(NULL, 60);
  INSERT INTO r(k,v) VALUES ('A10 athlète absent', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A10 athlète absent', 'refusé (OK)'); END $$;

-- ===== Coach référent =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'C1 coach fixe 68 (68)', weight_set_goal(athlete, 68)->>'target' FROM ids;

-- ===== Co-coach =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', co_coach, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'K1 co-coach fixe 67 (67)', weight_set_goal(athlete, 67)->>'target' FROM ids;
INSERT INTO r(k,v) SELECT 'K2 current toujours gardé (70)', (SELECT value->>'current' FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:bw') FROM ids i;

-- ===== Autre coach =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', other_coach, 'role','authenticated')::text FROM ids), true);
DO $$ BEGIN
  PERFORM weight_set_goal((SELECT athlete FROM ids), 50);
  INSERT INTO r(k,v) VALUES ('O1 autre coach', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('O1 autre coach', 'refusé (OK)'); END $$;

-- ===== anon =====
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$ BEGIN
  PERFORM weight_set_goal((SELECT athlete FROM ids), 50);
  INSERT INTO r(k,v) VALUES ('N1 anon', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('N1 anon', 'refusé (OK) ' || SQLSTATE); END $$;

-- ===== Ligne absente : la RPC la crée =====
RESET ROLE;
DELETE FROM app_data WHERE athlete_id = (SELECT athlete FROM ids) AND key = 'asp:bw';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'E1 asp:bw créé ({"target": 64, "current": 0})', weight_set_goal(athlete, 64)::text FROM ids;

-- ===== Droits =====
RESET ROLE;
INSERT INTO r(k,v) SELECT 'Z1 droits : anon sans EXECUTE (false)', has_function_privilege('anon', 'public.weight_set_goal(uuid,numeric)', 'EXECUTE')::text;
INSERT INTO r(k,v) SELECT 'Z2 droits : authenticated avec EXECUTE (true)', has_function_privilege('authenticated', 'public.weight_set_goal(uuid,numeric)', 'EXECUTE')::text;
INSERT INTO r(k,v) SELECT 'Z3 SECURITY DEFINER + search_path (true / true)',
  p.prosecdef::text || ' / ' || (p.proconfig @> ARRAY['search_path=public'])::text
  FROM pg_proc p WHERE p.proname = 'weight_set_goal' AND p.pronamespace = 'public'::regnamespace;

SELECT k, v FROM r ORDER BY n;
ROLLBACK;
