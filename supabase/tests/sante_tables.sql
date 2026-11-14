-- Tests de 20261110100000_sante_tables.sql : copie, synchro app_data → tables,
-- RLS (athlète, coach, co-coach, autre coach, staff, anon), erreurs avalées,
-- suppression de compte en cascade.
-- Toujours annulé (ROLLBACK final) : rien ne reste en base.
--
-- Après application de la migration :
--   supabase db query --linked -f supabase/tests/sante_tables.sql
-- Avant application (migration jouée DEUX fois pour vérifier l'idempotence,
-- dans la même transaction, puis annulée) :
--   M=supabase/migrations/20261110100000_sante_tables.sql
--   (echo 'BEGIN;'; cat $M; cat $M; sed '/^BEGIN;$/d' supabase/tests/sante_tables.sql) > "$TMPDIR/s.sql"
--   supabase db query --linked -f "$TMPDIR/s.sql"
-- Chaque ligne k → v : la valeur attendue est dans le libellé. Jours de test
-- en 2099 : aucune collision avec une vraie saisie. Seuls des comptes et des
-- valeurs de test sont affichés (aucune donnée d'athlète).

BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated, anon; GRANT ALL ON SEQUENCE r_n_seq TO authenticated, anon;

-- ===== 0. Copie initiale : comparée à un comptage indépendant ================
WITH wh AS (
  SELECT d.athlete_id, to_date(x.k, 'YYYYMMDD') AS day, x.v
    FROM app_data d, jsonb_each(d.value) x(k, v)
   WHERE d.key = 'asp:wh' AND jsonb_typeof(d.value) = 'object' AND x.k ~ '^[0-9]{8}$' AND jsonb_typeof(x.v) = 'object'
), arch AS (
  SELECT d.athlete_id, to_date(x.k, 'YYYYMMDD') AS day
    FROM app_data d, jsonb_array_elements(d.value) b,
         jsonb_each(CASE WHEN jsonb_typeof(b->'wellnessHistory') = 'object' THEN b->'wellnessHistory' ELSE '{}' END) x(k, v)
   WHERE d.key = 'asp:blockHistory' AND jsonb_typeof(d.value) = 'array' AND x.k ~ '^[0-9]{8}$' AND jsonb_typeof(x.v) = 'object'
), expected AS (
  SELECT athlete_id, day, false AS archived FROM wh
  UNION SELECT athlete_id, day, true FROM arch a WHERE NOT EXISTS (SELECT 1 FROM wh WHERE wh.athlete_id = a.athlete_id AND wh.day = a.day)
)
INSERT INTO r(k,v)
SELECT 'P1 saisies wellness copiées = attendues (true)',
  ((SELECT count(*) FROM expected) = (SELECT count(*) FROM wellness_entries)
   AND NOT EXISTS (SELECT athlete_id, day, archived FROM expected EXCEPT SELECT athlete_id, day, archived FROM wellness_entries))::text
UNION ALL SELECT 'P2 dont archivées seulement (= attendu, true)',
  ((SELECT count(*) FROM expected WHERE archived) = (SELECT count(*) FROM wellness_entries WHERE archived))::text
UNION ALL SELECT 'P3 score calculé = score stocké par l''app, quand les 5 notes sont lisibles (0 écart)',
  (SELECT count(*) FROM wellness_entries e JOIN wh ON wh.athlete_id = e.athlete_id AND wh.day = e.day
    WHERE e.score IS NOT NULL AND jsonb_typeof(wh.v->'score') = 'number' AND (wh.v->>'score')::numeric <> e.score)::text
UNION ALL SELECT 'P4 score absent ⇔ au moins une note hors 1-5 (0 écart)',
  (SELECT count(*) FROM wellness_entries e JOIN wh ON wh.athlete_id = e.athlete_id AND wh.day = e.day
    WHERE (e.score IS NULL) <> EXISTS (SELECT 1 FROM unnest(ARRAY['fatigue','sommeil','stress','energie','doms']) f
                                        WHERE jsonb_typeof(wh.v->f) <> 'number' OR (wh.v->>f)::numeric NOT BETWEEN 1 AND 5))::text
UNION ALL SELECT 'P5 commentaire blessure : mêmes saisies (0 écart)',
  (SELECT count(*) FROM wellness_entries e JOIN wh ON wh.athlete_id = e.athlete_id AND wh.day = e.day
    WHERE (e.injury_note IS NOT NULL) <> (coalesce(btrim(wh.v->>'injComment'), '') <> ''))::text
UNION ALL SELECT 'P6 poids saisi avec le wellness : mêmes saisies (0 écart)',
  (SELECT count(*) FROM wellness_entries e JOIN wh ON wh.athlete_id = e.athlete_id AND wh.day = e.day
    WHERE e.weight_kg IS DISTINCT FROM CASE WHEN jsonb_typeof(wh.v->'poids') = 'number' AND (wh.v->>'poids')::numeric > 0 THEN (wh.v->>'poids')::numeric END)::text
UNION ALL SELECT 'P7 heure de coucher : mêmes saisies (0 écart)',
  (SELECT count(*) FROM wellness_entries e JOIN wh ON wh.athlete_id = e.athlete_id AND wh.day = e.day
    WHERE (e.bedtime IS NOT NULL) <> (jsonb_typeof(wh.v->'coucher') = 'object'))::text;

WITH wl AS (
  SELECT d.athlete_id, to_date(x.k, 'YYYYMMDD') AS day, (x.v #>> '{}')::numeric AS kg
    FROM app_data d, jsonb_each(d.value) x(k, v)
   WHERE d.key = 'asp:wlog' AND x.k ~ '^[0-9]{8}$' AND jsonb_typeof(x.v) = 'number'
)
INSERT INTO r(k,v)
SELECT 'P8 pesées copiées à l''identique (true)',
  ((SELECT count(*) FROM wl) = (SELECT count(*) FROM body_weight_logs)
   AND NOT EXISTS (SELECT athlete_id, day, kg FROM wl EXCEPT SELECT athlete_id, day, kg FROM body_weight_logs))::text
UNION ALL SELECT 'P9 paliers copiés (true)',
  ((SELECT count(DISTINCT (d.athlete_id, e->>'date', e->>'kg')) FROM app_data d, jsonb_array_elements(d.value) e WHERE d.key = 'asp:wmile')
   = (SELECT count(*) FROM body_weight_milestones))::text
UNION ALL SELECT 'P10 poids de référence : une ligne par asp:bw (true)',
  ((SELECT count(*) FROM app_data WHERE key = 'asp:bw' AND (value->>'current')::numeric > 0)
   = (SELECT count(*) FROM body_weight_goals WHERE reference_kg IS NOT NULL))::text
UNION ALL SELECT 'P11 objectif 0 → NULL (true)',
  ((SELECT count(*) FROM app_data WHERE key = 'asp:bw' AND coalesce((value->>'target')::numeric, 0) = 0)
   = (SELECT count(*) FROM body_weight_goals WHERE target_kg IS NULL))::text
UNION ALL SELECT 'P12 aucune erreur de synchro à la copie (0)', (SELECT count(*) FROM health_sync_errors)::text;

-- Resync rejouée : aucune ligne réécrite (même ctid partout).
CREATE TEMP TABLE snap ON COMMIT DROP AS
SELECT 'w' AS t, athlete_id, day::text AS k, ctid::text AS c FROM wellness_entries
UNION ALL SELECT 'l', athlete_id, day::text, ctid::text FROM body_weight_logs
UNION ALL SELECT 'm', athlete_id, day::text || kg, ctid::text FROM body_weight_milestones
UNION ALL SELECT 'g', athlete_id, '', ctid::text FROM body_weight_goals;
SELECT health_resync(NULL);
INSERT INTO r(k,v) SELECT 'P13 resync rejouée : rien ne bouge (0 écart)',
  (SELECT count(*) FROM (
     SELECT * FROM snap EXCEPT
     (SELECT 'w', athlete_id, day::text, ctid::text FROM wellness_entries
      UNION ALL SELECT 'l', athlete_id, day::text, ctid::text FROM body_weight_logs
      UNION ALL SELECT 'm', athlete_id, day::text || kg, ctid::text FROM body_weight_milestones
      UNION ALL SELECT 'g', athlete_id, '', ctid::text FROM body_weight_goals)) z)::text;

-- ===== Jeu de test ==========================================================
CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT a.id AS athlete, a.coach_id AS coach,
  (SELECT p.id FROM profiles p WHERE p.role IN ('coach','coach_athlete') AND p.id <> a.coach_id
     AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = a.id AND cc.co_coach_id = p.id)
     ORDER BY p.created_at LIMIT 1) AS other_coach,
  (SELECT o.id FROM profiles o WHERE o.id <> a.id AND o.role = 'athlete'
     AND EXISTS (SELECT 1 FROM app_data d WHERE d.athlete_id = o.id AND d.key = 'asp:wh')
     AND EXISTS (SELECT 1 FROM app_data d WHERE d.athlete_id = o.id AND d.key = 'asp:wlog')
     ORDER BY o.created_at LIMIT 1) AS other_athlete,
  (SELECT p.id FROM profiles p WHERE p.id <> a.id AND p.id <> a.coach_id AND p.role = 'athlete'
     AND p.coach_id IS DISTINCT FROM a.coach_id ORDER BY p.created_at LIMIT 1) AS staff,
  (SELECT cc.co_coach_id FROM athlete_co_coaches cc
     WHERE EXISTS (SELECT 1 FROM wellness_entries w WHERE w.athlete_id = cc.athlete_id) LIMIT 1) AS cocoach,
  (SELECT cc.athlete_id FROM athlete_co_coaches cc
     WHERE EXISTS (SELECT 1 FROM wellness_entries w WHERE w.athlete_id = cc.athlete_id) LIMIT 1) AS cocoach_athlete,
  (SELECT count(*) FROM wellness_entries w WHERE w.athlete_id = a.id) AS n_well0,
  (SELECT count(*) FROM body_weight_logs w WHERE w.athlete_id = a.id) AS n_wlog0,
  (SELECT ctid::text FROM wellness_entries w WHERE w.athlete_id = a.id ORDER BY day LIMIT 1) AS ctid0
FROM profiles a
WHERE a.role = 'athlete' AND a.coach_id IS NOT NULL AND a.coach_id <> a.id
  AND EXISTS (SELECT 1 FROM app_data d WHERE d.athlete_id = a.id AND d.key = 'asp:wh' AND jsonb_typeof(d.value) = 'object')
  AND EXISTS (SELECT 1 FROM app_data d WHERE d.athlete_id = a.id AND d.key = 'asp:wlog' AND jsonb_typeof(d.value) = 'object')
  AND EXISTS (SELECT 1 FROM app_data d WHERE d.athlete_id = a.id AND d.key = 'asp:bw')
ORDER BY a.created_at LIMIT 1;
GRANT SELECT ON ids TO authenticated, anon;
INSERT INTO r(k,v) SELECT '00 jeu de test complet (true)',
  (athlete IS NOT NULL AND coach IS NOT NULL AND other_coach IS NOT NULL AND other_athlete IS NOT NULL AND staff IS NOT NULL)::text FROM ids;

SET LOCAL ROLE authenticated;

-- ===== 1. Athlète : écritures par les RPC ===================================
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role','authenticated')::text FROM ids), true);
SELECT wellness_set_day(athlete, '2099-01-02', '{"fatigue":5,"sommeil":4,"stress":3,"energie":2,"doms":1,"score":60,
  "injComment":"  Genou  ","coucher":{"h":23,"m":15},"reveil":{"h":7,"m":0},"sleepDur":7.75,"sleepInterrupt":false,
  "sleepInterruptNote":null,"domsZones":["quadri",3],"domsPoints":[{"id":"p1","x":12.5,"y":40,"side":"front","intensity":2},{"x":1,"y":2,"side":"top"}],
  "poids":72.4}'::jsonb) FROM ids;
INSERT INTO r(k,v) SELECT 'W1 RPC → ligne (60 / Genou / 23:15:00 / 07:00:00 / 7.75 / {quadri} / 1 / 72.4 / false)',
  concat_ws(' / ', score, injury_note, bedtime, wake, sleep_hours, doms_zones::text, jsonb_array_length(doms_points), weight_kg, sleep_interrupted)
  FROM wellness_entries WHERE athlete_id = (SELECT athlete FROM ids) AND day = '2099-01-02';
INSERT INTO r(k,v) SELECT 'W2 point DOMS normalisé ({"x": 12.5, "y": 40, "id": "p1", "side": "front", "intensity": 2})',
  (doms_points->0)::text FROM wellness_entries WHERE athlete_id = (SELECT athlete FROM ids) AND day = '2099-01-02';

-- Ancien client : réécrit TOUT le blob (même jour en compact et en ISO, note hors échelle).
UPDATE app_data SET value = value || '{"20990103": {"date":"20990103","fatigue":7,"sommeil":"4","stress":4,"energie":4,"doms":4},
                                      "2099-01-03": {"date":"2099-01-03","fatigue":1,"sommeil":1,"stress":1,"energie":1,"doms":1},
                                      "2099-01-04": {"fatigue":3,"sommeil":3,"stress":3,"energie":3,"doms":3}}'::jsonb
 WHERE athlete_id = (SELECT athlete FROM ids) AND key = 'asp:wh';
INSERT INTO r(k,v) SELECT 'W3 blob réécrit : clé compacte gagne, note 7 → NULL, "4" lu (∅ / 4 / ∅)',
  concat_ws(' / ', coalesce(fatigue::text, '∅'), sommeil, coalesce(score::text, '∅'))
  FROM wellness_entries WHERE athlete_id = (SELECT athlete FROM ids) AND day = '2099-01-03';
INSERT INTO r(k,v) SELECT 'W4 clé ISO seule lue (60)', score::text
  FROM wellness_entries WHERE athlete_id = (SELECT athlete FROM ids) AND day = '2099-01-04';
INSERT INTO r(k,v) SELECT 'W5 les vraies saisies ne sont pas réécrites (même ctid, true)',
  ((SELECT ctid::text FROM wellness_entries w WHERE w.athlete_id = i.athlete ORDER BY day LIMIT 1) = i.ctid0)::text FROM ids i;
INSERT INTO r(k,v) SELECT 'W6 total athlète = initial + 3 (true)',
  ((SELECT count(*) FROM wellness_entries w WHERE w.athlete_id = i.athlete) = i.n_well0 + 3)::text FROM ids i;

SELECT wellness_delete_day(athlete, '2099-01-02') FROM ids;
INSERT INTO r(k,v) SELECT 'W7 RPC suppression → ligne retirée (0)',
  count(*)::text FROM wellness_entries WHERE athlete_id = (SELECT athlete FROM ids) AND day = '2099-01-02';
UPDATE app_data SET value = value - '20990103' - '2099-01-03' - '2099-01-04'
 WHERE athlete_id = (SELECT athlete FROM ids) AND key = 'asp:wh';
INSERT INTO r(k,v) SELECT 'W8 jours retirés du blob → lignes retirées, retour à l''initial (true)',
  ((SELECT count(*) FROM wellness_entries w WHERE w.athlete_id = i.athlete) = i.n_well0)::text FROM ids i;

-- Archive : deux blocs, le plus récent gagne ; asp:wh prioritaire ; asp:wh = {} (nouveau bloc).
INSERT INTO app_data(athlete_id, key, value)
SELECT athlete, 'asp:blockHistory', '[{"wellnessHistory":{"20990110":{"fatigue":2,"sommeil":2,"stress":2,"energie":2,"doms":2}}},
                                      {"wellnessHistory":{"20990110":{"fatigue":3,"sommeil":3,"stress":3,"energie":3,"doms":3},
                                                          "20990111":{"fatigue":4,"sommeil":4,"stress":4,"energie":4,"doms":4}}}]'::jsonb FROM ids
ON CONFLICT (athlete_id, key) DO UPDATE SET value = app_data.value || EXCLUDED.value;
INSERT INTO r(k,v) SELECT 'A1 archive : bloc le plus récent gagne (60 true / 80 true)',
  string_agg(score || ' ' || archived, ' / ' ORDER BY day)
  FROM wellness_entries WHERE athlete_id = (SELECT athlete FROM ids) AND day IN ('2099-01-10', '2099-01-11');
SELECT wellness_set_day(athlete, '2099-01-11', '{"fatigue":5,"sommeil":5,"stress":5,"energie":5,"doms":5}'::jsonb) FROM ids;
INSERT INTO r(k,v) SELECT 'A2 saisie courante prioritaire sur l''archive (100 false)',
  score || ' ' || archived FROM wellness_entries WHERE athlete_id = (SELECT athlete FROM ids) AND day = '2099-01-11';
UPDATE app_data SET value = '{}'::jsonb WHERE athlete_id = (SELECT athlete FROM ids) AND key = 'asp:wh';
INSERT INTO r(k,v) SELECT 'A3 asp:wh vidé (nouveau bloc) : ne restent que les archivées (0 / 80 true)',
  (SELECT count(*) FROM wellness_entries WHERE athlete_id = (SELECT athlete FROM ids) AND NOT archived)::text || ' / ' ||
  (SELECT score || ' ' || archived FROM wellness_entries WHERE athlete_id = (SELECT athlete FROM ids) AND day = '2099-01-11');

-- ===== 2. Poids =============================================================
SELECT weight_set_day(athlete, '2099-01-02', 72.5) FROM ids;
INSERT INTO r(k,v) SELECT 'K1 RPC pesée → ligne (72.5)',
  kg::text FROM body_weight_logs WHERE athlete_id = (SELECT athlete FROM ids) AND day = '2099-01-02';
UPDATE app_data SET value = value || '{"20990103": "71.5", "20990104": 0, "20990105": "abc"}'::jsonb
 WHERE athlete_id = (SELECT athlete FROM ids) AND key = 'asp:wlog';
INSERT INTO r(k,v) SELECT 'K2 blob réécrit : texte numérique lu, 0 et texte écartés (71.5)',
  string_agg(kg::text, ',' ORDER BY day) FROM body_weight_logs
  WHERE athlete_id = (SELECT athlete FROM ids) AND day BETWEEN '2099-01-03' AND '2099-01-05';
UPDATE app_data SET value = value - '20990102' - '20990103' - '20990104' - '20990105'
 WHERE athlete_id = (SELECT athlete FROM ids) AND key = 'asp:wlog';
INSERT INTO r(k,v) SELECT 'K3 retour à l''initial (true)',
  ((SELECT count(*) FROM body_weight_logs w WHERE w.athlete_id = i.athlete) = i.n_wlog0)::text FROM ids i;
SELECT weight_record_milestone(athlete, '2099-01-04', 72.7) FROM ids;
INSERT INTO r(k,v) SELECT 'K4 palier → ligne + référence (1 / 72.7)',
  (SELECT count(*) FROM body_weight_milestones WHERE athlete_id = (SELECT athlete FROM ids) AND day = '2099-01-04' AND kg = 72.7)::text
  || ' / ' || (SELECT reference_kg::text FROM body_weight_goals WHERE athlete_id = (SELECT athlete FROM ids));
UPDATE app_data SET value = '{"current": 72.7, "target": 70}'::jsonb WHERE athlete_id = (SELECT athlete FROM ids) AND key = 'asp:bw';
INSERT INTO r(k,v) SELECT 'K5 objectif écrit par l''ancien client (70)',
  target_kg::text FROM body_weight_goals WHERE athlete_id = (SELECT athlete FROM ids);
UPDATE app_data SET value = '{"current": 72.7, "target": 0}'::jsonb WHERE athlete_id = (SELECT athlete FROM ids) AND key = 'asp:bw';
INSERT INTO r(k,v) SELECT 'K6 objectif 0 → NULL (∅)',
  coalesce(target_kg::text, '∅') FROM body_weight_goals WHERE athlete_id = (SELECT athlete FROM ids);

-- ===== 3. Lectures et écritures directes (RLS) ==============================
INSERT INTO r(k,v) SELECT 'R1 athlète voit ses lignes (true)',
  ((SELECT count(*) FROM wellness_entries) > 0 AND (SELECT count(*) FROM body_weight_logs) > 0
   AND (SELECT count(*) FROM body_weight_goals) = 1)::text;
INSERT INTO r(k,v) SELECT 'R2 athlète ne voit que les siennes (0 / 0 / 0 / 0)',
  (SELECT count(*) FROM wellness_entries WHERE athlete_id <> auth.uid()) || ' / ' ||
  (SELECT count(*) FROM body_weight_logs WHERE athlete_id <> auth.uid()) || ' / ' ||
  (SELECT count(*) FROM body_weight_milestones WHERE athlete_id <> auth.uid()) || ' / ' ||
  (SELECT count(*) FROM body_weight_goals WHERE athlete_id <> auth.uid());
INSERT INTO r(k,v) SELECT 'R3 athlète ne lit pas le journal des erreurs (0)', count(*)::text FROM health_sync_errors;
DO $$ BEGIN
  INSERT INTO wellness_entries(athlete_id, day, fatigue) VALUES (auth.uid(), '2099-02-01', 5);
  INSERT INTO r(k,v) VALUES ('R4 athlète écrit wellness_entries en direct', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('R4 athlète écrit wellness_entries en direct', 'refusé (OK) ' || SQLSTATE); END $$;
DO $$ BEGIN
  UPDATE body_weight_logs SET kg = 1 WHERE athlete_id = auth.uid();
  INSERT INTO r(k,v) VALUES ('R5 athlète modifie body_weight_logs en direct', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('R5 athlète modifie body_weight_logs en direct', 'refusé (OK) ' || SQLSTATE); END $$;
DO $$ BEGIN
  DELETE FROM body_weight_goals WHERE athlete_id = auth.uid();
  INSERT INTO r(k,v) VALUES ('R6 athlète supprime body_weight_goals en direct', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('R6 athlète supprime body_weight_goals en direct', 'refusé (OK) ' || SQLSTATE); END $$;
DO $$ BEGIN
  PERFORM health_resync(auth.uid());
  INSERT INTO r(k,v) VALUES ('R7 athlète appelle health_resync', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('R7 athlète appelle health_resync', 'refusé (OK) ' || SQLSTATE); END $$;

-- Coach référent
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'C1 coach voit son athlète (true)',
  ((SELECT count(*) FROM wellness_entries WHERE athlete_id = (SELECT athlete FROM ids)) > 0
   AND (SELECT count(*) FROM body_weight_logs WHERE athlete_id = (SELECT athlete FROM ids)) > 0
   AND (SELECT count(*) FROM body_weight_goals WHERE athlete_id = (SELECT athlete FROM ids)) = 1)::text;
INSERT INTO r(k,v) SELECT 'C2 coach ne voit que ses athlètes (0)',
  count(*)::text FROM wellness_entries w WHERE NOT is_coach_of(w.athlete_id);

-- Co-coach (s'il en existe un avec des saisies)
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coalesce(cocoach, coach), 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'C3 co-coach voit l''athlète co-coaché (true, ou n/a)',
  CASE WHEN (SELECT cocoach FROM ids) IS NULL THEN 'n/a'
       ELSE ((SELECT count(*) FROM wellness_entries WHERE athlete_id = (SELECT cocoach_athlete FROM ids)) > 0)::text END;

-- Autre coach
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', other_coach, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'O1 autre coach ne voit rien de l''athlète (0 / 0 / 0 / 0)',
  (SELECT count(*) FROM wellness_entries WHERE athlete_id = (SELECT athlete FROM ids)) || ' / ' ||
  (SELECT count(*) FROM body_weight_logs WHERE athlete_id = (SELECT athlete FROM ids)) || ' / ' ||
  (SELECT count(*) FROM body_weight_milestones WHERE athlete_id = (SELECT athlete FROM ids)) || ' / ' ||
  (SELECT count(*) FROM body_weight_goals WHERE athlete_id = (SELECT athlete FROM ids));

-- Staff : lien avec bien-être + nutrition en lecture, d'abord sans consentement.
RESET ROLE;
SELECT set_config('agon.staff_accept', 'on', true);
INSERT INTO athlete_staff(athlete_id, staff_id, profession, permissions, added_by, added_by_role)
SELECT athlete, staff, 'kine', staff_default_permissions('kine') || '{"wellness":"read","nutrition":"read"}'::jsonb, coach, 'coach' FROM ids;
SELECT set_config('agon.staff_accept', 'off', true);
-- Journal en ajout seul (dernière décision par seq) : on ajoute un refus.
INSERT INTO user_consents(user_id, purpose, granted, doc_version, statement)
SELECT athlete, 'staff_sharing', false, 'test', 'TEST RLS — annulé' FROM ids;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', staff, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'S1 staff sans consentement : rien (0 / 0)',
  (SELECT count(*) FROM wellness_entries WHERE athlete_id = (SELECT athlete FROM ids)) || ' / ' ||
  (SELECT count(*) FROM body_weight_logs WHERE athlete_id = (SELECT athlete FROM ids));
RESET ROLE;
INSERT INTO user_consents(user_id, purpose, granted, doc_version, statement)
SELECT athlete, 'staff_sharing', true, 'test', 'TEST RLS — annulé' FROM ids;
-- Une saisie courante (non archivée) en plus des archivées déjà présentes.
INSERT INTO wellness_entries(athlete_id, day, archived)
SELECT athlete, '2099-02-01', false FROM ids ON CONFLICT DO NOTHING;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', staff, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'S2 staff avec consentement : wellness courant et poids, jamais d''archivée (true)',
  ((SELECT count(*) FROM wellness_entries WHERE athlete_id = (SELECT athlete FROM ids) AND NOT archived) > 0
   AND (SELECT count(*) FROM wellness_entries WHERE athlete_id = (SELECT athlete FROM ids) AND archived) = 0
   AND (SELECT count(*) FROM body_weight_logs WHERE athlete_id = (SELECT athlete FROM ids)) > 0)::text;
-- (le « pro » de test est un athlète : ses propres lignes ne comptent pas)
INSERT INTO r(k,v) SELECT 'S3 staff : rien d''un autre athlète (0)',
  count(*)::text FROM wellness_entries WHERE athlete_id NOT IN ((SELECT athlete FROM ids), (SELECT staff FROM ids));
-- Le coach retire les deux domaines (seul le coach principal peut changer les droits).
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role','authenticated')::text FROM ids), true);
UPDATE athlete_staff SET permissions = permissions - 'wellness' - 'nutrition' WHERE staff_id = (SELECT staff FROM ids) AND athlete_id = (SELECT athlete FROM ids);
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', staff, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'S4 staff sans le domaine : rien (0 / 0)',
  (SELECT count(*) FROM wellness_entries WHERE athlete_id = (SELECT athlete FROM ids)) || ' / ' ||
  (SELECT count(*) FROM body_weight_goals WHERE athlete_id = (SELECT athlete FROM ids));

-- anon
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$ BEGIN
  PERFORM count(*) FROM wellness_entries;
  INSERT INTO r(k,v) VALUES ('N1 anon lit wellness_entries', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('N1 anon lit wellness_entries', 'refusé (OK) ' || SQLSTATE); END $$;
DO $$ BEGIN
  PERFORM count(*) FROM body_weight_logs;
  INSERT INTO r(k,v) VALUES ('N2 anon lit body_weight_logs', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('N2 anon lit body_weight_logs', 'refusé (OK) ' || SQLSTATE); END $$;

-- ===== 4. Une synchro en échec ne bloque pas l'écriture de l'athlète =========
RESET ROLE;
ALTER TABLE wellness_entries ADD CONSTRAINT sante_test_ko CHECK (fatigue IS DISTINCT FROM 2) NOT VALID;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'E1 la saisie passe malgré la synchro en échec (2)',
  wellness_set_day(athlete, '2099-01-20', '{"fatigue":2,"sommeil":3,"stress":3,"energie":3,"doms":3}'::jsonb)->>'fatigue' FROM ids;
RESET ROLE;
INSERT INTO r(k,v) SELECT 'E2 app_data a la saisie, la table pas encore (true / 0)',
  ((SELECT value ? '20990120' FROM app_data WHERE athlete_id = (SELECT athlete FROM ids) AND key = 'asp:wh'))::text || ' / ' ||
  (SELECT count(*) FROM wellness_entries WHERE athlete_id = (SELECT athlete FROM ids) AND day = '2099-01-20');
INSERT INTO r(k,v) SELECT 'E3 erreur consignée sans donnée (asp:wh 23514 sante_test_ko)',
  string_agg(concat_ws(' ', key, sqlstate, constraint_name), ', ') FROM health_sync_errors WHERE athlete_id = (SELECT athlete FROM ids);
ALTER TABLE wellness_entries DROP CONSTRAINT sante_test_ko;
INSERT INTO r(k,v) SELECT 'E4 réparation par health_resync (1 athlète)', health_resync(athlete)::text FROM ids;
INSERT INTO r(k,v) SELECT 'E5 ligne présente après réparation (1)',
  count(*)::text FROM wellness_entries WHERE athlete_id = (SELECT athlete FROM ids) AND day = '2099-01-20';

-- ===== 5. Suppression de compte : tout part en cascade, sans erreur ==========
-- Compte créé hors session (jwt vidé) et majeur : depuis min_age_signup phase 2, un profil
-- sans date de naissance créé avec un auth.uid() posé est refusé.
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO auth.users (id, email) VALUES ('5a7e0000-0000-4000-8000-000000000001', 'sante-test@example.invalid');
INSERT INTO profiles (id, role, full_name, birth_date) VALUES ('5a7e0000-0000-4000-8000-000000000001', 'athlete', 'Test Santé', '2000-01-01');
INSERT INTO app_data(athlete_id, key, value) VALUES
  ('5a7e0000-0000-4000-8000-000000000001', 'asp:wh', '{"20990101":{"fatigue":4,"sommeil":4,"stress":4,"energie":4,"doms":4}}'),
  ('5a7e0000-0000-4000-8000-000000000001', 'asp:blockHistory', '[{"wellnessHistory":{"20981231":{"fatigue":3,"sommeil":3,"stress":3,"energie":3,"doms":3}}}]'),
  ('5a7e0000-0000-4000-8000-000000000001', 'asp:wlog', '{"20990101": 70}'),
  ('5a7e0000-0000-4000-8000-000000000001', 'asp:wmile', '[{"date":"20990101","kg":70}]'),
  ('5a7e0000-0000-4000-8000-000000000001', 'asp:bw', '{"current":70,"target":68}');
INSERT INTO r(k,v) SELECT 'D1 compte de test projeté (2 / 1 / 1 / 1)',
  (SELECT count(*) FROM wellness_entries WHERE athlete_id = '5a7e0000-0000-4000-8000-000000000001') || ' / ' ||
  (SELECT count(*) FROM body_weight_logs WHERE athlete_id = '5a7e0000-0000-4000-8000-000000000001') || ' / ' ||
  (SELECT count(*) FROM body_weight_milestones WHERE athlete_id = '5a7e0000-0000-4000-8000-000000000001') || ' / ' ||
  (SELECT count(*) FROM body_weight_goals WHERE athlete_id = '5a7e0000-0000-4000-8000-000000000001');
DELETE FROM auth.users WHERE id = '5a7e0000-0000-4000-8000-000000000001';
INSERT INTO r(k,v) SELECT 'D2 après suppression du compte : plus rien (0 / 0 / 0 / 0 / 0 / 0)',
  (SELECT count(*) FROM wellness_entries WHERE athlete_id = '5a7e0000-0000-4000-8000-000000000001') || ' / ' ||
  (SELECT count(*) FROM body_weight_logs WHERE athlete_id = '5a7e0000-0000-4000-8000-000000000001') || ' / ' ||
  (SELECT count(*) FROM body_weight_milestones WHERE athlete_id = '5a7e0000-0000-4000-8000-000000000001') || ' / ' ||
  (SELECT count(*) FROM body_weight_goals WHERE athlete_id = '5a7e0000-0000-4000-8000-000000000001') || ' / ' ||
  (SELECT count(*) FROM app_data WHERE athlete_id = '5a7e0000-0000-4000-8000-000000000001') || ' / ' ||
  (SELECT count(*) FROM health_sync_errors WHERE athlete_id = '5a7e0000-0000-4000-8000-000000000001');

-- ===== 6. Droits ============================================================
INSERT INTO r(k,v) SELECT 'Z1 tables : authenticated lit, n''écrit pas ; anon rien (true / false / false / false)',
  has_table_privilege('authenticated', 'public.wellness_entries', 'SELECT') || ' / ' ||
  has_table_privilege('authenticated', 'public.wellness_entries', 'INSERT') || ' / ' ||
  has_table_privilege('authenticated', 'public.body_weight_logs', 'UPDATE') || ' / ' ||
  has_table_privilege('anon', 'public.body_weight_goals', 'SELECT');
INSERT INTO r(k,v) SELECT 'Z2 fonctions de synchro non appelables par les clients (false / false / false)',
  has_function_privilege('authenticated', 'public.health_resync(uuid)', 'EXECUTE') || ' / ' ||
  has_function_privilege('anon', 'public.health_sync_wellness(uuid)', 'EXECUTE') || ' / ' ||
  has_function_privilege('authenticated', 'public.health_app_data_sync()', 'EXECUTE');
INSERT INTO r(k,v) SELECT 'Z3 SECURITY DEFINER + search_path sur la synchro (true / true)',
  bool_and(p.prosecdef)::text || ' / ' || bool_and(p.proconfig @> ARRAY['search_path=public'])::text
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('health_sync_wellness', 'health_sync_weight', 'health_sync_milestones', 'health_sync_goals',
                     'health_sync_key', 'health_resync', 'health_app_data_sync');
INSERT INTO r(k,v) SELECT 'Z4 RLS active sur les 5 tables (5)',
  count(*)::text FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relrowsecurity
   AND relname IN ('wellness_entries', 'body_weight_logs', 'body_weight_milestones', 'body_weight_goals', 'health_sync_errors');
INSERT INTO r(k,v) SELECT 'Z5 trois triggers sur app_data (health_sync_del,health_sync_ins,health_sync_upd)',
  string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid = 'public.app_data'::regclass AND tgname LIKE 'health_sync_%';

SELECT k, v FROM r ORDER BY n;
ROLLBACK;
