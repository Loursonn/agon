-- Tests RLS Staff V1 — simulation coach / athlète / 2 pros.
-- Toujours annulé (ROLLBACK final) : rien ne reste en base.
-- Lancer : supabase db query --linked -f supabase/tests/staff_rls.sql
-- Chaque ligne k → v : les valeurs attendues sont dans le libellé.

BEGIN;
CREATE TEMP TABLE r(n serial, k text, v text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;
CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT a.id AS athlete, a.coach_id AS coach,
  (SELECT p.id FROM profiles p WHERE p.id <> a.id AND p.id <> a.coach_id AND p.role='athlete'
     AND p.coach_id IS DISTINCT FROM a.coach_id ORDER BY p.created_at LIMIT 1) AS staff,
  (SELECT p.id FROM profiles p WHERE p.id <> a.id AND p.id <> a.coach_id AND p.role='athlete'
     AND p.coach_id IS DISTINCT FROM a.coach_id ORDER BY p.created_at OFFSET 1 LIMIT 1) AS staff2,
  (SELECT o.id FROM profiles o WHERE o.coach_id = a.coach_id AND o.id <> a.id AND o.id <> a.coach_id LIMIT 1) AS other_athlete
FROM profiles a
WHERE a.role='athlete' AND a.coach_id IS NOT NULL AND a.coach_id <> a.id
  AND EXISTS (SELECT 1 FROM medical_entries e WHERE e.athlete_id = a.id)
  AND EXISTS (SELECT 1 FROM app_data d WHERE d.athlete_id = a.id AND d.key LIKE 'asp:wh%')
  AND EXISTS (SELECT 1 FROM workout_logs w WHERE w.athlete_id = a.id)
LIMIT 1;
GRANT SELECT ON ids TO authenticated;
INSERT INTO r(k,v) SELECT 'setup ids found', (athlete IS NOT NULL AND staff IS NOT NULL AND staff2 IS NOT NULL)::text FROM ids;

-- Lien kiné (grille par défaut) créé comme le ferait la RPC
SELECT set_config('agon.staff_accept','on',true);
INSERT INTO athlete_staff(athlete_id, staff_id, profession, permissions, added_by, added_by_role)
SELECT athlete, staff, 'kine', staff_default_permissions('kine'), coach, 'coach' FROM ids;
SELECT set_config('agon.staff_accept','off',true);

-- Garde : insert direct interdit hors RPC
DO $$ BEGIN
  INSERT INTO athlete_staff(athlete_id, staff_id, profession, added_by_role) SELECT athlete, staff2, 'kine', 'coach' FROM ids;
  INSERT INTO r(k,v) VALUES ('G1 insert direct hors RPC', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('G1 insert direct hors RPC', 'refusé (OK)'); END $$;

-- ===== STAFF, sans consentement =====
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', staff, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'A1 domaines app_data visibles', coalesce(string_agg(DISTINCT staff_app_data_domain(key), ','),'∅') FROM app_data WHERE athlete_id=(SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'A2 medical_entries sans consentement (0 attendu)', count(*)::text FROM medical_entries WHERE athlete_id=(SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'A3 workout_logs (logs: read, >0)', count(*)::text FROM workout_logs WHERE athlete_id=(SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'A4 measurement_logs (nutrition: none, 0)', count(*)::text FROM measurement_logs WHERE athlete_id=(SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'A5 profil athlète visible (1)', count(*)::text FROM profiles WHERE id=(SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'A6 autre athlète du coach visible (0)', count(*)::text FROM profiles WHERE id=(SELECT other_athlete FROM ids);
INSERT INTO r(k,v) SELECT 'A7 profil coach visible (1)', count(*)::text FROM profiles WHERE id=(SELECT coach FROM ids);
DO $$ BEGIN
  UPDATE athlete_staff SET permissions = permissions || '{"nutrition":"write"}' WHERE staff_id = auth.uid();
  INSERT INTO r(k,v) VALUES ('A8 pro modifie ses droits', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A8 pro modifie ses droits', 'refusé (OK)'); END $$;
DO $$ BEGIN
  INSERT INTO app_data(athlete_id, key, value) SELECT athlete, 'asp:prog', '{}'::jsonb FROM ids ON CONFLICT DO NOTHING;
  INSERT INTO r(k,v) VALUES ('A9 pro écrit app_data', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A9 pro écrit app_data', 'refusé (OK)'); END $$;
DO $$ BEGIN
  INSERT INTO staff_invitations(athlete_id, profession, invited_by, invited_by_role) SELECT athlete, 'kine', staff, 'coach' FROM ids;
  INSERT INTO r(k,v) VALUES ('A10 pro invite un autre pro', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('A10 pro invite un autre pro', 'refusé (OK)'); END $$;

-- ===== Consentement de l'athlète (simulé, annulé en fin de test) =====
RESET ROLE;
INSERT INTO user_consents(user_id, purpose, granted, doc_version, statement)
SELECT athlete, 'staff_sharing', true, 'test', 'TEST RLS — annulé' FROM ids;
SET LOCAL ROLE authenticated;
INSERT INTO r(k,v) SELECT 'B1 medical_entries avec consentement (>0)', count(*)::text FROM medical_entries WHERE athlete_id=(SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'B2 domaines app_data visibles', string_agg(DISTINCT staff_app_data_domain(key), ',') FROM app_data WHERE athlete_id=(SELECT athlete FROM ids);
INSERT INTO medical_entries(athlete_id, kind, title, status, created_by, declared_by)
SELECT athlete, 'blessure', 'TEST staff', 'en_cours', staff, 'staff' FROM ids;
INSERT INTO r(k,v) VALUES ('B3 pro crée une entrée médicale', 'ok');
WITH u AS (UPDATE medical_entries SET notes='x' WHERE athlete_id=(SELECT athlete FROM ids) AND created_by IS DISTINCT FROM auth.uid() RETURNING 1)
INSERT INTO r(k,v) SELECT 'B4 pro modifie entrée d''un autre (0)', count(*)::text FROM u;
WITH u AS (UPDATE medical_entries SET notes='x' WHERE athlete_id=(SELECT athlete FROM ids) AND created_by = auth.uid() RETURNING 1)
INSERT INTO r(k,v) SELECT 'B5 pro modifie sa propre entrée (1)', count(*)::text FROM u;
DO $$ BEGIN
  INSERT INTO medical_entries(athlete_id, kind, title, status, created_by) SELECT athlete, 'blessure', 'X', 'en_cours', coach FROM ids;
  INSERT INTO r(k,v) VALUES ('B6 pro usurpe l''auteur', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('B6 pro usurpe l''auteur', 'refusé (OK)'); END $$;
-- Fiche dans la banque du coach + attribution
INSERT INTO docs(coach_id, uploaded_by, title, category, kind, is_self_service)
SELECT coach, staff, 'TEST fiche staff', 'prevention', 'questionnaire', false FROM ids;
INSERT INTO doc_assignments(doc_id, athlete_id, assigned_by, source)
SELECT d.id, i.athlete, i.staff, 'manuel' FROM docs d, ids i WHERE d.title='TEST fiche staff';
INSERT INTO r(k,v) VALUES ('B7 pro dépose une fiche + attribue', 'ok');
DO $$ BEGIN
  INSERT INTO docs(coach_id, uploaded_by, title, category, kind, is_self_service)
  SELECT coach, staff, 'X', 'prevention', 'questionnaire', true FROM ids;
  INSERT INTO r(k,v) VALUES ('B8 pro crée une fiche libre-service', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('B8 pro crée une fiche libre-service', 'refusé (OK)'); END $$;
INSERT INTO doc_comments(doc_id, athlete_id, author_id, body)
SELECT d.id, i.athlete, i.staff, 'commentaire test' FROM docs d, ids i WHERE d.title='TEST fiche staff';
INSERT INTO r(k,v) VALUES ('B9 pro commente la fiche', 'ok');
INSERT INTO r(k,v) SELECT 'B10 chemin Storage banque coach autorisé', staff_can_write_docs_path(coach::text || '/banque/x.pdf')::text FROM ids;
INSERT INTO r(k,v) SELECT 'B11 chemin Storage autre athlète refusé', (NOT staff_can_write_docs_path(coach::text || '/athletes/' || other_athlete::text || '/x.pdf'))::text FROM ids;
INSERT INTO r(k,v) SELECT 'B12 chemin médical athlète (write)', staff_can_path(athlete::text || '/e/x.pdf', 'medical', 'write')::text FROM ids;

-- ===== ATHLÈTE =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'C1 athlète lit la fiche du pro', can_read_doc(d.id)::text FROM docs d WHERE d.title='TEST fiche staff';
INSERT INTO r(k,v) SELECT 'C2 athlète voit son staff (1)', count(*)::text FROM athlete_staff WHERE athlete_id = auth.uid();
INSERT INTO r(k,v) SELECT 'C3 athlète voit le profil du pro (1)', count(*)::text FROM profiles WHERE id=(SELECT staff FROM ids);
DO $$ BEGIN
  UPDATE athlete_staff SET permissions = permissions || '{"nutrition":"write"}' WHERE athlete_id = auth.uid();
  INSERT INTO r(k,v) VALUES ('C4 athlète modifie les droits', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('C4 athlète modifie les droits', 'refusé (OK)'); END $$;
INSERT INTO staff_invitations(athlete_id, profession, permissions, invited_by, invited_by_role)
SELECT athlete, 'nutritionniste', '{"medical":"write","seances":"write"}', athlete, 'coach' FROM ids;
INSERT INTO r(k,v) SELECT 'C5 invitation athlète → grille par défaut + rôle athlete',
  (permissions = staff_default_permissions('nutritionniste') AND invited_by_role='athlete')::text
  FROM staff_invitations WHERE athlete_id=(SELECT athlete FROM ids) AND profession='nutritionniste';

SELECT set_config('test.tok', (SELECT token FROM staff_invitations WHERE athlete_id=(SELECT athlete FROM ids) AND profession='nutritionniste'), true);
-- ===== 2e PRO accepte l'invitation de l'athlète =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', staff2, 'role','authenticated')::text FROM ids), true);
SELECT accept_staff_invitation(current_setting('test.tok'));
INSERT INTO r(k,v) SELECT 'D1 acceptation → lien grille défaut, ajouté par athlète',
  (permissions = staff_default_permissions('nutritionniste') AND added_by_role='athlete' AND status='active' AND coach_notified_at IS NULL)::text
  FROM athlete_staff WHERE staff_id = auth.uid();
DO $$ BEGIN
  PERFORM accept_staff_invitation(current_setting('test.tok'));
  INSERT INTO r(k,v) VALUES ('D2 réutiliser le lien', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('D2 réutiliser le lien', 'refusé (OK)'); END $$;
INSERT INTO r(k,v) SELECT 'D3 2e pro ne voit pas le profil du 1er pro (0)', count(*)::text FROM profiles WHERE id=(SELECT staff FROM ids);
WITH u AS (UPDATE medical_entries SET notes='y' WHERE created_by=(SELECT staff FROM ids) RETURNING 1)
INSERT INTO r(k,v) SELECT 'D4 2e pro ne touche pas l''entrée du 1er (0)', count(*)::text FROM u;

-- ===== COACH =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', coach, 'role','authenticated')::text FROM ids), true);
RESET ROLE; UPDATE athlete_staff SET athlete_notified_at = now() WHERE athlete_id=(SELECT athlete FROM ids); SET LOCAL ROLE authenticated;
UPDATE athlete_staff SET permissions = permissions || '{"nutrition":"read"}', can_edit_coach_content = true WHERE staff_id=(SELECT staff FROM ids);
INSERT INTO r(k,v) SELECT 'E1 coach règle les droits → athlète à informer',
  (permissions->>'nutrition' = 'read' AND can_edit_coach_content AND athlete_notified_at IS NULL)::text FROM athlete_staff WHERE staff_id=(SELECT staff FROM ids);
INSERT INTO r(k,v) SELECT 'E2 coach voit la fiche du pro dans sa banque', can_read_doc(d.id)::text FROM docs d WHERE d.title='TEST fiche staff';
INSERT INTO r(k,v) SELECT 'E3 appliquer à tous (0 autre lien)', staff_apply_to_all(id)::text FROM athlete_staff WHERE staff_id=(SELECT staff FROM ids);

-- Pro : contenu du coach désormais modifiable (can_edit_coach_content)
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', staff, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'E4 pro + option → peut éditer contenu du coach',
  staff_can_edit((SELECT athlete FROM ids), 'medical', (SELECT coach FROM ids))::text;
INSERT INTO r(k,v) SELECT 'E5 … mais pas celui de l''athlète', (NOT staff_can_edit((SELECT athlete FROM ids), 'medical', (SELECT athlete FROM ids)))::text;

-- ===== Révocation par l'athlète =====
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', athlete, 'role','authenticated')::text FROM ids), true);
UPDATE athlete_staff SET status='revoked' WHERE staff_id=(SELECT staff FROM ids);
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', staff, 'role','authenticated')::text FROM ids), true);
INSERT INTO r(k,v) SELECT 'F1 après révocation : workout_logs (0)', count(*)::text FROM workout_logs WHERE athlete_id=(SELECT athlete FROM ids);
INSERT INTO r(k,v) SELECT 'F2 après révocation : profil athlète (0)', count(*)::text FROM profiles WHERE id=(SELECT athlete FROM ids);
DO $$ BEGIN
  UPDATE athlete_staff SET status='active' WHERE staff_id = auth.uid();
  INSERT INTO r(k,v) VALUES ('F3 pro se réactive', 'ACCEPTÉ (KO)');
EXCEPTION WHEN OTHERS THEN INSERT INTO r(k,v) VALUES ('F3 pro se réactive', 'refusé (OK)'); END $$;

RESET ROLE;
SELECT k, v FROM r ORDER BY n;
ROLLBACK;
