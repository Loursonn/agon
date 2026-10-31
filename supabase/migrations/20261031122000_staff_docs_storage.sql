/*
  Staff — fichiers des fiches (bucket `docs`).

  Les fiches créées par un pro vont dans la banque du coach principal (spec
  §1). Le chemin d'un fichier suit donc le dossier du coach :
    <coach_id>/banque/<doc>.<ext>                       fiche de banque
    <coach_id>/athletes/<athlete_id>/<doc>.<ext>        fiche personnelle
    <coach_id>/athletes/<athlete_id>/comments/<id>.webp image de commentaire

  Les policies existantes n'autorisent l'écriture que dans son propre dossier :
  un pro ne pourrait pas déposer dans celui du coach, et si on le laissait
  déposer dans le sien, le coach ne pourrait plus supprimer le fichier. On
  ajoute donc deux policies `staff_*` (permissives, en OR avec l'existant).
*/

BEGIN;

-- Le pro peut-il écrire à ce chemin ? Casts protégés (CASE évalue dans l'ordre).
CREATE OR REPLACE FUNCTION public.staff_can_write_docs_path(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH f AS (
    SELECT (storage.foldername(p_name))[1] AS f1,
           (storage.foldername(p_name))[2] AS f2,
           (storage.foldername(p_name))[3] AS f3,
           (storage.foldername(p_name))[4] AS f4
  )
  SELECT CASE
    WHEN f1 !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN false
    WHEN f2 = 'banque' THEN public.staff_can_write_bank(f1::uuid)
    WHEN f2 = 'athletes'
         AND f3 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = f3::uuid AND p.coach_id = f1::uuid)
      AND (
        public.staff_can(f3::uuid, 'fiches', 'write')
        OR (f4 = 'comments' AND public.staff_can(f3::uuid, 'commentaires', 'write'))
      )
    ELSE false
  END
  FROM f;
$$;

DROP POLICY IF EXISTS staff_docs_storage_insert ON storage.objects;
CREATE POLICY staff_docs_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'docs' AND public.staff_can_write_docs_path(name));

-- Suppression : fichier d'une fiche que le pro peut modifier, image de son
-- propre commentaire, ou objet orphelin qu'il vient de déposer (échec d'insert).
DROP POLICY IF EXISTS staff_docs_storage_delete ON storage.objects;
CREATE POLICY staff_docs_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'docs'
    AND (
      EXISTS (SELECT 1 FROM public.docs d
               WHERE d.file_path = objects.name AND public.staff_can_edit_doc(d.id))
      OR EXISTS (SELECT 1 FROM public.doc_comments c
                  WHERE c.image_path = objects.name AND c.author_id = auth.uid())
      OR (
        owner_id = (auth.uid())::text
        AND NOT EXISTS (SELECT 1 FROM public.docs d WHERE d.file_path = objects.name)
        AND NOT EXISTS (SELECT 1 FROM public.doc_comments c WHERE c.image_path = objects.name)
        AND public.staff_can_write_docs_path(name)
      )
    )
  );

COMMIT;
