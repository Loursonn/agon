/*
  Purge quotidienne des autorisations OAuth abandonnées.

  `provider_oauth_states` est une table de passage : une ligne y vit dix
  minutes, le temps que l'athlète s'authentifie chez COROS et revienne. Celles
  qui ne sont jamais consommées — onglet fermé, mot de passe oublié, hésitation
  — ne redeviennent jamais utilisables, mais elles restent.

  Rien ne casse si on ne les purge pas : `consume_oauth_state` refuse déjà une
  ligne expirée, donc il n'y a pas de faille à fermer ici. Ce qui se dégrade
  est plus discret — une table qui ne se vide jamais, dont chaque ligne contient
  un `code_verifier`. Conserver des secrets morts n'a aucune utilité, et une
  table de passage qui grossit en silence finit par se remarquer au mauvais
  moment.

  3 h 10 du matin, et pas 3 h 00 : `mark-missed-workouts` tourne déjà à 3 h 00,
  et faire démarrer deux travaux à la même minute ne rend service à personne.
*/

-- Les conditions d'exception sont les noms PL/pgSQL officiels :
--   3F000 → invalid_schema_name  (schéma cron absent = pg_cron non installé)
--   42P01 → undefined_table      (cron.job absent)
--   42883 → undefined_function   (cron.schedule absent)

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-oauth-states') THEN
    PERFORM cron.unschedule('purge-oauth-states');
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
    'purge-oauth-states',
    '10 3 * * *',
    'SELECT public.purge_expired_oauth_states();'
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
