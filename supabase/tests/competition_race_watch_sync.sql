-- Tests de 20261116224500_competition_race_watch_sync.sql (compétition HYROX ↔ analyse de course).
-- Toujours annulé. Données fictives uniquement (jour 2031-05-10, sans rien en base).
--
-- Avant application :
--   (echo 'BEGIN;'; cat supabase/migrations/20261116224500_competition_race_watch_sync.sql; \
--    sed -e '/^BEGIN;$/d' supabase/tests/competition_race_watch_sync.sql) > "$TMPDIR/crw.sql"
--   supabase db query --linked -f "$TMPDIR/crw.sql"
-- Après application : supabase db query --linked -f supabase/tests/competition_race_watch_sync.sql

BEGIN;

CREATE TEMP TABLE t_res (n serial, name text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t_res TO anon, authenticated;
GRANT ALL ON SEQUENCE t_res_n_seq TO anon, authenticated;

CREATE TEMP TABLE t_ids ON COMMIT DROP AS
SELECT
  (SELECT a.id FROM profiles a
    WHERE a.role = 'athlete' AND a.coach_id IS NOT NULL AND a.coach_id <> a.id
      AND NOT coalesce(a.is_pending, false)
    ORDER BY a.id LIMIT 1) AS athlete,
  NULL::uuid AS coach, NULL::uuid AS comp, NULL::uuid AS warmup, NULL::uuid AS race,
  NULL::uuid AS hyrox, NULL::uuid AS lone;
UPDATE t_ids SET coach = (SELECT coach_id FROM profiles WHERE id = t_ids.athlete);
GRANT SELECT, UPDATE ON t_ids TO anon, authenticated;

-- Compétition HYROX ; échauffement 20 min puis course 75 min ; résultat HYROX lié à la compétition.
WITH c AS (INSERT INTO competitions (athlete_id, coach_id, name, type, date, priority)
           SELECT athlete, coach, 'test HYROX Lyon', 'competition', '2031-05-10', 'A' FROM t_ids RETURNING id)
UPDATE t_ids SET comp = (SELECT id FROM c);
WITH a AS (INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, duration_s)
           SELECT athlete, 'garmin', 'test-crw-warmup', '2031-05-10T08:30:00Z', '2031-05-10', 'running', 1200 FROM t_ids RETURNING id)
UPDATE t_ids SET warmup = (SELECT id FROM a);
WITH a AS (INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, duration_s)
           SELECT athlete, 'garmin', 'test-crw-race', '2031-05-10T09:00:00Z', '2031-05-10', 'hyrox', 4500 FROM t_ids RETURNING id)
UPDATE t_ids SET race = (SELECT id FROM a);
WITH h AS (INSERT INTO hyrox_results (athlete_id, date, event_name, division, total_s, competition_id)
           SELECT athlete, '2031-05-10', 'test HYROX Lyon', 'men', 4440, comp FROM t_ids RETURNING id)
UPDATE t_ids SET hyrox = (SELECT id FROM h);
-- Course HYROX sans compétition (entraînement chronométré).
WITH h AS (INSERT INTO hyrox_results (athlete_id, date, event_name, division, total_s)
           SELECT athlete, '2031-05-10', 'test simulation', 'men', 3000 FROM t_ids RETURNING id)
UPDATE t_ids SET lone = (SELECT id FROM h);

INSERT INTO t_res (name, ok, detail)
SELECT 'fixtures', athlete IS NOT NULL AND comp IS NOT NULL AND race IS NOT NULL AND hyrox IS NOT NULL, '' FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT 'proposition auto : la course HYROX n''est pas touchée',
       (SELECT watch_activity_id FROM hyrox_results WHERE id = (SELECT hyrox FROM t_ids)) IS NULL
       AND EXISTS (SELECT 1 FROM activity_plan_links l, t_ids i
                    WHERE l.planned_kind = 'competition' AND l.planned_id = i.comp AND l.status = 'auto'), '';

SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;

-- 1. Depuis la compétition : l'athlète confirme la proposition.
SELECT public.decide_plan_link((SELECT l.id FROM activity_plan_links l, t_ids i
                                 WHERE l.planned_kind = 'competition' AND l.planned_id = i.comp AND l.status = 'auto'), true);
INSERT INTO t_res (name, ok, detail)
SELECT 'compétition confirmée → la course HYROX prend la sortie, recalage auto',
       h.watch_activity_id = i.race AND h.watch_offset_s IS NULL, coalesce(h.watch_activity_id::text, 'null')
  FROM hyrox_results h, t_ids i WHERE h.id = i.hyrox;

-- 2. Depuis l'analyse HYROX : autre sortie avec un recalage à la main.
UPDATE hyrox_results SET watch_activity_id = (SELECT warmup FROM t_ids), watch_offset_s = 30
 WHERE id = (SELECT hyrox FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT 'analyse HYROX → la compétition suit (un seul lien confirmé), recalage gardé',
       (SELECT count(*) FROM activity_plan_links l, t_ids i
         WHERE l.planned_kind = 'competition' AND l.planned_id = i.comp AND l.status = 'confirmed') = 1
       AND (SELECT l.activity_id FROM activity_plan_links l, t_ids i
             WHERE l.planned_kind = 'competition' AND l.planned_id = i.comp AND l.status = 'confirmed') = (SELECT warmup FROM t_ids)
       AND (SELECT watch_offset_s FROM hyrox_results WHERE id = (SELECT hyrox FROM t_ids)) = 30, '';
INSERT INTO t_res (name, ok, detail)
SELECT 'ancien lien de la compétition refusé (plus reproposé)',
       EXISTS (SELECT 1 FROM activity_plan_links l, t_ids i
                WHERE l.planned_kind = 'competition' AND l.planned_id = i.comp AND l.activity_id = i.race AND l.status = 'rejected'), '';

-- 3. Depuis la compétition : retour à la course (refus puis choix, comme « Ma séance »).
SELECT public.decide_plan_link((SELECT l.id FROM activity_plan_links l, t_ids i
                                 WHERE l.planned_kind = 'competition' AND l.planned_id = i.comp AND l.status = 'confirmed'), false);
INSERT INTO t_res (name, ok, detail)
SELECT 'lien de la compétition refusé → la course revient à la proposition',
       h.watch_activity_id IS NULL AND h.watch_offset_s IS NULL, coalesce(h.watch_activity_id::text, 'null')
  FROM hyrox_results h, t_ids i WHERE h.id = i.hyrox;
SELECT public.link_activity_to_plan((SELECT race FROM t_ids), 'competition', (SELECT comp FROM t_ids));
INSERT INTO t_res (name, ok, detail)
SELECT 'le dernier choix gagne : course sur la nouvelle sortie, recalage remis en auto',
       h.watch_activity_id = i.race AND h.watch_offset_s IS NULL, coalesce(h.watch_activity_id::text, 'null')
  FROM hyrox_results h, t_ids i WHERE h.id = i.hyrox;

-- 4. Recalage seul : rien ne bouge côté compétition.
UPDATE hyrox_results SET watch_offset_s = -12 WHERE id = (SELECT hyrox FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT 'recalage seul : lien de la compétition inchangé, décalage gardé',
       (SELECT l.activity_id FROM activity_plan_links l, t_ids i
         WHERE l.planned_kind = 'competition' AND l.planned_id = i.comp AND l.status = 'confirmed') = (SELECT race FROM t_ids)
       AND (SELECT watch_offset_s FROM hyrox_results WHERE id = (SELECT hyrox FROM t_ids)) = -12, '';

-- 5. Analyse HYROX : « revenir à la proposition » → plus de lien confirmé.
UPDATE hyrox_results SET watch_activity_id = NULL, watch_offset_s = NULL WHERE id = (SELECT hyrox FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT 'course déliée → lien confirmé de la compétition retiré, proposition auto reprise',
       NOT EXISTS (SELECT 1 FROM activity_plan_links l, t_ids i
                    WHERE l.planned_kind = 'competition' AND l.planned_id = i.comp AND l.status = 'confirmed')
       AND EXISTS (SELECT 1 FROM activity_plan_links l, t_ids i
                    WHERE l.planned_kind = 'competition' AND l.planned_id = i.comp AND l.status = 'auto'), '';

-- 6. Course sans compétition : aucun lien créé.
UPDATE hyrox_results SET watch_activity_id = (SELECT race FROM t_ids) WHERE id = (SELECT lone FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT 'course sans compétition : aucun lien de compétition créé',
       NOT EXISTS (SELECT 1 FROM activity_plan_links l, t_ids i
                    WHERE l.planned_kind = 'competition' AND l.planned_id = i.comp AND l.status = 'confirmed'), '';
RESET ROLE;

-- 7. Compétition supprimée : liens retirés sans erreur.
DELETE FROM competitions WHERE id = (SELECT comp FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT 'compétition supprimée : plus aucun lien',
       NOT EXISTS (SELECT 1 FROM activity_plan_links l, t_ids i WHERE l.planned_kind = 'competition' AND l.planned_id = i.comp), '';

SELECT n, ok, name, detail FROM t_res ORDER BY ok, n;

ROLLBACK;
