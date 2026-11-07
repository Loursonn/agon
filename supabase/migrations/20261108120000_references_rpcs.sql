-- Références de performance : noms canoniques + écritures atomiques (lot 4, docs/COUCHE_API.md).
--
-- 1. normalize_metric_name(text) : même table de correspondance que
--    supabase/functions/_shared/domain/performance.ts (« FC Max » → « FCmax »,
--    « Vitesse Critique » → « VC »…). Le module énergie lit les noms canoniques :
--    une FC max saisie « FC Max » n'était jamais utilisée.
-- 2. Trigger BEFORE INSERT/UPDATE sur performance_logs : le nom est normalisé à
--    l'écriture, y compris par le client encore en production (main).
-- 3. RPC atomiques (SECURITY DEFINER, droits vérifiés dedans) :
--    - set_performance_reference : désactive l'ancienne référence et insère la
--      nouvelle en une transaction (avant : update puis insert, erreur ignorée) ;
--    - save_fc_zones : une écriture logique pour les 6 bornes, ne recrée pas de
--      ligne si la valeur ne change pas (avant : 6 lignes par clic, 72 en base) ;
--    - review_performance_notification : valider / rejeter une mesure de
--      l'athlète (notification + validation + activation en une fois).
-- 4. Renommage des lignes existantes à nom non canonique (4 au 2026-11-08) ;
--    si une référence active canonique existe déjà, la plus récente reste active.
--
-- Additive : le client en production n'appelle aucune des nouvelles RPC et
-- set_active_performance_reference est inchangée.

-- -----------------------------------------------------------------------------
-- 1. Nom canonique
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_metric_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE regexp_replace(
                translate(lower(btrim(coalesce(p_name, ''))), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ₂', 'aaaaaaceeeeiiiinooooouuuuyy2'),
                '[[:space:]_.-]+', '', 'g')
    WHEN 'vma'                         THEN 'VMA'
    WHEN 'vitessemaximaleaerobie'      THEN 'VMA'
    WHEN 'vmax'                        THEN 'Vmax'
    WHEN 'vc'                          THEN 'VC'
    WHEN 'vitessecritique'             THEN 'VC'
    WHEN 'vo2max'                      THEN 'VO2max'
    WHEN 'pma'                         THEN 'PMA'
    WHEN 'ftp'                         THEN 'FTP'
    WHEN 'fcmax'                       THEN 'FCmax'
    WHEN 'fcmaximale'                  THEN 'FCmax'
    WHEN 'frequencecardiaquemaximale'  THEN 'FCmax'
    WHEN 'fcrepos'                     THEN 'FCrepos'
    WHEN 'fcrep'                       THEN 'FCrepos'
    WHEN 'fcderepos'                   THEN 'FCrepos'
    WHEN 'frequencecardiaquederepos'   THEN 'FCrepos'
    WHEN 'fcseuil'                     THEN 'FCseuil'
    WHEN 'fczonez0min'                 THEN 'FCzone_Z0_min'
    WHEN 'fczonez1max'                 THEN 'FCzone_Z1_max'
    WHEN 'fczonez2max'                 THEN 'FCzone_Z2_max'
    WHEN 'fczonez3max'                 THEN 'FCzone_Z3_max'
    WHEN 'fczonez4max'                 THEN 'FCzone_Z4_max'
    WHEN 'fczonez5max'                 THEN 'FCzone_Z5_max'
    ELSE btrim(p_name)
  END
$$;

-- -----------------------------------------------------------------------------
-- 2. Normalisation à l'écriture
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.performance_logs_normalize_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.metric_name := public.normalize_metric_name(NEW.metric_name);
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Lignes existantes (avant le trigger, qui renommerait sans arbitrer l'index
--    unique des références actives). Idempotent : ne touche que les noms
--    reconnus et non canoniques.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_keep uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT athlete_id, public.normalize_metric_name(metric_name) AS canon
      FROM public.performance_logs
     WHERE metric_name <> public.normalize_metric_name(metric_name)
       AND public.normalize_metric_name(metric_name) <> btrim(metric_name)
       AND is_active_reference
  LOOP
    SELECT id INTO v_keep
      FROM public.performance_logs
     WHERE athlete_id = r.athlete_id
       AND is_active_reference
       AND public.normalize_metric_name(metric_name) = r.canon
     ORDER BY date DESC, created_at DESC NULLS LAST
     LIMIT 1;

    UPDATE public.performance_logs
       SET is_active_reference = false
     WHERE athlete_id = r.athlete_id
       AND is_active_reference
       AND public.normalize_metric_name(metric_name) = r.canon
       AND id <> v_keep;
  END LOOP;

  UPDATE public.performance_logs
     SET metric_name = public.normalize_metric_name(metric_name)
   WHERE metric_name <> public.normalize_metric_name(metric_name)
     AND public.normalize_metric_name(metric_name) <> btrim(metric_name);
END;
$$;

DROP TRIGGER IF EXISTS trg_performance_logs_normalize_name ON public.performance_logs;
CREATE TRIGGER trg_performance_logs_normalize_name
  BEFORE INSERT OR UPDATE OF metric_name ON public.performance_logs
  FOR EACH ROW EXECUTE FUNCTION public.performance_logs_normalize_name();

-- -----------------------------------------------------------------------------
-- 3a. Définir une référence (insère et active en une transaction)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_performance_reference(
  p_athlete   uuid,
  p_metric    text,
  p_value     numeric,
  p_unit      text    DEFAULT NULL,
  p_date      date    DEFAULT NULL,
  p_validated boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metric   text := public.normalize_metric_name(p_metric);
  v_is_coach boolean;
  v_id       uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  v_is_coach := public.is_coach_of(p_athlete) OR public.current_user_is_admin();
  IF NOT (p_athlete = auth.uid() OR v_is_coach) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF v_metric IS NULL OR v_metric = '' THEN
    RAISE EXCEPTION 'Nom de métrique manquant' USING ERRCODE = '22023';
  END IF;
  IF p_value IS NULL THEN
    RAISE EXCEPTION 'Valeur manquante' USING ERRCODE = '22023';
  END IF;

  -- Deux enregistrements simultanés de la même métrique : l'un attend l'autre
  -- (sinon l'index unique des références actives fait échouer le second).
  PERFORM pg_advisory_xact_lock(hashtext('perf_ref:' || p_athlete::text || ':' || v_metric));

  UPDATE public.performance_logs
     SET is_active_reference = false
   WHERE athlete_id = p_athlete
     AND metric_name = v_metric
     AND is_active_reference;

  INSERT INTO public.performance_logs
    (athlete_id, metric_type, metric_name, value, unit, date, is_active_reference, coach_validated, created_by)
  VALUES (
    p_athlete,
    CASE
      WHEN v_metric LIKE 'FCzone\_%' THEN 'zone'
      WHEN v_metric IN ('VMA','Vmax','VC','VO2max','PMA','FTP','FCmax','FCrepos','FCseuil') THEN 'reference'
      ELSE 'custom'
    END,
    v_metric,
    p_value,
    coalesce(nullif(btrim(p_unit), ''), CASE
      WHEN v_metric IN ('VMA','Vmax','VC') THEN 'km/h'
      WHEN v_metric = 'VO2max' THEN 'mL/kg/min'
      WHEN v_metric IN ('PMA','FTP') THEN 'W'
      WHEN v_metric IN ('FCmax','FCrepos','FCseuil') OR v_metric LIKE 'FCzone\_%' THEN 'bpm'
      ELSE '—'
    END),
    coalesce(p_date, current_date),
    true,
    -- Une référence posée par l'athlète lui-même reste « non validée » (en
    -- attente) : seule la validation du coach la marque validée.
    CASE WHEN v_is_coach THEN coalesce(p_validated, true) ELSE NULL END,
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_performance_reference(uuid, text, numeric, text, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_performance_reference(uuid, text, numeric, text, date, boolean) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3b. Zones FC : une écriture logique, pas de ligne si la valeur ne change pas
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_fc_zones(p_athlete uuid, p_zones jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_coach boolean;
  v_key      text;
  v_raw      jsonb;
  v_value    numeric;
  v_current  numeric;
  v_written  integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  v_is_coach := public.is_coach_of(p_athlete) OR public.current_user_is_admin();
  IF NOT (p_athlete = auth.uid() OR v_is_coach) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_zones IS NULL OR jsonb_typeof(p_zones) <> 'object' THEN
    RAISE EXCEPTION 'Zones attendues sous forme d''objet' USING ERRCODE = '22023';
  END IF;

  -- Tout est vérifié avant la première écriture.
  FOR v_key, v_raw IN SELECT key, value FROM jsonb_each(p_zones) LOOP
    IF v_key NOT IN ('FCzone_Z0_min','FCzone_Z1_max','FCzone_Z2_max','FCzone_Z3_max','FCzone_Z4_max','FCzone_Z5_max') THEN
      RAISE EXCEPTION 'Zone FC inconnue : %', v_key USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_raw) <> 'number' THEN
      RAISE EXCEPTION 'Valeur invalide pour % : %', v_key, v_raw USING ERRCODE = '22023';
    END IF;
    IF (v_raw #>> '{}')::numeric < 0 THEN
      RAISE EXCEPTION 'Valeur invalide pour % : %', v_key, v_raw USING ERRCODE = '22023';
    END IF;
  END LOOP;

  PERFORM pg_advisory_xact_lock(hashtext('perf_zones:' || p_athlete::text));

  FOR v_key, v_raw IN SELECT key, value FROM jsonb_each(p_zones) ORDER BY key LOOP
    v_value := (v_raw #>> '{}')::numeric;

    SELECT value INTO v_current
      FROM public.performance_logs
     WHERE athlete_id = p_athlete AND metric_name = v_key AND is_active_reference;

    CONTINUE WHEN v_current IS NOT DISTINCT FROM v_value;

    UPDATE public.performance_logs
       SET is_active_reference = false
     WHERE athlete_id = p_athlete AND metric_name = v_key AND is_active_reference;

    INSERT INTO public.performance_logs
      (athlete_id, metric_type, metric_name, value, unit, date, is_active_reference, coach_validated, created_by)
    VALUES
      (p_athlete, 'zone', v_key, v_value, 'bpm', current_date, true,
       CASE WHEN v_is_coach THEN true ELSE NULL END, auth.uid());
    v_written := v_written + 1;
  END LOOP;

  RETURN v_written;
END;
$$;

REVOKE ALL ON FUNCTION public.save_fc_zones(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fc_zones(uuid, jsonb) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3c. Valider / rejeter une mesure envoyée par l'athlète
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_performance_notification(
  p_notification uuid,
  p_log          uuid,
  p_approve      boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_athlete uuid;
  v_metric  text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT n.athlete_id, l.metric_name INTO v_athlete, v_metric
    FROM public.performance_notifications n
    JOIN public.performance_logs l ON l.id = n.performance_log_id AND l.athlete_id = n.athlete_id
   WHERE n.id = p_notification AND n.performance_log_id = p_log;
  IF v_athlete IS NULL THEN
    RAISE EXCEPTION 'Notification introuvable' USING ERRCODE = 'P0002';
  END IF;
  -- Seul un coach de l'athlète (référent ou co-coach) tranche.
  IF NOT (public.is_coach_of(v_athlete) OR public.current_user_is_admin()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.performance_notifications
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         resolved_at = now()
   WHERE id = p_notification;

  IF p_approve THEN
    PERFORM pg_advisory_xact_lock(hashtext('perf_ref:' || v_athlete::text || ':' || v_metric));
    UPDATE public.performance_logs
       SET is_active_reference = false
     WHERE athlete_id = v_athlete AND metric_name = v_metric AND is_active_reference AND id <> p_log;
    UPDATE public.performance_logs
       SET coach_validated = true, is_active_reference = true
     WHERE id = p_log;
  ELSE
    UPDATE public.performance_logs SET coach_validated = false WHERE id = p_log;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.review_performance_notification(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_performance_notification(uuid, uuid, boolean) TO authenticated, service_role;
