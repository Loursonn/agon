-- Index de la clé étrangère competitions.cancelled_by (ajoutée par 20261115120000_competitions_annulees sans index).
-- Règle d'hygiène (test supabase/tests/db_hygiene.sql « plus aucune FK sans index ») :
-- chaque FK a un index qui commence par ses colonnes (suppression d'un profil, jointures).
-- Table petite : CREATE INDEX simple, verrou de quelques millisecondes. Rejouable.

CREATE INDEX IF NOT EXISTS competitions_cancelled_by_fk_idx ON public.competitions (cancelled_by);
