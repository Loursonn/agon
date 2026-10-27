/*
  Synchronisation COROS quotidienne.

  COROS fonctionne en « pull » : contrairement à Garmin, qui pousse ses
  activités par webhook, c'est à nous d'aller les chercher. Un cron quotidien
  suffit — interroger plus souvent n'apporte rien à un coach qui regarde son
  tableau de bord le matin, et consomme un quota de 50 fichiers par athlète et
  par 24 h.

  3 h 40 : `mark-missed-workouts` tourne à 3 h 00 et `purge-oauth-states` à
  3 h 10. Trois travaux à la même minute se disputeraient les connexions pour
  rien.

  ──────────────────────── Pourquoi un secret en Vault ────────────────────────

  Appeler une Edge Function depuis Postgres suppose un jeton. La fonction
  `provider-coros-sync` reconnaît l'appel du cron à l'égalité stricte avec la
  clé `service_role` — rien dans le corps de la requête n'entre dans cette
  décision, parce qu'un indicateur « je suis le cron » envoyé par un client
  serait une porte ouverte.

  Cette clé ne peut donc pas être écrite ici : une migration est versionnée, et
  un secret dans Git est un secret public. Elle est lue depuis le Vault, et la
  migration se contente d'avertir si elle n'y est pas. À poser une fois, hors
  dépôt :

    select vault.create_secret(
      '<clé service_role>', 'service_role_key', 'Appel des Edge Functions par le cron');
    select vault.create_secret(
      'https://<ref>.supabase.co', 'project_url', 'Base des Edge Functions');

  Alternative écartée : un `CRON_SECRET` dédié, dont la fuite coûterait moins
  cher que celle de la clé `service_role`. Il aurait fallu passer
  `verify_jwt = false` sur la fonction — un secret quelconque n'est pas un JWT
  et la passerelle Supabase le rejetterait avant d'atteindre notre code. Pour
  une fonction capable d'agir sur n'importe quel athlète, garder la vérification
  de jeton de la passerelle vaut mieux qu'un secret plus étroit mais sans
  rempart devant.
*/

-- pg_net : indispensable pour qu'un travail cron émette une requête HTTP.
-- Absent de ce projet jusqu'ici, aucun cron n'ayant eu besoin de sortir.
DO $do$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING 'Droits insuffisants pour installer pg_net — à activer depuis le Dashboard Supabase (Database > Extensions).';
  WHEN OTHERS THEN
    RAISE WARNING 'pg_net non installé (%) — la synchronisation COROS ne partira pas.', SQLERRM;
END;
$do$;

/*
  Le déclencheur, isolé dans une fonction plutôt qu'écrit en ligne dans
  `cron.schedule`.

  Trois raisons : le corps d'un job cron est une chaîne que personne ne relit,
  les secrets y seraient visibles dans `cron.job`, et une absence de
  configuration doit produire un avertissement explicite plutôt qu'un appel
  HTTP vers `null/functions/v1/...` qui échoue sans rien dire.
*/
CREATE OR REPLACE FUNCTION public.trigger_coros_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, extensions
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'trigger_coros_sync : secrets project_url / service_role_key absents du Vault — rien envoyé.';
    RETURN;
  END IF;

  /*
    Appel asynchrone : `net.http_post` dépose la requête dans une file et rend
    la main. C'est ce qu'on veut — la synchronisation de plusieurs athlètes,
    chacun avec des téléchargements de fichiers, dépasse largement le temps que
    doit passer un travail cron à tenir une transaction ouverte. Le résultat
    n'est pas attendu ici ; il est visible dans `net._http_response`, et surtout
    dans `provider_connections.last_sync_at` / `last_error`, qui sont le vrai
    journal de ce qui s'est passé.
  */
  PERFORM net.http_post(
    url     := v_url || '/functions/v1/provider-coros-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
EXCEPTION
  WHEN undefined_function THEN
    RAISE WARNING 'trigger_coros_sync : net.http_post introuvable (pg_net non installé).';
  WHEN undefined_table THEN
    RAISE WARNING 'trigger_coros_sync : Vault indisponible.';
END;
$$;

/*
  Réservée à `service_role`, comme les autres fonctions de cette intégration :
  elle émet un appel authentifié en `service_role`, donc y donner accès à
  `authenticated` reviendrait à offrir ce privilège à tout utilisateur connecté.
  `postgres`, sous lequel tourne pg_cron, garde le droit de l'exécuter.
*/
REVOKE ALL ON FUNCTION public.trigger_coros_sync() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_coros_sync() FROM anon;
REVOKE ALL ON FUNCTION public.trigger_coros_sync() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_coros_sync() TO service_role;

COMMENT ON FUNCTION public.trigger_coros_sync() IS
  'Déclenche l''Edge Function provider-coros-sync. Appelée par le cron quotidien ; lit project_url et service_role_key dans le Vault.';

-- Les conditions d'exception sont les noms PL/pgSQL officiels :
--   3F000 → invalid_schema_name  (schéma cron absent = pg_cron non installé)
--   42P01 → undefined_table      (cron.job absent)
--   42883 → undefined_function   (cron.schedule absent)

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'coros-sync') THEN
    PERFORM cron.unschedule('coros-sync');
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
    'coros-sync',
    '40 3 * * *',
    'SELECT public.trigger_coros_sync();'
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
