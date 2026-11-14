-- Retour arrière de supabase/migrations/20261115193700_rls_perf_preconditions.sql.
-- Remet chaque policy dans son expression d'avant (pg_policies de la prod au 15/11), puis retire
-- les deux préconditions, et remet is_coach_of en SECURITY INVOKER. Ce dossier n'est lu par aucun outil ni rejoué par la CI.
-- Appliquer : prod.sh supabase db query --linked -f supabase/rollback/20261115193700_rls_perf_preconditions.sql
-- puis une migration datée qui fait la même chose, pour que le rejeu R2 reste aligné.

BEGIN;

ALTER POLICY "activity_laps_read" ON public.activity_laps
  USING (activity_detail_visible(athlete_id, source));

ALTER POLICY "activity_plan_links_read" ON public.activity_plan_links
  USING (activity_detail_visible(athlete_id, source));

ALTER POLICY "activity_sets_read" ON public.activity_sets
  USING (activity_detail_visible(athlete_id, source));

ALTER POLICY "activity_streams_read" ON public.activity_streams
  USING (activity_detail_visible(athlete_id, source));

ALTER POLICY "activity_zone_summaries_read" ON public.activity_zone_summaries
  USING (activity_detail_visible(athlete_id, source));

ALTER POLICY "app_data_coach" ON public.app_data
  USING (is_coach_of(athlete_id));

ALTER POLICY "app_data_self" ON public.app_data
  USING ((athlete_id = auth.uid()));

ALTER POLICY "staff_app_data_read" ON public.app_data
  USING (staff_can(athlete_id, staff_app_data_domain(key), 'read'::text));

ALTER POLICY "app_feedback_delete" ON public.app_feedback
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_certified_coach = true) OR (p.is_admin = true))))));

ALTER POLICY "app_feedback_insert_own" ON public.app_feedback
  WITH CHECK ((author_id = auth.uid()));

ALTER POLICY "app_feedback_select" ON public.app_feedback
  USING (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_certified_coach = true) OR (p.is_admin = true)))))));

ALTER POLICY "app_feedback_update" ON public.app_feedback
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_certified_coach = true) OR (p.is_admin = true))))));

ALTER POLICY "app_update_reads_own_insert" ON public.app_update_reads
  WITH CHECK ((user_id = auth.uid()));

ALTER POLICY "app_update_reads_own_select" ON public.app_update_reads
  USING ((user_id = auth.uid()));

ALTER POLICY "athlete_claims_select_coach" ON public.athlete_claims
  USING (is_coach_of(athlete_id));

ALTER POLICY "acc_select" ON public.athlete_co_coaches
  USING (((athlete_id = auth.uid()) OR (co_coach_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = athlete_co_coaches.athlete_id) AND (p.coach_id = auth.uid()))))));

ALTER POLICY "life_events_delete" ON public.athlete_life_events
  USING ((athlete_id = auth.uid()));

ALTER POLICY "life_events_insert" ON public.athlete_life_events
  WITH CHECK ((athlete_id = auth.uid()));

ALTER POLICY "life_events_select" ON public.athlete_life_events
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id)));

ALTER POLICY "life_events_update" ON public.athlete_life_events
  USING ((athlete_id = auth.uid()));

ALTER POLICY "staff_life_events_read" ON public.athlete_life_events
  USING (staff_can(athlete_id, 'medical'::text, 'read'::text));

ALTER POLICY "api_all_coach" ON public.athlete_profile_items
  USING ((is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))))
  WITH CHECK ((is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "api_select" ON public.athlete_profile_items
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "athlete_staff_select" ON public.athlete_staff
  USING (((staff_id = auth.uid()) OR (athlete_id = auth.uid()) OR is_coach_of(athlete_id)));

ALTER POLICY "athlete_staff_update" ON public.athlete_staff
  USING (((staff_id = auth.uid()) OR (athlete_id = auth.uid()) OR is_coach_of(athlete_id)))
  WITH CHECK (((staff_id = auth.uid()) OR (athlete_id = auth.uid()) OR is_coach_of(athlete_id)));

ALTER POLICY "atr_delete" ON public.athlete_test_results
  USING ((is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "atr_insert" ON public.athlete_test_results
  WITH CHECK ((is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "atr_select" ON public.athlete_test_results
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "atr_update" ON public.athlete_test_results
  USING ((is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "staff_athlete_test_results_read" ON public.athlete_test_results
  USING (staff_can(athlete_id, 'tests'::text, 'read'::text));

ALTER POLICY "atv_delete" ON public.athlete_test_values
  USING ((EXISTS ( SELECT 1
   FROM athlete_test_results r
  WHERE ((r.id = athlete_test_values.result_id) AND (is_coach_of(r.athlete_id) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))))));

ALTER POLICY "atv_insert" ON public.athlete_test_values
  WITH CHECK ((EXISTS ( SELECT 1
   FROM athlete_test_results r
  WHERE ((r.id = athlete_test_values.result_id) AND (is_coach_of(r.athlete_id) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))))));

ALTER POLICY "atv_select" ON public.athlete_test_values
  USING ((EXISTS ( SELECT 1
   FROM athlete_test_results r
  WHERE ((r.id = athlete_test_values.result_id) AND ((r.athlete_id = auth.uid()) OR is_coach_of(r.athlete_id) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))))));

ALTER POLICY "atv_update" ON public.athlete_test_values
  USING ((EXISTS ( SELECT 1
   FROM athlete_test_results r
  WHERE ((r.id = athlete_test_values.result_id) AND (is_coach_of(r.athlete_id) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))))));

ALTER POLICY "staff_athlete_test_values_read" ON public.athlete_test_values
  USING ((EXISTS ( SELECT 1
   FROM athlete_test_results r
  WHERE ((r.id = athlete_test_values.result_id) AND staff_can(r.athlete_id, 'tests'::text, 'read'::text)))));

ALTER POLICY "body_weight_goals_coach" ON public.body_weight_goals
  USING (is_coach_of(athlete_id));

ALTER POLICY "body_weight_goals_self" ON public.body_weight_goals
  USING ((athlete_id = auth.uid()));

ALTER POLICY "body_weight_goals_staff" ON public.body_weight_goals
  USING (staff_can(athlete_id, 'nutrition'::text, 'read'::text));

ALTER POLICY "body_weight_logs_coach" ON public.body_weight_logs
  USING (is_coach_of(athlete_id));

ALTER POLICY "body_weight_logs_self" ON public.body_weight_logs
  USING ((athlete_id = auth.uid()));

ALTER POLICY "body_weight_logs_staff" ON public.body_weight_logs
  USING (staff_can(athlete_id, 'nutrition'::text, 'read'::text));

ALTER POLICY "body_weight_milestones_coach" ON public.body_weight_milestones
  USING (is_coach_of(athlete_id));

ALTER POLICY "body_weight_milestones_self" ON public.body_weight_milestones
  USING ((athlete_id = auth.uid()));

ALTER POLICY "body_weight_milestones_staff" ON public.body_weight_milestones
  USING (staff_can(athlete_id, 'nutrition'::text, 'read'::text));

ALTER POLICY "coach_api_access_log_select_own" ON public.coach_api_access_log
  USING ((coach_id = auth.uid()));

ALTER POLICY "coach_api_drafts_decide_own" ON public.coach_api_drafts
  USING (((coach_id = auth.uid()) AND (status = 'pending'::text)))
  WITH CHECK (((coach_id = auth.uid()) AND (status = 'rejected'::text)));

ALTER POLICY "coach_api_drafts_select_own" ON public.coach_api_drafts
  USING ((coach_id = auth.uid()));

ALTER POLICY "coach_api_keys_insert_own" ON public.coach_api_keys
  WITH CHECK (((coach_id = auth.uid()) AND (revoked_at IS NULL) AND (last_used_at IS NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::text, 'coach_athlete'::text])))))));

ALTER POLICY "coach_api_keys_revoke_own" ON public.coach_api_keys
  USING ((coach_id = auth.uid()))
  WITH CHECK ((coach_id = auth.uid()));

ALTER POLICY "coach_api_keys_select_own" ON public.coach_api_keys
  USING ((coach_id = auth.uid()));

ALTER POLICY "competitions_delete" ON public.competitions
  USING (can_coach_athlete(athlete_id));

ALTER POLICY "competitions_delete_athlete" ON public.competitions
  USING ((athlete_id = auth.uid()));

ALTER POLICY "competitions_insert" ON public.competitions
  WITH CHECK (can_coach_athlete(athlete_id));

ALTER POLICY "competitions_insert_athlete" ON public.competitions
  WITH CHECK ((athlete_id = auth.uid()));

ALTER POLICY "competitions_select" ON public.competitions
  USING (((athlete_id = auth.uid()) OR can_coach_athlete(athlete_id)));

ALTER POLICY "competitions_update" ON public.competitions
  USING (can_coach_athlete(athlete_id))
  WITH CHECK (can_coach_athlete(athlete_id));

ALTER POLICY "competitions_update_athlete" ON public.competitions
  USING ((athlete_id = auth.uid()))
  WITH CHECK ((athlete_id = auth.uid()));

ALTER POLICY "staff_competitions_read" ON public.competitions
  USING (staff_can(athlete_id, 'planification'::text, 'read'::text));

ALTER POLICY "cycles_delete" ON public.cycles
  USING (can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id))));

ALTER POLICY "cycles_insert" ON public.cycles
  WITH CHECK (((athlete_id = auth.uid()) OR can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id)))));

ALTER POLICY "cycles_select" ON public.cycles
  USING (((COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id)) = auth.uid()) OR can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id)))));

ALTER POLICY "cycles_update" ON public.cycles
  USING (can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id))))
  WITH CHECK (can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id))));

ALTER POLICY "staff_cycles_read" ON public.cycles
  USING (staff_can(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id)), 'planification'::text, 'read'::text));

ALTER POLICY "dt_athlete_select" ON public.day_themes
  USING ((athlete_id = auth.uid()));

ALTER POLICY "dt_coach_all" ON public.day_themes
  USING (((coach_id = auth.uid()) OR is_coach_of(athlete_id)))
  WITH CHECK (((coach_id = auth.uid()) AND ((athlete_id IS NULL) OR is_coach_of(athlete_id))));

ALTER POLICY "staff_day_themes_read" ON public.day_themes
  USING (staff_can(athlete_id, 'planification'::text, 'read'::text));

ALTER POLICY "doc_assignments_athlete_select" ON public.doc_assignments
  USING ((athlete_id = auth.uid()));

ALTER POLICY "doc_assignments_coach_all" ON public.doc_assignments
  USING (is_coach_of(athlete_id))
  WITH CHECK (is_coach_of(athlete_id));

ALTER POLICY "staff_doc_assignments_delete" ON public.doc_assignments
  USING (staff_can_edit(athlete_id, 'fiches'::text, assigned_by));

ALTER POLICY "staff_doc_assignments_insert" ON public.doc_assignments
  WITH CHECK (((assigned_by = auth.uid()) AND staff_can(athlete_id, 'fiches'::text, 'write'::text) AND staff_doc_for_athlete(doc_id, athlete_id)));

ALTER POLICY "staff_doc_assignments_read" ON public.doc_assignments
  USING (staff_can(athlete_id, 'fiches'::text, 'read'::text));

ALTER POLICY "doc_comments_delete_own" ON public.doc_comments
  USING ((author_id = auth.uid()));

ALTER POLICY "doc_comments_insert" ON public.doc_comments
  WITH CHECK (((author_id = auth.uid()) AND ((athlete_id = auth.uid()) OR is_coach_of(athlete_id)) AND can_read_doc(doc_id)));

ALTER POLICY "doc_comments_select" ON public.doc_comments
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id)));

ALTER POLICY "staff_doc_comments_insert" ON public.doc_comments
  WITH CHECK (((author_id = auth.uid()) AND staff_can(athlete_id, 'commentaires'::text, 'write'::text) AND can_read_doc(doc_id)));

ALTER POLICY "staff_doc_comments_read" ON public.doc_comments
  USING (staff_can(athlete_id, 'commentaires'::text, 'read'::text));

ALTER POLICY "doc_schedule_delete" ON public.doc_schedule
  USING ((is_coach_of(athlete_id) OR staff_can_edit(athlete_id, 'fiches'::text, added_by)));

ALTER POLICY "doc_schedule_insert" ON public.doc_schedule
  WITH CHECK (((added_by = auth.uid()) AND ((staff_can(athlete_id, 'fiches'::text, 'write'::text) AND staff_doc_for_athlete(doc_id, athlete_id)) OR (is_coach_of(athlete_id) AND (EXISTS ( SELECT 1
   FROM docs d
  WHERE ((d.id = doc_schedule.doc_id) AND ((d.coach_id = auth.uid()) OR is_athlete_coach(doc_schedule.athlete_id, d.coach_id)))))))));

ALTER POLICY "doc_schedule_select" ON public.doc_schedule
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR staff_can(athlete_id, 'fiches'::text, 'read'::text)));

ALTER POLICY "docs_athlete_delete" ON public.docs
  USING (((athlete_id = auth.uid()) AND (uploaded_by = auth.uid())));

ALTER POLICY "docs_athlete_insert" ON public.docs
  WITH CHECK (((athlete_id = auth.uid()) AND (uploaded_by = auth.uid()) AND (is_self_service = false) AND (origin_id IS NULL) AND (coach_id = my_coach_id())));

ALTER POLICY "docs_coach_delete" ON public.docs
  USING (((coach_id = auth.uid()) OR ((athlete_id IS NOT NULL) AND is_coach_of(athlete_id))));

ALTER POLICY "docs_coach_insert" ON public.docs
  WITH CHECK (((coach_id = auth.uid()) AND (uploaded_by = auth.uid()) AND ((athlete_id IS NULL) OR is_coach_of(athlete_id))));

ALTER POLICY "docs_coach_update" ON public.docs
  USING (((coach_id = auth.uid()) OR doc_for_my_athlete(id)))
  WITH CHECK (((coach_id = auth.uid()) OR is_coach_partner(coach_id)));

ALTER POLICY "docs_select" ON public.docs
  USING (((coach_id = auth.uid()) OR (uploaded_by = auth.uid()) OR (athlete_id = auth.uid()) OR can_read_doc(id)));

ALTER POLICY "staff_docs_delete" ON public.docs
  USING (staff_can_edit_doc(id));

ALTER POLICY "staff_docs_insert" ON public.docs
  WITH CHECK (((uploaded_by = auth.uid()) AND (coach_id <> auth.uid()) AND (is_self_service = false) AND staff_can_write_bank(coach_id) AND ((athlete_id IS NULL) OR staff_can(athlete_id, 'fiches'::text, 'write'::text))));

ALTER POLICY "staff_docs_update" ON public.docs
  USING (staff_can_edit_doc(id))
  WITH CHECK (((is_self_service = false) AND staff_can_write_bank(coach_id) AND ((athlete_id IS NULL) OR staff_can(athlete_id, 'fiches'::text, 'write'::text))));

ALTER POLICY "esa_delete" ON public.energy_session_assignments
  USING ((is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "esa_insert" ON public.energy_session_assignments
  WITH CHECK (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "esa_select" ON public.energy_session_assignments
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "esa_update" ON public.energy_session_assignments
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))))
  WITH CHECK (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "staff_esa_read" ON public.energy_session_assignments
  USING (staff_can(athlete_id, 'seances'::text, 'read'::text));

ALTER POLICY "es_delete" ON public.energy_sessions
  USING (((created_by = auth.uid()) OR ((athlete_id IS NOT NULL) AND is_coach_of(athlete_id))));

ALTER POLICY "es_insert" ON public.energy_sessions
  WITH CHECK (((is_verified = false) AND (created_by = auth.uid()) AND ((athlete_id IS NULL) OR (athlete_id = auth.uid()) OR is_coach_of(athlete_id))));

ALTER POLICY "es_select" ON public.energy_sessions
  USING (((is_public = true) OR (created_by = auth.uid()) OR (athlete_id = auth.uid()) OR ((athlete_id IS NOT NULL) AND is_coach_of(athlete_id)) OR (id IN ( SELECT a.energy_session_id
   FROM energy_session_assignments a
  WHERE (a.athlete_id = auth.uid()))) OR (id IN ( SELECT a.energy_session_id
   FROM energy_session_assignments a
  WHERE is_coach_of(a.athlete_id)))));

ALTER POLICY "es_update_author" ON public.energy_sessions
  USING (((created_by = auth.uid()) OR ((athlete_id IS NOT NULL) AND is_coach_of(athlete_id)) OR (id IN ( SELECT a.energy_session_id
   FROM energy_session_assignments a
  WHERE is_coach_of(a.athlete_id)))))
  WITH CHECK (((created_by = auth.uid()) OR ((athlete_id IS NOT NULL) AND is_coach_of(athlete_id)) OR (id IN ( SELECT a.energy_session_id
   FROM energy_session_assignments a
  WHERE is_coach_of(a.athlete_id)))));

ALTER POLICY "es_update_certify" ON public.energy_sessions
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_certified_coach = true) OR (profiles.is_admin = true))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_certified_coach = true) OR (profiles.is_admin = true))))));

ALTER POLICY "staff_energy_sessions_read" ON public.energy_sessions
  USING ((staff_can(athlete_id, 'seances'::text, 'read'::text) OR (EXISTS ( SELECT 1
   FROM energy_session_assignments a
  WHERE ((a.energy_session_id = energy_sessions.id) AND staff_can(a.athlete_id, 'seances'::text, 'read'::text))))));

ALTER POLICY "athlete_own_prs" ON public.exercise_pr_logs
  USING ((athlete_id = auth.uid()));

ALTER POLICY "coach_delete_athlete_prs" ON public.exercise_pr_logs
  USING (is_coach_of(athlete_id));

ALTER POLICY "coach_insert_athlete_prs" ON public.exercise_pr_logs
  WITH CHECK (is_coach_of(athlete_id));

ALTER POLICY "coach_sees_athlete_prs" ON public.exercise_pr_logs
  USING (is_coach_of(athlete_id));

ALTER POLICY "staff_exercise_pr_logs_read" ON public.exercise_pr_logs
  USING (staff_can(athlete_id, 'logs'::text, 'read'::text));

ALTER POLICY "Service write" ON public.exercises
  USING ((auth.role() = 'service_role'::text));

ALTER POLICY "exercises_delete_admin" ON public.exercises
  USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))) OR ((created_by = auth.uid()) AND (is_verified = false))));

ALTER POLICY "exercises_insert_admin" ON public.exercises
  WITH CHECK (((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "exercises_insert_coach" ON public.exercises
  WITH CHECK (((auth.uid() IS NOT NULL) AND (is_verified = false) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::text, 'coach_athlete'::text])))))));

ALTER POLICY "exercises_update_admin" ON public.exercises
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));

ALTER POLICY "exercises_update_certified" ON public.exercises
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_certified_coach = true) OR (profiles.is_admin = true))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_certified_coach = true) OR (profiles.is_admin = true))))));

ALTER POLICY "exercises_update_own" ON public.exercises
  USING (((created_by = auth.uid()) AND (is_verified = false)));

ALTER POLICY "habit_logs_delete" ON public.habit_logs
  USING ((athlete_id = auth.uid()));

ALTER POLICY "habit_logs_insert" ON public.habit_logs
  WITH CHECK ((athlete_id = auth.uid()));

ALTER POLICY "habit_logs_select" ON public.habit_logs
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "habit_logs_update" ON public.habit_logs
  USING ((athlete_id = auth.uid()));

ALTER POLICY "staff_habit_logs_read" ON public.habit_logs
  USING (staff_can(athlete_id, 'wellness'::text, 'read'::text));

ALTER POLICY "habits_delete" ON public.habits
  USING ((athlete_id = auth.uid()));

ALTER POLICY "habits_insert" ON public.habits
  WITH CHECK ((athlete_id = auth.uid()));

ALTER POLICY "habits_select" ON public.habits
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "habits_update" ON public.habits
  USING ((athlete_id = auth.uid()));

ALTER POLICY "staff_habits_read" ON public.habits
  USING (staff_can(athlete_id, 'wellness'::text, 'read'::text));

ALTER POLICY "health_sync_errors_admin" ON public.health_sync_errors
  USING (current_user_is_admin());

ALTER POLICY "hr_zone_models_read" ON public.hr_zone_models
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR staff_can(athlete_id, 'seances'::text, 'read'::text)));

ALTER POLICY "hyrox_axes_params_delete" ON public.hyrox_axes_params
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))));

ALTER POLICY "hyrox_axes_params_insert" ON public.hyrox_axes_params
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))));

ALTER POLICY "hyrox_axes_params_update" ON public.hyrox_axes_params
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))));

ALTER POLICY "hrp_delete" ON public.hyrox_race_plans
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))));

ALTER POLICY "hrp_insert" ON public.hyrox_race_plans
  WITH CHECK (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))));

ALTER POLICY "hrp_select" ON public.hyrox_race_plans
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))));

ALTER POLICY "hrp_update" ON public.hyrox_race_plans
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))));

ALTER POLICY "hrs_delete" ON public.hyrox_reference_segments
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))));

ALTER POLICY "hrs_insert" ON public.hyrox_reference_segments
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))));

ALTER POLICY "hrs_update" ON public.hyrox_reference_segments
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))));

ALTER POLICY "hr_delete" ON public.hyrox_results
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))));

ALTER POLICY "hr_insert" ON public.hyrox_results
  WITH CHECK (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))));

ALTER POLICY "hr_select" ON public.hyrox_results
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))));

ALTER POLICY "hr_update" ON public.hyrox_results
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))));

ALTER POLICY "hta_delete" ON public.hyrox_test_analyses
  USING ((is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))));

ALTER POLICY "hta_insert" ON public.hyrox_test_analyses
  WITH CHECK ((is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))));

ALTER POLICY "hta_select" ON public.hyrox_test_analyses
  USING ((((athlete_id = auth.uid()) AND (validated_at IS NOT NULL)) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))));

ALTER POLICY "hta_update" ON public.hyrox_test_analyses
  USING ((is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))));

ALTER POLICY "htad_all" ON public.hyrox_test_axes_drafts
  USING ((EXISTS ( SELECT 1
   FROM hyrox_test_analyses a
  WHERE ((a.id = hyrox_test_axes_drafts.analysis_id) AND (is_coach_of(a.athlete_id) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM hyrox_test_analyses a
  WHERE ((a.id = hyrox_test_axes_drafts.analysis_id) AND (is_coach_of(a.athlete_id) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))))))));

ALTER POLICY "hyrox_test_grid_versions_delete" ON public.hyrox_test_grid_versions
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))));

ALTER POLICY "hyrox_test_grid_versions_insert" ON public.hyrox_test_grid_versions
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))));

ALTER POLICY "hyrox_test_grid_versions_update" ON public.hyrox_test_grid_versions
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))));

ALTER POLICY "hyrox_test_grids_delete" ON public.hyrox_test_grids
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))));

ALTER POLICY "hyrox_test_grids_insert" ON public.hyrox_test_grids
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))));

ALTER POLICY "hyrox_test_grids_update" ON public.hyrox_test_grids
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))));

ALTER POLICY "hyrox_test_params_delete" ON public.hyrox_test_params
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))));

ALTER POLICY "hyrox_test_params_insert" ON public.hyrox_test_params
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))));

ALTER POLICY "hyrox_test_params_update" ON public.hyrox_test_params
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))));

ALTER POLICY "hyrox_work_axes_rules_delete" ON public.hyrox_work_axes_rules
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))));

ALTER POLICY "hyrox_work_axes_rules_insert" ON public.hyrox_work_axes_rules
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))));

ALTER POLICY "hyrox_work_axes_rules_update" ON public.hyrox_work_axes_rules
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))));

ALTER POLICY "macrocycles_delete" ON public.macrocycles
  USING (can_coach_athlete(athlete_id));

ALTER POLICY "macrocycles_insert" ON public.macrocycles
  WITH CHECK (can_coach_athlete(athlete_id));

ALTER POLICY "macrocycles_select" ON public.macrocycles
  USING (((athlete_id = auth.uid()) OR can_coach_athlete(athlete_id)));

ALTER POLICY "macrocycles_update" ON public.macrocycles
  USING (can_coach_athlete(athlete_id))
  WITH CHECK (can_coach_athlete(athlete_id));

ALTER POLICY "staff_macrocycles_read" ON public.macrocycles
  USING (staff_can(athlete_id, 'planification'::text, 'read'::text));

ALTER POLICY "athlete_own_measurements" ON public.measurement_logs
  USING ((athlete_id = auth.uid()))
  WITH CHECK ((athlete_id = auth.uid()));

ALTER POLICY "coach_read_measurements" ON public.measurement_logs
  USING (is_coach_of(athlete_id));

ALTER POLICY "staff_measurement_logs_read" ON public.measurement_logs
  USING (staff_can(athlete_id, 'nutrition'::text, 'read'::text));

ALTER POLICY "medical_entries_all" ON public.medical_entries
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id)))
  WITH CHECK (((athlete_id = auth.uid()) OR is_coach_of(athlete_id)));

ALTER POLICY "staff_medical_entries_delete" ON public.medical_entries
  USING (staff_can_edit(athlete_id, 'medical'::text, created_by));

ALTER POLICY "staff_medical_entries_insert" ON public.medical_entries
  WITH CHECK (((created_by = auth.uid()) AND staff_can(athlete_id, 'medical'::text, 'write'::text)));

ALTER POLICY "staff_medical_entries_read" ON public.medical_entries
  USING (staff_can(athlete_id, 'medical'::text, 'read'::text));

ALTER POLICY "staff_medical_entries_update" ON public.medical_entries
  USING (staff_can_edit(athlete_id, 'medical'::text, created_by))
  WITH CHECK (staff_can_edit(athlete_id, 'medical'::text, created_by));

ALTER POLICY "mesocycles_delete" ON public.mesocycles
  USING ((EXISTS ( SELECT 1
   FROM macrocycles m
  WHERE ((m.id = mesocycles.macrocycle_id) AND can_coach_athlete(m.athlete_id)))));

ALTER POLICY "mesocycles_insert" ON public.mesocycles
  WITH CHECK ((EXISTS ( SELECT 1
   FROM macrocycles m
  WHERE ((m.id = mesocycles.macrocycle_id) AND can_coach_athlete(m.athlete_id)))));

ALTER POLICY "mesocycles_select" ON public.mesocycles
  USING ((EXISTS ( SELECT 1
   FROM macrocycles m
  WHERE ((m.id = mesocycles.macrocycle_id) AND ((m.athlete_id = auth.uid()) OR can_coach_athlete(m.athlete_id))))));

ALTER POLICY "mesocycles_update" ON public.mesocycles
  USING ((EXISTS ( SELECT 1
   FROM macrocycles m
  WHERE ((m.id = mesocycles.macrocycle_id) AND can_coach_athlete(m.athlete_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM macrocycles m
  WHERE ((m.id = mesocycles.macrocycle_id) AND can_coach_athlete(m.athlete_id)))));

ALTER POLICY "staff_mesocycles_read" ON public.mesocycles
  USING (staff_can(( SELECT m.athlete_id
   FROM macrocycles m
  WHERE (m.id = mesocycles.macrocycle_id)), 'planification'::text, 'read'::text));

ALTER POLICY "microcycles_delete" ON public.microcycles
  USING (can_coach_athlete(cycle_athlete_id(cycle_id)));

ALTER POLICY "microcycles_insert" ON public.microcycles
  WITH CHECK (can_coach_athlete(cycle_athlete_id(cycle_id)));

ALTER POLICY "microcycles_select" ON public.microcycles
  USING (((cycle_athlete_id(cycle_id) = auth.uid()) OR can_coach_athlete(cycle_athlete_id(cycle_id))));

ALTER POLICY "microcycles_update" ON public.microcycles
  USING (can_coach_athlete(cycle_athlete_id(cycle_id)))
  WITH CHECK (can_coach_athlete(cycle_athlete_id(cycle_id)));

ALTER POLICY "staff_microcycles_read" ON public.microcycles
  USING (staff_can(cycle_athlete_id(cycle_id), 'planification'::text, 'read'::text));

ALTER POLICY "perf_delete" ON public.performance_logs
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "perf_insert" ON public.performance_logs
  WITH CHECK (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "perf_select" ON public.performance_logs
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "perf_update" ON public.performance_logs
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "staff_performance_logs_read" ON public.performance_logs
  USING (staff_can(athlete_id, 'logs'::text, 'read'::text));

ALTER POLICY "perf_notif_insert" ON public.performance_notifications
  WITH CHECK (((athlete_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "perf_notif_select" ON public.performance_notifications
  USING (((coach_id = auth.uid()) OR (athlete_id = auth.uid()) OR is_coach_of(athlete_id)));

ALTER POLICY "perf_notif_update" ON public.performance_notifications
  USING (((coach_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "pq_delete" ON public.physical_qualities
  USING ((coach_id = auth.uid()));

ALTER POLICY "pq_insert" ON public.physical_qualities
  WITH CHECK (((coach_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::text, 'coach_athlete'::text])))))));

ALTER POLICY "pq_select" ON public.physical_qualities
  USING (((coach_id IS NULL) OR (coach_id = auth.uid()) OR is_coach_partner(coach_id)));

ALTER POLICY "pq_update" ON public.physical_qualities
  USING ((coach_id = auth.uid()))
  WITH CHECK ((coach_id = auth.uid()));

ALTER POLICY "planning_blocks_delete" ON public.planning_blocks
  USING (can_coach_athlete(athlete_id));

ALTER POLICY "planning_blocks_insert" ON public.planning_blocks
  WITH CHECK (can_coach_athlete(athlete_id));

ALTER POLICY "planning_blocks_select" ON public.planning_blocks
  USING (((athlete_id = auth.uid()) OR can_coach_athlete(athlete_id)));

ALTER POLICY "planning_blocks_update" ON public.planning_blocks
  USING (can_coach_athlete(athlete_id))
  WITH CHECK (can_coach_athlete(athlete_id));

ALTER POLICY "staff_planning_blocks_read" ON public.planning_blocks
  USING (staff_can(athlete_id, 'planification'::text, 'read'::text));

ALTER POLICY "Coach can unlink own athletes" ON public.profiles
  USING ((coach_id = auth.uid()))
  WITH CHECK ((coach_id IS NULL));

ALTER POLICY "Users can update own profile" ON public.profiles
  USING ((auth.uid() = id))
  WITH CHECK ((auth.uid() = id));

ALTER POLICY "coaches_can_update_athlete_profiles" ON public.profiles
  USING ((coach_id = auth.uid()))
  WITH CHECK ((coach_id = auth.uid()));

ALTER POLICY "profiles_insert_own" ON public.profiles
  WITH CHECK ((auth.uid() = id));

ALTER POLICY "profiles_select_athletes" ON public.profiles
  USING ((coach_id = auth.uid()));

ALTER POLICY "profiles_select_co_coached" ON public.profiles
  USING (is_co_coach_of(id));

ALTER POLICY "profiles_select_own" ON public.profiles
  USING ((auth.uid() = id));

ALTER POLICY "profiles_update_co_coached" ON public.profiles
  USING (is_co_coach_of(id))
  WITH CHECK (is_co_coach_of(id));

ALTER POLICY "profiles_update_own" ON public.profiles
  USING ((auth.uid() = id));

ALTER POLICY "provider_activities_coach_read" ON public.provider_activities
  USING ((is_coach_of(athlete_id) AND (EXISTS ( SELECT 1
   FROM data_source_policies p
  WHERE ((p.source = provider_activities.source) AND p.coach_visible))) AND source_consent_granted(athlete_id, source)));

ALTER POLICY "provider_activities_own_file_import" ON public.provider_activities
  USING (((athlete_id = auth.uid()) AND (source = 'file_import'::data_source)))
  WITH CHECK (((athlete_id = auth.uid()) AND (source = 'file_import'::data_source)));

ALTER POLICY "provider_activities_own_read" ON public.provider_activities
  USING ((athlete_id = auth.uid()));

ALTER POLICY "provider_connections_coach_read" ON public.provider_connections
  USING (is_coach_of(athlete_id));

ALTER POLICY "provider_connections_own_read" ON public.provider_connections
  USING ((athlete_id = auth.uid()));

ALTER POLICY "provider_dailies_coach_read" ON public.provider_dailies
  USING ((is_coach_of(athlete_id) AND (EXISTS ( SELECT 1
   FROM data_source_policies p
  WHERE ((p.source = provider_dailies.source) AND p.coach_visible))) AND source_consent_granted(athlete_id, source)));

ALTER POLICY "provider_dailies_own_read" ON public.provider_dailies
  USING ((athlete_id = auth.uid()));

ALTER POLICY "provider_intraday_read" ON public.provider_intraday
  USING (activity_detail_visible(athlete_id, source));

ALTER POLICY "provider_moveiq_read" ON public.provider_moveiq
  USING (activity_detail_visible(athlete_id, source));

ALTER POLICY "provider_raw_records_own_read" ON public.provider_raw_records
  USING ((athlete_id = auth.uid()));

ALTER POLICY "provider_workout_pushes_coach_read" ON public.provider_workout_pushes
  USING (is_coach_of(athlete_id));

ALTER POLICY "provider_workout_pushes_own_read" ON public.provider_workout_pushes
  USING ((athlete_id = auth.uid()));

ALTER POLICY "roadmap_items_admin_write" ON public.roadmap_items
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));

ALTER POLICY "roadmap_items_coach_suggest" ON public.roadmap_items
  WITH CHECK (((status = 'idea'::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_certified_coach = true))))));

ALTER POLICY "roadmap_items_select" ON public.roadmap_items
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_certified_coach = true) OR (p.is_admin = true))))));

ALTER POLICY "roadmap_phases_select" ON public.roadmap_phases
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_certified_coach = true) OR (p.is_admin = true))))));

ALTER POLICY "roadmap_phases_write" ON public.roadmap_phases
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));

ALTER POLICY "roadmap_votes_select" ON public.roadmap_votes
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_certified_coach = true) OR (p.is_admin = true))))));

ALTER POLICY "roadmap_votes_write" ON public.roadmap_votes
  USING ((user_id = auth.uid()))
  WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_certified_coach = true) OR (p.is_admin = true)))))));

ALTER POLICY "seasons_delete" ON public.seasons
  USING (can_coach_athlete(athlete_id));

ALTER POLICY "seasons_insert" ON public.seasons
  WITH CHECK (can_coach_athlete(athlete_id));

ALTER POLICY "seasons_select" ON public.seasons
  USING (((athlete_id = auth.uid()) OR can_coach_athlete(athlete_id)));

ALTER POLICY "seasons_update" ON public.seasons
  USING (can_coach_athlete(athlete_id))
  WITH CHECK (can_coach_athlete(athlete_id));

ALTER POLICY "staff_seasons_read" ON public.seasons
  USING (staff_can(athlete_id, 'planification'::text, 'read'::text));

ALTER POLICY "sb_delete" ON public.specific_blocks
  USING ((coach_id = auth.uid()));

ALTER POLICY "sb_insert" ON public.specific_blocks
  WITH CHECK (((coach_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::text, 'coach_athlete'::text])))))));

ALTER POLICY "sb_select" ON public.specific_blocks
  USING ((coach_id = auth.uid()));

ALTER POLICY "sb_update" ON public.specific_blocks
  USING ((coach_id = auth.uid()))
  WITH CHECK ((coach_id = auth.uid()));

ALTER POLICY "ss_delete" ON public.specific_sports
  USING ((coach_id = auth.uid()));

ALTER POLICY "ss_insert" ON public.specific_sports
  WITH CHECK (((coach_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::text, 'coach_athlete'::text])))))));

ALTER POLICY "ss_select" ON public.specific_sports
  USING (((coach_id IS NULL) OR (coach_id = auth.uid()) OR is_coach_partner(coach_id)));

ALTER POLICY "ss_update" ON public.specific_sports
  USING ((coach_id = auth.uid()))
  WITH CHECK ((coach_id = auth.uid()));

ALTER POLICY "staff_invitations_delete" ON public.staff_invitations
  USING (((used_at IS NULL) AND ((invited_by = auth.uid()) OR is_coach_of(athlete_id))));

ALTER POLICY "staff_invitations_insert" ON public.staff_invitations
  WITH CHECK (((invited_by = auth.uid()) AND (is_coach_of(athlete_id) OR (athlete_id = auth.uid()))));

ALTER POLICY "staff_invitations_select" ON public.staff_invitations
  USING (((invited_by = auth.uid()) OR (athlete_id = auth.uid()) OR is_coach_of(athlete_id)));

ALTER POLICY "td_delete" ON public.test_definitions
  USING (((auth.uid() = created_by) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "td_delete_coach_library" ON public.test_definitions
  USING (((created_by IS NULL) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::text, 'coach_athlete'::text])))))));

ALTER POLICY "td_insert" ON public.test_definitions
  WITH CHECK (((auth.uid() = created_by) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "td_select" ON public.test_definitions
  USING ((auth.uid() IS NOT NULL));

ALTER POLICY "td_update" ON public.test_definitions
  USING (((auth.uid() = created_by) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "td_update_coach_library" ON public.test_definitions
  USING (((created_by IS NULL) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::text, 'coach_athlete'::text])))))))
  WITH CHECK ((created_by IS NULL));

ALTER POLICY "staff_test_results_read" ON public.test_results
  USING (staff_can(athlete_id, 'tests'::text, 'read'::text));

ALTER POLICY "test_results_delete" ON public.test_results
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id)));

ALTER POLICY "test_results_insert" ON public.test_results
  WITH CHECK (((athlete_id = auth.uid()) OR is_coach_of(athlete_id)));

ALTER POLICY "test_results_select" ON public.test_results
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id)));

ALTER POLICY "test_results_update" ON public.test_results
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id)));

ALTER POLICY "staff_test_sessions_read" ON public.test_sessions
  USING (staff_can(athlete_id, 'tests'::text, 'read'::text));

ALTER POLICY "test_delete" ON public.test_sessions
  USING (((athlete_id = auth.uid()) OR (coach_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "test_insert" ON public.test_sessions
  WITH CHECK (((athlete_id = auth.uid()) OR ((coach_id = auth.uid()) AND ((athlete_id IS NULL) OR is_coach_of(athlete_id))) OR current_user_is_admin()));

ALTER POLICY "test_select" ON public.test_sessions
  USING (((athlete_id = auth.uid()) OR (coach_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "test_update" ON public.test_sessions
  USING (((athlete_id = auth.uid()) OR (coach_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "tv_delete" ON public.test_variables
  USING ((EXISTS ( SELECT 1
   FROM test_definitions td
  WHERE ((td.id = test_variables.test_definition_id) AND ((td.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))))));

ALTER POLICY "tv_insert" ON public.test_variables
  WITH CHECK ((EXISTS ( SELECT 1
   FROM test_definitions td
  WHERE ((td.id = test_variables.test_definition_id) AND ((td.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))))));

ALTER POLICY "tv_select" ON public.test_variables
  USING ((auth.uid() IS NOT NULL));

ALTER POLICY "tv_update" ON public.test_variables
  USING ((EXISTS ( SELECT 1
   FROM test_definitions td
  WHERE ((td.id = test_variables.test_definition_id) AND ((td.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))))));

ALTER POLICY "tv_write_coach_library" ON public.test_variables
  USING (((EXISTS ( SELECT 1
   FROM test_definitions td
  WHERE ((td.id = test_variables.test_definition_id) AND (td.created_by IS NULL)))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::text, 'coach_athlete'::text])))))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM test_definitions td
  WHERE ((td.id = test_variables.test_definition_id) AND (td.created_by IS NULL)))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::text, 'coach_athlete'::text])))))));

ALTER POLICY "tests_delete" ON public.tests
  USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "tests_insert" ON public.tests
  WITH CHECK (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::text, 'coach_athlete'::text])))))));

ALTER POLICY "tests_select" ON public.tests
  USING ((auth.uid() IS NOT NULL));

ALTER POLICY "tests_update" ON public.tests
  USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "methods_delete_own" ON public.training_methods
  USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "methods_insert_coach" ON public.training_methods
  WITH CHECK (((is_official = false) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::text, 'coach_athlete'::text])))))));

ALTER POLICY "methods_update_own" ON public.training_methods
  USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

ALTER POLICY "user_consents_insert_own" ON public.user_consents
  WITH CHECK ((user_id = auth.uid()));

ALTER POLICY "user_consents_select_own" ON public.user_consents
  USING ((user_id = auth.uid()));

ALTER POLICY "staff_weekly_retours_read" ON public.weekly_retours
  USING (staff_can(athlete_id, 'commentaires'::text, 'read'::text));

ALTER POLICY "wr_athlete_select" ON public.weekly_retours
  USING ((athlete_id = auth.uid()));

ALTER POLICY "wr_coach_all" ON public.weekly_retours
  USING (((coach_id = auth.uid()) OR is_coach_of(athlete_id)))
  WITH CHECK (((coach_id = auth.uid()) AND ((athlete_id IS NULL) OR is_coach_of(athlete_id))));

ALTER POLICY "weekly_reviews_coach" ON public.weekly_reviews
  USING (((status = 'submitted'::text) AND is_coach_of(athlete_id)));

ALTER POLICY "weekly_reviews_self" ON public.weekly_reviews
  USING ((athlete_id = auth.uid()));

ALTER POLICY "weekly_reviews_staff" ON public.weekly_reviews
  USING (((status = 'submitted'::text) AND staff_can(athlete_id, 'wellness'::text, 'read'::text)));

ALTER POLICY "wellness_entries_coach" ON public.wellness_entries
  USING (is_coach_of(athlete_id));

ALTER POLICY "wellness_entries_self" ON public.wellness_entries
  USING ((athlete_id = auth.uid()));

ALTER POLICY "wellness_entries_staff" ON public.wellness_entries
  USING (((NOT archived) AND staff_can(athlete_id, 'wellness'::text, 'read'::text)));

ALTER POLICY "staff_workout_exercise_comments_read" ON public.workout_exercise_comments
  USING (staff_can(workout_log_athlete_id(workout_log_id), 'commentaires'::text, 'read'::text));

ALTER POLICY "workout_exercise_comments_coach_read" ON public.workout_exercise_comments
  USING ((EXISTS ( SELECT 1
   FROM workout_logs wl
  WHERE ((wl.id = workout_exercise_comments.workout_log_id) AND is_coach_of(wl.athlete_id)))));

ALTER POLICY "workout_exercise_comments_self" ON public.workout_exercise_comments
  USING ((EXISTS ( SELECT 1
   FROM workout_logs wl
  WHERE ((wl.id = workout_exercise_comments.workout_log_id) AND (wl.athlete_id = auth.uid())))));

ALTER POLICY "staff_workout_logs_read" ON public.workout_logs
  USING (staff_can(athlete_id, 'logs'::text, 'read'::text));

ALTER POLICY "workout_logs_coach_delete" ON public.workout_logs
  USING (is_coach_of(athlete_id));

ALTER POLICY "workout_logs_coach_insert" ON public.workout_logs
  WITH CHECK (is_coach_of(athlete_id));

ALTER POLICY "workout_logs_coach_read" ON public.workout_logs
  USING (is_coach_of(athlete_id));

ALTER POLICY "workout_logs_coach_update" ON public.workout_logs
  USING (is_coach_of(athlete_id));

ALTER POLICY "workout_logs_self_insert" ON public.workout_logs
  WITH CHECK ((athlete_id = auth.uid()));

ALTER POLICY "workout_logs_self_select" ON public.workout_logs
  USING ((athlete_id = auth.uid()));

ALTER POLICY "workout_logs_self_update" ON public.workout_logs
  USING ((athlete_id = auth.uid()))
  WITH CHECK ((athlete_id = auth.uid()));

ALTER POLICY "athlete_own_rpe" ON public.workout_rpe
  USING ((athlete_id = auth.uid()));

ALTER POLICY "coach_read_athlete_rpe" ON public.workout_rpe
  USING (is_coach_of(athlete_id));

ALTER POLICY "staff_workout_rpe_read" ON public.workout_rpe
  USING (staff_can(athlete_id, 'logs'::text, 'read'::text));

ALTER POLICY "workout_rpe_select" ON public.workout_rpe
  USING (((athlete_id = auth.uid()) OR is_coach_of(athlete_id)));

ALTER POLICY "athlete_delete_test_media" ON storage.objects
  USING (((bucket_id = 'test-media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

ALTER POLICY "athlete_read_test_media" ON storage.objects
  USING (((bucket_id = 'test-media'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_coach_of_folder((storage.foldername(name))[1]))));

ALTER POLICY "athlete_upload_test_media" ON storage.objects
  WITH CHECK (((bucket_id = 'test-media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

ALTER POLICY "coach_delete_athlete_test_media" ON storage.objects
  USING (((bucket_id = 'test-media'::text) AND is_coach_of_folder((storage.foldername(name))[1])));

ALTER POLICY "coach_upload_athlete_test_media" ON storage.objects
  WITH CHECK (((bucket_id = 'test-media'::text) AND is_coach_of_folder((storage.foldername(name))[1])));

ALTER POLICY "coach_upload_test_media" ON storage.objects
  WITH CHECK (((bucket_id = 'test-media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'coach'::text))))));

ALTER POLICY "docs_storage_delete" ON storage.objects
  USING (((bucket_id = 'docs'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (((storage.foldername(name))[2] = 'athletes'::text) AND ((storage.foldername(name))[3] = (auth.uid())::text) AND ((NOT (EXISTS ( SELECT 1
   FROM docs d
  WHERE (d.file_path = objects.name)))) OR (EXISTS ( SELECT 1
   FROM docs d
  WHERE ((d.file_path = objects.name) AND (d.uploaded_by = auth.uid()))))) AND (NOT (EXISTS ( SELECT 1
   FROM doc_comments c
  WHERE ((c.image_path = objects.name) AND (c.author_id <> auth.uid())))))))));

ALTER POLICY "docs_storage_insert" ON storage.objects
  WITH CHECK (((bucket_id = 'docs'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (((storage.foldername(name))[1] = (my_coach_id())::text) AND ((storage.foldername(name))[2] = 'athletes'::text) AND ((storage.foldername(name))[3] = (auth.uid())::text)))));

ALTER POLICY "docs_storage_select" ON storage.objects
  USING (((bucket_id = 'docs'::text) AND (can_read_doc_file(name) OR (owner_id = (auth.uid())::text))));

ALTER POLICY "energy_photo_delete" ON storage.objects
  USING (((bucket_id = 'energy-exercise-photos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

ALTER POLICY "energy_photo_upload" ON storage.objects
  WITH CHECK (((bucket_id = 'energy-exercise-photos'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = ANY (ARRAY['coach'::text, 'coach_athlete'::text])) OR (profiles.is_admin = true)))))));

ALTER POLICY "garmin_delete" ON storage.objects
  USING (((bucket_id = 'garmin-screenshots'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

ALTER POLICY "garmin_select" ON storage.objects
  USING (((bucket_id = 'garmin-screenshots'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_coach_of_folder((storage.foldername(name))[1]) OR current_user_is_admin())));

ALTER POLICY "garmin_upload" ON storage.objects
  WITH CHECK (((bucket_id = 'garmin-screenshots'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

ALTER POLICY "owner_update_test_media" ON storage.objects
  USING (((bucket_id = 'test-media'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_coach_of_folder((storage.foldername(name))[1]))))
  WITH CHECK (((bucket_id = 'test-media'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_coach_of_folder((storage.foldername(name))[1]))));

ALTER POLICY "provider_raw_own_read" ON storage.objects
  USING (((bucket_id = 'provider-raw'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

ALTER POLICY "staff_docs_storage_delete" ON storage.objects
  USING (((bucket_id = 'docs'::text) AND ((EXISTS ( SELECT 1
   FROM docs d
  WHERE ((d.file_path = objects.name) AND staff_can_edit_doc(d.id)))) OR (EXISTS ( SELECT 1
   FROM doc_comments c
  WHERE ((c.image_path = objects.name) AND (c.author_id = auth.uid())))) OR ((owner_id = (auth.uid())::text) AND (NOT (EXISTS ( SELECT 1
   FROM docs d
  WHERE (d.file_path = objects.name)))) AND (NOT (EXISTS ( SELECT 1
   FROM doc_comments c
  WHERE (c.image_path = objects.name)))) AND staff_can_write_docs_path(name)))));

ALTER POLICY "staff_docs_storage_insert" ON storage.objects
  WITH CHECK (((bucket_id = 'docs'::text) AND staff_can_write_docs_path(name)));

ALTER POLICY "test_files_delete" ON storage.objects
  USING (((bucket_id = 'test-files'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

ALTER POLICY "test_files_select" ON storage.objects
  USING (((bucket_id = 'test-files'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_coach_of_folder((storage.foldername(name))[1]) OR current_user_is_admin())));

ALTER POLICY "test_files_upload" ON storage.objects
  WITH CHECK (((bucket_id = 'test-files'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

-- is_coach_of redevient SECURITY INVOKER, corps d'avant.
CREATE OR REPLACE FUNCTION public.is_coach_of(athlete_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = athlete_uuid
      AND coach_id = auth.uid()
  ) OR public.is_co_coach_of(athlete_uuid);
$$;
COMMENT ON FUNCTION public.is_coach_of(uuid) IS 'Retourne true si auth.uid() est le coach de l''athlète donné.';

DROP FUNCTION IF EXISTS public.i_am_coach();
DROP FUNCTION IF EXISTS public.i_am_staff();

COMMIT;
