-- =============================================================================
-- Séances réalisées (workout_logs) — écritures atomiques
-- Lot 2 de la couche données (docs/COUCHE_API.md).
--
-- Additif et compatible avec le client en production (`main`) : cinq nouvelles
-- fonctions que seul le nouveau client appelle ; aucune policy ni colonne
-- touchée. Le client actuel continue d'écrire directement dans la table.
-- `workout_log_has_entries` est durcie (§0a) sans changer son verdict.
--
-- Pourquoi des RPC :
--  * l'enregistrement automatique de l'athlète réécrivait TOUT
--    `athlete_modifications` depuis sa copie en mémoire : l'adaptation du jour
--    posée par le coach entre-temps (`coachOverride`) était effacée (audit P5) ;
--  * l'adaptation du coach faisait « relire, modifier, réécrire » : une saisie
--    de l'athlète arrivée entre les deux était perdue ;
--  * valider / réouvrir / noter touchaient plusieurs colonnes sans règle commune.
--
-- Règle de fusion (identique à `mergeEntries` de
-- supabase/functions/_shared/domain/athleteMods.ts) :
--   mods = COALESCE(mods, '{}') || (saisie - 'coachOverride')
-- fusion de premier niveau, sous le verrou de la ligne ; `coachOverride` ne
-- s'écrit que par `set_coach_override` (coach). Une saisie vide ne change rien
-- (une séance sans trace reste `NULL`, voir deletePlannedWorkouts).
--
-- RPE : une seule source, `workout_logs.rpe_score` (décision Hugo 2026-11-07).
-- `workout_rpe` n'est plus écrite par le nouveau client ; elle est gardée pour
-- l'export, à supprimer plus tard. Rattrapage : 3 séances validées n'avaient
-- leur RPE que dans `workout_rpe` (dernier § de ce fichier).
--
-- Rollback : DROP FUNCTION des six nouvelles fonctions ; rejouer
-- `workout_log_has_entries` de 20260807000000 (le rattrapage RPE n'écrit que
-- des `rpe_score` qui étaient NULL).
-- =============================================================================

-- ── 0a. « Séance saisie » : la règle unique, durcie ──────────────────────────
-- Même règle qu'en 20260807000000 (une série compte dès qu'elle porte kg ou
-- reps non null) et que `hasLoggedEntries` côté front. Seul changement : un
-- `sessionSets` qui n'est pas un objet faisait LEVER la fonction (jsonb_each),
-- donc échouer tout le cron de nuit `run_workout_status_maintenance` pour tous
-- les athlètes. Il compte maintenant comme « rien saisi ». Aucun écart sur les
-- données actuelles (188 lignes, toutes avec un objet).
CREATE OR REPLACE FUNCTION public.workout_log_has_entries(mods jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_each(
      CASE WHEN jsonb_typeof(mods -> 'sessionSets') = 'object' THEN mods -> 'sessionSets' ELSE '{}'::jsonb END
    ) AS ex(ex_id, ex_rows)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(ex.ex_rows) = 'array' THEN ex.ex_rows ELSE '[]'::jsonb END
    ) AS s(item)
    WHERE jsonb_typeof(s.item) = 'object'
      AND (
        (s.item ? 'kg'   AND jsonb_typeof(s.item -> 'kg')   <> 'null') OR
        (s.item ? 'reps' AND jsonb_typeof(s.item -> 'reps') <> 'null')
      )
  );
$fn$;

-- ── 0b. Verrou + droit (interne, non exposé) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public._workout_log_for_write(p_log uuid, p_coach_only boolean DEFAULT false)
RETURNS public.workout_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  uuid := auth.uid();
  v_row public.workout_logs;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_log IS NULL THEN
    RAISE EXCEPTION 'Séance obligatoire' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.workout_logs WHERE id = p_log FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Séance introuvable' USING ERRCODE = 'P0002';
  END IF;
  IF p_coach_only THEN
    IF NOT public.is_coach_of(v_row.athlete_id) THEN
      RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (v_row.athlete_id = v_me OR public.is_coach_of(v_row.athlete_id)) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public._workout_log_for_write(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ── 1. Valider une séance ────────────────────────────────────────────────────
-- Idempotent : rejouer l'appel (retry réseau) ne change ni completed_at ni le
-- RPE ni la distance déjà donnés.
CREATE OR REPLACE FUNCTION public.complete_workout(
  p_log    uuid,
  p_mods   jsonb    DEFAULT NULL,
  p_run_km numeric  DEFAULT NULL,
  p_rpe    smallint DEFAULT NULL
)
RETURNS public.workout_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row  public.workout_logs;
  v_mods jsonb;
BEGIN
  v_row := public._workout_log_for_write(p_log);
  IF p_mods IS NOT NULL AND jsonb_typeof(p_mods) <> 'object' THEN
    RAISE EXCEPTION 'Saisie invalide' USING ERRCODE = '22023';
  END IF;
  IF p_rpe IS NOT NULL AND (p_rpe < 1 OR p_rpe > 10) THEN
    RAISE EXCEPTION 'RPE entre 1 et 10' USING ERRCODE = '22023';
  END IF;
  IF p_run_km IS NOT NULL AND p_run_km < 0 THEN
    RAISE EXCEPTION 'Distance invalide' USING ERRCODE = '22023';
  END IF;

  v_mods := v_row.athlete_modifications;
  IF p_mods IS NOT NULL AND (p_mods - 'coachOverride') <> '{}'::jsonb THEN
    v_mods := COALESCE(v_mods, '{}'::jsonb) || (p_mods - 'coachOverride');
  END IF;

  UPDATE public.workout_logs
     SET status                = 'completed',
         completed_at          = COALESCE(completed_at, now()),
         athlete_modifications = v_mods,
         run_distance_km       = COALESCE(p_run_km, run_distance_km),
         rpe_score             = COALESCE(p_rpe, rpe_score)
   WHERE id = p_log
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ── 2. Réouvrir une séance validée ───────────────────────────────────────────
-- Même effet que l'ancien client (statut prévu, RPE effacé : il sera redonné à
-- la nouvelle validation). La saisie est gardée. Sans effet si pas validée.
CREATE OR REPLACE FUNCTION public.reopen_workout(p_log uuid)
RETURNS public.workout_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.workout_logs;
BEGIN
  v_row := public._workout_log_for_write(p_log);
  IF v_row.status <> 'completed' THEN
    RETURN v_row;
  END IF;
  UPDATE public.workout_logs
     SET status = 'planned', completed_at = NULL, rpe_score = NULL
   WHERE id = p_log
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ── 3. RPE de fin de séance (NULL = retirer) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_workout_rpe(p_log uuid, p_rpe smallint)
RETURNS public.workout_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.workout_logs;
BEGIN
  v_row := public._workout_log_for_write(p_log);
  IF p_rpe IS NOT NULL AND (p_rpe < 1 OR p_rpe > 10) THEN
    RAISE EXCEPTION 'RPE entre 1 et 10' USING ERRCODE = '22023';
  END IF;
  UPDATE public.workout_logs SET rpe_score = p_rpe WHERE id = p_log
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ── 4. Saisie en cours (séries, forme, commentaires, vidéo envoyée) ──────────
CREATE OR REPLACE FUNCTION public.patch_workout_entries(p_log uuid, p_patch jsonb)
RETURNS public.workout_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.workout_logs;
BEGIN
  v_row := public._workout_log_for_write(p_log);
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Saisie invalide' USING ERRCODE = '22023';
  END IF;
  IF (p_patch - 'coachOverride') = '{}'::jsonb THEN
    RETURN v_row;
  END IF;
  UPDATE public.workout_logs
     SET athlete_modifications = COALESCE(athlete_modifications, '{}'::jsonb) || (p_patch - 'coachOverride')
   WHERE id = p_log
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ── 5. Adaptation du jour par le coach (NULL = retirer) ──────────────────────
CREATE OR REPLACE FUNCTION public.set_coach_override(p_log uuid, p_override jsonb)
RETURNS public.workout_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row  public.workout_logs;
  v_mods jsonb;
BEGIN
  v_row := public._workout_log_for_write(p_log, true);
  IF p_override IS NULL THEN
    v_mods := v_row.athlete_modifications - 'coachOverride';
    IF v_mods = '{}'::jsonb THEN v_mods := NULL; END IF;
  ELSE
    IF jsonb_typeof(p_override) <> 'object' OR jsonb_typeof(p_override -> 'blocs') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Adaptation invalide (blocs attendus)' USING ERRCODE = '22023';
    END IF;
    v_mods := COALESCE(v_row.athlete_modifications, '{}'::jsonb)
              || jsonb_build_object('coachOverride', p_override || jsonb_build_object('createdAt', to_jsonb(now())));
  END IF;
  UPDATE public.workout_logs SET athlete_modifications = v_mods WHERE id = p_log
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ── Droits ───────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.complete_workout(uuid, jsonb, numeric, smallint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reopen_workout(uuid)                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_workout_rpe(uuid, smallint)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.patch_workout_entries(uuid, jsonb)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_coach_override(uuid, jsonb)                   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_workout(uuid, jsonb, numeric, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_workout(uuid)                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_workout_rpe(uuid, smallint)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.patch_workout_entries(uuid, jsonb)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_coach_override(uuid, jsonb)                   TO authenticated;

COMMENT ON FUNCTION public.complete_workout(uuid, jsonb, numeric, smallint) IS
  'Valide une séance (athlète ou coach) : statut, completed_at conservé, saisie fusionnée sans toucher coachOverride. Idempotent.';
COMMENT ON FUNCTION public.patch_workout_entries(uuid, jsonb) IS
  'Fusionne la saisie de l''athlète (mods || patch - coachOverride) sous verrou de ligne.';
COMMENT ON FUNCTION public.set_coach_override(uuid, jsonb) IS
  'Pose (ou retire si NULL) l''adaptation du jour du coach, sans toucher la saisie de l''athlète.';

-- ── Rattrapage RPE : 3 séances validées n'avaient leur RPE que dans workout_rpe ─
UPDATE public.workout_logs w
   SET rpe_score = r.rpe_score
  FROM public.workout_rpe r
 WHERE r.workout_log_id = w.id
   AND w.rpe_score IS NULL
   AND w.status = 'completed';
