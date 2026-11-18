-- Bilan morpho-anatomique (méthode BilanPro, A. Beck).
--
-- 1. measurement_logs : deux longueurs de plus pour l'analyse osseuse.
--    forearm_length_cm : avant-bras (ulna), olécrane → tête de l'ulna.
--    leg_standing_cm   : jambe debout, EIAS → malléole interne (≠ leg_length_cm,
--                        la mesure MyJump prise couché jusqu'à la pointe du pied).
--    Taille, envergure, humérus (arm_length_cm) et tibia (shank_length_cm) existent déjà.
-- 2. morpho_observations : une ligne par athlète, remplie par le coach dans le
--    profil sportif : observations à l'œil (abdomen, clavicules, cage
--    thoracique, coude) et carte musculaire (muscle → long / court).
--
-- Ajout pur : colonnes nullables, nouvelle table. Le client de prod (main)
-- n'utilise rien de tout ça.

ALTER TABLE public.measurement_logs
  ADD COLUMN IF NOT EXISTS forearm_length_cm numeric(5,1) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS leg_standing_cm   numeric(5,1) DEFAULT NULL;

COMMENT ON COLUMN public.measurement_logs.forearm_length_cm IS 'Longueur d''avant-bras (ulna) : olécrane → tête de l''ulna (cm)';
COMMENT ON COLUMN public.measurement_logs.leg_standing_cm IS 'Longueur de jambe debout (morpho) : EIAS → malléole interne (cm)';

CREATE TABLE IF NOT EXISTS public.morpho_observations (
  athlete_id   uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  abdomen      text CHECK (abdomen IN ('long', 'court')),
  clavicules   text CHECK (clavicules IN ('longues', 'courtes')),
  cage         text CHECK (cage IN ('epaisse', 'etroite')),
  coude_valgus text CHECK (coude_valgus IN ('aucun', 'modere', 'marque')),
  -- { "pectoraux": "long", "biceps": "court", ... }
  muscles      jsonb NOT NULL DEFAULT '{}'::jsonb,
  note         text,
  updated_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.morpho_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS morpho_athlete_read ON public.morpho_observations;
CREATE POLICY morpho_athlete_read ON public.morpho_observations FOR SELECT TO authenticated
  USING (athlete_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS morpho_coach_read ON public.morpho_observations;
CREATE POLICY morpho_coach_read ON public.morpho_observations FOR SELECT TO authenticated
  USING ((SELECT public.i_am_coach()) AND public.is_coach_of(athlete_id));

DROP POLICY IF EXISTS morpho_coach_insert ON public.morpho_observations;
CREATE POLICY morpho_coach_insert ON public.morpho_observations FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.i_am_coach()) AND public.is_coach_of(athlete_id));

DROP POLICY IF EXISTS morpho_coach_update ON public.morpho_observations;
CREATE POLICY morpho_coach_update ON public.morpho_observations FOR UPDATE TO authenticated
  USING ((SELECT public.i_am_coach()) AND public.is_coach_of(athlete_id))
  WITH CHECK ((SELECT public.i_am_coach()) AND public.is_coach_of(athlete_id));

DROP POLICY IF EXISTS morpho_coach_delete ON public.morpho_observations;
CREATE POLICY morpho_coach_delete ON public.morpho_observations FOR DELETE TO authenticated
  USING ((SELECT public.i_am_coach()) AND public.is_coach_of(athlete_id));
