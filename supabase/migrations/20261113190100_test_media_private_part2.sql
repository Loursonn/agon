/*
  Bucket `test-media` : faille S6, partie 2 sur 2 — le bucket devient privé.

  Après : un fichier ne se lit plus que par URL signée de courte durée
  (`createSignedUrl(s)`, src/api/profile.ts), soumise aux règles de lecture
  de la partie 1 (propriétaire ou son coach). Un anonyme n'a plus rien.

  Pré-requis : partie 1 appliquée et illustrations de séances copiées. Le
  client de `main` lit déjà les photos du corps par URL signée ; seul l'envoi
  d'une NOUVELLE illustration de séance par le client de `main` donnerait un
  lien cassé jusqu'au déploiement de `dev` (qui envoie dans
  `energy-exercise-photos`). Les liens de séances encore en `test-media`
  sont listés par la requête de contrôle en fin de fichier.
*/

BEGIN;

UPDATE storage.buckets SET public = false WHERE id = 'test-media';

COMMIT;

-- Contrôle (lecture) : doit renvoyer public = false, et 0 lien de séance resté en test-media.
-- SELECT id, public FROM storage.buckets WHERE id = 'test-media';
-- SELECT count(*) FROM public.energy_sessions WHERE images::text LIKE '%/object/public/test-media/%';
