-- P43 · planche « Ajouter un événement » (Ath1Evenement).
-- Un seul formulaire pour tous les événements de l'athlète :
--   - hors compétition (stage, voyage, examen, autre) : type, lieu facultatif,
--     case « Indisponible pour m'entraîner » ;
--   - compétition : date de fin facultative (« + Date de fin »).
-- Additif : colonnes nouvelles avec valeurs par défaut, aucune policy modifiée
-- (les policies existantes couvrent déjà l'athlète et son coach).
-- Les événements déjà saisis restent « indisponible » (seul sens qu'ils avaient).

ALTER TABLE public.athlete_life_events
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'autre',
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS unavailable boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  ALTER TABLE public.athlete_life_events
    ADD CONSTRAINT athlete_life_events_kind_check CHECK (kind IN ('stage', 'voyage', 'examen', 'autre'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.athlete_life_events
    ADD CONSTRAINT athlete_life_events_location_len CHECK (location IS NULL OR length(location) <= 200);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.athlete_life_events
    ADD CONSTRAINT athlete_life_events_dates_check CHECK (date_end >= date_start) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS date_end date;

DO $$ BEGIN
  ALTER TABLE public.competitions
    ADD CONSTRAINT competitions_date_end_check CHECK (date_end IS NULL OR date_end >= date);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.athlete_life_events.kind IS 'stage | voyage | examen | autre';
COMMENT ON COLUMN public.athlete_life_events.unavailable IS 'L''athlète ne peut pas s''entraîner ces jours-là';
COMMENT ON COLUMN public.competitions.date_end IS 'Dernier jour d''une compétition sur plusieurs jours (null = un jour)';
