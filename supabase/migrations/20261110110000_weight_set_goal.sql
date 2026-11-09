-- =============================================================================
-- Poids — écriture atomique de l'objectif de poids (P6, docs/SANTE_TABLES.md §4)
--
-- Additif et compatible avec le client en production (`main`) : une nouvelle
-- fonction, que seul le nouveau client appelle. Aucune table, aucune policy,
-- aucune donnée modifiée par la migration elle-même.
--
-- Problème : `setBodyWeight` réécrivait TOUT `asp:bw` ({current, target}) depuis
-- la copie en mémoire de l'appareil ; un palier posé entre-temps par
-- `weight_record_milestone` (autre appareil, coach) était effacé.
--
-- `weight_set_goal(p_athlete, p_target_kg)` : pose UNIQUEMENT `target` dans
-- `asp:bw`, sous le verrou de la ligne ; `current` est gardé. p_target_kg NULL
-- ou 0 = pas d'objectif (comme l'ancien défaut `target: 0`). Les triggers
-- d'app_data propagent vers `body_weight_goals` dans la même transaction.
-- Renvoie `asp:bw` à jour.
--
-- Droits : l'athlète lui-même ou son coach (référent ou co-coach,
-- `is_coach_of`), comme `weight_set_day`. Le staff n'écrit pas le poids.
--
-- Rollback : DROP FUNCTION public.weight_set_goal(uuid, numeric);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.weight_set_goal(p_athlete uuid, p_target_kg numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  uuid := auth.uid();
  v_tgt numeric := coalesce(p_target_kg, 0);
  v_bw  jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_athlete IS NULL THEN
    RAISE EXCEPTION 'Athlète obligatoire' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_athlete = v_me OR public.is_coach_of(p_athlete)) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  IF v_tgt < 0 OR v_tgt >= 500 THEN
    RAISE EXCEPTION 'Objectif de poids invalide' USING ERRCODE = '22023';
  END IF;

  -- Verrou de la ligne : un palier concurrent passe avant ou après, jamais écrasé.
  SELECT value INTO v_bw
    FROM public.app_data
   WHERE athlete_id = p_athlete AND key = 'asp:bw'
     FOR UPDATE;

  IF NOT FOUND THEN
    v_bw := jsonb_build_object('current', 0, 'target', to_jsonb(v_tgt));
    INSERT INTO public.app_data(athlete_id, key, value, updated_at)
    VALUES (p_athlete, 'asp:bw', v_bw, now())
    ON CONFLICT (athlete_id, key) DO UPDATE
      SET value = CASE WHEN jsonb_typeof(public.app_data.value) = 'object'
                       THEN public.app_data.value || jsonb_build_object('target', to_jsonb(v_tgt))
                       ELSE jsonb_build_object('current', 0, 'target', to_jsonb(v_tgt)) END,
          updated_at = now()
    RETURNING value INTO v_bw;
  ELSE
    IF v_bw IS NULL OR jsonb_typeof(v_bw) <> 'object' THEN
      v_bw := jsonb_build_object('current', 0);
    END IF;
    v_bw := v_bw || jsonb_build_object('target', to_jsonb(v_tgt));
    UPDATE public.app_data
       SET value = v_bw, updated_at = now()
     WHERE athlete_id = p_athlete AND key = 'asp:bw';
  END IF;

  RETURN v_bw;
END;
$$;

REVOKE ALL ON FUNCTION public.weight_set_goal(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.weight_set_goal(uuid, numeric) TO authenticated;
