-- Fiches : catégorie « Test » + marqueur stable des fiches de l'assistant IA.
-- Tâches roadmap T-categorie-de-fiche-test et T-delete-fiches-id-renvoie-404.
--
-- Additif seulement :
--  1. docs.category accepte 'test' (fiche qui accompagne un test : protocole,
--     consignes de passation). Fiche de banque comme les autres : elle ne
--     dépend d'aucun athlète tant qu'on ne l'attribue pas.
--  2. docs.created_via : 'api' quand coach-api l'a déposée. coach-api ne
--     reconnaissait ses fiches qu'à l'étiquette « claude », que le coach peut
--     retirer dans l'app : la fiche devenait « introuvable » pour DELETE
--     /fiches/:id. NULL = créée dans l'app (ou avant ce marqueur).
--     Les fiches déjà étiquetées « claude » sont marquées 'api'.
-- Aucune policy ne change : docs_coach_* couvrent déjà les deux colonnes.

ALTER TABLE public.docs DROP CONSTRAINT IF EXISTS docs_category_check;
ALTER TABLE public.docs ADD CONSTRAINT docs_category_check CHECK (
  category = ANY (ARRAY['mobilite', 'pacing', 'prevention', 'recuperation', 'nutrition', 'education', 'test', 'questionnaire', 'autre'])
);

ALTER TABLE public.docs ADD COLUMN IF NOT EXISTS created_via text;
ALTER TABLE public.docs DROP CONSTRAINT IF EXISTS docs_created_via_check;
ALTER TABLE public.docs ADD CONSTRAINT docs_created_via_check CHECK (created_via IS NULL OR created_via = 'api');

COMMENT ON COLUMN public.docs.created_via IS 'api : fiche déposée par l''assistant IA du coach (coach-api POST /fiches), qu''il peut retirer (DELETE /fiches/:id). NULL : créée dans l''app.';

UPDATE public.docs SET created_via = 'api' WHERE created_via IS NULL AND 'claude' = ANY (tags);
