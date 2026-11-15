-- Biométrie, suite : longueurs de segment (cuisse, jambe, bras) dans les
-- saisies de mensurations. Ajout pur, comme 20261115210000 : colonnes
-- nullables, policies de la table inchangées, export RGPD = ligne entière.
-- (Les colonnes bras / cuisse / mollet existantes sont des tours, pas des longueurs.)

ALTER TABLE public.measurement_logs
  ADD COLUMN IF NOT EXISTS thigh_length_cm numeric(5,1) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS shank_length_cm numeric(5,1) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS arm_length_cm   numeric(5,1) DEFAULT NULL;

COMMENT ON COLUMN public.measurement_logs.thigh_length_cm IS 'Longueur de cuisse : grand trochanter → interligne du genou, côté externe (cm)';
COMMENT ON COLUMN public.measurement_logs.shank_length_cm IS 'Longueur de jambe : interligne du genou → malléole externe (cm)';
COMMENT ON COLUMN public.measurement_logs.arm_length_cm IS 'Longueur de bras : acromion → coude (épicondyle), bras le long du corps (cm)';
