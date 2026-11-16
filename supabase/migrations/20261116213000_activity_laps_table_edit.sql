/*
  « Modifier tours » : tableau des tours entièrement modifiable (demande d'Hugo du 16/11/2026).

  Décisions d'Hugo (16/11) :
  - durée modifiée = la limite du tour se déplace sur la courbe (rien de nouveau en base) ;
  - supprimer un tour = son temps rejoint le tour voisin (rien de nouveau en base) ;
  - ajouter un tour = couper la courbe, OU un tour tapé à la main hors courbe
    (montre oubliée / arrêtée) : durée, distance, type, sans FC ;
  - type de tour : Échauffement · Effort · Récupération · Retour au calme ;
  - tout se modifie sauf la FC (données de la montre) : cadence, D+ / D−,
    allure max, puissance corrigées vivent à côté des valeurs calculées ;
  - athlète et coach (référent ou co-coach) : mêmes droits qu'aujourd'hui ;
  - les chiffres corrigés ne valent que pour l'écran de la séance (volume de la
    semaine, charge et IA gardent la montre).

  Le flux brut de la montre n'est jamais touché : `activity_streams` (série et
  `watch_laps`) reste tel quel ; « Revenir aux tours de la montre » efface tout.

  Additive : 3 colonnes nullable sur `activity_laps`, `save_activity_laps`
  remplacée (même signature, mêmes droits, même contrôle de version).
  RGPD : export (`select *`) et suppression (cascade profiles) couvrent déjà la table.
  Tests : supabase/tests/activity_laps_table_edit.sql.
*/

ALTER TABLE public.activity_laps
  ADD COLUMN IF NOT EXISTS lap_type text
    CHECK (lap_type IS NULL OR lap_type IN ('warmup', 'work', 'recovery', 'cooldown')),
  -- Tour tapé à la main hors courbe : posé à un instant (start_s = end_s), durée ici.
  ADD COLUMN IF NOT EXISTS manual_duration_s integer
    CHECK (manual_duration_s IS NULL OR (manual_duration_s > 0 AND manual_duration_s <= 86400)),
  -- Valeurs corrigées à la main (jamais la FC) : { "avgCadence": 172, "ascentM": 12, … }.
  ADD COLUMN IF NOT EXISTS overrides jsonb
    CHECK (overrides IS NULL OR (jsonb_typeof(overrides) = 'object' AND length(overrides::text) <= 1000));

/** Garde seulement les valeurs corrigeables connues, numériques, ≥ 0 ; la FC n'y entre jamais. */
CREATE OR REPLACE FUNCTION public.activity_lap_overrides(p jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT nullif(coalesce(jsonb_object_agg(k, v), '{}'::jsonb), '{}'::jsonb)
    FROM jsonb_each(CASE WHEN jsonb_typeof(p) = 'object' THEN p ELSE '{}'::jsonb END) AS x(k, v)
   WHERE k IN ('maxPaceSPerKm', 'avgCadence', 'maxCadence', 'ascentM', 'descentM', 'avgPower', 'maxPower')
     AND jsonb_typeof(v) = 'number'
     AND (v #>> '{}')::numeric >= 0
     AND (v #>> '{}')::numeric <= 100000;
$$;

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
     SET laps_version = laps_version + 1, laps_edited = true, updated_at = now()
   WHERE activity_id = p_activity;
  RETURN v_s.laps_version + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.save_activity_laps(uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_activity_laps(uuid, integer, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.activity_lap_overrides(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activity_lap_overrides(jsonb) TO authenticated;
