/*
  Staff autour des athlètes — ouvertures sur les tables de données (V1).

  Pré-requis : 20261031120000_staff_core.sql (staff_can, staff_can_edit, …).

  Méthode : chaque ouverture est une policy PERMISSIVE séparée, préfixée
  `staff_`. PostgreSQL combine les policies permissives par OR : c'est
  exactement « policy existante OR staff_can(...) », sans réécrire une seule
  policy existante. Rollback = DROP des policies `staff_*` de ce fichier.

  Seules exceptions (CREATE OR REPLACE) : can_read_doc et can_read_doc_file,
  qui portent la lecture des fiches et des fichiers associés, et la contrainte
  medical_entries.declared_by (ajout de 'staff').

  `is_coach_of` et `can_coach_athlete` ne sont pas touchées.

  Lecture : tous les domaines du §4 de la spec.
  Écriture V1 : medical (medical_entries, medical_attachments, bucket medical),
  fiches (docs dans la banque du coach principal, doc_assignments),
  commentaires (doc_comments).

  Hors staff en V1 (décision explicite) :
    - provider_* (données de montre, spec §6) ;
    - hyrox_results, hyrox_race_plans, athlete_profile_items ;
    - banques du coach dans app_data (asp:session-bank, asp:bloc-bank) ;
    - écriture sur weekly_retours (UNIQUE (athlete_id, week_start) : un seul
      retour par semaine, celui du coach) et workout_exercise_comments
      (commentaires de l'athlète, sans auteur) — lecture seule.
    - medical_history (fiche d'antécédents sans auteur) : lecture seule ; le
      pro écrit dans medical_entries.
*/

BEGIN;

-- Aides : cast sûr d'un dossier Storage, et athlète d'une séance réalisée
-- (lu en SECURITY DEFINER pour ne pas dépendre du domaine `logs`).
CREATE OR REPLACE FUNCTION public.staff_can_path(p_name text, domain text, level text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN (storage.foldername(p_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.staff_can(((storage.foldername(p_name))[1])::uuid, domain, level)
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.workout_log_athlete_id(p_log_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT athlete_id FROM public.workout_logs WHERE id = p_log_id;
$$;

-- ===========================================================================
-- seances
-- ===========================================================================

-- app_data filtrée par clé : un pro ne lit que les clés de ses domaines
-- (spec §5.3). Aucune écriture directe du staff sur app_data.
DROP POLICY IF EXISTS staff_app_data_read ON public.app_data;
CREATE POLICY staff_app_data_read ON public.app_data
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, public.staff_app_data_domain(key), 'read'));

DROP POLICY IF EXISTS staff_esa_read ON public.energy_session_assignments;
CREATE POLICY staff_esa_read ON public.energy_session_assignments
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'seances', 'read'));

DROP POLICY IF EXISTS staff_energy_sessions_read ON public.energy_sessions;
CREATE POLICY staff_energy_sessions_read ON public.energy_sessions
  FOR SELECT TO authenticated
  USING (
    public.staff_can(athlete_id, 'seances', 'read')
    OR EXISTS (
      SELECT 1 FROM public.energy_session_assignments a
       WHERE a.energy_session_id = energy_sessions.id
         AND public.staff_can(a.athlete_id, 'seances', 'read')
    )
  );

-- ===========================================================================
-- planification
-- ===========================================================================
DROP POLICY IF EXISTS staff_seasons_read ON public.seasons;
CREATE POLICY staff_seasons_read ON public.seasons
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'planification', 'read'));

DROP POLICY IF EXISTS staff_planning_blocks_read ON public.planning_blocks;
CREATE POLICY staff_planning_blocks_read ON public.planning_blocks
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'planification', 'read'));

DROP POLICY IF EXISTS staff_macrocycles_read ON public.macrocycles;
CREATE POLICY staff_macrocycles_read ON public.macrocycles
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'planification', 'read'));

DROP POLICY IF EXISTS staff_mesocycles_read ON public.mesocycles;
CREATE POLICY staff_mesocycles_read ON public.mesocycles
  FOR SELECT TO authenticated
  USING (public.staff_can(
    (SELECT m.athlete_id FROM public.macrocycles m WHERE m.id = mesocycles.macrocycle_id),
    'planification', 'read'));

DROP POLICY IF EXISTS staff_cycles_read ON public.cycles;
CREATE POLICY staff_cycles_read ON public.cycles
  FOR SELECT TO authenticated
  USING (public.staff_can(COALESCE(athlete_id, public.mesocycle_athlete_id(mesocycle_id)), 'planification', 'read'));

DROP POLICY IF EXISTS staff_microcycles_read ON public.microcycles;
CREATE POLICY staff_microcycles_read ON public.microcycles
  FOR SELECT TO authenticated
  USING (public.staff_can(public.cycle_athlete_id(cycle_id), 'planification', 'read'));

DROP POLICY IF EXISTS staff_competitions_read ON public.competitions;
CREATE POLICY staff_competitions_read ON public.competitions
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'planification', 'read'));

DROP POLICY IF EXISTS staff_day_themes_read ON public.day_themes;
CREATE POLICY staff_day_themes_read ON public.day_themes
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'planification', 'read'));

-- ===========================================================================
-- logs
-- ===========================================================================
DROP POLICY IF EXISTS staff_workout_logs_read ON public.workout_logs;
CREATE POLICY staff_workout_logs_read ON public.workout_logs
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'logs', 'read'));

DROP POLICY IF EXISTS staff_workout_rpe_read ON public.workout_rpe;
CREATE POLICY staff_workout_rpe_read ON public.workout_rpe
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'logs', 'read'));

DROP POLICY IF EXISTS staff_exercise_pr_logs_read ON public.exercise_pr_logs;
CREATE POLICY staff_exercise_pr_logs_read ON public.exercise_pr_logs
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'logs', 'read'));

DROP POLICY IF EXISTS staff_performance_logs_read ON public.performance_logs;
CREATE POLICY staff_performance_logs_read ON public.performance_logs
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'logs', 'read'));

-- ===========================================================================
-- wellness (consentement unique requis, cf. staff_can)
-- ===========================================================================
DROP POLICY IF EXISTS staff_habits_read ON public.habits;
CREATE POLICY staff_habits_read ON public.habits
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'wellness', 'read'));

DROP POLICY IF EXISTS staff_habit_logs_read ON public.habit_logs;
CREATE POLICY staff_habit_logs_read ON public.habit_logs
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'wellness', 'read'));

-- ===========================================================================
-- nutrition (consentement unique requis)
-- ===========================================================================
DROP POLICY IF EXISTS staff_measurement_logs_read ON public.measurement_logs;
CREATE POLICY staff_measurement_logs_read ON public.measurement_logs
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'nutrition', 'read'));

-- ===========================================================================
-- tests
-- ===========================================================================
DROP POLICY IF EXISTS staff_test_sessions_read ON public.test_sessions;
CREATE POLICY staff_test_sessions_read ON public.test_sessions
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'tests', 'read'));

DROP POLICY IF EXISTS staff_test_results_read ON public.test_results;
CREATE POLICY staff_test_results_read ON public.test_results
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'tests', 'read'));

DROP POLICY IF EXISTS staff_athlete_test_results_read ON public.athlete_test_results;
CREATE POLICY staff_athlete_test_results_read ON public.athlete_test_results
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'tests', 'read'));

DROP POLICY IF EXISTS staff_athlete_test_values_read ON public.athlete_test_values;
CREATE POLICY staff_athlete_test_values_read ON public.athlete_test_values
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.athlete_test_results r
     WHERE r.id = athlete_test_values.result_id
       AND public.staff_can(r.athlete_id, 'tests', 'read')
  ));

-- ===========================================================================
-- medical (consentement unique requis) — lecture + écriture
-- ===========================================================================

-- Une saisie du staff est déclarée comme telle.
ALTER TABLE public.medical_entries DROP CONSTRAINT IF EXISTS medical_entries_declared_by_check;
ALTER TABLE public.medical_entries
  ADD CONSTRAINT medical_entries_declared_by_check
  CHECK (declared_by IS NULL OR declared_by = ANY (ARRAY['athlete'::text, 'coach'::text, 'staff'::text]));

DROP POLICY IF EXISTS staff_medical_history_read ON public.medical_history;
CREATE POLICY staff_medical_history_read ON public.medical_history
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'medical', 'read'));

DROP POLICY IF EXISTS staff_life_events_read ON public.athlete_life_events;
CREATE POLICY staff_life_events_read ON public.athlete_life_events
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'medical', 'read'));

-- medical_entries
DROP POLICY IF EXISTS staff_medical_entries_read ON public.medical_entries;
CREATE POLICY staff_medical_entries_read ON public.medical_entries
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'medical', 'read'));

DROP POLICY IF EXISTS staff_medical_entries_insert ON public.medical_entries;
CREATE POLICY staff_medical_entries_insert ON public.medical_entries
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.staff_can(athlete_id, 'medical', 'write'));

DROP POLICY IF EXISTS staff_medical_entries_update ON public.medical_entries;
CREATE POLICY staff_medical_entries_update ON public.medical_entries
  FOR UPDATE TO authenticated
  USING (public.staff_can_edit(athlete_id, 'medical', created_by))
  WITH CHECK (public.staff_can_edit(athlete_id, 'medical', created_by));

DROP POLICY IF EXISTS staff_medical_entries_delete ON public.medical_entries;
CREATE POLICY staff_medical_entries_delete ON public.medical_entries
  FOR DELETE TO authenticated
  USING (public.staff_can_edit(athlete_id, 'medical', created_by));

-- medical_attachments
DROP POLICY IF EXISTS staff_medical_attachments_read ON public.medical_attachments;
CREATE POLICY staff_medical_attachments_read ON public.medical_attachments
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'medical', 'read'));

DROP POLICY IF EXISTS staff_medical_attachments_insert ON public.medical_attachments;
CREATE POLICY staff_medical_attachments_insert ON public.medical_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.staff_can(athlete_id, 'medical', 'write')
    -- Pièce jointe sur une entrée que le pro peut modifier.
    AND EXISTS (
      SELECT 1 FROM public.medical_entries e
       WHERE e.id = medical_attachments.entry_id
         AND e.athlete_id = medical_attachments.athlete_id
         AND public.staff_can_edit(e.athlete_id, 'medical', e.created_by)
    )
  );

DROP POLICY IF EXISTS staff_medical_attachments_delete ON public.medical_attachments;
CREATE POLICY staff_medical_attachments_delete ON public.medical_attachments
  FOR DELETE TO authenticated
  USING (public.staff_can_edit(athlete_id, 'medical', created_by));

-- Bucket `medical` : chemin `<athlete_id>/<entry_id>/<fichier>`.
DROP POLICY IF EXISTS staff_medical_storage_select ON storage.objects;
CREATE POLICY staff_medical_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'medical' AND public.staff_can_path(name, 'medical', 'read'));

DROP POLICY IF EXISTS staff_medical_storage_insert ON storage.objects;
CREATE POLICY staff_medical_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'medical' AND public.staff_can_path(name, 'medical', 'write'));

DROP POLICY IF EXISTS staff_medical_storage_delete ON storage.objects;
CREATE POLICY staff_medical_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'medical'
         AND (
           (owner_id = (auth.uid())::text AND public.staff_can_path(name, 'medical', 'write'))
           OR EXISTS (
             SELECT 1 FROM public.medical_attachments a
              WHERE a.file_path = objects.name
                AND public.staff_can_edit(a.athlete_id, 'medical', a.created_by)
           )
         ));

-- ===========================================================================
-- fiches — lecture + écriture dans la banque du coach principal
-- ===========================================================================

-- Le pro a-t-il `fiches: write` sur au moins un athlète de ce coach ?
-- (= peut déposer dans la banque de ce coach)
CREATE OR REPLACE FUNCTION public.staff_can_write_bank(coach_uuid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coach_uuid IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.athlete_staff s
      JOIN public.profiles p ON p.id = s.athlete_id
     WHERE s.staff_id = auth.uid()
       AND s.status = 'active'
       AND s.permissions->>'fiches' = 'write'
       AND p.coach_id = coach_uuid
  );
$$;

-- Le pro peut-il modifier/supprimer cette fiche ?
--   - la sienne, dans la banque d'un coach où il a fiches: write ;
--   - celle du coach, si un lien avec can_edit_coach_content + fiches: write
--     porte sur un athlète à qui la fiche est attribuée (ou personnelle).
-- Jamais la fiche d'un autre pro ni celle déposée par l'athlète.
CREATE OR REPLACE FUNCTION public.staff_can_edit_doc(doc_uuid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.docs d
     WHERE d.id = doc_uuid
       AND (
         (d.uploaded_by = auth.uid() AND public.staff_can_write_bank(d.coach_id))
         OR (
           (d.uploaded_by IS NULL OR d.uploaded_by = d.coach_id)
           AND EXISTS (
             SELECT 1
               FROM public.athlete_staff s
               JOIN public.profiles p ON p.id = s.athlete_id
              WHERE s.staff_id = auth.uid()
                AND s.status = 'active'
                AND s.can_edit_coach_content
                AND s.permissions->>'fiches' = 'write'
                AND p.coach_id = d.coach_id
                AND (
                  d.athlete_id = s.athlete_id
                  OR EXISTS (
                    SELECT 1 FROM public.doc_assignments a
                      JOIN public.docs ad ON ad.id = a.doc_id
                     WHERE a.athlete_id = s.athlete_id
                       AND COALESCE(ad.origin_id, ad.id) = COALESCE(d.origin_id, d.id)
                  )
                )
           )
         )
       )
  );
$$;

-- La fiche peut-elle être rattachée à cet athlète par le pro ?
-- (même coach principal, et le pro peut la lire)
CREATE OR REPLACE FUNCTION public.staff_doc_for_athlete(doc_uuid uuid, athlete_uuid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.docs d
      JOIN public.profiles p ON p.id = athlete_uuid
     WHERE d.id = doc_uuid
       AND d.coach_id = p.coach_id
       AND d.archived_at IS NULL
  ) AND public.can_read_doc(doc_uuid);
$$;

-- Lecture des fiches : ajout du staff (le reste de la fonction est inchangé).
CREATE OR REPLACE FUNCTION public.can_read_doc(doc_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.docs d
    WHERE d.id = doc_uuid
      AND (
        -- propriétaire / auteur
        d.coach_id = auth.uid()
        OR d.uploaded_by = auth.uid()
        -- fiche personnelle ou ajout de l'athlète
        OR d.athlete_id = auth.uid()
        -- attribuée directement, ou même famille (origine + variantes) qu'une fiche attribuée
        OR EXISTS (
          SELECT 1
          FROM public.doc_assignments a
          JOIN public.docs ad ON ad.id = a.doc_id
          WHERE a.athlete_id = auth.uid()
            AND COALESCE(ad.origin_id, ad.id) = COALESCE(d.origin_id, d.id)
        )
        -- libre-service du coach de l'athlète (l'origine porte le flag)
        OR EXISTS (
          SELECT 1
          FROM public.docs o
          WHERE o.id = COALESCE(d.origin_id, d.id)
            AND o.is_self_service
            AND o.archived_at IS NULL
            AND o.coach_id = (SELECT p.coach_id FROM public.profiles p WHERE p.id = auth.uid())
        )
        -- STAFF : fiche personnelle d'un athlète suivi (fiches: read)
        OR (d.athlete_id IS NOT NULL AND public.staff_can(d.athlete_id, 'fiches', 'read'))
        -- STAFF : même famille qu'une fiche attribuée à un athlète suivi
        OR EXISTS (
          SELECT 1
          FROM public.doc_assignments a
          JOIN public.docs ad ON ad.id = a.doc_id
          WHERE COALESCE(ad.origin_id, ad.id) = COALESCE(d.origin_id, d.id)
            AND public.staff_can(a.athlete_id, 'fiches', 'read')
        )
        -- STAFF : banque du coach (fiches communes, non archivées) si fiches: write
        OR (d.athlete_id IS NULL AND d.archived_at IS NULL AND public.staff_can_write_bank(d.coach_id))
      )
  );
$function$;

-- Fichiers des fiches et images de commentaires : ajout du staff.
CREATE OR REPLACE FUNCTION public.can_read_doc_file(object_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM public.docs d
      WHERE d.file_path = object_name
        AND public.can_read_doc(d.id)
    )
    OR EXISTS (
      SELECT 1 FROM public.doc_comments c
      WHERE c.image_path = object_name
        AND (
          c.athlete_id = auth.uid()
          OR c.author_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = c.athlete_id AND p.coach_id = auth.uid())
          -- STAFF
          OR public.staff_can(c.athlete_id, 'commentaires', 'read')
        )
    );
$function$;

-- docs : le pro dépose dans la banque du coach principal (uploaded_by = lui).
-- Jamais en libre-service : c'est un choix du coach.
DROP POLICY IF EXISTS staff_docs_insert ON public.docs;
CREATE POLICY staff_docs_insert ON public.docs
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND coach_id <> auth.uid()
    AND is_self_service = false
    AND public.staff_can_write_bank(coach_id)
    AND (athlete_id IS NULL OR public.staff_can(athlete_id, 'fiches', 'write'))
  );

DROP POLICY IF EXISTS staff_docs_update ON public.docs;
CREATE POLICY staff_docs_update ON public.docs
  FOR UPDATE TO authenticated
  USING (public.staff_can_edit_doc(id))
  WITH CHECK (
    is_self_service = false
    AND public.staff_can_write_bank(coach_id)
    AND (athlete_id IS NULL OR public.staff_can(athlete_id, 'fiches', 'write'))
  );

DROP POLICY IF EXISTS staff_docs_delete ON public.docs;
CREATE POLICY staff_docs_delete ON public.docs
  FOR DELETE TO authenticated
  USING (public.staff_can_edit_doc(id));

-- doc_assignments
DROP POLICY IF EXISTS staff_doc_assignments_read ON public.doc_assignments;
CREATE POLICY staff_doc_assignments_read ON public.doc_assignments
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'fiches', 'read'));

DROP POLICY IF EXISTS staff_doc_assignments_insert ON public.doc_assignments;
CREATE POLICY staff_doc_assignments_insert ON public.doc_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    assigned_by = auth.uid()
    AND public.staff_can(athlete_id, 'fiches', 'write')
    AND public.staff_doc_for_athlete(doc_id, athlete_id)
  );

DROP POLICY IF EXISTS staff_doc_assignments_delete ON public.doc_assignments;
CREATE POLICY staff_doc_assignments_delete ON public.doc_assignments
  FOR DELETE TO authenticated
  USING (public.staff_can_edit(athlete_id, 'fiches', assigned_by));

-- ===========================================================================
-- commentaires
-- ===========================================================================
DROP POLICY IF EXISTS staff_doc_comments_read ON public.doc_comments;
CREATE POLICY staff_doc_comments_read ON public.doc_comments
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'commentaires', 'read'));

DROP POLICY IF EXISTS staff_doc_comments_insert ON public.doc_comments;
CREATE POLICY staff_doc_comments_insert ON public.doc_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.staff_can(athlete_id, 'commentaires', 'write')
    AND public.can_read_doc(doc_id)
  );
-- Suppression : doc_comments_delete_own (author_id = auth.uid()) couvre déjà le pro.

DROP POLICY IF EXISTS staff_weekly_retours_read ON public.weekly_retours;
CREATE POLICY staff_weekly_retours_read ON public.weekly_retours
  FOR SELECT TO authenticated
  USING (public.staff_can(athlete_id, 'commentaires', 'read'));

DROP POLICY IF EXISTS staff_workout_exercise_comments_read ON public.workout_exercise_comments;
CREATE POLICY staff_workout_exercise_comments_read ON public.workout_exercise_comments
  FOR SELECT TO authenticated
  USING (public.staff_can(public.workout_log_athlete_id(workout_log_id), 'commentaires', 'read'));

COMMIT;
