/*
  Bucket `test-media` : faille S6 (audit 2026-11), partie 1 sur 2.

  Le bucket est public depuis 20260825000000 : n'importe qui connaissant
  l'adresse d'un fichier peut le lire, sans compte. Il contient les photos du
  corps des mensurations (`<athlete>/mensurations/…`) et les illustrations des
  séances énergie (`<coach>/sessions/…`).

  Partie 1 (compatible avec le client de `main`, applicable tout de suite) :
    1. Règles d'accès propres : lecture = propriétaire du dossier ou son coach
       (`is_coach_of_folder` : référent ou co-coach) ; écriture (ajout,
       remplacement, suppression) = propriétaire ou son coach. Pas de staff :
       la table des mensurations n'a pas de règle staff.
    2. Les illustrations des séances énergie, qui ne sont pas des données
       personnelles, passent dans le bucket public `energy-exercise-photos`.
       Les fichiers y sont copiés AVANT cette migration (Storage, hors SQL :
       voir docs/DECISIONS.md 2026-11-13) ; ici on réécrit seulement les liens
       enregistrés dans `energy_sessions.images` dont la copie existe. Un lien
       sans copie reste tel quel (rien ne casse).

  Partie 2 (20261113190100) : `public = false`.

  Test à blanc : supabase/tests/test_media_storage.sql.
*/

BEGIN;

-- 1. Règles d'accès ----------------------------------------------------------

-- Doublons de `athlete_read_test_media` (la seconde ouverte au rôle public).
DROP POLICY IF EXISTS coach_read_athlete_test_media ON storage.objects;
DROP POLICY IF EXISTS coach_read_test_media ON storage.objects;

-- Lecture : propriétaire ou son coach (inchangée, recréée pour être explicite).
DROP POLICY IF EXISTS athlete_read_test_media ON storage.objects;
CREATE POLICY athlete_read_test_media ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'test-media'
    AND ((storage.foldername(name))[1] = (auth.uid())::text
         OR public.is_coach_of_folder((storage.foldername(name))[1]))
  );

-- Le coach peut déposer des photos dans le dossier de son athlète.
DROP POLICY IF EXISTS coach_upload_athlete_test_media ON storage.objects;
CREATE POLICY coach_upload_athlete_test_media ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'test-media'
    AND public.is_coach_of_folder((storage.foldername(name))[1])
  );

-- Remplacement (upload avec `upsert`) : propriétaire ou son coach.
DROP POLICY IF EXISTS owner_update_test_media ON storage.objects;
CREATE POLICY owner_update_test_media ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'test-media'
    AND ((storage.foldername(name))[1] = (auth.uid())::text
         OR public.is_coach_of_folder((storage.foldername(name))[1]))
  )
  WITH CHECK (
    bucket_id = 'test-media'
    AND ((storage.foldername(name))[1] = (auth.uid())::text
         OR public.is_coach_of_folder((storage.foldername(name))[1]))
  );

-- Suppression : propriétaire (existante) ou son coach.
DROP POLICY IF EXISTS coach_delete_athlete_test_media ON storage.objects;
CREATE POLICY coach_delete_athlete_test_media ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'test-media'
    AND public.is_coach_of_folder((storage.foldername(name))[1])
  );

-- 2. Liens des illustrations de séances -------------------------------------

UPDATE public.energy_sessions e
   SET images = (
     SELECT jsonb_agg(
              CASE
                WHEN x->>'url' LIKE '%/storage/v1/object/public/test-media/%'
                 AND EXISTS (
                   SELECT 1 FROM storage.objects o
                    WHERE o.bucket_id = 'energy-exercise-photos'
                      AND o.name = split_part(x->>'url', '/storage/v1/object/public/test-media/', 2)
                 )
                THEN jsonb_set(x, '{url}', to_jsonb(replace(
                       x->>'url',
                       '/storage/v1/object/public/test-media/',
                       '/storage/v1/object/public/energy-exercise-photos/')))
                ELSE x
              END
              ORDER BY t.ord)
       FROM jsonb_array_elements(e.images) WITH ORDINALITY AS t(x, ord)
   )
 WHERE jsonb_typeof(e.images) = 'array'
   AND e.images::text LIKE '%/storage/v1/object/public/test-media/%';

COMMIT;
