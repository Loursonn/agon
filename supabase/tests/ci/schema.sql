


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgtap" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."consent_purpose" AS ENUM (
    'health_data',
    'ai_programming',
    'garmin_sync',
    'coros_sync',
    'staff_sharing'
);


ALTER TYPE "public"."consent_purpose" OWNER TO "postgres";


CREATE TYPE "public"."data_source" AS ENUM (
    'garmin',
    'coros',
    'file_import',
    'manual'
);


ALTER TYPE "public"."data_source" OWNER TO "postgres";


CREATE TYPE "public"."provider_status" AS ENUM (
    'active',
    'needs_reauth',
    'consent_withdrawn',
    'revoked'
);


ALTER TYPE "public"."provider_status" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."energy_session_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "coach_id" "uuid",
    "energy_session_id" "uuid" NOT NULL,
    "scheduled_date" "date" NOT NULL,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "microcycle_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rpe_score" smallint,
    "block_logs" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "actual_duration_min" integer,
    "activity_url" "text",
    "activity_type" "text",
    "distance_km" numeric(6,2),
    CONSTRAINT "energy_session_assignments_activity_type_check" CHECK (("activity_type" = ANY (ARRAY['course'::"text", 'velo'::"text", 'rameur'::"text", 'natation'::"text", 'autre'::"text"]))),
    CONSTRAINT "energy_session_assignments_distance_km_check" CHECK ((("distance_km" IS NULL) OR ("distance_km" >= (0)::numeric))),
    CONSTRAINT "esa_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'in_progress'::"text", 'completed'::"text", 'missed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."energy_session_assignments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."energy_session_assignments"."rpe_score" IS 'Foster RPE 1-10 submitted by athlete after session';



COMMENT ON COLUMN "public"."energy_session_assignments"."block_logs" IS 'Per-work-block completion: { [intervalId]: { done: boolean, note?: string } }';



COMMENT ON COLUMN "public"."energy_session_assignments"."activity_type" IS 'Activité réellement faite (saisie athlète en fin de séance)';



COMMENT ON COLUMN "public"."energy_session_assignments"."distance_km" IS 'Distance réalisée (km) — compte dans le volume de course si activity_type = course';



CREATE OR REPLACE FUNCTION "public"."_energy_assignment_for_write"("p_assignment" "uuid") RETURNS "public"."energy_session_assignments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_me  uuid := auth.uid();
  v_row public.energy_session_assignments;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_assignment IS NULL THEN
    RAISE EXCEPTION 'Séance obligatoire' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.energy_session_assignments WHERE id = p_assignment FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Séance introuvable' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_row.athlete_id = v_me OR public.is_coach_of(v_row.athlete_id) OR public.current_user_is_admin()) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."_energy_assignment_for_write"("p_assignment" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "coach_id" "uuid",
    "session_id" "text" NOT NULL,
    "session_name" "text" NOT NULL,
    "scheduled_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "duration_s" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "microcycle_id" "uuid",
    "rpe_score" smallint,
    "athlete_modifications" "jsonb",
    "original_scheduled_date" "date",
    "rescheduled_by_athlete" boolean DEFAULT false NOT NULL,
    "coach_alert" boolean DEFAULT false NOT NULL,
    "week_number" integer,
    "run_distance_km" numeric(6,2),
    CONSTRAINT "workout_logs_rpe_score_check" CHECK ((("rpe_score" >= 1) AND ("rpe_score" <= 10))),
    CONSTRAINT "workout_logs_run_distance_km_check" CHECK ((("run_distance_km" IS NULL) OR ("run_distance_km" >= (0)::numeric))),
    CONSTRAINT "workout_logs_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'in_progress'::"text", 'completed'::"text", 'missed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."workout_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."workout_logs"."run_distance_km" IS 'Km courus pendant une séance de muscu (échauffement, finisher…)';



CREATE OR REPLACE FUNCTION "public"."_workout_log_for_write"("p_log" "uuid", "p_coach_only" boolean DEFAULT false) RETURNS "public"."workout_logs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_me  uuid := auth.uid();
  v_row public.workout_logs;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_log IS NULL THEN
    RAISE EXCEPTION 'Séance obligatoire' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.workout_logs WHERE id = p_log FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Séance introuvable' USING ERRCODE = 'P0002';
  END IF;
  IF p_coach_only THEN
    IF NOT public.is_coach_of(v_row.athlete_id) THEN
      RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (v_row.athlete_id = v_me OR public.is_coach_of(v_row.athlete_id)) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."_workout_log_for_write"("p_log" "uuid", "p_coach_only" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_staff_invitation"("p_token" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_inv   public.staff_invitations%ROWTYPE;
  v_coach uuid;
  v_id    uuid;
  v_perm  jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv FROM public.staff_invitations WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation introuvable' USING ERRCODE = 'P0002';
  END IF;
  IF v_inv.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cette invitation a déjà été utilisée' USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'Cette invitation a expiré' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    RAISE EXCEPTION 'Profil introuvable' USING ERRCODE = 'P0002';
  END IF;
  IF v_uid = v_inv.athlete_id THEN
    RAISE EXCEPTION 'Tu ne peux pas rejoindre ton propre staff' USING ERRCODE = '22023';
  END IF;

  SELECT coach_id INTO v_coach FROM public.profiles WHERE id = v_inv.athlete_id;
  IF v_coach = v_uid THEN
    RAISE EXCEPTION 'Tu es déjà le coach principal de cet athlète' USING ERRCODE = '22023';
  END IF;
  -- Invitation d'un coach qui n'est plus le coach principal : caduque.
  IF v_inv.invited_by_role = 'coach' AND v_coach IS DISTINCT FROM v_inv.invited_by THEN
    RAISE EXCEPTION 'Cette invitation n''est plus valable' USING ERRCODE = '22023';
  END IF;

  v_perm := CASE WHEN v_inv.invited_by_role = 'athlete'
                 THEN public.staff_default_permissions(v_inv.profession)
                 ELSE v_inv.permissions END;

  PERFORM set_config('agon.staff_accept', 'on', true);

  INSERT INTO public.athlete_staff AS s (
    athlete_id, staff_id, profession, permissions, can_edit_coach_content,
    added_by, added_by_role, athlete_notified_at, coach_notified_at
  ) VALUES (
    v_inv.athlete_id, v_uid, v_inv.profession, v_perm,
    CASE WHEN v_inv.invited_by_role = 'athlete' THEN false ELSE v_inv.can_edit_coach_content END,
    v_inv.invited_by, v_inv.invited_by_role,
    CASE WHEN v_inv.invited_by = v_inv.athlete_id THEN now() ELSE NULL END,
    CASE WHEN v_inv.invited_by_role = 'coach' THEN now() ELSE NULL END
  )
  ON CONFLICT (athlete_id, staff_id) DO UPDATE SET
    profession             = EXCLUDED.profession,
    permissions            = EXCLUDED.permissions,
    can_edit_coach_content = EXCLUDED.can_edit_coach_content,
    status                 = 'active',
    added_by               = EXCLUDED.added_by,
    added_by_role          = EXCLUDED.added_by_role,
    athlete_notified_at    = EXCLUDED.athlete_notified_at,
    coach_notified_at      = EXCLUDED.coach_notified_at,
    revoked_at             = NULL,
    revoked_by             = NULL
  RETURNING s.id INTO v_id;

  PERFORM set_config('agon.staff_accept', 'off', true);

  UPDATE public.staff_invitations SET used_at = now(), used_by = v_uid WHERE id = v_inv.id;

  -- Métier par défaut du compte, s'il n'en a pas encore.
  UPDATE public.profiles SET profession = v_inv.profession
   WHERE id = v_uid AND profession IS NULL;

  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."accept_staff_invitation"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activity_detail_upsert"("p_activity" "uuid", "p_detail" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."activity_detail_upsert"("p_activity" "uuid", "p_detail" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activity_detail_visible"("p_athlete" "uuid", "p_source" "public"."data_source") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT p_athlete = auth.uid()
    OR (
      (public.is_coach_of(p_athlete) OR public.staff_can(p_athlete, 'seances', 'read'))
      AND EXISTS (SELECT 1 FROM public.data_source_policies p WHERE p.source = p_source AND p.coach_visible)
      AND public.source_consent_granted(p_athlete, p_source)
    );
$$;


ALTER FUNCTION "public"."activity_detail_visible"("p_athlete" "uuid", "p_source" "public"."data_source") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activity_from_garmin_device"("p_source" "public"."data_source", "p_raw" "jsonb", "p_device" "text", "p_sources" "text"[]) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT p_source = 'garmin'
    OR coalesce(p_sources && ARRAY['garmin', 'garmin_export'], false)
    OR coalesce(p_raw->>'manufacturer' = '1', false)
    OR coalesce((p_raw->'creator')::text ILIKE '%garmin%', false)
    OR coalesce(p_device ILIKE '%garmin%', false);
$$;


ALTER FUNCTION "public"."activity_from_garmin_device"("p_source" "public"."data_source", "p_raw" "jsonb", "p_device" "text", "p_sources" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activity_laps_editor"("p_athlete" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT auth.uid() IS NOT NULL AND (auth.uid() = p_athlete OR public.is_coach_of(p_athlete));
$$;


ALTER FUNCTION "public"."activity_laps_editor"("p_athlete" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activity_sport_family"("p_sport" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
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


ALTER FUNCTION "public"."activity_sport_family"("p_sport" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activity_zone_seconds"("p_t" integer[], "p_timer" integer[], "p_hr" smallint[], "p_bounds" smallint[]) RETURNS integer[]
    LANGUAGE "sql" IMMUTABLE
    AS $$
  WITH pts AS (
    SELECT i,
           CASE WHEN i < cardinality(p_t) THEN
             CASE WHEN p_timer IS NOT NULL AND p_timer[i] IS NOT NULL AND p_timer[i + 1] IS NOT NULL
                       AND p_timer[i + 1] = p_timer[i] THEN 0
                  ELSE greatest(0, least(p_t[i + 1] - p_t[i], 10)) END
           ELSE 0 END AS w,
           CASE WHEN p_hr[i] IS NULL THEN NULL ELSE width_bucket(p_hr[i]::integer, p_bounds::integer[]) + 1 END AS z
      FROM generate_subscripts(p_t, 1) i
  )
  SELECT ARRAY(
    SELECT coalesce((SELECT sum(w) FROM pts WHERE z = k), 0)::integer
      FROM generate_series(1, cardinality(p_bounds) + 1) k ORDER BY k
  ) || coalesce((SELECT sum(w) FROM pts WHERE z IS NULL), 0)::integer;
$$;


ALTER FUNCTION "public"."activity_zone_seconds"("p_t" integer[], "p_timer" integer[], "p_hr" smallint[], "p_bounds" smallint[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_co_coach"("p_athlete" "uuid", "p_coach_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_referent uuid;
  v_role     text;
  v_coach    public.profiles%ROWTYPE;
BEGIN
  SELECT coach_id INTO v_referent FROM public.profiles WHERE id = p_athlete;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Athlète introuvable' USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() = p_athlete THEN
    v_role := 'athlete';
  ELSIF v_referent IS NOT NULL AND auth.uid() = v_referent THEN
    v_role := 'coach';
  ELSE
    RAISE EXCEPTION 'Non autorisé' USING ERRCODE = '42501';
  END IF;

  IF v_referent IS NULL THEN
    RAISE EXCEPTION 'L''athlète doit d''abord avoir un coach' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_coach FROM public.profiles
   WHERE upper(coach_code) = upper(trim(p_coach_code))
     AND role IN ('coach', 'coach_athlete');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Code coach invalide' USING ERRCODE = 'P0001';
  END IF;

  IF v_coach.id = v_referent THEN
    RAISE EXCEPTION 'Ce coach est déjà le coach de l''athlète' USING ERRCODE = 'P0001';
  END IF;
  -- Se co-coacher soi-même : uniquement à sa propre demande
  IF v_coach.id = p_athlete AND v_role <> 'athlete' THEN
    RAISE EXCEPTION 'Seul l''athlète peut se déclarer co-coach de lui-même' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.athlete_co_coaches WHERE athlete_id = p_athlete) THEN
    RAISE EXCEPTION 'L''athlète a déjà deux coachs' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.athlete_co_coaches (athlete_id, co_coach_id, added_by, added_by_role)
  VALUES (p_athlete, v_coach.id, auth.uid(), v_role);

  RETURN jsonb_build_object('co_coach_id', v_coach.id, 'full_name', v_coach.full_name);
END;
$$;


ALTER FUNCTION "public"."add_co_coach"("p_athlete" "uuid", "p_coach_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ai_eligible_sources"("p_athlete" "uuid") RETURNS "public"."data_source"[]
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.current_consents c
       WHERE c.user_id = p_athlete
         AND c.purpose = 'ai_programming'
         AND c.granted
    ) THEN '{}'::public.data_source[]
    ELSE COALESCE(
      (SELECT array_agg(p.source ORDER BY p.source)
         FROM public.data_source_policies p
        WHERE p.ai_allowed),
      '{}'::public.data_source[]
    )
  END;
$$;


ALTER FUNCTION "public"."ai_eligible_sources"("p_athlete" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."ai_eligible_sources"("p_athlete" "uuid") IS 'Sources de données transmissibles à un service d''IA pour cet athlète : conditions du fournisseur ET consentement ai_programming. Tableau vide si l''athlète a refusé l''IA.';



CREATE OR REPLACE FUNCTION "public"."apply_hr_zone_model_to_past"("p_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  m record;
  n integer;
BEGIN
  SELECT * INTO m FROM public.hr_zone_models WHERE id = p_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_hr_zone_model_to_past : modèle introuvable' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NULL OR NOT public.is_coach_of(m.athlete_id) THEN
    RAISE EXCEPTION 'apply_hr_zone_model_to_past : réservé au coach' USING ERRCODE = '42501';
  END IF;
  -- Les modèles plus anciens cèdent la place (historique conservé).
  UPDATE public.hr_zone_models
     SET status = 'replaced'
   WHERE athlete_id = m.athlete_id AND status = 'active' AND id <> m.id
     AND (valid_from < m.valid_from OR (valid_from = m.valid_from AND created_at < m.created_at));
  -- Valable depuis toujours ; un modèle five fige les références d'aujourd'hui.
  UPDATE public.hr_zone_models
     SET valid_from = DATE '2000-01-01',
         refs_day = CASE WHEN kind = 'five' THEN current_date ELSE refs_day END
   WHERE id = m.id;
  SELECT count(*) INTO n FROM public.activity_zone_summaries WHERE athlete_id = m.athlete_id;
  RETURN n;
END;
$$;


ALTER FUNCTION "public"."apply_hr_zone_model_to_past"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_source_ai_policy"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_allowed boolean;
BEGIN
  SELECT ai_allowed INTO v_allowed
    FROM public.data_source_policies WHERE source = NEW.source;

  IF v_allowed IS NULL THEN
    RAISE EXCEPTION
      'Source % absente de data_source_policies : ajouter sa politique avant d''importer ses données', NEW.source;
  END IF;

  NEW.ai_allowed := v_allowed;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."apply_source_ai_policy"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."athlete_staff_before_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Seule accept_staff_invitation() crée un lien (pas de policy INSERT ; ceci
  -- protège aussi contre un appel direct par un rôle privilégié par erreur).
  IF current_setting('agon.staff_accept', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Un lien staff se crée uniquement en acceptant une invitation'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.added_by_role = 'athlete' THEN
    NEW.permissions := public.staff_default_permissions(NEW.profession);
    NEW.can_edit_coach_content := false;
  END IF;
  NEW.permissions := public.staff_normalize_permissions(NEW.permissions);
  NEW.status := 'active';
  NEW.revoked_at := NULL;
  NEW.revoked_by := NULL;
  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."athlete_staff_before_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."athlete_staff_before_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_coach boolean;
  v_rights_changed boolean;
BEGIN
  -- Réactivation par une nouvelle invitation acceptée : la RPC fixe tout.
  IF current_setting('agon.staff_accept', true) = 'on' THEN
    NEW.permissions := public.staff_normalize_permissions(NEW.permissions);
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NEW.athlete_id <> OLD.athlete_id
     OR NEW.staff_id <> OLD.staff_id
     OR NEW.added_by IS DISTINCT FROM OLD.added_by
     OR NEW.added_by_role <> OLD.added_by_role
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Ces champs du lien staff ne sont pas modifiables' USING ERRCODE = '42501';
  END IF;

  v_is_coach := public.is_coach_of(OLD.athlete_id);
  v_rights_changed := NEW.permissions IS DISTINCT FROM OLD.permissions
                   OR NEW.can_edit_coach_content <> OLD.can_edit_coach_content
                   OR NEW.profession <> OLD.profession;

  -- Seul le coach principal règle les droits (spec §5.2).
  IF v_rights_changed AND NOT v_is_coach THEN
    RAISE EXCEPTION 'Seul le coach principal peut modifier les droits d''un professionnel'
      USING ERRCODE = '42501';
  END IF;

  -- Révocation : coach principal, athlète, ou le pro lui-même. Pas de
  -- réactivation directe : il faut une nouvelle invitation.
  IF NEW.status <> OLD.status THEN
    IF NEW.status = 'active' THEN
      RAISE EXCEPTION 'Pour rétablir un accès, envoie une nouvelle invitation' USING ERRCODE = '42501';
    END IF;
    IF NOT (v_is_coach OR v_uid = OLD.athlete_id OR v_uid = OLD.staff_id) THEN
      RAISE EXCEPTION 'Action non autorisée' USING ERRCODE = '42501';
    END IF;
    NEW.revoked_at := now();
    NEW.revoked_by := v_uid;
  ELSE
    NEW.revoked_at := OLD.revoked_at;
    NEW.revoked_by := OLD.revoked_by;
  END IF;

  -- Accusés de lecture : chacun ne marque que le sien.
  IF NEW.athlete_notified_at IS DISTINCT FROM OLD.athlete_notified_at
     AND v_uid IS DISTINCT FROM OLD.athlete_id THEN
    NEW.athlete_notified_at := OLD.athlete_notified_at;
  END IF;
  IF NEW.coach_notified_at IS DISTINCT FROM OLD.coach_notified_at AND NOT v_is_coach THEN
    NEW.coach_notified_at := OLD.coach_notified_at;
  END IF;

  IF v_rights_changed THEN
    NEW.permissions := public.staff_normalize_permissions(NEW.permissions);
    -- L'athlète est informé de chaque changement (spec §6) — sauf s'il est
    -- son propre coach.
    IF v_uid IS DISTINCT FROM OLD.athlete_id THEN
      NEW.athlete_notified_at := NULL;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."athlete_staff_before_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_link_day"("p_athlete" "uuid", "p_day" "date") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."auto_link_day"("p_athlete" "uuid", "p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_coach_athlete"("athlete_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT athlete_uuid IS NOT NULL AND (
    public.is_coach_of(athlete_uuid)
    OR (athlete_uuid = auth.uid() AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach'))
  );
$$;


ALTER FUNCTION "public"."can_coach_athlete"("athlete_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_read_doc"("doc_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.docs d
    WHERE d.id = doc_uuid
      AND (
        -- propriétaire / auteur
        d.coach_id = auth.uid()
        OR d.uploaded_by = auth.uid()
        -- fiche personnelle ou ajout de l'athlète
        OR d.athlete_id = auth.uid()
        -- attribuée directement, ou même famille (origine + variantes) qu'une fiche attribuée
        OR EXISTS (
          SELECT 1
          FROM public.doc_assignments a
          JOIN public.docs ad ON ad.id = a.doc_id
          WHERE a.athlete_id = auth.uid()
            AND COALESCE(ad.origin_id, ad.id) = COALESCE(d.origin_id, d.id)
        )
        -- libre-service du coach de l'athlète (l'origine porte le flag)
        OR EXISTS (
          SELECT 1
          FROM public.docs o
          WHERE o.id = COALESCE(d.origin_id, d.id)
            AND o.is_self_service
            AND o.archived_at IS NULL
            AND o.coach_id = (SELECT p.coach_id FROM public.profiles p WHERE p.id = auth.uid())
        )
        -- CO-COACH / RÉFÉRENT : fiche perso d'un athlète commun, ou même famille
        -- qu'une fiche attribuée à un athlète que je coache
        OR (d.athlete_id IS NOT NULL AND public.is_coach_of(d.athlete_id))
        OR EXISTS (
          SELECT 1
          FROM public.doc_assignments a
          JOIN public.docs ad ON ad.id = a.doc_id
          WHERE COALESCE(ad.origin_id, ad.id) = COALESCE(d.origin_id, d.id)
            AND public.is_coach_of(a.athlete_id)
        )
        -- STAFF : fiche personnelle d'un athlète suivi (fiches: read)
        OR (d.athlete_id IS NOT NULL AND public.staff_can(d.athlete_id, 'fiches', 'read'))
        -- STAFF : même famille qu'une fiche attribuée à un athlète suivi
        OR EXISTS (
          SELECT 1
          FROM public.doc_assignments a
          JOIN public.docs ad ON ad.id = a.doc_id
          WHERE COALESCE(ad.origin_id, ad.id) = COALESCE(d.origin_id, d.id)
            AND public.staff_can(a.athlete_id, 'fiches', 'read')
        )
        -- STAFF : banque du coach (fiches communes, non archivées) si fiches: write
        OR (d.athlete_id IS NULL AND d.archived_at IS NULL AND public.staff_can_write_bank(d.coach_id))
      )
  );
$$;


ALTER FUNCTION "public"."can_read_doc"("doc_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_read_doc_file"("object_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.docs d
      WHERE d.file_path = object_name
        AND public.can_read_doc(d.id)
    )
    OR EXISTS (
      SELECT 1 FROM public.doc_comments c
      WHERE c.image_path = object_name
        AND (
          c.athlete_id = auth.uid()
          OR c.author_id = auth.uid()
          OR public.is_coach_of(c.athlete_id)
          -- STAFF
          OR public.staff_can(c.athlete_id, 'commentaires', 'read')
        )
    );
$$;


ALTER FUNCTION "public"."can_read_doc_file"("object_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_microcycle_dates"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  cyc RECORD;
BEGIN
  SELECT start_date, end_date INTO cyc
    FROM public.cycles WHERE id = NEW.cycle_id;

  -- Only block microcycles that have zero overlap with the cycle.
  IF NEW.end_date < cyc.start_date OR NEW.start_date > cyc.end_date THEN
    RAISE EXCEPTION
      'Microcycle semaine % (% → %) sans chevauchement avec le cycle (% → %)',
      NEW.week_number, NEW.start_date, NEW.end_date, cyc.start_date, cyc.end_date;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_microcycle_dates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."citation_likes_sync"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    insert into public.citation_stats (quote_id, likes) values (new.quote_id, 1)
    on conflict (quote_id) do update set likes = public.citation_stats.likes + 1;
    return new;
  else
    update public.citation_stats set likes = greatest(likes - 1, 0) where quote_id = old.quote_id;
    return old;
  end if;
end $$;


ALTER FUNCTION "public"."citation_likes_sync"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_unfinished_workouts"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.workout_logs
  SET status       = 'completed',
      completed_at = COALESCE(completed_at, (scheduled_date + TIME '18:00') AT TIME ZONE 'UTC'),
      updated_at   = now()
  WHERE status = 'planned'
    AND scheduled_date < CURRENT_DATE
    AND scheduled_date >= CURRENT_DATE - 30
    AND public.workout_log_has_entries(athlete_modifications);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."close_unfinished_workouts"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."close_unfinished_workouts"() IS 'Passe en completed les séances passées contenant des saisies mais jamais clôturées.';



CREATE OR REPLACE FUNCTION "public"."coach_api_hit"("p_key" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_hits integer;
BEGIN
  DELETE FROM public.coach_api_rate
   WHERE key_id = p_key AND window_start < date_trunc('minute', now());

  INSERT INTO public.coach_api_rate (key_id, window_start, hits)
  VALUES (p_key, date_trunc('minute', now()), 1)
  ON CONFLICT (key_id, window_start)
  DO UPDATE SET hits = public.coach_api_rate.hits + 1
  RETURNING hits INTO v_hits;

  RETURN v_hits;
END;
$$;


ALTER FUNCTION "public"."coach_api_hit"("p_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_code_exists"("p_code" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE coach_code = upper(trim(p_code))
       AND role IN ('coach', 'coach_athlete')
  );
$$;


ALTER FUNCTION "public"."coach_code_exists"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_preview_by_code"("p_code" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT coalesce(nullif(trim(full_name), ''), 'Ton coach')
    FROM public.profiles
   WHERE length(trim(coalesce(p_code, ''))) = 6
     AND coach_code = upper(trim(p_code))
     AND role IN ('coach', 'coach_athlete')
   LIMIT 1;
$$;


ALTER FUNCTION "public"."coach_preview_by_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_profile_visible"("p_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT auth.uid() IS NOT NULL AND (
       p_id = (SELECT coach_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.athlete_co_coaches cc
                WHERE cc.athlete_id = auth.uid() AND cc.co_coach_id = p_id)
    OR EXISTS (SELECT 1 FROM public.profiles a
                WHERE a.coach_id = p_id AND public.is_coach_of(a.id))
    OR EXISTS (SELECT 1 FROM public.athlete_co_coaches cc
                WHERE cc.co_coach_id = p_id AND public.is_coach_of(cc.athlete_id))
    OR EXISTS (SELECT 1 FROM public.athlete_staff s
                 JOIN public.profiles a ON a.id = s.athlete_id
                WHERE s.staff_id = auth.uid()
                  AND (a.coach_id = p_id
                       OR EXISTS (SELECT 1 FROM public.athlete_co_coaches cc
                                   WHERE cc.athlete_id = a.id AND cc.co_coach_id = p_id)))
    OR public.current_user_is_admin()
  );
$$;


ALTER FUNCTION "public"."coach_profile_visible"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_energy_assignment"("p_assignment" "uuid", "p_block_logs" "jsonb" DEFAULT NULL::"jsonb", "p_notes" "text" DEFAULT NULL::"text", "p_duration_min" integer DEFAULT NULL::integer, "p_activity_url" "text" DEFAULT NULL::"text", "p_activity_type" "text" DEFAULT NULL::"text", "p_distance_km" numeric DEFAULT NULL::numeric, "p_rpe" smallint DEFAULT NULL::smallint) RETURNS "public"."energy_session_assignments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row public.energy_session_assignments;
BEGIN
  v_row := public._energy_assignment_for_write(p_assignment);
  IF p_block_logs IS NOT NULL AND jsonb_typeof(p_block_logs) <> 'object' THEN
    RAISE EXCEPTION 'Saisie des blocs invalide' USING ERRCODE = '22023';
  END IF;
  IF p_rpe IS NOT NULL AND (p_rpe < 1 OR p_rpe > 10) THEN
    RAISE EXCEPTION 'RPE entre 1 et 10' USING ERRCODE = '22023';
  END IF;
  IF p_duration_min IS NOT NULL AND p_duration_min < 0 THEN
    RAISE EXCEPTION 'Durée invalide' USING ERRCODE = '22023';
  END IF;
  IF p_distance_km IS NOT NULL AND p_distance_km < 0 THEN
    RAISE EXCEPTION 'Distance invalide' USING ERRCODE = '22023';
  END IF;
  IF p_activity_type IS NOT NULL AND p_activity_type NOT IN ('course', 'velo', 'rameur', 'natation', 'autre') THEN
    RAISE EXCEPTION 'Activité inconnue' USING ERRCODE = '22023';
  END IF;

  UPDATE public.energy_session_assignments
     SET status              = 'completed',
         block_logs          = COALESCE(block_logs, '{}'::jsonb) || COALESCE(p_block_logs, '{}'::jsonb),
         notes               = COALESCE(NULLIF(btrim(p_notes), ''), notes),
         actual_duration_min = COALESCE(p_duration_min, actual_duration_min),
         activity_url        = COALESCE(NULLIF(btrim(p_activity_url), ''), activity_url),
         activity_type       = COALESCE(p_activity_type, activity_type),
         distance_km         = CASE WHEN p_activity_type IS NOT NULL THEN p_distance_km
                                    ELSE COALESCE(p_distance_km, distance_km) END,
         rpe_score           = COALESCE(p_rpe, rpe_score)
   WHERE id = p_assignment
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."complete_energy_assignment"("p_assignment" "uuid", "p_block_logs" "jsonb", "p_notes" "text", "p_duration_min" integer, "p_activity_url" "text", "p_activity_type" "text", "p_distance_km" numeric, "p_rpe" smallint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_workout"("p_log" "uuid", "p_mods" "jsonb" DEFAULT NULL::"jsonb", "p_run_km" numeric DEFAULT NULL::numeric, "p_rpe" smallint DEFAULT NULL::smallint) RETURNS "public"."workout_logs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row  public.workout_logs;
  v_mods jsonb;
BEGIN
  v_row := public._workout_log_for_write(p_log);
  IF p_mods IS NOT NULL AND jsonb_typeof(p_mods) <> 'object' THEN
    RAISE EXCEPTION 'Saisie invalide' USING ERRCODE = '22023';
  END IF;
  IF p_rpe IS NOT NULL AND (p_rpe < 1 OR p_rpe > 10) THEN
    RAISE EXCEPTION 'RPE entre 1 et 10' USING ERRCODE = '22023';
  END IF;
  IF p_run_km IS NOT NULL AND p_run_km < 0 THEN
    RAISE EXCEPTION 'Distance invalide' USING ERRCODE = '22023';
  END IF;

  v_mods := v_row.athlete_modifications;
  IF p_mods IS NOT NULL AND (p_mods - 'coachOverride') <> '{}'::jsonb THEN
    v_mods := COALESCE(v_mods, '{}'::jsonb) || (p_mods - 'coachOverride');
  END IF;

  UPDATE public.workout_logs
     SET status                = 'completed',
         completed_at          = COALESCE(completed_at, now()),
         athlete_modifications = v_mods,
         run_distance_km       = COALESCE(p_run_km, run_distance_km),
         rpe_score             = COALESCE(p_rpe, rpe_score)
   WHERE id = p_log
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."complete_workout"("p_log" "uuid", "p_mods" "jsonb", "p_run_km" numeric, "p_rpe" smallint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."complete_workout"("p_log" "uuid", "p_mods" "jsonb", "p_run_km" numeric, "p_rpe" smallint) IS 'Valide une séance (athlète ou coach) : statut, completed_at conservé, saisie fusionnée sans toucher coachOverride. Idempotent.';



CREATE OR REPLACE FUNCTION "public"."consume_oauth_state"("p_state" "text") RETURNS TABLE("athlete_id" "uuid", "provider" "public"."data_source", "api_host" "text", "code_verifier" "text", "redirect_uri" "text")
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  DELETE FROM public.provider_oauth_states s
   WHERE s.state = p_state
     AND s.expires_at > now()
  RETURNING s.athlete_id, s.provider, s.api_host, s.code_verifier, s.redirect_uri;
$$;


ALTER FUNCTION "public"."consume_oauth_state"("p_state" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."consume_oauth_state"("p_state" "text") IS 'Lit et supprime une autorisation en cours en une opération. Renvoie zéro ligne si le state est inconnu, déjà consommé ou expiré.';



CREATE OR REPLACE FUNCTION "public"."create_cycle"("p_athlete" "uuid", "p_name" "text", "p_start" "date", "p_end" "date", "p_mesocycle" "uuid" DEFAULT NULL::"uuid", "p_deload_week" integer DEFAULT NULL::integer, "p_sessions" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."create_cycle"("p_athlete" "uuid", "p_name" "text", "p_start" "date", "p_end" "date", "p_mesocycle" "uuid", "p_deload_week" integer, "p_sessions" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin);
$$;


ALTER FUNCTION "public"."current_user_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cycle_athlete_id"("p_cycle_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN cy.mesocycle_id IS NULL THEN cy.athlete_id
    ELSE ma.athlete_id
  END
  FROM public.cycles cy
  LEFT JOIN public.mesocycles  me ON me.id = cy.mesocycle_id
  LEFT JOIN public.macrocycles ma ON ma.id = me.macrocycle_id
  WHERE cy.id = p_cycle_id;
$$;


ALTER FUNCTION "public"."cycle_athlete_id"("p_cycle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cycle_coach_id"("p_cycle_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN cy.mesocycle_id IS NULL THEN cy.coach_id
    ELSE ma.coach_id
  END
  FROM public.cycles cy
  LEFT JOIN public.mesocycles  me ON me.id = cy.mesocycle_id
  LEFT JOIN public.macrocycles ma ON ma.id = me.macrocycle_id
  WHERE cy.id = p_cycle_id;
$$;


ALTER FUNCTION "public"."cycle_coach_id"("p_cycle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decide_hr_zone_model"("p_id" "uuid", "p_accept" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_athlete uuid;
BEGIN
  SELECT athlete_id INTO v_athlete FROM public.hr_zone_models WHERE id = p_id AND status = 'proposed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'decide_hr_zone_model : proposition introuvable' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NULL OR NOT public.is_coach_of(v_athlete) THEN
    RAISE EXCEPTION 'decide_hr_zone_model : réservé au coach' USING ERRCODE = '42501';
  END IF;
  UPDATE public.hr_zone_models
     SET status = CASE WHEN p_accept THEN 'active' ELSE 'rejected' END,
         valid_from = CASE WHEN p_accept THEN current_date ELSE valid_from END,
         decided_by = auth.uid(), decided_at = now()
   WHERE id = p_id;
END;
$$;


ALTER FUNCTION "public"."decide_hr_zone_model"("p_id" "uuid", "p_accept" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decide_plan_link"("p_link" "uuid", "p_confirm" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."decide_plan_link"("p_link" "uuid", "p_confirm" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_energy_session"("p_session_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_created_by uuid;
  v_athlete_id uuid;
BEGIN
  SELECT created_by, athlete_id INTO v_created_by, v_athlete_id
  FROM energy_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  -- Mêmes droits que la policy es_delete, plus les admins
  IF NOT (
    v_created_by = auth.uid()
    OR (v_athlete_id IS NOT NULL AND public.is_coach_of(v_athlete_id))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  ) THEN
    RAISE EXCEPTION 'Suppression non autorisée' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM energy_session_assignments WHERE energy_session_id = p_session_id) THEN
    UPDATE energy_sessions SET archived_at = now(), updated_at = now() WHERE id = p_session_id;
    RETURN 'archived';
  END IF;

  DELETE FROM energy_sessions WHERE id = p_session_id;
  RETURN 'deleted';
END;
$$;


ALTER FUNCTION "public"."delete_energy_session"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."doc_for_my_athlete"("doc_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.docs d
     WHERE d.id = doc_uuid
       AND (
         (d.athlete_id IS NOT NULL AND public.is_coach_of(d.athlete_id))
         OR EXISTS (
           SELECT 1
             FROM public.doc_assignments a
             JOIN public.docs ad ON ad.id = a.doc_id
            WHERE COALESCE(ad.origin_id, ad.id) = COALESCE(d.origin_id, d.id)
              AND public.is_coach_of(a.athlete_id)
         )
       )
  );
$$;


ALTER FUNCTION "public"."doc_for_my_athlete"("doc_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."drop_co_coach_on_coach_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.coach_id IS DISTINCT FROM OLD.coach_id THEN
    DELETE FROM public.athlete_co_coaches WHERE athlete_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."drop_co_coach_on_coach_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_min_age_on_signup"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_today date := ((now() AT TIME ZONE 'UTC') + interval '14 hours')::date;
  v_msg   text;
BEGIN
  -- Seules la création du profil et l'activation d'un compte pré-créé comptent.
  IF TG_OP = 'UPDATE' AND NOT (coalesce(OLD.is_pending, false) AND NOT coalesce(NEW.is_pending, false)) THEN
    RETURN NEW;
  END IF;

  -- PHASE 2 : date absente refusée, sauf profil créé côté serveur.
  IF NEW.birth_date IS NULL THEN
    IF TG_OP = 'INSERT' AND auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Indique ta date de naissance.' USING ERRCODE = '23514';
  END IF;

  v_msg := public.signup_birth_date_error(NEW.birth_date, v_today);
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION '%', v_msg USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_min_age_on_signup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_app_update_reads"() RETURNS TABLE("update_id" "text", "user_id" "uuid", "full_name" "text", "seen_at" timestamp with time zone, "total_coaches" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  RETURN QUERY
    SELECT r.update_id, r.user_id, p.full_name, r.seen_at,
           (SELECT count(*) FROM public.profiles WHERE role IN ('coach', 'coach_athlete'))
      FROM public.app_update_reads r
      JOIN public.profiles p ON p.id = r.user_id
     WHERE p.role IN ('coach', 'coach_athlete')
     ORDER BY r.seen_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_app_update_reads"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_claim_info"("p_token" "text") RETURNS TABLE("first_name" "text", "last_name" "text", "coach_code" "text", "coach_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT a.first_name, a.last_name, c.coach_code, c.full_name
  FROM athlete_claims ac
  JOIN profiles a ON a.id = ac.athlete_id AND a.is_pending
  LEFT JOIN profiles c ON c.id = a.coach_id
  WHERE ac.token = p_token
$$;


ALTER FUNCTION "public"."get_claim_info"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_coach_overview"("coach_uuid" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_athlete_ids uuid[];
  v_today       date := CURRENT_DATE;
  v_yesterday   date := CURRENT_DATE - 1;
  v_30_days     date := CURRENT_DATE + 30;
  v_result      jsonb;
BEGIN
  -- Sécurité : le coach ne peut demander que ses propres données
  IF auth.uid() != coach_uuid THEN
    RAISE EXCEPTION 'Accès refusé : coach_uuid ne correspond pas à l''utilisateur connecté';
  END IF;

  -- 1. IDs des athlètes de ce coach
  -- (+ athlètes co-coachés : co-coach = mêmes droits que le coach référent)
  SELECT array_agg(id) INTO v_athlete_ids
  FROM public.profiles
  WHERE coach_id = coach_uuid
     OR id IN (SELECT cc.athlete_id FROM public.athlete_co_coaches cc WHERE cc.co_coach_id = coach_uuid);

  -- Pas d'athlètes → retourne un état vide
  IF v_athlete_ids IS NULL OR array_length(v_athlete_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'athlete_count',       0,
      'competitions_count',  0,
      'wellness_today',      '[]'::jsonb,
      'wellness_history',    '[]'::jsonb,
      'sessions_data',       '[]'::jsonb,
      'competitions_upcoming','[]'::jsonb,
      'recent_activity',     '[]'::jsonb
    );
  END IF;

  SELECT jsonb_build_object(
    -- KPI : nombre d'athlètes
    'athlete_count', array_length(v_athlete_ids, 1),

    -- KPI : compétitions dans les 30 prochains jours
    'competitions_count', (
      SELECT COUNT(*)
      FROM public.competitions
      WHERE athlete_id = ANY(v_athlete_ids)
        AND date >= v_today
        AND date <= v_30_days
    ),

    -- Wellness du jour (score + détails) par athlète
    'wellness_today', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'athlete_id', athlete_id,
        'value', value
      ))
      FROM public.app_data
      WHERE athlete_id = ANY(v_athlete_ids)
        AND key = 'asp:wellness'
    ), '[]'::jsonb),

    -- Historique wellness (7 derniers jours) pour détection surcharge
    'wellness_history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'athlete_id', athlete_id,
        'value', value
      ))
      FROM public.app_data
      WHERE athlete_id = ANY(v_athlete_ids)
        AND key = 'asp:wh'
    ), '[]'::jsonb),

    -- Données sessions (blockConfig + sessions + completed) pour ratio + missed
    'sessions_data', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'athlete_id', athlete_id,
        'key', key,
        'value', value
      ))
      FROM public.app_data
      WHERE athlete_id = ANY(v_athlete_ids)
        AND key IN ('asp:completed', 'asp:blockConfig', 'asp:sessions')
    ), '[]'::jsonb),

    -- Compétitions à venir (données complètes pour AlertCards)
    'competitions_upcoming', COALESCE((
      SELECT jsonb_agg(row_to_json(c.*)::jsonb ORDER BY c.date ASC)
      FROM public.competitions c
      WHERE c.athlete_id = ANY(v_athlete_ids)
        AND c.date >= v_today
        AND c.date <= v_30_days
    ), '[]'::jsonb),

    -- Activité récente (app_data mis à jour) pour la timeline
    'recent_activity', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'athlete_id', athlete_id,
        'key', key,
        'updated_at', updated_at
      ) ORDER BY updated_at DESC)
      FROM (
        SELECT athlete_id, key, updated_at
        FROM public.app_data
        WHERE athlete_id = ANY(v_athlete_ids)
          AND key IN ('asp:sessionlogs', 'asp:wh')
        ORDER BY updated_at DESC
        LIMIT 30
      ) sub
    ), '[]'::jsonb)

  ) INTO v_result;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_coach_overview"("coach_uuid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_coach_overview"("coach_uuid" "uuid") IS 'Retourne toutes les données agrégées du Home coach en un seul appel. Sécurité INVOKER : les RLS s''appliquent, coach_uuid doit = auth.uid().';



CREATE OR REPLACE FUNCTION "public"."get_coaches_list"() RETURNS TABLE("id" "uuid", "full_name" "text", "coach_code" "text", "created_at" timestamp with time zone, "is_admin" boolean, "is_certified_coach" boolean, "athlete_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_certified_coach = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized: certified coach required';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.coach_code,
    p.created_at,
    p.is_admin,
    p.is_certified_coach,
    COUNT(a.id)::bigint AS athlete_count
  FROM public.profiles p
  LEFT JOIN public.profiles a ON a.coach_id = p.id
  WHERE p.role IN ('coach', 'coach_athlete')
  GROUP BY p.id, p.full_name, p.coach_code, p.created_at, p.is_admin, p.is_certified_coach
  ORDER BY p.full_name;
END;
$$;


ALTER FUNCTION "public"."get_coaches_list"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_coach_email"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT u.email::text
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.coach_id
  WHERE p.id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_coach_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_staff_invitation"("p_token" "text") RETURNS TABLE("athlete_name" "text", "coach_name" "text", "inviter_name" "text", "invited_by_role" "text", "profession" "text", "status" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT a.full_name,
         c.full_name,
         i_by.full_name,
         i.invited_by_role,
         i.profession,
         CASE
           WHEN i.used_at IS NOT NULL THEN 'used'
           WHEN i.expires_at < now()  THEN 'expired'
           ELSE 'valid'
         END
    FROM public.staff_invitations i
    JOIN public.profiles a ON a.id = i.athlete_id
    LEFT JOIN public.profiles c ON c.id = a.coach_id
    LEFT JOIN public.profiles i_by ON i_by.id = i.invited_by
   WHERE i.token = p_token;
$$;


ALTER FUNCTION "public"."get_staff_invitation"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_co_coach_profile_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  allowed text[] := ARRAY[
    'first_name', 'last_name', 'full_name', 'age', 'birth_date', 'height_cm',
    'gender', 'weight_kg', 'body_fat_pct', 'base_metabolism',
    'is_hyrox_athlete', 'hyrox_category', 'habit_tracker_enabled', 'home_hidden_sections'
  ];
BEGIN
  IF auth.uid() IS NULL OR auth.uid() = OLD.id OR auth.uid() IS NOT DISTINCT FROM OLD.coach_id THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_co_coach_of(OLD.id) THEN
    RETURN NEW;  -- autres cas (admin…) : policies existantes
  END IF;
  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'Le co-coach ne peut pas modifier ce champ du profil' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_co_coach_profile_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_profile_privileged_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid  uuid    := auth.uid();
  v_link boolean := coalesce(current_setting('agon.coach_link', true), '') = 'on';
BEGIN
  -- service_role, cron, éditeur SQL : pas de restriction
  IF v_uid IS NULL OR public.current_user_is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_admin := false;
    NEW.is_certified_coach := false;
    IF NEW.role IS NULL OR NEW.role NOT IN ('athlete', 'coach', 'coach_athlete', 'staff') THEN
      RAISE EXCEPTION 'Rôle invalide' USING ERRCODE = '42501';
    END IF;
    IF NEW.coach_id IS NOT NULL AND NOT v_link
       AND NOT (NEW.coach_id = NEW.id AND NEW.role IN ('coach', 'coach_athlete')) THEN
      RAISE EXCEPTION 'Rattachement à un coach : passer par le code coach' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Le rôle ne peut pas être modifié' USING ERRCODE = '42501';
  END IF;

  IF NEW.coach_id IS DISTINCT FROM OLD.coach_id AND NOT v_link THEN
    IF NEW.coach_id IS NULL THEN
      NULL;  -- quitter son coach, ou coach qui retire un athlète (policy dédiée)
    ELSIF NEW.coach_id = NEW.id AND v_uid = OLD.id AND OLD.role IN ('coach', 'coach_athlete') THEN
      NULL;  -- coach-athlète qui redevient son propre coach
    ELSE
      RAISE EXCEPTION 'Rattachement à un coach : passer par le code coach' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_profile_privileged_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."halt_sync_on_consent_withdrawal"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.granted THEN RETURN NEW; END IF;

  UPDATE public.provider_connections
     SET status = 'consent_withdrawn'
   WHERE athlete_id = NEW.user_id
     AND status = 'active'
     AND provider IN (
       SELECT p.source FROM public.data_source_policies p
        WHERE p.consent_purpose = NEW.purpose
     );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."halt_sync_on_consent_withdrawal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."health_app_data_sync"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_aid   uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.athlete_id ELSE NEW.athlete_id END;
  v_key   text := CASE WHEN TG_OP = 'DELETE' THEN OLD.key ELSE NEW.key END;
  v_state text;
  v_cons  text;
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      PERFORM public.health_sync_key(OLD.athlete_id, OLD.key);
    ELSIF TG_OP = 'INSERT' THEN
      PERFORM public.health_sync_key(NEW.athlete_id, NEW.key);
    ELSIF OLD.athlete_id IS DISTINCT FROM NEW.athlete_id OR OLD.key IS DISTINCT FROM NEW.key THEN
      PERFORM public.health_sync_key(OLD.athlete_id, OLD.key);
      PERFORM public.health_sync_key(NEW.athlete_id, NEW.key);
    ELSIF OLD.value IS DISTINCT FROM NEW.value THEN
      PERFORM public.health_sync_key(NEW.athlete_id, NEW.key);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_cons = CONSTRAINT_NAME;
    RAISE WARNING 'health_app_data_sync: synchro % impossible (%)', v_key, v_state;
    INSERT INTO public.health_sync_errors(athlete_id, key, sqlstate, constraint_name)
    SELECT v_aid, v_key, v_state, nullif(v_cons, '')
     WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = v_aid);
  END;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."health_app_data_sync"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."health_day"("p" "text") RETURNS "date"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  s text := regexp_replace(coalesce(p, ''), '^\s+|\s+$', '', 'g');
  m text[];
  y int; mo int; d int;
BEGIN
  m := regexp_match(s, '^([0-9]{4})-([0-9]{2})-([0-9]{2})$');
  IF m IS NULL THEN m := regexp_match(s, '^([0-9]{4})([0-9]{2})([0-9]{2})$'); END IF;
  IF m IS NULL THEN RETURN NULL; END IF;
  y := m[1]::int; mo := m[2]::int; d := m[3]::int;
  IF y < 100 OR mo < 1 OR mo > 12 OR d < 1 THEN RETURN NULL; END IF;
  IF d > extract(day FROM (make_date(y, mo, 1) + interval '1 month - 1 day'))::int THEN RETURN NULL; END IF;
  RETURN make_date(y, mo, d);
END;
$_$;


ALTER FUNCTION "public"."health_day"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."health_hm"("p" "jsonb") RETURNS time without time zone
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN jsonb_typeof(p) = 'object'
     AND public.health_num(p->'h') BETWEEN 0 AND 23 AND public.health_num(p->'h') = trunc(public.health_num(p->'h'))
     AND public.health_num(p->'m') BETWEEN 0 AND 59 AND public.health_num(p->'m') = trunc(public.health_num(p->'m'))
    THEN make_time(public.health_num(p->'h')::int, public.health_num(p->'m')::int, 0)
  END
$$;


ALTER FUNCTION "public"."health_hm"("p" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."health_item"("p" "jsonb") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE WHEN public.health_num(p) BETWEEN 1 AND 5 THEN public.health_num(p) END
$$;


ALTER FUNCTION "public"."health_item"("p" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."health_num"("p" "jsonb") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $_$
  SELECT CASE jsonb_typeof(p)
    WHEN 'number' THEN (p #>> '{}')::numeric
    WHEN 'string' THEN CASE
      WHEN regexp_replace(p #>> '{}', '^\s+|\s+$', '', 'g') ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]{1,3})?$'
      THEN regexp_replace(p #>> '{}', '^\s+|\s+$', '', 'g')::numeric
    END
  END
$_$;


ALTER FUNCTION "public"."health_num"("p" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wellness_entries" (
    "athlete_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "fatigue" numeric,
    "sommeil" numeric,
    "stress" numeric,
    "energie" numeric,
    "doms" numeric,
    "score" smallint GENERATED ALWAYS AS (("round"(((((("fatigue" + "sommeil") + "stress") + "energie") + "doms") * (4)::numeric)))::smallint) STORED,
    "bedtime" time without time zone,
    "wake" time without time zone,
    "sleep_hours" numeric,
    "sleep_interrupted" boolean,
    "sleep_interrupt_note" "text",
    "doms_zones" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "doms_points" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "injury_note" "text",
    "weight_kg" numeric,
    "archived" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "envie" numeric,
    "pain" smallint,
    "sick" boolean,
    "doms_levels" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "doms_workout_id" "uuid",
    "doms_workout_name" "text",
    CONSTRAINT "wellness_entries_doms_check" CHECK ((("doms" >= (1)::numeric) AND ("doms" <= (5)::numeric))),
    CONSTRAINT "wellness_entries_doms_levels_check" CHECK (("jsonb_typeof"("doms_levels") = 'object'::"text")),
    CONSTRAINT "wellness_entries_doms_points_check" CHECK (("jsonb_typeof"("doms_points") = 'array'::"text")),
    CONSTRAINT "wellness_entries_doms_workout_name_check" CHECK ((("doms_workout_name" IS NULL) OR ("length"("doms_workout_name") <= 200))),
    CONSTRAINT "wellness_entries_energie_check" CHECK ((("energie" >= (1)::numeric) AND ("energie" <= (5)::numeric))),
    CONSTRAINT "wellness_entries_envie_check" CHECK ((("envie" >= (1)::numeric) AND ("envie" <= (5)::numeric))),
    CONSTRAINT "wellness_entries_fatigue_check" CHECK ((("fatigue" >= (1)::numeric) AND ("fatigue" <= (5)::numeric))),
    CONSTRAINT "wellness_entries_pain_check" CHECK ((("pain" >= 0) AND ("pain" <= 10))),
    CONSTRAINT "wellness_entries_sleep_hours_check" CHECK ((("sleep_hours" >= (0)::numeric) AND ("sleep_hours" <= (24)::numeric))),
    CONSTRAINT "wellness_entries_sommeil_check" CHECK ((("sommeil" >= (1)::numeric) AND ("sommeil" <= (5)::numeric))),
    CONSTRAINT "wellness_entries_stress_check" CHECK ((("stress" >= (1)::numeric) AND ("stress" <= (5)::numeric))),
    CONSTRAINT "wellness_entries_weight_kg_check" CHECK (("weight_kg" > (0)::numeric))
);


ALTER TABLE "public"."wellness_entries" OWNER TO "postgres";


COMMENT ON TABLE "public"."wellness_entries" IS 'Wellness, une ligne par athlète et par jour. Étape 1 : projection d''app_data (asp:wh, asp:blockHistory) tenue par trigger ; lecture seule pour les clients. docs/SANTE_TABLES.md';



CREATE OR REPLACE FUNCTION "public"."health_parse_wellness"("p_athlete" "uuid", "p_key" "text", "p_v" "jsonb", "p_archived" boolean) RETURNS "public"."wellness_entries"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."health_parse_wellness"("p_athlete" "uuid", "p_key" "text", "p_v" "jsonb", "p_archived" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."health_resync"("p_athlete" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  a uuid;
  n integer := 0;
BEGIN
  FOR a IN
    SELECT DISTINCT athlete_id FROM public.app_data
     WHERE key IN ('asp:wh', 'asp:blockHistory', 'asp:wlog', 'asp:wmile', 'asp:bw')
       AND (p_athlete IS NULL OR athlete_id = p_athlete)
    UNION
    -- Athlètes qui ont des lignes mais plus de clé (clé supprimée hors trigger).
    SELECT athlete_id FROM public.wellness_entries WHERE p_athlete IS NULL OR athlete_id = p_athlete
    UNION SELECT athlete_id FROM public.body_weight_logs WHERE p_athlete IS NULL OR athlete_id = p_athlete
    UNION SELECT athlete_id FROM public.body_weight_milestones WHERE p_athlete IS NULL OR athlete_id = p_athlete
    UNION SELECT athlete_id FROM public.body_weight_goals WHERE p_athlete IS NULL OR athlete_id = p_athlete
  LOOP
    PERFORM public.health_sync_wellness(a);
    PERFORM public.health_sync_weight(a);
    PERFORM public.health_sync_milestones(a);
    PERFORM public.health_sync_goals(a);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;


ALTER FUNCTION "public"."health_resync"("p_athlete" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."health_sync_goals"("p_athlete" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v   jsonb;
  ref numeric;
  tgt numeric;
BEGIN
  IF p_athlete IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('health:' || p_athlete::text, 0));
  SELECT value INTO v FROM public.app_data WHERE athlete_id = p_athlete AND key = 'asp:bw';
  ref := public.health_num(v->'current');
  tgt := public.health_num(v->'target');
  ref := CASE WHEN ref > 0 AND ref < 500 THEN ref END;
  tgt := CASE WHEN tgt > 0 AND tgt < 500 THEN tgt END;
  IF v IS NULL OR jsonb_typeof(v) <> 'object' OR (ref IS NULL AND tgt IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_athlete) THEN
    DELETE FROM public.body_weight_goals WHERE athlete_id = p_athlete;
    RETURN;
  END IF;
  INSERT INTO public.body_weight_goals AS t (athlete_id, reference_kg, target_kg)
  VALUES (p_athlete, ref, tgt)
  ON CONFLICT (athlete_id) DO UPDATE SET reference_kg = EXCLUDED.reference_kg, target_kg = EXCLUDED.target_kg, updated_at = now()
  WHERE (t.reference_kg, t.target_kg) IS DISTINCT FROM (EXCLUDED.reference_kg, EXCLUDED.target_kg);
END;
$$;


ALTER FUNCTION "public"."health_sync_goals"("p_athlete" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."health_sync_key"("p_athlete" "uuid", "p_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  CASE p_key
    WHEN 'asp:wh', 'asp:blockHistory' THEN PERFORM public.health_sync_wellness(p_athlete);
    WHEN 'asp:wlog'  THEN PERFORM public.health_sync_weight(p_athlete);
    WHEN 'asp:wmile' THEN PERFORM public.health_sync_milestones(p_athlete);
    WHEN 'asp:bw'    THEN PERFORM public.health_sync_goals(p_athlete);
    ELSE NULL;
  END CASE;
END;
$$;


ALTER FUNCTION "public"."health_sync_key"("p_athlete" "uuid", "p_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."health_sync_milestones"("p_athlete" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_athlete IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('health:' || p_athlete::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_athlete) THEN
    DELETE FROM public.body_weight_milestones WHERE athlete_id = p_athlete;
    RETURN;
  END IF;

  WITH src AS (
    SELECT DISTINCT day, kg FROM (
      SELECT CASE WHEN jsonb_typeof(e->'date') = 'string' THEN public.health_day(e->>'date') END AS day,
             public.health_num(e->'kg') AS kg
        FROM public.app_data d
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d.value) = 'array' THEN d.value ELSE '[]'::jsonb END) AS e
       WHERE d.athlete_id = p_athlete AND d.key = 'asp:wmile' AND jsonb_typeof(e) = 'object'
    ) s
    WHERE day IS NOT NULL AND kg > 0 AND kg < 500
  ),
  del AS (
    DELETE FROM public.body_weight_milestones t
     WHERE t.athlete_id = p_athlete AND NOT EXISTS (SELECT 1 FROM src WHERE src.day = t.day AND src.kg = t.kg)
  )
  INSERT INTO public.body_weight_milestones (athlete_id, day, kg)
  SELECT p_athlete, day, kg FROM src
  ON CONFLICT (athlete_id, day, kg) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."health_sync_milestones"("p_athlete" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."health_sync_weight"("p_athlete" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  IF p_athlete IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('health:' || p_athlete::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_athlete) THEN
    DELETE FROM public.body_weight_logs WHERE athlete_id = p_athlete;
    RETURN;
  END IF;

  WITH src AS (
    SELECT DISTINCT ON (day) day, kg FROM (
      SELECT public.health_day(x.k) AS day, public.health_num(x.v) AS kg,
             CASE WHEN x.k ~ '^\s*[0-9]{8}\s*$' THEN 0 ELSE 1 END AS key_rank, x.k
        FROM public.app_data d
        CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(d.value) = 'object' THEN d.value ELSE '{}'::jsonb END) AS x(k, v)
       WHERE d.athlete_id = p_athlete AND d.key = 'asp:wlog'
    ) s
    WHERE day IS NOT NULL AND kg > 0 AND kg < 500
    ORDER BY day, key_rank, k DESC
  ),
  del AS (
    DELETE FROM public.body_weight_logs t
     WHERE t.athlete_id = p_athlete AND NOT EXISTS (SELECT 1 FROM src WHERE src.day = t.day)
  )
  INSERT INTO public.body_weight_logs AS t (athlete_id, day, kg)
  SELECT p_athlete, day, kg FROM src
  ON CONFLICT (athlete_id, day) DO UPDATE SET kg = EXCLUDED.kg, updated_at = now()
  WHERE t.kg IS DISTINCT FROM EXCLUDED.kg;
END;
$_$;


ALTER FUNCTION "public"."health_sync_weight"("p_athlete" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."health_sync_wellness"("p_athlete" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."health_sync_wellness"("p_athlete" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."health_text"("p" "jsonb") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $_$
  SELECT CASE WHEN jsonb_typeof(p) = 'string'
    THEN nullif(regexp_replace(p #>> '{}', '^\s+|\s+$', '', 'g'), '') END
$_$;


ALTER FUNCTION "public"."health_text"("p" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hr_bounds_valid"("b" smallint[]) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT b IS NULL OR (
    cardinality(b) BETWEEN 1 AND 9
    AND NOT EXISTS (SELECT 1 FROM unnest(b) v WHERE v IS NULL OR v < 30 OR v > 250)
    AND NOT EXISTS (SELECT 1 FROM generate_subscripts(b, 1) i WHERE i > 1 AND b[i] <= b[i - 1])
  );
$$;


ALTER FUNCTION "public"."hr_bounds_valid"("b" smallint[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hr_zone_bounds_at"("p_athlete" "uuid", "p_day" "date") RETURNS TABLE("model_id" "uuid", "kind" "text", "bounds" smallint[])
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
DECLARE
  m record;
  m_found boolean;
  z smallint[];
  v_day date;
BEGIN
  SELECT h.id, h.kind, h.bounds, h.refs_day INTO m
    FROM public.hr_zone_models h
   WHERE h.athlete_id = p_athlete AND h.status = 'active' AND h.valid_from <= p_day
   ORDER BY h.valid_from DESC, h.created_at DESC LIMIT 1;
  m_found := FOUND;
  IF NOT m_found THEN
    -- Historique antérieur à tout modèle : le modèle actuel (P42).
    SELECT h.id, h.kind, h.bounds, h.refs_day INTO m
      FROM public.hr_zone_models h
     WHERE h.athlete_id = p_athlete AND h.status = 'active'
     ORDER BY h.valid_from DESC, h.created_at DESC LIMIT 1;
    m_found := FOUND;
  END IF;
  IF m_found AND m.kind <> 'five' THEN
    RETURN QUERY SELECT m.id, m.kind, m.bounds;
    RETURN;
  END IF;
  v_day := CASE WHEN m_found AND m.refs_day IS NOT NULL THEN m.refs_day ELSE p_day END;
  SELECT ARRAY(
    SELECT (round(x.v) + 1)::smallint FROM (
      SELECT k, coalesce(
               (SELECT pl.value FROM public.performance_logs pl
                 WHERE pl.athlete_id = p_athlete AND pl.metric_name = k AND pl.date <= v_day
                 ORDER BY pl.date DESC, pl.created_at DESC LIMIT 1),
               -- Historique antérieur aux premières zones saisies : les actuelles (P42).
               (SELECT pl.value FROM public.performance_logs pl
                 WHERE pl.athlete_id = p_athlete AND pl.metric_name = k
                 ORDER BY pl.date DESC, pl.created_at DESC LIMIT 1)) AS v, o
        FROM unnest(ARRAY['FCzone_Z1_max','FCzone_Z2_max','FCzone_Z3_max','FCzone_Z4_max']) WITH ORDINALITY u(k, o)
    ) x ORDER BY x.o) INTO z;
  IF z IS NULL OR cardinality(z) <> 4 OR EXISTS (SELECT 1 FROM unnest(z) v WHERE v IS NULL)
     OR NOT public.hr_bounds_valid(z) THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT CASE WHEN m_found THEN m.id END, 'five'::text, z;
END;
$$;


ALTER FUNCTION "public"."hr_zone_bounds_at"("p_athlete" "uuid", "p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hyrox_test_analyses_freeze"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.athlete_id        IS DISTINCT FROM OLD.athlete_id
  OR NEW.kind              IS DISTINCT FROM OLD.kind
  OR NEW.date              IS DISTINCT FROM OLD.date
  OR NEW.source_result_ids IS DISTINCT FROM OLD.source_result_ids
  OR NEW.inputs            IS DISTINCT FROM OLD.inputs
  OR NEW.profile           IS DISTINCT FROM OLD.profile
  OR NEW.outputs           IS DISTINCT FROM OLD.outputs
  OR NEW.algo_version      IS DISTINCT FROM OLD.algo_version
  OR NEW.grid_version      IS DISTINCT FROM OLD.grid_version
  OR NEW.recalculated_from IS DISTINCT FROM OLD.recalculated_from THEN
    RAISE EXCEPTION 'hyrox_test_analyses : analyse figée, recalculer crée une nouvelle analyse';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."hyrox_test_analyses_freeze"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invitation_coach_name"("p_token" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT coalesce(nullif(trim(p.full_name), ''), 'Ton coach')
    FROM public.invitations i
    JOIN public.profiles p ON p.id = i.coach_id
   WHERE i.token = p_token AND i.used_at IS NULL
   LIMIT 1;
$$;


ALTER FUNCTION "public"."invitation_coach_name"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invitation_is_valid"("p_token" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT false $$;


ALTER FUNCTION "public"."invitation_is_valid"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_athlete_coach"("athlete_uuid" "uuid", "p_coach" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p_coach IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = athlete_uuid AND coach_id = p_coach)
    OR EXISTS (SELECT 1 FROM public.athlete_co_coaches
                WHERE athlete_id = athlete_uuid AND co_coach_id = p_coach)
  );
$$;


ALTER FUNCTION "public"."is_athlete_coach"("athlete_uuid" "uuid", "p_coach" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_co_coach_of"("athlete_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.athlete_co_coaches cc
     WHERE cc.athlete_id = athlete_uuid
       AND cc.co_coach_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_co_coach_of"("athlete_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_coach_of"("athlete_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = athlete_uuid
      AND coach_id = auth.uid()
  ) OR public.is_co_coach_of(athlete_uuid);
$$;


ALTER FUNCTION "public"."is_coach_of"("athlete_uuid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_coach_of"("athlete_uuid" "uuid") IS 'Retourne true si auth.uid() est le coach de l''athlète donné.';



CREATE OR REPLACE FUNCTION "public"."is_coach_of_folder"("p_folder" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  IF p_folder IS NULL
     OR p_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  RETURN public.is_coach_of(p_folder::uuid);
END;
$_$;


ALTER FUNCTION "public"."is_coach_of_folder"("p_folder" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_coach_partner"("p_coach" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p_coach IS NOT NULL AND p_coach <> auth.uid() AND EXISTS (
    SELECT 1
      FROM public.athlete_co_coaches cc
      JOIN public.profiles a ON a.id = cc.athlete_id
     WHERE (a.coach_id = auth.uid() AND cc.co_coach_id = p_coach)
        OR (cc.co_coach_id = auth.uid() AND a.coach_id = p_coach)
  );
$$;


ALTER FUNCTION "public"."is_coach_partner"("p_coach" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jsonb_int_array"("j" "jsonb") RETURNS integer[]
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE WHEN j IS NULL OR jsonb_typeof(j) <> 'array' THEN NULL
    ELSE ARRAY(SELECT round((e #>> '{}')::numeric)::integer FROM jsonb_array_elements(j) WITH ORDINALITY x(e, o) ORDER BY o) END;
$$;


ALTER FUNCTION "public"."jsonb_int_array"("j" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jsonb_real_array"("j" "jsonb") RETURNS real[]
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE WHEN j IS NULL OR jsonb_typeof(j) <> 'array' THEN NULL
    ELSE ARRAY(SELECT (e #>> '{}')::real FROM jsonb_array_elements(j) WITH ORDINALITY x(e, o) ORDER BY o) END;
$$;


ALTER FUNCTION "public"."jsonb_real_array"("j" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_activity_to_plan"("p_activity" "uuid", "p_kind" "text", "p_planned" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."link_activity_to_plan"("p_activity" "uuid", "p_kind" "text", "p_planned" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_to_coach_by_code"("p_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_coach uuid;
  v_rows  int;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_coach
    FROM public.profiles
   WHERE coach_code = upper(trim(p_code))
     AND role IN ('coach', 'coach_athlete');

  IF v_coach IS NULL THEN
    RAISE EXCEPTION 'Code coach invalide' USING ERRCODE = 'P0002';
  END IF;
  IF v_coach = v_me THEN
    RAISE EXCEPTION 'Tu ne peux pas entrer ton propre code coach' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('agon.coach_link', 'on', true);
  UPDATE public.profiles SET coach_id = v_coach WHERE id = v_me;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('agon.coach_link', 'off', true);

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Profil introuvable' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_coach;
END;
$$;


ALTER FUNCTION "public"."link_to_coach_by_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."linked_planned_ids"("p_kind" "text", "p_ids" "uuid"[]) RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT l.planned_id FROM public.activity_plan_links l
   WHERE l.planned_kind = p_kind AND l.planned_id = ANY (p_ids) AND l.status <> 'rejected'
     AND public.activity_laps_editor(l.athlete_id);
$$;


ALTER FUNCTION "public"."linked_planned_ids"("p_kind" "text", "p_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_user_storage_objects"("target_user" "uuid") RETURNS TABLE("bucket_id" "text", "object_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
  -- Pièces jointes médicales, fichiers de test, données brutes des montres :
  -- chemin préfixé par l'uuid de l'athlète, convention en place dans l'application.
  SELECT o.bucket_id, o.name
  FROM storage.objects o
  WHERE o.bucket_id IN ('medical', 'test-files', 'garmin-screenshots', 'test-media', 'avatars', 'provider-raw')
    AND (
      o.name LIKE target_user::text || '/%'
      OR o.owner = target_user
    )
  UNION
  SELECT o.bucket_id, o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'docs'
    AND (
      o.name LIKE target_user::text || '/%'
      OR o.name LIKE '%/athletes/' || target_user::text || '/%'
      OR o.name IN (SELECT c.image_path FROM public.doc_comments c
                     WHERE c.author_id = target_user AND c.image_path IS NOT NULL)
    );
$$;


ALTER FUNCTION "public"."list_user_storage_objects"("target_user" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."list_user_storage_objects"("target_user" "uuid") IS 'Chemins des fichiers appartenant à un utilisateur, pour purge lors de la suppression de compte. SECURITY DEFINER : storage.objects n''est pas lisible directement par le rôle authenticated.';



CREATE OR REPLACE FUNCTION "public"."mark_doc_seen"("doc_uuid" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  UPDATE public.doc_assignments
     SET seen_at = now()
   WHERE doc_id = doc_uuid
     AND athlete_id = auth.uid()
     AND seen_at IS NULL;
$$;


ALTER FUNCTION "public"."mark_doc_seen"("doc_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_missed_workouts"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.workout_logs
  SET status = 'missed', updated_at = now()
  WHERE status = 'planned'
    AND scheduled_date < CURRENT_DATE
    AND scheduled_date >= CURRENT_DATE - 30
    AND NOT public.workout_log_has_entries(athlete_modifications);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."mark_missed_workouts"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."mark_missed_workouts"() IS 'Marque missed les séances passées SANS aucune saisie. Les séances travaillées sont clôturées par close_unfinished_workouts().';



CREATE OR REPLACE FUNCTION "public"."mark_onboarded"() RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'non connecté' USING ERRCODE = '42501'; END IF;
  UPDATE public.profiles SET onboarded_at = coalesce(onboarded_at, now())
   WHERE id = auth.uid() RETURNING onboarded_at INTO v;
  RETURN v;
END;
$$;


ALTER FUNCTION "public"."mark_onboarded"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_provider_activities"("p_athlete" "uuid", "p_source" "public"."data_source", "p_tag" "text", "p_activities" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."merge_provider_activities"("p_athlete" "uuid", "p_source" "public"."data_source", "p_tag" "text", "p_activities" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_provider_activity"("p_athlete" "uuid", "p_source" "public"."data_source", "p_tag" "text", "p_activity" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."merge_provider_activity"("p_athlete" "uuid", "p_source" "public"."data_source", "p_tag" "text", "p_activity" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mesocycle_athlete_id"("p_mesocycle_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT ma.athlete_id
  FROM public.mesocycles me
  JOIN public.macrocycles ma ON ma.id = me.macrocycle_id
  WHERE me.id = p_mesocycle_id;
$$;


ALTER FUNCTION "public"."mesocycle_athlete_id"("p_mesocycle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."microcycle_for_athlete_date"("p_athlete_id" "uuid", "p_date" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("microcycle_id" "uuid", "week_number" smallint, "is_deload" boolean, "cycle_name" "text", "mesocycle_name" "text", "macrocycle_name" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT
    mi.id,
    mi.week_number,
    mi.is_deload,
    cy.name,
    me.name,
    ma.name
  FROM public.microcycles mi
  JOIN public.cycles    cy ON cy.id = mi.cycle_id
  JOIN public.mesocycles me ON me.id = cy.mesocycle_id
  JOIN public.macrocycles ma ON ma.id = me.macrocycle_id
  WHERE ma.athlete_id = p_athlete_id
    AND p_date BETWEEN mi.start_date AND mi.end_date
  LIMIT 1;
$$;


ALTER FUNCTION "public"."microcycle_for_athlete_date"("p_athlete_id" "uuid", "p_date" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."microcycle_for_athlete_date"("p_athlete_id" "uuid", "p_date" "date") IS 'Retourne le microcycle actif pour un athlète à une date donnée (défaut: aujourd''hui).';



CREATE OR REPLACE FUNCTION "public"."my_coach_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT coach_id FROM public.profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."my_coach_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_metric_name"("p_name" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE regexp_replace(
                translate(lower(btrim(coalesce(p_name, ''))), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ₂', 'aaaaaaceeeeiiiinooooouuuuyy2'),
                '[[:space:]_.-]+', '', 'g')
    WHEN 'vma'                         THEN 'VMA'
    WHEN 'vitessemaximaleaerobie'      THEN 'VMA'
    WHEN 'vmax'                        THEN 'Vmax'
    WHEN 'vc'                          THEN 'VC'
    WHEN 'vitessecritique'             THEN 'VC'
    WHEN 'vo2max'                      THEN 'VO2max'
    WHEN 'pma'                         THEN 'PMA'
    WHEN 'ftp'                         THEN 'FTP'
    WHEN 'fcmax'                       THEN 'FCmax'
    WHEN 'fcmaximale'                  THEN 'FCmax'
    WHEN 'frequencecardiaquemaximale'  THEN 'FCmax'
    WHEN 'fcrepos'                     THEN 'FCrepos'
    WHEN 'fcrep'                       THEN 'FCrepos'
    WHEN 'fcderepos'                   THEN 'FCrepos'
    WHEN 'frequencecardiaquederepos'   THEN 'FCrepos'
    WHEN 'fcseuil'                     THEN 'FCseuil'
    WHEN 'fczonez0min'                 THEN 'FCzone_Z0_min'
    WHEN 'fczonez1max'                 THEN 'FCzone_Z1_max'
    WHEN 'fczonez2max'                 THEN 'FCzone_Z2_max'
    WHEN 'fczonez3max'                 THEN 'FCzone_Z3_max'
    WHEN 'fczonez4max'                 THEN 'FCzone_Z4_max'
    WHEN 'fczonez5max'                 THEN 'FCzone_Z5_max'
    ELSE btrim(p_name)
  END
$$;


ALTER FUNCTION "public"."normalize_metric_name"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."nutrition_save_day"("p_athlete" "uuid", "p_day" "date", "p_log" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_fields text[] := ARRAY['active_calories', 'total_calories_consumed', 'glucides_consumed', 'lipides_consumed', 'proteines_consumed'];
  v_bad    text;
  v_clean  jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_athlete IS NULL OR p_athlete <> v_me THEN
    RAISE EXCEPTION 'Seul l''athlète saisit son journal nutrition' USING ERRCODE = '42501';
  END IF;
  IF p_day IS NULL THEN
    RAISE EXCEPTION 'Jour manquant' USING ERRCODE = '22023';
  END IF;
  IF p_log IS NULL OR jsonb_typeof(p_log) <> 'object' THEN
    RAISE EXCEPTION 'Journée invalide' USING ERRCODE = '22023';
  END IF;

  SELECT key INTO v_bad
    FROM jsonb_each(p_log)
   WHERE key = ANY (v_fields) AND jsonb_typeof(value) NOT IN ('number', 'null')
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Valeur non numérique : %', v_bad USING ERRCODE = '22023';
  END IF;

  -- Champs connus seulement : rien d'autre n'entre dans le journal.
  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_clean
    FROM jsonb_each(p_log)
   WHERE key = ANY (v_fields);

  INSERT INTO public.app_data AS a (athlete_id, key, value, updated_at)
  VALUES (p_athlete, 'asp:nutrition_log', jsonb_build_object(to_char(p_day, 'YYYY-MM-DD'), v_clean), now())
  ON CONFLICT (athlete_id, key) DO UPDATE
     SET value = (CASE WHEN jsonb_typeof(a.value) = 'object' THEN a.value ELSE '{}'::jsonb END)
                 || jsonb_build_object(to_char(p_day, 'YYYY-MM-DD'), v_clean),
         updated_at = now();

  RETURN v_clean;
END;
$$;


ALTER FUNCTION "public"."nutrition_save_day"("p_athlete" "uuid", "p_day" "date", "p_log" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."nutrition_save_day"("p_athlete" "uuid", "p_day" "date", "p_log" "jsonb") IS 'Remplace une journée de asp:nutrition_log (athlète uniquement). Voir src/api/nutrition.ts.';



CREATE OR REPLACE FUNCTION "public"."origin_quality_rank"("q" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE q WHEN 'fit' THEN 3 WHEN 'tcx' THEN 2 WHEN 'gpx' THEN 1 ELSE 0 END;
$$;


ALTER FUNCTION "public"."origin_quality_rank"("q" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."outing_sports_compatible"("a" "text", "b" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT fa IS NULL OR fb IS NULL OR fa = fb OR (fa IN ('hyrox', 'strength') AND fb IN ('hyrox', 'strength'))
  FROM (SELECT public.activity_sport_family(a) fa, public.activity_sport_family(b) fb) x;
$$;


ALTER FUNCTION "public"."outing_sports_compatible"("a" "text", "b" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."patch_workout_entries"("p_log" "uuid", "p_patch" "jsonb") RETURNS "public"."workout_logs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row public.workout_logs;
BEGIN
  v_row := public._workout_log_for_write(p_log);
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Saisie invalide' USING ERRCODE = '22023';
  END IF;
  IF (p_patch - 'coachOverride') = '{}'::jsonb THEN
    RETURN v_row;
  END IF;
  UPDATE public.workout_logs
     SET athlete_modifications = COALESCE(athlete_modifications, '{}'::jsonb) || (p_patch - 'coachOverride')
   WHERE id = p_log
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."patch_workout_entries"("p_log" "uuid", "p_patch" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."patch_workout_entries"("p_log" "uuid", "p_patch" "jsonb") IS 'Fusionne la saisie de l''athlète (mods || patch - coachOverride) sous verrou de ligne.';



CREATE OR REPLACE FUNCTION "public"."performance_logs_normalize_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.metric_name := public.normalize_metric_name(NEW.metric_name);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."performance_logs_normalize_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."plan_family_accepts"("p_planned" "text", "p_activity" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT p_planned IS NOT NULL AND p_activity IS NOT NULL AND CASE p_planned
    WHEN 'hyrox' THEN p_activity IN ('hyrox', 'run', 'strength', 'row')
    WHEN 'strength' THEN p_activity IN ('strength', 'hyrox')
    ELSE p_activity = p_planned
  END;
$$;


ALTER FUNCTION "public"."plan_family_accepts"("p_planned" "text", "p_activity" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."plan_match_cost"("a_dist" real, "a_dur" real, "p_dist" real, "p_dur" real) RETURNS real
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT coalesce(avg(d), 1)::real FROM (
    SELECT abs(a_dist - p_dist) / greatest(a_dist, p_dist) AS d WHERE a_dist > 0 AND p_dist > 0
    UNION ALL
    SELECT abs(a_dur - p_dur) / greatest(a_dur, p_dur) WHERE a_dur > 0 AND p_dur > 0
  ) x;
$$;


ALTER FUNCTION "public"."plan_match_cost"("a_dist" real, "a_dur" real, "p_dist" real, "p_dur" real) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."planned_sessions_of_day"("p_athlete" "uuid", "p_day" "date") RETURNS TABLE("kind" "text", "id" "uuid", "family" "text", "distance_m" real, "duration_s" real)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."planned_sessions_of_day"("p_athlete" "uuid", "p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_flag_self_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF (NEW.is_admin IS DISTINCT FROM OLD.is_admin
      OR NEW.is_certified_coach IS DISTINCT FROM OLD.is_certified_coach)
  THEN
    IF auth.uid() IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.is_admin = true
      ) THEN
        RAISE EXCEPTION 'Forbidden: only admins can change is_admin or is_certified_coach';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_flag_self_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_hyrox_flag_self_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.is_hyrox_athlete IS DISTINCT FROM OLD.is_hyrox_athlete THEN
    IF auth.uid() IS NOT NULL THEN
      -- Coach de l'athlète (référent ou co-coach)
      IF auth.uid() = OLD.coach_id OR public.is_co_coach_of(OLD.id) THEN RETURN NEW; END IF;
      -- Admin
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN RETURN NEW; END IF;
      -- Coach_athlete qui se suit lui-même
      IF auth.uid() = OLD.id AND EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coach', 'coach_athlete')
      ) THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'Forbidden: only the athlete''s coach can change is_hyrox_athlete';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_hyrox_flag_self_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."program_save_sessions"("p_athlete" "uuid", "p_upsert" "jsonb", "p_base" "jsonb" DEFAULT '{}'::"jsonb", "p_remove" "text"[] DEFAULT '{}'::"text"[], "p_order" "text"[] DEFAULT NULL::"text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_cur    jsonb;
  v_by     jsonb  := '{}'::jsonb;  -- id → séance (état courant, puis état final)
  v_ids    text[] := '{}';         -- ordre courant
  v_up_ids text[] := '{}';         -- ordre des séances envoyées
  v_seen   text[] := '{}';
  v_new    jsonb  := '[]'::jsonb;
  v_s      jsonb;
  v_id     text;
  v_now    jsonb;
  v_base   jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_athlete IS NULL OR NOT (p_athlete = v_me OR public.is_coach_of(p_athlete)) THEN
    RAISE EXCEPTION 'Programme non modifiable' USING ERRCODE = '42501';
  END IF;
  IF p_upsert IS NULL OR jsonb_typeof(p_upsert) <> 'array' THEN
    RAISE EXCEPTION 'Séances invalides' USING ERRCODE = '22023';
  END IF;
  p_base := coalesce(p_base, '{}'::jsonb);
  IF jsonb_typeof(p_base) <> 'object' THEN
    RAISE EXCEPTION 'Version de référence invalide' USING ERRCODE = '22023';
  END IF;
  p_remove := coalesce(p_remove, '{}'::text[]);

  FOR v_s IN SELECT value FROM jsonb_array_elements(p_upsert) LOOP
    IF jsonb_typeof(v_s) <> 'object' OR jsonb_typeof(v_s -> 'id') IS DISTINCT FROM 'string' OR v_s ->> 'id' = '' THEN
      RAISE EXCEPTION 'Séance sans identifiant' USING ERRCODE = '22023';
    END IF;
    v_id := v_s ->> 'id';
    IF v_id = ANY (v_up_ids) THEN
      RAISE EXCEPTION 'Séance envoyée deux fois : %', v_id USING ERRCODE = '22023';
    END IF;
    IF v_id = ANY (p_remove) THEN
      RAISE EXCEPTION 'Séance à la fois modifiée et supprimée : %', v_id USING ERRCODE = '22023';
    END IF;
    v_up_ids := v_up_ids || v_id;
  END LOOP;

  -- Ligne verrouillée jusqu'à la fin : deux enregistrements simultanés passent
  -- l'un après l'autre. Créée vide si l'athlète n'a pas encore de programme.
  INSERT INTO public.app_data (athlete_id, key, value)
  VALUES (p_athlete, 'asp:prog', '[]'::jsonb)
  ON CONFLICT (athlete_id, key) DO NOTHING;

  SELECT value INTO v_cur
    FROM public.app_data
   WHERE athlete_id = p_athlete AND key = 'asp:prog'
     FOR UPDATE;
  IF v_cur IS NULL OR jsonb_typeof(v_cur) = 'null' THEN
    v_cur := '[]'::jsonb;
  END IF;
  IF jsonb_typeof(v_cur) <> 'array' THEN
    RAISE EXCEPTION 'Programme illisible' USING ERRCODE = '22023';
  END IF;

  -- Une séance sans id ou en double : on refuse plutôt que de la perdre.
  FOR v_s IN SELECT value FROM jsonb_array_elements(v_cur) LOOP
    v_id := v_s ->> 'id';
    IF jsonb_typeof(v_s) <> 'object' OR v_id IS NULL OR v_id = '' OR v_by ? v_id THEN
      RAISE EXCEPTION 'Programme illisible (séance sans identifiant ou en double)' USING ERRCODE = '22023';
    END IF;
    v_by := v_by || jsonb_build_object(v_id, v_s);
    v_ids := v_ids || v_id;
  END LOOP;

  -- Conflits : la séance a changé depuis la lecture du client.
  FOR v_s IN SELECT value FROM jsonb_array_elements(p_upsert) LOOP
    v_id := v_s ->> 'id';
    v_now := v_by -> v_id;
    v_base := p_base -> v_id;
    IF v_now IS NULL AND v_base IS NOT NULL THEN
      RAISE EXCEPTION 'Séance supprimée entre-temps : %', v_s ->> 'name' USING ERRCODE = '40001';
    END IF;
    -- v_now = v_s : déjà enregistrée telle quelle (renvoi), accepté.
    IF v_now IS NOT NULL AND v_now <> v_s AND (v_base IS NULL OR v_now <> v_base) THEN
      RAISE EXCEPTION 'Séance modifiée entre-temps : %', v_now ->> 'name' USING ERRCODE = '40001';
    END IF;
  END LOOP;
  FOREACH v_id IN ARRAY p_remove LOOP
    v_now := v_by -> v_id;
    v_base := p_base -> v_id;
    IF v_now IS NOT NULL AND (v_base IS NULL OR v_now <> v_base) THEN
      RAISE EXCEPTION 'Séance modifiée entre-temps : %', v_now ->> 'name' USING ERRCODE = '40001';
    END IF;
  END LOOP;

  -- Application.
  FOR v_s IN SELECT value FROM jsonb_array_elements(p_upsert) LOOP
    v_by := v_by || jsonb_build_object(v_s ->> 'id', v_s);
  END LOOP;
  v_by := v_by - p_remove;

  -- Ordre : celui demandé, puis les séances non citées (ajoutées ailleurs),
  -- puis les nouvelles non citées.
  IF p_order IS NOT NULL THEN
    FOREACH v_id IN ARRAY p_order LOOP
      IF v_id IS NOT NULL AND v_by ? v_id AND v_id <> ALL (v_seen) THEN
        v_new := v_new || jsonb_build_array(v_by -> v_id);
        v_seen := v_seen || v_id;
      END IF;
    END LOOP;
  END IF;
  FOREACH v_id IN ARRAY v_ids || v_up_ids LOOP
    IF v_by ? v_id AND v_id <> ALL (v_seen) THEN
      v_new := v_new || jsonb_build_array(v_by -> v_id);
      v_seen := v_seen || v_id;
    END IF;
  END LOOP;

  UPDATE public.app_data
     SET value = v_new
   WHERE athlete_id = p_athlete AND key = 'asp:prog';

  RETURN v_new;
END;
$$;


ALTER FUNCTION "public"."program_save_sessions"("p_athlete" "uuid", "p_upsert" "jsonb", "p_base" "jsonb", "p_remove" "text"[], "p_order" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."program_save_sessions"("p_athlete" "uuid", "p_upsert" "jsonb", "p_base" "jsonb", "p_remove" "text"[], "p_order" "text"[]) IS 'Enregistre les séances modifiées de asp:prog sans réécrire les autres ; refuse (40001) une séance changée depuis la lecture. Voir src/api/program.ts.';



CREATE OR REPLACE FUNCTION "public"."provider_daily_columns"() RETURNS TABLE("col" "text", "typ" "text")
    LANGUAGE "sql" IMMUTABLE
    AS $$
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


ALTER FUNCTION "public"."provider_daily_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_daily_merge"("p_athlete" "uuid", "p_source" "public"."data_source", "p_day" "date", "p_kind" "text", "p_fields" "jsonb", "p_raw" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."provider_daily_merge"("p_athlete" "uuid", "p_source" "public"."data_source", "p_day" "date", "p_kind" "text", "p_fields" "jsonb", "p_raw" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_fit_quota_exhaust"("p_connection_id" "uuid", "p_limit" integer) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  INSERT INTO public.provider_fit_quota (connection_id, day, used)
  VALUES (p_connection_id, (now() AT TIME ZONE 'UTC')::date, greatest(coalesce(p_limit, 0), 0))
  ON CONFLICT (connection_id, day) DO UPDATE
     SET used = greatest(public.provider_fit_quota.used, EXCLUDED.used),
         updated_at = now();
$$;


ALTER FUNCTION "public"."provider_fit_quota_exhaust"("p_connection_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_fit_quota_remaining"("p_connection_id" "uuid", "p_limit" integer) RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT greatest(0, p_limit - coalesce((
    SELECT q.used FROM public.provider_fit_quota q
     WHERE q.connection_id = p_connection_id
       AND q.day = (now() AT TIME ZONE 'UTC')::date
  ), 0));
$$;


ALTER FUNCTION "public"."provider_fit_quota_remaining"("p_connection_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_fit_quota_reserve"("p_connection_id" "uuid", "p_count" integer, "p_limit" integer) RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_count IS NULL OR p_count < 0 THEN
    RAISE EXCEPTION 'provider_fit_quota_reserve : nombre de fichiers invalide (%)', p_count;
  END IF;
  IF p_count = 0 THEN
    RETURN true;
  END IF;

  INSERT INTO public.provider_fit_quota (connection_id, day, used)
  VALUES (p_connection_id, v_day, 0)
  ON CONFLICT (connection_id, day) DO NOTHING;

  UPDATE public.provider_fit_quota
     SET used = used + p_count,
         updated_at = now()
   WHERE connection_id = p_connection_id
     AND day = v_day
     AND used + p_count <= p_limit;

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."provider_fit_quota_reserve"("p_connection_id" "uuid", "p_count" integer, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_forget"("p_athlete" "uuid", "p_provider" "public"."data_source") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."provider_forget"("p_athlete" "uuid", "p_provider" "public"."data_source") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_webhook_inbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "public"."data_source" NOT NULL,
    "type" "text" NOT NULL,
    "external_user_id" "text",
    "payload" "jsonb" NOT NULL,
    "fingerprint" "text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "attempts" smallint DEFAULT 0 NOT NULL,
    "locked_until" timestamp with time zone,
    "error" "text",
    CONSTRAINT "provider_webhook_inbox_type_len" CHECK ((("char_length"("type") >= 1) AND ("char_length"("type") <= 60)))
);


ALTER TABLE "public"."provider_webhook_inbox" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_webhook_inbox" IS 'Réception brute des webhooks fournisseurs (Garmin). RLS sans politique : service_role seulement. Une ligne par entrée, idempotente par empreinte. Purgée après traitement.';



CREATE OR REPLACE FUNCTION "public"."provider_inbox_claim"("p_provider" "public"."data_source", "p_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_limit" integer DEFAULT 50) RETURNS SETOF "public"."provider_webhook_inbox"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  UPDATE public.provider_webhook_inbox i
     SET attempts = i.attempts + 1,
         locked_until = now() + interval '5 minutes'
   WHERE i.id IN (
     SELECT x.id FROM public.provider_webhook_inbox x
      WHERE x.provider = p_provider
        AND x.processed_at IS NULL
        AND x.attempts < 5
        AND (x.locked_until IS NULL OR x.locked_until <= now())
        AND (p_ids IS NULL OR x.id = ANY (p_ids))
      ORDER BY x.received_at
      LIMIT GREATEST(LEAST(p_limit, 500), 1)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING i.*;
$$;


ALTER FUNCTION "public"."provider_inbox_claim"("p_provider" "public"."data_source", "p_ids" "uuid"[], "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_intraday_merge"("p_athlete" "uuid", "p_source" "public"."data_source", "p_day" "date", "p_measure" "text", "p_offsets" integer[], "p_values" real[], "p_utc_offset_s" integer) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."provider_intraday_merge"("p_athlete" "uuid", "p_source" "public"."data_source", "p_day" "date", "p_measure" "text", "p_offsets" integer[], "p_values" real[], "p_utc_offset_s" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_raw_objects"("p_athlete" "uuid", "p_provider" "public"."data_source", "p_types" "text"[] DEFAULT NULL::"text"[]) RETURNS TABLE("object_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
  SELECT o.name
    FROM storage.objects o
   WHERE o.bucket_id = 'provider-raw'
     AND o.name LIKE p_athlete::text || '/' || p_provider::text || '/%'
     AND (p_types IS NULL OR split_part(o.name, '/', 3) = ANY (p_types));
$$;


ALTER FUNCTION "public"."provider_raw_objects"("p_athlete" "uuid", "p_provider" "public"."data_source", "p_types" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_raw_records_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  NEW.received_at := OLD.received_at;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."provider_raw_records_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_sync_try_lock"("p_connection_id" "uuid", "p_ttl_seconds" integer DEFAULT 600) RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_token uuid := gen_random_uuid();
BEGIN
  UPDATE public.provider_connections
     SET sync_locked_until = now()
           + make_interval(secs => greatest(30, least(coalesce(p_ttl_seconds, 600), 3600))),
         sync_lock_token = v_token
   WHERE id = p_connection_id
     AND (sync_locked_until IS NULL OR sync_locked_until < now());

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN v_token;
END;
$$;


ALTER FUNCTION "public"."provider_sync_try_lock"("p_connection_id" "uuid", "p_ttl_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_sync_unlock"("p_connection_id" "uuid", "p_token" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  UPDATE public.provider_connections
     SET sync_locked_until = NULL,
         sync_lock_token   = NULL
   WHERE id = p_connection_id
     AND sync_lock_token = p_token;
$$;


ALTER FUNCTION "public"."provider_sync_unlock"("p_connection_id" "uuid", "p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_token_claim_refresh"("p_connection_id" "uuid", "p_seconds" integer DEFAULT 60) RETURNS boolean
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  WITH claimed AS (
    UPDATE public.provider_tokens
       SET refresh_locked_until = now() + make_interval(secs => GREATEST(LEAST(p_seconds, 300), 5))
     WHERE connection_id = p_connection_id
       AND (refresh_locked_until IS NULL OR refresh_locked_until <= now())
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM claimed);
$$;


ALTER FUNCTION "public"."provider_token_claim_refresh"("p_connection_id" "uuid", "p_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_token_read"("p_connection_id" "uuid") RETURNS TABLE("access_token" "text", "refresh_token" "text", "expires_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
  SELECT
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = t.access_secret_id),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = t.refresh_secret_id),
    t.access_expires_at
  FROM public.provider_tokens t
  WHERE t.connection_id = p_connection_id;
$$;


ALTER FUNCTION "public"."provider_token_read"("p_connection_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_token_release_refresh"("p_connection_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  UPDATE public.provider_tokens SET refresh_locked_until = NULL
   WHERE connection_id = p_connection_id;
$$;


ALTER FUNCTION "public"."provider_token_release_refresh"("p_connection_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_token_write"("p_connection_id" "uuid", "p_access_token" "text", "p_refresh_token" "text" DEFAULT NULL::"text", "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
DECLARE
  v_existing  public.provider_tokens;
  v_access_id uuid;
  v_refresh_id uuid;
BEGIN
  SELECT * INTO v_existing FROM public.provider_tokens
   WHERE connection_id = p_connection_id;

  IF v_existing.connection_id IS NULL THEN
    v_access_id := vault.create_secret(
      p_access_token,
      'provider_access_' || p_connection_id::text,
      'Jeton d''accès OAuth — Agon'
    );
    IF p_refresh_token IS NOT NULL THEN
      v_refresh_id := vault.create_secret(
        p_refresh_token,
        'provider_refresh_' || p_connection_id::text,
        'Jeton de rafraîchissement OAuth — Agon'
      );
    END IF;

    INSERT INTO public.provider_tokens
      (connection_id, access_secret_id, refresh_secret_id, access_expires_at)
    VALUES (p_connection_id, v_access_id, v_refresh_id, p_expires_at);
  ELSE
    -- Mise à jour du secret existant plutôt que création d'un nouveau : sinon
    -- chaque rafraîchissement laisserait un secret orphelin dans le Vault,
    -- et au bout de quelques mois on ne saurait plus lesquels sont vivants.
    PERFORM vault.update_secret(v_existing.access_secret_id, p_access_token);

    IF p_refresh_token IS NOT NULL THEN
      IF v_existing.refresh_secret_id IS NULL THEN
        v_refresh_id := vault.create_secret(
          p_refresh_token,
          'provider_refresh_' || p_connection_id::text,
          'Jeton de rafraîchissement OAuth — Agon'
        );
      ELSE
        PERFORM vault.update_secret(v_existing.refresh_secret_id, p_refresh_token);
        v_refresh_id := v_existing.refresh_secret_id;
      END IF;
    ELSE
      -- Un rafraîchissement qui ne renvoie pas de nouveau refresh_token veut
      -- dire que l'ancien reste valable : on ne l'efface pas.
      v_refresh_id := v_existing.refresh_secret_id;
    END IF;

    UPDATE public.provider_tokens
       SET refresh_secret_id = v_refresh_id,
           access_expires_at = p_expires_at,
           updated_at        = now()
     WHERE connection_id = p_connection_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."provider_token_write"("p_connection_id" "uuid", "p_access_token" "text", "p_refresh_token" "text", "p_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_tokens_drop_secrets"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = OLD.access_secret_id;
  IF OLD.refresh_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = OLD.refresh_secret_id;
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."provider_tokens_drop_secrets"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_workout_pushes_forget"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.provider_workout_pushes
   WHERE athlete_id = OLD.athlete_id AND provider = OLD.provider;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."provider_workout_pushes_forget"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_expired_oauth_states"() RETURNS integer
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  WITH gone AS (
    DELETE FROM public.provider_oauth_states
     WHERE expires_at <= now()
    RETURNING 1
  )
  SELECT count(*)::integer FROM gone;
$$;


ALTER FUNCTION "public"."purge_expired_oauth_states"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."react_weekly_retour"("p_retour_id" "uuid", "p_reaction" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_reaction IS NULL OR p_reaction NOT IN ('like', 'strong', 'fire', 'heart') THEN
    RAISE EXCEPTION 'invalid reaction';
  END IF;

  UPDATE public.weekly_retours
     SET athlete_reaction = p_reaction,
         reacted_at       = now()
   WHERE id = p_retour_id
     AND athlete_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'retour not found';
  END IF;
END;
$$;


ALTER FUNCTION "public"."react_weekly_retour"("p_retour_id" "uuid", "p_reaction" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_invitation"("p_token" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RAISE EXCEPTION 'Ce lien d''invitation n''est plus valable : demande le code coach.' USING ERRCODE = '42501';
END;
$$;


ALTER FUNCTION "public"."redeem_invitation"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_activity_zone_summary"("p_activity" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  s record;
  b record;
  secs integer[];
BEGIN
  SELECT st.activity_id, st.athlete_id, st.source, st.t, st.timer, st.hr, a.local_date
    INTO s
    FROM public.activity_streams st JOIN public.provider_activities a ON a.id = st.activity_id
   WHERE st.activity_id = p_activity;
  IF NOT FOUND OR s.hr IS NULL THEN
    DELETE FROM public.activity_zone_summaries WHERE activity_id = p_activity;
    RETURN;
  END IF;
  SELECT * INTO b FROM public.hr_zone_bounds_at(s.athlete_id, s.local_date);
  IF NOT FOUND OR b.bounds IS NULL THEN
    DELETE FROM public.activity_zone_summaries WHERE activity_id = p_activity;
    RETURN;
  END IF;
  secs := public.activity_zone_seconds(s.t, s.timer, s.hr, b.bounds);
  INSERT INTO public.activity_zone_summaries AS z (activity_id, athlete_id, source, model_id, kind, bounds,
                                                  seconds, no_hr_s, computed_at)
  VALUES (s.activity_id, s.athlete_id, s.source, b.model_id, b.kind, b.bounds,
          secs[1:cardinality(secs) - 1], secs[cardinality(secs)], now())
  ON CONFLICT (activity_id) DO UPDATE SET model_id = EXCLUDED.model_id, kind = EXCLUDED.kind,
    bounds = EXCLUDED.bounds, seconds = EXCLUDED.seconds, no_hr_s = EXCLUDED.no_hr_s, computed_at = now();
END;
$$;


ALTER FUNCTION "public"."refresh_activity_zone_summary"("p_activity" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_athlete_zone_summaries"("p_athlete" "uuid", "p_from" "date") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN SELECT st.activity_id FROM public.activity_streams st
             JOIN public.provider_activities a ON a.id = st.activity_id
            WHERE st.athlete_id = p_athlete AND (p_from IS NULL OR a.local_date >= p_from)
  LOOP
    PERFORM public.refresh_activity_zone_summary(r.activity_id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;


ALTER FUNCTION "public"."refresh_athlete_zone_summaries"("p_athlete" "uuid", "p_from" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_co_coach"("p_athlete" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT (
    auth.uid() = p_athlete
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_athlete AND coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.athlete_co_coaches
                WHERE athlete_id = p_athlete AND co_coach_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Non autorisé' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.athlete_co_coaches WHERE athlete_id = p_athlete;
END;
$$;


ALTER FUNCTION "public"."remove_co_coach"("p_athlete" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reopen_energy_assignment"("p_assignment" "uuid") RETURNS "public"."energy_session_assignments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row public.energy_session_assignments;
BEGIN
  v_row := public._energy_assignment_for_write(p_assignment);
  UPDATE public.energy_session_assignments
     SET status              = 'planned',
         block_logs          = '{}'::jsonb,
         rpe_score           = NULL,
         actual_duration_min = NULL,
         activity_type       = NULL,
         distance_km         = NULL
   WHERE id = p_assignment
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."reopen_energy_assignment"("p_assignment" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reopen_workout"("p_log" "uuid") RETURNS "public"."workout_logs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row public.workout_logs;
BEGIN
  v_row := public._workout_log_for_write(p_log);
  IF v_row.status <> 'completed' THEN
    RETURN v_row;
  END IF;
  UPDATE public.workout_logs
     SET status = 'planned', completed_at = NULL, rpe_score = NULL
   WHERE id = p_log
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."reopen_workout"("p_log" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_client_build"("p_build" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_build IS NULL OR length(p_build) = 0 OR length(p_build) > 80 THEN
    RAISE EXCEPTION 'Version invalide' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET client_build = p_build,
         client_build_at = now()
   WHERE id = v_me
     AND (client_build IS DISTINCT FROM p_build
          OR client_build_at IS NULL
          OR client_build_at < now() - interval '1 hour');
END;
$$;


ALTER FUNCTION "public"."report_client_build"("p_build" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."require_sync_consent"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'active'
     AND NOT public.source_consent_granted(NEW.athlete_id, NEW.provider) THEN
    RAISE EXCEPTION
      'Connexion % impossible : consentement de synchronisation absent pour cet athlète', NEW.provider;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."require_sync_consent"() OWNER TO "postgres";


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
     SET laps_version = laps_version + 1, laps_edited = false, updated_at = now()
   WHERE activity_id = p_activity;
  RETURN v_s.laps_version + 1;
END;
$$;


ALTER FUNCTION "public"."reset_activity_laps_to_watch"("p_activity" "uuid", "p_expected_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_performance_notification"("p_notification" "uuid", "p_log" "uuid", "p_approve" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_athlete uuid;
  v_metric  text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT n.athlete_id, l.metric_name INTO v_athlete, v_metric
    FROM public.performance_notifications n
    JOIN public.performance_logs l ON l.id = n.performance_log_id AND l.athlete_id = n.athlete_id
   WHERE n.id = p_notification AND n.performance_log_id = p_log;
  IF v_athlete IS NULL THEN
    RAISE EXCEPTION 'Notification introuvable' USING ERRCODE = 'P0002';
  END IF;
  -- Seul un coach de l'athlète (référent ou co-coach) tranche.
  IF NOT (public.is_coach_of(v_athlete) OR public.current_user_is_admin()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.performance_notifications
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         resolved_at = now()
   WHERE id = p_notification;

  IF p_approve THEN
    PERFORM pg_advisory_xact_lock(hashtext('perf_ref:' || v_athlete::text || ':' || v_metric));
    UPDATE public.performance_logs
       SET is_active_reference = false
     WHERE athlete_id = v_athlete AND metric_name = v_metric AND is_active_reference AND id <> p_log;
    UPDATE public.performance_logs
       SET coach_validated = true, is_active_reference = true
     WHERE id = p_log;
  ELSE
    UPDATE public.performance_logs SET coach_validated = false WHERE id = p_log;
  END IF;
END;
$$;


ALTER FUNCTION "public"."review_performance_notification"("p_notification" "uuid", "p_log" "uuid", "p_approve" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_workout_status_maintenance"() RETURNS TABLE("closed" integer, "missed" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  closed := public.close_unfinished_workouts();
  missed := public.mark_missed_workouts();
  RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."run_workout_status_maintenance"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."run_workout_status_maintenance"() IS 'Entretien quotidien des statuts : clôture les séances travaillées, puis marque missed celles restées vides.';



CREATE OR REPLACE FUNCTION "public"."save_activity_laps"("p_activity" "uuid", "p_expected_version" integer, "p_laps" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."save_activity_laps"("p_activity" "uuid", "p_expected_version" integer, "p_laps" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_athlete_test_result"("p_athlete" "uuid", "p_definition" "uuid", "p_performed_at" "date", "p_notes" "text", "p_values" "jsonb", "p_result" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_me     uuid := auth.uid();
  v_id     uuid;
  v_def    uuid;
  v_bad    text;
  v_vars   uuid[];
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_athlete IS NULL OR NOT (public.is_coach_of(p_athlete) OR public.current_user_is_admin()) THEN
    RAISE EXCEPTION 'Seul le coach de l''athlète enregistre ses résultats' USING ERRCODE = '42501';
  END IF;
  IF p_performed_at IS NULL THEN
    RAISE EXCEPTION 'Date manquante' USING ERRCODE = '22023';
  END IF;
  IF p_values IS NULL OR jsonb_typeof(p_values) <> 'object' THEN
    RAISE EXCEPTION 'Valeurs invalides' USING ERRCODE = '22023';
  END IF;

  -- Valeurs numériques seulement
  SELECT key INTO v_bad FROM jsonb_each(p_values) WHERE jsonb_typeof(value) <> 'number' LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Valeur non numérique pour la variable %', v_bad USING ERRCODE = '22023';
  END IF;
  -- Clés = uuid de variables
  SELECT key INTO v_bad FROM jsonb_each(p_values)
   WHERE key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Variable inconnue : %', v_bad USING ERRCODE = '22023';
  END IF;

  IF p_result IS NULL THEN
    IF p_definition IS NULL OR NOT EXISTS (SELECT 1 FROM public.test_definitions WHERE id = p_definition) THEN
      RAISE EXCEPTION 'Test inconnu' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.athlete_test_results (athlete_id, test_definition_id, performed_at, notes)
    VALUES (p_athlete, p_definition, p_performed_at, nullif(btrim(p_notes), ''))
    RETURNING id, test_definition_id INTO v_id, v_def;
  ELSE
    UPDATE public.athlete_test_results
       SET performed_at = p_performed_at,
           notes        = nullif(btrim(p_notes), ''),
           updated_at   = now()
     WHERE id = p_result AND athlete_id = p_athlete
    RETURNING id, test_definition_id INTO v_id, v_def;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Résultat introuvable' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT coalesce(array_agg(key::uuid), '{}') INTO v_vars FROM jsonb_each(p_values);

  -- Toutes les variables doivent appartenir au test du résultat
  IF EXISTS (
    SELECT 1 FROM unnest(v_vars) AS x(id)
     WHERE NOT EXISTS (SELECT 1 FROM public.test_variables tv WHERE tv.id = x.id AND tv.test_definition_id = v_def)
  ) THEN
    RAISE EXCEPTION 'Variable étrangère à ce test' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.athlete_test_values
   WHERE result_id = v_id AND NOT (variable_id = ANY (v_vars));

  INSERT INTO public.athlete_test_values (result_id, variable_id, value)
  SELECT v_id, key::uuid, (value #>> '{}')::numeric FROM jsonb_each(p_values)
  ON CONFLICT (result_id, variable_id) DO UPDATE SET value = excluded.value;

  RETURN v_id;
END;
$_$;


ALTER FUNCTION "public"."save_athlete_test_result"("p_athlete" "uuid", "p_definition" "uuid", "p_performed_at" "date", "p_notes" "text", "p_values" "jsonb", "p_result" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."save_athlete_test_result"("p_athlete" "uuid", "p_definition" "uuid", "p_performed_at" "date", "p_notes" "text", "p_values" "jsonb", "p_result" "uuid") IS 'Crée ou modifie un résultat de test et ses valeurs en une transaction (coach / admin). Voir src/api/tests.ts.';



CREATE OR REPLACE FUNCTION "public"."save_fc_zones"("p_athlete" "uuid", "p_zones" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_is_coach boolean;
  v_key      text;
  v_raw      jsonb;
  v_value    numeric;
  v_current  numeric;
  v_written  integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  v_is_coach := public.is_coach_of(p_athlete) OR public.current_user_is_admin();
  IF NOT (p_athlete = auth.uid() OR v_is_coach) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_zones IS NULL OR jsonb_typeof(p_zones) <> 'object' THEN
    RAISE EXCEPTION 'Zones attendues sous forme d''objet' USING ERRCODE = '22023';
  END IF;

  -- Tout est vérifié avant la première écriture.
  FOR v_key, v_raw IN SELECT key, value FROM jsonb_each(p_zones) LOOP
    IF v_key NOT IN ('FCzone_Z0_min','FCzone_Z1_max','FCzone_Z2_max','FCzone_Z3_max','FCzone_Z4_max','FCzone_Z5_max') THEN
      RAISE EXCEPTION 'Zone FC inconnue : %', v_key USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_raw) <> 'number' THEN
      RAISE EXCEPTION 'Valeur invalide pour % : %', v_key, v_raw USING ERRCODE = '22023';
    END IF;
    IF (v_raw #>> '{}')::numeric < 0 THEN
      RAISE EXCEPTION 'Valeur invalide pour % : %', v_key, v_raw USING ERRCODE = '22023';
    END IF;
  END LOOP;

  PERFORM pg_advisory_xact_lock(hashtext('perf_zones:' || p_athlete::text));

  FOR v_key, v_raw IN SELECT key, value FROM jsonb_each(p_zones) ORDER BY key LOOP
    v_value := (v_raw #>> '{}')::numeric;

    SELECT value INTO v_current
      FROM public.performance_logs
     WHERE athlete_id = p_athlete AND metric_name = v_key AND is_active_reference;

    CONTINUE WHEN v_current IS NOT DISTINCT FROM v_value;

    UPDATE public.performance_logs
       SET is_active_reference = false
     WHERE athlete_id = p_athlete AND metric_name = v_key AND is_active_reference;

    INSERT INTO public.performance_logs
      (athlete_id, metric_type, metric_name, value, unit, date, is_active_reference, coach_validated, created_by)
    VALUES
      (p_athlete, 'zone', v_key, v_value, 'bpm', current_date, true,
       CASE WHEN v_is_coach THEN true ELSE NULL END, auth.uid());
    v_written := v_written + 1;
  END LOOP;

  RETURN v_written;
END;
$$;


ALTER FUNCTION "public"."save_fc_zones"("p_athlete" "uuid", "p_zones" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_hr_zone_model"("p_athlete" "uuid", "p_kind" "text", "p_bounds" integer[], "p_valid_from" "date" DEFAULT CURRENT_DATE) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_coach_of(p_athlete) THEN
    RAISE EXCEPTION 'save_hr_zone_model : réservé au coach' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.hr_zone_models (athlete_id, kind, bounds, valid_from, status, origin, created_by, decided_by, decided_at)
  VALUES (p_athlete, p_kind, CASE WHEN p_kind = 'five' THEN NULL ELSE p_bounds::smallint[] END,
          coalesce(p_valid_from, current_date), 'active', 'manual', auth.uid(), auth.uid(), now())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."save_hr_zone_model"("p_athlete" "uuid", "p_kind" "text", "p_bounds" integer[], "p_valid_from" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."schedule_doc"("p_athlete" "uuid", "p_doc" "uuid", "p_dates" "date"[], "p_note" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_dates IS NULL OR array_length(p_dates, 1) IS NULL THEN
    RAISE EXCEPTION 'Choisis au moins un jour' USING ERRCODE = '22023';
  END IF;
  IF array_length(p_dates, 1) > 120 THEN
    RAISE EXCEPTION 'Trop de jours d''un coup (120 max)' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.doc_assignments (doc_id, athlete_id, assigned_by, source)
  VALUES (p_doc, p_athlete, auth.uid(), 'manuel')
  ON CONFLICT (doc_id, athlete_id, source) DO NOTHING;

  INSERT INTO public.doc_schedule (doc_id, athlete_id, date, added_by, note)
  SELECT p_doc, p_athlete, d, auth.uid(), NULLIF(btrim(p_note), '')
    FROM unnest(p_dates) AS d
  ON CONFLICT (doc_id, athlete_id, date) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."schedule_doc"("p_athlete" "uuid", "p_doc" "uuid", "p_dates" "date"[], "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_active_performance_reference"("p_performance_log_id" "uuid", "p_athlete_id" "uuid", "p_metric_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT (p_athlete_id = auth.uid() OR public.is_coach_of(p_athlete_id) OR public.current_user_is_admin()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.performance_logs
     WHERE id = p_performance_log_id AND athlete_id = p_athlete_id AND metric_name = p_metric_name
  ) THEN
    RAISE EXCEPTION 'Référence introuvable pour cet athlète' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.performance_logs
     SET is_active_reference = false
   WHERE athlete_id = p_athlete_id
     AND metric_name = p_metric_name
     AND is_active_reference = true;

  UPDATE public.performance_logs
     SET is_active_reference = true
   WHERE id = p_performance_log_id;
END;
$$;


ALTER FUNCTION "public"."set_active_performance_reference"("p_performance_log_id" "uuid", "p_athlete_id" "uuid", "p_metric_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_athlete_hidden"("athlete_id" "uuid", "hidden" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE id = set_athlete_hidden.athlete_id AND coach_id = auth.uid()) THEN
    UPDATE profiles SET coach_hidden = set_athlete_hidden.hidden WHERE id = set_athlete_hidden.athlete_id;
  ELSIF EXISTS (SELECT 1 FROM athlete_co_coaches cc
                 WHERE cc.athlete_id = set_athlete_hidden.athlete_id AND cc.co_coach_id = auth.uid()) THEN
    UPDATE athlete_co_coaches cc SET hidden = set_athlete_hidden.hidden
     WHERE cc.athlete_id = set_athlete_hidden.athlete_id AND cc.co_coach_id = auth.uid();
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$$;


ALTER FUNCTION "public"."set_athlete_hidden"("athlete_id" "uuid", "hidden" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_coach_override"("p_log" "uuid", "p_override" "jsonb") RETURNS "public"."workout_logs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row  public.workout_logs;
  v_mods jsonb;
BEGIN
  v_row := public._workout_log_for_write(p_log, true);
  IF p_override IS NULL THEN
    v_mods := v_row.athlete_modifications - 'coachOverride';
    IF v_mods = '{}'::jsonb THEN v_mods := NULL; END IF;
  ELSE
    IF jsonb_typeof(p_override) <> 'object' OR jsonb_typeof(p_override -> 'blocs') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Adaptation invalide (blocs attendus)' USING ERRCODE = '22023';
    END IF;
    v_mods := COALESCE(v_row.athlete_modifications, '{}'::jsonb)
              || jsonb_build_object('coachOverride', p_override || jsonb_build_object('createdAt', to_jsonb(now())));
  END IF;
  UPDATE public.workout_logs SET athlete_modifications = v_mods WHERE id = p_log
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."set_coach_override"("p_log" "uuid", "p_override" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_coach_override"("p_log" "uuid", "p_override" "jsonb") IS 'Pose (ou retire si NULL) l''adaptation du jour du coach, sans toucher la saisie de l''athlète.';



CREATE TABLE IF NOT EXISTS "public"."cycles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mesocycle_id" "uuid",
    "name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "objective" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "athlete_id" "uuid",
    "coach_id" "uuid",
    CONSTRAINT "cycles_dates" CHECK (("end_date" > "start_date"))
);


ALTER TABLE "public"."cycles" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_cycle_dates"("p_cycle" "uuid", "p_start" "date", "p_end" "date", "p_mesocycle" "uuid" DEFAULT NULL::"uuid", "p_change_mesocycle" boolean DEFAULT false, "p_drop_planned" boolean DEFAULT true, "p_trim_after_end" boolean DEFAULT false) RETURNS "public"."cycles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."set_cycle_dates"("p_cycle" "uuid", "p_start" "date", "p_end" "date", "p_mesocycle" "uuid", "p_change_mesocycle" boolean, "p_drop_planned" boolean, "p_trim_after_end" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_energy_rpe"("p_assignment" "uuid", "p_rpe" smallint) RETURNS "public"."energy_session_assignments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row public.energy_session_assignments;
BEGIN
  v_row := public._energy_assignment_for_write(p_assignment);
  IF p_rpe IS NOT NULL AND (p_rpe < 1 OR p_rpe > 10) THEN
    RAISE EXCEPTION 'RPE entre 1 et 10' USING ERRCODE = '22023';
  END IF;
  UPDATE public.energy_session_assignments SET rpe_score = p_rpe WHERE id = p_assignment
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."set_energy_rpe"("p_assignment" "uuid", "p_rpe" smallint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_own_coach"("p_coach" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_role text;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_me FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil introuvable' USING ERRCODE = 'P0002';
  END IF;
  IF p_coach IS NOT NULL AND p_coach <> v_me THEN
    RAISE EXCEPTION 'Rattachement à un autre coach : passer par le code coach' USING ERRCODE = '42501';
  END IF;
  IF p_coach = v_me AND v_role NOT IN ('coach', 'coach_athlete') THEN
    RAISE EXCEPTION 'Seul un coach peut être son propre coach' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles SET coach_id = p_coach WHERE id = v_me AND coach_id IS DISTINCT FROM p_coach;
  RETURN p_coach;
END;
$$;


ALTER FUNCTION "public"."set_own_coach"("p_coach" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_own_coach"("p_coach" "uuid") IS 'Quitter son coach (NULL) ou se coacher soi-même (son propre id, coach / coach-athlète). Voir src/api/account.ts setOwnCoach.';



CREATE OR REPLACE FUNCTION "public"."set_performance_reference"("p_athlete" "uuid", "p_metric" "text", "p_value" numeric, "p_unit" "text" DEFAULT NULL::"text", "p_date" "date" DEFAULT NULL::"date", "p_validated" boolean DEFAULT true) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_metric   text := public.normalize_metric_name(p_metric);
  v_is_coach boolean;
  v_id       uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  v_is_coach := public.is_coach_of(p_athlete) OR public.current_user_is_admin();
  IF NOT (p_athlete = auth.uid() OR v_is_coach) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF v_metric IS NULL OR v_metric = '' THEN
    RAISE EXCEPTION 'Nom de métrique manquant' USING ERRCODE = '22023';
  END IF;
  IF p_value IS NULL THEN
    RAISE EXCEPTION 'Valeur manquante' USING ERRCODE = '22023';
  END IF;

  -- Deux enregistrements simultanés de la même métrique : l'un attend l'autre
  -- (sinon l'index unique des références actives fait échouer le second).
  PERFORM pg_advisory_xact_lock(hashtext('perf_ref:' || p_athlete::text || ':' || v_metric));

  UPDATE public.performance_logs
     SET is_active_reference = false
   WHERE athlete_id = p_athlete
     AND metric_name = v_metric
     AND is_active_reference;

  INSERT INTO public.performance_logs
    (athlete_id, metric_type, metric_name, value, unit, date, is_active_reference, coach_validated, created_by)
  VALUES (
    p_athlete,
    CASE
      WHEN v_metric LIKE 'FCzone\_%' THEN 'zone'
      WHEN v_metric IN ('VMA','Vmax','VC','VO2max','PMA','FTP','FCmax','FCrepos','FCseuil') THEN 'reference'
      ELSE 'custom'
    END,
    v_metric,
    p_value,
    coalesce(nullif(btrim(p_unit), ''), CASE
      WHEN v_metric IN ('VMA','Vmax','VC') THEN 'km/h'
      WHEN v_metric = 'VO2max' THEN 'mL/kg/min'
      WHEN v_metric IN ('PMA','FTP') THEN 'W'
      WHEN v_metric IN ('FCmax','FCrepos','FCseuil') OR v_metric LIKE 'FCzone\_%' THEN 'bpm'
      ELSE '—'
    END),
    coalesce(p_date, current_date),
    true,
    -- Une référence posée par l'athlète lui-même reste « non validée » (en
    -- attente) : seule la validation du coach la marque validée.
    CASE WHEN v_is_coach THEN coalesce(p_validated, true) ELSE NULL END,
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."set_performance_reference"("p_athlete" "uuid", "p_metric" "text", "p_value" numeric, "p_unit" "text", "p_date" "date", "p_validated" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_workout_push"("p_provider" "public"."data_source", "p_enabled" boolean) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_found boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'non connecté' USING ERRCODE = '42501';
  END IF;
  UPDATE public.provider_connections
     SET push_workouts = p_enabled, updated_at = now()
   WHERE athlete_id = v_uid AND provider = p_provider
  RETURNING true INTO v_found;
  RETURN COALESCE(v_found, false);
END;
$$;


ALTER FUNCTION "public"."set_workout_push"("p_provider" "public"."data_source", "p_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_workout_rpe"("p_log" "uuid", "p_rpe" smallint) RETURNS "public"."workout_logs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row public.workout_logs;
BEGIN
  v_row := public._workout_log_for_write(p_log);
  IF p_rpe IS NOT NULL AND (p_rpe < 1 OR p_rpe > 10) THEN
    RAISE EXCEPTION 'RPE entre 1 et 10' USING ERRCODE = '22023';
  END IF;
  UPDATE public.workout_logs SET rpe_score = p_rpe WHERE id = p_log
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."set_workout_rpe"("p_log" "uuid", "p_rpe" smallint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."signup_birth_date_error"("p_birth" "date", "p_today" "date", "p_min" integer DEFAULT 15) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN p_birth IS NULL THEN NULL
    WHEN p_birth > p_today OR p_birth < date '1900-01-01' THEN 'Date de naissance invalide.'
    WHEN p_birth > (p_today - make_interval(years => p_min))::date
      THEN 'Tu dois avoir au moins 15 ans pour utiliser Agon.'
    ELSE NULL
  END;
$$;


ALTER FUNCTION "public"."signup_birth_date_error"("p_birth" "date", "p_today" "date", "p_min" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."signup_birth_date_error"("p_birth" "date", "p_today" "date", "p_min" integer) IS 'Message de refus pour une date de naissance à l''inscription (null = acceptée ou absente). Voir 20261109160000.';



CREATE OR REPLACE FUNCTION "public"."source_consent_granted"("p_athlete" "uuid", "p_source" "public"."data_source") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH pol AS (
    SELECT p.consent_purpose FROM public.data_source_policies p WHERE p.source = p_source
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM pol) THEN false
    WHEN (SELECT consent_purpose FROM pol) IS NULL THEN true
    WHEN NOT (
      auth.uid() IS NULL
      OR auth.uid() = p_athlete
      OR public.is_coach_of(p_athlete)
    ) THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.current_consents c
       WHERE c.user_id = p_athlete
         AND c.granted
         AND c.purpose = (SELECT consent_purpose FROM pol)
    )
  END;
$$;


ALTER FUNCTION "public"."source_consent_granted"("p_athlete" "uuid", "p_source" "public"."data_source") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."source_rank"("s" "public"."data_source") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE s WHEN 'garmin' THEN 2 WHEN 'coros' THEN 2 WHEN 'file_import' THEN 1 ELSE 0 END;
$$;


ALTER FUNCTION "public"."source_rank"("s" "public"."data_source") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_app_data_domain"("p_key" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE split_part(p_key, '::', 1)
    WHEN 'asp:prog'            THEN 'seances'
    WHEN 'asp:exos'            THEN 'seances'
    WHEN 'asp:exMeta'          THEN 'seances'
    WHEN 'asp:sessions'        THEN 'seances'
    WHEN 'asp:blockConfig'     THEN 'seances'
    -- asp:blockHistory : volontairement absent (wellness, poids et logs archivés).
    WHEN 'asp:weekschedule'    THEN 'seances'
    WHEN 'asp:visibility'      THEN 'seances'
    WHEN 'asp:custmethods'     THEN 'seances'
    WHEN 'asp:goals'           THEN 'seances'
    WHEN 'asp:seances-type'    THEN 'seances'
    WHEN 'asp:percycle_migrated' THEN 'seances'
    WHEN 'asp:sets'            THEN 'logs'
    WHEN 'asp:completed'       THEN 'logs'
    WHEN 'asp:sessionlogs'     THEN 'logs'
    WHEN 'asp:freesess'        THEN 'logs'
    WHEN 'asp:anotes'          THEN 'logs'
    WHEN 'asp:prs'             THEN 'logs'
    WHEN 'asp:wellness'        THEN 'wellness'
    WHEN 'asp:wh'              THEN 'wellness'
    WHEN 'asp:nutrition_strategy' THEN 'nutrition'
    WHEN 'asp:nutrition_log'   THEN 'nutrition'
    WHEN 'asp:wlog'            THEN 'nutrition'
    WHEN 'asp:wmile'           THEN 'nutrition'
    WHEN 'asp:bw'              THEN 'nutrition'
    WHEN 'asp:injuries'        THEN 'medical'
    WHEN 'asp:coach_feedback'  THEN 'commentaires'
    ELSE NULL
  END;
$$;


ALTER FUNCTION "public"."staff_app_data_domain"("p_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_apply_to_all"("p_link_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_src public.athlete_staff%ROWTYPE;
  v_n   integer;
BEGIN
  SELECT * INTO v_src FROM public.athlete_staff WHERE id = p_link_id;
  IF NOT FOUND OR NOT public.is_coach_of(v_src.athlete_id) THEN
    RAISE EXCEPTION 'Action non autorisée' USING ERRCODE = '42501';
  END IF;
  -- SECURITY INVOKER : la RLS et le trigger de garde s'appliquent ligne par ligne.
  UPDATE public.athlete_staff s
     SET permissions = v_src.permissions,
         can_edit_coach_content = v_src.can_edit_coach_content
   WHERE s.staff_id = v_src.staff_id
     AND s.id <> v_src.id
     AND s.status = 'active'
     AND public.is_coach_of(s.athlete_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;


ALTER FUNCTION "public"."staff_apply_to_all"("p_link_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_athlete_profiles"() RETURNS TABLE("id" "uuid", "full_name" "text", "first_name" "text", "last_name" "text", "coach_id" "uuid", "coach_name" "text", "gender" "text", "age" integer, "birth_date" "date", "height_cm" integer, "weight_kg" numeric, "body_fat_pct" numeric, "base_metabolism" integer, "habit_tracker_enabled" boolean, "is_hyrox_athlete" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH linked AS (
    SELECT p.*,
           public.staff_can(p.id, 'nutrition', 'read') AS can_nutrition,
           public.staff_can(p.id, 'tests', 'read')
             OR public.staff_can(p.id, 'nutrition', 'read')
             OR public.staff_can(p.id, 'medical', 'read') AS can_identity,
           public.staff_can(p.id, 'wellness', 'read') AS can_wellness,
           public.staff_can(p.id, 'seances', 'read') AS can_seances
      FROM public.profiles p
     WHERE EXISTS (
       SELECT 1 FROM public.athlete_staff s
        WHERE s.athlete_id = p.id
          AND s.staff_id = auth.uid()
          AND s.status = 'active'
     )
  )
  SELECT l.id, l.full_name, l.first_name, l.last_name, l.coach_id,
         c.full_name,
         CASE WHEN l.can_identity  THEN l.gender END,
         CASE WHEN l.can_identity  THEN l.age END,
         CASE WHEN l.can_identity  THEN l.birth_date END,
         CASE WHEN l.can_nutrition THEN l.height_cm END,
         CASE WHEN l.can_nutrition THEN l.weight_kg END,
         CASE WHEN l.can_nutrition THEN l.body_fat_pct END,
         CASE WHEN l.can_nutrition THEN l.base_metabolism END,
         CASE WHEN l.can_wellness  THEN l.habit_tracker_enabled END,
         CASE WHEN l.can_seances   THEN l.is_hyrox_athlete END
    FROM linked l
    LEFT JOIN public.profiles c ON c.id = l.coach_id;
$$;


ALTER FUNCTION "public"."staff_athlete_profiles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_can"("athlete_uuid" "uuid", "domain" "text", "level" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT athlete_uuid IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.athlete_staff s
       WHERE s.athlete_id = athlete_uuid
         AND s.staff_id   = auth.uid()
         AND s.status     = 'active'
         AND CASE level
               WHEN 'read'  THEN s.permissions->>domain IN ('read','write')
               WHEN 'write' THEN s.permissions->>domain = 'write'
               ELSE false
             END
    )
    AND EXISTS (
      SELECT 1 FROM public.current_consents c
       WHERE c.user_id = athlete_uuid
         AND c.purpose::text = 'staff_sharing'
         AND c.granted
    );
$$;


ALTER FUNCTION "public"."staff_can"("athlete_uuid" "uuid", "domain" "text", "level" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."staff_can"("athlete_uuid" "uuid", "domain" "text", "level" "text") IS 'Le pro courant a-t-il ce niveau sur ce domaine pour cet athlète ? Exige un lien actif ET l''accord staff_sharing de l''athlète, pour tous les domaines.';



CREATE OR REPLACE FUNCTION "public"."staff_can_edit"("athlete_uuid" "uuid", "domain" "text", "author" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.staff_can(athlete_uuid, domain, 'write')
    AND (
      author = auth.uid()
      OR EXISTS (
        SELECT 1
          FROM public.athlete_staff s
          JOIN public.profiles p ON p.id = s.athlete_id
         WHERE s.athlete_id = athlete_uuid
           AND s.staff_id = auth.uid()
           AND s.status = 'active'
           AND s.can_edit_coach_content
           AND p.coach_id IS NOT NULL
           AND author = p.coach_id
      )
    );
$$;


ALTER FUNCTION "public"."staff_can_edit"("athlete_uuid" "uuid", "domain" "text", "author" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_can_edit_doc"("doc_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.docs d
     WHERE d.id = doc_uuid
       AND (
         (d.uploaded_by = auth.uid() AND public.staff_can_write_bank(d.coach_id))
         OR (
           (d.uploaded_by IS NULL OR d.uploaded_by = d.coach_id)
           AND EXISTS (
             SELECT 1
               FROM public.athlete_staff s
               JOIN public.profiles p ON p.id = s.athlete_id
              WHERE s.staff_id = auth.uid()
                AND s.status = 'active'
                AND s.can_edit_coach_content
                AND s.permissions->>'fiches' = 'write'
                AND p.coach_id = d.coach_id
                AND (
                  d.athlete_id = s.athlete_id
                  OR EXISTS (
                    SELECT 1 FROM public.doc_assignments a
                      JOIN public.docs ad ON ad.id = a.doc_id
                     WHERE a.athlete_id = s.athlete_id
                       AND COALESCE(ad.origin_id, ad.id) = COALESCE(d.origin_id, d.id)
                  )
                )
           )
         )
       )
  );
$$;


ALTER FUNCTION "public"."staff_can_edit_doc"("doc_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_can_path"("p_name" "text", "domain" "text", "level" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
  SELECT CASE
    WHEN (storage.foldername(p_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.staff_can(((storage.foldername(p_name))[1])::uuid, domain, level)
    ELSE false
  END;
$_$;


ALTER FUNCTION "public"."staff_can_path"("p_name" "text", "domain" "text", "level" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_can_write_bank"("coach_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT coach_uuid IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.athlete_staff s
      JOIN public.profiles p ON p.id = s.athlete_id
     WHERE s.staff_id = auth.uid()
       AND s.status = 'active'
       AND s.permissions->>'fiches' = 'write'
       AND p.coach_id = coach_uuid
  );
$$;


ALTER FUNCTION "public"."staff_can_write_bank"("coach_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_can_write_docs_path"("p_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
  WITH f AS (
    SELECT (storage.foldername(p_name))[1] AS f1,
           (storage.foldername(p_name))[2] AS f2,
           (storage.foldername(p_name))[3] AS f3,
           (storage.foldername(p_name))[4] AS f4
  )
  SELECT CASE
    WHEN f1 !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN false
    WHEN f2 = 'banque' THEN public.staff_can_write_bank(f1::uuid)
    WHEN f2 = 'athletes'
         AND f3 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = f3::uuid AND p.coach_id = f1::uuid)
      AND (
        public.staff_can(f3::uuid, 'fiches', 'write')
        OR (f4 = 'comments' AND public.staff_can(f3::uuid, 'commentaires', 'write'))
      )
    ELSE false
  END
  FROM f;
$_$;


ALTER FUNCTION "public"."staff_can_write_docs_path"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_default_permissions"("p_profession" "text") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE p_profession
    WHEN 'kine' THEN jsonb_build_object(
      'seances','read','fiches','write','planification','read','logs','read','wellness','read',
      'medical','write','nutrition','none','tests','read','commentaires','write')
    WHEN 'osteo' THEN jsonb_build_object(
      'seances','read','fiches','write','planification','read','logs','read','wellness','read',
      'medical','write','nutrition','none','tests','read','commentaires','write')
    WHEN 'coach_adjoint' THEN jsonb_build_object(
      'seances','write','fiches','write','planification','write','logs','read','wellness','read',
      'medical','read','nutrition','read','tests','write','commentaires','write')
    WHEN 'nutritionniste' THEN jsonb_build_object(
      'seances','none','fiches','write','planification','read','logs','read','wellness','read',
      'medical','none','nutrition','write','tests','none','commentaires','write')
    WHEN 'prepa_mentale' THEN jsonb_build_object(
      'seances','none','fiches','write','planification','read','logs','none','wellness','read',
      'medical','none','nutrition','none','tests','none','commentaires','write')
    WHEN 'medecin' THEN jsonb_build_object(
      'seances','read','fiches','read','planification','read','logs','read','wellness','read',
      'medical','write','nutrition','read','tests','read','commentaires','write')
    ELSE jsonb_build_object(
      'seances','none','fiches','none','planification','none','logs','none','wellness','none',
      'medical','none','nutrition','none','tests','none','commentaires','write')
  END;
$$;


ALTER FUNCTION "public"."staff_default_permissions"("p_profession" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_doc_for_athlete"("doc_uuid" "uuid", "athlete_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.docs d
      JOIN public.profiles p ON p.id = athlete_uuid
     WHERE d.id = doc_uuid
       AND d.coach_id = p.coach_id
       AND d.archived_at IS NULL
  ) AND public.can_read_doc(doc_uuid);
$$;


ALTER FUNCTION "public"."staff_doc_for_athlete"("doc_uuid" "uuid", "athlete_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_domains"() RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT ARRAY['seances','fiches','planification','logs','wellness','medical','nutrition','tests','commentaires'];
$$;


ALTER FUNCTION "public"."staff_domains"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_invitations_before_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.invited_by := auth.uid();
  NEW.used_at := NULL;
  NEW.used_by := NULL;
  NEW.created_at := now();
  IF NEW.expires_at IS NULL OR NEW.expires_at > now() + interval '30 days' THEN
    NEW.expires_at := now() + interval '14 days';
  END IF;

  IF public.is_coach_of(NEW.athlete_id) THEN
    -- Coach principal (y compris un athlète autocoaché) : grille libre.
    NEW.invited_by_role := 'coach';
    NEW.permissions := public.staff_normalize_permissions(NEW.permissions);
  ELSIF NEW.athlete_id = auth.uid() THEN
    -- Athlète : grille par défaut du métier, le coach ajustera (spec §1).
    NEW.invited_by_role := 'athlete';
    NEW.permissions := public.staff_default_permissions(NEW.profession);
    NEW.can_edit_coach_content := false;
  ELSE
    RAISE EXCEPTION 'Action non autorisée' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."staff_invitations_before_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_is_linked"("athlete_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.athlete_staff s
     WHERE s.athlete_id = athlete_uuid
       AND s.staff_id = auth.uid()
       AND s.status = 'active'
  );
$$;


ALTER FUNCTION "public"."staff_is_linked"("athlete_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_normalize_permissions"("p" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
DECLARE
  k text;
  v text;
  out jsonb := '{}'::jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    p := '{}'::jsonb;
  END IF;
  FOR k IN SELECT jsonb_object_keys(p) LOOP
    IF NOT (k = ANY (public.staff_domains())) THEN
      RAISE EXCEPTION 'Domaine staff inconnu : %', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH k IN ARRAY public.staff_domains() LOOP
    v := COALESCE(p->>k, 'none');
    IF v NOT IN ('none','read','write') THEN
      RAISE EXCEPTION 'Niveau de droit invalide pour % : %', k, v USING ERRCODE = '22023';
    END IF;
    out := out || jsonb_build_object(k, v);
  END LOOP;
  RETURN out;
END;
$$;


ALTER FUNCTION "public"."staff_normalize_permissions"("p" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_profile_visible"("staff_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.athlete_staff s
     WHERE s.staff_id = staff_uuid
       AND (s.athlete_id = auth.uid() OR public.is_coach_of(s.athlete_id))
  );
$$;


ALTER FUNCTION "public"."staff_profile_visible"("staff_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_sharing_consented"("athlete_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT (
      auth.uid() = athlete_uuid
      OR public.is_coach_of(athlete_uuid)
      OR EXISTS (SELECT 1 FROM public.athlete_staff s
                  WHERE s.athlete_id = athlete_uuid AND s.staff_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.current_consents c
       WHERE c.user_id = athlete_uuid
         AND c.purpose::text = 'staff_sharing'
         AND c.granted
    );
$$;


ALTER FUNCTION "public"."staff_sharing_consented"("athlete_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stream_quality_rank"("q" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE q WHEN 'fit' THEN 3 WHEN 'garmin_json' THEN 2 WHEN 'tcx' THEN 2 WHEN 'gpx' THEN 1 ELSE 0 END;
$$;


ALTER FUNCTION "public"."stream_quality_rank"("q" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_doc_assignments"("p_athlete" "uuid", "p_source" "text", "p_doc_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_source NOT IN ('programme', 'energie') THEN
    RAISE EXCEPTION 'invalid source';
  END IF;

  IF NOT (
    public.is_coach_of(p_athlete)
    OR (p_athlete = auth.uid()
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coach', 'coach_athlete')))
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  DELETE FROM public.doc_assignments
   WHERE athlete_id = p_athlete
     AND source = p_source
     AND NOT (doc_id = ANY (COALESCE(p_doc_ids, '{}'::uuid[])));

  INSERT INTO public.doc_assignments (doc_id, athlete_id, assigned_by, source)
  SELECT d.id, p_athlete, auth.uid(), p_source
    FROM public.docs d
   WHERE d.id = ANY (COALESCE(p_doc_ids, '{}'::uuid[]))
     AND (d.coach_id = auth.uid() OR public.is_athlete_coach(p_athlete, d.coach_id))
     -- fiche de banque, ou fiche personnelle de CET athlète uniquement
     AND (d.athlete_id IS NULL OR d.athlete_id = p_athlete)
  ON CONFLICT (doc_id, athlete_id, source) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."sync_doc_assignments"("p_athlete" "uuid", "p_source" "text", "p_doc_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_extrap_to_performance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  declare v_metric text; v_op text; v_factor numeric; v_unit text; v_athlete uuid; v_date date; physio numeric;
  begin
    select extrap_metric,extrap_op,extrap_factor into v_metric,v_op,v_factor from public.test_variables where id=NEW.variable_id;
    if v_metric is null or v_op is null or v_factor is null or v_factor=0 then return NEW; end if;
    select athlete_id,performed_at into v_athlete,v_date from public.athlete_test_results where id=NEW.result_id;
    if v_athlete is null then return NEW; end if;
    if exists (select 1 from public.performance_logs where athlete_id=v_athlete and metric_name=v_metric and is_active_reference=true and date>v_date) then return NEW; end if;
    physio := round((case when v_op='div' then NEW.value/v_factor else NEW.value*v_factor end)::numeric,1);
    v_unit := case v_metric when 'VMA' then 'km/h' when 'Vmax' then 'km/h' when 'VC' then 'km/h' when 'VO2max' then 'mL/kg/min' when 'PMA' then 'W' when 'FTP' then 'W' when
  'FCmax' then 'bpm' else '' end;
    update public.performance_logs set is_active_reference=false where athlete_id=v_athlete and metric_name=v_metric and is_active_reference=true;
    insert into public.performance_logs (athlete_id,metric_type,metric_name,value,unit,date,is_active_reference,coach_validated)
    values (v_athlete,'reference',v_metric,physio,v_unit,v_date,true,true);
    return NEW;
  end; $$;


ALTER FUNCTION "public"."sync_extrap_to_performance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_test_session_to_results"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
  declare def_id uuid; res_id uuid; tv_id uuid; v_key text; v_val numeric; vars jsonb;
          v_feeling smallint; v_comment text;
  begin
    if NEW.completed is not true then return NEW; end if;
    vars := NEW.results_structured->'variables';
    if vars is null or jsonb_typeof(vars)<>'object' then return NEW; end if;
    select id into def_id from public.test_definitions where lower(name)=lower(NEW.title) order by (case when is_global then 0 else 1 end), created_at limit 1;
    if def_id is null then return NEW; end if;
    -- Date corrigée par l'athlète : le résultat de l'ancien jour ne tient plus.
    if TG_OP = 'UPDATE' and OLD.date is distinct from NEW.date then
      delete from public.athlete_test_results where athlete_id=NEW.athlete_id and test_definition_id=def_id and performed_at=OLD.date;
    end if;
    delete from public.athlete_test_results where athlete_id=NEW.athlete_id and test_definition_id=def_id and performed_at=NEW.date;
    if not exists (select 1 from jsonb_each_text(vars) e where e.value ~ '^-?[0-9]+(\.[0-9]+)?$') then return NEW; end if;
    if (NEW.results_structured->>'feeling') ~ '^[1-5]$' then v_feeling := (NEW.results_structured->>'feeling')::smallint; end if;
    v_comment := left(nullif(btrim(NEW.results_structured->>'comment'), ''), 1000);
    insert into public.athlete_test_results (athlete_id,test_definition_id,performed_at,notes,feeling,comment)
      values (NEW.athlete_id,def_id,NEW.date,NEW.results_note,v_feeling,v_comment) returning id into res_id;
    for v_key,v_val in select e.key,e.value::numeric from jsonb_each_text(vars) e where e.value ~ '^-?[0-9]+(\.[0-9]+)?$' loop
      select id into tv_id from public.test_variables where test_definition_id=def_id and key=v_key;
      if tv_id is not null then insert into public.athlete_test_values (result_id,variable_id,value) values (res_id,tv_id,v_val) on conflict (result_id,variable_id) do update set
  value=excluded.value; end if;
    end loop;
    return NEW;
  end; $_$;


ALTER FUNCTION "public"."sync_test_session_to_results"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_activity_garmin_device_no_ai"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.ai_allowed AND public.activity_from_garmin_device(NEW.source, NEW.raw, NEW.device_name, NEW.sources) THEN
    NEW.ai_allowed := false;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."tg_activity_garmin_device_no_ai"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_activity_streams_zones"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.refresh_activity_zone_summary(NEW.activity_id);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'zones non recalculées : %', SQLERRM;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."tg_activity_streams_zones"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_fczone_refresh"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.metric_name LIKE 'FCzone\_%' THEN
    PERFORM public.refresh_athlete_zone_summaries(NEW.athlete_id, NEW.date);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'zones non recalculées : %', SQLERRM;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."tg_fczone_refresh"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_hr_zone_models_refresh"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'active' THEN
    PERFORM public.refresh_athlete_zone_summaries(NEW.athlete_id, NEW.valid_from);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'zones non recalculées : %', SQLERRM;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."tg_hr_zone_models_refresh"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_plan_links_relink"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."tg_plan_links_relink"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_test_values_propose_zones"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_key text;
  v_athlete uuid;
  v_day date;
  v1 numeric;
  v2 numeric;
  v_open uuid;
BEGIN
  SELECT tv.key INTO v_key FROM public.test_variables tv WHERE tv.id = NEW.variable_id;
  IF v_key NOT IN ('sv1_hr', 'sv2_hr') THEN RETURN NULL; END IF;
  SELECT r.athlete_id, r.performed_at INTO v_athlete, v_day FROM public.athlete_test_results r WHERE r.id = NEW.result_id;

  SELECT atv.value INTO v1 FROM public.athlete_test_values atv
    JOIN public.athlete_test_results r ON r.id = atv.result_id
    JOIN public.test_variables tv ON tv.id = atv.variable_id
   WHERE r.athlete_id = v_athlete AND tv.key = 'sv1_hr'
   ORDER BY r.performed_at DESC, r.created_at DESC LIMIT 1;
  SELECT atv.value INTO v2 FROM public.athlete_test_values atv
    JOIN public.athlete_test_results r ON r.id = atv.result_id
    JOIN public.test_variables tv ON tv.id = atv.variable_id
   WHERE r.athlete_id = v_athlete AND tv.key = 'sv2_hr'
   ORDER BY r.performed_at DESC, r.created_at DESC LIMIT 1;
  IF v1 IS NULL OR v2 IS NULL OR NOT public.hr_bounds_valid(ARRAY[round(v1), round(v2)]::smallint[]) THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_open FROM public.hr_zone_models WHERE athlete_id = v_athlete AND status = 'proposed' LIMIT 1;
  IF v_open IS NULL THEN
    INSERT INTO public.hr_zone_models (athlete_id, kind, bounds, valid_from, status, origin, test_result_id, created_by)
    VALUES (v_athlete, 'three', ARRAY[round(v1), round(v2)]::smallint[], v_day, 'proposed', 'test', NEW.result_id, auth.uid());
  ELSE
    UPDATE public.hr_zone_models
       SET bounds = ARRAY[round(v1), round(v2)]::smallint[], valid_from = v_day, test_result_id = NEW.result_id
     WHERE id = v_open;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'proposition de zones non créée : %', SQLERRM;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."tg_test_values_propose_zones"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_coach_certification"("p_target_id" "uuid", "p_certified" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin required';
  END IF;

  IF p_target_id = auth.uid() THEN
    RAISE EXCEPTION 'Forbidden: cannot modify own certification';
  END IF;

  UPDATE public.profiles
  SET is_certified_coach = p_certified
  WHERE profiles.id = p_target_id;
END;
$$;


ALTER FUNCTION "public"."toggle_coach_certification"("p_target_id" "uuid", "p_certified" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_coros_sync"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'net', 'vault', 'extensions'
    AS $$
DECLARE
  v_url  text;
  v_key  text;
  v_conn record;
  v_n    integer := 0;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'trigger_coros_sync : secrets project_url / service_role_key absents du Vault — rien envoyé.';
    RETURN;
  END IF;

  -- Ménage : le décompte n'a d'intérêt que pour la journée en cours, on garde
  -- un mois pour le diagnostic.
  DELETE FROM public.provider_fit_quota WHERE day < current_date - 30;

  FOR v_conn IN
    SELECT id FROM public.provider_connections
     WHERE provider = 'coros' AND status = 'active'
     ORDER BY last_sync_at NULLS FIRST, id
  LOOP
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/provider-coros-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body    := jsonb_build_object('connection_id', v_conn.id),
      timeout_milliseconds := 300000
    );
    v_n := v_n + 1;
  END LOOP;

  RAISE LOG 'trigger_coros_sync : % appel(s) émis', v_n;
EXCEPTION
  WHEN undefined_function THEN
    RAISE WARNING 'trigger_coros_sync : net.http_post introuvable (pg_net non installé).';
  WHEN undefined_table THEN
    RAISE WARNING 'trigger_coros_sync : Vault indisponible.';
END;
$$;


ALTER FUNCTION "public"."trigger_coros_sync"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trigger_coros_sync"() IS 'Déclenche provider-coros-sync, un appel par connexion COROS active ({connection_id}). Appelée par le cron quotidien ; lit project_url et service_role_key dans le Vault.';



CREATE OR REPLACE FUNCTION "public"."trigger_garmin_maintenance"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'net', 'vault', 'extensions'
    AS $$
DECLARE
  v_due boolean;
  v_url text;
  v_key text;
BEGIN
  DELETE FROM public.provider_webhook_inbox
   WHERE (processed_at IS NOT NULL AND processed_at < now() - interval '7 days')
      OR (processed_at IS NULL AND received_at < now() - interval '30 days');

  SELECT
    EXISTS (
      SELECT 1 FROM public.provider_webhook_inbox i
       WHERE i.provider = 'garmin'
         AND i.processed_at IS NULL
         AND i.attempts < 5
         AND i.received_at < now() - interval '2 minutes'
         AND (i.locked_until IS NULL OR i.locked_until <= now())
    )
    OR EXISTS (
      SELECT 1 FROM public.provider_connections c
        JOIN public.provider_tokens t ON t.connection_id = c.id
       WHERE c.provider = 'garmin'
         AND c.status IN ('active', 'consent_withdrawn')
         AND t.refresh_secret_id IS NOT NULL
         AND COALESCE(t.refresh_expires_at, t.updated_at + interval '90 days')
             < now() + interval '60 days'
    )
  INTO v_due;

  IF NOT v_due THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'trigger_garmin_maintenance : secrets project_url / service_role_key absents du Vault — rien envoyé.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/provider-garmin-maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
EXCEPTION
  WHEN undefined_function THEN
    RAISE WARNING 'trigger_garmin_maintenance : net.http_post introuvable (pg_net non installé).';
  WHEN undefined_table THEN
    RAISE WARNING 'trigger_garmin_maintenance : Vault indisponible.';
END;
$$;


ALTER FUNCTION "public"."trigger_garmin_maintenance"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trigger_garmin_maintenance"() IS 'Purge l''inbox webhook, puis appelle provider-garmin-maintenance seulement s''il y a un message en retard ou un jeton Garmin à rafraîchir. No-op silencieux sinon.';



CREATE OR REPLACE FUNCTION "public"."trigger_garmin_workouts"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'net', 'vault', 'extensions'
    AS $$
DECLARE
  v_due boolean;
  v_url text;
  v_key text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.provider_connections c
     WHERE c.provider = 'garmin' AND c.status = 'active'
       AND (c.push_workouts
            OR EXISTS (SELECT 1 FROM public.provider_workout_pushes p
                        WHERE p.athlete_id = c.athlete_id AND p.provider = 'garmin'
                          AND p.external_workout_id IS NOT NULL))
  ) INTO v_due;

  IF NOT v_due THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'trigger_garmin_workouts : secrets project_url / service_role_key absents du Vault — rien envoyé.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/provider-garmin-workouts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
EXCEPTION
  WHEN undefined_function THEN
    RAISE WARNING 'trigger_garmin_workouts : net.http_post introuvable (pg_net non installé).';
  WHEN undefined_table THEN
    RAISE WARNING 'trigger_garmin_workouts : Vault indisponible.';
END;
$$;


ALTER FUNCTION "public"."trigger_garmin_workouts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unlink_athlete"("athlete_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = athlete_id AND coach_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE profiles SET coach_id = NULL, coach_hidden = false WHERE id = athlete_id;
END;
$$;


ALTER FUNCTION "public"."unlink_athlete"("athlete_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."weight_record_milestone"("p_athlete" "uuid", "p_day" "date", "p_kg" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_key  text;
  v_item jsonb;
  v_mile jsonb;
  v_bw   jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_athlete IS NULL OR p_day IS NULL OR p_kg IS NULL THEN
    RAISE EXCEPTION 'Athlète, jour et poids obligatoires' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_athlete = v_me OR public.is_coach_of(p_athlete)) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  IF p_kg <= 0 OR p_kg >= 500 THEN
    RAISE EXCEPTION 'Poids invalide' USING ERRCODE = '22023';
  END IF;

  v_key  := to_char(p_day, 'YYYYMMDD');
  v_item := jsonb_build_object('date', v_key, 'kg', to_jsonb(p_kg));

  -- Paliers (tableau) : ajout, sauf s'il est déjà là (double clic, renvoi).
  SELECT value INTO v_mile
    FROM public.app_data
   WHERE athlete_id = p_athlete AND key = 'asp:wmile'
     FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.app_data(athlete_id, key, value, updated_at)
    VALUES (p_athlete, 'asp:wmile', jsonb_build_array(v_item), now())
    ON CONFLICT (athlete_id, key) DO UPDATE
      SET value = CASE
            WHEN jsonb_typeof(public.app_data.value) <> 'array' THEN jsonb_build_array(v_item)
            WHEN public.app_data.value @> jsonb_build_array(v_item) THEN public.app_data.value
            ELSE public.app_data.value || jsonb_build_array(v_item)
          END,
          updated_at = now();
  ELSE
    IF v_mile IS NULL OR jsonb_typeof(v_mile) = 'null' THEN
      v_mile := '[]'::jsonb;
    ELSIF jsonb_typeof(v_mile) <> 'array' THEN
      RAISE EXCEPTION 'Paliers de poids illisibles' USING ERRCODE = '22023';
    END IF;
    IF NOT (v_mile @> jsonb_build_array(v_item)) THEN
      UPDATE public.app_data
         SET value = v_mile || jsonb_build_array(v_item), updated_at = now()
       WHERE athlete_id = p_athlete AND key = 'asp:wmile';
    END IF;
  END IF;

  -- Poids de corps : `current` = palier, `target` gardé.
  SELECT value INTO v_bw
    FROM public.app_data
   WHERE athlete_id = p_athlete AND key = 'asp:bw'
     FOR UPDATE;

  IF NOT FOUND THEN
    v_bw := jsonb_build_object('current', to_jsonb(p_kg), 'target', 0);
    INSERT INTO public.app_data(athlete_id, key, value, updated_at)
    VALUES (p_athlete, 'asp:bw', v_bw, now())
    ON CONFLICT (athlete_id, key) DO UPDATE
      SET value = CASE WHEN jsonb_typeof(public.app_data.value) = 'object'
                       THEN public.app_data.value || jsonb_build_object('current', to_jsonb(p_kg))
                       ELSE jsonb_build_object('current', to_jsonb(p_kg), 'target', 0) END,
          updated_at = now()
    RETURNING value INTO v_bw;
  ELSE
    IF v_bw IS NULL OR jsonb_typeof(v_bw) <> 'object' THEN
      v_bw := jsonb_build_object('target', 0);
    END IF;
    v_bw := v_bw || jsonb_build_object('current', to_jsonb(p_kg));
    UPDATE public.app_data
       SET value = v_bw, updated_at = now()
     WHERE athlete_id = p_athlete AND key = 'asp:bw';
  END IF;

  RETURN v_bw;
END;
$$;


ALTER FUNCTION "public"."weight_record_milestone"("p_athlete" "uuid", "p_day" "date", "p_kg" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."weight_set_day"("p_athlete" "uuid", "p_day" "date", "p_kg" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_me  uuid := auth.uid();
  v_key text;
  v_iso text;
  v_cur jsonb;
  v_new jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_athlete IS NULL OR p_day IS NULL OR p_kg IS NULL THEN
    RAISE EXCEPTION 'Athlète, jour et poids obligatoires' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_athlete = v_me OR public.is_coach_of(p_athlete)) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  IF p_kg <= 0 OR p_kg >= 500 THEN
    RAISE EXCEPTION 'Poids invalide' USING ERRCODE = '22023';
  END IF;

  v_key := to_char(p_day, 'YYYYMMDD');
  v_iso := to_char(p_day, 'YYYY-MM-DD');

  -- Verrou de la ligne : deux appareils passent l'un après l'autre.
  SELECT value INTO v_cur
    FROM public.app_data
   WHERE athlete_id = p_athlete AND key = 'asp:wlog'
     FOR UPDATE;

  IF NOT FOUND THEN
    v_new := jsonb_build_object(v_key, to_jsonb(p_kg));
    INSERT INTO public.app_data(athlete_id, key, value, updated_at)
    VALUES (p_athlete, 'asp:wlog', v_new, now())
    ON CONFLICT (athlete_id, key) DO UPDATE
      SET value = jsonb_set(public.app_data.value - v_iso, ARRAY[v_key], to_jsonb(p_kg), true),
          updated_at = now()
    RETURNING value INTO v_new;
  ELSE
    IF v_cur IS NULL OR jsonb_typeof(v_cur) = 'null' THEN
      v_cur := '{}'::jsonb;
    ELSIF jsonb_typeof(v_cur) <> 'object' THEN
      -- Jamais vu en base ; on refuse plutôt que d'écraser un blob illisible.
      RAISE EXCEPTION 'Journal de poids illisible' USING ERRCODE = '22023';
    END IF;
    v_new := jsonb_set(v_cur - v_iso, ARRAY[v_key], to_jsonb(p_kg), true);
    UPDATE public.app_data
       SET value = v_new, updated_at = now()
     WHERE athlete_id = p_athlete AND key = 'asp:wlog';
  END IF;

  RETURN v_new;
END;
$$;


ALTER FUNCTION "public"."weight_set_day"("p_athlete" "uuid", "p_day" "date", "p_kg" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."weight_set_goal"("p_athlete" "uuid", "p_target_kg" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_me  uuid := auth.uid();
  v_tgt numeric := coalesce(p_target_kg, 0);
  v_bw  jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_athlete IS NULL THEN
    RAISE EXCEPTION 'Athlète obligatoire' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_athlete = v_me OR public.is_coach_of(p_athlete)) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  IF v_tgt < 0 OR v_tgt >= 500 THEN
    RAISE EXCEPTION 'Objectif de poids invalide' USING ERRCODE = '22023';
  END IF;

  -- Verrou de la ligne : un palier concurrent passe avant ou après, jamais écrasé.
  SELECT value INTO v_bw
    FROM public.app_data
   WHERE athlete_id = p_athlete AND key = 'asp:bw'
     FOR UPDATE;

  IF NOT FOUND THEN
    v_bw := jsonb_build_object('current', 0, 'target', to_jsonb(v_tgt));
    INSERT INTO public.app_data(athlete_id, key, value, updated_at)
    VALUES (p_athlete, 'asp:bw', v_bw, now())
    ON CONFLICT (athlete_id, key) DO UPDATE
      SET value = CASE WHEN jsonb_typeof(public.app_data.value) = 'object'
                       THEN public.app_data.value || jsonb_build_object('target', to_jsonb(v_tgt))
                       ELSE jsonb_build_object('current', 0, 'target', to_jsonb(v_tgt)) END,
          updated_at = now()
    RETURNING value INTO v_bw;
  ELSE
    IF v_bw IS NULL OR jsonb_typeof(v_bw) <> 'object' THEN
      v_bw := jsonb_build_object('current', 0);
    END IF;
    v_bw := v_bw || jsonb_build_object('target', to_jsonb(v_tgt));
    UPDATE public.app_data
       SET value = v_bw, updated_at = now()
     WHERE athlete_id = p_athlete AND key = 'asp:bw';
  END IF;

  RETURN v_bw;
END;
$$;


ALTER FUNCTION "public"."weight_set_goal"("p_athlete" "uuid", "p_target_kg" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wellness_delete_day"("p_athlete" "uuid", "p_day" "date") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_key  text;
  v_iso  text;
  v_rows int;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_athlete IS NULL OR p_day IS NULL THEN
    RAISE EXCEPTION 'Athlète et jour obligatoires' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_athlete = v_me OR public.is_coach_of(p_athlete)) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;

  v_key := to_char(p_day, 'YYYYMMDD');
  v_iso := to_char(p_day, 'YYYY-MM-DD');

  UPDATE public.app_data
     SET value = value - v_key - v_iso,
         updated_at = now()
   WHERE athlete_id = p_athlete AND key = 'asp:wh'
     AND jsonb_typeof(value) = 'object'
     AND (value ? v_key OR value ? v_iso);
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  DELETE FROM public.app_data
   WHERE athlete_id = p_athlete AND key = 'asp:wellness'
     AND jsonb_typeof(value) = 'object'
     AND replace(value->>'date', '-', '') = v_key;

  RETURN v_rows > 0;
END;
$$;


ALTER FUNCTION "public"."wellness_delete_day"("p_athlete" "uuid", "p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wellness_set_day"("p_athlete" "uuid", "p_day" "date", "p_entry" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_key   text;
  v_iso   text;
  v_entry jsonb;
  v_cur   jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_athlete IS NULL OR p_day IS NULL THEN
    RAISE EXCEPTION 'Athlète et jour obligatoires' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_athlete = v_me OR public.is_coach_of(p_athlete)) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  IF p_entry IS NULL OR jsonb_typeof(p_entry) <> 'object' THEN
    RAISE EXCEPTION 'Saisie wellness invalide' USING ERRCODE = '22023';
  END IF;

  v_key   := to_char(p_day, 'YYYYMMDD');
  v_iso   := to_char(p_day, 'YYYY-MM-DD');
  v_entry := p_entry || jsonb_build_object('date', v_key);

  -- Verrou de la ligne : deux appareils qui écrivent en même temps passent
  -- l'un après l'autre, chacun sur la version à jour.
  SELECT value INTO v_cur
    FROM public.app_data
   WHERE athlete_id = p_athlete AND key = 'asp:wh'
     FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.app_data(athlete_id, key, value, updated_at)
    VALUES (p_athlete, 'asp:wh', jsonb_build_object(v_key, v_entry), now())
    ON CONFLICT (athlete_id, key) DO UPDATE
      SET value = jsonb_set(public.app_data.value - v_iso, ARRAY[v_key], v_entry, true),
          updated_at = now();
  ELSE
    IF jsonb_typeof(v_cur) <> 'object' THEN
      -- Jamais vu en base ; on refuse plutôt que d'écraser un blob illisible.
      RAISE EXCEPTION 'Historique wellness illisible' USING ERRCODE = '22023';
    END IF;
    UPDATE public.app_data
       SET value = jsonb_set(v_cur - v_iso, ARRAY[v_key], v_entry, true),
           updated_at = now()
     WHERE athlete_id = p_athlete AND key = 'asp:wh';
  END IF;

  -- Copie « saisie la plus récente » (asp:wellness), si ce jour l'est.
  INSERT INTO public.app_data(athlete_id, key, value, updated_at)
  VALUES (p_athlete, 'asp:wellness', v_entry, now())
  ON CONFLICT (athlete_id, key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now()
  WHERE jsonb_typeof(public.app_data.value) <> 'object'
     OR coalesce(replace(public.app_data.value->>'date', '-', ''), '') <= v_key;

  RETURN v_entry;
END;
$$;


ALTER FUNCTION "public"."wellness_set_day"("p_athlete" "uuid", "p_day" "date", "p_entry" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."workout_log_athlete_id"("p_log_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT athlete_id FROM public.workout_logs WHERE id = p_log_id;
$$;


ALTER FUNCTION "public"."workout_log_athlete_id"("p_log_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."workout_log_has_entries"("mods" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_each(
      CASE WHEN jsonb_typeof(mods -> 'sessionSets') = 'object' THEN mods -> 'sessionSets' ELSE '{}'::jsonb END
    ) AS ex(ex_id, ex_rows)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(ex.ex_rows) = 'array' THEN ex.ex_rows ELSE '[]'::jsonb END
    ) AS s(item)
    WHERE jsonb_typeof(s.item) = 'object'
      AND (
        (s.item ? 'kg'   AND jsonb_typeof(s.item -> 'kg')   <> 'null') OR
        (s.item ? 'reps' AND jsonb_typeof(s.item -> 'reps') <> 'null')
      )
  );
$$;


ALTER FUNCTION "public"."workout_log_has_entries"("mods" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."workout_log_has_entries"("mods" "jsonb") IS 'true si athlete_modifications contient au moins une série avec charge ou reps.';



CREATE TABLE IF NOT EXISTS "public"."account_deletions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deleted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text",
    "consent_version" "text",
    "had_core_consent" boolean,
    "initiated_by" "text" DEFAULT 'user'::"text" NOT NULL,
    CONSTRAINT "account_deletions_initiated_by_check" CHECK (("initiated_by" = ANY (ARRAY['user'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."account_deletions" OWNER TO "postgres";


COMMENT ON TABLE "public"."account_deletions" IS 'Journal anonyme des suppressions. Aucun identifiant de personne : ni email, ni uuid, ni nom. Ne jamais en ajouter.';



CREATE TABLE IF NOT EXISTS "public"."activity_laps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "source" "public"."data_source" NOT NULL,
    "position" integer NOT NULL,
    "start_s" integer NOT NULL,
    "end_s" integer NOT NULL,
    "name" "text",
    "exercise_id" "uuid",
    "planned_block_ref" "text",
    "distance_override_m" real,
    "reps" integer,
    "load_kg" real,
    "origin" "text" NOT NULL,
    "status" "text" NOT NULL,
    "needs_review" boolean DEFAULT false NOT NULL,
    "ai_allowed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "comment" "text",
    CONSTRAINT "activity_laps_bounds" CHECK (("end_s" >= "start_s")),
    CONSTRAINT "activity_laps_comment_check" CHECK ((("comment" IS NULL) OR ("length"("comment") <= 500))),
    CONSTRAINT "activity_laps_distance_override_m_check" CHECK ((("distance_override_m" IS NULL) OR ("distance_override_m" >= (0)::double precision))),
    CONSTRAINT "activity_laps_load_kg_check" CHECK ((("load_kg" IS NULL) OR ("load_kg" >= (0)::double precision))),
    CONSTRAINT "activity_laps_name_check" CHECK ((("name" IS NULL) OR ("length"("name") <= 120))),
    CONSTRAINT "activity_laps_origin_check" CHECK (("origin" = ANY (ARRAY['watch'::"text", 'agon_proposal'::"text", 'manual'::"text"]))),
    CONSTRAINT "activity_laps_planned_block_ref_check" CHECK ((("planned_block_ref" IS NULL) OR ("length"("planned_block_ref") <= 120))),
    CONSTRAINT "activity_laps_position_check" CHECK (("position" >= 1)),
    CONSTRAINT "activity_laps_reps_check" CHECK ((("reps" IS NULL) OR ("reps" >= 0))),
    CONSTRAINT "activity_laps_start_s_check" CHECK (("start_s" >= 0)),
    CONSTRAINT "activity_laps_status_check" CHECK (("status" = ANY (ARRAY['proposed'::"text", 'validated'::"text"])))
);


ALTER TABLE "public"."activity_laps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_plan_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "source" "public"."data_source" NOT NULL,
    "planned_kind" "text" NOT NULL,
    "planned_id" "uuid" NOT NULL,
    "local_date" "date" NOT NULL,
    "status" "text" NOT NULL,
    "cost" real,
    "confirmed_by" "uuid",
    "confirmed_at" timestamp with time zone,
    "ai_allowed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "activity_plan_links_planned_kind_check" CHECK (("planned_kind" = ANY (ARRAY['energy'::"text", 'workout'::"text", 'test'::"text"]))),
    CONSTRAINT "activity_plan_links_status_check" CHECK (("status" = ANY (ARRAY['auto'::"text", 'confirmed'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."activity_plan_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_sets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "source" "public"."data_source" NOT NULL,
    "position" integer NOT NULL,
    "start_s" integer,
    "duration_s" real,
    "reps" integer,
    "weight_kg" real,
    "set_type" "text",
    "category" integer[],
    "category_subtype" integer[],
    "ai_allowed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "activity_sets_duration_s_check" CHECK ((("duration_s" IS NULL) OR ("duration_s" >= (0)::double precision))),
    CONSTRAINT "activity_sets_position_check" CHECK (("position" >= 1)),
    CONSTRAINT "activity_sets_reps_check" CHECK ((("reps" IS NULL) OR ("reps" >= 0))),
    CONSTRAINT "activity_sets_set_type_check" CHECK ((("set_type" IS NULL) OR ("set_type" = ANY (ARRAY['active'::"text", 'rest'::"text"])))),
    CONSTRAINT "activity_sets_weight_kg_check" CHECK ((("weight_kg" IS NULL) OR ("weight_kg" >= (0)::double precision)))
);


ALTER TABLE "public"."activity_sets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_streams" (
    "activity_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "source" "public"."data_source" NOT NULL,
    "normalized_from" "text" NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "utc_offset_s" integer,
    "sport" "text",
    "sample_count" integer NOT NULL,
    "t" integer[] NOT NULL,
    "timer" integer[],
    "hr" smallint[],
    "speed" real[],
    "dist" real[],
    "alt" real[],
    "cadence" real[],
    "power" smallint[],
    "lat" real[],
    "lon" real[],
    "vosc" real[],
    "stance" real[],
    "vratio" real[],
    "step_len" real[],
    "temp" smallint[],
    "watch_laps" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "splits" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "watch_time_in_zone" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "device" "jsonb",
    "laps_version" integer DEFAULT 0 NOT NULL,
    "laps_edited" boolean DEFAULT false NOT NULL,
    "ai_allowed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "activity_streams_lengths" CHECK ((("cardinality"("t") = "sample_count") AND (("timer" IS NULL) OR ("cardinality"("timer") = "sample_count")) AND (("hr" IS NULL) OR ("cardinality"("hr") = "sample_count")) AND (("speed" IS NULL) OR ("cardinality"("speed") = "sample_count")) AND (("dist" IS NULL) OR ("cardinality"("dist") = "sample_count")) AND (("alt" IS NULL) OR ("cardinality"("alt") = "sample_count")) AND (("cadence" IS NULL) OR ("cardinality"("cadence") = "sample_count")) AND (("power" IS NULL) OR ("cardinality"("power") = "sample_count")) AND (("lat" IS NULL) OR ("cardinality"("lat") = "sample_count")) AND (("lon" IS NULL) OR ("cardinality"("lon") = "sample_count")) AND (("vosc" IS NULL) OR ("cardinality"("vosc") = "sample_count")) AND (("stance" IS NULL) OR ("cardinality"("stance") = "sample_count")) AND (("vratio" IS NULL) OR ("cardinality"("vratio") = "sample_count")) AND (("step_len" IS NULL) OR ("cardinality"("step_len") = "sample_count")) AND (("temp" IS NULL) OR ("cardinality"("temp") = "sample_count")))),
    CONSTRAINT "activity_streams_normalized_from_check" CHECK (("normalized_from" = ANY (ARRAY['fit'::"text", 'garmin_json'::"text", 'tcx'::"text", 'gpx'::"text"]))),
    CONSTRAINT "activity_streams_sample_count_check" CHECK (("sample_count" >= 0))
);


ALTER TABLE "public"."activity_streams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_zone_summaries" (
    "activity_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "source" "public"."data_source" NOT NULL,
    "model_id" "uuid",
    "kind" "text" NOT NULL,
    "bounds" smallint[] NOT NULL,
    "seconds" integer[] NOT NULL,
    "no_hr_s" integer DEFAULT 0 NOT NULL,
    "ai_allowed" boolean DEFAULT false NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_zone_summaries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "source" "public"."data_source" NOT NULL,
    "external_id" "text" NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "local_date" "date" NOT NULL,
    "sport" "text",
    "duration_s" integer,
    "distance_m" numeric(10,2),
    "elevation_gain_m" numeric(8,2),
    "avg_hr" smallint,
    "max_hr" smallint,
    "avg_pace_s_per_km" numeric(8,2),
    "calories" integer,
    "details" "jsonb",
    "raw" "jsonb",
    "ai_allowed" boolean DEFAULT false NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "device_name" "text",
    "title" "text",
    "description" "text",
    "rpe" smallint,
    "gear" "text",
    "commute" boolean,
    "origin_quality" "text",
    "sources" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "strava_activity_id" "text",
    CONSTRAINT "provider_activities_device_name_len" CHECK ((("device_name" IS NULL) OR (("char_length"("device_name") >= 1) AND ("char_length"("device_name") <= 120)))),
    CONSTRAINT "provider_activities_duration_sane" CHECK ((("duration_s" IS NULL) OR ("duration_s" > 0))),
    CONSTRAINT "provider_activities_hr_sane" CHECK ((("avg_hr" IS NULL) OR (("avg_hr" >= 20) AND ("avg_hr" <= 250)))),
    CONSTRAINT "provider_activities_merge_checks" CHECK (((("rpe" IS NULL) OR (("rpe" >= 1) AND ("rpe" <= 10))) AND (("title" IS NULL) OR ("length"("title") <= 300)) AND (("description" IS NULL) OR ("length"("description") <= 4000)) AND (("gear" IS NULL) OR ("length"("gear") <= 200)) AND (("origin_quality" IS NULL) OR ("origin_quality" = ANY (ARRAY['fit'::"text", 'tcx'::"text", 'gpx'::"text", 'summary'::"text"]))) AND ("sources" <@ ARRAY['garmin'::"text", 'coros'::"text", 'file'::"text", 'strava_archive'::"text", 'garmin_export'::"text", 'manual'::"text"]) AND (("strava_activity_id" IS NULL) OR ("strava_activity_id" ~ '^[0-9]{1,20}$'::"text"))))
);


ALTER TABLE "public"."provider_activities" OWNER TO "postgres";


COMMENT ON COLUMN "public"."provider_activities"."device_name" IS 'Modèle de l''appareil qui a enregistré l''activité, tel que transmis par le fournisseur (ex. « Forerunner 265 »). Sert à l''attribution « Garmin [modèle] » exigée par Garmin.';



CREATE OR REPLACE VIEW "public"."ai_provider_activities" WITH ("security_invoker"='true') AS
 SELECT "id",
    "athlete_id",
    "source",
    "external_id",
    "started_at",
    "local_date",
    "sport",
    "duration_s",
    "distance_m",
    "elevation_gain_m",
    "avg_hr",
    "max_hr",
    "avg_pace_s_per_km",
    "calories",
    "imported_at"
   FROM "public"."provider_activities"
  WHERE "ai_allowed";


ALTER VIEW "public"."ai_provider_activities" OWNER TO "postgres";


COMMENT ON VIEW "public"."ai_provider_activities" IS 'Activités utilisables par le chemin IA. Seule source de lecture autorisée pour un prompt : ne pas requêter provider_activities directement depuis un constructeur de prompt. Exclut details et raw — un payload brut de fournisseur peut contenir des champs qu''on n''a pas inventoriés.';



CREATE TABLE IF NOT EXISTS "public"."provider_dailies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "source" "public"."data_source" NOT NULL,
    "day" "date" NOT NULL,
    "resting_hr" smallint,
    "hrv_ms" numeric(6,2),
    "sleep_total_min" integer,
    "sleep_deep_min" integer,
    "sleep_rem_min" integer,
    "sleep_score" smallint,
    "steps" integer,
    "stress_avg" smallint,
    "body_battery_min" smallint,
    "body_battery_max" smallint,
    "vo2max" numeric(4,1),
    "training_load" numeric(8,2),
    "raw" "jsonb",
    "ai_allowed" boolean DEFAULT false NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hr_min" smallint,
    "hr_max" smallint,
    "hr_avg" smallint,
    "distance_m" real,
    "floors_climbed" smallint,
    "active_kcal" integer,
    "bmr_kcal" integer,
    "total_kcal" integer,
    "active_time_min" integer,
    "intensity_moderate_min" integer,
    "intensity_vigorous_min" integer,
    "stress_max" smallint,
    "stress_rest_min" integer,
    "stress_low_min" integer,
    "stress_medium_min" integer,
    "stress_high_min" integer,
    "stress_activity_min" integer,
    "body_battery_charged" smallint,
    "body_battery_drained" smallint,
    "sleep_light_min" integer,
    "sleep_awake_min" integer,
    "sleep_nap_min" integer,
    "sleep_start_at" timestamp with time zone,
    "sleep_end_at" timestamp with time zone,
    "sleep_subscores" "jsonb",
    "hrv_peak_5min_ms" numeric,
    "spo2_avg" real,
    "spo2_min" real,
    "respiration_sleep_avg" real,
    "respiration_day_avg" real,
    "skin_temp_delta_c" real,
    "vo2max_cycling" numeric,
    "fitness_age" smallint,
    "hydration_ml" integer,
    "weight_kg" real,
    "body_fat_pct" real,
    "bmi" real,
    "muscle_mass_kg" real,
    "bone_mass_kg" real,
    "body_water_pct" real,
    "bp_systolic" smallint,
    "bp_diastolic" smallint,
    "bp_pulse" smallint,
    CONSTRAINT "provider_dailies_rhr_sane" CHECK ((("resting_hr" IS NULL) OR (("resting_hr" >= 20) AND ("resting_hr" <= 150)))),
    CONSTRAINT "provider_dailies_sleep_sane" CHECK ((("sleep_total_min" IS NULL) OR (("sleep_total_min" >= 0) AND ("sleep_total_min" <= 1440))))
);


ALTER TABLE "public"."provider_dailies" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."ai_provider_dailies" WITH ("security_invoker"='true') AS
 SELECT "id",
    "athlete_id",
    "source",
    "day",
    "resting_hr",
    "hrv_ms",
    "sleep_total_min",
    "sleep_deep_min",
    "sleep_rem_min",
    "sleep_score",
    "steps",
    "stress_avg",
    "body_battery_min",
    "body_battery_max",
    "vo2max",
    "training_load",
    "imported_at"
   FROM "public"."provider_dailies"
  WHERE "ai_allowed";


ALTER VIEW "public"."ai_provider_dailies" OWNER TO "postgres";


COMMENT ON VIEW "public"."ai_provider_dailies" IS 'Données quotidiennes utilisables par le chemin IA. Mêmes règles que ai_provider_activities.';



CREATE TABLE IF NOT EXISTS "public"."app_data" (
    "athlete_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid" NOT NULL,
    "kind" "text" DEFAULT 'bug'::"text" NOT NULL,
    "content" "text" NOT NULL,
    "page" "text",
    "user_agent" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_feedback_content_check" CHECK ((("char_length"("content") >= 1) AND ("char_length"("content") <= 4000))),
    CONSTRAINT "app_feedback_kind_check" CHECK (("kind" = ANY (ARRAY['bug'::"text", 'idea'::"text", 'other'::"text"]))),
    CONSTRAINT "app_feedback_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'in_progress'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."app_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_update_reads" (
    "user_id" "uuid" NOT NULL,
    "update_id" "text" NOT NULL,
    "seen_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_update_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."athlete_claims" (
    "athlete_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."athlete_claims" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."athlete_co_coaches" (
    "athlete_id" "uuid" NOT NULL,
    "co_coach_id" "uuid" NOT NULL,
    "added_by" "uuid",
    "added_by_role" "text" NOT NULL,
    "hidden" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "athlete_co_coaches_added_by_role_check" CHECK (("added_by_role" = ANY (ARRAY['coach'::"text", 'athlete'::"text"])))
);


ALTER TABLE "public"."athlete_co_coaches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."athlete_test_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "test_definition_id" "uuid" NOT NULL,
    "performed_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "feeling" smallint,
    "comment" "text",
    CONSTRAINT "athlete_test_results_comment_len" CHECK ((("comment" IS NULL) OR ("length"("comment") <= 1000))),
    CONSTRAINT "athlete_test_results_feeling_check" CHECK ((("feeling" IS NULL) OR (("feeling" >= 1) AND ("feeling" <= 5))))
);


ALTER TABLE "public"."athlete_test_results" OWNER TO "postgres";


COMMENT ON COLUMN "public"."athlete_test_results"."feeling" IS 'Ressenti de l''athlète : 1 = très dur … 5 = facile';



COMMENT ON COLUMN "public"."athlete_test_results"."comment" IS 'Mot de l''athlète sur ce test';



CREATE TABLE IF NOT EXISTS "public"."athlete_test_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "result_id" "uuid" NOT NULL,
    "variable_id" "uuid" NOT NULL,
    "value" numeric NOT NULL
);


ALTER TABLE "public"."athlete_test_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_variables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "test_definition_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "value_type" "text" DEFAULT 'number'::"text" NOT NULL,
    "better_when" "text" DEFAULT 'higher'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "extrap_metric" "text",
    "extrap_op" "text",
    "extrap_factor" numeric,
    CONSTRAINT "test_variables_better_when_check" CHECK (("better_when" = ANY (ARRAY['higher'::"text", 'lower'::"text"]))),
    CONSTRAINT "test_variables_extrap_op_check" CHECK (("extrap_op" = ANY (ARRAY['div'::"text", 'mul'::"text"]))),
    CONSTRAINT "test_variables_value_type_check" CHECK (("value_type" = ANY (ARRAY['number'::"text", 'pace'::"text", 'duration'::"text", 'scale5'::"text"])))
);


ALTER TABLE "public"."test_variables" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."athlete_current_values" WITH ("security_invoker"='true') AS
 WITH "ranked" AS (
         SELECT "atr"."athlete_id",
            "tv"."id" AS "variable_id",
            "tv"."key",
            "tv"."label",
            "tv"."unit",
            "tv"."value_type",
            "tv"."better_when",
            "atv"."value",
            "atr"."performed_at",
            "row_number"() OVER (PARTITION BY "atr"."athlete_id", "tv"."id" ORDER BY
                CASE
                    WHEN ("tv"."better_when" = 'higher'::"text") THEN "atv"."value"
                    ELSE NULL::numeric
                END DESC NULLS LAST,
                CASE
                    WHEN ("tv"."better_when" = 'lower'::"text") THEN (- "atv"."value")
                    ELSE NULL::numeric
                END DESC NULLS LAST, "atr"."performed_at" DESC) AS "rn"
           FROM (("public"."athlete_test_values" "atv"
             JOIN "public"."athlete_test_results" "atr" ON (("atr"."id" = "atv"."result_id")))
             JOIN "public"."test_variables" "tv" ON (("tv"."id" = "atv"."variable_id")))
        )
 SELECT "athlete_id",
    "variable_id",
    "key",
    "label",
    "unit",
    "value_type",
    "better_when",
    "value" AS "current_value",
    "performed_at" AS "best_performed_at"
   FROM "ranked"
  WHERE ("rn" = 1);


ALTER VIEW "public"."athlete_current_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."athlete_life_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "date_start" "date" NOT NULL,
    "date_end" "date" NOT NULL,
    "title" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "text" DEFAULT 'autre'::"text" NOT NULL,
    "location" "text",
    "unavailable" boolean DEFAULT true NOT NULL,
    CONSTRAINT "athlete_life_events_kind_check" CHECK (("kind" = ANY (ARRAY['stage'::"text", 'voyage'::"text", 'examen'::"text", 'autre'::"text"]))),
    CONSTRAINT "athlete_life_events_location_len" CHECK ((("location" IS NULL) OR ("length"("location") <= 200)))
);


ALTER TABLE "public"."athlete_life_events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."athlete_life_events"."kind" IS 'stage | voyage | examen | autre';



COMMENT ON COLUMN "public"."athlete_life_events"."unavailable" IS 'L''athlète ne peut pas s''entraîner ces jours-là';



CREATE TABLE IF NOT EXISTS "public"."athlete_profile_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "label" "text" NOT NULL,
    "rating" numeric,
    "note" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "athlete_profile_items_category_check" CHECK (("category" = ANY (ARRAY['bilan_articulaire'::"text", 'endurance'::"text", 'force'::"text", 'explosivite'::"text", 'vitesse'::"text"])))
);


ALTER TABLE "public"."athlete_profile_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."athlete_staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "profession" "text" NOT NULL,
    "permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "can_edit_coach_content" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "added_by" "uuid",
    "added_by_role" "text" NOT NULL,
    "athlete_notified_at" timestamp with time zone,
    "coach_notified_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "revoked_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "athlete_staff_added_by_role_check" CHECK (("added_by_role" = ANY (ARRAY['coach'::"text", 'athlete'::"text"]))),
    CONSTRAINT "athlete_staff_check" CHECK (("athlete_id" <> "staff_id")),
    CONSTRAINT "athlete_staff_profession_check" CHECK (("profession" = ANY (ARRAY['kine'::"text", 'osteo'::"text", 'coach_adjoint'::"text", 'nutritionniste'::"text", 'prepa_mentale'::"text", 'medecin'::"text", 'autre'::"text"]))),
    CONSTRAINT "athlete_staff_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."athlete_staff" OWNER TO "postgres";


COMMENT ON TABLE "public"."athlete_staff" IS 'Lien pro ↔ athlète. Créé uniquement par accept_staff_invitation(). Jamais supprimé physiquement (révocation = status revoked), sauf effacement du compte (cascade).';



CREATE TABLE IF NOT EXISTS "public"."body_weight_goals" (
    "athlete_id" "uuid" NOT NULL,
    "reference_kg" numeric,
    "target_kg" numeric,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "body_weight_goals_reference_kg_check" CHECK ((("reference_kg" > (0)::numeric) AND ("reference_kg" < (500)::numeric))),
    CONSTRAINT "body_weight_goals_target_kg_check" CHECK ((("target_kg" > (0)::numeric) AND ("target_kg" < (500)::numeric)))
);


ALTER TABLE "public"."body_weight_goals" OWNER TO "postgres";


COMMENT ON TABLE "public"."body_weight_goals" IS 'Poids de référence et objectif. Étape 1 : projection d''app_data asp:bw. docs/SANTE_TABLES.md';



CREATE TABLE IF NOT EXISTS "public"."body_weight_logs" (
    "athlete_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "kg" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "body_weight_logs_kg_check" CHECK ((("kg" > (0)::numeric) AND ("kg" < (500)::numeric)))
);


ALTER TABLE "public"."body_weight_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."body_weight_logs" IS 'Pesées, une par athlète et par jour. Étape 1 : projection d''app_data asp:wlog. docs/SANTE_TABLES.md';



CREATE TABLE IF NOT EXISTS "public"."body_weight_milestones" (
    "athlete_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "kg" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "body_weight_milestones_kg_check" CHECK ((("kg" > (0)::numeric) AND ("kg" < (500)::numeric)))
);


ALTER TABLE "public"."body_weight_milestones" OWNER TO "postgres";


COMMENT ON TABLE "public"."body_weight_milestones" IS 'Paliers de poids franchis. Étape 1 : projection d''app_data asp:wmile. docs/SANTE_TABLES.md';



CREATE TABLE IF NOT EXISTS "public"."citation_likes" (
    "user_id" "uuid" NOT NULL,
    "quote_id" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "citation_likes_quote_id_check" CHECK ((("quote_id" >= 1) AND ("quote_id" <= 365)))
);


ALTER TABLE "public"."citation_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."citation_stats" (
    "quote_id" smallint NOT NULL,
    "likes" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "citation_stats_likes_check" CHECK (("likes" >= 0)),
    CONSTRAINT "citation_stats_quote_id_check" CHECK ((("quote_id" >= 1) AND ("quote_id" <= 365)))
);


ALTER TABLE "public"."citation_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_api_access_log" (
    "id" bigint NOT NULL,
    "key_id" "uuid",
    "coach_id" "uuid" NOT NULL,
    "athlete_id" "uuid",
    "route" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_api_access_log_route_check" CHECK (("char_length"("route") <= 80))
);


ALTER TABLE "public"."coach_api_access_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."coach_api_access_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."coach_api_access_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."coach_api_access_log_id_seq" OWNED BY "public"."coach_api_access_log"."id";



CREATE TABLE IF NOT EXISTS "public"."coach_api_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "key_id" "uuid",
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "ops" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    "base_hash" "text",
    "undo" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "applied_via" "text",
    "undone_at" timestamp with time zone,
    CONSTRAINT "coach_api_drafts_applied_via_check" CHECK (("applied_via" = ANY (ARRAY['app'::"text", 'api'::"text"]))),
    CONSTRAINT "coach_api_drafts_base_hash_check" CHECK ((("base_hash" IS NULL) OR ("base_hash" ~ '^[0-9a-f]{64}$'::"text"))),
    CONSTRAINT "coach_api_drafts_body_check" CHECK (("char_length"("body") <= 4000)),
    CONSTRAINT "coach_api_drafts_kind_check" CHECK (("kind" = ANY (ARRAY['axe'::"text", 'programme'::"text", 'planning'::"text", 'objectifs'::"text", 'semaine'::"text", 'plan'::"text"]))),
    CONSTRAINT "coach_api_drafts_ops_check" CHECK (("jsonb_typeof"("ops") = 'array'::"text")),
    CONSTRAINT "coach_api_drafts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'applied'::"text", 'rejected'::"text", 'undone'::"text"]))),
    CONSTRAINT "coach_api_drafts_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 120))),
    CONSTRAINT "coach_api_drafts_undo_check" CHECK (("jsonb_typeof"("undo") = 'array'::"text"))
);


ALTER TABLE "public"."coach_api_drafts" OWNER TO "postgres";


COMMENT ON TABLE "public"."coach_api_drafts" IS 'Propositions déposées par l''assistant IA d''un coach. Rien n''atteint l''athlète tant que le coach n''a pas appliqué. L''athlète ne les voit pas.';



COMMENT ON COLUMN "public"."coach_api_drafts"."base_hash" IS 'SHA-256 du JSON de asp:prog (programme, planning) ou asp:goals (objectifs) au moment de la proposition. Différent au moment d''appliquer = le coach est prévenu que la cible a changé.';



CREATE TABLE IF NOT EXISTS "public"."coach_api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "coach_api_keys_key_hash_check" CHECK (("key_hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "coach_api_keys_key_prefix_check" CHECK (("char_length"("key_prefix") <= 16)),
    CONSTRAINT "coach_api_keys_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 60)))
);


ALTER TABLE "public"."coach_api_keys" OWNER TO "postgres";


COMMENT ON TABLE "public"."coach_api_keys" IS 'Clés API personnelles des coachs, pour leur assistant IA. Seul le hash SHA-256 est stocké. Jamais supprimées : une clé révoquée reste, pour relier le journal d''accès à quelque chose.';



CREATE TABLE IF NOT EXISTS "public"."coach_api_rate" (
    "key_id" "uuid" NOT NULL,
    "window_start" timestamp with time zone NOT NULL,
    "hits" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."coach_api_rate" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."competitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "planning_block_id" "uuid",
    "season_id" "uuid",
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'competition'::"text" NOT NULL,
    "date" "date" NOT NULL,
    "location" "text",
    "notes" "text",
    "priority" "text" DEFAULT 'A'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "macrocycle_id" "uuid",
    "athlete_comment" "text",
    "date_end" "date",
    CONSTRAINT "competitions_date_end_check" CHECK ((("date_end" IS NULL) OR ("date_end" >= "date")))
);


ALTER TABLE "public"."competitions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."competitions"."athlete_comment" IS 'Visible par l''athlète et son coach via RLS existantes';



COMMENT ON COLUMN "public"."competitions"."date_end" IS 'Dernier jour d''une compétition sur plusieurs jours (null = un jour)';



CREATE TABLE IF NOT EXISTS "public"."user_consents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "purpose" "public"."consent_purpose" NOT NULL,
    "granted" boolean NOT NULL,
    "doc_version" "text" NOT NULL,
    "statement" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "seq" bigint NOT NULL
);


ALTER TABLE "public"."user_consents" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_consents" IS 'Journal append-only des consentements RGPD. Jamais de UPDATE ni de DELETE : un retrait est un INSERT avec granted = false.';



COMMENT ON COLUMN "public"."user_consents"."statement" IS 'Libellé exact affiché à l''utilisateur, archivé pour la charge de la preuve (art. 7.1 RGPD).';



COMMENT ON COLUMN "public"."user_consents"."seq" IS 'Ordre d''arrivée dans le journal. Clé d''ordre de current_consents : created_at vaut now(), identique pour deux lignes d''une même transaction, donc insuffisant pour départager.';



CREATE OR REPLACE VIEW "public"."current_consents" WITH ("security_invoker"='true') AS
 SELECT DISTINCT ON ("user_id", "purpose") "user_id",
    "purpose",
    "granted",
    "doc_version",
    "created_at" AS "decided_at"
   FROM "public"."user_consents"
  ORDER BY "user_id", "purpose", "seq" DESC;


ALTER VIEW "public"."current_consents" OWNER TO "postgres";


COMMENT ON VIEW "public"."current_consents" IS 'Dernière décision par finalité. Ordonnée par seq et non par created_at : deux décisions d''une même transaction partagent le même created_at, ce qui rendait la décision courante indéterminée.';



CREATE TABLE IF NOT EXISTS "public"."data_source_policies" (
    "source" "public"."data_source" NOT NULL,
    "ai_allowed" boolean NOT NULL,
    "coach_visible" boolean NOT NULL,
    "notes" "text" NOT NULL,
    "consent_purpose" "public"."consent_purpose",
    CONSTRAINT "data_source_policies_consent_required" CHECK ((("consent_purpose" IS NOT NULL) OR ("source" = ANY (ARRAY['file_import'::"public"."data_source", 'manual'::"public"."data_source"]))))
);


ALTER TABLE "public"."data_source_policies" OWNER TO "postgres";


COMMENT ON COLUMN "public"."data_source_policies"."consent_purpose" IS 'Finalité de consentement exigée pour cette source (user_consents.purpose). NULL = aucun accord supplémentaire : réservé aux données fournies par l''athlète lui-même (file_import, manual), imposé par contrainte.';



CREATE TABLE IF NOT EXISTS "public"."day_themes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "intensity" "text",
    "dominante" "text",
    "color" "text" DEFAULT '#3b82f6'::"text" NOT NULL,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "text" GENERATED ALWAYS AS (
CASE
    WHEN (("label" IS NOT NULL) AND ("btrim"("label") <> ''::"text")) THEN 'libre'::"text"
    WHEN ("dominante" IS NOT NULL) THEN 'dominante'::"text"
    WHEN ("intensity" IS NOT NULL) THEN 'intensite'::"text"
    ELSE NULL::"text"
END) STORED,
    CONSTRAINT "day_themes_color_chk" CHECK (("color" ~ '^#[0-9a-f]{6}$'::"text")),
    CONSTRAINT "day_themes_dominante_chk" CHECK ((("dominante" IS NULL) OR ("dominante" = ANY (ARRAY['force'::"text", 'puissance_vitesse'::"text", 'volume'::"text", 'aerobie'::"text", 'seuil'::"text", 'hyrox'::"text", 'technique'::"text", 'mixte'::"text"])))),
    CONSTRAINT "day_themes_intensity_chk" CHECK ((("intensity" IS NULL) OR ("intensity" = ANY (ARRAY['hard'::"text", 'moyen'::"text", 'easy'::"text", 'recup_active'::"text", 'repos'::"text"])))),
    CONSTRAINT "day_themes_label_len" CHECK (("char_length"("label") <= 40)),
    CONSTRAINT "day_themes_note_len" CHECK (("char_length"("note") <= 500))
);


ALTER TABLE "public"."day_themes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."day_themes"."kind" IS 'Nature du thème (intensite | dominante | libre), dérivée de label/intensity/dominante. Lecture seule : miroir SQL de dayThemeKind() dans src/lib/dayTheme.ts.';



CREATE TABLE IF NOT EXISTS "public"."doc_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doc_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "source" "text" NOT NULL,
    "coach_note" "text",
    "seen_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "doc_assignments_source_check" CHECK (("source" = ANY (ARRAY['manuel'::"text", 'programme'::"text", 'energie'::"text"])))
);


ALTER TABLE "public"."doc_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."doc_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doc_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "image_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."doc_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."doc_schedule" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doc_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "added_by" "uuid" DEFAULT "auth"."uid"(),
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "doc_schedule_note_check" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 500)))
);


ALTER TABLE "public"."doc_schedule" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."docs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "athlete_id" "uuid",
    "uploaded_by" "uuid",
    "origin_id" "uuid",
    "variant_label" "text",
    "variant_order" smallint DEFAULT 0 NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text" DEFAULT 'autre'::"text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "kind" "text" DEFAULT 'pdf'::"text" NOT NULL,
    "file_path" "text",
    "file_size" integer,
    "mime_type" "text",
    "is_self_service" boolean DEFAULT false NOT NULL,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "docs_category_check" CHECK (("category" = ANY (ARRAY['mobilite'::"text", 'pacing'::"text", 'prevention'::"text", 'recuperation'::"text", 'nutrition'::"text", 'education'::"text", 'questionnaire'::"text", 'autre'::"text"]))),
    CONSTRAINT "docs_file_required" CHECK ((("kind" = 'questionnaire'::"text") OR ("file_path" IS NOT NULL))),
    CONSTRAINT "docs_kind_check" CHECK (("kind" = ANY (ARRAY['pdf'::"text", 'image'::"text", 'questionnaire'::"text"]))),
    CONSTRAINT "docs_self_service_bank_only" CHECK (((NOT "is_self_service") OR ("athlete_id" IS NULL)))
);


ALTER TABLE "public"."docs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."energy_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "session_kind" "text" NOT NULL,
    "custom_kind" "text",
    "structure_type" "text" NOT NULL,
    "intervals" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "total_duration_s" integer,
    "total_distance_m" integer,
    "notes" "text",
    "created_by" "uuid",
    "is_verified" boolean DEFAULT false NOT NULL,
    "verified_by" "uuid",
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_public" boolean DEFAULT false NOT NULL,
    "athlete_id" "uuid",
    "parent_session_id" "uuid",
    "modality" "text",
    "schema" "jsonb",
    "sport_id" "uuid",
    "quality_id" "uuid",
    "format" "text" DEFAULT 'wod'::"text" NOT NULL,
    "classique_structure" "jsonb",
    "images" "jsonb",
    "fiches" "jsonb",
    "archived_at" timestamp with time zone,
    CONSTRAINT "energy_sessions_custom_kind_check" CHECK ((("session_kind" <> 'custom'::"text") OR ("custom_kind" IS NOT NULL))),
    CONSTRAINT "energy_sessions_format_check" CHECK ((("format" = ANY (ARRAY['wod'::"text", 'classique'::"text"])) AND (("format" = 'wod'::"text") OR ("session_kind" = 'specifique'::"text")))),
    CONSTRAINT "energy_sessions_kind_check" CHECK (("session_kind" = ANY (ARRAY['vo2'::"text", 'tempo'::"text", 'seuil'::"text", 'footing'::"text", 'fartlek'::"text", 'autre'::"text", 'custom'::"text", 'specifique'::"text"]))),
    CONSTRAINT "energy_sessions_modality_check" CHECK ((("modality" IS NULL) OR ("modality" = ANY (ARRAY['course'::"text", 'velo'::"text", 'natation'::"text", 'rameur'::"text", 'autre'::"text"])))),
    CONSTRAINT "energy_sessions_structure_check" CHECK (("structure_type" = ANY (ARRAY['continu'::"text", 'fractionne'::"text"])))
);


ALTER TABLE "public"."energy_sessions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."energy_sessions"."modality" IS 'Sport : course (défaut si null), velo, natation, rameur, autre. Détermine le sport Garmin.';



COMMENT ON COLUMN "public"."energy_sessions"."schema" IS 'Optional field schema drawing';



COMMENT ON COLUMN "public"."energy_sessions"."images" IS 'Array of {url, caption?} for session illustration photos';



CREATE TABLE IF NOT EXISTS "public"."exercise_pr_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "exercise_ref" "text" NOT NULL,
    "kg" numeric(6,2) NOT NULL,
    "date" "date" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_reps" integer,
    "source_kg" numeric(6,2)
);


ALTER TABLE "public"."exercise_pr_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "target" "text",
    "secondary" "text"[],
    "bloc" "text",
    "ex_type" "text" DEFAULT 'muscu'::"text",
    "tier" integer DEFAULT 3,
    "youtube_id" "text",
    "image_url" "text",
    "pdf_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "instructions" "text",
    "tips" "text",
    "equipment" "text",
    "difficulty" "text",
    "is_compound" boolean DEFAULT true,
    "is_unilateral" boolean DEFAULT false,
    "gif_url" "text",
    "is_public" boolean DEFAULT true,
    "is_verified" boolean DEFAULT false,
    "created_by" "uuid",
    "target_2" "text",
    "garmin_category" "text",
    "garmin_exercise" "text",
    CONSTRAINT "exercises_garmin_pair" CHECK ((("garmin_category" IS NULL) = ("garmin_exercise" IS NULL)))
);


ALTER TABLE "public"."exercises" OWNER TO "postgres";


COMMENT ON COLUMN "public"."exercises"."target_2" IS '2e muscle principal facultatif (compte 1 série, comme target).';



COMMENT ON COLUMN "public"."exercises"."garmin_category" IS 'Catégorie Garmin (Training API, exerciseCategory) ; avec garmin_exercise, ou les deux à null.';



COMMENT ON COLUMN "public"."exercises"."garmin_exercise" IS 'Exercice Garmin (Training API, exerciseName) ; null = envoyé sous le nom Agon seulement.';



CREATE TABLE IF NOT EXISTS "public"."habit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "habit_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "date" "date" NOT NULL
);


ALTER TABLE "public"."habit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."habits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "emoji" "text" DEFAULT '💪'::"text" NOT NULL,
    "color" "text" DEFAULT '#F5A623'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    "sort_order" integer,
    "created_by" "uuid"
);


ALTER TABLE "public"."habits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."health_sync_errors" (
    "id" bigint NOT NULL,
    "athlete_id" "uuid",
    "key" "text" NOT NULL,
    "sqlstate" "text",
    "constraint_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."health_sync_errors" OWNER TO "postgres";


ALTER TABLE "public"."health_sync_errors" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."health_sync_errors_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."hr_zone_models" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "bounds" smallint[],
    "valid_from" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "origin" "text" DEFAULT 'manual'::"text" NOT NULL,
    "test_result_id" "uuid",
    "created_by" "uuid",
    "decided_by" "uuid",
    "decided_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "refs_day" "date",
    CONSTRAINT "hr_zone_models_bounds" CHECK (((("kind" = 'five'::"text") AND ("bounds" IS NULL)) OR (("kind" = 'three'::"text") AND ("cardinality"("bounds") = 2)) OR (("kind" = 'custom'::"text") AND (("cardinality"("bounds") >= 1) AND ("cardinality"("bounds") <= 9))))),
    CONSTRAINT "hr_zone_models_bounds_valid" CHECK ("public"."hr_bounds_valid"("bounds")),
    CONSTRAINT "hr_zone_models_kind_check" CHECK (("kind" = ANY (ARRAY['five'::"text", 'three'::"text", 'custom'::"text"]))),
    CONSTRAINT "hr_zone_models_origin_check" CHECK (("origin" = ANY (ARRAY['manual'::"text", 'test'::"text"]))),
    CONSTRAINT "hr_zone_models_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'proposed'::"text", 'rejected'::"text", 'replaced'::"text"])))
);


ALTER TABLE "public"."hr_zone_models" OWNER TO "postgres";


COMMENT ON COLUMN "public"."hr_zone_models"."refs_day" IS 'Modèle five appliqué au passé : les références FCzone_* sont lues à cette date pour toutes les séances.';



CREATE TABLE IF NOT EXISTS "public"."hyrox_axes_params" (
    "version" "text" NOT NULL,
    "params" "jsonb" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hyrox_axes_params" OWNER TO "postgres";


COMMENT ON TABLE "public"."hyrox_axes_params" IS 'Paramètres du plan de bloc : seuils de gain (gros / moyen), décalage par la note, niveaux aux stations, prépa courte, âge, Roxzone.';



CREATE TABLE IF NOT EXISTS "public"."hyrox_race_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "competition_id" "uuid",
    "result_id" "uuid",
    "created_by" "uuid",
    "name" "text" NOT NULL,
    "division" "text" NOT NULL,
    "profile" "text" DEFAULT 'hybrid'::"text" NOT NULL,
    "target_total_s" integer NOT NULL,
    "targets" "jsonb" NOT NULL,
    "predicted_total_s" integer,
    "predicted_high_s" integer,
    "predicted_from" "jsonb",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hyrox_race_plans_profile_check" CHECK (("profile" = ANY (ARRAY['runner'::"text", 'hybrid'::"text", 'powerhouse'::"text"]))),
    CONSTRAINT "hyrox_race_plans_target_total_s_check" CHECK (("target_total_s" > 0))
);


ALTER TABLE "public"."hyrox_race_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hyrox_reference_segments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "division" "text" NOT NULL,
    "bracket" "text" DEFAULT 'all'::"text" NOT NULL,
    "segment" "text" NOT NULL,
    "p10_s" integer,
    "p50_s" integer NOT NULL,
    "p90_s" integer,
    "source" "text" NOT NULL,
    "is_estimate" boolean DEFAULT false NOT NULL,
    "p25_s" integer,
    "p75_s" integer,
    "sample_size" integer,
    "p1_s" integer,
    "p5_s" integer
);


ALTER TABLE "public"."hyrox_reference_segments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hyrox_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "competition_id" "uuid",
    "created_by" "uuid",
    "date" "date" NOT NULL,
    "event_name" "text" NOT NULL,
    "venue" "text",
    "format" "text" DEFAULT 'solo'::"text" NOT NULL,
    "division" "text" NOT NULL,
    "age_group" "text",
    "is_official" boolean DEFAULT true NOT NULL,
    "status" "text" DEFAULT 'finished'::"text" NOT NULL,
    "total_s" integer NOT NULL,
    "run_1_s" integer,
    "run_2_s" integer,
    "run_3_s" integer,
    "run_4_s" integer,
    "run_5_s" integer,
    "run_6_s" integer,
    "run_7_s" integer,
    "run_8_s" integer,
    "ski_s" integer,
    "sled_push_s" integer,
    "sled_pull_s" integer,
    "bbj_s" integer,
    "row_s" integer,
    "farmers_s" integer,
    "lunges_s" integer,
    "wall_balls_s" integer,
    "roxzone_total_s" integer,
    "roxzone_splits" "jsonb",
    "penalties_s" integer DEFAULT 0 NOT NULL,
    "penalties_note" "text",
    "rank_overall" integer,
    "rank_age_group" integer,
    "participants_overall" integer,
    "participants_age_group" integer,
    "activity_url" "text",
    "athlete_comment" "text",
    "coach_comment" "text",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "top_pct_overall" numeric(5,2),
    "roxzone_rank" integer,
    "roxzone_top_pct" numeric(5,2),
    "roxzone_cause" "text",
    CONSTRAINT "hyrox_results_division_check" CHECK (("division" = ANY (ARRAY['women'::"text", 'women_pro'::"text", 'men'::"text", 'men_pro'::"text", 'doubles_women'::"text", 'doubles_men'::"text", 'doubles_mixed'::"text", 'doubles_women_pro'::"text", 'doubles_men_pro'::"text", 'relay_women'::"text", 'relay_men'::"text", 'relay_mixed'::"text", 'adaptive'::"text"]))),
    CONSTRAINT "hyrox_results_format_check" CHECK (("format" = ANY (ARRAY['solo'::"text", 'doubles'::"text", 'relay'::"text", 'sim_full'::"text", 'sim_34'::"text", 'sim_half'::"text"]))),
    CONSTRAINT "hyrox_results_roxzone_cause_check" CHECK (("roxzone_cause" = ANY (ARRAY['marche'::"text", 'orga'::"text", 'site'::"text"]))),
    CONSTRAINT "hyrox_results_roxzone_rank_check" CHECK (("roxzone_rank" > 0)),
    CONSTRAINT "hyrox_results_roxzone_top_pct_check" CHECK ((("roxzone_top_pct" >= (0)::numeric) AND ("roxzone_top_pct" <= (100)::numeric))),
    CONSTRAINT "hyrox_results_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'import'::"text"]))),
    CONSTRAINT "hyrox_results_status_check" CHECK (("status" = ANY (ARRAY['finished'::"text", 'dnf'::"text", 'dns'::"text", 'dq'::"text"]))),
    CONSTRAINT "hyrox_results_top_pct_overall_check" CHECK ((("top_pct_overall" >= (0)::numeric) AND ("top_pct_overall" <= (100)::numeric))),
    CONSTRAINT "hyrox_results_total_s_check" CHECK (("total_s" > 0))
);


ALTER TABLE "public"."hyrox_results" OWNER TO "postgres";


COMMENT ON COLUMN "public"."hyrox_results"."top_pct_overall" IS 'Top % au classement final de cette course (sinon déduit de rank_overall / participants_overall).';



COMMENT ON COLUMN "public"."hyrox_results"."roxzone_top_pct" IS 'Top % en Roxzone dans la même course. Perte réelle si ≥ 15 points sous le top % final et Roxzone > 110 % du run moyen (runs 2-7).';



COMMENT ON COLUMN "public"."hyrox_results"."roxzone_cause" IS 'Cause d''une perte en Roxzone : marche (après les stations), orga (transitions), site (grand site).';



CREATE TABLE IF NOT EXISTS "public"."hyrox_test_analyses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "date" "date" NOT NULL,
    "source_result_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "inputs" "jsonb" NOT NULL,
    "profile" "jsonb" NOT NULL,
    "outputs" "jsonb" NOT NULL,
    "algo_version" "text" NOT NULL,
    "grid_version" "text" NOT NULL,
    "target_s" integer,
    "axes_validated" "jsonb",
    "validated_at" timestamp with time zone,
    "validated_by" "uuid",
    "recalculated_from" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hyrox_test_analyses_check" CHECK ((("validated_at" IS NULL) OR ("axes_validated" IS NOT NULL))),
    CONSTRAINT "hyrox_test_analyses_kind_check" CHECK (("kind" = ANY (ARRAY['bilan'::"text", 'retest'::"text"]))),
    CONSTRAINT "hyrox_test_analyses_target_s_check" CHECK (("target_s" > 0))
);


ALTER TABLE "public"."hyrox_test_analyses" OWNER TO "postgres";


COMMENT ON TABLE "public"."hyrox_test_analyses" IS 'Analyse d''un bilan ou d''un retest HYROX. inputs / profile / outputs / versions figés à la création ; recalculer = nouvelle ligne. Visible par l''athlète seulement après validation du coach.';



CREATE TABLE IF NOT EXISTS "public"."hyrox_test_axes_drafts" (
    "analysis_id" "uuid" NOT NULL,
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "axes_plan" "jsonb",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hyrox_test_axes_drafts" OWNER TO "postgres";


COMMENT ON TABLE "public"."hyrox_test_axes_drafts" IS 'Proposition du moteur et contexte de l''athlète (compétition, cas types, douleur, envie, Roxzone). Jamais visible par l''athlète : il ne voit que hyrox_test_analyses.axes_validated.';



CREATE TABLE IF NOT EXISTS "public"."hyrox_test_grid_versions" (
    "version" "text" NOT NULL,
    "active" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hyrox_test_grid_versions" OWNER TO "postgres";


COMMENT ON TABLE "public"."hyrox_test_grid_versions" IS 'Une version = un jeu complet (grilles, paramètres course, paramètres d''axes, règles). Une seule version active : celle des nouvelles analyses.';



CREATE TABLE IF NOT EXISTS "public"."hyrox_test_grids" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version" "text" NOT NULL,
    "metric_key" "text" NOT NULL,
    "axis" "text" NOT NULL,
    "sex" "text",
    "category" "text",
    "thresholds" numeric[] NOT NULL,
    "direction" "text" NOT NULL,
    "source" "text" NOT NULL,
    "weight" numeric DEFAULT 1 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hyrox_test_grids_axis_check" CHECK (("axis" = ANY (ARRAY['cardio'::"text", 'seuils'::"text", 'ergos'::"text", 'force'::"text", 'endf'::"text", 'puissance'::"text", 'grip'::"text", 'robustesse'::"text"]))),
    CONSTRAINT "hyrox_test_grids_category_check" CHECK (("category" = ANY (ARRAY['Open'::"text", 'Pro'::"text"]))),
    CONSTRAINT "hyrox_test_grids_direction_check" CHECK (("direction" = ANY (ARRAY['higher'::"text", 'lower'::"text"]))),
    CONSTRAINT "hyrox_test_grids_sex_check" CHECK (("sex" = ANY (ARRAY['H'::"text", 'F'::"text"]))),
    CONSTRAINT "hyrox_test_grids_source_check" CHECK (("source" = ANY (ARRAY['publiée'::"text", 'calée chrono'::"text", 'ma méthode'::"text", 'méthode vitesse critique / Riegel'::"text"]))),
    CONSTRAINT "hyrox_test_grids_thresholds_check" CHECK (("array_length"("thresholds", 1) = 4)),
    CONSTRAINT "hyrox_test_grids_weight_check" CHECK (("weight" >= (0)::numeric))
);


ALTER TABLE "public"."hyrox_test_grids" OWNER TO "postgres";


COMMENT ON TABLE "public"."hyrox_test_grids" IS 'Grilles de notes 1 à 5 : 4 bornes par mesure. sex / category NULL = tous.';



CREATE TABLE IF NOT EXISTS "public"."hyrox_test_params" (
    "version" "text" NOT NULL,
    "scope" "text" NOT NULL,
    "params" "jsonb" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hyrox_test_params_scope_check" CHECK (("scope" = ANY (ARRAY['scoring'::"text", 'running'::"text"])))
);


ALTER TABLE "public"."hyrox_test_params" OWNER TO "postgres";


COMMENT ON TABLE "public"."hyrox_test_params" IS 'Paramètres versionnés : scoring (VMA, Cooper, 1RM, plafonds robustesse) et running (coefficients du seuil 1, bornes des zones, FC seuil, profil, % VC).';



CREATE TABLE IF NOT EXISTS "public"."hyrox_work_axes_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version" "text" NOT NULL,
    "rule_key" "text" NOT NULL,
    "step" "text" NOT NULL,
    "group_name" "text" NOT NULL,
    "metric_key" "text",
    "condition" "jsonb" NOT NULL,
    "axis" "text" NOT NULL,
    "means" "text" NOT NULL,
    "rationale" "text" NOT NULL,
    "to_recalibrate" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hyrox_work_axes_rules_step_check" CHECK (("step" = ANY (ARRAY['sécurité'::"text", 'course'::"text", 'stations'::"text"])))
);


ALTER TABLE "public"."hyrox_work_axes_rules" OWNER TO "postgres";


COMMENT ON TABLE "public"."hyrox_work_axes_rules" IS 'Règles d''axes de travail validées par Hugo le 31/10/2026. condition : {metric, op, value} ou {all|any: [...]} ; value peut être {H, F}. to_recalibrate = seuil sans source.';



CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "token" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "email" "text",
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."macrocycles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "coach_id" "uuid",
    "name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "objective" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "macrocycles_dates" CHECK (("end_date" > "start_date"))
);


ALTER TABLE "public"."macrocycles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."measurement_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "weight_kg" numeric,
    "bras" numeric,
    "epaules" numeric,
    "poitrine" numeric,
    "taille" numeric,
    "hanche" numeric,
    "cuisse" numeric,
    "mollet" numeric,
    "photos" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bras_g" numeric(5,1) DEFAULT NULL::numeric,
    "bras_d" numeric(5,1) DEFAULT NULL::numeric,
    "cuisse_g" numeric(5,1) DEFAULT NULL::numeric,
    "cuisse_d" numeric(5,1) DEFAULT NULL::numeric,
    "mollet_g" numeric(5,1) DEFAULT NULL::numeric,
    "mollet_d" numeric(5,1) DEFAULT NULL::numeric
);


ALTER TABLE "public"."measurement_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medical_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entry_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_name" "text",
    "mime_type" "text" NOT NULL,
    "file_size" integer,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."medical_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medical_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "kind" "text" DEFAULT 'blessure'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "zone" "text",
    "date" "date",
    "diagnosis" "text",
    "treatment" "text",
    "status" "text" DEFAULT 'gueri'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "injury_type" "text",
    "mechanism" "text",
    "context" "text",
    "pain_level" smallint,
    "training_impact" "text",
    "days_off" integer,
    "diagnosed_by" "text",
    "return_date" "date",
    "declared_by" "text",
    CONSTRAINT "medical_entries_context_check" CHECK ((("context" IS NULL) OR ("context" = ANY (ARRAY['entrainement'::"text", 'competition'::"text", 'hors_sport'::"text"])))),
    CONSTRAINT "medical_entries_days_off_check" CHECK ((("days_off" IS NULL) OR ("days_off" >= 0))),
    CONSTRAINT "medical_entries_declared_by_check" CHECK ((("declared_by" IS NULL) OR ("declared_by" = ANY (ARRAY['athlete'::"text", 'coach'::"text", 'staff'::"text"])))),
    CONSTRAINT "medical_entries_diagnosed_by_check" CHECK ((("diagnosed_by" IS NULL) OR ("diagnosed_by" = ANY (ARRAY['personne'::"text", 'medecin'::"text", 'kine'::"text", 'osteo'::"text", 'autre'::"text"])))),
    CONSTRAINT "medical_entries_injury_type_check" CHECK ((("injury_type" IS NULL) OR ("injury_type" = ANY (ARRAY['traumatique'::"text", 'chronique_surmenage'::"text", 'recidive'::"text"])))),
    CONSTRAINT "medical_entries_kind_check" CHECK (("kind" = ANY (ARRAY['blessure'::"text", 'operation'::"text", 'pathologie'::"text", 'autre'::"text"]))),
    CONSTRAINT "medical_entries_mechanism_check" CHECK ((("mechanism" IS NULL) OR ("mechanism" = ANY (ARRAY['contact'::"text", 'sans_contact'::"text", 'chute'::"text", 'geste_repete'::"text", 'inconnu'::"text"])))),
    CONSTRAINT "medical_entries_pain_level_check" CHECK ((("pain_level" IS NULL) OR (("pain_level" >= 0) AND ("pain_level" <= 10)))),
    CONSTRAINT "medical_entries_status_check" CHECK (("status" = ANY (ARRAY['gueri'::"text", 'en_cours'::"text"]))),
    CONSTRAINT "medical_entries_training_impact_check" CHECK ((("training_impact" IS NULL) OR ("training_impact" = ANY (ARRAY['aucun'::"text", 'adapte'::"text", 'arret_partiel'::"text", 'arret_total'::"text"]))))
);


ALTER TABLE "public"."medical_entries" OWNER TO "postgres";


COMMENT ON COLUMN "public"."medical_entries"."injury_type" IS 'traumatique | chronique_surmenage | recidive';



COMMENT ON COLUMN "public"."medical_entries"."mechanism" IS 'contact | sans_contact | chute | geste_repete | inconnu';



COMMENT ON COLUMN "public"."medical_entries"."context" IS 'entrainement | competition | hors_sport';



COMMENT ON COLUMN "public"."medical_entries"."pain_level" IS 'Douleur ressentie, de 0 à 10';



COMMENT ON COLUMN "public"."medical_entries"."training_impact" IS 'aucun | adapte | arret_partiel | arret_total';



COMMENT ON COLUMN "public"."medical_entries"."days_off" IS 'Jours d''arrêt déjà posés';



COMMENT ON COLUMN "public"."medical_entries"."diagnosed_by" IS 'personne | medecin | kine | osteo | autre';



COMMENT ON COLUMN "public"."medical_entries"."return_date" IS 'Retour prévu ou effectif';



COMMENT ON COLUMN "public"."medical_entries"."declared_by" IS 'athlete | coach — côté d''où vient la déclaration';



CREATE TABLE IF NOT EXISTS "public"."medical_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "conditions" "text" DEFAULT ''::"text",
    "allergies" "text" DEFAULT ''::"text",
    "surgeries" "jsonb" DEFAULT '[]'::"jsonb",
    "past_injuries" "jsonb" DEFAULT '[]'::"jsonb",
    "current_treatments" "text" DEFAULT ''::"text",
    "medical_notes" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."medical_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mesocycles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "macrocycle_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "objective" "text",
    "volume_config" "jsonb" DEFAULT '{"type": "progressive"}'::"jsonb",
    "intensity_config" "jsonb" DEFAULT '{"zones": []}'::"jsonb",
    "frequency" smallint,
    "deload_week" smallint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mesocycles_dates" CHECK (("end_date" > "start_date")),
    CONSTRAINT "mesocycles_deload_week_check" CHECK (("deload_week" >= 1)),
    CONSTRAINT "mesocycles_frequency_check" CHECK ((("frequency" >= 1) AND ("frequency" <= 14)))
);


ALTER TABLE "public"."mesocycles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."microcycles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "week_number" smallint NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "is_deload" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "microcycles_dates" CHECK (("end_date" > "start_date")),
    CONSTRAINT "microcycles_week_number_check" CHECK ((("week_number" >= 1) AND ("week_number" <= 53)))
);


ALTER TABLE "public"."microcycles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."performance_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "metric_type" "text" NOT NULL,
    "metric_name" "text" NOT NULL,
    "value" numeric NOT NULL,
    "unit" "text" NOT NULL,
    "custom_unit" "text",
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "test_session_id" "uuid",
    "is_active_reference" boolean DEFAULT false,
    "coach_validated" boolean,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."performance_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."performance_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "performance_log_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone
);


ALTER TABLE "public"."performance_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."physical_qualities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "coach_id" "uuid",
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."physical_qualities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planning_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "season_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "type" "text" DEFAULT 'custom'::"text" NOT NULL,
    "start_week" integer NOT NULL,
    "end_week" integer NOT NULL,
    "color" "text" DEFAULT '#7B6FFF'::"text" NOT NULL,
    "parent_block_id" "uuid",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "valid_week_numbers" CHECK (("start_week" >= 1)),
    CONSTRAINT "valid_week_range" CHECK (("end_week" >= "start_week"))
);


ALTER TABLE "public"."planning_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "coach_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "coach_code" "text",
    "first_name" "text",
    "last_name" "text",
    "age" integer,
    "height_cm" integer,
    "gender" "text",
    "weight_kg" numeric(5,2),
    "body_fat_pct" numeric(4,1),
    "base_metabolism" integer,
    "is_admin" boolean DEFAULT false NOT NULL,
    "birth_date" "date",
    "habit_tracker_enabled" boolean DEFAULT false,
    "is_certified_coach" boolean DEFAULT false NOT NULL,
    "is_hyrox_athlete" boolean DEFAULT false NOT NULL,
    "home_hidden_sections" "text"[] DEFAULT ARRAY['nutrition'::"text"] NOT NULL,
    "booking_url" "text",
    "profession" "text",
    "coach_hidden" boolean DEFAULT false NOT NULL,
    "is_pending" boolean DEFAULT false NOT NULL,
    "hyrox_category" "text",
    "client_build" "text",
    "client_build_at" timestamp with time zone,
    "onboarded_at" timestamp with time zone,
    CONSTRAINT "profiles_booking_url_chk" CHECK ((("booking_url" IS NULL) OR ("booking_url" ~ '^https://([a-z0-9-]+\.)*calendly\.com/[^\s]+$'::"text"))),
    CONSTRAINT "profiles_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text"]))),
    CONSTRAINT "profiles_hyrox_category_check" CHECK (("hyrox_category" = ANY (ARRAY['open'::"text", 'pro'::"text"]))),
    CONSTRAINT "profiles_profession_check" CHECK ((("profession" IS NULL) OR ("profession" = ANY (ARRAY['kine'::"text", 'osteo'::"text", 'coach_adjoint'::"text", 'nutritionniste'::"text", 'prepa_mentale'::"text", 'medecin'::"text", 'autre'::"text"])))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['coach'::"text", 'athlete'::"text", 'coach_athlete'::"text", 'staff'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."is_hyrox_athlete" IS 'Active l''onglet HYROX pour cet athlète. Modifiable par son coach ou un admin, pas par l''athlète lui-même.';



COMMENT ON COLUMN "public"."profiles"."home_hidden_sections" IS 'Sections de l''accueil athlète masquées par le coach (clés : quote, wellness, nutrition, test, week, yesterday, next_comp, events, trend)';



COMMENT ON COLUMN "public"."profiles"."booking_url" IS 'Lien Calendly du coach pour le point hebdo. Lu par ses athlètes via profiles_select_coaches.';



COMMENT ON COLUMN "public"."profiles"."profession" IS 'Métier par défaut d''un professionnel (pré-rempli à l''invitation). Le métier qui compte pour les droits est celui du lien (athlete_staff.profession).';



COMMENT ON COLUMN "public"."profiles"."coach_hidden" IS 'true = son coach l''a masqué de sa liste/sélecteur/accueil. Sans effet côté athlète.';



COMMENT ON COLUMN "public"."profiles"."is_pending" IS 'true = compte pré-créé par le coach, pas encore réclamé par l''athlète.';



COMMENT ON COLUMN "public"."profiles"."hyrox_category" IS 'Catégorie HYROX de l''athlète (open / pro) : fixe les charges de course des tests (sleds, wall balls).';



COMMENT ON COLUMN "public"."profiles"."onboarded_at" IS 'Fin (ou saut) du premier lancement athlète ; null = à montrer';



CREATE TABLE IF NOT EXISTS "public"."provider_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "provider" "public"."data_source" NOT NULL,
    "status" "public"."provider_status" DEFAULT 'active'::"public"."provider_status" NOT NULL,
    "external_user_id" "text",
    "api_host" "text",
    "granted_scopes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "connected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_sync_at" timestamp with time zone,
    "synced_through" "date",
    "last_error" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_locked_until" timestamp with time zone,
    "sync_lock_token" "uuid",
    "push_workouts" boolean DEFAULT true NOT NULL,
    CONSTRAINT "provider_connections_real_provider" CHECK (("provider" = ANY (ARRAY['garmin'::"public"."data_source", 'coros'::"public"."data_source"])))
);


ALTER TABLE "public"."provider_connections" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_connections" IS 'Métadonnées de connexion à un service tiers. Ne contient aucun jeton : voir provider_tokens.';



COMMENT ON COLUMN "public"."provider_connections"."sync_locked_until" IS 'Bail de synchronisation : une seule exécution à la fois par connexion. Expire seul. Écrit par provider_sync_try_lock / provider_sync_unlock.';



COMMENT ON COLUMN "public"."provider_connections"."sync_lock_token" IS 'Jeton du bail en cours : seul celui qui l''a pris peut le rendre.';



COMMENT ON COLUMN "public"."provider_connections"."push_workouts" IS 'L''athlète reçoit ses séances Agon sur sa montre (Garmin Training API). Coupé : les séances à venir sont retirées de Garmin.';



CREATE TABLE IF NOT EXISTS "public"."provider_fit_quota" (
    "connection_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "used" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "provider_fit_quota_used_sane" CHECK (("used" >= 0))
);


ALTER TABLE "public"."provider_fit_quota" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_fit_quota" IS 'Fichiers FIT COROS réservés par connexion et par jour UTC (quota COROS : 50 / 24 h). Service_role uniquement.';



CREATE TABLE IF NOT EXISTS "public"."provider_intraday" (
    "athlete_id" "uuid" NOT NULL,
    "source" "public"."data_source" NOT NULL,
    "day" "date" NOT NULL,
    "measure" "text" NOT NULL,
    "utc_offset_s" integer,
    "offsets" integer[] NOT NULL,
    "values" real[] NOT NULL,
    "ai_allowed" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "provider_intraday_lengths" CHECK (("cardinality"("offsets") = "cardinality"("values"))),
    CONSTRAINT "provider_intraday_measure_check" CHECK (("measure" = ANY (ARRAY['hr'::"text", 'stress'::"text", 'body_battery'::"text", 'respiration'::"text", 'spo2'::"text", 'hrv'::"text", 'sleep_stage'::"text", 'sleep_respiration'::"text", 'sleep_spo2'::"text", 'steps'::"text", 'distance'::"text", 'active_kcal'::"text", 'met'::"text", 'intensity'::"text"])))
);


ALTER TABLE "public"."provider_intraday" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_moveiq" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "source" "public"."data_source" NOT NULL,
    "external_id" "text" NOT NULL,
    "day" "date" NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "duration_s" integer,
    "activity_type" "text",
    "ai_allowed" boolean DEFAULT false NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "provider_moveiq_duration_s_check" CHECK ((("duration_s" IS NULL) OR ("duration_s" >= 0)))
);


ALTER TABLE "public"."provider_moveiq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_oauth_clients" (
    "provider" "public"."data_source" NOT NULL,
    "api_host" "text" NOT NULL,
    "client_id" "text" NOT NULL,
    "scope" "text" NOT NULL,
    "registered_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."provider_oauth_clients" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_oauth_clients" IS 'Clients OAuth enregistrés dynamiquement, un par hôte régional. Aucun secret : COROS délivre des clients publics.';



CREATE TABLE IF NOT EXISTS "public"."provider_oauth_states" (
    "state" "text" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "provider" "public"."data_source" NOT NULL,
    "api_host" "text" NOT NULL,
    "code_verifier" "text" NOT NULL,
    "redirect_uri" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:10:00'::interval) NOT NULL,
    CONSTRAINT "provider_oauth_states_ttl" CHECK (("expires_at" > "created_at"))
);


ALTER TABLE "public"."provider_oauth_states" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_oauth_states" IS 'Autorisations OAuth en cours. Contient le code_verifier PKCE, qui ne doit jamais sortir du serveur. Lignes purgées après 10 minutes.';



CREATE TABLE IF NOT EXISTS "public"."provider_raw_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "source" "public"."data_source" NOT NULL,
    "summary_type" "text" NOT NULL,
    "summary_id" "text" NOT NULL,
    "external_user_id" "text",
    "payload" "jsonb" NOT NULL,
    "samples_path" "text",
    "samples_count" integer,
    "file_path" "text",
    "file_type" "text",
    "file_bytes" integer,
    "ai_allowed" boolean DEFAULT false NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "provider_raw_records_file_bytes_check" CHECK ((("file_bytes" IS NULL) OR ("file_bytes" >= 0))),
    CONSTRAINT "provider_raw_records_samples_count_check" CHECK ((("samples_count" IS NULL) OR ("samples_count" >= 0))),
    CONSTRAINT "provider_raw_records_summary_id_check" CHECK ((("length"("summary_id") >= 1) AND ("length"("summary_id") <= 200))),
    CONSTRAINT "provider_raw_records_summary_type_check" CHECK ((("length"("summary_type") >= 1) AND ("length"("summary_type") <= 60)))
);


ALTER TABLE "public"."provider_raw_records" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_raw_records" IS 'Tout ce qu''un fournisseur (Garmin) envoie, résumé par résumé, JSON complet. Échantillons et fichiers .FIT dans le bucket provider-raw. Écriture service_role uniquement.';



CREATE TABLE IF NOT EXISTS "public"."provider_tokens" (
    "connection_id" "uuid" NOT NULL,
    "access_secret_id" "uuid" NOT NULL,
    "refresh_secret_id" "uuid",
    "access_expires_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "refresh_expires_at" timestamp with time zone,
    "refresh_locked_until" timestamp with time zone
);


ALTER TABLE "public"."provider_tokens" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_tokens" IS 'Références Vault des jetons OAuth. RLS active sans aucune politique : service_role uniquement. Ne jamais ajouter de politique ni de colonne contenant un jeton en clair.';



CREATE TABLE IF NOT EXISTS "public"."provider_workout_pushes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "provider" "public"."data_source" NOT NULL,
    "source_kind" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "scheduled_date" "date" NOT NULL,
    "external_workout_id" "text",
    "external_schedule_id" "text",
    "payload_hash" "text",
    "status" "text" NOT NULL,
    "warnings" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "last_error" "text",
    "attempts" integer DEFAULT 0 NOT NULL,
    "sent_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "provider_workout_pushes_source_kind_check" CHECK (("source_kind" = ANY (ARRAY['energy'::"text", 'strength'::"text"]))),
    CONSTRAINT "provider_workout_pushes_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'error'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."provider_workout_pushes" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_workout_pushes" IS 'Séances Agon publiées dans le calendrier de la montre (Garmin Training API). status : sent (à jour), error (réessai au passage suivant), rejected (refusée par la traduction, ex. > 100 étapes ; réessayée si la séance change).';



CREATE TABLE IF NOT EXISTS "public"."retours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retours" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retours_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "retour_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "vote" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "retours_votes_vote_check" CHECK (("vote" = ANY (ARRAY['like'::"text", 'dislike'::"text"])))
);


ALTER TABLE "public"."retours_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phase_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text" DEFAULT 'coach'::"text" NOT NULL,
    "priority" "text" DEFAULT 'P2'::"text" NOT NULL,
    "status" "text" DEFAULT 'idea'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "roadmap_items_category_check" CHECK (("category" = ANY (ARRAY['coach'::"text", 'athlete'::"text", 'planning'::"text", 'nutrition'::"text", 'infra'::"text", 'ux'::"text"]))),
    CONSTRAINT "roadmap_items_priority_check" CHECK (("priority" = ANY (ARRAY['P0'::"text", 'P1'::"text", 'P2'::"text", 'P3'::"text"]))),
    CONSTRAINT "roadmap_items_status_check" CHECK (("status" = ANY (ARRAY['idea'::"text", 'backlog'::"text", 'planned'::"text", 'in_progress'::"text", 'shipped'::"text"])))
);


ALTER TABLE "public"."roadmap_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_phases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "quarter" "text" NOT NULL,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "roadmap_phases_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'in_progress'::"text", 'shipped'::"text"])))
);


ALTER TABLE "public"."roadmap_phases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."roadmap_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seasons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seasons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."specific_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sport_id" "uuid",
    "quality_id" "uuid",
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."specific_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."specific_sports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "icon" "text",
    "color" "text",
    "coach_id" "uuid",
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."specific_sports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "email" "text",
    "profession" "text" NOT NULL,
    "permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "can_edit_coach_content" boolean DEFAULT false NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "invited_by_role" "text" NOT NULL,
    "token" "text" DEFAULT ("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text") || "replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text")) NOT NULL,
    "used_at" timestamp with time zone,
    "used_by" "uuid",
    "expires_at" timestamp with time zone DEFAULT ("now"() + '14 days'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_invitations_invited_by_role_check" CHECK (("invited_by_role" = ANY (ARRAY['coach'::"text", 'athlete'::"text"]))),
    CONSTRAINT "staff_invitations_profession_check" CHECK (("profession" = ANY (ARRAY['kine'::"text", 'osteo'::"text", 'coach_adjoint'::"text", 'nutritionniste'::"text", 'prepa_mentale'::"text", 'medecin'::"text", 'autre'::"text"])))
);


ALTER TABLE "public"."staff_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text" DEFAULT 'custom'::"text" NOT NULL,
    "created_by" "uuid",
    "is_global" boolean DEFAULT false NOT NULL,
    "description" "text",
    "protocol" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "category" "text",
    "fill_mode" "text" DEFAULT 'self'::"text" NOT NULL,
    "articulation" "text",
    "media_url" "text",
    "battery" "text",
    "battery_session" "text",
    "battery_order" integer,
    CONSTRAINT "test_definitions_fill_mode_check" CHECK (("fill_mode" = ANY (ARRAY['self'::"text", 'coach'::"text"]))),
    CONSTRAINT "test_definitions_kind_check" CHECK (("kind" = ANY (ARRAY['preset'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."test_definitions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."test_definitions"."battery" IS 'Batterie d''appartenance : hyrox_v3 (bilan HYROX actuel), hyrox_legacy (anciens presets HYROX, masqués par défaut). NULL = hors batterie.';



COMMENT ON COLUMN "public"."test_definitions"."battery_session" IS 'Séance de la batterie : S1 à S5 (semaine de bilan), W1 (semaine 1 d''entraînement).';



CREATE TABLE IF NOT EXISTS "public"."test_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "test_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "macrocycle_id" "uuid",
    "test_session_id" "uuid",
    "value" numeric NOT NULL,
    "test_date" "date" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."test_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "coach_id" "uuid",
    "type" "text" DEFAULT 'musculation'::"text" NOT NULL,
    "custom_type" "text",
    "title" "text" NOT NULL,
    "description" "text",
    "reference_file_url" "text",
    "reference_file_type" "text",
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "completed" boolean DEFAULT false,
    "results_structured" "jsonb" DEFAULT '{}'::"jsonb",
    "results_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "planning_block_id" "uuid"
);


ALTER TABLE "public"."test_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "unit" "text",
    "higher_is_better" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_methods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "scope" "text" NOT NULL,
    "category" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_official" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "training_methods_scope_check" CHECK (("scope" = ANY (ARRAY['set'::"text", 'exercise'::"text", 'classic'::"text"])))
);


ALTER TABLE "public"."training_methods" OWNER TO "postgres";


ALTER TABLE "public"."user_consents" ALTER COLUMN "seq" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."user_consents_seq_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."weekly_retours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "comment" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "athlete_reaction" "text",
    "reacted_at" timestamp with time zone
);


ALTER TABLE "public"."weekly_retours" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_exercise_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workout_log_id" "uuid" NOT NULL,
    "exercise_id" "uuid",
    "exercise_name" "text" NOT NULL,
    "comment" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workout_exercise_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_rpe" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workout_log_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "rpe_score" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workout_rpe_rpe_score_check" CHECK ((("rpe_score" >= 1) AND ("rpe_score" <= 10)))
);


ALTER TABLE "public"."workout_rpe" OWNER TO "postgres";


ALTER TABLE ONLY "public"."coach_api_access_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."coach_api_access_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."account_deletions"
    ADD CONSTRAINT "account_deletions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_laps"
    ADD CONSTRAINT "activity_laps_activity_id_position_key" UNIQUE ("activity_id", "position");



ALTER TABLE ONLY "public"."activity_laps"
    ADD CONSTRAINT "activity_laps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_plan_links"
    ADD CONSTRAINT "activity_plan_links_activity_id_planned_kind_planned_id_key" UNIQUE ("activity_id", "planned_kind", "planned_id");



ALTER TABLE ONLY "public"."activity_plan_links"
    ADD CONSTRAINT "activity_plan_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_sets"
    ADD CONSTRAINT "activity_sets_activity_id_position_key" UNIQUE ("activity_id", "position");



ALTER TABLE ONLY "public"."activity_sets"
    ADD CONSTRAINT "activity_sets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_streams"
    ADD CONSTRAINT "activity_streams_pkey" PRIMARY KEY ("activity_id");



ALTER TABLE ONLY "public"."activity_zone_summaries"
    ADD CONSTRAINT "activity_zone_summaries_pkey" PRIMARY KEY ("activity_id");



ALTER TABLE ONLY "public"."app_data"
    ADD CONSTRAINT "app_data_pkey" PRIMARY KEY ("athlete_id", "key");



ALTER TABLE ONLY "public"."app_feedback"
    ADD CONSTRAINT "app_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_update_reads"
    ADD CONSTRAINT "app_update_reads_pkey" PRIMARY KEY ("user_id", "update_id");



ALTER TABLE ONLY "public"."athlete_claims"
    ADD CONSTRAINT "athlete_claims_pkey" PRIMARY KEY ("athlete_id");



ALTER TABLE ONLY "public"."athlete_claims"
    ADD CONSTRAINT "athlete_claims_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."athlete_co_coaches"
    ADD CONSTRAINT "athlete_co_coaches_pkey" PRIMARY KEY ("athlete_id");



ALTER TABLE "public"."athlete_life_events"
    ADD CONSTRAINT "athlete_life_events_dates_check" CHECK (("date_end" >= "date_start")) NOT VALID;



ALTER TABLE ONLY "public"."athlete_life_events"
    ADD CONSTRAINT "athlete_life_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."athlete_profile_items"
    ADD CONSTRAINT "athlete_profile_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."athlete_staff"
    ADD CONSTRAINT "athlete_staff_athlete_id_staff_id_key" UNIQUE ("athlete_id", "staff_id");



ALTER TABLE ONLY "public"."athlete_staff"
    ADD CONSTRAINT "athlete_staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."athlete_test_results"
    ADD CONSTRAINT "athlete_test_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."athlete_test_values"
    ADD CONSTRAINT "athlete_test_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."athlete_test_values"
    ADD CONSTRAINT "athlete_test_values_result_id_variable_id_key" UNIQUE ("result_id", "variable_id");



ALTER TABLE ONLY "public"."body_weight_goals"
    ADD CONSTRAINT "body_weight_goals_pkey" PRIMARY KEY ("athlete_id");



ALTER TABLE ONLY "public"."body_weight_logs"
    ADD CONSTRAINT "body_weight_logs_pkey" PRIMARY KEY ("athlete_id", "day");



ALTER TABLE ONLY "public"."body_weight_milestones"
    ADD CONSTRAINT "body_weight_milestones_pkey" PRIMARY KEY ("athlete_id", "day", "kg");



ALTER TABLE ONLY "public"."citation_likes"
    ADD CONSTRAINT "citation_likes_pkey" PRIMARY KEY ("user_id", "quote_id");



ALTER TABLE ONLY "public"."citation_stats"
    ADD CONSTRAINT "citation_stats_pkey" PRIMARY KEY ("quote_id");



ALTER TABLE ONLY "public"."coach_api_access_log"
    ADD CONSTRAINT "coach_api_access_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_api_drafts"
    ADD CONSTRAINT "coach_api_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_api_keys"
    ADD CONSTRAINT "coach_api_keys_key_hash_key" UNIQUE ("key_hash");



ALTER TABLE ONLY "public"."coach_api_keys"
    ADD CONSTRAINT "coach_api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_api_rate"
    ADD CONSTRAINT "coach_api_rate_pkey" PRIMARY KEY ("key_id", "window_start");



ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cycles"
    ADD CONSTRAINT "cycles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."data_source_policies"
    ADD CONSTRAINT "data_source_policies_pkey" PRIMARY KEY ("source");



ALTER TABLE ONLY "public"."day_themes"
    ADD CONSTRAINT "day_themes_athlete_id_date_key" UNIQUE ("athlete_id", "date");



ALTER TABLE ONLY "public"."day_themes"
    ADD CONSTRAINT "day_themes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doc_assignments"
    ADD CONSTRAINT "doc_assignments_doc_id_athlete_id_source_key" UNIQUE ("doc_id", "athlete_id", "source");



ALTER TABLE ONLY "public"."doc_assignments"
    ADD CONSTRAINT "doc_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doc_comments"
    ADD CONSTRAINT "doc_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doc_schedule"
    ADD CONSTRAINT "doc_schedule_doc_id_athlete_id_date_key" UNIQUE ("doc_id", "athlete_id", "date");



ALTER TABLE ONLY "public"."doc_schedule"
    ADD CONSTRAINT "doc_schedule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."docs"
    ADD CONSTRAINT "docs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."energy_session_assignments"
    ADD CONSTRAINT "energy_session_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."energy_sessions"
    ADD CONSTRAINT "energy_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_pr_logs"
    ADD CONSTRAINT "exercise_pr_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."habit_logs"
    ADD CONSTRAINT "habit_logs_habit_id_date_key" UNIQUE ("habit_id", "date");



ALTER TABLE ONLY "public"."habit_logs"
    ADD CONSTRAINT "habit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."habits"
    ADD CONSTRAINT "habits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."health_sync_errors"
    ADD CONSTRAINT "health_sync_errors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_zone_models"
    ADD CONSTRAINT "hr_zone_models_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hyrox_axes_params"
    ADD CONSTRAINT "hyrox_axes_params_pkey" PRIMARY KEY ("version");



ALTER TABLE ONLY "public"."hyrox_race_plans"
    ADD CONSTRAINT "hyrox_race_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hyrox_reference_segments"
    ADD CONSTRAINT "hyrox_reference_segments_division_bracket_segment_key" UNIQUE ("division", "bracket", "segment");



ALTER TABLE ONLY "public"."hyrox_reference_segments"
    ADD CONSTRAINT "hyrox_reference_segments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hyrox_results"
    ADD CONSTRAINT "hyrox_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hyrox_test_analyses"
    ADD CONSTRAINT "hyrox_test_analyses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hyrox_test_axes_drafts"
    ADD CONSTRAINT "hyrox_test_axes_drafts_pkey" PRIMARY KEY ("analysis_id");



ALTER TABLE ONLY "public"."hyrox_test_grid_versions"
    ADD CONSTRAINT "hyrox_test_grid_versions_pkey" PRIMARY KEY ("version");



ALTER TABLE ONLY "public"."hyrox_test_grids"
    ADD CONSTRAINT "hyrox_test_grids_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hyrox_test_params"
    ADD CONSTRAINT "hyrox_test_params_pkey" PRIMARY KEY ("version", "scope");



ALTER TABLE ONLY "public"."hyrox_work_axes_rules"
    ADD CONSTRAINT "hyrox_work_axes_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hyrox_work_axes_rules"
    ADD CONSTRAINT "hyrox_work_axes_rules_version_rule_key_key" UNIQUE ("version", "rule_key");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."macrocycles"
    ADD CONSTRAINT "macrocycles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."measurement_logs"
    ADD CONSTRAINT "measurement_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medical_attachments"
    ADD CONSTRAINT "medical_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medical_entries"
    ADD CONSTRAINT "medical_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medical_history"
    ADD CONSTRAINT "medical_history_athlete_id_key" UNIQUE ("athlete_id");



ALTER TABLE ONLY "public"."medical_history"
    ADD CONSTRAINT "medical_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mesocycles"
    ADD CONSTRAINT "mesocycles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."microcycles"
    ADD CONSTRAINT "microcycles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."performance_logs"
    ADD CONSTRAINT "performance_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."performance_notifications"
    ADD CONSTRAINT "performance_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."physical_qualities"
    ADD CONSTRAINT "physical_qualities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planning_blocks"
    ADD CONSTRAINT "planning_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_coach_code_key" UNIQUE ("coach_code");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_activities"
    ADD CONSTRAINT "provider_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_activities"
    ADD CONSTRAINT "provider_activities_unique" UNIQUE ("athlete_id", "source", "external_id");



ALTER TABLE ONLY "public"."provider_connections"
    ADD CONSTRAINT "provider_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_connections"
    ADD CONSTRAINT "provider_connections_unique" UNIQUE ("athlete_id", "provider");



ALTER TABLE ONLY "public"."provider_dailies"
    ADD CONSTRAINT "provider_dailies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_dailies"
    ADD CONSTRAINT "provider_dailies_unique" UNIQUE ("athlete_id", "source", "day");



ALTER TABLE ONLY "public"."provider_fit_quota"
    ADD CONSTRAINT "provider_fit_quota_pkey" PRIMARY KEY ("connection_id", "day");



ALTER TABLE ONLY "public"."provider_intraday"
    ADD CONSTRAINT "provider_intraday_pkey" PRIMARY KEY ("athlete_id", "source", "day", "measure");



ALTER TABLE ONLY "public"."provider_moveiq"
    ADD CONSTRAINT "provider_moveiq_athlete_id_source_external_id_key" UNIQUE ("athlete_id", "source", "external_id");



ALTER TABLE ONLY "public"."provider_moveiq"
    ADD CONSTRAINT "provider_moveiq_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_oauth_clients"
    ADD CONSTRAINT "provider_oauth_clients_pkey" PRIMARY KEY ("provider", "api_host");



ALTER TABLE ONLY "public"."provider_oauth_states"
    ADD CONSTRAINT "provider_oauth_states_pkey" PRIMARY KEY ("state");



ALTER TABLE ONLY "public"."provider_raw_records"
    ADD CONSTRAINT "provider_raw_records_athlete_id_source_summary_type_summary_key" UNIQUE ("athlete_id", "source", "summary_type", "summary_id");



ALTER TABLE ONLY "public"."provider_raw_records"
    ADD CONSTRAINT "provider_raw_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_tokens"
    ADD CONSTRAINT "provider_tokens_pkey" PRIMARY KEY ("connection_id");



ALTER TABLE ONLY "public"."provider_webhook_inbox"
    ADD CONSTRAINT "provider_webhook_inbox_fingerprint_unique" UNIQUE ("provider", "fingerprint");



ALTER TABLE ONLY "public"."provider_webhook_inbox"
    ADD CONSTRAINT "provider_webhook_inbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_workout_pushes"
    ADD CONSTRAINT "provider_workout_pushes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_workout_pushes"
    ADD CONSTRAINT "provider_workout_pushes_provider_source_kind_source_id_key" UNIQUE ("provider", "source_kind", "source_id");



ALTER TABLE ONLY "public"."retours"
    ADD CONSTRAINT "retours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retours_votes"
    ADD CONSTRAINT "retours_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retours_votes"
    ADD CONSTRAINT "retours_votes_retour_id_user_id_key" UNIQUE ("retour_id", "user_id");



ALTER TABLE ONLY "public"."roadmap_items"
    ADD CONSTRAINT "roadmap_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_phases"
    ADD CONSTRAINT "roadmap_phases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_votes"
    ADD CONSTRAINT "roadmap_votes_item_id_user_id_key" UNIQUE ("item_id", "user_id");



ALTER TABLE ONLY "public"."roadmap_votes"
    ADD CONSTRAINT "roadmap_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seasons"
    ADD CONSTRAINT "seasons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."specific_blocks"
    ADD CONSTRAINT "specific_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."specific_sports"
    ADD CONSTRAINT "specific_sports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_invitations"
    ADD CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_invitations"
    ADD CONSTRAINT "staff_invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."test_definitions"
    ADD CONSTRAINT "test_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_results"
    ADD CONSTRAINT "test_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_sessions"
    ADD CONSTRAINT "test_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_variables"
    ADD CONSTRAINT "test_variables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_variables"
    ADD CONSTRAINT "test_variables_test_definition_id_key_key" UNIQUE ("test_definition_id", "key");



ALTER TABLE ONLY "public"."tests"
    ADD CONSTRAINT "tests_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."tests"
    ADD CONSTRAINT "tests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_methods"
    ADD CONSTRAINT "training_methods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_consents"
    ADD CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_consents"
    ADD CONSTRAINT "user_consents_seq_unique" UNIQUE ("seq");



ALTER TABLE ONLY "public"."weekly_retours"
    ADD CONSTRAINT "weekly_retours_athlete_id_week_start_key" UNIQUE ("athlete_id", "week_start");



ALTER TABLE ONLY "public"."weekly_retours"
    ADD CONSTRAINT "weekly_retours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wellness_entries"
    ADD CONSTRAINT "wellness_entries_pkey" PRIMARY KEY ("athlete_id", "day");



ALTER TABLE ONLY "public"."workout_exercise_comments"
    ADD CONSTRAINT "workout_exercise_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_exercise_comments"
    ADD CONSTRAINT "workout_exercise_comments_workout_log_id_exercise_id_key" UNIQUE ("workout_log_id", "exercise_id");



ALTER TABLE ONLY "public"."workout_logs"
    ADD CONSTRAINT "workout_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_rpe"
    ADD CONSTRAINT "workout_rpe_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_rpe"
    ADD CONSTRAINT "workout_rpe_workout_log_id_key" UNIQUE ("workout_log_id");



CREATE INDEX "activity_laps_athlete_id_fk_idx" ON "public"."activity_laps" USING "btree" ("athlete_id");



CREATE INDEX "activity_laps_exercise_id_fk_idx" ON "public"."activity_laps" USING "btree" ("exercise_id");



CREATE INDEX "activity_plan_links_athlete_day" ON "public"."activity_plan_links" USING "btree" ("athlete_id", "local_date");



CREATE INDEX "activity_plan_links_confirmed_by_fk_idx" ON "public"."activity_plan_links" USING "btree" ("confirmed_by");



CREATE UNIQUE INDEX "activity_plan_links_one_per_activity" ON "public"."activity_plan_links" USING "btree" ("activity_id") WHERE ("status" <> 'rejected'::"text");



CREATE UNIQUE INDEX "activity_plan_links_one_per_planned" ON "public"."activity_plan_links" USING "btree" ("planned_kind", "planned_id") WHERE ("status" <> 'rejected'::"text");



CREATE INDEX "activity_sets_athlete_id_fk_idx" ON "public"."activity_sets" USING "btree" ("athlete_id");



CREATE INDEX "activity_streams_athlete_started" ON "public"."activity_streams" USING "btree" ("athlete_id", "started_at" DESC);



CREATE INDEX "activity_zone_summaries_athlete" ON "public"."activity_zone_summaries" USING "btree" ("athlete_id");



CREATE INDEX "activity_zone_summaries_model_id_fk_idx" ON "public"."activity_zone_summaries" USING "btree" ("model_id");



CREATE INDEX "app_feedback_author_id_fk_idx" ON "public"."app_feedback" USING "btree" ("author_id");



CREATE INDEX "athlete_co_coaches_added_by_fk_idx" ON "public"."athlete_co_coaches" USING "btree" ("added_by");



CREATE INDEX "athlete_profile_items_idx" ON "public"."athlete_profile_items" USING "btree" ("athlete_id", "category", "sort_order");



CREATE INDEX "athlete_staff_added_by_fk_idx" ON "public"."athlete_staff" USING "btree" ("added_by");



CREATE INDEX "athlete_staff_athlete_idx" ON "public"."athlete_staff" USING "btree" ("athlete_id");



CREATE INDEX "athlete_staff_revoked_by_fk_idx" ON "public"."athlete_staff" USING "btree" ("revoked_by");



CREATE INDEX "athlete_staff_staff_idx" ON "public"."athlete_staff" USING "btree" ("staff_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "coach_api_access_log_athlete_idx" ON "public"."coach_api_access_log" USING "btree" ("athlete_id", "created_at" DESC);



CREATE INDEX "coach_api_access_log_coach_id_fk_idx" ON "public"."coach_api_access_log" USING "btree" ("coach_id");



CREATE INDEX "coach_api_access_log_key_id_fk_idx" ON "public"."coach_api_access_log" USING "btree" ("key_id");



CREATE INDEX "coach_api_drafts_athlete_id_fk_idx" ON "public"."coach_api_drafts" USING "btree" ("athlete_id");



CREATE INDEX "coach_api_drafts_key_id_fk_idx" ON "public"."coach_api_drafts" USING "btree" ("key_id");



CREATE INDEX "coach_api_drafts_pending_idx" ON "public"."coach_api_drafts" USING "btree" ("coach_id", "athlete_id", "created_at" DESC) WHERE ("status" = 'pending'::"text");



CREATE INDEX "coach_api_keys_coach_idx" ON "public"."coach_api_keys" USING "btree" ("coach_id");



CREATE INDEX "competitions_coach_id_fk_idx" ON "public"."competitions" USING "btree" ("coach_id");



CREATE INDEX "cycles_coach_id_fk_idx" ON "public"."cycles" USING "btree" ("coach_id");



CREATE INDEX "day_themes_athlete_date_idx" ON "public"."day_themes" USING "btree" ("athlete_id", "date");



CREATE INDEX "day_themes_coach_id_fk_idx" ON "public"."day_themes" USING "btree" ("coach_id");



CREATE INDEX "doc_assignments_assigned_by_fk_idx" ON "public"."doc_assignments" USING "btree" ("assigned_by");



CREATE INDEX "doc_comments_athlete_id_fk_idx" ON "public"."doc_comments" USING "btree" ("athlete_id");



CREATE INDEX "doc_comments_author_id_fk_idx" ON "public"."doc_comments" USING "btree" ("author_id");



CREATE INDEX "doc_schedule_added_by_fk_idx" ON "public"."doc_schedule" USING "btree" ("added_by");



CREATE INDEX "doc_schedule_athlete_date_idx" ON "public"."doc_schedule" USING "btree" ("athlete_id", "date");



CREATE INDEX "docs_uploaded_by_fk_idx" ON "public"."docs" USING "btree" ("uploaded_by");



CREATE INDEX "energy_session_assignments_coach_id_fk_idx" ON "public"."energy_session_assignments" USING "btree" ("coach_id");



CREATE INDEX "energy_sessions_quality_id_fk_idx" ON "public"."energy_sessions" USING "btree" ("quality_id");



CREATE INDEX "energy_sessions_verified_by_fk_idx" ON "public"."energy_sessions" USING "btree" ("verified_by");



CREATE INDEX "exercise_pr_logs_athlete_idx" ON "public"."exercise_pr_logs" USING "btree" ("athlete_id");



CREATE INDEX "exercise_pr_logs_ref_idx" ON "public"."exercise_pr_logs" USING "btree" ("athlete_id", "exercise_ref");



CREATE INDEX "exercises_category_idx" ON "public"."exercises" USING "btree" ("category");



CREATE INDEX "exercises_created_by_fk_idx" ON "public"."exercises" USING "btree" ("created_by");



CREATE INDEX "exercises_name_idx" ON "public"."exercises" USING "btree" ("name");



CREATE INDEX "habits_created_by_fk_idx" ON "public"."habits" USING "btree" ("created_by");



CREATE INDEX "health_sync_errors_athlete_id_fk_idx" ON "public"."health_sync_errors" USING "btree" ("athlete_id");



CREATE INDEX "health_sync_errors_created_idx" ON "public"."health_sync_errors" USING "btree" ("created_at" DESC);



CREATE INDEX "hr_zone_models_athlete_from" ON "public"."hr_zone_models" USING "btree" ("athlete_id", "valid_from" DESC, "created_at" DESC);



CREATE INDEX "hr_zone_models_created_by_fk_idx" ON "public"."hr_zone_models" USING "btree" ("created_by");



CREATE INDEX "hr_zone_models_decided_by_fk_idx" ON "public"."hr_zone_models" USING "btree" ("decided_by");



CREATE INDEX "hr_zone_models_test_result_id_fk_idx" ON "public"."hr_zone_models" USING "btree" ("test_result_id");



CREATE INDEX "hyrox_race_plans_athlete_id_fk_idx" ON "public"."hyrox_race_plans" USING "btree" ("athlete_id");



CREATE INDEX "hyrox_race_plans_competition_id_fk_idx" ON "public"."hyrox_race_plans" USING "btree" ("competition_id");



CREATE INDEX "hyrox_race_plans_created_by_fk_idx" ON "public"."hyrox_race_plans" USING "btree" ("created_by");



CREATE INDEX "hyrox_race_plans_result_id_fk_idx" ON "public"."hyrox_race_plans" USING "btree" ("result_id");



CREATE INDEX "hyrox_results_competition_id_fk_idx" ON "public"."hyrox_results" USING "btree" ("competition_id");



CREATE INDEX "hyrox_results_created_by_fk_idx" ON "public"."hyrox_results" USING "btree" ("created_by");



CREATE INDEX "hyrox_test_analyses_created_by_fk_idx" ON "public"."hyrox_test_analyses" USING "btree" ("created_by");



CREATE INDEX "hyrox_test_analyses_grid_version_fk_idx" ON "public"."hyrox_test_analyses" USING "btree" ("grid_version");



CREATE INDEX "hyrox_test_analyses_recalculated_from_fk_idx" ON "public"."hyrox_test_analyses" USING "btree" ("recalculated_from");



CREATE INDEX "hyrox_test_analyses_validated_by_fk_idx" ON "public"."hyrox_test_analyses" USING "btree" ("validated_by");



CREATE INDEX "hyrox_test_axes_drafts_updated_by_fk_idx" ON "public"."hyrox_test_axes_drafts" USING "btree" ("updated_by");



CREATE INDEX "hyrox_test_grid_versions_created_by_fk_idx" ON "public"."hyrox_test_grid_versions" USING "btree" ("created_by");



CREATE UNIQUE INDEX "hyrox_test_grid_versions_one_active" ON "public"."hyrox_test_grid_versions" USING "btree" ((true)) WHERE "active";



CREATE UNIQUE INDEX "hyrox_test_grids_unique" ON "public"."hyrox_test_grids" USING "btree" ("version", "metric_key", COALESCE("sex", '*'::"text"), COALESCE("category", '*'::"text"));



CREATE INDEX "idx_app_data_key" ON "public"."app_data" USING "btree" ("key");



CREATE INDEX "idx_app_data_updated_at" ON "public"."app_data" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_app_feedback_created" ON "public"."app_feedback" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_athlete_co_coaches_co_coach" ON "public"."athlete_co_coaches" USING "btree" ("co_coach_id");



CREATE INDEX "idx_atr_athlete" ON "public"."athlete_test_results" USING "btree" ("athlete_id");



CREATE INDEX "idx_atr_date" ON "public"."athlete_test_results" USING "btree" ("performed_at" DESC);



CREATE INDEX "idx_atr_test" ON "public"."athlete_test_results" USING "btree" ("test_definition_id");



CREATE INDEX "idx_atv_result" ON "public"."athlete_test_values" USING "btree" ("result_id");



CREATE INDEX "idx_atv_variable" ON "public"."athlete_test_values" USING "btree" ("variable_id");



CREATE INDEX "idx_competitions_athlete" ON "public"."competitions" USING "btree" ("athlete_id");



CREATE INDEX "idx_competitions_athlete_date" ON "public"."competitions" USING "btree" ("athlete_id", "date");



CREATE INDEX "idx_competitions_block" ON "public"."competitions" USING "btree" ("planning_block_id");



CREATE INDEX "idx_competitions_macro" ON "public"."competitions" USING "btree" ("macrocycle_id") WHERE ("macrocycle_id" IS NOT NULL);



CREATE INDEX "idx_competitions_season" ON "public"."competitions" USING "btree" ("season_id");



CREATE INDEX "idx_cycles_athlete" ON "public"."cycles" USING "btree" ("athlete_id");



CREATE INDEX "idx_cycles_dates" ON "public"."cycles" USING "btree" ("start_date", "end_date");



CREATE INDEX "idx_cycles_meso" ON "public"."cycles" USING "btree" ("mesocycle_id");



CREATE INDEX "idx_doc_assignments_athlete" ON "public"."doc_assignments" USING "btree" ("athlete_id");



CREATE INDEX "idx_doc_assignments_doc" ON "public"."doc_assignments" USING "btree" ("doc_id");



CREATE INDEX "idx_doc_comments_thread" ON "public"."doc_comments" USING "btree" ("doc_id", "athlete_id", "created_at");



CREATE INDEX "idx_docs_athlete" ON "public"."docs" USING "btree" ("athlete_id");



CREATE INDEX "idx_docs_category" ON "public"."docs" USING "btree" ("category");



CREATE INDEX "idx_docs_coach" ON "public"."docs" USING "btree" ("coach_id");



CREATE INDEX "idx_docs_file_path" ON "public"."docs" USING "btree" ("file_path");



CREATE INDEX "idx_docs_origin" ON "public"."docs" USING "btree" ("origin_id");



CREATE INDEX "idx_energy_sessions_athlete" ON "public"."energy_sessions" USING "btree" ("athlete_id");



CREATE INDEX "idx_energy_sessions_created_by" ON "public"."energy_sessions" USING "btree" ("created_by");



CREATE INDEX "idx_energy_sessions_kind" ON "public"."energy_sessions" USING "btree" ("session_kind");



CREATE INDEX "idx_energy_sessions_parent" ON "public"."energy_sessions" USING "btree" ("parent_session_id");



CREATE INDEX "idx_energy_sessions_public" ON "public"."energy_sessions" USING "btree" ("is_public");



CREATE INDEX "idx_energy_sessions_sport_quality" ON "public"."energy_sessions" USING "btree" ("sport_id", "quality_id");



CREATE INDEX "idx_energy_sessions_verified" ON "public"."energy_sessions" USING "btree" ("is_verified");



CREATE INDEX "idx_esa_athlete_date" ON "public"."energy_session_assignments" USING "btree" ("athlete_id", "scheduled_date");



CREATE INDEX "idx_esa_microcycle" ON "public"."energy_session_assignments" USING "btree" ("microcycle_id") WHERE ("microcycle_id" IS NOT NULL);



CREATE INDEX "idx_esa_session" ON "public"."energy_session_assignments" USING "btree" ("energy_session_id");



CREATE INDEX "idx_habit_logs_athlete_date" ON "public"."habit_logs" USING "btree" ("athlete_id", "date" DESC);



CREATE INDEX "idx_habits_athlete" ON "public"."habits" USING "btree" ("athlete_id");



CREATE INDEX "idx_hyrox_results_athlete_date" ON "public"."hyrox_results" USING "btree" ("athlete_id", "date" DESC);



CREATE INDEX "idx_hyrox_test_analyses_athlete_date" ON "public"."hyrox_test_analyses" USING "btree" ("athlete_id", "date" DESC);



CREATE INDEX "idx_life_events_athlete" ON "public"."athlete_life_events" USING "btree" ("athlete_id");



CREATE INDEX "idx_life_events_dates" ON "public"."athlete_life_events" USING "btree" ("date_start", "date_end");



CREATE INDEX "idx_macrocycles_athlete" ON "public"."macrocycles" USING "btree" ("athlete_id");



CREATE INDEX "idx_macrocycles_coach" ON "public"."macrocycles" USING "btree" ("coach_id");



CREATE INDEX "idx_macrocycles_dates" ON "public"."macrocycles" USING "btree" ("start_date", "end_date");



CREATE INDEX "idx_medical_attachments_entry" ON "public"."medical_attachments" USING "btree" ("entry_id");



CREATE INDEX "idx_medical_entries_athlete" ON "public"."medical_entries" USING "btree" ("athlete_id", "date" DESC);



CREATE INDEX "idx_mesocycles_dates" ON "public"."mesocycles" USING "btree" ("start_date", "end_date");



CREATE INDEX "idx_mesocycles_macro" ON "public"."mesocycles" USING "btree" ("macrocycle_id");



CREATE INDEX "idx_microcycles_cycle" ON "public"."microcycles" USING "btree" ("cycle_id");



CREATE INDEX "idx_microcycles_dates" ON "public"."microcycles" USING "btree" ("start_date", "end_date");



CREATE INDEX "idx_performance_logs_athlete_date" ON "public"."performance_logs" USING "btree" ("athlete_id", "date" DESC);



CREATE INDEX "idx_planning_blocks_athlete" ON "public"."planning_blocks" USING "btree" ("athlete_id");



CREATE INDEX "idx_planning_blocks_parent" ON "public"."planning_blocks" USING "btree" ("parent_block_id");



CREATE INDEX "idx_planning_blocks_season" ON "public"."planning_blocks" USING "btree" ("season_id");



CREATE INDEX "idx_retours_athlete_created" ON "public"."retours" USING "btree" ("athlete_id", "created_at" DESC);



CREATE INDEX "idx_seasons_athlete" ON "public"."seasons" USING "btree" ("athlete_id");



CREATE INDEX "idx_specific_blocks_coach" ON "public"."specific_blocks" USING "btree" ("coach_id");



CREATE INDEX "idx_specific_blocks_sport_quality" ON "public"."specific_blocks" USING "btree" ("sport_id", "quality_id");



CREATE INDEX "idx_test_results_athlete" ON "public"."test_results" USING "btree" ("athlete_id");



CREATE INDEX "idx_test_results_macro" ON "public"."test_results" USING "btree" ("macrocycle_id") WHERE ("macrocycle_id" IS NOT NULL);



CREATE INDEX "idx_test_results_test" ON "public"."test_results" USING "btree" ("test_id", "athlete_id");



CREATE INDEX "idx_test_sessions_athlete_date" ON "public"."test_sessions" USING "btree" ("athlete_id", "date" DESC);



CREATE INDEX "idx_test_sessions_coach" ON "public"."test_sessions" USING "btree" ("coach_id");



CREATE INDEX "idx_tv_def" ON "public"."test_variables" USING "btree" ("test_definition_id");



CREATE INDEX "idx_workout_exercise_comments_exercise" ON "public"."workout_exercise_comments" USING "btree" ("exercise_id");



CREATE INDEX "idx_workout_exercise_comments_workout" ON "public"."workout_exercise_comments" USING "btree" ("workout_log_id");



CREATE INDEX "idx_workout_logs_athlete_date" ON "public"."workout_logs" USING "btree" ("athlete_id", "scheduled_date" DESC);



CREATE INDEX "idx_workout_logs_coach" ON "public"."workout_logs" USING "btree" ("coach_id");



CREATE INDEX "idx_workout_logs_micro" ON "public"."workout_logs" USING "btree" ("microcycle_id");



CREATE INDEX "idx_workout_logs_status_date" ON "public"."workout_logs" USING "btree" ("status", "scheduled_date");



CREATE UNIQUE INDEX "idx_workout_logs_unique" ON "public"."workout_logs" USING "btree" ("athlete_id", "session_id", "scheduled_date");



CREATE INDEX "idx_workout_rpe_athlete" ON "public"."workout_rpe" USING "btree" ("athlete_id");



CREATE INDEX "invitations_coach_id_fk_idx" ON "public"."invitations" USING "btree" ("coach_id");



CREATE INDEX "measurement_logs_athlete_date_idx" ON "public"."measurement_logs" USING "btree" ("athlete_id", "date" DESC);



CREATE INDEX "medical_attachments_athlete_id_fk_idx" ON "public"."medical_attachments" USING "btree" ("athlete_id");



CREATE INDEX "medical_attachments_created_by_fk_idx" ON "public"."medical_attachments" USING "btree" ("created_by");



CREATE INDEX "medical_entries_created_by_fk_idx" ON "public"."medical_entries" USING "btree" ("created_by");



CREATE UNIQUE INDEX "perf_active_ref_unique" ON "public"."performance_logs" USING "btree" ("athlete_id", "metric_name") WHERE ("is_active_reference" = true);



CREATE INDEX "performance_logs_created_by_fk_idx" ON "public"."performance_logs" USING "btree" ("created_by");



CREATE INDEX "performance_logs_test_session_id_fk_idx" ON "public"."performance_logs" USING "btree" ("test_session_id");



CREATE INDEX "performance_notifications_athlete_id_fk_idx" ON "public"."performance_notifications" USING "btree" ("athlete_id");



CREATE INDEX "performance_notifications_coach_id_fk_idx" ON "public"."performance_notifications" USING "btree" ("coach_id");



CREATE INDEX "performance_notifications_performance_log_id_fk_idx" ON "public"."performance_notifications" USING "btree" ("performance_log_id");



CREATE INDEX "planning_blocks_coach_id_fk_idx" ON "public"."planning_blocks" USING "btree" ("coach_id");



CREATE INDEX "profiles_coach_id_fk_idx" ON "public"."profiles" USING "btree" ("coach_id");



CREATE INDEX "provider_activities_athlete_date_idx" ON "public"."provider_activities" USING "btree" ("athlete_id", "local_date" DESC);



CREATE INDEX "provider_activities_athlete_started" ON "public"."provider_activities" USING "btree" ("athlete_id", "started_at");



CREATE INDEX "provider_activities_athlete_started_idx" ON "public"."provider_activities" USING "btree" ("athlete_id", "started_at");



CREATE UNIQUE INDEX "provider_activities_strava_id" ON "public"."provider_activities" USING "btree" ("athlete_id", "strava_activity_id") WHERE ("strava_activity_id" IS NOT NULL);



CREATE INDEX "provider_connections_athlete_idx" ON "public"."provider_connections" USING "btree" ("athlete_id");



CREATE UNIQUE INDEX "provider_connections_external_uidx" ON "public"."provider_connections" USING "btree" ("provider", "external_user_id") WHERE ("external_user_id" IS NOT NULL);



CREATE INDEX "provider_connections_sync_idx" ON "public"."provider_connections" USING "btree" ("status", "last_sync_at") WHERE ("status" = 'active'::"public"."provider_status");



CREATE INDEX "provider_dailies_athlete_day_idx" ON "public"."provider_dailies" USING "btree" ("athlete_id", "day" DESC);



CREATE INDEX "provider_moveiq_athlete_day" ON "public"."provider_moveiq" USING "btree" ("athlete_id", "day" DESC);



CREATE INDEX "provider_oauth_states_athlete_id_fk_idx" ON "public"."provider_oauth_states" USING "btree" ("athlete_id");



CREATE INDEX "provider_oauth_states_expiry_idx" ON "public"."provider_oauth_states" USING "btree" ("expires_at");



CREATE INDEX "provider_raw_records_athlete_type" ON "public"."provider_raw_records" USING "btree" ("athlete_id", "source", "summary_type", "received_at" DESC);



CREATE INDEX "provider_webhook_inbox_pending_idx" ON "public"."provider_webhook_inbox" USING "btree" ("provider", "received_at") WHERE ("processed_at" IS NULL);



CREATE INDEX "provider_webhook_inbox_user_idx" ON "public"."provider_webhook_inbox" USING "btree" ("provider", "external_user_id");



CREATE INDEX "provider_workout_pushes_athlete_idx" ON "public"."provider_workout_pushes" USING "btree" ("athlete_id", "provider", "scheduled_date");



CREATE INDEX "retours_votes_user_id_fk_idx" ON "public"."retours_votes" USING "btree" ("user_id");



CREATE INDEX "roadmap_items_created_by_fk_idx" ON "public"."roadmap_items" USING "btree" ("created_by");



CREATE INDEX "roadmap_items_phase_id_fk_idx" ON "public"."roadmap_items" USING "btree" ("phase_id");



CREATE INDEX "roadmap_phases_created_by_fk_idx" ON "public"."roadmap_phases" USING "btree" ("created_by");



CREATE INDEX "roadmap_votes_user_id_fk_idx" ON "public"."roadmap_votes" USING "btree" ("user_id");



CREATE INDEX "seasons_coach_id_fk_idx" ON "public"."seasons" USING "btree" ("coach_id");



CREATE INDEX "specific_blocks_quality_id_fk_idx" ON "public"."specific_blocks" USING "btree" ("quality_id");



CREATE INDEX "staff_invitations_athlete_idx" ON "public"."staff_invitations" USING "btree" ("athlete_id");



CREATE INDEX "staff_invitations_invited_by_fk_idx" ON "public"."staff_invitations" USING "btree" ("invited_by");



CREATE INDEX "staff_invitations_used_by_fk_idx" ON "public"."staff_invitations" USING "btree" ("used_by");



CREATE INDEX "test_definitions_created_by_fk_idx" ON "public"."test_definitions" USING "btree" ("created_by");



CREATE INDEX "test_results_test_session_id_fk_idx" ON "public"."test_results" USING "btree" ("test_session_id");



CREATE INDEX "test_sessions_planning_block_id_fk_idx" ON "public"."test_sessions" USING "btree" ("planning_block_id");



CREATE INDEX "tests_created_by_fk_idx" ON "public"."tests" USING "btree" ("created_by");



CREATE INDEX "training_methods_category_idx" ON "public"."training_methods" USING "btree" ("category");



CREATE INDEX "training_methods_created_by_idx" ON "public"."training_methods" USING "btree" ("created_by");



CREATE INDEX "training_methods_is_official_idx" ON "public"."training_methods" USING "btree" ("is_official");



CREATE INDEX "training_methods_scope_idx" ON "public"."training_methods" USING "btree" ("scope");



CREATE UNIQUE INDEX "uq_physical_qualities_coach_slug" ON "public"."physical_qualities" USING "btree" ("coach_id", "slug") WHERE ("coach_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_physical_qualities_global_slug" ON "public"."physical_qualities" USING "btree" ("slug") WHERE ("coach_id" IS NULL);



CREATE UNIQUE INDEX "uq_specific_sports_coach_slug" ON "public"."specific_sports" USING "btree" ("coach_id", "slug") WHERE ("coach_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_specific_sports_global_slug" ON "public"."specific_sports" USING "btree" ("slug") WHERE ("coach_id" IS NULL);



CREATE INDEX "user_consents_lookup_idx" ON "public"."user_consents" USING "btree" ("user_id", "purpose", "created_at" DESC);



CREATE INDEX "weekly_retours_coach_id_fk_idx" ON "public"."weekly_retours" USING "btree" ("coach_id");



CREATE OR REPLACE TRIGGER "activity_laps_ai_policy" BEFORE INSERT OR UPDATE OF "source" ON "public"."activity_laps" FOR EACH ROW EXECUTE FUNCTION "public"."apply_source_ai_policy"();



CREATE OR REPLACE TRIGGER "activity_plan_links_ai_policy" BEFORE INSERT OR UPDATE OF "source" ON "public"."activity_plan_links" FOR EACH ROW EXECUTE FUNCTION "public"."apply_source_ai_policy"();



CREATE OR REPLACE TRIGGER "activity_sets_ai_policy" BEFORE INSERT OR UPDATE OF "source" ON "public"."activity_sets" FOR EACH ROW EXECUTE FUNCTION "public"."apply_source_ai_policy"();



CREATE OR REPLACE TRIGGER "activity_streams_ai_policy" BEFORE INSERT OR UPDATE OF "source" ON "public"."activity_streams" FOR EACH ROW EXECUTE FUNCTION "public"."apply_source_ai_policy"();



CREATE OR REPLACE TRIGGER "activity_streams_zones" AFTER INSERT OR UPDATE OF "t", "hr", "timer" ON "public"."activity_streams" FOR EACH ROW EXECUTE FUNCTION "public"."tg_activity_streams_zones"();



CREATE OR REPLACE TRIGGER "activity_zone_summaries_ai_policy" BEFORE INSERT OR UPDATE OF "source" ON "public"."activity_zone_summaries" FOR EACH ROW EXECUTE FUNCTION "public"."apply_source_ai_policy"();



CREATE OR REPLACE TRIGGER "athlete_staff_before_insert" BEFORE INSERT ON "public"."athlete_staff" FOR EACH ROW EXECUTE FUNCTION "public"."athlete_staff_before_insert"();



CREATE OR REPLACE TRIGGER "athlete_staff_before_update" BEFORE UPDATE ON "public"."athlete_staff" FOR EACH ROW EXECUTE FUNCTION "public"."athlete_staff_before_update"();



CREATE OR REPLACE TRIGGER "athlete_test_values_propose_zones" AFTER INSERT OR UPDATE OF "value" ON "public"."athlete_test_values" FOR EACH ROW EXECUTE FUNCTION "public"."tg_test_values_propose_zones"();



CREATE OR REPLACE TRIGGER "citation_likes_sync" AFTER INSERT OR DELETE ON "public"."citation_likes" FOR EACH ROW EXECUTE FUNCTION "public"."citation_likes_sync"();



CREATE OR REPLACE TRIGGER "energy_session_assignments_plan_links" AFTER INSERT OR DELETE OR UPDATE OF "scheduled_date", "status", "activity_type", "distance_km", "actual_duration_min" ON "public"."energy_session_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."tg_plan_links_relink"();



CREATE OR REPLACE TRIGGER "health_sync_del" AFTER DELETE ON "public"."app_data" FOR EACH ROW WHEN (("old"."key" = ANY (ARRAY['asp:wh'::"text", 'asp:blockHistory'::"text", 'asp:wlog'::"text", 'asp:wmile'::"text", 'asp:bw'::"text"]))) EXECUTE FUNCTION "public"."health_app_data_sync"();



CREATE OR REPLACE TRIGGER "health_sync_ins" AFTER INSERT ON "public"."app_data" FOR EACH ROW WHEN (("new"."key" = ANY (ARRAY['asp:wh'::"text", 'asp:blockHistory'::"text", 'asp:wlog'::"text", 'asp:wmile'::"text", 'asp:bw'::"text"]))) EXECUTE FUNCTION "public"."health_app_data_sync"();



CREATE OR REPLACE TRIGGER "health_sync_upd" AFTER UPDATE ON "public"."app_data" FOR EACH ROW WHEN ((("old"."key" = ANY (ARRAY['asp:wh'::"text", 'asp:blockHistory'::"text", 'asp:wlog'::"text", 'asp:wmile'::"text", 'asp:bw'::"text"])) OR ("new"."key" = ANY (ARRAY['asp:wh'::"text", 'asp:blockHistory'::"text", 'asp:wlog'::"text", 'asp:wmile'::"text", 'asp:bw'::"text"])))) EXECUTE FUNCTION "public"."health_app_data_sync"();



CREATE OR REPLACE TRIGGER "hr_zone_models_refresh" AFTER INSERT OR UPDATE OF "status", "bounds", "valid_from" ON "public"."hr_zone_models" FOR EACH ROW EXECUTE FUNCTION "public"."tg_hr_zone_models_refresh"();



CREATE OR REPLACE TRIGGER "performance_logs_fczone_refresh" AFTER INSERT ON "public"."performance_logs" FOR EACH ROW EXECUTE FUNCTION "public"."tg_fczone_refresh"();



CREATE OR REPLACE TRIGGER "provider_activities_ai_policy" BEFORE INSERT OR UPDATE OF "source" ON "public"."provider_activities" FOR EACH ROW EXECUTE FUNCTION "public"."apply_source_ai_policy"();



CREATE OR REPLACE TRIGGER "provider_activities_ai_zz_garmin_device" BEFORE INSERT OR UPDATE ON "public"."provider_activities" FOR EACH ROW EXECUTE FUNCTION "public"."tg_activity_garmin_device_no_ai"();



CREATE OR REPLACE TRIGGER "provider_activities_plan_links" AFTER INSERT OR DELETE OR UPDATE OF "local_date", "sport", "distance_m", "duration_s", "started_at" ON "public"."provider_activities" FOR EACH ROW EXECUTE FUNCTION "public"."tg_plan_links_relink"();



CREATE OR REPLACE TRIGGER "provider_connections_forget_pushes" AFTER DELETE ON "public"."provider_connections" FOR EACH ROW EXECUTE FUNCTION "public"."provider_workout_pushes_forget"();



CREATE OR REPLACE TRIGGER "provider_connections_require_consent" BEFORE INSERT OR UPDATE OF "status", "athlete_id", "provider" ON "public"."provider_connections" FOR EACH ROW EXECUTE FUNCTION "public"."require_sync_consent"();



CREATE OR REPLACE TRIGGER "provider_connections_touch" BEFORE UPDATE ON "public"."provider_connections" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "provider_dailies_ai_policy" BEFORE INSERT OR UPDATE OF "source" ON "public"."provider_dailies" FOR EACH ROW EXECUTE FUNCTION "public"."apply_source_ai_policy"();



CREATE OR REPLACE TRIGGER "provider_intraday_ai_policy" BEFORE INSERT OR UPDATE OF "source" ON "public"."provider_intraday" FOR EACH ROW EXECUTE FUNCTION "public"."apply_source_ai_policy"();



CREATE OR REPLACE TRIGGER "provider_moveiq_ai_policy" BEFORE INSERT OR UPDATE OF "source" ON "public"."provider_moveiq" FOR EACH ROW EXECUTE FUNCTION "public"."apply_source_ai_policy"();



CREATE OR REPLACE TRIGGER "provider_raw_records_ai_policy" BEFORE INSERT OR UPDATE OF "source" ON "public"."provider_raw_records" FOR EACH ROW EXECUTE FUNCTION "public"."apply_source_ai_policy"();



CREATE OR REPLACE TRIGGER "provider_raw_records_touch" BEFORE UPDATE ON "public"."provider_raw_records" FOR EACH ROW EXECUTE FUNCTION "public"."provider_raw_records_touch"();



CREATE OR REPLACE TRIGGER "provider_tokens_drop_secrets" AFTER DELETE ON "public"."provider_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."provider_tokens_drop_secrets"();



CREATE OR REPLACE TRIGGER "set_app_feedback_updated_at" BEFORE UPDATE ON "public"."app_feedback" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_athlete_profile_items_updated_at" BEFORE UPDATE ON "public"."athlete_profile_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_athlete_test_results_updated_at" BEFORE UPDATE ON "public"."athlete_test_results" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_day_themes_updated_at" BEFORE UPDATE ON "public"."day_themes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_docs_updated_at" BEFORE UPDATE ON "public"."docs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_exercises_updated_at" BEFORE UPDATE ON "public"."exercises" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_medical_entries_updated_at" BEFORE UPDATE ON "public"."medical_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_medical_history_updated_at" BEFORE UPDATE ON "public"."medical_history" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_roadmap_items_updated_at" BEFORE UPDATE ON "public"."roadmap_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_roadmap_phases_updated_at" BEFORE UPDATE ON "public"."roadmap_phases" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_test_definitions_updated_at" BEFORE UPDATE ON "public"."test_definitions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_test_sessions_updated_at" BEFORE UPDATE ON "public"."test_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_training_methods_updated_at" BEFORE UPDATE ON "public"."training_methods" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_weekly_retours_updated_at" BEFORE UPDATE ON "public"."weekly_retours" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_workout_exercise_comments_updated_at" BEFORE UPDATE ON "public"."workout_exercise_comments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_workout_logs_updated_at" BEFORE UPDATE ON "public"."workout_logs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "staff_invitations_before_insert" BEFORE INSERT ON "public"."staff_invitations" FOR EACH ROW EXECUTE FUNCTION "public"."staff_invitations_before_insert"();



CREATE OR REPLACE TRIGGER "test_sessions_plan_links" AFTER INSERT OR DELETE OR UPDATE OF "date", "type" ON "public"."test_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."tg_plan_links_relink"();



CREATE OR REPLACE TRIGGER "trg_drop_co_coach_on_coach_change" AFTER UPDATE OF "coach_id" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."drop_co_coach_on_coach_change"();



CREATE OR REPLACE TRIGGER "trg_energy_assignments_updated_at" BEFORE UPDATE ON "public"."energy_session_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_energy_sessions_updated_at" BEFORE UPDATE ON "public"."energy_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_enforce_min_age_on_signup" BEFORE INSERT OR UPDATE OF "is_pending" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_min_age_on_signup"();



CREATE OR REPLACE TRIGGER "trg_guard_co_coach_profile_update" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."guard_co_coach_profile_update"();



CREATE OR REPLACE TRIGGER "trg_guard_profile_privileged" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."guard_profile_privileged_fields"();



CREATE OR REPLACE TRIGGER "trg_hyrox_race_plans_updated_at" BEFORE UPDATE ON "public"."hyrox_race_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_hyrox_results_updated_at" BEFORE UPDATE ON "public"."hyrox_results" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_hyrox_test_analyses_freeze" BEFORE UPDATE ON "public"."hyrox_test_analyses" FOR EACH ROW EXECUTE FUNCTION "public"."hyrox_test_analyses_freeze"();



CREATE OR REPLACE TRIGGER "trg_hyrox_test_analyses_updated_at" BEFORE UPDATE ON "public"."hyrox_test_analyses" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_hyrox_test_axes_drafts_updated_at" BEFORE UPDATE ON "public"."hyrox_test_axes_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_performance_logs_normalize_name" BEFORE INSERT OR UPDATE OF "metric_name" ON "public"."performance_logs" FOR EACH ROW EXECUTE FUNCTION "public"."performance_logs_normalize_name"();



CREATE OR REPLACE TRIGGER "trg_prevent_flag_update" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_flag_self_update"();



CREATE OR REPLACE TRIGGER "trg_prevent_hyrox_flag_update" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_hyrox_flag_self_update"();



CREATE OR REPLACE TRIGGER "trg_specific_blocks_updated_at" BEFORE UPDATE ON "public"."specific_blocks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_extrap_perf" AFTER INSERT OR UPDATE ON "public"."athlete_test_values" FOR EACH ROW EXECUTE FUNCTION "public"."sync_extrap_to_performance"();



CREATE OR REPLACE TRIGGER "trg_sync_test_session" AFTER INSERT OR UPDATE ON "public"."test_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_test_session_to_results"();



CREATE OR REPLACE TRIGGER "user_consents_halt_sync" AFTER INSERT ON "public"."user_consents" FOR EACH ROW EXECUTE FUNCTION "public"."halt_sync_on_consent_withdrawal"();



CREATE OR REPLACE TRIGGER "workout_logs_plan_links" AFTER INSERT OR DELETE OR UPDATE OF "scheduled_date", "status", "duration_s" ON "public"."workout_logs" FOR EACH ROW EXECUTE FUNCTION "public"."tg_plan_links_relink"();



ALTER TABLE ONLY "public"."activity_laps"
    ADD CONSTRAINT "activity_laps_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."provider_activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_laps"
    ADD CONSTRAINT "activity_laps_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_laps"
    ADD CONSTRAINT "activity_laps_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activity_plan_links"
    ADD CONSTRAINT "activity_plan_links_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."provider_activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_plan_links"
    ADD CONSTRAINT "activity_plan_links_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_plan_links"
    ADD CONSTRAINT "activity_plan_links_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activity_sets"
    ADD CONSTRAINT "activity_sets_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."provider_activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_sets"
    ADD CONSTRAINT "activity_sets_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_streams"
    ADD CONSTRAINT "activity_streams_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."provider_activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_streams"
    ADD CONSTRAINT "activity_streams_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_zone_summaries"
    ADD CONSTRAINT "activity_zone_summaries_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."provider_activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_zone_summaries"
    ADD CONSTRAINT "activity_zone_summaries_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_zone_summaries"
    ADD CONSTRAINT "activity_zone_summaries_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "public"."hr_zone_models"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."app_data"
    ADD CONSTRAINT "app_data_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_feedback"
    ADD CONSTRAINT "app_feedback_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_update_reads"
    ADD CONSTRAINT "app_update_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_claims"
    ADD CONSTRAINT "athlete_claims_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_co_coaches"
    ADD CONSTRAINT "athlete_co_coaches_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."athlete_co_coaches"
    ADD CONSTRAINT "athlete_co_coaches_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_co_coaches"
    ADD CONSTRAINT "athlete_co_coaches_co_coach_id_fkey" FOREIGN KEY ("co_coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_life_events"
    ADD CONSTRAINT "athlete_life_events_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_profile_items"
    ADD CONSTRAINT "athlete_profile_items_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_staff"
    ADD CONSTRAINT "athlete_staff_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."athlete_staff"
    ADD CONSTRAINT "athlete_staff_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_staff"
    ADD CONSTRAINT "athlete_staff_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."athlete_staff"
    ADD CONSTRAINT "athlete_staff_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_test_results"
    ADD CONSTRAINT "athlete_test_results_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_test_results"
    ADD CONSTRAINT "athlete_test_results_test_definition_id_fkey" FOREIGN KEY ("test_definition_id") REFERENCES "public"."test_definitions"("id");



ALTER TABLE ONLY "public"."athlete_test_values"
    ADD CONSTRAINT "athlete_test_values_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "public"."athlete_test_results"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_test_values"
    ADD CONSTRAINT "athlete_test_values_variable_id_fkey" FOREIGN KEY ("variable_id") REFERENCES "public"."test_variables"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."body_weight_goals"
    ADD CONSTRAINT "body_weight_goals_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."body_weight_logs"
    ADD CONSTRAINT "body_weight_logs_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."body_weight_milestones"
    ADD CONSTRAINT "body_weight_milestones_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."citation_likes"
    ADD CONSTRAINT "citation_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_api_access_log"
    ADD CONSTRAINT "coach_api_access_log_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_api_access_log"
    ADD CONSTRAINT "coach_api_access_log_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_api_access_log"
    ADD CONSTRAINT "coach_api_access_log_key_id_fkey" FOREIGN KEY ("key_id") REFERENCES "public"."coach_api_keys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coach_api_drafts"
    ADD CONSTRAINT "coach_api_drafts_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_api_drafts"
    ADD CONSTRAINT "coach_api_drafts_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_api_drafts"
    ADD CONSTRAINT "coach_api_drafts_key_id_fkey" FOREIGN KEY ("key_id") REFERENCES "public"."coach_api_keys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coach_api_keys"
    ADD CONSTRAINT "coach_api_keys_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_api_rate"
    ADD CONSTRAINT "coach_api_rate_key_id_fkey" FOREIGN KEY ("key_id") REFERENCES "public"."coach_api_keys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_planning_block_id_fkey" FOREIGN KEY ("planning_block_id") REFERENCES "public"."planning_blocks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cycles"
    ADD CONSTRAINT "cycles_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cycles"
    ADD CONSTRAINT "cycles_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cycles"
    ADD CONSTRAINT "cycles_mesocycle_id_fkey" FOREIGN KEY ("mesocycle_id") REFERENCES "public"."mesocycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."day_themes"
    ADD CONSTRAINT "day_themes_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."day_themes"
    ADD CONSTRAINT "day_themes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doc_assignments"
    ADD CONSTRAINT "doc_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."doc_assignments"
    ADD CONSTRAINT "doc_assignments_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doc_assignments"
    ADD CONSTRAINT "doc_assignments_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doc_comments"
    ADD CONSTRAINT "doc_comments_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doc_comments"
    ADD CONSTRAINT "doc_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doc_comments"
    ADD CONSTRAINT "doc_comments_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doc_schedule"
    ADD CONSTRAINT "doc_schedule_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."doc_schedule"
    ADD CONSTRAINT "doc_schedule_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doc_schedule"
    ADD CONSTRAINT "doc_schedule_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."docs"
    ADD CONSTRAINT "docs_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."docs"
    ADD CONSTRAINT "docs_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."docs"
    ADD CONSTRAINT "docs_origin_id_fkey" FOREIGN KEY ("origin_id") REFERENCES "public"."docs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."docs"
    ADD CONSTRAINT "docs_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."energy_session_assignments"
    ADD CONSTRAINT "energy_session_assignments_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."energy_session_assignments"
    ADD CONSTRAINT "energy_session_assignments_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."energy_session_assignments"
    ADD CONSTRAINT "energy_session_assignments_energy_session_id_fkey" FOREIGN KEY ("energy_session_id") REFERENCES "public"."energy_sessions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."energy_session_assignments"
    ADD CONSTRAINT "energy_session_assignments_microcycle_id_fkey" FOREIGN KEY ("microcycle_id") REFERENCES "public"."microcycles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."energy_sessions"
    ADD CONSTRAINT "energy_sessions_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."energy_sessions"
    ADD CONSTRAINT "energy_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."energy_sessions"
    ADD CONSTRAINT "energy_sessions_parent_session_id_fkey" FOREIGN KEY ("parent_session_id") REFERENCES "public"."energy_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."energy_sessions"
    ADD CONSTRAINT "energy_sessions_quality_id_fkey" FOREIGN KEY ("quality_id") REFERENCES "public"."physical_qualities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."energy_sessions"
    ADD CONSTRAINT "energy_sessions_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "public"."specific_sports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."energy_sessions"
    ADD CONSTRAINT "energy_sessions_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."exercise_pr_logs"
    ADD CONSTRAINT "exercise_pr_logs_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."habit_logs"
    ADD CONSTRAINT "habit_logs_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."habit_logs"
    ADD CONSTRAINT "habit_logs_habit_id_fkey" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."habits"
    ADD CONSTRAINT "habits_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."habits"
    ADD CONSTRAINT "habits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."health_sync_errors"
    ADD CONSTRAINT "health_sync_errors_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hr_zone_models"
    ADD CONSTRAINT "hr_zone_models_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hr_zone_models"
    ADD CONSTRAINT "hr_zone_models_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hr_zone_models"
    ADD CONSTRAINT "hr_zone_models_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hr_zone_models"
    ADD CONSTRAINT "hr_zone_models_test_result_id_fkey" FOREIGN KEY ("test_result_id") REFERENCES "public"."athlete_test_results"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hyrox_axes_params"
    ADD CONSTRAINT "hyrox_axes_params_version_fkey" FOREIGN KEY ("version") REFERENCES "public"."hyrox_test_grid_versions"("version") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."hyrox_race_plans"
    ADD CONSTRAINT "hyrox_race_plans_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hyrox_race_plans"
    ADD CONSTRAINT "hyrox_race_plans_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hyrox_race_plans"
    ADD CONSTRAINT "hyrox_race_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hyrox_race_plans"
    ADD CONSTRAINT "hyrox_race_plans_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "public"."hyrox_results"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hyrox_results"
    ADD CONSTRAINT "hyrox_results_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hyrox_results"
    ADD CONSTRAINT "hyrox_results_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hyrox_results"
    ADD CONSTRAINT "hyrox_results_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hyrox_test_analyses"
    ADD CONSTRAINT "hyrox_test_analyses_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hyrox_test_analyses"
    ADD CONSTRAINT "hyrox_test_analyses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hyrox_test_analyses"
    ADD CONSTRAINT "hyrox_test_analyses_grid_version_fkey" FOREIGN KEY ("grid_version") REFERENCES "public"."hyrox_test_grid_versions"("version") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."hyrox_test_analyses"
    ADD CONSTRAINT "hyrox_test_analyses_recalculated_from_fkey" FOREIGN KEY ("recalculated_from") REFERENCES "public"."hyrox_test_analyses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hyrox_test_analyses"
    ADD CONSTRAINT "hyrox_test_analyses_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hyrox_test_axes_drafts"
    ADD CONSTRAINT "hyrox_test_axes_drafts_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "public"."hyrox_test_analyses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hyrox_test_axes_drafts"
    ADD CONSTRAINT "hyrox_test_axes_drafts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hyrox_test_grid_versions"
    ADD CONSTRAINT "hyrox_test_grid_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hyrox_test_grids"
    ADD CONSTRAINT "hyrox_test_grids_version_fkey" FOREIGN KEY ("version") REFERENCES "public"."hyrox_test_grid_versions"("version") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."hyrox_test_params"
    ADD CONSTRAINT "hyrox_test_params_version_fkey" FOREIGN KEY ("version") REFERENCES "public"."hyrox_test_grid_versions"("version") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."hyrox_work_axes_rules"
    ADD CONSTRAINT "hyrox_work_axes_rules_version_fkey" FOREIGN KEY ("version") REFERENCES "public"."hyrox_test_grid_versions"("version") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."macrocycles"
    ADD CONSTRAINT "macrocycles_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."macrocycles"
    ADD CONSTRAINT "macrocycles_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."measurement_logs"
    ADD CONSTRAINT "measurement_logs_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."medical_attachments"
    ADD CONSTRAINT "medical_attachments_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."medical_attachments"
    ADD CONSTRAINT "medical_attachments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."medical_attachments"
    ADD CONSTRAINT "medical_attachments_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."medical_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."medical_entries"
    ADD CONSTRAINT "medical_entries_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."medical_entries"
    ADD CONSTRAINT "medical_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."medical_history"
    ADD CONSTRAINT "medical_history_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mesocycles"
    ADD CONSTRAINT "mesocycles_macrocycle_id_fkey" FOREIGN KEY ("macrocycle_id") REFERENCES "public"."macrocycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."microcycles"
    ADD CONSTRAINT "microcycles_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."performance_logs"
    ADD CONSTRAINT "performance_logs_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."performance_logs"
    ADD CONSTRAINT "performance_logs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."performance_logs"
    ADD CONSTRAINT "performance_logs_test_session_id_fkey" FOREIGN KEY ("test_session_id") REFERENCES "public"."test_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."performance_notifications"
    ADD CONSTRAINT "performance_notifications_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."performance_notifications"
    ADD CONSTRAINT "performance_notifications_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."performance_notifications"
    ADD CONSTRAINT "performance_notifications_performance_log_id_fkey" FOREIGN KEY ("performance_log_id") REFERENCES "public"."performance_logs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."physical_qualities"
    ADD CONSTRAINT "physical_qualities_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planning_blocks"
    ADD CONSTRAINT "planning_blocks_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planning_blocks"
    ADD CONSTRAINT "planning_blocks_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planning_blocks"
    ADD CONSTRAINT "planning_blocks_parent_block_id_fkey" FOREIGN KEY ("parent_block_id") REFERENCES "public"."planning_blocks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."planning_blocks"
    ADD CONSTRAINT "planning_blocks_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



COMMENT ON CONSTRAINT "profiles_id_fkey" ON "public"."profiles" IS 'Supprimer l''utilisateur auth efface le profil, et en cascade toutes ses données applicatives. Sans cette contrainte le droit à l''effacement était inopérant.';



ALTER TABLE ONLY "public"."provider_activities"
    ADD CONSTRAINT "provider_activities_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_connections"
    ADD CONSTRAINT "provider_connections_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_dailies"
    ADD CONSTRAINT "provider_dailies_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_fit_quota"
    ADD CONSTRAINT "provider_fit_quota_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_intraday"
    ADD CONSTRAINT "provider_intraday_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_moveiq"
    ADD CONSTRAINT "provider_moveiq_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_oauth_states"
    ADD CONSTRAINT "provider_oauth_states_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_raw_records"
    ADD CONSTRAINT "provider_raw_records_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_tokens"
    ADD CONSTRAINT "provider_tokens_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_workout_pushes"
    ADD CONSTRAINT "provider_workout_pushes_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retours"
    ADD CONSTRAINT "retours_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retours_votes"
    ADD CONSTRAINT "retours_votes_retour_id_fkey" FOREIGN KEY ("retour_id") REFERENCES "public"."retours"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retours_votes"
    ADD CONSTRAINT "retours_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roadmap_items"
    ADD CONSTRAINT "roadmap_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."roadmap_items"
    ADD CONSTRAINT "roadmap_items_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "public"."roadmap_phases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roadmap_phases"
    ADD CONSTRAINT "roadmap_phases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."roadmap_votes"
    ADD CONSTRAINT "roadmap_votes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."roadmap_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roadmap_votes"
    ADD CONSTRAINT "roadmap_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seasons"
    ADD CONSTRAINT "seasons_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seasons"
    ADD CONSTRAINT "seasons_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."specific_blocks"
    ADD CONSTRAINT "specific_blocks_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."specific_blocks"
    ADD CONSTRAINT "specific_blocks_quality_id_fkey" FOREIGN KEY ("quality_id") REFERENCES "public"."physical_qualities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."specific_blocks"
    ADD CONSTRAINT "specific_blocks_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "public"."specific_sports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."specific_sports"
    ADD CONSTRAINT "specific_sports_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_invitations"
    ADD CONSTRAINT "staff_invitations_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_invitations"
    ADD CONSTRAINT "staff_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_invitations"
    ADD CONSTRAINT "staff_invitations_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."test_definitions"
    ADD CONSTRAINT "test_definitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."test_results"
    ADD CONSTRAINT "test_results_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_results"
    ADD CONSTRAINT "test_results_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."test_results"
    ADD CONSTRAINT "test_results_test_session_id_fkey" FOREIGN KEY ("test_session_id") REFERENCES "public"."test_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."test_sessions"
    ADD CONSTRAINT "test_sessions_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_sessions"
    ADD CONSTRAINT "test_sessions_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."test_sessions"
    ADD CONSTRAINT "test_sessions_planning_block_id_fkey" FOREIGN KEY ("planning_block_id") REFERENCES "public"."planning_blocks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."test_variables"
    ADD CONSTRAINT "test_variables_test_definition_id_fkey" FOREIGN KEY ("test_definition_id") REFERENCES "public"."test_definitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tests"
    ADD CONSTRAINT "tests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."training_methods"
    ADD CONSTRAINT "training_methods_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_consents"
    ADD CONSTRAINT "user_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_retours"
    ADD CONSTRAINT "weekly_retours_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_retours"
    ADD CONSTRAINT "weekly_retours_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wellness_entries"
    ADD CONSTRAINT "wellness_entries_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_exercise_comments"
    ADD CONSTRAINT "workout_exercise_comments_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workout_exercise_comments"
    ADD CONSTRAINT "workout_exercise_comments_workout_log_id_fkey" FOREIGN KEY ("workout_log_id") REFERENCES "public"."workout_logs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_logs"
    ADD CONSTRAINT "workout_logs_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_logs"
    ADD CONSTRAINT "workout_logs_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workout_logs"
    ADD CONSTRAINT "workout_logs_microcycle_id_fkey" FOREIGN KEY ("microcycle_id") REFERENCES "public"."microcycles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workout_rpe"
    ADD CONSTRAINT "workout_rpe_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_rpe"
    ADD CONSTRAINT "workout_rpe_workout_log_id_fkey" FOREIGN KEY ("workout_log_id") REFERENCES "public"."workout_logs"("id") ON DELETE CASCADE;



CREATE POLICY "Coach can unlink own athletes" ON "public"."profiles" FOR UPDATE USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" IS NULL));



CREATE POLICY "Création retour par l'athlète lui-même" ON "public"."retours" FOR INSERT WITH CHECK (("auth"."uid"() = "athlete_id"));



CREATE POLICY "Lecture votes pour utilisateurs authentifiés" ON "public"."retours_votes" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Mise à jour vote par l'utilisateur lui-même" ON "public"."retours_votes" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Service write" ON "public"."exercises" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Suppression par l'auteur ou un admin" ON "public"."retours" FOR DELETE USING ((("auth"."uid"() = "athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "Suppression vote par l'utilisateur lui-même" ON "public"."retours_votes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Vote par l'utilisateur lui-même" ON "public"."retours_votes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "acc_select" ON "public"."athlete_co_coaches" FOR SELECT USING ((("athlete_id" = "auth"."uid"()) OR ("co_coach_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "athlete_co_coaches"."athlete_id") AND ("p"."coach_id" = "auth"."uid"()))))));



ALTER TABLE "public"."account_deletions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_laps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_laps_read" ON "public"."activity_laps" FOR SELECT TO "authenticated" USING ("public"."activity_detail_visible"("athlete_id", "source"));



ALTER TABLE "public"."activity_plan_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_plan_links_read" ON "public"."activity_plan_links" FOR SELECT TO "authenticated" USING ("public"."activity_detail_visible"("athlete_id", "source"));



ALTER TABLE "public"."activity_sets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_sets_read" ON "public"."activity_sets" FOR SELECT TO "authenticated" USING ("public"."activity_detail_visible"("athlete_id", "source"));



ALTER TABLE "public"."activity_streams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_streams_read" ON "public"."activity_streams" FOR SELECT TO "authenticated" USING ("public"."activity_detail_visible"("athlete_id", "source"));



ALTER TABLE "public"."activity_zone_summaries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_zone_summaries_read" ON "public"."activity_zone_summaries" FOR SELECT TO "authenticated" USING ("public"."activity_detail_visible"("athlete_id", "source"));



CREATE POLICY "api_all_coach" ON "public"."athlete_profile_items" USING (("public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))))) WITH CHECK (("public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "api_select" ON "public"."athlete_profile_items" FOR SELECT USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



ALTER TABLE "public"."app_data" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_data_coach" ON "public"."app_data" USING ("public"."is_coach_of"("athlete_id"));



CREATE POLICY "app_data_self" ON "public"."app_data" USING (("athlete_id" = "auth"."uid"()));



ALTER TABLE "public"."app_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_feedback_delete" ON "public"."app_feedback" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."is_certified_coach" = true) OR ("p"."is_admin" = true))))));



CREATE POLICY "app_feedback_insert_own" ON "public"."app_feedback" FOR INSERT WITH CHECK (("author_id" = "auth"."uid"()));



CREATE POLICY "app_feedback_select" ON "public"."app_feedback" FOR SELECT USING ((("author_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."is_certified_coach" = true) OR ("p"."is_admin" = true)))))));



CREATE POLICY "app_feedback_update" ON "public"."app_feedback" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."is_certified_coach" = true) OR ("p"."is_admin" = true))))));



ALTER TABLE "public"."app_update_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_update_reads_own_insert" ON "public"."app_update_reads" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "app_update_reads_own_select" ON "public"."app_update_reads" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."athlete_claims" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "athlete_claims_select_coach" ON "public"."athlete_claims" FOR SELECT TO "authenticated" USING ("public"."is_coach_of"("athlete_id"));



ALTER TABLE "public"."athlete_co_coaches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."athlete_life_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "athlete_own_measurements" ON "public"."measurement_logs" TO "authenticated" USING (("athlete_id" = "auth"."uid"())) WITH CHECK (("athlete_id" = "auth"."uid"()));



CREATE POLICY "athlete_own_medical" ON "public"."medical_history" USING (("athlete_id" = "auth"."uid"())) WITH CHECK (("athlete_id" = "auth"."uid"()));



CREATE POLICY "athlete_own_prs" ON "public"."exercise_pr_logs" USING (("athlete_id" = "auth"."uid"()));



CREATE POLICY "athlete_own_rpe" ON "public"."workout_rpe" USING (("athlete_id" = "auth"."uid"()));



ALTER TABLE "public"."athlete_profile_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."athlete_staff" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "athlete_staff_select" ON "public"."athlete_staff" FOR SELECT TO "authenticated" USING ((("staff_id" = "auth"."uid"()) OR ("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id")));



CREATE POLICY "athlete_staff_update" ON "public"."athlete_staff" FOR UPDATE TO "authenticated" USING ((("staff_id" = "auth"."uid"()) OR ("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id"))) WITH CHECK ((("staff_id" = "auth"."uid"()) OR ("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id")));



ALTER TABLE "public"."athlete_test_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."athlete_test_values" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "atr_delete" ON "public"."athlete_test_results" FOR DELETE USING (("public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "atr_insert" ON "public"."athlete_test_results" FOR INSERT WITH CHECK (("public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "atr_select" ON "public"."athlete_test_results" FOR SELECT USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "atr_update" ON "public"."athlete_test_results" FOR UPDATE USING (("public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "atv_delete" ON "public"."athlete_test_values" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."athlete_test_results" "r"
  WHERE (("r"."id" = "athlete_test_values"."result_id") AND ("public"."is_coach_of"("r"."athlete_id") OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))))))));



CREATE POLICY "atv_insert" ON "public"."athlete_test_values" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."athlete_test_results" "r"
  WHERE (("r"."id" = "athlete_test_values"."result_id") AND ("public"."is_coach_of"("r"."athlete_id") OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))))))));



CREATE POLICY "atv_select" ON "public"."athlete_test_values" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."athlete_test_results" "r"
  WHERE (("r"."id" = "athlete_test_values"."result_id") AND (("r"."athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("r"."athlete_id") OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))))))));



CREATE POLICY "atv_update" ON "public"."athlete_test_values" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."athlete_test_results" "r"
  WHERE (("r"."id" = "athlete_test_values"."result_id") AND ("public"."is_coach_of"("r"."athlete_id") OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))))))));



ALTER TABLE "public"."body_weight_goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "body_weight_goals_coach" ON "public"."body_weight_goals" FOR SELECT TO "authenticated" USING ("public"."is_coach_of"("athlete_id"));



CREATE POLICY "body_weight_goals_self" ON "public"."body_weight_goals" FOR SELECT TO "authenticated" USING (("athlete_id" = "auth"."uid"()));



CREATE POLICY "body_weight_goals_staff" ON "public"."body_weight_goals" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'nutrition'::"text", 'read'::"text"));



ALTER TABLE "public"."body_weight_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "body_weight_logs_coach" ON "public"."body_weight_logs" FOR SELECT TO "authenticated" USING ("public"."is_coach_of"("athlete_id"));



CREATE POLICY "body_weight_logs_self" ON "public"."body_weight_logs" FOR SELECT TO "authenticated" USING (("athlete_id" = "auth"."uid"()));



CREATE POLICY "body_weight_logs_staff" ON "public"."body_weight_logs" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'nutrition'::"text", 'read'::"text"));



ALTER TABLE "public"."body_weight_milestones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "body_weight_milestones_coach" ON "public"."body_weight_milestones" FOR SELECT TO "authenticated" USING ("public"."is_coach_of"("athlete_id"));



CREATE POLICY "body_weight_milestones_self" ON "public"."body_weight_milestones" FOR SELECT TO "authenticated" USING (("athlete_id" = "auth"."uid"()));



CREATE POLICY "body_weight_milestones_staff" ON "public"."body_weight_milestones" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'nutrition'::"text", 'read'::"text"));



ALTER TABLE "public"."citation_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "citation_likes: ajouter les siens" ON "public"."citation_likes" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "citation_likes: lire les siens" ON "public"."citation_likes" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "citation_likes: retirer les siens" ON "public"."citation_likes" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."citation_stats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "citation_stats: lecture" ON "public"."citation_stats" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."coach_api_access_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_api_access_log_select_own" ON "public"."coach_api_access_log" FOR SELECT TO "authenticated" USING (("coach_id" = "auth"."uid"()));



ALTER TABLE "public"."coach_api_drafts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_api_drafts_decide_own" ON "public"."coach_api_drafts" FOR UPDATE TO "authenticated" USING ((("coach_id" = "auth"."uid"()) AND ("status" = 'pending'::"text"))) WITH CHECK ((("coach_id" = "auth"."uid"()) AND ("status" = 'rejected'::"text")));



CREATE POLICY "coach_api_drafts_select_own" ON "public"."coach_api_drafts" FOR SELECT TO "authenticated" USING (("coach_id" = "auth"."uid"()));



ALTER TABLE "public"."coach_api_keys" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_api_keys_insert_own" ON "public"."coach_api_keys" FOR INSERT TO "authenticated" WITH CHECK ((("coach_id" = "auth"."uid"()) AND ("revoked_at" IS NULL) AND ("last_used_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['coach'::"text", 'coach_athlete'::"text"])))))));



CREATE POLICY "coach_api_keys_revoke_own" ON "public"."coach_api_keys" FOR UPDATE TO "authenticated" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "coach_api_keys_select_own" ON "public"."coach_api_keys" FOR SELECT TO "authenticated" USING (("coach_id" = "auth"."uid"()));



ALTER TABLE "public"."coach_api_rate" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_delete_athlete_prs" ON "public"."exercise_pr_logs" FOR DELETE USING ("public"."is_coach_of"("athlete_id"));



CREATE POLICY "coach_insert_athlete_prs" ON "public"."exercise_pr_logs" FOR INSERT WITH CHECK ("public"."is_coach_of"("athlete_id"));



CREATE POLICY "coach_read_athlete_rpe" ON "public"."workout_rpe" FOR SELECT USING ("public"."is_coach_of"("athlete_id"));



CREATE POLICY "coach_read_measurements" ON "public"."measurement_logs" FOR SELECT USING ("public"."is_coach_of"("athlete_id"));



CREATE POLICY "coach_sees_athlete_prs" ON "public"."exercise_pr_logs" FOR SELECT USING ("public"."is_coach_of"("athlete_id"));



CREATE POLICY "coach_write_athlete_medical" ON "public"."medical_history" USING ("public"."is_coach_of"("athlete_id")) WITH CHECK ("public"."is_coach_of"("athlete_id"));



CREATE POLICY "coaches_can_update_athlete_profiles" ON "public"."profiles" FOR UPDATE USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



ALTER TABLE "public"."competitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "competitions_delete" ON "public"."competitions" FOR DELETE USING ("public"."can_coach_athlete"("athlete_id"));



CREATE POLICY "competitions_delete_athlete" ON "public"."competitions" FOR DELETE USING (("athlete_id" = "auth"."uid"()));



CREATE POLICY "competitions_insert" ON "public"."competitions" FOR INSERT WITH CHECK ("public"."can_coach_athlete"("athlete_id"));



CREATE POLICY "competitions_insert_athlete" ON "public"."competitions" FOR INSERT WITH CHECK (("athlete_id" = "auth"."uid"()));



CREATE POLICY "competitions_select" ON "public"."competitions" FOR SELECT USING ((("athlete_id" = "auth"."uid"()) OR "public"."can_coach_athlete"("athlete_id")));



CREATE POLICY "competitions_update" ON "public"."competitions" FOR UPDATE USING ("public"."can_coach_athlete"("athlete_id")) WITH CHECK ("public"."can_coach_athlete"("athlete_id"));



CREATE POLICY "competitions_update_athlete" ON "public"."competitions" FOR UPDATE USING (("athlete_id" = "auth"."uid"())) WITH CHECK (("athlete_id" = "auth"."uid"()));



ALTER TABLE "public"."cycles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cycles_delete" ON "public"."cycles" FOR DELETE USING ("public"."can_coach_athlete"(COALESCE("athlete_id", "public"."mesocycle_athlete_id"("mesocycle_id"))));



CREATE POLICY "cycles_insert" ON "public"."cycles" FOR INSERT WITH CHECK ((("athlete_id" = "auth"."uid"()) OR "public"."can_coach_athlete"(COALESCE("athlete_id", "public"."mesocycle_athlete_id"("mesocycle_id")))));



CREATE POLICY "cycles_select" ON "public"."cycles" FOR SELECT USING (((COALESCE("athlete_id", "public"."mesocycle_athlete_id"("mesocycle_id")) = "auth"."uid"()) OR "public"."can_coach_athlete"(COALESCE("athlete_id", "public"."mesocycle_athlete_id"("mesocycle_id")))));



CREATE POLICY "cycles_update" ON "public"."cycles" FOR UPDATE USING ("public"."can_coach_athlete"(COALESCE("athlete_id", "public"."mesocycle_athlete_id"("mesocycle_id")))) WITH CHECK ("public"."can_coach_athlete"(COALESCE("athlete_id", "public"."mesocycle_athlete_id"("mesocycle_id"))));



ALTER TABLE "public"."data_source_policies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "data_source_policies_read" ON "public"."data_source_policies" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."day_themes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."doc_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "doc_assignments_athlete_select" ON "public"."doc_assignments" FOR SELECT TO "authenticated" USING (("athlete_id" = "auth"."uid"()));



CREATE POLICY "doc_assignments_coach_all" ON "public"."doc_assignments" TO "authenticated" USING ("public"."is_coach_of"("athlete_id")) WITH CHECK ("public"."is_coach_of"("athlete_id"));



ALTER TABLE "public"."doc_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "doc_comments_delete_own" ON "public"."doc_comments" FOR DELETE TO "authenticated" USING (("author_id" = "auth"."uid"()));



CREATE POLICY "doc_comments_insert" ON "public"."doc_comments" FOR INSERT TO "authenticated" WITH CHECK ((("author_id" = "auth"."uid"()) AND (("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id")) AND "public"."can_read_doc"("doc_id")));



CREATE POLICY "doc_comments_select" ON "public"."doc_comments" FOR SELECT TO "authenticated" USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id")));



ALTER TABLE "public"."doc_schedule" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "doc_schedule_delete" ON "public"."doc_schedule" FOR DELETE TO "authenticated" USING (("public"."is_coach_of"("athlete_id") OR "public"."staff_can_edit"("athlete_id", 'fiches'::"text", "added_by")));



CREATE POLICY "doc_schedule_insert" ON "public"."doc_schedule" FOR INSERT WITH CHECK ((("added_by" = "auth"."uid"()) AND (("public"."staff_can"("athlete_id", 'fiches'::"text", 'write'::"text") AND "public"."staff_doc_for_athlete"("doc_id", "athlete_id")) OR ("public"."is_coach_of"("athlete_id") AND (EXISTS ( SELECT 1
   FROM "public"."docs" "d"
  WHERE (("d"."id" = "doc_schedule"."doc_id") AND (("d"."coach_id" = "auth"."uid"()) OR "public"."is_athlete_coach"("doc_schedule"."athlete_id", "d"."coach_id")))))))));



CREATE POLICY "doc_schedule_select" ON "public"."doc_schedule" FOR SELECT TO "authenticated" USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR "public"."staff_can"("athlete_id", 'fiches'::"text", 'read'::"text")));



ALTER TABLE "public"."docs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "docs_athlete_delete" ON "public"."docs" FOR DELETE TO "authenticated" USING ((("athlete_id" = "auth"."uid"()) AND ("uploaded_by" = "auth"."uid"())));



CREATE POLICY "docs_athlete_insert" ON "public"."docs" FOR INSERT TO "authenticated" WITH CHECK ((("athlete_id" = "auth"."uid"()) AND ("uploaded_by" = "auth"."uid"()) AND ("is_self_service" = false) AND ("origin_id" IS NULL) AND ("coach_id" = "public"."my_coach_id"())));



CREATE POLICY "docs_coach_delete" ON "public"."docs" FOR DELETE USING ((("coach_id" = "auth"."uid"()) OR (("athlete_id" IS NOT NULL) AND "public"."is_coach_of"("athlete_id"))));



CREATE POLICY "docs_coach_insert" ON "public"."docs" FOR INSERT TO "authenticated" WITH CHECK ((("coach_id" = "auth"."uid"()) AND ("uploaded_by" = "auth"."uid"()) AND (("athlete_id" IS NULL) OR "public"."is_coach_of"("athlete_id"))));



CREATE POLICY "docs_coach_update" ON "public"."docs" FOR UPDATE USING ((("coach_id" = "auth"."uid"()) OR "public"."doc_for_my_athlete"("id"))) WITH CHECK ((("coach_id" = "auth"."uid"()) OR "public"."is_coach_partner"("coach_id")));



CREATE POLICY "docs_select" ON "public"."docs" FOR SELECT TO "authenticated" USING ((("coach_id" = "auth"."uid"()) OR ("uploaded_by" = "auth"."uid"()) OR ("athlete_id" = "auth"."uid"()) OR "public"."can_read_doc"("id")));



CREATE POLICY "dt_athlete_select" ON "public"."day_themes" FOR SELECT TO "authenticated" USING (("athlete_id" = "auth"."uid"()));



CREATE POLICY "dt_coach_all" ON "public"."day_themes" TO "authenticated" USING ((("coach_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id"))) WITH CHECK ((("coach_id" = "auth"."uid"()) AND (("athlete_id" IS NULL) OR "public"."is_coach_of"("athlete_id"))));



ALTER TABLE "public"."energy_session_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."energy_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "es_delete" ON "public"."energy_sessions" FOR DELETE USING ((("created_by" = "auth"."uid"()) OR (("athlete_id" IS NOT NULL) AND "public"."is_coach_of"("athlete_id"))));



CREATE POLICY "es_insert" ON "public"."energy_sessions" FOR INSERT TO "authenticated" WITH CHECK (("is_verified" = false));



CREATE POLICY "es_select" ON "public"."energy_sessions" FOR SELECT USING ((("is_public" = true) OR ("created_by" = "auth"."uid"()) OR ("athlete_id" = "auth"."uid"()) OR (("athlete_id" IS NOT NULL) AND "public"."is_coach_of"("athlete_id")) OR ("id" IN ( SELECT "a"."energy_session_id"
   FROM "public"."energy_session_assignments" "a"
  WHERE ("a"."athlete_id" = "auth"."uid"()))) OR ("id" IN ( SELECT "a"."energy_session_id"
   FROM "public"."energy_session_assignments" "a"
  WHERE "public"."is_coach_of"("a"."athlete_id")))));



CREATE POLICY "es_update_author" ON "public"."energy_sessions" FOR UPDATE USING ((("created_by" = "auth"."uid"()) OR (("athlete_id" IS NOT NULL) AND "public"."is_coach_of"("athlete_id")) OR ("id" IN ( SELECT "a"."energy_session_id"
   FROM "public"."energy_session_assignments" "a"
  WHERE "public"."is_coach_of"("a"."athlete_id"))))) WITH CHECK ((("created_by" = "auth"."uid"()) OR (("athlete_id" IS NOT NULL) AND "public"."is_coach_of"("athlete_id")) OR ("id" IN ( SELECT "a"."energy_session_id"
   FROM "public"."energy_session_assignments" "a"
  WHERE "public"."is_coach_of"("a"."athlete_id")))));



CREATE POLICY "es_update_certify" ON "public"."energy_sessions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."is_certified_coach" = true) OR ("profiles"."is_admin" = true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."is_certified_coach" = true) OR ("profiles"."is_admin" = true))))));



CREATE POLICY "esa_delete" ON "public"."energy_session_assignments" FOR DELETE TO "authenticated" USING (("public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "esa_insert" ON "public"."energy_session_assignments" FOR INSERT TO "authenticated" WITH CHECK ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "esa_select" ON "public"."energy_session_assignments" FOR SELECT TO "authenticated" USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "esa_update" ON "public"."energy_session_assignments" FOR UPDATE TO "authenticated" USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))))) WITH CHECK ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



ALTER TABLE "public"."exercise_pr_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercises" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exercises_delete_admin" ON "public"."exercises" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))) OR (("created_by" = "auth"."uid"()) AND ("is_verified" = false))));



CREATE POLICY "exercises_insert_admin" ON "public"."exercises" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "exercises_insert_coach" ON "public"."exercises" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("is_verified" = false) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['coach'::"text", 'coach_athlete'::"text"])))))));



CREATE POLICY "exercises_select_all" ON "public"."exercises" FOR SELECT USING (true);



CREATE POLICY "exercises_update_admin" ON "public"."exercises" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



CREATE POLICY "exercises_update_certified" ON "public"."exercises" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."is_certified_coach" = true) OR ("profiles"."is_admin" = true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."is_certified_coach" = true) OR ("profiles"."is_admin" = true))))));



CREATE POLICY "exercises_update_own" ON "public"."exercises" FOR UPDATE USING ((("created_by" = "auth"."uid"()) AND ("is_verified" = false)));



ALTER TABLE "public"."habit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "habit_logs_delete" ON "public"."habit_logs" FOR DELETE USING (("athlete_id" = "auth"."uid"()));



CREATE POLICY "habit_logs_insert" ON "public"."habit_logs" FOR INSERT WITH CHECK (("athlete_id" = "auth"."uid"()));



CREATE POLICY "habit_logs_select" ON "public"."habit_logs" FOR SELECT USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "habit_logs_update" ON "public"."habit_logs" FOR UPDATE USING (("athlete_id" = "auth"."uid"()));



ALTER TABLE "public"."habits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "habits_delete" ON "public"."habits" FOR DELETE USING (("athlete_id" = "auth"."uid"()));



CREATE POLICY "habits_insert" ON "public"."habits" FOR INSERT WITH CHECK (("athlete_id" = "auth"."uid"()));



CREATE POLICY "habits_select" ON "public"."habits" FOR SELECT USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "habits_update" ON "public"."habits" FOR UPDATE USING (("athlete_id" = "auth"."uid"()));



ALTER TABLE "public"."health_sync_errors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "health_sync_errors_admin" ON "public"."health_sync_errors" FOR SELECT TO "authenticated" USING ("public"."current_user_is_admin"());



CREATE POLICY "hr_delete" ON "public"."hyrox_results" FOR DELETE USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin")))));



CREATE POLICY "hr_insert" ON "public"."hyrox_results" FOR INSERT WITH CHECK ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin")))));



CREATE POLICY "hr_select" ON "public"."hyrox_results" FOR SELECT USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin")))));



CREATE POLICY "hr_update" ON "public"."hyrox_results" FOR UPDATE USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin")))));



ALTER TABLE "public"."hr_zone_models" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hr_zone_models_read" ON "public"."hr_zone_models" FOR SELECT TO "authenticated" USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR "public"."staff_can"("athlete_id", 'seances'::"text", 'read'::"text")));



CREATE POLICY "hrp_delete" ON "public"."hyrox_race_plans" FOR DELETE USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin")))));



CREATE POLICY "hrp_insert" ON "public"."hyrox_race_plans" FOR INSERT WITH CHECK ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin")))));



CREATE POLICY "hrp_select" ON "public"."hyrox_race_plans" FOR SELECT USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin")))));



CREATE POLICY "hrp_update" ON "public"."hyrox_race_plans" FOR UPDATE USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin")))));



CREATE POLICY "hrs_delete" ON "public"."hyrox_reference_segments" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))));



CREATE POLICY "hrs_insert" ON "public"."hyrox_reference_segments" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))));



CREATE POLICY "hrs_select" ON "public"."hyrox_reference_segments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "hrs_update" ON "public"."hyrox_reference_segments" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))));



CREATE POLICY "hta_delete" ON "public"."hyrox_test_analyses" FOR DELETE USING (("public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin")))));



CREATE POLICY "hta_insert" ON "public"."hyrox_test_analyses" FOR INSERT WITH CHECK (("public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin")))));



CREATE POLICY "hta_select" ON "public"."hyrox_test_analyses" FOR SELECT USING (((("athlete_id" = "auth"."uid"()) AND ("validated_at" IS NOT NULL)) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin")))));



CREATE POLICY "hta_update" ON "public"."hyrox_test_analyses" FOR UPDATE USING (("public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin")))));



CREATE POLICY "htad_all" ON "public"."hyrox_test_axes_drafts" USING ((EXISTS ( SELECT 1
   FROM "public"."hyrox_test_analyses" "a"
  WHERE (("a"."id" = "hyrox_test_axes_drafts"."analysis_id") AND ("public"."is_coach_of"("a"."athlete_id") OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin")))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."hyrox_test_analyses" "a"
  WHERE (("a"."id" = "hyrox_test_axes_drafts"."analysis_id") AND ("public"."is_coach_of"("a"."athlete_id") OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))))))));



ALTER TABLE "public"."hyrox_axes_params" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hyrox_axes_params_delete" ON "public"."hyrox_axes_params" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))));



CREATE POLICY "hyrox_axes_params_insert" ON "public"."hyrox_axes_params" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))));



CREATE POLICY "hyrox_axes_params_select" ON "public"."hyrox_axes_params" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "hyrox_axes_params_update" ON "public"."hyrox_axes_params" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))));



ALTER TABLE "public"."hyrox_race_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hyrox_reference_segments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hyrox_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hyrox_test_analyses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hyrox_test_axes_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hyrox_test_grid_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hyrox_test_grid_versions_delete" ON "public"."hyrox_test_grid_versions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))));



CREATE POLICY "hyrox_test_grid_versions_insert" ON "public"."hyrox_test_grid_versions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))));



CREATE POLICY "hyrox_test_grid_versions_select" ON "public"."hyrox_test_grid_versions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "hyrox_test_grid_versions_update" ON "public"."hyrox_test_grid_versions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))));



ALTER TABLE "public"."hyrox_test_grids" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hyrox_test_grids_delete" ON "public"."hyrox_test_grids" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))));



CREATE POLICY "hyrox_test_grids_insert" ON "public"."hyrox_test_grids" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))));



CREATE POLICY "hyrox_test_grids_select" ON "public"."hyrox_test_grids" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "hyrox_test_grids_update" ON "public"."hyrox_test_grids" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))));



ALTER TABLE "public"."hyrox_test_params" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hyrox_test_params_delete" ON "public"."hyrox_test_params" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))));



CREATE POLICY "hyrox_test_params_insert" ON "public"."hyrox_test_params" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))));



CREATE POLICY "hyrox_test_params_select" ON "public"."hyrox_test_params" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "hyrox_test_params_update" ON "public"."hyrox_test_params" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))));



ALTER TABLE "public"."hyrox_work_axes_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hyrox_work_axes_rules_delete" ON "public"."hyrox_work_axes_rules" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))));



CREATE POLICY "hyrox_work_axes_rules_insert" ON "public"."hyrox_work_axes_rules" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))));



CREATE POLICY "hyrox_work_axes_rules_select" ON "public"."hyrox_work_axes_rules" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "hyrox_work_axes_rules_update" ON "public"."hyrox_work_axes_rules" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND "profiles"."is_admin"))));



ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invitations_coach" ON "public"."invitations" USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "life_events_delete" ON "public"."athlete_life_events" FOR DELETE USING (("athlete_id" = "auth"."uid"()));



CREATE POLICY "life_events_insert" ON "public"."athlete_life_events" FOR INSERT WITH CHECK (("athlete_id" = "auth"."uid"()));



CREATE POLICY "life_events_select" ON "public"."athlete_life_events" FOR SELECT USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id")));



CREATE POLICY "life_events_update" ON "public"."athlete_life_events" FOR UPDATE USING (("athlete_id" = "auth"."uid"()));



ALTER TABLE "public"."macrocycles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "macrocycles_delete" ON "public"."macrocycles" FOR DELETE USING ("public"."can_coach_athlete"("athlete_id"));



CREATE POLICY "macrocycles_insert" ON "public"."macrocycles" FOR INSERT WITH CHECK ("public"."can_coach_athlete"("athlete_id"));



CREATE POLICY "macrocycles_select" ON "public"."macrocycles" FOR SELECT USING ((("athlete_id" = "auth"."uid"()) OR "public"."can_coach_athlete"("athlete_id")));



CREATE POLICY "macrocycles_update" ON "public"."macrocycles" FOR UPDATE USING ("public"."can_coach_athlete"("athlete_id")) WITH CHECK ("public"."can_coach_athlete"("athlete_id"));



ALTER TABLE "public"."measurement_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medical_attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "medical_attachments_all" ON "public"."medical_attachments" USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id"))) WITH CHECK ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id")));



ALTER TABLE "public"."medical_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "medical_entries_all" ON "public"."medical_entries" USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id"))) WITH CHECK ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id")));



ALTER TABLE "public"."medical_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mesocycles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mesocycles_delete" ON "public"."mesocycles" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."macrocycles" "m"
  WHERE (("m"."id" = "mesocycles"."macrocycle_id") AND "public"."can_coach_athlete"("m"."athlete_id")))));



CREATE POLICY "mesocycles_insert" ON "public"."mesocycles" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."macrocycles" "m"
  WHERE (("m"."id" = "mesocycles"."macrocycle_id") AND "public"."can_coach_athlete"("m"."athlete_id")))));



CREATE POLICY "mesocycles_select" ON "public"."mesocycles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."macrocycles" "m"
  WHERE (("m"."id" = "mesocycles"."macrocycle_id") AND (("m"."athlete_id" = "auth"."uid"()) OR "public"."can_coach_athlete"("m"."athlete_id"))))));



CREATE POLICY "mesocycles_update" ON "public"."mesocycles" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."macrocycles" "m"
  WHERE (("m"."id" = "mesocycles"."macrocycle_id") AND "public"."can_coach_athlete"("m"."athlete_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."macrocycles" "m"
  WHERE (("m"."id" = "mesocycles"."macrocycle_id") AND "public"."can_coach_athlete"("m"."athlete_id")))));



CREATE POLICY "methods_delete_own" ON "public"."training_methods" FOR DELETE USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "methods_insert_coach" ON "public"."training_methods" FOR INSERT WITH CHECK ((("is_official" = false) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['coach'::"text", 'coach_athlete'::"text"])))))));



CREATE POLICY "methods_select_all" ON "public"."training_methods" FOR SELECT USING (true);



CREATE POLICY "methods_update_own" ON "public"."training_methods" FOR UPDATE USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



ALTER TABLE "public"."microcycles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "microcycles_delete" ON "public"."microcycles" FOR DELETE USING ("public"."can_coach_athlete"("public"."cycle_athlete_id"("cycle_id")));



CREATE POLICY "microcycles_insert" ON "public"."microcycles" FOR INSERT WITH CHECK ("public"."can_coach_athlete"("public"."cycle_athlete_id"("cycle_id")));



CREATE POLICY "microcycles_select" ON "public"."microcycles" FOR SELECT USING ((("public"."cycle_athlete_id"("cycle_id") = "auth"."uid"()) OR "public"."can_coach_athlete"("public"."cycle_athlete_id"("cycle_id"))));



CREATE POLICY "microcycles_update" ON "public"."microcycles" FOR UPDATE USING ("public"."can_coach_athlete"("public"."cycle_athlete_id"("cycle_id"))) WITH CHECK ("public"."can_coach_athlete"("public"."cycle_athlete_id"("cycle_id")));



CREATE POLICY "perf_delete" ON "public"."performance_logs" FOR DELETE USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "perf_insert" ON "public"."performance_logs" FOR INSERT WITH CHECK ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "perf_notif_insert" ON "public"."performance_notifications" FOR INSERT WITH CHECK ((("athlete_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "perf_notif_select" ON "public"."performance_notifications" FOR SELECT USING ((("coach_id" = "auth"."uid"()) OR ("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id")));



CREATE POLICY "perf_notif_update" ON "public"."performance_notifications" FOR UPDATE USING ((("coach_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "perf_select" ON "public"."performance_logs" FOR SELECT USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "perf_update" ON "public"."performance_logs" FOR UPDATE USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



ALTER TABLE "public"."performance_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."performance_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."physical_qualities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."planning_blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "planning_blocks_delete" ON "public"."planning_blocks" FOR DELETE USING ("public"."can_coach_athlete"("athlete_id"));



CREATE POLICY "planning_blocks_insert" ON "public"."planning_blocks" FOR INSERT WITH CHECK ("public"."can_coach_athlete"("athlete_id"));



CREATE POLICY "planning_blocks_select" ON "public"."planning_blocks" FOR SELECT USING ((("athlete_id" = "auth"."uid"()) OR "public"."can_coach_athlete"("athlete_id")));



CREATE POLICY "planning_blocks_update" ON "public"."planning_blocks" FOR UPDATE USING ("public"."can_coach_athlete"("athlete_id")) WITH CHECK ("public"."can_coach_athlete"("athlete_id"));



CREATE POLICY "pq_delete" ON "public"."physical_qualities" FOR DELETE TO "authenticated" USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "pq_insert" ON "public"."physical_qualities" FOR INSERT TO "authenticated" WITH CHECK ((("coach_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['coach'::"text", 'coach_athlete'::"text"])))))));



CREATE POLICY "pq_select" ON "public"."physical_qualities" FOR SELECT USING ((("coach_id" IS NULL) OR ("coach_id" = "auth"."uid"()) OR "public"."is_coach_partner"("coach_id")));



CREATE POLICY "pq_update" ON "public"."physical_qualities" FOR UPDATE TO "authenticated" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_select_athletes" ON "public"."profiles" FOR SELECT USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "profiles_select_co_coached" ON "public"."profiles" FOR SELECT USING ("public"."is_co_coach_of"("id"));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_select_related_coaches" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."coach_profile_visible"("id"));



CREATE POLICY "profiles_select_staff_members" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."staff_profile_visible"("id"));



CREATE POLICY "profiles_update_co_coached" ON "public"."profiles" FOR UPDATE USING ("public"."is_co_coach_of"("id")) WITH CHECK ("public"."is_co_coach_of"("id"));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."provider_activities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_activities_coach_read" ON "public"."provider_activities" FOR SELECT TO "authenticated" USING (("public"."is_coach_of"("athlete_id") AND (EXISTS ( SELECT 1
   FROM "public"."data_source_policies" "p"
  WHERE (("p"."source" = "provider_activities"."source") AND "p"."coach_visible"))) AND "public"."source_consent_granted"("athlete_id", "source")));



CREATE POLICY "provider_activities_own_file_import" ON "public"."provider_activities" TO "authenticated" USING ((("athlete_id" = "auth"."uid"()) AND ("source" = 'file_import'::"public"."data_source"))) WITH CHECK ((("athlete_id" = "auth"."uid"()) AND ("source" = 'file_import'::"public"."data_source")));



CREATE POLICY "provider_activities_own_read" ON "public"."provider_activities" FOR SELECT TO "authenticated" USING (("athlete_id" = "auth"."uid"()));



ALTER TABLE "public"."provider_connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_connections_coach_read" ON "public"."provider_connections" FOR SELECT TO "authenticated" USING ("public"."is_coach_of"("athlete_id"));



CREATE POLICY "provider_connections_own_read" ON "public"."provider_connections" FOR SELECT TO "authenticated" USING (("athlete_id" = "auth"."uid"()));



ALTER TABLE "public"."provider_dailies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_dailies_coach_read" ON "public"."provider_dailies" FOR SELECT TO "authenticated" USING (("public"."is_coach_of"("athlete_id") AND (EXISTS ( SELECT 1
   FROM "public"."data_source_policies" "p"
  WHERE (("p"."source" = "provider_dailies"."source") AND "p"."coach_visible"))) AND "public"."source_consent_granted"("athlete_id", "source")));



CREATE POLICY "provider_dailies_own_read" ON "public"."provider_dailies" FOR SELECT TO "authenticated" USING (("athlete_id" = "auth"."uid"()));



ALTER TABLE "public"."provider_fit_quota" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_intraday" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_intraday_read" ON "public"."provider_intraday" FOR SELECT TO "authenticated" USING ("public"."activity_detail_visible"("athlete_id", "source"));



ALTER TABLE "public"."provider_moveiq" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_moveiq_read" ON "public"."provider_moveiq" FOR SELECT TO "authenticated" USING ("public"."activity_detail_visible"("athlete_id", "source"));



ALTER TABLE "public"."provider_oauth_clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_oauth_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_raw_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_raw_records_own_read" ON "public"."provider_raw_records" FOR SELECT TO "authenticated" USING (("athlete_id" = "auth"."uid"()));



ALTER TABLE "public"."provider_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_webhook_inbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_workout_pushes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_workout_pushes_coach_read" ON "public"."provider_workout_pushes" FOR SELECT TO "authenticated" USING ("public"."is_coach_of"("athlete_id"));



CREATE POLICY "provider_workout_pushes_own_read" ON "public"."provider_workout_pushes" FOR SELECT TO "authenticated" USING (("athlete_id" = "auth"."uid"()));



ALTER TABLE "public"."retours" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retours_select" ON "public"."retours" FOR SELECT USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



ALTER TABLE "public"."retours_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roadmap_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roadmap_items_admin_write" ON "public"."roadmap_items" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."is_admin" = true)))));



CREATE POLICY "roadmap_items_coach_suggest" ON "public"."roadmap_items" FOR INSERT WITH CHECK ((("status" = 'idea'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."is_certified_coach" = true))))));



CREATE POLICY "roadmap_items_select" ON "public"."roadmap_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."is_certified_coach" = true) OR ("p"."is_admin" = true))))));



ALTER TABLE "public"."roadmap_phases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roadmap_phases_select" ON "public"."roadmap_phases" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."is_certified_coach" = true) OR ("p"."is_admin" = true))))));



CREATE POLICY "roadmap_phases_write" ON "public"."roadmap_phases" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."is_admin" = true)))));



ALTER TABLE "public"."roadmap_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roadmap_votes_select" ON "public"."roadmap_votes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."is_certified_coach" = true) OR ("p"."is_admin" = true))))));



CREATE POLICY "roadmap_votes_write" ON "public"."roadmap_votes" USING (("user_id" = "auth"."uid"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."is_certified_coach" = true) OR ("p"."is_admin" = true)))))));



CREATE POLICY "sb_delete" ON "public"."specific_blocks" FOR DELETE TO "authenticated" USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "sb_insert" ON "public"."specific_blocks" FOR INSERT TO "authenticated" WITH CHECK ((("coach_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['coach'::"text", 'coach_athlete'::"text"])))))));



CREATE POLICY "sb_select" ON "public"."specific_blocks" FOR SELECT TO "authenticated" USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "sb_update" ON "public"."specific_blocks" FOR UPDATE TO "authenticated" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



ALTER TABLE "public"."seasons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "seasons_delete" ON "public"."seasons" FOR DELETE USING ("public"."can_coach_athlete"("athlete_id"));



CREATE POLICY "seasons_insert" ON "public"."seasons" FOR INSERT WITH CHECK ("public"."can_coach_athlete"("athlete_id"));



CREATE POLICY "seasons_select" ON "public"."seasons" FOR SELECT USING ((("athlete_id" = "auth"."uid"()) OR "public"."can_coach_athlete"("athlete_id")));



CREATE POLICY "seasons_update" ON "public"."seasons" FOR UPDATE USING ("public"."can_coach_athlete"("athlete_id")) WITH CHECK ("public"."can_coach_athlete"("athlete_id"));



ALTER TABLE "public"."specific_blocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."specific_sports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ss_delete" ON "public"."specific_sports" FOR DELETE TO "authenticated" USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "ss_insert" ON "public"."specific_sports" FOR INSERT TO "authenticated" WITH CHECK ((("coach_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['coach'::"text", 'coach_athlete'::"text"])))))));



CREATE POLICY "ss_select" ON "public"."specific_sports" FOR SELECT USING ((("coach_id" IS NULL) OR ("coach_id" = "auth"."uid"()) OR "public"."is_coach_partner"("coach_id")));



CREATE POLICY "ss_update" ON "public"."specific_sports" FOR UPDATE TO "authenticated" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "staff_app_data_read" ON "public"."app_data" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", "public"."staff_app_data_domain"("key"), 'read'::"text"));



CREATE POLICY "staff_athlete_test_results_read" ON "public"."athlete_test_results" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'tests'::"text", 'read'::"text"));



CREATE POLICY "staff_athlete_test_values_read" ON "public"."athlete_test_values" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."athlete_test_results" "r"
  WHERE (("r"."id" = "athlete_test_values"."result_id") AND "public"."staff_can"("r"."athlete_id", 'tests'::"text", 'read'::"text")))));



CREATE POLICY "staff_competitions_read" ON "public"."competitions" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'planification'::"text", 'read'::"text"));



CREATE POLICY "staff_cycles_read" ON "public"."cycles" FOR SELECT TO "authenticated" USING ("public"."staff_can"(COALESCE("athlete_id", "public"."mesocycle_athlete_id"("mesocycle_id")), 'planification'::"text", 'read'::"text"));



CREATE POLICY "staff_day_themes_read" ON "public"."day_themes" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'planification'::"text", 'read'::"text"));



CREATE POLICY "staff_doc_assignments_delete" ON "public"."doc_assignments" FOR DELETE TO "authenticated" USING ("public"."staff_can_edit"("athlete_id", 'fiches'::"text", "assigned_by"));



CREATE POLICY "staff_doc_assignments_insert" ON "public"."doc_assignments" FOR INSERT TO "authenticated" WITH CHECK ((("assigned_by" = "auth"."uid"()) AND "public"."staff_can"("athlete_id", 'fiches'::"text", 'write'::"text") AND "public"."staff_doc_for_athlete"("doc_id", "athlete_id")));



CREATE POLICY "staff_doc_assignments_read" ON "public"."doc_assignments" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'fiches'::"text", 'read'::"text"));



CREATE POLICY "staff_doc_comments_insert" ON "public"."doc_comments" FOR INSERT TO "authenticated" WITH CHECK ((("author_id" = "auth"."uid"()) AND "public"."staff_can"("athlete_id", 'commentaires'::"text", 'write'::"text") AND "public"."can_read_doc"("doc_id")));



CREATE POLICY "staff_doc_comments_read" ON "public"."doc_comments" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'commentaires'::"text", 'read'::"text"));



CREATE POLICY "staff_docs_delete" ON "public"."docs" FOR DELETE TO "authenticated" USING ("public"."staff_can_edit_doc"("id"));



CREATE POLICY "staff_docs_insert" ON "public"."docs" FOR INSERT TO "authenticated" WITH CHECK ((("uploaded_by" = "auth"."uid"()) AND ("coach_id" <> "auth"."uid"()) AND ("is_self_service" = false) AND "public"."staff_can_write_bank"("coach_id") AND (("athlete_id" IS NULL) OR "public"."staff_can"("athlete_id", 'fiches'::"text", 'write'::"text"))));



CREATE POLICY "staff_docs_update" ON "public"."docs" FOR UPDATE TO "authenticated" USING ("public"."staff_can_edit_doc"("id")) WITH CHECK ((("is_self_service" = false) AND "public"."staff_can_write_bank"("coach_id") AND (("athlete_id" IS NULL) OR "public"."staff_can"("athlete_id", 'fiches'::"text", 'write'::"text"))));



CREATE POLICY "staff_energy_sessions_read" ON "public"."energy_sessions" FOR SELECT TO "authenticated" USING (("public"."staff_can"("athlete_id", 'seances'::"text", 'read'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."energy_session_assignments" "a"
  WHERE (("a"."energy_session_id" = "energy_sessions"."id") AND "public"."staff_can"("a"."athlete_id", 'seances'::"text", 'read'::"text"))))));



CREATE POLICY "staff_esa_read" ON "public"."energy_session_assignments" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'seances'::"text", 'read'::"text"));



CREATE POLICY "staff_exercise_pr_logs_read" ON "public"."exercise_pr_logs" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'logs'::"text", 'read'::"text"));



CREATE POLICY "staff_habit_logs_read" ON "public"."habit_logs" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'wellness'::"text", 'read'::"text"));



CREATE POLICY "staff_habits_read" ON "public"."habits" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'wellness'::"text", 'read'::"text"));



ALTER TABLE "public"."staff_invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_invitations_delete" ON "public"."staff_invitations" FOR DELETE TO "authenticated" USING ((("used_at" IS NULL) AND (("invited_by" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id"))));



CREATE POLICY "staff_invitations_insert" ON "public"."staff_invitations" FOR INSERT TO "authenticated" WITH CHECK ((("invited_by" = "auth"."uid"()) AND ("public"."is_coach_of"("athlete_id") OR ("athlete_id" = "auth"."uid"()))));



CREATE POLICY "staff_invitations_select" ON "public"."staff_invitations" FOR SELECT TO "authenticated" USING ((("invited_by" = "auth"."uid"()) OR ("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id")));



CREATE POLICY "staff_life_events_read" ON "public"."athlete_life_events" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'medical'::"text", 'read'::"text"));



CREATE POLICY "staff_macrocycles_read" ON "public"."macrocycles" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'planification'::"text", 'read'::"text"));



CREATE POLICY "staff_measurement_logs_read" ON "public"."measurement_logs" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'nutrition'::"text", 'read'::"text"));



CREATE POLICY "staff_medical_attachments_delete" ON "public"."medical_attachments" FOR DELETE TO "authenticated" USING ("public"."staff_can_edit"("athlete_id", 'medical'::"text", "created_by"));



CREATE POLICY "staff_medical_attachments_insert" ON "public"."medical_attachments" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND "public"."staff_can"("athlete_id", 'medical'::"text", 'write'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."medical_entries" "e"
  WHERE (("e"."id" = "medical_attachments"."entry_id") AND ("e"."athlete_id" = "medical_attachments"."athlete_id") AND "public"."staff_can_edit"("e"."athlete_id", 'medical'::"text", "e"."created_by"))))));



CREATE POLICY "staff_medical_attachments_read" ON "public"."medical_attachments" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'medical'::"text", 'read'::"text"));



CREATE POLICY "staff_medical_entries_delete" ON "public"."medical_entries" FOR DELETE TO "authenticated" USING ("public"."staff_can_edit"("athlete_id", 'medical'::"text", "created_by"));



CREATE POLICY "staff_medical_entries_insert" ON "public"."medical_entries" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND "public"."staff_can"("athlete_id", 'medical'::"text", 'write'::"text")));



CREATE POLICY "staff_medical_entries_read" ON "public"."medical_entries" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'medical'::"text", 'read'::"text"));



CREATE POLICY "staff_medical_entries_update" ON "public"."medical_entries" FOR UPDATE TO "authenticated" USING ("public"."staff_can_edit"("athlete_id", 'medical'::"text", "created_by")) WITH CHECK ("public"."staff_can_edit"("athlete_id", 'medical'::"text", "created_by"));



CREATE POLICY "staff_medical_history_read" ON "public"."medical_history" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'medical'::"text", 'read'::"text"));



CREATE POLICY "staff_mesocycles_read" ON "public"."mesocycles" FOR SELECT TO "authenticated" USING ("public"."staff_can"(( SELECT "m"."athlete_id"
   FROM "public"."macrocycles" "m"
  WHERE ("m"."id" = "mesocycles"."macrocycle_id")), 'planification'::"text", 'read'::"text"));



CREATE POLICY "staff_microcycles_read" ON "public"."microcycles" FOR SELECT TO "authenticated" USING ("public"."staff_can"("public"."cycle_athlete_id"("cycle_id"), 'planification'::"text", 'read'::"text"));



CREATE POLICY "staff_performance_logs_read" ON "public"."performance_logs" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'logs'::"text", 'read'::"text"));



CREATE POLICY "staff_planning_blocks_read" ON "public"."planning_blocks" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'planification'::"text", 'read'::"text"));



CREATE POLICY "staff_seasons_read" ON "public"."seasons" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'planification'::"text", 'read'::"text"));



CREATE POLICY "staff_test_results_read" ON "public"."test_results" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'tests'::"text", 'read'::"text"));



CREATE POLICY "staff_test_sessions_read" ON "public"."test_sessions" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'tests'::"text", 'read'::"text"));



CREATE POLICY "staff_weekly_retours_read" ON "public"."weekly_retours" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'commentaires'::"text", 'read'::"text"));



CREATE POLICY "staff_workout_exercise_comments_read" ON "public"."workout_exercise_comments" FOR SELECT TO "authenticated" USING ("public"."staff_can"("public"."workout_log_athlete_id"("workout_log_id"), 'commentaires'::"text", 'read'::"text"));



CREATE POLICY "staff_workout_logs_read" ON "public"."workout_logs" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'logs'::"text", 'read'::"text"));



CREATE POLICY "staff_workout_rpe_read" ON "public"."workout_rpe" FOR SELECT TO "authenticated" USING ("public"."staff_can"("athlete_id", 'logs'::"text", 'read'::"text"));



CREATE POLICY "td_delete" ON "public"."test_definitions" FOR DELETE USING ((("auth"."uid"() = "created_by") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "td_delete_coach_library" ON "public"."test_definitions" FOR DELETE TO "authenticated" USING ((("created_by" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['coach'::"text", 'coach_athlete'::"text"])))))));



CREATE POLICY "td_insert" ON "public"."test_definitions" FOR INSERT WITH CHECK ((("auth"."uid"() = "created_by") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "td_select" ON "public"."test_definitions" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "td_update" ON "public"."test_definitions" FOR UPDATE USING ((("auth"."uid"() = "created_by") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "td_update_coach_library" ON "public"."test_definitions" FOR UPDATE TO "authenticated" USING ((("created_by" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['coach'::"text", 'coach_athlete'::"text"]))))))) WITH CHECK (("created_by" IS NULL));



ALTER TABLE "public"."test_definitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "test_delete" ON "public"."test_sessions" FOR DELETE USING ((("athlete_id" = "auth"."uid"()) OR ("coach_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "test_insert" ON "public"."test_sessions" FOR INSERT TO "authenticated" WITH CHECK ((("athlete_id" = "auth"."uid"()) OR (("coach_id" = "auth"."uid"()) AND (("athlete_id" IS NULL) OR "public"."is_coach_of"("athlete_id"))) OR "public"."current_user_is_admin"()));



ALTER TABLE "public"."test_results" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "test_results_delete" ON "public"."test_results" FOR DELETE USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id")));



CREATE POLICY "test_results_insert" ON "public"."test_results" FOR INSERT WITH CHECK ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id")));



CREATE POLICY "test_results_select" ON "public"."test_results" FOR SELECT USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id")));



CREATE POLICY "test_results_update" ON "public"."test_results" FOR UPDATE USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id")));



CREATE POLICY "test_select" ON "public"."test_sessions" FOR SELECT USING ((("athlete_id" = "auth"."uid"()) OR ("coach_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



ALTER TABLE "public"."test_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "test_update" ON "public"."test_sessions" FOR UPDATE USING ((("athlete_id" = "auth"."uid"()) OR ("coach_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



ALTER TABLE "public"."test_variables" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tests_delete" ON "public"."tests" FOR DELETE USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "tests_insert" ON "public"."tests" FOR INSERT WITH CHECK ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['coach'::"text", 'coach_athlete'::"text"])))))));



CREATE POLICY "tests_select" ON "public"."tests" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "tests_update" ON "public"."tests" FOR UPDATE USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



ALTER TABLE "public"."training_methods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tv_delete" ON "public"."test_variables" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."test_definitions" "td"
  WHERE (("td"."id" = "test_variables"."test_definition_id") AND (("td"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))))))));



CREATE POLICY "tv_insert" ON "public"."test_variables" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."test_definitions" "td"
  WHERE (("td"."id" = "test_variables"."test_definition_id") AND (("td"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))))))));



CREATE POLICY "tv_select" ON "public"."test_variables" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "tv_update" ON "public"."test_variables" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."test_definitions" "td"
  WHERE (("td"."id" = "test_variables"."test_definition_id") AND (("td"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))))))));



CREATE POLICY "tv_write_coach_library" ON "public"."test_variables" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."test_definitions" "td"
  WHERE (("td"."id" = "test_variables"."test_definition_id") AND ("td"."created_by" IS NULL)))) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['coach'::"text", 'coach_athlete'::"text"]))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."test_definitions" "td"
  WHERE (("td"."id" = "test_variables"."test_definition_id") AND ("td"."created_by" IS NULL)))) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['coach'::"text", 'coach_athlete'::"text"])))))));



ALTER TABLE "public"."user_consents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_consents_insert_own" ON "public"."user_consents" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_consents_select_own" ON "public"."user_consents" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."weekly_retours" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wellness_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wellness_entries_coach" ON "public"."wellness_entries" FOR SELECT TO "authenticated" USING ("public"."is_coach_of"("athlete_id"));



CREATE POLICY "wellness_entries_self" ON "public"."wellness_entries" FOR SELECT TO "authenticated" USING (("athlete_id" = "auth"."uid"()));



CREATE POLICY "wellness_entries_staff" ON "public"."wellness_entries" FOR SELECT TO "authenticated" USING (((NOT "archived") AND "public"."staff_can"("athlete_id", 'wellness'::"text", 'read'::"text")));



ALTER TABLE "public"."workout_exercise_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workout_exercise_comments_coach_read" ON "public"."workout_exercise_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."workout_logs" "wl"
  WHERE (("wl"."id" = "workout_exercise_comments"."workout_log_id") AND "public"."is_coach_of"("wl"."athlete_id")))));



CREATE POLICY "workout_exercise_comments_self" ON "public"."workout_exercise_comments" USING ((EXISTS ( SELECT 1
   FROM "public"."workout_logs" "wl"
  WHERE (("wl"."id" = "workout_exercise_comments"."workout_log_id") AND ("wl"."athlete_id" = "auth"."uid"())))));



ALTER TABLE "public"."workout_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workout_logs_coach_delete" ON "public"."workout_logs" FOR DELETE USING ("public"."is_coach_of"("athlete_id"));



CREATE POLICY "workout_logs_coach_insert" ON "public"."workout_logs" FOR INSERT WITH CHECK ("public"."is_coach_of"("athlete_id"));



CREATE POLICY "workout_logs_coach_read" ON "public"."workout_logs" FOR SELECT USING ("public"."is_coach_of"("athlete_id"));



CREATE POLICY "workout_logs_coach_update" ON "public"."workout_logs" FOR UPDATE USING ("public"."is_coach_of"("athlete_id"));



CREATE POLICY "workout_logs_self" ON "public"."workout_logs" USING (("athlete_id" = "auth"."uid"()));



ALTER TABLE "public"."workout_rpe" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workout_rpe_select" ON "public"."workout_rpe" FOR SELECT USING ((("athlete_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id")));



CREATE POLICY "wr_athlete_select" ON "public"."weekly_retours" FOR SELECT TO "authenticated" USING (("athlete_id" = "auth"."uid"()));



CREATE POLICY "wr_coach_all" ON "public"."weekly_retours" TO "authenticated" USING ((("coach_id" = "auth"."uid"()) OR "public"."is_coach_of"("athlete_id"))) WITH CHECK ((("coach_id" = "auth"."uid"()) AND (("athlete_id" IS NULL) OR "public"."is_coach_of"("athlete_id"))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."citation_stats";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."_add"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."_add"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."_add"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_add"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."_add"("text", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_add"("text", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_add"("text", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_add"("text", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_alike"(boolean, "anyelement", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_alike"(boolean, "anyelement", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_alike"(boolean, "anyelement", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_alike"(boolean, "anyelement", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_ancestor_of"("name", "name", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."_ancestor_of"("name", "name", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."_ancestor_of"("name", "name", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_ancestor_of"("name", "name", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."_ancestor_of"("name", "name", "name", "name", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."_ancestor_of"("name", "name", "name", "name", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."_ancestor_of"("name", "name", "name", "name", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_ancestor_of"("name", "name", "name", "name", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."_are"("text", "name"[], "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_are"("text", "name"[], "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_are"("text", "name"[], "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_are"("text", "name"[], "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_areni"("text", "text"[], "text"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_areni"("text", "text"[], "text"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_areni"("text", "text"[], "text"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_areni"("text", "text"[], "text"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_array_to_sorted_string"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_array_to_sorted_string"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_array_to_sorted_string"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_array_to_sorted_string"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_assets_are"("text", "text"[], "text"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_assets_are"("text", "text"[], "text"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_assets_are"("text", "text"[], "text"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_assets_are"("text", "text"[], "text"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_cast_exists"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_cast_exists"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_cast_exists"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_cast_exists"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_cast_exists"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_cast_exists"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_cast_exists"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_cast_exists"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_cast_exists"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_cast_exists"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_cast_exists"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_cast_exists"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_cdi"("name", "name", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."_cdi"("name", "name", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."_cdi"("name", "name", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_cdi"("name", "name", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."_cdi"("name", "name", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_cdi"("name", "name", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_cdi"("name", "name", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_cdi"("name", "name", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_cdi"("name", "name", "name", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_cdi"("name", "name", "name", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_cdi"("name", "name", "name", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_cdi"("name", "name", "name", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_cexists"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_cexists"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_cexists"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_cexists"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_cexists"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_cexists"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_cexists"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_cexists"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_ckeys"("name", character) TO "postgres";
GRANT ALL ON FUNCTION "public"."_ckeys"("name", character) TO "anon";
GRANT ALL ON FUNCTION "public"."_ckeys"("name", character) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_ckeys"("name", character) TO "service_role";



GRANT ALL ON FUNCTION "public"."_ckeys"("name", "name", character) TO "postgres";
GRANT ALL ON FUNCTION "public"."_ckeys"("name", "name", character) TO "anon";
GRANT ALL ON FUNCTION "public"."_ckeys"("name", "name", character) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_ckeys"("name", "name", character) TO "service_role";



GRANT ALL ON FUNCTION "public"."_cleanup"() TO "postgres";
GRANT ALL ON FUNCTION "public"."_cleanup"() TO "anon";
GRANT ALL ON FUNCTION "public"."_cleanup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_cleanup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_cmp_types"("oid", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_cmp_types"("oid", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_cmp_types"("oid", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_cmp_types"("oid", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_col_is_null"("name", "name", "text", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_col_is_null"("name", "name", "text", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_col_is_null"("name", "name", "text", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_col_is_null"("name", "name", "text", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_col_is_null"("name", "name", "name", "text", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_col_is_null"("name", "name", "name", "text", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_col_is_null"("name", "name", "name", "text", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_col_is_null"("name", "name", "name", "text", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_constraint"("name", character, "name"[], "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_constraint"("name", character, "name"[], "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_constraint"("name", character, "name"[], "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_constraint"("name", character, "name"[], "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_constraint"("name", "name", character, "name"[], "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_constraint"("name", "name", character, "name"[], "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_constraint"("name", "name", character, "name"[], "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_constraint"("name", "name", character, "name"[], "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_contract_on"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_contract_on"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."_contract_on"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_contract_on"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_currtest"() TO "postgres";
GRANT ALL ON FUNCTION "public"."_currtest"() TO "anon";
GRANT ALL ON FUNCTION "public"."_currtest"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_currtest"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_db_privs"() TO "postgres";
GRANT ALL ON FUNCTION "public"."_db_privs"() TO "anon";
GRANT ALL ON FUNCTION "public"."_db_privs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_db_privs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_def_is"("text", "text", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_def_is"("text", "text", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_def_is"("text", "text", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_def_is"("text", "text", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_definer"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_definer"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_definer"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_definer"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_definer"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_definer"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_definer"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_definer"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_definer"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_definer"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_definer"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_definer"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_definer"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_definer"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_definer"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_definer"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_dexists"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_dexists"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_dexists"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_dexists"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_dexists"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_dexists"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_dexists"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_dexists"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_do_ne"("text", "text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_do_ne"("text", "text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_do_ne"("text", "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_do_ne"("text", "text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_docomp"("text", "text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_docomp"("text", "text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_docomp"("text", "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_docomp"("text", "text", "text", "text") TO "service_role";



GRANT ALL ON TABLE "public"."energy_session_assignments" TO "anon";
GRANT ALL ON TABLE "public"."energy_session_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."energy_session_assignments" TO "service_role";



REVOKE ALL ON FUNCTION "public"."_energy_assignment_for_write"("p_assignment" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_energy_assignment_for_write"("p_assignment" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."_error_diag"("text", "text", "text", "text", "text", "text", "text", "text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_error_diag"("text", "text", "text", "text", "text", "text", "text", "text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_error_diag"("text", "text", "text", "text", "text", "text", "text", "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_error_diag"("text", "text", "text", "text", "text", "text", "text", "text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_expand_context"(character) TO "postgres";
GRANT ALL ON FUNCTION "public"."_expand_context"(character) TO "anon";
GRANT ALL ON FUNCTION "public"."_expand_context"(character) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_expand_context"(character) TO "service_role";



GRANT ALL ON FUNCTION "public"."_expand_on"(character) TO "postgres";
GRANT ALL ON FUNCTION "public"."_expand_on"(character) TO "anon";
GRANT ALL ON FUNCTION "public"."_expand_on"(character) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_expand_on"(character) TO "service_role";



GRANT ALL ON FUNCTION "public"."_expand_vol"(character) TO "postgres";
GRANT ALL ON FUNCTION "public"."_expand_vol"(character) TO "anon";
GRANT ALL ON FUNCTION "public"."_expand_vol"(character) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_expand_vol"(character) TO "service_role";



GRANT ALL ON FUNCTION "public"."_ext_exists"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_ext_exists"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_ext_exists"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_ext_exists"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_ext_exists"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_ext_exists"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_ext_exists"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_ext_exists"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_extensions"() TO "postgres";
GRANT ALL ON FUNCTION "public"."_extensions"() TO "anon";
GRANT ALL ON FUNCTION "public"."_extensions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_extensions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_extensions"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_extensions"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_extensions"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_extensions"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_extras"(character[], "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_extras"(character[], "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_extras"(character[], "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_extras"(character[], "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_extras"(character, "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_extras"(character, "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_extras"(character, "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_extras"(character, "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_extras"(character[], "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_extras"(character[], "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_extras"(character[], "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_extras"(character[], "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_extras"(character, "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_extras"(character, "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_extras"(character, "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_extras"(character, "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_finish"(integer, integer, integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_finish"(integer, integer, integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_finish"(integer, integer, integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_finish"(integer, integer, integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_fkexists"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_fkexists"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_fkexists"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_fkexists"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_fkexists"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_fkexists"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_fkexists"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_fkexists"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_fprivs_are"("text", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_fprivs_are"("text", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_fprivs_are"("text", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_fprivs_are"("text", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_func_compare"("name", "name", boolean, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_func_compare"("name", "name", boolean, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_func_compare"("name", "name", boolean, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_func_compare"("name", "name", boolean, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_func_compare"("name", "name", "name"[], boolean, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_func_compare"("name", "name", "name"[], boolean, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_func_compare"("name", "name", "name"[], boolean, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_func_compare"("name", "name", "name"[], boolean, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_func_compare"("name", "name", "anyelement", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_func_compare"("name", "name", "anyelement", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_func_compare"("name", "name", "anyelement", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_func_compare"("name", "name", "anyelement", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_func_compare"("name", "name", "name"[], "anyelement", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_func_compare"("name", "name", "name"[], "anyelement", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_func_compare"("name", "name", "name"[], "anyelement", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_func_compare"("name", "name", "name"[], "anyelement", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_funkargs"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_funkargs"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_funkargs"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_funkargs"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_get"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."_get"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_ac_privs"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_ac_privs"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_ac_privs"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_ac_privs"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_col_ns_type"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_col_ns_type"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_col_ns_type"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_col_ns_type"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_col_privs"("name", "text", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_col_privs"("name", "text", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_col_privs"("name", "text", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_col_privs"("name", "text", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_col_type"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_col_type"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_col_type"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_col_type"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_col_type"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_col_type"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_col_type"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_col_type"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_context"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_context"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_context"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_context"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_db_owner"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_db_owner"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_db_owner"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_db_owner"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_db_privs"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_db_privs"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_db_privs"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_db_privs"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_dtype"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_dtype"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_dtype"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_dtype"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_dtype"("name", "text", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_dtype"("name", "text", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_get_dtype"("name", "text", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_dtype"("name", "text", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_fdw_privs"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_fdw_privs"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_fdw_privs"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_fdw_privs"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_func_owner"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_func_owner"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_get_func_owner"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_func_owner"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_func_owner"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_func_owner"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_get_func_owner"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_func_owner"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_func_privs"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_func_privs"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_func_privs"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_func_privs"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_index_owner"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_index_owner"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_index_owner"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_index_owner"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_index_owner"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_index_owner"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_index_owner"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_index_owner"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_lang_privs"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_lang_privs"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_lang_privs"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_lang_privs"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_language_owner"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_language_owner"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_language_owner"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_language_owner"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_latest"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_latest"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_latest"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_latest"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_latest"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_latest"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."_get_latest"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_latest"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_note"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_note"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."_get_note"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_note"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_note"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_note"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_note"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_note"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_opclass_owner"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_opclass_owner"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_opclass_owner"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_opclass_owner"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_opclass_owner"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_opclass_owner"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_opclass_owner"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_opclass_owner"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_rel_owner"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_rel_owner"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_rel_owner"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_rel_owner"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_rel_owner"(character[], "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_rel_owner"(character[], "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_rel_owner"(character[], "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_rel_owner"(character[], "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_rel_owner"(character, "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_rel_owner"(character, "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_rel_owner"(character, "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_rel_owner"(character, "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_rel_owner"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_rel_owner"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_rel_owner"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_rel_owner"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_rel_owner"(character[], "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_rel_owner"(character[], "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_rel_owner"(character[], "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_rel_owner"(character[], "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_rel_owner"(character, "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_rel_owner"(character, "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_rel_owner"(character, "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_rel_owner"(character, "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_schema_owner"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_schema_owner"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_schema_owner"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_schema_owner"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_schema_privs"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_schema_privs"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_schema_privs"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_schema_privs"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_sequence_privs"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_sequence_privs"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_sequence_privs"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_sequence_privs"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_server_privs"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_server_privs"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_server_privs"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_server_privs"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_table_privs"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_table_privs"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_table_privs"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_table_privs"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_tablespace_owner"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_tablespace_owner"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_tablespace_owner"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_tablespace_owner"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_tablespaceprivs"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_tablespaceprivs"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_tablespaceprivs"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_tablespaceprivs"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_type_owner"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_type_owner"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_type_owner"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_type_owner"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_type_owner"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_get_type_owner"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_type_owner"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_type_owner"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_got_func"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_got_func"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_got_func"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_got_func"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_got_func"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_got_func"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_got_func"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_got_func"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_got_func"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_got_func"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_got_func"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_got_func"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_got_func"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_got_func"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_got_func"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_got_func"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_grolist"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_grolist"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_grolist"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_grolist"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_has_def"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_has_def"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_has_def"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_has_def"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_has_def"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_has_def"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_has_def"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_has_def"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_has_group"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_has_group"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_has_group"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_has_group"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_has_role"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_has_role"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_has_role"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_has_role"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_has_type"("name", character[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_has_type"("name", character[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_has_type"("name", character[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_has_type"("name", character[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_has_type"("name", "name", character[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_has_type"("name", "name", character[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_has_type"("name", "name", character[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_has_type"("name", "name", character[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_has_user"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_has_user"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_has_user"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_has_user"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_hasc"("name", character) TO "postgres";
GRANT ALL ON FUNCTION "public"."_hasc"("name", character) TO "anon";
GRANT ALL ON FUNCTION "public"."_hasc"("name", character) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_hasc"("name", character) TO "service_role";



GRANT ALL ON FUNCTION "public"."_hasc"("name", "name", character) TO "postgres";
GRANT ALL ON FUNCTION "public"."_hasc"("name", "name", character) TO "anon";
GRANT ALL ON FUNCTION "public"."_hasc"("name", "name", character) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_hasc"("name", "name", character) TO "service_role";



GRANT ALL ON FUNCTION "public"."_have_index"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_have_index"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_have_index"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_have_index"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_have_index"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_have_index"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_have_index"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_have_index"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_ident_array_to_sorted_string"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_ident_array_to_sorted_string"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_ident_array_to_sorted_string"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_ident_array_to_sorted_string"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_ident_array_to_string"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_ident_array_to_string"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_ident_array_to_string"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_ident_array_to_string"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_ikeys"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_ikeys"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_ikeys"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_ikeys"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_ikeys"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_ikeys"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_ikeys"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_ikeys"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_inherited"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_inherited"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_inherited"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_inherited"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_inherited"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_inherited"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_inherited"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_inherited"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_is_indexed"("name", "name", "text"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_is_indexed"("name", "name", "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_is_indexed"("name", "name", "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_is_indexed"("name", "name", "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_is_instead"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_is_instead"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_is_instead"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_is_instead"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_is_instead"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_is_instead"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_is_instead"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_is_instead"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_is_schema"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_is_schema"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_is_schema"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_is_schema"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_is_super"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_is_super"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_is_super"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_is_super"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_is_trusted"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_is_trusted"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_is_trusted"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_is_trusted"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_is_verbose"() TO "postgres";
GRANT ALL ON FUNCTION "public"."_is_verbose"() TO "anon";
GRANT ALL ON FUNCTION "public"."_is_verbose"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_is_verbose"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_keys"("name", character) TO "postgres";
GRANT ALL ON FUNCTION "public"."_keys"("name", character) TO "anon";
GRANT ALL ON FUNCTION "public"."_keys"("name", character) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_keys"("name", character) TO "service_role";



GRANT ALL ON FUNCTION "public"."_keys"("name", "name", character) TO "postgres";
GRANT ALL ON FUNCTION "public"."_keys"("name", "name", character) TO "anon";
GRANT ALL ON FUNCTION "public"."_keys"("name", "name", character) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_keys"("name", "name", character) TO "service_role";



GRANT ALL ON FUNCTION "public"."_lang"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_lang"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_lang"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_lang"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_lang"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_lang"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_lang"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_lang"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_lang"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_lang"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_lang"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_lang"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_lang"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_lang"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_lang"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_lang"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_missing"(character[], "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_missing"(character[], "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_missing"(character[], "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_missing"(character[], "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_missing"(character, "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_missing"(character, "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_missing"(character, "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_missing"(character, "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_missing"(character[], "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_missing"(character[], "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_missing"(character[], "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_missing"(character[], "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_missing"(character, "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_missing"(character, "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_missing"(character, "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_missing"(character, "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_nosuch"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_nosuch"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_nosuch"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_nosuch"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_op_exists"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_op_exists"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_op_exists"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_op_exists"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_op_exists"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_op_exists"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_op_exists"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_op_exists"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_op_exists"("name", "name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_op_exists"("name", "name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_op_exists"("name", "name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_op_exists"("name", "name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_opc_exists"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_opc_exists"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_opc_exists"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_opc_exists"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_opc_exists"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_opc_exists"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_opc_exists"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_opc_exists"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_partof"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_partof"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_partof"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_partof"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_partof"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_partof"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_partof"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_partof"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_parts"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_parts"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_parts"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_parts"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_parts"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_parts"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_parts"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_parts"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_pg_sv_column_array"("oid", smallint[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_pg_sv_column_array"("oid", smallint[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_pg_sv_column_array"("oid", smallint[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_pg_sv_column_array"("oid", smallint[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_pg_sv_table_accessible"("oid", "oid") TO "postgres";
GRANT ALL ON FUNCTION "public"."_pg_sv_table_accessible"("oid", "oid") TO "anon";
GRANT ALL ON FUNCTION "public"."_pg_sv_table_accessible"("oid", "oid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_pg_sv_table_accessible"("oid", "oid") TO "service_role";



GRANT ALL ON FUNCTION "public"."_pg_sv_type_array"("oid"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_pg_sv_type_array"("oid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_pg_sv_type_array"("oid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_pg_sv_type_array"("oid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_prokind"("p_oid" "oid") TO "postgres";
GRANT ALL ON FUNCTION "public"."_prokind"("p_oid" "oid") TO "anon";
GRANT ALL ON FUNCTION "public"."_prokind"("p_oid" "oid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_prokind"("p_oid" "oid") TO "service_role";



GRANT ALL ON FUNCTION "public"."_query"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_query"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."_query"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_query"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_refine_vol"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_refine_vol"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."_refine_vol"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_refine_vol"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_relcomp"("text", "anyarray", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_relcomp"("text", "anyarray", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_relcomp"("text", "anyarray", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_relcomp"("text", "anyarray", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_relcomp"("text", "text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_relcomp"("text", "text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_relcomp"("text", "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_relcomp"("text", "text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_relcomp"("text", "text", "text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_relcomp"("text", "text", "text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_relcomp"("text", "text", "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_relcomp"("text", "text", "text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_relexists"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_relexists"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_relexists"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_relexists"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_relexists"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_relexists"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_relexists"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_relexists"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_relne"("text", "anyarray", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_relne"("text", "anyarray", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_relne"("text", "anyarray", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_relne"("text", "anyarray", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_relne"("text", "text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_relne"("text", "text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_relne"("text", "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_relne"("text", "text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_returns"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_returns"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_returns"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_returns"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_returns"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_returns"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_returns"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_returns"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_returns"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_returns"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_returns"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_returns"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_returns"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_returns"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_returns"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_returns"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_retval"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_retval"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."_retval"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_retval"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_rexists"(character[], "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_rexists"(character[], "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_rexists"(character[], "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_rexists"(character[], "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_rexists"(character, "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_rexists"(character, "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_rexists"(character, "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_rexists"(character, "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_rexists"(character[], "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_rexists"(character[], "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_rexists"(character[], "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_rexists"(character[], "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_rexists"(character, "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_rexists"(character, "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_rexists"(character, "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_rexists"(character, "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_rule_on"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_rule_on"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_rule_on"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_rule_on"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_rule_on"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_rule_on"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_rule_on"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_rule_on"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_runem"("text"[], boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_runem"("text"[], boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_runem"("text"[], boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_runem"("text"[], boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_runner"("text"[], "text"[], "text"[], "text"[], "text"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_runner"("text"[], "text"[], "text"[], "text"[], "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_runner"("text"[], "text"[], "text"[], "text"[], "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_runner"("text"[], "text"[], "text"[], "text"[], "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_set"(integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."_set"(integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."_set"(integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_set"(integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."_set"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."_set"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."_set"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_set"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."_set"("text", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_set"("text", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_set"("text", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_set"("text", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_strict"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_strict"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_strict"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_strict"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_strict"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_strict"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_strict"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_strict"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_strict"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_strict"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_strict"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_strict"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_strict"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_strict"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_strict"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_strict"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_table_privs"() TO "postgres";
GRANT ALL ON FUNCTION "public"."_table_privs"() TO "anon";
GRANT ALL ON FUNCTION "public"."_table_privs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_table_privs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_temptable"("anyarray", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_temptable"("anyarray", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_temptable"("anyarray", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_temptable"("anyarray", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_temptable"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_temptable"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_temptable"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_temptable"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_temptypes"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_temptypes"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."_temptypes"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_temptypes"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_time_trials"("text", integer, numeric) TO "postgres";
GRANT ALL ON FUNCTION "public"."_time_trials"("text", integer, numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."_time_trials"("text", integer, numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_time_trials"("text", integer, numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."_tlike"(boolean, "text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_tlike"(boolean, "text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_tlike"(boolean, "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_tlike"(boolean, "text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_todo"() TO "postgres";
GRANT ALL ON FUNCTION "public"."_todo"() TO "anon";
GRANT ALL ON FUNCTION "public"."_todo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_todo"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_trig"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_trig"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_trig"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_trig"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_trig"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_trig"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_trig"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_trig"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_type_func"("char", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_type_func"("char", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_type_func"("char", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_type_func"("char", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_type_func"("char", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_type_func"("char", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_type_func"("char", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_type_func"("char", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_type_func"("char", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_type_func"("char", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_type_func"("char", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_type_func"("char", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_type_func"("char", "name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_type_func"("char", "name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_type_func"("char", "name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_type_func"("char", "name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_typename"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_typename"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_typename"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_typename"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_types_are"("name"[], "text", character[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_types_are"("name"[], "text", character[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_types_are"("name"[], "text", character[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_types_are"("name"[], "text", character[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_types_are"("name", "name"[], "text", character[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_types_are"("name", "name"[], "text", character[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_types_are"("name", "name"[], "text", character[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_types_are"("name", "name"[], "text", character[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_unalike"(boolean, "anyelement", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_unalike"(boolean, "anyelement", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_unalike"(boolean, "anyelement", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_unalike"(boolean, "anyelement", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_vol"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_vol"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."_vol"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_vol"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_vol"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_vol"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_vol"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_vol"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."_vol"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."_vol"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."_vol"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_vol"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."_vol"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."_vol"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."_vol"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_vol"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON TABLE "public"."workout_logs" TO "anon";
GRANT ALL ON TABLE "public"."workout_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_logs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."_workout_log_for_write"("p_log" "uuid", "p_coach_only" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_workout_log_for_write"("p_log" "uuid", "p_coach_only" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_staff_invitation"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_staff_invitation"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_staff_invitation"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."activity_detail_upsert"("p_activity" "uuid", "p_detail" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activity_detail_upsert"("p_activity" "uuid", "p_detail" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activity_detail_upsert"("p_activity" "uuid", "p_detail" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."activity_detail_visible"("p_athlete" "uuid", "p_source" "public"."data_source") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activity_detail_visible"("p_athlete" "uuid", "p_source" "public"."data_source") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activity_detail_visible"("p_athlete" "uuid", "p_source" "public"."data_source") TO "service_role";



GRANT ALL ON FUNCTION "public"."activity_from_garmin_device"("p_source" "public"."data_source", "p_raw" "jsonb", "p_device" "text", "p_sources" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."activity_from_garmin_device"("p_source" "public"."data_source", "p_raw" "jsonb", "p_device" "text", "p_sources" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."activity_from_garmin_device"("p_source" "public"."data_source", "p_raw" "jsonb", "p_device" "text", "p_sources" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."activity_laps_editor"("p_athlete" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activity_laps_editor"("p_athlete" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activity_laps_editor"("p_athlete" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."activity_sport_family"("p_sport" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."activity_sport_family"("p_sport" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activity_sport_family"("p_sport" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."activity_zone_seconds"("p_t" integer[], "p_timer" integer[], "p_hr" smallint[], "p_bounds" smallint[]) TO "anon";
GRANT ALL ON FUNCTION "public"."activity_zone_seconds"("p_t" integer[], "p_timer" integer[], "p_hr" smallint[], "p_bounds" smallint[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."activity_zone_seconds"("p_t" integer[], "p_timer" integer[], "p_hr" smallint[], "p_bounds" smallint[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_co_coach"("p_athlete" "uuid", "p_coach_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_co_coach"("p_athlete" "uuid", "p_coach_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_co_coach"("p_athlete" "uuid", "p_coach_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_result"(boolean, boolean, "text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."add_result"(boolean, boolean, "text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_result"(boolean, boolean, "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_result"(boolean, boolean, "text", "text", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ai_eligible_sources"("p_athlete" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ai_eligible_sources"("p_athlete" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ai_eligible_sources"("p_athlete" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."alike"("anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."alike"("anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."alike"("anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."alike"("anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."alike"("anyelement", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."alike"("anyelement", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."alike"("anyelement", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."alike"("anyelement", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."any_column_privs_are"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."any_column_privs_are"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."any_column_privs_are"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."any_column_privs_are"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."any_column_privs_are"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."any_column_privs_are"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."any_column_privs_are"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."any_column_privs_are"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."any_column_privs_are"("name", "name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."any_column_privs_are"("name", "name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."any_column_privs_are"("name", "name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."any_column_privs_are"("name", "name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."any_column_privs_are"("name", "name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."any_column_privs_are"("name", "name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."any_column_privs_are"("name", "name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."any_column_privs_are"("name", "name", "name", "name"[], "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_hr_zone_model_to_past"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_hr_zone_model_to_past"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_hr_zone_model_to_past"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_source_ai_policy"() TO "anon";
GRANT ALL ON FUNCTION "public"."apply_source_ai_policy"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_source_ai_policy"() TO "service_role";



GRANT ALL ON FUNCTION "public"."athlete_staff_before_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."athlete_staff_before_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."athlete_staff_before_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."athlete_staff_before_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."athlete_staff_before_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."athlete_staff_before_update"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."auto_link_day"("p_athlete" "uuid", "p_day" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auto_link_day"("p_athlete" "uuid", "p_day" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."bag_eq"("text", "anyarray") TO "postgres";
GRANT ALL ON FUNCTION "public"."bag_eq"("text", "anyarray") TO "anon";
GRANT ALL ON FUNCTION "public"."bag_eq"("text", "anyarray") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bag_eq"("text", "anyarray") TO "service_role";



GRANT ALL ON FUNCTION "public"."bag_eq"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."bag_eq"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."bag_eq"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bag_eq"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."bag_eq"("text", "anyarray", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."bag_eq"("text", "anyarray", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."bag_eq"("text", "anyarray", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bag_eq"("text", "anyarray", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."bag_eq"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."bag_eq"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."bag_eq"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bag_eq"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."bag_has"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."bag_has"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."bag_has"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bag_has"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."bag_has"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."bag_has"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."bag_has"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bag_has"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."bag_hasnt"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."bag_hasnt"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."bag_hasnt"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bag_hasnt"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."bag_hasnt"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."bag_hasnt"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."bag_hasnt"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bag_hasnt"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."bag_ne"("text", "anyarray") TO "postgres";
GRANT ALL ON FUNCTION "public"."bag_ne"("text", "anyarray") TO "anon";
GRANT ALL ON FUNCTION "public"."bag_ne"("text", "anyarray") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bag_ne"("text", "anyarray") TO "service_role";



GRANT ALL ON FUNCTION "public"."bag_ne"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."bag_ne"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."bag_ne"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bag_ne"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."bag_ne"("text", "anyarray", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."bag_ne"("text", "anyarray", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."bag_ne"("text", "anyarray", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bag_ne"("text", "anyarray", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."bag_ne"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."bag_ne"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."bag_ne"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bag_ne"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."can"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."can"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."can"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."can"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."can"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."can"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."can"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."can"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."can"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."can"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_coach_athlete"("athlete_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_coach_athlete"("athlete_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_coach_athlete"("athlete_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_read_doc"("doc_uuid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_read_doc"("doc_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_read_doc"("doc_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_doc"("doc_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_read_doc_file"("object_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_read_doc_file"("object_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_read_doc_file"("object_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_doc_file"("object_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cast_context_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."cast_context_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cast_context_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cast_context_is"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cast_context_is"("name", "name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."cast_context_is"("name", "name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cast_context_is"("name", "name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cast_context_is"("name", "name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."casts_are"("text"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."casts_are"("text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."casts_are"("text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."casts_are"("text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."casts_are"("text"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."casts_are"("text"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."casts_are"("text"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."casts_are"("text"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_microcycle_dates"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_microcycle_dates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_microcycle_dates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_test"("text", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."check_test"("text", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."check_test"("text", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_test"("text", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_test"("text", boolean, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."check_test"("text", boolean, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_test"("text", boolean, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_test"("text", boolean, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_test"("text", boolean, "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."check_test"("text", boolean, "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_test"("text", boolean, "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_test"("text", boolean, "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_test"("text", boolean, "text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."check_test"("text", boolean, "text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_test"("text", boolean, "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_test"("text", boolean, "text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_test"("text", boolean, "text", "text", "text", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."check_test"("text", boolean, "text", "text", "text", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."check_test"("text", boolean, "text", "text", "text", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_test"("text", boolean, "text", "text", "text", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."citation_likes_sync"() TO "anon";
GRANT ALL ON FUNCTION "public"."citation_likes_sync"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."citation_likes_sync"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."close_unfinished_workouts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_unfinished_workouts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cmp_ok"("anyelement", "text", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."cmp_ok"("anyelement", "text", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."cmp_ok"("anyelement", "text", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cmp_ok"("anyelement", "text", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."cmp_ok"("anyelement", "text", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."cmp_ok"("anyelement", "text", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cmp_ok"("anyelement", "text", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cmp_ok"("anyelement", "text", "anyelement", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."coach_api_hit"("p_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coach_api_hit"("p_key" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."coach_code_exists"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coach_code_exists"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."coach_code_exists"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."coach_code_exists"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."coach_preview_by_code"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coach_preview_by_code"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."coach_preview_by_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."coach_preview_by_code"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."coach_profile_visible"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coach_profile_visible"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."coach_profile_visible"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "name", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "name", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "name", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "name", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_default_is"("name", "name", "name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_has_check"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_has_default"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_has_default"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."col_has_default"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_has_default"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_has_default"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_has_default"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_has_default"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_has_default"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_has_default"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_has_default"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_has_default"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_has_default"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_hasnt_default"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_hasnt_default"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."col_hasnt_default"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_hasnt_default"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_hasnt_default"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_hasnt_default"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_hasnt_default"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_hasnt_default"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_hasnt_default"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_hasnt_default"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_hasnt_default"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_hasnt_default"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_fk"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_null"("table_name" "name", "column_name" "name", "description" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_null"("table_name" "name", "column_name" "name", "description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_null"("table_name" "name", "column_name" "name", "description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_null"("table_name" "name", "column_name" "name", "description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_null"("schema_name" "name", "table_name" "name", "column_name" "name", "description" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_null"("schema_name" "name", "table_name" "name", "column_name" "name", "description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_null"("schema_name" "name", "table_name" "name", "column_name" "name", "description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_null"("schema_name" "name", "table_name" "name", "column_name" "name", "description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_pk"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_is_unique"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_isnt_fk"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_isnt_pk"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_not_null"("table_name" "name", "column_name" "name", "description" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_not_null"("table_name" "name", "column_name" "name", "description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_not_null"("table_name" "name", "column_name" "name", "description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_not_null"("table_name" "name", "column_name" "name", "description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_not_null"("schema_name" "name", "table_name" "name", "column_name" "name", "description" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_not_null"("schema_name" "name", "table_name" "name", "column_name" "name", "description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_not_null"("schema_name" "name", "table_name" "name", "column_name" "name", "description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_not_null"("schema_name" "name", "table_name" "name", "column_name" "name", "description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "name", "name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "name", "name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "name", "name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."col_type_is"("name", "name", "name", "name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."collect_tap"(VARIADIC "text"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."collect_tap"(VARIADIC "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."collect_tap"(VARIADIC "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."collect_tap"(VARIADIC "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."collect_tap"(character varying[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."collect_tap"(character varying[]) TO "anon";
GRANT ALL ON FUNCTION "public"."collect_tap"(character varying[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."collect_tap"(character varying[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."column_privs_are"("name", "name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."column_privs_are"("name", "name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."column_privs_are"("name", "name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."column_privs_are"("name", "name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."column_privs_are"("name", "name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."column_privs_are"("name", "name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."column_privs_are"("name", "name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."column_privs_are"("name", "name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."column_privs_are"("name", "name", "name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."column_privs_are"("name", "name", "name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."column_privs_are"("name", "name", "name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."column_privs_are"("name", "name", "name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."column_privs_are"("name", "name", "name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."column_privs_are"("name", "name", "name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."column_privs_are"("name", "name", "name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."column_privs_are"("name", "name", "name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."columns_are"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."columns_are"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."columns_are"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."columns_are"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."columns_are"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."columns_are"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."columns_are"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."columns_are"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."columns_are"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."columns_are"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."columns_are"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."columns_are"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."columns_are"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."columns_are"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."columns_are"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."columns_are"("name", "name", "name"[], "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_energy_assignment"("p_assignment" "uuid", "p_block_logs" "jsonb", "p_notes" "text", "p_duration_min" integer, "p_activity_url" "text", "p_activity_type" "text", "p_distance_km" numeric, "p_rpe" smallint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_energy_assignment"("p_assignment" "uuid", "p_block_logs" "jsonb", "p_notes" "text", "p_duration_min" integer, "p_activity_url" "text", "p_activity_type" "text", "p_distance_km" numeric, "p_rpe" smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_energy_assignment"("p_assignment" "uuid", "p_block_logs" "jsonb", "p_notes" "text", "p_duration_min" integer, "p_activity_url" "text", "p_activity_type" "text", "p_distance_km" numeric, "p_rpe" smallint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_workout"("p_log" "uuid", "p_mods" "jsonb", "p_run_km" numeric, "p_rpe" smallint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_workout"("p_log" "uuid", "p_mods" "jsonb", "p_run_km" numeric, "p_rpe" smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_workout"("p_log" "uuid", "p_mods" "jsonb", "p_run_km" numeric, "p_rpe" smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."composite_owner_is"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."composite_owner_is"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."composite_owner_is"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."composite_owner_is"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."composite_owner_is"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."composite_owner_is"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."composite_owner_is"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."composite_owner_is"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."composite_owner_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."composite_owner_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."composite_owner_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."composite_owner_is"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."composite_owner_is"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."composite_owner_is"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."composite_owner_is"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."composite_owner_is"("name", "name", "name", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_oauth_state"("p_state" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_oauth_state"("p_state" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_cycle"("p_athlete" "uuid", "p_name" "text", "p_start" "date", "p_end" "date", "p_mesocycle" "uuid", "p_deload_week" integer, "p_sessions" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_cycle"("p_athlete" "uuid", "p_name" "text", "p_start" "date", "p_end" "date", "p_mesocycle" "uuid", "p_deload_week" integer, "p_sessions" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_cycle"("p_athlete" "uuid", "p_name" "text", "p_start" "date", "p_end" "date", "p_mesocycle" "uuid", "p_deload_week" integer, "p_sessions" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cycle_athlete_id"("p_cycle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cycle_athlete_id"("p_cycle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cycle_athlete_id"("p_cycle_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cycle_coach_id"("p_cycle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cycle_coach_id"("p_cycle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cycle_coach_id"("p_cycle_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."database_privs_are"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."database_privs_are"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."database_privs_are"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."database_privs_are"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."database_privs_are"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."database_privs_are"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."database_privs_are"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."database_privs_are"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."db_owner_is"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."db_owner_is"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."db_owner_is"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."db_owner_is"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."db_owner_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."db_owner_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."db_owner_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."db_owner_is"("name", "name", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."decide_hr_zone_model"("p_id" "uuid", "p_accept" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decide_hr_zone_model"("p_id" "uuid", "p_accept" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decide_hr_zone_model"("p_id" "uuid", "p_accept" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."decide_plan_link"("p_link" "uuid", "p_confirm" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decide_plan_link"("p_link" "uuid", "p_confirm" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decide_plan_link"("p_link" "uuid", "p_confirm" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_energy_session"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_energy_session"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_energy_session"("p_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."diag"(VARIADIC "text"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."diag"(VARIADIC "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."diag"(VARIADIC "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."diag"(VARIADIC "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."diag"(VARIADIC "anyarray") TO "postgres";
GRANT ALL ON FUNCTION "public"."diag"(VARIADIC "anyarray") TO "anon";
GRANT ALL ON FUNCTION "public"."diag"(VARIADIC "anyarray") TO "authenticated";
GRANT ALL ON FUNCTION "public"."diag"(VARIADIC "anyarray") TO "service_role";



GRANT ALL ON FUNCTION "public"."diag"("msg" "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."diag"("msg" "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."diag"("msg" "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."diag"("msg" "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."diag"("msg" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."diag"("msg" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."diag"("msg" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."diag"("msg" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."diag_test_name"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."diag_test_name"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."diag_test_name"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."diag_test_name"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."display_oper"("name", "oid") TO "postgres";
GRANT ALL ON FUNCTION "public"."display_oper"("name", "oid") TO "anon";
GRANT ALL ON FUNCTION "public"."display_oper"("name", "oid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."display_oper"("name", "oid") TO "service_role";



GRANT ALL ON FUNCTION "public"."do_tap"() TO "postgres";
GRANT ALL ON FUNCTION "public"."do_tap"() TO "anon";
GRANT ALL ON FUNCTION "public"."do_tap"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."do_tap"() TO "service_role";



GRANT ALL ON FUNCTION "public"."do_tap"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."do_tap"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."do_tap"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."do_tap"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."do_tap"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."do_tap"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."do_tap"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."do_tap"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."do_tap"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."do_tap"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."do_tap"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."do_tap"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."doc_for_my_athlete"("doc_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."doc_for_my_athlete"("doc_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."doc_for_my_athlete"("doc_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."doesnt_imatch"("anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."doesnt_imatch"("anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."doesnt_imatch"("anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."doesnt_imatch"("anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."doesnt_imatch"("anyelement", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."doesnt_imatch"("anyelement", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."doesnt_imatch"("anyelement", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."doesnt_imatch"("anyelement", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."doesnt_match"("anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."doesnt_match"("anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."doesnt_match"("anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."doesnt_match"("anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."doesnt_match"("anyelement", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."doesnt_match"("anyelement", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."doesnt_match"("anyelement", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."doesnt_match"("anyelement", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."domain_type_is"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."domain_type_is"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."domain_type_is"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."domain_type_is"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."domain_type_is"("name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."domain_type_is"("name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."domain_type_is"("name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."domain_type_is"("name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."domain_type_is"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."domain_type_is"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."domain_type_is"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."domain_type_is"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."domain_type_is"("name", "text", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."domain_type_is"("name", "text", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."domain_type_is"("name", "text", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."domain_type_is"("name", "text", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."domain_type_is"("name", "text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."domain_type_is"("name", "text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."domain_type_is"("name", "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."domain_type_is"("name", "text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."domain_type_is"("name", "text", "name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."domain_type_is"("name", "text", "name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."domain_type_is"("name", "text", "name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."domain_type_is"("name", "text", "name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."domain_type_isnt"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."domain_type_isnt"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."domain_type_isnt"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."domain_type_isnt"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."domain_type_isnt"("name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."domain_type_isnt"("name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."domain_type_isnt"("name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."domain_type_isnt"("name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."domain_type_isnt"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."domain_type_isnt"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."domain_type_isnt"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."domain_type_isnt"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."domain_type_isnt"("name", "text", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."domain_type_isnt"("name", "text", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."domain_type_isnt"("name", "text", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."domain_type_isnt"("name", "text", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."domain_type_isnt"("name", "text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."domain_type_isnt"("name", "text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."domain_type_isnt"("name", "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."domain_type_isnt"("name", "text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."domain_type_isnt"("name", "text", "name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."domain_type_isnt"("name", "text", "name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."domain_type_isnt"("name", "text", "name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."domain_type_isnt"("name", "text", "name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."domains_are"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."domains_are"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."domains_are"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."domains_are"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."domains_are"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."domains_are"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."domains_are"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."domains_are"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."domains_are"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."domains_are"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."domains_are"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."domains_are"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."domains_are"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."domains_are"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."domains_are"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."domains_are"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."drop_co_coach_on_coach_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."drop_co_coach_on_coach_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."drop_co_coach_on_coach_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_min_age_on_signup"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_min_age_on_signup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_min_age_on_signup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enum_has_labels"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."enum_has_labels"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."enum_has_labels"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."enum_has_labels"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."enum_has_labels"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."enum_has_labels"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."enum_has_labels"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enum_has_labels"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enum_has_labels"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."enum_has_labels"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."enum_has_labels"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."enum_has_labels"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."enum_has_labels"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."enum_has_labels"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."enum_has_labels"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enum_has_labels"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enums_are"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."enums_are"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."enums_are"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."enums_are"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."enums_are"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."enums_are"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."enums_are"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enums_are"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enums_are"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."enums_are"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."enums_are"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."enums_are"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."enums_are"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."enums_are"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."enums_are"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enums_are"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."extensions_are"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."extensions_are"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."extensions_are"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."extensions_are"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."extensions_are"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."extensions_are"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."extensions_are"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."extensions_are"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."extensions_are"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."extensions_are"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."extensions_are"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."extensions_are"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."extensions_are"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."extensions_are"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."extensions_are"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."extensions_are"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fail"() TO "postgres";
GRANT ALL ON FUNCTION "public"."fail"() TO "anon";
GRANT ALL ON FUNCTION "public"."fail"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fail"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fail"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."fail"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."fail"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fail"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fdw_privs_are"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."fdw_privs_are"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."fdw_privs_are"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fdw_privs_are"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."fdw_privs_are"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."fdw_privs_are"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fdw_privs_are"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fdw_privs_are"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."findfuncs"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."findfuncs"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."findfuncs"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."findfuncs"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."findfuncs"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."findfuncs"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."findfuncs"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."findfuncs"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."findfuncs"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."findfuncs"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."findfuncs"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."findfuncs"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."findfuncs"("name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."findfuncs"("name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."findfuncs"("name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."findfuncs"("name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."finish"("exception_on_failure" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."finish"("exception_on_failure" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."finish"("exception_on_failure" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."finish"("exception_on_failure" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name"[], "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name"[], "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name"[], "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name"[], "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name"[], "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name"[], "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name"[], "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name"[], "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name"[], "name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name"[], "name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name"[], "name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name"[], "name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name"[], "name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name"[], "name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name"[], "name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name"[], "name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fk_ok"("name", "name", "name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."foreign_table_owner_is"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."foreign_table_owner_is"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."foreign_table_owner_is"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."foreign_table_owner_is"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."foreign_table_owner_is"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."foreign_table_owner_is"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."foreign_table_owner_is"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."foreign_table_owner_is"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."foreign_table_owner_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."foreign_table_owner_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."foreign_table_owner_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."foreign_table_owner_is"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."foreign_table_owner_is"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."foreign_table_owner_is"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."foreign_table_owner_is"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."foreign_table_owner_is"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."foreign_tables_are"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."foreign_tables_are"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."foreign_tables_are"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."foreign_tables_are"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."foreign_tables_are"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."foreign_tables_are"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."foreign_tables_are"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."foreign_tables_are"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."foreign_tables_are"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."foreign_tables_are"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."foreign_tables_are"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."foreign_tables_are"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."foreign_tables_are"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."foreign_tables_are"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."foreign_tables_are"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."foreign_tables_are"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."format_type_string"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."format_type_string"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."format_type_string"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."format_type_string"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name"[], "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name"[], "name") TO "anon";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name"[], "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name"[], "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name"[], "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name"[], "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name"[], "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name"[], "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "name"[], "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "name"[], "name") TO "anon";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "name"[], "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "name"[], "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "name"[], "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "name"[], "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "name"[], "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_lang_is"("name", "name", "name"[], "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_owner_is"("name", "name"[], "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_owner_is"("name", "name"[], "name") TO "anon";
GRANT ALL ON FUNCTION "public"."function_owner_is"("name", "name"[], "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_owner_is"("name", "name"[], "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_owner_is"("name", "name"[], "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_owner_is"("name", "name"[], "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."function_owner_is"("name", "name"[], "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_owner_is"("name", "name"[], "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_owner_is"("name", "name", "name"[], "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_owner_is"("name", "name", "name"[], "name") TO "anon";
GRANT ALL ON FUNCTION "public"."function_owner_is"("name", "name", "name"[], "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_owner_is"("name", "name", "name"[], "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_owner_is"("name", "name", "name"[], "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_owner_is"("name", "name", "name"[], "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."function_owner_is"("name", "name", "name"[], "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_owner_is"("name", "name", "name"[], "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_privs_are"("name", "name"[], "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."function_privs_are"("name", "name"[], "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."function_privs_are"("name", "name"[], "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_privs_are"("name", "name"[], "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."function_privs_are"("name", "name"[], "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_privs_are"("name", "name"[], "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."function_privs_are"("name", "name"[], "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_privs_are"("name", "name"[], "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_privs_are"("name", "name", "name"[], "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."function_privs_are"("name", "name", "name"[], "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."function_privs_are"("name", "name", "name"[], "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_privs_are"("name", "name", "name"[], "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."function_privs_are"("name", "name", "name"[], "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_privs_are"("name", "name", "name"[], "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."function_privs_are"("name", "name", "name"[], "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_privs_are"("name", "name", "name"[], "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_returns"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_returns"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_returns"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_returns"("name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_returns"("name", "name"[], "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "name"[], "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "name"[], "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "name"[], "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_returns"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_returns"("name", "name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."function_returns"("name", "name", "name"[], "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "name", "name"[], "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "name", "name"[], "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."function_returns"("name", "name", "name"[], "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."functions_are"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."functions_are"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."functions_are"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."functions_are"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."functions_are"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."functions_are"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."functions_are"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."functions_are"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."functions_are"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."functions_are"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."functions_are"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."functions_are"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."functions_are"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."functions_are"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."functions_are"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."functions_are"("name", "name"[], "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_app_update_reads"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_app_update_reads"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_app_update_reads"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_claim_info"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_claim_info"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_claim_info"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_coach_overview"("coach_uuid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_coach_overview"("coach_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_coach_overview"("coach_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_coach_overview"("coach_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_coaches_list"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_coaches_list"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_coaches_list"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_coach_email"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_coach_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_coach_email"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_staff_invitation"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_staff_invitation"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_staff_invitation"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_staff_invitation"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."groups_are"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."groups_are"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."groups_are"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."groups_are"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."groups_are"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."groups_are"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."groups_are"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."groups_are"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_co_coach_profile_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_co_coach_profile_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_co_coach_profile_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_profile_privileged_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_profile_privileged_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_profile_privileged_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."halt_sync_on_consent_withdrawal"() TO "anon";
GRANT ALL ON FUNCTION "public"."halt_sync_on_consent_withdrawal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."halt_sync_on_consent_withdrawal"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_cast"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_cast"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_cast"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_cast"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_cast"("name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_check"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_check"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_check"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_check"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_check"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_check"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_check"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_check"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_check"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_check"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_check"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_check"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_column"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_column"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_column"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_column"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_column"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_column"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_column"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_column"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_column"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_column"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_column"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_column"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_composite"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_composite"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_composite"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_composite"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_composite"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_composite"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_composite"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_composite"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_composite"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_composite"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_composite"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_composite"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_domain"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_domain"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_domain"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_domain"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_domain"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_domain"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_domain"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_domain"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_domain"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_domain"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_domain"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_domain"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_domain"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_domain"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_domain"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_domain"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_enum"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_enum"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_enum"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_enum"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_enum"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_enum"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_enum"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_enum"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_enum"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_enum"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_enum"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_enum"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_enum"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_enum"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_enum"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_enum"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_extension"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_extension"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_extension"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_extension"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_extension"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_extension"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_extension"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_extension"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_extension"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_extension"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_extension"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_extension"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_extension"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_extension"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_extension"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_extension"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_fk"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_fk"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_fk"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_fk"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_fk"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_fk"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_fk"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_fk"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_fk"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_fk"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_fk"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_fk"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_foreign_table"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_foreign_table"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_foreign_table"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_foreign_table"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_foreign_table"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_foreign_table"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_foreign_table"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_foreign_table"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_foreign_table"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_foreign_table"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_foreign_table"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_foreign_table"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_foreign_table"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_foreign_table"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_foreign_table"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_foreign_table"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_function"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_function"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_function"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_function"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_function"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."has_function"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."has_function"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_function"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."has_function"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_function"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_function"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_function"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_function"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_function"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_function"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_function"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_function"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_function"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_function"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_function"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_function"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."has_function"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."has_function"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_function"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."has_function"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_function"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_function"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_function"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_function"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_function"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_function"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_function"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_group"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_group"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_group"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_group"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_group"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_group"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_group"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_group"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_index"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_index"("name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_inherited_tables"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_inherited_tables"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_inherited_tables"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_inherited_tables"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_inherited_tables"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_inherited_tables"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_inherited_tables"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_inherited_tables"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_inherited_tables"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_inherited_tables"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_inherited_tables"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_inherited_tables"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_inherited_tables"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_inherited_tables"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_inherited_tables"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_inherited_tables"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_language"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_language"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_language"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_language"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_language"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_language"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_language"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_language"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_leftop"("name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_materialized_view"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_materialized_view"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_materialized_view"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_materialized_view"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_materialized_view"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_materialized_view"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_materialized_view"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_materialized_view"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_materialized_view"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_materialized_view"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_materialized_view"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_materialized_view"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_opclass"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_opclass"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_opclass"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_opclass"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_opclass"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_opclass"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_opclass"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_opclass"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_opclass"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_opclass"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_opclass"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_opclass"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_opclass"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_opclass"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_opclass"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_opclass"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_operator"("name", "name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_pk"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_pk"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_pk"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_pk"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_pk"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_pk"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_pk"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_pk"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_pk"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_pk"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_pk"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_pk"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_pk"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_pk"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_pk"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_pk"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_relation"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_relation"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_relation"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_relation"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_relation"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_relation"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_relation"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_relation"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_relation"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_relation"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_relation"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_relation"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_rightop"("name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_role"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_role"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_rule"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_rule"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_rule"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_rule"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_rule"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_rule"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_rule"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_rule"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_rule"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_rule"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_rule"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_rule"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_rule"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_rule"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_rule"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_rule"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_schema"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_schema"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_schema"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_schema"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_schema"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_schema"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_schema"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_schema"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_sequence"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_sequence"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_sequence"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_sequence"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_sequence"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_sequence"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_sequence"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_sequence"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_sequence"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_sequence"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_sequence"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_sequence"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_sequence"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_sequence"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_sequence"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_sequence"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_table"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_table"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_table"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_table"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_table"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_table"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_table"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_table"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_table"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_table"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_table"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_table"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_table"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_table"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_table"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_table"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_tablespace"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_tablespace"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_tablespace"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_tablespace"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_tablespace"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_tablespace"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_tablespace"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_tablespace"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_tablespace"("name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_tablespace"("name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_tablespace"("name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_tablespace"("name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_trigger"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_trigger"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_trigger"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_trigger"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_trigger"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_trigger"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_trigger"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_trigger"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_trigger"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_trigger"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_trigger"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_trigger"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_trigger"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_trigger"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_trigger"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_trigger"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_type"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_type"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_type"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_type"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_type"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_type"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_type"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_type"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_type"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_type"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_type"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_type"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_type"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_type"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_type"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_type"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_unique"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_unique"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_unique"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_unique"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_unique"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_unique"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_unique"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_unique"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_unique"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_unique"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_unique"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_unique"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_user"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_user"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_user"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_user"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_user"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_user"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_user"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_user"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_view"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_view"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_view"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_view"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_view"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_view"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."has_view"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_view"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_view"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_view"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_view"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_view"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_view"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."has_view"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_view"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_view"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_cast"("name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_column"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_column"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_column"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_column"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_column"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_column"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_column"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_column"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_column"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_column"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_column"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_column"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_composite"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_composite"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_composite"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_composite"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_composite"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_composite"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_composite"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_composite"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_composite"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_composite"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_composite"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_composite"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_domain"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_domain"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_domain"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_domain"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_domain"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_domain"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_domain"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_domain"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_domain"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_domain"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_domain"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_domain"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_domain"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_domain"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_domain"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_domain"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_enum"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_enum"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_enum"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_enum"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_enum"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_enum"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_enum"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_enum"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_enum"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_enum"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_enum"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_enum"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_enum"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_enum"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_enum"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_enum"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_extension"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_extension"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_extension"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_extension"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_extension"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_extension"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_extension"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_extension"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_extension"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_extension"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_extension"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_extension"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_extension"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_extension"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_extension"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_extension"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_fk"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_fk"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_fk"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_fk"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_fk"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_fk"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_fk"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_fk"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_fk"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_fk"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_fk"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_fk"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_foreign_table"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_foreign_table"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_foreign_table"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_foreign_table"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_foreign_table"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_foreign_table"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_foreign_table"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_foreign_table"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_foreign_table"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_foreign_table"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_foreign_table"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_foreign_table"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_foreign_table"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_foreign_table"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_foreign_table"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_foreign_table"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_function"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_function"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_group"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_group"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_group"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_group"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_group"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_group"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_group"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_group"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_index"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_index"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_index"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_index"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_index"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_index"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_index"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_index"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_index"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_index"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_index"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_index"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_index"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_index"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_index"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_index"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_inherited_tables"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_inherited_tables"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_inherited_tables"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_inherited_tables"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_inherited_tables"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_inherited_tables"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_inherited_tables"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_inherited_tables"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_inherited_tables"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_inherited_tables"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_inherited_tables"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_inherited_tables"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_inherited_tables"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_inherited_tables"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_inherited_tables"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_inherited_tables"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_language"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_language"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_language"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_language"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_language"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_language"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_language"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_language"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_leftop"("name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_materialized_view"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_materialized_view"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_materialized_view"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_materialized_view"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_materialized_view"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_materialized_view"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_materialized_view"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_materialized_view"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_materialized_view"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_materialized_view"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_materialized_view"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_materialized_view"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_opclass"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_opclass"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_opclass"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_opclass"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_opclass"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_opclass"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_opclass"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_opclass"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_opclass"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_opclass"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_opclass"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_opclass"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_opclass"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_opclass"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_opclass"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_opclass"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_operator"("name", "name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_pk"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_pk"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_pk"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_pk"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_pk"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_pk"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_pk"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_pk"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_pk"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_pk"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_pk"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_pk"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_relation"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_relation"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_relation"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_relation"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_relation"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_relation"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_relation"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_relation"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_relation"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_relation"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_relation"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_relation"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_rightop"("name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_role"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_role"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_role"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_role"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_role"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_role"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_role"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_role"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_rule"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_rule"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_rule"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_rule"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_rule"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_rule"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_rule"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_rule"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_rule"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_rule"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_rule"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_rule"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_rule"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_rule"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_rule"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_rule"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_schema"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_schema"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_schema"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_schema"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_schema"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_schema"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_schema"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_schema"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_sequence"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_sequence"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_sequence"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_sequence"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_sequence"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_sequence"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_sequence"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_sequence"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_sequence"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_sequence"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_sequence"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_sequence"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_table"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_table"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_table"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_table"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_table"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_table"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_table"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_table"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_table"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_table"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_table"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_table"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_table"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_table"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_table"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_table"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_tablespace"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_tablespace"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_tablespace"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_tablespace"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_tablespace"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_tablespace"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_tablespace"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_tablespace"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_trigger"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_trigger"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_trigger"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_trigger"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_trigger"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_trigger"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_trigger"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_trigger"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_trigger"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_trigger"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_trigger"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_trigger"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_trigger"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_trigger"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_trigger"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_trigger"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_type"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_type"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_type"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_type"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_type"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_type"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_type"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_type"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_type"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_type"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_type"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_type"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_type"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_type"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_type"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_type"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_user"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_user"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_user"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_user"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_user"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_user"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_user"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_user"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_view"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_view"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_view"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_view"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_view"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_view"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_view"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_view"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_view"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_view"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_view"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_view"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hasnt_view"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."hasnt_view"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hasnt_view"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hasnt_view"("name", "name", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."health_app_data_sync"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."health_app_data_sync"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."health_day"("p" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."health_day"("p" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."health_hm"("p" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."health_hm"("p" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."health_item"("p" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."health_item"("p" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."health_num"("p" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."health_num"("p" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."wellness_entries" TO "service_role";
GRANT SELECT ON TABLE "public"."wellness_entries" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."health_parse_wellness"("p_athlete" "uuid", "p_key" "text", "p_v" "jsonb", "p_archived" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."health_parse_wellness"("p_athlete" "uuid", "p_key" "text", "p_v" "jsonb", "p_archived" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."health_resync"("p_athlete" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."health_resync"("p_athlete" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."health_sync_goals"("p_athlete" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."health_sync_goals"("p_athlete" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."health_sync_key"("p_athlete" "uuid", "p_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."health_sync_key"("p_athlete" "uuid", "p_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."health_sync_milestones"("p_athlete" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."health_sync_milestones"("p_athlete" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."health_sync_weight"("p_athlete" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."health_sync_weight"("p_athlete" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."health_sync_wellness"("p_athlete" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."health_sync_wellness"("p_athlete" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."health_text"("p" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."health_text"("p" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."hr_bounds_valid"("b" smallint[]) TO "anon";
GRANT ALL ON FUNCTION "public"."hr_bounds_valid"("b" smallint[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hr_bounds_valid"("b" smallint[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."hr_zone_bounds_at"("p_athlete" "uuid", "p_day" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hr_zone_bounds_at"("p_athlete" "uuid", "p_day" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hr_zone_bounds_at"("p_athlete" "uuid", "p_day" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."hyrox_test_analyses_freeze"() TO "anon";
GRANT ALL ON FUNCTION "public"."hyrox_test_analyses_freeze"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."hyrox_test_analyses_freeze"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ialike"("anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."ialike"("anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ialike"("anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ialike"("anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ialike"("anyelement", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."ialike"("anyelement", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ialike"("anyelement", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ialike"("anyelement", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."imatches"("anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."imatches"("anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."imatches"("anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."imatches"("anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."imatches"("anyelement", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."imatches"("anyelement", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."imatches"("anyelement", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."imatches"("anyelement", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."in_todo"() TO "postgres";
GRANT ALL ON FUNCTION "public"."in_todo"() TO "anon";
GRANT ALL ON FUNCTION "public"."in_todo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."in_todo"() TO "service_role";



GRANT ALL ON FUNCTION "public"."index_is_primary"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."index_is_primary"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."index_is_primary"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."index_is_primary"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."index_is_primary"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."index_is_primary"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."index_is_primary"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."index_is_primary"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."index_is_primary"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."index_is_primary"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."index_is_primary"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."index_is_primary"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."index_is_primary"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."index_is_primary"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."index_is_primary"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."index_is_primary"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."index_is_type"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."index_is_type"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."index_is_type"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."index_is_type"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."index_is_type"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."index_is_type"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."index_is_type"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."index_is_type"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."index_is_type"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."index_is_type"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."index_is_type"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."index_is_type"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."index_is_type"("name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."index_is_type"("name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."index_is_type"("name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."index_is_type"("name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."index_is_unique"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."index_is_unique"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."index_is_unique"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."index_is_unique"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."index_is_unique"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."index_is_unique"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."index_is_unique"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."index_is_unique"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."index_is_unique"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."index_is_unique"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."index_is_unique"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."index_is_unique"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."index_is_unique"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."index_is_unique"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."index_is_unique"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."index_is_unique"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."index_owner_is"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."index_owner_is"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."index_owner_is"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."index_owner_is"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."index_owner_is"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."index_owner_is"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."index_owner_is"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."index_owner_is"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."index_owner_is"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."index_owner_is"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."index_owner_is"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."index_owner_is"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."index_owner_is"("name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."index_owner_is"("name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."index_owner_is"("name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."index_owner_is"("name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."indexes_are"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."indexes_are"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."indexes_are"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."indexes_are"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."indexes_are"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."indexes_are"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."indexes_are"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."indexes_are"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."indexes_are"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."indexes_are"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."indexes_are"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."indexes_are"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."indexes_are"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."indexes_are"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."indexes_are"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."indexes_are"("name", "name", "name"[], "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."invitation_coach_name"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invitation_coach_name"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invitation_coach_name"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invitation_coach_name"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."invitation_is_valid"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invitation_is_valid"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invitation_is_valid"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invitation_is_valid"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is"("anyelement", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."is"("anyelement", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."is"("anyelement", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is"("anyelement", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."is"("anyelement", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is"("anyelement", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is"("anyelement", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is"("anyelement", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_aggregate"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_aggregate"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "name", "name", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "name", "name", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "name", "name", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "name", "name", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "name", "name", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "name", "name", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "name", "name", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_ancestor_of"("name", "name", "name", "name", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_athlete_coach"("athlete_uuid" "uuid", "p_coach" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_athlete_coach"("athlete_uuid" "uuid", "p_coach" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_athlete_coach"("athlete_uuid" "uuid", "p_coach" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_clustered"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_clustered"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_clustered"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_clustered"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_clustered"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_clustered"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_clustered"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_clustered"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_clustered"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_clustered"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_clustered"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_clustered"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_clustered"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_clustered"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_clustered"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_clustered"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_co_coach_of"("athlete_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_co_coach_of"("athlete_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_co_coach_of"("athlete_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_coach_of"("athlete_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_coach_of"("athlete_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_coach_of"("athlete_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_coach_of_folder"("p_folder" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_coach_of_folder"("p_folder" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_coach_of_folder"("p_folder" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_coach_partner"("p_coach" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_coach_partner"("p_coach" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_coach_partner"("p_coach" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_definer"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_definer"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_definer"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_definer"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_definer"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_definer"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_definer"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_definer"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_definer"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_definer"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_definer"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_definer"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "name", "name", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "name", "name", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "name", "name", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "name", "name", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "name", "name", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "name", "name", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "name", "name", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_descendent_of"("name", "name", "name", "name", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_empty"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_empty"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_empty"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_empty"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_empty"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_empty"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_empty"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_empty"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_indexed"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_member_of"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_member_of"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_member_of"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member_of"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_member_of"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_member_of"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_member_of"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member_of"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_member_of"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_member_of"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_member_of"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member_of"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_member_of"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_member_of"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_member_of"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member_of"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_normal_function"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_normal_function"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_partition_of"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_partition_of"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_partition_of"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_partition_of"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_partition_of"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_partition_of"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_partition_of"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_partition_of"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_partition_of"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_partition_of"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_partition_of"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_partition_of"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_partition_of"("name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_partition_of"("name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_partition_of"("name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_partition_of"("name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_partitioned"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_partitioned"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_partitioned"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_partitioned"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_partitioned"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_partitioned"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_partitioned"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_partitioned"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_partitioned"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_partitioned"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_partitioned"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_partitioned"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_partitioned"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_partitioned"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_partitioned"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_partitioned"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_procedure"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_procedure"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_procedure"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_procedure"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_procedure"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_procedure"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_strict"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_strict"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_strict"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_strict"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_strict"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_strict"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_strict"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_strict"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_strict"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_strict"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_strict"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_strict"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_superuser"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_superuser"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_superuser"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_superuser"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_superuser"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_superuser"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_superuser"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_superuser"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_window"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_window"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_window"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_window"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_window"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_window"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_window"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_window"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_window"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_window"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."is_window"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_window"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_window"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_window"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_window"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_window"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_window"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_window"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_window"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_window"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_window"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_window"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_window"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_window"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_window"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_window"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_window"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_window"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_window"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_window"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_window"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_window"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isa_ok"("anyelement", "regtype") TO "postgres";
GRANT ALL ON FUNCTION "public"."isa_ok"("anyelement", "regtype") TO "anon";
GRANT ALL ON FUNCTION "public"."isa_ok"("anyelement", "regtype") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isa_ok"("anyelement", "regtype") TO "service_role";



GRANT ALL ON FUNCTION "public"."isa_ok"("anyelement", "regtype", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isa_ok"("anyelement", "regtype", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isa_ok"("anyelement", "regtype", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isa_ok"("anyelement", "regtype", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt"("anyelement", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt"("anyelement", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt"("anyelement", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt"("anyelement", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt"("anyelement", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt"("anyelement", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt"("anyelement", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt"("anyelement", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_aggregate"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "name", "name", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "name", "name", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "name", "name", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "name", "name", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "name", "name", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "name", "name", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "name", "name", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_ancestor_of"("name", "name", "name", "name", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_definer"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_definer"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "name", "name", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "name", "name", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "name", "name", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "name", "name", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "name", "name", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "name", "name", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "name", "name", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_descendent_of"("name", "name", "name", "name", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_empty"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_empty"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_empty"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_empty"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_empty"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_empty"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_empty"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_empty"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_member_of"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_member_of"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_member_of"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_member_of"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_member_of"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_member_of"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_member_of"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_member_of"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_member_of"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_member_of"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_member_of"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_member_of"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_member_of"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_member_of"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_member_of"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_member_of"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_normal_function"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_partitioned"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_partitioned"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_partitioned"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_partitioned"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_partitioned"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_partitioned"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_partitioned"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_partitioned"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_partitioned"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_partitioned"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_partitioned"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_partitioned"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_partitioned"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_partitioned"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_partitioned"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_partitioned"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_procedure"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_procedure"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_strict"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_strict"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_superuser"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_superuser"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_superuser"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_superuser"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_superuser"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_superuser"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_superuser"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_superuser"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_window"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_window"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_window"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_window"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_window"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."isnt_window"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."jsonb_int_array"("j" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."jsonb_int_array"("j" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."jsonb_int_array"("j" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."jsonb_real_array"("j" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."jsonb_real_array"("j" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."jsonb_real_array"("j" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."language_is_trusted"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."language_is_trusted"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."language_is_trusted"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."language_is_trusted"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."language_is_trusted"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."language_is_trusted"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."language_is_trusted"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."language_is_trusted"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."language_owner_is"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."language_owner_is"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."language_owner_is"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."language_owner_is"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."language_owner_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."language_owner_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."language_owner_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."language_owner_is"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."language_privs_are"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."language_privs_are"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."language_privs_are"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."language_privs_are"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."language_privs_are"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."language_privs_are"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."language_privs_are"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."language_privs_are"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."languages_are"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."languages_are"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."languages_are"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."languages_are"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."languages_are"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."languages_are"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."languages_are"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."languages_are"("name"[], "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."link_activity_to_plan"("p_activity" "uuid", "p_kind" "text", "p_planned" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."link_activity_to_plan"("p_activity" "uuid", "p_kind" "text", "p_planned" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_activity_to_plan"("p_activity" "uuid", "p_kind" "text", "p_planned" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."link_to_coach_by_code"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."link_to_coach_by_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_to_coach_by_code"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."linked_planned_ids"("p_kind" "text", "p_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."linked_planned_ids"("p_kind" "text", "p_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."linked_planned_ids"("p_kind" "text", "p_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_user_storage_objects"("target_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_user_storage_objects"("target_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."lives_ok"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."lives_ok"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."lives_ok"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lives_ok"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."lives_ok"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."lives_ok"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lives_ok"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lives_ok"("text", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_doc_seen"("doc_uuid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_doc_seen"("doc_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_doc_seen"("doc_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_missed_workouts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_missed_workouts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_onboarded"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_onboarded"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_onboarded"() TO "service_role";



GRANT ALL ON FUNCTION "public"."matches"("anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."matches"("anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."matches"("anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."matches"("anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."matches"("anyelement", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."matches"("anyelement", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."matches"("anyelement", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."matches"("anyelement", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."materialized_view_owner_is"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."materialized_view_owner_is"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."materialized_view_owner_is"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."materialized_view_owner_is"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."materialized_view_owner_is"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."materialized_view_owner_is"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."materialized_view_owner_is"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."materialized_view_owner_is"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."materialized_view_owner_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."materialized_view_owner_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."materialized_view_owner_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."materialized_view_owner_is"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."materialized_view_owner_is"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."materialized_view_owner_is"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."materialized_view_owner_is"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."materialized_view_owner_is"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."materialized_views_are"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."materialized_views_are"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."materialized_views_are"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."materialized_views_are"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."materialized_views_are"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."materialized_views_are"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."materialized_views_are"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."materialized_views_are"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."materialized_views_are"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."materialized_views_are"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."materialized_views_are"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."materialized_views_are"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."materialized_views_are"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."materialized_views_are"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."materialized_views_are"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."materialized_views_are"("name", "name"[], "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."merge_provider_activities"("p_athlete" "uuid", "p_source" "public"."data_source", "p_tag" "text", "p_activities" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."merge_provider_activities"("p_athlete" "uuid", "p_source" "public"."data_source", "p_tag" "text", "p_activities" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_provider_activities"("p_athlete" "uuid", "p_source" "public"."data_source", "p_tag" "text", "p_activities" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."merge_provider_activity"("p_athlete" "uuid", "p_source" "public"."data_source", "p_tag" "text", "p_activity" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."merge_provider_activity"("p_athlete" "uuid", "p_source" "public"."data_source", "p_tag" "text", "p_activity" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_provider_activity"("p_athlete" "uuid", "p_source" "public"."data_source", "p_tag" "text", "p_activity" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."mesocycle_athlete_id"("p_mesocycle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mesocycle_athlete_id"("p_mesocycle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mesocycle_athlete_id"("p_mesocycle_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."microcycle_for_athlete_date"("p_athlete_id" "uuid", "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."microcycle_for_athlete_date"("p_athlete_id" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."microcycle_for_athlete_date"("p_athlete_id" "uuid", "p_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_coach_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_coach_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_coach_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_coach_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."no_plan"() TO "postgres";
GRANT ALL ON FUNCTION "public"."no_plan"() TO "anon";
GRANT ALL ON FUNCTION "public"."no_plan"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."no_plan"() TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_metric_name"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_metric_name"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_metric_name"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."num_failed"() TO "postgres";
GRANT ALL ON FUNCTION "public"."num_failed"() TO "anon";
GRANT ALL ON FUNCTION "public"."num_failed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."num_failed"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."nutrition_save_day"("p_athlete" "uuid", "p_day" "date", "p_log" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nutrition_save_day"("p_athlete" "uuid", "p_day" "date", "p_log" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."nutrition_save_day"("p_athlete" "uuid", "p_day" "date", "p_log" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."ok"(boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."ok"(boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."ok"(boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ok"(boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."ok"(boolean, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."ok"(boolean, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ok"(boolean, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ok"(boolean, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."opclass_owner_is"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."opclass_owner_is"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."opclass_owner_is"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."opclass_owner_is"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."opclass_owner_is"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."opclass_owner_is"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."opclass_owner_is"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."opclass_owner_is"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."opclass_owner_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."opclass_owner_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."opclass_owner_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."opclass_owner_is"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."opclass_owner_is"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."opclass_owner_is"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."opclass_owner_is"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."opclass_owner_is"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."opclasses_are"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."opclasses_are"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."opclasses_are"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."opclasses_are"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."opclasses_are"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."opclasses_are"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."opclasses_are"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."opclasses_are"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."opclasses_are"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."opclasses_are"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."opclasses_are"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."opclasses_are"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."opclasses_are"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."opclasses_are"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."opclasses_are"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."opclasses_are"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."operators_are"("text"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."operators_are"("text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."operators_are"("text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."operators_are"("text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."operators_are"("text"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."operators_are"("text"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."operators_are"("text"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."operators_are"("text"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."operators_are"("name", "text"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."operators_are"("name", "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."operators_are"("name", "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."operators_are"("name", "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."operators_are"("name", "text"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."operators_are"("name", "text"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."operators_are"("name", "text"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."operators_are"("name", "text"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."origin_quality_rank"("q" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."origin_quality_rank"("q" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."origin_quality_rank"("q" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."os_name"() TO "postgres";
GRANT ALL ON FUNCTION "public"."os_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."os_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."os_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."outing_sports_compatible"("a" "text", "b" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."outing_sports_compatible"("a" "text", "b" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."outing_sports_compatible"("a" "text", "b" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."partitions_are"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."partitions_are"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."partitions_are"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."partitions_are"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."partitions_are"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."partitions_are"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."partitions_are"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."partitions_are"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."partitions_are"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."partitions_are"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."partitions_are"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."partitions_are"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."partitions_are"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."partitions_are"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."partitions_are"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."partitions_are"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pass"() TO "postgres";
GRANT ALL ON FUNCTION "public"."pass"() TO "anon";
GRANT ALL ON FUNCTION "public"."pass"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pass"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pass"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pass"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."pass"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pass"("text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."patch_workout_entries"("p_log" "uuid", "p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."patch_workout_entries"("p_log" "uuid", "p_patch" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."patch_workout_entries"("p_log" "uuid", "p_patch" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."performance_logs_normalize_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."performance_logs_normalize_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."performance_logs_normalize_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."performs_ok"("text", numeric) TO "postgres";
GRANT ALL ON FUNCTION "public"."performs_ok"("text", numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."performs_ok"("text", numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."performs_ok"("text", numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."performs_ok"("text", numeric, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."performs_ok"("text", numeric, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."performs_ok"("text", numeric, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."performs_ok"("text", numeric, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."performs_within"("text", numeric, numeric) TO "postgres";
GRANT ALL ON FUNCTION "public"."performs_within"("text", numeric, numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."performs_within"("text", numeric, numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."performs_within"("text", numeric, numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."performs_within"("text", numeric, numeric, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."performs_within"("text", numeric, numeric, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."performs_within"("text", numeric, numeric, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."performs_within"("text", numeric, numeric, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."performs_within"("text", numeric, numeric, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."performs_within"("text", numeric, numeric, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."performs_within"("text", numeric, numeric, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."performs_within"("text", numeric, numeric, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."performs_within"("text", numeric, numeric, integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."performs_within"("text", numeric, numeric, integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."performs_within"("text", numeric, numeric, integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."performs_within"("text", numeric, numeric, integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pg_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."pg_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."pg_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pg_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pg_version_num"() TO "postgres";
GRANT ALL ON FUNCTION "public"."pg_version_num"() TO "anon";
GRANT ALL ON FUNCTION "public"."pg_version_num"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pg_version_num"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pgtap_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."pgtap_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."pgtap_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgtap_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."plan"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."plan"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."plan"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."plan"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."plan_family_accepts"("p_planned" "text", "p_activity" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."plan_family_accepts"("p_planned" "text", "p_activity" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."plan_family_accepts"("p_planned" "text", "p_activity" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."plan_match_cost"("a_dist" real, "a_dur" real, "p_dist" real, "p_dur" real) TO "anon";
GRANT ALL ON FUNCTION "public"."plan_match_cost"("a_dist" real, "a_dur" real, "p_dist" real, "p_dur" real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."plan_match_cost"("a_dist" real, "a_dur" real, "p_dist" real, "p_dur" real) TO "service_role";



REVOKE ALL ON FUNCTION "public"."planned_sessions_of_day"("p_athlete" "uuid", "p_day" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."planned_sessions_of_day"("p_athlete" "uuid", "p_day" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."policies_are"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."policies_are"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."policies_are"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."policies_are"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."policies_are"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."policies_are"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."policies_are"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."policies_are"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."policies_are"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."policies_are"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."policies_are"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."policies_are"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."policies_are"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."policies_are"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."policies_are"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."policies_are"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."policy_cmd_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."policy_cmd_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."policy_cmd_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."policy_cmd_is"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."policy_cmd_is"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."policy_cmd_is"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."policy_cmd_is"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."policy_cmd_is"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."policy_cmd_is"("name", "name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."policy_cmd_is"("name", "name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."policy_cmd_is"("name", "name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."policy_cmd_is"("name", "name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."policy_cmd_is"("name", "name", "name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."policy_cmd_is"("name", "name", "name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."policy_cmd_is"("name", "name", "name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."policy_cmd_is"("name", "name", "name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."policy_roles_are"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."policy_roles_are"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."policy_roles_are"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."policy_roles_are"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."policy_roles_are"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."policy_roles_are"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."policy_roles_are"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."policy_roles_are"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."policy_roles_are"("name", "name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."policy_roles_are"("name", "name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."policy_roles_are"("name", "name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."policy_roles_are"("name", "name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."policy_roles_are"("name", "name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."policy_roles_are"("name", "name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."policy_roles_are"("name", "name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."policy_roles_are"("name", "name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_flag_self_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_flag_self_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_flag_self_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_hyrox_flag_self_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_hyrox_flag_self_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_hyrox_flag_self_update"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."program_save_sessions"("p_athlete" "uuid", "p_upsert" "jsonb", "p_base" "jsonb", "p_remove" "text"[], "p_order" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."program_save_sessions"("p_athlete" "uuid", "p_upsert" "jsonb", "p_base" "jsonb", "p_remove" "text"[], "p_order" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."program_save_sessions"("p_athlete" "uuid", "p_upsert" "jsonb", "p_base" "jsonb", "p_remove" "text"[], "p_order" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."provider_daily_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."provider_daily_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."provider_daily_columns"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."provider_daily_merge"("p_athlete" "uuid", "p_source" "public"."data_source", "p_day" "date", "p_kind" "text", "p_fields" "jsonb", "p_raw" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provider_daily_merge"("p_athlete" "uuid", "p_source" "public"."data_source", "p_day" "date", "p_kind" "text", "p_fields" "jsonb", "p_raw" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."provider_fit_quota_exhaust"("p_connection_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provider_fit_quota_exhaust"("p_connection_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."provider_fit_quota_remaining"("p_connection_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provider_fit_quota_remaining"("p_connection_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."provider_fit_quota_reserve"("p_connection_id" "uuid", "p_count" integer, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provider_fit_quota_reserve"("p_connection_id" "uuid", "p_count" integer, "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."provider_forget"("p_athlete" "uuid", "p_provider" "public"."data_source") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provider_forget"("p_athlete" "uuid", "p_provider" "public"."data_source") TO "service_role";



GRANT ALL ON TABLE "public"."provider_webhook_inbox" TO "service_role";



REVOKE ALL ON FUNCTION "public"."provider_inbox_claim"("p_provider" "public"."data_source", "p_ids" "uuid"[], "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provider_inbox_claim"("p_provider" "public"."data_source", "p_ids" "uuid"[], "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."provider_intraday_merge"("p_athlete" "uuid", "p_source" "public"."data_source", "p_day" "date", "p_measure" "text", "p_offsets" integer[], "p_values" real[], "p_utc_offset_s" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provider_intraday_merge"("p_athlete" "uuid", "p_source" "public"."data_source", "p_day" "date", "p_measure" "text", "p_offsets" integer[], "p_values" real[], "p_utc_offset_s" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."provider_raw_objects"("p_athlete" "uuid", "p_provider" "public"."data_source", "p_types" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provider_raw_objects"("p_athlete" "uuid", "p_provider" "public"."data_source", "p_types" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."provider_raw_records_touch"() TO "anon";
GRANT ALL ON FUNCTION "public"."provider_raw_records_touch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."provider_raw_records_touch"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."provider_sync_try_lock"("p_connection_id" "uuid", "p_ttl_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provider_sync_try_lock"("p_connection_id" "uuid", "p_ttl_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."provider_sync_unlock"("p_connection_id" "uuid", "p_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provider_sync_unlock"("p_connection_id" "uuid", "p_token" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."provider_token_claim_refresh"("p_connection_id" "uuid", "p_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provider_token_claim_refresh"("p_connection_id" "uuid", "p_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."provider_token_read"("p_connection_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provider_token_read"("p_connection_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."provider_token_release_refresh"("p_connection_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provider_token_release_refresh"("p_connection_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."provider_token_write"("p_connection_id" "uuid", "p_access_token" "text", "p_refresh_token" "text", "p_expires_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provider_token_write"("p_connection_id" "uuid", "p_access_token" "text", "p_refresh_token" "text", "p_expires_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."provider_tokens_drop_secrets"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provider_tokens_drop_secrets"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."provider_workout_pushes_forget"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provider_workout_pushes_forget"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_expired_oauth_states"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_expired_oauth_states"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."react_weekly_retour"("p_retour_id" "uuid", "p_reaction" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."react_weekly_retour"("p_retour_id" "uuid", "p_reaction" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."react_weekly_retour"("p_retour_id" "uuid", "p_reaction" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."redeem_invitation"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_invitation"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_invitation"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_activity_zone_summary"("p_activity" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_activity_zone_summary"("p_activity" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_athlete_zone_summaries"("p_athlete" "uuid", "p_from" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_athlete_zone_summaries"("p_athlete" "uuid", "p_from" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."relation_owner_is"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."relation_owner_is"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."relation_owner_is"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."relation_owner_is"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."relation_owner_is"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."relation_owner_is"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."relation_owner_is"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."relation_owner_is"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."relation_owner_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."relation_owner_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."relation_owner_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."relation_owner_is"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."relation_owner_is"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."relation_owner_is"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."relation_owner_is"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."relation_owner_is"("name", "name", "name", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_co_coach"("p_athlete" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_co_coach"("p_athlete" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_co_coach"("p_athlete" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reopen_energy_assignment"("p_assignment" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reopen_energy_assignment"("p_assignment" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reopen_energy_assignment"("p_assignment" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reopen_workout"("p_log" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reopen_workout"("p_log" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reopen_workout"("p_log" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_client_build"("p_build" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_client_build"("p_build" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_client_build"("p_build" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."require_sync_consent"() TO "anon";
GRANT ALL ON FUNCTION "public"."require_sync_consent"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."require_sync_consent"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_activity_laps_to_watch"("p_activity" "uuid", "p_expected_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_activity_laps_to_watch"("p_activity" "uuid", "p_expected_version" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_activity_laps_to_watch"("p_activity" "uuid", "p_expected_version" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "anyarray") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "anyarray") TO "anon";
GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "anyarray") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "anyarray") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "refcursor") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "refcursor") TO "anon";
GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "refcursor") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "refcursor") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_eq"("text", "anyarray") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_eq"("text", "anyarray") TO "anon";
GRANT ALL ON FUNCTION "public"."results_eq"("text", "anyarray") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_eq"("text", "anyarray") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_eq"("text", "refcursor") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_eq"("text", "refcursor") TO "anon";
GRANT ALL ON FUNCTION "public"."results_eq"("text", "refcursor") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_eq"("text", "refcursor") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_eq"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_eq"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."results_eq"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_eq"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "anyarray", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "anyarray", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "anyarray", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "anyarray", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "refcursor", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "refcursor", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "refcursor", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "refcursor", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_eq"("refcursor", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_eq"("text", "anyarray", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_eq"("text", "anyarray", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."results_eq"("text", "anyarray", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_eq"("text", "anyarray", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_eq"("text", "refcursor", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_eq"("text", "refcursor", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."results_eq"("text", "refcursor", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_eq"("text", "refcursor", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_eq"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_eq"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."results_eq"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_eq"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "anyarray") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "anyarray") TO "anon";
GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "anyarray") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "anyarray") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "refcursor") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "refcursor") TO "anon";
GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "refcursor") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "refcursor") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_ne"("text", "anyarray") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_ne"("text", "anyarray") TO "anon";
GRANT ALL ON FUNCTION "public"."results_ne"("text", "anyarray") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_ne"("text", "anyarray") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_ne"("text", "refcursor") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_ne"("text", "refcursor") TO "anon";
GRANT ALL ON FUNCTION "public"."results_ne"("text", "refcursor") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_ne"("text", "refcursor") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_ne"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_ne"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."results_ne"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_ne"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "anyarray", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "anyarray", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "anyarray", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "anyarray", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "refcursor", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "refcursor", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "refcursor", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "refcursor", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_ne"("refcursor", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_ne"("text", "anyarray", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_ne"("text", "anyarray", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."results_ne"("text", "anyarray", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_ne"("text", "anyarray", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_ne"("text", "refcursor", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_ne"("text", "refcursor", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."results_ne"("text", "refcursor", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_ne"("text", "refcursor", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."results_ne"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."results_ne"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."results_ne"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."results_ne"("text", "text", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_performance_notification"("p_notification" "uuid", "p_log" "uuid", "p_approve" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_performance_notification"("p_notification" "uuid", "p_log" "uuid", "p_approve" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."review_performance_notification"("p_notification" "uuid", "p_log" "uuid", "p_approve" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."roles_are"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."roles_are"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."roles_are"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."roles_are"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."roles_are"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."roles_are"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."roles_are"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."roles_are"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."row_eq"("text", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."row_eq"("text", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."row_eq"("text", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."row_eq"("text", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."row_eq"("text", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."row_eq"("text", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."row_eq"("text", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."row_eq"("text", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rule_is_instead"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."rule_is_instead"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."rule_is_instead"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rule_is_instead"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."rule_is_instead"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."rule_is_instead"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."rule_is_instead"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rule_is_instead"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."rule_is_instead"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."rule_is_instead"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rule_is_instead"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rule_is_instead"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rule_is_instead"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."rule_is_instead"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rule_is_instead"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rule_is_instead"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rule_is_on"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."rule_is_on"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rule_is_on"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rule_is_on"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rule_is_on"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."rule_is_on"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rule_is_on"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rule_is_on"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rule_is_on"("name", "name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."rule_is_on"("name", "name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rule_is_on"("name", "name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rule_is_on"("name", "name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rule_is_on"("name", "name", "name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."rule_is_on"("name", "name", "name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rule_is_on"("name", "name", "name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rule_is_on"("name", "name", "name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rules_are"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."rules_are"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."rules_are"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rules_are"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."rules_are"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."rules_are"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rules_are"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rules_are"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rules_are"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."rules_are"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."rules_are"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rules_are"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."rules_are"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."rules_are"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rules_are"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rules_are"("name", "name", "name"[], "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."run_workout_status_maintenance"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."run_workout_status_maintenance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."runtests"() TO "postgres";
GRANT ALL ON FUNCTION "public"."runtests"() TO "anon";
GRANT ALL ON FUNCTION "public"."runtests"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."runtests"() TO "service_role";



GRANT ALL ON FUNCTION "public"."runtests"("name") TO "postgres";
GRANT ALL ON FUNCTION "public"."runtests"("name") TO "anon";
GRANT ALL ON FUNCTION "public"."runtests"("name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."runtests"("name") TO "service_role";



GRANT ALL ON FUNCTION "public"."runtests"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."runtests"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."runtests"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."runtests"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."runtests"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."runtests"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."runtests"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."runtests"("name", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_activity_laps"("p_activity" "uuid", "p_expected_version" integer, "p_laps" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_activity_laps"("p_activity" "uuid", "p_expected_version" integer, "p_laps" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_activity_laps"("p_activity" "uuid", "p_expected_version" integer, "p_laps" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_athlete_test_result"("p_athlete" "uuid", "p_definition" "uuid", "p_performed_at" "date", "p_notes" "text", "p_values" "jsonb", "p_result" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_athlete_test_result"("p_athlete" "uuid", "p_definition" "uuid", "p_performed_at" "date", "p_notes" "text", "p_values" "jsonb", "p_result" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_athlete_test_result"("p_athlete" "uuid", "p_definition" "uuid", "p_performed_at" "date", "p_notes" "text", "p_values" "jsonb", "p_result" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_fc_zones"("p_athlete" "uuid", "p_zones" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_fc_zones"("p_athlete" "uuid", "p_zones" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_fc_zones"("p_athlete" "uuid", "p_zones" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_hr_zone_model"("p_athlete" "uuid", "p_kind" "text", "p_bounds" integer[], "p_valid_from" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_hr_zone_model"("p_athlete" "uuid", "p_kind" "text", "p_bounds" integer[], "p_valid_from" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_hr_zone_model"("p_athlete" "uuid", "p_kind" "text", "p_bounds" integer[], "p_valid_from" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."schedule_doc"("p_athlete" "uuid", "p_doc" "uuid", "p_dates" "date"[], "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."schedule_doc"("p_athlete" "uuid", "p_doc" "uuid", "p_dates" "date"[], "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."schedule_doc"("p_athlete" "uuid", "p_doc" "uuid", "p_dates" "date"[], "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."schema_owner_is"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."schema_owner_is"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."schema_owner_is"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."schema_owner_is"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."schema_owner_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."schema_owner_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."schema_owner_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."schema_owner_is"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."schema_privs_are"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."schema_privs_are"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."schema_privs_are"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."schema_privs_are"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."schema_privs_are"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."schema_privs_are"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."schema_privs_are"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."schema_privs_are"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."schemas_are"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."schemas_are"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."schemas_are"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."schemas_are"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."schemas_are"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."schemas_are"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."schemas_are"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."schemas_are"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sequence_owner_is"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."sequence_owner_is"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."sequence_owner_is"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sequence_owner_is"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."sequence_owner_is"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."sequence_owner_is"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."sequence_owner_is"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sequence_owner_is"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."sequence_owner_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."sequence_owner_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sequence_owner_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sequence_owner_is"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sequence_owner_is"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."sequence_owner_is"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sequence_owner_is"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sequence_owner_is"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sequence_privs_are"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."sequence_privs_are"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."sequence_privs_are"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sequence_privs_are"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sequence_privs_are"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."sequence_privs_are"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sequence_privs_are"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sequence_privs_are"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sequence_privs_are"("name", "name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."sequence_privs_are"("name", "name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."sequence_privs_are"("name", "name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sequence_privs_are"("name", "name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sequence_privs_are"("name", "name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."sequence_privs_are"("name", "name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sequence_privs_are"("name", "name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sequence_privs_are"("name", "name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sequences_are"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."sequences_are"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."sequences_are"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sequences_are"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sequences_are"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."sequences_are"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sequences_are"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sequences_are"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sequences_are"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."sequences_are"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."sequences_are"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sequences_are"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sequences_are"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."sequences_are"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sequences_are"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sequences_are"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."server_privs_are"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."server_privs_are"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."server_privs_are"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."server_privs_are"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."server_privs_are"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."server_privs_are"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."server_privs_are"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."server_privs_are"("name", "name", "name"[], "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_active_performance_reference"("p_performance_log_id" "uuid", "p_athlete_id" "uuid", "p_metric_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_active_performance_reference"("p_performance_log_id" "uuid", "p_athlete_id" "uuid", "p_metric_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_active_performance_reference"("p_performance_log_id" "uuid", "p_athlete_id" "uuid", "p_metric_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_athlete_hidden"("athlete_id" "uuid", "hidden" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_athlete_hidden"("athlete_id" "uuid", "hidden" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_athlete_hidden"("athlete_id" "uuid", "hidden" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_coach_override"("p_log" "uuid", "p_override" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_coach_override"("p_log" "uuid", "p_override" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_coach_override"("p_log" "uuid", "p_override" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."cycles" TO "anon";
GRANT ALL ON TABLE "public"."cycles" TO "authenticated";
GRANT ALL ON TABLE "public"."cycles" TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_cycle_dates"("p_cycle" "uuid", "p_start" "date", "p_end" "date", "p_mesocycle" "uuid", "p_change_mesocycle" boolean, "p_drop_planned" boolean, "p_trim_after_end" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_cycle_dates"("p_cycle" "uuid", "p_start" "date", "p_end" "date", "p_mesocycle" "uuid", "p_change_mesocycle" boolean, "p_drop_planned" boolean, "p_trim_after_end" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_cycle_dates"("p_cycle" "uuid", "p_start" "date", "p_end" "date", "p_mesocycle" "uuid", "p_change_mesocycle" boolean, "p_drop_planned" boolean, "p_trim_after_end" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_energy_rpe"("p_assignment" "uuid", "p_rpe" smallint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_energy_rpe"("p_assignment" "uuid", "p_rpe" smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_energy_rpe"("p_assignment" "uuid", "p_rpe" smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_eq"("text", "anyarray") TO "postgres";
GRANT ALL ON FUNCTION "public"."set_eq"("text", "anyarray") TO "anon";
GRANT ALL ON FUNCTION "public"."set_eq"("text", "anyarray") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_eq"("text", "anyarray") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_eq"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."set_eq"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_eq"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_eq"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_eq"("text", "anyarray", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."set_eq"("text", "anyarray", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_eq"("text", "anyarray", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_eq"("text", "anyarray", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_eq"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."set_eq"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_eq"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_eq"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_has"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."set_has"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_has"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_has"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_has"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."set_has"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_has"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_has"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_hasnt"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."set_hasnt"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_hasnt"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_hasnt"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_hasnt"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."set_hasnt"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_hasnt"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_hasnt"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_ne"("text", "anyarray") TO "postgres";
GRANT ALL ON FUNCTION "public"."set_ne"("text", "anyarray") TO "anon";
GRANT ALL ON FUNCTION "public"."set_ne"("text", "anyarray") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_ne"("text", "anyarray") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_ne"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."set_ne"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_ne"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_ne"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_ne"("text", "anyarray", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."set_ne"("text", "anyarray", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_ne"("text", "anyarray", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_ne"("text", "anyarray", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_ne"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."set_ne"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_ne"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_ne"("text", "text", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_own_coach"("p_coach" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_own_coach"("p_coach" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_own_coach"("p_coach" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_performance_reference"("p_athlete" "uuid", "p_metric" "text", "p_value" numeric, "p_unit" "text", "p_date" "date", "p_validated" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_performance_reference"("p_athlete" "uuid", "p_metric" "text", "p_value" numeric, "p_unit" "text", "p_date" "date", "p_validated" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_performance_reference"("p_athlete" "uuid", "p_metric" "text", "p_value" numeric, "p_unit" "text", "p_date" "date", "p_validated" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_workout_push"("p_provider" "public"."data_source", "p_enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_workout_push"("p_provider" "public"."data_source", "p_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_workout_push"("p_provider" "public"."data_source", "p_enabled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_workout_rpe"("p_log" "uuid", "p_rpe" smallint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_workout_rpe"("p_log" "uuid", "p_rpe" smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_workout_rpe"("p_log" "uuid", "p_rpe" smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."signup_birth_date_error"("p_birth" "date", "p_today" "date", "p_min" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."signup_birth_date_error"("p_birth" "date", "p_today" "date", "p_min" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."signup_birth_date_error"("p_birth" "date", "p_today" "date", "p_min" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."skip"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."skip"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."skip"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."skip"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."skip"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."skip"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."skip"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."skip"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."skip"(integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."skip"(integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."skip"(integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."skip"(integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."skip"("why" "text", "how_many" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."skip"("why" "text", "how_many" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."skip"("why" "text", "how_many" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."skip"("why" "text", "how_many" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."source_consent_granted"("p_athlete" "uuid", "p_source" "public"."data_source") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."source_consent_granted"("p_athlete" "uuid", "p_source" "public"."data_source") TO "authenticated";
GRANT ALL ON FUNCTION "public"."source_consent_granted"("p_athlete" "uuid", "p_source" "public"."data_source") TO "service_role";



GRANT ALL ON FUNCTION "public"."source_rank"("s" "public"."data_source") TO "anon";
GRANT ALL ON FUNCTION "public"."source_rank"("s" "public"."data_source") TO "authenticated";
GRANT ALL ON FUNCTION "public"."source_rank"("s" "public"."data_source") TO "service_role";



GRANT ALL ON FUNCTION "public"."staff_app_data_domain"("p_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."staff_app_data_domain"("p_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_app_data_domain"("p_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."staff_apply_to_all"("p_link_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."staff_apply_to_all"("p_link_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_apply_to_all"("p_link_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."staff_athlete_profiles"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."staff_athlete_profiles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_athlete_profiles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."staff_can"("athlete_uuid" "uuid", "domain" "text", "level" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."staff_can"("athlete_uuid" "uuid", "domain" "text", "level" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_can"("athlete_uuid" "uuid", "domain" "text", "level" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."staff_can_edit"("athlete_uuid" "uuid", "domain" "text", "author" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."staff_can_edit"("athlete_uuid" "uuid", "domain" "text", "author" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_can_edit"("athlete_uuid" "uuid", "domain" "text", "author" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."staff_can_edit_doc"("doc_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."staff_can_edit_doc"("doc_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_can_edit_doc"("doc_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."staff_can_path"("p_name" "text", "domain" "text", "level" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."staff_can_path"("p_name" "text", "domain" "text", "level" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_can_path"("p_name" "text", "domain" "text", "level" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."staff_can_write_bank"("coach_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."staff_can_write_bank"("coach_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_can_write_bank"("coach_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."staff_can_write_docs_path"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."staff_can_write_docs_path"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_can_write_docs_path"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."staff_default_permissions"("p_profession" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."staff_default_permissions"("p_profession" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_default_permissions"("p_profession" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."staff_doc_for_athlete"("doc_uuid" "uuid", "athlete_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."staff_doc_for_athlete"("doc_uuid" "uuid", "athlete_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_doc_for_athlete"("doc_uuid" "uuid", "athlete_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."staff_domains"() TO "anon";
GRANT ALL ON FUNCTION "public"."staff_domains"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_domains"() TO "service_role";



GRANT ALL ON FUNCTION "public"."staff_invitations_before_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."staff_invitations_before_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_invitations_before_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."staff_is_linked"("athlete_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."staff_is_linked"("athlete_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_is_linked"("athlete_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."staff_normalize_permissions"("p" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."staff_normalize_permissions"("p" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_normalize_permissions"("p" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."staff_profile_visible"("staff_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."staff_profile_visible"("staff_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_profile_visible"("staff_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."staff_sharing_consented"("athlete_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."staff_sharing_consented"("athlete_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_sharing_consented"("athlete_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."stream_quality_rank"("q" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."stream_quality_rank"("q" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stream_quality_rank"("q" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_doc_assignments"("p_athlete" "uuid", "p_source" "text", "p_doc_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_doc_assignments"("p_athlete" "uuid", "p_source" "text", "p_doc_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_doc_assignments"("p_athlete" "uuid", "p_source" "text", "p_doc_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_extrap_to_performance"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_extrap_to_performance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_extrap_to_performance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_test_session_to_results"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_test_session_to_results"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_test_session_to_results"() TO "service_role";



GRANT ALL ON FUNCTION "public"."table_owner_is"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."table_owner_is"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."table_owner_is"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."table_owner_is"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."table_owner_is"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."table_owner_is"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."table_owner_is"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."table_owner_is"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."table_owner_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."table_owner_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."table_owner_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."table_owner_is"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."table_owner_is"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."table_owner_is"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."table_owner_is"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."table_owner_is"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."table_privs_are"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."table_privs_are"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."table_privs_are"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."table_privs_are"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."table_privs_are"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."table_privs_are"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."table_privs_are"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."table_privs_are"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."table_privs_are"("name", "name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."table_privs_are"("name", "name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."table_privs_are"("name", "name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."table_privs_are"("name", "name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."table_privs_are"("name", "name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."table_privs_are"("name", "name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."table_privs_are"("name", "name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."table_privs_are"("name", "name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."tables_are"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."tables_are"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."tables_are"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tables_are"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."tables_are"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."tables_are"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."tables_are"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tables_are"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."tables_are"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."tables_are"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."tables_are"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tables_are"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."tables_are"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."tables_are"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."tables_are"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tables_are"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."tablespace_owner_is"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."tablespace_owner_is"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."tablespace_owner_is"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tablespace_owner_is"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."tablespace_owner_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."tablespace_owner_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."tablespace_owner_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tablespace_owner_is"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."tablespace_privs_are"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."tablespace_privs_are"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."tablespace_privs_are"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tablespace_privs_are"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."tablespace_privs_are"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."tablespace_privs_are"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."tablespace_privs_are"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tablespace_privs_are"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."tablespaces_are"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."tablespaces_are"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."tablespaces_are"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tablespaces_are"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."tablespaces_are"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."tablespaces_are"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."tablespaces_are"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tablespaces_are"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_activity_garmin_device_no_ai"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_activity_garmin_device_no_ai"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_activity_garmin_device_no_ai"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_activity_streams_zones"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_activity_streams_zones"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_activity_streams_zones"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_fczone_refresh"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_fczone_refresh"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_fczone_refresh"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_hr_zone_models_refresh"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_hr_zone_models_refresh"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_hr_zone_models_refresh"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_plan_links_relink"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_plan_links_relink"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_plan_links_relink"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_test_values_propose_zones"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_test_values_propose_zones"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_test_values_propose_zones"() TO "service_role";



GRANT ALL ON FUNCTION "public"."throws_ilike"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."throws_ilike"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."throws_ilike"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."throws_ilike"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."throws_ilike"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."throws_ilike"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."throws_ilike"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."throws_ilike"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."throws_imatching"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."throws_imatching"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."throws_imatching"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."throws_imatching"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."throws_imatching"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."throws_imatching"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."throws_imatching"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."throws_imatching"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."throws_like"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."throws_like"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."throws_like"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."throws_like"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."throws_like"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."throws_like"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."throws_like"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."throws_like"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."throws_matching"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."throws_matching"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."throws_matching"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."throws_matching"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."throws_matching"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."throws_matching"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."throws_matching"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."throws_matching"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."throws_ok"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."throws_ok"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."throws_ok"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."throws_ok"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."throws_ok"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."throws_ok"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."throws_ok"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."throws_ok"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."throws_ok"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."throws_ok"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."throws_ok"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."throws_ok"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."throws_ok"("text", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."throws_ok"("text", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."throws_ok"("text", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."throws_ok"("text", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."throws_ok"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."throws_ok"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."throws_ok"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."throws_ok"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."throws_ok"("text", character, "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."throws_ok"("text", character, "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."throws_ok"("text", character, "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."throws_ok"("text", character, "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."throws_ok"("text", integer, "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."throws_ok"("text", integer, "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."throws_ok"("text", integer, "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."throws_ok"("text", integer, "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."todo"("how_many" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."todo"("how_many" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."todo"("how_many" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."todo"("how_many" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."todo"("why" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."todo"("why" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."todo"("why" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."todo"("why" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."todo"("how_many" integer, "why" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."todo"("how_many" integer, "why" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."todo"("how_many" integer, "why" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."todo"("how_many" integer, "why" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."todo"("why" "text", "how_many" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."todo"("why" "text", "how_many" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."todo"("why" "text", "how_many" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."todo"("why" "text", "how_many" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."todo_end"() TO "postgres";
GRANT ALL ON FUNCTION "public"."todo_end"() TO "anon";
GRANT ALL ON FUNCTION "public"."todo_end"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."todo_end"() TO "service_role";



GRANT ALL ON FUNCTION "public"."todo_start"() TO "postgres";
GRANT ALL ON FUNCTION "public"."todo_start"() TO "anon";
GRANT ALL ON FUNCTION "public"."todo_start"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."todo_start"() TO "service_role";



GRANT ALL ON FUNCTION "public"."todo_start"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."todo_start"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."todo_start"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."todo_start"("text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."toggle_coach_certification"("p_target_id" "uuid", "p_certified" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."toggle_coach_certification"("p_target_id" "uuid", "p_certified" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_coach_certification"("p_target_id" "uuid", "p_certified" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."trigger_coros_sync"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_coros_sync"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trigger_garmin_maintenance"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_garmin_maintenance"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trigger_garmin_workouts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_garmin_workouts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_is"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."trigger_is"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_is"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_is"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_is"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."trigger_is"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_is"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_is"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_is"("name", "name", "name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."trigger_is"("name", "name", "name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_is"("name", "name", "name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_is"("name", "name", "name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_is"("name", "name", "name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."trigger_is"("name", "name", "name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_is"("name", "name", "name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_is"("name", "name", "name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."triggers_are"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."triggers_are"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."triggers_are"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."triggers_are"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."triggers_are"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."triggers_are"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."triggers_are"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."triggers_are"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."triggers_are"("name", "name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."triggers_are"("name", "name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."triggers_are"("name", "name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."triggers_are"("name", "name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."triggers_are"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."triggers_are"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."triggers_are"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."triggers_are"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."type_owner_is"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."type_owner_is"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."type_owner_is"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."type_owner_is"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."type_owner_is"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."type_owner_is"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."type_owner_is"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."type_owner_is"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."type_owner_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."type_owner_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."type_owner_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."type_owner_is"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."type_owner_is"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."type_owner_is"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."type_owner_is"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."type_owner_is"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."types_are"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."types_are"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."types_are"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."types_are"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."types_are"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."types_are"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."types_are"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."types_are"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."types_are"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."types_are"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."types_are"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."types_are"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."types_are"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."types_are"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."types_are"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."types_are"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unalike"("anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unalike"("anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unalike"("anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unalike"("anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unalike"("anyelement", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unalike"("anyelement", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unalike"("anyelement", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unalike"("anyelement", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unialike"("anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unialike"("anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unialike"("anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unialike"("anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unialike"("anyelement", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unialike"("anyelement", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unialike"("anyelement", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unialike"("anyelement", "text", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."unlink_athlete"("athlete_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unlink_athlete"("athlete_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unlink_athlete"("athlete_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."users_are"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."users_are"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."users_are"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."users_are"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."users_are"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."users_are"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."users_are"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."users_are"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."view_owner_is"("name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."view_owner_is"("name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."view_owner_is"("name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."view_owner_is"("name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."view_owner_is"("name", "name", "name") TO "postgres";
GRANT ALL ON FUNCTION "public"."view_owner_is"("name", "name", "name") TO "anon";
GRANT ALL ON FUNCTION "public"."view_owner_is"("name", "name", "name") TO "authenticated";
GRANT ALL ON FUNCTION "public"."view_owner_is"("name", "name", "name") TO "service_role";



GRANT ALL ON FUNCTION "public"."view_owner_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."view_owner_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."view_owner_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."view_owner_is"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."view_owner_is"("name", "name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."view_owner_is"("name", "name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."view_owner_is"("name", "name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."view_owner_is"("name", "name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."views_are"("name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."views_are"("name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."views_are"("name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."views_are"("name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."views_are"("name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."views_are"("name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."views_are"("name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."views_are"("name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."views_are"("name", "name"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."views_are"("name", "name"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."views_are"("name", "name"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."views_are"("name", "name"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."views_are"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."views_are"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."views_are"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."views_are"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."volatility_is"("name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."volatility_is"("name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name"[], "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name"[], "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name"[], "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name"[], "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name", "name"[], "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name", "name"[], "text") TO "anon";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name", "name"[], "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name", "name"[], "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name", "name"[], "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name", "name"[], "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name", "name"[], "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."volatility_is"("name", "name", "name"[], "text", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."weight_record_milestone"("p_athlete" "uuid", "p_day" "date", "p_kg" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."weight_record_milestone"("p_athlete" "uuid", "p_day" "date", "p_kg" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."weight_record_milestone"("p_athlete" "uuid", "p_day" "date", "p_kg" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."weight_set_day"("p_athlete" "uuid", "p_day" "date", "p_kg" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."weight_set_day"("p_athlete" "uuid", "p_day" "date", "p_kg" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."weight_set_day"("p_athlete" "uuid", "p_day" "date", "p_kg" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."weight_set_goal"("p_athlete" "uuid", "p_target_kg" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."weight_set_goal"("p_athlete" "uuid", "p_target_kg" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."weight_set_goal"("p_athlete" "uuid", "p_target_kg" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."wellness_delete_day"("p_athlete" "uuid", "p_day" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wellness_delete_day"("p_athlete" "uuid", "p_day" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wellness_delete_day"("p_athlete" "uuid", "p_day" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wellness_set_day"("p_athlete" "uuid", "p_day" "date", "p_entry" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wellness_set_day"("p_athlete" "uuid", "p_day" "date", "p_entry" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wellness_set_day"("p_athlete" "uuid", "p_day" "date", "p_entry" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."workout_log_athlete_id"("p_log_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."workout_log_athlete_id"("p_log_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."workout_log_athlete_id"("p_log_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."workout_log_has_entries"("mods" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."workout_log_has_entries"("mods" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."workout_log_has_entries"("mods" "jsonb") TO "service_role";
























GRANT ALL ON TABLE "public"."account_deletions" TO "anon";
GRANT ALL ON TABLE "public"."account_deletions" TO "authenticated";
GRANT ALL ON TABLE "public"."account_deletions" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."activity_laps" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."activity_laps" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_laps" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."activity_plan_links" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."activity_plan_links" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_plan_links" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."activity_sets" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."activity_sets" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_sets" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."activity_streams" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."activity_streams" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_streams" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."activity_zone_summaries" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."activity_zone_summaries" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_zone_summaries" TO "service_role";



GRANT ALL ON TABLE "public"."provider_activities" TO "anon";
GRANT ALL ON TABLE "public"."provider_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_activities" TO "service_role";



GRANT ALL ON TABLE "public"."ai_provider_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_provider_activities" TO "service_role";



GRANT ALL ON TABLE "public"."provider_dailies" TO "anon";
GRANT ALL ON TABLE "public"."provider_dailies" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_dailies" TO "service_role";



GRANT ALL ON TABLE "public"."ai_provider_dailies" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_provider_dailies" TO "service_role";



GRANT ALL ON TABLE "public"."app_data" TO "anon";
GRANT ALL ON TABLE "public"."app_data" TO "authenticated";
GRANT ALL ON TABLE "public"."app_data" TO "service_role";



GRANT ALL ON TABLE "public"."app_feedback" TO "anon";
GRANT ALL ON TABLE "public"."app_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."app_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."app_update_reads" TO "anon";
GRANT ALL ON TABLE "public"."app_update_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."app_update_reads" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_claims" TO "anon";
GRANT ALL ON TABLE "public"."athlete_claims" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_claims" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_co_coaches" TO "anon";
GRANT ALL ON TABLE "public"."athlete_co_coaches" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_co_coaches" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_test_results" TO "anon";
GRANT ALL ON TABLE "public"."athlete_test_results" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_test_results" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_test_values" TO "anon";
GRANT ALL ON TABLE "public"."athlete_test_values" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_test_values" TO "service_role";



GRANT ALL ON TABLE "public"."test_variables" TO "anon";
GRANT ALL ON TABLE "public"."test_variables" TO "authenticated";
GRANT ALL ON TABLE "public"."test_variables" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_current_values" TO "anon";
GRANT ALL ON TABLE "public"."athlete_current_values" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_current_values" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_life_events" TO "anon";
GRANT ALL ON TABLE "public"."athlete_life_events" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_life_events" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_profile_items" TO "anon";
GRANT ALL ON TABLE "public"."athlete_profile_items" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_profile_items" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_staff" TO "anon";
GRANT ALL ON TABLE "public"."athlete_staff" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_staff" TO "service_role";



GRANT ALL ON TABLE "public"."body_weight_goals" TO "service_role";
GRANT SELECT ON TABLE "public"."body_weight_goals" TO "authenticated";



GRANT ALL ON TABLE "public"."body_weight_logs" TO "service_role";
GRANT SELECT ON TABLE "public"."body_weight_logs" TO "authenticated";



GRANT ALL ON TABLE "public"."body_weight_milestones" TO "service_role";
GRANT SELECT ON TABLE "public"."body_weight_milestones" TO "authenticated";



GRANT ALL ON TABLE "public"."citation_likes" TO "anon";
GRANT ALL ON TABLE "public"."citation_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."citation_likes" TO "service_role";



GRANT ALL ON TABLE "public"."citation_stats" TO "anon";
GRANT ALL ON TABLE "public"."citation_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."citation_stats" TO "service_role";



GRANT ALL ON TABLE "public"."coach_api_access_log" TO "service_role";
GRANT SELECT ON TABLE "public"."coach_api_access_log" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."coach_api_access_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."coach_api_access_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."coach_api_access_log_id_seq" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."coach_api_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_api_drafts" TO "service_role";



GRANT UPDATE("status") ON TABLE "public"."coach_api_drafts" TO "authenticated";



GRANT UPDATE("decided_at") ON TABLE "public"."coach_api_drafts" TO "authenticated";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."coach_api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_api_keys" TO "service_role";



GRANT UPDATE("revoked_at") ON TABLE "public"."coach_api_keys" TO "authenticated";



GRANT ALL ON TABLE "public"."coach_api_rate" TO "service_role";



GRANT ALL ON TABLE "public"."competitions" TO "anon";
GRANT ALL ON TABLE "public"."competitions" TO "authenticated";
GRANT ALL ON TABLE "public"."competitions" TO "service_role";



GRANT ALL ON TABLE "public"."user_consents" TO "anon";
GRANT ALL ON TABLE "public"."user_consents" TO "authenticated";
GRANT ALL ON TABLE "public"."user_consents" TO "service_role";



GRANT ALL ON TABLE "public"."current_consents" TO "anon";
GRANT ALL ON TABLE "public"."current_consents" TO "authenticated";
GRANT ALL ON TABLE "public"."current_consents" TO "service_role";



GRANT ALL ON TABLE "public"."data_source_policies" TO "anon";
GRANT ALL ON TABLE "public"."data_source_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."data_source_policies" TO "service_role";



GRANT ALL ON TABLE "public"."day_themes" TO "anon";
GRANT ALL ON TABLE "public"."day_themes" TO "authenticated";
GRANT ALL ON TABLE "public"."day_themes" TO "service_role";



GRANT ALL ON TABLE "public"."doc_assignments" TO "anon";
GRANT ALL ON TABLE "public"."doc_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."doc_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."doc_comments" TO "anon";
GRANT ALL ON TABLE "public"."doc_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."doc_comments" TO "service_role";



GRANT ALL ON TABLE "public"."doc_schedule" TO "authenticated";
GRANT ALL ON TABLE "public"."doc_schedule" TO "service_role";



GRANT ALL ON TABLE "public"."docs" TO "anon";
GRANT ALL ON TABLE "public"."docs" TO "authenticated";
GRANT ALL ON TABLE "public"."docs" TO "service_role";



GRANT ALL ON TABLE "public"."energy_sessions" TO "anon";
GRANT ALL ON TABLE "public"."energy_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."energy_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_pr_logs" TO "anon";
GRANT ALL ON TABLE "public"."exercise_pr_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_pr_logs" TO "service_role";



GRANT ALL ON TABLE "public"."exercises" TO "anon";
GRANT ALL ON TABLE "public"."exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."exercises" TO "service_role";



GRANT ALL ON TABLE "public"."habit_logs" TO "anon";
GRANT ALL ON TABLE "public"."habit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."habit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."habits" TO "anon";
GRANT ALL ON TABLE "public"."habits" TO "authenticated";
GRANT ALL ON TABLE "public"."habits" TO "service_role";



GRANT ALL ON TABLE "public"."health_sync_errors" TO "service_role";
GRANT SELECT ON TABLE "public"."health_sync_errors" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."health_sync_errors_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."health_sync_errors_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."health_sync_errors_id_seq" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."hr_zone_models" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."hr_zone_models" TO "authenticated";
GRANT ALL ON TABLE "public"."hr_zone_models" TO "service_role";



GRANT ALL ON TABLE "public"."hyrox_axes_params" TO "anon";
GRANT ALL ON TABLE "public"."hyrox_axes_params" TO "authenticated";
GRANT ALL ON TABLE "public"."hyrox_axes_params" TO "service_role";



GRANT ALL ON TABLE "public"."hyrox_race_plans" TO "anon";
GRANT ALL ON TABLE "public"."hyrox_race_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."hyrox_race_plans" TO "service_role";



GRANT ALL ON TABLE "public"."hyrox_reference_segments" TO "anon";
GRANT ALL ON TABLE "public"."hyrox_reference_segments" TO "authenticated";
GRANT ALL ON TABLE "public"."hyrox_reference_segments" TO "service_role";



GRANT ALL ON TABLE "public"."hyrox_results" TO "anon";
GRANT ALL ON TABLE "public"."hyrox_results" TO "authenticated";
GRANT ALL ON TABLE "public"."hyrox_results" TO "service_role";



GRANT ALL ON TABLE "public"."hyrox_test_analyses" TO "anon";
GRANT ALL ON TABLE "public"."hyrox_test_analyses" TO "authenticated";
GRANT ALL ON TABLE "public"."hyrox_test_analyses" TO "service_role";



GRANT ALL ON TABLE "public"."hyrox_test_axes_drafts" TO "anon";
GRANT ALL ON TABLE "public"."hyrox_test_axes_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."hyrox_test_axes_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."hyrox_test_grid_versions" TO "anon";
GRANT ALL ON TABLE "public"."hyrox_test_grid_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."hyrox_test_grid_versions" TO "service_role";



GRANT ALL ON TABLE "public"."hyrox_test_grids" TO "anon";
GRANT ALL ON TABLE "public"."hyrox_test_grids" TO "authenticated";
GRANT ALL ON TABLE "public"."hyrox_test_grids" TO "service_role";



GRANT ALL ON TABLE "public"."hyrox_test_params" TO "anon";
GRANT ALL ON TABLE "public"."hyrox_test_params" TO "authenticated";
GRANT ALL ON TABLE "public"."hyrox_test_params" TO "service_role";



GRANT ALL ON TABLE "public"."hyrox_work_axes_rules" TO "anon";
GRANT ALL ON TABLE "public"."hyrox_work_axes_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."hyrox_work_axes_rules" TO "service_role";



GRANT ALL ON TABLE "public"."invitations" TO "anon";
GRANT ALL ON TABLE "public"."invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."invitations" TO "service_role";



GRANT ALL ON TABLE "public"."macrocycles" TO "anon";
GRANT ALL ON TABLE "public"."macrocycles" TO "authenticated";
GRANT ALL ON TABLE "public"."macrocycles" TO "service_role";



GRANT ALL ON TABLE "public"."measurement_logs" TO "anon";
GRANT ALL ON TABLE "public"."measurement_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."measurement_logs" TO "service_role";



GRANT ALL ON TABLE "public"."medical_attachments" TO "anon";
GRANT ALL ON TABLE "public"."medical_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."medical_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."medical_entries" TO "anon";
GRANT ALL ON TABLE "public"."medical_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."medical_entries" TO "service_role";



GRANT ALL ON TABLE "public"."medical_history" TO "anon";
GRANT ALL ON TABLE "public"."medical_history" TO "authenticated";
GRANT ALL ON TABLE "public"."medical_history" TO "service_role";



GRANT ALL ON TABLE "public"."mesocycles" TO "anon";
GRANT ALL ON TABLE "public"."mesocycles" TO "authenticated";
GRANT ALL ON TABLE "public"."mesocycles" TO "service_role";



GRANT ALL ON TABLE "public"."microcycles" TO "anon";
GRANT ALL ON TABLE "public"."microcycles" TO "authenticated";
GRANT ALL ON TABLE "public"."microcycles" TO "service_role";



GRANT ALL ON TABLE "public"."performance_logs" TO "anon";
GRANT ALL ON TABLE "public"."performance_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."performance_logs" TO "service_role";



GRANT ALL ON TABLE "public"."performance_notifications" TO "anon";
GRANT ALL ON TABLE "public"."performance_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."performance_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."physical_qualities" TO "anon";
GRANT ALL ON TABLE "public"."physical_qualities" TO "authenticated";
GRANT ALL ON TABLE "public"."physical_qualities" TO "service_role";



GRANT ALL ON TABLE "public"."planning_blocks" TO "anon";
GRANT ALL ON TABLE "public"."planning_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."planning_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."provider_connections" TO "anon";
GRANT ALL ON TABLE "public"."provider_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_connections" TO "service_role";



GRANT ALL ON TABLE "public"."provider_fit_quota" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."provider_intraday" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."provider_intraday" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_intraday" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."provider_moveiq" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."provider_moveiq" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_moveiq" TO "service_role";



GRANT ALL ON TABLE "public"."provider_oauth_clients" TO "service_role";



GRANT ALL ON TABLE "public"."provider_oauth_states" TO "service_role";



GRANT ALL ON TABLE "public"."provider_raw_records" TO "service_role";
GRANT SELECT ON TABLE "public"."provider_raw_records" TO "authenticated";



GRANT ALL ON TABLE "public"."provider_tokens" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."provider_workout_pushes" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."provider_workout_pushes" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_workout_pushes" TO "service_role";



GRANT ALL ON TABLE "public"."retours" TO "anon";
GRANT ALL ON TABLE "public"."retours" TO "authenticated";
GRANT ALL ON TABLE "public"."retours" TO "service_role";



GRANT ALL ON TABLE "public"."retours_votes" TO "anon";
GRANT ALL ON TABLE "public"."retours_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."retours_votes" TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_items" TO "anon";
GRANT ALL ON TABLE "public"."roadmap_items" TO "authenticated";
GRANT ALL ON TABLE "public"."roadmap_items" TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_phases" TO "anon";
GRANT ALL ON TABLE "public"."roadmap_phases" TO "authenticated";
GRANT ALL ON TABLE "public"."roadmap_phases" TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_votes" TO "anon";
GRANT ALL ON TABLE "public"."roadmap_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."roadmap_votes" TO "service_role";



GRANT ALL ON TABLE "public"."seasons" TO "anon";
GRANT ALL ON TABLE "public"."seasons" TO "authenticated";
GRANT ALL ON TABLE "public"."seasons" TO "service_role";



GRANT ALL ON TABLE "public"."specific_blocks" TO "anon";
GRANT ALL ON TABLE "public"."specific_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."specific_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."specific_sports" TO "anon";
GRANT ALL ON TABLE "public"."specific_sports" TO "authenticated";
GRANT ALL ON TABLE "public"."specific_sports" TO "service_role";



GRANT ALL ON TABLE "public"."staff_invitations" TO "anon";
GRANT ALL ON TABLE "public"."staff_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."test_definitions" TO "anon";
GRANT ALL ON TABLE "public"."test_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."test_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."test_results" TO "anon";
GRANT ALL ON TABLE "public"."test_results" TO "authenticated";
GRANT ALL ON TABLE "public"."test_results" TO "service_role";



GRANT ALL ON TABLE "public"."test_sessions" TO "anon";
GRANT ALL ON TABLE "public"."test_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."test_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."tests" TO "anon";
GRANT ALL ON TABLE "public"."tests" TO "authenticated";
GRANT ALL ON TABLE "public"."tests" TO "service_role";



GRANT ALL ON TABLE "public"."training_methods" TO "anon";
GRANT ALL ON TABLE "public"."training_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."training_methods" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_consents_seq_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_consents_seq_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_consents_seq_seq" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_retours" TO "anon";
GRANT ALL ON TABLE "public"."weekly_retours" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_retours" TO "service_role";



GRANT ALL ON TABLE "public"."workout_exercise_comments" TO "anon";
GRANT ALL ON TABLE "public"."workout_exercise_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_exercise_comments" TO "service_role";



GRANT ALL ON TABLE "public"."workout_rpe" TO "anon";
GRANT ALL ON TABLE "public"."workout_rpe" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_rpe" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































