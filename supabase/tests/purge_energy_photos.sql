-- Tests de 20261113200000_purge_energy_photos.sql : à la suppression d'un compte, ses illustrations
-- de séances sont purgées, sauf celles qu'une séance survivante utilise encore. Toujours annulé.
-- Fichiers et séances fictifs (aucun fichier réel : seules des lignes de storage.objects, annulées).
BEGIN;

SELECT set_config('request.jwt.claims', '', true);
CREATE TEMP TABLE t_res (n serial, name text, ok boolean, detail text) ON COMMIT DROP;
CREATE TEMP TABLE t_ids ON COMMIT DROP AS SELECT gen_random_uuid() AS c, gen_random_uuid() AS a;

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u || '@example.invalid', '', '{}', '{}', now(), now()
  FROM t_ids, unnest(ARRAY[c, a]) u;
INSERT INTO profiles (id, role, full_name, birth_date)
SELECT c, 'coach', 'Coach test', '1990-01-01'::date FROM t_ids
UNION ALL SELECT a, 'athlete', 'Athlète test', '2000-01-01'::date FROM t_ids;

INSERT INTO storage.objects (bucket_id, name)
SELECT 'energy-exercise-photos', c || '/sessions/' || f FROM t_ids, unnest(ARRAY['orpheline.jpg', 'bibliotheque.jpg', 'perso.jpg']) f
UNION ALL SELECT 'energy-exercise-photos', a || '/sessions/athlete.jpg' FROM t_ids
UNION ALL SELECT 'energy-exercise-photos', gen_random_uuid() || '/sessions/autre.jpg';

-- Séance de bibliothèque du coach (survit, created_by → NULL) et séance propre à l'athlète a (part avec lui).
INSERT INTO energy_sessions (name, session_kind, structure_type, created_by, athlete_id, images)
SELECT 'Séance bibliothèque (test)', 'specifique', 'continu', c, NULL,
       jsonb_build_array(jsonb_build_object('url', 'https://x/storage/v1/object/public/energy-exercise-photos/' || c || '/sessions/bibliotheque.jpg'))
  FROM t_ids
UNION ALL
SELECT 'Séance perso (test)', 'specifique', 'continu', c, a,
       jsonb_build_array(jsonb_build_object('url', 'https://x/storage/v1/object/public/energy-exercise-photos/' || c || '/sessions/perso.jpg'),
                         jsonb_build_object('url', 'https://x/storage/v1/object/public/energy-exercise-photos/' || a || '/sessions/athlete.jpg'))
  FROM t_ids;

CREATE TEMP TABLE t_coach ON COMMIT DROP AS
SELECT object_name FROM t_ids, list_user_storage_objects(c) WHERE bucket_id = 'energy-exercise-photos';
CREATE TEMP TABLE t_ath ON COMMIT DROP AS
SELECT object_name FROM t_ids, list_user_storage_objects(a) WHERE bucket_id = 'energy-exercise-photos';

INSERT INTO t_res (name, ok, detail)
SELECT 'P1 coach : image orpheline purgée', EXISTS (SELECT 1 FROM t_coach WHERE object_name LIKE '%/orpheline.jpg'), (SELECT string_agg(object_name, ', ') FROM t_coach)
UNION ALL SELECT 'P2 coach : image d''une séance de bibliothèque gardée', NOT EXISTS (SELECT 1 FROM t_coach WHERE object_name LIKE '%/bibliotheque.jpg'), ''
UNION ALL SELECT 'P3 coach : image d''une séance d''athlète (qui survit au coach) gardée', NOT EXISTS (SELECT 1 FROM t_coach WHERE object_name LIKE '%/perso.jpg'), ''
UNION ALL SELECT 'P4 athlète : son image, utilisée seulement par sa séance (qui part avec lui), purgée', EXISTS (SELECT 1 FROM t_ath WHERE object_name LIKE '%/athlete.jpg'), (SELECT string_agg(object_name, ', ') FROM t_ath)
UNION ALL SELECT 'P5 rien hors du dossier de l''utilisateur', NOT EXISTS (SELECT 1 FROM t_coach WHERE object_name LIKE '%/autre.jpg') AND NOT EXISTS (SELECT 1 FROM t_ath WHERE object_name LIKE '%/autre.jpg'), ''
UNION ALL SELECT 'Z1 droits : réservé au service_role',
  NOT has_function_privilege('authenticated', 'public.list_user_storage_objects(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.list_user_storage_objects(uuid)', 'EXECUTE'), '';

SELECT n, ok, name, detail FROM t_res ORDER BY ok, n;
ROLLBACK;
