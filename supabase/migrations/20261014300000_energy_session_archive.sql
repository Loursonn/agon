-- Suppression des séances énergétiques / spécifiques depuis les banques.
--
-- energy_session_assignments.energy_session_id est en ON DELETE RESTRICT :
-- une séance déjà programmée chez un athlète ne pouvait pas être supprimée
-- (erreur 23503 → « Erreur lors de la suppression de la séance »).
-- Supprimer les programmations effacerait l'historique athlète (RPE, logs),
-- donc : séance jamais programmée → supprimée ; sinon → archivée
-- (masquée des banques et listes, les séances programmées restent intactes).

ALTER TABLE public.energy_sessions
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE OR REPLACE FUNCTION public.delete_energy_session(p_session_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by uuid;
  v_athlete_id uuid;
BEGIN
  SELECT created_by, athlete_id INTO v_created_by, v_athlete_id
  FROM energy_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  -- Mêmes droits que la policy es_delete, plus les admins
  IF NOT (
    v_created_by = auth.uid()
    OR (v_athlete_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM profiles WHERE id = v_athlete_id AND coach_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  ) THEN
    RAISE EXCEPTION 'Suppression non autorisée' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM energy_session_assignments WHERE energy_session_id = p_session_id) THEN
    UPDATE energy_sessions SET archived_at = now(), updated_at = now() WHERE id = p_session_id;
    RETURN 'archived';
  END IF;

  DELETE FROM energy_sessions WHERE id = p_session_id;
  RETURN 'deleted';
END;
$$;

REVOKE ALL ON FUNCTION public.delete_energy_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_energy_session(uuid) TO authenticated;
