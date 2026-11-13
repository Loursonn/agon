-- P43 · planche CoachOrdiBParametres : interrupteur « Mode coach-athlète ».
-- Un coach peut s'entraîner aussi (coach_athlete) ou redevenir seulement coach.
-- Le rôle reste verrouillé par guard_profile_privileged_fields ; seule
-- set_coach_athlete() peut basculer coach <-> coach_athlete, pour l'appelant.
-- Activer : s'il n'a pas de coach, il devient son propre coach (apparaît dans
-- sa liste). Désactiver : il quitte la liste où il était suivi (coach_id = NULL).
-- Aucune donnée d'entraînement supprimée.

CREATE OR REPLACE FUNCTION "public"."guard_profile_privileged_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

CREATE OR REPLACE FUNCTION public.set_coach_athlete(p_enabled boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'non connecté' USING ERRCODE = '42501'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('coach', 'coach_athlete') THEN
    RAISE EXCEPTION 'Réservé aux coachs' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('agon.role_switch', 'on', true);
  IF p_enabled THEN
    UPDATE public.profiles
       SET role = 'coach_athlete', coach_id = coalesce(coach_id, v_uid)
     WHERE id = v_uid;
  ELSE
    UPDATE public.profiles SET role = 'coach', coach_id = NULL WHERE id = v_uid;
  END IF;
  PERFORM set_config('agon.role_switch', '', true);
  RETURN CASE WHEN p_enabled THEN 'coach_athlete' ELSE 'coach' END;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_coach_athlete(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_coach_athlete(boolean) TO authenticated;
