-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : Module HYROX — flag profil, tables résultats/références/plans,
-- seeds références statistiques, tests HYROX (catégorie + 10 définitions).
-- 2026-10-13
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Flag sur profiles ─────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_hyrox_athlete boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_hyrox_athlete IS
  'Active l''onglet HYROX pour cet athlète. Modifiable par son coach ou un admin, pas par l''athlète lui-même.';

-- Trigger : seul le coach de l'athlète, un admin, ou un coach_athlete qui se suit
-- lui-même peut basculer le flag.
CREATE OR REPLACE FUNCTION public.prevent_hyrox_flag_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_hyrox_athlete IS DISTINCT FROM OLD.is_hyrox_athlete THEN
    IF auth.uid() IS NOT NULL THEN
      -- Coach de l'athlète
      IF auth.uid() = OLD.coach_id THEN RETURN NEW; END IF;
      -- Admin
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN RETURN NEW; END IF;
      -- Coach_athlete qui se suit lui-même
      IF auth.uid() = OLD.id AND EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coach', 'coach_athlete')
      ) THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'Forbidden: only the athlete''s coach can change is_hyrox_athlete';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_hyrox_flag_update ON public.profiles;
CREATE TRIGGER trg_prevent_hyrox_flag_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_hyrox_flag_self_update();

-- ── 2. hyrox_results ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hyrox_results (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  competition_id   uuid REFERENCES public.competitions(id) ON DELETE SET NULL,
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  date             date NOT NULL,
  event_name       text NOT NULL,
  venue            text,
  format           text NOT NULL DEFAULT 'solo'
                   CHECK (format IN ('solo','doubles','relay','sim_full','sim_34','sim_half')),
  division         text NOT NULL
                   CHECK (division IN ('women','women_pro','men','men_pro',
                                       'doubles_women','doubles_men','doubles_mixed',
                                       'doubles_women_pro','doubles_men_pro',
                                       'relay_women','relay_men','relay_mixed','adaptive')),
  age_group        text,
  is_official      boolean NOT NULL DEFAULT true,
  status           text NOT NULL DEFAULT 'finished'
                   CHECK (status IN ('finished','dnf','dns','dq')),
  total_s          integer NOT NULL CHECK (total_s > 0),
  run_1_s integer, run_2_s integer, run_3_s integer, run_4_s integer,
  run_5_s integer, run_6_s integer, run_7_s integer, run_8_s integer,
  ski_s integer, sled_push_s integer, sled_pull_s integer, bbj_s integer,
  row_s integer, farmers_s integer, lunges_s integer, wall_balls_s integer,
  roxzone_total_s  integer,
  roxzone_splits   jsonb,
  penalties_s      integer NOT NULL DEFAULT 0,
  penalties_note   text,
  rank_overall     integer,
  rank_age_group   integer,
  participants_overall   integer,
  participants_age_group integer,
  activity_url     text,
  athlete_comment  text,
  coach_comment    text,
  source           text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hyrox_results_athlete_date ON public.hyrox_results(athlete_id, date DESC);

DROP TRIGGER IF EXISTS trg_hyrox_results_updated_at ON public.hyrox_results;
CREATE TRIGGER trg_hyrox_results_updated_at
  BEFORE UPDATE ON public.hyrox_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.hyrox_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_select" ON public.hyrox_results;
CREATE POLICY "hr_select" ON public.hyrox_results FOR SELECT
  USING (athlete_id = auth.uid()
    OR public.is_coach_of(athlete_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

DROP POLICY IF EXISTS "hr_insert" ON public.hyrox_results;
CREATE POLICY "hr_insert" ON public.hyrox_results FOR INSERT
  WITH CHECK (athlete_id = auth.uid()
    OR public.is_coach_of(athlete_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

DROP POLICY IF EXISTS "hr_update" ON public.hyrox_results;
CREATE POLICY "hr_update" ON public.hyrox_results FOR UPDATE
  USING (athlete_id = auth.uid()
    OR public.is_coach_of(athlete_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

DROP POLICY IF EXISTS "hr_delete" ON public.hyrox_results;
CREATE POLICY "hr_delete" ON public.hyrox_results FOR DELETE
  USING (athlete_id = auth.uid()
    OR public.is_coach_of(athlete_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

-- ── 3. hyrox_reference_segments ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hyrox_reference_segments (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division  text NOT NULL,
  bracket   text NOT NULL DEFAULT 'all',
  segment   text NOT NULL,
  p10_s     integer,
  p50_s     integer NOT NULL,
  p90_s     integer,
  source    text NOT NULL,
  is_estimate boolean NOT NULL DEFAULT false,
  UNIQUE (division, bracket, segment)
);

ALTER TABLE public.hyrox_reference_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hrs_select" ON public.hyrox_reference_segments;
CREATE POLICY "hrs_select" ON public.hyrox_reference_segments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "hrs_insert" ON public.hyrox_reference_segments;
CREATE POLICY "hrs_insert" ON public.hyrox_reference_segments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

DROP POLICY IF EXISTS "hrs_update" ON public.hyrox_reference_segments;
CREATE POLICY "hrs_update" ON public.hyrox_reference_segments FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

DROP POLICY IF EXISTS "hrs_delete" ON public.hyrox_reference_segments;
CREATE POLICY "hrs_delete" ON public.hyrox_reference_segments FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

-- ── 4. hyrox_race_plans (P3, table créée dès maintenant) ────────────────────

CREATE TABLE IF NOT EXISTS public.hyrox_race_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  competition_id   uuid REFERENCES public.competitions(id) ON DELETE SET NULL,
  result_id        uuid REFERENCES public.hyrox_results(id) ON DELETE SET NULL,
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name             text NOT NULL,
  division         text NOT NULL,
  profile          text NOT NULL DEFAULT 'hybrid' CHECK (profile IN ('runner','hybrid','powerhouse')),
  target_total_s   integer NOT NULL CHECK (target_total_s > 0),
  targets          jsonb NOT NULL,
  predicted_total_s integer,
  predicted_high_s  integer,
  predicted_from    jsonb,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_hyrox_race_plans_updated_at ON public.hyrox_race_plans;
CREATE TRIGGER trg_hyrox_race_plans_updated_at
  BEFORE UPDATE ON public.hyrox_race_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.hyrox_race_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hrp_select" ON public.hyrox_race_plans;
CREATE POLICY "hrp_select" ON public.hyrox_race_plans FOR SELECT
  USING (athlete_id = auth.uid()
    OR public.is_coach_of(athlete_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

DROP POLICY IF EXISTS "hrp_insert" ON public.hyrox_race_plans;
CREATE POLICY "hrp_insert" ON public.hyrox_race_plans FOR INSERT
  WITH CHECK (athlete_id = auth.uid()
    OR public.is_coach_of(athlete_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

DROP POLICY IF EXISTS "hrp_update" ON public.hyrox_race_plans;
CREATE POLICY "hrp_update" ON public.hyrox_race_plans FOR UPDATE
  USING (athlete_id = auth.uid()
    OR public.is_coach_of(athlete_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

DROP POLICY IF EXISTS "hrp_delete" ON public.hyrox_race_plans;
CREATE POLICY "hrp_delete" ON public.hyrox_race_plans FOR DELETE
  USING (athlete_id = auth.uid()
    OR public.is_coach_of(athlete_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

-- ── 5. Seeds hyrox_reference_segments ────────────────────────────────────────

-- Totaux par division (RoxHype 25/26)
INSERT INTO public.hyrox_reference_segments (division, bracket, segment, p10_s, p50_s, p90_s, source) VALUES
  ('men',       'all', 'total', 4211, 5269, 7057, 'RoxHype 25/26'),
  ('women',     'all', 'total', 4688, 5768, 7646, 'RoxHype 25/26'),
  ('men_pro',   'all', 'total', 3950, 4850, 6439, 'RoxHype 25/26'),
  ('women_pro', 'all', 'total', 4264, 5200, 6899, 'RoxHype 25/26')
ON CONFLICT (division, bracket, segment) DO NOTHING;

-- Stations men (RoxHype 25/26)
INSERT INTO public.hyrox_reference_segments (division, bracket, segment, p10_s, p50_s, p90_s, source) VALUES
  ('men', 'all', 'wall_balls',  300, 435, 709, 'RoxHype 25/26'),
  ('men', 'all', 'bbj',         234, 338, 511, 'RoxHype 25/26'),
  ('men', 'all', 'lunges',      234, 322, 477, 'RoxHype 25/26'),
  ('men', 'all', 'sled_pull',   226, 303, 424, 'RoxHype 25/26'),
  ('men', 'all', 'sled_push',   145, 190, 266, 'RoxHype 25/26'),
  ('men', 'all', 'farmers',     101, 133, 189, 'RoxHype 25/26'),
  ('men', 'all', 'row',         265, 295, 336, 'RoxHype 25/26'),
  ('men', 'all', 'ski',         254, 276, 306, 'RoxHype 25/26')
ON CONFLICT (division, bracket, segment) DO NOTHING;

-- Stations women (HYROX Data Lab S7-S8, p10/p90 null)
INSERT INTO public.hyrox_reference_segments (division, bracket, segment, p10_s, p50_s, p90_s, source) VALUES
  ('women', 'all', 'ski',        NULL, 311, NULL, 'HYROX Data Lab S7-S8'),
  ('women', 'all', 'sled_push',  NULL, 175, NULL, 'HYROX Data Lab S7-S8'),
  ('women', 'all', 'sled_pull',  NULL, 346, NULL, 'HYROX Data Lab S7-S8'),
  ('women', 'all', 'bbj',        NULL, 384, NULL, 'HYROX Data Lab S7-S8'),
  ('women', 'all', 'row',        NULL, 325, NULL, 'HYROX Data Lab S7-S8'),
  ('women', 'all', 'farmers',    NULL, 137, NULL, 'HYROX Data Lab S7-S8'),
  ('women', 'all', 'lunges',     NULL, 307, NULL, 'HYROX Data Lab S7-S8'),
  ('women', 'all', 'wall_balls', NULL, 390, NULL, 'HYROX Data Lab S7-S8')
ON CONFLICT (division, bracket, segment) DO NOTHING;

-- Course totale run_total (estimé)
INSERT INTO public.hyrox_reference_segments (division, bracket, segment, p10_s, p50_s, p90_s, source, is_estimate) VALUES
  ('men',       'all', 'run_total', 2100, 2640, 3480, 'estimé', true),
  ('women',     'all', 'run_total', 2340, 2895, 3840, 'estimé', true),
  ('men_pro',   'all', 'run_total', 1950, 2400, 3180, 'estimé', true),
  ('women_pro', 'all', 'run_total', 2130, 2580, 3420, 'estimé', true)
ON CONFLICT (division, bracket, segment) DO NOTHING;

-- Roxzone totale (HYROX Data Lab Utrecht)
INSERT INTO public.hyrox_reference_segments (division, bracket, segment, p10_s, p50_s, p90_s, source) VALUES
  ('men',   'all', 'roxzone_total', 221, 357, 510, 'HYROX Data Lab Utrecht'),
  ('women', 'all', 'roxzone_total', 240, 394, 570, 'HYROX Data Lab Utrecht')
ON CONFLICT (division, bracket, segment) DO NOTHING;

-- Roxzone par bracket (division all = hommes, p50 seul)
INSERT INTO public.hyrox_reference_segments (division, bracket, segment, p10_s, p50_s, p90_s, source) VALUES
  ('men', 'sub70',   'roxzone_total', NULL, 221, NULL, 'HYROX Data Lab Utrecht'),
  ('men', '70_80',   'roxzone_total', NULL, 273, NULL, 'HYROX Data Lab Utrecht'),
  ('men', '80_90',   'roxzone_total', NULL, 319, NULL, 'HYROX Data Lab Utrecht'),
  ('men', '90_plus', 'roxzone_total', NULL, 418, NULL, 'HYROX Data Lab Utrecht')
ON CONFLICT (division, bracket, segment) DO NOTHING;

-- Runs par bracket, men (HYROX Data Lab mid-race crisis)
INSERT INTO public.hyrox_reference_segments (division, bracket, segment, p10_s, p50_s, p90_s, source) VALUES
  ('men', '70_80', 'run_1', NULL, 259, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', '70_80', 'run_2', NULL, 306, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', '70_80', 'run_3', NULL, 330, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', '70_80', 'run_4', NULL, 331, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', '70_80', 'run_5', NULL, 339, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', '70_80', 'run_6', NULL, 333, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', '70_80', 'run_7', NULL, 333, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', '70_80', 'run_8', NULL, 323, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', '90_plus', 'run_1', NULL, 293, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', '90_plus', 'run_2', NULL, 356, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', '90_plus', 'run_3', NULL, 388, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', '90_plus', 'run_4', NULL, 386, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', '90_plus', 'run_5', NULL, 405, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', '90_plus', 'run_6', NULL, 394, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', '90_plus', 'run_7', NULL, 399, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', '90_plus', 'run_8', NULL, 433, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', 'all', 'run_1', NULL, 279, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', 'all', 'run_2', NULL, 295, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', 'all', 'run_3', NULL, 320, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', 'all', 'run_4', NULL, 319, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', 'all', 'run_5', NULL, 330, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', 'all', 'run_6', NULL, 322, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', 'all', 'run_7', NULL, 323, NULL, 'HYROX Data Lab mid-race crisis'),
  ('men', 'all', 'run_8', NULL, 370, NULL, 'HYROX Data Lab mid-race crisis')
ON CONFLICT (division, bracket, segment) DO NOTHING;

-- Runs women, bracket all
INSERT INTO public.hyrox_reference_segments (division, bracket, segment, p10_s, p50_s, p90_s, source) VALUES
  ('women', 'all', 'run_1', NULL, 314, NULL, 'HYROX Data Lab mid-race crisis'),
  ('women', 'all', 'run_2', NULL, 333, NULL, 'HYROX Data Lab mid-race crisis'),
  ('women', 'all', 'run_3', NULL, 350, NULL, 'HYROX Data Lab mid-race crisis'),
  ('women', 'all', 'run_4', NULL, 352, NULL, 'HYROX Data Lab mid-race crisis'),
  ('women', 'all', 'run_5', NULL, 362, NULL, 'HYROX Data Lab mid-race crisis'),
  ('women', 'all', 'run_6', NULL, 357, NULL, 'HYROX Data Lab mid-race crisis'),
  ('women', 'all', 'run_7', NULL, 356, NULL, 'HYROX Data Lab mid-race crisis'),
  ('women', 'all', 'run_8', NULL, 398, NULL, 'HYROX Data Lab mid-race crisis')
ON CONFLICT (division, bracket, segment) DO NOTHING;

-- ── 6. Seeds test_definitions HYROX ──────────────────────────────────────────

INSERT INTO public.test_definitions (id, name, category, kind, is_global, fill_mode, protocol)
VALUES
  ('00000000-0000-0000-0000-0000000000c1', '5 km course', 'hyrox', 'preset', true, 'self', jsonb_build_object('text', 'Parcours plat mesuré ou tapis 1 %. Départ frais, à fond.')),
  ('00000000-0000-0000-0000-0000000000c2', 'SkiErg 1000 m', 'hyrox', 'preset', true, 'self', jsonb_build_object('text', 'Damper 5-6. Départ arrêté, 1000 m à fond. Noter le temps affiché.')),
  ('00000000-0000-0000-0000-0000000000c3', 'Rameur 1000 m', 'hyrox', 'preset', true, 'self', jsonb_build_object('text', 'Damper 5-6, cale-pieds 4. 1000 m à fond.')),
  ('00000000-0000-0000-0000-0000000000c4', '100 wall balls', 'hyrox', 'preset', true, 'self', jsonb_build_object('text', 'Charge et cible de sa division (H 6 kg / 3 m, F 4 kg / 2,70 m, Men Pro 9 kg). 100 reps pour le temps, pauses comprises.')),
  ('00000000-0000-0000-0000-0000000000c5', 'Burpee broad jump 80 m', 'hyrox', 'preset', true, 'self', jsonb_build_object('text', '80 m au standard compétition (pieds écartés de 5 cm max, mains à 30 cm max des orteils). Compter les sauts.')),
  ('00000000-0000-0000-0000-0000000000c6', 'Farmers carry 200 m', 'hyrox', 'preset', true, 'self', jsonb_build_object('text', '200 m avec les kettlebells de sa division (2 × 24 H, 2 × 16 F, 2 × 32 Men Pro). Poses autorisées, chrono qui tourne.')),
  ('00000000-0000-0000-0000-0000000000c7', 'Sled push 50 m', 'hyrox', 'preset', true, 'self', jsonb_build_object('text', '4 × 12,5 m, charge de division (152 kg H / 102 F / 202 Men Pro). Noter la surface.')),
  ('00000000-0000-0000-0000-0000000000c8', 'Sled pull 50 m', 'hyrox', 'preset', true, 'self', jsonb_build_object('text', '4 × 12,5 m, charge de division (103 kg H / 78 F / 153 Men Pro).')),
  ('00000000-0000-0000-0000-0000000000c9', 'Sandbag lunges 100 m', 'hyrox', 'preset', true, 'self', jsonb_build_object('text', '100 m, sac sur les épaules, genou arrière au sol à chaque fente.')),
  ('00000000-0000-0000-0000-0000000000ca', 'Course compromise (1 km · 100 WB · 1 km)', 'hyrox', 'preset', true, 'self', jsonb_build_object('text', '1 km à l''allure de course visée, enchaîner 100 wall balls, enchaîner 1 km à la même intention. Aucun repos. La dégradation = (run 2 − run 1) / run 1.'))
ON CONFLICT (id) DO NOTHING;

-- Variables des tests HYROX
INSERT INTO public.test_variables (test_definition_id, key, label, unit, value_type, better_when) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'time', 'Temps', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000c2', 'time', 'Temps', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000c3', 'time', 'Temps', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000c4', 'time', 'Temps', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000c4', 'load_kg', 'Charge', 'kg', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000c5', 'time', 'Temps', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000c5', 'reps', 'Sauts', 'n', 'number', 'lower'),
  ('00000000-0000-0000-0000-0000000000c6', 'time', 'Temps', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000c6', 'load_kg', 'Charge par main', 'kg', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000c7', 'time', 'Temps', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000c7', 'load_kg', 'Charge sled comprise', 'kg', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000c8', 'time', 'Temps', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000c8', 'load_kg', 'Charge sled comprise', 'kg', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000c9', 'time', 'Temps', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000c9', 'load_kg', 'Charge', 'kg', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000ca', 'run_1', 'Run 1 (frais)', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000ca', 'wb', '100 wall balls', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000ca', 'run_2', 'Run 2 (après WB)', 's', 'duration', 'lower')
ON CONFLICT DO NOTHING;
