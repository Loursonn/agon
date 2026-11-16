/*
  Compétition = séance à remplir, partie B : proposition automatique.
  À appliquer seulement quand le front qui connaît le type `competition`
  (dev du 16/11/2026) est en production : le client d'avant masque une
  activité liée à un type de séance qu'il ne connaît pas. Suppose la partie A
  (20261116190000_competition_session.sql).

  Le jour J il y a souvent deux activités : l'échauffement, puis la course.
  La course proposée d'office est l'activité dont la durée est la plus proche
  du chrono HYROX saisi, sinon la plus longue du jour (l'échauffement est plus
  court) parmi les sports compatibles (HYROX : course, renfo, rameur, HYROX ;
  autre compétition : tout sport). L'autre reste une activité du jour, comptée
  à part.

  1. plan_family_accepts : famille 'any' (tout sport, sport inconnu compris) ;
  2. planned_sessions_of_day : compétitions et matchs maintenus du jour ;
  3. trigger : chrono HYROX saisi ou corrigé ;
  4. premier calcul des jours de compétition qui ont des activités.

  Tests : supabase/pending/tests/competition_session.sql (remplace
  supabase/tests/competition_session.sql le même jour).
*/

-- ═══════════════ 1-2. Proposition automatique ═══════════════════════════════

/* 'any' : la compétition peut être de tout sport, sport de la montre inconnu compris. */
CREATE OR REPLACE FUNCTION public.plan_family_accepts(p_planned text, p_activity text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_planned = 'any' THEN true
    ELSE p_planned IS NOT NULL AND p_activity IS NOT NULL AND CASE p_planned
      WHEN 'hyrox' THEN p_activity IN ('hyrox', 'run', 'strength', 'row')
      WHEN 'strength' THEN p_activity IN ('strength', 'hyrox')
      ELSE p_activity = p_planned
    END
  END;
$$;

CREATE OR REPLACE FUNCTION public.planned_sessions_of_day(p_athlete uuid, p_day date)
RETURNS TABLE (kind text, id uuid, family text, distance_m real, duration_s real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'energy', a.id,
         CASE
           WHEN a.activity_type = 'course' THEN 'run'
           WHEN a.activity_type = 'velo' THEN 'bike'
           WHEN a.activity_type = 'natation' THEN 'swim'
           WHEN a.activity_type IS NOT NULL THEN NULL
           WHEN s.session_kind IN ('vo2', 'tempo', 'seuil', 'footing', 'fartlek') THEN 'run'
           WHEN s.session_kind = 'specifique' THEN CASE sp.slug
             WHEN 'hyrox' THEN 'hyrox' WHEN 'course' THEN 'run' WHEN 'cyclisme' THEN 'bike'
             WHEN 'natation' THEN 'swim' WHEN 'crossfit' THEN 'strength' ELSE NULL END
           WHEN s.modality = 'course' THEN 'run'
           ELSE NULL
         END,
         coalesce(a.distance_km * 1000, s.total_distance_m)::real,
         coalesce(a.actual_duration_min * 60, s.total_duration_s)::real
    FROM public.energy_session_assignments a
    JOIN public.energy_sessions s ON s.id = a.energy_session_id
    LEFT JOIN public.specific_sports sp ON sp.id = s.sport_id
   WHERE a.athlete_id = p_athlete AND a.scheduled_date = p_day AND a.status <> 'skipped'
  UNION ALL
  SELECT 'workout', w.id, 'strength', NULL::real, w.duration_s::real
    FROM public.workout_logs w
   WHERE w.athlete_id = p_athlete AND w.scheduled_date = p_day AND w.status <> 'skipped'
  UNION ALL
  SELECT 'test', t.id, CASE WHEN t.type = 'endurance' THEN 'run' ELSE 'strength' END, NULL::real, NULL::real
    FROM public.test_sessions t
   WHERE t.athlete_id = p_athlete AND t.date = p_day
  UNION ALL
  -- Compétition ou match maintenu : la course est l'activité la plus proche du
  -- chrono HYROX saisi, sinon la plus longue du jour parmi les sports acceptés
  -- (l'échauffement est plus court). HYROX (nom ou résultat saisi) : activités
  -- HYROX, course, renfo ou rameur seulement ; sinon tout sport.
  SELECT 'competition', c.id, f.family, NULL::real,
         coalesce(
           (SELECT max(h.total_s) FROM public.hyrox_results h WHERE h.competition_id = c.id AND h.total_s > 0),
           (SELECT max(pa.duration_s) FROM public.provider_activities pa
             WHERE pa.athlete_id = p_athlete AND pa.local_date = p_day
               AND public.plan_family_accepts(f.family, public.activity_sport_family(pa.sport)))
         )::real
    FROM public.competitions c
    CROSS JOIN LATERAL (
      SELECT CASE WHEN c.name ILIKE '%hyrox%'
                    OR EXISTS (SELECT 1 FROM public.hyrox_results h WHERE h.competition_id = c.id)
                  THEN 'hyrox' ELSE 'any' END AS family
    ) f
   WHERE c.athlete_id = p_athlete AND c.date = p_day AND c.cancelled_at IS NULL
     AND c.type IN ('competition', 'match');
$$;
REVOKE ALL ON FUNCTION public.planned_sessions_of_day(uuid, date) FROM PUBLIC, anon, authenticated;

-- ═══════════════ 3. Trigger ═══════════════════════════════════════════════════

/* Chrono HYROX saisi ou corrigé : la proposition de la compétition liée est recalculée. */
CREATE OR REPLACE FUNCTION public.tg_plan_links_relink_hyrox()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT c.athlete_id, c.date FROM public.competitions c
     WHERE c.id IN (CASE WHEN TG_OP <> 'INSERT' THEN OLD.competition_id END,
                    CASE WHEN TG_OP <> 'DELETE' THEN NEW.competition_id END)
  LOOP
    PERFORM public.auto_link_day(r.athlete_id, r.date);
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'rapprochement planning non recalculé : %', SQLERRM;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_plan_links_relink_hyrox() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hyrox_results_plan_links ON public.hyrox_results;
CREATE TRIGGER hyrox_results_plan_links
  AFTER INSERT OR DELETE OR UPDATE OF total_s, competition_id ON public.hyrox_results
  FOR EACH ROW EXECUTE FUNCTION public.tg_plan_links_relink_hyrox();

-- ═══════════════ 4. Premier calcul (compétitions avec activités) ═════════════

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT DISTINCT c.athlete_id, c.date FROM public.competitions c
            WHERE c.cancelled_at IS NULL AND c.type IN ('competition', 'match')
              AND EXISTS (SELECT 1 FROM public.provider_activities pa
                           WHERE pa.athlete_id = c.athlete_id AND pa.local_date = c.date) LOOP
    PERFORM public.auto_link_day(r.athlete_id, r.date);
  END LOOP;
END $$;
