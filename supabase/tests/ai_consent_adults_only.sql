-- Accord IA réservé aux 18 ans et plus (migration 20261113220000, revue juridique C2).
-- Toujours annulé (ROLLBACK final) : rien ne reste en base.
--   supabase db query --linked -f supabase/tests/ai_consent_adults_only.sql
-- Chaque ligne k → v : la valeur attendue est dans le libellé. Aucune donnée personnelle
-- n'est affichée (booléens et comptes seulement).
BEGIN;

CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;
INSERT INTO r(k,v) SELECT '01 mineurs avec accord IA courant après rattrapage (0)', count(*)::text
  FROM current_consents c JOIN profiles p ON p.id = c.user_id
  WHERE c.purpose = 'ai_programming' AND c.granted AND p.birth_date > current_date - interval '18 years';

CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT id AS u FROM profiles WHERE role IN ('athlete','coach_athlete') ORDER BY created_at LIMIT 1;
GRANT SELECT ON ids TO authenticated;

-- 16 ans : l'accord donné est enregistré en refus.
UPDATE profiles SET birth_date = (current_date - interval '16 years')::date WHERE id = (SELECT u FROM ids);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', u, 'role','authenticated')::text FROM ids), true);
INSERT INTO user_consents(user_id, purpose, granted, doc_version, statement)
  SELECT u, 'ai_programming', true, '2026-11-13', 'test' FROM ids;
INSERT INTO r(k,v) SELECT '02 16 ans : accord courant (false)', granted::text FROM current_consents
  WHERE user_id = (SELECT u FROM ids) AND purpose = 'ai_programming';
-- Un retrait reste un retrait, et l'accord socle n'est pas touché.
INSERT INTO user_consents(user_id, purpose, granted, doc_version, statement)
  SELECT u, 'health_data', true, '2026-11-13', 'test' FROM ids;
INSERT INTO r(k,v) SELECT '03 16 ans : accord socle (true)', granted::text FROM current_consents
  WHERE user_id = (SELECT u FROM ids) AND purpose = 'health_data';
RESET ROLE;

-- 18 ans aujourd'hui : accepté.
UPDATE profiles SET birth_date = (current_date - interval '18 years' - interval '1 day')::date WHERE id = (SELECT u FROM ids);
SET LOCAL ROLE authenticated;
INSERT INTO user_consents(user_id, purpose, granted, doc_version, statement)
  SELECT u, 'ai_programming', true, '2026-11-13', 'test' FROM ids;
INSERT INTO r(k,v) SELECT '04 18 ans : accord courant (true)', granted::text FROM current_consents
  WHERE user_id = (SELECT u FROM ids) AND purpose = 'ai_programming';
RESET ROLE;

-- Date inconnue : inchangé.
UPDATE profiles SET birth_date = NULL WHERE id = (SELECT u FROM ids);
SET LOCAL ROLE authenticated;
INSERT INTO user_consents(user_id, purpose, granted, doc_version, statement)
  SELECT u, 'ai_programming', true, '2026-11-13', 'test' FROM ids;
INSERT INTO r(k,v) SELECT '05 date inconnue : accord courant (true)', granted::text FROM current_consents
  WHERE user_id = (SELECT u FROM ids) AND purpose = 'ai_programming';
RESET ROLE;

SELECT k, v FROM r ORDER BY n;
ROLLBACK;
