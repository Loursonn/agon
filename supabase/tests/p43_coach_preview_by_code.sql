-- Tests de coach_preview_by_code (migration 20261113160000).
-- Jeu de test : coach « Agon Démo » (code DEMO42 en prod, COACHA en CI).
BEGIN;
SELECT set_config('p43.code', (SELECT coach_code FROM public.profiles WHERE full_name = 'Agon Démo' AND role IN ('coach','coach_athlete') LIMIT 1), true);
SET LOCAL ROLE anon;
DO $$
DECLARE c text := current_setting('p43.code');
BEGIN
  IF c IS NULL OR c = '' THEN RAISE EXCEPTION '00 jeu de test : coach Agon Démo introuvable'; END IF;
  IF public.coach_preview_by_code(lower(c)) IS DISTINCT FROM 'Agon Démo' THEN
    RAISE EXCEPTION '01 code en minuscules : %', public.coach_preview_by_code(lower(c));
  END IF;
  IF public.coach_preview_by_code(' ' || c || ' ') IS DISTINCT FROM 'Agon Démo' THEN
    RAISE EXCEPTION '02 espaces autour du code';
  END IF;
  IF public.coach_preview_by_code('ZZZZZQ') IS NOT NULL THEN
    RAISE EXCEPTION '03 code inconnu doit renvoyer NULL';
  END IF;
  IF public.coach_preview_by_code(left(c, 5)) IS NOT NULL OR public.coach_preview_by_code(NULL) IS NOT NULL THEN
    RAISE EXCEPTION '04 code incomplet doit renvoyer NULL';
  END IF;
  RAISE NOTICE 'p43_coach_preview_by_code : 4 / 4';
END $$;
ROLLBACK;
