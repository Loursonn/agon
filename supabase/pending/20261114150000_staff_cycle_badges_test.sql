-- Test à blanc du badge cycle de l'accueil staff. Toujours annulé (ROLLBACK final).
-- Jeu : kiné « Sam Démo » dans le staff de « Léa Démo » (coach « Agon Démo »).
-- Partie A : ce que le pro lit AUJOURD'HUI, sans migration.
-- Partie B : la RPC staff_cycle_badges() (migration en attente, créée puis annulée ici).
-- Lancer : supabase db query --linked -f supabase/pending/20261114150000_staff_cycle_badges_test.sql
-- Sortie : uniquement des nombres et des booléens.

BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated, anon; GRANT ALL ON SEQUENCE r_n_seq TO authenticated, anon;
CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT a.id AS athlete, a.coach_id AS coach,
       (SELECT s.id FROM profiles s WHERE s.full_name = 'Sam Démo' AND s.role = 'staff' LIMIT 1) AS staff
  FROM profiles a WHERE a.full_name = 'Léa Démo' AND a.role = 'athlete' LIMIT 1;
GRANT SELECT ON ids TO authenticated, anon;
INSERT INTO r(k,v) SELECT '00 jeu démo trouvé (true)', (athlete IS NOT NULL AND coach IS NOT NULL AND staff IS NOT NULL)::text FROM ids;

-- Lien kiné actif (grille par défaut) s'il n'existe pas encore, et accord staff_sharing de Léa.
SELECT set_config('agon.staff_accept', 'on', true);
INSERT INTO athlete_staff(athlete_id, staff_id, profession, permissions, added_by, added_by_role)
SELECT athlete, staff, 'kine', staff_default_permissions('kine'), coach, 'coach' FROM ids
 WHERE NOT EXISTS (SELECT 1 FROM athlete_staff s, ids i WHERE s.athlete_id = i.athlete AND s.staff_id = i.staff AND s.status = 'active');
SELECT set_config('agon.staff_accept', 'off', true);
INSERT INTO user_consents(user_id, purpose, granted, doc_version, statement)
SELECT athlete, 'staff_sharing', true, 'test', 'TEST RLS — annulé' FROM ids;

-- Référence (rôle propriétaire) : cycle en cours de Léa et rang de la semaine, calculés comme le client.
CREATE TEMP TABLE ref ON COMMIT DROP AS
WITH c AS (
  SELECT c.id, c.name FROM cycles c, ids i
   WHERE COALESCE(c.athlete_id, mesocycle_athlete_id(c.mesocycle_id)) = i.athlete
   ORDER BY (current_date BETWEEN c.start_date AND c.end_date) DESC, c.start_date DESC LIMIT 1)
SELECT c.id, c.name,
  (SELECT w.rn FROM (SELECT start_date, end_date, row_number() OVER (ORDER BY start_date) rn FROM microcycles WHERE cycle_id = c.id) w
    WHERE current_date BETWEEN w.start_date AND w.end_date LIMIT 1)::int AS week_index,
  (SELECT count(*) FROM microcycles WHERE cycle_id = c.id)::int AS week_count
FROM c;
GRANT SELECT ON ref TO authenticated;
INSERT INTO r(k,v) SELECT '01 Léa a un cycle avec des semaines (true)', (count(*) = 1 AND bool_and(week_count > 0))::text FROM ref;

-- Migration en attente, appliquée dans la transaction seulement.
CREATE OR REPLACE FUNCTION public.staff_cycle_badges()
RETURNS TABLE (athlete_id uuid, cycle_name text, week_index int, week_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH mine AS (
    SELECT DISTINCT s.athlete_id FROM public.athlete_staff s
     WHERE s.staff_id = auth.uid() AND s.status = 'active'
       AND public.staff_can(s.athlete_id, 'planification', 'read')
  ),
  cyc AS (
    SELECT DISTINCT ON (m.athlete_id) m.athlete_id, c.id, c.name
      FROM mine m JOIN public.cycles c
        ON COALESCE(c.athlete_id, public.mesocycle_athlete_id(c.mesocycle_id)) = m.athlete_id
     ORDER BY m.athlete_id, (current_date BETWEEN c.start_date AND c.end_date) DESC, c.start_date DESC
  )
  SELECT cyc.athlete_id, cyc.name,
         (SELECT w.rn::int FROM (SELECT mc.start_date, mc.end_date, row_number() OVER (ORDER BY mc.start_date) AS rn
                                   FROM public.microcycles mc WHERE mc.cycle_id = cyc.id) w
           WHERE current_date BETWEEN w.start_date AND w.end_date LIMIT 1),
         (SELECT count(*)::int FROM public.microcycles mc WHERE mc.cycle_id = cyc.id)
    FROM cyc;
$$;
REVOKE ALL ON FUNCTION public.staff_cycle_badges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_cycle_badges() TO authenticated;

-- ===== Kiné, planification en lecture, accord donné =====
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', staff, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'A1 sans migration : le pro lit les cycles de Léa (true)', (count(*) > 0)::text
  FROM cycles WHERE athlete_id = (SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'A2 sans migration : le pro lit les semaines du cycle (true)', (count(*) = (SELECT week_count FROM ref))::text
  FROM microcycles WHERE cycle_id = (SELECT id FROM ref);
INSERT INTO r(k,v) SELECT 'B1 RPC : une ligne pour Léa, identique à la référence (true)',
  (count(*) = 1 AND bool_and(b.cycle_name = f.name AND b.week_index IS NOT DISTINCT FROM f.week_index AND b.week_count = f.week_count))::text
  FROM staff_cycle_badges() b, ref f WHERE b.athlete_id = (SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'B2 RPC : aucun athlète hors de mes liens actifs (0)', count(*)::text
  FROM staff_cycle_badges() b
 WHERE NOT EXISTS (SELECT 1 FROM athlete_staff s WHERE s.athlete_id = b.athlete_id AND s.staff_id = auth.uid() AND s.status = 'active');

-- ===== Le coach ferme la planification =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role', 'authenticated')::text FROM ids), true);
UPDATE athlete_staff SET permissions = permissions || '{"planification":"none"}'
 WHERE athlete_id = (SELECT athlete FROM ids) AND staff_id = (SELECT staff FROM ids) AND status = 'active';
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', staff, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'C1 planification fermée : cycles visibles (0)', count(*)::text FROM cycles WHERE athlete_id = (SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'C2 planification fermée : badge RPC (0)', count(*)::text FROM staff_cycle_badges() WHERE athlete_id = (SELECT athlete FROM ids);

-- ===== Planification rouverte, mais Léa retire son accord =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role', 'authenticated')::text FROM ids), true);
UPDATE athlete_staff SET permissions = permissions || '{"planification":"read"}'
 WHERE athlete_id = (SELECT athlete FROM ids) AND staff_id = (SELECT staff FROM ids) AND status = 'active';
RESET ROLE;
INSERT INTO user_consents(user_id, purpose, granted, doc_version, statement)
SELECT athlete, 'staff_sharing', false, 'test', 'TEST RLS — annulé' FROM ids;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', staff, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'D1 accord retiré : badge RPC (0)', count(*)::text FROM staff_cycle_badges() WHERE athlete_id = (SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'D2 accord retiré : cycles visibles (0)', count(*)::text FROM cycles WHERE athlete_id = (SELECT athlete FROM ids);

-- ===== Accord rendu, lien révoqué par le coach =====
RESET ROLE;
INSERT INTO user_consents(user_id, purpose, granted, doc_version, statement)
SELECT athlete, 'staff_sharing', true, 'test', 'TEST RLS — annulé' FROM ids;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role', 'authenticated')::text FROM ids), true);
UPDATE athlete_staff SET status = 'revoked', revoked_at = now()
 WHERE athlete_id = (SELECT athlete FROM ids) AND staff_id = (SELECT staff FROM ids) AND status = 'active';
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', staff, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'E1 lien révoqué : badge RPC (0)', count(*)::text FROM staff_cycle_badges() WHERE athlete_id = (SELECT athlete FROM ids);

-- ===== Visiteur non connecté =====
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '', true);
DO $$ BEGIN
  PERFORM * FROM public.staff_cycle_badges();
  INSERT INTO r(k,v) VALUES ('F1 anon appelle la RPC', 'ACCEPTÉ (KO)');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO r(k,v) VALUES ('F1 anon appelle la RPC', 'refusé (OK)'); END $$;

RESET ROLE;
SELECT k, v FROM r ORDER BY n;
ROLLBACK;
