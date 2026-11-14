-- Suppression de compte : les illustrations de séances du coach (`energy-exercise-photos/<coach>/…`)
-- ne survivaient pas seulement à leur auteur, elles n'étaient jamais listées pour la purge.
--
-- Règle : on efface les images du dossier de l'utilisateur, SAUF celles encore utilisées par une
-- séance qui survit au compte. `energy_sessions.created_by` passe à NULL quand le coach part
-- (séances de la bibliothèque, séances assignées à des athlètes d'un autre coach) : effacer leur
-- image casserait ces séances. Une séance propre à l'athlète supprimé (`athlete_id`) part avec lui,
-- donc son image aussi.
--
-- Va avec `USER_BUCKETS` (supabase/functions/_shared/userStorage.ts), à redéployer dans
-- `delete-account` et `pending-athlete`.
-- Rollback : rejouer la définition précédente (supabase/tests/ci/schema.sql avant ce fichier).

CREATE OR REPLACE FUNCTION public.list_user_storage_objects(target_user uuid)
RETURNS TABLE(bucket_id text, object_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $$
  -- Pièces jointes médicales, fichiers de test, données brutes des montres :
  -- chemin préfixé par l'uuid de l'athlète, convention en place dans l'application.
  SELECT o.bucket_id, o.name
  FROM storage.objects o
  WHERE o.bucket_id IN ('medical', 'test-files', 'garmin-screenshots', 'test-media', 'avatars', 'provider-raw')
    AND (
      o.name LIKE target_user::text || '/%'
      OR o.owner = target_user
    )
  UNION
  SELECT o.bucket_id, o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'docs'
    AND (
      o.name LIKE target_user::text || '/%'
      OR o.name LIKE '%/athletes/' || target_user::text || '/%'
      OR o.name IN (SELECT c.image_path FROM public.doc_comments c
                     WHERE c.author_id = target_user AND c.image_path IS NOT NULL)
    )
  UNION
  -- Illustrations de séances : seulement celles qu'aucune séance survivante n'utilise.
  SELECT o.bucket_id, o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'energy-exercise-photos'
    AND (o.name LIKE target_user::text || '/%' OR o.owner = target_user)
    AND NOT EXISTS (
      SELECT 1 FROM public.energy_sessions s
       WHERE s.athlete_id IS DISTINCT FROM target_user
         AND jsonb_typeof(s.images) = 'array'
         AND strpos(s.images::text, '/energy-exercise-photos/' || o.name) > 0
    );
$$;

REVOKE ALL ON FUNCTION public.list_user_storage_objects(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_user_storage_objects(uuid) TO service_role;
