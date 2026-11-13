-- Planche CoachOrdiBStaffInvitation : la page d'invitation montre « Ce que tu
-- pourras faire » (droits de l'invitation) et « Lien valable jusqu'au … ».
-- Ajout de deux colonnes au retour de get_staff_invitation (lecture par jeton,
-- anon compris). Les droits d'une invitation ne sont visibles que de qui a le
-- jeton, comme le reste de l'aperçu. Additive : le client de main lit les
-- colonnes par nom et ignore les nouvelles.
BEGIN;

DROP FUNCTION IF EXISTS public.get_staff_invitation(text);

CREATE FUNCTION public.get_staff_invitation(p_token text)
RETURNS TABLE (
  athlete_name    text,
  coach_name      text,
  inviter_name    text,
  invited_by_role text,
  profession      text,
  status          text,
  permissions     jsonb,
  expires_at      timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT a.full_name,
         c.full_name,
         i_by.full_name,
         i.invited_by_role,
         i.profession,
         CASE
           WHEN i.used_at IS NOT NULL THEN 'used'
           WHEN i.expires_at < now()  THEN 'expired'
           ELSE 'valid'
         END,
         i.permissions,
         i.expires_at
    FROM public.staff_invitations i
    JOIN public.profiles a ON a.id = i.athlete_id
    LEFT JOIN public.profiles c ON c.id = a.coach_id
    LEFT JOIN public.profiles i_by ON i_by.id = i.invited_by
   WHERE i.token = p_token;
$$;

REVOKE ALL ON FUNCTION public.get_staff_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_invitation(text) TO anon, authenticated, service_role;

COMMIT;
