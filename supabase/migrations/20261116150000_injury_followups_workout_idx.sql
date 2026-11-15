-- Index de la FK injury_followups.workout_log_id (test d'hygiène « plus aucune FK
-- sans index ») : l'index unique (entry_id, workout_log_id) ne la couvre pas en tête.
CREATE INDEX IF NOT EXISTS injury_followups_workout_idx
  ON public.injury_followups (workout_log_id) WHERE workout_log_id IS NOT NULL;
