-- Anciens liens d'invitation coach (/invite/:token) : inutilisables, tout de suite.
-- Les 30 jetons de public.invitations n'expiraient jamais (invitation_is_valid ne regardait
-- que used_at) et plus aucun écran n'en crée : un vieux lien suffisait à se rattacher à un
-- coach. Décision 6 (docs/PLAN_LEGACY.md §1), étape « fermer » avancée pour la sécurité.
--
-- Les deux RPC gardent leur signature (le client de main les appelle encore) : la
-- vérification répond « invalide », l'utilisation refuse. Aucune donnée touchée ; la table
-- reste lisible par son coach tant que l'export RGPD de main la lit (suppression : étape suivante).
-- Retour arrière : recréer les deux fonctions depuis 20261107100000_security_rpcs.sql.

CREATE OR REPLACE FUNCTION public.invitation_is_valid(p_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.redeem_invitation(p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Ce lien d''invitation n''est plus valable : demande le code coach.' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.invitation_is_valid(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invitation_is_valid(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(text) TO authenticated, service_role;
