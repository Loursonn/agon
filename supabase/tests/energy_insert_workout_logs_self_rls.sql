-- Tests : es_insert (energy_sessions) et workout_logs_self sans DELETE
-- (migration 20261114090000_rls_energy_insert_workout_logs_self).
-- Toujours annulé (ROLLBACK final) : rien ne reste en base.
--   supabase db query --linked -f supabase/tests/energy_insert_workout_logs_self_rls.sql
-- Chaque ligne k → v : la valeur attendue est dans le libellé.

BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated, anon; GRANT ALL ON SEQUENCE r_n_seq TO authenticated, anon;

-- Un athlète suivi (x) et son référent (c) ; un autre athlète (y) ;
-- deux coachs tiers : o (étranger) et k (rendu co-coach de x dans la transaction).
CREATE TEMP TABLE ids ON COMMIT DROP AS
WITH x AS (
  SELECT p.id, p.coach_id FROM profiles p
  WHERE p.role = 'athlete' AND p.coach_id IS NOT NULL AND p.coach_id <> p.id
  ORDER BY p.created_at LIMIT 1
), others AS (
  SELECT p.id, row_number() OVER (ORDER BY p.created_at) AS rk FROM profiles p, x
  WHERE p.role IN ('coach','coach_athlete') AND p.id <> x.coach_id AND p.id <> x.id
)
SELECT x.id AS x, x.coach_id AS c,
  (SELECT p.id FROM profiles p, x x2 WHERE p.role = 'athlete' AND p.id <> x2.id ORDER BY p.created_at LIMIT 1) AS y,
  (SELECT id FROM others WHERE rk = 1) AS o,
  (SELECT id FROM others WHERE rk = 2) AS k,
  gen_random_uuid() AS w
FROM x;
GRANT SELECT ON ids TO authenticated;

DELETE FROM athlete_co_coaches WHERE athlete_id = (SELECT x FROM ids);
INSERT INTO athlete_co_coaches (athlete_id, co_coach_id, added_by, added_by_role)
SELECT x, k, c, 'coach' FROM ids;
-- Une séance prévue de x, pour les tests de suppression
INSERT INTO workout_logs (id, athlete_id, coach_id, session_id, session_name, scheduled_date, status)
SELECT w, x, c, 'rls-test-' || w, 'Test RLS', DATE '2099-01-01', 'planned' FROM ids;
INSERT INTO r(k,v) SELECT '00 jeu de test (true)',
  (x IS NOT NULL AND c IS NOT NULL AND y IS NOT NULL AND o IS NOT NULL AND k IS NOT NULL)::text FROM ids;

SET LOCAL ROLE authenticated;

-- Insère une séance énergie pour `p_athlete` (NULL = bibliothèque) ; renvoie « permis » / « refusé ».
CREATE FUNCTION pg_temp.es_try(p_athlete uuid, p_created_by uuid, p_verified boolean DEFAULT false, p_omit_created_by boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF p_omit_created_by THEN
    INSERT INTO energy_sessions (name, session_kind, structure_type, athlete_id, is_verified)
    VALUES ('Test RLS', 'footing', 'continu', p_athlete, p_verified);
  ELSE
    INSERT INTO energy_sessions (name, session_kind, structure_type, athlete_id, created_by, is_verified)
    VALUES ('Test RLS', 'footing', 'continu', p_athlete, p_created_by, p_verified);
  END IF;
  RETURN 'permis';
EXCEPTION WHEN insufficient_privilege THEN RETURN 'refusé';
END $$;

-- ── Coach référent ──
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', c, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'A1 référent : bibliothèque (permis)', pg_temp.es_try(NULL, c) FROM ids;
INSERT INTO r(k,v) SELECT 'A2 référent : bibliothèque sans created_by, défaut auth.uid() (permis)', pg_temp.es_try(NULL, NULL, false, true) FROM ids;
INSERT INTO r(k,v) SELECT 'A3 référent : séance de son athlète (permis)', pg_temp.es_try(x, c) FROM ids;
INSERT INTO r(k,v) SELECT 'A4 référent : bibliothèque au nom d''un autre coach (refusé)', pg_temp.es_try(NULL, o) FROM ids;
INSERT INTO r(k,v) SELECT 'A5 référent : séance déjà certifiée (refusé)', pg_temp.es_try(NULL, c, true) FROM ids;
INSERT INTO r(k,v) SELECT 'A6 référent : séance de son athlète au nom d''un tiers (refusé)', pg_temp.es_try(x, o) FROM ids;

-- ── Co-coach ──
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', k, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'B1 co-coach : séance de l''athlète co-coaché (permis)', pg_temp.es_try(x, k) FROM ids;
WITH d AS (DELETE FROM workout_logs WHERE id = (SELECT w FROM ids) RETURNING 1)
INSERT INTO r(k,v) SELECT 'B2 co-coach : supprime une séance prévue de l''athlète (1)', count(*)::text FROM d;
RESET ROLE;
INSERT INTO workout_logs (id, athlete_id, coach_id, session_id, session_name, scheduled_date, status)
SELECT w, x, c, 'rls-test-' || w, 'Test RLS', DATE '2099-01-01', 'planned' FROM ids;
SET LOCAL ROLE authenticated;

-- ── Coach étranger ──
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', o, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'C1 coach étranger : séance de l''athlète (refusé)', pg_temp.es_try(x, o) FROM ids;
INSERT INTO r(k,v) SELECT 'C2 coach étranger : sa bibliothèque (permis)', pg_temp.es_try(NULL, o) FROM ids;
WITH d AS (DELETE FROM workout_logs WHERE id = (SELECT w FROM ids) RETURNING 1)
INSERT INTO r(k,v) SELECT 'C3 coach étranger : supprime une séance de l''athlète (0)', count(*)::text FROM d;

-- ── Athlète ──
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', x, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'D1 athlète : sa propre séance (permis)', pg_temp.es_try(x, x) FROM ids;
INSERT INTO r(k,v) SELECT 'D2 athlète : séance d''un autre athlète (refusé)', pg_temp.es_try(y, x) FROM ids;
INSERT INTO r(k,v) SELECT 'D3 athlète : lit sa séance prévue (1)', count(*)::text FROM workout_logs WHERE id = (SELECT w FROM ids);
WITH u AS (UPDATE workout_logs SET notes = 'rls' WHERE id = (SELECT w FROM ids) RETURNING 1)
INSERT INTO r(k,v) SELECT 'D4 athlète : modifie sa séance (1)', count(*)::text FROM u;
DO $$ BEGIN
  INSERT INTO workout_logs (athlete_id, session_id, session_name, scheduled_date)
  SELECT x, 'rls-test-self-' || w, 'Test RLS', DATE '2099-01-02' FROM ids;
  INSERT INTO r(k,v) VALUES ('D5 athlète : crée une séance pour lui (permis)', 'permis');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO r(k,v) VALUES ('D5 athlète : crée une séance pour lui (permis)', 'refusé');
END $$;
DO $$ BEGIN
  INSERT INTO workout_logs (athlete_id, session_id, session_name, scheduled_date)
  SELECT y, 'rls-test-other-' || w, 'Test RLS', DATE '2099-01-03' FROM ids;
  INSERT INTO r(k,v) VALUES ('D6 athlète : crée une séance pour un autre (refusé)', 'permis');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO r(k,v) VALUES ('D6 athlète : crée une séance pour un autre (refusé)', 'refusé');
END $$;
WITH d AS (DELETE FROM workout_logs WHERE id = (SELECT w FROM ids) RETURNING 1)
INSERT INTO r(k,v) SELECT 'D7 athlète : supprime sa séance (0)', count(*)::text FROM d;

-- ── anon ──
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
DO $$ BEGIN
  INSERT INTO energy_sessions (name, session_kind, structure_type) VALUES ('Test RLS', 'footing', 'continu');
  INSERT INTO r(k,v) VALUES ('E1 anon : crée une séance énergie (refusé)', 'permis');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO r(k,v) VALUES ('E1 anon : crée une séance énergie (refusé)', 'refusé');
END $$;

RESET ROLE;
SELECT k, v FROM r ORDER BY n;
ROLLBACK;
