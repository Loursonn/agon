-- Lier une course HYROX à l'activité de montre et recaler la FC sur les splits
-- officiels (demande d'Hugo, 16/11/2026).
--
-- Additif : deux colonnes nullables. NULL = comportement actuel (activité du
-- même jour proposée d'office, décalage calculé). Les policies existantes de
-- hyrox_results (hr_select / hr_update : athlète lui-même, coach via
-- i_am_coach() AND is_coach_of(athlete_id), admin) couvrent déjà la lecture et
-- l'écriture de ces colonnes : aucune policy à ajouter.

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
