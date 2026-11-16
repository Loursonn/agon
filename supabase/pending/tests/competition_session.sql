-- Tests de la compétition = séance à remplir, parties A et B
-- (20261116190000_competition_session.sql + 20261116190500_competition_auto_link.sql).
-- Version B : remplace supabase/tests/competition_session.sql le jour où la partie B est appliquée.
-- Toujours annulé. Données fictives uniquement (jour 2031-05-10, sans rien en base).
--
-- Avant application de B :
--   (echo 'BEGIN;'; cat supabase/pending/20261116190500_competition_auto_link.sql; \
--    sed -e '/^BEGIN;$/d' supabase/pending/tests/competition_session.sql) > "$TMPDIR/cs.sql"
--   supabase db query --linked -f "$TMPDIR/cs.sql"

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
  NULL::uuid AS coach, NULL::uuid AS other_coach,
  NULL::uuid AS comp, NULL::uuid AS stage, NULL::uuid AS warmup, NULL::uuid AS race, NULL::uuid AS hyrox,
  NULL::uuid AS bike, NULL::uuid AS match, NULL::uuid AS match_long;
UPDATE t_ids SET coach = (SELECT coach_id FROM profiles WHERE id = t_ids.athlete);
UPDATE t_ids SET other_coach = (SELECT c.id FROM profiles c
    WHERE c.role IN ('coach', 'coach_athlete') AND c.id <> t_ids.coach AND NOT coalesce(c.is_admin, false)
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = t_ids.athlete AND cc.co_coach_id = c.id)
    ORDER BY c.id LIMIT 1);
GRANT SELECT, UPDATE ON t_ids TO anon, authenticated;

-- Compétition HYROX + stage le même jour ; échauffement 20 min puis course 75 min, vélo 2 h l'après-midi.
WITH c AS (INSERT INTO competitions (athlete_id, coach_id, name, type, date, priority)
           SELECT athlete, coach, 'test HYROX Paris', 'competition', '2031-05-10', 'A' FROM t_ids RETURNING id)
UPDATE t_ids SET comp = (SELECT id FROM c);
WITH c AS (INSERT INTO competitions (athlete_id, coach_id, name, type, date, priority)
           SELECT athlete, coach, 'test stage', 'stage', '2031-05-10', 'C' FROM t_ids RETURNING id)
UPDATE t_ids SET stage = (SELECT id FROM c);
WITH a AS (INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, duration_s)
           SELECT athlete, 'garmin', 'test-cs-warmup', '2031-05-10T08:30:00Z', '2031-05-10', 'running', 1200 FROM t_ids RETURNING id)
UPDATE t_ids SET warmup = (SELECT id FROM a);
WITH a AS (INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, duration_s)
           SELECT athlete, 'garmin', 'test-cs-race', '2031-05-10T09:00:00Z', '2031-05-10', 'hyrox', 4500 FROM t_ids RETURNING id)
UPDATE t_ids SET race = (SELECT id FROM a);
WITH a AS (INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, duration_s)
           SELECT athlete, 'garmin', 'test-cs-bike', '2031-05-10T15:00:00Z', '2031-05-10', 'cycling', 7200 FROM t_ids RETURNING id)
UPDATE t_ids SET bike = (SELECT id FROM a);
-- Match le lendemain (tout sport) : échauffement 15 min (sport inconnu), match 95 min.
WITH c AS (INSERT INTO competitions (athlete_id, coach_id, name, type, date, priority)
           SELECT athlete, coach, 'test match', 'match', '2031-05-11', 'B' FROM t_ids RETURNING id)
UPDATE t_ids SET match = (SELECT id FROM c);
INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, duration_s)
SELECT athlete, 'coros', 'test-cs-match-warm', '2031-05-11T13:30:00Z', '2031-05-11', NULL, 900 FROM t_ids;
WITH a AS (INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, duration_s)
           SELECT athlete, 'coros', 'test-cs-match', '2031-05-11T14:00:00Z', '2031-05-11', 'soccer', 5700 FROM t_ids RETURNING id)
UPDATE t_ids SET match_long = (SELECT id FROM a);

INSERT INTO t_res (name, ok, detail)
SELECT 'fixtures', athlete IS NOT NULL AND other_coach IS NOT NULL AND comp IS NOT NULL AND race IS NOT NULL, '' FROM t_ids;

INSERT INTO t_res (name, ok, detail)
SELECT 'auto HYROX : la plus longue des activités compatibles (pas le vélo), échauffement libre, stage jamais lié',
       count(*) = 1 AND bool_and(l.status = 'auto' AND l.planned_kind = 'competition'
                                 AND l.planned_id = i.comp AND l.activity_id = i.race),
       string_agg(l.planned_kind || ':' || l.status, ',')
  FROM activity_plan_links l JOIN t_ids i ON l.athlete_id = i.athlete AND l.local_date = '2031-05-10';
INSERT INTO t_res (name, ok, detail)
SELECT 'auto match : tout sport, la plus longue (le match, pas l''échauffement)',
       (SELECT l.activity_id FROM activity_plan_links l, t_ids i
         WHERE l.planned_kind = 'competition' AND l.planned_id = i.match AND l.status = 'auto') = (SELECT match_long FROM t_ids), '';

-- Chrono HYROX saisi (21 min, absurde mais net) : la plus proche du chrono gagne.
WITH h AS (INSERT INTO hyrox_results (athlete_id, date, event_name, division, total_s, competition_id)
           SELECT athlete, '2031-05-10', 'test HYROX Paris', 'men', 1260, comp FROM t_ids RETURNING id)
UPDATE t_ids SET hyrox = (SELECT id FROM h);
INSERT INTO t_res (name, ok, detail)
SELECT 'chrono HYROX : activité la plus proche du chrono proposée',
       (SELECT l.activity_id FROM activity_plan_links l, t_ids i
         WHERE l.planned_kind = 'competition' AND l.planned_id = i.comp AND l.status <> 'rejected') = (SELECT warmup FROM t_ids), '';
UPDATE hyrox_results SET total_s = 4440 WHERE id = (SELECT hyrox FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT 'chrono corrigé : la course redevient la proposition',
       (SELECT l.activity_id FROM activity_plan_links l, t_ids i
         WHERE l.planned_kind = 'competition' AND l.planned_id = i.comp AND l.status <> 'rejected') = (SELECT race FROM t_ids), '';

-- ---------- Autre coach : rien ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', other_coach, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM public.link_activity_to_plan((SELECT warmup FROM t_ids), 'competition', (SELECT comp FROM t_ids));
  INSERT INTO t_res (name, ok, detail) VALUES ('rattachement : autre coach refusé', false, 'accepté');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('rattachement : autre coach refusé', true, SQLERRM);
END $$;
DO $$ BEGIN
  PERFORM public.report_session_pain(p_competition => (SELECT comp FROM t_ids), p_levels => '{"Genou": 4}'::jsonb);
  INSERT INTO t_res (name, ok, detail) VALUES ('douleur : autre coach refusé', false, 'accepté');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('douleur : autre coach refusé', true, SQLERRM);
END $$;
RESET ROLE;

-- ---------- L'athlète remplit sa séance ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', athlete, 'role', 'authenticated')::text, true) FROM t_ids;
SET LOCAL ROLE authenticated;
UPDATE competitions SET result_text = '12e / 80', result_url = 'https://results.hyrox.com/x', rpe_score = 9,
       athlete_comment = 'Dur après le sled'
 WHERE id = (SELECT comp FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT 'athlète : résultat, lien, RPE, bilan enregistrés',
       result_text = '12e / 80' AND rpe_score = 9 AND athlete_comment = 'Dur après le sled', ''
  FROM competitions WHERE id = (SELECT comp FROM t_ids);
DO $$ BEGIN
  UPDATE competitions SET result_url = 'javascript:alert(1)' WHERE id = (SELECT comp FROM t_ids);
  INSERT INTO t_res (name, ok, detail) VALUES ('lien non http refusé', false, 'accepté');
EXCEPTION WHEN check_violation THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('lien non http refusé', true, SQLERRM);
END $$;
DO $$ BEGIN
  UPDATE competitions SET rpe_score = 11 WHERE id = (SELECT comp FROM t_ids);
  INSERT INTO t_res (name, ok, detail) VALUES ('RPE 11 refusé', false, 'accepté');
EXCEPTION WHEN check_violation THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('RPE 11 refusé', true, SQLERRM);
END $$;

-- Choisit l'autre activité (l'échauffement) à la main, puis revient à la course.
SELECT public.link_activity_to_plan((SELECT warmup FROM t_ids), 'competition', (SELECT comp FROM t_ids));
INSERT INTO t_res (name, ok, detail)
SELECT 'choix manuel : confirmé sur l''autre activité, la course redevient libre',
       count(*) = 1 AND bool_and(l.activity_id = i.warmup AND l.status = 'confirmed'), string_agg(l.status, ',')
  FROM activity_plan_links l JOIN t_ids i ON l.athlete_id = i.athlete AND l.local_date = '2031-05-10' AND l.status <> 'rejected';
SELECT public.decide_plan_link((SELECT l.id FROM activity_plan_links l, t_ids i
                                 WHERE l.planned_id = i.comp AND l.status = 'confirmed'), false);
SELECT public.link_activity_to_plan((SELECT race FROM t_ids), 'competition', (SELECT comp FROM t_ids));
INSERT INTO t_res (name, ok, detail)
SELECT 'retour à la course : confirmée',
       (SELECT l.activity_id FROM activity_plan_links l, t_ids i
         WHERE l.planned_id = i.comp AND l.status = 'confirmed') = (SELECT race FROM t_ids), '';

-- Douleur de fin de compétition : blessure « compétition », rejouable sans doublon.
SELECT public.report_session_pain(p_competition => (SELECT comp FROM t_ids), p_levels => '{"Genou": 4}'::jsonb, p_note => 'fin de course');
SELECT public.report_session_pain(p_competition => (SELECT comp FROM t_ids), p_levels => '{"Genou": 5}'::jsonb);
RESET ROLE;
INSERT INTO t_res (name, ok, detail)
SELECT 'douleur : une blessure (contexte compétition), un suivi à 5',
       (SELECT count(*) FROM injury_followups f, t_ids i WHERE f.competition_id = i.comp) = 1
       AND (SELECT f.pain_level FROM injury_followups f, t_ids i WHERE f.competition_id = i.comp) = 5
       AND (SELECT e.context FROM injury_followups f JOIN medical_entries e ON e.id = f.entry_id, t_ids i
             WHERE f.competition_id = i.comp) = 'competition', '';
DO $$ BEGIN
  PERFORM public.report_session_pain(p_competition => (SELECT comp FROM t_ids), p_energy_assignment => gen_random_uuid(),
                                     p_levels => '{"Genou": 4}'::jsonb);
  INSERT INTO t_res (name, ok, detail) VALUES ('douleur : deux séances refusées', false, 'accepté');
EXCEPTION WHEN invalid_parameter_value THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('douleur : deux séances refusées', true, SQLERRM);
END $$;

-- Annulée : le lien confirmé reste (rien n'est perdu), plus de proposition automatique.
UPDATE competitions SET cancelled_at = now() WHERE id = (SELECT comp FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT 'annulée : confirmé gardé, aucune proposition auto',
       EXISTS (SELECT 1 FROM activity_plan_links l, t_ids i WHERE l.planned_id = i.comp AND l.status = 'confirmed')
       AND NOT EXISTS (SELECT 1 FROM activity_plan_links l, t_ids i
                        WHERE l.athlete_id = i.athlete AND l.local_date = '2031-05-10' AND l.status = 'auto'), '';

-- Supprimée : liens retirés, suivi de douleur détaché (blessure gardée).
DELETE FROM competitions WHERE id = (SELECT comp FROM t_ids);
INSERT INTO t_res (name, ok, detail)
SELECT 'supprimée : liens retirés, blessure gardée',
       NOT EXISTS (SELECT 1 FROM activity_plan_links l, t_ids i WHERE l.planned_kind = 'competition' AND l.planned_id = i.comp)
       AND EXISTS (SELECT 1 FROM medical_entries e, t_ids i WHERE e.athlete_id = i.athlete AND e.title = 'Douleur en séance'
                    AND e.context = 'competition' AND e.date = '2031-05-10'), '';

-- Appel d'avant (sans compétition) : toujours accepté par le serveur.
INSERT INTO t_res (name, ok, detail)
SELECT 'signature : appels muscu / énergie inchangés',
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'report_session_pain' AND pronargs = 5)
       AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'report_session_pain' AND pronargs = 4), '';
INSERT INTO t_res (name, ok, detail)
SELECT 'familles : any accepte tout, le reste inchangé',
       public.plan_family_accepts('any', NULL) AND public.plan_family_accepts('any', 'bike')
       AND public.plan_family_accepts('hyrox', 'run') AND NOT public.plan_family_accepts('run', 'bike')
       AND NOT public.plan_family_accepts(NULL, 'run'), '';

SELECT n, ok, name, detail FROM t_res ORDER BY ok, n;

ROLLBACK;
