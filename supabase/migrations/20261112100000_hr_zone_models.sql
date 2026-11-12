/*
  P41 lot C — modèles de zones de FC au choix, datés, et temps par zone.

  Choix (validés par Hugo le 2026-11-11, Q2) :
    - table dédiée `hr_zone_models` : modèle `five` (lit FCzone_* de
      performance_logs, aucune migration de données), `three` (SV1, SV2 en
      bpm, Zone 1 < SV1 ≤ Zone 2 < SV2 ≤ Zone 3) ou `custom` (N − 1 bornes) ;
      `valid_from` daté : une séance utilise les bornes valides à SA date ;
    - temps par zone recalculé à la lecture pour le détail (TS, domain/
      hrZones.ts) et RÉSUMÉ STOCKÉ par activité (`activity_zone_summaries`)
      pour le planning, recalculé par la base quand des bornes changent.
    - les tests SV1 / SV2 reçoivent une variable en bpm ; un résultat
      propose un modèle à 3 zones (`status = proposed`) que le coach valide.

  Sécurité : triggers ajoutés aux tables existantes (performance_logs,
  athlete_test_values) en AFTER et protégés : une erreur de calcul de zones
  n'empêche jamais l'écriture d'origine (WARNING seulement).
  Additive. Tests à blanc : supabase/tests/hr_zone_models.sql.
*/

-- ═══════════════ 1. Modèles ══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.hr_zone_models (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('five', 'three', 'custom')),
  -- Bornes basses des zones 2..N (bpm, croissantes). NULL pour `five`.
  bounds      smallint[],
  valid_from  date NOT NULL DEFAULT current_date,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'proposed', 'rejected')),
  origin      text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'test')),
  test_result_id uuid REFERENCES public.athlete_test_results(id) ON DELETE SET NULL,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_zone_models_bounds CHECK (
    (kind = 'five' AND bounds IS NULL)
    OR (kind = 'three' AND cardinality(bounds) = 2)
    OR (kind = 'custom' AND cardinality(bounds) BETWEEN 1 AND 9)
  )
);

CREATE INDEX IF NOT EXISTS hr_zone_models_athlete_from
  ON public.hr_zone_models (athlete_id, valid_from DESC, created_at DESC);

ALTER TABLE public.hr_zone_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_zone_models_read ON public.hr_zone_models;
CREATE POLICY hr_zone_models_read ON public.hr_zone_models
  FOR SELECT TO authenticated
  USING (athlete_id = auth.uid() OR public.is_coach_of(athlete_id) OR public.staff_can(athlete_id, 'seances', 'read'));
REVOKE INSERT, UPDATE, DELETE ON public.hr_zone_models FROM anon, authenticated;

/* Bornes strictement croissantes, plausibles. */
CREATE OR REPLACE FUNCTION public.hr_bounds_valid(b smallint[])
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT b IS NULL OR (
    cardinality(b) BETWEEN 1 AND 9
    AND NOT EXISTS (SELECT 1 FROM unnest(b) v WHERE v IS NULL OR v < 30 OR v > 250)
    AND NOT EXISTS (SELECT 1 FROM generate_subscripts(b, 1) i WHERE i > 1 AND b[i] <= b[i - 1])
  );
$$;
ALTER TABLE public.hr_zone_models DROP CONSTRAINT IF EXISTS hr_zone_models_bounds_valid;
ALTER TABLE public.hr_zone_models ADD CONSTRAINT hr_zone_models_bounds_valid CHECK (public.hr_bounds_valid(bounds));

/*
  Bornes valides pour un athlète à une date : dernier modèle actif dont
  valid_from ≤ date ; à défaut (ou modèle `five`), les FCzone_* les plus
  récentes à cette date (bornes hautes incluses → +1).
*/
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
  IF m_found AND m.kind <> 'five' THEN
    RETURN QUERY SELECT m.id, m.kind, m.bounds;
    RETURN;
  END IF;
  SELECT ARRAY(
    SELECT (round(x.v) + 1)::smallint FROM (
      SELECT k, (SELECT pl.value FROM public.performance_logs pl
                  WHERE pl.athlete_id = p_athlete AND pl.metric_name = k AND pl.date <= p_day
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

-- ═══════════════ 2. Temps par zone (même règle que domain/hrZones.ts) ══════════

/*
  Poids d'un point = écart au suivant, plafonné à 10 s, nul si le chrono est
  arrêté ; dernier point = 0. Zone = 1 + nombre de bornes ≤ FC (width_bucket).
  Rend [s_zone1, …, s_zoneN, s_sans_fc].
*/
CREATE OR REPLACE FUNCTION public.activity_zone_seconds(p_t integer[], p_timer integer[], p_hr smallint[], p_bounds smallint[])
RETURNS integer[]
LANGUAGE sql IMMUTABLE
AS $$
  WITH pts AS (
    SELECT i,
           CASE WHEN i < cardinality(p_t) THEN
             CASE WHEN p_timer IS NOT NULL AND p_timer[i] IS NOT NULL AND p_timer[i + 1] IS NOT NULL
                       AND p_timer[i + 1] = p_timer[i] THEN 0
                  ELSE greatest(0, least(p_t[i + 1] - p_t[i], 10)) END
           ELSE 0 END AS w,
           CASE WHEN p_hr[i] IS NULL THEN NULL ELSE width_bucket(p_hr[i]::integer, p_bounds::integer[]) + 1 END AS z
      FROM generate_subscripts(p_t, 1) i
  )
  SELECT ARRAY(
    SELECT coalesce((SELECT sum(w) FROM pts WHERE z = k), 0)::integer
      FROM generate_series(1, cardinality(p_bounds) + 1) k ORDER BY k
  ) || coalesce((SELECT sum(w) FROM pts WHERE z IS NULL), 0)::integer;
$$;

CREATE TABLE IF NOT EXISTS public.activity_zone_summaries (
  activity_id  uuid PRIMARY KEY REFERENCES public.provider_activities(id) ON DELETE CASCADE,
  athlete_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source       public.data_source NOT NULL,
  model_id     uuid REFERENCES public.hr_zone_models(id) ON DELETE SET NULL,
  kind         text NOT NULL,
  -- Bornes utilisées (trace) et secondes par zone.
  bounds       smallint[] NOT NULL,
  seconds      integer[] NOT NULL,
  no_hr_s      integer NOT NULL DEFAULT 0,
  ai_allowed   boolean NOT NULL DEFAULT false,
  computed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_zone_summaries_athlete ON public.activity_zone_summaries (athlete_id);

DROP TRIGGER IF EXISTS activity_zone_summaries_ai_policy ON public.activity_zone_summaries;
CREATE TRIGGER activity_zone_summaries_ai_policy
  BEFORE INSERT OR UPDATE OF source ON public.activity_zone_summaries
  FOR EACH ROW EXECUTE FUNCTION public.apply_source_ai_policy();

ALTER TABLE public.activity_zone_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activity_zone_summaries_read ON public.activity_zone_summaries;
CREATE POLICY activity_zone_summaries_read ON public.activity_zone_summaries
  FOR SELECT TO authenticated USING (public.activity_detail_visible(athlete_id, source));
REVOKE INSERT, UPDATE, DELETE ON public.activity_zone_summaries FROM anon, authenticated;

/* Recalcule le résumé d'une activité (supprimé si FC ou bornes absentes). */
CREATE OR REPLACE FUNCTION public.refresh_activity_zone_summary(p_activity uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  b record;
  secs integer[];
BEGIN
  SELECT st.activity_id, st.athlete_id, st.source, st.t, st.timer, st.hr, a.local_date
    INTO s
    FROM public.activity_streams st JOIN public.provider_activities a ON a.id = st.activity_id
   WHERE st.activity_id = p_activity;
  IF NOT FOUND OR s.hr IS NULL THEN
    DELETE FROM public.activity_zone_summaries WHERE activity_id = p_activity;
    RETURN;
  END IF;
  SELECT * INTO b FROM public.hr_zone_bounds_at(s.athlete_id, s.local_date);
  IF NOT FOUND OR b.bounds IS NULL THEN
    DELETE FROM public.activity_zone_summaries WHERE activity_id = p_activity;
    RETURN;
  END IF;
  secs := public.activity_zone_seconds(s.t, s.timer, s.hr, b.bounds);
  INSERT INTO public.activity_zone_summaries AS z (activity_id, athlete_id, source, model_id, kind, bounds,
                                                  seconds, no_hr_s, computed_at)
  VALUES (s.activity_id, s.athlete_id, s.source, b.model_id, b.kind, b.bounds,
          secs[1:cardinality(secs) - 1], secs[cardinality(secs)], now())
  ON CONFLICT (activity_id) DO UPDATE SET model_id = EXCLUDED.model_id, kind = EXCLUDED.kind,
    bounds = EXCLUDED.bounds, seconds = EXCLUDED.seconds, no_hr_s = EXCLUDED.no_hr_s, computed_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_activity_zone_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_activity_zone_summary(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_athlete_zone_summaries(p_athlete uuid, p_from date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN SELECT st.activity_id FROM public.activity_streams st
             JOIN public.provider_activities a ON a.id = st.activity_id
            WHERE st.athlete_id = p_athlete AND (p_from IS NULL OR a.local_date >= p_from)
  LOOP
    PERFORM public.refresh_activity_zone_summary(r.activity_id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_athlete_zone_summaries(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_athlete_zone_summaries(uuid, date) TO service_role;

-- Série reçue ou remplacée → résumé.
CREATE OR REPLACE FUNCTION public.tg_activity_streams_zones()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.refresh_activity_zone_summary(NEW.activity_id);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'zones non recalculées : %', SQLERRM;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS activity_streams_zones ON public.activity_streams;
CREATE TRIGGER activity_streams_zones
  AFTER INSERT OR UPDATE OF t, hr, timer ON public.activity_streams
  FOR EACH ROW EXECUTE FUNCTION public.tg_activity_streams_zones();

-- Modèle ajouté ou validé → séances à partir de sa date.
CREATE OR REPLACE FUNCTION public.tg_hr_zone_models_refresh()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active' THEN
    PERFORM public.refresh_athlete_zone_summaries(NEW.athlete_id, NEW.valid_from);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'zones non recalculées : %', SQLERRM;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS hr_zone_models_refresh ON public.hr_zone_models;
CREATE TRIGGER hr_zone_models_refresh
  AFTER INSERT OR UPDATE OF status, bounds, valid_from ON public.hr_zone_models
  FOR EACH ROW EXECUTE FUNCTION public.tg_hr_zone_models_refresh();

-- Zones à 5 modifiées (FCzone_*) → séances à partir de la date de la référence.
CREATE OR REPLACE FUNCTION public.tg_fczone_refresh()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.metric_name LIKE 'FCzone\_%' THEN
    PERFORM public.refresh_athlete_zone_summaries(NEW.athlete_id, NEW.date);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'zones non recalculées : %', SQLERRM;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS performance_logs_fczone_refresh ON public.performance_logs;
CREATE TRIGGER performance_logs_fczone_refresh
  AFTER INSERT ON public.performance_logs
  FOR EACH ROW EXECUTE FUNCTION public.tg_fczone_refresh();

-- ═══════════════ 3. Écriture : RPC ═══════════════════════════════════════════

/* Enregistre le modèle choisi (athlète lui-même, ou son coach / co-coach). */
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
  IF auth.uid() IS NULL OR NOT (auth.uid() = p_athlete OR public.is_coach_of(p_athlete)) THEN
    RAISE EXCEPTION 'save_hr_zone_model : non autorisé' USING ERRCODE = '42501';
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

/* Le coach (référent ou co-coach) accepte ou refuse des bornes proposées par un test. */
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
         decided_by = auth.uid(), decided_at = now()
   WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.decide_hr_zone_model(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_hr_zone_model(uuid, boolean) TO authenticated;

-- ═══════════════ 4. Tests SV1 / SV2 en bpm → proposition ═════════════════════

/*
  La base n'a pas de test SV1 / SV2 (les préréglés de 2026-04 n'y sont pas) :
  un test global « Seuils ventilatoires (FC) » porte les deux FC en bpm.
  Les variables sont reconnues par leur clé (`sv1_hr`, `sv2_hr`) : un test
  du coach qui les reprend propose aussi des zones.
*/
INSERT INTO public.test_definitions (id, name, category, kind, is_global, fill_mode, description, protocol)
VALUES ('00000000-0000-0000-0000-0000000000f1', 'Seuils ventilatoires (FC)', 'endurance', 'preset', true, 'coach',
        'FC au premier et au second seuil ventilatoire (test d''effort, labo ou terrain). Propose les zones 1 / 2 / 3 de l''athlète, à valider par le coach.',
        jsonb_build_object('text', 'Reporter la FC (bpm) mesurée à SV1 et à SV2. Zone 1 < SV1 ≤ Zone 2 < SV2 ≤ Zone 3.'))
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.test_variables (test_definition_id, key, label, unit, value_type, better_when) VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'sv1_hr', 'FC à SV1', 'bpm', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000f1', 'sv2_hr', 'FC à SV2', 'bpm', 'number', 'higher')
ON CONFLICT (test_definition_id, key) DO NOTHING;

/*
  Dès que l'athlète a une FC à SV1 et une FC à SV2 (derniers résultats), un
  modèle à 3 zones est PROPOSÉ (une seule proposition ouverte par athlète,
  mise à jour). Rien n'est appliqué sans la validation du coach.
*/
CREATE OR REPLACE FUNCTION public.tg_test_values_propose_zones()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key text;
  v_athlete uuid;
  v_day date;
  v1 numeric;
  v2 numeric;
  v_open uuid;
BEGIN
  SELECT tv.key INTO v_key FROM public.test_variables tv WHERE tv.id = NEW.variable_id;
  IF v_key NOT IN ('sv1_hr', 'sv2_hr') THEN RETURN NULL; END IF;
  SELECT r.athlete_id, r.performed_at INTO v_athlete, v_day FROM public.athlete_test_results r WHERE r.id = NEW.result_id;

  SELECT atv.value INTO v1 FROM public.athlete_test_values atv
    JOIN public.athlete_test_results r ON r.id = atv.result_id
    JOIN public.test_variables tv ON tv.id = atv.variable_id
   WHERE r.athlete_id = v_athlete AND tv.key = 'sv1_hr'
   ORDER BY r.performed_at DESC, r.created_at DESC LIMIT 1;
  SELECT atv.value INTO v2 FROM public.athlete_test_values atv
    JOIN public.athlete_test_results r ON r.id = atv.result_id
    JOIN public.test_variables tv ON tv.id = atv.variable_id
   WHERE r.athlete_id = v_athlete AND tv.key = 'sv2_hr'
   ORDER BY r.performed_at DESC, r.created_at DESC LIMIT 1;
  IF v1 IS NULL OR v2 IS NULL OR NOT public.hr_bounds_valid(ARRAY[round(v1), round(v2)]::smallint[]) THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_open FROM public.hr_zone_models WHERE athlete_id = v_athlete AND status = 'proposed' LIMIT 1;
  IF v_open IS NULL THEN
    INSERT INTO public.hr_zone_models (athlete_id, kind, bounds, valid_from, status, origin, test_result_id, created_by)
    VALUES (v_athlete, 'three', ARRAY[round(v1), round(v2)]::smallint[], v_day, 'proposed', 'test', NEW.result_id, auth.uid());
  ELSE
    UPDATE public.hr_zone_models
       SET bounds = ARRAY[round(v1), round(v2)]::smallint[], valid_from = v_day, test_result_id = NEW.result_id
     WHERE id = v_open;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'proposition de zones non créée : %', SQLERRM;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS athlete_test_values_propose_zones ON public.athlete_test_values;
CREATE TRIGGER athlete_test_values_propose_zones
  AFTER INSERT OR UPDATE OF value ON public.athlete_test_values
  FOR EACH ROW EXECUTE FUNCTION public.tg_test_values_propose_zones();

-- Séries déjà en base : premier calcul des résumés.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT activity_id FROM public.activity_streams LOOP
    PERFORM public.refresh_activity_zone_summary(r.activity_id);
  END LOOP;
END $$;
