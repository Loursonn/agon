-- Coach weekly feedback for athletes
CREATE TABLE IF NOT EXISTS public.weekly_retours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, week_start)
);

ALTER TABLE public.weekly_retours ENABLE ROW LEVEL SECURITY;

-- Coach can read/write retours for their athletes
CREATE POLICY "wr_coach_all" ON public.weekly_retours
  FOR ALL TO authenticated
  USING (coach_id = auth.uid() OR public.is_coach_of(athlete_id))
  WITH CHECK (coach_id = auth.uid());

-- Athlete can read their own retours
CREATE POLICY "wr_athlete_select" ON public.weekly_retours
  FOR SELECT TO authenticated
  USING (athlete_id = auth.uid());
