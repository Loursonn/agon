-- Accord IA sans effet sans date de naissance connue (migration 20261114120000, revue juridique C2).
-- Toujours annulé (ROLLBACK final) : rien ne reste en base.
-- Chaque ligne k → v : la valeur attendue est dans le libellé. Aucune donnée personnelle
-- n'est affichée (booléens et comptes seulement).
BEGIN;

CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;

INSERT INTO r(k,v) SELECT '01 accord IA courant sans date de naissance (0)', count(*)::text
  FROM current_consents c JOIN profiles p ON p.id = c.user_id
  WHERE c.purpose = 'ai_programming' AND c.granted AND p.birth_date IS NULL;
INSERT INTO r(k,v) SELECT '02 accord IA courant avant 18 ans (0)', count(*)::text
  FROM current_consents c JOIN profiles p ON p.id = c.user_id
  WHERE c.purpose = 'ai_programming' AND c.granted AND p.birth_date > current_date - interval '18 years';
-- Les autres finalités ne bougent pas : même nombre de « oui » que dans le journal brut.
INSERT INTO r(k,v) SELECT '03 accords santé courants identiques au journal (true)', (
  (SELECT count(*) FROM current_consents WHERE purpose = 'health_data' AND granted) =
  (SELECT count(*) FROM (SELECT DISTINCT ON (user_id, purpose) granted FROM user_consents
                          WHERE purpose = 'health_data' ORDER BY user_id, purpose, seq DESC) x WHERE granted))::text;

CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT id AS u, coach_id AS c FROM profiles
 WHERE role IN ('athlete','coach_athlete') AND coach_id IS NOT NULL AND coach_id <> id
 ORDER BY created_at LIMIT 1;
GRANT SELECT ON ids TO authenticated;

-- Majeur avec accord : vrai ; date effacée : faux (journal intact), lu par l'athlète et par son coach.
UPDATE profiles SET birth_date = '1990-01-01' WHERE id = (SELECT u FROM ids);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', u, 'role','authenticated')::text FROM ids), true);
INSERT INTO user_consents(user_id, purpose, granted, doc_version, statement)
  SELECT u, 'ai_programming', true, '2026-11-13', 'test' FROM ids;
INSERT INTO r(k,v) SELECT '04 majeur : accord IA courant (true)', granted::text
  FROM current_consents WHERE user_id = (SELECT u FROM ids) AND purpose = 'ai_programming';
RESET ROLE;
UPDATE profiles SET birth_date = NULL WHERE id = (SELECT u FROM ids);
SET LOCAL ROLE authenticated;
INSERT INTO r(k,v) SELECT '05 date effacée : accord IA courant lu par l''athlète (false)', granted::text
  FROM current_consents WHERE user_id = (SELECT u FROM ids) AND purpose = 'ai_programming';
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', c, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT '06 date effacée : accord IA courant lu par le coach (false, ou invisible)', coalesce(
  (SELECT granted::text FROM current_consents WHERE user_id = (SELECT u FROM ids) AND purpose = 'ai_programming'), 'invisible');
RESET ROLE;
INSERT INTO r(k,v) SELECT '07 journal : dernière décision brute toujours oui (true)', granted::text
  FROM user_consents WHERE user_id = (SELECT u FROM ids) AND purpose = 'ai_programming' ORDER BY seq DESC LIMIT 1;

-- Nouvel accord sans date : enregistré en refus.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', u, 'role','authenticated')::text FROM ids), true);
INSERT INTO user_consents(user_id, purpose, granted, doc_version, statement)
  SELECT u, 'ai_programming', true, '2026-11-13', 'test' FROM ids;
RESET ROLE;
INSERT INTO r(k,v) SELECT '08 accord donné sans date : enregistré en refus (false)', granted::text
  FROM user_consents WHERE user_id = (SELECT u FROM ids) AND purpose = 'ai_programming' ORDER BY seq DESC LIMIT 1;

-- Ancien oui donné quand la date était connue, puis date absente (cas des anciens comptes) ;
-- saisie à 30 ans par set_my_birth_date : l'IA revient sans nouvel accord.
UPDATE profiles SET birth_date = '1990-01-01' WHERE id = (SELECT u FROM ids);
INSERT INTO user_consents(user_id, purpose, granted, doc_version, statement)
  SELECT u, 'ai_programming', true, '2026-11-13', 'ancien oui' FROM ids;
UPDATE profiles SET birth_date = NULL WHERE id = (SELECT u FROM ids);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', u, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT '09 avant saisie : accord IA courant (false)', granted::text
  FROM current_consents WHERE user_id = (SELECT u FROM ids) AND purpose = 'ai_programming';
SELECT set_my_birth_date((current_date - interval '30 years')::date);
INSERT INTO r(k,v) SELECT '10 après saisie (30 ans) : accord IA courant (true)', granted::text
  FROM current_consents WHERE user_id = (SELECT u FROM ids) AND purpose = 'ai_programming';
RESET ROLE;

SELECT k, v FROM r ORDER BY n;
ROLLBACK;
