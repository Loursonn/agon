-- Tests de l'âge minimum à l'inscription (20261109160000 = phase 1, 20261109170000 = phase 2).
-- Toujours annulé (ROLLBACK final) : rien ne reste en base. Les comptes de test
-- (auth.users + profiles) sont créés DANS la transaction, avec des uuid neufs
-- et des emails @example.invalid ; aucune donnée réelle n'est lue ni affichée.
--
-- Phase 1 seule, avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261109160000_min_age_signup.sql; \
--    sed '/^BEGIN;$/d' supabase/tests/min_age_signup.sql) > "$TMPDIR/a.sql"
--   supabase db query --linked -f "$TMPDIR/a.sql"
-- Phase 1 + 2, avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261109160000_min_age_signup.sql \
--    supabase/migrations/20261109170000_min_age_signup_required.sql; \
--    sed '/^BEGIN;$/d' supabase/tests/min_age_signup.sql) > "$TMPDIR/b.sql"
--   supabase db query --linked -f "$TMPDIR/b.sql"
-- Après application : supabase db query --linked -f supabase/tests/min_age_signup.sql
-- La phase est détectée (texte de la fonction) ; chaque ligne doit avoir ok = true.

BEGIN;
CREATE TEMP TABLE r(n serial, phase int, k text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated, anon; GRANT ALL ON SEQUENCE r_n_seq TO authenticated, anon;

CREATE TEMP TABLE t ON COMMIT DROP AS
SELECT
  CASE WHEN (SELECT prosrc FROM pg_proc WHERE proname = 'enforce_min_age_on_signup'
               AND pronamespace = 'public'::regnamespace) LIKE '%PHASE 2%' THEN 2 ELSE 1 END AS phase,
  ((now() AT TIME ZONE 'UTC') + interval '14 hours')::date AS today,
  gen_random_uuid() AS u_ok, gen_random_uuid() AS u_young, gen_random_uuid() AS u_null,
  gen_random_uuid() AS u_future, gen_random_uuid() AS u_exact, gen_random_uuid() AS u_pending,
  gen_random_uuid() AS u_pending2, gen_random_uuid() AS u_service,
  (SELECT id FROM profiles WHERE NOT coalesce(is_pending, false) ORDER BY created_at LIMIT 1) AS existing;
GRANT SELECT ON t TO authenticated, anon;

-- Comptes d'authentification de test (comme après auth.signUp).
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
SELECT u, 'authenticated', 'authenticated', u::text || '@example.invalid', now(), now()
FROM t, unnest(ARRAY[u_ok, u_young, u_null, u_future, u_exact, u_pending, u_pending2, u_service]) AS u;

-- ---------- Règle pure (dates fixes) ----------
INSERT INTO r(phase, k, ok, detail)
SELECT t.phase, x.k, public.signup_birth_date_error(x.b, x.d) IS NOT DISTINCT FROM x.want,
       coalesce(public.signup_birth_date_error(x.b, x.d), 'null')
FROM t, (VALUES
  ('R1 15 ans le jour même : accepté',          date '2011-11-08', date '2026-11-08', NULL),
  ('R2 15 ans demain : refusé',                 date '2011-11-09', date '2026-11-08', 'Tu dois avoir au moins 15 ans pour utiliser Agon.'),
  ('R3 29 février, 28/02 non bissextile : refusé', date '2012-02-29', date '2027-02-28', 'Tu dois avoir au moins 15 ans pour utiliser Agon.'),
  ('R4 29 février, 1er mars : accepté',         date '2012-02-29', date '2027-03-01', NULL),
  ('R5 date future : invalide',                 date '2030-01-01', date '2026-11-08', 'Date de naissance invalide.'),
  ('R6 avant 1900 : invalide',                  date '1899-12-31', date '2026-11-08', 'Date de naissance invalide.'),
  ('R7 date absente : null (décidé par le trigger)', NULL::date,   date '2026-11-08', NULL),
  ('R8 adulte : accepté',                       date '1990-05-20', date '2026-11-08', NULL)
) AS x(k, b, d, want);

-- ---------- Inscription par l'utilisateur lui-même (rôle authenticated) ----------
CREATE OR REPLACE FUNCTION pg_temp.as_user(p uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

SELECT pg_temp.as_user(u_ok) FROM t;
SET LOCAL ROLE authenticated;
DO $$ DECLARE i record; BEGIN
  SELECT * INTO i FROM t;
  BEGIN INSERT INTO profiles (id, role, full_name, birth_date) VALUES (i.u_ok, 'athlete', 'Test Adulte', date '1995-03-10');
        INSERT INTO r(phase,k,ok,detail) VALUES (i.phase, 'S1 athlète adulte : inscription acceptée', true, 'insérée');
  EXCEPTION WHEN OTHERS THEN INSERT INTO r(phase,k,ok,detail) VALUES (i.phase, 'S1 athlète adulte : inscription acceptée', false, SQLERRM); END;
END $$;
RESET ROLE;

SELECT pg_temp.as_user(u_young) FROM t;
SET LOCAL ROLE authenticated;
DO $$ DECLARE i record; BEGIN
  SELECT * INTO i FROM t;
  BEGIN INSERT INTO profiles (id, role, full_name, birth_date)
          VALUES (i.u_young, 'athlete', 'Test Jeune', (i.today - interval '15 years' + interval '1 day')::date);
        INSERT INTO r(phase,k,ok,detail) VALUES (i.phase, 'S2 moins de 15 ans (d''un jour) : refusé', false, 'insérée');
  EXCEPTION WHEN OTHERS THEN INSERT INTO r(phase,k,ok,detail)
          VALUES (i.phase, 'S2 moins de 15 ans (d''un jour) : refusé', SQLERRM = 'Tu dois avoir au moins 15 ans pour utiliser Agon.', SQLSTATE || ' ' || SQLERRM); END;
END $$;
RESET ROLE;

SELECT pg_temp.as_user(u_exact) FROM t;
SET LOCAL ROLE authenticated;
DO $$ DECLARE i record; BEGIN
  SELECT * INTO i FROM t;
  BEGIN INSERT INTO profiles (id, role, full_name, birth_date)
          VALUES (i.u_exact, 'coach', 'Test Pile', (i.today - interval '15 years')::date);
        INSERT INTO r(phase,k,ok,detail) VALUES (i.phase, 'S3 coach qui a 15 ans aujourd''hui : accepté', true, 'insérée');
  EXCEPTION WHEN OTHERS THEN INSERT INTO r(phase,k,ok,detail) VALUES (i.phase, 'S3 coach qui a 15 ans aujourd''hui : accepté', false, SQLERRM); END;
END $$;
RESET ROLE;

SELECT pg_temp.as_user(u_future) FROM t;
SET LOCAL ROLE authenticated;
DO $$ DECLARE i record; BEGIN
  SELECT * INTO i FROM t;
  BEGIN INSERT INTO profiles (id, role, full_name, birth_date) VALUES (i.u_future, 'staff', 'Test Futur', i.today + 30);
        INSERT INTO r(phase,k,ok,detail) VALUES (i.phase, 'S4 date future : refusée', false, 'insérée');
  EXCEPTION WHEN OTHERS THEN INSERT INTO r(phase,k,ok,detail)
          VALUES (i.phase, 'S4 date future : refusée', SQLERRM = 'Date de naissance invalide.', SQLERRM); END;
END $$;
RESET ROLE;

-- Date absente : acceptée en phase 1 (client `main`), refusée en phase 2.
SELECT pg_temp.as_user(u_null) FROM t;
SET LOCAL ROLE authenticated;
DO $$ DECLARE i record; BEGIN
  SELECT * INTO i FROM t;
  BEGIN INSERT INTO profiles (id, role, full_name) VALUES (i.u_null, 'athlete', 'Test Sans Date');
        INSERT INTO r(phase,k,ok,detail) VALUES (i.phase, 'S5 date absente : phase 1 acceptée / phase 2 refusée', i.phase = 1, 'insérée');
  EXCEPTION WHEN OTHERS THEN INSERT INTO r(phase,k,ok,detail)
          VALUES (i.phase, 'S5 date absente : phase 1 acceptée / phase 2 refusée', i.phase = 2 AND SQLERRM = 'Indique ta date de naissance.', SQLERRM); END;
END $$;
RESET ROLE;

-- ---------- Côté serveur (service_role : pending-athlete, claim-athlete, seed) ----------
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$ DECLARE i record; n int; BEGIN
  SELECT * INTO i FROM t;
  -- Athlète pré-créé par le coach : sans date, accepté dans les deux phases.
  BEGIN INSERT INTO profiles (id, role, full_name, is_pending) VALUES (i.u_pending, 'athlete', 'Test Pré-créé', true);
        INSERT INTO profiles (id, role, full_name, is_pending) VALUES (i.u_pending2, 'athlete', 'Test Pré-créé 2', true);
        INSERT INTO r(phase,k,ok,detail) VALUES (i.phase, 'P1 athlète pré-créé sans date : accepté', true, 'insérés');
  EXCEPTION WHEN OTHERS THEN INSERT INTO r(phase,k,ok,detail) VALUES (i.phase, 'P1 athlète pré-créé sans date : accepté', false, SQLERRM); END;
  -- Profil serveur sans date (seed) : accepté dans les deux phases.
  BEGIN INSERT INTO profiles (id, role, full_name) VALUES (i.u_service, 'coach', 'Test Seed');
        INSERT INTO r(phase,k,ok,detail) VALUES (i.phase, 'P2 profil créé côté serveur sans date : accepté', true, 'inséré');
  EXCEPTION WHEN OTHERS THEN INSERT INTO r(phase,k,ok,detail) VALUES (i.phase, 'P2 profil créé côté serveur sans date : accepté', false, SQLERRM); END;
  -- Activation avec une date < 15 ans : refusée.
  BEGIN UPDATE profiles SET is_pending = false, birth_date = (i.today - interval '14 years')::date WHERE id = i.u_pending;
        INSERT INTO r(phase,k,ok,detail) VALUES (i.phase, 'C1 activation à 14 ans : refusée', false, 'activé');
  EXCEPTION WHEN OTHERS THEN INSERT INTO r(phase,k,ok,detail)
          VALUES (i.phase, 'C1 activation à 14 ans : refusée', SQLERRM = 'Tu dois avoir au moins 15 ans pour utiliser Agon.', SQLERRM); END;
  -- Activation avec une date adulte : acceptée.
  BEGIN UPDATE profiles SET is_pending = false, birth_date = date '2000-01-01' WHERE id = i.u_pending;
        GET DIAGNOSTICS n = ROW_COUNT;
        INSERT INTO r(phase,k,ok,detail) VALUES (i.phase, 'C2 activation adulte : acceptée', n = 1, n::text);
  EXCEPTION WHEN OTHERS THEN INSERT INTO r(phase,k,ok,detail) VALUES (i.phase, 'C2 activation adulte : acceptée', false, SQLERRM); END;
  -- Activation sans date (ancienne Edge Function) : phase 1 acceptée, phase 2 refusée.
  BEGIN UPDATE profiles SET is_pending = false WHERE id = i.u_pending2;
        INSERT INTO r(phase,k,ok,detail) VALUES (i.phase, 'C3 activation sans date : phase 1 acceptée / phase 2 refusée', i.phase = 1, 'activé');
  EXCEPTION WHEN OTHERS THEN INSERT INTO r(phase,k,ok,detail)
          VALUES (i.phase, 'C3 activation sans date : phase 1 acceptée / phase 2 refusée', i.phase = 2 AND SQLERRM = 'Indique ta date de naissance.', SQLERRM); END;
END $$;

-- ---------- Comptes existants : jamais contrôlés ----------
DO $$ DECLARE i record; n int; BEGIN
  SELECT * INTO i FROM t;
  -- Même une date < 15 ans posée sur un compte existant passe (annulé aussitôt).
  BEGIN UPDATE profiles SET birth_date = (i.today - interval '10 years')::date WHERE id = i.existing;
        GET DIAGNOSTICS n = ROW_COUNT; RAISE EXCEPTION 'undo:%', n;
  EXCEPTION WHEN OTHERS THEN INSERT INTO r(phase,k,ok,detail)
          VALUES (i.phase, 'E1 compte existant : mise à jour de la date non contrôlée', SQLERRM = 'undo:1', SQLERRM); END;
  BEGIN UPDATE profiles SET is_pending = false WHERE id = i.existing;
        GET DIAGNOSTICS n = ROW_COUNT; RAISE EXCEPTION 'undo:%', n;
  EXCEPTION WHEN OTHERS THEN INSERT INTO r(phase,k,ok,detail)
          VALUES (i.phase, 'E2 compte existant : is_pending déjà faux, non contrôlé', SQLERRM = 'undo:1', SQLERRM); END;
END $$;

-- Utilisateur qui se met lui-même en attente pour contourner : l'activation reste contrôlée.
SELECT pg_temp.as_user(u_exact) FROM t;
SET LOCAL ROLE authenticated;
DO $$ DECLARE i record; BEGIN
  SELECT * INTO i FROM t;
  BEGIN UPDATE profiles SET is_pending = true WHERE id = i.u_exact;
        UPDATE profiles SET is_pending = false, birth_date = (i.today - interval '12 years')::date WHERE id = i.u_exact;
        INSERT INTO r(phase,k,ok,detail) VALUES (i.phase, 'B1 contournement par is_pending : refusé', false, 'activé');
  EXCEPTION WHEN OTHERS THEN INSERT INTO r(phase,k,ok,detail)
          VALUES (i.phase, 'B1 contournement par is_pending : refusé', SQLERRM IN ('Tu dois avoir au moins 15 ans pour utiliser Agon.', 'Modification non autorisée') OR SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM); END;
END $$;
RESET ROLE;

INSERT INTO r(phase,k,ok,detail)
SELECT t.phase, 'Z1 trigger posé sur profiles (INSERT + UPDATE OF is_pending)', count(*) = 1, count(*)::text
FROM t, pg_trigger g WHERE g.tgrelid = 'public.profiles'::regclass AND g.tgname = 'trg_enforce_min_age_on_signup'
GROUP BY t.phase;

SELECT phase, k, ok, detail FROM r ORDER BY n;
ROLLBACK;
