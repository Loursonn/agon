-- Tests de 20261115110000_purge_comptes.sql : qui la purge viserait, et qui personne d'autre ne
-- peut interroger. Comptes FICTIFS créés dans la transaction (e-mails @example.invalid), toujours
-- annulé. Les résultats ne portent que sur ces comptes fictifs : aucune donnée réelle affichée.
-- Lancer : supabase db query --linked -f supabase/tests/purge_comptes.sql (chaque ligne : ok = true).
BEGIN;

SET LOCAL session_replication_role = replica;  -- comptes bruts : pas de triggers

CREATE TEMP TABLE t_u (k text PRIMARY KEY, id uuid, role text, pending boolean, admin boolean,
                       created timestamptz, sign_in timestamptz, build_at timestamptz);
INSERT INTO t_u VALUES
  ('pre_vieux',        gen_random_uuid(), 'athlete', true,  false, now() - interval '7 months',  NULL, NULL),
  ('pre_programme',    gen_random_uuid(), 'athlete', true,  false, now() - interval '7 months',  NULL, NULL),
  ('pre_recent',       gen_random_uuid(), 'athlete', true,  false, now() - interval '2 months',  NULL, NULL),
  ('inactif',          gen_random_uuid(), 'athlete', false, false, now() - interval '4 years',   now() - interval '4 years', NULL),
  ('appli_ouverte',    gen_random_uuid(), 'athlete', false, false, now() - interval '4 years',   now() - interval '4 years', now() - interval '1 month'),
  ('session_active',   gen_random_uuid(), 'athlete', false, false, now() - interval '4 years',   now() - interval '4 years', NULL),
  ('coach_inactif',    gen_random_uuid(), 'coach',   false, false, now() - interval '4 years',   now() - interval '4 years', NULL),
  ('athlete_actif',    gen_random_uuid(), 'athlete', false, false, now() - interval '4 years',   now() - interval '1 week', NULL),
  ('preavis_echu',     gen_random_uuid(), 'athlete', false, false, now() - interval '4 years',   now() - interval '4 years', NULL),
  ('preavis_en_cours', gen_random_uuid(), 'athlete', false, false, now() - interval '4 years',   now() - interval '4 years', NULL),
  ('revenu',           gen_random_uuid(), 'athlete', false, false, now() - interval '4 years',   now() - interval '1 day', NULL),
  ('admin_inactif',    gen_random_uuid(), 'coach',   false, true,  now() - interval '4 years',   now() - interval '4 years', NULL);

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
SELECT '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
       'purge-' || k || '@example.invalid', '', created, '{}', '{}', created, created, sign_in
FROM t_u;

INSERT INTO public.profiles (id, role, full_name, is_pending, is_admin, created_at, client_build_at, coach_id)
SELECT id, role, 'Purge ' || k, pending, admin, created, build_at,
       CASE WHEN k = 'athlete_actif' THEN (SELECT id FROM t_u WHERE k = 'coach_inactif') END
FROM t_u;

INSERT INTO public.athlete_claims (athlete_id, token, created_at)
SELECT id, md5(k), created FROM t_u WHERE pending;

-- Séance modifiée il y a un mois pour un athlète pré-créé : le coach programme encore.
INSERT INTO public.workout_logs (athlete_id, session_id, session_name, scheduled_date, created_at, updated_at)
SELECT id, 'purge-test', 'Séance test', current_date, now() - interval '1 month', now() - interval '1 month'
FROM t_u WHERE k = 'pre_programme';

-- Session rafraîchie hier : la personne utilise l'application sans se reconnecter.
INSERT INTO auth.sessions (id, user_id, created_at, updated_at)
SELECT gen_random_uuid(), id, now() - interval '4 years', now() - interval '1 day' FROM t_u WHERE k = 'session_active';

INSERT INTO public.account_retention_notices (user_id, notified_at, purge_after)
SELECT id, now() - interval '40 days', now() - interval '10 days' FROM t_u WHERE k IN ('preavis_echu', 'revenu')
UNION ALL
SELECT id, now() - interval '5 days', now() + interval '25 days' FROM t_u WHERE k = 'preavis_en_cours';

SET LOCAL session_replication_role = origin;

CREATE TEMP TABLE t_res (name text, ok boolean, detail text);
CREATE TEMP TABLE t_c AS
SELECT u.k, c.action FROM t_u u LEFT JOIN public.account_retention_candidates() c ON c.user_id = u.id;

INSERT INTO t_res
SELECT 'règle: ' || e.k || ' → ' || coalesce(e.attendu, 'rien'),
       coalesce((SELECT string_agg(action, ',') FROM t_c WHERE t_c.k = e.k), 'rien') = coalesce(e.attendu, 'rien'),
       coalesce((SELECT string_agg(action, ',') FROM t_c WHERE t_c.k = e.k), 'rien')
FROM (VALUES
  ('pre_vieux', 'supprimer_pre_cree'),
  ('pre_programme', NULL),
  ('pre_recent', NULL),
  ('inactif', 'prevenir'),
  ('appli_ouverte', NULL),
  ('session_active', NULL),
  ('coach_inactif', NULL),
  ('athlete_actif', NULL),
  ('preavis_echu', 'supprimer_inactif'),
  ('preavis_en_cours', NULL),
  ('revenu', 'annuler_preavis'),
  ('admin_inactif', NULL)
) AS e(k, attendu);

-- L'aperçu ne renvoie que des nombres, une ligne par action.
INSERT INTO t_res
SELECT 'aperçu: 4 actions, nombres seulement',
       (SELECT count(*) FROM public.account_retention_preview()) = 4, '';

-- Personne d'autre que service_role.
INSERT INTO t_res
SELECT 'droits: ' || r || ' ne peut pas ' || f,
       NOT has_function_privilege(r, f, 'EXECUTE'), ''
FROM unnest(ARRAY['anon', 'authenticated']) r,
     unnest(ARRAY['public.account_retention_candidates(timestamptz)',
                  'public.account_retention_preview(timestamptz)',
                  'public.trigger_account_retention()']) f;
INSERT INTO t_res
SELECT 'droits: ' || r || ' ne lit pas les préavis',
       NOT has_table_privilege(r, 'public.account_retention_notices', 'SELECT'), ''
FROM unnest(ARRAY['anon', 'authenticated']) r;

-- Journal anonyme : la nouvelle origine est acceptée.
DO $$ BEGIN
  INSERT INTO public.account_deletions (role, initiated_by) VALUES ('athlete', 'retention');
  INSERT INTO t_res VALUES ('journal: origine « retention » acceptée', true, '');
EXCEPTION WHEN check_violation THEN
  INSERT INTO t_res VALUES ('journal: origine « retention » acceptée', false, SQLERRM);
END $$;

-- La tâche planifiée existe et est inactive.
INSERT INTO t_res
SELECT 'cron: account-retention créée inactive',
       coalesce((SELECT NOT active FROM cron.job WHERE jobname = 'account-retention'), false),
       coalesce((SELECT active::text FROM cron.job WHERE jobname = 'account-retention'), 'absente');

SELECT name, ok, left(detail, 60) AS detail FROM t_res;
ROLLBACK;
