-- Hors HDS (migration 20261114100000) : plus de diagnostic, traitement, « vu par »,
-- antécédents ni documents médicaux. Jeu de test : « Léa Démo » et son coach. Toujours annulé.
BEGIN;
SELECT set_config('hds.athlete', (SELECT id::text FROM public.profiles WHERE full_name = 'Léa Démo' AND role = 'athlete' ORDER BY created_at LIMIT 1), true);
SELECT set_config('hds.coach', (SELECT coach_id::text FROM public.profiles WHERE id::text = current_setting('hds.athlete')), true);
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('hds.athlete'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  a uuid := current_setting('hds.athlete')::uuid;
  r record;
  refused boolean;
BEGIN
  -- 01-02 : l'athlète déclare encore une blessure ; les champs de soins sont vidés, le type forcé.
  INSERT INTO public.medical_entries (athlete_id, kind, title, status, diagnosis, treatment, diagnosed_by, notes, pain_level, created_by, declared_by)
  VALUES (a, 'pathologie', 'HDS test', 'en_cours', 'tendinopathie', 'anti-inflammatoires', 'medecin', 'gêne', 4, a, 'athlete')
  RETURNING * INTO r;
  IF r.kind IS DISTINCT FROM 'blessure' THEN RAISE EXCEPTION '01 type forcé à blessure : %', r.kind; END IF;
  IF r.diagnosis IS NOT NULL OR r.treatment IS NOT NULL OR r.diagnosed_by IS NOT NULL THEN
    RAISE EXCEPTION '02 champs de soins vidés à l''insertion : % / % / %', r.diagnosis, r.treatment, r.diagnosed_by;
  END IF;
  IF r.notes IS DISTINCT FROM 'gêne' OR r.pain_level IS DISTINCT FROM 4 THEN RAISE EXCEPTION '03 champs sportifs gardés : %', r; END IF;

  -- 04 : même chose à la modification.
  UPDATE public.medical_entries SET diagnosis = 'x', treatment = 'y', diagnosed_by = 'kine' WHERE id = r.id RETURNING * INTO r;
  IF r.diagnosis IS NOT NULL OR r.treatment IS NOT NULL OR r.diagnosed_by IS NOT NULL THEN
    RAISE EXCEPTION '04 champs de soins vidés à la modification';
  END IF;

  -- 05 : antécédents refusés.
  refused := false;
  BEGIN
    INSERT INTO public.medical_history (athlete_id, allergies) VALUES (a, 'pollen');
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  IF NOT refused THEN RAISE EXCEPTION '05 medical_history doit refuser l''écriture'; END IF;

  -- 06 : pièces jointes refusées.
  refused := false;
  BEGIN
    INSERT INTO public.medical_attachments (entry_id, athlete_id, file_path, mime_type) VALUES (r.id, a, a || '/x.pdf', 'application/pdf');
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  IF NOT refused THEN RAISE EXCEPTION '06 medical_attachments doit refuser l''écriture'; END IF;

  -- 07 : plus aucune policy d'envoi sur le bucket medical.
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
             AND cmd IN ('INSERT', 'UPDATE', 'ALL')
             AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%''medical''%') THEN
    RAISE EXCEPTION '07 une policy permet encore d''envoyer dans le bucket medical';
  END IF;

  -- 08 : la suppression d'une blessure reste possible.
  DELETE FROM public.medical_entries WHERE id = r.id;
  IF FOUND IS FALSE THEN RAISE EXCEPTION '08 suppression de la blessure'; END IF;

  RAISE NOTICE 'hds_retrait_soins : 8 / 8';
END $$;
ROLLBACK;
