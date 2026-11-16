-- Crons Garmin espacés pour soulager la prod (plan gratuit, 4e panne du 16/11 à 21 h 45 :
-- mémoire saturée). Décision d'Hugo du 16/11/2026 :
--   garmin-workouts    : toutes les 10 min → toutes les 30 min (séances prévues envoyées
--                        aux montres ; « Envoyer sur ma montre » reste immédiat) ;
--   garmin-maintenance : toutes les 15 min → toutes les heures (inbox en retard, jetons).
-- Sans pg_cron ou sans ces tâches (base de test sans crons) : rien à faire.
DO $$
DECLARE r record;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN; END IF;
  FOR r IN SELECT jobid, jobname FROM cron.job WHERE jobname IN ('garmin-workouts', 'garmin-maintenance') LOOP
    PERFORM cron.alter_job(
      job_id   := r.jobid,
      schedule := CASE r.jobname WHEN 'garmin-workouts' THEN '*/30 * * * *' ELSE '7 * * * *' END
    );
  END LOOP;
END $$;
