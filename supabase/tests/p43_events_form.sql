-- Tests de 20261113130000_p43_events_form.sql. Toujours annulé, données fictives.
-- Avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261113130000_p43_events_form.sql; \
--    sed -e '/^BEGIN;$/d' supabase/tests/p43_events_form.sql) > "$TMPDIR/p43ev.sql"
--   supabase db query --linked -f "$TMPDIR/p43ev.sql"
BEGIN;

CREATE TEMP TABLE t_res (n serial, name text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t_res TO anon, authenticated;
GRANT ALL ON SEQUENCE t_res_n_seq TO anon, authenticated;

CREATE TEMP TABLE t_ids ON COMMIT DROP AS
SELECT a.id AS athlete, a.coach_id AS coach,
  (SELECT c.id FROM profiles c
    WHERE c.role IN ('coach', 'coach_athlete') AND c.id <> a.coach_id
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = a.id AND cc.co_coach_id = c.id)
      AND NOT coalesce(c.is_admin, false)
    ORDER BY c.created_at LIMIT 1) AS other_coach
FROM profiles a WHERE a.full_name = 'Léa Démo' AND a.coach_id IS NOT NULL LIMIT 1;
GRANT SELECT ON t_ids TO anon, authenticated;

INSERT INTO t_res (name, ok, detail) SELECT '00 jeu de test', athlete IS NOT NULL AND other_coach IS NOT NULL, NULL FROM t_ids;

INSERT INTO t_res (name, ok, detail)
SELECT '01 anciens événements : autre, indisponible', count(*) = count(*) FILTER (WHERE kind = 'autre' AND unavailable), count(*)::text
  FROM athlete_life_events;

SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;

INSERT INTO athlete_life_events (athlete_id, date_start, date_end, title, kind, location, unavailable)
SELECT athlete, '2001-02-18', '2001-02-20', 'Week-end test', 'voyage', 'Lyon', true FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT '02 athlète : voyage enregistré', count(*) = 1, count(*)::text
  FROM athlete_life_events e JOIN t_ids ON e.athlete_id = t_ids.athlete
 WHERE e.title = 'Week-end test' AND e.kind = 'voyage' AND e.location = 'Lyon';

DO $$ BEGIN
  INSERT INTO athlete_life_events (athlete_id, date_start, date_end, title, kind) SELECT athlete, '2001-02-18', '2001-02-18', 'x', 'fete' FROM t_ids;
  INSERT INTO t_res (name, ok, detail) VALUES ('03 type inconnu refusé', false, 'ACCEPTÉ');
EXCEPTION WHEN check_violation THEN INSERT INTO t_res (name, ok, detail) VALUES ('03 type inconnu refusé', true, SQLERRM); END $$;

DO $$ BEGIN
  INSERT INTO athlete_life_events (athlete_id, date_start, date_end, title) SELECT athlete, '2001-02-18', '2001-02-17', 'x' FROM t_ids;
  INSERT INTO t_res (name, ok, detail) VALUES ('04 fin avant début refusée', false, 'ACCEPTÉ');
EXCEPTION WHEN check_violation THEN INSERT INTO t_res (name, ok, detail) VALUES ('04 fin avant début refusée', true, SQLERRM); END $$;

INSERT INTO competitions (coach_id, athlete_id, name, type, date, date_end, location, priority)
SELECT coach, athlete, '10 km test', 'competition', '2001-02-22', '2001-02-23', 'Boulogne', 'B' FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT '05 athlète : compétition sur 2 jours', count(*) = 1, count(*)::text
  FROM competitions c JOIN t_ids ON c.athlete_id = t_ids.athlete WHERE c.name = '10 km test' AND c.date_end = '2001-02-23';

DO $$ BEGIN
  INSERT INTO competitions (coach_id, athlete_id, name, type, date, date_end, priority)
  SELECT coach, athlete, 'x', 'competition', '2001-02-22', '2001-02-21', 'B' FROM t_ids;
  INSERT INTO t_res (name, ok, detail) VALUES ('06 compétition : fin avant début refusée', false, 'ACCEPTÉ');
EXCEPTION WHEN check_violation THEN INSERT INTO t_res (name, ok, detail) VALUES ('06 compétition : fin avant début refusée', true, SQLERRM); END $$;

SELECT set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true) FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT '07 coach lit type, lieu, indisponible', count(*) = 1, count(*)::text
  FROM athlete_life_events e JOIN t_ids ON e.athlete_id = t_ids.athlete
 WHERE e.title = 'Week-end test' AND e.unavailable AND e.kind = 'voyage';

SELECT set_config('request.jwt.claims', json_build_object('sub', other_coach, 'role', 'authenticated')::text, true) FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT '08 autre coach ne lit rien', count(*) = 0, count(*)::text
  FROM athlete_life_events e JOIN t_ids ON e.athlete_id = t_ids.athlete WHERE e.title = 'Week-end test';

RESET ROLE;
SELECT name, ok, detail FROM t_res ORDER BY n;
ROLLBACK;
