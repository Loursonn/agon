-- =============================================================================
-- Rattrapage : l'historique rejoué doit donner exactement le schéma de la prod
-- (décision 7, docs/PLAN_LEGACY.md §3, étape R2).
--
-- Certaines migrations n'ont jamais été appliquées en prod, ou en partie, et la
-- prod a reçu des changements faits à la main. Ce fichier ramène la base rejouée
-- à l'état réel de la prod au 2026-11-13. Il ne change RIEN en prod : chaque
-- instruction y est sans effet (objet absent → IF EXISTS ; objet présent →
-- recréé à l'identique). `migration repair` le marquera appliqué (R3).
--
-- Écarts de la prod qui méritent une correction (à faire dans une migration à
-- part, avec l'accord d'Hugo, pas ici) :
--   - `es_insert` (energy_sessions) : en prod, tout compte connecté peut créer une
--     séance pour n'importe quel `athlete_id` ; la version stricte de
--     20260507000000_athlete_flexibility n'y a jamais été appliquée.
--   - `workout_logs_self` : l'athlète peut aussi SUPPRIMER ses séances (FOR ALL).
--   - triggers anti-chevauchement des cycles (20260510100000) jamais posés en prod.
-- =============================================================================

-- ── workout_logs (20260507000000_athlete_flexibility, appliquée en partie) ──
DROP INDEX IF EXISTS public.idx_workout_logs_unique_original;
DROP INDEX IF EXISTS public.idx_workout_logs_athlete_mods;
DROP INDEX IF EXISTS public.idx_workout_logs_coach_alert;
ALTER TABLE public.workout_logs ALTER COLUMN original_scheduled_date DROP NOT NULL;
ALTER TABLE public.workout_logs ALTER COLUMN original_scheduled_date DROP DEFAULT;
ALTER TABLE public.workout_logs DROP COLUMN IF EXISTS reschedule_reason;
CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_logs_unique ON public.workout_logs USING btree (athlete_id, session_id, scheduled_date);
COMMENT ON TABLE public.workout_logs IS NULL;

DROP POLICY IF EXISTS workout_logs_self_insert ON public.workout_logs;
DROP POLICY IF EXISTS workout_logs_self_select ON public.workout_logs;
DROP POLICY IF EXISTS workout_logs_self_update ON public.workout_logs;
DROP POLICY IF EXISTS workout_logs_self ON public.workout_logs;
CREATE POLICY workout_logs_self ON public.workout_logs USING ((athlete_id = auth.uid()));

-- ── energy_sessions / assignments ───────────────────────────────────────────
DROP POLICY IF EXISTS es_insert ON public.energy_sessions;
CREATE POLICY es_insert ON public.energy_sessions FOR INSERT TO authenticated WITH CHECK ((is_verified = false));
COMMENT ON COLUMN public.energy_sessions.schema IS 'Optional field schema drawing';
COMMENT ON COLUMN public.energy_session_assignments.actual_duration_min IS NULL;

-- ── exercises (policy posée à la main) ──────────────────────────────────────
DROP POLICY IF EXISTS "Service write" ON public.exercises;
CREATE POLICY "Service write" ON public.exercises USING ((auth.role() = 'service_role'::text));

-- ── measurement_logs : commentaires absents en prod ─────────────────────────
COMMENT ON COLUMN public.measurement_logs.bras_g IS NULL;
COMMENT ON COLUMN public.measurement_logs.bras_d IS NULL;
COMMENT ON COLUMN public.measurement_logs.cuisse_g IS NULL;
COMMENT ON COLUMN public.measurement_logs.cuisse_d IS NULL;
COMMENT ON COLUMN public.measurement_logs.mollet_g IS NULL;
COMMENT ON COLUMN public.measurement_logs.mollet_d IS NULL;

-- ── Périodisation (20260510100000_period_overlap_triggers, jamais appliquée) ─
DROP TRIGGER IF EXISTS prevent_cycle_overlap ON public.cycles;
DROP TRIGGER IF EXISTS prevent_macrocycle_overlap ON public.macrocycles;
DROP TRIGGER IF EXISTS prevent_mesocycle_overlap ON public.mesocycles;
DROP TRIGGER IF EXISTS validate_microcycle_dates ON public.microcycles;
DROP FUNCTION IF EXISTS public.check_cycle_overlap();
DROP FUNCTION IF EXISTS public.check_macrocycle_overlap();
DROP FUNCTION IF EXISTS public.check_mesocycle_overlap();

-- Corps de la prod (sans trigger en prod : fonction morte, P18).
CREATE OR REPLACE FUNCTION public.check_microcycle_dates() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cyc RECORD;
BEGIN
  SELECT start_date, end_date INTO cyc
    FROM public.cycles WHERE id = NEW.cycle_id;

  -- Only block microcycles that have zero overlap with the cycle.
  IF NEW.end_date < cyc.start_date OR NEW.start_date > cyc.end_date THEN
    RAISE EXCEPTION
      'Microcycle semaine % (% → %) sans chevauchement avec le cycle (% → %)',
      NEW.week_number, NEW.start_date, NEW.end_date, cyc.start_date, cyc.end_date;
  END IF;

  RETURN NEW;
END;
$$;

-- Corps de la prod (même logique, autre mise en forme).
CREATE OR REPLACE FUNCTION public.sync_extrap_to_performance() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  declare v_metric text; v_op text; v_factor numeric; v_unit text; v_athlete uuid; v_date date; physio numeric;
  begin
    select extrap_metric,extrap_op,extrap_factor into v_metric,v_op,v_factor from public.test_variables where id=NEW.variable_id;
    if v_metric is null or v_op is null or v_factor is null or v_factor=0 then return NEW; end if;
    select athlete_id,performed_at into v_athlete,v_date from public.athlete_test_results where id=NEW.result_id;
    if v_athlete is null then return NEW; end if;
    if exists (select 1 from public.performance_logs where athlete_id=v_athlete and metric_name=v_metric and is_active_reference=true and date>v_date) then return NEW; end if;
    physio := round((case when v_op='div' then NEW.value/v_factor else NEW.value*v_factor end)::numeric,1);
    v_unit := case v_metric when 'VMA' then 'km/h' when 'Vmax' then 'km/h' when 'VC' then 'km/h' when 'VO2max' then 'mL/kg/min' when 'PMA' then 'W' when 'FTP' then 'W' when
  'FCmax' then 'bpm' else '' end;
    update public.performance_logs set is_active_reference=false where athlete_id=v_athlete and metric_name=v_metric and is_active_reference=true;
    insert into public.performance_logs (athlete_id,metric_type,metric_name,value,unit,date,is_active_reference,coach_validated)
    values (v_athlete,'reference',v_metric,physio,v_unit,v_date,true,true);
    return NEW;
  end; $$;
