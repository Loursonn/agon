-- Propositions de l'assistant IA : l'état de référence devient une empreinte
-- du contenu, plus une date.
--
-- `base_updated_at` devait signaler au coach qu'un programme avait changé
-- depuis la proposition. Il n'aurait rien signalé : `app_data.updated_at`
-- n'est renseigné que par `sSave`, pas par `useUpdateProgrammation`, et aucun
-- trigger ne le tient à jour. La date de `asp:prog` reste donc celle de sa
-- création quoi que le coach édite.
--
-- Faire bouger cette date à chaque édition aurait corrigé le symptôme en
-- changeant ce qu'affichent les fils d'activité qui la lisent
-- (`useRecentActivity`, retours hebdo et mensuels). On compare plutôt le
-- contenu lui-même : SHA-256 du JSON de la clé visée au moment de la
-- proposition, recalculé par l'app au moment d'appliquer.
--
-- Table créée le jour même et encore vide : la colonne est remplacée, pas
-- migrée.

ALTER TABLE public.coach_api_drafts
  ADD COLUMN IF NOT EXISTS base_hash text
  CHECK (base_hash IS NULL OR base_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE public.coach_api_drafts DROP COLUMN IF EXISTS base_updated_at;

COMMENT ON COLUMN public.coach_api_drafts.base_hash IS
  'SHA-256 du JSON de asp:prog (programme, planning) ou asp:goals (objectifs) au moment de la proposition. Différent au moment d''appliquer = le coach est prévenu que la cible a changé.';
