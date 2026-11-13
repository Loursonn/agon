-- Tests RLS : isolation entre coachs
-- Lance avec : supabase test db (Supabase CLI)
-- Ou via psql : psql <connection_string> -f supabase/tests/rls_coach_isolation.sql
--
-- Nécessite pgTAP : CREATE EXTENSION IF NOT EXISTS pgtap;
-- 2026-04-27

BEGIN;

SELECT plan(13);

-- ── Setup : deux coachs, deux athlètes ──────────────────────────────────────

-- Coach A
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'coach_a@test.com')
ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, role, full_name, coach_code) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'coach', 'Coach A', 'COACH_A')
ON CONFLICT DO NOTHING;

-- Coach B
INSERT INTO auth.users (id, email) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000002', 'coach_b@test.com')
ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, role, full_name, coach_code) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000002', 'coach', 'Coach B', 'COACH_B')
ON CONFLICT DO NOTHING;

-- Athlète de Coach A
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-1111-0000-0000-000000000003', 'athlete_a@test.com')
ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, role, full_name, coach_id) VALUES
  ('aaaaaaaa-1111-0000-0000-000000000003', 'athlete', 'Athlete A', 'aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Athlète de Coach B
INSERT INTO auth.users (id, email) VALUES
  ('bbbbbbbb-1111-0000-0000-000000000004', 'athlete_b@test.com')
ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, role, full_name, coach_id) VALUES
  ('bbbbbbbb-1111-0000-0000-000000000004', 'athlete', 'Athlete B', 'bbbbbbbb-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

-- Données de l'athlète A dans app_data
INSERT INTO public.app_data (athlete_id, key, value) VALUES
  ('aaaaaaaa-1111-0000-0000-000000000003', 'asp:wellness', '{"score": 75}')
ON CONFLICT DO NOTHING;

-- Compétition de l'athlète A
INSERT INTO public.competitions (id, coach_id, athlete_id, name, date) VALUES
  ('aaaaaaaa-cccc-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-1111-0000-0000-000000000003', 'Compétition A', CURRENT_DATE + 10)
ON CONFLICT DO NOTHING;

-- Habitude de l'athlète A
INSERT INTO public.habits (id, athlete_id, name, emoji, color) VALUES
  ('aaaaaaaa-ab00-0000-0000-000000000006', 'aaaaaaaa-1111-0000-0000-000000000003', 'Sport', '🏋️', '#7B6FFF')
ON CONFLICT DO NOTHING;

-- ── Test 1 : Coach A voit l'app_data de son athlète ──────────────────────────
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}';

SELECT ok(
  (SELECT COUNT(*) FROM public.app_data WHERE athlete_id = 'aaaaaaaa-1111-0000-0000-000000000003') = 1,
  'Coach A peut lire app_data de son athlète'
);

-- ── Test 2 : Coach B ne voit PAS l'app_data de l'athlète de Coach A ──────────
SET LOCAL request.jwt.claims TO '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "role": "authenticated"}';

SELECT ok(
  (SELECT COUNT(*) FROM public.app_data WHERE athlete_id = 'aaaaaaaa-1111-0000-0000-000000000003') = 0,
  'Coach B ne peut pas lire app_data des athlètes de Coach A'
);

-- ── Test 3 : Coach A voit ses compétitions, pas celles de Coach B ────────────
SET LOCAL request.jwt.claims TO '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}';

SELECT ok(
  (SELECT COUNT(*) FROM public.competitions WHERE coach_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1,
  'Coach A voit sa compétition'
);

SET LOCAL request.jwt.claims TO '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "role": "authenticated"}';

SELECT ok(
  (SELECT COUNT(*) FROM public.competitions WHERE athlete_id = 'aaaaaaaa-1111-0000-0000-000000000003') = 0,
  'Coach B ne voit pas les compétitions des athlètes de Coach A'
);

-- ── Test 4 : Coach B ne voit PAS les habitudes de l'athlète de Coach A ───────
SELECT ok(
  (SELECT COUNT(*) FROM public.habits WHERE athlete_id = 'aaaaaaaa-1111-0000-0000-000000000003') = 0,
  'Coach B ne peut pas lire les habitudes des athlètes de Coach A'
);

-- ── Test 5 : Coach A voit les habitudes de son athlète ───────────────────────
SET LOCAL request.jwt.claims TO '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}';

SELECT ok(
  (SELECT COUNT(*) FROM public.habits WHERE athlete_id = 'aaaaaaaa-1111-0000-0000-000000000003') = 1,
  'Coach A voit les habitudes de son athlète'
);

-- ── Test 6 : Athlète A voit son propre profil ─────────────────────────────────
SET LOCAL request.jwt.claims TO '{"sub": "aaaaaaaa-1111-0000-0000-000000000003", "role": "authenticated"}';

SELECT ok(
  (SELECT COUNT(*) FROM public.profiles WHERE id = 'aaaaaaaa-1111-0000-0000-000000000003') = 1,
  'Athlète A voit son propre profil'
);

-- ── Test 7 : Athlète A ne voit PAS le profil de l'athlète B ──────────────────
SELECT ok(
  (SELECT COUNT(*) FROM public.profiles WHERE id = 'bbbbbbbb-1111-0000-0000-000000000004') = 0,
  'Athlète A ne voit pas le profil de l''athlète B'
);

-- ── Test 8 : Athlète A voit ses propres app_data ─────────────────────────────
SELECT ok(
  (SELECT COUNT(*) FROM public.app_data WHERE athlete_id = 'aaaaaaaa-1111-0000-0000-000000000003') = 1,
  'Athlète A voit ses propres app_data'
);

-- ── Test 9 : Athlète A ne voit PAS l'app_data de l'athlète B ─────────────────
SELECT ok(
  (SELECT COUNT(*) FROM public.app_data WHERE athlete_id = 'bbbbbbbb-1111-0000-0000-000000000004') = 0,
  'Athlète A ne voit pas les app_data de l''athlète B'
);

-- ── Test 10 : is_coach_of() retourne true pour Coach A / Athlète A ────────────
SET LOCAL request.jwt.claims TO '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}';

SELECT ok(
  public.is_coach_of('aaaaaaaa-1111-0000-0000-000000000003') = true,
  'is_coach_of() retourne true pour Coach A et son athlète'
);

-- ── Test 11 : is_coach_of() retourne false pour Coach B / Athlète A ───────────
SET LOCAL request.jwt.claims TO '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "role": "authenticated"}';

SELECT ok(
  public.is_coach_of('aaaaaaaa-1111-0000-0000-000000000003') = false,
  'is_coach_of() retourne false pour Coach B et l''athlète de Coach A'
);

-- ── Test 12 : workout_logs — Coach B ne voit pas les logs de l'athlète A ──────
-- La ligne de test est créée en propriétaire (la RLS refuserait, à juste titre, Coach B).
RESET ROLE;
INSERT INTO public.workout_logs
  (athlete_id, session_id, session_name, scheduled_date, status)
VALUES
  ('aaaaaaaa-1111-0000-0000-000000000003', 'sess_1', 'Séance Push', CURRENT_DATE, 'planned')
ON CONFLICT DO NOTHING;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "role": "authenticated"}';

SELECT ok(
  (SELECT COUNT(*) FROM public.workout_logs WHERE athlete_id = 'aaaaaaaa-1111-0000-0000-000000000003') = 0,
  'Coach B ne voit pas les workout_logs des athlètes de Coach A'
);

SELECT * FROM finish();

ROLLBACK;
