/*
  P42 lot D — historique importé : zones et IA.

  1. Zones de l'historique (décision d'Hugo 7) : une sortie antérieure à tout
     modèle de zones de l'athlète est calculée avec son modèle ACTUEL (dernier
     actif), au lieu de rester sans résumé. Une sortie postérieure à un modèle
     garde le modèle valable à sa date (P41 lot C, inchangé).

  2. IA (question 1, réponse d'Hugo du 2026-11-12) : une sortie enregistrée par
     une montre Garmin n'est jamais envoyée à l'IA, quelle que soit sa source
     (fichier déposé, archive Strava d'une sortie Garmin). Repérée par le
     fabricant du FIT (1 = Garmin), le créateur TCX/GPX, l'appareil, ou une
     source Garmin fusionnée. Seul sens : passer à false, jamais à true.

  Additive. Tests : supabase/tests/history_zones_garmin_ai.sql.
*/

-- ═══════════════ 1. Zones : modèle actuel pour l'historique ══════════════════

CREATE OR REPLACE FUNCTION public.hr_zone_bounds_at(p_athlete uuid, p_day date)
RETURNS TABLE (model_id uuid, kind text, bounds smallint[])
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  m record;
  m_found boolean;
  z smallint[];
BEGIN
  SELECT h.id, h.kind, h.bounds INTO m
    FROM public.hr_zone_models h
   WHERE h.athlete_id = p_athlete AND h.status = 'active' AND h.valid_from <= p_day
   ORDER BY h.valid_from DESC, h.created_at DESC LIMIT 1;
  m_found := FOUND;
  IF NOT m_found THEN
    -- Historique antérieur à tout modèle : le modèle actuel (P42).
    SELECT h.id, h.kind, h.bounds INTO m
      FROM public.hr_zone_models h
     WHERE h.athlete_id = p_athlete AND h.status = 'active'
     ORDER BY h.valid_from DESC, h.created_at DESC LIMIT 1;
    m_found := FOUND;
  END IF;
  IF m_found AND m.kind <> 'five' THEN
    RETURN QUERY SELECT m.id, m.kind, m.bounds;
    RETURN;
  END IF;
  SELECT ARRAY(
    SELECT (round(x.v) + 1)::smallint FROM (
      SELECT k, coalesce(
               (SELECT pl.value FROM public.performance_logs pl
                 WHERE pl.athlete_id = p_athlete AND pl.metric_name = k AND pl.date <= p_day
                 ORDER BY pl.date DESC, pl.created_at DESC LIMIT 1),
               -- Historique antérieur aux premières zones saisies : les actuelles (P42).
               (SELECT pl.value FROM public.performance_logs pl
                 WHERE pl.athlete_id = p_athlete AND pl.metric_name = k
                 ORDER BY pl.date DESC, pl.created_at DESC LIMIT 1)) AS v, o
        FROM unnest(ARRAY['FCzone_Z1_max','FCzone_Z2_max','FCzone_Z3_max','FCzone_Z4_max']) WITH ORDINALITY u(k, o)
    ) x ORDER BY x.o) INTO z;
  IF z IS NULL OR cardinality(z) <> 4 OR EXISTS (SELECT 1 FROM unnest(z) v WHERE v IS NULL)
     OR NOT public.hr_bounds_valid(z) THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT CASE WHEN m_found THEN m.id END, 'five'::text, z;
END;
$$;
REVOKE ALL ON FUNCTION public.hr_zone_bounds_at(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_zone_bounds_at(uuid, date) TO authenticated, service_role;

-- ═══════════════ 2. IA : jamais une sortie de montre Garmin ═══════════════════

CREATE OR REPLACE FUNCTION public.activity_from_garmin_device(
  p_source public.data_source, p_raw jsonb, p_device text, p_sources text[])
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_source = 'garmin'
    OR coalesce(p_sources && ARRAY['garmin', 'garmin_export'], false)
    OR coalesce(p_raw->>'manufacturer' = '1', false)
    OR coalesce((p_raw->'creator')::text ILIKE '%garmin%', false)
    OR coalesce(p_device ILIKE '%garmin%', false);
$$;

/*
  Passe après `provider_activities_ai_policy` (ordre alphabétique des
  déclencheurs) : la politique de la source d'abord, puis l'appareil, qui ne
  peut que retirer l'autorisation.
*/
CREATE OR REPLACE FUNCTION public.tg_activity_garmin_device_no_ai()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.ai_allowed AND public.activity_from_garmin_device(NEW.source, NEW.raw, NEW.device_name, NEW.sources) THEN
    NEW.ai_allowed := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provider_activities_ai_zz_garmin_device ON public.provider_activities;
CREATE TRIGGER provider_activities_ai_zz_garmin_device
  BEFORE INSERT OR UPDATE ON public.provider_activities
  FOR EACH ROW EXECUTE FUNCTION public.tg_activity_garmin_device_no_ai();

-- Lignes existantes.
UPDATE public.provider_activities SET ai_allowed = false
 WHERE ai_allowed AND public.activity_from_garmin_device(source, raw, device_name, sources);

-- ═══════════════ 3. Rattrapage des résumés de zones ═══════════════════════════

/* Séances avec FC mais sans résumé (antérieures au modèle) : recalculées. */
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT st.activity_id FROM public.activity_streams st
            WHERE st.hr IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM public.activity_zone_summaries z WHERE z.activity_id = st.activity_id)
  LOOP
    PERFORM public.refresh_activity_zone_summary(r.activity_id);
  END LOOP;
END $$;
