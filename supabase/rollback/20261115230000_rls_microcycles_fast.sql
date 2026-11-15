-- Retour arrière de 20261115230000_rls_microcycles_fast.sql : policies d'origine (état après
-- 20261115193700), puis suppression des fonctions _fast.
BEGIN;

ALTER POLICY "cycles_select" ON public.cycles
  USING (((COALESCE(athlete_id, public.mesocycle_athlete_id(mesocycle_id)) = (SELECT auth.uid()))
          OR ((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(athlete_id, public.mesocycle_athlete_id(mesocycle_id))))));
ALTER POLICY "cycles_insert" ON public.cycles
  WITH CHECK (((athlete_id = (SELECT auth.uid()))
               OR ((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(athlete_id, public.mesocycle_athlete_id(mesocycle_id))))));
ALTER POLICY "cycles_update" ON public.cycles
  USING (((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(athlete_id, public.mesocycle_athlete_id(mesocycle_id)))))
  WITH CHECK (((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(athlete_id, public.mesocycle_athlete_id(mesocycle_id)))));
ALTER POLICY "cycles_delete" ON public.cycles
  USING (((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(athlete_id, public.mesocycle_athlete_id(mesocycle_id)))));
ALTER POLICY "staff_cycles_read" ON public.cycles
  USING (((SELECT public.i_am_staff()) AND public.staff_can(COALESCE(athlete_id, public.mesocycle_athlete_id(mesocycle_id)), 'planification'::text, 'read'::text)));

ALTER POLICY "microcycles_select" ON public.microcycles
  USING (((public.cycle_athlete_id(cycle_id) = (SELECT auth.uid()))
          OR ((SELECT public.i_am_coach()) AND public.can_coach_athlete(public.cycle_athlete_id(cycle_id)))));
ALTER POLICY "microcycles_insert" ON public.microcycles
  WITH CHECK (((SELECT public.i_am_coach()) AND public.can_coach_athlete(public.cycle_athlete_id(cycle_id))));
ALTER POLICY "microcycles_update" ON public.microcycles
  USING (((SELECT public.i_am_coach()) AND public.can_coach_athlete(public.cycle_athlete_id(cycle_id))))
  WITH CHECK (((SELECT public.i_am_coach()) AND public.can_coach_athlete(public.cycle_athlete_id(cycle_id))));
ALTER POLICY "microcycles_delete" ON public.microcycles
  USING (((SELECT public.i_am_coach()) AND public.can_coach_athlete(public.cycle_athlete_id(cycle_id))));
ALTER POLICY "staff_microcycles_read" ON public.microcycles
  USING (((SELECT public.i_am_staff()) AND public.staff_can(public.cycle_athlete_id(cycle_id), 'planification'::text, 'read'::text)));

DROP FUNCTION public.cycle_is_mixed(uuid);
DROP FUNCTION public.cycle_athlete_id_fast(uuid);
DROP FUNCTION public.mesocycle_athlete_id_fast(uuid);
DROP FUNCTION public.rls_linked_to(uuid);

COMMIT;
