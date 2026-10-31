-- L'assistant IA du coach peut proposer une semaine d'entraînement :
-- séances créées et placées, thème de chaque jour. Le coach l'applique d'un
-- clic dans Agon, comme les autres propositions.
ALTER TABLE public.coach_api_drafts
  DROP CONSTRAINT IF EXISTS coach_api_drafts_kind_check;
ALTER TABLE public.coach_api_drafts
  ADD CONSTRAINT coach_api_drafts_kind_check
  CHECK (kind IN ('axe', 'programme', 'planning', 'objectifs', 'semaine'));
