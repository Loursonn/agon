/*
  « Modifier tours » : l'athlète voit, discrètement, que son coach a modifié ses tours
  (choix d'Hugo du 16/11/2026 : « Tours modifiés par ton coach », sans notification).

  Retient qui a enregistré les tours en dernier : `activity_streams.laps_edited_by`.
  - `save_activity_laps` l'écrit (auth.uid()) ;
  - `reset_activity_laps_to_watch` l'efface (retour aux tours de la montre).
  Les deux fonctions sont remplacées à l'identique (même signature, mêmes droits),
  seule la ligne UPDATE de `activity_streams` change.

  Additive : une colonne nullable ; l'ancien client continue de fonctionner.
  RGPD : l'identifiant d'un coach, mis à null si son compte est supprimé ;
  export (`select *`) et suppression (cascade de l'athlète) couvrent déjà la table.
  Tests : supabase/tests/activity_laps_edited_by.sql.
*/

ALTER TABLE public.activity_streams
  ADD COLUMN IF NOT EXISTS laps_edited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.save_activity_laps(p_activity uuid, p_expected_version integer, p_laps jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s      record;
  v_end    integer;
  v_prev   integer := 0;
  v_e      jsonb;
  v_start  integer;
  v_stop   integer;
  v_manual integer;
  v_n      integer;
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
  -- Un tour manuel (durée tapée, hors courbe) est posé à un instant : start_s = end_s.
  v_end := coalesce(v_s.t[array_length(v_s.t, 1)], 0) + 1;
  FOR v_e IN SELECT e FROM jsonb_array_elements(p_laps) WITH ORDINALITY x(e, o) ORDER BY o LOOP
    v_start := (v_e->>'start_s')::integer;
    v_stop := (v_e->>'end_s')::integer;
    v_manual := (v_e->>'manual_duration_s')::integer;
    IF v_manual IS NOT NULL AND (v_manual <= 0 OR v_manual > 86400) THEN
      RAISE EXCEPTION 'save_activity_laps : durée de tour manuel invalide (%)', v_manual USING ERRCODE = '22023';
    END IF;
    IF v_start IS NULL OR v_stop IS NULL OR v_start < v_prev OR v_stop > v_end
       OR (v_manual IS NULL AND v_stop <= v_start)
       OR (v_manual IS NOT NULL AND v_stop <> v_start) THEN
      RAISE EXCEPTION 'save_activity_laps : bornes de tour invalides (% → %)', v_start, v_stop USING ERRCODE = '22023';
    END IF;
    IF v_e->>'lap_type' IS NOT NULL AND v_e->>'lap_type' NOT IN ('warmup', 'work', 'recovery', 'cooldown') THEN
      RAISE EXCEPTION 'save_activity_laps : type de tour inconnu (%)', v_e->>'lap_type' USING ERRCODE = '22023';
    END IF;
    v_prev := v_stop;
  END LOOP;

  DELETE FROM public.activity_laps WHERE activity_id = p_activity;
  INSERT INTO public.activity_laps (activity_id, athlete_id, source, position, start_s, end_s, name, exercise_id,
                                    planned_block_ref, distance_override_m, reps, load_kg, origin, status, needs_review, comment,
                                    lap_type, manual_duration_s, overrides)
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
         left(nullif(btrim(e->>'comment'), ''), 500),
         e->>'lap_type',
         (e->>'manual_duration_s')::integer,
         public.activity_lap_overrides(e->'overrides')
    FROM jsonb_array_elements(p_laps) WITH ORDINALITY x(e, o);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.activity_streams
     SET laps_version = laps_version + 1, laps_edited = true, laps_edited_by = auth.uid(), updated_at = now()
   WHERE activity_id = p_activity;
  RETURN v_s.laps_version + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.save_activity_laps(uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_activity_laps(uuid, integer, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION "public"."reset_activity_laps_to_watch"("p_activity" "uuid", "p_expected_version" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_s record;
BEGIN
  SELECT s.activity_id, s.athlete_id, s.source, s.laps_version, s.watch_laps INTO v_s
    FROM public.activity_streams s WHERE s.activity_id = p_activity FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reset_activity_laps_to_watch : activité sans série' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.activity_laps_editor(v_s.athlete_id) THEN
    RAISE EXCEPTION 'reset_activity_laps_to_watch : non autorisé' USING ERRCODE = '42501';
  END IF;
  IF v_s.laps_version <> p_expected_version THEN
    RAISE EXCEPTION 'reset_activity_laps_to_watch : les tours ont été modifiés entre-temps (version %)', v_s.laps_version
      USING ERRCODE = '40001';
  END IF;

  DELETE FROM public.activity_laps WHERE activity_id = p_activity;
  INSERT INTO public.activity_laps (activity_id, athlete_id, source, position, start_s, end_s, origin, status)
  SELECT p_activity, v_s.athlete_id, v_s.source, o::integer,
         round((e->>'startS')::numeric)::integer,
         greatest(round((e->>'endS')::numeric)::integer, round((e->>'startS')::numeric)::integer),
         'watch', 'validated'
    FROM jsonb_array_elements(coalesce(v_s.watch_laps, '[]'::jsonb)) WITH ORDINALITY x(e, o);

  UPDATE public.activity_streams
     SET laps_version = laps_version + 1, laps_edited = false, laps_edited_by = NULL, updated_at = now()
   WHERE activity_id = p_activity;
  RETURN v_s.laps_version + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.reset_activity_laps_to_watch(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_activity_laps_to_watch(uuid, integer) TO authenticated;
