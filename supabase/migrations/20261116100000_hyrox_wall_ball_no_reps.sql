-- No reps aux wall balls d'une course HYROX (demande d'Hugo, 16/11/2026) :
-- « cible ratée » (ballon sous la cible) et « pas sous la parallèle ».
--
-- Additif : deux entiers nullables. NULL = non renseigné (affiché « — »,
-- jamais 0). Les résultats officiels ne les donnent pas : saisie à la main par
-- l'athlète ou le coach. Les policies existantes de hyrox_results (hr_select /
-- hr_insert / hr_update) couvrent déjà ces colonnes : aucune policy à ajouter.

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
