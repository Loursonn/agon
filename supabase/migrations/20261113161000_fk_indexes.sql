-- Index des clés étrangères ajoutées depuis 20261109180000_db_hygiene sans index.
-- Règle d'hygiène (test supabase/tests/db_hygiene.sql « plus aucune FK sans index ») :
-- chaque FK a un index qui commence par ses colonnes (suppressions en cascade, jointures RLS).
-- Tables petites (< 2 000 lignes) : CREATE INDEX simple, verrou de quelques millisecondes. Rejouable.

CREATE INDEX IF NOT EXISTS activity_laps_athlete_id_fk_idx            ON public.activity_laps (athlete_id);
CREATE INDEX IF NOT EXISTS activity_laps_exercise_id_fk_idx           ON public.activity_laps (exercise_id);
CREATE INDEX IF NOT EXISTS activity_sets_athlete_id_fk_idx            ON public.activity_sets (athlete_id);
CREATE INDEX IF NOT EXISTS hr_zone_models_decided_by_fk_idx           ON public.hr_zone_models (decided_by);
CREATE INDEX IF NOT EXISTS hr_zone_models_test_result_id_fk_idx       ON public.hr_zone_models (test_result_id);
CREATE INDEX IF NOT EXISTS hr_zone_models_created_by_fk_idx           ON public.hr_zone_models (created_by);
CREATE INDEX IF NOT EXISTS activity_zone_summaries_model_id_fk_idx    ON public.activity_zone_summaries (model_id);
CREATE INDEX IF NOT EXISTS activity_plan_links_confirmed_by_fk_idx    ON public.activity_plan_links (confirmed_by);
