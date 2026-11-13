-- ── Training Methods ────────────────────────────────────────────────────────
-- Banque de méthodes d'entraînement paramétrables (coach).
-- scope = 'set'      : s'applique à un ou plusieurs sets précis d'un exercice.
-- scope = 'exercise' : remplace entièrement le pattern de sets de l'exercice.

CREATE TABLE training_methods (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  scope       TEXT        NOT NULL CHECK (scope IN ('set', 'exercise')),
  category    TEXT        NOT NULL CHECK (
    category IN ('intensification', 'volume', 'technique', 'endurance', 'custom')
  ),
  config      JSONB       NOT NULL DEFAULT '{}',
  is_official BOOLEAN     NOT NULL DEFAULT false,
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  tags        TEXT[]      DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Index pour les requêtes courantes
CREATE INDEX training_methods_created_by_idx ON training_methods(created_by);
CREATE INDEX training_methods_scope_idx      ON training_methods(scope);
CREATE INDEX training_methods_category_idx   ON training_methods(category);
CREATE INDEX training_methods_is_official_idx ON training_methods(is_official);

ALTER TABLE training_methods ENABLE ROW LEVEL SECURITY;

-- Lecture : tout le monde (méthodes officielles partagées, méthodes coach visibles)
CREATE POLICY "methods_select_all" ON training_methods
  FOR SELECT USING (true);

-- Création : coaches uniquement, ne peuvent pas créer de méthodes officielles
CREATE POLICY "methods_insert_coach" ON training_methods
  FOR INSERT WITH CHECK (
    is_official = false AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('coach', 'coach_athlete')
    )
  );

-- Mise à jour : auteur ou admin
CREATE POLICY "methods_update_own" ON training_methods
  FOR UPDATE USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Suppression : auteur ou admin
CREATE POLICY "methods_delete_own" ON training_methods
  FOR DELETE USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Trigger updated_at
CREATE TRIGGER set_training_methods_updated_at
  BEFORE UPDATE ON training_methods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
