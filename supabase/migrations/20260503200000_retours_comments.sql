-- Migration: Ajout des commentaires détaillés pour les retours hebdo
-- Date: 2026-05-03

-- 1. Ajouter commentaire aux compétitions
ALTER TABLE competitions 
ADD COLUMN IF NOT EXISTS athlete_comment TEXT;

COMMENT ON COLUMN competitions.athlete_comment IS 'Commentaire de l''athlète sur sa performance en compétition';

-- 2. Créer table pour commentaires par exercice dans une séance
CREATE TABLE IF NOT EXISTS workout_exercise_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_log_id UUID NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL,
  exercise_name TEXT NOT NULL, -- Backup si l'exercice est supprimé
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workout_log_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_workout_exercise_comments_workout ON workout_exercise_comments(workout_log_id);
CREATE INDEX IF NOT EXISTS idx_workout_exercise_comments_exercise ON workout_exercise_comments(exercise_id);

-- Trigger updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'set_workout_exercise_comments_updated_at'
      AND event_object_table = 'workout_exercise_comments'
  ) THEN
    CREATE TRIGGER set_workout_exercise_comments_updated_at
      BEFORE UPDATE ON workout_exercise_comments
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- RLS pour workout_exercise_comments
ALTER TABLE workout_exercise_comments ENABLE ROW LEVEL SECURITY;

-- Self: l'athlète peut CRUD ses propres commentaires
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workout_exercise_comments' AND policyname = 'workout_exercise_comments_self') THEN
    CREATE POLICY "workout_exercise_comments_self"
      ON workout_exercise_comments FOR ALL
      USING (EXISTS (SELECT 1 FROM workout_logs wl WHERE wl.id = workout_exercise_comments.workout_log_id AND wl.athlete_id = auth.uid()));
  END IF;
END $$;

-- Coach: lecture des commentaires de ses athlètes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workout_exercise_comments' AND policyname = 'workout_exercise_comments_coach_read') THEN
    CREATE POLICY "workout_exercise_comments_coach_read"
      ON workout_exercise_comments FOR SELECT
      USING (EXISTS (SELECT 1 FROM workout_logs wl WHERE wl.id = workout_exercise_comments.workout_log_id AND is_coach_of(wl.athlete_id)));
  END IF;
END $$;

-- 3. Politique RLS pour lire athlete_comment sur competitions
-- Les politiques existantes couvrent déjà INSERT/UPDATE, on ajoute juste une note
COMMENT ON COLUMN competitions.athlete_comment IS 'Visible par l''athlète et son coach via RLS existantes';
