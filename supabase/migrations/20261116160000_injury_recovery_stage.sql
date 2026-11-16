-- Étape de résolution d'une blessure (Hugo, 15/11/2026) : Blessé →
-- Réhabilitation → Réhab presque finie → Réathlétisation → Guéri.
-- Changée en un geste par l'athlète, ses coachs et le staff autorisé (mêmes
-- droits que la blessure : RLS de medical_entries, inchangée), depuis la carte
-- blessure du profil et depuis Retours. Historique daté de chaque étape.
-- L'assistant IA du coach lit l'étape comme il lit le statut (liste blanche
-- @shared/domain/injuries).
--
-- Additif seulement :
--   - colonne `medical_entries.recovery_stage` ; `status` reste la source des
--     badges « blessure active », de report_session_pain et de l'IA : un
--     déclencheur garde les deux d'accord (Guéri ⇔ gueri, sinon en_cours).
--     Un client qui n'écrit que `status` (version en prod avant déploiement,
--     formulaire de blessure) reste juste : en_cours → Blessé, gueri → Guéri ;
--   - table `injury_stage_history` : une ligne par étape atteinte (date, auteur),
--     écrite par le déclencheur seulement (aucune policy d'écriture), lue par
--     l'athlète, ses coachs et le staff autorisé sur « medical » ;
--   - reprise des blessures existantes : en cours → Blessé (historique daté du
--     début de la blessure), guérie → Guéri ; `updated_at` n'est pas touché.
-- Aucune donnée de soin (décision du 13/11) : une étape, une date, un auteur.
-- Tests : supabase/tests/injury_recovery_stage.sql.

ALTER TABLE public.medical_entries ADD COLUMN IF NOT EXISTS recovery_stage text;
ALTER TABLE public.medical_entries DROP CONSTRAINT IF EXISTS medical_entries_recovery_stage_check;
ALTER TABLE public.medical_entries ADD CONSTRAINT medical_entries_recovery_stage_check
  CHECK (recovery_stage IS NULL OR recovery_stage = ANY (ARRAY['blesse', 'rehabilitation', 'rehab_fin', 'reathletisation', 'gueri']));
COMMENT ON COLUMN public.medical_entries.recovery_stage IS 'Étape de résolution : blesse | rehabilitation | rehab_fin | reathletisation | gueri. Tenue d''accord avec status par medical_entries_sync_stage.';

CREATE TABLE IF NOT EXISTS public.injury_stage_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id   uuid NOT NULL REFERENCES public.medical_entries(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stage      text NOT NULL CHECK (stage = ANY (ARRAY['blesse', 'rehabilitation', 'rehab_fin', 'reathletisation', 'gueri'])),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.injury_stage_history IS 'Étapes de résolution d''une blessure, datées (15/11/2026). Écrite par le déclencheur medical_entries_log_stage seulement.';

CREATE INDEX IF NOT EXISTS injury_stage_history_entry_idx ON public.injury_stage_history (entry_id, changed_at);
CREATE INDEX IF NOT EXISTS injury_stage_history_athlete_idx ON public.injury_stage_history (athlete_id);
CREATE INDEX IF NOT EXISTS injury_stage_history_changed_by_idx ON public.injury_stage_history (changed_by) WHERE changed_by IS NOT NULL;

ALTER TABLE public.injury_stage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS injury_stage_history_read ON public.injury_stage_history;
CREATE POLICY injury_stage_history_read ON public.injury_stage_history FOR SELECT TO authenticated
  USING (athlete_id = (SELECT auth.uid()) OR ((SELECT public.i_am_coach()) AND public.is_coach_of(athlete_id)));

DROP POLICY IF EXISTS staff_injury_stage_history_read ON public.injury_stage_history;
CREATE POLICY staff_injury_stage_history_read ON public.injury_stage_history FOR SELECT TO authenticated
  USING ((SELECT public.i_am_staff()) AND public.staff_can(athlete_id, 'medical', 'read'));

-- Reprise des blessures existantes, sans toucher updated_at.
ALTER TABLE public.medical_entries DISABLE TRIGGER set_medical_entries_updated_at;
UPDATE public.medical_entries
   SET recovery_stage = CASE WHEN status = 'gueri' THEN 'gueri' ELSE 'blesse' END
 WHERE recovery_stage IS NULL;
ALTER TABLE public.medical_entries ENABLE TRIGGER set_medical_entries_updated_at;

INSERT INTO public.injury_stage_history (entry_id, athlete_id, stage, changed_at, changed_by)
SELECT m.id, m.athlete_id, 'blesse', least(coalesce(m.date::timestamptz, m.created_at), m.created_at), NULL
  FROM public.medical_entries m
 WHERE m.status = 'en_cours'
   AND NOT EXISTS (SELECT 1 FROM public.injury_stage_history h WHERE h.entry_id = m.id);

-- Étape et statut toujours d'accord. L'étape commande ; un client qui ne
-- change que le statut (formulaire, ancienne version) fixe l'étape.
CREATE OR REPLACE FUNCTION public.medical_entries_sync_stage() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.recovery_stage IS NOT DISTINCT FROM OLD.recovery_stage
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.recovery_stage := CASE WHEN NEW.status = 'gueri' THEN 'gueri' ELSE 'blesse' END;
  END IF;
  IF NEW.recovery_stage IS NULL THEN
    NEW.recovery_stage := CASE WHEN NEW.status = 'gueri' THEN 'gueri' ELSE 'blesse' END;
  END IF;
  NEW.status := CASE WHEN NEW.recovery_stage = 'gueri' THEN 'gueri' ELSE 'en_cours' END;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.medical_entries_sync_stage() IS 'Garde recovery_stage et status d''accord (Guéri ⇔ gueri, sinon en_cours), 15/11/2026.';

-- Historique : une ligne à chaque étape atteinte. À la création, l'étape est
-- datée du début de la blessure s'il est passé.
CREATE OR REPLACE FUNCTION public.medical_entries_log_stage() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.injury_stage_history (entry_id, athlete_id, stage, changed_at, changed_by)
    VALUES (NEW.id, NEW.athlete_id, NEW.recovery_stage,
            least(coalesce(NEW.date::timestamptz, now()), now()), auth.uid());
  ELSIF NEW.recovery_stage IS DISTINCT FROM OLD.recovery_stage THEN
    INSERT INTO public.injury_stage_history (entry_id, athlete_id, stage, changed_by)
    VALUES (NEW.id, NEW.athlete_id, NEW.recovery_stage, auth.uid());
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.medical_entries_log_stage() IS 'Écrit injury_stage_history à chaque étape atteinte (15/11/2026).';

REVOKE ALL ON FUNCTION public.medical_entries_sync_stage() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.medical_entries_log_stage() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS medical_entries_sync_stage ON public.medical_entries;
CREATE TRIGGER medical_entries_sync_stage BEFORE INSERT OR UPDATE ON public.medical_entries
  FOR EACH ROW EXECUTE FUNCTION public.medical_entries_sync_stage();

DROP TRIGGER IF EXISTS medical_entries_log_stage ON public.medical_entries;
CREATE TRIGGER medical_entries_log_stage AFTER INSERT OR UPDATE OF recovery_stage, status ON public.medical_entries
  FOR EACH ROW EXECUTE FUNCTION public.medical_entries_log_stage();
