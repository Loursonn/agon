-- Purge des comptes (art. 5.1.e RGPD, limitation de la conservation). Revue juridique
-- docs/juridique/REVUE_2026-11.md I6, AIPD A6. Tâche roadmap
-- « T-purge-des-comptes-pre-crees-non-reclames ».
--
-- Deux règles :
--   1. Compte pré-créé par un coach, jamais réclamé par l'athlète : supprimé
--      quand il a plus de 6 mois ET qu'aucune séance n'a été créée ni modifiée
--      pour lui depuis 6 mois (un coach qui programme encore pour un athlète
--      « sans application » ne perd pas son travail sans prévenir).
--   2. Compte inactif depuis 3 ans (ni connexion, ni session rafraîchie, ni
--      ouverture de l'application) : préavis par e-mail, puis suppression 30
--      jours plus tard si la personne ne s'est pas reconnectée. Un coach dont un
--      athlète est encore actif n'est jamais considéré comme inactif.
--
-- La suppression elle-même est celle du droit à l'effacement (Edge Function
-- `account-retention`, qui réutilise `_shared/accountDeletion.ts`, comme
-- `delete-account`) : fichiers, révocation des montres, compte auth, cascade.
--
-- Rien ne part tant qu'Hugo n'a pas donné son accord : la tâche cron est créée
-- INACTIVE, et la fonction ne supprime rien sans le secret RETENTION_ENABLED=true.
-- Activation : docs/PURGE_COMPTES.md.

-- ── 1. Journal anonyme : nouvelle origine « retention » ─────────────────────
ALTER TABLE public.account_deletions DROP CONSTRAINT IF EXISTS account_deletions_initiated_by_check;
ALTER TABLE public.account_deletions ADD CONSTRAINT account_deletions_initiated_by_check
  CHECK (initiated_by = ANY (ARRAY['user'::text, 'admin'::text, 'retention'::text]));

-- ── 2. Préavis envoyés ──────────────────────────────────────────────────────
-- Une ligne par compte prévenu ; elle part avec le compte (cascade) ou dès que
-- la personne se reconnecte.
CREATE TABLE IF NOT EXISTS public.account_retention_notices (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notified_at  timestamptz NOT NULL DEFAULT now(),
  purge_after  timestamptz NOT NULL
);

COMMENT ON TABLE public.account_retention_notices IS
  'Préavis de suppression pour inactivité (3 ans). Lue et écrite par la seule Edge Function account-retention (service_role).';

ALTER TABLE public.account_retention_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_retention_notices FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.account_retention_notices TO service_role;

-- ── 3. Qui serait concerné aujourd'hui ──────────────────────────────────────
-- `action` :
--   supprimer_pre_cree      règle 1
--   prevenir                règle 2, aucun préavis encore
--   supprimer_inactif       règle 2, préavis échu sans reconnexion
--   annuler_preavis         préavis envoyé, la personne est revenue
CREATE OR REPLACE FUNCTION public.account_retention_candidates(
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE(user_id uuid, action text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH activity AS (
    SELECT
      u.id,
      p.role,
      coalesce(p.is_pending, false) AS is_pending,
      coalesce(p.is_admin, false)   AS is_admin,
      greatest(
        u.created_at,
        u.last_sign_in_at,
        p.client_build_at,
        (SELECT max(greatest(s.created_at, s.updated_at)) FROM auth.sessions s WHERE s.user_id = u.id)
      ) AS last_activity
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
  ),
  pre_crees AS (
    SELECT a.id
    FROM activity a
    JOIN public.profiles p ON p.id = a.id
    LEFT JOIN public.athlete_claims c ON c.athlete_id = a.id
    WHERE a.is_pending
      AND NOT a.is_admin
      AND coalesce(c.created_at, p.created_at, a.last_activity) < p_now - interval '6 months'
      AND NOT EXISTS (
        SELECT 1 FROM public.workout_logs w
         WHERE w.athlete_id = a.id
           AND greatest(w.created_at, w.updated_at) >= p_now - interval '6 months')
  ),
  inactifs AS (
    SELECT a.id, a.last_activity
    FROM activity a
    WHERE NOT a.is_pending
      AND NOT a.is_admin
      AND a.last_activity < p_now - interval '3 years'
      -- Un coach (référent ou co-coach) reste actif tant qu'un de ses athlètes l'est.
      AND NOT EXISTS (
        SELECT 1 FROM activity x
         WHERE x.last_activity >= p_now - interval '3 years'
           AND (x.id IN (SELECT pr.id FROM public.profiles pr WHERE pr.coach_id = a.id)
                OR x.id IN (SELECT cc.athlete_id FROM public.athlete_co_coaches cc WHERE cc.co_coach_id = a.id)))
  )
  SELECT id, 'supprimer_pre_cree' FROM pre_crees
  UNION ALL
  SELECT i.id, 'supprimer_inactif'
    FROM inactifs i JOIN public.account_retention_notices n ON n.user_id = i.id
   WHERE n.purge_after <= p_now AND i.last_activity < n.notified_at
  UNION ALL
  SELECT i.id, 'prevenir'
    FROM inactifs i
   WHERE NOT EXISTS (SELECT 1 FROM public.account_retention_notices n WHERE n.user_id = i.id)
  UNION ALL
  SELECT n.user_id, 'annuler_preavis'
    FROM public.account_retention_notices n
   WHERE NOT EXISTS (SELECT 1 FROM inactifs i WHERE i.id = n.user_id AND i.last_activity < n.notified_at);
$$;

COMMENT ON FUNCTION public.account_retention_candidates(timestamptz) IS
  'Comptes visés par la purge (pré-créés non réclamés 6 mois, inactifs 3 ans). Lecture seule ; service_role uniquement. Voir docs/PURGE_COMPTES.md.';

REVOKE ALL ON FUNCTION public.account_retention_candidates(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_retention_candidates(timestamptz) TO service_role;

-- Nombres seulement, jamais d'identifiant : pour Hugo et pour les contrôles.
CREATE OR REPLACE FUNCTION public.account_retention_preview(
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE(action text, comptes bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT a.action, count(c.user_id)
    FROM (VALUES ('supprimer_pre_cree'), ('prevenir'), ('supprimer_inactif'), ('annuler_preavis')) AS a(action)
    LEFT JOIN public.account_retention_candidates(p_now) c ON c.action = a.action
   GROUP BY a.action
   ORDER BY a.action;
$$;

REVOKE ALL ON FUNCTION public.account_retention_preview(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_retention_preview(timestamptz) TO service_role;

-- ── 4. Tâche planifiée, créée INACTIVE ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_account_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, extensions
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'trigger_account_retention : secrets project_url / service_role_key absents du Vault — rien envoyé.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/account-retention',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{"apply": true}'::jsonb,
    timeout_milliseconds := 120000
  );
EXCEPTION
  WHEN undefined_function THEN
    RAISE WARNING 'trigger_account_retention : net.http_post introuvable (pg_net non installé).';
  WHEN undefined_table THEN
    RAISE WARNING 'trigger_account_retention : Vault indisponible.';
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_account_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_account_retention() TO service_role;

-- Lundi 4 h 30 (UTC). Créée puis désactivée aussitôt : l'activer est un choix d'Hugo.
DO $do$
BEGIN
  PERFORM cron.unschedule('account-retention')
   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'account-retention');
  PERFORM cron.schedule('account-retention', '30 4 * * 1', 'SELECT public.trigger_account_retention();');
  PERFORM cron.alter_job(jobid, active := false) FROM cron.job WHERE jobname = 'account-retention';
EXCEPTION
  WHEN undefined_function OR invalid_schema_name THEN
    RAISE WARNING 'pg_cron indisponible : job account-retention non planifié.';
END;
$do$;
