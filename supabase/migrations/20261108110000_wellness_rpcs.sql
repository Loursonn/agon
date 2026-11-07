-- =============================================================================
-- Wellness — écriture atomique d'un jour + fuite staff du wellness archivé
-- Lot 3 de la couche données (docs/COUCHE_API.md).
--
-- Additif et compatible avec le client en production (`main`) :
--   * deux nouvelles fonctions, que seul le nouveau client appelle ;
--   * `staff_app_data_domain` : `asp:blockHistory` n'est plus ouvert au staff.
--     Aucun écran staff ne lit cette clé (le contexte athlète la charge, une
--     ligne filtrée par la RLS redonne simplement la valeur par défaut `[]`).
--
-- 1. Écritures concurrentes (bug 9). L'athlète (téléphone) et le coach (PC)
--    réécrivaient tout `asp:wh` depuis leur copie en mémoire : la dernière
--    écriture effaçait la saisie de l'autre. `wellness_set_day` /
--    `wellness_delete_day` ne touchent qu'UN jour, sous le verrou de la ligne.
--    Format inchangé : clé compacte "YYYYMMDD", champ `date` compact.
--    `asp:wellness` (copie de la saisie la plus récente, lue par l'app athlète
--    pour « wellness du jour ») suit : mise à jour si le jour écrit est le plus
--    récent, supprimée si c'est ce jour-là qu'on efface.
--
-- 2. Fuite staff (bug 8). `asp:blockHistory` (blocs archivés) était rangé dans
--    le domaine `seances`. Or chaque bloc archivé embarque `wellnessHistory`
--    (wellness), `bodyWeight` (nutrition), `sets` / `completedSessions` /
--    `athleteNotes` (logs) en plus du programme. Un pro avec le seul droit
--    « séances » lisait donc wellness et poids archivés. Le rattacher à
--    `wellness` ouvrirait à l'inverse séances, logs et poids à un pro qui n'a
--    que le bien-être. Le plus sûr : ne plus l'ouvrir du tout au staff (NULL),
--    comme les banques du coach. Si un jour le staff doit voir l'archive, la
--    servir par une RPC qui filtre chaque partie selon ses droits.
--
-- Rollback : DROP des deux fonctions ; rejouer `staff_app_data_domain` de
-- 20261031120000_staff_core.sql.
-- =============================================================================

-- ── 1. Écrire un jour ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wellness_set_day(p_athlete uuid, p_day date, p_entry jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_key   text;
  v_iso   text;
  v_entry jsonb;
  v_cur   jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_athlete IS NULL OR p_day IS NULL THEN
    RAISE EXCEPTION 'Athlète et jour obligatoires' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_athlete = v_me OR public.is_coach_of(p_athlete)) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  IF p_entry IS NULL OR jsonb_typeof(p_entry) <> 'object' THEN
    RAISE EXCEPTION 'Saisie wellness invalide' USING ERRCODE = '22023';
  END IF;

  v_key   := to_char(p_day, 'YYYYMMDD');
  v_iso   := to_char(p_day, 'YYYY-MM-DD');
  v_entry := p_entry || jsonb_build_object('date', v_key);

  -- Verrou de la ligne : deux appareils qui écrivent en même temps passent
  -- l'un après l'autre, chacun sur la version à jour.
  SELECT value INTO v_cur
    FROM public.app_data
   WHERE athlete_id = p_athlete AND key = 'asp:wh'
     FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.app_data(athlete_id, key, value, updated_at)
    VALUES (p_athlete, 'asp:wh', jsonb_build_object(v_key, v_entry), now())
    ON CONFLICT (athlete_id, key) DO UPDATE
      SET value = jsonb_set(public.app_data.value - v_iso, ARRAY[v_key], v_entry, true),
          updated_at = now();
  ELSE
    IF jsonb_typeof(v_cur) <> 'object' THEN
      -- Jamais vu en base ; on refuse plutôt que d'écraser un blob illisible.
      RAISE EXCEPTION 'Historique wellness illisible' USING ERRCODE = '22023';
    END IF;
    UPDATE public.app_data
       SET value = jsonb_set(v_cur - v_iso, ARRAY[v_key], v_entry, true),
           updated_at = now()
     WHERE athlete_id = p_athlete AND key = 'asp:wh';
  END IF;

  -- Copie « saisie la plus récente » (asp:wellness), si ce jour l'est.
  INSERT INTO public.app_data(athlete_id, key, value, updated_at)
  VALUES (p_athlete, 'asp:wellness', v_entry, now())
  ON CONFLICT (athlete_id, key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now()
  WHERE jsonb_typeof(public.app_data.value) <> 'object'
     OR coalesce(replace(public.app_data.value->>'date', '-', ''), '') <= v_key;

  RETURN v_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.wellness_set_day(uuid, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wellness_set_day(uuid, date, jsonb) TO authenticated;

-- ── 2. Effacer un jour ────────────────────────────────────────────────────────
-- Ne touche que `asp:wh` (et la copie `asp:wellness` de ce jour) : les blocs
-- archivés restent tels quels. Renvoie true si une saisie a été retirée.
CREATE OR REPLACE FUNCTION public.wellness_delete_day(p_athlete uuid, p_day date)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_key  text;
  v_iso  text;
  v_rows int;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_athlete IS NULL OR p_day IS NULL THEN
    RAISE EXCEPTION 'Athlète et jour obligatoires' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_athlete = v_me OR public.is_coach_of(p_athlete)) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;

  v_key := to_char(p_day, 'YYYYMMDD');
  v_iso := to_char(p_day, 'YYYY-MM-DD');

  UPDATE public.app_data
     SET value = value - v_key - v_iso,
         updated_at = now()
   WHERE athlete_id = p_athlete AND key = 'asp:wh'
     AND jsonb_typeof(value) = 'object'
     AND (value ? v_key OR value ? v_iso);
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  DELETE FROM public.app_data
   WHERE athlete_id = p_athlete AND key = 'asp:wellness'
     AND jsonb_typeof(value) = 'object'
     AND replace(value->>'date', '-', '') = v_key;

  RETURN v_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.wellness_delete_day(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wellness_delete_day(uuid, date) TO authenticated;

-- ── 3. Staff : l'archive des blocs n'est plus ouverte ─────────────────────────
-- Même définition que 20261031120000_staff_core.sql, sauf `asp:blockHistory`.
CREATE OR REPLACE FUNCTION public.staff_app_data_domain(p_key text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE split_part(p_key, '::', 1)
    WHEN 'asp:prog'            THEN 'seances'
    WHEN 'asp:exos'            THEN 'seances'
    WHEN 'asp:exMeta'          THEN 'seances'
    WHEN 'asp:sessions'        THEN 'seances'
    WHEN 'asp:blockConfig'     THEN 'seances'
    -- asp:blockHistory : volontairement absent (wellness, poids et logs archivés).
    WHEN 'asp:weekschedule'    THEN 'seances'
    WHEN 'asp:visibility'      THEN 'seances'
    WHEN 'asp:custmethods'     THEN 'seances'
    WHEN 'asp:goals'           THEN 'seances'
    WHEN 'asp:seances-type'    THEN 'seances'
    WHEN 'asp:percycle_migrated' THEN 'seances'
    WHEN 'asp:sets'            THEN 'logs'
    WHEN 'asp:completed'       THEN 'logs'
    WHEN 'asp:sessionlogs'     THEN 'logs'
    WHEN 'asp:freesess'        THEN 'logs'
    WHEN 'asp:anotes'          THEN 'logs'
    WHEN 'asp:prs'             THEN 'logs'
    WHEN 'asp:wellness'        THEN 'wellness'
    WHEN 'asp:wh'              THEN 'wellness'
    WHEN 'asp:nutrition_strategy' THEN 'nutrition'
    WHEN 'asp:nutrition_log'   THEN 'nutrition'
    WHEN 'asp:wlog'            THEN 'nutrition'
    WHEN 'asp:wmile'           THEN 'nutrition'
    WHEN 'asp:bw'              THEN 'nutrition'
    WHEN 'asp:injuries'        THEN 'medical'
    WHEN 'asp:coach_feedback'  THEN 'commentaires'
    ELSE NULL
  END;
$$;
