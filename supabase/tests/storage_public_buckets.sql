-- Aucun bucket Storage public hors liste blanche (AIPD A2, incident test-media 2026-11-13).
-- Exécuté par la CI sur une base LOCALE et éphémère, jamais contre la prod :
--   - « Tests SQL » : buckets et policies de la prod copiés dans supabase/tests/ci/platform.sql ;
--   - « Rejeu des migrations (R2) » : buckets créés par supabase/migrations/.
-- Toujours annulé (ROLLBACK final) : les fichiers témoins ne restent pas en base.
--
-- Liste blanche : contenus de bibliothèque, sans donnée d'athlète (AIPD §6, A2).
-- Ajouter un bucket ici = le justifier dans docs/juridique/AIPD.md.
--
-- Deux contrôles :
--   1. drapeau `public` (lecture de tout fichier par son URL, sans aucune règle) ;
--   2. règles RLS : un fichier témoin déposé dans chaque bucket ne doit être lisible ni par un
--      anonyme ni par un compte connecté sans lien avec le dossier.
-- Chaque ligne k → v : la valeur attendue est dans le libellé (∅ = aucun bucket fautif).

BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
CREATE TEMP TABLE allow(id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO allow VALUES ('energy-exercise-photos'), ('exercise-images'), ('exercise-pdfs'), ('public-assets');
CREATE TEMP TABLE seen(bucket text, who text, n int) ON COMMIT DROP;
GRANT ALL ON r, seen TO authenticated, anon;
GRANT SELECT ON allow TO authenticated, anon;
GRANT ALL ON SEQUENCE r_n_seq TO authenticated, anon;

INSERT INTO r(k,v) SELECT '00 buckets présents (> 0)', count(*)::text FROM storage.buckets;
INSERT INTO r(k,v)
SELECT '01 buckets publics hors liste blanche (∅)',
       coalesce(string_agg(b.id, ', ' ORDER BY b.id), '∅')
FROM storage.buckets b
WHERE b.public AND b.id NOT IN (SELECT id FROM allow);

-- Un fichier témoin par bucket, dans le dossier d'un utilisateur fictif (UUID : certaines règles
-- convertissent le premier dossier en uuid).
INSERT INTO storage.objects(bucket_id, name)
SELECT id, '00000000-0000-4000-8000-0000000000a1/ci-temoin/fichier.jpg' FROM storage.buckets;

-- Pour chaque bucket et chaque visiteur : nombre de témoins lisibles. Une erreur de droits
-- (fonction réservée aux comptes connectés…) vaut « rien de lisible ».
CREATE TEMP TABLE visitors(who text, claims text) ON COMMIT DROP;
INSERT INTO visitors VALUES
  ('anonyme', '{"role":"anon"}'),
  ('compte sans lien', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}');
GRANT SELECT ON visitors TO authenticated, anon;

DO $$
DECLARE b text; v visitors; c int;
  ids text[] := ARRAY(SELECT id FROM storage.buckets ORDER BY id);
  vs visitors[] := ARRAY(SELECT x FROM visitors x);
BEGIN
  FOREACH v IN ARRAY vs LOOP
    FOREACH b IN ARRAY ids LOOP
      BEGIN
        PERFORM set_config('request.jwt.claims', v.claims, true);
        EXECUTE format('SET LOCAL ROLE %I', CASE WHEN v.who = 'anonyme' THEN 'anon' ELSE 'authenticated' END);
        SELECT count(*) INTO c FROM storage.objects
         WHERE bucket_id = b AND name = '00000000-0000-4000-8000-0000000000a1/ci-temoin/fichier.jpg';
        RESET ROLE;
      EXCEPTION WHEN insufficient_privilege THEN
        c := 0;
      END;
      RESET ROLE;
      INSERT INTO seen VALUES (b, v.who, c);
    END LOOP;
  END LOOP;
END $$;
RESET ROLE;

INSERT INTO r(k,v)
SELECT '02 témoin lisible par un anonyme hors liste blanche (∅)',
       coalesce(string_agg(bucket, ', ' ORDER BY bucket), '∅')
FROM seen WHERE who = 'anonyme' AND n > 0 AND bucket NOT IN (SELECT id FROM allow);
INSERT INTO r(k,v)
SELECT '03 témoin lisible par un compte sans lien hors liste blanche (∅)',
       coalesce(string_agg(bucket, ', ' ORDER BY bucket), '∅')
FROM seen WHERE who = 'compte sans lien' AND n > 0 AND bucket NOT IN (SELECT id FROM allow);
-- Le contrôle sait voir un fichier lisible : energy-exercise-photos (bibliothèque publique,
-- règle energy_photo_select) doit apparaître lisible par un anonyme.
INSERT INTO r(k,v)
SELECT '04 contrôle opérant : energy-exercise-photos lisible par un anonyme (true, ou n/a)',
       coalesce((SELECT (n > 0)::text FROM seen WHERE who = 'anonyme' AND bucket = 'energy-exercise-photos'), 'n/a');

SELECT k, v FROM r ORDER BY n;
ROLLBACK;
