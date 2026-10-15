-- La planification appartient à l'athlète : l'accès suit le lien coach ACTUEL.
--
-- Avant : seasons, planning_blocks, macrocycles, mesocycles, cycles,
-- microcycles et competitions donnaient l'accès au coach AUTEUR de la ligne
-- (coach_id = auth.uid()). Quand un athlète changeait de coach, l'ancien
-- coach gardait la main sur sa planification et le nouveau ne pouvait pas la
-- modifier. cycles n'avait même pas de RLS (lisible / modifiable par tous).
--
-- Après (même règle que app_data, workout_logs, energy_session_assignments) :
--   lecture  : l'athlète lui-même, ou son coach actuel
--   écriture : son coach actuel (coach-athlète auto-coaché inclus,
--              coach pur pour sa propre planification)
-- coach_id sur ces lignes ne sert plus que d'« auteur ». Les banques (séances,
-- blocs spécifiques, fiches, tests) restent au coach qui les a créées.
-- Les droits athlète existants sont conservés (créer un cycle,
-- ajouter / supprimer ses compétitions).

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Peut programmer pour cet athlète : son coach actuel, ou un coach pur pour
-- lui-même (miroir de canCoachSelf côté app).
CREATE OR REPLACE FUNCTION public.can_coach_athlete(athlete_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT athlete_uuid IS NOT NULL AND (
    public.is_coach_of(athlete_uuid)
    OR (athlete_uuid = auth.uid() AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach'))
  );
$$;

-- Athlète d'un mésocycle (via son macrocycle)
CREATE OR REPLACE FUNCTION public.mesocycle_athlete_id(p_mesocycle_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT ma.athlete_id
  FROM public.mesocycles me
  JOIN public.macrocycles ma ON ma.id = me.macrocycle_id
  WHERE me.id = p_mesocycle_id;
$$;

-- ── seasons ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS seasons_select ON public.seasons;
DROP POLICY IF EXISTS seasons_insert ON public.seasons;
DROP POLICY IF EXISTS seasons_update ON public.seasons;
DROP POLICY IF EXISTS seasons_delete ON public.seasons;
CREATE POLICY seasons_select ON public.seasons FOR SELECT
  USING (athlete_id = auth.uid() OR can_coach_athlete(athlete_id));
CREATE POLICY seasons_insert ON public.seasons FOR INSERT
  WITH CHECK (can_coach_athlete(athlete_id));
CREATE POLICY seasons_update ON public.seasons FOR UPDATE
  USING (can_coach_athlete(athlete_id)) WITH CHECK (can_coach_athlete(athlete_id));
CREATE POLICY seasons_delete ON public.seasons FOR DELETE
  USING (can_coach_athlete(athlete_id));

-- ── planning_blocks ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS planning_blocks_select ON public.planning_blocks;
DROP POLICY IF EXISTS planning_blocks_insert ON public.planning_blocks;
DROP POLICY IF EXISTS planning_blocks_update ON public.planning_blocks;
DROP POLICY IF EXISTS planning_blocks_delete ON public.planning_blocks;
CREATE POLICY planning_blocks_select ON public.planning_blocks FOR SELECT
  USING (athlete_id = auth.uid() OR can_coach_athlete(athlete_id));
CREATE POLICY planning_blocks_insert ON public.planning_blocks FOR INSERT
  WITH CHECK (can_coach_athlete(athlete_id));
CREATE POLICY planning_blocks_update ON public.planning_blocks FOR UPDATE
  USING (can_coach_athlete(athlete_id)) WITH CHECK (can_coach_athlete(athlete_id));
CREATE POLICY planning_blocks_delete ON public.planning_blocks FOR DELETE
  USING (can_coach_athlete(athlete_id));

-- ── macrocycles ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS macrocycles_select ON public.macrocycles;
DROP POLICY IF EXISTS macrocycles_insert ON public.macrocycles;
DROP POLICY IF EXISTS macrocycles_update ON public.macrocycles;
DROP POLICY IF EXISTS macrocycles_delete ON public.macrocycles;
CREATE POLICY macrocycles_select ON public.macrocycles FOR SELECT
  USING (athlete_id = auth.uid() OR can_coach_athlete(athlete_id));
CREATE POLICY macrocycles_insert ON public.macrocycles FOR INSERT
  WITH CHECK (can_coach_athlete(athlete_id));
CREATE POLICY macrocycles_update ON public.macrocycles FOR UPDATE
  USING (can_coach_athlete(athlete_id)) WITH CHECK (can_coach_athlete(athlete_id));
CREATE POLICY macrocycles_delete ON public.macrocycles FOR DELETE
  USING (can_coach_athlete(athlete_id));

-- ── mesocycles (athlète via le macrocycle) ───────────────────────────────────
DROP POLICY IF EXISTS mesocycles_select ON public.mesocycles;
DROP POLICY IF EXISTS mesocycles_insert ON public.mesocycles;
DROP POLICY IF EXISTS mesocycles_update ON public.mesocycles;
DROP POLICY IF EXISTS mesocycles_delete ON public.mesocycles;
CREATE POLICY mesocycles_select ON public.mesocycles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.macrocycles m WHERE m.id = macrocycle_id
    AND (m.athlete_id = auth.uid() OR can_coach_athlete(m.athlete_id))));
CREATE POLICY mesocycles_insert ON public.mesocycles FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.macrocycles m WHERE m.id = macrocycle_id
    AND can_coach_athlete(m.athlete_id)));
CREATE POLICY mesocycles_update ON public.mesocycles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.macrocycles m WHERE m.id = macrocycle_id
    AND can_coach_athlete(m.athlete_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.macrocycles m WHERE m.id = macrocycle_id
    AND can_coach_athlete(m.athlete_id)));
CREATE POLICY mesocycles_delete ON public.mesocycles FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.macrocycles m WHERE m.id = macrocycle_id
    AND can_coach_athlete(m.athlete_id)));

-- ── cycles (RLS activée : jusqu'ici ouverte à tous) ──────────────────────────
-- Athlète du cycle : athlete_id, sinon celui du mésocycle parent
ALTER TABLE public.cycles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cycles_insert_coach ON public.cycles;
DROP POLICY IF EXISTS cycles_select ON public.cycles;
DROP POLICY IF EXISTS cycles_insert ON public.cycles;
DROP POLICY IF EXISTS cycles_update ON public.cycles;
DROP POLICY IF EXISTS cycles_delete ON public.cycles;
CREATE POLICY cycles_select ON public.cycles FOR SELECT
  USING (COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id)) = auth.uid()
    OR can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id))));
CREATE POLICY cycles_insert ON public.cycles FOR INSERT
  WITH CHECK (athlete_id = auth.uid()
    OR can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id))));
CREATE POLICY cycles_update ON public.cycles FOR UPDATE
  USING (can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id))))
  WITH CHECK (can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id))));
CREATE POLICY cycles_delete ON public.cycles FOR DELETE
  USING (can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id))));

-- ── microcycles (athlète via le cycle) ───────────────────────────────────────
DROP POLICY IF EXISTS microcycles_select ON public.microcycles;
DROP POLICY IF EXISTS microcycles_insert ON public.microcycles;
DROP POLICY IF EXISTS microcycles_update ON public.microcycles;
DROP POLICY IF EXISTS microcycles_delete ON public.microcycles;
CREATE POLICY microcycles_select ON public.microcycles FOR SELECT
  USING (cycle_athlete_id(cycle_id) = auth.uid() OR can_coach_athlete(cycle_athlete_id(cycle_id)));
CREATE POLICY microcycles_insert ON public.microcycles FOR INSERT
  WITH CHECK (can_coach_athlete(cycle_athlete_id(cycle_id)));
CREATE POLICY microcycles_update ON public.microcycles FOR UPDATE
  USING (can_coach_athlete(cycle_athlete_id(cycle_id)))
  WITH CHECK (can_coach_athlete(cycle_athlete_id(cycle_id)));
CREATE POLICY microcycles_delete ON public.microcycles FOR DELETE
  USING (can_coach_athlete(cycle_athlete_id(cycle_id)));

-- ── competitions (droits athlète conservés) ──────────────────────────────────
DROP POLICY IF EXISTS competitions_select ON public.competitions;
DROP POLICY IF EXISTS competitions_insert ON public.competitions;
DROP POLICY IF EXISTS competitions_update ON public.competitions;
DROP POLICY IF EXISTS competitions_delete ON public.competitions;
CREATE POLICY competitions_select ON public.competitions FOR SELECT
  USING (athlete_id = auth.uid() OR can_coach_athlete(athlete_id));
CREATE POLICY competitions_insert ON public.competitions FOR INSERT
  WITH CHECK (can_coach_athlete(athlete_id));
CREATE POLICY competitions_update ON public.competitions FOR UPDATE
  USING (can_coach_athlete(athlete_id)) WITH CHECK (can_coach_athlete(athlete_id));
CREATE POLICY competitions_delete ON public.competitions FOR DELETE
  USING (can_coach_athlete(athlete_id));
-- competitions_insert_athlete / competitions_delete_athlete : inchangées
