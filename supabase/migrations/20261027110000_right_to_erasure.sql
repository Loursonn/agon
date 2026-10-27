-- Rendre le droit à l'effacement (art. 17 RGPD) techniquement réalisable.
--
-- État constaté avant cette migration, par audit des contraintes :
--
-- 1. `public.profiles` n'avait AUCUNE clé étrangère vers `auth.users`.
--    Conséquence : `auth.admin.deleteUser()` supprimait le compte
--    d'authentification mais laissait la ligne `profiles` et les ~45 tables
--    qui en dépendent intactes. L'utilisateur ne pouvait plus se connecter,
--    mais ses données de santé restaient en base — et restaient visibles de
--    son coach. Une suppression de compte qui ne supprime rien.
--
-- 2. Quatre contraintes bloquaient la suppression d'une ligne `profiles` :
--      cycles.coach_id          ON DELETE RESTRICT
--      macrocycles.coach_id     ON DELETE RESTRICT
--      roadmap_items.created_by ON DELETE NO ACTION
--      roadmap_phases.created_by ON DELETE NO ACTION
--    Un coach ayant programmé pour au moins un athlète ne pouvait donc tout
--    simplement pas être supprimé : Postgres refusait l'opération.
--
-- Correction retenue : SET NULL plutôt que CASCADE sur ces quatre liens. Un
-- coach qui s'en va ne doit pas emporter le plan d'entraînement de ses
-- athlètes — ces données appartiennent à l'athlète, qui ne demande rien. On
-- casse le lien, on ne détruit pas le contenu.

-- ---------------------------------------------------------------------------
-- 1. Lien racine profiles → auth.users
--
-- Vérifié avant application : 0 ligne de `profiles` sans utilisateur auth
-- correspondant, donc l'ajout de la contrainte ne peut pas échouer sur des
-- données existantes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

COMMENT ON CONSTRAINT profiles_id_fkey ON public.profiles IS
  'Supprimer l''utilisateur auth efface le profil, et en cascade toutes ses données applicatives. Sans cette contrainte le droit à l''effacement était inopérant.';

-- ---------------------------------------------------------------------------
-- 2. Lever les quatre verrous
-- ---------------------------------------------------------------------------

-- macrocycles.coach_id était NOT NULL : SET NULL exige de le rendre nullable.
-- Un macrocycle sans coach reste parfaitement exploitable par l'athlète.
ALTER TABLE public.macrocycles
  ALTER COLUMN coach_id DROP NOT NULL;

ALTER TABLE public.macrocycles
  DROP CONSTRAINT IF EXISTS macrocycles_coach_id_fkey;
ALTER TABLE public.macrocycles
  ADD CONSTRAINT macrocycles_coach_id_fkey
  FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.cycles
  DROP CONSTRAINT IF EXISTS cycles_coach_id_fkey;
ALTER TABLE public.cycles
  ADD CONSTRAINT cycles_coach_id_fkey
  FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.roadmap_items
  DROP CONSTRAINT IF EXISTS roadmap_items_created_by_fkey;
ALTER TABLE public.roadmap_items
  ADD CONSTRAINT roadmap_items_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.roadmap_phases
  DROP CONSTRAINT IF EXISTS roadmap_phases_created_by_fkey;
ALTER TABLE public.roadmap_phases
  ADD CONSTRAINT roadmap_phases_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3. Inventaire des fichiers à purger.
--
-- Le stockage n'est pas couvert par les cascades SQL : les objets vivent dans
-- `storage.objects`, qui ne référence pas `profiles`. Une suppression de compte
-- doit donc les retirer explicitement, sinon des pièces jointes médicales
-- survivent au compte — exactement ce que l'art. 17 interdit.
--
-- Cette fonction liste les chemins à supprimer. L'Edge Function
-- `delete-account` l'appelle puis retire les objets via l'API Storage, qui est
-- la seule voie supportée (supprimer la ligne `storage.objects` à la main
-- laisserait le fichier sur le bucket).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_user_storage_objects(target_user uuid)
RETURNS TABLE (bucket_id text, object_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
STABLE
AS $$
  -- Pièces jointes médicales et fichiers de test : chemin préfixé par l'uuid
  -- de l'athlète, convention en place dans l'application.
  SELECT o.bucket_id, o.name
  FROM storage.objects o
  WHERE o.bucket_id IN ('medical', 'test-files', 'garmin-screenshots', 'test-media', 'avatars')
    AND (
      o.name LIKE target_user::text || '/%'
      OR o.owner = target_user
    );
$$;

COMMENT ON FUNCTION public.list_user_storage_objects(uuid) IS
  'Chemins des fichiers appartenant à un utilisateur, pour purge lors de la suppression de compte. SECURITY DEFINER : storage.objects n''est pas lisible directement par le rôle authenticated.';

-- Réservé au service_role : appelé par l'Edge Function de suppression, jamais
-- par le client.
REVOKE ALL ON FUNCTION public.list_user_storage_objects(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_user_storage_objects(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.list_user_storage_objects(uuid) TO service_role;
