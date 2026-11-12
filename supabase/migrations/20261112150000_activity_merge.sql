/*
  P42 lot B — une sortie = une seule ligne, quelle que soit la source.

  Règles (décisions d'Hugo du 2026-11-12, docs/DECISIONS.md) :
    - quand une sortie existe déjà, la nouvelle source COMPLÈTE : champs vides,
      titre, description, RPE, matériel. Une valeur déjà présente n'est pas
      écrasée, sauf par une source de meilleure qualité (ci-dessous) ;
    - qualité : rang = qualité de la courbe d'origine (fit > tcx > gpx >
      résumé seul) puis source (montre par API > fichier) ; les mesures
      viennent de la meilleure copie. Le résultat ne dépend pas de l'ordre
      d'arrivée (Garmin puis Strava = Strava puis Garmin) ;
    - la ligne prend la source de la meilleure copie : une sortie Garmin
      complétée par Strava reste une ligne `garmin` (consentement, IA,
      désinscription Garmin), avec `sources = {garmin, strava_archive}` ;
    - série et tours : remplacés seulement par une série de meilleure qualité,
      et les tours modifiés à la main ne sont jamais touchés ;
    - ré-import identique : rien ne bouge (`unchanged`).

  Colonnes ajoutées à provider_activities : title, description, rpe (1-10),
  gear, commute, origin_quality, sources, strava_activity_id (unique par
  athlète). Écriture : `merge_provider_activity` (SECURITY DEFINER, atomique,
  verrou par athlète) — serveur, l'athlète pour ses fichiers, ou son coach
  (référent ou co-coach, is_coach_of) qui dépose l'archive pour lui.

  Additive : le client de production n'appelle rien de nouveau ; l'ancienne
  insertion directe des fichiers (policy provider_activities_own_file_import)
  reste valable.
  Tests à blanc : supabase/tests/activity_merge.sql.
*/

-- ═══════════════ 1. Colonnes ══════════════════════════════════════════════════

ALTER TABLE public.provider_activities
  ADD COLUMN IF NOT EXISTS title              text,
  ADD COLUMN IF NOT EXISTS description        text,
  ADD COLUMN IF NOT EXISTS rpe                smallint,
  ADD COLUMN IF NOT EXISTS gear               text,
  ADD COLUMN IF NOT EXISTS commute            boolean,
  ADD COLUMN IF NOT EXISTS origin_quality     text,
  ADD COLUMN IF NOT EXISTS sources            text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS strava_activity_id text;

ALTER TABLE public.provider_activities DROP CONSTRAINT IF EXISTS provider_activities_merge_checks;
ALTER TABLE public.provider_activities ADD CONSTRAINT provider_activities_merge_checks CHECK (
  (rpe IS NULL OR rpe BETWEEN 1 AND 10)
  AND (title IS NULL OR length(title) <= 300)
  AND (description IS NULL OR length(description) <= 4000)
  AND (gear IS NULL OR length(gear) <= 200)
  AND (origin_quality IS NULL OR origin_quality IN ('fit', 'tcx', 'gpx', 'summary'))
  AND sources <@ ARRAY['garmin', 'coros', 'file', 'strava_archive', 'garmin_export', 'manual']::text[]
  AND (strava_activity_id IS NULL OR strava_activity_id ~ '^[0-9]{1,20}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_activities_strava_id
  ON public.provider_activities (athlete_id, strava_activity_id) WHERE strava_activity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS provider_activities_athlete_started
  ON public.provider_activities (athlete_id, started_at);

-- Lignes existantes : qualité et sources d'après leur origine.
UPDATE public.provider_activities SET
  origin_quality = CASE
    WHEN source IN ('garmin', 'coros') THEN 'fit'
    WHEN raw->>'format' IN ('fit', 'tcx', 'gpx') THEN raw->>'format'
    ELSE 'summary' END,
  sources = ARRAY[CASE source WHEN 'file_import' THEN 'file' ELSE source::text END]
WHERE origin_quality IS NULL OR sources = '{}';

-- ═══════════════ 2. Rangs ═════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.origin_quality_rank(q text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE q WHEN 'fit' THEN 3 WHEN 'tcx' THEN 2 WHEN 'gpx' THEN 1 ELSE 0 END;
$$;

/* Série rangée (activity_streams.normalized_from). Le JSON Garmin vaut un TCX. */
CREATE OR REPLACE FUNCTION public.stream_quality_rank(q text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE q WHEN 'fit' THEN 3 WHEN 'garmin_json' THEN 2 WHEN 'tcx' THEN 2 WHEN 'gpx' THEN 1 ELSE 0 END;
$$;

/* Montre par API > fichier déposé > saisie. */
CREATE OR REPLACE FUNCTION public.source_rank(s public.data_source)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE s WHEN 'garmin' THEN 2 WHEN 'coros' THEN 2 WHEN 'file_import' THEN 1 ELSE 0 END;
$$;

/*
  Deux sports compatibles pour une même sortie : l'un inconnu, ou même
  famille (`activity_sport_family`, P41 lot E), ou HYROX / renforcement (une
  séance HYROX enregistrée en « Entraînement » sur Strava). Course et vélo
  d'un triathlon ne sont jamais confondus. Même règle que
  `_shared/activityDedup.ts` (`sportsCompatible`).
*/
CREATE OR REPLACE FUNCTION public.outing_sports_compatible(a text, b text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT fa IS NULL OR fb IS NULL OR fa = fb OR (fa IN ('hyrox', 'strength') AND fb IN ('hyrox', 'strength'))
  FROM (SELECT public.activity_sport_family(a) fa, public.activity_sport_family(b) fb) x;
$$;

-- ═══════════════ 3. Fusion ════════════════════════════════════════════════════

/*
  p_activity (jsonb) : external_id, started_at, local_date, sport, duration_s,
  distance_m, elevation_gain_m, avg_hr, max_hr, avg_pace_s_per_km, calories,
  details, raw, device_name, title, description, rpe, gear, commute,
  strava_activity_id, origin_quality.
  p_tag : garmin | coros | file | strava_archive | garmin_export.

  Rend { id, status: created | merged | unchanged, stream_rank, laps_edited } :
  l'appelant n'envoie la série que si la sienne est meilleure que stream_rank.
*/
CREATE OR REPLACE FUNCTION public.merge_provider_activity(
  p_athlete uuid, p_source public.data_source, p_tag text, p_activity jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j        jsonb := p_activity;
  v_ext    text := nullif(btrim(p_activity->>'external_id'), '');
  v_start  timestamptz := (p_activity->>'started_at')::timestamptz;
  v_sport  text := nullif(btrim(p_activity->>'sport'), '');
  v_strava text := nullif(btrim(p_activity->>'strava_activity_id'), '');
  v_q      text := coalesce(p_activity->>'origin_quality', 'summary');
  v_in     public.provider_activities;
  v_old    public.provider_activities;
  v_new    public.provider_activities;
  v_better boolean;
  v_found  boolean := false;
  v_stream record;
BEGIN
  -- ── Droits ──
  IF auth.uid() IS NOT NULL THEN
    IF p_source <> 'file_import' OR p_tag NOT IN ('file', 'strava_archive', 'garmin_export')
       OR NOT (auth.uid() = p_athlete OR public.is_coach_of(p_athlete)) THEN
      RAISE EXCEPTION 'merge_provider_activity : non autorisé' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_tag IS NULL OR p_tag NOT IN ('garmin', 'coros', 'file', 'strava_archive', 'garmin_export') THEN
    RAISE EXCEPTION 'merge_provider_activity : origine inconnue' USING ERRCODE = '22023';
  END IF;
  IF v_ext IS NULL OR v_start IS NULL OR p_activity->>'local_date' IS NULL THEN
    RAISE EXCEPTION 'merge_provider_activity : identifiant, départ ou jour manquant' USING ERRCODE = '22023';
  END IF;
  IF v_q NOT IN ('fit', 'tcx', 'gpx', 'summary') THEN v_q := 'summary'; END IF;

  -- Une fusion à la fois par athlète : deux onglets, ou Garmin pendant un import.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_athlete::text, 42));

  -- Ligne entrante, typée par la table (contraintes et types vérifiés ici).
  v_in := jsonb_populate_record(NULL::public.provider_activities, jsonb_build_object(
    'id', gen_random_uuid(), 'imported_at', now(), 'ai_allowed', false,
    'athlete_id', p_athlete, 'source', p_source, 'external_id', v_ext,
    'started_at', v_start, 'local_date', p_activity->'local_date', 'sport', v_sport,
    'duration_s', j->'duration_s', 'distance_m', j->'distance_m', 'elevation_gain_m', j->'elevation_gain_m',
    'avg_hr', j->'avg_hr', 'max_hr', j->'max_hr', 'avg_pace_s_per_km', j->'avg_pace_s_per_km',
    'calories', j->'calories', 'details', j->'details', 'raw', j->'raw', 'device_name', j->'device_name',
    'title', nullif(btrim(j->>'title'), ''), 'description', nullif(btrim(j->>'description'), ''),
    'rpe', j->'rpe', 'gear', nullif(btrim(j->>'gear'), ''), 'commute', j->'commute',
    'strava_activity_id', v_strava, 'origin_quality', v_q, 'sources', jsonb_build_array(p_tag)));

  -- ── La même sortie existe-t-elle ? ──
  SELECT * INTO v_old FROM public.provider_activities
   WHERE athlete_id = p_athlete AND source = p_source AND external_id = v_ext FOR UPDATE;
  v_found := FOUND;
  IF NOT v_found AND v_strava IS NOT NULL THEN
    SELECT * INTO v_old FROM public.provider_activities
     WHERE athlete_id = p_athlete AND strava_activity_id = v_strava FOR UPDATE;
    v_found := FOUND;
  END IF;
  IF NOT v_found THEN
    SELECT * INTO v_old FROM public.provider_activities a
     WHERE a.athlete_id = p_athlete
       AND a.started_at BETWEEN v_start - interval '120 seconds' AND v_start + interval '120 seconds'
       AND public.outing_sports_compatible(a.sport, v_sport)
       -- Deux activités d'une même montre (API) sont deux sorties distinctes.
       AND NOT (a.source = p_source AND p_source IN ('garmin', 'coros'))
       -- Une autre sortie Strava (identifiant différent) n'est pas celle-ci.
       AND NOT (v_strava IS NOT NULL AND a.strava_activity_id IS NOT NULL AND a.strava_activity_id <> v_strava)
     ORDER BY abs(extract(epoch FROM a.started_at - v_start)), a.id
     LIMIT 1 FOR UPDATE;
    v_found := FOUND;
  END IF;

  IF NOT v_found THEN
    INSERT INTO public.provider_activities SELECT (v_in).* RETURNING * INTO v_new;
    RETURN jsonb_build_object('id', v_new.id, 'status', 'created', 'stream_rank', 0, 'laps_edited', false);
  END IF;

  -- ── Fusion ──
  -- Mesures : de la meilleure copie (qualité de courbe, puis source). Même
  -- source et même identifiant = le fournisseur corrige sa propre sortie.
  v_better := (v_old.source = p_source AND v_old.external_id = v_ext)
    OR public.origin_quality_rank(v_q) * 10 + public.source_rank(p_source)
       > public.origin_quality_rank(v_old.origin_quality) * 10 + public.source_rank(v_old.source);

  v_new := v_old;
  IF v_better THEN
    v_new.started_at        := v_in.started_at;
    v_new.local_date        := v_in.local_date;
    v_new.sport             := coalesce(v_in.sport, v_old.sport);
    v_new.duration_s        := coalesce(v_in.duration_s, v_old.duration_s);
    v_new.distance_m        := coalesce(v_in.distance_m, v_old.distance_m);
    v_new.elevation_gain_m  := coalesce(v_in.elevation_gain_m, v_old.elevation_gain_m);
    v_new.avg_hr            := coalesce(v_in.avg_hr, v_old.avg_hr);
    v_new.max_hr            := coalesce(v_in.max_hr, v_old.max_hr);
    v_new.avg_pace_s_per_km := coalesce(v_in.avg_pace_s_per_km, v_old.avg_pace_s_per_km);
    v_new.calories          := coalesce(v_in.calories, v_old.calories);
    v_new.details           := coalesce(v_in.details, v_old.details);
    v_new.raw               := coalesce(v_in.raw, v_old.raw);
    v_new.device_name       := coalesce(v_in.device_name, v_old.device_name);
  ELSE
    v_new.sport             := coalesce(v_old.sport, v_in.sport);
    v_new.duration_s        := coalesce(v_old.duration_s, v_in.duration_s);
    v_new.distance_m        := coalesce(v_old.distance_m, v_in.distance_m);
    v_new.elevation_gain_m  := coalesce(v_old.elevation_gain_m, v_in.elevation_gain_m);
    v_new.avg_hr            := coalesce(v_old.avg_hr, v_in.avg_hr);
    v_new.max_hr            := coalesce(v_old.max_hr, v_in.max_hr);
    v_new.avg_pace_s_per_km := coalesce(v_old.avg_pace_s_per_km, v_in.avg_pace_s_per_km);
    v_new.calories          := coalesce(v_old.calories, v_in.calories);
    v_new.details           := coalesce(v_old.details, v_in.details);
    v_new.raw               := coalesce(v_old.raw, v_in.raw);
    v_new.device_name       := coalesce(v_old.device_name, v_in.device_name);
  END IF;
  -- Ce que l'athlète a écrit : rempli s'il manque, jamais écrasé.
  v_new.title              := coalesce(v_old.title, v_in.title);
  v_new.description        := coalesce(v_old.description, v_in.description);
  v_new.rpe                := coalesce(v_old.rpe, v_in.rpe);
  v_new.gear               := coalesce(v_old.gear, v_in.gear);
  v_new.commute            := coalesce(v_old.commute, v_in.commute);
  v_new.strava_activity_id := coalesce(v_old.strava_activity_id, v_in.strava_activity_id);
  v_new.origin_quality     := CASE WHEN public.origin_quality_rank(v_q) > public.origin_quality_rank(v_old.origin_quality)
                                   THEN v_q ELSE v_old.origin_quality END;
  v_new.sources            := ARRAY(SELECT DISTINCT unnest(v_old.sources || ARRAY[p_tag]) ORDER BY 1);
  -- La ligne prend la source (et l'identifiant) de la meilleure source.
  IF public.source_rank(p_source) > public.source_rank(v_old.source) THEN
    v_new.source := p_source;
    v_new.external_id := v_ext;
  END IF;

  SELECT normalized_from, laps_edited INTO v_stream FROM public.activity_streams WHERE activity_id = v_old.id;

  IF v_new IS NOT DISTINCT FROM v_old THEN
    RETURN jsonb_build_object('id', v_old.id, 'status', 'unchanged',
      'stream_rank', coalesce(public.stream_quality_rank(v_stream.normalized_from), 0),
      'laps_edited', coalesce(v_stream.laps_edited, false));
  END IF;

  UPDATE public.provider_activities SET
    source = v_new.source, external_id = v_new.external_id, started_at = v_new.started_at,
    local_date = v_new.local_date, sport = v_new.sport, duration_s = v_new.duration_s,
    distance_m = v_new.distance_m, elevation_gain_m = v_new.elevation_gain_m, avg_hr = v_new.avg_hr,
    max_hr = v_new.max_hr, avg_pace_s_per_km = v_new.avg_pace_s_per_km, calories = v_new.calories,
    details = v_new.details, raw = v_new.raw, device_name = v_new.device_name, title = v_new.title,
    description = v_new.description, rpe = v_new.rpe, gear = v_new.gear, commute = v_new.commute,
    strava_activity_id = v_new.strava_activity_id, origin_quality = v_new.origin_quality, sources = v_new.sources
  WHERE id = v_old.id;

  -- Source changée : le détail suit (visibilité coach, IA, désinscription).
  IF v_new.source <> v_old.source THEN
    UPDATE public.activity_streams        SET source = v_new.source WHERE activity_id = v_old.id;
    UPDATE public.activity_laps           SET source = v_new.source WHERE activity_id = v_old.id;
    UPDATE public.activity_sets           SET source = v_new.source WHERE activity_id = v_old.id;
    UPDATE public.activity_zone_summaries SET source = v_new.source WHERE activity_id = v_old.id;
    UPDATE public.activity_plan_links     SET source = v_new.source WHERE activity_id = v_old.id;
  END IF;

  RETURN jsonb_build_object('id', v_old.id, 'status', 'merged',
    'stream_rank', coalesce(public.stream_quality_rank(v_stream.normalized_from), 0),
    'laps_edited', coalesce(v_stream.laps_edited, false));
END;
$$;
REVOKE ALL ON FUNCTION public.merge_provider_activity(uuid, public.data_source, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_provider_activity(uuid, public.data_source, text, jsonb) TO authenticated, service_role;

/* Paquet de fusions (import d'archive) : une requête pour 25 sorties. */
CREATE OR REPLACE FUNCTION public.merge_provider_activities(
  p_athlete uuid, p_source public.data_source, p_tag text, p_activities jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_e   jsonb;
BEGIN
  IF p_activities IS NULL OR jsonb_typeof(p_activities) <> 'array' OR jsonb_array_length(p_activities) > 100 THEN
    RAISE EXCEPTION 'merge_provider_activities : paquet invalide (100 au plus)' USING ERRCODE = '22023';
  END IF;
  FOR v_e IN SELECT e FROM jsonb_array_elements(p_activities) WITH ORDINALITY x(e, o) ORDER BY o LOOP
    BEGIN
      v_out := v_out || jsonb_build_array(public.merge_provider_activity(p_athlete, p_source, p_tag, v_e));
    EXCEPTION
      WHEN insufficient_privilege THEN RAISE;
      WHEN OTHERS THEN
        -- Une sortie refusée (valeur hors bornes) n'annule pas le paquet.
        v_out := v_out || jsonb_build_array(jsonb_build_object('status', 'error', 'error', left(SQLERRM, 200)));
    END;
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.merge_provider_activities(uuid, public.data_source, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_provider_activities(uuid, public.data_source, text, jsonb) TO authenticated, service_role;

-- ═══════════════ 4. Détail : qualité et droits ═══════════════════════════════

/*
  `activity_detail_upsert` (P41 lot B), avec deux changements :
    - une série n'en remplace une autre que si elle est de meilleure qualité
      (à qualité égale : seul le serveur remplace, le fournisseur corrigeant
      sa propre sortie ; un ré-import ne touche à rien) ;
    - l'athlète ou son coach peut écrire le détail d'une sortie à laquelle un
      fichier a contribué (`sources` contient file / strava_archive /
      garmin_export), même si la ligne est devenue `garmin`.
  Tours modifiés à la main : jamais touchés (inchangé).
*/
CREATE OR REPLACE FUNCTION public.activity_detail_upsert(p_activity uuid, p_detail jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_act    record;
  v_stream jsonb := p_detail->'stream';
  v_n      integer;
  v_edited boolean;
  v_laps   integer := 0;
  v_sets   integer := 0;
  v_cur    text;
BEGIN
  SELECT id, athlete_id, source, started_at, sport, sources INTO v_act
    FROM public.provider_activities WHERE id = p_activity;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'activity_detail_upsert : activité inconnue' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT (
       (auth.uid() = v_act.athlete_id OR public.is_coach_of(v_act.athlete_id))
       AND (v_act.source = 'file_import' OR v_act.sources && ARRAY['file', 'strava_archive', 'garmin_export'])) THEN
    RAISE EXCEPTION 'activity_detail_upsert : non autorisé' USING ERRCODE = '42501';
  END IF;
  IF v_stream IS NULL OR jsonb_typeof(v_stream->'t') <> 'array' THEN
    RAISE EXCEPTION 'activity_detail_upsert : série absente' USING ERRCODE = '22023';
  END IF;

  SELECT normalized_from INTO v_cur FROM public.activity_streams WHERE activity_id = v_act.id FOR UPDATE;
  IF FOUND AND (
       public.stream_quality_rank(p_detail->>'source') < public.stream_quality_rank(v_cur)
       OR (auth.uid() IS NOT NULL AND public.stream_quality_rank(p_detail->>'source') = public.stream_quality_rank(v_cur))) THEN
    RETURN jsonb_build_object('samples', 0, 'laps', 0, 'sets', 0, 'laps_kept', true, 'stream_kept', true);
  END IF;

  v_n := jsonb_array_length(v_stream->'t');

  INSERT INTO public.activity_streams AS s (
    activity_id, athlete_id, source, normalized_from, started_at, utc_offset_s, sport, sample_count,
    t, timer, hr, speed, dist, alt, cadence, power, lat, lon, vosc, stance, vratio, step_len, temp,
    watch_laps, splits, watch_time_in_zone, device, updated_at
  ) VALUES (
    v_act.id, v_act.athlete_id, v_act.source, p_detail->>'source',
    coalesce((p_detail->>'started_at')::timestamptz, v_act.started_at),
    (p_detail->>'utc_offset_s')::integer,
    coalesce(p_detail->>'sport', v_act.sport),
    v_n,
    public.jsonb_int_array(v_stream->'t'),
    public.jsonb_int_array(v_stream->'timer'),
    public.jsonb_int_array(v_stream->'hr')::smallint[],
    public.jsonb_real_array(v_stream->'speed'),
    public.jsonb_real_array(v_stream->'dist'),
    public.jsonb_real_array(v_stream->'alt'),
    public.jsonb_real_array(v_stream->'cadence'),
    public.jsonb_int_array(v_stream->'power')::smallint[],
    public.jsonb_real_array(v_stream->'lat'),
    public.jsonb_real_array(v_stream->'lon'),
    public.jsonb_real_array(v_stream->'vosc'),
    public.jsonb_real_array(v_stream->'stance'),
    public.jsonb_real_array(v_stream->'vratio'),
    public.jsonb_real_array(v_stream->'stepLen'),
    public.jsonb_int_array(v_stream->'temp')::smallint[],
    coalesce(p_detail->'laps', '[]'::jsonb),
    coalesce(p_detail->'splits', '[]'::jsonb),
    coalesce(p_detail->'watch_time_in_zone', '[]'::jsonb),
    p_detail->'device',
    now()
  )
  ON CONFLICT (activity_id) DO UPDATE SET
    normalized_from = EXCLUDED.normalized_from, started_at = EXCLUDED.started_at,
    utc_offset_s = EXCLUDED.utc_offset_s, sport = EXCLUDED.sport, sample_count = EXCLUDED.sample_count,
    t = EXCLUDED.t, timer = EXCLUDED.timer, hr = EXCLUDED.hr, speed = EXCLUDED.speed, dist = EXCLUDED.dist,
    alt = EXCLUDED.alt, cadence = EXCLUDED.cadence, power = EXCLUDED.power, lat = EXCLUDED.lat,
    lon = EXCLUDED.lon, vosc = EXCLUDED.vosc, stance = EXCLUDED.stance, vratio = EXCLUDED.vratio,
    step_len = EXCLUDED.step_len, temp = EXCLUDED.temp, watch_laps = EXCLUDED.watch_laps,
    splits = EXCLUDED.splits, watch_time_in_zone = EXCLUDED.watch_time_in_zone, device = EXCLUDED.device,
    updated_at = now()
  RETURNING laps_edited INTO v_edited;

  DELETE FROM public.activity_sets WHERE activity_id = v_act.id;
  INSERT INTO public.activity_sets (activity_id, athlete_id, source, position, start_s, duration_s, reps,
                                    weight_kg, set_type, category, category_subtype)
  SELECT v_act.id, v_act.athlete_id, v_act.source, o::integer,
         (e->>'startS')::numeric::integer, (e->>'durationS')::real, (e->>'reps')::integer,
         (e->>'weightKg')::real, e->>'setType',
         public.jsonb_int_array(e->'category'), public.jsonb_int_array(e->'categorySubtype')
    FROM jsonb_array_elements(coalesce(p_detail->'sets', '[]'::jsonb)) WITH ORDINALITY x(e, o);
  GET DIAGNOSTICS v_sets = ROW_COUNT;

  IF NOT v_edited THEN
    DELETE FROM public.activity_laps WHERE activity_id = v_act.id;
    INSERT INTO public.activity_laps (activity_id, athlete_id, source, position, start_s, end_s,
                                      origin, status)
    SELECT v_act.id, v_act.athlete_id, v_act.source, o::integer,
           round((e->>'startS')::numeric)::integer,
           greatest(round((e->>'endS')::numeric)::integer, round((e->>'startS')::numeric)::integer),
           'watch', 'validated'
      FROM jsonb_array_elements(coalesce(p_detail->'laps', '[]'::jsonb)) WITH ORDINALITY x(e, o);
    GET DIAGNOSTICS v_laps = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('samples', v_n, 'laps', v_laps, 'sets', v_sets, 'laps_kept', v_edited, 'stream_kept', false);
END;
$$;

REVOKE ALL ON FUNCTION public.activity_detail_upsert(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activity_detail_upsert(uuid, jsonb) TO authenticated, service_role;
