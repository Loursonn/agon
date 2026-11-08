-- =============================================================================
-- Poids — écriture atomique d'une pesée et d'un palier
-- Couche données, domaine profil (docs/COUCHE_API.md, src/api/profile.ts).
--
-- Additif et compatible avec le client en production (`main`) : deux nouvelles
-- fonctions, que seul le nouveau client appelle. Aucune table, aucune policy,
-- aucune donnée modifiée par la migration elle-même.
--
-- Problème : `useAthleteLogic.saveWellness` réécrit TOUT `asp:wlog` (journal de
-- poids) depuis sa copie en mémoire, et `asp:wmile` / `asp:bw` de même au
-- franchissement d'un palier. Deux appareils (téléphone de l'athlète, PC du
-- coach) ou deux onglets : la dernière écriture efface les pesées de l'autre.
--
-- 1. `weight_set_day(p_athlete, p_day, p_kg)` : pose UNE pesée dans `asp:wlog`
--    sous le verrou de la ligne. Format inchangé : clé compacte "YYYYMMDD",
--    valeur numérique ; une éventuelle clé ISO du même jour est retirée.
--    Renvoie le journal complet à jour (le client en a besoin pour
--    `checkMilestone`).
-- 2. `weight_record_milestone(p_athlete, p_day, p_kg)` : ajoute `{date, kg}` à
--    `asp:wmile` (sans doublon du même jour et du même poids) et pose
--    `asp:bw.current` en gardant `target`, dans la même transaction. Renvoie
--    `asp:bw` à jour.
--
-- Droits : l'athlète lui-même ou son coach (référent ou co-coach,
-- `is_coach_of`), comme `wellness_set_day`. Le staff n'écrit pas le poids.
--
-- Rollback : DROP FUNCTION des deux fonctions.
-- =============================================================================

-- ── 1. Une pesée ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.weight_set_day(p_athlete uuid, p_day date, p_kg numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  uuid := auth.uid();
  v_key text;
  v_iso text;
  v_cur jsonb;
  v_new jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_athlete IS NULL OR p_day IS NULL OR p_kg IS NULL THEN
    RAISE EXCEPTION 'Athlète, jour et poids obligatoires' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_athlete = v_me OR public.is_coach_of(p_athlete)) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  IF p_kg <= 0 OR p_kg >= 500 THEN
    RAISE EXCEPTION 'Poids invalide' USING ERRCODE = '22023';
  END IF;

  v_key := to_char(p_day, 'YYYYMMDD');
  v_iso := to_char(p_day, 'YYYY-MM-DD');

  -- Verrou de la ligne : deux appareils passent l'un après l'autre.
  SELECT value INTO v_cur
    FROM public.app_data
   WHERE athlete_id = p_athlete AND key = 'asp:wlog'
     FOR UPDATE;

  IF NOT FOUND THEN
    v_new := jsonb_build_object(v_key, to_jsonb(p_kg));
    INSERT INTO public.app_data(athlete_id, key, value, updated_at)
    VALUES (p_athlete, 'asp:wlog', v_new, now())
    ON CONFLICT (athlete_id, key) DO UPDATE
      SET value = jsonb_set(public.app_data.value - v_iso, ARRAY[v_key], to_jsonb(p_kg), true),
          updated_at = now()
    RETURNING value INTO v_new;
  ELSE
    IF v_cur IS NULL OR jsonb_typeof(v_cur) = 'null' THEN
      v_cur := '{}'::jsonb;
    ELSIF jsonb_typeof(v_cur) <> 'object' THEN
      -- Jamais vu en base ; on refuse plutôt que d'écraser un blob illisible.
      RAISE EXCEPTION 'Journal de poids illisible' USING ERRCODE = '22023';
    END IF;
    v_new := jsonb_set(v_cur - v_iso, ARRAY[v_key], to_jsonb(p_kg), true);
    UPDATE public.app_data
       SET value = v_new, updated_at = now()
     WHERE athlete_id = p_athlete AND key = 'asp:wlog';
  END IF;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.weight_set_day(uuid, date, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.weight_set_day(uuid, date, numeric) TO authenticated;

-- ── 2. Un palier franchi ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.weight_record_milestone(p_athlete uuid, p_day date, p_kg numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_key  text;
  v_item jsonb;
  v_mile jsonb;
  v_bw   jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_athlete IS NULL OR p_day IS NULL OR p_kg IS NULL THEN
    RAISE EXCEPTION 'Athlète, jour et poids obligatoires' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_athlete = v_me OR public.is_coach_of(p_athlete)) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  IF p_kg <= 0 OR p_kg >= 500 THEN
    RAISE EXCEPTION 'Poids invalide' USING ERRCODE = '22023';
  END IF;

  v_key  := to_char(p_day, 'YYYYMMDD');
  v_item := jsonb_build_object('date', v_key, 'kg', to_jsonb(p_kg));

  -- Paliers (tableau) : ajout, sauf s'il est déjà là (double clic, renvoi).
  SELECT value INTO v_mile
    FROM public.app_data
   WHERE athlete_id = p_athlete AND key = 'asp:wmile'
     FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.app_data(athlete_id, key, value, updated_at)
    VALUES (p_athlete, 'asp:wmile', jsonb_build_array(v_item), now())
    ON CONFLICT (athlete_id, key) DO UPDATE
      SET value = CASE
            WHEN jsonb_typeof(public.app_data.value) <> 'array' THEN jsonb_build_array(v_item)
            WHEN public.app_data.value @> jsonb_build_array(v_item) THEN public.app_data.value
            ELSE public.app_data.value || jsonb_build_array(v_item)
          END,
          updated_at = now();
  ELSE
    IF v_mile IS NULL OR jsonb_typeof(v_mile) = 'null' THEN
      v_mile := '[]'::jsonb;
    ELSIF jsonb_typeof(v_mile) <> 'array' THEN
      RAISE EXCEPTION 'Paliers de poids illisibles' USING ERRCODE = '22023';
    END IF;
    IF NOT (v_mile @> jsonb_build_array(v_item)) THEN
      UPDATE public.app_data
         SET value = v_mile || jsonb_build_array(v_item), updated_at = now()
       WHERE athlete_id = p_athlete AND key = 'asp:wmile';
    END IF;
  END IF;

  -- Poids de corps : `current` = palier, `target` gardé.
  SELECT value INTO v_bw
    FROM public.app_data
   WHERE athlete_id = p_athlete AND key = 'asp:bw'
     FOR UPDATE;

  IF NOT FOUND THEN
    v_bw := jsonb_build_object('current', to_jsonb(p_kg), 'target', 0);
    INSERT INTO public.app_data(athlete_id, key, value, updated_at)
    VALUES (p_athlete, 'asp:bw', v_bw, now())
    ON CONFLICT (athlete_id, key) DO UPDATE
      SET value = CASE WHEN jsonb_typeof(public.app_data.value) = 'object'
                       THEN public.app_data.value || jsonb_build_object('current', to_jsonb(p_kg))
                       ELSE jsonb_build_object('current', to_jsonb(p_kg), 'target', 0) END,
          updated_at = now()
    RETURNING value INTO v_bw;
  ELSE
    IF v_bw IS NULL OR jsonb_typeof(v_bw) <> 'object' THEN
      v_bw := jsonb_build_object('target', 0);
    END IF;
    v_bw := v_bw || jsonb_build_object('current', to_jsonb(p_kg));
    UPDATE public.app_data
       SET value = v_bw, updated_at = now()
     WHERE athlete_id = p_athlete AND key = 'asp:bw';
  END IF;

  RETURN v_bw;
END;
$$;

REVOKE ALL ON FUNCTION public.weight_record_milestone(uuid, date, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.weight_record_milestone(uuid, date, numeric) TO authenticated;
