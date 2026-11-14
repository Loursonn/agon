-- Hors HDS, temps 1 (20261114100000) et temps 2 (20261115100000) : plus de diagnostic,
-- traitement, « vu par », antécédents ni documents médicaux, ni dans les données ni
-- dans le schéma. Jeu de test : « Léa Démo » et son coach. Toujours annulé.
-- Remplace supabase/tests/hds_retrait_soins.sql quand le temps 2 est appliqué.
BEGIN;
SELECT set_config('hds.athlete', (SELECT id::text FROM public.profiles WHERE full_name = 'Léa Démo' AND role = 'athlete' ORDER BY created_at LIMIT 1), true);

DO $$
BEGIN
  -- 01-03 : schéma sans soins.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'medical_entries'
                AND column_name IN ('diagnosis', 'treatment', 'diagnosed_by')) THEN
    RAISE EXCEPTION '01 colonnes de soins encore présentes';
  END IF;
  IF to_regclass('public.medical_history') IS NOT NULL OR to_regclass('public.medical_attachments') IS NOT NULL THEN
    RAISE EXCEPTION '02 tables d''antécédents ou de documents médicaux encore présentes';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'medical') THEN
    RAISE EXCEPTION '03 bucket medical encore présent';
  END IF;
  -- 04 : plus aucune policy Storage sur le bucket medical.
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
             AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%bucket_id = ''medical''%') THEN
    RAISE EXCEPTION '04 une policy Storage vise encore le bucket medical';
  END IF;
  -- 05 : la purge des fichiers d'un compte ne vise plus ce bucket.
  IF pg_get_functiondef('public.list_user_storage_objects(uuid)'::regprocedure) LIKE '%''medical''%' THEN
    RAISE EXCEPTION '05 list_user_storage_objects cite encore le bucket medical';
  END IF;
END $$;

SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('hds.athlete'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  a uuid := current_setting('hds.athlete')::uuid;
  r record;
BEGIN
  -- 06-07 : l'athlète déclare toujours une blessure, type forcé, champs sportifs gardés.
  INSERT INTO public.medical_entries (athlete_id, kind, title, status, notes, pain_level, created_by, declared_by)
  VALUES (a, 'pathologie', 'HDS test', 'en_cours', 'gêne', 4, a, 'athlete')
  RETURNING * INTO r;
  IF r.kind IS DISTINCT FROM 'blessure' THEN RAISE EXCEPTION '06 type forcé à blessure : %', r.kind; END IF;
  IF r.notes IS DISTINCT FROM 'gêne' OR r.pain_level IS DISTINCT FROM 4 THEN RAISE EXCEPTION '07 champs sportifs gardés'; END IF;

  -- 08 : modification.
  UPDATE public.medical_entries SET pain_level = 2 WHERE id = r.id RETURNING * INTO r;
  IF r.pain_level IS DISTINCT FROM 2 THEN RAISE EXCEPTION '08 modification de la blessure'; END IF;

  -- 09 : suppression.
  DELETE FROM public.medical_entries WHERE id = r.id;
  IF FOUND IS FALSE THEN RAISE EXCEPTION '09 suppression de la blessure'; END IF;

  RAISE NOTICE 'hds_retrait_soins (temps 2) : 9 / 9';
END $$;
ROLLBACK;
