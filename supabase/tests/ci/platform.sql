-- Ce que le dump de schéma ne contient pas : buckets et policies du schéma storage,
-- tâches pg_cron. Copiés de la prod (définitions seulement, aucun fichier ni donnée).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('docs', 'docs', false, 10485760, '{application/pdf,image/jpeg,image/png,image/webp}'::text[]),
  ('energy-exercise-photos', 'energy-exercise-photos', true, 5242880, '{image/jpeg,image/png,image/webp}'::text[]),
  ('exercise-images', 'exercise-images', true, 10485760, '{image/jpeg,image/png,image/webp,image/gif}'::text[]),
  ('exercise-pdfs', 'exercise-pdfs', true, 52428800, '{application/pdf}'::text[]),
  ('garmin-screenshots', 'garmin-screenshots', false, 10485760, '{image/jpeg,image/png,image/webp,image/heic}'::text[]),
  ('medical', 'medical', false, 10485760, '{image/jpeg,image/png,image/webp,application/pdf}'::text[]),
  ('provider-raw', 'provider-raw', false, 104857600, NULL),
  ('public-assets', 'public-assets', true, NULL, NULL),
  ('test-files', 'test-files', false, 20971520, '{image/jpeg,image/png,image/webp,application/pdf}'::text[]),
  ('test-media', 'test-media', true, 10485760, '{image/jpeg,image/png,image/webp,image/gif,application/pdf}'::text[])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read images" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'exercise-images'::text));
CREATE POLICY "Public read pdfs" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'exercise-pdfs'::text));
CREATE POLICY athlete_delete_test_media ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'test-media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY athlete_read_test_media ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'test-media'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_coach_of_folder((storage.foldername(name))[1]))));
CREATE POLICY athlete_upload_test_media ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'test-media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY coach_read_athlete_test_media ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (((bucket_id = 'test-media'::text) AND ((storage.foldername(name))[1] IN ( SELECT (a.id)::text AS id
   FROM profiles a
  WHERE is_coach_of(a.id)))));
CREATE POLICY coach_read_test_media ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'test-media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY coach_upload_test_media ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'test-media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'coach'::text))))));
CREATE POLICY docs_storage_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'docs'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (((storage.foldername(name))[2] = 'athletes'::text) AND ((storage.foldername(name))[3] = (auth.uid())::text) AND ((NOT (EXISTS ( SELECT 1
   FROM docs d
  WHERE (d.file_path = objects.name)))) OR (EXISTS ( SELECT 1
   FROM docs d
  WHERE ((d.file_path = objects.name) AND (d.uploaded_by = auth.uid()))))) AND (NOT (EXISTS ( SELECT 1
   FROM doc_comments c
  WHERE ((c.image_path = objects.name) AND (c.author_id <> auth.uid())))))))));
CREATE POLICY docs_storage_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'docs'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (((storage.foldername(name))[1] = (my_coach_id())::text) AND ((storage.foldername(name))[2] = 'athletes'::text) AND ((storage.foldername(name))[3] = (auth.uid())::text)))));
CREATE POLICY docs_storage_select ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'docs'::text) AND (can_read_doc_file(name) OR (owner_id = (auth.uid())::text))));
CREATE POLICY energy_photo_delete ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((bucket_id = 'energy-exercise-photos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY energy_photo_select ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'energy-exercise-photos'::text));
CREATE POLICY energy_photo_upload ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'energy-exercise-photos'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = ANY (ARRAY['coach'::text, 'coach_athlete'::text])) OR (profiles.is_admin = true)))))));
CREATE POLICY garmin_delete ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((bucket_id = 'garmin-screenshots'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY garmin_select ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'garmin-screenshots'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_coach_of_folder((storage.foldername(name))[1]) OR current_user_is_admin())));
CREATE POLICY garmin_upload ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'garmin-screenshots'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY medical_storage_all ON storage.objects AS PERMISSIVE FOR ALL TO authenticated USING (((bucket_id = 'medical'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_coach_of(((storage.foldername(name))[1])::uuid)))) WITH CHECK (((bucket_id = 'medical'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_coach_of(((storage.foldername(name))[1])::uuid))));
CREATE POLICY provider_raw_own_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'provider-raw'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY staff_docs_storage_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'docs'::text) AND ((EXISTS ( SELECT 1
   FROM docs d
  WHERE ((d.file_path = objects.name) AND staff_can_edit_doc(d.id)))) OR (EXISTS ( SELECT 1
   FROM doc_comments c
  WHERE ((c.image_path = objects.name) AND (c.author_id = auth.uid())))) OR ((owner_id = (auth.uid())::text) AND (NOT (EXISTS ( SELECT 1
   FROM docs d
  WHERE (d.file_path = objects.name)))) AND (NOT (EXISTS ( SELECT 1
   FROM doc_comments c
  WHERE (c.image_path = objects.name)))) AND staff_can_write_docs_path(name)))));
CREATE POLICY staff_docs_storage_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'docs'::text) AND staff_can_write_docs_path(name)));
CREATE POLICY staff_medical_storage_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'medical'::text) AND (((owner_id = (auth.uid())::text) AND staff_can_path(name, 'medical'::text, 'write'::text)) OR (EXISTS ( SELECT 1
   FROM medical_attachments a
  WHERE ((a.file_path = objects.name) AND staff_can_edit(a.athlete_id, 'medical'::text, a.created_by)))))));
CREATE POLICY staff_medical_storage_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'medical'::text) AND staff_can_path(name, 'medical'::text, 'write'::text)));
CREATE POLICY staff_medical_storage_select ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'medical'::text) AND staff_can_path(name, 'medical'::text, 'read'::text)));
CREATE POLICY test_files_delete ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((bucket_id = 'test-files'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY test_files_select ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'test-files'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_coach_of_folder((storage.foldername(name))[1]) OR current_user_is_admin())));
CREATE POLICY test_files_upload ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'test-files'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

-- Tâches planifiées (cron.job), mêmes noms et horaires qu'en prod.
SELECT cron.schedule('coros-sync', '40 3 * * *', 'SELECT public.trigger_coros_sync();');
SELECT cron.schedule('garmin-maintenance', '*/15 * * * *', 'SELECT public.trigger_garmin_maintenance();');
SELECT cron.schedule('garmin-workouts', '*/10 * * * *', 'SELECT public.trigger_garmin_workouts()');
SELECT cron.schedule('mark-missed-workouts', '0 3 * * *', 'SELECT public.run_workout_status_maintenance();');
SELECT cron.schedule('purge-oauth-states', '10 3 * * *', 'SELECT public.purge_expired_oauth_states();');
-- Inactives en CI : seule leur définition est testée, pas leur exécution en tâche de fond.
SELECT cron.alter_job(jobid, active := false) FROM cron.job;

-- Secrets Vault lus par les déclencheurs (trigger_coros_sync, trigger_garmin_*). Valeurs FICTIVES :
-- les tâches cron sont inactives et les tests sont annulés (pg_net n'envoie que des lignes validées).
SELECT vault.create_secret('http://127.0.0.1:9', 'project_url');
SELECT vault.create_secret('ci-cle-fictive', 'service_role_key');
