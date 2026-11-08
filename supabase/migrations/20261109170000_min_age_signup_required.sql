-- Âge minimum (15 ans) — PHASE 2 : date de naissance OBLIGATOIRE à la création d'un compte.
--
-- ⚠️ NE PAS APPLIQUER avant que `main` (prod Vercel) contienne le client qui
-- envoie la date de naissance (Login, InviteAccept, ClaimAthlete,
-- StaffInviteAccept) ET que l'Edge Function `claim-athlete` soit redéployée
-- avec `BIRTH_DATE_REQUIRED = true`. Sinon toutes les inscriptions faites par
-- l'ancien client sont refusées.
--
-- Change par rapport à la phase 1 (20261109160000) : une date ABSENTE est
-- refusée quand
--   • l'utilisateur insère lui-même son profil (inscription coach / athlète /
--     staff, `auth.uid() = id`) ;
--   • un compte pré-créé est activé (`is_pending` true → false).
-- Restent acceptés sans date : les profils créés côté serveur (service_role,
-- `auth.uid()` nul : athlète pré-créé par le coach via `pending-athlete`,
-- `scripts/seed-demo.mjs`), et toute mise à jour d'un compte existant.
--
-- Application (après accord d'Hugo, après déploiement) :
--   supabase db query --linked -f supabase/migrations/20261109170000_min_age_signup_required.sql
-- Test à blanc : supabase/tests/min_age_signup.sql (détecte la phase).

CREATE OR REPLACE FUNCTION public.enforce_min_age_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_today date := ((now() AT TIME ZONE 'UTC') + interval '14 hours')::date;
  v_msg   text;
BEGIN
  -- Seules la création du profil et l'activation d'un compte pré-créé comptent.
  IF TG_OP = 'UPDATE' AND NOT (coalesce(OLD.is_pending, false) AND NOT coalesce(NEW.is_pending, false)) THEN
    RETURN NEW;
  END IF;

  -- PHASE 2 : date absente refusée, sauf profil créé côté serveur.
  IF NEW.birth_date IS NULL THEN
    IF TG_OP = 'INSERT' AND auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Indique ta date de naissance.' USING ERRCODE = '23514';
  END IF;

  v_msg := public.signup_birth_date_error(NEW.birth_date, v_today);
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION '%', v_msg USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
