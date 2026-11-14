-- Tests : wellness copié de la planche (migration 20261113090000_wellness_planche).
-- Toujours annulé. Avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261113090000_wellness_planche.sql \
--      supabase/tests/wellness_planche.sql) > "$TMPDIR/w.sql" && supabase db query --linked -f "$TMPDIR/w.sql"
-- Compte de démonstration seulement (Léa Démo) ; résultats = booléens.
BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;
CREATE TEMP TABLE ids ON COMMIT DROP AS SELECT id AS ath FROM profiles WHERE full_name = 'Léa Démo' LIMIT 1;
GRANT SELECT ON ids TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', ath, 'role', 'authenticated')::text FROM ids), true);
SELECT wellness_set_day(ath, DATE '2026-11-11', jsonb_build_object(
  'fatigue', 4, 'sommeil', 4, 'stress', 3, 'energie', 4, 'doms', 3, 'envie', 5,
  'pain', 2, 'sick', false, 'domsLevels', jsonb_build_object('ischios', 2, 'fessiers', 1, 'faux', 7),
  'domsZones', jsonb_build_array('ischios', 'fessiers'), 'domsPoints', '[]'::jsonb)) FROM ids;
RESET ROLE;

INSERT INTO r(k,v) SELECT 'A1 envie lue (true)', (w.envie = 5)::text FROM wellness_entries w, ids WHERE w.athlete_id = ids.ath AND w.day = '2026-11-11';
INSERT INTO r(k,v) SELECT 'A2 douleur lue (true)', (w.pain = 2)::text FROM wellness_entries w, ids WHERE w.athlete_id = ids.ath AND w.day = '2026-11-11';
INSERT INTO r(k,v) SELECT 'A3 malade lu (true)', (w.sick = false)::text FROM wellness_entries w, ids WHERE w.athlete_id = ids.ath AND w.day = '2026-11-11';
INSERT INTO r(k,v) SELECT 'A4 zones : niveau hors 1-3 écarté (true)', (w.doms_levels = '{"ischios":2,"fessiers":1}'::jsonb)::text FROM wellness_entries w, ids WHERE w.athlete_id = ids.ath AND w.day = '2026-11-11';
INSERT INTO r(k,v) SELECT 'A5 score inchangé = 5 notes (true)', (w.score = 72)::text FROM wellness_entries w, ids WHERE w.athlete_id = ids.ath AND w.day = '2026-11-11';
INSERT INTO r(k,v) SELECT 'B1 ancienne saisie : défauts (true)',
  (count(*) FILTER (WHERE w.doms_levels <> '{}'::jsonb OR w.envie IS NOT NULL) = 0)::text
  FROM wellness_entries w, ids WHERE w.athlete_id = ids.ath AND w.day < '2026-11-01';

SELECT k, v FROM r ORDER BY n;
ROLLBACK;
