-- Tests de 20261113180000_weekly_reviews.sql : qui lit une weekly review, qui l'écrit.
-- Toujours annulé. Comptes fictifs créés dans la transaction (@example.invalid).
--   athlète a (coach c, co-coach cc), autre coach o, staff s (wellness en lecture, accord donné),
--   staff s2 (séances seulement).
-- Lancer : supabase db query --linked -f supabase/tests/weekly_reviews_rls.sql
-- (avant application : préfixer du contenu de la migration, comme hr_zone_bounds_fallback.sql)

BEGIN;

SELECT set_config('request.jwt.claims', '', true);
CREATE TEMP TABLE t_res (n serial, name text, ok boolean, detail text) ON COMMIT DROP;
CREATE TEMP TABLE t_ids ON COMMIT DROP AS
SELECT gen_random_uuid() AS a, gen_random_uuid() AS c, gen_random_uuid() AS cc, gen_random_uuid() AS o,
       gen_random_uuid() AS s, gen_random_uuid() AS s2,
       -- Semaine ouverte aujourd'hui (dimanche ou lundi, heure de Paris), sinon NULL.
       CASE extract(isodow FROM (now() AT TIME ZONE 'Europe/Paris')::date)
         WHEN 7 THEN (now() AT TIME ZONE 'Europe/Paris')::date - 6
         WHEN 1 THEN (now() AT TIME ZONE 'Europe/Paris')::date - 7
       END AS open_week;
GRANT ALL ON t_ids, t_res TO authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE t_res_n_seq TO authenticated, anon;

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u || '@example.invalid', '', '{}', '{}', now(), now()
  FROM t_ids, unnest(ARRAY[a, c, cc, o, s, s2]) u;
INSERT INTO profiles (id, role, full_name, birth_date)
SELECT a, 'athlete', 'Test review', '2000-01-01'::date FROM t_ids
UNION ALL SELECT u, 'coach', 'Coach test', '1990-01-01'::date FROM t_ids, unnest(ARRAY[c, cc, o]) u
UNION ALL SELECT u, 'staff', 'Staff test', '1990-01-01'::date FROM t_ids, unnest(ARRAY[s, s2]) u;
UPDATE profiles SET coach_id = (SELECT c FROM t_ids) WHERE id = (SELECT a FROM t_ids);
INSERT INTO athlete_co_coaches (athlete_id, co_coach_id, added_by, added_by_role) SELECT a, cc, c, 'coach' FROM t_ids;
SELECT set_config('agon.staff_accept', 'on', true);
INSERT INTO athlete_staff (athlete_id, staff_id, profession, permissions, added_by, added_by_role)
SELECT a, s, 'kine', '{"wellness":"read"}'::jsonb, c, 'coach' FROM t_ids
UNION ALL SELECT a, s2, 'kine', '{"seances":"read"}'::jsonb, c, 'coach' FROM t_ids;
SELECT set_config('agon.staff_accept', 'off', true);
INSERT INTO user_consents (user_id, purpose, granted, doc_version, statement)
SELECT a, 'staff_sharing', true, 'test', 'Consentement fictif (test)' FROM t_ids;

-- Deux reviews posées en direct : un brouillon (semaine A) et une review envoyée (semaine B).
INSERT INTO weekly_reviews (athlete_id, week_start, status, answers)
SELECT a, '2026-01-05'::date, 'draft', '{"feel":{"note":3}}'::jsonb FROM t_ids;
INSERT INTO weekly_reviews (athlete_id, week_start, status, answers, auto, light, submitted_at)
SELECT a, '2026-01-12'::date, 'submitted', '{"feel":{"note":4},"pain":{"zone":"genou","level":5}}'::jsonb, '{"sessions":{"done":3,"planned":4}}'::jsonb, 'orange', now()
  FROM t_ids;

CREATE TEMP TABLE t_seen ON COMMIT DROP AS SELECT ''::text AS who, 0 AS drafts, 0 AS sent;
GRANT ALL ON t_seen TO authenticated, anon;
CREATE OR REPLACE FUNCTION pg_temp.seen(p_who text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_seen SELECT p_who,
    (SELECT count(*) FROM weekly_reviews WHERE athlete_id = (SELECT a FROM t_ids) AND status = 'draft'),
    (SELECT count(*) FROM weekly_reviews WHERE athlete_id = (SELECT a FROM t_ids) AND status = 'submitted');
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true) FROM t_ids;
SELECT pg_temp.seen('athlete');
SELECT set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true) FROM t_ids;
SELECT pg_temp.seen('coach');
SELECT set_config('request.jwt.claims', json_build_object('sub', cc, 'role', 'authenticated')::text, true) FROM t_ids;
SELECT pg_temp.seen('cocoach');
SELECT set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true) FROM t_ids;
SELECT pg_temp.seen('other');
SELECT set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true) FROM t_ids;
SELECT pg_temp.seen('staff');
SELECT set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true) FROM t_ids;
SELECT pg_temp.seen('staff2');

-- Écritures directes refusées, même par l'athlète.
SELECT set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true) FROM t_ids;
DO $$ BEGIN
  BEGIN
    UPDATE weekly_reviews SET answers = '{}' WHERE athlete_id = auth.uid();
    INSERT INTO t_res (name, ok, detail) VALUES ('E1 athlète : UPDATE direct refusé', false, 'exécuté');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_res (name, ok, detail) VALUES ('E1 athlète : UPDATE direct refusé', true, SQLERRM);
  END;
  BEGIN
    INSERT INTO weekly_reviews (athlete_id, week_start) VALUES (auth.uid(), '2026-02-02');
    INSERT INTO t_res (name, ok, detail) VALUES ('E2 athlète : INSERT direct refusé', false, 'exécuté');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t_res (name, ok, detail) VALUES ('E2 athlète : INSERT direct refusé', true, SQLERRM);
  END;
  BEGIN
    PERFORM save_weekly_review('2026-02-02', '{"feel":{"note":7}}');
    INSERT INTO t_res (name, ok, detail) VALUES ('E3 note hors 1-5 refusée', false, 'acceptée');
  EXCEPTION WHEN invalid_parameter_value THEN
    INSERT INTO t_res (name, ok, detail) VALUES ('E3 note hors 1-5 refusée', true, SQLERRM);
  END;
  BEGIN
    PERFORM save_weekly_review('2026-02-03', '{}');
    INSERT INTO t_res (name, ok, detail) VALUES ('E4 semaine qui ne commence pas un lundi refusée', false, 'acceptée');
  EXCEPTION WHEN invalid_parameter_value THEN
    INSERT INTO t_res (name, ok, detail) VALUES ('E4 semaine qui ne commence pas un lundi refusée', true, SQLERRM);
  END;
  BEGIN
    PERFORM save_weekly_review('2026-02-02', '{"feel":{"note":3}}');
    INSERT INTO t_res (name, ok, detail) VALUES ('E5 semaine fermée refusée', false, 'acceptée');
  EXCEPTION WHEN invalid_parameter_value THEN
    INSERT INTO t_res (name, ok, detail) VALUES ('E5 semaine fermée refusée', true, SQLERRM);
  END;
END $$;

-- Écriture par la RPC, seulement un dimanche ou un lundi (sinon le cas est noté « non testé »).
DO $$ DECLARE w date := (SELECT open_week FROM t_ids); r weekly_reviews; BEGIN
  IF w IS NULL THEN
    INSERT INTO t_res (name, ok, detail) VALUES ('R1 brouillon puis envoi (dimanche / lundi seulement)', true, 'non testé aujourd''hui');
    RETURN;
  END IF;
  r := save_weekly_review(w, '{"feel":{"note":4,"energie":3}}');
  r := save_weekly_review(w, '{"feel":{"note":5}}', true, '{"sessions":{"done":1,"planned":2}}', 'green');
  INSERT INTO t_res (name, ok, detail) VALUES ('R1 brouillon puis envoi (dimanche / lundi seulement)',
    r.status = 'submitted' AND r.answers->'feel'->>'note' = '5' AND r.light = 'green', r.status);
  BEGIN
    PERFORM save_weekly_review(w, '{}');
    INSERT INTO t_res (name, ok, detail) VALUES ('R2 plus de modification après l''envoi', false, 'acceptée');
  EXCEPTION WHEN invalid_parameter_value THEN
    INSERT INTO t_res (name, ok, detail) VALUES ('R2 plus de modification après l''envoi', true, SQLERRM);
  END;
END $$;

SELECT set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true) FROM t_ids;
DO $$ BEGIN
  PERFORM save_weekly_review('2026-02-02', '{}');
  INSERT INTO t_res (name, ok, detail) VALUES ('E6 coach : ne remplit pas la review à la place de l''athlète', false, 'acceptée');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('E6 coach : ne remplit pas la review à la place de l''athlète', true, SQLERRM);
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

INSERT INTO t_res (name, ok, detail)
SELECT 'L1 athlète : voit son brouillon et sa review envoyée', drafts = 1 AND sent = 1, drafts || '/' || sent FROM t_seen WHERE who = 'athlete'
UNION ALL SELECT 'L2 coach : review envoyée seulement, pas le brouillon', drafts = 0 AND sent = 1, drafts || '/' || sent FROM t_seen WHERE who = 'coach'
UNION ALL SELECT 'L3 co-coach : comme le référent', drafts = 0 AND sent = 1, drafts || '/' || sent FROM t_seen WHERE who = 'cocoach'
UNION ALL SELECT 'L4 autre coach : rien', drafts = 0 AND sent = 0, drafts || '/' || sent FROM t_seen WHERE who = 'other'
UNION ALL SELECT 'L5 staff « wellness » : review envoyée en lecture', drafts = 0 AND sent = 1, drafts || '/' || sent FROM t_seen WHERE who = 'staff'
UNION ALL SELECT 'L6 staff sans « wellness » : rien', drafts = 0 AND sent = 0, drafts || '/' || sent FROM t_seen WHERE who = 'staff2';

INSERT INTO t_res (name, ok, detail) VALUES
  ('O1 fenêtre : dimanche ouvert', weekly_review_open('2026-11-16', '2026-11-22'), ''),
  ('O2 fenêtre : lundi suivant ouvert', weekly_review_open('2026-11-16', '2026-11-23'), ''),
  ('O3 fenêtre : samedi fermé', NOT weekly_review_open('2026-11-16', '2026-11-21'), ''),
  ('O4 fenêtre : mardi suivant fermé', NOT weekly_review_open('2026-11-16', '2026-11-24'), ''),
  ('Z1 droits : anon sans SELECT ni EXECUTE',
     NOT has_table_privilege('anon', 'public.weekly_reviews', 'SELECT')
     AND NOT has_function_privilege('anon', 'public.save_weekly_review(date, jsonb, boolean, jsonb, text)', 'EXECUTE'), ''),
  ('Z2 suppression du compte : cascade depuis profiles',
     EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.weekly_reviews'::regclass AND contype = 'f'
              AND confrelid = 'public.profiles'::regclass AND confdeltype = 'c'), '');

SELECT n, ok, name, detail FROM t_res ORDER BY ok, n;

ROLLBACK;
