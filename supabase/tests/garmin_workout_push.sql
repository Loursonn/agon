-- Tests : envoi des séances vers la montre (migration 20261113100000_garmin_workout_push).
-- Toujours annulé (ROLLBACK final). Avant application, dans la même transaction :
--   (echo 'BEGIN;'; cat supabase/migrations/20261113100000_garmin_workout_push.sql \
--      supabase/tests/garmin_workout_push.sql) > "$TMPDIR/g.sql"
--   supabase db query --linked -f "$TMPDIR/g.sql"
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
    ORDER BY p.created_at LIMIT 1) AS other_coach
FROM profiles a WHERE a.full_name = 'Léa Démo' AND a.coach_id IS NOT NULL LIMIT 1;
GRANT SELECT ON ids TO authenticated;

-- Connexion Garmin fictive de Léa Démo et une séance « envoyée » (annulées au ROLLBACK).
DELETE FROM provider_connections WHERE athlete_id = (SELECT ath FROM ids) AND provider = 'garmin';
INSERT INTO provider_connections (athlete_id, provider, status) SELECT ath, 'garmin', 'active' FROM ids;
INSERT INTO provider_workout_pushes (athlete_id, provider, source_kind, source_id, scheduled_date, external_workout_id, payload_hash, status)
SELECT ath, 'garmin', 'energy', gen_random_uuid(), current_date + 1, '999', 'h', 'sent' FROM ids;

INSERT INTO r(k,v) SELECT '00 jeu de test complet (true)', (ath IS NOT NULL AND coach IS NOT NULL AND other_coach IS NOT NULL)::text FROM ids;
INSERT INTO r(k,v) VALUES
  ('01 set_workout_push anon (false)', has_function_privilege('anon', 'public.set_workout_push(data_source, boolean)', 'EXECUTE')::text),
  ('02 set_workout_push authenticated (true)', has_function_privilege('authenticated', 'public.set_workout_push(data_source, boolean)', 'EXECUTE')::text),
  ('03 trigger_garmin_workouts authenticated (false)', has_function_privilege('authenticated', 'public.trigger_garmin_workouts()', 'EXECUTE')::text),
  ('04 push_workouts actif par défaut (true)', (SELECT push_workouts FROM provider_connections WHERE athlete_id = (SELECT ath FROM ids) AND provider = 'garmin')::text),
  ('05 job cron garmin-workouts (true)', EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'garmin-workouts' AND schedule = '*/10 * * * *')::text);

-- Contraintes
DO $$
BEGIN
  UPDATE energy_sessions SET modality = 'foot' WHERE id = (SELECT id FROM energy_sessions LIMIT 1);
  INSERT INTO r(k,v) VALUES ('06 sport inconnu refusé (true)', 'false');
EXCEPTION WHEN check_violation THEN
  INSERT INTO r(k,v) VALUES ('06 sport inconnu refusé (true)', 'true');
END $$;
DO $$
BEGIN
  UPDATE exercises SET garmin_category = 'SQUAT', garmin_exercise = NULL WHERE id = (SELECT id FROM exercises LIMIT 1);
  INSERT INTO r(k,v) VALUES ('07 équivalent Garmin à moitié refusé (true)', 'false');
EXCEPTION WHEN check_violation THEN
  INSERT INTO r(k,v) VALUES ('07 équivalent Garmin à moitié refusé (true)', 'true');
END $$;

SET LOCAL ROLE authenticated;

-- ── L'athlète ──────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', ath, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) VALUES ('10 athlète lit ses séances envoyées (true)', ((SELECT count(*) FROM provider_workout_pushes) = 1)::text);
INSERT INTO r(k,v) VALUES ('11 athlète coupe l''envoi (true)', public.set_workout_push('garmin', false)::text);
INSERT INTO r(k,v) VALUES ('12 envoi coupé enregistré (true)', (NOT (SELECT push_workouts FROM provider_connections WHERE provider = 'garmin'))::text);
DO $$
BEGIN
  UPDATE provider_workout_pushes SET status = 'error';
  INSERT INTO r(k,v) VALUES ('13 athlète ne peut pas écrire le suivi (true)', 'false');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO r(k,v) VALUES ('13 athlète ne peut pas écrire le suivi (true)', 'true');
END $$;
DO $$
BEGIN
  UPDATE provider_connections SET push_workouts = true;
  INSERT INTO r(k,v) VALUES ('14 pas d''écriture directe de la connexion (true)', (NOT (SELECT push_workouts FROM provider_connections WHERE provider = 'garmin'))::text);
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO r(k,v) VALUES ('14 pas d''écriture directe de la connexion (true)', 'true');
END $$;

DO $$
BEGIN
  UPDATE provider_connections SET granted_scopes = ARRAY['WORKOUT_IMPORT'];
  INSERT INTO r(k,v) VALUES ('15 athlète ne s''accorde pas une permission Garmin (true)',
    (coalesce((SELECT granted_scopes FROM provider_connections WHERE provider = 'garmin'), '{}') = '{}')::text);
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO r(k,v) VALUES ('15 athlète ne s''accorde pas une permission Garmin (true)', 'true');
END $$;

-- ── Le coach référent ──────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) VALUES ('20 coach lit les séances envoyées (true)', ((SELECT count(*) FROM provider_workout_pushes) >= 1)::text);
INSERT INTO r(k,v) VALUES ('21 coach ne coupe pas l''envoi de l''athlète (false)', public.set_workout_push('garmin', true)::text);

-- ── Un autre coach ─────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', other_coach, 'role', 'authenticated')::text FROM ids), true);
INSERT INTO r(k,v) VALUES ('30 autre coach ne voit rien (true)',
  ((SELECT count(*) FROM provider_workout_pushes WHERE athlete_id = (SELECT ath FROM ids)) = 0)::text);

RESET ROLE;

-- ── Déconnexion ou désinscription Garmin (provider_forget) : le suivi part avec la connexion
SELECT public.provider_forget((SELECT ath FROM ids), 'garmin');
INSERT INTO r(k,v) VALUES ('40 suivi effacé à la déconnexion / désinscription (true)',
  ((SELECT count(*) FROM provider_workout_pushes WHERE athlete_id = (SELECT ath FROM ids)) = 0
   AND NOT EXISTS (SELECT 1 FROM provider_connections WHERE athlete_id = (SELECT ath FROM ids) AND provider = 'garmin'))::text);

SELECT k, v FROM r ORDER BY n;
ROLLBACK;
