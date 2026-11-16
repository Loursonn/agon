-- Test à blanc : inscription sur invitation (migrations 20261116170000_signup_invitations, temps 1,
-- et 20261116200000_signup_lock, temps 2).
-- Base de TEST : supabase db query --linked -f supabase/tests/signup_invitations.sql
-- Tout est annulé (ROLLBACK). Comptes fictifs @example.invalid créés dans la transaction.
BEGIN;
DO $$
DECLARE
  coach uuid; plain_coach uuid; code text;
  u_coach uuid := gen_random_uuid(); u_other uuid := gen_random_uuid();
  u_ath uuid := gen_random_uuid(); u_staff uuid := gen_random_uuid();
  u_direct uuid := gen_random_uuid(); u_svc uuid := gen_random_uuid();
  inv record; tok text; n int; ok int := 0; m record; r text; rid uuid; staff_tok text; ath_of_coach uuid;
BEGIN
  SELECT id, coach_code INTO coach, code FROM profiles
   WHERE role IN ('coach', 'coach_athlete') AND coach_code IS NOT NULL AND NOT COALESCE(is_admin, false) ORDER BY id LIMIT 1;
  SELECT id INTO plain_coach FROM profiles
   WHERE role = 'coach' AND id <> coach AND NOT COALESCE(is_admin, false) ORDER BY id LIMIT 1;
  SELECT id INTO ath_of_coach FROM profiles WHERE coach_id = coach AND role = 'athlete' LIMIT 1;
  IF coach IS NULL OR plain_coach IS NULL OR ath_of_coach IS NULL THEN RAISE EXCEPTION 'données de test manquantes'; END IF;
  UPDATE profiles SET is_certified_coach = true WHERE id = coach;
  UPDATE profiles SET is_certified_coach = false WHERE id = plain_coach;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  SELECT '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated', x.email, '', now(),
         '{"provider":"email","providers":["email"]}', '{}', now(), now()
    FROM (VALUES (u_coach, 'nouveau-coach@example.invalid'), (u_other, 'intrus@example.invalid'),
                 (u_ath, 'nouvel-athlete@example.invalid'), (u_staff, 'nouveau-kine@example.invalid'),
                 (u_direct, 'direct@example.invalid'), (u_svc, 'par-service@example.invalid')) AS x(id, email);

  -- 1. Un coach non certifié n'invite pas.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', plain_coach, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.create_coach_invitation('x@example.invalid');
    RAISE EXCEPTION '1. coach non certifié a invité';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  ok := ok + 1;
  RESET ROLE;

  -- 2. Le coach certifié invite : e-mail normalisé, 7 jours, jeton long.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT * INTO inv FROM public.create_coach_invitation('  Nouveau-Coach@Example.invalid ');
  IF inv.email <> 'nouveau-coach@example.invalid' OR length(inv.token) < 32
     OR inv.expires_at < now() + interval '6 days 23 hours' OR inv.expires_at > now() + interval '7 days 1 minute' THEN
    RAISE EXCEPTION '2. invitation : %', row_to_json(inv); END IF;
  tok := inv.token;
  BEGIN
    PERFORM public.create_coach_invitation('pas-un-email');
    RAISE EXCEPTION '2. e-mail invalide accepté';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  -- Il lit ses invitations, n'en écrit pas à la main.
  SELECT count(*) INTO n FROM coach_invitations WHERE id = inv.id;
  IF n <> 1 THEN RAISE EXCEPTION '2. le coach ne lit pas son invitation'; END IF;
  BEGIN
    INSERT INTO coach_invitations (email, invited_by) VALUES ('y@example.invalid', coach);
    RAISE EXCEPTION '2. insertion directe acceptée';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  ok := ok + 1;
  RESET ROLE;

  -- 3. Page publique : l'état de l'invitation, rien d'autre ; jeton inconnu : rien.
  SET LOCAL ROLE anon;
  SELECT * INTO m FROM public.get_coach_invitation(tok);
  IF m.status <> 'valide' OR m.email <> 'nouveau-coach@example.invalid' THEN RAISE EXCEPTION '3. %', row_to_json(m); END IF;
  SELECT count(*) INTO n FROM public.get_coach_invitation(repeat('0', 64));
  IF n <> 0 THEN RAISE EXCEPTION '3. jeton inconnu renvoie une ligne'; END IF;
  ok := ok + 1;
  RESET ROLE;

  -- 4. Un autre e-mail ne se sert pas du lien.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.register_coach(tok, 'Intrus', '1990-01-01', false);
    RAISE EXCEPTION '4. intrus inscrit';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.register_coach(repeat('a', 64), 'Intrus', '1990-01-01', false);
    RAISE EXCEPTION '4. jeton inventé accepté';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  ok := ok + 1;
  RESET ROLE;

  -- 5. Le coach invité s'inscrit (coach qui s'entraîne aussi) : code coach tiré, invitation consommée.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_coach, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  r := public.register_coach(tok, '  Nouveau   Coach ', '1990-01-01', true);
  SELECT * INTO m FROM profiles WHERE id = u_coach;
  IF m.role <> 'coach_athlete' OR m.full_name <> 'Nouveau Coach' OR m.coach_code <> r OR m.coach_id <> u_coach
     OR m.is_certified_coach OR m.is_admin OR r !~ '^[A-Z2-9]{6}$' THEN RAISE EXCEPTION '5. profil : %', row_to_json(m); END IF;
  BEGIN
    PERFORM public.register_coach(tok, 'Encore', '1990-01-01', false);
    RAISE EXCEPTION '5. deuxième profil';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  ok := ok + 1;
  RESET ROLE;

  -- 6. Lien déjà servi : refusé, et vu comme « utilisée ».
  SELECT status INTO r FROM public.get_coach_invitation(tok);
  IF r <> 'utilisee' THEN RAISE EXCEPTION '6. état %', r; END IF;
  ok := ok + 1;

  -- 7. Révocation : par celui qui a invité ; une invitation révoquée ne sert plus.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT * INTO inv FROM public.create_coach_invitation('intrus@example.invalid');
  PERFORM public.revoke_coach_invitation(inv.id);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.register_coach(inv.token, 'Intrus', '1990-01-01', false);
    RAISE EXCEPTION '7. invitation révoquée acceptée';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.revoke_coach_invitation(inv.id);
    RAISE EXCEPTION '7. un tiers révoque';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  ok := ok + 1;
  RESET ROLE;

  -- 8. Invitation expirée : refusée.
  UPDATE coach_invitations SET revoked_at = NULL, expires_at = now() - interval '1 minute' WHERE id = inv.id;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.register_coach(inv.token, 'Intrus', '1990-01-01', false);
    RAISE EXCEPTION '8. invitation expirée acceptée';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  ok := ok + 1;

  -- 9. Athlète : code faux refusé ; bon code → profil rattaché au coach dans la même transaction.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_ath, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.register_athlete('ZZZZZZ', 'Athlète', '2000-01-01');
    RAISE EXCEPTION '9. code faux accepté';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  rid := public.register_athlete(lower(code), 'Nouvel Athlète', '2000-01-01');
  SELECT * INTO m FROM profiles WHERE id = u_ath;
  IF rid <> coach OR m.role <> 'athlete' OR m.coach_id <> coach THEN RAISE EXCEPTION '9. %', row_to_json(m); END IF;
  ok := ok + 1;
  RESET ROLE;

  -- 10. Staff : sans invitation refusé ; avec une invitation staff valide → profil staff.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO staff_invitations (athlete_id, profession, invited_by, invited_by_role)
  VALUES (ath_of_coach, 'kine', coach, 'coach') RETURNING token INTO staff_tok;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.register_staff(repeat('b', 64), 'Kiné', '1985-01-01', 'kine');
    RAISE EXCEPTION '10. staff sans invitation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM public.register_staff(staff_tok, 'Nouveau Kiné', '1985-01-01', 'kine');
  SELECT * INTO m FROM profiles WHERE id = u_staff;
  IF m.role <> 'staff' OR m.profession <> 'kine' THEN RAISE EXCEPTION '10. %', row_to_json(m); END IF;
  ok := ok + 1;
  RESET ROLE;

  -- 11. Droits : anon n'inscrit personne ; personne n'appelle les fonctions internes.
  IF has_function_privilege('anon', 'public.register_coach(text, text, date, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.create_coach_invitation(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._new_coach_code()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._signup_guard()', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.get_coach_invitation(text)', 'EXECUTE')
     OR has_table_privilege('anon', 'public.coach_invitations', 'SELECT') THEN
    RAISE EXCEPTION '11. droits inattendus'; END IF;
  ok := ok + 1;

  -- 12. Temps 2 : un compte connecté ne crée pas son profil à la main, quel que soit le rôle.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_direct, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO profiles (id, role, full_name, birth_date) VALUES (u_direct, 'coach', 'Coach Direct', '1990-01-01');
    RAISE EXCEPTION '12. profil coach créé sans invitation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO profiles (id, role, full_name, birth_date) VALUES (u_direct, 'athlete', 'Athlète Direct', '2000-01-01');
    RAISE EXCEPTION '12. profil athlète créé sans code';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  SELECT count(*) INTO n FROM profiles WHERE id = u_direct;
  IF n <> 0 THEN RAISE EXCEPTION '12. profil direct présent'; END IF;
  ok := ok + 1;

  -- 13. Le serveur (service_role, Edge Functions : pas d'utilisateur) crée toujours un profil.
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO profiles (id, role, full_name, birth_date) VALUES (u_svc, 'athlete', 'Par Service', '2000-01-01');
  SELECT count(*) INTO n FROM profiles WHERE id = u_svc;
  IF n <> 1 THEN RAISE EXCEPTION '13. insertion serveur refusée'; END IF;
  ok := ok + 1;

  RAISE NOTICE 'signup_invitations : % / 13', ok;
  IF ok <> 13 THEN RAISE EXCEPTION 'signup_invitations : % / 13', ok; END IF;
END $$;
ROLLBACK;
