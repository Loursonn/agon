-- Athlètes pré-créés par le coach avant leur première connexion.
--
-- Principe : on crée un vrai compte auth « fantôme » (Edge Function pending-athlete,
-- email jetable, mot de passe aléatoire inconnu de tous). Le coach programme dessus
-- normalement. L'athlète réclame ce compte via un lien à jeton secret : il y choisit
-- son email et son mot de passe (Edge Function claim-athlete). Aucune donnée à migrer.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_pending boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_pending IS
  'true = compte pré-créé par le coach, pas encore réclamé par l''athlète.';

-- Jetons de réclamation. Écriture réservée au service_role (Edge Functions).
CREATE TABLE IF NOT EXISTS public.athlete_claims (
  athlete_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.athlete_claims ENABLE ROW LEVEL SECURITY;

-- Le coach de l'athlète peut relire le jeton pour (re)copier le lien.
DROP POLICY IF EXISTS "athlete_claims_select_coach" ON public.athlete_claims;
CREATE POLICY "athlete_claims_select_coach" ON public.athlete_claims
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = athlete_claims.athlete_id AND p.coach_id = auth.uid()
    )
  );

-- Infos affichées sur la page du lien (avant toute connexion). Le jeton secret
-- fait office d'autorisation ; ne renvoie rien pour un jeton inconnu ou déjà utilisé.
CREATE OR REPLACE FUNCTION public.get_claim_info(p_token text)
RETURNS TABLE (first_name text, last_name text, coach_code text, coach_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT a.first_name, a.last_name, c.coach_code, c.full_name
  FROM athlete_claims ac
  JOIN profiles a ON a.id = ac.athlete_id AND a.is_pending
  LEFT JOIN profiles c ON c.id = a.coach_id
  WHERE ac.token = p_token
$$;

GRANT EXECUTE ON FUNCTION public.get_claim_info(text) TO anon, authenticated;
