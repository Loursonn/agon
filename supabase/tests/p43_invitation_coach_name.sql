-- Tests de invitation_coach_name (migration 20261113170000).
-- Jeu de test : coach « Agon Démo » ; deux invitations créées puis annulées.
BEGIN;
INSERT INTO public.invitations (coach_id, token, used_at)
SELECT id, 'p43-test-ok', NULL FROM public.profiles WHERE full_name = 'Agon Démo' AND role IN ('coach','coach_athlete') LIMIT 1;
INSERT INTO public.invitations (coach_id, token, used_at)
SELECT id, 'p43-test-used', now() FROM public.profiles WHERE full_name = 'Agon Démo' AND role IN ('coach','coach_athlete') LIMIT 1;
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF public.invitation_coach_name('p43-test-ok') IS DISTINCT FROM 'Agon Démo' THEN
    RAISE EXCEPTION '01 lien valable : % au lieu de Agon Démo', public.invitation_coach_name('p43-test-ok');
  END IF;
  IF public.invitation_coach_name('p43-test-used') IS NOT NULL THEN
    RAISE EXCEPTION '02 lien déjà utilisé doit renvoyer NULL';
  END IF;
  IF public.invitation_coach_name('inconnu') IS NOT NULL OR public.invitation_coach_name(NULL) IS NOT NULL THEN
    RAISE EXCEPTION '03 lien inconnu doit renvoyer NULL';
  END IF;
  RAISE NOTICE 'p43_invitation_coach_name : 3 / 3';
END $$;
ROLLBACK;
