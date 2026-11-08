-- =============================================================================
-- Séances énergie programmées (energy_session_assignments) — écritures
-- atomiques de l'athlète. Couche données, domaine énergie (src/api/energy.ts).
--
-- Additif et compatible avec le client en production (`main`) : trois
-- nouvelles fonctions (+ un helper interne) que seul le nouveau client
-- appelle ; aucune policy, colonne ni donnée touchée. Le client actuel
-- continue d'écrire directement dans la table.
--
-- Pourquoi des RPC (mêmes défauts que les séances muscu avant le lot 2) :
--  * erreurs ignorées : un UPDATE filtré par la RLS (séance supprimée par le
--    coach, mauvais compte) ne renvoie pas d'erreur → « Séance validée ! »
--    alors que rien n'est écrit. Ici : 'Séance introuvable' (P0002) ou
--    'Accès refusé' (42501) ;
--  * double écriture : valider puis noter le RPE faisait deux requêtes ; la
--    validation accepte maintenant le RPE dans le même appel ;
--  * écrasement : `block_logs` était remplacé en entier ; il est fusionné par
--    bloc sous le verrou de la ligne (un 2ᵉ appareil qui valide sans saisie
--    n'efface plus les blocs cochés) ;
--  * annuler la validation laissait activité « course » + distance : la
--    séance redevenue prévue comptait encore dans le volume de course.
--
-- Pas de `completed_at` : la table n'a pas cette colonne (date de réalisation
-- = `scheduled_date`, comme aujourd'hui) ; à ajouter dans un lot à part si
-- besoin, avec régénération des types.
--
-- Rollback : DROP FUNCTION des quatre fonctions.
-- =============================================================================

-- ── 0. Verrou + droit (interne, non exposé) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public._energy_assignment_for_write(p_assignment uuid)
RETURNS public.energy_session_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  uuid := auth.uid();
  v_row public.energy_session_assignments;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_assignment IS NULL THEN
    RAISE EXCEPTION 'Séance obligatoire' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.energy_session_assignments WHERE id = p_assignment FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Séance introuvable' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_row.athlete_id = v_me OR public.is_coach_of(v_row.athlete_id)) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public._energy_assignment_for_write(uuid) FROM PUBLIC, anon, authenticated;

-- ── 1. Valider une séance énergie ────────────────────────────────────────────
-- Un paramètre NULL garde la valeur en base (comme l'ancien client, qui
-- n'envoyait que les champs remplis). L'activité et la distance vont
-- ensemble : une activité donnée remplace aussi la distance (NULL = aucune,
-- ex. « vélo »). Idempotent : rejouer l'appel donne la même ligne.
CREATE OR REPLACE FUNCTION public.complete_energy_assignment(
  p_assignment    uuid,
  p_block_logs    jsonb    DEFAULT NULL,
  p_notes         text     DEFAULT NULL,
  p_duration_min  integer  DEFAULT NULL,
  p_activity_url  text     DEFAULT NULL,
  p_activity_type text     DEFAULT NULL,
  p_distance_km   numeric  DEFAULT NULL,
  p_rpe           smallint DEFAULT NULL
)
RETURNS public.energy_session_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.energy_session_assignments;
BEGIN
  v_row := public._energy_assignment_for_write(p_assignment);
  IF p_block_logs IS NOT NULL AND jsonb_typeof(p_block_logs) <> 'object' THEN
    RAISE EXCEPTION 'Saisie des blocs invalide' USING ERRCODE = '22023';
  END IF;
  IF p_rpe IS NOT NULL AND (p_rpe < 1 OR p_rpe > 10) THEN
    RAISE EXCEPTION 'RPE entre 1 et 10' USING ERRCODE = '22023';
  END IF;
  IF p_duration_min IS NOT NULL AND p_duration_min < 0 THEN
    RAISE EXCEPTION 'Durée invalide' USING ERRCODE = '22023';
  END IF;
  IF p_distance_km IS NOT NULL AND p_distance_km < 0 THEN
    RAISE EXCEPTION 'Distance invalide' USING ERRCODE = '22023';
  END IF;
  IF p_activity_type IS NOT NULL AND p_activity_type NOT IN ('course', 'velo', 'rameur', 'natation', 'autre') THEN
    RAISE EXCEPTION 'Activité inconnue' USING ERRCODE = '22023';
  END IF;

  UPDATE public.energy_session_assignments
     SET status              = 'completed',
         block_logs          = COALESCE(block_logs, '{}'::jsonb) || COALESCE(p_block_logs, '{}'::jsonb),
         notes               = COALESCE(NULLIF(btrim(p_notes), ''), notes),
         actual_duration_min = COALESCE(p_duration_min, actual_duration_min),
         activity_url        = COALESCE(NULLIF(btrim(p_activity_url), ''), activity_url),
         activity_type       = COALESCE(p_activity_type, activity_type),
         distance_km         = CASE WHEN p_activity_type IS NOT NULL THEN p_distance_km
                                    ELSE COALESCE(p_distance_km, distance_km) END,
         rpe_score           = COALESCE(p_rpe, rpe_score)
   WHERE id = p_assignment
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ── 2. Annuler la validation ─────────────────────────────────────────────────
-- Même remise à zéro que l'ancien client (statut prévu, blocs et RPE
-- effacés), plus ce que la validation avait écrit : durée, activité,
-- distance (sinon la distance comptait encore dans le volume de course).
-- Notes et lien d'activité gardés. Rejouer l'appel ne change rien.
CREATE OR REPLACE FUNCTION public.reopen_energy_assignment(p_assignment uuid)
RETURNS public.energy_session_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.energy_session_assignments;
BEGIN
  v_row := public._energy_assignment_for_write(p_assignment);
  UPDATE public.energy_session_assignments
     SET status              = 'planned',
         block_logs          = '{}'::jsonb,
         rpe_score           = NULL,
         actual_duration_min = NULL,
         activity_type       = NULL,
         distance_km         = NULL
   WHERE id = p_assignment
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ── 3. RPE Foster (NULL = retirer) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_energy_rpe(p_assignment uuid, p_rpe smallint)
RETURNS public.energy_session_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.energy_session_assignments;
BEGIN
  v_row := public._energy_assignment_for_write(p_assignment);
  IF p_rpe IS NOT NULL AND (p_rpe < 1 OR p_rpe > 10) THEN
    RAISE EXCEPTION 'RPE entre 1 et 10' USING ERRCODE = '22023';
  END IF;
  UPDATE public.energy_session_assignments SET rpe_score = p_rpe WHERE id = p_assignment
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ── Droits ───────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.complete_energy_assignment(uuid, jsonb, text, integer, text, text, numeric, smallint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reopen_energy_assignment(uuid)                                                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_energy_rpe(uuid, smallint)                                                     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_energy_assignment(uuid, jsonb, text, integer, text, text, numeric, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_energy_assignment(uuid)                                                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_energy_rpe(uuid, smallint)                                                     TO authenticated;
