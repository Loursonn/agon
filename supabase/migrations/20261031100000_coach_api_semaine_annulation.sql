-- Assistant IA du coach : semaine d'entraînement, écriture directe, annulation.
--
-- 1. Nouvelle proposition « semaine » : séances créées et placées, thème de
--    chaque jour.
-- 2. Une proposition s'applique côté serveur (clic du coach dans Agon, ou
--    directement par l'assistant quand le coach le lui demande). `applied_via`
--    dit lequel.
-- 3. Chaque application garde l'état d'avant (`undo`) : elle s'annule, et
--    passe alors au statut `undone`. Seul le serveur écrit ce journal.

ALTER TABLE public.coach_api_drafts
  DROP CONSTRAINT IF EXISTS coach_api_drafts_kind_check;
ALTER TABLE public.coach_api_drafts
  ADD CONSTRAINT coach_api_drafts_kind_check
  CHECK (kind IN ('axe', 'programme', 'planning', 'objectifs', 'semaine'));

ALTER TABLE public.coach_api_drafts
  DROP CONSTRAINT IF EXISTS coach_api_drafts_status_check;
ALTER TABLE public.coach_api_drafts
  ADD CONSTRAINT coach_api_drafts_status_check
  CHECK (status IN ('pending', 'applied', 'rejected', 'undone'));

ALTER TABLE public.coach_api_drafts
  ADD COLUMN IF NOT EXISTS undo jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(undo) = 'array'),
  ADD COLUMN IF NOT EXISTS applied_via text
    CHECK (applied_via IN ('app', 'api')),
  ADD COLUMN IF NOT EXISTS undone_at timestamptz;

-- Le coach ne peut plus que lire ces colonnes : l'application et
-- l'annulation passent par l'Edge Function. Il garde le droit d'écarter
-- (status, decided_at), accordé par 20261030100000.
REVOKE UPDATE (undo, applied_via, undone_at) ON public.coach_api_drafts FROM authenticated;

-- Depuis l'app, le coach ne fait plus qu'écarter une proposition en attente.
-- Appliquer et annuler passent par le serveur, qui tient le journal : un
-- statut remis à « pending » à la main ferait réappliquer en perdant la
-- possibilité d'annuler la première fois.
DROP POLICY IF EXISTS coach_api_drafts_decide_own ON public.coach_api_drafts;
CREATE POLICY coach_api_drafts_decide_own ON public.coach_api_drafts
  FOR UPDATE TO authenticated
  USING (coach_id = auth.uid() AND status = 'pending')
  WITH CHECK (coach_id = auth.uid() AND status = 'rejected');
