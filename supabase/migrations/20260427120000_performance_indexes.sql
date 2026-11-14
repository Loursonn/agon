-- Migration A — Indexes de performance
-- Idempotente : utilise IF NOT EXISTS partout
-- 2026-04-27

-- ── app_data ─────────────────────────────────────────────────────────────────
-- Toutes les requêtes filtrent sur (athlete_id, key) en même temps.
-- Le PK est (athlete_id, key) — index composé déjà présent via la PK.
-- On ajoute un index sur key seul pour les requêtes .in("key", [...]) multi-athlètes.
CREATE INDEX IF NOT EXISTS idx_app_data_key
  ON public.app_data (key);

-- Index sur updated_at pour ORDER BY updated_at DESC (useRecentActivity)
CREATE INDEX IF NOT EXISTS idx_app_data_updated_at
  ON public.app_data (updated_at DESC);

-- ── competitions ─────────────────────────────────────────────────────────────
-- Requêtes : WHERE athlete_id IN (...) AND date >= today AND date <= +30j
CREATE INDEX IF NOT EXISTS idx_competitions_athlete_date
  ON public.competitions (athlete_id, date);

-- (Index partiel « compétitions futures » retiré le 2026-11-13 : CURRENT_DATE
-- n'est pas IMMUTABLE, Postgres le refuse ; il n'a jamais existé en prod.)

-- ── planning_blocks ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_planning_blocks_athlete
  ON public.planning_blocks (athlete_id);

-- ── performance_logs ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_performance_logs_athlete_date
  ON public.performance_logs (athlete_id, date DESC);

-- ── test_sessions ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_test_sessions_athlete_date
  ON public.test_sessions (athlete_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_test_sessions_coach
  ON public.test_sessions (coach_id);

-- ── habits ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_habits_athlete
  ON public.habits (athlete_id);

-- ── habit_logs ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_habit_logs_athlete_date
  ON public.habit_logs (athlete_id, date DESC);

-- ── retours ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_retours_athlete_created
  ON public.retours (athlete_id, created_at DESC);

-- ── energy_session_config ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_energy_cfg_athlete
  ON public.energy_session_config (athlete_id);

-- ── energy_workout_logs ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_energy_logs_athlete_date
  ON public.energy_workout_logs (athlete_id, date DESC);

-- ── ANALYZE — met à jour les statistiques du query planner ───────────────────
ANALYZE public.app_data;
ANALYZE public.competitions;
ANALYZE public.planning_blocks;
ANALYZE public.performance_logs;
ANALYZE public.test_sessions;
ANALYZE public.habits;
ANALYZE public.habit_logs;
ANALYZE public.retours;
