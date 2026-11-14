-- Tests de set_coach_athlete (migration 20261113180000).
-- Jeu de test : coach « Agon Démo » et athlète « Léa Démo ».
BEGIN;
SELECT set_config('p43.coach', (SELECT id::text FROM public.profiles WHERE full_name = 'Agon Démo' AND role IN ('coach','coach_athlete') LIMIT 1), true);
SELECT set_config('p43.ath', (SELECT id::text FROM public.profiles WHERE full_name = 'Léa Démo' AND role = 'athlete' LIMIT 1), true);
-- Point de départ connu : coach simple, sans coach.
UPDATE public.profiles SET role = 'coach', coach_id = NULL WHERE id = current_setting('p43.coach')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('p43.coach'), 'role', 'authenticated')::text, true);
DO $$
DECLARE c uuid := current_setting('p43.coach')::uuid; r text; cid uuid;
BEGIN
  IF c IS NULL THEN RAISE EXCEPTION '00 jeu de test : coach introuvable'; END IF;
  -- 01 activer : coach_athlete, son propre coach
  PERFORM public.set_coach_athlete(true);
  SELECT role, coach_id INTO r, cid FROM public.profiles WHERE id = c;
  IF r <> 'coach_athlete' OR cid IS DISTINCT FROM c THEN RAISE EXCEPTION '01 activer : % / %', r, cid; END IF;
  -- 02 désactiver : coach, plus suivi
  PERFORM public.set_coach_athlete(false);
  SELECT role, coach_id INTO r, cid FROM public.profiles WHERE id = c;
  IF r <> 'coach' OR cid IS NOT NULL THEN RAISE EXCEPTION '02 désactiver : % / %', r, cid; END IF;
  -- 03 le verrou reste : UPDATE direct du rôle refusé
  BEGIN
    UPDATE public.profiles SET role = 'coach_athlete' WHERE id = c;
    RAISE EXCEPTION '03 UPDATE direct du rôle accepté';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- 04 le drapeau ne reste pas posé après l'appel
  IF coalesce(current_setting('agon.role_switch', true), '') = 'on' THEN RAISE EXCEPTION '04 drapeau resté posé'; END IF;
END $$;
-- 05 un athlète ne peut pas s'en servir
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('p43.ath'), 'role', 'authenticated')::text, true);
DO $$
BEGIN
  BEGIN
    PERFORM public.set_coach_athlete(true);
    RAISE EXCEPTION '05 athlète accepté';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT role FROM public.profiles WHERE id = current_setting('p43.ath')::uuid) <> 'athlete' THEN RAISE EXCEPTION '05 rôle athlète modifié'; END IF;
  RAISE NOTICE 'p43_set_coach_athlete : 5 / 5';
END $$;
ROLLBACK;
