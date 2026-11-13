-- Bucket `test-media` privé (migrations 20261113190000 / 20261113190100).
-- Toujours annulé (ROLLBACK final) : rien ne reste en base.
--   supabase db query --linked -f supabase/tests/test_media_storage.sql
-- Chaque ligne k → v : la valeur attendue est dans le libellé. Aucune donnée
-- personnelle n'est affichée (comptes et booléens seulement).

BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated, anon; GRANT ALL ON SEQUENCE r_n_seq TO authenticated, anon;

-- Un athlète suivi, son coach, et un autre coach.
CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT a.id AS athlete, a.coach_id AS coach,
  (SELECT p.id FROM profiles p
    WHERE p.role IN ('coach','coach_athlete') AND p.id <> a.coach_id AND p.id <> a.id
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches c WHERE c.athlete_id = a.id AND c.co_coach_id = p.id)
    ORDER BY p.created_at LIMIT 1) AS other_coach
FROM profiles a
WHERE a.coach_id IS NOT NULL AND a.coach_id <> a.id
ORDER BY a.created_at LIMIT 1;
GRANT SELECT ON ids TO authenticated, anon;
-- Photo fictive (annulée avec la transaction) : le test ne dépend d'aucun fichier réel.
INSERT INTO storage.objects(bucket_id, name)
SELECT 'test-media', athlete::text || '/mensurations/test-fixture/face.jpg' FROM ids;
INSERT INTO r(k,v) SELECT '00 jeu de test (true)', (athlete IS NOT NULL AND coach IS NOT NULL AND other_coach IS NOT NULL)::text FROM ids;
INSERT INTO r(k,v) SELECT '01 bucket test-media public (false)', public::text FROM storage.buckets WHERE id = 'test-media';

-- Anonyme : rien.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$ BEGIN
  INSERT INTO r(k,v) SELECT 'A1 anonyme : fichiers lisibles (0)', count(*)::text FROM storage.objects WHERE bucket_id = 'test-media';
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO r(k,v) VALUES ('A1 anonyme : fichiers lisibles (0)', '0 (refusé)'); END $$;
DO $$ BEGIN
  INSERT INTO storage.objects(bucket_id, name) VALUES ('test-media', (SELECT athlete FROM ids)::text || '/mensurations/anon.jpg');
  INSERT INTO r(k,v) VALUES ('A2 anonyme : dépôt (refusé)', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A2 anonyme : dépôt (refusé)', 'refusé'); END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;

-- Autre coach : rien.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', other_coach, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'B1 autre coach : photos de l''athlète lisibles (0)', count(*)::text
  FROM storage.objects WHERE bucket_id = 'test-media' AND name LIKE (SELECT athlete FROM ids)::text || '/%';
DO $$ BEGIN
  INSERT INTO storage.objects(bucket_id, name) VALUES ('test-media', (SELECT athlete FROM ids)::text || '/mensurations/intrus.jpg');
  INSERT INTO r(k,v) VALUES ('B2 autre coach : dépôt dans le dossier de l''athlète (refusé)', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('B2 autre coach : dépôt dans le dossier de l''athlète (refusé)', 'refusé'); END $$;
-- Suppression : passe par l'API Storage (suppression SQL directe interdite par Supabase), non testable ici.

-- Athlète propriétaire : ses photos.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'C1 athlète : ses photos lisibles (> 0 : true)', (count(*) > 0)::text
  FROM storage.objects WHERE bucket_id = 'test-media' AND name LIKE (SELECT athlete FROM ids)::text || '/mensurations/%';
DO $$ BEGIN
  INSERT INTO storage.objects(bucket_id, name) VALUES ('test-media', (SELECT athlete FROM ids)::text || '/mensurations/test-athlete.jpg');
  INSERT INTO r(k,v) VALUES ('C2 athlète : dépôt dans son dossier (accepté)', 'accepté');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('C2 athlète : dépôt dans son dossier (accepté)', 'REFUSÉ (KO) ' || SQLERRM); END $$;

-- Son coach : lecture et écriture.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'D1 coach : photos de son athlète lisibles (> 0 : true)', (count(*) > 0)::text
  FROM storage.objects WHERE bucket_id = 'test-media' AND name LIKE (SELECT athlete FROM ids)::text || '/mensurations/%';
DO $$ BEGIN
  INSERT INTO storage.objects(bucket_id, name) VALUES ('test-media', (SELECT athlete FROM ids)::text || '/mensurations/test-coach.jpg');
  INSERT INTO r(k,v) VALUES ('D2 coach : dépôt dans le dossier de son athlète (accepté)', 'accepté');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('D2 coach : dépôt dans le dossier de son athlète (accepté)', 'REFUSÉ (KO) ' || SQLERRM); END $$;
WITH u AS (UPDATE storage.objects SET metadata = coalesce(metadata, '{}'::jsonb)
            WHERE bucket_id = 'test-media' AND name = (SELECT athlete FROM ids)::text || '/mensurations/test-coach.jpg' RETURNING 1)
INSERT INTO r(k,v) SELECT 'D3 coach : remplacement (1)', count(*)::text FROM u;

RESET ROLE;
SELECT k, v FROM r ORDER BY n;
ROLLBACK;
