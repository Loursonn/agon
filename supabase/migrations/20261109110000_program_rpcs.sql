-- =============================================================================
-- Programme de musculation — écriture atomique par séance (docs/COUCHE_API.md)
--
-- Le programme reste dans `app_data` (clé `asp:prog`, valeur `ProgSession[]`,
-- format inchangé : coach-api le lit et l'écrit aussi). Jusqu'ici l'app
-- réécrivait TOUT le tableau depuis son cache (jusqu'à 30 s d'âge) :
--  - le coach et un co-coach qui éditent en même temps s'écrasaient ;
--  - une proposition de l'assistant appliquée côté serveur (coach-api) était
--    effacée à la première modification faite dans un onglet déjà ouvert ;
--  - une lecture en erreur (cache vide) suivie d'un ajout de séance
--    réécrivait le programme avec cette seule séance.
--
-- `program_save_sessions` n'écrit que les séances que le client a changées,
-- sous le verrou de la ligne, en vérifiant que chacune est encore dans l'état
-- que le client avait lu (`p_base`). Si quelqu'un d'autre a modifié la même
-- séance entre-temps : refus (SQLSTATE 40001), le client recharge et prévient.
-- Deux personnes qui modifient des séances différentes ne se gênent plus.
--
--   p_upsert : séances créées ou modifiées (objets complets, `id` obligatoire)
--   p_base   : { id: séance telle que lue } pour chaque séance modifiée ou
--              supprimée ; absente = création
--   p_remove : ids des séances supprimées (leur version lue dans p_base)
--   p_order  : ordre voulu des ids ; NULL = ordre actuel, nouvelles à la fin.
--              Une séance absente de p_order (ajoutée ailleurs) est gardée,
--              à la suite.
--
-- `updated_at` n'est PAS modifié par une édition (comme avant) : les fils
-- d'activité qui le lisent ne changent pas (voir 20261030110000).
--
-- Droits : ceux de la RLS `app_data` en écriture — un coach de l'athlète
-- (`is_coach_of` : référent ou co-coach) ou l'athlète lui-même (coach-athlète
-- qui se programme). Le staff n'écrit pas `app_data`.
--
-- Additif : aucune table, policy ni donnée modifiée. Le client en prod (main)
-- continue d'écrire par upsert direct, toujours permis.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.program_save_sessions(
  p_athlete uuid,
  p_upsert  jsonb,
  p_base    jsonb  DEFAULT '{}'::jsonb,
  p_remove  text[] DEFAULT '{}'::text[],
  p_order   text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_cur    jsonb;
  v_by     jsonb  := '{}'::jsonb;  -- id → séance (état courant, puis état final)
  v_ids    text[] := '{}';         -- ordre courant
  v_up_ids text[] := '{}';         -- ordre des séances envoyées
  v_seen   text[] := '{}';
  v_new    jsonb  := '[]'::jsonb;
  v_s      jsonb;
  v_id     text;
  v_now    jsonb;
  v_base   jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_athlete IS NULL OR NOT (p_athlete = v_me OR public.is_coach_of(p_athlete)) THEN
    RAISE EXCEPTION 'Programme non modifiable' USING ERRCODE = '42501';
  END IF;
  IF p_upsert IS NULL OR jsonb_typeof(p_upsert) <> 'array' THEN
    RAISE EXCEPTION 'Séances invalides' USING ERRCODE = '22023';
  END IF;
  p_base := coalesce(p_base, '{}'::jsonb);
  IF jsonb_typeof(p_base) <> 'object' THEN
    RAISE EXCEPTION 'Version de référence invalide' USING ERRCODE = '22023';
  END IF;
  p_remove := coalesce(p_remove, '{}'::text[]);

  FOR v_s IN SELECT value FROM jsonb_array_elements(p_upsert) LOOP
    IF jsonb_typeof(v_s) <> 'object' OR jsonb_typeof(v_s -> 'id') IS DISTINCT FROM 'string' OR v_s ->> 'id' = '' THEN
      RAISE EXCEPTION 'Séance sans identifiant' USING ERRCODE = '22023';
    END IF;
    v_id := v_s ->> 'id';
    IF v_id = ANY (v_up_ids) THEN
      RAISE EXCEPTION 'Séance envoyée deux fois : %', v_id USING ERRCODE = '22023';
    END IF;
    IF v_id = ANY (p_remove) THEN
      RAISE EXCEPTION 'Séance à la fois modifiée et supprimée : %', v_id USING ERRCODE = '22023';
    END IF;
    v_up_ids := v_up_ids || v_id;
  END LOOP;

  -- Ligne verrouillée jusqu'à la fin : deux enregistrements simultanés passent
  -- l'un après l'autre. Créée vide si l'athlète n'a pas encore de programme.
  INSERT INTO public.app_data (athlete_id, key, value)
  VALUES (p_athlete, 'asp:prog', '[]'::jsonb)
  ON CONFLICT (athlete_id, key) DO NOTHING;

  SELECT value INTO v_cur
    FROM public.app_data
   WHERE athlete_id = p_athlete AND key = 'asp:prog'
     FOR UPDATE;
  IF v_cur IS NULL OR jsonb_typeof(v_cur) = 'null' THEN
    v_cur := '[]'::jsonb;
  END IF;
  IF jsonb_typeof(v_cur) <> 'array' THEN
    RAISE EXCEPTION 'Programme illisible' USING ERRCODE = '22023';
  END IF;

  -- Une séance sans id ou en double : on refuse plutôt que de la perdre.
  FOR v_s IN SELECT value FROM jsonb_array_elements(v_cur) LOOP
    v_id := v_s ->> 'id';
    IF jsonb_typeof(v_s) <> 'object' OR v_id IS NULL OR v_id = '' OR v_by ? v_id THEN
      RAISE EXCEPTION 'Programme illisible (séance sans identifiant ou en double)' USING ERRCODE = '22023';
    END IF;
    v_by := v_by || jsonb_build_object(v_id, v_s);
    v_ids := v_ids || v_id;
  END LOOP;

  -- Conflits : la séance a changé depuis la lecture du client.
  FOR v_s IN SELECT value FROM jsonb_array_elements(p_upsert) LOOP
    v_id := v_s ->> 'id';
    v_now := v_by -> v_id;
    v_base := p_base -> v_id;
    IF v_now IS NULL AND v_base IS NOT NULL THEN
      RAISE EXCEPTION 'Séance supprimée entre-temps : %', v_s ->> 'name' USING ERRCODE = '40001';
    END IF;
    -- v_now = v_s : déjà enregistrée telle quelle (renvoi), accepté.
    IF v_now IS NOT NULL AND v_now <> v_s AND (v_base IS NULL OR v_now <> v_base) THEN
      RAISE EXCEPTION 'Séance modifiée entre-temps : %', v_now ->> 'name' USING ERRCODE = '40001';
    END IF;
  END LOOP;
  FOREACH v_id IN ARRAY p_remove LOOP
    v_now := v_by -> v_id;
    v_base := p_base -> v_id;
    IF v_now IS NOT NULL AND (v_base IS NULL OR v_now <> v_base) THEN
      RAISE EXCEPTION 'Séance modifiée entre-temps : %', v_now ->> 'name' USING ERRCODE = '40001';
    END IF;
  END LOOP;

  -- Application.
  FOR v_s IN SELECT value FROM jsonb_array_elements(p_upsert) LOOP
    v_by := v_by || jsonb_build_object(v_s ->> 'id', v_s);
  END LOOP;
  v_by := v_by - p_remove;

  -- Ordre : celui demandé, puis les séances non citées (ajoutées ailleurs),
  -- puis les nouvelles non citées.
  IF p_order IS NOT NULL THEN
    FOREACH v_id IN ARRAY p_order LOOP
      IF v_id IS NOT NULL AND v_by ? v_id AND v_id <> ALL (v_seen) THEN
        v_new := v_new || jsonb_build_array(v_by -> v_id);
        v_seen := v_seen || v_id;
      END IF;
    END LOOP;
  END IF;
  FOREACH v_id IN ARRAY v_ids || v_up_ids LOOP
    IF v_by ? v_id AND v_id <> ALL (v_seen) THEN
      v_new := v_new || jsonb_build_array(v_by -> v_id);
      v_seen := v_seen || v_id;
    END IF;
  END LOOP;

  UPDATE public.app_data
     SET value = v_new
   WHERE athlete_id = p_athlete AND key = 'asp:prog';

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.program_save_sessions(uuid, jsonb, jsonb, text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.program_save_sessions(uuid, jsonb, jsonb, text[], text[]) TO authenticated;

COMMENT ON FUNCTION public.program_save_sessions(uuid, jsonb, jsonb, text[], text[]) IS
  'Enregistre les séances modifiées de asp:prog sans réécrire les autres ; refuse (40001) une séance changée depuis la lecture. Voir src/api/program.ts.';
