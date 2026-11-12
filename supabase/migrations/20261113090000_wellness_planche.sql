-- Wellness copié de la planche retenue (AthleteWellness, 12/11) :
--  * « Envie de t'entraîner » 1-5 (hors score : le score reste les 5 notes) ;
--  * douleur autre que les courbatures 0-10 ; « Malade ou fiévreuse ? » ;
--  * carte du corps par ZONES notées 1 légère / 2 marquée / 3 intense
--    (`domsLevels`), à la place des points libres (gardés pour l'historique).
-- Additive : 4 colonnes nullable / par défaut, aucune donnée réécrite. La
-- source reste `app_data` (asp:wh) ; la table est sa projection.

ALTER TABLE public.wellness_entries
  ADD COLUMN IF NOT EXISTS envie numeric CHECK (envie BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS pain smallint CHECK (pain BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS sick boolean,
  ADD COLUMN IF NOT EXISTS doms_levels jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(doms_levels) = 'object');

CREATE OR REPLACE FUNCTION public.health_parse_wellness(p_athlete uuid, p_key text, p_v jsonb, p_archived boolean)
RETURNS public.wellness_entries
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  r     public.wellness_entries;
  items jsonb;
  w     numeric;
BEGIN
  IF p_v IS NULL OR jsonb_typeof(p_v) <> 'object' THEN RETURN NULL; END IF;
  r.day := coalesce(public.health_day(p_key),
                    CASE WHEN jsonb_typeof(p_v->'date') = 'string' THEN public.health_day(p_v->>'date') END);
  IF r.day IS NULL THEN RETURN NULL; END IF;

  r.athlete_id := p_athlete;
  items := CASE WHEN jsonb_typeof(p_v->'items') = 'object' THEN p_v->'items' ELSE p_v END;
  r.fatigue := public.health_item(items->'fatigue');
  r.sommeil := public.health_item(items->'sommeil');
  r.stress  := public.health_item(items->'stress');
  r.energie := public.health_item(items->'energie');
  r.doms    := public.health_item(items->'doms');
  r.envie   := public.health_item(items->'envie');

  r.bedtime := public.health_hm(p_v->'coucher');
  r.wake    := public.health_hm(p_v->'reveil');
  r.sleep_hours := CASE WHEN public.health_num(p_v->'sleepDur') BETWEEN 0 AND 24 THEN public.health_num(p_v->'sleepDur') END;
  r.sleep_interrupted := CASE WHEN jsonb_typeof(p_v->'sleepInterrupt') = 'boolean' THEN (p_v->>'sleepInterrupt')::boolean END;
  r.sleep_interrupt_note := public.health_text(p_v->'sleepInterruptNote');

  r.doms_zones := coalesce((
    SELECT array_agg(z #>> '{}' ORDER BY o)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_v->'domsZones') = 'array' THEN p_v->'domsZones' ELSE '[]'::jsonb END)
           WITH ORDINALITY AS t(z, o)
     WHERE jsonb_typeof(z) = 'string'), '{}');

  -- Points : x, y numériques, side front/back ; id gardé (toujours présent en
  -- prod), sinon "side-x-y" ; intensité seulement si numérique.
  r.doms_points := coalesce((
    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'id', CASE WHEN jsonb_typeof(pt->'id') IN ('string', 'number', 'boolean') THEN pt->>'id'
                        ELSE (pt->>'side') || '-' || public.health_num(pt->'x')::text || '-' || public.health_num(pt->'y')::text END,
             'x', to_jsonb(public.health_num(pt->'x')),
             'y', to_jsonb(public.health_num(pt->'y')),
             'side', pt->>'side',
             'intensity', to_jsonb(public.health_num(pt->'intensity')))) ORDER BY o)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_v->'domsPoints') = 'array' THEN p_v->'domsPoints' ELSE '[]'::jsonb END)
           WITH ORDINALITY AS t(pt, o)
     WHERE jsonb_typeof(pt) = 'object'
       AND public.health_num(pt->'x') IS NOT NULL AND public.health_num(pt->'y') IS NOT NULL
       AND pt->>'side' IN ('front', 'back')), '[]'::jsonb);

  -- Carte du corps par zones (planche wellness 12/11) : { zone: 1 légère | 2 marquée | 3 intense }.
  r.doms_levels := coalesce((
    SELECT jsonb_object_agg(z.k, (z.v #>> '{}')::smallint)
      FROM jsonb_each(CASE WHEN jsonb_typeof(p_v->'domsLevels') = 'object' THEN p_v->'domsLevels' ELSE '{}'::jsonb END) AS z(k, v)
     WHERE jsonb_typeof(z.v) = 'number' AND (z.v #>> '{}')::numeric IN (1, 2, 3)), '{}'::jsonb);
  r.pain := CASE WHEN public.health_num(p_v->'pain') BETWEEN 0 AND 10
                  AND public.health_num(p_v->'pain') = trunc(public.health_num(p_v->'pain'))
                 THEN public.health_num(p_v->'pain')::smallint END;
  r.sick := CASE WHEN jsonb_typeof(p_v->'sick') = 'boolean' THEN (p_v->>'sick')::boolean END;
  r.injury_note := coalesce(public.health_text(p_v->'injComment'), public.health_text(p_v->'injuryNote'));
  -- `raw.poids ?? raw.weightKg` : poids absent ou null → weightKg.
  w := public.health_num(CASE WHEN jsonb_typeof(p_v->'poids') IS NOT NULL AND jsonb_typeof(p_v->'poids') <> 'null'
                              THEN p_v->'poids' ELSE p_v->'weightKg' END);
  r.weight_kg := CASE WHEN w > 0 THEN w END;
  r.archived := coalesce(p_archived, false);
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.health_sync_wellness(p_athlete uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_athlete IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('health:' || p_athlete::text, 0));
  -- Compte en cours de suppression (cascade) : on ne recrée rien.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_athlete) THEN
    DELETE FROM public.wellness_entries WHERE athlete_id = p_athlete;
    RETURN;
  END IF;

  WITH cand AS (
    -- asp:wh d'abord (rang 0), puis les blocs archivés du plus récent au plus
    -- ancien ; dans un même dictionnaire, la clé compacte gagne sur l'ISO.
    SELECT w.*, 0::bigint AS src_rank,
           CASE WHEN x.k ~ '^\s*[0-9]{8}\s*$' THEN 0 WHEN public.health_day(x.k) IS NOT NULL THEN 1 ELSE 2 END AS key_rank,
           x.k
      FROM public.app_data d
      CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(d.value) = 'object' THEN d.value ELSE '{}'::jsonb END) AS x(k, v)
      CROSS JOIN LATERAL public.health_parse_wellness(p_athlete, x.k, x.v, false) AS w
     WHERE d.athlete_id = p_athlete AND d.key = 'asp:wh' AND w.day IS NOT NULL
    UNION ALL
    SELECT w.*, 1000000 - b.o AS src_rank,
           CASE WHEN x.k ~ '^\s*[0-9]{8}\s*$' THEN 0 WHEN public.health_day(x.k) IS NOT NULL THEN 1 ELSE 2 END,
           x.k
      FROM public.app_data d
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d.value) = 'array' THEN d.value ELSE '[]'::jsonb END)
                 WITH ORDINALITY AS b(blk, o)
      CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(b.blk->'wellnessHistory') = 'object' THEN b.blk->'wellnessHistory' ELSE '{}'::jsonb END) AS x(k, v)
      CROSS JOIN LATERAL public.health_parse_wellness(p_athlete, x.k, x.v, true) AS w
     WHERE d.athlete_id = p_athlete AND d.key = 'asp:blockHistory' AND w.day IS NOT NULL
  ),
  src AS (
    SELECT DISTINCT ON (day) * FROM cand ORDER BY day, src_rank, key_rank, k DESC
  ),
  del AS (
    DELETE FROM public.wellness_entries t
     WHERE t.athlete_id = p_athlete
       AND NOT EXISTS (SELECT 1 FROM src WHERE src.day = t.day)
  )
  INSERT INTO public.wellness_entries AS t (
    athlete_id, day, fatigue, sommeil, stress, energie, doms, bedtime, wake, sleep_hours,
    sleep_interrupted, sleep_interrupt_note, doms_zones, doms_points, injury_note, weight_kg, archived, envie, pain, sick, doms_levels)
  SELECT p_athlete, day, fatigue, sommeil, stress, energie, doms, bedtime, wake, sleep_hours,
         sleep_interrupted, sleep_interrupt_note, doms_zones, doms_points, injury_note, weight_kg, archived,
         envie, pain, sick, doms_levels
    FROM src
  ON CONFLICT (athlete_id, day) DO UPDATE SET
    fatigue = EXCLUDED.fatigue, sommeil = EXCLUDED.sommeil, stress = EXCLUDED.stress,
    energie = EXCLUDED.energie, doms = EXCLUDED.doms, bedtime = EXCLUDED.bedtime, wake = EXCLUDED.wake,
    sleep_hours = EXCLUDED.sleep_hours, sleep_interrupted = EXCLUDED.sleep_interrupted,
    sleep_interrupt_note = EXCLUDED.sleep_interrupt_note, doms_zones = EXCLUDED.doms_zones,
    doms_points = EXCLUDED.doms_points, injury_note = EXCLUDED.injury_note,
    weight_kg = EXCLUDED.weight_kg, archived = EXCLUDED.archived, envie = EXCLUDED.envie,
    pain = EXCLUDED.pain, sick = EXCLUDED.sick, doms_levels = EXCLUDED.doms_levels, updated_at = now()
  WHERE (t.fatigue, t.sommeil, t.stress, t.energie, t.doms, t.bedtime, t.wake, t.sleep_hours,
         t.sleep_interrupted, t.sleep_interrupt_note, t.doms_zones, t.doms_points, t.injury_note,
         t.weight_kg, t.archived, t.envie, t.pain, t.sick, t.doms_levels)
        IS DISTINCT FROM
        (EXCLUDED.fatigue, EXCLUDED.sommeil, EXCLUDED.stress, EXCLUDED.energie, EXCLUDED.doms,
         EXCLUDED.bedtime, EXCLUDED.wake, EXCLUDED.sleep_hours, EXCLUDED.sleep_interrupted,
         EXCLUDED.sleep_interrupt_note, EXCLUDED.doms_zones, EXCLUDED.doms_points, EXCLUDED.injury_note,
         EXCLUDED.weight_kg, EXCLUDED.archived, EXCLUDED.envie, EXCLUDED.pain, EXCLUDED.sick,
         EXCLUDED.doms_levels);
END;
$$;

-- Les deux fonctions gardent leurs droits (CREATE OR REPLACE).
