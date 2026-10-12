-- Athlete life events: informational notes visible to coach on planning
CREATE TABLE IF NOT EXISTS athlete_life_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date_start  DATE NOT NULL,
  date_end    DATE NOT NULL,
  title       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE athlete_life_events ENABLE ROW LEVEL SECURITY;

-- Athlete CRUD own events, coach can read via is_coach_of()
CREATE POLICY "life_events_select" ON athlete_life_events FOR SELECT
  USING (athlete_id = auth.uid() OR public.is_coach_of(athlete_id));

CREATE POLICY "life_events_insert" ON athlete_life_events FOR INSERT
  WITH CHECK (athlete_id = auth.uid());

CREATE POLICY "life_events_update" ON athlete_life_events FOR UPDATE
  USING (athlete_id = auth.uid());

CREATE POLICY "life_events_delete" ON athlete_life_events FOR DELETE
  USING (athlete_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_life_events_athlete ON athlete_life_events(athlete_id);
CREATE INDEX IF NOT EXISTS idx_life_events_dates ON athlete_life_events(date_start, date_end);
