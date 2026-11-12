/*
  P41 lot B — détail des activités rangé en base : série seconde par seconde,
  tours, séries de musculation.

  Choix (validés par Hugo le 2026-11-11, Q1) :
    - une ligne par activité, une colonne tableau typé par mesure
      (~120 ko par heure, 3× moins qu'une ligne par seconde) ;
    - lat / lon en `real` (précision ~0,5 m) ;
    - le brut Garmin (provider_raw_records + bucket) reste l'archive.

  Garanties :
    - suppression en cascade avec `provider_activities` : déconnexion,
      retrait de permission, désinscription Garmin et suppression de compte
      effacent aussi séries, tours et séries de muscu ;
    - `ai_allowed` imposé par `apply_source_ai_policy` (garmin = false) ;
    - lecture : l'athlète ; son coach (référent ou co-coach) et le staff
      `seances` aux mêmes conditions que `provider_activities` (coach_visible
      + consentement relu à chaque requête) ;
    - écriture : uniquement par `activity_detail_upsert` (SECURITY DEFINER) :
      serveur, ou l'athlète pour ses propres imports de fichiers.

  Additive : le client de production n'y touche pas.
  Tests à blanc : supabase/tests/activity_detail.sql.
*/

-- ═══════════════ 1. Tables ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.activity_streams (
  activity_id        uuid PRIMARY KEY REFERENCES public.provider_activities(id) ON DELETE CASCADE,
  athlete_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source             public.data_source NOT NULL,
  -- D'où vient la série : fit | garmin_json | tcx | gpx.
  normalized_from    text NOT NULL CHECK (normalized_from IN ('fit', 'garmin_json', 'tcx', 'gpx')),
  started_at         timestamptz NOT NULL,
  utc_offset_s       integer,
  sport              text,
  sample_count       integer NOT NULL CHECK (sample_count >= 0),
  t                  integer[] NOT NULL,
  timer              integer[],
  hr                 smallint[],
  speed              real[],
  dist               real[],
  alt                real[],
  cadence            real[],
  power              smallint[],
  lat                real[],
  lon                real[],
  vosc               real[],
  stance             real[],
  vratio             real[],
  step_len           real[],
  temp               smallint[],
  -- Tours de la montre tels que reçus : base de « revenir aux tours de la montre ».
  watch_laps         jsonb NOT NULL DEFAULT '[]'::jsonb,
  splits             jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Temps en zone selon la montre et SES zones : archive, jamais utilisé.
  watch_time_in_zone jsonb NOT NULL DEFAULT '[]'::jsonb,
  device             jsonb,
  -- Version des tours (contrôle de concurrence de l'édition) ; vrai dès
  -- qu'un humain a modifié les tours : la réception ne les écrase plus.
  laps_version       integer NOT NULL DEFAULT 0,
  laps_edited        boolean NOT NULL DEFAULT false,
  ai_allowed         boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_streams_lengths CHECK (
    cardinality(t) = sample_count
    AND (timer    IS NULL OR cardinality(timer)    = sample_count)
    AND (hr       IS NULL OR cardinality(hr)       = sample_count)
    AND (speed    IS NULL OR cardinality(speed)    = sample_count)
    AND (dist     IS NULL OR cardinality(dist)     = sample_count)
    AND (alt      IS NULL OR cardinality(alt)      = sample_count)
    AND (cadence  IS NULL OR cardinality(cadence)  = sample_count)
    AND (power    IS NULL OR cardinality(power)    = sample_count)
    AND (lat      IS NULL OR cardinality(lat)      = sample_count)
    AND (lon      IS NULL OR cardinality(lon)      = sample_count)
    AND (vosc     IS NULL OR cardinality(vosc)     = sample_count)
    AND (stance   IS NULL OR cardinality(stance)   = sample_count)
    AND (vratio   IS NULL OR cardinality(vratio)   = sample_count)
    AND (step_len IS NULL OR cardinality(step_len) = sample_count)
    AND (temp     IS NULL OR cardinality(temp)     = sample_count)
  )
);

CREATE INDEX IF NOT EXISTS activity_streams_athlete_started
  ON public.activity_streams (athlete_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.activity_laps (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id         uuid NOT NULL REFERENCES public.provider_activities(id) ON DELETE CASCADE,
  athlete_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source              public.data_source NOT NULL,
  position            integer NOT NULL CHECK (position >= 1),
  start_s             integer NOT NULL CHECK (start_s >= 0),
  end_s               integer NOT NULL,
  name                text CHECK (name IS NULL OR length(name) <= 120),
  exercise_id         uuid REFERENCES public.exercises(id) ON DELETE SET NULL,
  -- Bloc de la séance prévue auquel le tour correspond (index aplati, lot F).
  planned_block_ref   text CHECK (planned_block_ref IS NULL OR length(planned_block_ref) <= 120),
  distance_override_m real CHECK (distance_override_m IS NULL OR distance_override_m >= 0),
  reps                integer CHECK (reps IS NULL OR reps >= 0),
  load_kg             real CHECK (load_kg IS NULL OR load_kg >= 0),
  origin              text NOT NULL CHECK (origin IN ('watch', 'agon_proposal', 'manual')),
  status              text NOT NULL CHECK (status IN ('proposed', 'validated')),
  -- Tour peu sûr dans une proposition d'Agon (« à vérifier »).
  needs_review        boolean NOT NULL DEFAULT false,
  ai_allowed          boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_laps_bounds CHECK (end_s >= start_s),
  UNIQUE (activity_id, position)
);

CREATE TABLE IF NOT EXISTS public.activity_sets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id       uuid NOT NULL REFERENCES public.provider_activities(id) ON DELETE CASCADE,
  athlete_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source            public.data_source NOT NULL,
  position          integer NOT NULL CHECK (position >= 1),
  start_s           integer,
  duration_s        real CHECK (duration_s IS NULL OR duration_s >= 0),
  reps              integer CHECK (reps IS NULL OR reps >= 0),
  weight_kg         real CHECK (weight_kg IS NULL OR weight_kg >= 0),
  set_type          text CHECK (set_type IS NULL OR set_type IN ('active', 'rest')),
  category          integer[],
  category_subtype  integer[],
  ai_allowed        boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, position)
);

-- ═══════════════ 2. IA : politique de la source imposée ══════════════════════

DROP TRIGGER IF EXISTS activity_streams_ai_policy ON public.activity_streams;
CREATE TRIGGER activity_streams_ai_policy
  BEFORE INSERT OR UPDATE OF source ON public.activity_streams
  FOR EACH ROW EXECUTE FUNCTION public.apply_source_ai_policy();

DROP TRIGGER IF EXISTS activity_laps_ai_policy ON public.activity_laps;
CREATE TRIGGER activity_laps_ai_policy
  BEFORE INSERT OR UPDATE OF source ON public.activity_laps
  FOR EACH ROW EXECUTE FUNCTION public.apply_source_ai_policy();

DROP TRIGGER IF EXISTS activity_sets_ai_policy ON public.activity_sets;
CREATE TRIGGER activity_sets_ai_policy
  BEFORE INSERT OR UPDATE OF source ON public.activity_sets
  FOR EACH ROW EXECUTE FUNCTION public.apply_source_ai_policy();

-- ═══════════════ 3. RLS ══════════════════════════════════════════════════════

ALTER TABLE public.activity_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_laps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_sets    ENABLE ROW LEVEL SECURITY;

/* Visibilité tierce : mêmes conditions que provider_activities_coach_read. */
CREATE OR REPLACE FUNCTION public.activity_detail_visible(p_athlete uuid, p_source public.data_source)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT p_athlete = auth.uid()
    OR (
      (public.is_coach_of(p_athlete) OR public.staff_can(p_athlete, 'seances', 'read'))
      AND EXISTS (SELECT 1 FROM public.data_source_policies p WHERE p.source = p_source AND p.coach_visible)
      AND public.source_consent_granted(p_athlete, p_source)
    );
$$;
REVOKE ALL ON FUNCTION public.activity_detail_visible(uuid, public.data_source) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activity_detail_visible(uuid, public.data_source) TO authenticated, service_role;

DROP POLICY IF EXISTS activity_streams_read ON public.activity_streams;
CREATE POLICY activity_streams_read ON public.activity_streams
  FOR SELECT TO authenticated USING (public.activity_detail_visible(athlete_id, source));

DROP POLICY IF EXISTS activity_laps_read ON public.activity_laps;
CREATE POLICY activity_laps_read ON public.activity_laps
  FOR SELECT TO authenticated USING (public.activity_detail_visible(athlete_id, source));

DROP POLICY IF EXISTS activity_sets_read ON public.activity_sets;
CREATE POLICY activity_sets_read ON public.activity_sets
  FOR SELECT TO authenticated USING (public.activity_detail_visible(athlete_id, source));

REVOKE INSERT, UPDATE, DELETE ON public.activity_streams, public.activity_laps, public.activity_sets FROM anon, authenticated;

-- ═══════════════ 4. Écriture : activity_detail_upsert ════════════════════════

CREATE OR REPLACE FUNCTION public.jsonb_real_array(j jsonb)
RETURNS real[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN j IS NULL OR jsonb_typeof(j) <> 'array' THEN NULL
    ELSE ARRAY(SELECT (e #>> '{}')::real FROM jsonb_array_elements(j) WITH ORDINALITY x(e, o) ORDER BY o) END;
$$;

CREATE OR REPLACE FUNCTION public.jsonb_int_array(j jsonb)
RETURNS integer[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN j IS NULL OR jsonb_typeof(j) <> 'array' THEN NULL
    ELSE ARRAY(SELECT round((e #>> '{}')::numeric)::integer FROM jsonb_array_elements(j) WITH ORDINALITY x(e, o) ORDER BY o) END;
$$;

/*
  Écrit le détail normalisé d'une activité (forme `NormalizedActivity` de
  `_shared/activityFiles/stream.ts`, sérialisée par `detailPayload`).

  Idempotent : même activité reçue deux fois = même résultat. Les tours ne sont
  remplacés par ceux de la montre que tant que personne ne les a modifiés.
  Appelant : le serveur (auth.uid() nul), ou l'athlète pour ses imports.
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
BEGIN
  SELECT id, athlete_id, source, started_at, sport INTO v_act
    FROM public.provider_activities WHERE id = p_activity;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'activity_detail_upsert : activité inconnue' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT (auth.uid() = v_act.athlete_id AND v_act.source = 'file_import') THEN
    RAISE EXCEPTION 'activity_detail_upsert : non autorisé' USING ERRCODE = '42501';
  END IF;
  IF v_stream IS NULL OR jsonb_typeof(v_stream->'t') <> 'array' THEN
    RAISE EXCEPTION 'activity_detail_upsert : série absente' USING ERRCODE = '22023';
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

  -- Séries de muscu : dérivées du fichier, remplacées à chaque passage.
  DELETE FROM public.activity_sets WHERE activity_id = v_act.id;
  INSERT INTO public.activity_sets (activity_id, athlete_id, source, position, start_s, duration_s, reps,
                                    weight_kg, set_type, category, category_subtype)
  SELECT v_act.id, v_act.athlete_id, v_act.source, o::integer,
         (e->>'startS')::numeric::integer, (e->>'durationS')::real, (e->>'reps')::integer,
         (e->>'weightKg')::real, e->>'setType',
         public.jsonb_int_array(e->'category'), public.jsonb_int_array(e->'categorySubtype')
    FROM jsonb_array_elements(coalesce(p_detail->'sets', '[]'::jsonb)) WITH ORDINALITY x(e, o);
  GET DIAGNOSTICS v_sets = ROW_COUNT;

  -- Tours : ceux de la montre, tant qu'aucun humain ne les a modifiés.
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

  RETURN jsonb_build_object('samples', v_n, 'laps', v_laps, 'sets', v_sets, 'laps_kept', v_edited);
END;
$$;

REVOKE ALL ON FUNCTION public.activity_detail_upsert(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activity_detail_upsert(uuid, jsonb) TO authenticated, service_role;
