-- Resserre deux policies trop larges figées par 20261113235900_rattrapage_etat_prod.
--
-- 1. energy_sessions.es_insert : `WITH CHECK (is_verified = false)` laissait tout
--    compte connecté créer une séance pour n'importe quel athlète, ou dans la
--    bibliothèque d'un autre coach (created_by quelconque).
--    Cible :
--      - toujours created_by = auth.uid() (sinon on offrirait à un tiers les
--        droits es_update_author / es_delete, qui passent par created_by) ;
--      - bibliothèque (athlete_id NULL), ou séance d'un athlète par son coach
--        (référent ou co-coach, is_coach_of) ou par l'athlète lui-même ;
--      - jamais une séance déjà certifiée (is_verified reste false à la création).
--    created_by prend auth.uid() par défaut : la duplication depuis la carte de
--    séance (EnergySessionCard) n'envoie pas created_by.
--
-- 2. workout_logs.workout_logs_self : `FOR ALL` donnait le DELETE à l'athlète.
--    Aucun client (main ni dev) ne supprime une séance côté athlète : les
--    suppressions passent par le coach (workout_logs_coach_delete, is_coach_of).
--    Remplacée par SELECT / INSERT / UPDATE.
--
-- Compatible avec le client de main : il n'utilise aucun des accès retirés.

-- ── 1. energy_sessions ──────────────────────────────────────────────────────
ALTER TABLE public.energy_sessions ALTER COLUMN created_by SET DEFAULT auth.uid();

DROP POLICY IF EXISTS es_insert ON public.energy_sessions;
CREATE POLICY es_insert ON public.energy_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    is_verified = false
    AND created_by = auth.uid()
    AND (
      athlete_id IS NULL
      OR athlete_id = auth.uid()
      OR public.is_coach_of(athlete_id)
    )
  );

-- ── 2. workout_logs ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS workout_logs_self ON public.workout_logs;
DROP POLICY IF EXISTS workout_logs_self_select ON public.workout_logs;
DROP POLICY IF EXISTS workout_logs_self_insert ON public.workout_logs;
DROP POLICY IF EXISTS workout_logs_self_update ON public.workout_logs;

CREATE POLICY workout_logs_self_select ON public.workout_logs
  FOR SELECT USING (athlete_id = auth.uid());
CREATE POLICY workout_logs_self_insert ON public.workout_logs
  FOR INSERT WITH CHECK (athlete_id = auth.uid());
CREATE POLICY workout_logs_self_update ON public.workout_logs
  FOR UPDATE USING (athlete_id = auth.uid()) WITH CHECK (athlete_id = auth.uid());
