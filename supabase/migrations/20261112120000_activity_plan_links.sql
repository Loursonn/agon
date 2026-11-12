/*
  P41 lot E : rapprochement séance prévue ↔ activité de montre.

  Une activité (Garmin, COROS, fichier) se rattache à AU PLUS une séance
  prévue, et une séance prévue à au plus une activité (« un pour un »).

  - `auto` : proposé par Agon (même jour, sport compatible, le couple le plus
    proche en distance / durée d'abord), à confirmer ;
  - `confirmed` : confirmé par l'athlète ou son coach (référent ou co-coach) ;
  - `rejected` : refusé. L'activité redevient libre, et ce couple n'est plus
    jamais reproposé.

  Séances prévues : `energy` (energy_session_assignments : énergie et
  spécifique / HYROX), `workout` (workout_logs, muscu), `test` (test_sessions).
  Pas de clé étrangère possible sur un lien polymorphe : un lien vers une
  séance supprimée est retiré par trigger.

  Le calcul se fait EN BASE, à chaque arrivée d'activité ou changement de
  planning (triggers), pour qu'il n'y ait qu'un point d'entrée quelle que soit
  la source (webhook Garmin, synchro COROS, import dans le navigateur). Les
  triggers posés sur les tables existantes sont AFTER et protégés : une erreur
  de rapprochement n'empêche jamais d'écrire une activité ou une séance
  (WARNING seulement). Ils n'écrivent que dans `activity_plan_links`.

  Doublons entre sources : même règle que `_shared/activityDedup.ts` (départ à
  ±2 min, sports égaux ou inconnus) ; seule la meilleure copie (montre, puis
  fichier ; avec distance d'abord) est rapprochée.

  Additive. Tests : supabase/tests/activity_plan_links.sql.
*/

-- ═══════════════ 1. Table ═════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.activity_plan_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_id   uuid NOT NULL REFERENCES public.provider_activities(id) ON DELETE CASCADE,
  -- Source de l'activité (visibilité coach / consentement, politique IA).
  source        public.data_source NOT NULL,
  planned_kind  text NOT NULL CHECK (planned_kind IN ('energy', 'workout', 'test')),
  planned_id    uuid NOT NULL,
  local_date    date NOT NULL,
  status        text NOT NULL CHECK (status IN ('auto', 'confirmed', 'rejected')),
  -- Écart activité / prévu (0 = identiques, 1 = rien de comparable).
  cost          real,
  confirmed_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at  timestamptz,
  ai_allowed    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, planned_kind, planned_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS activity_plan_links_one_per_activity
  ON public.activity_plan_links (activity_id) WHERE status <> 'rejected';
CREATE UNIQUE INDEX IF NOT EXISTS activity_plan_links_one_per_planned
  ON public.activity_plan_links (planned_kind, planned_id) WHERE status <> 'rejected';
CREATE INDEX IF NOT EXISTS activity_plan_links_athlete_day
  ON public.activity_plan_links (athlete_id, local_date);

DROP TRIGGER IF EXISTS activity_plan_links_ai_policy ON public.activity_plan_links;
CREATE TRIGGER activity_plan_links_ai_policy
  BEFORE INSERT OR UPDATE OF source ON public.activity_plan_links
  FOR EACH ROW EXECUTE FUNCTION public.apply_source_ai_policy();

ALTER TABLE public.activity_plan_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activity_plan_links_read ON public.activity_plan_links;
CREATE POLICY activity_plan_links_read ON public.activity_plan_links
  FOR SELECT TO authenticated
  USING (public.activity_detail_visible(athlete_id, source));
REVOKE INSERT, UPDATE, DELETE ON public.activity_plan_links FROM anon, authenticated;

-- ═══════════════ 2. Familles de sport ═════════════════════════════════════════

/*
  Famille d'une activité de montre (sport normalisé des décodeurs, ou type
  Garmin). Même liste « course » que src/lib/watchRunMatching.ts. `training`
  (sport FIT générique) = renforcement / cardio en salle.
*/
CREATE OR REPLACE FUNCTION public.activity_sport_family(p_sport text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN k IS NULL OR k = '' THEN NULL
    WHEN k IN ('running', 'run', 'trailrunning', 'trailrun', 'treadmillrunning', 'treadmill', 'indoorrunning',
               'trackrunning', 'streetrunning', 'virtualrun', 'virtualrunning', 'ultrarun', 'ultrarunning',
               'obstaclerun') THEN 'run'
    WHEN k LIKE '%hyrox%' THEN 'hyrox'
    WHEN k LIKE '%cycling%' OR k LIKE '%biking%' OR k IN ('ride', 'virtualride', 'bike', 'cyclocross') THEN 'bike'
    WHEN k LIKE '%rowing%' THEN 'row'
    WHEN k LIKE '%swim%' THEN 'swim'
    WHEN k IN ('training', 'strengthtraining', 'strength', 'hiit', 'cardio', 'cardiotraining', 'indoorcardio',
               'fitnessequipment', 'crossfit', 'functionaltraining', 'bootcamp') THEN 'strength'
    ELSE 'other'
  END
  FROM (SELECT lower(regexp_replace(coalesce(p_sport, ''), '[^a-zA-Z0-9]', '', 'g')) AS k) x;
$$;

/*
  Familles d'activité acceptées pour une famille de séance prévue. HYROX :
  enregistré selon la montre en HYROX, course, renforcement ou rameur.
*/
CREATE OR REPLACE FUNCTION public.plan_family_accepts(p_planned text, p_activity text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_planned IS NOT NULL AND p_activity IS NOT NULL AND CASE p_planned
    WHEN 'hyrox' THEN p_activity IN ('hyrox', 'run', 'strength', 'row')
    WHEN 'strength' THEN p_activity IN ('strength', 'hyrox')
    ELSE p_activity = p_planned
  END;
$$;

-- ═══════════════ 3. Séances prévues d'un jour ═════════════════════════════════

/*
  Séances prévues (non annulées) d'un athlète un jour donné, avec leur famille
  et ce qu'on peut comparer (distance, durée). Famille `NULL` = on ne sait pas
  quel sport (« Autre », personnalisé sans sport) : jamais rapprochée
  automatiquement, seulement à la main.
*/
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
   WHERE t.athlete_id = p_athlete AND t.date = p_day;
$$;
REVOKE ALL ON FUNCTION public.planned_sessions_of_day(uuid, date) FROM PUBLIC, anon, authenticated;

-- ═══════════════ 4. Rapprochement d'un jour ═══════════════════════════════════

CREATE OR REPLACE FUNCTION public.plan_match_cost(a_dist real, a_dur real, p_dist real, p_dur real)
RETURNS real LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(avg(d), 1)::real FROM (
    SELECT abs(a_dist - p_dist) / greatest(a_dist, p_dist) AS d WHERE a_dist > 0 AND p_dist > 0
    UNION ALL
    SELECT abs(a_dur - p_dur) / greatest(a_dur, p_dur) WHERE a_dur > 0 AND p_dur > 0
  ) x;
$$;

/*
  Recalcule les liens `auto` d'un athlète pour un jour. Les liens confirmés et
  refusés ne sont jamais touchés ; une activité ou une séance déjà confirmée
  sort du jeu ; un couple refusé n'est jamais reproposé. Glouton, le couple le
  plus proche d'abord (même règle que watchRunMatching.matchOneToOne).
*/
CREATE OR REPLACE FUNCTION public.auto_link_day(p_athlete uuid, p_day date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  IF p_athlete IS NULL OR p_day IS NULL THEN RETURN 0; END IF;
  -- Un seul calcul à la fois pour cet athlète et ce jour.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_athlete::text || p_day::text, 41));

  DELETE FROM public.activity_plan_links WHERE athlete_id = p_athlete AND local_date = p_day AND status = 'auto';
  IF NOT EXISTS (SELECT 1 FROM public.provider_activities WHERE athlete_id = p_athlete AND local_date = p_day) THEN
    RETURN 0;
  END IF;

  FOR r IN
    WITH acts AS (
      SELECT a.id, a.source, a.started_at, a.distance_m::real AS dist, a.duration_s::real AS dur,
             public.activity_sport_family(a.sport) AS family
        FROM public.provider_activities a
       WHERE a.athlete_id = p_athlete AND a.local_date = p_day
         AND NOT EXISTS (SELECT 1 FROM public.activity_plan_links l
                          WHERE l.activity_id = a.id AND l.status = 'confirmed')
         -- Doublon d'une meilleure copie de la même sortie : écarté.
         AND NOT EXISTS (
           SELECT 1 FROM public.provider_activities b
            WHERE b.athlete_id = a.athlete_id AND b.id <> a.id
              AND abs(extract(epoch FROM b.started_at - a.started_at)) <= 120
              AND (a.sport IS NULL OR b.sport IS NULL OR lower(a.sport) = lower(b.sport))
              AND (CASE WHEN b.source IN ('garmin', 'coros') THEN 0 WHEN b.source = 'file_import' THEN 1 ELSE 2 END * 10
                   + CASE WHEN b.distance_m > 0 THEN 0 ELSE 1 END, b.id::text)
                < (CASE WHEN a.source IN ('garmin', 'coros') THEN 0 WHEN a.source = 'file_import' THEN 1 ELSE 2 END * 10
                   + CASE WHEN a.distance_m > 0 THEN 0 ELSE 1 END, a.id::text))
    ),
    plans AS (
      SELECT p.* FROM public.planned_sessions_of_day(p_athlete, p_day) p
       WHERE NOT EXISTS (SELECT 1 FROM public.activity_plan_links l
                          WHERE l.planned_kind = p.kind AND l.planned_id = p.id AND l.status = 'confirmed')
    )
    SELECT a.id AS activity_id, a.source, p.kind, p.id AS planned_id,
           public.plan_match_cost(a.dist, a.dur, p.distance_m, p.duration_s) AS cost, a.started_at
      FROM acts a JOIN plans p ON public.plan_family_accepts(p.family, a.family)
     WHERE NOT EXISTS (SELECT 1 FROM public.activity_plan_links l
                        WHERE l.activity_id = a.id AND l.planned_kind = p.kind AND l.planned_id = p.id
                          AND l.status = 'rejected')
     ORDER BY 5, a.started_at, a.id, p.id
  LOOP
    IF EXISTS (SELECT 1 FROM public.activity_plan_links l
                WHERE l.status <> 'rejected'
                  AND (l.activity_id = r.activity_id OR (l.planned_kind = r.kind AND l.planned_id = r.planned_id))) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.activity_plan_links (athlete_id, activity_id, source, planned_kind, planned_id, local_date, status, cost)
    VALUES (p_athlete, r.activity_id, r.source, r.kind, r.planned_id, p_day, 'auto', r.cost);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_link_day(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_link_day(uuid, date) TO service_role;

-- ═══════════════ 5. Triggers (protégés) ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_plan_links_relink()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_day date;
  v_new_day date;
  v_kind text := CASE TG_TABLE_NAME WHEN 'energy_session_assignments' THEN 'energy'
                                    WHEN 'workout_logs' THEN 'workout'
                                    WHEN 'test_sessions' THEN 'test' END;
BEGIN
  IF TG_TABLE_NAME = 'provider_activities' THEN
    IF TG_OP <> 'INSERT' THEN v_old_day := OLD.local_date; END IF;
    IF TG_OP <> 'DELETE' THEN v_new_day := NEW.local_date; END IF;
  ELSIF TG_TABLE_NAME = 'test_sessions' THEN
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

DROP TRIGGER IF EXISTS provider_activities_plan_links ON public.provider_activities;
CREATE TRIGGER provider_activities_plan_links
  AFTER INSERT OR DELETE OR UPDATE OF local_date, sport, distance_m, duration_s, started_at ON public.provider_activities
  FOR EACH ROW EXECUTE FUNCTION public.tg_plan_links_relink();

DROP TRIGGER IF EXISTS energy_session_assignments_plan_links ON public.energy_session_assignments;
CREATE TRIGGER energy_session_assignments_plan_links
  AFTER INSERT OR DELETE OR UPDATE OF scheduled_date, status, activity_type, distance_km, actual_duration_min
  ON public.energy_session_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tg_plan_links_relink();

DROP TRIGGER IF EXISTS workout_logs_plan_links ON public.workout_logs;
CREATE TRIGGER workout_logs_plan_links
  AFTER INSERT OR DELETE OR UPDATE OF scheduled_date, status, duration_s ON public.workout_logs
  FOR EACH ROW EXECUTE FUNCTION public.tg_plan_links_relink();

DROP TRIGGER IF EXISTS test_sessions_plan_links ON public.test_sessions;
CREATE TRIGGER test_sessions_plan_links
  AFTER INSERT OR DELETE OR UPDATE OF date, type ON public.test_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_plan_links_relink();

-- ═══════════════ 6. Décisions : athlète ou coach ══════════════════════════════

CREATE OR REPLACE FUNCTION public.decide_plan_link(p_link uuid, p_confirm boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v record;
BEGIN
  SELECT * INTO v FROM public.activity_plan_links WHERE id = p_link FOR UPDATE;
  IF NOT FOUND OR NOT public.activity_laps_editor(v.athlete_id) THEN
    RAISE EXCEPTION 'decide_plan_link : non autorisé' USING ERRCODE = '42501';
  END IF;
  IF p_confirm AND v.status = 'rejected' THEN
    RAISE EXCEPTION 'decide_plan_link : lien refusé, à recréer avec link_activity_to_plan' USING ERRCODE = '22023';
  END IF;
  UPDATE public.activity_plan_links
     SET status = CASE WHEN p_confirm THEN 'confirmed' ELSE 'rejected' END,
         confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now()
   WHERE id = p_link;
  -- Refus : l'activité et la séance redeviennent libres, autre couple possible.
  IF NOT p_confirm THEN
    PERFORM public.auto_link_day(v.athlete_id, v.local_date);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.decide_plan_link(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_plan_link(uuid, boolean) TO authenticated;

/*
  Rattachement choisi à la main (autre séance que la proposition, ou séance
  « Autre » jamais proposée). Remplace les propositions automatiques de
  l'activité et de la séance ; refuse si l'une des deux est déjà confirmée
  ailleurs (la défaire d'abord). Jour : celui de l'activité.
*/
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

/*
  Séances prévues rattachées à une activité (lien actif), parmi `p_ids`. Pour
  `deletePlannedWorkouts` : une séance liée compte comme réalisée et n'est
  jamais supprimée par une opération de planification, même quand le coach ne
  voit pas l'activité (consentement Garmin) — d'où SECURITY DEFINER. Ne
  renvoie que des identifiants de séances que l'appelant peut modifier.
*/
CREATE OR REPLACE FUNCTION public.linked_planned_ids(p_kind text, p_ids uuid[])
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.planned_id FROM public.activity_plan_links l
   WHERE l.planned_kind = p_kind AND l.planned_id = ANY (p_ids) AND l.status <> 'rejected'
     AND public.activity_laps_editor(l.athlete_id);
$$;
REVOKE ALL ON FUNCTION public.linked_planned_ids(text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.linked_planned_ids(text, uuid[]) TO authenticated;

-- ═══════════════ 7. Premier calcul (jours avec activité) ══════════════════════

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT DISTINCT athlete_id, local_date FROM public.provider_activities LOOP
    PERFORM public.auto_link_day(r.athlete_id, r.local_date);
  END LOOP;
END $$;
