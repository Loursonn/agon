-- Saisie unique de la date de naissance (migration 20261114110000, revue juridique C2).
-- Toujours annulé (ROLLBACK final) : rien ne reste en base.
--   supabase db query --linked -f supabase/tests/set_my_birth_date.sql
-- Chaque ligne k → v : la valeur attendue est dans le libellé. Aucune donnée personnelle
-- n'est affichée (booléens et messages d'erreur seulement).
BEGIN;

CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated, anon; GRANT ALL ON SEQUENCE r_n_seq TO authenticated, anon;

-- Deux athlètes : a (16 ans), b (30 ans). Dates remises à NULL dans la transaction.
CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT (SELECT id FROM profiles WHERE role IN ('athlete','coach_athlete') ORDER BY created_at LIMIT 1) AS a,
       (SELECT id FROM profiles WHERE role IN ('athlete','coach_athlete') ORDER BY created_at OFFSET 1 LIMIT 1) AS b;
GRANT SELECT ON ids TO authenticated, anon;
INSERT INTO r(k,v) SELECT '00 jeu de test (true)', (a IS NOT NULL AND b IS NOT NULL AND a <> b)::text FROM ids;
UPDATE profiles SET birth_date = NULL WHERE id IN (SELECT a FROM ids UNION SELECT b FROM ids);

-- Anonyme : refusé.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$ BEGIN
  PERFORM set_my_birth_date('1990-01-01');
  INSERT INTO r(k,v) VALUES ('01 anonyme (refusé)', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('01 anonyme (refusé)', 'refusé (OK) ' || SQLSTATE); END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', a, 'role','authenticated')::text FROM ids), true);
-- L'athlète a donné son accord IA quand sa date était inconnue (cas des anciens comptes).
INSERT INTO user_consents(user_id, purpose, granted, doc_version, statement)
  SELECT a, 'ai_programming', true, '2026-11-13', 'test' FROM ids;
INSERT INTO user_consents(user_id, purpose, granted, doc_version, statement)
  SELECT a, 'health_data', true, '2026-11-13', 'test' FROM ids;
INSERT INTO r(k,v) SELECT '02 date inconnue : accord IA courant avant saisie (true)', granted::text
  FROM current_consents WHERE user_id = (SELECT a FROM ids) AND purpose = 'ai_programming';

-- Moins de 15 ans, date future, date absente : refusées, rien d'écrit.
DO $$ BEGIN
  PERFORM set_my_birth_date((current_date - interval '10 years')::date);
  INSERT INTO r(k,v) VALUES ('03 10 ans (refusé)', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('03 10 ans (refusé)', CASE WHEN SQLERRM LIKE '%15 ans%' THEN 'refusé (OK)' ELSE 'autre erreur (KO) ' || SQLERRM END); END $$;
DO $$ BEGIN
  PERFORM set_my_birth_date((current_date + 3)::date);
  INSERT INTO r(k,v) VALUES ('04 date future (refusé)', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('04 date future (refusé)', CASE WHEN SQLERRM LIKE '%invalide%' THEN 'refusé (OK)' ELSE 'autre erreur (KO) ' || SQLERRM END); END $$;
DO $$ BEGIN
  PERFORM set_my_birth_date(NULL);
  INSERT INTO r(k,v) VALUES ('05 date absente (refusé)', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('05 date absente (refusé)', 'refusé (OK)'); END $$;
INSERT INTO r(k,v) SELECT '06 rien d''écrit après les refus (true)', (birth_date IS NULL)::text
  FROM profiles WHERE id = (SELECT a FROM ids);

-- 16 ans : date écrite, accord IA retiré dans la même opération, accord santé intact.
INSERT INTO r(k,v) SELECT '07 16 ans : date renvoyée (true)',
  (set_my_birth_date((current_date - interval '16 years')::date) = (current_date - interval '16 years')::date)::text;
INSERT INTO r(k,v) SELECT '08 16 ans : date en base (true)',
  (birth_date = (current_date - interval '16 years')::date)::text FROM profiles WHERE id = (SELECT a FROM ids);
INSERT INTO r(k,v) SELECT '09 16 ans : accord IA courant (false)', granted::text
  FROM current_consents WHERE user_id = (SELECT a FROM ids) AND purpose = 'ai_programming';
INSERT INTO r(k,v) SELECT '10 16 ans : accord santé courant (true)', granted::text
  FROM current_consents WHERE user_id = (SELECT a FROM ids) AND purpose = 'health_data';
-- Une seule fois.
DO $$ BEGIN
  PERFORM set_my_birth_date('1990-01-01');
  INSERT INTO r(k,v) VALUES ('11 seconde saisie (refusé)', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('11 seconde saisie (refusé)', CASE WHEN SQLERRM LIKE '%déjà%' THEN 'refusé (OK)' ELSE 'autre erreur (KO) ' || SQLERRM END); END $$;
INSERT INTO r(k,v) SELECT '12 date inchangée après seconde saisie (true)',
  (birth_date = (current_date - interval '16 years')::date)::text FROM profiles WHERE id = (SELECT a FROM ids);

-- 30 ans : accord IA conservé ; la date de l'autre athlète n'a pas bougé.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', b, 'role','authenticated')::text FROM ids), true);
INSERT INTO user_consents(user_id, purpose, granted, doc_version, statement)
  SELECT b, 'ai_programming', true, '2026-11-13', 'test' FROM ids;
INSERT INTO r(k,v) SELECT '13 30 ans : saisie acceptée (true)',
  (set_my_birth_date((current_date - interval '30 years')::date) IS NOT NULL)::text;
INSERT INTO r(k,v) SELECT '14 30 ans : accord IA courant (true)', granted::text
  FROM current_consents WHERE user_id = (SELECT b FROM ids) AND purpose = 'ai_programming';
RESET ROLE;
INSERT INTO r(k,v) SELECT '15 athlète a non touché par b (true)',
  (birth_date = (current_date - interval '16 years')::date)::text FROM profiles WHERE id = (SELECT a FROM ids);

SELECT k, v FROM r ORDER BY n;
ROLLBACK;
