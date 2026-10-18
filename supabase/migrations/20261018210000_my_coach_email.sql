-- Tuto Strava (Profil athlète) : l'athlète transfère l'e-mail Strava à son
-- coach → il a besoin de l'adresse de SON coach uniquement (auth.users n'est
-- pas lisible côté client).
CREATE OR REPLACE FUNCTION public.get_my_coach_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT u.email::text
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.coach_id
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_coach_email() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_coach_email() TO authenticated;
