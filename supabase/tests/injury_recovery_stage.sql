-- Test à blanc : étape de résolution d'une blessure (migration 20261116160000_injury_recovery_stage).
-- Base de TEST : supabase db query --linked -f supabase/tests/injury_recovery_stage.sql
-- Tout est annulé (ROLLBACK).
BEGIN;
DO $$
DECLARE
  ath uuid; coach uuid; other uuid; e uuid; n int; ok int := 0; m record;
BEGIN
  SELECT p.id, p.coach_id INTO ath, coach FROM profiles p
   WHERE p.role = 'athlete' AND p.coach_id IS NOT NULL ORDER BY (p.full_name = 'Léa Démo') DESC, p.id LIMIT 1;
  IF ath IS NULL THEN RAISE EXCEPTION 'aucun athlète avec coach'; END IF;
  SELECT id INTO other FROM profiles WHERE role = 'athlete' AND id <> ath AND COALESCE(is_admin, false) = false
   AND NOT public.is_coach_of(ath) LIMIT 1;
  IF other IS NULL THEN RAISE EXCEPTION 'données de test manquantes'; END IF;

  -- 0. Reprise : plus aucune blessure sans étape, étape et statut d'accord.
  SELECT count(*) INTO n FROM medical_entries
   WHERE recovery_stage IS NULL OR (recovery_stage = 'gueri') <> (status = 'gueri');
  IF n <> 0 THEN RAISE EXCEPTION '0. % blessures sans étape juste', n; END IF;
  ok := ok + 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ath, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 1. Blessure déclarée en cours par l'athlète : « Blessé », une étape datée du début.
  INSERT INTO medical_entries (athlete_id, title, zone, date, status, declared_by)
  VALUES (ath, 'Entorse', 'cheville', '2026-11-02', 'en_cours', 'athlete') RETURNING id INTO e;
  SELECT * INTO m FROM medical_entries WHERE id = e;
  IF m.recovery_stage <> 'blesse' THEN RAISE EXCEPTION '1. étape %', m.recovery_stage; END IF;
  SELECT count(*) INTO n FROM injury_stage_history
   WHERE entry_id = e AND stage = 'blesse' AND changed_at::date = '2026-11-02' AND changed_by = ath;
  IF n <> 1 THEN RAISE EXCEPTION '1. historique de création absent'; END IF;
  ok := ok + 1;

  -- 2. L'athlète passe en réhabilitation : toujours en cours, étape tracée.
  UPDATE medical_entries SET recovery_stage = 'rehabilitation' WHERE id = e;
  SELECT * INTO m FROM medical_entries WHERE id = e;
  IF m.status <> 'en_cours' THEN RAISE EXCEPTION '2. statut %', m.status; END IF;
  SELECT count(*) INTO n FROM injury_stage_history WHERE entry_id = e;
  IF n <> 2 THEN RAISE EXCEPTION '2. % étapes', n; END IF;
  ok := ok + 1;

  -- 3. Une autre modification (notes) n'écrit pas d'étape.
  UPDATE medical_entries SET notes = 'mieux', status = 'en_cours' WHERE id = e;
  SELECT count(*) INTO n FROM injury_stage_history WHERE entry_id = e;
  IF n <> 2 THEN RAISE EXCEPTION '3. % étapes', n; END IF;
  ok := ok + 1;

  -- 4. L'athlète n'écrit pas l'historique à la main.
  BEGIN
    INSERT INTO injury_stage_history (entry_id, athlete_id, stage) VALUES (e, ath, 'gueri');
    RAISE EXCEPTION '4. historique écrit à la main';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  ok := ok + 1;
  RESET ROLE;

  -- 5. Un tiers ne lit pas l'historique.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM injury_stage_history WHERE entry_id = e;
  IF n <> 0 THEN RAISE EXCEPTION '5. un tiers lit % étapes', n; END IF;
  ok := ok + 1;
  RESET ROLE;

  -- 6. Le coach lit l'historique et déclare « Guéri » : statut guéri.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM injury_stage_history WHERE entry_id = e;
  IF n <> 2 THEN RAISE EXCEPTION '6. le coach voit % étapes', n; END IF;
  UPDATE medical_entries SET recovery_stage = 'gueri' WHERE id = e;
  SELECT * INTO m FROM medical_entries WHERE id = e;
  IF m.status <> 'gueri' THEN RAISE EXCEPTION '6. statut %', m.status; END IF;
  SELECT count(*) INTO n FROM injury_stage_history WHERE entry_id = e AND stage = 'gueri' AND changed_by = coach;
  IF n <> 1 THEN RAISE EXCEPTION '6. étape Guéri absente'; END IF;
  ok := ok + 1;

  -- 7. Ancien client : rouvrir par le statut seul repasse en « Blessé ».
  UPDATE medical_entries SET status = 'en_cours' WHERE id = e;
  SELECT * INTO m FROM medical_entries WHERE id = e;
  IF m.recovery_stage <> 'blesse' THEN RAISE EXCEPTION '7. étape %', m.recovery_stage; END IF;
  ok := ok + 1;

  -- 8. Étape et statut contradictoires : l'étape commande.
  UPDATE medical_entries SET recovery_stage = 'reathletisation', status = 'gueri' WHERE id = e;
  SELECT * INTO m FROM medical_entries WHERE id = e;
  IF m.status <> 'en_cours' OR m.recovery_stage <> 'reathletisation' THEN RAISE EXCEPTION '8. %', row_to_json(m); END IF;
  BEGIN
    UPDATE medical_entries SET recovery_stage = 'presque' WHERE id = e;
    RAISE EXCEPTION '8. étape inconnue acceptée';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ok := ok + 1;
  RESET ROLE;

  -- 9. Blessure supprimée : son historique part.
  DELETE FROM medical_entries WHERE id = e;
  SELECT count(*) INTO n FROM injury_stage_history WHERE entry_id = e;
  IF n <> 0 THEN RAISE EXCEPTION '9. historique orphelin'; END IF;
  ok := ok + 1;

  -- 10. Droits : personne n'appelle les fonctions des déclencheurs.
  IF has_function_privilege('authenticated', 'public.medical_entries_sync_stage()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.medical_entries_log_stage()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.medical_entries_log_stage()', 'EXECUTE') THEN
    RAISE EXCEPTION '10. droits inattendus'; END IF;
  ok := ok + 1;

  RAISE NOTICE 'injury_recovery_stage : % / 11', ok;
  IF ok <> 11 THEN RAISE EXCEPTION 'injury_recovery_stage : % / 11', ok; END IF;
END $$;
ROLLBACK;
