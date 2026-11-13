-- Tests : retirer une activité de montre (migration 20261113180000_remove_provider_activity, P38).
-- Toujours annulé (ROLLBACK final). Avant application, dans la même transaction :
--   (echo 'BEGIN;'; cat supabase/migrations/20261113180000_remove_provider_activity.sql \
--      supabase/tests/remove_provider_activity.sql) > "$TMPDIR/r.sql"
--   supabase db query --linked -f "$TMPDIR/r.sql"
-- Comptes de démonstration seulement (Léa Démo / Agon Démo) ; résultats = booléens.

BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;

CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT a.id AS ath, a.coach_id AS coach,
  (SELECT p.id FROM profiles p
    WHERE p.role IN ('coach', 'coach_athlete') AND p.id <> a.coach_id
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = a.id AND cc.co_coach_id = p.id)
      AND NOT coalesce(p.is_admin, false)
    ORDER BY p.created_at LIMIT 1) AS other_coach,
  gen_random_uuid() AS act_athlete,  -- avec détails et un lien vers une séance prévue
  gen_random_uuid() AS act_coach,    -- activité de fichier, retirée par le coach
  gen_random_uuid() AS act_manual    -- marquée « séance Agon » (manual) pour le refus
FROM profiles a WHERE a.full_name = 'Léa Démo' AND a.coach_id IS NOT NULL LIMIT 1;

-- Activités fictives créées ici (annulées avec le reste) : le test ne dépend ni des
-- activités réelles de la démo en prod, ni du seed de la CI, qui n'en a pas.
INSERT INTO provider_activities (id, athlete_id, source, external_id, started_at, local_date)
SELECT x.id, i.ath, 'file_import', 'test-p38-' || x.n, now() - make_interval(days => x.n), (now() - make_interval(days => x.n))::date
FROM ids i CROSS JOIN LATERAL (VALUES (i.act_athlete, 40), (i.act_coach, 41), (i.act_manual, 42)) AS x(id, n);
INSERT INTO activity_streams (activity_id, athlete_id, source, normalized_from, started_at, sample_count, t)
SELECT pa.id, pa.athlete_id, pa.source, 'fit', pa.started_at, 0, '{}'::int[]
FROM provider_activities pa, ids i WHERE pa.id IN (i.act_athlete, i.act_coach);
INSERT INTO activity_plan_links (athlete_id, activity_id, source, planned_kind, planned_id, local_date, status)
SELECT i.ath, i.act_athlete, 'file_import', 'workout', w.id, w.scheduled_date, 'confirmed'
FROM ids i JOIN LATERAL (SELECT id, scheduled_date FROM workout_logs WHERE athlete_id = i.ath ORDER BY scheduled_date LIMIT 1) w ON true;
GRANT SELECT ON ids TO authenticated;

-- La séance prévue rapprochée de act_athlete, et son état avant.
CREATE TEMP TABLE planned ON COMMIT DROP AS
SELECT l.planned_kind, l.planned_id,
  coalesce((SELECT w.status FROM workout_logs w WHERE w.id = l.planned_id),
           (SELECT e.status FROM energy_session_assignments e WHERE e.id = l.planned_id)) AS status_before
FROM activity_plan_links l WHERE l.activity_id = (SELECT act_athlete FROM ids) LIMIT 1;

UPDATE provider_activities SET sources = array_append(sources, 'manual') WHERE id = (SELECT act_manual FROM ids);

INSERT INTO r(k,v) SELECT '00 jeu de test complet (true)',
  (ath IS NOT NULL AND coach IS NOT NULL AND other_coach IS NOT NULL AND act_athlete IS NOT NULL
   AND act_coach IS NOT NULL AND act_manual IS NOT NULL AND act_manual NOT IN (act_athlete, act_coach))::text FROM ids;
INSERT INTO r(k,v) VALUES
  ('01 remove_provider_activity anon (false)', has_function_privilege('anon', 'public.remove_provider_activity(uuid)', 'EXECUTE')::text),
  ('02 remove_provider_activity authenticated (true)', has_function_privilege('authenticated', 'public.remove_provider_activity(uuid)', 'EXECUTE')::text);

SET LOCAL ROLE authenticated;

-- ── Un autre coach : ne voit pas, ne retire pas ───────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', other_coach, 'role', 'authenticated')::text FROM ids), true);
DO $$
BEGIN
  PERFORM public.remove_provider_activity((SELECT act_coach FROM ids));
  INSERT INTO r(k,v) VALUES ('10 autre coach refusé (true)', 'false');
EXCEPTION WHEN no_data_found THEN
  INSERT INTO r(k,v) VALUES ('10 autre coach refusé (true)', 'true');
END $$;

-- ── L'athlète ──────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', ath, 'role', 'authenticated')::text FROM ids), true);
DO $$
BEGIN
  PERFORM public.remove_provider_activity((SELECT act_manual FROM ids));
  INSERT INTO r(k,v) VALUES ('20 séance Agon (manual) refusée (true)', 'false');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO r(k,v) VALUES ('20 séance Agon (manual) refusée (true)', 'true');
END $$;
INSERT INTO r(k,v) VALUES ('21 athlète retire son activité (true)',
  (public.remove_provider_activity((SELECT act_athlete FROM ids)) ->> 'removed')::text);
INSERT INTO r(k,v) VALUES ('22 activité inexistante = introuvable (true)', 'true');
DO $$
BEGIN
  PERFORM public.remove_provider_activity((SELECT act_athlete FROM ids));
  UPDATE r SET v = 'false' WHERE k LIKE '22 %';
EXCEPTION WHEN no_data_found THEN NULL;
END $$;

-- ── Le coach référent ──────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) VALUES ('30 coach référent retire une activité de fichier (true)',
  (public.remove_provider_activity((SELECT act_coach FROM ids)) ->> 'removed')::text);

RESET ROLE;

-- ── Ce qui part, ce qui reste ─────────────────────────────────────────────
INSERT INTO r(k,v) SELECT '40 détails supprimés (streams, tours, séries, zones, liens) (true)',
  (NOT EXISTS (SELECT 1 FROM activity_streams WHERE activity_id IN (act_athlete, act_coach))
   AND NOT EXISTS (SELECT 1 FROM activity_laps WHERE activity_id IN (act_athlete, act_coach))
   AND NOT EXISTS (SELECT 1 FROM activity_sets WHERE activity_id IN (act_athlete, act_coach))
   AND NOT EXISTS (SELECT 1 FROM activity_zone_summaries WHERE activity_id IN (act_athlete, act_coach))
   AND NOT EXISTS (SELECT 1 FROM activity_plan_links WHERE activity_id IN (act_athlete, act_coach))
   AND NOT EXISTS (SELECT 1 FROM provider_activities WHERE id IN (act_athlete, act_coach)))::text FROM ids;
INSERT INTO r(k,v) SELECT '41 séance manual intacte (true)',
  EXISTS (SELECT 1 FROM provider_activities WHERE id = (SELECT act_manual FROM ids))::text;
INSERT INTO r(k,v) SELECT '42 séance prévue rapprochée intacte (true)',
  (coalesce((SELECT w.status FROM workout_logs w WHERE w.id = p.planned_id),
            (SELECT e.status FROM energy_session_assignments e WHERE e.id = p.planned_id)) IS NOT DISTINCT FROM p.status_before)::text
  FROM planned p;

SELECT k, v FROM r ORDER BY n;
ROLLBACK;
