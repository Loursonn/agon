-- Accord IA (`ai_programming`) réservé aux 18 ans et plus.
--
-- Pourquoi : les conditions de l'API Gemini interdisent de l'utiliser dans un service destiné aux
-- moins de 18 ans ou susceptible d'être utilisé par eux ; les conditions grand public de Claude
-- (assistant du coach) exigent aussi 18 ans. Agon accepte les 15-17 ans. Revue juridique :
-- docs/juridique/REVUE_2026-11.md, risque C2.
--
-- Effet :
--   1. Trigger BEFORE INSERT sur user_consents : un accord IA donné par un utilisateur dont la
--      date de naissance indique moins de 18 ans est enregistré en REFUS, avec le motif dans
--      `statement`. Pas d'erreur levée : le client de `main`, qui propose encore la case aux
--      mineurs, ne casse pas (l'utilisateur passe l'écran, l'accord est simplement refusé).
--      Date de naissance absente (comptes antérieurs au contrôle d'âge) : rien n'est changé.
--   2. Rattrapage : pour chaque mineur dont l'accord IA courant est « oui », une ligne de refus
--      est ajoutée au journal (append-only : rien n'est modifié ni supprimé). Toutes les
--      lectures serveur (`hasConsent`, `coach-api`, `ai_eligible_sources`) passent par
--      `current_consents` : elles voient le refus aussitôt.
--
-- Compatible avec le client de `main`. Appliquée en prod le 2026-11-13 avec l'accord d'Hugo.
-- Test : supabase/tests/ai_consent_adults_only.sql.

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

REVOKE ALL ON FUNCTION public.ai_consent_adults_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_consents_ai_adults_only ON public.user_consents;
CREATE TRIGGER user_consents_ai_adults_only
  BEFORE INSERT ON public.user_consents
  FOR EACH ROW EXECUTE FUNCTION public.ai_consent_adults_only();

-- Rattrapage : refus ajouté au journal pour les mineurs dont l'accord IA courant est « oui ».
INSERT INTO public.user_consents (user_id, purpose, granted, doc_version, statement)
SELECT c.user_id, 'ai_programming', false, c.doc_version,
       'Refus enregistré automatiquement le 2026-11-13 : accord IA réservé aux 18 ans et plus (revue juridique).'
FROM public.current_consents c
JOIN public.profiles p ON p.id = c.user_id
WHERE c.purpose = 'ai_programming'
  AND c.granted
  AND p.birth_date IS NOT NULL
  AND p.birth_date > ((now() AT TIME ZONE 'Etc/GMT+12')::date - interval '18 years')::date;
