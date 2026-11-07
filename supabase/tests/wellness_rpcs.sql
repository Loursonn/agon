-- Tests wellness_set_day / wellness_delete_day + fuite staff de asp:blockHistory.
-- Toujours annulé (ROLLBACK final) : rien ne reste en base.
--
-- Après application de la migration :
--   supabase db query --linked -f supabase/tests/wellness_rpcs.sql
-- Avant application (migration jouée dans la même transaction, puis annulée) :
--   (echo 'BEGIN;'; cat supabase/migrations/20261108110000_wellness_rpcs.sql; \
--    sed '/^BEGIN;$/d' supabase/tests/wellness_rpcs.sql) > "$TMPDIR/w.sql"
--   supabase db query --linked -f "$TMPDIR/w.sql"
-- Chaque ligne k → v : la valeur attendue est dans le libellé. Jours de test
-- en 2099 : aucune collision possible avec une vraie saisie.

BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated, anon; GRANT ALL ON SEQUENCE r_n_seq TO authenticated, anon;
CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT a.id AS athlete, a.coach_id AS coach,
  (SELECT p.id FROM profiles p WHERE p.role IN ('coach','coach_athlete') AND p.id <> a.coach_id
     AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = a.id AND cc.co_coach_id = p.id)
     ORDER BY p.created_at LIMIT 1) AS other_coach,
  (SELECT p.id FROM profiles p WHERE p.id <> a.id AND p.id <> a.coach_id AND p.role = 'athlete'
     AND p.coach_id IS DISTINCT FROM a.coach_id ORDER BY p.created_at LIMIT 1) AS staff,
  (SELECT o.id FROM profiles o WHERE o.coach_id = a.coach_id AND o.id <> a.id AND o.id <> a.coach_id LIMIT 1) AS other_athlete,
  (SELECT value FROM app_data d WHERE d.athlete_id = a.id AND d.key = 'asp:wh') AS wh0,
  (SELECT value FROM app_data d WHERE d.athlete_id = a.id AND d.key = 'asp:wellness') AS w0
FROM profiles a
WHERE a.role = 'athlete' AND a.coach_id IS NOT NULL AND a.coach_id <> a.id
  AND EXISTS (SELECT 1 FROM app_data d WHERE d.athlete_id = a.id AND d.key = 'asp:wh' AND jsonb_typeof(d.value) = 'object')
  AND EXISTS (SELECT 1 FROM app_data d WHERE d.athlete_id = a.id AND d.key = 'asp:blockHistory')
  AND EXISTS (SELECT 1 FROM app_data d WHERE d.athlete_id = a.id AND d.key = 'asp:prog')
ORDER BY a.created_at LIMIT 1;
GRANT SELECT ON ids TO authenticated, anon;
INSERT INTO r(k,v) SELECT '00 jeu de test complet (true)',
  (athlete IS NOT NULL AND other_coach IS NOT NULL AND staff IS NOT NULL AND other_athlete IS NOT NULL)::text FROM ids;

-- Un jour déjà présent au format ISO (ancien format) : la RPC doit le remplacer.
UPDATE app_data SET value = value || '{"2099-01-03": {"fatigue": 1, "date": "2099-01-03"}}'
 WHERE athlete_id = (SELECT athlete FROM ids) AND key = 'asp:wh';

-- Pro « séances » seulement (lecture), avec l'accord de partage de l'athlète.
SELECT set_config('agon.staff_accept','on',true);
INSERT INTO athlete_staff(athlete_id, staff_id, profession, permissions, added_by, added_by_role)
SELECT athlete, staff, 'kine',
  '{"seances":"read","fiches":"none","planification":"none","logs":"none","wellness":"none","medical":"none","nutrition":"none","tests":"none","commentaires":"none"}'::jsonb,
  coach, 'coach' FROM ids;
SELECT set_config('agon.staff_accept','off',true);
INSERT INTO user_consents(user_id, purpose, granted, doc_version, statement)
SELECT athlete, 'staff_sharing', true, 'test', 'TEST RLS — annulé' FROM ids;

SET LOCAL ROLE authenticated;

-- ===== Athlète =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'A1 athlète écrit un jour (date compacte 20990102)',
  wellness_set_day(athlete, '2099-01-02', '{"fatigue":4,"sommeil":3,"stress":4,"energie":5,"doms":4,"score":80,"date":"n importe"}')->>'date' FROM ids;
INSERT INTO r(k,v) SELECT 'A2 clé compacte présente, rien d''autre touché (true)',
  ((SELECT value FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:wh') - '20990102' - '2099-01-03'
     = i.wh0)::text FROM ids i;
INSERT INTO r(k,v) SELECT 'A3 asp:wellness = jour le plus récent (20990102)',
  (SELECT value->>'date' FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:wellness') FROM ids i;
SELECT wellness_set_day(athlete, '2099-01-02', '{"fatigue":2,"sommeil":2,"stress":2,"energie":2,"doms":2}') FROM ids;
INSERT INTO r(k,v) SELECT 'A4 réécriture du même jour remplace (fatigue 2)',
  (SELECT value->'20990102'->>'fatigue' FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:wh') FROM ids i;
SELECT wellness_set_day(athlete, '2099-01-03', '{"fatigue":5,"sommeil":5,"stress":5,"energie":5,"doms":5}') FROM ids;
INSERT INTO r(k,v) SELECT 'A5 ancien format ISO du jour retiré, compact écrit (false / 5)',
  ((SELECT value ? '2099-01-03' FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:wh')::text || ' / ' ||
   (SELECT value->'20990103'->>'fatigue' FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:wh')) FROM ids i;
DO $$ BEGIN
  PERFORM wellness_set_day((SELECT other_athlete FROM ids), '2099-01-02', '{"fatigue":3}');
  INSERT INTO r(k,v) VALUES ('A6 athlète écrit chez un autre', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A6 athlète écrit chez un autre', 'refusé (OK)'); END $$;
DO $$ BEGIN
  PERFORM wellness_set_day((SELECT athlete FROM ids), '2099-01-02', '[1,2]');
  INSERT INTO r(k,v) VALUES ('A7 saisie non objet', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A7 saisie non objet', 'refusé (OK)'); END $$;
DO $$ BEGIN
  PERFORM wellness_set_day((SELECT athlete FROM ids), NULL, '{"fatigue":3}');
  INSERT INTO r(k,v) VALUES ('A8 jour absent', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A8 jour absent', 'refusé (OK)'); END $$;
DO $$ BEGIN
  PERFORM wellness_delete_day((SELECT other_athlete FROM ids), '2099-01-02');
  INSERT INTO r(k,v) VALUES ('A9 athlète efface chez un autre', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A9 athlète efface chez un autre', 'refusé (OK)'); END $$;

-- ===== Son coach =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role','authenticated')::text FROM ids), true);
SELECT wellness_set_day(athlete, '2099-01-01', '{"fatigue":3,"sommeil":3,"stress":3,"energie":3,"doms":3}') FROM ids;
INSERT INTO r(k,v) SELECT 'C1 coach écrit un jour plus ancien (3)',
  (SELECT value->'20990101'->>'fatigue' FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:wh') FROM ids i;
INSERT INTO r(k,v) SELECT 'C2 asp:wellness garde le plus récent (20990103)',
  (SELECT value->>'date' FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:wellness') FROM ids i;
INSERT INTO r(k,v) SELECT 'C3 coach efface le 20990103 (true)', wellness_delete_day(athlete, '2099-01-03')::text FROM ids;
INSERT INTO r(k,v) SELECT 'C4 jour retiré, asp:wellness de ce jour retiré (false / 0)',
  ((SELECT value ? '20990103' FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:wh')::text || ' / ' ||
   (SELECT count(*) FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:wellness')::text) FROM ids i;
INSERT INTO r(k,v) SELECT 'C5 effacer un jour sans saisie (false)', wellness_delete_day(athlete, '2099-12-31')::text FROM ids;
INSERT INTO r(k,v) SELECT 'C6 coach efface les deux autres jours (true)',
  (wellness_delete_day(athlete, '2099-01-01') AND wellness_delete_day(athlete, '2099-01-02'))::text FROM ids;
-- Requête séparée : une requête ne voit pas ce que ses propres appels viennent d'écrire.
INSERT INTO r(k,v) SELECT 'C7 historique réel intact, au caractère près (true)',
  ((SELECT value FROM app_data WHERE athlete_id = i.athlete AND key = 'asp:wh') = i.wh0)::text FROM ids i;

-- ===== Un autre coach =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', other_coach, 'role','authenticated')::text FROM ids), true);
DO $$ BEGIN
  PERFORM wellness_set_day((SELECT athlete FROM ids), '2099-01-02', '{"fatigue":3}');
  INSERT INTO r(k,v) VALUES ('D1 autre coach écrit', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('D1 autre coach écrit', 'refusé (OK)'); END $$;
DO $$ BEGIN
  PERFORM wellness_delete_day((SELECT athlete FROM ids), '2099-01-02');
  INSERT INTO r(k,v) VALUES ('D2 autre coach efface', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('D2 autre coach efface', 'refusé (OK)'); END $$;

-- ===== Staff « séances » =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', staff, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'S1 staff séances lit asp:prog (1)', count(*)::text FROM app_data WHERE athlete_id = (SELECT athlete FROM ids) AND key = 'asp:prog';
INSERT INTO r(k,v) SELECT 'S2 staff séances lit asp:blockHistory (0)', count(*)::text FROM app_data WHERE athlete_id = (SELECT athlete FROM ids) AND key = 'asp:blockHistory';
INSERT INTO r(k,v) SELECT 'S3 staff sans droit wellness lit asp:wh (0)', count(*)::text FROM app_data WHERE athlete_id = (SELECT athlete FROM ids) AND key IN ('asp:wh','asp:wellness');
DO $$ BEGIN
  PERFORM wellness_set_day((SELECT athlete FROM ids), '2099-01-02', '{"fatigue":3}');
  INSERT INTO r(k,v) VALUES ('S4 staff écrit', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('S4 staff écrit', 'refusé (OK)'); END $$;
DO $$ BEGIN
  PERFORM wellness_delete_day((SELECT athlete FROM ids), '2099-01-02');
  INSERT INTO r(k,v) VALUES ('S5 staff efface', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('S5 staff efface', 'refusé (OK)'); END $$;

-- ===== anon =====
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$ BEGIN
  PERFORM wellness_set_day((SELECT athlete FROM ids), '2099-01-02', '{"fatigue":3}');
  INSERT INTO r(k,v) VALUES ('N1 anon écrit', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('N1 anon écrit', 'refusé (OK) ' || SQLSTATE); END $$;
DO $$ BEGIN
  PERFORM wellness_delete_day((SELECT athlete FROM ids), '2099-01-02');
  INSERT INTO r(k,v) VALUES ('N2 anon efface', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('N2 anon efface', 'refusé (OK) ' || SQLSTATE); END $$;

-- ===== Ligne asp:wh absente : la RPC la crée =====
RESET ROLE;
DELETE FROM app_data WHERE athlete_id = (SELECT athlete FROM ids) AND key = 'asp:wh';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role','authenticated')::text FROM ids), true);
SELECT wellness_set_day(athlete, '2099-01-05', '{"fatigue":4,"sommeil":4,"stress":4,"energie":4,"doms":4}') FROM ids;
INSERT INTO r(k,v) SELECT 'E1 ligne créée avec le seul jour écrit (20990105)',
  (SELECT string_agg(k, ',') FROM app_data, jsonb_object_keys(value) k WHERE athlete_id = i.athlete AND key = 'asp:wh') FROM ids i;

RESET ROLE;
INSERT INTO r(k,v) SELECT 'Z1 droits : anon sans EXECUTE (false / false)',
  has_function_privilege('anon', 'public.wellness_set_day(uuid,date,jsonb)', 'EXECUTE')::text || ' / ' ||
  has_function_privilege('anon', 'public.wellness_delete_day(uuid,date)', 'EXECUTE')::text;
INSERT INTO r(k,v) SELECT 'Z2 droits : authenticated avec EXECUTE (true / true)',
  has_function_privilege('authenticated', 'public.wellness_set_day(uuid,date,jsonb)', 'EXECUTE')::text || ' / ' ||
  has_function_privilege('authenticated', 'public.wellness_delete_day(uuid,date)', 'EXECUTE')::text;
INSERT INTO r(k,v) SELECT 'Z3 domaine staff de asp:blockHistory (∅) / asp:wh (wellness)',
  coalesce(staff_app_data_domain('asp:blockHistory'), '∅') || ' / ' || staff_app_data_domain('asp:wh');

SELECT k, v FROM r ORDER BY n;
ROLLBACK;
