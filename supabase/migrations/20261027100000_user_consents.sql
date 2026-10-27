-- Consentement RGPD explicite et versionné.
--
-- Pourquoi une table dédiée plutôt qu'un booléen sur profiles : l'article 7.1
-- du RGPD impose de pouvoir *démontrer* que le consentement a été recueilli.
-- Un booléen ne dit ni quand, ni à quelle version du texte, ni depuis quelle
-- adresse — et il est écrasé au retrait, donc il ne prouve rien. On garde donc
-- un journal append-only : chaque don et chaque retrait est une ligne.
--
-- Les données d'entraînement et de bien-être relèvent de l'article 9 (données
-- de santé) : leur traitement est interdit par défaut et le consentement doit
-- être explicite, spécifique par finalité, et aussi facile à retirer qu'à
-- donner. D'où le découpage en `purpose`.

-- ---------------------------------------------------------------------------
-- Finalités distinctes. Chacune doit pouvoir être acceptée ou refusée seule,
-- sinon le consentement n'est pas « spécifique » au sens de l'art. 6.1.a.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consent_purpose') THEN
    CREATE TYPE public.consent_purpose AS ENUM (
      -- Socle obligatoire : sans lui l'app n'a pas d'objet. Traitement des
      -- données de santé saisies dans l'app et partage au coach rattaché.
      'health_data',
      -- Facultatif : génération de programme par IA (Google Gemini).
      'ai_programming',
      -- Facultatif, un par fournisseur : récupération automatique des données
      -- de montre. Séparés car l'utilisateur peut n'en connecter qu'un.
      'garmin_sync',
      'coros_sync'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_consents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose     public.consent_purpose NOT NULL,
  -- true = consentement donné, false = consentement retiré. On insère une
  -- nouvelle ligne au lieu de modifier : l'historique est la preuve.
  granted     boolean NOT NULL,
  -- Version du document accepté (cf. LEGAL_VERSION dans src/lib/legal.ts).
  -- Permet de re-solliciter l'utilisateur quand le texte change vraiment.
  doc_version text NOT NULL,
  -- Copie du libellé exact affiché au moment du clic. Si on reformule la case
  -- six mois plus tard, on sait toujours à quoi l'utilisateur a dit oui.
  statement   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_consents IS
  'Journal append-only des consentements RGPD. Jamais de UPDATE ni de DELETE : un retrait est un INSERT avec granted = false.';
COMMENT ON COLUMN public.user_consents.statement IS
  'Libellé exact affiché à l''utilisateur, archivé pour la charge de la preuve (art. 7.1 RGPD).';

-- Lecture du consentement courant : on cherche la ligne la plus récente par
-- (user_id, purpose). Cet index la rend immédiate.
CREATE INDEX IF NOT EXISTS user_consents_lookup_idx
  ON public.user_consents (user_id, purpose, created_at DESC);

-- ---------------------------------------------------------------------------
-- Vue de l'état courant. Évite de dupliquer la logique « dernière ligne
-- gagne » dans chaque client.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.current_consents
WITH (security_invoker = true) AS
  SELECT DISTINCT ON (user_id, purpose)
    user_id,
    purpose,
    granted,
    doc_version,
    created_at AS decided_at
  FROM public.user_consents
  ORDER BY user_id, purpose, created_at DESC;

COMMENT ON VIEW public.current_consents IS
  'État courant du consentement par utilisateur et finalité (dernière décision). security_invoker : la RLS de user_consents s''applique.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

-- Chacun lit son propre journal — nécessaire pour afficher l'écran de gestion.
DROP POLICY IF EXISTS user_consents_select_own ON public.user_consents;
CREATE POLICY user_consents_select_own ON public.user_consents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Chacun n'écrit que pour lui-même. Pas de politique UPDATE ni DELETE : le
-- journal est immuable, y compris pour son propriétaire. C'est volontaire —
-- une preuve qu'on peut effacer n'est pas une preuve.
DROP POLICY IF EXISTS user_consents_insert_own ON public.user_consents;
CREATE POLICY user_consents_insert_own ON public.user_consents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Le coach ne voit PAS le détail du consentement de ses athlètes : ce n'est pas
-- nécessaire à sa mission, et le minimiser est une obligation (art. 5.1.c). Il
-- constate seulement l'absence de données si l'athlète a refusé.

-- ---------------------------------------------------------------------------
-- Antériorité.
--
-- Les comptes créés avant cette migration n'ont jamais rien signé. On ne peut
-- pas inventer leur consentement : le RGPD interdit le consentement présumé.
-- Ils seront donc sollicités au prochain accès par la barrière applicative
-- (ConsentGate). Aucun backfill ici — c'est un choix, pas un oubli.
-- ---------------------------------------------------------------------------
