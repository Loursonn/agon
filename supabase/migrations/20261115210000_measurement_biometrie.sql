-- Biométrie : taille debout, envergure et mesures MyJump dans les saisies
-- de mensurations (measurement_logs). Ajout pur : colonnes nullables, mêmes
-- règles d'accès (les policies de la table couvrent toutes les colonnes),
-- export RGPD inchangé (la ligne entière est exportée).

ALTER TABLE public.measurement_logs
  ADD COLUMN IF NOT EXISTS height_cm            numeric(5,1) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS wingspan_cm          numeric(5,1) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS leg_length_cm        numeric(5,1) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS jump_start_height_cm numeric(5,1) DEFAULT NULL;

COMMENT ON COLUMN public.measurement_logs.height_cm IS 'Taille debout, stature (cm)';
COMMENT ON COLUMN public.measurement_logs.wingspan_cm IS 'Envergure, bras tendus à l''horizontale (cm)';
COMMENT ON COLUMN public.measurement_logs.leg_length_cm IS 'MyJump : longueur du membre inférieur, grand trochanter → pointe du pied, cheville tendue (cm)';
COMMENT ON COLUMN public.measurement_logs.jump_start_height_cm IS 'MyJump : hauteur de départ, grand trochanter → sol, genoux à 90° (cm)';
