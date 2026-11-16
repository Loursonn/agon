-- Tests de 20261116213000_activity_laps_table_edit.sql
-- (type de tour, tour manuel hors courbe, valeurs corrigées sauf FC).
-- Toujours annulé. Données fictives uniquement (activité et jour inventés).
--
-- Avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261116213000_activity_laps_table_edit.sql; \
--    sed -e '/^BEGIN;$/d' supabase/tests/activity_laps_table_edit.sql) > "$TMPDIR/laps_table.sql"
--   supabase db query --linked -f "$TMPDIR/laps_table.sql"
-- Après application : supabase db query --linked -f supabase/tests/activity_laps_table_edit.sql

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
  NULL::uuid AS act, 0 AS v
FROM profiles a WHERE a.full_name = 'Léa Démo' AND a.coach_id IS NOT NULL LIMIT 1;
GRANT SELECT, UPDATE ON t_ids TO anon, authenticated;

WITH a AS (
  INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, duration_s)
  SELECT athlete, 'file_import', 'test-laps-table-edit', '2001-01-02T17:30:00Z', '2001-01-02', 'running', 100 FROM t_ids
  RETURNING id)
UPDATE t_ids SET act = (SELECT id FROM a);
SELECT public.activity_detail_upsert(act, jsonb_build_object(
  'source', 'fit',
  'stream', jsonb_build_object('t', (SELECT jsonb_agg(i) FROM generate_series(0, 99) i)),
  'laps', '[{"startS":0,"endS":40},{"startS":40,"endS":99}]'::jsonb)) FROM t_ids;

INSERT INTO t_res (name, ok, detail)
SELECT '00 jeu de test complet', athlete IS NOT NULL AND coach IS NOT NULL AND other_coach IS NOT NULL AND act IS NOT NULL, NULL FROM t_ids;

-- ---------- Athlète : type, tour manuel, valeurs corrigées ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
UPDATE t_ids SET v = public.save_activity_laps(act, 0,
  '[{"start_s":0,"end_s":40,"name":"Échauffement","lap_type":"warmup",
     "overrides":{"avgCadence":172,"ascentM":12,"avgHr":190,"maxHr":200,"bidon":3,"descentM":-4,"maxCadence":"180"}},
    {"start_s":40,"end_s":40,"lap_type":"work","manual_duration_s":300,"distance_override_m":1250},
    {"start_s":40,"end_s":100,"lap_type":"cooldown","overrides":{}}]'::jsonb);
INSERT INTO t_res (name, ok, detail)
SELECT '01 types enregistrés',
       array_agg(l.lap_type ORDER BY l.position) = ARRAY['warmup', 'work', 'cooldown'],
       array_agg(l.lap_type ORDER BY l.position)::text
  FROM activity_laps l JOIN t_ids ON l.activity_id = t_ids.act;
INSERT INTO t_res (name, ok, detail)
SELECT '02 tour manuel : posé à 40 s, durée 300 s, distance 1250 m',
       l.start_s = 40 AND l.end_s = 40 AND l.manual_duration_s = 300 AND l.distance_override_m = 1250,
       row(l.start_s, l.end_s, l.manual_duration_s, l.distance_override_m)::text
  FROM activity_laps l JOIN t_ids ON l.activity_id = t_ids.act WHERE l.position = 2;
INSERT INTO t_res (name, ok, detail)
SELECT '03 valeurs corrigées : FC, clés inconnues, négatifs et textes écartés',
       l.overrides = '{"avgCadence":172,"ascentM":12}'::jsonb, l.overrides::text
  FROM activity_laps l JOIN t_ids ON l.activity_id = t_ids.act WHERE l.position = 1;
INSERT INTO t_res (name, ok, detail)
SELECT '04 objet vide → null', l.overrides IS NULL, l.overrides::text
  FROM activity_laps l JOIN t_ids ON l.activity_id = t_ids.act WHERE l.position = 3;
INSERT INTO t_res (name, ok, detail)
SELECT '05 flux brut de la montre intact', jsonb_array_length(s.watch_laps) = 2, s.watch_laps::text
  FROM activity_streams s JOIN t_ids ON s.activity_id = t_ids.act;

-- Refus : tour de longueur nulle sans durée, durée manuelle avec bornes, type inconnu.
DO $$ BEGIN
  PERFORM public.save_activity_laps(act, v, '[{"start_s":10,"end_s":10}]'::jsonb) FROM t_ids;
  INSERT INTO t_res (name, ok, detail) VALUES ('06 tour vide sans durée refusé', false, 'ACCEPTÉ');
EXCEPTION WHEN OTHERS THEN INSERT INTO t_res (name, ok, detail) VALUES ('06 tour vide sans durée refusé', true, SQLERRM); END $$;
DO $$ BEGIN
  PERFORM public.save_activity_laps(act, v, '[{"start_s":0,"end_s":40,"manual_duration_s":60}]'::jsonb) FROM t_ids;
  INSERT INTO t_res (name, ok, detail) VALUES ('07 tour manuel avec bornes refusé', false, 'ACCEPTÉ');
EXCEPTION WHEN OTHERS THEN INSERT INTO t_res (name, ok, detail) VALUES ('07 tour manuel avec bornes refusé', true, SQLERRM); END $$;
DO $$ BEGIN
  PERFORM public.save_activity_laps(act, v, '[{"start_s":0,"end_s":40,"lap_type":"sprint"}]'::jsonb) FROM t_ids;
  INSERT INTO t_res (name, ok, detail) VALUES ('08 type inconnu refusé', false, 'ACCEPTÉ');
EXCEPTION WHEN OTHERS THEN INSERT INTO t_res (name, ok, detail) VALUES ('08 type inconnu refusé', true, SQLERRM); END $$;

-- Un autre coach ne peut pas écrire.
SELECT set_config('request.jwt.claims', json_build_object('sub', other_coach, 'role', 'authenticated')::text, true) FROM t_ids;
DO $$ BEGIN
  PERFORM public.save_activity_laps(act, v, '[{"start_s":0,"end_s":40,"lap_type":"work"}]'::jsonb) FROM t_ids;
  INSERT INTO t_res (name, ok, detail) VALUES ('09 autre coach refusé', false, 'ACCEPTÉ');
EXCEPTION WHEN OTHERS THEN INSERT INTO t_res (name, ok, detail) VALUES ('09 autre coach refusé', true, SQLERRM); END $$;

-- Le coach référent peut écrire.
SELECT set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true) FROM t_ids;
UPDATE t_ids SET v = public.save_activity_laps(act, v,
  '[{"start_s":0,"end_s":100,"lap_type":"recovery","overrides":{"maxPaceSPerKm":250}}]'::jsonb);
INSERT INTO t_res (name, ok, detail)
SELECT '10 coach : écrit type et valeur corrigée',
       count(*) = 1 AND min(l.lap_type) = 'recovery' AND (min(l.overrides::text))::jsonb = '{"maxPaceSPerKm":250}'::jsonb, count(*)::text
  FROM activity_laps l JOIN t_ids ON l.activity_id = t_ids.act;

-- Retour aux tours de la montre : tout s'efface.
UPDATE t_ids SET v = public.reset_activity_laps_to_watch(act, v);
INSERT INTO t_res (name, ok, detail)
SELECT '11 retour montre : 2 tours, sans type ni valeur corrigée',
       count(*) = 2 AND bool_and(l.lap_type IS NULL AND l.overrides IS NULL AND l.manual_duration_s IS NULL), count(*)::text
  FROM activity_laps l JOIN t_ids ON l.activity_id = t_ids.act;

RESET ROLE;
SELECT name, ok, detail FROM t_res ORDER BY n;
ROLLBACK;
