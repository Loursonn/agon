-- Add activity_url column for Strava/Garmin links on energy session completions
ALTER TABLE public.energy_session_assignments
  ADD COLUMN IF NOT EXISTS activity_url text;
