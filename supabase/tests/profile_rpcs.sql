-- Tests weight_set_day / weight_record_milestone (poids : asp:wlog, asp:wmile, asp:bw).
-- Toujours annulé (ROLLBACK final) : rien ne reste en base.
--
-- Après application de la migration :
--   supabase db query --linked -f supabase/tests/profile_rpcs.sql
-- Avant application (migration jouée dans la même transaction, puis annulée) :
--   (echo 'BEGIN;'; cat supabase/migrations/20261109150000_profile_rpcs.sql; \
--    sed '/^BEGIN;$/d' supabase/tests/profile_rpcs.sql) > "$TMPDIR/p.sql"
--   supabase db query --linked -f "$TMPDIR/p.sql"
-- Chaque ligne k → v : la valeur attendue est dans le libellé. Jours de test
-- en 2099 : aucune collision possible avec une vraie pesée. Seules des valeurs
-- de test sont affichées (aucune donnée d'athlète).

BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated, anon; GRANT ALL ON SEQUENCE r_n_seq TO authenticated, anon;
CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT a.id AS athlete, a.coach_id AS coach,
  (SELECT p.id FROM profiles p WHERE p.role IN ('coach','coach_athlete') AND p.id <> a.coach_id
     AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = a.id AND cc.co_coach_id = p.id)
     ORDER BY p.created_at LIMIT 1) AS other_coach,
  (SELECT o.id FROM profiles o WHERE o.coach_id = a.coach_id AND o.id <> a.id AND o.id <> a.coach_id LIMIT 1) AS other_athlete,
  (SELECT value FROM app_data d WHERE d.athlete_id = a.id AND d.key = 'asp:wlog') AS wlog0,
  (SELECT value FROM app_data d WHERE d.athlete_id = a.id AND d.key = 'asp:wmile') AS wmile0,
  (SELECT value FROM app_data d WHERE d.athlete_id = a.id AND d.key = 'asp:bw') AS bw0
FROM profiles a
WHERE a.role = 'athlete' AND a.coach_id IS NOT NULL AND a.coach_id <> a.id
  AND EXISTS (SELECT 1 FROM app_data d WHERE d.athlete_id = a.id AND d.key = 'asp:wlog' AND jsonb_typeof(d.value) = 'object')
ORDER BY a.created_at LIMIT 1;
GRANT SELECT ON ids TO authenticated, anon;
INSERT INTO r(k,v) SELECT '00 jeu de test complet (true)',
  (athlete IS NOT NULL AND other_coach IS NOT NULL AND other_athlete IS NOT NULL)::text FROM ids;

-- Une pesée déjà présente au format ISO : la RPC doit la remplacer.
UPDATE app_data SET value = value || '{"2099-01-03": 70}'
 WHERE athlete_id = (SELECT athlete FROM ids) AND key = 'asp:wlog';

SET LOCAL ROLE authenticated;

-- ===== Athlète =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'A1 athlète pèse 72.5 le 2099-01-02 (72.5)',
  weight_set_day(athlete, '2099-01-02', 72.5)->>'20990102' FROM ids;
INSERT INTO r(k,v) SELECT 'A2 les autres pesées sont intactes (true)',
  ((SELECT value FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:wlog') - '20990102' - '2099-01-03'
     = i.wlog0)::text FROM ids i;
SELECT weight_set_day(athlete, '2099-01-02', 73) FROM ids;
INSERT INTO r(k,v) SELECT 'A3 même jour remplacé (73)',
  (SELECT value->>'20990102' FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:wlog') FROM ids i;
SELECT weight_set_day(athlete, '2099-01-03', 71) FROM ids;
INSERT INTO r(k,v) SELECT 'A4 ancien format ISO retiré, compact écrit (false / 71)',
  ((SELECT value ? '2099-01-03' FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:wlog')::text || ' / ' ||
   (SELECT value->>'20990103' FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:wlog')) FROM ids i;
-- Dans un bloc : l'instruction suivante voit l'écriture de la RPC (nouvel instantané).
DO $$ DECLARE v jsonb; BEGIN
  v := weight_set_day((SELECT athlete FROM ids), '2099-01-04', 70.5);
  INSERT INTO r(k,v) SELECT 'A5 le retour est le journal complet (true)',
    (v = (SELECT value FROM app_data WHERE athlete_id = (SELECT athlete FROM ids) AND key = 'asp:wlog'))::text;
END $$;
DO $$ BEGIN
  PERFORM weight_set_day((SELECT other_athlete FROM ids), '2099-01-02', 80);
  INSERT INTO r(k,v) VALUES ('A6 athlète pèse un autre', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A6 athlète pèse un autre', 'refusé (OK)'); END $$;
DO $$ BEGIN
  PERFORM weight_set_day((SELECT athlete FROM ids), '2099-01-02', 0);
  INSERT INTO r(k,v) VALUES ('A7 poids nul', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A7 poids nul', 'refusé (OK)'); END $$;
DO $$ BEGIN
  PERFORM weight_set_day((SELECT athlete FROM ids), NULL, 70);
  INSERT INTO r(k,v) VALUES ('A8 jour absent', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A8 jour absent', 'refusé (OK)'); END $$;

-- Palier : ajout à asp:wmile, asp:bw.current posé, objectif gardé.
INSERT INTO r(k,v) SELECT 'M1 palier → bw.current (72.7)',
  weight_record_milestone(athlete, '2099-01-04', 72.7)->>'current' FROM ids;
INSERT INTO r(k,v) SELECT 'M2 objectif gardé (true)',
  ((SELECT value->'target' FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:bw')
     IS NOT DISTINCT FROM CASE WHEN jsonb_typeof(i.bw0) = 'object' THEN i.bw0->'target' ELSE '0'::jsonb END)::text FROM ids i;
SELECT weight_record_milestone(athlete, '2099-01-04', 72.7) FROM ids;
INSERT INTO r(k,v) SELECT 'M3 palier ajouté une seule fois malgré deux appels (1)',
  (SELECT count(*) FROM app_data, jsonb_array_elements(value) e
    WHERE athlete_id = i.athlete AND key = 'asp:wmile' AND e = '{"date":"20990104","kg":72.7}'::jsonb)::text FROM ids i;
INSERT INTO r(k,v) SELECT 'M4 anciens paliers intacts (true)',
  (coalesce(i.wmile0, '[]'::jsonb) <@ (SELECT value FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:wmile'))::text FROM ids i;
DO $$ BEGIN
  PERFORM weight_record_milestone((SELECT other_athlete FROM ids), '2099-01-04', 80);
  INSERT INTO r(k,v) VALUES ('M5 athlète palier chez un autre', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('M5 athlète palier chez un autre', 'refusé (OK)'); END $$;

-- ===== Coach référent =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'C1 coach pèse son athlète (74)',
  weight_set_day(athlete, '2099-01-05', 74)->>'20990105' FROM ids;
INSERT INTO r(k,v) SELECT 'C2 coach palier (74.1)',
  weight_record_milestone(athlete, '2099-01-05', 74.1)->>'current' FROM ids;

-- ===== Autre coach =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', other_coach, 'role','authenticated')::text FROM ids), true);
DO $$ BEGIN
  PERFORM weight_set_day((SELECT athlete FROM ids), '2099-01-02', 60);
  INSERT INTO r(k,v) VALUES ('O1 autre coach pèse', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('O1 autre coach pèse', 'refusé (OK)'); END $$;
DO $$ BEGIN
  PERFORM weight_record_milestone((SELECT athlete FROM ids), '2099-01-02', 60);
  INSERT INTO r(k,v) VALUES ('O2 autre coach palier', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('O2 autre coach palier', 'refusé (OK)'); END $$;

-- ===== anon =====
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$ BEGIN
  PERFORM weight_set_day((SELECT athlete FROM ids), '2099-01-02', 60);
  INSERT INTO r(k,v) VALUES ('N1 anon pèse', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('N1 anon pèse', 'refusé (OK) ' || SQLSTATE); END $$;
DO $$ BEGIN
  PERFORM weight_record_milestone((SELECT athlete FROM ids), '2099-01-02', 60);
  INSERT INTO r(k,v) VALUES ('N2 anon palier', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('N2 anon palier', 'refusé (OK) ' || SQLSTATE); END $$;

-- ===== Lignes absentes : les RPC les créent =====
RESET ROLE;
DELETE FROM app_data WHERE athlete_id = (SELECT athlete FROM ids) AND key IN ('asp:wlog', 'asp:wmile', 'asp:bw');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'E1 journal créé avec la seule pesée ({"20990106": 69})',
  weight_set_day(athlete, '2099-01-06', 69)::text FROM ids;
INSERT INTO r(k,v) SELECT 'E2 bw créé ({"target": 0, "current": 69.5})',
  weight_record_milestone(athlete, '2099-01-06', 69.5)::text FROM ids;
INSERT INTO r(k,v) SELECT 'E3 paliers créés ([{"kg": 69.5, "date": "20990106"}])',
  (SELECT value::text FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:wmile') FROM ids i;

RESET ROLE;
INSERT INTO r(k,v) SELECT 'Z1 droits : anon sans EXECUTE (false / false)',
  has_function_privilege('anon', 'public.weight_set_day(uuid,date,numeric)', 'EXECUTE')::text || ' / ' ||
  has_function_privilege('anon', 'public.weight_record_milestone(uuid,date,numeric)', 'EXECUTE')::text;
INSERT INTO r(k,v) SELECT 'Z2 droits : authenticated avec EXECUTE (true / true)',
  has_function_privilege('authenticated', 'public.weight_set_day(uuid,date,numeric)', 'EXECUTE')::text || ' / ' ||
  has_function_privilege('authenticated', 'public.weight_record_milestone(uuid,date,numeric)', 'EXECUTE')::text;
INSERT INTO r(k,v) SELECT 'Z3 SECURITY DEFINER + search_path (true / true)',
  bool_and(p.prosecdef)::text || ' / ' || bool_and(p.proconfig @> ARRAY['search_path=public'])::text
  FROM pg_proc p WHERE p.proname IN ('weight_set_day', 'weight_record_milestone') AND p.pronamespace = 'public'::regnamespace;

SELECT k, v FROM r ORDER BY n;
ROLLBACK;
