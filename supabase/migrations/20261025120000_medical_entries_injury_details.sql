-- Blessures détaillées : l'athlète comme le coach peuvent déclarer, et on garde
-- de quoi comprendre la blessure plutôt que son seul intitulé.
--
-- Tous les champs sont facultatifs et ne concernent que `kind = 'blessure'` :
-- une opération ou une pathologie n'a pas de mécanisme ni de niveau de douleur.
-- Les laisser nullables permet de déclarer une gêne en dix secondes et de
-- compléter plus tard.
--
-- L'auteur était déjà tracé par `created_by` ; `declared_by` dit en un mot de
-- quel côté vient la déclaration, sans avoir à refaire la jointure.
--
-- Les policies de medical_entries couvrent déjà le besoin (athlète sur ses
-- propres lignes, coach via `public.is_coach_of`) : rien à changer côté RLS.

ALTER TABLE public.medical_entries
  ADD COLUMN IF NOT EXISTS injury_type      text,
  ADD COLUMN IF NOT EXISTS mechanism        text,
  ADD COLUMN IF NOT EXISTS context          text,
  ADD COLUMN IF NOT EXISTS pain_level       smallint,
  ADD COLUMN IF NOT EXISTS training_impact  text,
  ADD COLUMN IF NOT EXISTS days_off         integer,
  ADD COLUMN IF NOT EXISTS diagnosed_by     text,
  ADD COLUMN IF NOT EXISTS return_date      date,
  ADD COLUMN IF NOT EXISTS declared_by      text;

-- Contraintes posées à part : `ADD CONSTRAINT IF NOT EXISTS` n'existe pas, donc
-- on retire puis on recrée, ce qui rend la migration rejouable.
ALTER TABLE public.medical_entries DROP CONSTRAINT IF EXISTS medical_entries_injury_type_check;
ALTER TABLE public.medical_entries ADD  CONSTRAINT medical_entries_injury_type_check
  CHECK (injury_type IS NULL OR injury_type IN ('traumatique', 'chronique_surmenage', 'recidive'));

ALTER TABLE public.medical_entries DROP CONSTRAINT IF EXISTS medical_entries_mechanism_check;
ALTER TABLE public.medical_entries ADD  CONSTRAINT medical_entries_mechanism_check
  CHECK (mechanism IS NULL OR mechanism IN ('contact', 'sans_contact', 'chute', 'geste_repete', 'inconnu'));

ALTER TABLE public.medical_entries DROP CONSTRAINT IF EXISTS medical_entries_context_check;
ALTER TABLE public.medical_entries ADD  CONSTRAINT medical_entries_context_check
  CHECK (context IS NULL OR context IN ('entrainement', 'competition', 'hors_sport'));

ALTER TABLE public.medical_entries DROP CONSTRAINT IF EXISTS medical_entries_pain_level_check;
ALTER TABLE public.medical_entries ADD  CONSTRAINT medical_entries_pain_level_check
  CHECK (pain_level IS NULL OR (pain_level >= 0 AND pain_level <= 10));

ALTER TABLE public.medical_entries DROP CONSTRAINT IF EXISTS medical_entries_training_impact_check;
ALTER TABLE public.medical_entries ADD  CONSTRAINT medical_entries_training_impact_check
  CHECK (training_impact IS NULL OR training_impact IN ('aucun', 'adapte', 'arret_partiel', 'arret_total'));

ALTER TABLE public.medical_entries DROP CONSTRAINT IF EXISTS medical_entries_days_off_check;
ALTER TABLE public.medical_entries ADD  CONSTRAINT medical_entries_days_off_check
  CHECK (days_off IS NULL OR days_off >= 0);

ALTER TABLE public.medical_entries DROP CONSTRAINT IF EXISTS medical_entries_diagnosed_by_check;
ALTER TABLE public.medical_entries ADD  CONSTRAINT medical_entries_diagnosed_by_check
  CHECK (diagnosed_by IS NULL OR diagnosed_by IN ('personne', 'medecin', 'kine', 'osteo', 'autre'));

ALTER TABLE public.medical_entries DROP CONSTRAINT IF EXISTS medical_entries_declared_by_check;
ALTER TABLE public.medical_entries ADD  CONSTRAINT medical_entries_declared_by_check
  CHECK (declared_by IS NULL OR declared_by IN ('athlete', 'coach'));

COMMENT ON COLUMN public.medical_entries.injury_type     IS 'traumatique | chronique_surmenage | recidive';
COMMENT ON COLUMN public.medical_entries.mechanism       IS 'contact | sans_contact | chute | geste_repete | inconnu';
COMMENT ON COLUMN public.medical_entries.context         IS 'entrainement | competition | hors_sport';
COMMENT ON COLUMN public.medical_entries.pain_level      IS 'Douleur ressentie, de 0 à 10';
COMMENT ON COLUMN public.medical_entries.training_impact IS 'aucun | adapte | arret_partiel | arret_total';
COMMENT ON COLUMN public.medical_entries.days_off        IS 'Jours d''arrêt déjà posés';
COMMENT ON COLUMN public.medical_entries.diagnosed_by    IS 'personne | medecin | kine | osteo | autre';
COMMENT ON COLUMN public.medical_entries.return_date     IS 'Retour prévu ou effectif';
COMMENT ON COLUMN public.medical_entries.declared_by     IS 'athlete | coach — côté d''où vient la déclaration';
