-- Retour arrière de 20261114120000_ai_requires_birth_date (à n'utiliser qu'en cas de problème).
-- Remet la vue current_consents et le trigger ai_consent_adults_only tels qu'avant
-- (définitions de supabase/tests/ci/schema.sql au 2026-11-14). Le journal user_consents n'est
-- jamais modifié par la migration ni par ce retour : les accords reprennent leur valeur brute.
--   "$PROD" supabase db query --linked -f supabase/pending/20261114120000_ai_requires_birth_date.rollback.sql
-- puis retirer 20261114120000 de l'historique :
--   "$PROD" supabase migration repair --status reverted 20261114120000 --linked

CREATE OR REPLACE VIEW public.current_consents WITH (security_invoker = true) AS
SELECT DISTINCT ON (user_id, purpose) user_id,
       purpose,
       granted,
       doc_version,
       created_at AS decided_at
  FROM public.user_consents
 ORDER BY user_id, purpose, seq DESC;

COMMENT ON VIEW public.current_consents IS
  'Dernière décision par finalité. Ordonnée par seq et non par created_at : deux décisions d''une même transaction partagent le même created_at, ce qui rendait la décision courante indéterminée.';

CREATE OR REPLACE FUNCTION public.ai_consent_adults_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_birth date;
BEGIN
  IF NEW.purpose <> 'ai_programming' OR NOT NEW.granted THEN
    RETURN NEW;
  END IF;
  SELECT birth_date INTO v_birth FROM public.profiles WHERE id = NEW.user_id;
  -- « Aujourd'hui » = UTC-12 : personne n'est déclaré majeur trop tôt à cause du fuseau.
  IF v_birth IS NOT NULL
     AND v_birth > ((now() AT TIME ZONE 'Etc/GMT+12')::date - interval '18 years')::date THEN
    NEW.granted := false;
    NEW.statement := 'Refus enregistré automatiquement : accord IA réservé aux 18 ans et plus. '
                     || 'Libellé affiché : ' || coalesce(NEW.statement, '');
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.ai_consent_adults_only() IS
  'Accord ai_programming réservé aux 18 ans et plus (conditions Gemini et Claude) : un accord donné avant 18 ans est enregistré en refus. Revue juridique 2026-11, risque C2.';
