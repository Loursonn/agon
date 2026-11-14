-- Tests : carte douleur du wellness (migration 20261115120000_wellness_pain_levels).
-- Toujours annulé. Avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261115120000_wellness_pain_levels.sql \
--      supabase/tests/wellness_pain_levels.sql) > "$TMPDIR/w.sql" && supabase db query --linked -f "$TMPDIR/w.sql"
-- Compte de démonstration seulement (Léa Démo) ; résultats = booléens.
BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;
CREATE TEMP TABLE ids ON COMMIT DROP AS SELECT id AS ath FROM profiles WHERE full_name = 'Léa Démo' LIMIT 1;
GRANT SELECT ON ids TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', ath, 'role', 'authenticated')::text FROM ids), true);
-- Douleur oui : deux zones notées (+ valeurs à écarter : hors échelle, décimale, texte, clé vide).
SELECT wellness_set_day(ath, DATE '2026-11-11', jsonb_build_object(
  'fatigue', 4, 'sommeil', 4, 'stress', 3, 'energie', 4, 'doms', 3, 'envie', 5,
  'pain', 6, 'sick', false,
  'painLevels', jsonb_build_object('genou', 6, 'lombaires', 3, 'cou', 11, 'coude', 2.5, 'hanche', '4', '', 5),
  'domsLevels', jsonb_build_object('ischios', 2))) FROM ids;
-- Douleur non.
SELECT wellness_set_day(ath, DATE '2026-11-10', jsonb_build_object(
  'fatigue', 4, 'sommeil', 4, 'stress', 3, 'energie', 4, 'doms', 3, 'pain', 0, 'painLevels', '{}'::jsonb)) FROM ids;
-- Ancienne saisie : note seule, sans zone.
SELECT wellness_set_day(ath, DATE '2026-11-09', jsonb_build_object(
  'fatigue', 4, 'sommeil', 4, 'stress', 3, 'energie', 4, 'doms', 3, 'pain', 5)) FROM ids;
-- Client qui n'envoie pas `pain` : la note du jour vient des zones.
SELECT wellness_set_day(ath, DATE '2026-11-08', jsonb_build_object(
  'fatigue', 4, 'sommeil', 4, 'stress', 3, 'energie', 4, 'doms', 3, 'painLevels', jsonb_build_object('cheville_pied', 7))) FROM ids;

INSERT INTO r(k,v) SELECT 'A1 zones notées lues, le reste écarté (true)',
  (w.pain_levels = '{"genou":6,"lombaires":3}'::jsonb)::text FROM wellness_entries w, ids WHERE w.athlete_id = ids.ath AND w.day = '2026-11-11';
INSERT INTO r(k,v) SELECT 'A2 note du jour = la plus forte (true)', (w.pain = 6)::text FROM wellness_entries w, ids WHERE w.athlete_id = ids.ath AND w.day = '2026-11-11';
INSERT INTO r(k,v) SELECT 'A3 courbatures inchangées (true)', (w.doms_levels = '{"ischios":2}'::jsonb)::text FROM wellness_entries w, ids WHERE w.athlete_id = ids.ath AND w.day = '2026-11-11';
INSERT INTO r(k,v) SELECT 'B1 douleur non : 0, aucune zone (true)', (w.pain = 0 AND w.pain_levels = '{}'::jsonb)::text FROM wellness_entries w, ids WHERE w.athlete_id = ids.ath AND w.day = '2026-11-10';
INSERT INTO r(k,v) SELECT 'C1 ancienne saisie gardée telle quelle (true)', (w.pain = 5 AND w.pain_levels = '{}'::jsonb)::text FROM wellness_entries w, ids WHERE w.athlete_id = ids.ath AND w.day = '2026-11-09';
INSERT INTO r(k,v) SELECT 'D1 sans pain : note tirée des zones (true)', (w.pain = 7)::text FROM wellness_entries w, ids WHERE w.athlete_id = ids.ath AND w.day = '2026-11-08';
INSERT INTO r(k,v) SELECT 'E1 l''athlète relit ses zones (true)',
  (count(*) = 1)::text FROM wellness_entries w, ids WHERE w.athlete_id = ids.ath AND w.day = '2026-11-11' AND w.pain_levels ? 'genou';
RESET ROLE;
INSERT INTO r(k,v) SELECT 'F1 autres lignes : défaut {} (true)',
  (count(*) FILTER (WHERE w.pain_levels IS NULL OR jsonb_typeof(w.pain_levels) <> 'object') = 0)::text FROM wellness_entries w;

SELECT k, v FROM r ORDER BY n;
ROLLBACK;
