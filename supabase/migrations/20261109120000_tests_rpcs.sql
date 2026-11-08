-- =============================================================================
-- Tests — enregistrement atomique d'un résultat de test (src/api/tests.ts)
--
-- Jusqu'ici, modifier un résultat (page Tests du coach) faisait trois requêtes :
-- mettre à jour la date / les notes, SUPPRIMER toutes les valeurs, puis les
-- réinsérer. Si la réinsertion échouait (réseau, valeur refusée), le résultat
-- restait sans aucune valeur : perdu. La création faisait deux requêtes et
-- supprimait le résultat à la main en cas d'échec.
--
-- `save_athlete_test_result` fait tout dans une transaction :
--   - p_result NULL → crée le résultat ; sinon met à jour date et notes ;
--   - valeurs : celles absentes de p_values sont retirées, les autres insérées
--     ou mises à jour (le trigger trg_sync_extrap_perf crée la référence
--     VMA… exactement comme avant, sur insert comme sur update) ;
--   - une variable qui n'appartient pas au test est refusée.
--
-- Droits : ceux des policies atr_* / atv_* — coach de l'athlète (référent ou
-- co-coach, `is_coach_of`) ou admin. L'athlète et le staff n'écrivent pas de
-- résultat directement (l'athlète passe par test_sessions + trigger).
--
-- Additif : aucune table, policy ni donnée modifiée. Le client en prod (main)
-- continue d'écrire table par table, toujours permis.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.save_athlete_test_result(
  p_athlete      uuid,
  p_definition   uuid,
  p_performed_at date,
  p_notes        text,
  p_values       jsonb,
  p_result       uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_id     uuid;
  v_def    uuid;
  v_bad    text;
  v_vars   uuid[];
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_athlete IS NULL OR NOT (public.is_coach_of(p_athlete) OR public.current_user_is_admin()) THEN
    RAISE EXCEPTION 'Seul le coach de l''athlète enregistre ses résultats' USING ERRCODE = '42501';
  END IF;
  IF p_performed_at IS NULL THEN
    RAISE EXCEPTION 'Date manquante' USING ERRCODE = '22023';
  END IF;
  IF p_values IS NULL OR jsonb_typeof(p_values) <> 'object' THEN
    RAISE EXCEPTION 'Valeurs invalides' USING ERRCODE = '22023';
  END IF;

  -- Valeurs numériques seulement
  SELECT key INTO v_bad FROM jsonb_each(p_values) WHERE jsonb_typeof(value) <> 'number' LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Valeur non numérique pour la variable %', v_bad USING ERRCODE = '22023';
  END IF;
  -- Clés = uuid de variables
  SELECT key INTO v_bad FROM jsonb_each(p_values)
   WHERE key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Variable inconnue : %', v_bad USING ERRCODE = '22023';
  END IF;

  IF p_result IS NULL THEN
    IF p_definition IS NULL OR NOT EXISTS (SELECT 1 FROM public.test_definitions WHERE id = p_definition) THEN
      RAISE EXCEPTION 'Test inconnu' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.athlete_test_results (athlete_id, test_definition_id, performed_at, notes)
    VALUES (p_athlete, p_definition, p_performed_at, nullif(btrim(p_notes), ''))
    RETURNING id, test_definition_id INTO v_id, v_def;
  ELSE
    UPDATE public.athlete_test_results
       SET performed_at = p_performed_at,
           notes        = nullif(btrim(p_notes), ''),
           updated_at   = now()
     WHERE id = p_result AND athlete_id = p_athlete
    RETURNING id, test_definition_id INTO v_id, v_def;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Résultat introuvable' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT coalesce(array_agg(key::uuid), '{}') INTO v_vars FROM jsonb_each(p_values);

  -- Toutes les variables doivent appartenir au test du résultat
  IF EXISTS (
    SELECT 1 FROM unnest(v_vars) AS x(id)
     WHERE NOT EXISTS (SELECT 1 FROM public.test_variables tv WHERE tv.id = x.id AND tv.test_definition_id = v_def)
  ) THEN
    RAISE EXCEPTION 'Variable étrangère à ce test' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.athlete_test_values
   WHERE result_id = v_id AND NOT (variable_id = ANY (v_vars));

  INSERT INTO public.athlete_test_values (result_id, variable_id, value)
  SELECT v_id, key::uuid, (value #>> '{}')::numeric FROM jsonb_each(p_values)
  ON CONFLICT (result_id, variable_id) DO UPDATE SET value = excluded.value;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_athlete_test_result(uuid, uuid, date, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_athlete_test_result(uuid, uuid, date, text, jsonb, uuid) TO authenticated;

COMMENT ON FUNCTION public.save_athlete_test_result(uuid, uuid, date, text, jsonb, uuid) IS
  'Crée ou modifie un résultat de test et ses valeurs en une transaction (coach / admin). Voir src/api/tests.ts.';
