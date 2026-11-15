-- Douleur de séance (Hugo, 15/11/2026) : en fin de séance, l'athlète répond
-- « Une douleur pendant la séance ? » Non / Oui ; si Oui, zones de la carte
-- douleur du wellness, note 0-10 par zone, commentaire facultatif.
--
-- Décision d'Hugo : chaque « oui » est une BLESSURE DÉCLARÉE (`medical_entries`,
-- badge « blessure active », en cours jusqu'à clôture). Pas de doublon : s'il
-- existe déjà une blessure en cours sur la même zone, la douleur devient un
-- suivi de celle-ci (sa note de douleur est mise à jour).
--
-- Additif seulement :
--   - table `injury_followups` : un suivi = une blessure, un jour, une note
--     0-10, un commentaire, et la séance d'où il vient (lien nullable, ON
--     DELETE SET NULL). La séance qui a créé une blessure en porte aussi un :
--     c'est lui qui dit « séance : <nom> » ;
--   - RPC atomique `report_session_pain` : pour chaque zone, retrouve la
--     blessure en cours ou la crée, met à jour sa note, écrit le suivi.
--     Rejouable sans doublon (file hors ligne) : un suivi par blessure et par
--     séance.
-- Lecture : l'athlète, ses coachs (is_coach_of, co-coach compris), le staff
-- autorisé sur le domaine « medical ». Écriture : la RPC seulement (aucune
-- policy d'écriture) ; la suppression d'une blessure emporte ses suivis.
-- Aucune donnée de soin (décision du 13/11) : douleur et commentaire de
-- l'athlète, comme la blessure elle-même.
-- Tests : supabase/tests/session_pain_injury.sql.

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
