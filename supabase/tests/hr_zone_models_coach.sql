-- Tests : zones FC fixées par le coach (migration 20261112200000_hr_zone_models_coach).
-- Toujours annulé (ROLLBACK final). Avant application, dans la même transaction :
--   (echo 'BEGIN;'; cat supabase/migrations/20261112200000_hr_zone_models_coach.sql \
--      supabase/tests/hr_zone_models_coach.sql) > "$TMPDIR/z.sql"
--   supabase db query --linked -f "$TMPDIR/z.sql"
-- Comptes de démonstration seulement (Léa Démo / Agon Démo) ; résultats = booléens.

BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;

CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT a.id AS ath, a.coach_id AS coach,
  (SELECT p.id FROM profiles p
    WHERE p.role IN ('coach', 'coach_athlete') AND p.id <> a.coach_id
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = a.id AND cc.co_coach_id = p.id)
      AND NOT coalesce(p.is_admin, false)
    ORDER BY p.created_at LIMIT 1) AS other_coach,
  NULL::uuid AS m_old, NULL::uuid AS m_new, NULL::uuid AS m_prop
FROM profiles a WHERE a.full_name = 'Léa Démo' AND a.coach_id IS NOT NULL LIMIT 1;
GRANT SELECT, UPDATE ON ids TO authenticated;

INSERT INTO r(k,v) SELECT '00 jeu de test complet (true)', (ath IS NOT NULL AND coach IS NOT NULL AND other_coach IS NOT NULL)::text FROM ids;
INSERT INTO r(k,v) VALUES
  ('01 apply_to_past anon (false)', has_function_privilege('anon', 'public.apply_hr_zone_model_to_past(uuid)', 'EXECUTE')::text),
  ('02 apply_to_past authenticated (true)', has_function_privilege('authenticated', 'public.apply_hr_zone_model_to_past(uuid)', 'EXECUTE')::text);

SET LOCAL ROLE authenticated;

-- ── L'athlète ne peut plus enregistrer ────────────────────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', ath, 'role', 'authenticated')::text FROM ids), true);
DO $$ BEGIN
  PERFORM save_hr_zone_model(ath, 'three', ARRAY[150, 170], current_date) FROM ids;
  INSERT INTO r(k,v) VALUES ('A1 athlète enregistre', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A1 athlète enregistre', 'refusé (OK)'); END $$;

-- ── Un coach qui n'est pas le sien non plus ───────────────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', other_coach, 'role', 'authenticated')::text FROM ids), true);
DO $$ BEGIN
  PERFORM save_hr_zone_model(ath, 'three', ARRAY[150, 170], current_date) FROM ids;
  INSERT INTO r(k,v) VALUES ('A2 autre coach enregistre', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A2 autre coach enregistre', 'refusé (OK)'); END $$;

-- ── Le coach : 3 zones il y a 30 jours, puis 7 zones aujourd'hui ─────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role', 'authenticated')::text FROM ids), true);
UPDATE ids SET m_old = save_hr_zone_model(ath, 'three', ARRAY[152, 172], current_date - 30);
UPDATE ids SET m_new = save_hr_zone_model(ath, 'custom', ARRAY[120, 135, 150, 160, 170, 180], current_date);
INSERT INTO r(k,v) SELECT 'B1 aujourd''hui = 7 zones (true)',
  ((SELECT b.kind = 'custom' AND cardinality(b.bounds) = 6 FROM hr_zone_bounds_at(ath, current_date) b))::text FROM ids;
INSERT INTO r(k,v) SELECT 'B2 il y a 10 jours = 3 zones (true)',
  ((SELECT b.kind = 'three' AND b.bounds = '{152,172}' FROM hr_zone_bounds_at(ath, current_date - 10) b))::text FROM ids;

-- ── L'athlète ne peut pas appliquer au passé ──────────────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', ath, 'role', 'authenticated')::text FROM ids), true);
DO $$ BEGIN
  PERFORM apply_hr_zone_model_to_past(m_new) FROM ids;
  INSERT INTO r(k,v) VALUES ('C1 athlète applique au passé', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('C1 athlète applique au passé', 'refusé (OK)'); END $$;
INSERT INTO r(k,v) SELECT 'C2 athlète lit ses modèles (true)',
  ((SELECT count(*) FROM hr_zone_models h WHERE h.athlete_id = ids.ath AND h.id IN (ids.m_old, ids.m_new)) = 2)::text FROM ids;

-- ── Le coach applique les 7 zones au passé ────────────────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role', 'authenticated')::text FROM ids), true);
SELECT apply_hr_zone_model_to_past(m_new) FROM ids;
INSERT INTO r(k,v) SELECT 'C3 ancien modèle remplacé, gardé (true)',
  ((SELECT status = 'replaced' FROM hr_zone_models WHERE id = ids.m_old))::text FROM ids;
INSERT INTO r(k,v) SELECT 'C4 il y a 10 jours = 7 zones (true)',
  ((SELECT b.kind = 'custom' AND cardinality(b.bounds) = 6 FROM hr_zone_bounds_at(ath, current_date - 10) b))::text FROM ids;

-- ── Proposition d'un test : acceptée = datée du jour ──────────────────────────
RESET ROLE;
WITH p AS (
  INSERT INTO hr_zone_models (athlete_id, kind, bounds, valid_from, status, origin)
  SELECT ath, 'three', '{150,171}', current_date - 3, 'proposed', 'test' FROM ids RETURNING id)
UPDATE ids SET m_prop = (SELECT id FROM p);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', ath, 'role', 'authenticated')::text FROM ids), true);
DO $$ BEGIN
  PERFORM decide_hr_zone_model(m_prop, true) FROM ids;
  INSERT INTO r(k,v) VALUES ('D1 athlète accepte une proposition', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('D1 athlète accepte une proposition', 'refusé (OK)'); END $$;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role', 'authenticated')::text FROM ids), true);
SELECT decide_hr_zone_model(m_prop, true) FROM ids;
INSERT INTO r(k,v) SELECT 'D2 acceptée : active, datée du jour (true)',
  ((SELECT status = 'active' AND valid_from = current_date FROM hr_zone_models WHERE id = ids.m_prop))::text FROM ids;
INSERT INTO r(k,v) SELECT 'D3 aujourd''hui = 3 zones proposées (true)',
  ((SELECT b.bounds = '{150,171}' FROM hr_zone_bounds_at(ath, current_date) b))::text FROM ids;
INSERT INTO r(k,v) SELECT 'D4 hier = toujours 7 zones (true)',
  ((SELECT cardinality(b.bounds) = 6 FROM hr_zone_bounds_at(ath, current_date - 1) b))::text FROM ids;

RESET ROLE;
SELECT k, v FROM r ORDER BY n;
ROLLBACK;
