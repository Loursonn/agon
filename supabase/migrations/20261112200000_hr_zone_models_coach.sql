-- Zones FC fixées par le coach (décisions d'Hugo du 2026-11-12) :
--  * seul le coach (référent ou co-coach) enregistre un modèle ; l'athlète lit ;
--  * modèle 3 / 5 / 7 zones (7 zones = `custom` à 6 bornes, pas de nouveau kind) ;
--  * un changement vaut à partir de sa date ; « Appliquer aussi aux séances
--    passées » rend le modèle valable depuis toujours : les modèles plus
--    anciens passent à `replaced` (gardés dans l'historique) ;
--  * accepter la proposition d'un test SV crée le modèle 3 zones DATÉ DU JOUR.
-- Additive : aucune donnée supprimée. Le client de prod n'appelle pas encore
-- save_hr_zone_model : le restreindre au coach ne casse rien.

-- 1. Statut `replaced` + jour de lecture des références FCzone (modèle five figé)
ALTER TABLE public.hr_zone_models DROP CONSTRAINT IF EXISTS hr_zone_models_status_check;
ALTER TABLE public.hr_zone_models ADD CONSTRAINT hr_zone_models_status_check
  CHECK (status IN ('active', 'proposed', 'rejected', 'replaced'));

ALTER TABLE public.hr_zone_models ADD COLUMN IF NOT EXISTS refs_day date;
COMMENT ON COLUMN public.hr_zone_models.refs_day IS
  'Modèle five appliqué au passé : les références FCzone_* sont lues à cette date pour toutes les séances.';

-- 2. Bornes à une date : un modèle five « appliqué au passé » lit les FCzone_* à refs_day
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
  IF m_found AND m.kind <> 'five' THEN
    RETURN QUERY SELECT m.id, m.kind, m.bounds;
    RETURN;
  END IF;
  v_day := CASE WHEN m_found AND m.refs_day IS NOT NULL THEN m.refs_day ELSE p_day END;
  SELECT ARRAY(
    SELECT (round(x.v) + 1)::smallint FROM (
      SELECT k, (SELECT pl.value FROM public.performance_logs pl
                  WHERE pl.athlete_id = p_athlete AND pl.metric_name = k AND pl.date <= v_day
                  ORDER BY pl.date DESC, pl.created_at DESC LIMIT 1) AS v, o
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

-- 3. Enregistrement : coach seulement
CREATE OR REPLACE FUNCTION public.save_hr_zone_model(
  p_athlete uuid, p_kind text, p_bounds integer[], p_valid_from date DEFAULT current_date
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_coach_of(p_athlete) THEN
    RAISE EXCEPTION 'save_hr_zone_model : réservé au coach' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.hr_zone_models (athlete_id, kind, bounds, valid_from, status, origin, created_by, decided_by, decided_at)
  VALUES (p_athlete, p_kind, CASE WHEN p_kind = 'five' THEN NULL ELSE p_bounds::smallint[] END,
          coalesce(p_valid_from, current_date), 'active', 'manual', auth.uid(), auth.uid(), now())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_hr_zone_model(uuid, text, integer[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_hr_zone_model(uuid, text, integer[], date) TO authenticated;

-- 4. Proposition d'un test : acceptée = modèle actif à partir d'aujourd'hui
CREATE OR REPLACE FUNCTION public.decide_hr_zone_model(p_id uuid, p_accept boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_athlete uuid;
BEGIN
  SELECT athlete_id INTO v_athlete FROM public.hr_zone_models WHERE id = p_id AND status = 'proposed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'decide_hr_zone_model : proposition introuvable' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NULL OR NOT public.is_coach_of(v_athlete) THEN
    RAISE EXCEPTION 'decide_hr_zone_model : réservé au coach' USING ERRCODE = '42501';
  END IF;
  UPDATE public.hr_zone_models
     SET status = CASE WHEN p_accept THEN 'active' ELSE 'rejected' END,
         valid_from = CASE WHEN p_accept THEN current_date ELSE valid_from END,
         decided_by = auth.uid(), decided_at = now()
   WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.decide_hr_zone_model(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_hr_zone_model(uuid, boolean) TO authenticated;

-- 5. « Appliquer aussi aux séances passées »
CREATE OR REPLACE FUNCTION public.apply_hr_zone_model_to_past(p_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  n integer;
BEGIN
  SELECT * INTO m FROM public.hr_zone_models WHERE id = p_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_hr_zone_model_to_past : modèle introuvable' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NULL OR NOT public.is_coach_of(m.athlete_id) THEN
    RAISE EXCEPTION 'apply_hr_zone_model_to_past : réservé au coach' USING ERRCODE = '42501';
  END IF;
  -- Les modèles plus anciens cèdent la place (historique conservé).
  UPDATE public.hr_zone_models
     SET status = 'replaced'
   WHERE athlete_id = m.athlete_id AND status = 'active' AND id <> m.id
     AND (valid_from < m.valid_from OR (valid_from = m.valid_from AND created_at < m.created_at));
  -- Valable depuis toujours ; un modèle five fige les références d'aujourd'hui.
  UPDATE public.hr_zone_models
     SET valid_from = DATE '2000-01-01',
         refs_day = CASE WHEN kind = 'five' THEN current_date ELSE refs_day END
   WHERE id = m.id;
  SELECT count(*) INTO n FROM public.activity_zone_summaries WHERE athlete_id = m.athlete_id;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_hr_zone_model_to_past(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_hr_zone_model_to_past(uuid) TO authenticated;
