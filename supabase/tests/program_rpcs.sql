-- Tests : RPC program_save_sessions (migration 20261109110000_program_rpcs).
-- Toujours annulé (ROLLBACK final) : rien ne reste en base. À lancer AVEC la
-- migration, dans la même transaction :
--   (echo 'BEGIN;'; cat supabase/migrations/20261109110000_program_rpcs.sql \
--      supabase/tests/program_rpcs.sql) > /tmp/t.sql
--   supabase db query --linked -f /tmp/t.sql
-- (ce fichier se termine par ROLLBACK ; son BEGIN ci-dessous est alors un simple
-- avertissement « transaction déjà ouverte »).
-- Chaque ligne k → v : la valeur attendue est dans le libellé. Aucun contenu
-- de programme n'est affiché : seulement des booléens et des comptes.

BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated, anon; GRANT ALL ON SEQUENCE r_n_seq TO authenticated, anon;

-- Un athlète qui a un programme d'au moins 2 séances et un coach référent ; un
-- autre coach qui n'est ni son référent ni son co-coach ; un coach sans
-- programme à lui (il se programme lui-même : la ligne est créée).
CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT a.id AS ath, a.coach_id AS coach,
  (SELECT p.id FROM profiles p
    WHERE p.role IN ('coach', 'coach_athlete') AND p.id <> a.id AND p.id <> a.coach_id
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = a.id AND cc.co_coach_id = p.id)
    ORDER BY p.created_at LIMIT 1) AS other_coach,
  (SELECT p.id FROM profiles p
    WHERE p.role IN ('coach', 'coach_athlete')
      AND NOT EXISTS (SELECT 1 FROM app_data x WHERE x.athlete_id = p.id AND x.key = 'asp:prog')
    ORDER BY p.created_at LIMIT 1) AS fresh,
  x.value AS before,
  x.updated_at AS before_at
FROM profiles a
JOIN app_data x ON x.athlete_id = a.id AND x.key = 'asp:prog'
WHERE a.role = 'athlete' AND a.coach_id IS NOT NULL AND a.coach_id <> a.id
  AND jsonb_typeof(x.value) = 'array' AND jsonb_array_length(x.value) >= 2
ORDER BY a.created_at LIMIT 1;
GRANT SELECT ON ids TO authenticated, anon;

-- s0 / s1 : les deux premières séances telles que lues ; s0e : s0 modifiée.
CREATE TEMP TABLE s ON COMMIT DROP AS
SELECT before -> 0 AS s0, before -> 1 AS s1,
       jsonb_set(before -> 0, '{name}', to_jsonb(coalesce(before -> 0 ->> 'name', '') || ' (test)')) AS s0e,
       jsonb_set(before -> 1, '{name}', to_jsonb(coalesce(before -> 1 ->> 'name', '') || ' (test)')) AS s1e,
       '{"id": "test-prog-new", "name": "Test", "short": "T", "recurrence": "weekly", "multi_semaine": false, "blocs": []}'::jsonb AS sn,
       jsonb_array_length(before) AS len
FROM ids;
GRANT SELECT ON s TO authenticated, anon;

CREATE TEMP VIEW cur AS
SELECT x.value AS v, x.updated_at AS at FROM app_data x, ids WHERE x.athlete_id = ids.ath AND x.key = 'asp:prog';
GRANT SELECT ON cur TO authenticated, anon;

INSERT INTO r(k,v) SELECT '00 jeu de test complet (true)',
  (ath IS NOT NULL AND coach IS NOT NULL AND other_coach IS NOT NULL AND fresh IS NOT NULL)::text FROM ids;
INSERT INTO r(k,v) VALUES
  ('01 droit anon (false)', has_function_privilege('anon', 'public.program_save_sessions(uuid,jsonb,jsonb,text[],text[])', 'EXECUTE')::text),
  ('02 droit authenticated (true)', has_function_privilege('authenticated', 'public.program_save_sessions(uuid,jsonb,jsonb,text[],text[])', 'EXECUTE')::text),
  ('03 SECURITY DEFINER + search_path (true)', (SELECT prosecdef AND proconfig @> ARRAY['search_path=public']
     FROM pg_proc WHERE oid = 'public.program_save_sessions(uuid,jsonb,jsonb,text[],text[])'::regprocedure)::text);

SET LOCAL ROLE authenticated;

-- ── Son coach référent ───────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'B1 modifie une séance (true)',
  (program_save_sessions(ath, jsonb_build_array(s0e), jsonb_build_object(s0->>'id', s0), '{}', NULL) IS NOT NULL)::text FROM ids, s;
INSERT INTO r(k,v) SELECT 'B2 seule cette séance a changé, à sa place (true)',
  ((SELECT v FROM cur) = jsonb_set(before, '{0}', s0e))::text FROM ids, s;
INSERT INTO r(k,v) SELECT 'B3 updated_at inchangé (true)', ((SELECT at FROM cur) = before_at)::text FROM ids;
DO $$ BEGIN
  -- Base périmée : un 2ᵉ client croit que la base contient encore s0 (il n'a
  -- pas vu B1) et envoie sa propre modification de s0.
  PERFORM program_save_sessions((SELECT ath FROM ids), jsonb_build_array(jsonb_set((SELECT s0 FROM s), '{short}', '"ZZ"')),
    jsonb_build_object((SELECT s0->>'id' FROM s), (SELECT s0 FROM s)), '{}', NULL);
  INSERT INTO r(k,v) VALUES ('B4 écrase une séance modifiée entre-temps', 'ACCEPTÉ (KO)');
EXCEPTION WHEN SQLSTATE '40001' THEN INSERT INTO r(k,v) VALUES ('B4 écrase une séance modifiée entre-temps', 'refusé 40001 (OK)'); END $$;
INSERT INTO r(k,v) SELECT 'B5 renvoi identique accepté (true)',
  (program_save_sessions(ath, jsonb_build_array(s0e), jsonb_build_object(s0->>'id', s0), '{}', NULL) = (SELECT v FROM cur))::text FROM ids, s;
INSERT INTO r(k,v) SELECT 'B6 ajoute une séance sans ordre : à la fin (true)',
  ((program_save_sessions(ath, jsonb_build_array(sn), '{}', '{}', NULL) -> (len)) = sn)::text FROM ids, s;
INSERT INTO r(k,v) SELECT 'B7 une séance de plus (1)', (jsonb_array_length((SELECT v FROM cur)) - len)::text FROM s;
DO $$ BEGIN
  PERFORM program_save_sessions((SELECT ath FROM ids), jsonb_build_array(jsonb_set((SELECT sn FROM s), '{name}', '"Autre"')), '{}', '{}', NULL);
  INSERT INTO r(k,v) VALUES ('B8 « crée » une séance qui existe déjà, différente', 'ACCEPTÉ (KO)');
EXCEPTION WHEN SQLSTATE '40001' THEN INSERT INTO r(k,v) VALUES ('B8 « crée » une séance qui existe déjà, différente', 'refusé 40001 (OK)'); END $$;
DO $$ BEGIN
  PERFORM program_save_sessions((SELECT ath FROM ids), '[]', jsonb_build_object((SELECT s1->>'id' FROM s), (SELECT s1e FROM s)), ARRAY[(SELECT s1->>'id' FROM s)], NULL);
  INSERT INTO r(k,v) VALUES ('B9 supprime avec une base périmée', 'ACCEPTÉE (KO)');
EXCEPTION WHEN SQLSTATE '40001' THEN INSERT INTO r(k,v) VALUES ('B9 supprime avec une base périmée', 'refusée 40001 (OK)'); END $$;
INSERT INTO r(k,v) SELECT 'B10 supprime la séance ajoutée (true)',
  (NOT (program_save_sessions(ath, '[]', jsonb_build_object('test-prog-new', sn), ARRAY['test-prog-new'], NULL) @> jsonb_build_array(jsonb_build_object('id', 'test-prog-new'))))::text FROM ids, s;
INSERT INTO r(k,v) SELECT 'B11 retour à la longueur initiale (true)', (jsonb_array_length((SELECT v FROM cur)) = len)::text FROM s;
-- Ordre inversé demandé, sans la 1re séance dans la liste : elle reste, à la fin.
INSERT INTO r(k,v) SELECT 'B12 réordonne ; séance non citée gardée à la fin (true)',
  (program_save_sessions(ath, '[]', '{}', '{}',
     (SELECT array_agg(e->>'id' ORDER BY i DESC) FROM jsonb_array_elements((SELECT v FROM cur)) WITH ORDINALITY t(e, i) WHERE i > 1))
   = (SELECT jsonb_agg(e ORDER BY CASE WHEN i = 1 THEN 1e9 ELSE -i END) FROM jsonb_array_elements((SELECT v FROM cur)) WITH ORDINALITY t(e, i)))::text FROM ids;
INSERT INTO r(k,v) SELECT 'B13 aucune séance perdue (true)',
  ((SELECT count(*) FROM jsonb_array_elements((SELECT v FROM cur))) = len)::text FROM s;
DO $$ BEGIN
  PERFORM program_save_sessions((SELECT ath FROM ids), '[{"name": "sans id"}]', '{}', '{}', NULL);
  INSERT INTO r(k,v) VALUES ('B14 séance sans id', 'ACCEPTÉE (KO)');
EXCEPTION WHEN SQLSTATE '22023' THEN INSERT INTO r(k,v) VALUES ('B14 séance sans id', 'refusée (OK)'); END $$;
DO $$ BEGIN
  PERFORM program_save_sessions((SELECT ath FROM ids), '{"id": "x"}', '{}', '{}', NULL);
  INSERT INTO r(k,v) VALUES ('B15 séances qui ne sont pas un tableau', 'ACCEPTÉES (KO)');
EXCEPTION WHEN SQLSTATE '22023' THEN INSERT INTO r(k,v) VALUES ('B15 séances qui ne sont pas un tableau', 'refusées (OK)'); END $$;
DO $$ BEGIN
  PERFORM program_save_sessions((SELECT ath FROM ids), jsonb_build_array((SELECT s0e FROM s)), '{}', ARRAY[(SELECT s0->>'id' FROM s)], NULL);
  INSERT INTO r(k,v) VALUES ('B16 séance modifiée et supprimée à la fois', 'ACCEPTÉE (KO)');
EXCEPTION WHEN SQLSTATE '22023' THEN INSERT INTO r(k,v) VALUES ('B16 séance modifiée et supprimée à la fois', 'refusée (OK)'); END $$;
INSERT INTO r(k,v) SELECT 'B17 updated_at toujours inchangé (true)', ((SELECT at FROM cur) = before_at)::text FROM ids;

-- ── L'athlète lui-même (droit de la RLS app_data_self) ──────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', ath, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'D1 l''athlète modifie son programme (true)',
  (program_save_sessions(ath, jsonb_build_array(s1e), jsonb_build_object(s1->>'id', s1), '{}', NULL) IS NOT NULL)::text FROM ids, s;
DO $$ BEGIN
  PERFORM program_save_sessions((SELECT fresh FROM ids), jsonb_build_array((SELECT sn FROM s)), '{}', '{}', NULL);
  INSERT INTO r(k,v) VALUES ('D2 l''athlète écrit le programme d''un autre', 'ACCEPTÉ (KO)');
EXCEPTION WHEN SQLSTATE '42501' THEN INSERT INTO r(k,v) VALUES ('D2 l''athlète écrit le programme d''un autre', 'refusé (OK)'); END $$;

-- ── Un autre coach : ne lit pas, n'écrit pas ─────────────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', other_coach, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'C1 autre coach lit le programme (0)',
  (SELECT count(*) FROM app_data WHERE athlete_id = ath AND key = 'asp:prog')::text FROM ids;
DO $$ BEGIN
  PERFORM program_save_sessions((SELECT ath FROM ids), jsonb_build_array((SELECT sn FROM s)), '{}', '{}', NULL);
  INSERT INTO r(k,v) VALUES ('C2 autre coach écrit le programme', 'ACCEPTÉ (KO)');
EXCEPTION WHEN SQLSTATE '42501' THEN INSERT INTO r(k,v) VALUES ('C2 autre coach écrit le programme', 'refusé (OK)'); END $$;

-- ── Un coach sans programme à lui : la ligne est créée ───────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', fresh, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'F1 crée le programme (1)',
  jsonb_array_length(program_save_sessions(fresh, jsonb_build_array(sn), '{}', '{}', NULL))::text FROM ids, s;
INSERT INTO r(k,v) SELECT 'F2 ligne créée (1)',
  (SELECT count(*) FROM app_data WHERE athlete_id = fresh AND key = 'asp:prog')::text FROM ids;

-- ── Sans session ─────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '', true);
DO $$ BEGIN
  PERFORM program_save_sessions((SELECT ath FROM ids), '[]', '{}', '{}', NULL);
  INSERT INTO r(k,v) VALUES ('E1 authenticated sans sub', 'ACCEPTÉ (KO)');
EXCEPTION WHEN SQLSTATE '42501' THEN INSERT INTO r(k,v) VALUES ('E1 authenticated sans sub', 'refusé (OK)'); END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM program_save_sessions((SELECT ath FROM ids), '[]', '{}', '{}', NULL);
  INSERT INTO r(k,v) VALUES ('E2 anon appelle la RPC', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('E2 anon appelle la RPC', 'refusé (OK)'); END $$;

RESET ROLE;
SELECT k, v FROM r ORDER BY n;
ROLLBACK;
