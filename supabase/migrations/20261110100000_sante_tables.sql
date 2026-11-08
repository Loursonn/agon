-- =============================================================================
-- Santé hors d'app_data — étape 1 : vraies tables + copie + synchro serveur
-- Conception, plan de bascule, rollback, RGPD : docs/SANTE_TABLES.md.
--
-- Additif et compatible avec TOUS les clients (main, dev, anciennes PWA) :
--   * quatre nouvelles tables en LECTURE seule pour les clients (aucune policy
--     d'écriture, droits INSERT/UPDATE/DELETE retirés) ;
--   * `app_data` reste la source : rien n'y change, aucune RPC n'est modifiée ;
--   * des triggers sur `app_data` (clés asp:wh, asp:blockHistory, asp:wlog,
--     asp:wmile, asp:bw) recalculent la projection de l'athlète concerné,
--     dans la même transaction que l'écriture. Peu importe qui écrit (RPC
--     `wellness_set_day` / `weight_set_day` / `weight_record_milestone`, ancien
--     client qui réécrit tout le blob, coach, script) : les tables suivent.
--   * un échec de la synchro ne bloque JAMAIS l'écriture de l'athlète : il est
--     consigné dans `health_sync_errors` (sans donnée de santé) et réparable
--     par `health_resync()`.
--
--   wellness_entries        ← asp:wh (+ asp:blockHistory[].wellnessHistory, archived = true)
--   body_weight_logs        ← asp:wlog   { "YYYYMMDD": kg }
--   body_weight_milestones  ← asp:wmile  [ { date: "YYYYMMDD", kg } ]
--   body_weight_goals       ← asp:bw     { current, target }  (0 → NULL)
--   asp:wellness (copie de la saisie la plus récente) : pas de table, c'est
--   la dernière ligne de wellness_entries (mesuré : 18/18 présentes dans asp:wh).
--
-- Lecture des formats : miroir exact de `parseWellnessHistory`
-- (supabase/functions/_shared/domain/wellness.ts). Mesures prod du 2026-11-08 :
-- 295 saisies (clés compactes), 12 clés parasites "1".."4", 11 notes hors
-- échelle, 19 saisies seulement archivées, 245 pesées, 23 paliers, 11 bw.
--
-- Idempotente : IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS ; la copie
-- finale (`health_resync()`) peut être rejouée sans effet de bord.
--
-- Rollback (app_data n'a pas bougé, rien n'est perdu) :
--   DROP TRIGGER IF EXISTS health_sync_ins ON public.app_data;
--   DROP TRIGGER IF EXISTS health_sync_upd ON public.app_data;
--   DROP TRIGGER IF EXISTS health_sync_del ON public.app_data;
--   DROP FUNCTION IF EXISTS public.health_app_data_sync(), public.health_resync(uuid),
--     public.health_sync_key(uuid, text), public.health_sync_wellness(uuid),
--     public.health_sync_weight(uuid), public.health_sync_milestones(uuid),
--     public.health_sync_goals(uuid), public.health_parse_wellness(uuid, text, jsonb, boolean),
--     public.health_hm(jsonb), public.health_text(jsonb), public.health_item(jsonb),
--     public.health_num(jsonb), public.health_day(text);
--   DROP TABLE IF EXISTS public.health_sync_errors, public.body_weight_goals,
--     public.body_weight_milestones, public.body_weight_logs, public.wellness_entries;
-- =============================================================================

-- ── 1. Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wellness_entries (
  athlete_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day         date NOT NULL,                  -- jour local de la saisie
  -- Notes 1-5, 5 = mieux ; hors échelle (ancienne échelle /10) → NULL.
  fatigue     numeric CHECK (fatigue BETWEEN 1 AND 5),   -- « Récupération »
  sommeil     numeric CHECK (sommeil BETWEEN 1 AND 5),
  stress      numeric CHECK (stress  BETWEEN 1 AND 5),   -- « Sérénité »
  energie     numeric CHECK (energie BETWEEN 1 AND 5),
  doms        numeric CHECK (doms    BETWEEN 1 AND 5),   -- « Fraîcheur musculaire »
  -- LE score (wellnessScore) : somme / 25 × 100 ; une note absente → NULL.
  score       smallint GENERATED ALWAYS AS (round((fatigue + sommeil + stress + energie + doms) * 4)::smallint) STORED,
  bedtime     time,
  wake        time,
  sleep_hours numeric CHECK (sleep_hours BETWEEN 0 AND 24),
  sleep_interrupted    boolean,
  sleep_interrupt_note text,
  doms_zones  text[] NOT NULL DEFAULT '{}',
  doms_points jsonb  NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(doms_points) = 'array'),
  injury_note text,                           -- réponse « blessé/malade »
  weight_kg   numeric CHECK (weight_kg > 0),  -- poids saisi avec le wellness (la courbe : body_weight_logs)
  archived    boolean NOT NULL DEFAULT false, -- vrai : seulement dans un bloc archivé (asp:blockHistory)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (athlete_id, day)
);
COMMENT ON TABLE public.wellness_entries IS
  'Wellness, une ligne par athlète et par jour. Étape 1 : projection d''app_data (asp:wh, asp:blockHistory) tenue par trigger ; lecture seule pour les clients. docs/SANTE_TABLES.md';

CREATE TABLE IF NOT EXISTS public.body_weight_logs (
  athlete_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day        date NOT NULL,
  kg         numeric NOT NULL CHECK (kg > 0 AND kg < 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (athlete_id, day)
);
COMMENT ON TABLE public.body_weight_logs IS
  'Pesées, une par athlète et par jour. Étape 1 : projection d''app_data asp:wlog. docs/SANTE_TABLES.md';

CREATE TABLE IF NOT EXISTS public.body_weight_milestones (
  athlete_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day        date NOT NULL,
  kg         numeric NOT NULL CHECK (kg > 0 AND kg < 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (athlete_id, day, kg)
);
COMMENT ON TABLE public.body_weight_milestones IS
  'Paliers de poids franchis. Étape 1 : projection d''app_data asp:wmile. docs/SANTE_TABLES.md';

CREATE TABLE IF NOT EXISTS public.body_weight_goals (
  athlete_id   uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  reference_kg numeric CHECK (reference_kg > 0 AND reference_kg < 500), -- asp:bw.current (dernier palier)
  target_kg    numeric CHECK (target_kg > 0 AND target_kg < 500),       -- asp:bw.target (0 → NULL)
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.body_weight_goals IS
  'Poids de référence et objectif. Étape 1 : projection d''app_data asp:bw. docs/SANTE_TABLES.md';

-- Échecs de synchro : ni valeur ni message (qui peut citer la ligne), seulement
-- l'athlète, la clé, le code SQL et la contrainte. Lu par l'admin.
CREATE TABLE IF NOT EXISTS public.health_sync_errors (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id      uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  key             text NOT NULL,
  sqlstate        text,
  constraint_name text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS health_sync_errors_athlete_id_fk_idx ON public.health_sync_errors (athlete_id);

-- La clé primaire (athlete_id, day) sert les lectures par athlète, par plage
-- et multi-athlètes (`athlete_id IN (…)`). Index propre aux erreurs :
CREATE INDEX IF NOT EXISTS health_sync_errors_created_idx ON public.health_sync_errors (created_at DESC);

-- ── 2. Droits et RLS ──────────────────────────────────────────────────────────
-- Lecture : l'athlète, ses coachs (référent ou co-coach), le staff autorisé
-- (même domaine que la clé app_data d'origine : wellness / nutrition, avec le
-- consentement `staff_sharing` exigé par staff_can). Écriture : aucune côté
-- client ; seuls les triggers (SECURITY DEFINER) écrivent.

ALTER TABLE public.wellness_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_weight_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_weight_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_weight_goals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_sync_errors     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.wellness_entries, public.body_weight_logs, public.body_weight_milestones,
  public.body_weight_goals, public.health_sync_errors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.wellness_entries, public.body_weight_logs, public.body_weight_milestones,
  public.body_weight_goals, public.health_sync_errors TO authenticated;

DROP POLICY IF EXISTS wellness_entries_self  ON public.wellness_entries;
DROP POLICY IF EXISTS wellness_entries_coach ON public.wellness_entries;
DROP POLICY IF EXISTS wellness_entries_staff ON public.wellness_entries;
CREATE POLICY wellness_entries_self  ON public.wellness_entries FOR SELECT TO authenticated USING (athlete_id = auth.uid());
CREATE POLICY wellness_entries_coach ON public.wellness_entries FOR SELECT TO authenticated USING (public.is_coach_of(athlete_id));
-- Saisies archivées (anciens blocs) : fermées au staff, comme avant (asp:blockHistory).
CREATE POLICY wellness_entries_staff ON public.wellness_entries FOR SELECT TO authenticated USING (NOT archived AND public.staff_can(athlete_id, 'wellness', 'read'));

DROP POLICY IF EXISTS body_weight_logs_self  ON public.body_weight_logs;
DROP POLICY IF EXISTS body_weight_logs_coach ON public.body_weight_logs;
DROP POLICY IF EXISTS body_weight_logs_staff ON public.body_weight_logs;
CREATE POLICY body_weight_logs_self  ON public.body_weight_logs FOR SELECT TO authenticated USING (athlete_id = auth.uid());
CREATE POLICY body_weight_logs_coach ON public.body_weight_logs FOR SELECT TO authenticated USING (public.is_coach_of(athlete_id));
CREATE POLICY body_weight_logs_staff ON public.body_weight_logs FOR SELECT TO authenticated USING (public.staff_can(athlete_id, 'nutrition', 'read'));

DROP POLICY IF EXISTS body_weight_milestones_self  ON public.body_weight_milestones;
DROP POLICY IF EXISTS body_weight_milestones_coach ON public.body_weight_milestones;
DROP POLICY IF EXISTS body_weight_milestones_staff ON public.body_weight_milestones;
CREATE POLICY body_weight_milestones_self  ON public.body_weight_milestones FOR SELECT TO authenticated USING (athlete_id = auth.uid());
CREATE POLICY body_weight_milestones_coach ON public.body_weight_milestones FOR SELECT TO authenticated USING (public.is_coach_of(athlete_id));
CREATE POLICY body_weight_milestones_staff ON public.body_weight_milestones FOR SELECT TO authenticated USING (public.staff_can(athlete_id, 'nutrition', 'read'));

DROP POLICY IF EXISTS body_weight_goals_self  ON public.body_weight_goals;
DROP POLICY IF EXISTS body_weight_goals_coach ON public.body_weight_goals;
DROP POLICY IF EXISTS body_weight_goals_staff ON public.body_weight_goals;
CREATE POLICY body_weight_goals_self  ON public.body_weight_goals FOR SELECT TO authenticated USING (athlete_id = auth.uid());
CREATE POLICY body_weight_goals_coach ON public.body_weight_goals FOR SELECT TO authenticated USING (public.is_coach_of(athlete_id));
CREATE POLICY body_weight_goals_staff ON public.body_weight_goals FOR SELECT TO authenticated USING (public.staff_can(athlete_id, 'nutrition', 'read'));

DROP POLICY IF EXISTS health_sync_errors_admin ON public.health_sync_errors;
CREATE POLICY health_sync_errors_admin ON public.health_sync_errors FOR SELECT TO authenticated USING (public.current_user_is_admin());

-- ── 3. Lecture des anciens formats (miroir de domain/wellness.ts) ────────────
-- Fonctions pures, défensives : elles ne lèvent jamais sur une donnée bizarre.

-- "YYYY-MM-DD" ou "YYYYMMDD" (espaces autour tolérés) → date ; sinon NULL.
-- Comme `toIsoDay` : date réelle, année ≥ 100 (Date.UTC lit 0-99 comme 19xx).
CREATE OR REPLACE FUNCTION public.health_day(p text)
RETURNS date
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s text := regexp_replace(coalesce(p, ''), '^\s+|\s+$', '', 'g');
  m text[];
  y int; mo int; d int;
BEGIN
  m := regexp_match(s, '^([0-9]{4})-([0-9]{2})-([0-9]{2})$');
  IF m IS NULL THEN m := regexp_match(s, '^([0-9]{4})([0-9]{2})([0-9]{2})$'); END IF;
  IF m IS NULL THEN RETURN NULL; END IF;
  y := m[1]::int; mo := m[2]::int; d := m[3]::int;
  IF y < 100 OR mo < 1 OR mo > 12 OR d < 1 THEN RETURN NULL; END IF;
  IF d > extract(day FROM (make_date(y, mo, 1) + interval '1 month - 1 day'))::int THEN RETURN NULL; END IF;
  RETURN make_date(y, mo, d);
END;
$$;

-- Nombre JSON, ou texte numérique non vide (comme `num`) ; sinon NULL.
CREATE OR REPLACE FUNCTION public.health_num(p jsonb)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE jsonb_typeof(p)
    WHEN 'number' THEN (p #>> '{}')::numeric
    WHEN 'string' THEN CASE
      WHEN regexp_replace(p #>> '{}', '^\s+|\s+$', '', 'g') ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]{1,3})?$'
      THEN regexp_replace(p #>> '{}', '^\s+|\s+$', '', 'g')::numeric
    END
  END
$$;

-- Note 1-5 ; hors échelle → NULL (`readItem`).
CREATE OR REPLACE FUNCTION public.health_item(p jsonb)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN public.health_num(p) BETWEEN 1 AND 5 THEN public.health_num(p) END
$$;

-- Texte non vide, sans espaces autour (`text`) ; sinon NULL.
CREATE OR REPLACE FUNCTION public.health_text(p jsonb)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN jsonb_typeof(p) = 'string'
    THEN nullif(regexp_replace(p #>> '{}', '^\s+|\s+$', '', 'g'), '') END
$$;

-- {h, m} → time (`hm`). Heures/minutes non entières : NULL (0 en prod).
CREATE OR REPLACE FUNCTION public.health_hm(p jsonb)
RETURNS time
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p) = 'object'
     AND public.health_num(p->'h') BETWEEN 0 AND 23 AND public.health_num(p->'h') = trunc(public.health_num(p->'h'))
     AND public.health_num(p->'m') BETWEEN 0 AND 59 AND public.health_num(p->'m') = trunc(public.health_num(p->'m'))
    THEN make_time(public.health_num(p->'h')::int, public.health_num(p->'m')::int, 0)
  END
$$;

-- Une saisie de l'ancien format (`WellnessData`) → ligne ; NULL si illisible
-- (valeur non objet comme les clés de semaine "1".."4", ou sans jour). La clé
-- du dictionnaire l'emporte sur le champ `date` (`parseWellnessEntry`).
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

  r.injury_note := coalesce(public.health_text(p_v->'injComment'), public.health_text(p_v->'injuryNote'));
  -- `raw.poids ?? raw.weightKg` : poids absent ou null → weightKg.
  w := public.health_num(CASE WHEN jsonb_typeof(p_v->'poids') IS NOT NULL AND jsonb_typeof(p_v->'poids') <> 'null'
                              THEN p_v->'poids' ELSE p_v->'weightKg' END);
  r.weight_kg := CASE WHEN w > 0 THEN w END;
  r.archived := coalesce(p_archived, false);
  RETURN r;
END;
$$;

-- ── 4. Synchro d'un athlète (projection complète, idempotente) ────────────────
-- Toujours « tout recalculer depuis app_data » : quel que soit l'ordre des
-- écritures concurrentes, la dernière transaction voit l'état final. Le verrou
-- consultatif par athlète sérialise les synchros (asp:wh et asp:blockHistory
-- sont deux lignes différentes). Lignes inchangées : pas réécrites.

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
    sleep_interrupted, sleep_interrupt_note, doms_zones, doms_points, injury_note, weight_kg, archived)
  SELECT p_athlete, day, fatigue, sommeil, stress, energie, doms, bedtime, wake, sleep_hours,
         sleep_interrupted, sleep_interrupt_note, doms_zones, doms_points, injury_note, weight_kg, archived
    FROM src
  ON CONFLICT (athlete_id, day) DO UPDATE SET
    fatigue = EXCLUDED.fatigue, sommeil = EXCLUDED.sommeil, stress = EXCLUDED.stress,
    energie = EXCLUDED.energie, doms = EXCLUDED.doms, bedtime = EXCLUDED.bedtime, wake = EXCLUDED.wake,
    sleep_hours = EXCLUDED.sleep_hours, sleep_interrupted = EXCLUDED.sleep_interrupted,
    sleep_interrupt_note = EXCLUDED.sleep_interrupt_note, doms_zones = EXCLUDED.doms_zones,
    doms_points = EXCLUDED.doms_points, injury_note = EXCLUDED.injury_note,
    weight_kg = EXCLUDED.weight_kg, archived = EXCLUDED.archived, updated_at = now()
  WHERE (t.fatigue, t.sommeil, t.stress, t.energie, t.doms, t.bedtime, t.wake, t.sleep_hours,
         t.sleep_interrupted, t.sleep_interrupt_note, t.doms_zones, t.doms_points, t.injury_note,
         t.weight_kg, t.archived)
        IS DISTINCT FROM
        (EXCLUDED.fatigue, EXCLUDED.sommeil, EXCLUDED.stress, EXCLUDED.energie, EXCLUDED.doms,
         EXCLUDED.bedtime, EXCLUDED.wake, EXCLUDED.sleep_hours, EXCLUDED.sleep_interrupted,
         EXCLUDED.sleep_interrupt_note, EXCLUDED.doms_zones, EXCLUDED.doms_points, EXCLUDED.injury_note,
         EXCLUDED.weight_kg, EXCLUDED.archived);
END;
$$;

CREATE OR REPLACE FUNCTION public.health_sync_weight(p_athlete uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_athlete IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('health:' || p_athlete::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_athlete) THEN
    DELETE FROM public.body_weight_logs WHERE athlete_id = p_athlete;
    RETURN;
  END IF;

  WITH src AS (
    SELECT DISTINCT ON (day) day, kg FROM (
      SELECT public.health_day(x.k) AS day, public.health_num(x.v) AS kg,
             CASE WHEN x.k ~ '^\s*[0-9]{8}\s*$' THEN 0 ELSE 1 END AS key_rank, x.k
        FROM public.app_data d
        CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(d.value) = 'object' THEN d.value ELSE '{}'::jsonb END) AS x(k, v)
       WHERE d.athlete_id = p_athlete AND d.key = 'asp:wlog'
    ) s
    WHERE day IS NOT NULL AND kg > 0 AND kg < 500
    ORDER BY day, key_rank, k DESC
  ),
  del AS (
    DELETE FROM public.body_weight_logs t
     WHERE t.athlete_id = p_athlete AND NOT EXISTS (SELECT 1 FROM src WHERE src.day = t.day)
  )
  INSERT INTO public.body_weight_logs AS t (athlete_id, day, kg)
  SELECT p_athlete, day, kg FROM src
  ON CONFLICT (athlete_id, day) DO UPDATE SET kg = EXCLUDED.kg, updated_at = now()
  WHERE t.kg IS DISTINCT FROM EXCLUDED.kg;
END;
$$;

CREATE OR REPLACE FUNCTION public.health_sync_milestones(p_athlete uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_athlete IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('health:' || p_athlete::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_athlete) THEN
    DELETE FROM public.body_weight_milestones WHERE athlete_id = p_athlete;
    RETURN;
  END IF;

  WITH src AS (
    SELECT DISTINCT day, kg FROM (
      SELECT CASE WHEN jsonb_typeof(e->'date') = 'string' THEN public.health_day(e->>'date') END AS day,
             public.health_num(e->'kg') AS kg
        FROM public.app_data d
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d.value) = 'array' THEN d.value ELSE '[]'::jsonb END) AS e
       WHERE d.athlete_id = p_athlete AND d.key = 'asp:wmile' AND jsonb_typeof(e) = 'object'
    ) s
    WHERE day IS NOT NULL AND kg > 0 AND kg < 500
  ),
  del AS (
    DELETE FROM public.body_weight_milestones t
     WHERE t.athlete_id = p_athlete AND NOT EXISTS (SELECT 1 FROM src WHERE src.day = t.day AND src.kg = t.kg)
  )
  INSERT INTO public.body_weight_milestones (athlete_id, day, kg)
  SELECT p_athlete, day, kg FROM src
  ON CONFLICT (athlete_id, day, kg) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.health_sync_goals(p_athlete uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v   jsonb;
  ref numeric;
  tgt numeric;
BEGIN
  IF p_athlete IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('health:' || p_athlete::text, 0));
  SELECT value INTO v FROM public.app_data WHERE athlete_id = p_athlete AND key = 'asp:bw';
  ref := public.health_num(v->'current');
  tgt := public.health_num(v->'target');
  ref := CASE WHEN ref > 0 AND ref < 500 THEN ref END;
  tgt := CASE WHEN tgt > 0 AND tgt < 500 THEN tgt END;
  IF v IS NULL OR jsonb_typeof(v) <> 'object' OR (ref IS NULL AND tgt IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_athlete) THEN
    DELETE FROM public.body_weight_goals WHERE athlete_id = p_athlete;
    RETURN;
  END IF;
  INSERT INTO public.body_weight_goals AS t (athlete_id, reference_kg, target_kg)
  VALUES (p_athlete, ref, tgt)
  ON CONFLICT (athlete_id) DO UPDATE SET reference_kg = EXCLUDED.reference_kg, target_kg = EXCLUDED.target_kg, updated_at = now()
  WHERE (t.reference_kg, t.target_kg) IS DISTINCT FROM (EXCLUDED.reference_kg, EXCLUDED.target_kg);
END;
$$;

CREATE OR REPLACE FUNCTION public.health_sync_key(p_athlete uuid, p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE p_key
    WHEN 'asp:wh', 'asp:blockHistory' THEN PERFORM public.health_sync_wellness(p_athlete);
    WHEN 'asp:wlog'  THEN PERFORM public.health_sync_weight(p_athlete);
    WHEN 'asp:wmile' THEN PERFORM public.health_sync_milestones(p_athlete);
    WHEN 'asp:bw'    THEN PERFORM public.health_sync_goals(p_athlete);
    ELSE NULL;
  END CASE;
END;
$$;

-- Réparation / copie initiale : un athlète, ou tous (NULL). Rejouable.
CREATE OR REPLACE FUNCTION public.health_resync(p_athlete uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a uuid;
  n integer := 0;
BEGIN
  FOR a IN
    SELECT DISTINCT athlete_id FROM public.app_data
     WHERE key IN ('asp:wh', 'asp:blockHistory', 'asp:wlog', 'asp:wmile', 'asp:bw')
       AND (p_athlete IS NULL OR athlete_id = p_athlete)
    UNION
    -- Athlètes qui ont des lignes mais plus de clé (clé supprimée hors trigger).
    SELECT athlete_id FROM public.wellness_entries WHERE p_athlete IS NULL OR athlete_id = p_athlete
    UNION SELECT athlete_id FROM public.body_weight_logs WHERE p_athlete IS NULL OR athlete_id = p_athlete
    UNION SELECT athlete_id FROM public.body_weight_milestones WHERE p_athlete IS NULL OR athlete_id = p_athlete
    UNION SELECT athlete_id FROM public.body_weight_goals WHERE p_athlete IS NULL OR athlete_id = p_athlete
  LOOP
    PERFORM public.health_sync_wellness(a);
    PERFORM public.health_sync_weight(a);
    PERFORM public.health_sync_milestones(a);
    PERFORM public.health_sync_goals(a);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- ── 5. Triggers sur app_data ──────────────────────────────────────────────────
-- AFTER, par ligne, seulement pour les clés santé. Une erreur de synchro est
-- avalée (sous-transaction annulée) et consignée : l'écriture de l'athlète
-- passe toujours, la projection se répare avec health_resync().

CREATE OR REPLACE FUNCTION public.health_app_data_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aid   uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.athlete_id ELSE NEW.athlete_id END;
  v_key   text := CASE WHEN TG_OP = 'DELETE' THEN OLD.key ELSE NEW.key END;
  v_state text;
  v_cons  text;
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      PERFORM public.health_sync_key(OLD.athlete_id, OLD.key);
    ELSIF TG_OP = 'INSERT' THEN
      PERFORM public.health_sync_key(NEW.athlete_id, NEW.key);
    ELSIF OLD.athlete_id IS DISTINCT FROM NEW.athlete_id OR OLD.key IS DISTINCT FROM NEW.key THEN
      PERFORM public.health_sync_key(OLD.athlete_id, OLD.key);
      PERFORM public.health_sync_key(NEW.athlete_id, NEW.key);
    ELSIF OLD.value IS DISTINCT FROM NEW.value THEN
      PERFORM public.health_sync_key(NEW.athlete_id, NEW.key);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_cons = CONSTRAINT_NAME;
    RAISE WARNING 'health_app_data_sync: synchro % impossible (%)', v_key, v_state;
    INSERT INTO public.health_sync_errors(athlete_id, key, sqlstate, constraint_name)
    SELECT v_aid, v_key, v_state, nullif(v_cons, '')
     WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = v_aid);
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS health_sync_ins ON public.app_data;
DROP TRIGGER IF EXISTS health_sync_upd ON public.app_data;
DROP TRIGGER IF EXISTS health_sync_del ON public.app_data;
CREATE TRIGGER health_sync_ins AFTER INSERT ON public.app_data
  FOR EACH ROW WHEN (NEW.key IN ('asp:wh', 'asp:blockHistory', 'asp:wlog', 'asp:wmile', 'asp:bw'))
  EXECUTE FUNCTION public.health_app_data_sync();
CREATE TRIGGER health_sync_upd AFTER UPDATE ON public.app_data
  FOR EACH ROW WHEN (OLD.key IN ('asp:wh', 'asp:blockHistory', 'asp:wlog', 'asp:wmile', 'asp:bw')
                  OR NEW.key IN ('asp:wh', 'asp:blockHistory', 'asp:wlog', 'asp:wmile', 'asp:bw'))
  EXECUTE FUNCTION public.health_app_data_sync();
CREATE TRIGGER health_sync_del AFTER DELETE ON public.app_data
  FOR EACH ROW WHEN (OLD.key IN ('asp:wh', 'asp:blockHistory', 'asp:wlog', 'asp:wmile', 'asp:bw'))
  EXECUTE FUNCTION public.health_app_data_sync();

-- Aucune de ces fonctions n'est appelable par un client.
REVOKE ALL ON FUNCTION public.health_day(text), public.health_num(jsonb), public.health_item(jsonb),
  public.health_text(jsonb), public.health_hm(jsonb),
  public.health_parse_wellness(uuid, text, jsonb, boolean),
  public.health_sync_wellness(uuid), public.health_sync_weight(uuid), public.health_sync_milestones(uuid),
  public.health_sync_goals(uuid), public.health_sync_key(uuid, text), public.health_resync(uuid),
  public.health_app_data_sync()
  FROM PUBLIC, anon, authenticated;

-- ── 6. Copie des données existantes ───────────────────────────────────────────
SELECT public.health_resync(NULL);
