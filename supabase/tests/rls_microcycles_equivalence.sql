-- Équivalence des policies de cycles et microcycles réécrites par 20261115220000_rls_microcycles_fast.sql.
-- Ancienne expression (écrite ici) contre la policy installée (lue dans pg_policies), pour chaque
-- utilisateur de la base (+ anon et un uuid sans compte) et chaque cycle (ceux de la base + des cycles fictifs de chaque forme, dont le cas
-- « mixte » : mésocycle d'un athlète, athlete_id d'un autre) : la décision (NULL = refus) doit être
-- la même. Évalué en rôle authenticated / anon, car l'ancienne fonction cycle_athlete_id dépend de
-- la RLS de l'appelant. Les expressions des microcycles ne dépendent que de cycle_id : on les évalue
-- sur chaque cycle (plus un id inexistant). Aucune donnée affichée, seulement des comptes.
-- Toujours annulé (ROLLBACK).
-- Avant application (prod, à blanc) : un fichier = BEGIN; + la migration + ce test sans son BEGIN;
--   (echo 'BEGIN;'; cat supabase/migrations/20261115220000_rls_microcycles_fast.sql;
--    sed '/^BEGIN;$/d' supabase/tests/rls_microcycles_equivalence.sql) > /tmp/x.sql
--   prod.sh supabase db query --linked -f /tmp/x.sql
BEGIN;
SET LOCAL statement_timeout = '20s';

-- ── Cycles fictifs de chaque forme (deux athlètes distincts de la base) ───────────────────
CREATE TEMP TABLE fx ON COMMIT DROP AS
  SELECT (SELECT id FROM public.profiles WHERE role = 'athlete' AND coach_id IS NOT NULL ORDER BY created_at LIMIT 1) AS a,
         (SELECT id FROM public.profiles p WHERE role = 'athlete' AND coach_id IS NOT NULL
             AND id <> (SELECT id FROM public.profiles WHERE role = 'athlete' AND coach_id IS NOT NULL ORDER BY created_at LIMIT 1)
           ORDER BY EXISTS (SELECT 1 FROM public.athlete_co_coaches c WHERE c.athlete_id = p.id), created_at LIMIT 1) AS b,
         '00000000-0000-4000-8000-0000000c0001'::uuid AS macro_a,
         '00000000-0000-4000-8000-0000000c0002'::uuid AS macro_b,
         '00000000-0000-4000-8000-0000000c0011'::uuid AS meso_a,
         '00000000-0000-4000-8000-0000000c0012'::uuid AS meso_b;
INSERT INTO public.macrocycles(id, athlete_id, name, start_date, end_date)
  SELECT macro_a, a, 'TEST RLS', '2030-01-01'::date, '2030-06-01'::date FROM fx
  UNION ALL SELECT macro_b, b, 'TEST RLS', '2030-01-01'::date, '2030-06-01'::date FROM fx;
INSERT INTO public.mesocycles(id, macrocycle_id, name, start_date, end_date)
  SELECT meso_a, macro_a, 'TEST RLS', '2030-01-01'::date, '2030-03-01'::date FROM fx
  UNION ALL SELECT meso_b, macro_b, 'TEST RLS', '2030-01-01'::date, '2030-03-01'::date FROM fx;
INSERT INTO public.cycles(id, mesocycle_id, athlete_id, name, start_date, end_date)
  SELECT '00000000-0000-4000-8000-0000000c0101'::uuid, NULL::uuid, a, 'TEST direct',   '2030-01-01'::date, '2030-02-01'::date FROM fx
  UNION ALL SELECT '00000000-0000-4000-8000-0000000c0102', meso_a, NULL::uuid, 'TEST méso',     '2030-01-01'::date, '2030-02-01'::date FROM fx
  UNION ALL SELECT '00000000-0000-4000-8000-0000000c0103', meso_a, a,    'TEST même',     '2030-01-01'::date, '2030-02-01'::date FROM fx
  UNION ALL SELECT '00000000-0000-4000-8000-0000000c0104', meso_a, b,    'TEST mixte A/B', '2030-01-01'::date, '2030-02-01'::date FROM fx
  UNION ALL SELECT '00000000-0000-4000-8000-0000000c0105', meso_b, a,    'TEST mixte B/A', '2030-01-01'::date, '2030-02-01'::date FROM fx
  UNION ALL SELECT '00000000-0000-4000-8000-0000000c0106', NULL,   NULL, 'TEST orphelin', '2030-01-01'::date, '2030-02-01'::date FROM fx;

-- Un pro au lien actif (planification en lecture) sur l'athlète A, accord staff_sharing de A :
-- les policies staff ont ainsi au moins un accès à comparer, quelles que soient les données.
SELECT set_config('agon.staff_accept', 'on', true);
INSERT INTO public.athlete_staff(athlete_id, staff_id, profession, permissions, added_by, added_by_role)
  SELECT a, (SELECT id FROM public.profiles p WHERE p.id <> fx.a AND p.id <> fx.b AND NOT p.is_admin
              ORDER BY p.created_at LIMIT 1),
         'autre', '{"planification":"read"}'::jsonb, (SELECT coach_id FROM public.profiles WHERE id = fx.a), 'coach' FROM fx;
SELECT set_config('agon.staff_accept', 'off', true);
INSERT INTO public.user_consents(user_id, purpose, granted, doc_version, statement)
  SELECT a, 'staff_sharing', true, 'test', 'TEST RLS — annulé' FROM fx;
-- Le coach de A devient co-coach de B : il a accès aux deux côtés des cycles mixtes, seul cas où
-- l'ancienne fonction renvoie un athlète pour eux.
INSERT INTO public.athlete_co_coaches(athlete_id, co_coach_id, added_by, added_by_role)
  SELECT b, ca, ca, 'coach' FROM (SELECT b, (SELECT coach_id FROM public.profiles WHERE id = fx.a) AS ca,
                                         (SELECT coach_id FROM public.profiles WHERE id = fx.b) AS cb FROM fx) z
   WHERE ca IS DISTINCT FROM cb
  ON CONFLICT (athlete_id) DO UPDATE SET co_coach_id = EXCLUDED.co_coach_id;

-- ── Lignes et utilisateurs ────────────────────────────────────────────────────────────────
CREATE TEMP TABLE cy ON COMMIT DROP AS
  SELECT id, athlete_id, mesocycle_id FROM public.cycles;
CREATE TEMP TABLE mc ON COMMIT DROP AS
  SELECT id, id AS cycle_id FROM public.cycles
  UNION ALL SELECT '00000000-0000-4000-8000-0000000c0999'::uuid, '00000000-0000-4000-8000-0000000c0999'::uuid;   -- cycle inexistant
CREATE TEMP TABLE u ON COMMIT DROP AS
  SELECT id FROM public.profiles
  UNION ALL SELECT NULL::uuid
  UNION ALL SELECT '00000000-0000-4000-8000-00000000abcd'::uuid;
CREATE TEMP TABLE r(tbl text, expr text, n_eval bigint, n_diff bigint, n_ok bigint, n_mixed bigint) ON COMMIT DROP;
GRANT SELECT ON cy, mc TO authenticated, anon;
GRANT ALL ON r TO authenticated, anon;

-- Ancienne expression de chaque policy (état après 20261115193700) ; la nouvelle est lue telle
-- qu'installée, pour que le test vérifie la base et non une copie du texte de la migration.
CREATE TEMP TABLE ex(tbl text, pol_table text, pol text, kind text, old text, new text) ON COMMIT DROP;
INSERT INTO ex(tbl, pol_table, pol, kind, old) VALUES
('cy', 'cycles', 'cycles_select', 'USING',
 '((COALESCE(athlete_id, public.mesocycle_athlete_id(mesocycle_id)) = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(athlete_id, public.mesocycle_athlete_id(mesocycle_id)))))'),
('cy', 'cycles', 'cycles_insert', 'CHECK',
 '((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(athlete_id, public.mesocycle_athlete_id(mesocycle_id)))))'),
('cy', 'cycles', 'cycles_update', 'USING',
 '((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(athlete_id, public.mesocycle_athlete_id(mesocycle_id))))'),
('cy', 'cycles', 'cycles_update', 'CHECK',
 '((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(athlete_id, public.mesocycle_athlete_id(mesocycle_id))))'),
('cy', 'cycles', 'cycles_delete', 'USING',
 '((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(athlete_id, public.mesocycle_athlete_id(mesocycle_id))))'),
('cy', 'cycles', 'staff_cycles_read', 'USING',
 '((SELECT public.i_am_staff()) AND public.staff_can(COALESCE(athlete_id, public.mesocycle_athlete_id(mesocycle_id)), ''planification''::text, ''read''::text))'),
('mc', 'microcycles', 'microcycles_select', 'USING',
 '((public.cycle_athlete_id(cycle_id) = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND public.can_coach_athlete(public.cycle_athlete_id(cycle_id))))'),
('mc', 'microcycles', 'microcycles_insert', 'CHECK',
 '((SELECT public.i_am_coach()) AND public.can_coach_athlete(public.cycle_athlete_id(cycle_id)))'),
('mc', 'microcycles', 'microcycles_update', 'USING',
 '((SELECT public.i_am_coach()) AND public.can_coach_athlete(public.cycle_athlete_id(cycle_id)))'),
('mc', 'microcycles', 'microcycles_update', 'CHECK',
 '((SELECT public.i_am_coach()) AND public.can_coach_athlete(public.cycle_athlete_id(cycle_id)))'),
('mc', 'microcycles', 'microcycles_delete', 'USING',
 '((SELECT public.i_am_coach()) AND public.can_coach_athlete(public.cycle_athlete_id(cycle_id)))'),
('mc', 'microcycles', 'staff_microcycles_read', 'USING',
 '((SELECT public.i_am_staff()) AND public.staff_can(public.cycle_athlete_id(cycle_id), ''planification''::text, ''read''::text))');
UPDATE ex SET new = (SELECT CASE ex.kind WHEN 'USING' THEN p.qual ELSE p.with_check END
                       FROM pg_policies p
                      WHERE p.schemaname = 'public' AND p.tablename = ex.pol_table AND p.policyname = ex.pol);
GRANT SELECT ON ex TO authenticated, anon;

DO $$
DECLARE usr record; e record; n bigint; d bigint; k bigint; m bigint;
BEGIN
  FOR usr IN SELECT id FROM u LOOP
    PERFORM set_config('request.jwt.claims',
      CASE WHEN usr.id IS NULL THEN '{"role":"anon"}'
           ELSE json_build_object('sub', usr.id, 'role', 'authenticated')::text END, true);
    EXECUTE CASE WHEN usr.id IS NULL THEN 'SET LOCAL ROLE anon' ELSE 'SET LOCAL ROLE authenticated' END;
    FOR e IN SELECT * FROM ex LOOP
      -- NULL et faux valent refus pour une policy : on compare des décisions.
      IF e.new IS NULL THEN  -- policy introuvable : échec
        INSERT INTO r VALUES (e.tbl, e.pol || ' ' || e.kind, 0, 1, 0, 0); CONTINUE;
      END IF;
      EXECUTE format('SELECT count(*), count(*) FILTER (WHERE COALESCE((%s), false) IS DISTINCT FROM COALESCE((%s), false)),'
                     ' count(*) FILTER (WHERE COALESCE((%s), false)),'
                     ' count(*) FILTER (WHERE COALESCE((%s), false) AND id IN (''00000000-0000-4000-8000-0000000c0104'', ''00000000-0000-4000-8000-0000000c0105'')) FROM %I',
                     e.old, e.new, e.old, e.old, e.tbl) INTO n, d, k, m;
      INSERT INTO r VALUES (e.tbl, e.pol || ' ' || e.kind, n, d, k, m);
    END LOOP;
    EXECUTE 'RESET ROLE';
  END LOOP;
END $$;

-- Les cycles fictifs de chaque forme sont bien là.
INSERT INTO r SELECT 'contrôle', 'cycles fictifs (6) présents', count(*), (count(*) <> 6)::int, count(*), 1
  FROM public.cycles WHERE name LIKE 'TEST %' AND start_date = '2030-01-01'::date;
-- Le cas mixte est vraiment exercé : au moins un accès « oui » sur un cycle mixte (microcycles).
INSERT INTO r SELECT 'contrôle', 'cas mixte exercé (accès sur cycle mixte)', sum(n_mixed), (sum(n_mixed) = 0)::int, sum(n_mixed), 1
  FROM r WHERE tbl = 'mc';

-- ok : aucun écart, et le test n'est pas vide (au moins une décision « oui »).
SELECT tbl || ' / ' || expr || ' : ' || sum(n_eval) || ' évaluations, ' || sum(n_ok) || ' accès, ' || sum(n_diff) || ' écart(s)' AS label,
       sum(n_diff) = 0 AND sum(n_ok) > 0 AS ok
  FROM r GROUP BY tbl, expr ORDER BY ok, tbl, expr;
ROLLBACK;
