-- =============================================================================
-- Suivi de la version de l'app côté serveur (P4, docs/SANTE_TABLES.md)
--
-- But : compter les clients qui tournent encore sur une vieille version avant
-- de supprimer les anciennes clés `app_data` (étapes 3 et 4 de la santé).
--
-- 1. `profiles.client_build` (text) : identifiant du dernier build vu
--    (SHA du commit Vercel, ou `local-<horodatage>` hors production).
-- 2. `profiles.client_build_at` (timestamptz) : dernière fois où il a été vu.
-- 3. `report_client_build(p_build text)` : appelée par l'app au démarrage et au
--    retour au premier plan. Écrit sur le profil de l'appelant uniquement.
--    N'écrit pas si le build est inchangé et vu depuis moins d'une heure
--    (pas d'écriture à chaque bascule d'onglet).
--
-- Additif et compatible avec le client en production (`main`) : deux colonnes
-- nullables et une fonction que seul le nouveau client appelle. Aucune policy
-- modifiée, aucune donnée existante touchée. `profiles` n'a pas de colonne
-- `updated_at`, donc rien d'autre ne bouge.
--
-- Comptage (à lancer à la main, aucune donnée d'athlète affichée) :
--   select client_build, count(*) from profiles
--    where client_build_at > now() - interval '30 days' group by 1 order by 2 desc;
--
-- Rollback : DROP FUNCTION public.report_client_build(text);
--            ALTER TABLE public.profiles DROP COLUMN client_build, DROP COLUMN client_build_at;
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS client_build    text,
  ADD COLUMN IF NOT EXISTS client_build_at timestamptz;

CREATE OR REPLACE FUNCTION public.report_client_build(p_build text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_build IS NULL OR length(p_build) = 0 OR length(p_build) > 80 THEN
    RAISE EXCEPTION 'Version invalide' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET client_build = p_build,
         client_build_at = now()
   WHERE id = v_me
     AND (client_build IS DISTINCT FROM p_build
          OR client_build_at IS NULL
          OR client_build_at < now() - interval '1 hour');
END;
$$;

REVOKE ALL ON FUNCTION public.report_client_build(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_client_build(text) TO authenticated;
