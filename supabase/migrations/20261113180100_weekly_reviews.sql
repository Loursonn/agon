-- =============================================================================
-- Weekly review de l'athlète (P22, P23, P39)
--
-- Une review par athlète et par semaine (lundi → dimanche), ouverte du dimanche
-- au lundi soir (heure de Paris). Brouillon enregistré à chaque champ, puis
-- envoi : les chiffres du bilan automatique sont figés dans `auto` et le feu du
-- moment dans `light`. Plus de modification après l'envoi.
--
-- Données de santé (ressenti, douleur) : lecture par l'athlète, son coach
-- référent ou co-coach (`is_coach_of`) et le staff qui a le droit « wellness »
-- en lecture (`staff_can`), ces deux derniers seulement après l'envoi.
-- Aucune policy d'écriture : la seule écriture passe par `save_weekly_review`.
-- Suppression du compte : cascade depuis `profiles`. Export : `src/lib/dataExport.ts`.
-- La réponse du coach reste `weekly_retours.comment` (rien de nouveau).
--
-- Additif : nouvelle table et nouvelles fonctions, que seul le client de dev appelle.
-- Rollback : DROP FUNCTION save_weekly_review, weekly_review_open ; DROP TABLE weekly_reviews.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.weekly_reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start   date NOT NULL CHECK (extract(isodow FROM week_start) = 1),
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  answers      jsonb NOT NULL DEFAULT '{}'::jsonb
                 CHECK (jsonb_typeof(answers) = 'object' AND pg_column_size(answers) < 32768),
  auto         jsonb CHECK (auto IS NULL OR (jsonb_typeof(auto) = 'object' AND pg_column_size(auto) < 32768)),
  light        text CHECK (light IN ('green', 'orange', 'red')),
  submitted_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, week_start),
  CHECK ((status = 'submitted') = (submitted_at IS NOT NULL))
);

COMMENT ON TABLE public.weekly_reviews IS
  'Weekly review de l''athlète (donnée de santé). Écriture par save_weekly_review seulement.';

-- Liste du lundi côté coach : toutes les reviews d'une semaine.
CREATE INDEX IF NOT EXISTS weekly_reviews_week_idx ON public.weekly_reviews (week_start);

ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weekly_reviews_self ON public.weekly_reviews;
CREATE POLICY weekly_reviews_self ON public.weekly_reviews
  FOR SELECT TO authenticated USING (athlete_id = auth.uid());

DROP POLICY IF EXISTS weekly_reviews_coach ON public.weekly_reviews;
CREATE POLICY weekly_reviews_coach ON public.weekly_reviews
  FOR SELECT TO authenticated USING (status = 'submitted' AND public.is_coach_of(athlete_id));

DROP POLICY IF EXISTS weekly_reviews_staff ON public.weekly_reviews;
CREATE POLICY weekly_reviews_staff ON public.weekly_reviews
  FOR SELECT TO authenticated USING (status = 'submitted' AND public.staff_can(athlete_id, 'wellness', 'read'));

REVOKE ALL ON public.weekly_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.weekly_reviews TO authenticated;
GRANT ALL ON public.weekly_reviews TO service_role;

-- ── Fenêtre : du dimanche (jour 6) au lundi suivant (jour 7) ─────────────────
CREATE OR REPLACE FUNCTION public.weekly_review_open(p_week date, p_today date)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_week IS NOT NULL AND p_today IS NOT NULL
     AND extract(isodow FROM p_week) = 1
     AND p_today BETWEEN p_week + 6 AND p_week + 7;
$$;

REVOKE ALL ON FUNCTION public.weekly_review_open(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.weekly_review_open(date, date) TO authenticated, service_role;

-- ── Brouillon ou envoi ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_weekly_review(
  p_week    date,
  p_answers jsonb,
  p_submit  boolean DEFAULT false,
  p_auto    jsonb DEFAULT NULL,
  p_light   text DEFAULT NULL
)
RETURNS public.weekly_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Europe/Paris')::date;
  v_key   text;
  v_val   jsonb;
  v_row   public.weekly_reviews;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_me AND role IN ('athlete', 'coach_athlete')) THEN
    RAISE EXCEPTION 'Seul l''athlète remplit sa weekly review' USING ERRCODE = '42501';
  END IF;

  -- Contenu (avant la fenêtre : testable un autre jour que le dimanche).
  IF p_week IS NULL OR extract(isodow FROM p_week) <> 1 THEN
    RAISE EXCEPTION 'La semaine doit commencer un lundi' USING ERRCODE = '22023';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' OR pg_column_size(p_answers) >= 32768 THEN
    RAISE EXCEPTION 'Review invalide' USING ERRCODE = '22023';
  END IF;
  IF p_answers ? 'feel' THEN
    IF jsonb_typeof(p_answers->'feel') <> 'object' THEN
      RAISE EXCEPTION 'Ressenti invalide' USING ERRCODE = '22023';
    END IF;
    FOR v_key, v_val IN SELECT * FROM jsonb_each(p_answers->'feel') LOOP
      IF v_key NOT IN ('note', 'energie', 'motivation', 'vie', 'nutrition') THEN
        RAISE EXCEPTION 'Ressenti inconnu : %', v_key USING ERRCODE = '22023';
      END IF;
      IF jsonb_typeof(v_val) <> 'null' AND NOT (jsonb_typeof(v_val) = 'number'
           AND (v_val #>> '{}')::numeric IN (1, 2, 3, 4, 5)) THEN
        RAISE EXCEPTION 'Ressenti % : note de 1 à 5', v_key USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
  IF jsonb_typeof(p_answers #> '{pain,level}') = 'number'
     AND NOT ((p_answers #>> '{pain,level}')::numeric BETWEEN 0 AND 10) THEN
    RAISE EXCEPTION 'Douleur : niveau de 0 à 10' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_answers->'next') = 'array' AND jsonb_array_length(p_answers->'next') > 3 THEN
    RAISE EXCEPTION '3 engagements au plus' USING ERRCODE = '22023';
  END IF;
  IF p_submit AND (p_auto IS NULL OR jsonb_typeof(p_auto) <> 'object') THEN
    RAISE EXCEPTION 'Bilan de la semaine manquant' USING ERRCODE = '22023';
  END IF;
  IF p_light IS NOT NULL AND p_light NOT IN ('green', 'orange', 'red') THEN
    RAISE EXCEPTION 'Feu invalide' USING ERRCODE = '22023';
  END IF;

  IF NOT public.weekly_review_open(p_week, v_today) THEN
    RAISE EXCEPTION 'La weekly review se remplit du dimanche au lundi soir' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.weekly_reviews AS w (athlete_id, week_start, answers)
  VALUES (v_me, p_week, p_answers)
  ON CONFLICT (athlete_id, week_start) DO UPDATE
    SET answers = EXCLUDED.answers, updated_at = now()
    WHERE w.status = 'draft'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review déjà envoyée' USING ERRCODE = '22023';
  END IF;

  IF p_submit THEN
    UPDATE public.weekly_reviews
       SET status = 'submitted', submitted_at = now(), auto = p_auto, light = p_light, updated_at = now()
     WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_weekly_review(date, jsonb, boolean, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_weekly_review(date, jsonb, boolean, jsonb, text) TO authenticated, service_role;
