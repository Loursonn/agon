/*
  P41 lot G : toute la santé Garmin rangée en tables.

  1. `provider_dailies` : colonnes typées pour tout ce qui est affichable
     (additif, toutes NULL par défaut). Les scores de marque (Body Battery,
     score de sommeil, stress, VO2max, âge fitness) sont STOCKÉS avec leur
     source, jamais utilisés dans les calculs d'Agon (règle YOXX).
  2. `provider_daily_merge` : même signature, même contrat (un type de résumé
     ne renseigne que ses champs, jamais d'effacement des autres), mais liste
     blanche de colonnes au lieu d'une colonne par ligne de code. Atomique.
  3. `provider_intraday` : une ligne par athlète, source, jour, mesure ;
     `offsets` = secondes depuis minuit LOCAL du jour (négatif possible :
     sommeil commencé la veille), `values` alignées. Fusion atomique
     (`provider_intraday_merge`) : les points reçus remplacent ceux de même
     instant, les autres sont gardés ; puis moyennes du jour recalculées
     (respiration, SpO2, Body Battery min / max).
  4. `provider_moveiq` : activités détectées automatiquement par la montre
     (marche…), à part : jamais dans le planning ni dans les séances.
  5. `provider_forget` : supprime aussi ces nouvelles tables.

  Données de santé : RLS lecture = athlète, ou coach / staff « séances »
  autorisé ET source visible ET consentement (`activity_detail_visible`).
  Écriture : serveur uniquement. Exclues de l'IA (garmin → ai_allowed = false).
  Additive. Tests : supabase/tests/garmin_health.sql.
*/

-- ═══════════════ 1. Résumé du jour : colonnes ═════════════════════════════════

ALTER TABLE public.provider_dailies
  ADD COLUMN IF NOT EXISTS hr_min                 smallint,
  ADD COLUMN IF NOT EXISTS hr_max                 smallint,
  ADD COLUMN IF NOT EXISTS hr_avg                 smallint,
  ADD COLUMN IF NOT EXISTS distance_m             real,
  ADD COLUMN IF NOT EXISTS floors_climbed         smallint,
  ADD COLUMN IF NOT EXISTS active_kcal            integer,
  ADD COLUMN IF NOT EXISTS bmr_kcal               integer,
  ADD COLUMN IF NOT EXISTS total_kcal             integer,
  ADD COLUMN IF NOT EXISTS active_time_min        integer,
  ADD COLUMN IF NOT EXISTS intensity_moderate_min integer,
  ADD COLUMN IF NOT EXISTS intensity_vigorous_min integer,
  ADD COLUMN IF NOT EXISTS stress_max             smallint,
  ADD COLUMN IF NOT EXISTS stress_rest_min        integer,
  ADD COLUMN IF NOT EXISTS stress_low_min         integer,
  ADD COLUMN IF NOT EXISTS stress_medium_min      integer,
  ADD COLUMN IF NOT EXISTS stress_high_min        integer,
  ADD COLUMN IF NOT EXISTS stress_activity_min    integer,
  ADD COLUMN IF NOT EXISTS body_battery_charged   smallint,
  ADD COLUMN IF NOT EXISTS body_battery_drained   smallint,
  ADD COLUMN IF NOT EXISTS sleep_light_min        integer,
  ADD COLUMN IF NOT EXISTS sleep_awake_min        integer,
  ADD COLUMN IF NOT EXISTS sleep_nap_min          integer,
  ADD COLUMN IF NOT EXISTS sleep_start_at         timestamptz,
  ADD COLUMN IF NOT EXISTS sleep_end_at           timestamptz,
  ADD COLUMN IF NOT EXISTS sleep_subscores        jsonb,
  ADD COLUMN IF NOT EXISTS hrv_peak_5min_ms       numeric,
  ADD COLUMN IF NOT EXISTS spo2_avg               real,
  ADD COLUMN IF NOT EXISTS spo2_min               real,
  ADD COLUMN IF NOT EXISTS respiration_sleep_avg  real,
  ADD COLUMN IF NOT EXISTS respiration_day_avg    real,
  ADD COLUMN IF NOT EXISTS skin_temp_delta_c      real,
  ADD COLUMN IF NOT EXISTS vo2max_cycling         numeric,
  ADD COLUMN IF NOT EXISTS fitness_age            smallint,
  ADD COLUMN IF NOT EXISTS hydration_ml           integer,
  ADD COLUMN IF NOT EXISTS weight_kg              real,
  ADD COLUMN IF NOT EXISTS body_fat_pct           real,
  ADD COLUMN IF NOT EXISTS bmi                    real,
  ADD COLUMN IF NOT EXISTS muscle_mass_kg         real,
  ADD COLUMN IF NOT EXISTS bone_mass_kg           real,
  ADD COLUMN IF NOT EXISTS body_water_pct         real,
  ADD COLUMN IF NOT EXISTS bp_systolic            smallint,
  ADD COLUMN IF NOT EXISTS bp_diastolic           smallint,
  ADD COLUMN IF NOT EXISTS bp_pulse               smallint;

-- ═══════════════ 2. Fusion du résumé du jour ═════════════════════════════════

/* Colonnes que la fusion sait écrire, avec leur type. */
CREATE OR REPLACE FUNCTION public.provider_daily_columns()
RETURNS TABLE (col text, typ text)
LANGUAGE sql IMMUTABLE AS $$
  VALUES
    ('resting_hr', 'smallint'), ('hr_min', 'smallint'), ('hr_max', 'smallint'), ('hr_avg', 'smallint'),
    ('steps', 'integer'), ('distance_m', 'real'), ('floors_climbed', 'smallint'),
    ('active_kcal', 'integer'), ('bmr_kcal', 'integer'), ('total_kcal', 'integer'), ('active_time_min', 'integer'),
    ('intensity_moderate_min', 'integer'), ('intensity_vigorous_min', 'integer'),
    ('stress_avg', 'smallint'), ('stress_max', 'smallint'), ('stress_rest_min', 'integer'),
    ('stress_low_min', 'integer'), ('stress_medium_min', 'integer'), ('stress_high_min', 'integer'),
    ('stress_activity_min', 'integer'),
    ('body_battery_min', 'smallint'), ('body_battery_max', 'smallint'),
    ('body_battery_charged', 'smallint'), ('body_battery_drained', 'smallint'),
    ('sleep_total_min', 'integer'), ('sleep_deep_min', 'integer'), ('sleep_rem_min', 'integer'),
    ('sleep_light_min', 'integer'), ('sleep_awake_min', 'integer'), ('sleep_nap_min', 'integer'),
    ('sleep_start_at', 'timestamptz'), ('sleep_end_at', 'timestamptz'), ('sleep_score', 'smallint'),
    ('sleep_subscores', 'jsonb'),
    ('hrv_ms', 'numeric'), ('hrv_peak_5min_ms', 'numeric'),
    ('spo2_avg', 'real'), ('spo2_min', 'real'), ('respiration_sleep_avg', 'real'), ('respiration_day_avg', 'real'),
    ('skin_temp_delta_c', 'real'), ('vo2max', 'numeric'), ('vo2max_cycling', 'numeric'), ('fitness_age', 'smallint'),
    ('hydration_ml', 'integer'), ('weight_kg', 'real'), ('body_fat_pct', 'real'), ('bmi', 'real'),
    ('muscle_mass_kg', 'real'), ('bone_mass_kg', 'real'), ('body_water_pct', 'real'),
    ('bp_systolic', 'smallint'), ('bp_diastolic', 'smallint'), ('bp_pulse', 'smallint'),
    ('training_load', 'numeric');
$$;

CREATE OR REPLACE FUNCTION public.provider_daily_merge(
  p_athlete uuid,
  p_source  public.data_source,
  p_day     date,
  p_kind    text,
  p_fields  jsonb,
  p_raw     jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id   uuid;
  f      jsonb := COALESCE(p_fields, '{}'::jsonb);
  v_sets text[] := '{}';
  c      record;
BEGIN
  IF p_kind IS NULL OR p_kind !~ '^[a-zA-Z_]{1,40}$' THEN
    RAISE EXCEPTION 'provider_daily_merge : type de résumé invalide';
  END IF;
  IF jsonb_typeof(f) <> 'object' THEN
    RAISE EXCEPTION 'provider_daily_merge : champs invalides';
  END IF;

  -- `p_raw` NULL : valeurs dérivées d'une série (pas de brut à ranger).
  INSERT INTO public.provider_dailies AS d (athlete_id, source, day, raw)
  VALUES (p_athlete, p_source, p_day,
          CASE WHEN p_raw IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(p_kind, p_raw) END)
  ON CONFLICT (athlete_id, source, day) DO UPDATE
     SET raw = COALESCE(d.raw, '{}'::jsonb)
               || CASE WHEN p_raw IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(p_kind, p_raw) END,
         imported_at = now()
  RETURNING d.id INTO v_id;

  -- Seuls les champs présents sont écrits (null compris : « mesuré absent »).
  FOR c IN SELECT * FROM public.provider_daily_columns() LOOP
    IF f ? c.col THEN
      v_sets := v_sets || CASE c.typ
        WHEN 'jsonb' THEN format('%I = $1->%L', c.col, c.col)
        ELSE format('%I = ($1->>%L)::%s', c.col, c.col, c.typ)
      END;
    END IF;
  END LOOP;
  IF array_length(v_sets, 1) > 0 THEN
    EXECUTE format('UPDATE public.provider_dailies SET %s WHERE id = $2', array_to_string(v_sets, ', '))
      USING f, v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.provider_daily_merge(uuid, public.data_source, date, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_daily_merge(uuid, public.data_source, date, text, jsonb, jsonb) TO service_role;

-- ═══════════════ 3. Séries intrajournalières ══════════════════════════════════

CREATE TABLE IF NOT EXISTS public.provider_intraday (
  athlete_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source       public.data_source NOT NULL,
  day          date NOT NULL,
  measure      text NOT NULL CHECK (measure IN (
    'hr', 'stress', 'body_battery', 'respiration', 'spo2', 'hrv', 'sleep_stage', 'sleep_respiration',
    'sleep_spo2', 'steps', 'distance', 'active_kcal', 'met', 'intensity')),
  -- Décalage UTC local du jour (s) : minuit local = day 00:00 − utc_offset_s.
  utc_offset_s integer,
  offsets      integer[] NOT NULL,
  "values"     real[] NOT NULL,
  ai_allowed   boolean NOT NULL DEFAULT false,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (athlete_id, source, day, measure),
  CONSTRAINT provider_intraday_lengths CHECK (cardinality(offsets) = cardinality("values"))
);

DROP TRIGGER IF EXISTS provider_intraday_ai_policy ON public.provider_intraday;
CREATE TRIGGER provider_intraday_ai_policy
  BEFORE INSERT OR UPDATE OF source ON public.provider_intraday
  FOR EACH ROW EXECUTE FUNCTION public.apply_source_ai_policy();

ALTER TABLE public.provider_intraday ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_intraday_read ON public.provider_intraday;
CREATE POLICY provider_intraday_read ON public.provider_intraday
  FOR SELECT TO authenticated USING (public.activity_detail_visible(athlete_id, source));
REVOKE INSERT, UPDATE, DELETE ON public.provider_intraday FROM anon, authenticated;

/*
  Fusionne des points dans la série du jour : un point reçu remplace celui du
  même instant, les autres restent. Puis met à jour les valeurs du jour qui en
  dérivent (respiration de jour, SpO2 moyenne / minimale, Body Battery min /
  max), dans la même transaction.
*/
CREATE OR REPLACE FUNCTION public.provider_intraday_merge(
  p_athlete uuid,
  p_source  public.data_source,
  p_day     date,
  p_measure text,
  p_offsets integer[],
  p_values  real[],
  p_utc_offset_s integer
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_off integer[];
  v_val real[];
  v_fields jsonb;
BEGIN
  IF cardinality(p_offsets) IS DISTINCT FROM cardinality(p_values) THEN
    RAISE EXCEPTION 'provider_intraday_merge : longueurs différentes';
  END IF;

  SELECT coalesce(array_agg(o ORDER BY o), '{}'), coalesce(array_agg(v ORDER BY o), '{}') INTO v_off, v_val
    FROM (
      SELECT DISTINCT ON (o) o, v FROM (
        SELECT o, v, 1 AS pri FROM unnest(p_offsets, p_values) x(o, v) WHERE o IS NOT NULL
        UNION ALL
        SELECT o, v, 2 FROM public.provider_intraday i, unnest(i.offsets, i."values") y(o, v)
         WHERE i.athlete_id = p_athlete AND i.source = p_source AND i.day = p_day AND i.measure = p_measure
      ) z ORDER BY o, pri
    ) w;

  INSERT INTO public.provider_intraday AS i (athlete_id, source, day, measure, utc_offset_s, offsets, "values")
  VALUES (p_athlete, p_source, p_day, p_measure, p_utc_offset_s, v_off, v_val)
  ON CONFLICT (athlete_id, source, day, measure) DO UPDATE
    SET offsets = EXCLUDED.offsets, "values" = EXCLUDED."values",
        utc_offset_s = coalesce(EXCLUDED.utc_offset_s, i.utc_offset_s), updated_at = now();

  v_fields := CASE p_measure
    WHEN 'respiration' THEN jsonb_build_object('respiration_day_avg',
      (SELECT round(avg(v)::numeric, 1) FROM unnest(v_val) v WHERE v > 0))
    WHEN 'spo2' THEN (SELECT jsonb_build_object('spo2_avg', round(avg(v)::numeric, 1), 'spo2_min', min(v))
                        FROM unnest(v_val) v WHERE v > 0)
    WHEN 'body_battery' THEN (SELECT jsonb_build_object('body_battery_min', min(v)::smallint,
                                                        'body_battery_max', max(v)::smallint)
                                FROM unnest(v_val) v WHERE v >= 0)
    ELSE NULL
  END;
  IF v_fields IS NOT NULL THEN
    PERFORM public.provider_daily_merge(p_athlete, p_source, p_day, 'intraday', v_fields, NULL);
  END IF;
  RETURN cardinality(v_off);
END;
$$;
REVOKE ALL ON FUNCTION public.provider_intraday_merge(uuid, public.data_source, date, text, integer[], real[], integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_intraday_merge(uuid, public.data_source, date, text, integer[], real[], integer)
  TO service_role;

-- ═══════════════ 4. Activités détectées (Move IQ) ═════════════════════════════

CREATE TABLE IF NOT EXISTS public.provider_moveiq (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source        public.data_source NOT NULL,
  external_id   text NOT NULL,
  day           date NOT NULL,
  started_at    timestamptz NOT NULL,
  duration_s    integer CHECK (duration_s IS NULL OR duration_s >= 0),
  activity_type text,
  ai_allowed    boolean NOT NULL DEFAULT false,
  imported_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, source, external_id)
);
CREATE INDEX IF NOT EXISTS provider_moveiq_athlete_day ON public.provider_moveiq (athlete_id, day DESC);

DROP TRIGGER IF EXISTS provider_moveiq_ai_policy ON public.provider_moveiq;
CREATE TRIGGER provider_moveiq_ai_policy
  BEFORE INSERT OR UPDATE OF source ON public.provider_moveiq
  FOR EACH ROW EXECUTE FUNCTION public.apply_source_ai_policy();

ALTER TABLE public.provider_moveiq ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_moveiq_read ON public.provider_moveiq;
CREATE POLICY provider_moveiq_read ON public.provider_moveiq
  FOR SELECT TO authenticated USING (public.activity_detail_visible(athlete_id, source));
REVOKE INSERT, UPDATE, DELETE ON public.provider_moveiq FROM anon, authenticated;

-- ═══════════════ 5. Déconnexion / désinscription ══════════════════════════════

CREATE OR REPLACE FUNCTION public.provider_forget(
  p_athlete  uuid,
  p_provider public.data_source
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_external text;
  n_act int; n_day int; n_raw int; n_inbox int := 0; n_conn int; n_intra int; n_moveiq int;
BEGIN
  IF p_provider NOT IN ('garmin', 'coros') THEN
    RAISE EXCEPTION 'provider_forget : % n''est pas un fournisseur connecté', p_provider;
  END IF;

  SELECT external_user_id INTO v_external
    FROM public.provider_connections
   WHERE athlete_id = p_athlete AND provider = p_provider;

  -- Séries, tours, liens planning : supprimés en cascade avec l'activité.
  DELETE FROM public.provider_activities WHERE athlete_id = p_athlete AND source = p_provider;
  GET DIAGNOSTICS n_act = ROW_COUNT;
  DELETE FROM public.provider_dailies WHERE athlete_id = p_athlete AND source = p_provider;
  GET DIAGNOSTICS n_day = ROW_COUNT;
  DELETE FROM public.provider_intraday WHERE athlete_id = p_athlete AND source = p_provider;
  GET DIAGNOSTICS n_intra = ROW_COUNT;
  DELETE FROM public.provider_moveiq WHERE athlete_id = p_athlete AND source = p_provider;
  GET DIAGNOSTICS n_moveiq = ROW_COUNT;
  DELETE FROM public.provider_raw_records WHERE athlete_id = p_athlete AND source = p_provider;
  GET DIAGNOSTICS n_raw = ROW_COUNT;
  IF v_external IS NOT NULL THEN
    DELETE FROM public.provider_webhook_inbox WHERE provider = p_provider AND external_user_id = v_external;
    GET DIAGNOSTICS n_inbox = ROW_COUNT;
  END IF;
  DELETE FROM public.provider_connections WHERE athlete_id = p_athlete AND provider = p_provider;
  GET DIAGNOSTICS n_conn = ROW_COUNT;

  RETURN jsonb_build_object('activities', n_act, 'dailies', n_day, 'intraday', n_intra, 'moveiq', n_moveiq,
                            'raw', n_raw, 'inbox', n_inbox, 'connection', n_conn);
END;
$$;
REVOKE ALL ON FUNCTION public.provider_forget(uuid, public.data_source) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_forget(uuid, public.data_source) TO service_role;
