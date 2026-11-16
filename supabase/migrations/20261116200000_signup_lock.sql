-- Inscription fermée, TEMPS 2 : le serveur refuse tout profil créé hors des RPC d'inscription.
--
-- Temps 1 (20261116170000_signup_invitations) : register_coach (invitation liée à un e-mail),
-- register_athlete (code coach) et register_staff (invitation staff) créent le profil en posant
-- le drapeau de transaction `agon.signup` autour de l'INSERT. Le client en prod (main, PR 157)
-- ne fait plus d'INSERT direct dans profiles.
--
-- Ici : un utilisateur connecté (ni admin, ni service) qui insère dans profiles sans ce drapeau
-- est refusé. Sans changement : service_role et Edge Functions (auth.uid() NULL), admin,
-- trigger d'âge minimum, contrôles de rôle et de rattachement, branche UPDATE.

CREATE OR REPLACE FUNCTION public.guard_profile_privileged_fields() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
    -- Inscription fermée (Hugo, 15/11/2026) : un profil ne naît que par register_coach,
    -- register_athlete ou register_staff, qui posent agon.signup.
    IF coalesce(current_setting('agon.signup', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Inscription : passe par ton lien d''invitation ou le code de ton coach' USING ERRCODE = '42501';
    END IF;
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
  -- Seule exception : coach <-> coach_athlete via set_coach_athlete() (agon.role_switch).
  IF NEW.role IS DISTINCT FROM OLD.role
     AND NOT (coalesce(current_setting('agon.role_switch', true), '') = 'on'
              AND v_uid = OLD.id
              AND OLD.role IN ('coach', 'coach_athlete')
              AND NEW.role IN ('coach', 'coach_athlete')) THEN
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
