-- =============================================================================
-- Sécurité — partie 2b : verrous qui dépendent du nouveau client
-- (audit du 2026-11-07, §1)
--
-- ⚠️ À appliquer APRÈS le déploiement en production (merge dev → main) du client
-- qui utilise coach_code_exists / link_to_coach_by_code / invitation_is_valid /
-- redeem_invitation (partie 1). Sinon l'inscription par code coach,
-- « rejoindre un coach » et les liens d'invitation cassent.
-- Prérequis : parties 1 et 2a appliquées.
-- =============================================================================

-- Profil coach visible par l'utilisateur connecté : son coach, son co-coach,
-- les coachs d'un athlète qu'il coache (référent ↔ co-coach), les coachs des
-- athlètes qu'il suit en tant que staff, ou tout le monde pour un admin.
CREATE OR REPLACE FUNCTION public.coach_profile_visible(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
       p_id = (SELECT coach_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.athlete_co_coaches cc
                WHERE cc.athlete_id = auth.uid() AND cc.co_coach_id = p_id)
    OR EXISTS (SELECT 1 FROM public.profiles a
                WHERE a.coach_id = p_id AND public.is_coach_of(a.id))
    OR EXISTS (SELECT 1 FROM public.athlete_co_coaches cc
                WHERE cc.co_coach_id = p_id AND public.is_coach_of(cc.athlete_id))
    OR EXISTS (SELECT 1 FROM public.athlete_staff s
                 JOIN public.profiles a ON a.id = s.athlete_id
                WHERE s.staff_id = auth.uid()
                  AND (a.coach_id = p_id
                       OR EXISTS (SELECT 1 FROM public.athlete_co_coaches cc
                                   WHERE cc.athlete_id = a.id AND cc.co_coach_id = p_id)))
    OR public.current_user_is_admin()
  );
$$;

REVOKE ALL ON FUNCTION public.coach_profile_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_profile_visible(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- S1 — invitations : plus de lecture publique des tokens
-- (remplacée par invitation_is_valid / redeem_invitation)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS invitations_read_by_token ON public.invitations;

-- -----------------------------------------------------------------------------
-- S2 — profils coach : plus lisibles sans connexion, ni par n'importe qui
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_coaches ON public.profiles;

CREATE POLICY profiles_select_related_coaches ON public.profiles
  FOR SELECT TO authenticated
  USING (public.coach_profile_visible(id));

-- -----------------------------------------------------------------------------
-- S4 (suite) — coach_id : seulement NULL, soi-même (coach-athlète) ou via RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid    := auth.uid();
  v_link boolean := coalesce(current_setting('agon.coach_link', true), '') = 'on';
BEGIN
  -- service_role, cron, éditeur SQL : pas de restriction
  IF v_uid IS NULL OR public.current_user_is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_admin := false;
    NEW.is_certified_coach := false;
    IF NEW.role IS NULL OR NEW.role NOT IN ('athlete', 'coach', 'coach_athlete', 'staff') THEN
      RAISE EXCEPTION 'Rôle invalide' USING ERRCODE = '42501';
    END IF;
    IF NEW.coach_id IS NOT NULL AND NOT v_link
       AND NOT (NEW.coach_id = NEW.id AND NEW.role IN ('coach', 'coach_athlete')) THEN
      RAISE EXCEPTION 'Rattachement à un coach : passer par le code coach' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Le rôle ne peut pas être modifié' USING ERRCODE = '42501';
  END IF;

  IF NEW.coach_id IS DISTINCT FROM OLD.coach_id AND NOT v_link THEN
    IF NEW.coach_id IS NULL THEN
      NULL;  -- quitter son coach, ou coach qui retire un athlète (policy dédiée)
    ELSIF NEW.coach_id = NEW.id AND v_uid = OLD.id AND OLD.role IN ('coach', 'coach_athlete') THEN
      NULL;  -- coach-athlète qui redevient son propre coach
    ELSE
      RAISE EXCEPTION 'Rattachement à un coach : passer par le code coach' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
