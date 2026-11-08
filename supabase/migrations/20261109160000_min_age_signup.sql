-- Âge minimum (15 ans) à la création d'un compte — PHASE 1 (avant déploiement du nouveau client).
--
-- ⚠️ Ordre : déployer d'abord l'Edge Function `claim-athlete` de `dev` (elle
-- contrôle l'erreur de mise à jour du profil ; celle de `main` l'ignore).
-- ⚠️ Ne pas rejouer ce fichier après la phase 2 (20261109170000) : il
-- recrée la fonction et annulerait la phase 2 sans prévenir.
--
-- Rollback :
--   DROP TRIGGER IF EXISTS trg_enforce_min_age_on_signup ON public.profiles;
--   DROP FUNCTION IF EXISTS public.enforce_min_age_on_signup();
--   DROP FUNCTION IF EXISTS public.signup_birth_date_error(date, date, int);
--
-- Les CGU et la politique de confidentialité (§9 « Mineurs ») annoncent 15 ans
-- minimum ; jusqu'ici rien ne le vérifiait. Décision Hugo (2026-11-08) : date
-- de naissance obligatoire à l'inscription, moins de 15 ans = refus, comptes
-- existants non touchés.
--
-- « Création de compte » =
--   • INSERT d'un profil (inscription coach / athlète / staff : le client insère
--     sa ligne `profiles` juste après `auth.signUp`) ;
--   • activation d'un compte pré-créé par le coach (`is_pending` true → false,
--     Edge Function `claim-athlete`).
-- Toute autre mise à jour (coach qui corrige une date de naissance, profil
-- existant…) n'est PAS contrôlée : les comptes existants ne sont pas touchés.
--
-- Phase 1 : date ABSENTE = acceptée. Le client de prod (`main`) ne l'envoie
-- pas encore ; la refuser casserait toutes les inscriptions. Une date PRÉSENTE
-- est vérifiée (invalide, future, < 15 ans → refus).
-- Phase 2 (20261109170000, à appliquer APRÈS le déploiement sur `main` du
-- client qui envoie la date) : date absente refusée pour une inscription par
-- l'utilisateur lui-même et pour une activation.
--
-- « Aujourd'hui » = le jour le plus avancé sur Terre (UTC+14) : personne n'est
-- refusé le jour de ses 15 ans à cause du fuseau du serveur (tolérance < 1 j).
-- Né un 29 février : 15 ans le 1er mars les années non bissextiles (règle de
-- `date - interval`, la même que `@shared/domain/age`).
--
-- Application (après accord d'Hugo) :
--   supabase db query --linked -f supabase/migrations/20261109160000_min_age_signup.sql
-- Test à blanc : supabase/tests/min_age_signup.sql.

-- Règle pure, testable avec des dates fixes.
CREATE OR REPLACE FUNCTION public.signup_birth_date_error(p_birth date, p_today date, p_min int DEFAULT 15)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_birth IS NULL THEN NULL
    WHEN p_birth > p_today OR p_birth < date '1900-01-01' THEN 'Date de naissance invalide.'
    WHEN p_birth > (p_today - make_interval(years => p_min))::date
      THEN 'Tu dois avoir au moins 15 ans pour utiliser Agon.'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.signup_birth_date_error(date, date, int) IS
  'Message de refus pour une date de naissance à l''inscription (null = acceptée ou absente). Voir 20261109160000.';

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

  -- PHASE 1 : date absente acceptée (client `main` qui ne l'envoie pas encore).
  IF NEW.birth_date IS NULL THEN
    RETURN NEW;
  END IF;

  v_msg := public.signup_birth_date_error(NEW.birth_date, v_today);
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION '%', v_msg USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_min_age_on_signup ON public.profiles;
CREATE TRIGGER trg_enforce_min_age_on_signup
  BEFORE INSERT OR UPDATE OF is_pending ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_min_age_on_signup();
