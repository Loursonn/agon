-- Tests : RPC nutrition_save_day (migration 20261108130000_nutrition_rpcs).
-- Toujours annulé (ROLLBACK final) : rien ne reste en base. À lancer AVEC la
-- migration, dans la même transaction :
--   (echo 'BEGIN;'; cat supabase/migrations/20261108130000_nutrition_rpcs.sql \
--      supabase/tests/nutrition_rpcs.sql) > /tmp/t.sql
--   supabase db query --linked -f /tmp/t.sql
-- (ce fichier se termine par ROLLBACK ; son BEGIN ci-dessous est alors un simple
-- avertissement « transaction déjà ouverte »).
-- Chaque ligne k → v : la valeur attendue est dans le libellé. Aucun contenu
-- du journal n'est affiché : seulement des booléens et des comptes.

BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated, anon; GRANT ALL ON SEQUENCE r_n_seq TO authenticated, anon;

-- Un athlète qui a déjà un journal et un coach référent ; un autre coach qui
-- n'est ni son référent ni son co-coach ; un athlète sans journal.
CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT a.id AS ath, a.coach_id AS coach,
  (SELECT p.id FROM profiles p
    WHERE p.role IN ('coach', 'coach_athlete') AND p.id <> a.id AND p.id <> a.coach_id
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = a.id AND cc.co_coach_id = p.id)
    ORDER BY p.created_at LIMIT 1) AS other_coach,
  (SELECT p.id FROM profiles p
    WHERE p.role = 'athlete'
      AND NOT EXISTS (SELECT 1 FROM app_data x WHERE x.athlete_id = p.id AND x.key = 'asp:nutrition_log')
    ORDER BY p.created_at LIMIT 1) AS fresh,
  (SELECT value FROM app_data x WHERE x.athlete_id = a.id AND x.key = 'asp:nutrition_log') AS before
FROM profiles a
WHERE a.role = 'athlete' AND a.coach_id IS NOT NULL AND a.coach_id <> a.id
  AND EXISTS (SELECT 1 FROM app_data x WHERE x.athlete_id = a.id AND x.key = 'asp:nutrition_log')
ORDER BY a.created_at LIMIT 1;
GRANT SELECT ON ids TO authenticated, anon;

INSERT INTO r(k,v) SELECT '00 jeu de test complet (true)',
  (ath IS NOT NULL AND coach IS NOT NULL AND other_coach IS NOT NULL AND fresh IS NOT NULL)::text FROM ids;
INSERT INTO r(k,v) SELECT '01 le jour de test est libre (false)', (before ? '1999-01-02')::text FROM ids;
INSERT INTO r(k,v) VALUES
  ('02 droit anon (false)', has_function_privilege('anon', 'public.nutrition_save_day(uuid,date,jsonb)', 'EXECUTE')::text),
  ('03 droit authenticated (true)', has_function_privilege('authenticated', 'public.nutrition_save_day(uuid,date,jsonb)', 'EXECUTE')::text),
  ('04 SECURITY DEFINER + search_path (true)', (SELECT prosecdef AND proconfig @> ARRAY['search_path=public']
     FROM pg_proc WHERE oid = 'public.nutrition_save_day(uuid,date,jsonb)'::regprocedure)::text);

SET LOCAL ROLE authenticated;

-- ── L'athlète ────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', ath, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'A1 enregistre un jour, champ inconnu retiré (true)',
  (nutrition_save_day(ath, '1999-01-02', '{"total_calories_consumed": 2000, "glucides_consumed": 200, "intrus": "x"}'::jsonb)
     = '{"total_calories_consumed": 2000, "glucides_consumed": 200}'::jsonb)::text FROM ids;
INSERT INTO r(k,v) SELECT 'A2 les autres jours sont intacts (true)',
  ((SELECT value FROM app_data WHERE athlete_id = ath AND key = 'asp:nutrition_log') - '1999-01-02' = before)::text FROM ids;
INSERT INTO r(k,v) SELECT 'A3 un jour de plus (1)',
  ((SELECT count(*) FROM jsonb_object_keys((SELECT value FROM app_data WHERE athlete_id = ath AND key = 'asp:nutrition_log')))
   - (SELECT count(*) FROM jsonb_object_keys(before)))::text FROM ids;
INSERT INTO r(k,v) SELECT 'A4a réenregistre le même jour (true)',
  (nutrition_save_day(ath, '1999-01-02', '{"total_calories_consumed": 1800, "active_calories": null}'::jsonb) IS NOT NULL)::text FROM ids;
INSERT INTO r(k,v) SELECT 'A4 réenregistrer remplace la journée (true)',
  ((SELECT value -> '1999-01-02' FROM app_data WHERE athlete_id = ath AND key = 'asp:nutrition_log')
     = '{"total_calories_consumed": 1800, "active_calories": null}'::jsonb)::text FROM ids;
INSERT INTO r(k,v) SELECT 'A5 clé de jour au format ISO (true)',
  ((SELECT value ? '1999-01-02' FROM app_data WHERE athlete_id = ath AND key = 'asp:nutrition_log'))::text FROM ids;
DO $$ BEGIN
  PERFORM nutrition_save_day((SELECT ath FROM ids), '1999-01-03', '{"total_calories_consumed": "beaucoup"}'::jsonb);
  INSERT INTO r(k,v) VALUES ('A6 valeur non numérique', 'ACCEPTÉE (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A6 valeur non numérique', 'refusée (OK)'); END $$;
DO $$ BEGIN
  PERFORM nutrition_save_day((SELECT ath FROM ids), '1999-01-03', '[1,2]'::jsonb);
  INSERT INTO r(k,v) VALUES ('A7 journée qui n''est pas un objet', 'ACCEPTÉE (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A7 journée qui n''est pas un objet', 'refusée (OK)'); END $$;
DO $$ BEGIN
  PERFORM nutrition_save_day((SELECT fresh FROM ids), '1999-01-03', '{"total_calories_consumed": 1}'::jsonb);
  INSERT INTO r(k,v) VALUES ('A8 écrit le journal d''un autre athlète', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A8 écrit le journal d''un autre athlète', 'refusé (OK)'); END $$;

-- ── Son coach référent : lit, n'écrit pas par la RPC ──────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'B1 coach lit le journal (RLS inchangée) (1)',
  (SELECT count(*) FROM app_data WHERE athlete_id = ath AND key = 'asp:nutrition_log')::text FROM ids;
DO $$ BEGIN
  PERFORM nutrition_save_day((SELECT ath FROM ids), '1999-01-03', '{"total_calories_consumed": 1}'::jsonb);
  INSERT INTO r(k,v) VALUES ('B2 coach écrit le journal par la RPC', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('B2 coach écrit le journal par la RPC', 'refusé (OK)'); END $$;

-- ── Un autre coach : ne lit pas, n'écrit pas ─────────────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', other_coach, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'C1 autre coach lit le journal (0)',
  (SELECT count(*) FROM app_data WHERE athlete_id = ath AND key = 'asp:nutrition_log')::text FROM ids;
DO $$ BEGIN
  PERFORM nutrition_save_day((SELECT ath FROM ids), '1999-01-03', '{"total_calories_consumed": 1}'::jsonb);
  INSERT INTO r(k,v) VALUES ('C2 autre coach écrit le journal', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('C2 autre coach écrit le journal', 'refusé (OK)'); END $$;

-- ── Un athlète sans journal : la ligne est créée ─────────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', fresh, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'D0 enregistre sans journal existant (true)',
  (nutrition_save_day(fresh, '1999-01-02', '{"proteines_consumed": 120}'::jsonb) IS NOT NULL)::text FROM ids;
INSERT INTO r(k,v) SELECT 'D1 journal créé avec une seule journée (1)',
  (SELECT count(*) FROM jsonb_object_keys((SELECT value FROM app_data WHERE athlete_id = fresh AND key = 'asp:nutrition_log')))::text FROM ids;

-- ── Sans session ─────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '', true);
DO $$ BEGIN
  PERFORM nutrition_save_day((SELECT ath FROM ids), '1999-01-03', '{}'::jsonb);
  INSERT INTO r(k,v) VALUES ('D2 authenticated sans sub', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('D2 authenticated sans sub', 'refusé (OK)'); END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM nutrition_save_day((SELECT ath FROM ids), '1999-01-03', '{}'::jsonb);
  INSERT INTO r(k,v) VALUES ('E1 anon appelle la RPC', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('E1 anon appelle la RPC', 'refusé (OK)'); END $$;

RESET ROLE;
SELECT k, v FROM r ORDER BY n;
ROLLBACK;
