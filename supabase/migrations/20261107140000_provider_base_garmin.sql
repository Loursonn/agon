/*
  Base commune des intégrations montres, et ce qu'il manque pour Garmin.

  Tout est ADDITIF et compatible avec le client en production (branche main) :
  aucune colonne retirée, aucune colonne lue par le client renommée, aucune
  politique de lecture resserrée. Le seul droit retiré est l'écriture de
  l'athlète dans `provider_dailies`, que le client n'a jamais utilisée (aucun
  `.from("provider_dailies")` dans src/, sur main comme sur dev) — c'est le
  pendant, pour les données quotidiennes, de ce que 20261107110000 (S10) a fait
  pour les activités.

  Contenu :
    1. `data_source_policies.consent_purpose` — la finalité de consentement de
       chaque source, lue par `source_consent_granted` et par le trigger de
       retrait. Avant : `ELSE 'coros_sync'`, donc toute nouvelle source héritait
       du consentement COROS.
    2. Index unique (provider, external_user_id) sur les connexions.
    3. `provider_activities.device_name` — l'attribution « Garmin [appareil] ».
    4. `provider_tokens.refresh_expires_at` / `refresh_locked_until` — savoir
       quand rafraîchir, et ne jamais rafraîchir deux fois en parallèle.
    5. `provider_dailies` : lecture seule pour l'athlète ; fusion par type
       (`provider_daily_merge`) avec un `raw` rangé par type de résumé.
    6. `provider_webhook_inbox` — réception brute des webhooks, idempotente.
    7. `provider_forget` — suppression atomique de ce qu'un fournisseur a
       apporté (déconnexion, désinscription Garmin).
    8. Cron `garmin-maintenance` — traite l'inbox en retard et rafraîchit les
       jetons Garmin avant que le refresh token (~90 j) n'expire. Ne fait rien,
       sans bruit, tant qu'il n'y a ni connexion Garmin ni message en attente.

  Testé à blanc : supabase/tests/provider_base_garmin.sql.
*/

-- ═══════════════ 1. Finalité de consentement par source ═════════════════════

ALTER TABLE public.data_source_policies
  ADD COLUMN IF NOT EXISTS consent_purpose public.consent_purpose;

COMMENT ON COLUMN public.data_source_policies.consent_purpose IS
  'Finalité de consentement exigée pour cette source (user_consents.purpose). NULL = aucun accord supplémentaire : réservé aux données fournies par l''athlète lui-même (file_import, manual), imposé par contrainte.';

UPDATE public.data_source_policies SET consent_purpose = 'garmin_sync' WHERE source = 'garmin' AND consent_purpose IS DISTINCT FROM 'garmin_sync';
UPDATE public.data_source_policies SET consent_purpose = 'coros_sync'  WHERE source = 'coros'  AND consent_purpose IS DISTINCT FROM 'coros_sync';
UPDATE public.data_source_policies SET consent_purpose = NULL WHERE source IN ('file_import', 'manual') AND consent_purpose IS NOT NULL;

/*
  Une source de fournisseur sans finalité serait lue comme « pas besoin
  d'accord ». La contrainte rend ce cas impossible : seule une donnée venue de
  l'athlète lui-même peut s'en passer. Ajouter une source (Whoop, Polar…) oblige
  donc à ajouter d'abord sa finalité à l'enum `consent_purpose`.
*/
ALTER TABLE public.data_source_policies
  DROP CONSTRAINT IF EXISTS data_source_policies_consent_required;
ALTER TABLE public.data_source_policies
  ADD CONSTRAINT data_source_policies_consent_required
  CHECK (consent_purpose IS NOT NULL OR source IN ('file_import', 'manual'));

/*
  Même contrat qu'avant pour les quatre sources existantes (garmin → garmin_sync,
  coros → coros_sync, file_import / manual → vrai), mais lu dans la table :
    - une source sans ligne de politique → faux (inconnue = interdite, comme
      `apply_source_ai_policy`) ;
    - une source avec une finalité → il faut cette finalité-là, et non plus
      `coros_sync` par défaut.
  Le garde-fou anti-oracle (soi-même, son coach, ou appel serveur) est
  inchangé ; voir 20261027130000 pour pourquoi `auth.uid() IS NULL`.
*/
CREATE OR REPLACE FUNCTION public.source_consent_granted(
  p_athlete uuid,
  p_source  public.data_source
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.source_consent_granted(uuid, public.data_source) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.source_consent_granted(uuid, public.data_source) TO authenticated, service_role;

/*
  Retrait d'un consentement montre : la (ou les) connexion(s) des sources qui
  exigent cette finalité passent en `consent_withdrawn`. Même effet qu'avant
  pour garmin_sync / coros_sync, sans `CASE` à tenir à jour.
*/
CREATE OR REPLACE FUNCTION public.halt_sync_on_consent_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
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

-- ═══════════════ 2. Un compte fournisseur = un athlète Agon ═════════════════
/*
  Un webhook Garmin ne porte que le `userId` Garmin. Si deux athlètes Agon
  pouvaient être liés au même compte Garmin, une activité serait importée chez
  les deux — et une désinscription n'en déconnecterait qu'un. L'identifiant
  Garmin est stable d'un jeton à l'autre (doc OAuth2 PKCE, « User ID ») : une
  reconnexion du même athlète réutilise sa ligne (upsert sur athlete_id,
  provider), un second athlète est refusé (23505 → « compte déjà lié »).
*/
CREATE UNIQUE INDEX IF NOT EXISTS provider_connections_external_uidx
  ON public.provider_connections (provider, external_user_id)
  WHERE external_user_id IS NOT NULL;

-- L'index non unique de 20261027130000 couvre la même chose : redondant.
DROP INDEX IF EXISTS public.provider_connections_external_idx;

-- ═══════════════ 3. Attribution de l'appareil ═══════════════════════════════
/*
  Les conditions Garmin (API Brand Guidelines) exigent la mention « Garmin
  [modèle] » partout où une donnée Garmin est affichée ou exportée. Le modèle
  arrive dans le résumé d'activité (`deviceName`) ; on le garde en colonne
  plutôt que dans `raw`, que le client ne lit pas.
*/
ALTER TABLE public.provider_activities
  ADD COLUMN IF NOT EXISTS device_name text;

ALTER TABLE public.provider_activities
  DROP CONSTRAINT IF EXISTS provider_activities_device_name_len;
ALTER TABLE public.provider_activities
  ADD CONSTRAINT provider_activities_device_name_len
  CHECK (device_name IS NULL OR char_length(device_name) BETWEEN 1 AND 120);

COMMENT ON COLUMN public.provider_activities.device_name IS
  'Modèle de l''appareil qui a enregistré l''activité, tel que transmis par le fournisseur (ex. « Forerunner 265 »). Sert à l''attribution « Garmin [modèle] » exigée par Garmin.';

-- ═══════════════ 4. Jetons : échéance du refresh, verrou ════════════════════
/*
  Garmin : jeton d'accès 24 h, refresh token ~90 j (`refresh_token_expires_in`
  = 7 775 998 s), un NOUVEAU refresh token à chaque rafraîchissement. En push,
  on n'appelle presque jamais Garmin : sans rafraîchissement planifié, le
  refresh token meurt au bout de 90 jours et on ne peut plus appeler
  `DELETE /user/registration` à la déconnexion.

  Le refresh token étant à usage unique, deux rafraîchissements simultanés
  (cron + déconnexion) en brûleraient un : le second échouerait et la connexion
  passerait à tort en `needs_reauth`. D'où un bail court, pris en une requête.
*/
ALTER TABLE public.provider_tokens
  ADD COLUMN IF NOT EXISTS refresh_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS refresh_locked_until timestamptz;

CREATE OR REPLACE FUNCTION public.provider_token_claim_refresh(
  p_connection_id uuid,
  p_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE sql
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.provider_token_release_refresh(p_connection_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.provider_tokens SET refresh_locked_until = NULL
   WHERE connection_id = p_connection_id;
$$;

REVOKE ALL ON FUNCTION public.provider_token_claim_refresh(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provider_token_release_refresh(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_token_claim_refresh(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.provider_token_release_refresh(uuid) TO service_role;

-- ═══════════════ 5. Données quotidiennes ════════════════════════════════════
/*
  Lecture seule pour l'athlète, comme les activités depuis S10 : une donnée
  quotidienne « Garmin » ne doit pouvoir être écrite que par nos fonctions
  serveur. Sans cela, un athlète pouvait poser une fausse FC de repos estampillée
  Garmin — et c'est cette provenance que l'attribution affiche.
*/
DROP POLICY IF EXISTS provider_dailies_own ON public.provider_dailies;
DROP POLICY IF EXISTS provider_dailies_own_read ON public.provider_dailies;
CREATE POLICY provider_dailies_own_read ON public.provider_dailies
  FOR SELECT TO authenticated
  USING (athlete_id = auth.uid());

/*
  Garmin envoie la même journée en plusieurs résumés séparés (dailies, sleeps,
  hrv…), à des moments différents. Un upsert ordinaire écraserait le `raw` du
  précédent ; on range donc `raw` par type (`{"dailies": {...}, "sleeps":
  {...}}`) et on ne met à jour que les colonnes que ce type renseigne. Une
  colonne absente de `p_fields` garde sa valeur ; une colonne présente à `null`
  est remise à null (mesure retirée par le fournisseur).
*/
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
  v_id uuid;
  f jsonb := COALESCE(p_fields, '{}'::jsonb);
BEGIN
  IF p_kind IS NULL OR p_kind !~ '^[a-zA-Z_]{1,40}$' THEN
    RAISE EXCEPTION 'provider_daily_merge : type de résumé invalide';
  END IF;

  INSERT INTO public.provider_dailies AS d (athlete_id, source, day, raw)
  VALUES (p_athlete, p_source, p_day, jsonb_build_object(p_kind, p_raw))
  ON CONFLICT (athlete_id, source, day) DO UPDATE
     SET raw = COALESCE(d.raw, '{}'::jsonb) || jsonb_build_object(p_kind, p_raw),
         imported_at = now()
  RETURNING d.id INTO v_id;

  UPDATE public.provider_dailies d SET
    resting_hr       = CASE WHEN f ? 'resting_hr'       THEN (f->>'resting_hr')::smallint       ELSE d.resting_hr END,
    hrv_ms           = CASE WHEN f ? 'hrv_ms'           THEN (f->>'hrv_ms')::numeric            ELSE d.hrv_ms END,
    sleep_total_min  = CASE WHEN f ? 'sleep_total_min'  THEN (f->>'sleep_total_min')::integer   ELSE d.sleep_total_min END,
    sleep_deep_min   = CASE WHEN f ? 'sleep_deep_min'   THEN (f->>'sleep_deep_min')::integer    ELSE d.sleep_deep_min END,
    sleep_rem_min    = CASE WHEN f ? 'sleep_rem_min'    THEN (f->>'sleep_rem_min')::integer     ELSE d.sleep_rem_min END,
    sleep_score      = CASE WHEN f ? 'sleep_score'      THEN (f->>'sleep_score')::smallint      ELSE d.sleep_score END,
    steps            = CASE WHEN f ? 'steps'            THEN (f->>'steps')::integer             ELSE d.steps END,
    stress_avg       = CASE WHEN f ? 'stress_avg'       THEN (f->>'stress_avg')::smallint       ELSE d.stress_avg END,
    body_battery_min = CASE WHEN f ? 'body_battery_min' THEN (f->>'body_battery_min')::smallint ELSE d.body_battery_min END,
    body_battery_max = CASE WHEN f ? 'body_battery_max' THEN (f->>'body_battery_max')::smallint ELSE d.body_battery_max END,
    vo2max           = CASE WHEN f ? 'vo2max'           THEN (f->>'vo2max')::numeric            ELSE d.vo2max END,
    training_load    = CASE WHEN f ? 'training_load'    THEN (f->>'training_load')::numeric     ELSE d.training_load END
  WHERE d.id = v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.provider_daily_merge(uuid, public.data_source, date, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_daily_merge(uuid, public.data_source, date, text, jsonb, jsonb) TO service_role;

-- ═══════════════ 6. Réception brute des webhooks ════════════════════════════
/*
  Garmin exige une réponse 200 « en quelques secondes » et rejoue les
  notifications en échec. Le webhook ne fait donc qu'une chose avant de
  répondre : écrire ce qu'il a reçu ici. Le traitement vient après, dans la même
  invocation (`EdgeRuntime.waitUntil`) ou au passage suivant du cron.

  Une ligne par entrée de notification (une activité, une journée…), pas par
  requête : une entrée en erreur se rejoue seule. `fingerprint` = SHA-256 du
  type et de l'entrée ; la même notification reçue deux fois ne crée qu'une
  ligne (insert « ignore duplicates »), d'où l'idempotence.

  RLS activée et AUCUNE politique : service_role seulement. Les payloads sont
  des données de santé ; ils ne restent que le temps du traitement (purge à
  7 jours une fois traités, 30 jours sinon) et partent avec la connexion
  (`provider_forget`).
*/
CREATE TABLE IF NOT EXISTS public.provider_webhook_inbox (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         public.data_source NOT NULL,
  -- Clé de premier niveau de la notification : activities, dailies, sleeps,
  -- hrv, deregistrations, userPermissionsChange…
  type             text NOT NULL,
  -- Identifiant de l'utilisateur chez le fournisseur, pour rattacher et
  -- purger sans ouvrir le payload.
  external_user_id text,
  payload          jsonb NOT NULL,
  fingerprint      text NOT NULL,
  received_at      timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz,
  attempts         smallint NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  error            text,

  CONSTRAINT provider_webhook_inbox_fingerprint_unique UNIQUE (provider, fingerprint),
  CONSTRAINT provider_webhook_inbox_type_len CHECK (char_length(type) BETWEEN 1 AND 60)
);

CREATE INDEX IF NOT EXISTS provider_webhook_inbox_pending_idx
  ON public.provider_webhook_inbox (provider, received_at)
  WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS provider_webhook_inbox_user_idx
  ON public.provider_webhook_inbox (provider, external_user_id);

ALTER TABLE public.provider_webhook_inbox ENABLE ROW LEVEL SECURITY;
-- Aucune politique, volontairement. Ne pas en ajouter.
REVOKE ALL ON TABLE public.provider_webhook_inbox FROM anon, authenticated;

COMMENT ON TABLE public.provider_webhook_inbox IS
  'Réception brute des webhooks fournisseurs (Garmin). RLS sans politique : service_role seulement. Une ligne par entrée, idempotente par empreinte. Purgée après traitement.';

/*
  Prise en charge d'un lot à traiter, en une requête : `SKIP LOCKED` + bail de
  cinq minutes. Le webhook (waitUntil) et le cron peuvent tourner en même temps
  sans traiter deux fois la même ligne ; une ligne dont le traitement a planté
  redevient disponible à l'expiration du bail, jusqu'à 5 tentatives.
*/
CREATE OR REPLACE FUNCTION public.provider_inbox_claim(
  p_provider public.data_source,
  p_ids      uuid[] DEFAULT NULL,
  p_limit    integer DEFAULT 50
)
RETURNS SETOF public.provider_webhook_inbox
LANGUAGE sql
SET search_path = public
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

REVOKE ALL ON FUNCTION public.provider_inbox_claim(public.data_source, uuid[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_inbox_claim(public.data_source, uuid[], integer) TO service_role;

-- ═══════════════ 7. Oublier ce qu'un fournisseur a apporté ══════════════════
/*
  Décision du 07/11/2026 : déconnecter une montre supprime les activités et les
  données quotidiennes importées par ce fournisseur, ses messages en attente, la
  connexion et ses jetons (cascade → trigger Vault). Les activités importées à
  la main (`file_import`) ne sont jamais touchées : la source est dans le WHERE.

  Une seule transaction : une suppression à moitié faite laisserait des données
  Garmin sans connexion, donc sans moyen de les rattacher à une demande de
  l'athlète. La révocation chez le fournisseur se fait AVANT, dans l'Edge
  Function (appel HTTP, rien à faire dans une transaction SQL).
*/
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
  n_act int; n_day int; n_inbox int := 0; n_conn int;
BEGIN
  IF p_provider NOT IN ('garmin', 'coros') THEN
    RAISE EXCEPTION 'provider_forget : % n''est pas un fournisseur connecté', p_provider;
  END IF;

  SELECT external_user_id INTO v_external
    FROM public.provider_connections
   WHERE athlete_id = p_athlete AND provider = p_provider;

  DELETE FROM public.provider_activities WHERE athlete_id = p_athlete AND source = p_provider;
  GET DIAGNOSTICS n_act = ROW_COUNT;
  DELETE FROM public.provider_dailies WHERE athlete_id = p_athlete AND source = p_provider;
  GET DIAGNOSTICS n_day = ROW_COUNT;
  IF v_external IS NOT NULL THEN
    DELETE FROM public.provider_webhook_inbox WHERE provider = p_provider AND external_user_id = v_external;
    GET DIAGNOSTICS n_inbox = ROW_COUNT;
  END IF;
  DELETE FROM public.provider_connections WHERE athlete_id = p_athlete AND provider = p_provider;
  GET DIAGNOSTICS n_conn = ROW_COUNT;

  RETURN jsonb_build_object('activities', n_act, 'dailies', n_day, 'inbox', n_inbox, 'connection', n_conn);
END;
$$;

REVOKE ALL ON FUNCTION public.provider_forget(uuid, public.data_source) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_forget(uuid, public.data_source) TO service_role;

-- ═══════════════ 8. Cron de maintenance Garmin ══════════════════════════════
/*
  Toutes les 15 minutes, mais l'appel HTTP ne part que s'il y a quelque chose à
  faire :
    - un message de l'inbox Garmin non traité depuis plus de 2 minutes (le
      `waitUntil` du webhook n'a pas abouti) ;
    - un jeton Garmin dont le refresh token expire dans moins de 60 jours
      (donc rafraîchi tous les ~30 jours ; échéance inconnue → 30 jours après
      la dernière écriture).
  Sans connexion Garmin et sans message : retour immédiat, aucun avertissement.
  C'est l'état normal jusqu'à l'approbation Garmin.

  La purge de l'inbox se fait ici, en SQL, sans appel HTTP.
  Même mécanique de secrets que `trigger_coros_sync` (Vault : project_url,
  service_role_key) ; voir 20261028150000 pour le raisonnement.
*/
CREATE OR REPLACE FUNCTION public.trigger_garmin_maintenance()
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

REVOKE ALL ON FUNCTION public.trigger_garmin_maintenance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_garmin_maintenance() FROM anon;
REVOKE ALL ON FUNCTION public.trigger_garmin_maintenance() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_garmin_maintenance() TO service_role;

COMMENT ON FUNCTION public.trigger_garmin_maintenance() IS
  'Purge l''inbox webhook, puis appelle provider-garmin-maintenance seulement s''il y a un message en retard ou un jeton Garmin à rafraîchir. No-op silencieux sinon.';

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'garmin-maintenance') THEN
    PERFORM cron.unschedule('garmin-maintenance');
  END IF;
EXCEPTION
  WHEN invalid_schema_name    THEN NULL;
  WHEN undefined_table        THEN NULL;
  WHEN undefined_function     THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END;
$do$;

DO $do$
BEGIN
  PERFORM cron.schedule(
    'garmin-maintenance',
    '*/15 * * * *',
    'SELECT public.trigger_garmin_maintenance();'
  );
EXCEPTION
  WHEN invalid_schema_name THEN
    RAISE WARNING 'pg_cron non disponible — activez l''extension puis ré-exécutez cette migration.';
  WHEN undefined_function THEN
    RAISE WARNING 'pg_cron non disponible (cron.schedule introuvable).';
  WHEN insufficient_privilege THEN
    RAISE WARNING 'Droits insuffisants pour planifier le job cron — à créer depuis le Dashboard Supabase.';
END;
$do$;
