-- Banque d'exercices : un 2e muscle principal facultatif (2 principaux max).
-- `target` reste le 1er muscle principal ; `secondary` les muscles secondaires
-- (comptent 0,5 série dans le volume par muscle).
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS target_2 text;

COMMENT ON COLUMN public.exercises.target_2 IS
  '2e muscle principal facultatif (compte 1 série, comme target).';
