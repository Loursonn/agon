-- P38 · Retirer d'Agon une activité supprimée dans la montre.
--
-- Garmin (comme COROS) ne prévient pas quand une activité est supprimée dans
-- Garmin Connect. L'athlète, ou son coach (référent ou co-coach, `is_coach_of`),
-- peut la retirer d'Agon.
--
-- `remove_provider_activity(p_activity)` :
--   - supprime la ligne `provider_activities` ; ses détails partent en cascade
--     (activity_streams, activity_laps, activity_sets, activity_plan_links,
--     activity_zone_summaries — clés étrangères ON DELETE CASCADE) ;
--   - ne touche jamais une séance Agon : refusé si la ligne porte la source
--     `manual` (saisie dans Agon), et seules les tables d'activités de montre
--     ou de fichier sont touchées. La séance prévue rapprochée garde son
--     statut, ses séries et ses notes : seul le lien part ;
--   - coach : seulement une activité qu'il voit (même règle que la policy
--     `provider_activities_coach_read` : source visible du coach et accord de
--     l'athlète).
--   - Les résumés bruts (`provider_raw_records`, bucket `provider-raw`) sont
--     gardés : ils appartiennent au stockage brut voulu par Hugo (09/11) et
--     partent à la déconnexion, au retrait de permission ou à la suppression
--     du compte.
--
-- Additive : nouvelle fonction seulement. Le client de prod ne l'appelle pas.

CREATE OR REPLACE FUNCTION public.remove_provider_activity(p_activity uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.provider_activities%ROWTYPE;
  v_links int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.provider_activities WHERE id = p_activity FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activité introuvable' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.athlete_id <> v_uid AND NOT (
    public.is_coach_of(v_row.athlete_id)
    AND EXISTS (SELECT 1 FROM public.data_source_policies p WHERE p.source = v_row.source AND p.coach_visible)
    AND public.source_consent_granted(v_row.athlete_id, v_row.source)
  ) THEN
    -- Même message qu'une ligne absente : on ne révèle pas qu'elle existe.
    RAISE EXCEPTION 'Activité introuvable' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.source = 'manual' OR 'manual' = ANY (coalesce(v_row.sources, '{}'::text[])) THEN
    RAISE EXCEPTION 'Une séance saisie dans Agon ne se retire pas ici' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_links FROM public.activity_plan_links WHERE activity_id = p_activity;

  DELETE FROM public.provider_activities WHERE id = p_activity;

  RETURN jsonb_build_object('removed', true, 'source', v_row.source, 'unlinked', v_links);
END;
$$;

REVOKE ALL ON FUNCTION public.remove_provider_activity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_provider_activity(uuid) TO authenticated;

COMMENT ON FUNCTION public.remove_provider_activity(uuid) IS
  'P38 : retire une activité de montre ou de fichier (athlète ou is_coach_of). Détails en cascade, jamais une séance Agon (source manual).';
