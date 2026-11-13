-- P43 · planche « Premier lancement » (Ath1Onboarding).
-- Après l'accord sur les données de santé, un nouvel athlète voit 4 écrans
-- (bienvenue, montre, premier wellness, bulles d'aide) une seule fois, quel
-- que soit l'appareil : la date de fin est gardée sur son profil.
-- Additif : 1 colonne nullable ; les comptes existants sont marqués comme
-- déjà accueillis (ils connaissent l'app) ; 1 RPC qui ne touche que la ligne
-- de l'appelant.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

UPDATE public.profiles SET onboarded_at = coalesce(created_at, now()) WHERE onboarded_at IS NULL;

COMMENT ON COLUMN public.profiles.onboarded_at IS 'Fin (ou saut) du premier lancement athlète ; null = à montrer';

CREATE OR REPLACE FUNCTION public.mark_onboarded()
 RETURNS timestamptz
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'non connecté' USING ERRCODE = '42501'; END IF;
  UPDATE public.profiles SET onboarded_at = coalesce(onboarded_at, now())
   WHERE id = auth.uid() RETURNING onboarded_at INTO v;
  RETURN v;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_onboarded() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_onboarded() TO authenticated;
