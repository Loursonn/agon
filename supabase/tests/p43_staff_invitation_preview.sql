-- Tests de get_staff_invitation avec droits et échéance (migration 20261113200000).
-- Jeu de test : coach « Agon Démo » invite un kiné pour « Léa Démo ». Toujours annulé.
BEGIN;
SELECT set_config('p43.athlete', (SELECT id::text FROM public.profiles WHERE full_name = 'Léa Démo' AND role = 'athlete' LIMIT 1), true);
SELECT set_config('p43.coach', (SELECT coach_id::text FROM public.profiles WHERE id::text = current_setting('p43.athlete') LIMIT 1), true);
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('p43.coach'), 'role', 'authenticated')::text, true);
INSERT INTO public.staff_invitations(athlete_id, profession, permissions, invited_by, invited_by_role)
SELECT current_setting('p43.athlete')::uuid, 'kine', '{"medical":"write","seances":"read"}', current_setting('p43.coach')::uuid, 'coach';
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('p43.tok', (SELECT token FROM public.staff_invitations
  WHERE athlete_id = current_setting('p43.athlete')::uuid AND profession = 'kine' ORDER BY created_at DESC LIMIT 1), true);
SET LOCAL ROLE anon;
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.get_staff_invitation(current_setting('p43.tok'));
  IF r IS NULL OR r.athlete_name IS DISTINCT FROM 'Léa Démo' THEN RAISE EXCEPTION '01 aperçu par jeton : %', r; END IF;
  IF r.status IS DISTINCT FROM 'valid' THEN RAISE EXCEPTION '02 statut : %', r.status; END IF;
  IF (r.permissions ->> 'medical') IS DISTINCT FROM 'write' OR (r.permissions ->> 'seances') IS DISTINCT FROM 'read' THEN
    RAISE EXCEPTION '03 droits de l''invitation : %', r.permissions;
  END IF;
  IF r.expires_at IS NULL OR r.expires_at <= now() THEN RAISE EXCEPTION '04 échéance : %', r.expires_at; END IF;
  IF EXISTS (SELECT 1 FROM public.get_staff_invitation('jeton-inconnu')) THEN RAISE EXCEPTION '05 jeton inconnu doit être vide'; END IF;
  RAISE NOTICE 'p43_staff_invitation_preview : 5 / 5';
END $$;
ROLLBACK;
