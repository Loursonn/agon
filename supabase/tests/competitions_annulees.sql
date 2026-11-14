-- Tests de 20261115120000_competitions_annulees.sql. Toujours annulé, données fictives.
-- Avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261115120000_competitions_annulees.sql; \
--    sed -e '/^BEGIN;$/d' supabase/tests/competitions_annulees.sql) > "$TMPDIR/compannul.sql"
--   supabase db query --linked -f "$TMPDIR/compannul.sql"
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
  NULL::uuid AS comp_coach, NULL::uuid AS comp_athlete
FROM profiles a WHERE a.full_name = 'Léa Démo' AND a.coach_id IS NOT NULL LIMIT 1;
GRANT ALL ON t_ids TO anon, authenticated;

INSERT INTO t_res (name, ok, detail) SELECT '00 jeu de test', athlete IS NOT NULL AND other_coach IS NOT NULL, NULL FROM t_ids;

INSERT INTO t_res (name, ok, detail)
SELECT '01 anciennes compétitions : aucune annulée', count(*) FILTER (WHERE cancelled_at IS NOT NULL OR cancelled_by IS NOT NULL) = 0, count(*)::text
  FROM competitions;

-- Coach référent : crée puis annule
SELECT set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;

WITH c AS (
  INSERT INTO competitions (coach_id, athlete_id, name, type, date, priority)
  SELECT coach, athlete, 'Annul test coach', 'competition', '2001-03-10', 'A' FROM t_ids RETURNING id
) UPDATE t_ids SET comp_coach = (SELECT id FROM c);

UPDATE competitions SET cancelled_at = '1999-01-01' WHERE id = (SELECT comp_coach FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT '02 coach annule : date serveur, auteur = coach',
       c.cancelled_at > now() - interval '1 minute' AND c.cancelled_by = t.coach, c.cancelled_at::text
  FROM competitions c, t_ids t WHERE c.id = t.comp_coach;

-- Une seconde annulation ne change ni la date ni l'auteur
UPDATE competitions SET cancelled_at = now() + interval '1 day', cancelled_by = (SELECT other_coach FROM t_ids)
 WHERE id = (SELECT comp_coach FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT '03 déjà annulée : auteur et date gardés', c.cancelled_by = t.coach AND c.cancelled_at <= now(), c.cancelled_by::text
  FROM competitions c, t_ids t WHERE c.id = t.comp_coach;

-- Athlète : rétablit la compétition du coach, crée la sienne et l'annule
SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;

UPDATE competitions SET cancelled_at = NULL WHERE id = (SELECT comp_coach FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT '04 athlète rétablit : date et auteur effacés', c.cancelled_at IS NULL AND c.cancelled_by IS NULL, NULL
  FROM competitions c, t_ids t WHERE c.id = t.comp_coach;

WITH c AS (
  INSERT INTO competitions (coach_id, athlete_id, name, type, date, priority, cancelled_by)
  SELECT coach, athlete, 'Annul test athlète', 'competition', '2001-03-11', 'C', coach FROM t_ids RETURNING id
) UPDATE t_ids SET comp_athlete = (SELECT id FROM c);
INSERT INTO t_res (name, ok, detail)
SELECT '05 création : auteur forcé à null sans annulation', c.cancelled_by IS NULL, c.cancelled_by::text
  FROM competitions c, t_ids t WHERE c.id = t.comp_athlete;

UPDATE competitions SET cancelled_at = now() WHERE id = (SELECT comp_athlete FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT '06 athlète annule : auteur = athlète', c.cancelled_by = t.athlete, c.cancelled_by::text
  FROM competitions c, t_ids t WHERE c.id = t.comp_athlete;

-- Autre coach : ne voit rien, ne peut ni annuler ni supprimer
SELECT set_config('request.jwt.claims', json_build_object('sub', other_coach, 'role', 'authenticated')::text, true) FROM t_ids;
WITH u AS (UPDATE competitions SET cancelled_at = NULL WHERE id = (SELECT comp_athlete FROM t_ids) RETURNING 1)
INSERT INTO t_res (name, ok, detail) SELECT '07 autre coach ne rétablit pas', count(*) = 0, count(*)::text FROM u;
WITH d AS (DELETE FROM competitions WHERE id IN (SELECT comp_coach FROM t_ids UNION SELECT comp_athlete FROM t_ids) RETURNING 1)
INSERT INTO t_res (name, ok, detail) SELECT '08 autre coach ne supprime pas', count(*) = 0, count(*)::text FROM d;

-- Anonyme : rien
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE anon;
INSERT INTO t_res (name, ok, detail)
SELECT '09 anon ne voit rien', count(*) = 0, count(*)::text FROM competitions WHERE name LIKE 'Annul test%';

-- Athlète supprime la sienne (annulée), coach supprime la sienne
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
WITH d AS (DELETE FROM competitions WHERE id = (SELECT comp_athlete FROM t_ids) RETURNING 1)
INSERT INTO t_res (name, ok, detail) SELECT '10 athlète supprime une compétition annulée', count(*) = 1, count(*)::text FROM d;

SELECT set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true) FROM t_ids;
WITH d AS (DELETE FROM competitions WHERE id = (SELECT comp_coach FROM t_ids) RETURNING 1)
INSERT INTO t_res (name, ok, detail) SELECT '11 coach supprime', count(*) = 1, count(*)::text FROM d;

RESET ROLE;
SELECT n, name, ok, detail FROM t_res ORDER BY n;

ROLLBACK;
