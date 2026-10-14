-- Tests RLS du module Fiches (docs, doc_assignments, doc_comments, storage 'docs').
-- Sans effet de bord : tout s'exécute dans un bloc DO qui se termine par
-- RAISE EXCEPTION 'RESULTS …' → la transaction est toujours annulée.
-- Lancer : supabase db query --linked -f supabase/tests/fiches_rls.sql
-- Lire le message d'erreur : « RESULTS ok=N ko=M | détails des KO ».
-- 2026-10-14

DO $$
DECLARE
  ca uuid := gen_random_uuid();  -- coach A
  cb uuid := gen_random_uuid();  -- coach B
  a1 uuid := gen_random_uuid();  -- athlète 1 de A
  a2 uuid := gen_random_uuid();  -- athlète 2 de A
  b1 uuid := gen_random_uuid();  -- athlète de B
  d_origin uuid := gen_random_uuid();
  d_variant uuid := gen_random_uuid();
  d_perso uuid := gen_random_uuid();
  d_self uuid := gen_random_uuid();
  d_upload uuid := gen_random_uuid();
  ok int := 0;
  ko int := 0;
  fails text := '';
  n int;
  b boolean;
  seen1 timestamptz;
  seen2 timestamptz;

BEGIN
  -- ── Setup (superuser) ─────────────────────────────────────────────────────
  INSERT INTO auth.users (id, email) VALUES
    (ca, 'fiches-test-ca@example.invalid'), (cb, 'fiches-test-cb@example.invalid'),
    (a1, 'fiches-test-a1@example.invalid'), (a2, 'fiches-test-a2@example.invalid'),
    (b1, 'fiches-test-b1@example.invalid');
  INSERT INTO public.profiles (id, role, full_name, coach_id) VALUES
    (ca, 'coach', 'T Coach A', NULL), (cb, 'coach', 'T Coach B', NULL)
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, coach_id = EXCLUDED.coach_id;
  INSERT INTO public.profiles (id, role, full_name, coach_id) VALUES
    (a1, 'athlete', 'T A1', ca), (a2, 'athlete', 'T A2', ca), (b1, 'athlete', 'T B1', cb)
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, coach_id = EXCLUDED.coach_id;

  -- ── Coach A crée ses fiches (policies coach) ──────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ca, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.docs (id, coach_id, uploaded_by, title, category, file_path)
    VALUES (d_origin, ca, ca, 'Mobilité hanches', 'mobilite', ca || '/banque/' || d_origin || '.pdf');
  INSERT INTO public.docs (id, coach_id, uploaded_by, origin_id, variant_label, title, category, file_path)
    VALUES (d_variant, ca, ca, d_origin, 'V2', 'Mobilité hanches', 'mobilite', ca || '/banque/' || d_variant || '.pdf');
  INSERT INTO public.docs (id, coach_id, athlete_id, uploaded_by, title, category, file_path)
    VALUES (d_perso, ca, a1, ca, 'Pacing A1', 'pacing', ca || '/athletes/' || a1 || '/' || d_perso || '.pdf');
  INSERT INTO public.docs (id, coach_id, uploaded_by, title, category, file_path, is_self_service)
    VALUES (d_self, ca, ca, 'Nutrition', 'nutrition', ca || '/banque/' || d_self || '.pdf', true);
  INSERT INTO storage.objects (bucket_id, name) VALUES
    ('docs', ca || '/banque/' || d_origin || '.pdf'),
    ('docs', ca || '/banque/' || d_variant || '.pdf'),
    ('docs', ca || '/athletes/' || a1 || '/' || d_perso || '.pdf'),
    ('docs', ca || '/banque/' || d_self || '.pdf');

  -- Sync programme : a1 = origine + V2 + perso ; a2 = origine + perso de a1 (doit être ignorée)
  PERFORM public.sync_doc_assignments(a1, 'programme', ARRAY[d_origin, d_variant, d_perso]);
  PERFORM public.sync_doc_assignments(a2, 'programme', ARRAY[d_origin, d_perso]);
  INSERT INTO public.doc_assignments (doc_id, athlete_id, assigned_by, source) VALUES (d_perso, a1, ca, 'manuel');

  SELECT count(*) INTO n FROM public.doc_assignments WHERE athlete_id = a2 AND doc_id = d_perso;
  IF n = 0 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[sync: perso a1 attribuée à a2] '; END IF;

  -- ── Athlète a1 ────────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM public.docs WHERE coach_id = ca;
  IF n = 4 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[a1 voit ' || n || ' fiches, attendu 4] '; END IF;

  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'docs' AND name LIKE ca || '/%';
  IF n = 4 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[a1 voit ' || n || ' objets, attendu 4] '; END IF;

  PERFORM public.mark_doc_seen(d_origin);
  SELECT seen_at INTO seen1 FROM public.doc_assignments WHERE athlete_id = a1 AND doc_id = d_origin;
  IF seen1 IS NOT NULL THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[mark_doc_seen] '; END IF;

  UPDATE public.doc_assignments SET coach_note = 'hack' WHERE athlete_id = a1;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[a1 modifie doc_assignments] '; END IF;

  DELETE FROM public.docs WHERE id = d_perso;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[a1 supprime la fiche perso du coach] '; END IF;

  -- DELETE direct : autorisé localement comme le fait l'API Storage
  -- (trigger protect_delete), la RLS reste appliquée.
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects WHERE bucket_id = 'docs' AND name = ca || '/athletes/' || a1 || '/' || d_perso || '.pdf';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[a1 supprime le fichier perso du coach] '; END IF;

  -- Ajout athlète : valide
  INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('docs', ca || '/athletes/' || a1 || '/' || d_upload || '.webp', a1::text);
  INSERT INTO public.docs (id, coach_id, athlete_id, uploaded_by, title, kind, file_path)
    VALUES (d_upload, ca, a1, a1, 'Capture', 'image', ca || '/athletes/' || a1 || '/' || d_upload || '.webp');
  ok := ok + 1;

  -- Ajout athlète interdit : libre-service
  BEGIN
    INSERT INTO public.docs (coach_id, athlete_id, uploaded_by, title, file_path, is_self_service)
      VALUES (ca, a1, a1, 'x', 'x', true);
    ko := ko + 1; fails := fails || '[a1 crée une fiche libre-service] ';
  EXCEPTION WHEN others THEN ok := ok + 1; END;

  -- Ajout athlète interdit : autre coach
  BEGIN
    INSERT INTO public.docs (coach_id, athlete_id, uploaded_by, title, file_path) VALUES (cb, a1, a1, 'x', 'x');
    ko := ko + 1; fails := fails || '[a1 crée une fiche chez un autre coach] ';
  EXCEPTION WHEN others THEN ok := ok + 1; END;

  -- Storage interdit : banque du coach, dossier d'un autre athlète
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('docs', ca || '/banque/pirate.pdf');
    ko := ko + 1; fails := fails || '[a1 écrit dans la banque] ';
  EXCEPTION WHEN others THEN ok := ok + 1; END;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('docs', ca || '/athletes/' || a2 || '/pirate.pdf');
    ko := ko + 1; fails := fails || '[a1 écrit chez a2] ';
  EXCEPTION WHEN others THEN ok := ok + 1; END;

  -- Commentaire a1 sur l'origine
  INSERT INTO public.doc_comments (doc_id, athlete_id, author_id, body) VALUES (d_origin, a1, a1, 'question');
  ok := ok + 1;

  -- a1 supprime son propre ajout
  DELETE FROM storage.objects WHERE bucket_id = 'docs' AND name = ca || '/athletes/' || a1 || '/' || d_upload || '.webp';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[a1 ne peut pas supprimer son fichier] '; END IF;
  DELETE FROM public.docs WHERE id = d_upload;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[a1 ne peut pas supprimer son ajout] '; END IF;

  -- ── Athlète a2 (même coach, sans la fiche perso) ──────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a2, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM public.docs WHERE id = d_perso;
  IF n = 0 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[a2 voit la fiche perso de a1] '; END IF;
  SELECT count(*) INTO n FROM public.docs WHERE id IN (d_origin, d_variant, d_self);
  IF n = 3 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[a2 voit ' || n || ' / 3 (origine, variante, libre-service)] '; END IF;
  SELECT count(*) INTO n FROM public.doc_comments WHERE athlete_id = a1;
  IF n = 0 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[a2 lit les commentaires de a1] '; END IF;
  SELECT public.can_read_doc_file(ca || '/athletes/' || a1 || '/' || d_perso || '.pdf') INTO b;
  IF NOT b THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[a2 lit le fichier perso de a1] '; END IF;

  -- ── Athlète b1 (autre coach) ──────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM public.docs WHERE coach_id = ca;
  IF n = 0 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[b1 liste ' || n || ' fiches du coach A] '; END IF;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'docs' AND name LIKE ca || '/%';
  IF n = 0 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[b1 voit ' || n || ' objets du coach A (URL signée possible)] '; END IF;
  BEGIN
    INSERT INTO public.doc_comments (doc_id, athlete_id, author_id, body) VALUES (d_origin, b1, b1, 'x');
    ko := ko + 1; fails := fails || '[b1 commente une fiche illisible] ';
  EXCEPTION WHEN others THEN ok := ok + 1; END;

  -- ── Coach B ne peut pas synchroniser un athlète de A ──────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', cb, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.sync_doc_assignments(a1, 'programme', ARRAY[]::uuid[]);
    ko := ko + 1; fails := fails || '[coach B synchronise a1] ';
  EXCEPTION WHEN others THEN ok := ok + 1; END;
  SELECT count(*) INTO n FROM public.doc_comments WHERE athlete_id = a1;
  IF n = 0 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[coach B lit les commentaires de a1] '; END IF;

  -- ── Coach A : retrait de la programmation (scénario 8) ────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ca, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM public.doc_comments WHERE athlete_id = a1;
  IF n = 1 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[coach A ne lit pas le commentaire de a1] '; END IF;

  PERFORM public.sync_doc_assignments(a1, 'programme', ARRAY[d_origin]);
  SELECT count(*) INTO n FROM public.doc_assignments WHERE athlete_id = a1 AND source = 'programme';
  IF n = 1 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[sync retrait : ' || n || ' lignes programme, attendu 1] '; END IF;
  SELECT count(*) INTO n FROM public.doc_assignments WHERE athlete_id = a1 AND source = 'manuel' AND doc_id = d_perso;
  IF n = 1 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[sync retrait a supprimé le manuel] '; END IF;
  SELECT seen_at INTO seen2 FROM public.doc_assignments WHERE athlete_id = a1 AND doc_id = d_origin AND source = 'programme';
  IF seen2 = seen1 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[sync a perdu seen_at] '; END IF;

  -- Archivage du libre-service : a2 ne la voit plus
  UPDATE public.docs SET archived_at = now() WHERE id = d_self;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a2, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM public.docs WHERE id = d_self;
  IF n = 0 THEN ok := ok + 1; ELSE ko := ko + 1; fails := fails || '[libre-service archivé encore visible] '; END IF;

  EXECUTE 'RESET ROLE';
  RAISE EXCEPTION 'RESULTS ok=% ko=% | %', ok, ko, COALESCE(NULLIF(fails, ''), 'aucun KO');
END $$;
