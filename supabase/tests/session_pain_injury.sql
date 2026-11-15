-- Test à blanc : douleur de séance → blessure déclarée (migration 20261116120000_session_pain_injury).
-- Base de TEST : supabase db query --linked -f supabase/tests/session_pain_injury.sql
-- (en prod, seulement la partie migration est rejouée à blanc). Tout est annulé (ROLLBACK).
BEGIN;
CREATE TABLE IF NOT EXISTS public.injury_followups (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id             uuid NOT NULL REFERENCES public.medical_entries(id) ON DELETE CASCADE,
  athlete_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day                  date NOT NULL,
  pain_level           smallint NOT NULL CHECK (pain_level BETWEEN 1 AND 10),
  note                 text CHECK (note IS NULL OR length(note) <= 500),
  workout_log_id       uuid REFERENCES public.workout_logs(id) ON DELETE SET NULL,
  energy_assignment_id uuid REFERENCES public.energy_session_assignments(id) ON DELETE SET NULL,
  created_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT injury_followups_one_session CHECK (num_nonnulls(workout_log_id, energy_assignment_id) <= 1)
);

COMMENT ON TABLE public.injury_followups IS 'Suivis d''une blessure déclarée : douleur 0-10 d''un jour, commentaire de l''athlète, séance d''origine (question de fin de séance, 15/11/2026). Écriture par report_session_pain.';

CREATE INDEX IF NOT EXISTS injury_followups_athlete_day_idx ON public.injury_followups (athlete_id, day);
CREATE INDEX IF NOT EXISTS injury_followups_entry_idx ON public.injury_followups (entry_id);
CREATE INDEX IF NOT EXISTS injury_followups_created_by_idx ON public.injury_followups (created_by);
CREATE UNIQUE INDEX IF NOT EXISTS injury_followups_entry_workout_key
  ON public.injury_followups (entry_id, workout_log_id) WHERE workout_log_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS injury_followups_entry_energy_key
  ON public.injury_followups (entry_id, energy_assignment_id) WHERE energy_assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS injury_followups_energy_idx ON public.injury_followups (energy_assignment_id) WHERE energy_assignment_id IS NOT NULL;

ALTER TABLE public.injury_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS injury_followups_read ON public.injury_followups;
CREATE POLICY injury_followups_read ON public.injury_followups FOR SELECT TO authenticated
  USING (athlete_id = (SELECT auth.uid()) OR ((SELECT public.i_am_coach()) AND public.is_coach_of(athlete_id)));

DROP POLICY IF EXISTS staff_injury_followups_read ON public.injury_followups;
CREATE POLICY staff_injury_followups_read ON public.injury_followups FOR SELECT TO authenticated
  USING ((SELECT public.i_am_staff()) AND public.staff_can(athlete_id, 'medical', 'read'));

-- Contrôle des zones : objet {zone: entier 0-10}, au plus 20 zones ; zones à
-- 0 retirées ; commentaire nettoyé (vide → NULL, 500 caractères au plus).
CREATE OR REPLACE FUNCTION public._session_pain_clean(p_levels jsonb, p_note text, OUT levels jsonb, OUT note text)
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  k text;
  v jsonb;
BEGIN
  levels := '{}'::jsonb;
  IF p_levels IS NOT NULL AND jsonb_typeof(p_levels) <> 'object' THEN
    RAISE EXCEPTION 'Douleur : zones attendues' USING ERRCODE = '22023';
  END IF;
  FOR k, v IN SELECT * FROM jsonb_each(coalesce(p_levels, '{}'::jsonb)) LOOP
    IF jsonb_typeof(v) <> 'number' OR (v #>> '{}')::numeric NOT IN (0,1,2,3,4,5,6,7,8,9,10) THEN
      RAISE EXCEPTION 'Douleur entre 0 et 10' USING ERRCODE = '22023';
    END IF;
    IF length(btrim(k)) = 0 OR length(k) > 40 THEN
      RAISE EXCEPTION 'Zone de douleur invalide' USING ERRCODE = '22023';
    END IF;
    IF (v #>> '{}')::int > 0 THEN
      levels := levels || jsonb_build_object(btrim(k), (v #>> '{}')::int);
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_object_keys(levels)) > 20 THEN
    RAISE EXCEPTION 'Trop de zones de douleur' USING ERRCODE = '22023';
  END IF;
  note := nullif(btrim(coalesce(p_note, '')), '');
  IF note IS NOT NULL AND length(note) > 500 THEN
    RAISE EXCEPTION 'Commentaire de douleur trop long (500 caractères)' USING ERRCODE = '22023';
  END IF;
  IF levels = '{}'::jsonb THEN
    note := NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._session_pain_clean(jsonb, text) FROM PUBLIC, anon, authenticated;

-- p_levels : {"Genou": 6, "Lombaires": 3}, clés = libellés de la carte douleur
-- (ce qui s'écrit dans medical_entries.zone). Une seule séance : muscu
-- (p_workout_log) ou énergie (p_energy_assignment).
-- Même zone : « genou » = « Genou », et « Genou gauche » suit « Genou »
-- (un mot de plus d'un côté ou de l'autre).
CREATE OR REPLACE FUNCTION public.report_session_pain(
  p_workout_log uuid DEFAULT NULL,
  p_energy_assignment uuid DEFAULT NULL,
  p_levels jsonb DEFAULT '{}'::jsonb,
  p_note text DEFAULT NULL
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_me      uuid := auth.uid();
  v_athlete uuid;
  v_day     date;
  c         record;
  k         text;
  v_level   int;
  v_entry   uuid;
  v_created boolean;
  v_out     jsonb := '[]'::jsonb;
BEGIN
  IF num_nonnulls(p_workout_log, p_energy_assignment) <> 1 THEN
    RAISE EXCEPTION 'Une séance attendue' USING ERRCODE = '22023';
  END IF;
  IF p_workout_log IS NOT NULL THEN
    SELECT w.athlete_id, w.scheduled_date INTO v_athlete, v_day FROM public._workout_log_for_write(p_workout_log) w;
  ELSE
    SELECT a.athlete_id, a.scheduled_date INTO v_athlete, v_day FROM public._energy_assignment_for_write(p_energy_assignment) a;
  END IF;
  c := public._session_pain_clean(p_levels, p_note);
  -- Deux envois simultanés pour le même athlète ne créent pas deux blessures.
  PERFORM pg_advisory_xact_lock(hashtext('report_session_pain:' || v_athlete::text));

  FOR k, v_level IN SELECT key, value::int FROM jsonb_each_text(c.levels) ORDER BY key LOOP
    SELECT e.id INTO v_entry
      FROM public.medical_entries e
     WHERE e.athlete_id = v_athlete
       AND e.status = 'en_cours'
       AND e.zone IS NOT NULL
       AND (lower(btrim(e.zone)) = lower(k)
            OR starts_with(lower(btrim(e.zone)), lower(k) || ' ')
            OR starts_with(lower(k), lower(btrim(e.zone)) || ' '))
     ORDER BY coalesce(e.date, e.created_at::date) DESC, e.created_at DESC
     LIMIT 1
     FOR UPDATE;
    v_created := NOT FOUND;

    IF v_created THEN
      INSERT INTO public.medical_entries
        (athlete_id, kind, title, zone, date, status, notes, pain_level, context, declared_by, created_by)
      VALUES
        (v_athlete, 'blessure', 'Douleur en séance', k, v_day, 'en_cours', c.note, v_level, 'entrainement',
         CASE WHEN v_me = v_athlete THEN 'athlete' ELSE 'coach' END, v_me)
      RETURNING id INTO v_entry;
    ELSE
      UPDATE public.medical_entries SET pain_level = v_level WHERE id = v_entry;
    END IF;

    IF p_workout_log IS NOT NULL THEN
      INSERT INTO public.injury_followups (entry_id, athlete_id, day, pain_level, note, workout_log_id, created_by)
      VALUES (v_entry, v_athlete, v_day, v_level, c.note, p_workout_log, v_me)
      ON CONFLICT (entry_id, workout_log_id) WHERE workout_log_id IS NOT NULL
      DO UPDATE SET pain_level = EXCLUDED.pain_level, note = EXCLUDED.note, day = EXCLUDED.day;
    ELSE
      INSERT INTO public.injury_followups (entry_id, athlete_id, day, pain_level, note, energy_assignment_id, created_by)
      VALUES (v_entry, v_athlete, v_day, v_level, c.note, p_energy_assignment, v_me)
      ON CONFLICT (entry_id, energy_assignment_id) WHERE energy_assignment_id IS NOT NULL
      DO UPDATE SET pain_level = EXCLUDED.pain_level, note = EXCLUDED.note, day = EXCLUDED.day;
    END IF;

    v_out := v_out || jsonb_build_object('zone', k, 'entry_id', v_entry, 'created', v_created);
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.report_session_pain(uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_session_pain(uuid, uuid, jsonb, text) TO authenticated;

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
  IF has_function_privilege('anon', 'public.report_session_pain(uuid, uuid, jsonb, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._session_pain_clean(jsonb, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.report_session_pain(uuid, uuid, jsonb, text)', 'EXECUTE') THEN
    RAISE EXCEPTION '10. droits inattendus'; END IF;
  ok := ok + 1;

  RAISE NOTICE 'session_pain_injury : % / 10', ok;
  IF ok <> 10 THEN RAISE EXCEPTION 'session_pain_injury : % / 10', ok; END IF;
END $$;
ROLLBACK;
