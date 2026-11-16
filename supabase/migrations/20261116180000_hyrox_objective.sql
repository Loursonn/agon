-- HYROX : objectif construit depuis le run (docs/HYROX_OBJECTIF_CONCEPTION.md, validé par Hugo le 15/11/2026).
-- Additive : 3 tables, 3 colonnes nullables / par défaut sur hyrox_race_plans. Rien n'est supprimé.
--   hyrox_objective_versions / hyrox_objective_grid : grille versionnée (lecture authentifiée, écriture admin).
--   hyrox_season_goals : run moyen visé par saison (« 2026-27 ») et par division, pour un athlète.
--   hyrox_race_plans : run moyen du plan, version du modèle, chrono verrouillé.

-- ── 1. Grille ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hyrox_objective_versions (
  version    text PRIMARY KEY,
  active     boolean NOT NULL DEFAULT false,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.hyrox_objective_versions IS
  'Versions de la grille de l''objectif HYROX ; une seule active.';
CREATE UNIQUE INDEX IF NOT EXISTS hyrox_objective_versions_one_active
  ON public.hyrox_objective_versions (active) WHERE active;

CREATE TABLE IF NOT EXISTS public.hyrox_objective_grid (
  version      text NOT NULL REFERENCES public.hyrox_objective_versions(version) ON UPDATE CASCADE,
  division     text NOT NULL CHECK (division IN ('men','women','men_pro','women_pro','doubles_men','doubles_women','doubles_mixed')),
  run_avg_s    integer NOT NULL CHECK (run_avg_s BETWEEN 150 AND 900),
  ski_s        integer NOT NULL CHECK (ski_s > 0),
  sled_push_s  integer NOT NULL CHECK (sled_push_s > 0),
  sled_pull_s  integer NOT NULL CHECK (sled_pull_s > 0),
  bbj_s        integer NOT NULL CHECK (bbj_s > 0),
  row_s        integer NOT NULL CHECK (row_s > 0),
  farmers_s    integer NOT NULL CHECK (farmers_s > 0),
  lunges_s     integer NOT NULL CHECK (lunges_s > 0),
  wall_balls_s integer NOT NULL CHECK (wall_balls_s > 0),
  roxzone_s    integer NOT NULL CHECK (roxzone_s > 0),
  run_shape    numeric[] NOT NULL CHECK (array_length(run_shape, 1) = 8),
  source       text NOT NULL,
  is_estimate  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version, division, run_avg_s)
);
COMMENT ON TABLE public.hyrox_objective_grid IS
  'Objectif HYROX : à chaque run moyen (s/km, hors Roxzone), temps médians des 8 stations et de la Roxzone et forme des 8 runs (coefficients, moyenne 1). En doubles, stations de la paire.';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hyrox_objective_versions','hyrox_objective_grid'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT public.current_user_is_admin()))', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((SELECT public.current_user_is_admin())) WITH CHECK ((SELECT public.current_user_is_admin()))', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ((SELECT public.current_user_is_admin()))', t || '_delete', t);
  END LOOP;
END $$;

-- ── 2. Plans de course ───────────────────────────────────────────────────────

ALTER TABLE public.hyrox_race_plans
  ADD COLUMN IF NOT EXISTS run_avg_s integer,
  ADD COLUMN IF NOT EXISTS model_version text,
  ADD COLUMN IF NOT EXISTS locked_total boolean NOT NULL DEFAULT true;
ALTER TABLE public.hyrox_race_plans DROP CONSTRAINT IF EXISTS hyrox_race_plans_run_avg_s_check;
ALTER TABLE public.hyrox_race_plans
  ADD CONSTRAINT hyrox_race_plans_run_avg_s_check CHECK (run_avg_s IS NULL OR run_avg_s BETWEEN 150 AND 900);
COMMENT ON COLUMN public.hyrox_race_plans.run_avg_s IS 'Run moyen de l''objectif (s/km, hors Roxzone). NULL : plan ancien, réparti depuis un chrono.';
COMMENT ON COLUMN public.hyrox_race_plans.model_version IS 'Version de la grille qui a construit les cibles (ex. obj@1).';
COMMENT ON COLUMN public.hyrox_race_plans.locked_total IS 'Chrono verrouillé : modifier une cible redistribue la différence sur les autres.';

-- ── 3. Objectif de saison ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hyrox_season_goals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  season     text NOT NULL CHECK (season ~ '^[0-9]{4}-[0-9]{2}$'),
  division   text NOT NULL,
  run_avg_s  integer NOT NULL CHECK (run_avg_s BETWEEN 150 AND 900),
  note       text CHECK (note IS NULL OR char_length(note) <= 500),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, season, division)
);
COMMENT ON TABLE public.hyrox_season_goals IS
  'Run moyen visé par un athlète pour une saison HYROX (15 août → 14 août) et une division. Pré-remplit l''objectif des courses sans plan.';
CREATE INDEX IF NOT EXISTS hyrox_season_goals_created_by_fk_idx ON public.hyrox_season_goals (created_by);

DROP TRIGGER IF EXISTS trg_hyrox_season_goals_updated_at ON public.hyrox_season_goals;
CREATE TRIGGER trg_hyrox_season_goals_updated_at BEFORE UPDATE ON public.hyrox_season_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.hyrox_season_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hsg_select ON public.hyrox_season_goals;
CREATE POLICY hsg_select ON public.hyrox_season_goals FOR SELECT TO authenticated
  USING ((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (SELECT public.current_user_is_admin()));
DROP POLICY IF EXISTS hsg_insert ON public.hyrox_season_goals;
CREATE POLICY hsg_insert ON public.hyrox_season_goals FOR INSERT TO authenticated
  WITH CHECK ((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (SELECT public.current_user_is_admin()));
DROP POLICY IF EXISTS hsg_update ON public.hyrox_season_goals;
CREATE POLICY hsg_update ON public.hyrox_season_goals FOR UPDATE TO authenticated
  USING ((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (SELECT public.current_user_is_admin()))
  WITH CHECK ((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (SELECT public.current_user_is_admin()));
DROP POLICY IF EXISTS hsg_delete ON public.hyrox_season_goals;
CREATE POLICY hsg_delete ON public.hyrox_season_goals FOR DELETE TO authenticated
  USING ((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (SELECT public.current_user_is_admin()));

-- ── 4. Seed obj@1 ────────────────────────────────────────────────────────────
-- BEGIN SEED obj@1 (généré par objectiveSeedSql(gridToRows()), ne pas éditer)
INSERT INTO public.hyrox_objective_versions (version, active, notes) VALUES ('obj@1', true, 'Grille v1 validée par Hugo le 15/11/2026 (docs/HYROX_OBJECTIF_CONCEPTION.md §3.4).')
ON CONFLICT (version) DO NOTHING;

INSERT INTO public.hyrox_objective_grid (version, division, run_avg_s, ski_s, sled_push_s, sled_pull_s, bbj_s, row_s, farmers_s, lunges_s, wall_balls_s, roxzone_s, run_shape, source, is_estimate) VALUES
  ('obj@1', 'men', 210, 250, 140, 205, 200, 255, 95, 205, 265, 285, ARRAY[0.91, 0.95, 1.01, 1.00, 1.02, 1.01, 1.01, 1.09]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'men', 240, 255, 155, 225, 235, 265, 105, 235, 305, 305, ARRAY[0.92, 0.95, 1.00, 1.00, 1.02, 1.01, 1.01, 1.09]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'men', 270, 265, 170, 255, 275, 280, 115, 270, 355, 350, ARRAY[0.91, 0.94, 1.00, 1.00, 1.03, 1.01, 1.01, 1.10]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'men', 300, 270, 185, 285, 320, 290, 125, 305, 405, 400, ARRAY[0.90, 0.94, 1.01, 1.00, 1.03, 1.01, 1.01, 1.11]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'men', 330, 280, 195, 310, 355, 300, 135, 340, 455, 455, ARRAY[0.88, 0.93, 1.00, 1.00, 1.04, 1.01, 1.01, 1.13]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'men', 360, 285, 210, 340, 400, 310, 145, 370, 510, 510, ARRAY[0.85, 0.92, 1.00, 1.00, 1.04, 1.01, 1.01, 1.16]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'men', 390, 290, 225, 365, 430, 320, 155, 405, 555, 570, ARRAY[0.83, 0.91, 0.99, 1.00, 1.05, 1.01, 1.02, 1.19]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'men', 420, 295, 235, 385, 465, 325, 165, 430, 600, 620, ARRAY[0.80, 0.90, 1.00, 1.00, 1.05, 1.01, 1.02, 1.22]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'men', 450, 300, 250, 405, 495, 335, 170, 455, 635, 660, ARRAY[0.78, 0.88, 0.98, 1.00, 1.06, 1.02, 1.02, 1.26]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'men', 480, 305, 255, 425, 515, 340, 175, 485, 680, 705, ARRAY[0.74, 0.87, 0.99, 0.99, 1.06, 1.02, 1.03, 1.30]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'women', 240, 285, 135, 250, 260, 295, 105, 215, 265, 315, ARRAY[0.91, 0.96, 1.01, 1.00, 1.03, 1.01, 1.01, 1.08]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'women', 270, 295, 150, 275, 290, 305, 115, 235, 295, 340, ARRAY[0.91, 0.96, 1.00, 1.00, 1.03, 1.01, 1.01, 1.08]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'women', 300, 305, 160, 295, 330, 315, 125, 260, 330, 380, ARRAY[0.92, 0.96, 1.00, 1.00, 1.03, 1.01, 1.01, 1.08]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'women', 330, 310, 170, 320, 370, 325, 135, 290, 370, 425, ARRAY[0.91, 0.95, 1.00, 1.00, 1.03, 1.01, 1.01, 1.09]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'women', 360, 320, 180, 350, 415, 335, 140, 320, 420, 470, ARRAY[0.90, 0.95, 1.00, 1.00, 1.03, 1.01, 1.01, 1.11]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'women', 390, 330, 190, 380, 460, 345, 150, 350, 465, 520, ARRAY[0.88, 0.94, 0.99, 1.00, 1.03, 1.01, 1.01, 1.13]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'women', 420, 335, 200, 405, 510, 350, 160, 385, 515, 570, ARRAY[0.86, 0.93, 0.99, 1.00, 1.04, 1.02, 1.02, 1.15]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'women', 450, 340, 210, 425, 555, 360, 165, 415, 560, 605, ARRAY[0.84, 0.92, 0.98, 1.00, 1.04, 1.02, 1.02, 1.18]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'women', 480, 345, 220, 445, 605, 370, 170, 450, 610, 640, ARRAY[0.81, 0.91, 0.98, 1.00, 1.05, 1.02, 1.03, 1.21]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'men_pro', 210, 240, 170, 220, 170, 245, 95, 195, 265, 275, ARRAY[0.92, 0.95, 1.00, 1.00, 1.01, 1.00, 1.01, 1.09]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'men_pro', 240, 250, 205, 275, 210, 260, 110, 245, 340, 295, ARRAY[0.90, 0.94, 1.00, 1.01, 1.02, 1.00, 1.02, 1.10]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'men_pro', 270, 255, 230, 330, 255, 275, 130, 295, 400, 345, ARRAY[0.88, 0.93, 1.01, 1.01, 1.03, 1.01, 1.02, 1.11]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'men_pro', 300, 265, 255, 375, 295, 285, 145, 330, 455, 400, ARRAY[0.86, 0.92, 1.01, 1.02, 1.03, 1.01, 1.03, 1.13]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'men_pro', 330, 270, 280, 420, 330, 290, 160, 365, 510, 455, ARRAY[0.84, 0.91, 1.00, 1.01, 1.04, 1.01, 1.03, 1.15]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'men_pro', 360, 275, 305, 465, 355, 300, 175, 400, 560, 515, ARRAY[0.81, 0.89, 1.00, 1.01, 1.04, 1.02, 1.04, 1.18]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'men_pro', 390, 280, 320, 500, 395, 310, 190, 435, 615, 570, ARRAY[0.79, 0.89, 0.99, 1.01, 1.04, 1.01, 1.04, 1.23]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'men_pro', 420, 285, 340, 525, 420, 320, 190, 460, 650, 635, ARRAY[0.75, 0.87, 0.99, 1.00, 1.05, 1.01, 1.04, 1.27]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'women_pro', 240, 275, 190, 260, 225, 280, 115, 225, 270, 285, ARRAY[0.85, 0.96, 1.02, 1.02, 1.03, 1.02, 1.02, 1.08]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'women_pro', 270, 285, 220, 300, 265, 295, 135, 265, 320, 325, ARRAY[0.89, 0.95, 1.01, 1.01, 1.03, 1.01, 1.02, 1.09]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'women_pro', 300, 295, 245, 340, 305, 305, 155, 305, 370, 375, ARRAY[0.89, 0.94, 1.00, 1.01, 1.03, 1.01, 1.02, 1.10]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'women_pro', 330, 300, 265, 375, 350, 315, 175, 340, 425, 415, ARRAY[0.88, 0.94, 1.00, 1.01, 1.02, 1.01, 1.02, 1.11]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'women_pro', 360, 310, 285, 410, 390, 325, 190, 375, 475, 475, ARRAY[0.88, 0.93, 1.00, 1.01, 1.03, 1.01, 1.03, 1.12]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'women_pro', 390, 315, 300, 440, 420, 335, 200, 405, 525, 525, ARRAY[0.85, 0.92, 0.99, 1.00, 1.03, 1.02, 1.03, 1.16]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'women_pro', 420, 320, 330, 465, 460, 340, 215, 435, 570, 575, ARRAY[0.84, 0.91, 0.97, 1.00, 1.03, 1.02, 1.04, 1.18]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_men', 240, 230, 100, 170, 150, 250, 85, 170, 230, 280, ARRAY[0.93, 0.95, 1.00, 1.00, 1.02, 1.01, 1.02, 1.06]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_men', 270, 235, 105, 185, 170, 260, 95, 190, 245, 320, ARRAY[0.93, 0.94, 1.01, 1.00, 1.03, 1.01, 1.02, 1.06]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_men', 300, 240, 110, 195, 185, 270, 95, 205, 260, 360, ARRAY[0.93, 0.94, 1.01, 1.01, 1.03, 1.01, 1.02, 1.06]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_men', 330, 250, 115, 210, 200, 275, 105, 225, 270, 410, ARRAY[0.91, 0.94, 1.00, 1.01, 1.03, 1.02, 1.02, 1.08]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_men', 360, 255, 120, 220, 215, 285, 110, 240, 290, 460, ARRAY[0.89, 0.93, 1.00, 1.01, 1.04, 1.02, 1.02, 1.09]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_men', 390, 260, 125, 235, 230, 290, 110, 255, 305, 515, ARRAY[0.88, 0.92, 1.00, 1.01, 1.05, 1.02, 1.02, 1.11]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_men', 420, 265, 135, 245, 245, 300, 115, 270, 320, 570, ARRAY[0.84, 0.91, 1.00, 1.01, 1.05, 1.03, 1.03, 1.14]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_men', 450, 270, 140, 255, 255, 305, 120, 285, 335, 605, ARRAY[0.82, 0.90, 0.99, 1.01, 1.06, 1.03, 1.03, 1.16]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_men', 480, 275, 145, 265, 260, 310, 120, 300, 345, 645, ARRAY[0.80, 0.90, 0.99, 1.01, 1.07, 1.03, 1.03, 1.16]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_women', 270, 265, 100, 210, 195, 285, 95, 180, 225, 330, ARRAY[0.91, 0.96, 1.01, 1.00, 1.02, 1.01, 1.02, 1.07]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_women', 300, 275, 100, 220, 210, 295, 100, 190, 235, 355, ARRAY[0.92, 0.96, 1.00, 1.00, 1.02, 1.01, 1.02, 1.06]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_women', 330, 280, 105, 235, 230, 300, 105, 210, 245, 395, ARRAY[0.93, 0.96, 1.00, 1.00, 1.02, 1.01, 1.01, 1.06]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_women', 360, 290, 110, 250, 250, 310, 110, 225, 260, 435, ARRAY[0.93, 0.96, 1.00, 1.01, 1.02, 1.01, 1.01, 1.07]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_women', 390, 295, 115, 265, 270, 320, 115, 240, 275, 480, ARRAY[0.91, 0.95, 0.99, 1.00, 1.03, 1.02, 1.02, 1.08]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_women', 420, 300, 120, 275, 295, 325, 120, 255, 290, 525, ARRAY[0.90, 0.95, 0.99, 1.00, 1.03, 1.02, 1.02, 1.10]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_women', 450, 305, 125, 290, 320, 335, 125, 270, 310, 570, ARRAY[0.88, 0.94, 0.98, 1.00, 1.03, 1.03, 1.03, 1.12]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_women', 480, 310, 130, 300, 340, 340, 125, 285, 325, 600, ARRAY[0.86, 0.93, 0.98, 1.01, 1.04, 1.03, 1.03, 1.13]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_mixed', 240, 235, 110, 180, 155, 255, 90, 170, 220, 275, ARRAY[0.91, 0.96, 1.01, 1.00, 1.02, 1.01, 1.02, 1.07]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_mixed', 270, 245, 120, 200, 175, 270, 100, 195, 235, 315, ARRAY[0.91, 0.96, 1.01, 1.00, 1.02, 1.01, 1.02, 1.07]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_mixed', 300, 255, 125, 220, 190, 275, 105, 215, 250, 355, ARRAY[0.92, 0.95, 1.01, 1.00, 1.02, 1.01, 1.02, 1.06]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_mixed', 330, 260, 135, 235, 210, 285, 110, 235, 270, 395, ARRAY[0.92, 0.95, 1.00, 1.00, 1.02, 1.01, 1.02, 1.07]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_mixed', 360, 265, 140, 250, 225, 290, 115, 255, 290, 440, ARRAY[0.91, 0.95, 1.00, 1.01, 1.03, 1.01, 1.02, 1.08]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_mixed', 390, 270, 145, 265, 245, 300, 120, 275, 310, 485, ARRAY[0.90, 0.94, 0.99, 1.00, 1.03, 1.02, 1.02, 1.09]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_mixed', 420, 275, 155, 275, 265, 310, 125, 290, 335, 535, ARRAY[0.88, 0.93, 0.99, 1.00, 1.03, 1.02, 1.03, 1.12]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_mixed', 450, 280, 160, 290, 275, 315, 125, 305, 350, 575, ARRAY[0.85, 0.93, 0.99, 1.00, 1.04, 1.03, 1.03, 1.13]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false),
  ('obj@1', 'doubles_mixed', 480, 285, 165, 300, 290, 320, 130, 320, 375, 620, ARRAY[0.83, 0.92, 0.98, 1.00, 1.04, 1.03, 1.04, 1.16]::numeric[], 'RoxHype byRun 07/2024-10/2026, arrondi 5 s, recoupé pyrox S7-S9', false)
ON CONFLICT (version, division, run_avg_s) DO NOTHING;
-- END SEED obj@1
