/*
  Envoi des séances Agon vers la montre (Garmin Training API, P35).

  Décisions d'Hugo (2026-11-12) :
  - envoi automatique de toutes les séances programmées (endurance, muscu,
    spécifique, HYROX), sur les 7 prochains jours, mises à jour et
    suppressions suivies ; l'athlète peut couper l'envoi ;
  - tout part d'Agon : cibles en bpm / allure / watts / kg calculées avec les
    zones, tests et records de l'athlète ;
  - exercices de muscu reliés au catalogue Garmin (`exercises.garmin_*`),
    correction possible par les coachs certifiés / l'admin (policies existantes).

  Contenu :
  1. `exercises.garmin_category` / `garmin_exercise` : équivalent Garmin.
  2. `energy_sessions.modality` : sport de la séance, valeurs bornées.
  3. `provider_connections.push_workouts` + RPC `set_workout_push` (l'athlète
     ne peut pas écrire sa connexion directement).
  4. `provider_workout_pushes` : ce qui est sur Garmin (ids, empreinte, état).
     Écrit par l'Edge Function seulement ; lu par l'athlète et ses coachs.
  5. Cron `garmin-workouts` toutes les 10 min → `provider-garmin-workouts`.
*/

-- ── 1. Équivalent Garmin des exercices ─────────────────────────────────────
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS garmin_category text,
  ADD COLUMN IF NOT EXISTS garmin_exercise text;

ALTER TABLE public.exercises DROP CONSTRAINT IF EXISTS exercises_garmin_pair;
ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_garmin_pair
  CHECK ((garmin_category IS NULL) = (garmin_exercise IS NULL));

COMMENT ON COLUMN public.exercises.garmin_category IS
  'Catégorie Garmin (Training API, exerciseCategory) ; avec garmin_exercise, ou les deux à null.';
COMMENT ON COLUMN public.exercises.garmin_exercise IS
  'Exercice Garmin (Training API, exerciseName) ; null = envoyé sous le nom Agon seulement.';

-- ── 2. Sport des séances énergie ───────────────────────────────────────────
ALTER TABLE public.energy_sessions DROP CONSTRAINT IF EXISTS energy_sessions_modality_check;
ALTER TABLE public.energy_sessions
  ADD CONSTRAINT energy_sessions_modality_check
  CHECK (modality IS NULL OR modality IN ('course', 'velo', 'natation', 'rameur', 'autre'));

COMMENT ON COLUMN public.energy_sessions.modality IS
  'Sport : course (défaut si null), velo, natation, rameur, autre. Détermine le sport Garmin.';

-- ── 3. Interrupteur athlète ────────────────────────────────────────────────
ALTER TABLE public.provider_connections
  ADD COLUMN IF NOT EXISTS push_workouts boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.provider_connections.push_workouts IS
  'L''athlète reçoit ses séances Agon sur sa montre (Garmin Training API). Coupé : les séances à venir sont retirées de Garmin.';

CREATE OR REPLACE FUNCTION public.set_workout_push(p_provider public.data_source, p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.set_workout_push(public.data_source, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_workout_push(public.data_source, boolean) TO authenticated;

-- ── 4. Séances envoyées ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_workout_pushes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider public.data_source NOT NULL,
  -- energy = energy_session_assignments.id ; strength = workout_logs.id
  source_kind text NOT NULL CHECK (source_kind IN ('energy', 'strength')),
  source_id uuid NOT NULL,
  scheduled_date date NOT NULL,
  external_workout_id text,
  external_schedule_id text,
  payload_hash text,
  status text NOT NULL CHECK (status IN ('sent', 'error', 'rejected')),
  warnings text[] NOT NULL DEFAULT '{}',
  last_error text,
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, source_kind, source_id)
);

CREATE INDEX IF NOT EXISTS provider_workout_pushes_athlete_idx
  ON public.provider_workout_pushes (athlete_id, provider, scheduled_date);

COMMENT ON TABLE public.provider_workout_pushes IS
  'Séances Agon publiées dans le calendrier de la montre (Garmin Training API). status : sent (à jour), error (réessai au passage suivant), rejected (refusée par la traduction, ex. > 100 étapes ; réessayée si la séance change).';

ALTER TABLE public.provider_workout_pushes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_workout_pushes_own_read ON public.provider_workout_pushes;
CREATE POLICY provider_workout_pushes_own_read ON public.provider_workout_pushes
  FOR SELECT TO authenticated USING (athlete_id = auth.uid());

DROP POLICY IF EXISTS provider_workout_pushes_coach_read ON public.provider_workout_pushes;
CREATE POLICY provider_workout_pushes_coach_read ON public.provider_workout_pushes
  FOR SELECT TO authenticated USING (public.is_coach_of(athlete_id));

REVOKE INSERT, UPDATE, DELETE ON public.provider_workout_pushes FROM anon, authenticated;
GRANT SELECT ON public.provider_workout_pushes TO authenticated;
GRANT ALL ON public.provider_workout_pushes TO service_role;

-- ── 5. Cron ────────────────────────────────────────────────────────────────
/*
  Toutes les 10 min, seulement s'il y a un athlète Garmin concerné : envoi
  actif, ou envoi coupé avec des séances encore publiées (à retirer).
  La fonction compare l'empreinte de chaque séance : sans changement, aucun
  appel Garmin (quota Starter : 200 appels / athlète / 24 h).
  Secrets : mêmes `project_url` / `service_role_key` du Vault que les autres crons.
*/
CREATE OR REPLACE FUNCTION public.trigger_garmin_workouts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, extensions
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

REVOKE ALL ON FUNCTION public.trigger_garmin_workouts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_garmin_workouts() TO service_role;

DO $do$
BEGIN
  PERFORM cron.unschedule('garmin-workouts')
   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'garmin-workouts');
  PERFORM cron.schedule('garmin-workouts', '*/10 * * * *', 'SELECT public.trigger_garmin_workouts()');
EXCEPTION
  WHEN undefined_function OR invalid_schema_name THEN
    RAISE WARNING 'pg_cron indisponible : job garmin-workouts non planifié.';
END;
$do$;

-- ── 6. Déconnexion : le suivi part avec la connexion ───────────────────────
/*
  `provider_forget` (déconnexion, désinscription Garmin, suppression de compte)
  supprime la ligne de connexion ; les séances à venir ont déjà été retirées
  de Garmin par `revokeAndForget` tant que le jeton valait. Le suivi local n'a
  plus d'objet.
*/
CREATE OR REPLACE FUNCTION public.provider_workout_pushes_forget()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.provider_workout_pushes
   WHERE athlete_id = OLD.athlete_id AND provider = OLD.provider;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.provider_workout_pushes_forget() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS provider_connections_forget_pushes ON public.provider_connections;
CREATE TRIGGER provider_connections_forget_pushes
  AFTER DELETE ON public.provider_connections
  FOR EACH ROW EXECUTE FUNCTION public.provider_workout_pushes_forget();
