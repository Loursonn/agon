/*
  Fiabilité de la synchronisation COROS (audit 2026-11, §2.1 C3, C5, C6).

  Trois pièces, toutes réservées à `service_role` :

    1. Un verrou par connexion (`sync_locked_until` + `sync_lock_token`), pris
       et rendu par deux fonctions. Le cron et le bouton « synchroniser
       maintenant » de l'athlète peuvent tomber en même temps : sans verrou,
       les deux présentent le même refresh token, COROS — qui le fait tourner —
       refuse le second, et la connexion passe pour morte.
    2. Le décompte des fichiers FIT téléchargés, par connexion et par jour UTC
       (`provider_fit_quota`). COROS limite à 50 fichiers par athlète et par
       24 h ; le dépasser fait échouer les appels suivants. Le compteur est
       réservé *avant* de télécharger, de façon atomique.
    3. `trigger_coros_sync()` émet un appel HTTP par connexion active, avec
       `{ "connection_id": … }` dans le corps, au lieu d'un seul appel pour
       tout le monde — qui dépassait le temps d'exécution d'une Edge Function
       dès une quinzaine d'athlètes.

  Pourquoi un bail en colonne plutôt qu'un verrou consultatif : chaque appel
  RPC de supabase-js est sa propre transaction, servie par n'importe quelle
  connexion du pool PostgREST. `pg_try_advisory_xact_lock` serait relâché à la
  fin de l'appel qui le prend ; `pg_advisory_lock` (session) resterait accroché
  à une connexion du pool que l'appel suivant n'atteindrait pas forcément. Une
  colonne datée mise à jour par un UPDATE conditionnel est atomique, survit
  entre les appels, et expire seule si la fonction est tuée en cours de route.

  Compatible avec le client en production : il lit des colonnes nommées de
  `provider_connections` (pas `*`), et n'appelle aucune de ces fonctions.
  Compatible avec l'ancienne Edge Function aussi tant qu'il n'y a qu'une
  connexion active : elle ignore `connection_id` et traite toutes les
  connexions à chaque appel. Déployer la nouvelle fonction juste après.

  Idempotente : peut être rejouée.
*/

-- ─────────────────────────── 1. Verrou par connexion ────────────────────────

ALTER TABLE public.provider_connections
  ADD COLUMN IF NOT EXISTS sync_locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS sync_lock_token uuid;

COMMENT ON COLUMN public.provider_connections.sync_locked_until IS
  'Bail de synchronisation : une seule exécution à la fois par connexion. Expire seul. Écrit par provider_sync_try_lock / provider_sync_unlock.';
COMMENT ON COLUMN public.provider_connections.sync_lock_token IS
  'Jeton du bail en cours : seul celui qui l''a pris peut le rendre.';

/*
  Renvoie un jeton si le bail est pris, NULL s'il est déjà tenu.

  Deux appels simultanés sur la même ligne : le second attend le verrou de
  ligne du premier, puis réévalue la condition (READ COMMITTED) et la trouve
  fausse. Exactement un des deux obtient le jeton.

  Durée bornée entre 30 s et 1 h : un bail infini survivrait à une fonction
  tuée et bloquerait l'athlète pour toujours.
*/
CREATE OR REPLACE FUNCTION public.provider_sync_try_lock(
  p_connection_id uuid,
  p_ttl_seconds   integer DEFAULT 600
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
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

/*
  Rend le bail, seulement s'il appartient encore à l'appelant. Une exécution
  très longue dont le bail a expiré ne doit pas libérer celui qu'une autre a
  pris entre-temps.
*/
CREATE OR REPLACE FUNCTION public.provider_sync_unlock(
  p_connection_id uuid,
  p_token         uuid
)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.provider_connections
     SET sync_locked_until = NULL,
         sync_lock_token   = NULL
   WHERE id = p_connection_id
     AND sync_lock_token = p_token;
$$;

REVOKE ALL ON FUNCTION public.provider_sync_try_lock(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provider_sync_unlock(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_sync_try_lock(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.provider_sync_unlock(uuid, uuid) TO service_role;

-- ──────────────────────────── 2. Quota de fichiers ──────────────────────────
/*
  Une ligne par connexion et par jour UTC. Pas de donnée de santé : un nombre
  de fichiers. Supprimée avec la connexion (cascade), donc avec le compte.

  Jour UTC et non fenêtre glissante : COROS dit « 24 h » sans préciser. Si sa
  fenêtre glisse, un refus de quota peut arriver avant nos 50 ; la fonction le
  détecte et appelle `provider_fit_quota_exhaust`, et rien n'est perdu — le
  curseur reste sur la dernière fenêtre complète.
*/
CREATE TABLE IF NOT EXISTS public.provider_fit_quota (
  connection_id uuid NOT NULL REFERENCES public.provider_connections(id) ON DELETE CASCADE,
  day           date NOT NULL,
  used          integer NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, day),
  CONSTRAINT provider_fit_quota_used_sane CHECK (used >= 0)
);

ALTER TABLE public.provider_fit_quota ENABLE ROW LEVEL SECURITY;
-- Aucune politique : service_role uniquement, comme provider_tokens.
REVOKE ALL ON TABLE public.provider_fit_quota FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.provider_fit_quota TO service_role;

COMMENT ON TABLE public.provider_fit_quota IS
  'Fichiers FIT COROS réservés par connexion et par jour UTC (quota COROS : 50 / 24 h). Service_role uniquement.';

/* Fichiers encore téléchargeables aujourd'hui pour cette connexion. */
CREATE OR REPLACE FUNCTION public.provider_fit_quota_remaining(
  p_connection_id uuid,
  p_limit         integer
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT greatest(0, p_limit - coalesce((
    SELECT q.used FROM public.provider_fit_quota q
     WHERE q.connection_id = p_connection_id
       AND q.day = (now() AT TIME ZONE 'UTC')::date
  ), 0));
$$;

/*
  Réserve `p_count` fichiers, tout ou rien. Vrai si la réservation tient dans
  `p_limit`. L'UPDATE conditionnel est atomique : deux réservations
  concurrentes ne peuvent pas dépasser la limite à elles deux.

  Réserver avant de télécharger, et ne jamais rendre : un téléchargement qui
  échoue a peut-être été compté par COROS. Sous-estimer notre consommation est
  ce qui fait tomber sur le refus du serveur ; la surestimer coûte au pire
  quelques fichiers reportés au lendemain.
*/
CREATE OR REPLACE FUNCTION public.provider_fit_quota_reserve(
  p_connection_id uuid,
  p_count         integer,
  p_limit         integer
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
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

/* COROS a refusé pour quota : la journée est considérée comme épuisée. */
CREATE OR REPLACE FUNCTION public.provider_fit_quota_exhaust(
  p_connection_id uuid,
  p_limit         integer
)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.provider_fit_quota (connection_id, day, used)
  VALUES (p_connection_id, (now() AT TIME ZONE 'UTC')::date, greatest(coalesce(p_limit, 0), 0))
  ON CONFLICT (connection_id, day) DO UPDATE
     SET used = greatest(public.provider_fit_quota.used, EXCLUDED.used),
         updated_at = now();
$$;

REVOKE ALL ON FUNCTION public.provider_fit_quota_remaining(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provider_fit_quota_reserve(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provider_fit_quota_exhaust(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_fit_quota_remaining(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.provider_fit_quota_reserve(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.provider_fit_quota_exhaust(uuid, integer) TO service_role;

-- ───────────────── Doublons inter-sources : recherche par départ ────────────
/*
  `findCrossSourceDuplicate` (Edge Functions) cherche une activité du même
  athlète démarrée à ±2 min, toutes sources confondues. L'index existant est
  sur `local_date` ; celui-ci sert la recherche par instant de départ.
*/
CREATE INDEX IF NOT EXISTS provider_activities_athlete_started_idx
  ON public.provider_activities (athlete_id, started_at);

-- ─────────────────────── 3. Un appel par connexion ──────────────────────────
/*
  Même signature, mêmes secrets Vault, mêmes avertissements que la version du
  2026-10-28 ; seule change la boucle. Les appels sont asynchrones (pg_net les
  met en file et rend la main) : la transaction du cron reste courte quel que
  soit le nombre d'athlètes.

  Les connexions les moins récemment synchronisées partent en premier : si la
  file de pg_net est lente, ce sont elles qui ont le plus de retard.
*/
CREATE OR REPLACE FUNCTION public.trigger_coros_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, extensions
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

REVOKE ALL ON FUNCTION public.trigger_coros_sync() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_coros_sync() FROM anon;
REVOKE ALL ON FUNCTION public.trigger_coros_sync() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_coros_sync() TO service_role;

COMMENT ON FUNCTION public.trigger_coros_sync() IS
  'Déclenche provider-coros-sync, un appel par connexion COROS active ({connection_id}). Appelée par le cron quotidien ; lit project_url et service_role_key dans le Vault.';
