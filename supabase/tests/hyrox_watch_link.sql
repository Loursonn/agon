-- Test à blanc : lien montre + décalage sur hyrox_results (migration 20261116090000).
-- À lancer sur la base de TEST : supabase db query --linked -f supabase/tests/hyrox_watch_link.sql
-- Tout se passe dans une transaction annulée.
BEGIN;
ALTER TABLE public.hyrox_results
  ADD COLUMN IF NOT EXISTS watch_activity_id uuid REFERENCES public.provider_activities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS watch_offset_s integer;

ALTER TABLE public.hyrox_results
  DROP CONSTRAINT IF EXISTS hyrox_results_watch_offset_s_check;
ALTER TABLE public.hyrox_results
  ADD CONSTRAINT hyrox_results_watch_offset_s_check CHECK (watch_offset_s IS NULL OR watch_offset_s BETWEEN -3600 AND 43200);

CREATE INDEX IF NOT EXISTS hyrox_results_watch_activity_id_fk_idx ON public.hyrox_results (watch_activity_id);

COMMENT ON COLUMN public.hyrox_results.watch_activity_id IS 'Activité de montre liée à la course (choisie par l''athlète ou le coach). NULL : activité du même jour proposée d''office.';
COMMENT ON COLUMN public.hyrox_results.watch_offset_s IS 'Seconde de l''enregistrement de la montre où la course commence (négatif : montre lancée après le départ). NULL : recalage automatique.';

DO $$
DECLARE
  lea uuid;
  race uuid;
  other uuid;
  n int;
BEGIN
  -- Léa Démo (fictive) ; une course de test créée dans la transaction si elle n'en a pas.
  SELECT p.id INTO lea FROM profiles p WHERE p.full_name = 'Léa Démo' AND p.role = 'athlete'
    ORDER BY EXISTS (SELECT 1 FROM hyrox_results h WHERE h.athlete_id = p.id) DESC, p.id LIMIT 1;
  IF lea IS NULL THEN RAISE EXCEPTION 'Léa Démo absente (seed démo manquant)'; END IF;
  SELECT id INTO race FROM hyrox_results WHERE athlete_id = lea LIMIT 1;
  IF race IS NULL THEN
    INSERT INTO hyrox_results (athlete_id, date, event_name, division, total_s) VALUES (lea, '2026-09-20', 'HYROX Test', 'women', 4658)
    RETURNING id INTO race;
  END IF;
  SELECT id INTO other FROM profiles WHERE role = 'athlete' AND id <> lea AND COALESCE(is_admin, false) = false LIMIT 1;

  -- 1. L'athlète recale sa propre course.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', lea, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE hyrox_results SET watch_offset_s = 95 WHERE id = race;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'athlète : mise à jour refusée (% ligne)', n; END IF;
  RESET ROLE;

  -- 2. Un autre athlète ne modifie pas la course.
  IF other IS NULL THEN RAISE EXCEPTION 'aucun autre athlète pour le test'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE hyrox_results SET watch_offset_s = 0 WHERE id = race;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'un tiers a pu modifier la course'; END IF;
  RESET ROLE;

  -- 3. Décalage hors bornes refusé.
  BEGIN
    UPDATE hyrox_results SET watch_offset_s = -4000 WHERE id = race;
    RAISE EXCEPTION 'décalage -4000 accepté à tort';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'hyrox_watch_link : 3 / 3';
END $$;
ROLLBACK;
