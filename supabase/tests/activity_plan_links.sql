-- Tests de 20261112120000_activity_plan_links.sql (rapprochement planning).
-- Toujours annulé. Données fictives uniquement (jour 2031-03-04, sans rien en base).
--
-- Avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261112120000_activity_plan_links.sql; \
--    sed -e '/^BEGIN;$/d' supabase/tests/activity_plan_links.sql) > "$TMPDIR/pl.sql"
--   supabase db query --linked -f "$TMPDIR/pl.sql"
-- Après application : supabase db query --linked -f supabase/tests/activity_plan_links.sql

BEGIN;

CREATE TEMP TABLE t_res (n serial, name text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t_res TO anon, authenticated;
GRANT ALL ON SEQUENCE t_res_n_seq TO anon, authenticated;

CREATE TEMP TABLE t_ids ON COMMIT DROP AS
SELECT
  (SELECT a.id FROM profiles a
    WHERE a.role = 'athlete' AND a.coach_id IS NOT NULL AND a.coach_id <> a.id
      AND NOT coalesce(a.is_pending, false)
    ORDER BY a.id LIMIT 1) AS athlete,
  NULL::uuid AS coach, NULL::uuid AS other_coach,
  NULL::uuid AS run_plan, NULL::uuid AS bike_plan, NULL::uuid AS other_plan, NULL::uuid AS muscu,
  NULL::uuid AS run_act, NULL::uuid AS run_copy, NULL::uuid AS bike_act, NULL::uuid AS gym_act;
UPDATE t_ids SET coach = (SELECT coach_id FROM profiles WHERE id = t_ids.athlete);
UPDATE t_ids SET other_coach = (SELECT c.id FROM profiles c
    WHERE c.role IN ('coach', 'coach_athlete') AND c.id <> t_ids.coach
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = t_ids.athlete AND cc.co_coach_id = c.id)
    ORDER BY c.id LIMIT 1);
GRANT SELECT, UPDATE ON t_ids TO anon, authenticated;

-- Séances prévues : footing 10 km, vélo 60 min, « autre » 30 min, muscu.
CREATE TEMP TABLE t_sess ON COMMIT DROP AS SELECT NULL::uuid AS footing, NULL::uuid AS velo, NULL::uuid AS autre;
WITH s AS (INSERT INTO energy_sessions (name, session_kind, format, structure_type, intervals, total_distance_m, created_by)
           SELECT 'test footing', 'footing', 'wod', 'continu', '[]'::jsonb, 10000, coach FROM t_ids RETURNING id)
UPDATE t_sess SET footing = (SELECT id FROM s);
WITH s AS (INSERT INTO energy_sessions (name, session_kind, format, structure_type, intervals, total_duration_s, created_by)
           SELECT 'test autre', 'autre', 'wod', 'continu', '[]'::jsonb, 1800, coach FROM t_ids RETURNING id)
UPDATE t_sess SET autre = (SELECT id FROM s);

WITH a AS (INSERT INTO energy_session_assignments (athlete_id, energy_session_id, scheduled_date, status)
           SELECT athlete, (SELECT footing FROM t_sess), '2031-03-04', 'planned' FROM t_ids RETURNING id)
UPDATE t_ids SET run_plan = (SELECT id FROM a);
WITH a AS (INSERT INTO energy_session_assignments (athlete_id, energy_session_id, scheduled_date, status, activity_type, actual_duration_min)
           SELECT athlete, (SELECT autre FROM t_sess), '2031-03-04', 'completed', 'velo', 60 FROM t_ids RETURNING id)
UPDATE t_ids SET bike_plan = (SELECT id FROM a);
WITH a AS (INSERT INTO energy_session_assignments (athlete_id, energy_session_id, scheduled_date, status)
           SELECT athlete, (SELECT autre FROM t_sess), '2031-03-04', 'planned' FROM t_ids RETURNING id)
UPDATE t_ids SET other_plan = (SELECT id FROM a);
WITH w AS (INSERT INTO workout_logs (athlete_id, session_id, session_name, scheduled_date, status)
           SELECT athlete, gen_random_uuid()::text, 'test muscu', '2031-03-04', 'planned' FROM t_ids RETURNING id)
UPDATE t_ids SET muscu = (SELECT id FROM w);

-- Activités : course 9,8 km (Garmin) + même sortie importée en fichier, vélo 58 min, renfo.
WITH a AS (INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, distance_m, duration_s)
           SELECT athlete, 'garmin', 'test-pl-run', '2031-03-04T07:00:00Z', '2031-03-04', 'running', 9800, 3000 FROM t_ids RETURNING id)
UPDATE t_ids SET run_act = (SELECT id FROM a);
WITH a AS (INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, distance_m, duration_s)
           SELECT athlete, 'file_import', 'test-pl-run-copy', '2031-03-04T07:01:00Z', '2031-03-04', 'running', 9790, 3001 FROM t_ids RETURNING id)
UPDATE t_ids SET run_copy = (SELECT id FROM a);
WITH a AS (INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, distance_m, duration_s)
           SELECT athlete, 'garmin', 'test-pl-bike', '2031-03-04T17:00:00Z', '2031-03-04', 'cycling', 30000, 3480 FROM t_ids RETURNING id)
UPDATE t_ids SET bike_act = (SELECT id FROM a);
WITH a AS (INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, duration_s)
           SELECT athlete, 'file_import', 'test-pl-gym', '2031-03-04T12:00:00Z', '2031-03-04', 'training', 2700 FROM t_ids RETURNING id)
UPDATE t_ids SET gym_act = (SELECT id FROM a);

INSERT INTO t_res (name, ok, detail)
SELECT 'fixtures', athlete IS NOT NULL AND other_coach IS NOT NULL AND run_plan IS NOT NULL AND gym_act IS NOT NULL, '' FROM t_ids;

INSERT INTO t_res (name, ok, detail)
SELECT 'auto : course → footing (copie importée écartée), vélo → vélo, renfo → muscu, « autre » libre',
       count(*) = 3
       AND bool_and(status = 'auto')
       AND count(*) FILTER (WHERE l.activity_id = i.run_act AND l.planned_id = i.run_plan) = 1
       AND count(*) FILTER (WHERE l.activity_id = i.bike_act AND l.planned_id = i.bike_plan) = 1
       AND count(*) FILTER (WHERE l.activity_id = i.gym_act AND l.planned_id = i.muscu) = 1,
       string_agg(l.planned_kind || ':' || l.status, ',')
  FROM activity_plan_links l JOIN t_ids i ON l.athlete_id = i.athlete AND l.local_date = '2031-03-04';

-- ---------- Autre coach : ne voit rien, ne décide rien ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', other_coach, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
INSERT INTO t_res (name, ok, detail)
SELECT 'rls : autre coach ne lit pas les liens', count(*) = 0, count(*)::text
  FROM activity_plan_links WHERE athlete_id = (SELECT athlete FROM t_ids);
DO $$ BEGIN
  PERFORM public.link_activity_to_plan((SELECT bike_act FROM t_ids), 'energy', (SELECT other_plan FROM t_ids));
  INSERT INTO t_res (name, ok, detail) VALUES ('rpc : autre coach refusé', false, 'accepté');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('rpc : autre coach refusé', true, SQLERRM);
END $$;
RESET ROLE;

-- ---------- L'athlète confirme la course, refuse le renfo ----------
CREATE TEMP TABLE t_links ON COMMIT DROP AS
  SELECT l.id, l.activity_id FROM activity_plan_links l JOIN t_ids i ON l.athlete_id = i.athlete AND l.local_date = '2031-03-04';
GRANT SELECT ON t_links TO authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
SELECT public.decide_plan_link((SELECT l.id FROM t_links l, t_ids i WHERE l.activity_id = i.run_act), true);
SELECT public.decide_plan_link((SELECT l.id FROM t_links l, t_ids i WHERE l.activity_id = i.gym_act), false);
INSERT INTO t_res (name, ok, detail)
SELECT 'athlète lit ses liens', count(*) = 3, count(*)::text
  FROM activity_plan_links WHERE athlete_id = (SELECT athlete FROM t_ids);
DO $$ BEGIN
  UPDATE activity_plan_links SET status = 'confirmed' WHERE athlete_id = auth.uid();
  INSERT INTO t_res (name, ok, detail) VALUES ('écriture directe refusée', false, 'acceptée');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('écriture directe refusée', true, SQLERRM);
END $$;
RESET ROLE;

INSERT INTO t_res (name, ok, detail)
SELECT 'confirmé / refusé enregistrés, renfo non reproposé',
       (SELECT status FROM activity_plan_links l, t_ids i WHERE l.activity_id = i.run_act AND l.status <> 'rejected') = 'confirmed'
       AND (SELECT count(*) FROM activity_plan_links l, t_ids i WHERE l.activity_id = i.gym_act) = 1
       AND (SELECT status FROM activity_plan_links l, t_ids i WHERE l.activity_id = i.gym_act) = 'rejected'
       AND (SELECT confirmed_by FROM activity_plan_links l, t_ids i WHERE l.activity_id = i.run_act) = (SELECT athlete FROM t_ids),
       '';

-- Nouvelle activité ce jour : recalcul, la course confirmée ne bouge pas.
INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, distance_m, duration_s)
SELECT athlete, 'garmin', 'test-pl-run2', '2031-03-04T19:00:00Z', '2031-03-04', 'running', 10000, 3100 FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT 'confirmé gardé quand une autre sortie arrive (pas de seconde séance course)',
       (SELECT count(*) FROM activity_plan_links l, t_ids i WHERE l.planned_id = i.run_plan AND l.status <> 'rejected') = 1
       AND (SELECT activity_id FROM activity_plan_links l, t_ids i WHERE l.planned_id = i.run_plan AND l.status <> 'rejected')
           = (SELECT run_act FROM t_ids), '';

-- ---------- Le coach rattache le renfo à la séance « autre » à la main ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
SELECT public.link_activity_to_plan(gym_act, 'energy', other_plan) FROM t_ids;
DO $$ BEGIN
  PERFORM public.link_activity_to_plan((SELECT bike_act FROM t_ids), 'energy', (SELECT run_plan FROM t_ids));
  INSERT INTO t_res (name, ok, detail) VALUES ('séance déjà confirmée ailleurs : refus', false, 'accepté');
EXCEPTION WHEN unique_violation THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('séance déjà confirmée ailleurs : refus', true, SQLERRM);
END $$;
RESET ROLE;
INSERT INTO t_res (name, ok, detail)
SELECT 'lien manuel du coach confirmé', status = 'confirmed' AND confirmed_by = (SELECT coach FROM t_ids), status
  FROM activity_plan_links l, t_ids i WHERE l.activity_id = i.gym_act AND l.planned_id = i.other_plan;

SELECT set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
INSERT INTO t_res (name, ok, detail)
SELECT 'linked_planned_ids : la séance course liée est protégée, pas la muscu (refusée)',
       array_agg(x) = ARRAY[(SELECT run_plan FROM t_ids)], array_agg(x)::text
  FROM public.linked_planned_ids('energy', ARRAY[(SELECT run_plan FROM t_ids), (SELECT bike_plan FROM t_ids)]) x
 WHERE x = (SELECT run_plan FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT 'linked_planned_ids : muscu au lien refusé non protégée', count(*) = 0, count(*)::text
  FROM public.linked_planned_ids('workout', ARRAY[(SELECT muscu FROM t_ids)]);
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', other_coach, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
INSERT INTO t_res (name, ok, detail)
SELECT 'linked_planned_ids : rien pour un autre coach', count(*) = 0, count(*)::text
  FROM public.linked_planned_ids('energy', ARRAY[(SELECT run_plan FROM t_ids)]);
RESET ROLE;

-- Séance prévue déplacée : le lien auto du vélo disparaît, le confirmé reste.
UPDATE energy_session_assignments SET scheduled_date = '2031-03-05' WHERE id = (SELECT bike_plan FROM t_ids);
UPDATE energy_session_assignments SET scheduled_date = '2031-03-05' WHERE id = (SELECT run_plan FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT 'séance déplacée : auto retiré, confirmé gardé',
       NOT EXISTS (SELECT 1 FROM activity_plan_links l, t_ids i WHERE l.planned_id = i.bike_plan)
       AND EXISTS (SELECT 1 FROM activity_plan_links l, t_ids i WHERE l.planned_id = i.run_plan AND l.status = 'confirmed'), '';

-- Séance supprimée : ses liens partent.
DELETE FROM energy_session_assignments WHERE id = (SELECT other_plan FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT 'séance supprimée : liens retirés', NOT EXISTS (SELECT 1 FROM activity_plan_links l, t_ids i WHERE l.planned_id = i.other_plan), '';

-- Familles.
INSERT INTO t_res (name, ok, detail)
SELECT 'familles de sport',
       public.activity_sport_family('TRAIL_RUNNING') = 'run' AND public.activity_sport_family('indoor_cycling') = 'bike'
       AND public.activity_sport_family('indoor_rowing') = 'row' AND public.activity_sport_family('training') = 'strength'
       AND public.activity_sport_family(NULL) IS NULL AND public.plan_family_accepts('hyrox', 'run')
       AND NOT public.plan_family_accepts('run', 'bike') AND NOT public.plan_family_accepts(NULL, 'run'), '';

SELECT n, ok, name, detail FROM t_res ORDER BY ok, n;

ROLLBACK;
