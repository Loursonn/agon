-- Jeu de données FICTIF pour les tests SQL en CI (base éphémère, jamais la prod).
-- Les scripts de supabase/tests/ choisissent « un athlète avec coach », « un autre coach »,
-- « un co-coach », etc. dans la base : ce fichier fournit ces rôles avec des uuid fixes
-- et des e-mails @example.invalid. Aucune donnée réelle.
--
--   coach A    …0c01  coach « Agon Démo » → athlètes a1, a2
--   coach B    …0c02  coach        → athlètes a3, a5
--   coach C    …0c03  coach_athlete → athlète a4
--   coach D    …0c04  coach        co-coach de a4 ; aucun athlète référent (seul l'admin, coach-athlète, le suit)
--   admin      …0a00  coach_athlete, is_admin, suivi par D. C'est le coach-athlète que choisit
--                     co_coach_self_rls (« suivi par un autre coach » d'abord) : il doit être admin,
--                     comme en prod, car le script rétablit son coach_id en postgres avec son jwt.
--                     Créé après A, B et C : co_coach_rls prend B et C comme coachs tiers.
--
--   a1 …0a01 « Léa Démo » : le plus ancien athlète et le plus petit id. Sans co-coach
--      (weight_set_goal, co_coach_rls en ajoutent un). Porte tout ce que les scripts cherchent :
--      app_data asp:wh / asp:wlog / asp:bw / asp:blockHistory / asp:prog (2 séances),
--      workout_logs, medical_entries, consentement garmin_sync.
--   a2 …0a02 : même coach que a1 (« autre athlète du coach »), asp:wh / asp:wlog
--   a3 …0a03, a4 …0a04 : athlètes d'autres coachs (servent de « pro » dans les tests staff)
--   a4 est co-coaché par D, avec des saisies wellness (co-coach « avec des saisies » de sante_tables).
--   Le lien relie C et D seulement : B et C, coachs tiers de co_coach_rls, ne doivent pas être partenaires.
--   a5 …0a05 : athlète de B
--
-- L'ordre physique compte (plusieurs scripts font LIMIT 1 sans ORDER BY) : l'admin est
-- inséré en dernier.
--
-- Les tables santé (wellness_entries, body_weight_*) ne sont jamais remplies à la main :
-- elles sont produites par les triggers health_sync_* à partir de app_data, comme en prod.

SET session_replication_role = replica;  -- comptes bruts : pas de triggers (âge, coach_id, consentements)

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
       u.email, '', now(), '{"provider":"email","providers":["email"]}', '{}',
       now() - (u.n || ' days')::interval, now()
FROM (VALUES
  (2, '00000000-0000-4000-a000-000000000c01'::uuid, 'coach-a@example.invalid'),
  (3, '00000000-0000-4000-a000-000000000c02'::uuid, 'coach-b@example.invalid'),
  (4, '00000000-0000-4000-a000-000000000c03'::uuid, 'coach-c@example.invalid'),
  (5, '00000000-0000-4000-a000-000000000c04'::uuid, 'coach-d@example.invalid'),
  (6, '00000000-0000-4000-a000-000000000a01'::uuid, 'athlete-1@example.invalid'),
  (7, '00000000-0000-4000-a000-000000000a02'::uuid, 'athlete-2@example.invalid'),
  (8, '00000000-0000-4000-a000-000000000a03'::uuid, 'athlete-3@example.invalid'),
  (9, '00000000-0000-4000-a000-000000000a04'::uuid, 'athlete-4@example.invalid'),
  (10, '00000000-0000-4000-a000-000000000a05'::uuid, 'athlete-5@example.invalid'),
  (65, '00000000-0000-4000-a000-000000000a00'::uuid, 'admin@example.invalid')
) AS u(n, id, email);

INSERT INTO public.profiles (id, role, full_name, first_name, last_name, coach_id, coach_code, is_admin,
                             birth_date, gender, age, height_cm, weight_kg, habit_tracker_enabled, created_at)
VALUES
  ('00000000-0000-4000-a000-000000000c01', 'coach', 'Agon Démo', 'Agon', 'Démo', NULL, 'COACHA', false,
   '1990-01-01', 'male', 36, 180, 80, false, now() - interval '90 days'),
  ('00000000-0000-4000-a000-000000000c02', 'coach', 'Coach B', 'Coach', 'B', NULL, 'COACHB', false,
   '1990-01-01', 'female', 36, 170, 65, false, now() - interval '80 days'),
  ('00000000-0000-4000-a000-000000000c03', 'coach_athlete', 'Coach C', 'Coach', 'C', NULL, 'COACHC', false,
   '1990-01-01', 'male', 36, 175, 75, false, now() - interval '70 days'),
  ('00000000-0000-4000-a000-000000000c04', 'coach', 'Coach D', 'Coach', 'D', NULL, 'COACHD', false,
   '1990-01-01', 'female', 36, 165, 60, false, now() - interval '60 days'),
  ('00000000-0000-4000-a000-000000000a01', 'athlete', 'Léa Démo', 'Léa', 'Démo',
   '00000000-0000-4000-a000-000000000c01', NULL, false, '2000-01-01', 'female', 26, 168, 62, true, now() - interval '50 days'),
  ('00000000-0000-4000-a000-000000000a02', 'athlete', 'Athlète Deux', 'Athlète', 'Deux',
   '00000000-0000-4000-a000-000000000c01', NULL, false, '2000-01-01', 'male', 26, 182, 78, false, now() - interval '40 days'),
  ('00000000-0000-4000-a000-000000000a03', 'athlete', 'Athlète Trois', 'Athlète', 'Trois',
   '00000000-0000-4000-a000-000000000c02', NULL, false, '2000-01-01', 'female', 26, 160, 55, false, now() - interval '30 days'),
  ('00000000-0000-4000-a000-000000000a04', 'athlete', 'Athlète Quatre', 'Athlète', 'Quatre',
   '00000000-0000-4000-a000-000000000c03', NULL, false, '2000-01-01', 'male', 26, 178, 74, false, now() - interval '20 days'),
  ('00000000-0000-4000-a000-000000000a05', 'athlete', 'Athlète Cinq', 'Athlète', 'Cinq',
   '00000000-0000-4000-a000-000000000c02', NULL, false, '2000-01-01', 'male', 26, 185, 85, false, now() - interval '10 days'),
  ('00000000-0000-4000-a000-000000000a00', 'coach_athlete', 'Admin Test', 'Admin', 'Test',
   '00000000-0000-4000-a000-000000000c04', 'ADMTST', true,
   '1990-01-01', 'male', 36, 180, 80, false, now() - interval '65 days');

SET session_replication_role = origin;  -- données : triggers actifs (synchro santé), auth.uid() nul

INSERT INTO public.athlete_co_coaches (athlete_id, co_coach_id, added_by, added_by_role) VALUES
  ('00000000-0000-4000-a000-000000000a04', '00000000-0000-4000-a000-000000000c04', '00000000-0000-4000-a000-000000000c03', 'coach');

INSERT INTO public.medical_entries (athlete_id, kind, title, zone, date, status, created_by, declared_by) VALUES
  ('00000000-0000-4000-a000-000000000a01', 'blessure', 'Entorse (test)', 'cheville', current_date - 60, 'gueri',
   '00000000-0000-4000-a000-000000000c01', 'coach');

INSERT INTO public.user_consents (user_id, purpose, granted, doc_version, statement) VALUES
  ('00000000-0000-4000-a000-000000000a01', 'garmin_sync', true, 'ci', 'Consentement fictif (CI)');

INSERT INTO public.workout_logs (athlete_id, coach_id, session_id, session_name, scheduled_date, status, completed_at, duration_s) VALUES
  ('00000000-0000-4000-a000-000000000a01', '00000000-0000-4000-a000-000000000c01',
   '00000000-0000-4000-b000-000000000001', 'Force A', current_date - 3, 'completed', now() - interval '3 days', 3600);

-- Wellness courant (asp:wh, clés « YYYYMMDD ») : 5 notes à 3 → score 60, comme le calcule l'app.
INSERT INTO public.app_data (athlete_id, key, value)
SELECT a.id, 'asp:wh', jsonb_object_agg(to_char(current_date - d, 'YYYYMMDD'),
         jsonb_build_object('date', to_char(current_date - d, 'YYYYMMDD'),
                            'fatigue', 3, 'sommeil', 3, 'stress', 3, 'energie', 3, 'doms', 2 + (d % 2), 'score', (14 + (d % 2)) * 4)
         || CASE WHEN d = 1 THEN '{"poids": 62.4, "coucher": {"h": 23, "m": 0}, "reveil": {"h": 7, "m": 0}, "injComment": "Mollet (test)"}'::jsonb
                 ELSE '{}'::jsonb END)
FROM (VALUES ('00000000-0000-4000-a000-000000000a01'::uuid), ('00000000-0000-4000-a000-000000000a04'::uuid)) a(id),
     generate_series(1, 5) d
GROUP BY a.id;

INSERT INTO public.app_data (athlete_id, key, value) VALUES
  ('00000000-0000-4000-a000-000000000a02', 'asp:wh', '{}'),
  ('00000000-0000-4000-a000-000000000a02', 'asp:wlog', '{}');

-- Pesées, objectif, bloc archivé et programme de a1.
INSERT INTO public.app_data (athlete_id, key, value)
SELECT '00000000-0000-4000-a000-000000000a01', 'asp:wlog',
       jsonb_object_agg(to_char(current_date - d, 'YYYYMMDD'), 62 + d / 10.0)
FROM generate_series(1, 3) d;

INSERT INTO public.app_data (athlete_id, key, value) VALUES
  ('00000000-0000-4000-a000-000000000a01', 'asp:bw', '{"current": 62, "target": 0}');

INSERT INTO public.app_data (athlete_id, key, value)
SELECT '00000000-0000-4000-a000-000000000a01', 'asp:blockHistory',
       jsonb_build_array(jsonb_build_object('name', 'Bloc test', 'wellnessHistory',
         jsonb_object_agg(to_char(current_date - d, 'YYYYMMDD'),
           jsonb_build_object('fatigue', 4, 'sommeil', 4, 'stress', 4, 'energie', 4, 'doms', 4, 'score', 80))))
FROM generate_series(40, 42) d;

INSERT INTO public.app_data (athlete_id, key, value) VALUES
  ('00000000-0000-4000-a000-000000000a01', 'asp:prog', '[
    {"id": "00000000-0000-4000-b000-000000000001", "name": "Force A", "short": "FA", "day_of_week": 1,
     "recurrence": "weekly", "multi_semaine": false, "blocs": []},
    {"id": "00000000-0000-4000-b000-000000000002", "name": "Force B", "short": "FB", "day_of_week": 4,
     "recurrence": "weekly", "multi_semaine": false, "blocs": []}
  ]');
