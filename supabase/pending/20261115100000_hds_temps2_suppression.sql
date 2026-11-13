-- HDS, temps 2 : suppression de ce qui relevait des soins (décision d'Hugo du
-- 2026-11-13, docs/DECISIONS.md « Agon sort du champ HDS », revue juridique
-- docs/juridique/REVUE_2026-11.md §2 C1). Tâche roadmap P44.
--
-- Le temps 1 (20261114100000_hds_retrait_soins.sql) a vidé ces champs et
-- refusé toute écriture. Ici on supprime :
--   - medical_entries.diagnosis, treatment, diagnosed_by (et leurs contraintes) ;
--   - les tables medical_history et medical_attachments ;
--   - le bucket Storage `medical` et ses policies.
--
-- CONDITION : `main` (le client en production) ne doit plus écrire ces champs,
-- c'est-à-dire PR dev → main du 13/11 (#150) mergée ET déployée par Vercel.
-- Le client de l'ancien `main` envoie encore `diagnosis` : après ce fichier,
-- son enregistrement de blessure échouerait (colonne inconnue).
--
-- Garde-fous : la migration s'arrête (rien n'est supprimé) si une ligne ou un
-- fichier subsiste. Prod au 2026-11-13 : 0 ligne, 0 fichier, 0 champ rempli.

-- ── 0. Rien à perdre ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.medical_entries
              WHERE diagnosis IS NOT NULL OR treatment IS NOT NULL OR diagnosed_by IS NOT NULL) THEN
    RAISE EXCEPTION 'HDS temps 2 : des champs de soins sont encore remplis, rien supprimé';
  END IF;
  IF to_regclass('public.medical_history') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.medical_history) THEN
    RAISE EXCEPTION 'HDS temps 2 : medical_history n''est pas vide, rien supprimé';
  END IF;
  IF to_regclass('public.medical_attachments') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.medical_attachments) THEN
    RAISE EXCEPTION 'HDS temps 2 : medical_attachments n''est pas vide, rien supprimé';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'medical') THEN
    RAISE EXCEPTION 'HDS temps 2 : le bucket medical contient des fichiers, rien supprimé';
  END IF;
END $$;

-- ── 1. medical_entries : plus de colonnes de soins ──────────────────────────
-- Le trigger du temps 1 écrit dans ces colonnes : il est remplacé par une
-- version qui ne garde que « toute entrée est une blessure ».
CREATE OR REPLACE FUNCTION public.medical_entries_sans_soins()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.kind := 'blessure';
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.medical_entries_sans_soins() IS
  'Hors HDS (2026-11-13) : toute entrée est une blessure sportive. Diagnostic, traitement et « vu par » supprimés au temps 2.';

ALTER TABLE public.medical_entries DROP CONSTRAINT IF EXISTS medical_entries_sans_soins_check;
ALTER TABLE public.medical_entries DROP CONSTRAINT IF EXISTS medical_entries_diagnosed_by_check;
ALTER TABLE public.medical_entries
  DROP COLUMN IF EXISTS diagnosis,
  DROP COLUMN IF EXISTS treatment,
  DROP COLUMN IF EXISTS diagnosed_by;

-- ── 2. Bucket `medical` : policies, puis le bucket (vide) ───────────────────
-- staff_medical_storage_delete lit medical_attachments : à retirer avant la table.
DROP POLICY IF EXISTS medical_storage_read ON storage.objects;
DROP POLICY IF EXISTS medical_storage_delete ON storage.objects;
DROP POLICY IF EXISTS medical_storage_all ON storage.objects;
DROP POLICY IF EXISTS staff_medical_storage_select ON storage.objects;
DROP POLICY IF EXISTS staff_medical_storage_delete ON storage.objects;
DROP POLICY IF EXISTS staff_medical_storage_insert ON storage.objects;

-- Supabase refuse par défaut toute suppression directe dans storage.* (trigger
-- storage.protect_delete) ; le bucket est vide (vérifié au §0), on l'autorise
-- le temps de cette instruction seulement (bloc DO : une seule transaction,
-- que la migration passe par psql ou par `supabase db query`).
DO $$
BEGIN
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.buckets WHERE id = 'medical';
  PERFORM set_config('storage.allow_delete_query', 'false', true);
END $$;

-- ── 3. Tables d'antécédents et de documents médicaux ────────────────────────
-- Policies, index, trigger et clés étrangères partent avec les tables.
DROP TABLE IF EXISTS public.medical_attachments;
DROP TABLE IF EXISTS public.medical_history;

-- ── 4. Liste des fichiers d'un utilisateur : sans le bucket `medical` ───────
-- Même corps que la version en prod, moins 'medical' (purge à la suppression
-- de compte, `_shared/userStorage.ts`).
CREATE OR REPLACE FUNCTION public.list_user_storage_objects(target_user uuid)
RETURNS TABLE(bucket_id text, object_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $$
  -- Fichiers de test, captures, photos, données brutes des montres :
  -- chemin préfixé par l'uuid de l'athlète, convention en place dans l'application.
  SELECT o.bucket_id, o.name
  FROM storage.objects o
  WHERE o.bucket_id IN ('test-files', 'garmin-screenshots', 'test-media', 'avatars', 'provider-raw')
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
