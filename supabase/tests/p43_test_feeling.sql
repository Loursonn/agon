-- Tests de 20261113140000_p43_test_feeling.sql. Toujours annulé, données fictives (année 2001).
-- Avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261113140000_p43_test_feeling.sql; \
--    sed -e '/^BEGIN;$/d' supabase/tests/p43_test_feeling.sql) > "$TMPDIR/p43tf.sql"
--   supabase db query --linked -f "$TMPDIR/p43tf.sql"
BEGIN;

CREATE TEMP TABLE t_res (n serial, name text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t_res TO anon, authenticated;
GRANT ALL ON SEQUENCE t_res_n_seq TO anon, authenticated;

CREATE TEMP TABLE t_ids ON COMMIT DROP AS
SELECT a.id AS athlete, a.coach_id AS coach,
  (SELECT c.id FROM profiles c
    WHERE c.role IN ('coach', 'coach_athlete') AND c.id <> a.coach_id
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = a.id AND cc.co_coach_id = c.id)
      AND NOT coalesce(c.is_admin, false)
    ORDER BY c.created_at LIMIT 1) AS other_coach,
  (SELECT d.id FROM test_definitions d WHERE d.is_global AND d.name = 'Squat Jump' LIMIT 1) AS def,
  NULL::uuid AS sess
FROM profiles a WHERE a.full_name = 'Léa Démo' AND a.coach_id IS NOT NULL LIMIT 1;
GRANT SELECT, UPDATE ON t_ids TO anon, authenticated;

WITH s AS (
  INSERT INTO test_sessions (athlete_id, coach_id, title, type, date)
  SELECT athlete, coach, 'Squat Jump', 'puissance', '2001-03-08' FROM t_ids RETURNING id)
UPDATE t_ids SET sess = (SELECT id FROM s);

INSERT INTO t_res (name, ok, detail) SELECT '00 jeu de test', athlete IS NOT NULL AND def IS NOT NULL AND sess IS NOT NULL AND other_coach IS NOT NULL, NULL FROM t_ids;

SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;

UPDATE test_sessions SET completed = true, results_note = 'Hauteur: 38 cm',
  results_structured = '{"variables":{"hauteur":38},"feeling":4,"comment":"  Bonnes jambes  "}'::jsonb
 WHERE id = (SELECT sess FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT '01 athlète : ressenti et mot recopiés', r.feeling = 4 AND r.comment = 'Bonnes jambes', r.feeling || ' / ' || coalesce(r.comment, '∅')
  FROM athlete_test_results r JOIN t_ids ON r.athlete_id = t_ids.athlete AND r.test_definition_id = t_ids.def
 WHERE r.performed_at = '2001-03-08';

-- Date corrigée : un seul résultat, au nouveau jour.
UPDATE test_sessions SET date = '2001-03-07' WHERE id = (SELECT sess FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT '02 date corrigée : résultat déplacé', count(*) = 1 AND min(r.performed_at) = '2001-03-07', count(*)::text
  FROM athlete_test_results r JOIN t_ids ON r.athlete_id = t_ids.athlete AND r.test_definition_id = t_ids.def
 WHERE r.performed_at BETWEEN '2001-03-01' AND '2001-03-31';

-- Ressenti hors échelle ignoré, commentaire vide → null.
UPDATE test_sessions SET results_structured = '{"variables":{"hauteur":39},"feeling":9,"comment":"   "}'::jsonb
 WHERE id = (SELECT sess FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT '03 ressenti 9 ignoré, mot vide → null', r.feeling IS NULL AND r.comment IS NULL, NULL
  FROM athlete_test_results r JOIN t_ids ON r.athlete_id = t_ids.athlete AND r.test_definition_id = t_ids.def
 WHERE r.performed_at = '2001-03-07';

-- Le coach lit ; l'autre coach non.
SELECT set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true) FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT '04 coach lit le résultat', count(*) = 1, count(*)::text
  FROM athlete_test_results r JOIN t_ids ON r.athlete_id = t_ids.athlete AND r.test_definition_id = t_ids.def
 WHERE r.performed_at = '2001-03-07';
SELECT set_config('request.jwt.claims', json_build_object('sub', other_coach, 'role', 'authenticated')::text, true) FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT '05 autre coach ne lit rien', count(*) = 0, count(*)::text
  FROM athlete_test_results r JOIN t_ids ON r.athlete_id = t_ids.athlete AND r.test_definition_id = t_ids.def
 WHERE r.performed_at = '2001-03-07';

RESET ROLE;
SELECT name, ok, detail FROM t_res ORDER BY n;
ROLLBACK;
