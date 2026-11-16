/*
  Compétition = séance à remplir le jour J (demande d'Hugo, 15/11/2026).
  Partie A : applicable tant que le client de `main` ne connaît pas le type
  de rapprochement `competition` (aucun lien automatique créé ici).

  Le jour d'une compétition (ou d'un match), la compétition elle-même devient
  une séance : l'athlète (ou son coach) y saisit un résultat libre, un lien,
  son RPE, son bilan (`athlete_comment`, existant) et sa douleur de fin de
  séance. Pas de séance copiée dans le planning : une seule donnée.

  Elle se lie à une activité de la montre du jour (Garmin, COROS, fichier) par
  le rapprochement existant (`activity_plan_links`, nouveau type
  `competition`) : ici, seulement quand l'athlète ou le coach choisit
  l'activité (`link_activity_to_plan`). La proposition automatique (plus
  proche du chrono HYROX, sinon la plus longue du jour) est la partie B,
  `supabase/pending/20261116190500_competition_auto_link.sql`, à appliquer
  une fois le front en production : le client de `main` masque une activité
  liée à un type de séance qu'il ne connaît pas.

  1. competitions : result_text, result_url, rpe_score ;
  2. activity_plan_links : planned_kind 'competition' ;
     link_activity_to_plan : accepte une compétition ;
  3. trigger : compétition déplacée / annulée / supprimée ;
  4. douleur de séance : injury_followups.competition_id, report_session_pain
     accepte une compétition (p_competition, en dernier, facultatif : les
     appels actuels ne changent pas).

  Additive. Tests : supabase/tests/competition_session.sql.
*/

-- ═══════════════ 1. Séance de compétition ════════════════════════════════════

ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS result_text text,
  ADD COLUMN IF NOT EXISTS result_url  text,
  ADD COLUMN IF NOT EXISTS rpe_score   smallint;

ALTER TABLE public.competitions DROP CONSTRAINT IF EXISTS competitions_result_text_check;
ALTER TABLE public.competitions ADD CONSTRAINT competitions_result_text_check
  CHECK (result_text IS NULL OR length(result_text) <= 200);
ALTER TABLE public.competitions DROP CONSTRAINT IF EXISTS competitions_result_url_check;
ALTER TABLE public.competitions ADD CONSTRAINT competitions_result_url_check
  CHECK (result_url IS NULL OR (length(result_url) <= 500 AND result_url ~* '^https?://[^[:space:]]+$'));
ALTER TABLE public.competitions DROP CONSTRAINT IF EXISTS competitions_rpe_score_check;
ALTER TABLE public.competitions ADD CONSTRAINT competitions_rpe_score_check
  CHECK (rpe_score IS NULL OR rpe_score BETWEEN 1 AND 10);

COMMENT ON COLUMN public.competitions.result_text IS 'Résultat saisi le jour J, texte libre (« 3-1 », « 12e / 80 »…).';
COMMENT ON COLUMN public.competitions.result_url IS 'Lien vers les résultats officiels ou une activité en ligne.';
COMMENT ON COLUMN public.competitions.rpe_score IS 'RPE de la compétition (1-10), saisi le jour J.';

-- ═══════════════ 2. Rapprochement : type « compétition » ══════════════════════

ALTER TABLE public.activity_plan_links DROP CONSTRAINT IF EXISTS activity_plan_links_planned_kind_check;
ALTER TABLE public.activity_plan_links ADD CONSTRAINT activity_plan_links_planned_kind_check
  CHECK (planned_kind IN ('energy', 'workout', 'test', 'competition'));

CREATE OR REPLACE FUNCTION public.link_activity_to_plan(p_activity uuid, p_kind text, p_planned uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_act record;
  v_owner uuid;
  v_id uuid;
BEGIN
  SELECT id, athlete_id, source, local_date INTO v_act FROM public.provider_activities WHERE id = p_activity;
  IF NOT FOUND OR NOT public.activity_laps_editor(v_act.athlete_id) THEN
    RAISE EXCEPTION 'link_activity_to_plan : non autorisé' USING ERRCODE = '42501';
  END IF;
  v_owner := CASE p_kind
    WHEN 'energy' THEN (SELECT athlete_id FROM public.energy_session_assignments WHERE id = p_planned)
    WHEN 'workout' THEN (SELECT athlete_id FROM public.workout_logs WHERE id = p_planned)
    WHEN 'test' THEN (SELECT athlete_id FROM public.test_sessions WHERE id = p_planned)
    WHEN 'competition' THEN (SELECT athlete_id FROM public.competitions WHERE id = p_planned)
  END;
  IF v_owner IS DISTINCT FROM v_act.athlete_id THEN
    RAISE EXCEPTION 'link_activity_to_plan : séance prévue introuvable pour cet athlète' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_act.athlete_id::text || v_act.local_date::text, 41));
  IF EXISTS (SELECT 1 FROM public.activity_plan_links
              WHERE status = 'confirmed'
                AND ((activity_id = p_activity AND NOT (planned_kind = p_kind AND planned_id = p_planned))
                  OR (planned_kind = p_kind AND planned_id = p_planned AND activity_id <> p_activity))) THEN
    RAISE EXCEPTION 'link_activity_to_plan : déjà rattachée ailleurs' USING ERRCODE = '23505';
  END IF;
  DELETE FROM public.activity_plan_links
   WHERE status = 'auto' AND (activity_id = p_activity OR (planned_kind = p_kind AND planned_id = p_planned));
  INSERT INTO public.activity_plan_links (athlete_id, activity_id, source, planned_kind, planned_id, local_date,
                                          status, confirmed_by, confirmed_at)
  VALUES (v_act.athlete_id, p_activity, v_act.source, p_kind, p_planned, v_act.local_date,
          'confirmed', auth.uid(), now())
  ON CONFLICT (activity_id, planned_kind, planned_id) DO UPDATE
    SET status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now()
  RETURNING id INTO v_id;
  PERFORM public.auto_link_day(v_act.athlete_id, v_act.local_date);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.link_activity_to_plan(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_activity_to_plan(uuid, text, uuid) TO authenticated;

-- ═══════════════ 3. Triggers ══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_plan_links_relink()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_day date;
  v_new_day date;
  v_kind text := CASE TG_TABLE_NAME WHEN 'energy_session_assignments' THEN 'energy'
                                    WHEN 'workout_logs' THEN 'workout'
                                    WHEN 'test_sessions' THEN 'test'
                                    WHEN 'competitions' THEN 'competition' END;
BEGIN
  IF TG_TABLE_NAME = 'provider_activities' THEN
    IF TG_OP <> 'INSERT' THEN v_old_day := OLD.local_date; END IF;
    IF TG_OP <> 'DELETE' THEN v_new_day := NEW.local_date; END IF;
  ELSIF TG_TABLE_NAME IN ('test_sessions', 'competitions') THEN
    IF TG_OP <> 'INSERT' THEN v_old_day := OLD.date; END IF;
    IF TG_OP <> 'DELETE' THEN v_new_day := NEW.date; END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN v_old_day := OLD.scheduled_date; END IF;
    IF TG_OP <> 'DELETE' THEN v_new_day := NEW.scheduled_date; END IF;
  END IF;

  -- Séance prévue supprimée : ses liens ne désignent plus rien.
  IF TG_OP = 'DELETE' AND v_kind IS NOT NULL THEN
    DELETE FROM public.activity_plan_links WHERE planned_kind = v_kind AND planned_id = OLD.id;
  END IF;
  -- Séance déplacée : un lien automatique de l'ancien jour ne tient plus.
  IF TG_OP = 'UPDATE' AND v_kind IS NOT NULL AND v_old_day IS DISTINCT FROM v_new_day THEN
    DELETE FROM public.activity_plan_links WHERE planned_kind = v_kind AND planned_id = OLD.id AND status = 'auto';
  END IF;

  IF v_old_day IS NOT NULL THEN
    PERFORM public.auto_link_day(OLD.athlete_id, v_old_day);
  END IF;
  IF v_new_day IS NOT NULL AND (v_old_day IS NULL OR v_new_day <> v_old_day OR TG_OP = 'INSERT') THEN
    PERFORM public.auto_link_day(NEW.athlete_id, v_new_day);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'rapprochement planning non recalculé : %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS competitions_plan_links ON public.competitions;
CREATE TRIGGER competitions_plan_links
  AFTER INSERT OR DELETE OR UPDATE OF date, type, cancelled_at ON public.competitions
  FOR EACH ROW EXECUTE FUNCTION public.tg_plan_links_relink();

-- ═══════════════ 4. Douleur de séance sur une compétition ════════════════════

ALTER TABLE public.injury_followups
  ADD COLUMN IF NOT EXISTS competition_id uuid REFERENCES public.competitions(id) ON DELETE SET NULL;
ALTER TABLE public.injury_followups DROP CONSTRAINT IF EXISTS injury_followups_one_session;
ALTER TABLE public.injury_followups ADD CONSTRAINT injury_followups_one_session
  CHECK (num_nonnulls(workout_log_id, energy_assignment_id, competition_id) <= 1);
CREATE UNIQUE INDEX IF NOT EXISTS injury_followups_entry_competition_key
  ON public.injury_followups (entry_id, competition_id) WHERE competition_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS injury_followups_competition_idx
  ON public.injury_followups (competition_id) WHERE competition_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.report_session_pain(uuid, uuid, jsonb, text);

-- p_levels : {"Genou": 6, "Lombaires": 3}, clés = libellés de la carte douleur
-- (ce qui s'écrit dans medical_entries.zone). Une seule séance : muscu
-- (p_workout_log), énergie (p_energy_assignment) ou compétition (p_competition).
-- Même zone : « genou » = « Genou », et « Genou gauche » suit « Genou »
-- (un mot de plus d'un côté ou de l'autre).
CREATE OR REPLACE FUNCTION public.report_session_pain(
  p_workout_log uuid DEFAULT NULL,
  p_energy_assignment uuid DEFAULT NULL,
  p_levels jsonb DEFAULT '{}'::jsonb,
  p_note text DEFAULT NULL,
  p_competition uuid DEFAULT NULL
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
  IF num_nonnulls(p_workout_log, p_energy_assignment, p_competition) <> 1 THEN
    RAISE EXCEPTION 'Une séance attendue' USING ERRCODE = '22023';
  END IF;
  IF p_workout_log IS NOT NULL THEN
    SELECT w.athlete_id, w.scheduled_date INTO v_athlete, v_day FROM public._workout_log_for_write(p_workout_log) w;
  ELSIF p_energy_assignment IS NOT NULL THEN
    SELECT a.athlete_id, a.scheduled_date INTO v_athlete, v_day FROM public._energy_assignment_for_write(p_energy_assignment) a;
  ELSE
    IF v_me IS NULL THEN
      RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
    END IF;
    SELECT co.athlete_id, co.date INTO v_athlete, v_day FROM public.competitions co WHERE co.id = p_competition;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Séance introuvable' USING ERRCODE = 'P0002';
    END IF;
    IF NOT (v_athlete = v_me OR public.is_coach_of(v_athlete) OR public.current_user_is_admin()) THEN
      RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
    END IF;
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
        (v_athlete, 'blessure', 'Douleur en séance', k, v_day, 'en_cours', c.note, v_level,
         CASE WHEN p_competition IS NOT NULL THEN 'competition' ELSE 'entrainement' END,
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
    ELSIF p_energy_assignment IS NOT NULL THEN
      INSERT INTO public.injury_followups (entry_id, athlete_id, day, pain_level, note, energy_assignment_id, created_by)
      VALUES (v_entry, v_athlete, v_day, v_level, c.note, p_energy_assignment, v_me)
      ON CONFLICT (entry_id, energy_assignment_id) WHERE energy_assignment_id IS NOT NULL
      DO UPDATE SET pain_level = EXCLUDED.pain_level, note = EXCLUDED.note, day = EXCLUDED.day;
    ELSE
      INSERT INTO public.injury_followups (entry_id, athlete_id, day, pain_level, note, competition_id, created_by)
      VALUES (v_entry, v_athlete, v_day, v_level, c.note, p_competition, v_me)
      ON CONFLICT (entry_id, competition_id) WHERE competition_id IS NOT NULL
      DO UPDATE SET pain_level = EXCLUDED.pain_level, note = EXCLUDED.note, day = EXCLUDED.day;
    END IF;

    v_out := v_out || jsonb_build_object('zone', k, 'entry_id', v_entry, 'created', v_created);
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.report_session_pain(uuid, uuid, jsonb, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_session_pain(uuid, uuid, jsonb, text, uuid) TO authenticated;
