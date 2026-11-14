-- Accord IA sans effet tant que la date de naissance n'est pas connue (revue juridique C2, phase 2).
--
-- À APPLIQUER SEULEMENT APRÈS la mise en production (main) de l'écran « Ta date de naissance »
-- (BirthDateGate) et de la migration 20261114110000_set_my_birth_date : avant, un compte sans date
-- perdrait l'IA sans aucun moyen de saisir sa date.
--
-- Effet :
--   1. Vue current_consents : pour `ai_programming`, `granted` ne vaut vrai que si la date de
--      naissance est connue et indique 18 ans ou plus (UTC-12, comme ai_consent_adults_only).
--      Toutes les lectures serveur de l'accord IA passent par cette vue (`hasConsent` des Edge
--      Functions ai-program et athlete-insights, coach-api, ai_eligible_sources) : l'IA s'arrête
--      pour ces comptes sans rien effacer du journal, et reprend d'elle-même dès que la date est
--      saisie (18 ans ou plus). Les autres finalités sont inchangées.
--      Jointure sous la RLS de l'appelant (vue security_invoker) : si l'appelant ne peut pas lire
--      le profil, l'accord IA lu vaut « non » (sûr), et rien d'autre n'est révélé.
--   2. Trigger ai_consent_adults_only : un accord IA donné sans date connue est enregistré en refus,
--      comme un accord donné avant 18 ans.
--
-- Test : supabase/pending/tests/ai_requires_birth_date.sql (à déplacer dans supabase/tests/).

CREATE OR REPLACE VIEW public.current_consents WITH (security_invoker = true) AS
SELECT d.user_id,
       d.purpose,
       CASE
         WHEN d.purpose = 'ai_programming' THEN
           d.granted
           AND p.birth_date IS NOT NULL
           AND p.birth_date <= ((now() AT TIME ZONE 'Etc/GMT+12')::date - interval '18 years')::date
         ELSE d.granted
       END AS granted,
       d.doc_version,
       d.decided_at
  FROM (
    SELECT DISTINCT ON (c.user_id, c.purpose) c.user_id, c.purpose, c.granted, c.doc_version,
           c.created_at AS decided_at
      FROM public.user_consents c
     ORDER BY c.user_id, c.purpose, c.seq DESC
  ) d
  LEFT JOIN public.profiles p ON p.id = d.user_id;

COMMENT ON VIEW public.current_consents IS
  'Dernière décision par finalité. Ordonnée par seq et non par created_at : deux décisions d''une même transaction partagent le même created_at, ce qui rendait la décision courante indéterminée. Accord IA (ai_programming) : vrai seulement si la date de naissance est connue et indique 18 ans ou plus (revue juridique 2026-11, C2).';

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
  IF v_birth IS NULL THEN
    NEW.granted := false;
    NEW.statement := 'Refus enregistré automatiquement : date de naissance inconnue, accord IA réservé aux 18 ans et plus. '
                     || 'Libellé affiché : ' || coalesce(NEW.statement, '');
  -- « Aujourd'hui » = UTC-12 : personne n'est déclaré majeur trop tôt à cause du fuseau.
  ELSIF v_birth > ((now() AT TIME ZONE 'Etc/GMT+12')::date - interval '18 years')::date THEN
    NEW.granted := false;
    NEW.statement := 'Refus enregistré automatiquement : accord IA réservé aux 18 ans et plus. '
                     || 'Libellé affiché : ' || coalesce(NEW.statement, '');
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.ai_consent_adults_only() IS
  'Accord ai_programming réservé aux 18 ans et plus (conditions Gemini et Claude) : un accord donné avant 18 ans, ou sans date de naissance connue, est enregistré en refus. Revue juridique 2026-11, risque C2.';
