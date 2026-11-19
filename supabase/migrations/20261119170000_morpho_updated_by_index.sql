-- morpho_observations.updated_by référence profiles(id) ON DELETE SET NULL :
-- sans index, chaque suppression de profil parcourt toute la table.
-- Règle « plus aucune FK sans index » (supabase/tests/db_hygiene.sql).
CREATE INDEX IF NOT EXISTS idx_morpho_observations_updated_by
  ON public.morpho_observations (updated_by);
