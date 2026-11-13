-- Date de naissance des comptes qui n'en ont pas (revue juridique C2, roadmap
-- T-demander-la-date-de-naissance-aux-compte).
--
-- Pourquoi : 19 profils sur 36 (13/11) n'ont pas de date de naissance (comptes antérieurs au contrôle
-- d'âge du 2026-11-09). Le garde-fou « accord IA réservé aux 18 ans » (20261113220000) ne peut rien
-- pour eux. Le client leur demande la date une fois, au lancement, et l'écrit ici.
--
-- set_my_birth_date(p_birth) — l'utilisateur connecté, pour lui-même, une seule fois :
--   - refuse si une date existe déjà (la modifier passe par la fiche, comme avant) ;
--   - même contrôle qu'à l'inscription (signup_birth_date_error : date valide, 15 ans) ;
--   - si la personne a moins de 18 ans et que son accord IA courant est « oui » : refus ajouté au
--     journal des accords, dans la même transaction (même règle et même fuseau, UTC-12, que
--     ai_consent_adults_only). Rien n'est modifié ni supprimé dans user_consents.
--
-- Additive : le client de `main` ne l'appelle pas. Couper l'IA aux comptes encore sans date se fera
-- dans une seconde migration, APRÈS la mise en production de l'écran (sinon ces comptes perdraient
-- l'IA sans pouvoir saisir leur date).
-- Test : supabase/tests/set_my_birth_date.sql.

CREATE OR REPLACE FUNCTION public.set_my_birth_date(p_birth date)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current date;
  v_found boolean;
  -- Jour le plus tardif du globe pour le seuil de 15 ans (comme enforce_min_age_on_signup),
  -- le plus précoce pour celui de 18 ans (comme ai_consent_adults_only) : jamais trop strict à
  -- l'inscription, jamais majeur trop tôt pour l'IA.
  v_today_min date := ((now() AT TIME ZONE 'UTC') + interval '14 hours')::date;
  v_today_ai date := (now() AT TIME ZONE 'Etc/GMT+12')::date;
  v_msg text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_birth IS NULL THEN
    RAISE EXCEPTION 'Indique ta date de naissance.' USING ERRCODE = '23514';
  END IF;

  SELECT birth_date, true INTO v_current, v_found FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT coalesce(v_found, false) THEN
    RAISE EXCEPTION 'Profil introuvable' USING ERRCODE = 'P0002';
  END IF;
  IF v_current IS NOT NULL THEN
    RAISE EXCEPTION 'Date de naissance déjà renseignée' USING ERRCODE = '23505';
  END IF;

  v_msg := public.signup_birth_date_error(p_birth, v_today_min);
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION '%', v_msg USING ERRCODE = '23514';
  END IF;

  UPDATE public.profiles SET birth_date = p_birth WHERE id = v_uid;

  IF p_birth > (v_today_ai - interval '18 years')::date THEN
    INSERT INTO public.user_consents (user_id, purpose, granted, doc_version, statement)
    SELECT c.user_id, 'ai_programming', false, c.doc_version,
           'Refus enregistré automatiquement à la saisie de la date de naissance : accord IA réservé aux 18 ans et plus.'
      FROM public.current_consents c
     WHERE c.user_id = v_uid AND c.purpose = 'ai_programming' AND c.granted;
  END IF;

  RETURN p_birth;
END;
$$;

COMMENT ON FUNCTION public.set_my_birth_date(date) IS
  'Saisie unique de la date de naissance par un compte qui n''en a pas (contrôle 15 ans ; accord IA retiré avant 18 ans). Revue juridique 2026-11, C2.';

REVOKE ALL ON FUNCTION public.set_my_birth_date(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_birth_date(date) TO authenticated;
