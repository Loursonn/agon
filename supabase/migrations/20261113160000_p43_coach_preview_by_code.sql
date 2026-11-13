-- P43 (planche AccesConnexion, écran 04) : à l'inscription, le code coach est
-- vérifié dès le 6e caractère et le coach trouvé s'affiche avant de confirmer.
-- coach_code_exists (anon) disait déjà si un code existe ; on renvoie en plus
-- le nom affiché du coach, rien d'autre (ni id, ni e-mail).
CREATE OR REPLACE FUNCTION public.coach_preview_by_code(p_code text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(nullif(trim(full_name), ''), 'Ton coach')
    FROM public.profiles
   WHERE length(trim(coalesce(p_code, ''))) = 6
     AND coach_code = upper(trim(p_code))
     AND role IN ('coach', 'coach_athlete')
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.coach_preview_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_preview_by_code(text) TO anon, authenticated, service_role;
