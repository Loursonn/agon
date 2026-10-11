-- Fix: coach cannot see energy_sessions joined via energy_session_assignments
-- when the session is private (is_public=false), not created by the coach,
-- and has no athlete_id set (bank session, not a copy).
--
-- Root cause: es_select policy was missing a path for coaches to see sessions
-- assigned to their athletes via energy_session_assignments.
--
-- Add: OR id IN (SELECT energy_session_id FROM energy_session_assignments WHERE is_coach_of(athlete_id))

DROP POLICY IF EXISTS "es_select" ON public.energy_sessions;

CREATE POLICY "es_select"
  ON public.energy_sessions FOR SELECT
  TO authenticated
  USING (
    -- Public bank sessions
    is_public = true
    -- Own creations (coach personal bank)
    OR created_by = auth.uid()
    -- Athlete-specific copies (athlete sees own copies)
    OR athlete_id = auth.uid()
    -- Coach sees their athletes' copies
    OR athlete_id IN (
      SELECT id FROM public.profiles WHERE coach_id = auth.uid()
    )
    -- Athlete sees any session assigned to them
    OR id IN (
      SELECT energy_session_id FROM public.energy_session_assignments
      WHERE athlete_id = auth.uid()
    )
    -- Coach sees any session assigned to their athletes
    OR id IN (
      SELECT energy_session_id FROM public.energy_session_assignments
      WHERE public.is_coach_of(athlete_id)
    )
  );
