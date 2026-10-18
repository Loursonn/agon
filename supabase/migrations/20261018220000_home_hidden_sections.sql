-- Accueil athlète personnalisable par le coach : sections masquées.
-- Par défaut l'alimentation est masquée (toujours disponible, juste non affichée).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_hidden_sections text[] NOT NULL DEFAULT ARRAY['nutrition']::text[];

COMMENT ON COLUMN public.profiles.home_hidden_sections IS
  'Sections de l''accueil athlète masquées par le coach (clés : quote, wellness, nutrition, test, week, yesterday, next_comp, events, trend)';
