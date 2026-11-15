-- Test à blanc : catégorie de fiche « test » et marqueur created_via (migration 20261116143000).
-- À lancer sur la base de TEST : supabase db query --linked -f supabase/tests/fiches_test_created_via.sql
-- Tout se passe dans une transaction annulée.
BEGIN;
ALTER TABLE public.docs DROP CONSTRAINT IF EXISTS docs_category_check;
ALTER TABLE public.docs ADD CONSTRAINT docs_category_check CHECK (
  category = ANY (ARRAY['mobilite', 'pacing', 'prevention', 'recuperation', 'nutrition', 'education', 'test', 'questionnaire', 'autre'])
);

ALTER TABLE public.docs ADD COLUMN IF NOT EXISTS created_via text;
ALTER TABLE public.docs DROP CONSTRAINT IF EXISTS docs_created_via_check;
ALTER TABLE public.docs ADD CONSTRAINT docs_created_via_check CHECK (created_via IS NULL OR created_via = 'api');

COMMENT ON COLUMN public.docs.created_via IS 'api : fiche déposée par l''assistant IA du coach (coach-api POST /fiches), qu''il peut retirer (DELETE /fiches/:id). NULL : créée dans l''app.';

UPDATE public.docs SET created_via = 'api' WHERE created_via IS NULL AND 'claude' = ANY (tags);

DO $$
DECLARE
  coach uuid;
  other uuid;
  fid uuid := gen_random_uuid();
  cid uuid := gen_random_uuid();
  n int;
BEGIN
  SELECT id INTO coach FROM profiles WHERE full_name = 'Agon Démo' AND role IN ('coach', 'coach_athlete') ORDER BY id LIMIT 1;
  IF coach IS NULL THEN RAISE EXCEPTION 'coach Agon Démo absent (seed démo manquant)'; END IF;
  SELECT id INTO other FROM profiles WHERE role IN ('coach', 'coach_athlete') AND id <> coach AND COALESCE(is_admin, false) = false ORDER BY id LIMIT 1;

  -- 1. Le coach range une fiche de banque dans « test » depuis l'app (created_via NULL).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO docs (id, coach_id, athlete_id, uploaded_by, title, category, kind, file_path)
    VALUES (fid, coach, NULL, coach, 'Protocole CMJ', 'test', 'pdf', coach::text || '/banque/' || fid::text || '.pdf');
  SELECT count(*) INTO n FROM docs WHERE id = fid AND category = 'test' AND created_via IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'fiche « test » non lisible par son coach'; END IF;

  -- 2. Il la reclasse (UPDATE de catégorie, comme dans le panneau de la fiche).
  UPDATE docs SET category = 'mobilite' WHERE id = fid;
  UPDATE docs SET category = 'test' WHERE id = fid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'reclassement en « test » refusé'; END IF;

  -- 3. Un autre coach ne la voit pas.
  IF other IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO n FROM docs WHERE id = fid;
    IF n <> 0 THEN RAISE EXCEPTION 'un autre coach voit la fiche « test »'; END IF;
  END IF;
  RESET ROLE;

  -- 4. Catégorie inconnue et created_via inconnu refusés.
  BEGIN
    UPDATE docs SET category = 'bidon' WHERE id = fid;
    RAISE EXCEPTION 'catégorie inconnue acceptée à tort';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE docs SET created_via = 'app' WHERE id = fid;
    RAISE EXCEPTION 'created_via inconnu accepté à tort';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 5. Une fiche étiquetée « claude » (d'avant le marqueur) est marquée 'api' par le rattrapage.
  INSERT INTO docs (id, coach_id, athlete_id, uploaded_by, title, category, tags, kind, file_path)
    VALUES (cid, coach, NULL, coach, 'Fiche assistant', 'autre', ARRAY['claude'], 'pdf', coach::text || '/banque/' || cid::text || '.pdf');
  UPDATE docs SET created_via = 'api' WHERE created_via IS NULL AND 'claude' = ANY (tags);
  SELECT count(*) INTO n FROM docs WHERE id = cid AND created_via = 'api';
  IF n <> 1 THEN RAISE EXCEPTION 'rattrapage created_via non appliqué'; END IF;
  SELECT count(*) INTO n FROM docs WHERE id = fid AND created_via IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'une fiche du coach a été marquée api à tort'; END IF;

  RAISE NOTICE 'fiches_test_created_via : 5 / 5';
END $$;
ROLLBACK;
