-- À appliquer AVANT 20261015100000 (RLS sur cycles) : chaque cycle porte son
-- athlete_id, pour qu'un cycle détaché de son mésocycle reste accessible à
-- l'athlète et à son coach (sinon COALESCE(athlete_id, mésocycle) = NULL).
UPDATE public.cycles c
SET athlete_id = ma.athlete_id
FROM public.mesocycles me
JOIN public.macrocycles ma ON ma.id = me.macrocycle_id
WHERE c.athlete_id IS NULL
  AND me.id = c.mesocycle_id;
