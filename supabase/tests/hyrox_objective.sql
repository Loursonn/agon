-- Test à blanc : objectif HYROX (migration 20261116180000).
-- Base de TEST, depuis ~/agon-test-cli (lié à agon-test) :
--   après la migration : supabase db query --linked -f <ce fichier>
--   à blanc : concaténer BEGIN; + la migration + ce fichier sans son BEGIN (tout est annulé à la fin).
BEGIN;
DO $$
DECLARE
  lea uuid;
  coach uuid;
  other uuid;
  goal uuid;
  n int;
BEGIN
  -- Léa Démo (fictive), son coach, et un autre athlète sans lien.
  SELECT p.id, p.coach_id INTO lea, coach FROM profiles p WHERE p.full_name = 'Léa Démo' AND p.role = 'athlete' AND p.coach_id IS NOT NULL ORDER BY p.id LIMIT 1;
  IF lea IS NULL THEN RAISE EXCEPTION 'Léa Démo absente (seed démo manquant)'; END IF;
  SELECT id INTO other FROM profiles WHERE role = 'athlete' AND id <> lea AND coach_id IS DISTINCT FROM coach AND COALESCE(is_admin, false) = false LIMIT 1;
  IF other IS NULL THEN RAISE EXCEPTION 'aucun autre athlète pour le test'; END IF;

  -- 0. Seed : 7 divisions, version active.
  SELECT count(DISTINCT division) INTO n FROM hyrox_objective_grid WHERE version = 'obj@1';
  IF n <> 7 THEN RAISE EXCEPTION 'grille : % divisions au lieu de 7', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM hyrox_objective_versions WHERE version = 'obj@1' AND active) THEN RAISE EXCEPTION 'obj@1 non active'; END IF;

  -- 1. L'athlète lit la grille, ne l'écrit pas.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', lea, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM hyrox_objective_grid;
  IF n = 0 THEN RAISE EXCEPTION 'athlète : grille illisible'; END IF;
  UPDATE hyrox_objective_grid SET ski_s = 1 WHERE version = 'obj@1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'athlète : grille modifiée (% lignes)', n; END IF;

  -- 2. L'athlète écrit son objectif de saison.
  INSERT INTO hyrox_season_goals (athlete_id, season, division, run_avg_s, created_by) VALUES (lea, '2026-27', 'women', 310, lea) RETURNING id INTO goal;
  RESET ROLE;

  -- 3. Son coach le lit et le modifie.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE hyrox_season_goals SET run_avg_s = 305 WHERE id = goal;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'coach : objectif non modifié'; END IF;
  RESET ROLE;

  -- 4. Un tiers ne le voit pas et ne peut pas en créer pour Léa.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM hyrox_season_goals WHERE athlete_id = lea;
  IF n <> 0 THEN RAISE EXCEPTION 'tiers : objectif visible'; END IF;
  BEGIN
    INSERT INTO hyrox_season_goals (athlete_id, season, division, run_avg_s) VALUES (lea, '2027-28', 'women', 300);
    RAISE EXCEPTION 'tiers : insertion acceptée à tort';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- 5. Bornes : saison mal écrite, run hors bornes.
  BEGIN
    INSERT INTO hyrox_season_goals (athlete_id, season, division, run_avg_s) VALUES (lea, '26/27', 'women', 300);
    RAISE EXCEPTION 'saison « 26/27 » acceptée à tort';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE hyrox_race_plans SET run_avg_s = 50 WHERE athlete_id = lea;
    IF FOUND THEN RAISE EXCEPTION 'run_avg_s = 50 accepté à tort'; END IF;
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'hyrox_objective : 6 / 6';
END $$;
ROLLBACK;
