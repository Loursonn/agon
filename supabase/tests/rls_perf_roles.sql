-- Matrice des rôles RLS (écrit pour 20261115193700_rls_perf_preconditions.sql, qui ajoute des
-- préconditions devant is_coach_of / staff_can) : chaque rôle voit et écrit exactement ce qu'il doit.
-- Rôles : athlète, coach référent, co-coach, staff avec droit (logs) et sans droit (medical),
-- staff au lien révoqué, admin, utilisateur sans lien, anon.
-- Un refus d'écriture ne compte que s'il vient de la RLS (SQLSTATE 42501).
-- Les valeurs attendues sont calculées en postgres (sans RLS) à partir des tables, avant de
-- prendre chaque rôle. Toujours annulé (ROLLBACK) ; aucune donnée affichée, seulement ok/ko.
-- Prod (comptes démo en priorité) : prod.sh supabase db query --linked -f supabase/tests/rls_perf_roles.sql
-- Avant application : (echo 'BEGIN;'; sed -n '/^CREATE OR REPLACE FUNCTION public.is_coach_of/,$p' \
--   supabase/migrations/20261115193700_rls_perf_preconditions.sql; sed '/^BEGIN;$/d' supabase/tests/rls_perf_roles.sql)

BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';
CREATE TEMP TABLE t_res(n serial, label text, ok boolean) ON COMMIT DROP;
GRANT ALL ON t_res TO authenticated, anon; GRANT ALL ON SEQUENCE t_res_n_seq TO authenticated, anon;

-- ── Qui joue quoi ─────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE ids ON COMMIT DROP AS
WITH a AS (
  SELECT p.id, p.coach_id FROM profiles p LEFT JOIN auth.users u ON u.id = p.id
   WHERE p.role = 'athlete' AND p.coach_id IS NOT NULL AND p.coach_id <> p.id
     AND EXISTS (SELECT 1 FROM app_data d WHERE d.athlete_id = p.id)
     AND EXISTS (SELECT 1 FROM workout_logs w WHERE w.athlete_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches c WHERE c.athlete_id = p.id)
   ORDER BY (u.email = 'lea.demo@agon-demo.fr') DESC NULLS LAST, p.created_at
   LIMIT 1
), x AS (
  SELECT c.athlete_id, c.co_coach_id FROM athlete_co_coaches c JOIN profiles p ON p.id = c.athlete_id
   WHERE p.coach_id IS DISTINCT FROM c.co_coach_id
     AND c.co_coach_id <> (SELECT coach_id FROM a) AND c.athlete_id <> (SELECT id FROM a)
   LIMIT 1
)
SELECT a.id AS athlete, a.coach_id AS coach,
  (SELECT o.id FROM profiles o WHERE o.role = 'athlete' AND o.id <> a.id
      AND o.coach_id IS DISTINCT FROM a.coach_id
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches c WHERE c.athlete_id = o.id AND c.co_coach_id = a.coach_id)
      AND EXISTS (SELECT 1 FROM app_data d WHERE d.athlete_id = o.id)
    ORDER BY o.created_at LIMIT 1) AS other_athlete,
  (SELECT co_coach_id FROM x) AS co_coach,
  (SELECT athlete_id FROM x) AS co_athlete,
  (SELECT id FROM profiles WHERE is_admin ORDER BY created_at LIMIT 1) AS admin,
  -- deux « pros » sans lien avec l'athlète : un lien actif (logs en lecture), un lien révoqué
  (SELECT s.id FROM profiles s WHERE s.id <> a.id AND s.id <> a.coach_id AND NOT s.is_admin
      AND s.id IS DISTINCT FROM (SELECT co_coach_id FROM x)
      AND s.id IS DISTINCT FROM (SELECT o.id FROM profiles o WHERE o.role = 'athlete' AND o.id <> a.id
            AND o.coach_id IS DISTINCT FROM a.coach_id
            AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches c WHERE c.athlete_id = o.id AND c.co_coach_id = a.coach_id)
            AND EXISTS (SELECT 1 FROM app_data d WHERE d.athlete_id = o.id)
          ORDER BY o.created_at LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM athlete_staff l WHERE l.athlete_id = a.id AND l.staff_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM athlete_staff l WHERE l.staff_id = s.id AND l.status = 'active')
      AND NOT EXISTS (SELECT 1 FROM profiles k WHERE k.coach_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches k WHERE k.co_coach_id = s.id)
      AND s.role = 'athlete'
    ORDER BY s.created_at LIMIT 1) AS staff,
  (SELECT s.id FROM profiles s WHERE s.id <> a.id AND s.id <> a.coach_id AND NOT s.is_admin
      AND s.id IS DISTINCT FROM (SELECT co_coach_id FROM x)
      AND s.id IS DISTINCT FROM (SELECT o.id FROM profiles o WHERE o.role = 'athlete' AND o.id <> a.id
            AND o.coach_id IS DISTINCT FROM a.coach_id
            AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches c WHERE c.athlete_id = o.id AND c.co_coach_id = a.coach_id)
            AND EXISTS (SELECT 1 FROM app_data d WHERE d.athlete_id = o.id)
          ORDER BY o.created_at LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM athlete_staff l WHERE l.athlete_id = a.id AND l.staff_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM athlete_staff l WHERE l.staff_id = s.id AND l.status = 'active')
      AND NOT EXISTS (SELECT 1 FROM profiles k WHERE k.coach_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches k WHERE k.co_coach_id = s.id)
      AND s.role = 'athlete'
    ORDER BY s.created_at OFFSET 1 LIMIT 1) AS staff_revoked,
  '00000000-0000-4000-8000-00000000abcd'::uuid AS nobody
FROM a;
GRANT SELECT ON ids TO authenticated, anon;
INSERT INTO t_res(label, ok) SELECT 'setup : tous les rôles trouvés',
  athlete IS NOT NULL AND coach IS NOT NULL AND other_athlete IS NOT NULL AND co_coach IS NOT NULL
  AND co_athlete IS NOT NULL AND admin IS NOT NULL AND staff IS NOT NULL AND staff_revoked IS NOT NULL
  AND staff <> staff_revoked AND staff <> other_athlete AND staff_revoked <> other_athlete FROM ids;

-- Liens staff créés comme le ferait la RPC, et accord staff_sharing de l'athlète.
SELECT set_config('agon.staff_accept', 'on', true);
INSERT INTO athlete_staff(athlete_id, staff_id, profession, permissions, added_by, added_by_role)
SELECT athlete, staff, 'autre', '{"logs":"read","medical":"none","wellness":"none","seances":"none","nutrition":"none","tests":"none","fiches":"none","planification":"none","commentaires":"none"}'::jsonb, coach, 'coach' FROM ids;
INSERT INTO athlete_staff(athlete_id, staff_id, profession, permissions, added_by, added_by_role)
SELECT athlete, staff_revoked, 'autre', '{"logs":"read"}'::jsonb, coach, 'coach' FROM ids;
SELECT set_config('agon.staff_accept', 'off', true);
-- Le trigger crée tout lien actif : la révocation passe par un UPDATE du coach, comme dans l'app.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role', 'authenticated')::text FROM ids), true);
UPDATE athlete_staff SET status = 'revoked'
 WHERE athlete_id = (SELECT athlete FROM ids) AND staff_id = (SELECT staff_revoked FROM ids);
INSERT INTO t_res(label, ok) SELECT 'setup : lien révoqué bien révoqué', (SELECT status FROM athlete_staff l, ids i
  WHERE l.athlete_id = i.athlete AND l.staff_id = i.staff_revoked) = 'revoked';
INSERT INTO user_consents(user_id, purpose, granted, doc_version, statement)
SELECT athlete, 'staff_sharing', true, 'test', 'TEST RLS — annulé' FROM ids;

-- Valeurs attendues (postgres, sans RLS)
CREATE TEMP TABLE exp ON COMMIT DROP AS SELECT
  (SELECT count(*) FROM app_data WHERE athlete_id = i.athlete) AS app_a,
  (SELECT count(*) FROM app_data WHERE athlete_id = i.athlete AND staff_app_data_domain(key) = 'logs') AS app_a_logs,
  (SELECT count(*) FROM workout_logs WHERE athlete_id = i.athlete) AS wl_a,
  (SELECT count(*) FROM medical_entries WHERE athlete_id = i.athlete) AS med_a,
  (SELECT count(*) FROM app_data WHERE athlete_id = i.co_athlete) AS app_x,
  (SELECT count(*) FROM workout_logs WHERE athlete_id = i.co_athlete) AS wl_x,
  (SELECT count(*) FROM profiles WHERE coach_id = i.coach) AS athletes_c,
  (SELECT count(*) FROM profiles) AS profiles_all,
  (SELECT count(*) FROM health_sync_errors) AS hse_all
FROM ids i;
GRANT SELECT ON exp TO authenticated, anon;

-- ── Lectures, rôle par rôle ───────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;

-- Athlète
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO t_res(label, ok) SELECT 'athlète : toutes ses clés app_data', (SELECT count(*) FROM app_data WHERE athlete_id = (SELECT athlete FROM ids)) = (SELECT app_a FROM exp) AND (SELECT app_a FROM exp) > 0;
INSERT INTO t_res(label, ok) SELECT 'athlète : toutes ses séances', (SELECT count(*) FROM workout_logs WHERE athlete_id = (SELECT athlete FROM ids)) = (SELECT wl_a FROM exp);
INSERT INTO t_res(label, ok) SELECT 'athlète : rien d''un autre athlète', (SELECT count(*) FROM app_data WHERE athlete_id = (SELECT other_athlete FROM ids)) = 0;
INSERT INTO t_res(label, ok) SELECT 'athlète : son profil', (SELECT count(*) FROM profiles WHERE id = (SELECT athlete FROM ids)) = 1;
INSERT INTO t_res(label, ok) SELECT 'athlète : le profil de son coach', (SELECT count(*) FROM profiles WHERE id = (SELECT coach FROM ids)) = 1;
INSERT INTO t_res(label, ok) SELECT 'athlète : pas le profil d''un autre athlète', (SELECT count(*) FROM profiles WHERE id = (SELECT other_athlete FROM ids)) = 0;

-- Coach référent
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO t_res(label, ok) SELECT 'coach : app_data de son athlète', (SELECT count(*) FROM app_data WHERE athlete_id = (SELECT athlete FROM ids)) = (SELECT app_a FROM exp);
INSERT INTO t_res(label, ok) SELECT 'coach : séances de son athlète', (SELECT count(*) FROM workout_logs WHERE athlete_id = (SELECT athlete FROM ids)) = (SELECT wl_a FROM exp);
INSERT INTO t_res(label, ok) SELECT 'coach : suivi médical de son athlète', (SELECT count(*) FROM medical_entries WHERE athlete_id = (SELECT athlete FROM ids)) = (SELECT med_a FROM exp);
INSERT INTO t_res(label, ok) SELECT 'coach : profils de tous ses athlètes', (SELECT count(*) FROM profiles WHERE coach_id = (SELECT coach FROM ids)) = (SELECT athletes_c FROM exp);
INSERT INTO t_res(label, ok) SELECT 'coach : rien de l''athlète d''un autre coach', (SELECT count(*) FROM app_data WHERE athlete_id = (SELECT other_athlete FROM ids)) = 0;

-- Co-coach
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', co_coach, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO t_res(label, ok) SELECT 'co-coach : app_data de l''athlète co-coaché', (SELECT count(*) FROM app_data WHERE athlete_id = (SELECT co_athlete FROM ids)) = (SELECT app_x FROM exp);
INSERT INTO t_res(label, ok) SELECT 'co-coach : séances de l''athlète co-coaché', (SELECT count(*) FROM workout_logs WHERE athlete_id = (SELECT co_athlete FROM ids)) = (SELECT wl_x FROM exp);
INSERT INTO t_res(label, ok) SELECT 'co-coach : profil de l''athlète co-coaché', (SELECT count(*) FROM profiles WHERE id = (SELECT co_athlete FROM ids)) = 1;
INSERT INTO t_res(label, ok) SELECT 'co-coach : rien d''un athlète qu''il ne suit pas', (SELECT count(*) FROM app_data WHERE athlete_id = (SELECT athlete FROM ids)) = 0;

-- Staff avec droit logs (lecture), sans droit medical
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', staff, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO t_res(label, ok) SELECT 'staff (logs: read) : séances de l''athlète', (SELECT count(*) FROM workout_logs WHERE athlete_id = (SELECT athlete FROM ids)) = (SELECT wl_a FROM exp);
INSERT INTO t_res(label, ok) SELECT 'staff (logs: read) : seulement les clés app_data du domaine logs', (SELECT count(*) FROM app_data WHERE athlete_id = (SELECT athlete FROM ids)) = (SELECT app_a_logs FROM exp);
INSERT INTO t_res(label, ok) SELECT 'staff (medical: none) : aucun suivi médical', (SELECT count(*) FROM medical_entries WHERE athlete_id = (SELECT athlete FROM ids)) = 0;
INSERT INTO t_res(label, ok) SELECT 'staff : rien d''un athlète non suivi', (SELECT count(*) FROM workout_logs WHERE athlete_id = (SELECT other_athlete FROM ids)) = 0;

-- Staff au lien révoqué
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', staff_revoked, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO t_res(label, ok) SELECT 'staff révoqué : aucune séance', (SELECT count(*) FROM workout_logs WHERE athlete_id = (SELECT athlete FROM ids)) = 0;
INSERT INTO t_res(label, ok) SELECT 'staff révoqué : aucune clé app_data', (SELECT count(*) FROM app_data WHERE athlete_id = (SELECT athlete FROM ids)) = 0;

-- Admin
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', admin, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO t_res(label, ok) SELECT 'admin : tous les profils', (SELECT count(*) FROM profiles) = (SELECT profiles_all FROM exp);
INSERT INTO t_res(label, ok) SELECT 'admin : toutes les erreurs de synchro santé', (SELECT count(*) FROM health_sync_errors) = (SELECT hse_all FROM exp);

-- Utilisateur sans lien (uuid sans compte)
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', nobody, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO t_res(label, ok) SELECT 'sans lien : aucune clé app_data', (SELECT count(*) FROM app_data) = 0;
INSERT INTO t_res(label, ok) SELECT 'sans lien : aucune séance', (SELECT count(*) FROM workout_logs) = 0;
INSERT INTO t_res(label, ok) SELECT 'sans lien : aucun profil', (SELECT count(*) FROM profiles) = 0;
INSERT INTO t_res(label, ok) SELECT 'sans lien : aucun suivi médical', (SELECT count(*) FROM medical_entries) = 0;
INSERT INTO t_res(label, ok) SELECT 'sans lien : aucune erreur de synchro', (SELECT count(*) FROM health_sync_errors) = 0;

-- Anon
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
INSERT INTO t_res(label, ok) SELECT 'anon : aucune clé app_data', (SELECT count(*) FROM app_data) = 0;
INSERT INTO t_res(label, ok) SELECT 'anon : aucun profil', (SELECT count(*) FROM profiles) = 0;
INSERT INTO t_res(label, ok) SELECT 'anon : aucune séance', (SELECT count(*) FROM workout_logs) = 0;
RESET ROLE;

-- ── Écritures ─────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role', 'authenticated')::text FROM ids), true);
DO $$ BEGIN
  INSERT INTO app_data(athlete_id, key, value) SELECT athlete, 'asp:test_rls_perf', '{}'::jsonb FROM ids;
  INSERT INTO t_res(label, ok) VALUES ('athlète : écrit son app_data', true);
EXCEPTION WHEN OTHERS THEN INSERT INTO t_res(label, ok) VALUES ('athlète : écrit son app_data', false); END $$;
DO $$ BEGIN
  INSERT INTO app_data(athlete_id, key, value) SELECT other_athlete, 'asp:test_rls_perf', '{}'::jsonb FROM ids;
  INSERT INTO t_res(label, ok) VALUES ('athlète : écrit l''app_data d''un autre (refus attendu)', false);
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res(label, ok) VALUES ('athlète : écrit l''app_data d''un autre (refus attendu)', true);
  WHEN OTHERS THEN INSERT INTO t_res(label, ok) VALUES ('athlète : écrit l''app_data d''un autre (refus attendu) — autre erreur', false); END $$;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role', 'authenticated')::text FROM ids), true);
DO $$ DECLARE n int; BEGIN
  UPDATE app_data SET value = value WHERE athlete_id = (SELECT athlete FROM ids) AND key = 'asp:test_rls_perf';
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO t_res(label, ok) VALUES ('coach : modifie l''app_data de son athlète', n = 1);
EXCEPTION WHEN OTHERS THEN INSERT INTO t_res(label, ok) VALUES ('coach : modifie l''app_data de son athlète', false); END $$;
DO $$ DECLARE n int; BEGIN
  UPDATE app_data SET value = value WHERE athlete_id = (SELECT other_athlete FROM ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO t_res(label, ok) VALUES ('coach : ne modifie rien chez un autre coach', n = 0);
EXCEPTION WHEN OTHERS THEN INSERT INTO t_res(label, ok) VALUES ('coach : ne modifie rien chez un autre coach', true); END $$;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', co_coach, 'role', 'authenticated')::text FROM ids), true);
DO $$ DECLARE n int; BEGIN
  UPDATE app_data SET value = value WHERE athlete_id = (SELECT co_athlete FROM ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO t_res(label, ok) VALUES ('co-coach : modifie l''app_data de l''athlète co-coaché', n = (SELECT app_x FROM exp));
EXCEPTION WHEN OTHERS THEN INSERT INTO t_res(label, ok) VALUES ('co-coach : modifie l''app_data de l''athlète co-coaché', false); END $$;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', staff, 'role', 'authenticated')::text FROM ids), true);
DO $$ DECLARE n int; BEGIN
  UPDATE app_data SET value = value WHERE athlete_id = (SELECT athlete FROM ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO t_res(label, ok) VALUES ('staff : ne modifie pas l''app_data (lecture seule)', n = 0);
EXCEPTION WHEN OTHERS THEN INSERT INTO t_res(label, ok) VALUES ('staff : ne modifie pas l''app_data (lecture seule)', true); END $$;
DO $$ BEGIN
  INSERT INTO medical_entries(athlete_id, title, date, created_by)
  SELECT athlete, 'TEST RLS', current_date, staff FROM ids;
  INSERT INTO t_res(label, ok) VALUES ('staff (medical: none) : écrit le suivi médical (refus attendu)', false);
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res(label, ok) VALUES ('staff (medical: none) : écrit le suivi médical (refus attendu)', true);
  WHEN OTHERS THEN INSERT INTO t_res(label, ok) VALUES ('staff (medical: none) : écrit le suivi médical (refus attendu) — autre erreur', false); END $$;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', nobody, 'role', 'authenticated')::text FROM ids), true);
DO $$ BEGIN
  INSERT INTO workout_logs(athlete_id, session_id, session_name, scheduled_date, status)
  SELECT athlete, 'test-rls-perf', 'TEST RLS', current_date, 'planned' FROM ids;
  INSERT INTO t_res(label, ok) VALUES ('sans lien : crée une séance (refus attendu)', false);
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res(label, ok) VALUES ('sans lien : crée une séance (refus attendu)', true);
  WHEN OTHERS THEN INSERT INTO t_res(label, ok) VALUES ('sans lien : crée une séance (refus attendu) — autre erreur', false); END $$;
RESET ROLE;

SELECT label, ok FROM t_res ORDER BY n;
ROLLBACK;
