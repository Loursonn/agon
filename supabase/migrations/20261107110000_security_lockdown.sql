-- =============================================================================
-- Sécurité — partie 2a : fermeture des accès (audit du 2026-11-07, §1)
--
-- Compatible avec le client actuellement en production : rien ici ne dépend
-- des nouvelles RPC. Les verrous qui en dépendent (profils coach en anon,
-- invitations, coach_id) sont dans 20261107120000_security_lockdown_after_client.sql.
--
-- Sauvegarde des définitions d'avant : ~/Documents/agon-backups/2026-11-07/
-- (policies.json, functions.json, buckets.json).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin);
$$;

REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated, service_role;

-- Coach du dossier de stockage `<athlete_uuid>/…` (tolère un nom non-uuid).
CREATE OR REPLACE FUNCTION public.is_coach_of_folder(p_folder text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_folder IS NULL
     OR p_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  RETURN public.is_coach_of(p_folder::uuid);
END;
$$;

REVOKE ALL ON FUNCTION public.is_coach_of_folder(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_coach_of_folder(text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- S4 — champs sensibles du profil : rôle, drapeaux admin (coach_id : partie 2b)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid    := auth.uid();
BEGIN
  -- service_role, cron, éditeur SQL : pas de restriction
  IF v_uid IS NULL OR public.current_user_is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_admin := false;
    NEW.is_certified_coach := false;
    IF NEW.role IS NULL OR NEW.role NOT IN ('athlete', 'coach', 'coach_athlete', 'staff') THEN
      RAISE EXCEPTION 'Rôle invalide' USING ERRCODE = '42501';
    END IF;
    -- coach_id à l'inscription : contrôlé en partie 2b (après déploiement du client)
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Le rôle ne peut pas être modifié' USING ERRCODE = '42501';
  END IF;

  -- coach_id : contrôlé en partie 2b (après déploiement du client)

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_privileged ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileged
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_fields();

-- -----------------------------------------------------------------------------
-- S3 — set_active_performance_reference : contrôle d'accès + search_path
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_active_performance_reference(
  p_performance_log_id uuid, p_athlete_id uuid, p_metric_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT (p_athlete_id = auth.uid() OR public.is_coach_of(p_athlete_id) OR public.current_user_is_admin()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.performance_logs
     WHERE id = p_performance_log_id AND athlete_id = p_athlete_id AND metric_name = p_metric_name
  ) THEN
    RAISE EXCEPTION 'Référence introuvable pour cet athlète' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.performance_logs
     SET is_active_reference = false
   WHERE athlete_id = p_athlete_id
     AND metric_name = p_metric_name
     AND is_active_reference = true;

  UPDATE public.performance_logs
     SET is_active_reference = true
   WHERE id = p_performance_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_active_performance_reference(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_performance_reference(uuid, uuid, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- S5 — fonctions SECURITY DEFINER : plus exécutables sans connexion
-- (les helpers utilisés dans les policies restent inchangés)
-- -----------------------------------------------------------------------------

-- Réservées au serveur (cron / edge functions en service_role)
REVOKE ALL ON FUNCTION public.close_unfinished_workouts()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_missed_workouts()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_workout_status_maintenance()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_user_storage_objects(uuid)   FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_unfinished_workouts()      TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_missed_workouts()           TO service_role;
GRANT EXECUTE ON FUNCTION public.run_workout_status_maintenance() TO service_role;
GRANT EXECUTE ON FUNCTION public.list_user_storage_objects(uuid)  TO service_role;

-- Utilisateurs connectés seulement
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.unlink_athlete(uuid)',
    'public.get_coaches_list()',
    'public.toggle_coach_certification(uuid, boolean)',
    'public.get_app_update_reads()',
    'public.mark_doc_seen(uuid)',
    'public.react_weekly_retour(uuid, text)',
    'public.set_athlete_hidden(uuid, boolean)',
    'public.sync_doc_assignments(uuid, text, uuid[])'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END;
$$;

ALTER FUNCTION public.unlink_athlete(uuid) SET search_path = public;

-- -----------------------------------------------------------------------------
-- S7 — définitions de tests : un coach ne modifie plus celles des autres
-- (garde l'édition de la bibliothèque commune, created_by IS NULL)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS td_update_coach ON public.test_definitions;
DROP POLICY IF EXISTS td_delete_coach ON public.test_definitions;
DROP POLICY IF EXISTS tv_insert_coach ON public.test_variables;
DROP POLICY IF EXISTS tv_update_coach ON public.test_variables;
DROP POLICY IF EXISTS tv_delete_coach ON public.test_variables;

CREATE POLICY td_update_coach_library ON public.test_definitions
  FOR UPDATE TO authenticated
  USING (created_by IS NULL
         AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach'))
  WITH CHECK (created_by IS NULL);

CREATE POLICY td_delete_coach_library ON public.test_definitions
  FOR DELETE TO authenticated
  USING (created_by IS NULL
         AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach'));

CREATE POLICY tv_write_coach_library ON public.test_variables
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.test_definitions td
                  WHERE td.id = test_variables.test_definition_id AND td.created_by IS NULL)
         AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.test_definitions td
                       WHERE td.id = test_variables.test_definition_id AND td.created_by IS NULL)
              AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach'));

-- -----------------------------------------------------------------------------
-- S8 — écritures vers l'athlète d'un autre coach
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS test_insert ON public.test_sessions;
CREATE POLICY test_insert ON public.test_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
       athlete_id = auth.uid()
    OR (coach_id = auth.uid() AND (athlete_id IS NULL OR public.is_coach_of(athlete_id)))
    OR public.current_user_is_admin()
  );

DROP POLICY IF EXISTS wr_coach_all ON public.weekly_retours;
CREATE POLICY wr_coach_all ON public.weekly_retours
  FOR ALL TO authenticated
  USING ((coach_id = auth.uid()) OR public.is_coach_of(athlete_id))
  WITH CHECK (coach_id = auth.uid() AND (athlete_id IS NULL OR public.is_coach_of(athlete_id)));

DROP POLICY IF EXISTS dt_coach_all ON public.day_themes;
CREATE POLICY dt_coach_all ON public.day_themes
  FOR ALL TO authenticated
  USING ((coach_id = auth.uid()) OR public.is_coach_of(athlete_id))
  WITH CHECK (coach_id = auth.uid() AND (athlete_id IS NULL OR public.is_coach_of(athlete_id)));

DROP POLICY IF EXISTS docs_coach_insert ON public.docs;
CREATE POLICY docs_coach_insert ON public.docs
  FOR INSERT TO authenticated
  WITH CHECK (coach_id = auth.uid() AND uploaded_by = auth.uid()
              AND (athlete_id IS NULL OR public.is_coach_of(athlete_id)));

-- -----------------------------------------------------------------------------
-- S9 — coach_id en dur → is_coach_of (co-coach couvert)
-- (unlink_athlete reste réservé au référent, par choix produit)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS athlete_claims_select_coach ON public.athlete_claims;
CREATE POLICY athlete_claims_select_coach ON public.athlete_claims
  FOR SELECT TO authenticated
  USING (public.is_coach_of(athlete_id));

-- -----------------------------------------------------------------------------
-- S6 (partiel) / stockage
-- -----------------------------------------------------------------------------

-- N'importe qui pouvait déposer dans les bibliothèques publiques d'exercices.
-- Aucun upload côté client : seul service_role écrit (il ignore la RLS).
DROP POLICY IF EXISTS "Service write images" ON storage.objects;
DROP POLICY IF EXISTS "Service write pdfs"   ON storage.objects;

-- Tout compte coach lisait les captures Garmin et fichiers de test de TOUS
-- les athlètes : limité à l'athlète, à ses coachs et à l'admin.
DROP POLICY IF EXISTS garmin_select ON storage.objects;
CREATE POLICY garmin_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'garmin-screenshots'
         AND ((storage.foldername(name))[1] = auth.uid()::text
              OR public.is_coach_of_folder((storage.foldername(name))[1])
              OR public.current_user_is_admin()));

DROP POLICY IF EXISTS test_files_select ON storage.objects;
CREATE POLICY test_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'test-files'
         AND ((storage.foldername(name))[1] = auth.uid()::text
              OR public.is_coach_of_folder((storage.foldername(name))[1])
              OR public.current_user_is_admin()));

DROP POLICY IF EXISTS athlete_read_test_media ON storage.objects;
CREATE POLICY athlete_read_test_media ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'test-media'
         AND ((storage.foldername(name))[1] = auth.uid()::text
              OR public.is_coach_of_folder((storage.foldername(name))[1])));

-- -----------------------------------------------------------------------------
-- S10 — connexions et activités montre : plus modifiables par l'athlète
-- (les edge functions écrivent en service_role ; l'import de fichiers garde
-- ses droits sur source = 'file_import')
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS provider_connections_own ON public.provider_connections;
CREATE POLICY provider_connections_own_read ON public.provider_connections
  FOR SELECT TO authenticated
  USING (athlete_id = auth.uid());

DROP POLICY IF EXISTS provider_activities_own ON public.provider_activities;
CREATE POLICY provider_activities_own_read ON public.provider_activities
  FOR SELECT TO authenticated
  USING (athlete_id = auth.uid());
CREATE POLICY provider_activities_own_file_import ON public.provider_activities
  FOR ALL TO authenticated
  USING (athlete_id = auth.uid() AND source = 'file_import')
  WITH CHECK (athlete_id = auth.uid() AND source = 'file_import');
