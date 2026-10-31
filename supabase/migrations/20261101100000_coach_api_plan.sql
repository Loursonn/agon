-- Assistant IA du coach : proposition « plan ».
--
-- Une planification complète en une seule proposition (donc une seule
-- annulation) : périodisation (macrocycles, mésocycles, cycles et leurs
-- semaines), compétitions, tests, retraits du planning, et tout ce qu'une
-- semaine sait faire. Appliquée et annulée côté serveur, comme les autres.

ALTER TABLE public.coach_api_drafts
  DROP CONSTRAINT IF EXISTS coach_api_drafts_kind_check;
ALTER TABLE public.coach_api_drafts
  ADD CONSTRAINT coach_api_drafts_kind_check
  CHECK (kind IN ('axe', 'programme', 'planning', 'objectifs', 'semaine', 'plan'));
