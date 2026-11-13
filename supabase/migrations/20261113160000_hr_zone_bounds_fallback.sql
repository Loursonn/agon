-- Zones FC : rétablit le repli « modèle actuel » pour l'historique (régression).
--
-- 20261112160000_history_zones_garmin_ai (P42 lot D) avait ajouté deux replis à
-- hr_zone_bounds_at : une sortie antérieure à tout modèle de zones prend le modèle
-- actuel, et une sortie antérieure aux premières zones saisies prend les zones actuelles.
-- 20261112200000_hr_zone_models_coach (modèles datés 3/5/7 zones, refs_day) a recréé la
-- fonction à partir de la version d'avant et a perdu ces deux replis : ces sorties
-- n'ont plus de résumé de zones.
--
-- Cette version fusionne les deux : modèle daté en vigueur (valid_from <= jour), sinon
-- le plus récent ; pour un modèle « five », zones de performance_logs au jour de
-- référence du modèle (refs_day) ou au jour de la sortie, sinon les plus récentes.
-- Puis recalcul des résumés manquants. Rejouable.
-- Test : supabase/tests/hr_zone_bounds_fallback.sql et history_zones_garmin_ai.sql.

CREATE OR REPLACE FUNCTION public.hr_zone_bounds_at(p_athlete uuid, p_day date)
RETURNS TABLE (model_id uuid, kind text, bounds smallint[])
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  m record;
  m_found boolean;
  z smallint[];
  v_day date;
BEGIN
  SELECT h.id, h.kind, h.bounds, h.refs_day INTO m
    FROM public.hr_zone_models h
   WHERE h.athlete_id = p_athlete AND h.status = 'active' AND h.valid_from <= p_day
   ORDER BY h.valid_from DESC, h.created_at DESC LIMIT 1;
  m_found := FOUND;
  IF NOT m_found THEN
    -- Historique antérieur à tout modèle : le modèle actuel (P42).
    SELECT h.id, h.kind, h.bounds, h.refs_day INTO m
      FROM public.hr_zone_models h
     WHERE h.athlete_id = p_athlete AND h.status = 'active'
     ORDER BY h.valid_from DESC, h.created_at DESC LIMIT 1;
    m_found := FOUND;
  END IF;
  IF m_found AND m.kind <> 'five' THEN
    RETURN QUERY SELECT m.id, m.kind, m.bounds;
    RETURN;
  END IF;
  v_day := CASE WHEN m_found AND m.refs_day IS NOT NULL THEN m.refs_day ELSE p_day END;
  SELECT ARRAY(
    SELECT (round(x.v) + 1)::smallint FROM (
      SELECT k, coalesce(
               (SELECT pl.value FROM public.performance_logs pl
                 WHERE pl.athlete_id = p_athlete AND pl.metric_name = k AND pl.date <= v_day
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

-- Rattrapage : sorties avec FC mais sans résumé de zones.
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
