-- Test à blanc : douleur de séance → blessure déclarée (migration 20261116120000_session_pain_injury).
-- Base de TEST : supabase db query --linked -f supabase/tests/session_pain_injury.sql
-- Teste la fonction en base (la copie de la migration a été retirée : 20261116190000 a changé sa signature). Tout est annulé (ROLLBACK).
BEGIN;
DO $$
DECLARE
  ath uuid; coach uuid; other uuid; esid uuid; wl uuid; ea uuid; knee uuid;
  res jsonb; n int; ok int := 0; m record;
BEGIN
  SELECT p.id, p.coach_id INTO ath, coach FROM profiles p
   WHERE p.role = 'athlete' AND p.coach_id IS NOT NULL ORDER BY (p.full_name = 'Léa Démo') DESC, p.id LIMIT 1;
  IF ath IS NULL THEN RAISE EXCEPTION 'aucun athlète avec coach'; END IF;
  SELECT id INTO other FROM profiles WHERE role = 'athlete' AND id <> ath AND COALESCE(is_admin, false) = false
   AND NOT public.is_coach_of(ath) LIMIT 1;
  SELECT id INTO esid FROM energy_sessions LIMIT 1;
  IF other IS NULL OR esid IS NULL THEN RAISE EXCEPTION 'données de test manquantes'; END IF;

  -- Point de départ connu : aucune blessure en cours, sauf un « genou gauche » déclaré à la main.
  UPDATE medical_entries SET status = 'gueri' WHERE athlete_id = ath;
  INSERT INTO medical_entries (athlete_id, title, zone, date, status, pain_level, declared_by)
  VALUES (ath, 'Tendinite', 'genou gauche', '2026-11-01', 'en_cours', 3, 'athlete') RETURNING id INTO knee;
  INSERT INTO workout_logs (athlete_id, coach_id, session_id, session_name, scheduled_date, status)
  VALUES (ath, coach, 'test-douleur', 'Séance test douleur', '2026-11-12', 'completed') RETURNING id INTO wl;
  INSERT INTO energy_session_assignments (athlete_id, coach_id, energy_session_id, scheduled_date, status)
  VALUES (ath, coach, esid, '2026-11-13', 'completed') RETURNING id INTO ea;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ath, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 1. Nouvelle zone : blessure en cours créée (datée du jour de la séance) + suivi lié à la séance.
  res := public.report_session_pain(wl, NULL, '{"Coude": 6, "Nuque": 0}'::jsonb, '  tirage au rowing  ');
  IF jsonb_array_length(res) <> 1 OR (res->0->>'created')::boolean IS NOT TRUE THEN RAISE EXCEPTION '1. retour : %', res; END IF;
  SELECT * INTO m FROM medical_entries WHERE id = (res->0->>'entry_id')::uuid;
  IF m.status <> 'en_cours' OR m.zone <> 'Coude' OR m.pain_level <> 6 OR m.date <> '2026-11-12' OR m.notes <> 'tirage au rowing'
     OR m.declared_by <> 'athlete' OR m.kind <> 'blessure' THEN RAISE EXCEPTION '1. blessure : %', row_to_json(m); END IF;
  SELECT count(*) INTO n FROM injury_followups WHERE entry_id = m.id AND workout_log_id = wl AND pain_level = 6 AND note = 'tirage au rowing' AND day = '2026-11-12';
  IF n <> 1 THEN RAISE EXCEPTION '1. suivi absent'; END IF;
  ok := ok + 1;

  -- 2. Même envoi rejoué (file hors ligne) : ni blessure ni suivi en double.
  res := public.report_session_pain(wl, NULL, '{"Coude": 7}'::jsonb, 'tirage au rowing');
  IF (res->0->>'created')::boolean THEN RAISE EXCEPTION '2. blessure en double'; END IF;
  SELECT count(*) INTO n FROM medical_entries WHERE athlete_id = ath AND status = 'en_cours';
  IF n <> 2 THEN RAISE EXCEPTION '2. % blessures en cours', n; END IF;
  SELECT count(*) INTO n FROM injury_followups WHERE workout_log_id = wl AND pain_level = 7;
  IF n <> 1 THEN RAISE EXCEPTION '2. suivi en double ou non mis à jour'; END IF;
  ok := ok + 1;

  -- 3. Zone déjà en cours (« genou gauche » ↔ « Genou ») : suivi de celle-ci, note mise à jour.
  res := public.report_session_pain(NULL, ea, '{"Genou": 4}'::jsonb, NULL);
  IF (res->0->>'entry_id')::uuid <> knee OR (res->0->>'created')::boolean THEN RAISE EXCEPTION '3. retour : %', res; END IF;
  SELECT count(*) INTO n FROM medical_entries WHERE id = knee AND pain_level = 4 AND title = 'Tendinite' AND date = '2026-11-01';
  IF n <> 1 THEN RAISE EXCEPTION '3. blessure existante non suivie'; END IF;
  SELECT count(*) INTO n FROM injury_followups WHERE entry_id = knee AND energy_assignment_id = ea AND day = '2026-11-13' AND note IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION '3. suivi énergie absent'; END IF;
  ok := ok + 1;

  -- 4. Note hors 0-10 refusée ; 5. il faut exactement une séance.
  BEGIN
    PERFORM public.report_session_pain(wl, NULL, '{"Coude": 11}'::jsonb, NULL);
    RAISE EXCEPTION '4. note 11 acceptée';
  EXCEPTION WHEN invalid_parameter_value THEN ok := ok + 1;
  END;
  BEGIN
    PERFORM public.report_session_pain(wl, ea, '{"Coude": 2}'::jsonb, NULL);
    RAISE EXCEPTION '5. deux séances acceptées';
  EXCEPTION WHEN invalid_parameter_value THEN ok := ok + 1;
  END;

  -- 6. Écriture directe refusée (pas de policy d'écriture).
  BEGIN
    INSERT INTO injury_followups (entry_id, athlete_id, day, pain_level) VALUES (knee, ath, '2026-11-14', 2);
    RAISE EXCEPTION '6. insertion directe acceptée';
  EXCEPTION WHEN insufficient_privilege THEN ok := ok + 1;
  END;
  RESET ROLE;

  -- 7. Un tiers ne peut ni déclarer sur la séance ni lire les suivis.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.report_session_pain(wl, NULL, '{"Cou": 2}'::jsonb, NULL);
    RAISE EXCEPTION '7. un tiers a écrit';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO n FROM injury_followups WHERE athlete_id = ath;
  IF n <> 0 THEN RAISE EXCEPTION '7. un tiers lit les suivis'; END IF;
  ok := ok + 1;
  RESET ROLE;

  -- 8. Le coach lit les suivis et les blessures.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM injury_followups WHERE athlete_id = ath AND (workout_log_id = wl OR energy_assignment_id = ea);
  IF n <> 2 THEN RAISE EXCEPTION '8. le coach voit % suivis', n; END IF;
  ok := ok + 1;
  RESET ROLE;

  -- 9. Séance supprimée : le suivi reste (lien vidé) ; blessure supprimée : ses suivis partent.
  DELETE FROM workout_logs WHERE id = wl;
  SELECT count(*) INTO n FROM injury_followups WHERE athlete_id = ath AND workout_log_id IS NULL AND energy_assignment_id IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION '9. suivi perdu avec la séance'; END IF;
  DELETE FROM medical_entries WHERE id = knee;
  SELECT count(*) INTO n FROM injury_followups WHERE entry_id = knee;
  IF n <> 0 THEN RAISE EXCEPTION '9. suivis orphelins'; END IF;
  ok := ok + 1;

  -- 10. Droits : anon n'appelle pas la RPC, personne n'appelle le contrôle interne.
  IF has_function_privilege('anon', 'public.report_session_pain(uuid, uuid, jsonb, text, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._session_pain_clean(jsonb, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.report_session_pain(uuid, uuid, jsonb, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '10. droits inattendus'; END IF;
  ok := ok + 1;

  RAISE NOTICE 'session_pain_injury : % / 10', ok;
  IF ok <> 10 THEN RAISE EXCEPTION 'session_pain_injury : % / 10', ok; END IF;
END $$;
ROLLBACK;
