-- Test à blanc : no reps wall balls sur hyrox_results (migration 20261116100000).
-- À lancer sur la base de TEST : supabase db query --linked -f supabase/tests/hyrox_wall_ball_no_reps.sql
-- Tout se passe dans une transaction annulée.
BEGIN;
ALTER TABLE public.hyrox_results
  ADD COLUMN IF NOT EXISTS wall_balls_no_rep_target integer,
  ADD COLUMN IF NOT EXISTS wall_balls_no_rep_depth integer;

ALTER TABLE public.hyrox_results
  DROP CONSTRAINT IF EXISTS hyrox_results_wall_balls_no_reps_check;
ALTER TABLE public.hyrox_results
  ADD CONSTRAINT hyrox_results_wall_balls_no_reps_check CHECK (
    (wall_balls_no_rep_target IS NULL OR wall_balls_no_rep_target BETWEEN 0 AND 500)
    AND (wall_balls_no_rep_depth IS NULL OR wall_balls_no_rep_depth BETWEEN 0 AND 500)
  );

COMMENT ON COLUMN public.hyrox_results.wall_balls_no_rep_target IS 'No reps aux wall balls : cible ratée. NULL : non renseigné.';
COMMENT ON COLUMN public.hyrox_results.wall_balls_no_rep_depth IS 'No reps aux wall balls : squat pas sous la parallèle. NULL : non renseigné.';

DO $$
DECLARE
  lea uuid;
  race uuid;
  other uuid;
  n int;
BEGIN
  SELECT p.id INTO lea FROM profiles p WHERE p.full_name = 'Léa Démo' AND p.role = 'athlete'
    ORDER BY EXISTS (SELECT 1 FROM hyrox_results h WHERE h.athlete_id = p.id) DESC, p.id LIMIT 1;
  IF lea IS NULL THEN RAISE EXCEPTION 'Léa Démo absente (seed démo manquant)'; END IF;
  SELECT id INTO race FROM hyrox_results WHERE athlete_id = lea LIMIT 1;
  IF race IS NULL THEN
    INSERT INTO hyrox_results (athlete_id, date, event_name, division, total_s) VALUES (lea, '2026-09-20', 'HYROX Test', 'women', 4658)
    RETURNING id INTO race;
  END IF;
  SELECT id INTO other FROM profiles WHERE role = 'athlete' AND id <> lea AND COALESCE(is_admin, false) = false LIMIT 1;

  -- 1. L'athlète saisit ses no reps.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', lea, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE hyrox_results SET wall_balls_no_rep_target = 4, wall_balls_no_rep_depth = 2 WHERE id = race;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'athlète : mise à jour refusée (% ligne)', n; END IF;
  RESET ROLE;

  -- 2. Un autre athlète ne modifie pas la course.
  IF other IS NULL THEN RAISE EXCEPTION 'aucun autre athlète pour le test'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE hyrox_results SET wall_balls_no_rep_target = 0 WHERE id = race;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'un tiers a pu modifier la course'; END IF;
  RESET ROLE;

  -- 3. Valeur négative refusée.
  BEGIN
    UPDATE hyrox_results SET wall_balls_no_rep_depth = -1 WHERE id = race;
    RAISE EXCEPTION 'no rep négatif accepté à tort';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'hyrox_wall_ball_no_reps : 3 / 3';
END $$;
ROLLBACK;
