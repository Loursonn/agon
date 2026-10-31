-- Masquage d'un athlète côté coach (ex. athlète suivi seulement en pré-saison).
-- Confort d'affichage du coach uniquement : l'athlète ne voit aucun changement.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coach_hidden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.coach_hidden IS
  'true = son coach l''a masqué de sa liste/sélecteur/accueil. Sans effet côté athlète.';

-- Seul le coach de l'athlète peut masquer/réafficher (SECURITY DEFINER + vérification,
-- même schéma que unlink_athlete).
CREATE OR REPLACE FUNCTION public.set_athlete_hidden(athlete_id uuid, hidden boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = athlete_id AND coach_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE profiles SET coach_hidden = hidden WHERE id = athlete_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_athlete_hidden(uuid, boolean) TO authenticated;

-- Un athlète dissocié repart visible s'il est relié plus tard.
CREATE OR REPLACE FUNCTION public.unlink_athlete(athlete_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = athlete_id AND coach_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE profiles SET coach_id = NULL, coach_hidden = false WHERE id = athlete_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlink_athlete(uuid) TO authenticated;
