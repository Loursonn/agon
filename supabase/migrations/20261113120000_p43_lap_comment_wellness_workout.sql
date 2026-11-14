/*
  P43 : backend des planches retenues (12/11).

  1. « C'est bien cette séance » (HyroxConfirmerTel) : un commentaire par tour
     ou station (« Poignées glissantes, j'ai lâché 2 fois »). Colonne
     `activity_laps.comment`, écrite par `save_activity_laps` (même RPC, même
     contrôle de version, mêmes droits : athlète, coach référent ou co-coach).
  2. Wellness (AthleteWellness) : « Séance d'hier · les zones sont rattachées à
     cette séance pour ton coach ». La saisie (`asp:wh`) garde
     `domsWorkout: { id, name }` ; la projection `wellness_entries` l'expose au
     coach (`doms_workout_id`, `doms_workout_name`). Pas de clé étrangère : la
     projection est recalculée depuis `app_data`, une séance supprimée ne doit
     pas la bloquer (le nom gardé suffit à l'afficher).

  Additive : 3 colonnes nullable, fonctions remplacées (mêmes signatures, mêmes
  droits). Aucune donnée réécrite. RGPD : export (`select *`) et suppression
  (cascade profiles) couvrent déjà ces tables.
  Tests : supabase/tests/p43_lap_comment_wellness_workout.sql.
*/

ALTER TABLE public.activity_laps
  ADD COLUMN IF NOT EXISTS comment text CHECK (comment IS NULL OR length(comment) <= 500);

ALTER TABLE public.wellness_entries
  ADD COLUMN IF NOT EXISTS doms_workout_id uuid,
  ADD COLUMN IF NOT EXISTS doms_workout_name text CHECK (doms_workout_name IS NULL OR length(doms_workout_name) <= 200);

CREATE OR REPLACE FUNCTION public.health_parse_wellness(p_athlete uuid, p_key text, p_v jsonb, p_archived boolean)
RETURNS public.wellness_entries
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  r     public.wellness_entries;
  items jsonb;
  w     numeric;
BEGIN
  IF p_v IS NULL OR jsonb_typeof(p_v) <> 'object' THEN RETURN NULL; END IF;
  r.day := coalesce(public.health_day(p_key),
                    CASE WHEN jsonb_typeof(p_v->'date') = 'string' THEN public.health_day(p_v->>'date') END);
  IF r.day IS NULL THEN RETURN NULL; END IF;

  r.athlete_id := p_athlete;
  items := CASE WHEN jsonb_typeof(p_v->'items') = 'object' THEN p_v->'items' ELSE p_v END;
  r.fatigue := public.health_item(items->'fatigue');
  r.sommeil := public.health_item(items->'sommeil');
  r.stress  := public.health_item(items->'stress');
  r.energie := public.health_item(items->'energie');
  r.doms    := public.health_item(items->'doms');
  r.envie   := public.health_item(items->'envie');

  r.bedtime := public.health_hm(p_v->'coucher');
  r.wake    := public.health_hm(p_v->'reveil');
  r.sleep_hours := CASE WHEN public.health_num(p_v->'sleepDur') BETWEEN 0 AND 24 THEN public.health_num(p_v->'sleepDur') END;
  r.sleep_interrupted := CASE WHEN jsonb_typeof(p_v->'sleepInterrupt') = 'boolean' THEN (p_v->>'sleepInterrupt')::boolean END;
  r.sleep_interrupt_note := public.health_text(p_v->'sleepInterruptNote');

  r.doms_zones := coalesce((
    SELECT array_agg(z #>> '{}' ORDER BY o)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_v->'domsZones') = 'array' THEN p_v->'domsZones' ELSE '[]'::jsonb END)
           WITH ORDINALITY AS t(z, o)
     WHERE jsonb_typeof(z) = 'string'), '{}');

  -- Points : x, y numériques, side front/back ; id gardé (toujours présent en
  -- prod), sinon "side-x-y" ; intensité seulement si numérique.
  r.doms_points := coalesce((
    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'id', CASE WHEN jsonb_typeof(pt->'id') IN ('string', 'number', 'boolean') THEN pt->>'id'
                        ELSE (pt->>'side') || '-' || public.health_num(pt->'x')::text || '-' || public.health_num(pt->'y')::text END,
             'x', to_jsonb(public.health_num(pt->'x')),
             'y', to_jsonb(public.health_num(pt->'y')),
             'side', pt->>'side',
             'intensity', to_jsonb(public.health_num(pt->'intensity')))) ORDER BY o)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_v->'domsPoints') = 'array' THEN p_v->'domsPoints' ELSE '[]'::jsonb END)
           WITH ORDINALITY AS t(pt, o)
     WHERE jsonb_typeof(pt) = 'object'
       AND public.health_num(pt->'x') IS NOT NULL AND public.health_num(pt->'y') IS NOT NULL
       AND pt->>'side' IN ('front', 'back')), '[]'::jsonb);

  -- Carte du corps par zones (planche wellness 12/11) : { zone: 1 légère | 2 marquée | 3 intense }.
  r.doms_levels := coalesce((
    SELECT jsonb_object_agg(z.k, (z.v #>> '{}')::smallint)
      FROM jsonb_each(CASE WHEN jsonb_typeof(p_v->'domsLevels') = 'object' THEN p_v->'domsLevels' ELSE '{}'::jsonb END) AS z(k, v)
     WHERE jsonb_typeof(z.v) = 'number' AND (z.v #>> '{}')::numeric IN (1, 2, 3)), '{}'::jsonb);
  r.pain := CASE WHEN public.health_num(p_v->'pain') BETWEEN 0 AND 10
                  AND public.health_num(p_v->'pain') = trunc(public.health_num(p_v->'pain'))
                 THEN public.health_num(p_v->'pain')::smallint END;
  r.sick := CASE WHEN jsonb_typeof(p_v->'sick') = 'boolean' THEN (p_v->>'sick')::boolean END;
  -- Séance de la veille à laquelle les courbatures sont rattachées (planche wellness).
  IF jsonb_typeof(p_v->'domsWorkout') = 'object'
     AND (p_v->'domsWorkout'->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    r.doms_workout_id := (p_v->'domsWorkout'->>'id')::uuid;
    r.doms_workout_name := left(public.health_text(p_v->'domsWorkout'->'name'), 200);
  END IF;
  r.injury_note := coalesce(public.health_text(p_v->'injComment'), public.health_text(p_v->'injuryNote'));
  -- `raw.poids ?? raw.weightKg` : poids absent ou null → weightKg.
  w := public.health_num(CASE WHEN jsonb_typeof(p_v->'poids') IS NOT NULL AND jsonb_typeof(p_v->'poids') <> 'null'
                              THEN p_v->'poids' ELSE p_v->'weightKg' END);
  r.weight_kg := CASE WHEN w > 0 THEN w END;
  r.archived := coalesce(p_archived, false);
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.health_sync_wellness(p_athlete uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_athlete IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('health:' || p_athlete::text, 0));
  -- Compte en cours de suppression (cascade) : on ne recrée rien.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_athlete) THEN
    DELETE FROM public.wellness_entries WHERE athlete_id = p_athlete;
    RETURN;
  END IF;

  WITH cand AS (
    -- asp:wh d'abord (rang 0), puis les blocs archivés du plus récent au plus
    -- ancien ; dans un même dictionnaire, la clé compacte gagne sur l'ISO.
    SELECT w.*, 0::bigint AS src_rank,
           CASE WHEN x.k ~ '^\s*[0-9]{8}\s*$' THEN 0 WHEN public.health_day(x.k) IS NOT NULL THEN 1 ELSE 2 END AS key_rank,
           x.k
      FROM public.app_data d
      CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(d.value) = 'object' THEN d.value ELSE '{}'::jsonb END) AS x(k, v)
      CROSS JOIN LATERAL public.health_parse_wellness(p_athlete, x.k, x.v, false) AS w
     WHERE d.athlete_id = p_athlete AND d.key = 'asp:wh' AND w.day IS NOT NULL
    UNION ALL
    SELECT w.*, 1000000 - b.o AS src_rank,
           CASE WHEN x.k ~ '^\s*[0-9]{8}\s*$' THEN 0 WHEN public.health_day(x.k) IS NOT NULL THEN 1 ELSE 2 END,
           x.k
      FROM public.app_data d
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d.value) = 'array' THEN d.value ELSE '[]'::jsonb END)
                 WITH ORDINALITY AS b(blk, o)
      CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(b.blk->'wellnessHistory') = 'object' THEN b.blk->'wellnessHistory' ELSE '{}'::jsonb END) AS x(k, v)
      CROSS JOIN LATERAL public.health_parse_wellness(p_athlete, x.k, x.v, true) AS w
     WHERE d.athlete_id = p_athlete AND d.key = 'asp:blockHistory' AND w.day IS NOT NULL
  ),
  src AS (
    SELECT DISTINCT ON (day) * FROM cand ORDER BY day, src_rank, key_rank, k DESC
  ),
  del AS (
    DELETE FROM public.wellness_entries t
     WHERE t.athlete_id = p_athlete
       AND NOT EXISTS (SELECT 1 FROM src WHERE src.day = t.day)
  )
  INSERT INTO public.wellness_entries AS t (
    athlete_id, day, fatigue, sommeil, stress, energie, doms, bedtime, wake, sleep_hours,
    sleep_interrupted, sleep_interrupt_note, doms_zones, doms_points, injury_note, weight_kg, archived, envie, pain, sick, doms_levels, doms_workout_id, doms_workout_name)
  SELECT p_athlete, day, fatigue, sommeil, stress, energie, doms, bedtime, wake, sleep_hours,
         sleep_interrupted, sleep_interrupt_note, doms_zones, doms_points, injury_note, weight_kg, archived,
         envie, pain, sick, doms_levels, doms_workout_id, doms_workout_name
    FROM src
  ON CONFLICT (athlete_id, day) DO UPDATE SET
    fatigue = EXCLUDED.fatigue, sommeil = EXCLUDED.sommeil, stress = EXCLUDED.stress,
    energie = EXCLUDED.energie, doms = EXCLUDED.doms, bedtime = EXCLUDED.bedtime, wake = EXCLUDED.wake,
    sleep_hours = EXCLUDED.sleep_hours, sleep_interrupted = EXCLUDED.sleep_interrupted,
    sleep_interrupt_note = EXCLUDED.sleep_interrupt_note, doms_zones = EXCLUDED.doms_zones,
    doms_points = EXCLUDED.doms_points, injury_note = EXCLUDED.injury_note,
    weight_kg = EXCLUDED.weight_kg, archived = EXCLUDED.archived, envie = EXCLUDED.envie,
    pain = EXCLUDED.pain, sick = EXCLUDED.sick, doms_levels = EXCLUDED.doms_levels,
    doms_workout_id = EXCLUDED.doms_workout_id, doms_workout_name = EXCLUDED.doms_workout_name, updated_at = now()
  WHERE (t.fatigue, t.sommeil, t.stress, t.energie, t.doms, t.bedtime, t.wake, t.sleep_hours,
         t.sleep_interrupted, t.sleep_interrupt_note, t.doms_zones, t.doms_points, t.injury_note,
         t.weight_kg, t.archived, t.envie, t.pain, t.sick, t.doms_levels, t.doms_workout_id, t.doms_workout_name)
        IS DISTINCT FROM
        (EXCLUDED.fatigue, EXCLUDED.sommeil, EXCLUDED.stress, EXCLUDED.energie, EXCLUDED.doms,
         EXCLUDED.bedtime, EXCLUDED.wake, EXCLUDED.sleep_hours, EXCLUDED.sleep_interrupted,
         EXCLUDED.sleep_interrupt_note, EXCLUDED.doms_zones, EXCLUDED.doms_points, EXCLUDED.injury_note,
         EXCLUDED.weight_kg, EXCLUDED.archived, EXCLUDED.envie, EXCLUDED.pain, EXCLUDED.sick,
         EXCLUDED.doms_levels, EXCLUDED.doms_workout_id, EXCLUDED.doms_workout_name);
END;
$$;

-- health_* gardent leurs droits (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.save_activity_laps(p_activity uuid, p_expected_version integer, p_laps jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s     record;
  v_end   integer;
  v_prev  integer := 0;
  v_e     jsonb;
  v_start integer;
  v_stop  integer;
  v_n     integer;
BEGIN
  SELECT s.activity_id, s.athlete_id, s.source, s.laps_version, s.t INTO v_s
    FROM public.activity_streams s WHERE s.activity_id = p_activity FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'save_activity_laps : activité sans série' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.activity_laps_editor(v_s.athlete_id) THEN
    RAISE EXCEPTION 'save_activity_laps : non autorisé' USING ERRCODE = '42501';
  END IF;
  IF v_s.laps_version <> p_expected_version THEN
    RAISE EXCEPTION 'save_activity_laps : les tours ont été modifiés entre-temps (version %)', v_s.laps_version
      USING ERRCODE = '40001';
  END IF;
  IF p_laps IS NULL OR jsonb_typeof(p_laps) <> 'array' OR jsonb_array_length(p_laps) > 300 THEN
    RAISE EXCEPTION 'save_activity_laps : liste de tours invalide' USING ERRCODE = '22023';
  END IF;

  -- Bornes : dans la séance, croissantes, sans chevauchement (des trous sont permis).
  v_end := coalesce(v_s.t[array_length(v_s.t, 1)], 0) + 1;
  FOR v_e IN SELECT e FROM jsonb_array_elements(p_laps) WITH ORDINALITY x(e, o) ORDER BY o LOOP
    v_start := (v_e->>'start_s')::integer;
    v_stop := (v_e->>'end_s')::integer;
    IF v_start IS NULL OR v_stop IS NULL OR v_start < v_prev OR v_stop <= v_start OR v_stop > v_end THEN
      RAISE EXCEPTION 'save_activity_laps : bornes de tour invalides (% → %)', v_start, v_stop USING ERRCODE = '22023';
    END IF;
    v_prev := v_stop;
  END LOOP;

  DELETE FROM public.activity_laps WHERE activity_id = p_activity;
  INSERT INTO public.activity_laps (activity_id, athlete_id, source, position, start_s, end_s, name, exercise_id,
                                    planned_block_ref, distance_override_m, reps, load_kg, origin, status, needs_review, comment)
  SELECT p_activity, v_s.athlete_id, v_s.source, o::integer,
         (e->>'start_s')::integer, (e->>'end_s')::integer,
         nullif(btrim(e->>'name'), ''),
         (e->>'exercise_id')::uuid,
         e->>'planned_block_ref',
         (e->>'distance_override_m')::real,
         (e->>'reps')::integer,
         (e->>'load_kg')::real,
         coalesce(e->>'origin', 'manual'),
         coalesce(e->>'status', 'validated'),
         coalesce((e->>'needs_review')::boolean, false),
         left(nullif(btrim(e->>'comment'), ''), 500)
    FROM jsonb_array_elements(p_laps) WITH ORDINALITY x(e, o);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.activity_streams
     SET laps_version = laps_version + 1, laps_edited = true, updated_at = now()
   WHERE activity_id = p_activity;
  RETURN v_s.laps_version + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.save_activity_laps(uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_activity_laps(uuid, integer, jsonb) TO authenticated;

