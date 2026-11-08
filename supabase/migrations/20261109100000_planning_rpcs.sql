-- =============================================================================
-- Planning (cycles et semaines) — écritures atomiques
-- Couche données `src/api/cycles.ts` (docs/COUCHE_API.md).
--
-- Additif et compatible avec le client en production (`main`) : deux nouvelles
-- fonctions que seul le nouveau client appelle ; aucune table, colonne ni
-- policy touchée. Le client actuel continue d'écrire directement.
--
-- Pourquoi des RPC :
--  * créer un cycle faisait 3 allers-retours (cycle, semaines, séances) : une
--    panne au milieu laissait un cycle sans semaines ou sans séances. Et
--    l'upsert des séances (« créer un cycle depuis le bloc ») repassait en
--    « prévue » une séance déjà RÉALISÉE le même jour (statut écrasé) ;
--  * changer les dates d'un cycle (tiroir, glisser, redimensionner, réenchaîner
--    un méso) faisait 4 à 5 écritures dont les erreurs étaient ignorées : une
--    panne laissait un cycle sans semaines, ou des semaines en double.
--
-- Règle commune (identique à `deletePlannedWorkouts` de src/api/workouts.ts) :
-- une séance est « réelle » dès qu'elle est validée, commencée
-- (`athlete_modifications`) ou notée (`rpe_score`). Une opération de
-- planification ne la supprime ni ne la modifie jamais ; au plus, elle perd
-- son rattachement à une semaine supprimée (clé étrangère ON DELETE SET NULL).
--
-- Droits : `can_coach_athlete` — la même règle que les policies de `cycles`
-- et `microcycles` (coach référent ou co-coach via `is_coach_of`, ou coach qui
-- planifie pour lui-même). Jamais `coach_id = auth.uid()`.
--
-- Rollback : DROP FUNCTION public.create_cycle(uuid,text,date,date,uuid,integer,jsonb),
--            public.set_cycle_dates(uuid,date,date,uuid,boolean,boolean,boolean);
-- =============================================================================

-- ── 1. Créer un cycle, ses semaines et ses séances prévues ──────────────────
-- p_sessions : [{ "session_id": text, "session_name": text, "day_of_week": 0-6 }]
-- (0 = lundi). Une séance par semaine et par entrée, à `lundi + day_of_week`.
-- Une séance déjà posée ce jour-là est rattachée à la nouvelle semaine ; son
-- statut, son nom et son coach ne changent que si elle n'est pas réelle.
CREATE OR REPLACE FUNCTION public.create_cycle(
  p_athlete     uuid,
  p_name        text,
  p_start       date,
  p_end         date,
  p_mesocycle   uuid    DEFAULT NULL,
  p_deload_week integer DEFAULT NULL,
  p_sessions    jsonb   DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_cycle public.cycles;
  v_weeks integer;
  v_logs  integer;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_athlete IS NULL OR p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'Athlète et dates obligatoires' USING ERRCODE = '22023';
  END IF;
  IF p_end <= p_start THEN
    RAISE EXCEPTION 'Dates invalides' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_name), '') = '' THEN
    RAISE EXCEPTION 'Nom obligatoire' USING ERRCODE = '22023';
  END IF;
  IF p_sessions IS NOT NULL AND jsonb_typeof(p_sessions) <> 'array' THEN
    RAISE EXCEPTION 'Séances invalides' USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_coach_athlete(p_athlete) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  IF p_mesocycle IS NOT NULL AND public.mesocycle_athlete_id(p_mesocycle) IS DISTINCT FROM p_athlete THEN
    RAISE EXCEPTION 'Mésocycle d''un autre athlète' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.cycles (mesocycle_id, athlete_id, coach_id, name, start_date, end_date)
  VALUES (p_mesocycle, p_athlete, v_me, btrim(p_name), p_start, p_end)
  RETURNING * INTO v_cycle;

  -- Une semaine (lundi → dimanche) par semaine ISO couverte.
  INSERT INTO public.microcycles (cycle_id, week_number, start_date, end_date, is_deload)
  SELECT v_cycle.id, g.n, g.ws::date, g.ws::date + 6, coalesce(g.n = p_deload_week, false)
  FROM generate_series(date_trunc('week', p_start::timestamp), p_end::timestamp, interval '7 days')
       WITH ORDINALITY AS g(ws, n);
  GET DIAGNOSTICS v_weeks = ROW_COUNT;

  INSERT INTO public.workout_logs AS w
    (athlete_id, coach_id, session_id, session_name, scheduled_date, status, microcycle_id)
  SELECT DISTINCT ON (s.session_id, m.start_date + s.dow)
         p_athlete, v_me, s.session_id, s.session_name, m.start_date + s.dow, 'planned', m.id
  FROM public.microcycles m
  CROSS JOIN (
    SELECT e ->> 'session_id' AS session_id,
           coalesce(nullif(btrim(e ->> 'session_name'), ''), 'Séance') AS session_name,
           (e ->> 'day_of_week')::integer AS dow,
           ord
    FROM jsonb_array_elements(coalesce(p_sessions, '[]'::jsonb)) WITH ORDINALITY AS x(e, ord)
    WHERE jsonb_typeof(e) = 'object'
  ) s
  WHERE m.cycle_id = v_cycle.id
    AND coalesce(s.session_id, '') <> ''
    AND s.dow BETWEEN 0 AND 6
  ORDER BY s.session_id, m.start_date + s.dow, s.ord   -- doublon : la 1re entrée gagne
  ON CONFLICT (athlete_id, session_id, scheduled_date) DO UPDATE SET
    microcycle_id = EXCLUDED.microcycle_id,
    status = CASE
      WHEN w.status = 'completed' OR w.athlete_modifications IS NOT NULL OR w.rpe_score IS NOT NULL
      THEN w.status ELSE 'planned' END,
    session_name = CASE
      WHEN w.status = 'completed' OR w.athlete_modifications IS NOT NULL OR w.rpe_score IS NOT NULL
      THEN w.session_name ELSE EXCLUDED.session_name END,
    coach_id = CASE
      WHEN w.status = 'completed' OR w.athlete_modifications IS NOT NULL OR w.rpe_score IS NOT NULL
      THEN w.coach_id ELSE EXCLUDED.coach_id END;
  GET DIAGNOSTICS v_logs = ROW_COUNT;

  RETURN jsonb_build_object('cycle', to_jsonb(v_cycle), 'weeks', v_weeks, 'sessions', v_logs);
END;
$$;

REVOKE ALL ON FUNCTION public.create_cycle(uuid, text, date, date, uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_cycle(uuid, text, date, date, uuid, integer, jsonb) TO authenticated;

-- ── 2. Changer les dates d'un cycle (et régénérer ses semaines) ─────────────
-- * Les semaines encore couvertes sont gardées (semaine allégée, séances
--   rattachées) ; celles qui sortent sont supprimées, les manquantes créées ;
--   les semaines sont renumérotées 1..n dans l'ordre des dates (avant, un
--   début avancé créait une 2ᵉ « semaine 1 »).
-- * p_drop_planned : les séances prévues sans trace des semaines supprimées
--   sont retirées ; les réelles sont gardées (détachées).
-- * p_trim_after_end : si la fin recule, les séances prévues sans trace entre
--   la nouvelle et l'ancienne fin sont retirées (« arrêter le cycle »).
-- * p_change_mesocycle : rattache aussi le cycle à p_mesocycle (NULL = aucun).
CREATE OR REPLACE FUNCTION public.set_cycle_dates(
  p_cycle            uuid,
  p_start            date,
  p_end              date,
  p_mesocycle        uuid    DEFAULT NULL,
  p_change_mesocycle boolean DEFAULT false,
  p_drop_planned     boolean DEFAULT true,
  p_trim_after_end   boolean DEFAULT false
)
RETURNS public.cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      uuid := auth.uid();
  v_row     public.cycles;
  v_athlete uuid;
  v_old_end date;
  v_gone    uuid[];
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_cycle IS NULL OR p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'Cycle et dates obligatoires' USING ERRCODE = '22023';
  END IF;
  IF p_end <= p_start THEN
    RAISE EXCEPTION 'Dates invalides' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.cycles WHERE id = p_cycle FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cycle introuvable' USING ERRCODE = 'P0002';
  END IF;
  v_athlete := public.cycle_athlete_id(p_cycle);
  IF NOT public.can_coach_athlete(v_athlete) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  IF p_change_mesocycle AND p_mesocycle IS NOT NULL
     AND public.mesocycle_athlete_id(p_mesocycle) IS DISTINCT FROM v_athlete THEN
    RAISE EXCEPTION 'Mésocycle d''un autre athlète' USING ERRCODE = '42501';
  END IF;

  v_old_end := v_row.end_date;
  UPDATE public.cycles
     SET start_date   = p_start,
         end_date     = p_end,
         mesocycle_id = CASE WHEN p_change_mesocycle THEN p_mesocycle ELSE mesocycle_id END
   WHERE id = p_cycle
  RETURNING * INTO v_row;

  -- Semaines qui sortent de la nouvelle période.
  SELECT array_agg(m.id) INTO v_gone
  FROM public.microcycles m
  WHERE m.cycle_id = p_cycle
    AND m.start_date NOT IN (
      SELECT g::date FROM generate_series(date_trunc('week', p_start::timestamp), p_end::timestamp, interval '7 days') g
    );

  IF v_gone IS NOT NULL THEN
    IF p_drop_planned THEN
      DELETE FROM public.workout_logs w
       WHERE w.microcycle_id = ANY (v_gone)
         AND w.athlete_id = v_athlete
         AND w.status <> 'completed'
         AND w.athlete_modifications IS NULL
         AND w.rpe_score IS NULL;
    END IF;
    DELETE FROM public.microcycles WHERE id = ANY (v_gone);
  END IF;

  -- Semaines manquantes.
  INSERT INTO public.microcycles (cycle_id, week_number, start_date, end_date, is_deload)
  SELECT p_cycle, 1, g::date, g::date + 6, false
  FROM generate_series(date_trunc('week', p_start::timestamp), p_end::timestamp, interval '7 days') g
  WHERE NOT EXISTS (
    SELECT 1 FROM public.microcycles m WHERE m.cycle_id = p_cycle AND m.start_date = g::date
  );

  -- Numérotation 1..n dans l'ordre des dates.
  UPDATE public.microcycles m
     SET week_number = n.rn
    FROM (SELECT id, row_number() OVER (ORDER BY start_date) AS rn
            FROM public.microcycles WHERE cycle_id = p_cycle) n
   WHERE m.id = n.id AND m.week_number IS DISTINCT FROM n.rn;

  IF p_trim_after_end AND p_end < v_old_end THEN
    DELETE FROM public.workout_logs w
     WHERE w.athlete_id = v_athlete
       AND w.scheduled_date > p_end
       AND w.scheduled_date <= v_old_end
       AND w.status <> 'completed'
       AND w.athlete_modifications IS NULL
       AND w.rpe_score IS NULL;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_cycle_dates(uuid, date, date, uuid, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_cycle_dates(uuid, date, date, uuid, boolean, boolean, boolean) TO authenticated;
