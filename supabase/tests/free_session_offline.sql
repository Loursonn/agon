-- Séance libre démarrée hors ligne : création avec un id choisi sur le
-- téléphone, rejouable (`planWorkout` avec id, src/api/workouts.ts).
-- Aucune migration : vérifie que la base de prod garantit ce que le client
-- attend (index unique athlète / séance / jour, RLS `workout_logs_self`,
-- RPC de séance idempotentes).
-- Toujours annulé (ROLLBACK final) : rien ne reste en base.
--   supabase db query --linked -f supabase/tests/free_session_offline.sql
-- Chaque ligne v doit valoir la valeur entre parenthèses de k.

BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated, anon; GRANT ALL ON SEQUENCE r_n_seq TO authenticated, anon;
CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT a.id AS athlete, a.coach_id AS coach,
  (SELECT o.id FROM profiles o WHERE o.role = 'athlete' AND o.id <> a.id ORDER BY o.created_at LIMIT 1) AS other_athlete,
  gen_random_uuid() AS l1, gen_random_uuid() AS l2, gen_random_uuid() AS l3, gen_random_uuid() AS l4,
  (current_date + 400) AS d
FROM profiles a
WHERE a.role = 'athlete' AND a.coach_id IS NOT NULL AND a.coach_id <> a.id AND NOT coalesce(a.is_pending, false)
ORDER BY a.created_at LIMIT 1;
GRANT SELECT ON ids TO authenticated, anon;
INSERT INTO r(k,v) SELECT '00 jeu de test complet (true)', (athlete IS NOT NULL AND other_athlete IS NOT NULL)::text FROM ids;

-- Place prise d'avance par une séance du coach (S2, jour d), et une séance
-- d'un autre athlète (l4).
INSERT INTO workout_logs (id, athlete_id, coach_id, session_id, session_name, scheduled_date, original_scheduled_date, status)
SELECT l2, athlete, coach, 'test-offline-S2', 'Test hors ligne S2', d, d, 'planned' FROM ids;
INSERT INTO workout_logs (id, athlete_id, session_id, session_name, scheduled_date, original_scheduled_date, status)
SELECT l4, other_athlete, 'test-offline-X', 'Test hors ligne autre', d, d, 'planned' FROM ids;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role','authenticated')::text FROM ids), true);

-- ===== Création rejouable (même requête que planWorkout avec id) =====
DO $$ DECLARE i record; BEGIN
  SELECT * INTO i FROM ids;
  FOR k IN 1..2 LOOP
    INSERT INTO workout_logs (id, athlete_id, coach_id, session_id, session_name, scheduled_date, original_scheduled_date, status, rescheduled_by_athlete, coach_alert)
    VALUES (i.l1, i.athlete, i.coach, 'test-offline-S1', 'Test hors ligne S1', i.d, i.d, 'planned', true, false)
    ON CONFLICT (athlete_id, session_id, scheduled_date) DO NOTHING;
  END LOOP;
END $$;
INSERT INTO r(k,v) SELECT 'C1 créée puis rejouée : une seule séance, id du téléphone (1 / true)',
  count(*)::text || ' / ' || bool_and(w.id = i.l1)::text
  FROM workout_logs w, ids i WHERE w.athlete_id = i.athlete AND w.session_id = 'test-offline-S1' AND w.scheduled_date = i.d
  GROUP BY i.l1;

-- ===== Saisies, fin, note, puis rejeu =====
INSERT INTO r(k,v) SELECT 'C2 séries sur l''id du téléphone (80)',
  (patch_workout_entries(l1, '{"sessionSets":{"e1":[{"done":true,"kg":80,"reps":5}]}}'::jsonb)).athlete_modifications
    -> 'sessionSets' -> 'e1' -> 0 ->> 'kg' FROM ids;
CREATE TEMP TABLE fin ON COMMIT DROP AS SELECT (complete_workout(l1, NULL, NULL, 7::smallint)).completed_at AS at FROM ids;
GRANT SELECT ON fin TO authenticated;
INSERT INTO r(k,v) SELECT 'C3 fin rejouée : même completed_at, RPE gardé (true / 7)',
  ((w).completed_at = (SELECT at FROM fin))::text || ' / ' || (w).rpe_score::text
  FROM (SELECT complete_workout(l1, NULL, NULL, NULL) AS w FROM ids) x;
INSERT INTO r(k,v) SELECT 'C4 note rejouée (8 puis 8)',
  (set_workout_rpe(l1, 8::smallint)).rpe_score::text || ' puis ' || (set_workout_rpe(l1, 8::smallint)).rpe_score::text FROM ids;

-- ===== Séance déplacée par le coach avant le rejeu de la création =====
RESET ROLE;
UPDATE workout_logs SET scheduled_date = (SELECT d + 2 FROM ids) WHERE id = (SELECT l1 FROM ids);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role','authenticated')::text FROM ids), true);
DO $$ DECLARE i record; BEGIN
  SELECT * INTO i FROM ids;
  INSERT INTO workout_logs (id, athlete_id, coach_id, session_id, session_name, scheduled_date, original_scheduled_date, status, rescheduled_by_athlete, coach_alert)
  VALUES (i.l1, i.athlete, i.coach, 'test-offline-S1', 'Test hors ligne S1', i.d, i.d, 'planned', true, false)
  ON CONFLICT (athlete_id, session_id, scheduled_date) DO NOTHING;
  INSERT INTO r(k,v) VALUES ('D1 rejeu après déplacement : refusé (23505 attendu)', 'accepté');
EXCEPTION WHEN unique_violation THEN INSERT INTO r(k,v) VALUES ('D1 rejeu après déplacement : refusé (23505 attendu)', '23505');
END $$;
INSERT INTO r(k,v) SELECT 'D2 la séance déplacée reste seule et intacte (1 / completed)',
  count(*)::text || ' / ' || max(w.status) FROM workout_logs w, ids i WHERE w.athlete_id = i.athlete AND w.session_id = 'test-offline-S1';

-- ===== Place déjà prise (séance du coach ce jour-là) =====
INSERT INTO workout_logs (id, athlete_id, coach_id, session_id, session_name, scheduled_date, original_scheduled_date, status, rescheduled_by_athlete, coach_alert)
SELECT l3, athlete, coach, 'test-offline-S2', 'Test hors ligne S2', d, d, 'planned', true, false FROM ids
ON CONFLICT (athlete_id, session_id, scheduled_date) DO NOTHING;
INSERT INTO r(k,v) SELECT 'P1 rien créé, la séance du coach est lue (0 / true)',
  (SELECT count(*) FROM workout_logs WHERE id = i.l3)::text || ' / ' ||
  EXISTS (SELECT 1 FROM workout_logs w WHERE w.athlete_id = i.athlete AND w.session_id = 'test-offline-S2' AND w.scheduled_date = i.d AND w.id = i.l2)::text
  FROM ids i;

-- ===== RLS : un athlète ne crée que chez lui =====
DO $$ DECLARE i record; BEGIN
  SELECT * INTO i FROM ids;
  INSERT INTO workout_logs (id, athlete_id, session_id, session_name, scheduled_date, original_scheduled_date, status)
  VALUES (gen_random_uuid(), i.other_athlete, 'test-offline-S9', 'Test hors ligne', i.d, i.d, 'planned')
  ON CONFLICT (athlete_id, session_id, scheduled_date) DO NOTHING;
  INSERT INTO r(k,v) VALUES ('R1 séance chez un autre athlète : refusée (42501)', 'acceptée');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO r(k,v) VALUES ('R1 séance chez un autre athlète : refusée (42501)', '42501');
END $$;
-- Id d'une séance d'un autre athlète repris : refus, sa séance n'est ni lue ni modifiée.
DO $$ DECLARE i record; BEGIN
  SELECT * INTO i FROM ids;
  INSERT INTO workout_logs (id, athlete_id, session_id, session_name, scheduled_date, original_scheduled_date, status)
  VALUES (i.l4, i.athlete, 'test-offline-S8', 'Test hors ligne', i.d, i.d, 'planned')
  ON CONFLICT (athlete_id, session_id, scheduled_date) DO NOTHING;
  INSERT INTO r(k,v) VALUES ('R2 id d''un autre athlète : refusé (23505)', 'accepté');
EXCEPTION WHEN unique_violation THEN INSERT INTO r(k,v) VALUES ('R2 id d''un autre athlète : refusé (23505)', '23505');
END $$;
INSERT INTO r(k,v) SELECT 'R3 séance de l''autre athlète invisible (0)', count(*)::text FROM workout_logs WHERE id = (SELECT l4 FROM ids);
DO $$ BEGIN
  PERFORM patch_workout_entries((SELECT l4 FROM ids), '{"x":1}'::jsonb);
  INSERT INTO r(k,v) VALUES ('R4 saisie sur la séance d''un autre : refusée (42501)', 'acceptée');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO r(k,v) VALUES ('R4 saisie sur la séance d''un autre : refusée (42501)', '42501');
END $$;

RESET ROLE;
INSERT INTO r(k,v) SELECT 'R5 séance de l''autre athlète intacte (planned / test-offline-X)',
  status || ' / ' || session_id FROM workout_logs WHERE id = (SELECT l4 FROM ids);

SELECT k, v FROM r ORDER BY n;
ROLLBACK;
