-- =============================================================================
-- Nutrition — écriture atomique d'une journée du journal (lot 5, docs/COUCHE_API.md)
--
-- Le journal reste dans `app_data` (clé `asp:nutrition_log`, valeur
-- `{ "YYYY-MM-DD": { … } }`). Jusqu'ici le client relisait tout le blob, le
-- modifiait et le réécrivait (deux fois par enregistrement) : deux appareils
-- s'écrasaient. Cette fonction remplace UN jour, dans la même ligne, sous le
-- verrou de l'upsert.
--
-- Droit : l'athlète seulement (`p_athlete = auth.uid()`, coach-athlète sur son
-- propre profil compris). Aucun écran coach ou staff n'écrit le journal (vue
-- coach en lecture seule) ; c'est la déclaration de l'athlète, la lui réserver
-- évite qu'un coach la réécrive par erreur. Les lectures restent régies par la
-- RLS d'`app_data` (athlète, `is_coach_of`, staff « nutrition »).
--
-- Additif : aucune table, policy ni donnée modifiée. Le client en prod (main)
-- continue d'écrire par upsert direct, toujours permis.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.nutrition_save_day(p_athlete uuid, p_day date, p_log jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_fields text[] := ARRAY['active_calories', 'total_calories_consumed', 'glucides_consumed', 'lipides_consumed', 'proteines_consumed'];
  v_bad    text;
  v_clean  jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_athlete IS NULL OR p_athlete <> v_me THEN
    RAISE EXCEPTION 'Seul l''athlète saisit son journal nutrition' USING ERRCODE = '42501';
  END IF;
  IF p_day IS NULL THEN
    RAISE EXCEPTION 'Jour manquant' USING ERRCODE = '22023';
  END IF;
  IF p_log IS NULL OR jsonb_typeof(p_log) <> 'object' THEN
    RAISE EXCEPTION 'Journée invalide' USING ERRCODE = '22023';
  END IF;

  SELECT key INTO v_bad
    FROM jsonb_each(p_log)
   WHERE key = ANY (v_fields) AND jsonb_typeof(value) NOT IN ('number', 'null')
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Valeur non numérique : %', v_bad USING ERRCODE = '22023';
  END IF;

  -- Champs connus seulement : rien d'autre n'entre dans le journal.
  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_clean
    FROM jsonb_each(p_log)
   WHERE key = ANY (v_fields);

  INSERT INTO public.app_data AS a (athlete_id, key, value, updated_at)
  VALUES (p_athlete, 'asp:nutrition_log', jsonb_build_object(to_char(p_day, 'YYYY-MM-DD'), v_clean), now())
  ON CONFLICT (athlete_id, key) DO UPDATE
     SET value = (CASE WHEN jsonb_typeof(a.value) = 'object' THEN a.value ELSE '{}'::jsonb END)
                 || jsonb_build_object(to_char(p_day, 'YYYY-MM-DD'), v_clean),
         updated_at = now();

  RETURN v_clean;
END;
$$;

REVOKE ALL ON FUNCTION public.nutrition_save_day(uuid, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nutrition_save_day(uuid, date, jsonb) TO authenticated;

COMMENT ON FUNCTION public.nutrition_save_day(uuid, date, jsonb) IS
  'Remplace une journée de asp:nutrition_log (athlète uniquement). Voir src/api/nutrition.ts.';
