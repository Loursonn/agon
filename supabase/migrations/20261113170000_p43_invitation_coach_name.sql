-- P43 (planche AccesPagesSimples, écran 02) : la page d'un lien d'invitation
-- affiche « Agon Démo t'invite ». invitation_is_valid (anon) disait déjà si le
-- lien est valable ; on renvoie en plus le nom du coach, seulement pour un
-- lien valable et pas encore utilisé (le jeton est secret).
CREATE OR REPLACE FUNCTION public.invitation_coach_name(p_token text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(nullif(trim(p.full_name), ''), 'Ton coach')
    FROM public.invitations i
    JOIN public.profiles p ON p.id = i.coach_id
   WHERE i.token = p_token AND i.used_at IS NULL
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.invitation_coach_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invitation_coach_name(text) TO anon, authenticated, service_role;
