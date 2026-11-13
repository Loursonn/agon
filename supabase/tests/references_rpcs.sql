-- Tests de la migration 20261108120000_references_rpcs.sql (lot 4).
-- Usage (base liée, rien n'est conservé) :
--   { echo 'BEGIN;' cat supabase/migrations/20261108120000_references_rpcs.sql; cat supabase/tests/references_rpcs.sql; echo 'ROLLBACK;' } > /tmp/x.sql
--   tail -1 /tmp/x.sql   # doit afficher ROLLBACK
--   supabase db query --linked -f /tmp/x.sql
-- Chaque ligne de résultat doit avoir ok = true.

CREATE TEMP TABLE t_ids AS
SELECT
  (SELECT a.id FROM profiles a JOIN profiles c ON c.id = a.coach_id
    WHERE a.role = 'athlete' AND a.coach_id <> a.id AND NOT coalesce(a.is_pending, false)
    ORDER BY c.is_admin LIMIT 1) AS athlete,
  NULL::uuid AS coach, NULL::uuid AS other_coach, NULL::uuid AS log_id, NULL::uuid AS notif_id;
UPDATE t_ids SET coach = (SELECT coach_id FROM profiles WHERE id = t_ids.athlete);
UPDATE t_ids SET other_coach = (
  SELECT id FROM profiles
   WHERE role IN ('coach', 'coach_athlete') AND id <> t_ids.coach AND NOT coalesce(is_admin, false)
     AND id NOT IN (SELECT co_coach_id FROM athlete_co_coaches WHERE athlete_id = t_ids.athlete)
   LIMIT 1);
CREATE TEMP TABLE t_res (name text, ok boolean, detail text);
GRANT ALL ON t_ids, t_res TO anon, authenticated;

-- ---------- ÉTAT APRÈS MIGRATION (superutilisateur) ----------
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM performance_logs WHERE metric_name IN ('FC Max', 'FC Repos', 'Vitesse Critique');
  INSERT INTO t_res VALUES ('données: plus de nom non canonique', n = 0, n::text);
  SELECT count(*) INTO n FROM performance_logs
   WHERE metric_name <> normalize_metric_name(metric_name) AND normalize_metric_name(metric_name) <> btrim(metric_name);
  INSERT INTO t_res VALUES ('données: aucun nom reconnu non canonique', n = 0, n::text);
  SELECT count(*) INTO n FROM (SELECT athlete_id, metric_name FROM performance_logs WHERE is_active_reference
                                GROUP BY 1, 2 HAVING count(*) > 1) d;
  INSERT INTO t_res VALUES ('données: une référence active par métrique', n = 0, n::text);
  -- Un nom libre (course, test maison) n'est pas renommé par la normalisation.
  INSERT INTO t_res VALUES ('normalize: nom personnalisé gardé', normalize_metric_name('Semi Bilbao') = 'Semi Bilbao', normalize_metric_name('Semi Bilbao'));
  INSERT INTO t_res VALUES ('normalize: FC Max', normalize_metric_name('FC Max') = 'FCmax', normalize_metric_name('FC Max'));
  INSERT INTO t_res VALUES ('normalize: vitesse critique', normalize_metric_name(' vitesse critique ') = 'VC', normalize_metric_name(' vitesse critique '));
  INSERT INTO t_res VALUES ('normalize: VO₂max', normalize_metric_name('VO₂max') = 'VO2max', normalize_metric_name('VO₂max'));
  INSERT INTO t_res VALUES ('normalize: FC-seuil', normalize_metric_name('FC-seuil') = 'FCseuil', normalize_metric_name('FC-seuil'));
  INSERT INTO t_res VALUES ('normalize: inconnu tel quel', normalize_metric_name(' Lactatémie ') = 'Lactatémie', normalize_metric_name(' Lactatémie '));
END $$;

-- Mesure en attente + notification (comme l'écran athlète), pour la validation.
WITH l AS (
  INSERT INTO performance_logs (athlete_id, metric_type, metric_name, value, unit, date, is_active_reference, coach_validated, created_by)
  SELECT athlete, 'fc_max', 'FC Max', 201, 'bpm', current_date, false, NULL, athlete FROM t_ids
  RETURNING id, athlete_id, metric_name
), n AS (
  INSERT INTO performance_notifications (coach_id, athlete_id, performance_log_id, status)
  SELECT (SELECT coach FROM t_ids), athlete_id, id, 'pending' FROM l RETURNING id, performance_log_id
)
UPDATE t_ids SET log_id = n.performance_log_id, notif_id = n.id FROM n;
DO $$ DECLARE v text; BEGIN
  SELECT metric_name INTO v FROM performance_logs WHERE id = (SELECT log_id FROM t_ids);
  INSERT INTO t_res VALUES ('trigger: « FC Max » enregistré « FCmax »', v = 'FCmax', v);
END $$;

-- ---------- ANON ----------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$ BEGIN
  BEGIN PERFORM set_performance_reference(gen_random_uuid(), 'VMA', 18);
        INSERT INTO t_res VALUES ('anon: set_performance_reference refusé', false, 'exécuté');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res VALUES ('anon: set_performance_reference refusé', true, SQLERRM); END;
  BEGIN PERFORM save_fc_zones(gen_random_uuid(), '{"FCzone_Z1_max": 120}'::jsonb);
        INSERT INTO t_res VALUES ('anon: save_fc_zones refusé', false, 'exécuté');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res VALUES ('anon: save_fc_zones refusé', true, SQLERRM); END;
  BEGIN PERFORM review_performance_notification(gen_random_uuid(), gen_random_uuid(), true);
        INSERT INTO t_res VALUES ('anon: review refusé', false, 'exécuté');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res VALUES ('anon: review refusé', true, SQLERRM); END;
END $$;
RESET ROLE;

-- ---------- ATHLÈTE ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT athlete FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; v_id uuid; r record; n int; BEGIN
  SELECT * INTO ids FROM t_ids;

  v_id := set_performance_reference(ids.athlete, 'fc repos', 48, NULL, NULL, true);
  SELECT * INTO r FROM performance_logs WHERE id = v_id;
  INSERT INTO t_res VALUES ('athlète: référence posée, nom canonique', r.metric_name = 'FCrepos' AND r.is_active_reference, r.metric_name);
  INSERT INTO t_res VALUES ('athlète: validation coach non forcée', r.coach_validated IS NULL, coalesce(r.coach_validated::text, 'null'));
  INSERT INTO t_res VALUES ('athlète: unité par défaut', r.unit = 'bpm' AND r.metric_type = 'reference', r.unit || ' / ' || r.metric_type);
  SELECT count(*) INTO n FROM performance_logs WHERE athlete_id = ids.athlete AND metric_name = 'FCrepos' AND is_active_reference;
  INSERT INTO t_res VALUES ('athlète: une seule FCrepos active', n = 1, n::text);

  BEGIN PERFORM set_performance_reference(ids.other_coach, 'VMA', 18);
        INSERT INTO t_res VALUES ('athlète: référence d''un autre refusée', false, 'exécuté');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res VALUES ('athlète: référence d''un autre refusée', true, SQLERRM); END;

  n := save_fc_zones(ids.athlete, '{"FCzone_Z0_min": 61, "FCzone_Z1_max": 121}'::jsonb);
  INSERT INTO t_res VALUES ('athlète: ses zones enregistrées', n = 2, n::text);
  n := save_fc_zones(ids.athlete, '{"FCzone_Z0_min": 61, "FCzone_Z1_max": 121}'::jsonb);
  INSERT INTO t_res VALUES ('athlète: mêmes zones → aucune ligne', n = 0, n::text);

  BEGIN PERFORM review_performance_notification(ids.notif_id, ids.log_id, true);
        INSERT INTO t_res VALUES ('athlète: valider sa propre mesure refusé', false, 'exécuté');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res VALUES ('athlète: valider sa propre mesure refusé', true, SQLERRM); END;

  INSERT INTO performance_logs (athlete_id, metric_type, metric_name, value, unit, date, is_active_reference, created_by)
  VALUES (ids.athlete, 'vitesse_critique', 'Vitesse Critique', 15.2, 'km/h', current_date, false, ids.athlete)
  RETURNING id INTO v_id;
  SELECT metric_name INTO r FROM performance_logs WHERE id = v_id;
  INSERT INTO t_res VALUES ('athlète: insert direct normalisé', r.metric_name = 'VC', r.metric_name);
END $$;
RESET ROLE;

-- ---------- COACH ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT coach FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; v_id uuid; r record; n int; total_before int; total_after int; BEGIN
  SELECT * INTO ids FROM t_ids;

  v_id := set_performance_reference(ids.athlete, 'VMA', 18.5, 'km/h', current_date, true);
  SELECT * INTO r FROM performance_logs WHERE id = v_id;
  INSERT INTO t_res VALUES ('coach: VMA posée et validée', r.is_active_reference AND r.coach_validated AND r.created_by = ids.coach, r.value::text);
  SELECT count(*) INTO n FROM performance_logs WHERE athlete_id = ids.athlete AND metric_name = 'VMA' AND is_active_reference;
  INSERT INTO t_res VALUES ('coach: une seule VMA active', n = 1, n::text);

  SELECT count(*) INTO total_before FROM performance_logs WHERE athlete_id = ids.athlete AND metric_type = 'zone';
  n := save_fc_zones(ids.athlete, '{"FCzone_Z0_min": 60, "FCzone_Z1_max": 120, "FCzone_Z2_max": 140, "FCzone_Z3_max": 155, "FCzone_Z4_max": 170, "FCzone_Z5_max": 190}'::jsonb);
  n := save_fc_zones(ids.athlete, '{"FCzone_Z0_min": 60, "FCzone_Z1_max": 120, "FCzone_Z2_max": 140, "FCzone_Z3_max": 155, "FCzone_Z4_max": 170, "FCzone_Z5_max": 190}'::jsonb);
  INSERT INTO t_res VALUES ('coach: zones inchangées → aucune ligne', n = 0, n::text);
  n := save_fc_zones(ids.athlete, '{"FCzone_Z0_min": 60, "FCzone_Z1_max": 120, "FCzone_Z2_max": 142, "FCzone_Z3_max": 155, "FCzone_Z4_max": 170, "FCzone_Z5_max": 190}'::jsonb);
  INSERT INTO t_res VALUES ('coach: une zone changée → une ligne', n = 1, n::text);
  SELECT count(*) INTO total_after FROM performance_logs WHERE athlete_id = ids.athlete AND metric_type = 'zone';
  INSERT INTO t_res VALUES ('coach: au plus 7 lignes de zones créées', total_after - total_before <= 7, (total_after - total_before)::text);
  SELECT count(*) INTO n FROM (SELECT metric_name FROM performance_logs WHERE athlete_id = ids.athlete AND metric_type = 'zone' AND is_active_reference GROUP BY 1 HAVING count(*) > 1) d;
  INSERT INTO t_res VALUES ('coach: une zone active par borne', n = 0, n::text);
  SELECT value INTO r FROM performance_logs WHERE athlete_id = ids.athlete AND metric_name = 'FCzone_Z2_max' AND is_active_reference;
  INSERT INTO t_res VALUES ('coach: zone Z2 à jour', r.value = 142, r.value::text);

  BEGIN PERFORM save_fc_zones(ids.athlete, '{"FCmax": 190}'::jsonb);
        INSERT INTO t_res VALUES ('coach: clé de zone inconnue refusée', false, 'exécuté');
  EXCEPTION WHEN invalid_parameter_value THEN INSERT INTO t_res VALUES ('coach: clé de zone inconnue refusée', true, SQLERRM); END;
  BEGIN PERFORM save_fc_zones(ids.athlete, '{"FCzone_Z1_max": "abc"}'::jsonb);
        INSERT INTO t_res VALUES ('coach: valeur de zone invalide refusée', false, 'exécuté');
  EXCEPTION WHEN invalid_parameter_value THEN INSERT INTO t_res VALUES ('coach: valeur de zone invalide refusée', true, SQLERRM); END;

  PERFORM review_performance_notification(ids.notif_id, ids.log_id, true);
  SELECT * INTO r FROM performance_logs WHERE id = ids.log_id;
  INSERT INTO t_res VALUES ('coach: mesure validée et active', r.is_active_reference AND r.coach_validated, r.metric_name);
  SELECT count(*) INTO n FROM performance_logs WHERE athlete_id = ids.athlete AND metric_name = 'FCmax' AND is_active_reference;
  INSERT INTO t_res VALUES ('coach: une seule FCmax active', n = 1, n::text);
  SELECT count(*) INTO n FROM performance_notifications WHERE id = ids.notif_id AND status = 'approved' AND resolved_at IS NOT NULL;
  INSERT INTO t_res VALUES ('coach: notification approuvée', n = 1, n::text);

  PERFORM review_performance_notification(ids.notif_id, ids.log_id, false);
  SELECT * INTO r FROM performance_logs WHERE id = ids.log_id;
  INSERT INTO t_res VALUES ('coach: rejet → non validée', r.coach_validated = false, coalesce(r.coach_validated::text, 'null'));

  BEGIN PERFORM review_performance_notification(ids.notif_id, gen_random_uuid(), true);
        INSERT INTO t_res VALUES ('coach: notification / mesure incohérentes refusées', false, 'exécuté');
  EXCEPTION WHEN no_data_found THEN INSERT INTO t_res VALUES ('coach: notification / mesure incohérentes refusées', true, SQLERRM); END;
END $$;
RESET ROLE;

-- ---------- AUTRE COACH ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT other_coach FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  INSERT INTO t_res VALUES ('autre coach: sans lien avec l''athlète', NOT is_coach_of(ids.athlete), '');
  BEGIN PERFORM set_performance_reference(ids.athlete, 'VMA', 25);
        INSERT INTO t_res VALUES ('autre coach: référence refusée', false, 'exécuté');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res VALUES ('autre coach: référence refusée', true, SQLERRM); END;
  BEGIN PERFORM save_fc_zones(ids.athlete, '{"FCzone_Z1_max": 100}'::jsonb);
        INSERT INTO t_res VALUES ('autre coach: zones refusées', false, 'exécuté');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res VALUES ('autre coach: zones refusées', true, SQLERRM); END;
  BEGIN PERFORM review_performance_notification(ids.notif_id, ids.log_id, true);
        INSERT INTO t_res VALUES ('autre coach: validation refusée', false, 'exécuté');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res VALUES ('autre coach: validation refusée', true, SQLERRM); END;
END $$;
RESET ROLE;

SELECT name, ok, left(detail, 90) AS detail FROM t_res;
