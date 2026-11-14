-- Équivalence des policies réécrites par 20261115193700_rls_perf_preconditions.sql.
-- Pour chaque expression modifiée (ancienne → nouvelle), chaque utilisateur de la base (+ anon et un
-- uuid sans compte) et chaque ligne de la table : (ancienne) IS DISTINCT FROM (nouvelle) doit être
-- faux, NULL compris. Exécuté en postgres (RLS contournée sur la table lue) avec le jeton de
-- l'utilisateur : on compare les deux formules, pas ce que la RLS laisse voir (c'est
-- rls_perf_roles.sql qui le fait). Aucune donnée n'est affichée : seulement des comptes.
-- Toujours annulé (ROLLBACK).
BEGIN;
-- Les deux préconditions (no-op si la migration est déjà appliquée).
CREATE OR REPLACE FUNCTION public.i_am_coach()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.profiles WHERE coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.athlete_co_coaches WHERE co_coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND role IN ('coach', 'coach_athlete'))
  );
$$;

COMMENT ON FUNCTION public.i_am_coach() IS
  'Précondition RLS, calculée une fois par requête via (SELECT public.i_am_coach()) : vraie si l''utilisateur coache au moins un athlète (référent ou co-coach) ou a le rôle coach. Toute fonction coach vraie (is_coach_of, can_coach_athlete…) l''implique.';

CREATE OR REPLACE FUNCTION public.i_am_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.athlete_staff
     WHERE staff_id = auth.uid() AND status = 'active'
  );
$$;

COMMENT ON FUNCTION public.i_am_staff() IS
  'Précondition RLS, calculée une fois par requête via (SELECT public.i_am_staff()) : vraie si l''utilisateur a au moins un lien staff actif. Toute fonction staff vraie (staff_can, staff_can_edit…) l''implique.';

-- Les policies « TO public » sont aussi évaluées pour anon : mêmes droits que is_coach_of.
REVOKE ALL ON FUNCTION public.i_am_coach() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.i_am_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.i_am_coach() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.i_am_staff() TO anon, authenticated, service_role;


CREATE TEMP TABLE ex(sch text, tbl text, pol text, kind text, old text, new text) ON COMMIT DROP;
INSERT INTO ex VALUES
('public','activity_laps','activity_laps_read','USING','activity_detail_visible(athlete_id, source)','((athlete_id = (SELECT auth.uid())) OR (((SELECT public.i_am_coach()) OR (SELECT public.i_am_staff())) AND activity_detail_visible(athlete_id, source)))'),
('public','activity_plan_links','activity_plan_links_read','USING','activity_detail_visible(athlete_id, source)','((athlete_id = (SELECT auth.uid())) OR (((SELECT public.i_am_coach()) OR (SELECT public.i_am_staff())) AND activity_detail_visible(athlete_id, source)))'),
('public','activity_sets','activity_sets_read','USING','activity_detail_visible(athlete_id, source)','((athlete_id = (SELECT auth.uid())) OR (((SELECT public.i_am_coach()) OR (SELECT public.i_am_staff())) AND activity_detail_visible(athlete_id, source)))'),
('public','activity_streams','activity_streams_read','USING','activity_detail_visible(athlete_id, source)','((athlete_id = (SELECT auth.uid())) OR (((SELECT public.i_am_coach()) OR (SELECT public.i_am_staff())) AND activity_detail_visible(athlete_id, source)))'),
('public','activity_zone_summaries','activity_zone_summaries_read','USING','activity_detail_visible(athlete_id, source)','((athlete_id = (SELECT auth.uid())) OR (((SELECT public.i_am_coach()) OR (SELECT public.i_am_staff())) AND activity_detail_visible(athlete_id, source)))'),
('public','app_data','app_data_coach','USING','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','app_data','app_data_self','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','app_data','staff_app_data_read','USING','staff_can(athlete_id, staff_app_data_domain(key), ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, staff_app_data_domain(key), ''read''::text))'),
('public','app_feedback','app_feedback_delete','USING','(EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_certified_coach = true) OR (p.is_admin = true)))))','(EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND ((p.is_certified_coach = true) OR (p.is_admin = true)))))'),
('public','app_feedback','app_feedback_insert_own','CHECK','(author_id = auth.uid())','(author_id = (SELECT auth.uid()))'),
('public','app_feedback','app_feedback_select','USING','((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_certified_coach = true) OR (p.is_admin = true))))))','((author_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND ((p.is_certified_coach = true) OR (p.is_admin = true))))))'),
('public','app_feedback','app_feedback_update','USING','(EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_certified_coach = true) OR (p.is_admin = true)))))','(EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND ((p.is_certified_coach = true) OR (p.is_admin = true)))))'),
('public','app_update_reads','app_update_reads_own_insert','CHECK','(user_id = auth.uid())','(user_id = (SELECT auth.uid()))'),
('public','app_update_reads','app_update_reads_own_select','USING','(user_id = auth.uid())','(user_id = (SELECT auth.uid()))'),
('public','athlete_claims','athlete_claims_select_coach','USING','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','athlete_co_coaches','acc_select','USING','((athlete_id = auth.uid()) OR (co_coach_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = athlete_co_coaches.athlete_id) AND (p.coach_id = auth.uid())))))','((athlete_id = (SELECT auth.uid())) OR (co_coach_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = athlete_co_coaches.athlete_id) AND (p.coach_id = (SELECT auth.uid()))))))'),
('public','athlete_life_events','life_events_delete','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','athlete_life_events','life_events_insert','CHECK','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','athlete_life_events','life_events_select','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)))'),
('public','athlete_life_events','life_events_update','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','athlete_life_events','staff_life_events_read','USING','staff_can(athlete_id, ''medical''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''medical''::text, ''read''::text))'),
('public','athlete_profile_items','api_all_coach','USING','(is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','(((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','athlete_profile_items','api_all_coach','CHECK','(is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','(((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','athlete_profile_items','api_select','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','athlete_staff','athlete_staff_select','USING','((staff_id = auth.uid()) OR (athlete_id = auth.uid()) OR is_coach_of(athlete_id))','((staff_id = (SELECT auth.uid())) OR (athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)))'),
('public','athlete_staff','athlete_staff_update','USING','((staff_id = auth.uid()) OR (athlete_id = auth.uid()) OR is_coach_of(athlete_id))','((staff_id = (SELECT auth.uid())) OR (athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)))'),
('public','athlete_staff','athlete_staff_update','CHECK','((staff_id = auth.uid()) OR (athlete_id = auth.uid()) OR is_coach_of(athlete_id))','((staff_id = (SELECT auth.uid())) OR (athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)))'),
('public','athlete_test_results','atr_delete','USING','(is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','(((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','athlete_test_results','atr_insert','CHECK','(is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','(((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','athlete_test_results','atr_select','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','athlete_test_results','atr_update','USING','(is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','(((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','athlete_test_results','staff_athlete_test_results_read','USING','staff_can(athlete_id, ''tests''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''tests''::text, ''read''::text))'),
('public','athlete_test_values','atv_delete','USING','(EXISTS ( SELECT 1
   FROM athlete_test_results r
  WHERE ((r.id = athlete_test_values.result_id) AND (is_coach_of(r.athlete_id) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))))))','(EXISTS ( SELECT 1
   FROM athlete_test_results r
  WHERE ((r.id = athlete_test_values.result_id) AND (((SELECT public.i_am_coach()) AND is_coach_of(r.athlete_id)) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true))))))))'),
('public','athlete_test_values','atv_insert','CHECK','(EXISTS ( SELECT 1
   FROM athlete_test_results r
  WHERE ((r.id = athlete_test_values.result_id) AND (is_coach_of(r.athlete_id) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))))))','(EXISTS ( SELECT 1
   FROM athlete_test_results r
  WHERE ((r.id = athlete_test_values.result_id) AND (((SELECT public.i_am_coach()) AND is_coach_of(r.athlete_id)) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true))))))))'),
('public','athlete_test_values','atv_select','USING','(EXISTS ( SELECT 1
   FROM athlete_test_results r
  WHERE ((r.id = athlete_test_values.result_id) AND ((r.athlete_id = auth.uid()) OR is_coach_of(r.athlete_id) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))))))','(EXISTS ( SELECT 1
   FROM athlete_test_results r
  WHERE ((r.id = athlete_test_values.result_id) AND ((r.athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(r.athlete_id)) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true))))))))'),
('public','athlete_test_values','atv_update','USING','(EXISTS ( SELECT 1
   FROM athlete_test_results r
  WHERE ((r.id = athlete_test_values.result_id) AND (is_coach_of(r.athlete_id) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))))))','(EXISTS ( SELECT 1
   FROM athlete_test_results r
  WHERE ((r.id = athlete_test_values.result_id) AND (((SELECT public.i_am_coach()) AND is_coach_of(r.athlete_id)) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true))))))))'),
('public','athlete_test_values','staff_athlete_test_values_read','USING','(EXISTS ( SELECT 1
   FROM athlete_test_results r
  WHERE ((r.id = athlete_test_values.result_id) AND staff_can(r.athlete_id, ''tests''::text, ''read''::text))))','(EXISTS ( SELECT 1
   FROM athlete_test_results r
  WHERE ((r.id = athlete_test_values.result_id) AND ((SELECT public.i_am_staff()) AND staff_can(r.athlete_id, ''tests''::text, ''read''::text)))))'),
('public','body_weight_goals','body_weight_goals_coach','USING','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','body_weight_goals','body_weight_goals_self','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','body_weight_goals','body_weight_goals_staff','USING','staff_can(athlete_id, ''nutrition''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''nutrition''::text, ''read''::text))'),
('public','body_weight_logs','body_weight_logs_coach','USING','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','body_weight_logs','body_weight_logs_self','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','body_weight_logs','body_weight_logs_staff','USING','staff_can(athlete_id, ''nutrition''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''nutrition''::text, ''read''::text))'),
('public','body_weight_milestones','body_weight_milestones_coach','USING','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','body_weight_milestones','body_weight_milestones_self','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','body_weight_milestones','body_weight_milestones_staff','USING','staff_can(athlete_id, ''nutrition''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''nutrition''::text, ''read''::text))'),
('public','citation_likes','citation_likes: ajouter les siens','CHECK','(user_id = auth.uid())','(user_id = (SELECT auth.uid()))'),
('public','citation_likes','citation_likes: lire les siens','USING','(user_id = auth.uid())','(user_id = (SELECT auth.uid()))'),
('public','citation_likes','citation_likes: retirer les siens','USING','(user_id = auth.uid())','(user_id = (SELECT auth.uid()))'),
('public','coach_api_access_log','coach_api_access_log_select_own','USING','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','coach_api_drafts','coach_api_drafts_decide_own','USING','((coach_id = auth.uid()) AND (status = ''pending''::text))','((coach_id = (SELECT auth.uid())) AND (status = ''pending''::text))'),
('public','coach_api_drafts','coach_api_drafts_decide_own','CHECK','((coach_id = auth.uid()) AND (status = ''rejected''::text))','((coach_id = (SELECT auth.uid())) AND (status = ''rejected''::text))'),
('public','coach_api_drafts','coach_api_drafts_select_own','USING','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','coach_api_keys','coach_api_keys_insert_own','CHECK','((coach_id = auth.uid()) AND (revoked_at IS NULL) AND (last_used_at IS NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))','((coach_id = (SELECT auth.uid())) AND (revoked_at IS NULL) AND (last_used_at IS NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))'),
('public','coach_api_keys','coach_api_keys_revoke_own','USING','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','coach_api_keys','coach_api_keys_revoke_own','CHECK','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','coach_api_keys','coach_api_keys_select_own','USING','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','competitions','competitions_delete','USING','can_coach_athlete(athlete_id)','((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id))'),
('public','competitions','competitions_delete_athlete','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','competitions','competitions_insert','CHECK','can_coach_athlete(athlete_id)','((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id))'),
('public','competitions','competitions_insert_athlete','CHECK','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','competitions','competitions_select','USING','((athlete_id = auth.uid()) OR can_coach_athlete(athlete_id))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id)))'),
('public','competitions','competitions_update','USING','can_coach_athlete(athlete_id)','((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id))'),
('public','competitions','competitions_update','CHECK','can_coach_athlete(athlete_id)','((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id))'),
('public','competitions','competitions_update_athlete','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','competitions','competitions_update_athlete','CHECK','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','competitions','staff_competitions_read','USING','staff_can(athlete_id, ''planification''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''planification''::text, ''read''::text))'),
('public','cycles','cycles_delete','USING','can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id)))','((SELECT public.i_am_coach()) AND can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id))))'),
('public','cycles','cycles_insert','CHECK','((athlete_id = auth.uid()) OR can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id)))))'),
('public','cycles','cycles_select','USING','((COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id)) = auth.uid()) OR can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id))))','((COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id)) = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id)))))'),
('public','cycles','cycles_update','USING','can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id)))','((SELECT public.i_am_coach()) AND can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id))))'),
('public','cycles','cycles_update','CHECK','can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id)))','((SELECT public.i_am_coach()) AND can_coach_athlete(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id))))'),
('public','cycles','staff_cycles_read','USING','staff_can(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id)), ''planification''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(COALESCE(athlete_id, mesocycle_athlete_id(mesocycle_id)), ''planification''::text, ''read''::text))'),
('public','day_themes','dt_athlete_select','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','day_themes','dt_coach_all','USING','((coach_id = auth.uid()) OR is_coach_of(athlete_id))','((coach_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)))'),
('public','day_themes','dt_coach_all','CHECK','((coach_id = auth.uid()) AND ((athlete_id IS NULL) OR is_coach_of(athlete_id)))','((coach_id = (SELECT auth.uid())) AND ((athlete_id IS NULL) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))))'),
('public','day_themes','staff_day_themes_read','USING','staff_can(athlete_id, ''planification''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''planification''::text, ''read''::text))'),
('public','doc_assignments','doc_assignments_athlete_select','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','doc_assignments','doc_assignments_coach_all','USING','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','doc_assignments','doc_assignments_coach_all','CHECK','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','doc_assignments','staff_doc_assignments_delete','USING','staff_can_edit(athlete_id, ''fiches''::text, assigned_by)','((SELECT public.i_am_staff()) AND staff_can_edit(athlete_id, ''fiches''::text, assigned_by))'),
('public','doc_assignments','staff_doc_assignments_insert','CHECK','((assigned_by = auth.uid()) AND staff_can(athlete_id, ''fiches''::text, ''write''::text) AND staff_doc_for_athlete(doc_id, athlete_id))','((assigned_by = (SELECT auth.uid())) AND ((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''fiches''::text, ''write''::text)) AND staff_doc_for_athlete(doc_id, athlete_id))'),
('public','doc_assignments','staff_doc_assignments_read','USING','staff_can(athlete_id, ''fiches''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''fiches''::text, ''read''::text))'),
('public','doc_comments','doc_comments_delete_own','USING','(author_id = auth.uid())','(author_id = (SELECT auth.uid()))'),
('public','doc_comments','doc_comments_insert','CHECK','((author_id = auth.uid()) AND ((athlete_id = auth.uid()) OR is_coach_of(athlete_id)) AND can_read_doc(doc_id))','((author_id = (SELECT auth.uid())) AND ((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))) AND can_read_doc(doc_id))'),
('public','doc_comments','doc_comments_select','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)))'),
('public','doc_comments','staff_doc_comments_insert','CHECK','((author_id = auth.uid()) AND staff_can(athlete_id, ''commentaires''::text, ''write''::text) AND can_read_doc(doc_id))','((author_id = (SELECT auth.uid())) AND ((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''commentaires''::text, ''write''::text)) AND can_read_doc(doc_id))'),
('public','doc_comments','staff_doc_comments_read','USING','staff_can(athlete_id, ''commentaires''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''commentaires''::text, ''read''::text))'),
('public','doc_schedule','doc_schedule_delete','USING','(is_coach_of(athlete_id) OR staff_can_edit(athlete_id, ''fiches''::text, added_by))','(((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR ((SELECT public.i_am_staff()) AND staff_can_edit(athlete_id, ''fiches''::text, added_by)))'),
('public','doc_schedule','doc_schedule_insert','CHECK','((added_by = auth.uid()) AND ((staff_can(athlete_id, ''fiches''::text, ''write''::text) AND staff_doc_for_athlete(doc_id, athlete_id)) OR (is_coach_of(athlete_id) AND (EXISTS ( SELECT 1
   FROM docs d
  WHERE ((d.id = doc_schedule.doc_id) AND ((d.coach_id = auth.uid()) OR is_athlete_coach(doc_schedule.athlete_id, d.coach_id))))))))','((added_by = (SELECT auth.uid())) AND ((((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''fiches''::text, ''write''::text)) AND staff_doc_for_athlete(doc_id, athlete_id)) OR (((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) AND (EXISTS ( SELECT 1
   FROM docs d
  WHERE ((d.id = doc_schedule.doc_id) AND ((d.coach_id = (SELECT auth.uid())) OR is_athlete_coach(doc_schedule.athlete_id, d.coach_id))))))))'),
('public','doc_schedule','doc_schedule_select','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR staff_can(athlete_id, ''fiches''::text, ''read''::text))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR ((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''fiches''::text, ''read''::text)))'),
('public','docs','docs_athlete_delete','USING','((athlete_id = auth.uid()) AND (uploaded_by = auth.uid()))','((athlete_id = (SELECT auth.uid())) AND (uploaded_by = (SELECT auth.uid())))'),
('public','docs','docs_athlete_insert','CHECK','((athlete_id = auth.uid()) AND (uploaded_by = auth.uid()) AND (is_self_service = false) AND (origin_id IS NULL) AND (coach_id = my_coach_id()))','((athlete_id = (SELECT auth.uid())) AND (uploaded_by = (SELECT auth.uid())) AND (is_self_service = false) AND (origin_id IS NULL) AND (coach_id = (SELECT my_coach_id())))'),
('public','docs','docs_coach_delete','USING','((coach_id = auth.uid()) OR ((athlete_id IS NOT NULL) AND is_coach_of(athlete_id)))','((coach_id = (SELECT auth.uid())) OR ((athlete_id IS NOT NULL) AND ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))))'),
('public','docs','docs_coach_insert','CHECK','((coach_id = auth.uid()) AND (uploaded_by = auth.uid()) AND ((athlete_id IS NULL) OR is_coach_of(athlete_id)))','((coach_id = (SELECT auth.uid())) AND (uploaded_by = (SELECT auth.uid())) AND ((athlete_id IS NULL) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))))'),
('public','docs','docs_coach_update','USING','((coach_id = auth.uid()) OR doc_for_my_athlete(id))','((coach_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND doc_for_my_athlete(id)))'),
('public','docs','docs_coach_update','CHECK','((coach_id = auth.uid()) OR is_coach_partner(coach_id))','((coach_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_partner(coach_id)))'),
('public','docs','docs_select','USING','((coach_id = auth.uid()) OR (uploaded_by = auth.uid()) OR (athlete_id = auth.uid()) OR can_read_doc(id))','((coach_id = (SELECT auth.uid())) OR (uploaded_by = (SELECT auth.uid())) OR (athlete_id = (SELECT auth.uid())) OR can_read_doc(id))'),
('public','docs','staff_docs_delete','USING','staff_can_edit_doc(id)','((SELECT public.i_am_staff()) AND staff_can_edit_doc(id))'),
('public','docs','staff_docs_insert','CHECK','((uploaded_by = auth.uid()) AND (coach_id <> auth.uid()) AND (is_self_service = false) AND staff_can_write_bank(coach_id) AND ((athlete_id IS NULL) OR staff_can(athlete_id, ''fiches''::text, ''write''::text)))','((uploaded_by = (SELECT auth.uid())) AND (coach_id <> (SELECT auth.uid())) AND (is_self_service = false) AND ((SELECT public.i_am_staff()) AND staff_can_write_bank(coach_id)) AND ((athlete_id IS NULL) OR ((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''fiches''::text, ''write''::text))))'),
('public','docs','staff_docs_update','USING','staff_can_edit_doc(id)','((SELECT public.i_am_staff()) AND staff_can_edit_doc(id))'),
('public','docs','staff_docs_update','CHECK','((is_self_service = false) AND staff_can_write_bank(coach_id) AND ((athlete_id IS NULL) OR staff_can(athlete_id, ''fiches''::text, ''write''::text)))','((is_self_service = false) AND ((SELECT public.i_am_staff()) AND staff_can_write_bank(coach_id)) AND ((athlete_id IS NULL) OR ((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''fiches''::text, ''write''::text))))'),
('public','energy_session_assignments','esa_delete','USING','(is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','(((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','energy_session_assignments','esa_insert','CHECK','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','energy_session_assignments','esa_select','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','energy_session_assignments','esa_update','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','energy_session_assignments','esa_update','CHECK','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','energy_session_assignments','staff_esa_read','USING','staff_can(athlete_id, ''seances''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''seances''::text, ''read''::text))'),
('public','energy_sessions','es_delete','USING','((created_by = auth.uid()) OR ((athlete_id IS NOT NULL) AND is_coach_of(athlete_id)))','((created_by = (SELECT auth.uid())) OR ((athlete_id IS NOT NULL) AND ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))))'),
('public','energy_sessions','es_insert','CHECK','((is_verified = false) AND (created_by = auth.uid()) AND ((athlete_id IS NULL) OR (athlete_id = auth.uid()) OR is_coach_of(athlete_id)))','((is_verified = false) AND (created_by = (SELECT auth.uid())) AND ((athlete_id IS NULL) OR (athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))))'),
('public','energy_sessions','es_select','USING','((is_public = true) OR (created_by = auth.uid()) OR (athlete_id = auth.uid()) OR ((athlete_id IS NOT NULL) AND is_coach_of(athlete_id)) OR (id IN ( SELECT a.energy_session_id
   FROM energy_session_assignments a
  WHERE (a.athlete_id = auth.uid()))) OR (id IN ( SELECT a.energy_session_id
   FROM energy_session_assignments a
  WHERE is_coach_of(a.athlete_id))))','((is_public = true) OR (created_by = (SELECT auth.uid())) OR (athlete_id = (SELECT auth.uid())) OR ((athlete_id IS NOT NULL) AND ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))) OR (id IN ( SELECT a.energy_session_id
   FROM energy_session_assignments a
  WHERE (a.athlete_id = (SELECT auth.uid())))) OR (id IN ( SELECT a.energy_session_id
   FROM energy_session_assignments a
  WHERE ((SELECT public.i_am_coach()) AND is_coach_of(a.athlete_id)))))'),
('public','energy_sessions','es_update_author','USING','((created_by = auth.uid()) OR ((athlete_id IS NOT NULL) AND is_coach_of(athlete_id)) OR (id IN ( SELECT a.energy_session_id
   FROM energy_session_assignments a
  WHERE is_coach_of(a.athlete_id))))','((created_by = (SELECT auth.uid())) OR ((athlete_id IS NOT NULL) AND ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))) OR (id IN ( SELECT a.energy_session_id
   FROM energy_session_assignments a
  WHERE ((SELECT public.i_am_coach()) AND is_coach_of(a.athlete_id)))))'),
('public','energy_sessions','es_update_author','CHECK','((created_by = auth.uid()) OR ((athlete_id IS NOT NULL) AND is_coach_of(athlete_id)) OR (id IN ( SELECT a.energy_session_id
   FROM energy_session_assignments a
  WHERE is_coach_of(a.athlete_id))))','((created_by = (SELECT auth.uid())) OR ((athlete_id IS NOT NULL) AND ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))) OR (id IN ( SELECT a.energy_session_id
   FROM energy_session_assignments a
  WHERE ((SELECT public.i_am_coach()) AND is_coach_of(a.athlete_id)))))'),
('public','energy_sessions','es_update_certify','USING','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_certified_coach = true) OR (profiles.is_admin = true)))))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND ((profiles.is_certified_coach = true) OR (profiles.is_admin = true)))))'),
('public','energy_sessions','es_update_certify','CHECK','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_certified_coach = true) OR (profiles.is_admin = true)))))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND ((profiles.is_certified_coach = true) OR (profiles.is_admin = true)))))'),
('public','energy_sessions','staff_energy_sessions_read','USING','(staff_can(athlete_id, ''seances''::text, ''read''::text) OR (EXISTS ( SELECT 1
   FROM energy_session_assignments a
  WHERE ((a.energy_session_id = energy_sessions.id) AND staff_can(a.athlete_id, ''seances''::text, ''read''::text)))))','(((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''seances''::text, ''read''::text)) OR (EXISTS ( SELECT 1
   FROM energy_session_assignments a
  WHERE ((a.energy_session_id = energy_sessions.id) AND ((SELECT public.i_am_staff()) AND staff_can(a.athlete_id, ''seances''::text, ''read''::text))))))'),
('public','exercise_pr_logs','athlete_own_prs','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','exercise_pr_logs','coach_delete_athlete_prs','USING','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','exercise_pr_logs','coach_insert_athlete_prs','CHECK','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','exercise_pr_logs','coach_sees_athlete_prs','USING','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','exercise_pr_logs','staff_exercise_pr_logs_read','USING','staff_can(athlete_id, ''logs''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''logs''::text, ''read''::text))'),
('public','exercises','Service write','USING','(auth.role() = ''service_role''::text)','((SELECT auth.role()) = ''service_role''::text)'),
('public','exercises','exercises_delete_admin','USING','((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))) OR ((created_by = auth.uid()) AND (is_verified = false)))','((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))) OR ((created_by = (SELECT auth.uid())) AND (is_verified = false)))'),
('public','exercises','exercises_insert_admin','CHECK','((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','(((SELECT auth.uid()) IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','exercises','exercises_insert_coach','CHECK','((auth.uid() IS NOT NULL) AND (is_verified = false) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))','(((SELECT auth.uid()) IS NOT NULL) AND (is_verified = false) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))'),
('public','exercises','exercises_update_admin','USING','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true))))'),
('public','exercises','exercises_update_certified','USING','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_certified_coach = true) OR (profiles.is_admin = true)))))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND ((profiles.is_certified_coach = true) OR (profiles.is_admin = true)))))'),
('public','exercises','exercises_update_certified','CHECK','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_certified_coach = true) OR (profiles.is_admin = true)))))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND ((profiles.is_certified_coach = true) OR (profiles.is_admin = true)))))'),
('public','exercises','exercises_update_own','USING','((created_by = auth.uid()) AND (is_verified = false))','((created_by = (SELECT auth.uid())) AND (is_verified = false))'),
('public','habit_logs','habit_logs_delete','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','habit_logs','habit_logs_insert','CHECK','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','habit_logs','habit_logs_select','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','habit_logs','habit_logs_update','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','habit_logs','staff_habit_logs_read','USING','staff_can(athlete_id, ''wellness''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''wellness''::text, ''read''::text))'),
('public','habits','habits_delete','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','habits','habits_insert','CHECK','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','habits','habits_select','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','habits','habits_update','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','habits','staff_habits_read','USING','staff_can(athlete_id, ''wellness''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''wellness''::text, ''read''::text))'),
('public','health_sync_errors','health_sync_errors_admin','USING','current_user_is_admin()','(SELECT current_user_is_admin())'),
('public','hr_zone_models','hr_zone_models_read','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR staff_can(athlete_id, ''seances''::text, ''read''::text))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR ((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''seances''::text, ''read''::text)))'),
('public','hyrox_axes_params','hyrox_axes_params_delete','USING','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))'),
('public','hyrox_axes_params','hyrox_axes_params_insert','CHECK','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))'),
('public','hyrox_axes_params','hyrox_axes_params_update','USING','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))'),
('public','hyrox_race_plans','hrp_delete','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin))))'),
('public','hyrox_race_plans','hrp_insert','CHECK','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin))))'),
('public','hyrox_race_plans','hrp_select','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin))))'),
('public','hyrox_race_plans','hrp_update','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin))))'),
('public','hyrox_reference_segments','hrs_delete','USING','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))'),
('public','hyrox_reference_segments','hrs_insert','CHECK','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))'),
('public','hyrox_reference_segments','hrs_update','USING','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))'),
('public','hyrox_results','hr_delete','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin))))'),
('public','hyrox_results','hr_insert','CHECK','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin))))'),
('public','hyrox_results','hr_select','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin))))'),
('public','hyrox_results','hr_update','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin))))'),
('public','hyrox_test_analyses','hta_delete','USING','(is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))))','(((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin))))'),
('public','hyrox_test_analyses','hta_insert','CHECK','(is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))))','(((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin))))'),
('public','hyrox_test_analyses','hta_select','USING','(((athlete_id = auth.uid()) AND (validated_at IS NOT NULL)) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))))','(((athlete_id = (SELECT auth.uid())) AND (validated_at IS NOT NULL)) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin))))'),
('public','hyrox_test_analyses','hta_update','USING','(is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin))))','(((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin))))'),
('public','hyrox_test_axes_drafts','htad_all','USING','(EXISTS ( SELECT 1
   FROM hyrox_test_analyses a
  WHERE ((a.id = hyrox_test_axes_drafts.analysis_id) AND (is_coach_of(a.athlete_id) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))))))','(EXISTS ( SELECT 1
   FROM hyrox_test_analyses a
  WHERE ((a.id = hyrox_test_axes_drafts.analysis_id) AND (((SELECT public.i_am_coach()) AND is_coach_of(a.athlete_id)) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))))))'),
('public','hyrox_test_axes_drafts','htad_all','CHECK','(EXISTS ( SELECT 1
   FROM hyrox_test_analyses a
  WHERE ((a.id = hyrox_test_axes_drafts.analysis_id) AND (is_coach_of(a.athlete_id) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))))))','(EXISTS ( SELECT 1
   FROM hyrox_test_analyses a
  WHERE ((a.id = hyrox_test_axes_drafts.analysis_id) AND (((SELECT public.i_am_coach()) AND is_coach_of(a.athlete_id)) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))))))'),
('public','hyrox_test_grid_versions','hyrox_test_grid_versions_delete','USING','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))'),
('public','hyrox_test_grid_versions','hyrox_test_grid_versions_insert','CHECK','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))'),
('public','hyrox_test_grid_versions','hyrox_test_grid_versions_update','USING','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))'),
('public','hyrox_test_grids','hyrox_test_grids_delete','USING','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))'),
('public','hyrox_test_grids','hyrox_test_grids_insert','CHECK','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))'),
('public','hyrox_test_grids','hyrox_test_grids_update','USING','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))'),
('public','hyrox_test_params','hyrox_test_params_delete','USING','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))'),
('public','hyrox_test_params','hyrox_test_params_insert','CHECK','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))'),
('public','hyrox_test_params','hyrox_test_params_update','USING','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))'),
('public','hyrox_work_axes_rules','hyrox_work_axes_rules_delete','USING','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))'),
('public','hyrox_work_axes_rules','hyrox_work_axes_rules_insert','CHECK','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))'),
('public','hyrox_work_axes_rules','hyrox_work_axes_rules_update','USING','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))','(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND profiles.is_admin)))'),
('public','macrocycles','macrocycles_delete','USING','can_coach_athlete(athlete_id)','((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id))'),
('public','macrocycles','macrocycles_insert','CHECK','can_coach_athlete(athlete_id)','((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id))'),
('public','macrocycles','macrocycles_select','USING','((athlete_id = auth.uid()) OR can_coach_athlete(athlete_id))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id)))'),
('public','macrocycles','macrocycles_update','USING','can_coach_athlete(athlete_id)','((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id))'),
('public','macrocycles','macrocycles_update','CHECK','can_coach_athlete(athlete_id)','((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id))'),
('public','macrocycles','staff_macrocycles_read','USING','staff_can(athlete_id, ''planification''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''planification''::text, ''read''::text))'),
('public','measurement_logs','athlete_own_measurements','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','measurement_logs','athlete_own_measurements','CHECK','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','measurement_logs','coach_read_measurements','USING','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','measurement_logs','staff_measurement_logs_read','USING','staff_can(athlete_id, ''nutrition''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''nutrition''::text, ''read''::text))'),
('public','medical_entries','medical_entries_all','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)))'),
('public','medical_entries','medical_entries_all','CHECK','((athlete_id = auth.uid()) OR is_coach_of(athlete_id))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)))'),
('public','medical_entries','staff_medical_entries_delete','USING','staff_can_edit(athlete_id, ''medical''::text, created_by)','((SELECT public.i_am_staff()) AND staff_can_edit(athlete_id, ''medical''::text, created_by))'),
('public','medical_entries','staff_medical_entries_insert','CHECK','((created_by = auth.uid()) AND staff_can(athlete_id, ''medical''::text, ''write''::text))','((created_by = (SELECT auth.uid())) AND ((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''medical''::text, ''write''::text)))'),
('public','medical_entries','staff_medical_entries_read','USING','staff_can(athlete_id, ''medical''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''medical''::text, ''read''::text))'),
('public','medical_entries','staff_medical_entries_update','USING','staff_can_edit(athlete_id, ''medical''::text, created_by)','((SELECT public.i_am_staff()) AND staff_can_edit(athlete_id, ''medical''::text, created_by))'),
('public','medical_entries','staff_medical_entries_update','CHECK','staff_can_edit(athlete_id, ''medical''::text, created_by)','((SELECT public.i_am_staff()) AND staff_can_edit(athlete_id, ''medical''::text, created_by))'),
('public','mesocycles','mesocycles_delete','USING','(EXISTS ( SELECT 1
   FROM macrocycles m
  WHERE ((m.id = mesocycles.macrocycle_id) AND can_coach_athlete(m.athlete_id))))','(EXISTS ( SELECT 1
   FROM macrocycles m
  WHERE ((m.id = mesocycles.macrocycle_id) AND ((SELECT public.i_am_coach()) AND can_coach_athlete(m.athlete_id)))))'),
('public','mesocycles','mesocycles_insert','CHECK','(EXISTS ( SELECT 1
   FROM macrocycles m
  WHERE ((m.id = mesocycles.macrocycle_id) AND can_coach_athlete(m.athlete_id))))','(EXISTS ( SELECT 1
   FROM macrocycles m
  WHERE ((m.id = mesocycles.macrocycle_id) AND ((SELECT public.i_am_coach()) AND can_coach_athlete(m.athlete_id)))))'),
('public','mesocycles','mesocycles_select','USING','(EXISTS ( SELECT 1
   FROM macrocycles m
  WHERE ((m.id = mesocycles.macrocycle_id) AND ((m.athlete_id = auth.uid()) OR can_coach_athlete(m.athlete_id)))))','(EXISTS ( SELECT 1
   FROM macrocycles m
  WHERE ((m.id = mesocycles.macrocycle_id) AND ((m.athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND can_coach_athlete(m.athlete_id))))))'),
('public','mesocycles','mesocycles_update','USING','(EXISTS ( SELECT 1
   FROM macrocycles m
  WHERE ((m.id = mesocycles.macrocycle_id) AND can_coach_athlete(m.athlete_id))))','(EXISTS ( SELECT 1
   FROM macrocycles m
  WHERE ((m.id = mesocycles.macrocycle_id) AND ((SELECT public.i_am_coach()) AND can_coach_athlete(m.athlete_id)))))'),
('public','mesocycles','mesocycles_update','CHECK','(EXISTS ( SELECT 1
   FROM macrocycles m
  WHERE ((m.id = mesocycles.macrocycle_id) AND can_coach_athlete(m.athlete_id))))','(EXISTS ( SELECT 1
   FROM macrocycles m
  WHERE ((m.id = mesocycles.macrocycle_id) AND ((SELECT public.i_am_coach()) AND can_coach_athlete(m.athlete_id)))))'),
('public','mesocycles','staff_mesocycles_read','USING','staff_can(( SELECT m.athlete_id
   FROM macrocycles m
  WHERE (m.id = mesocycles.macrocycle_id)), ''planification''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(( SELECT m.athlete_id
   FROM macrocycles m
  WHERE (m.id = mesocycles.macrocycle_id)), ''planification''::text, ''read''::text))'),
('public','microcycles','microcycles_delete','USING','can_coach_athlete(cycle_athlete_id(cycle_id))','((SELECT public.i_am_coach()) AND can_coach_athlete(cycle_athlete_id(cycle_id)))'),
('public','microcycles','microcycles_insert','CHECK','can_coach_athlete(cycle_athlete_id(cycle_id))','((SELECT public.i_am_coach()) AND can_coach_athlete(cycle_athlete_id(cycle_id)))'),
('public','microcycles','microcycles_select','USING','((cycle_athlete_id(cycle_id) = auth.uid()) OR can_coach_athlete(cycle_athlete_id(cycle_id)))','((cycle_athlete_id(cycle_id) = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND can_coach_athlete(cycle_athlete_id(cycle_id))))'),
('public','microcycles','microcycles_update','USING','can_coach_athlete(cycle_athlete_id(cycle_id))','((SELECT public.i_am_coach()) AND can_coach_athlete(cycle_athlete_id(cycle_id)))'),
('public','microcycles','microcycles_update','CHECK','can_coach_athlete(cycle_athlete_id(cycle_id))','((SELECT public.i_am_coach()) AND can_coach_athlete(cycle_athlete_id(cycle_id)))'),
('public','microcycles','staff_microcycles_read','USING','staff_can(cycle_athlete_id(cycle_id), ''planification''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(cycle_athlete_id(cycle_id), ''planification''::text, ''read''::text))'),
('public','performance_logs','perf_delete','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','performance_logs','perf_insert','CHECK','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','performance_logs','perf_select','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','performance_logs','perf_update','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','performance_logs','staff_performance_logs_read','USING','staff_can(athlete_id, ''logs''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''logs''::text, ''read''::text))'),
('public','performance_notifications','perf_notif_insert','CHECK','((athlete_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((athlete_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','performance_notifications','perf_notif_select','USING','((coach_id = auth.uid()) OR (athlete_id = auth.uid()) OR is_coach_of(athlete_id))','((coach_id = (SELECT auth.uid())) OR (athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)))'),
('public','performance_notifications','perf_notif_update','USING','((coach_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((coach_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','physical_qualities','pq_delete','USING','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','physical_qualities','pq_insert','CHECK','((coach_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))','((coach_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))'),
('public','physical_qualities','pq_select','USING','((coach_id IS NULL) OR (coach_id = auth.uid()) OR is_coach_partner(coach_id))','((coach_id IS NULL) OR (coach_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_partner(coach_id)))'),
('public','physical_qualities','pq_update','USING','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','physical_qualities','pq_update','CHECK','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','planning_blocks','planning_blocks_delete','USING','can_coach_athlete(athlete_id)','((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id))'),
('public','planning_blocks','planning_blocks_insert','CHECK','can_coach_athlete(athlete_id)','((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id))'),
('public','planning_blocks','planning_blocks_select','USING','((athlete_id = auth.uid()) OR can_coach_athlete(athlete_id))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id)))'),
('public','planning_blocks','planning_blocks_update','USING','can_coach_athlete(athlete_id)','((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id))'),
('public','planning_blocks','planning_blocks_update','CHECK','can_coach_athlete(athlete_id)','((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id))'),
('public','planning_blocks','staff_planning_blocks_read','USING','staff_can(athlete_id, ''planification''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''planification''::text, ''read''::text))'),
('public','profiles','Coach can unlink own athletes','USING','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','profiles','Users can update own profile','USING','(auth.uid() = id)','((SELECT auth.uid()) = id)'),
('public','profiles','Users can update own profile','CHECK','(auth.uid() = id)','((SELECT auth.uid()) = id)'),
('public','profiles','coaches_can_update_athlete_profiles','USING','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','profiles','coaches_can_update_athlete_profiles','CHECK','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','profiles','profiles_insert_own','CHECK','(auth.uid() = id)','((SELECT auth.uid()) = id)'),
('public','profiles','profiles_select_athletes','USING','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','profiles','profiles_select_co_coached','USING','is_co_coach_of(id)','((SELECT public.i_am_coach()) AND is_co_coach_of(id))'),
('public','profiles','profiles_select_own','USING','(auth.uid() = id)','((SELECT auth.uid()) = id)'),
('public','profiles','profiles_update_co_coached','USING','is_co_coach_of(id)','((SELECT public.i_am_coach()) AND is_co_coach_of(id))'),
('public','profiles','profiles_update_co_coached','CHECK','is_co_coach_of(id)','((SELECT public.i_am_coach()) AND is_co_coach_of(id))'),
('public','profiles','profiles_update_own','USING','(auth.uid() = id)','((SELECT auth.uid()) = id)'),
('public','provider_activities','provider_activities_coach_read','USING','(is_coach_of(athlete_id) AND (EXISTS ( SELECT 1
   FROM data_source_policies p
  WHERE ((p.source = provider_activities.source) AND p.coach_visible))) AND source_consent_granted(athlete_id, source))','(((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) AND (EXISTS ( SELECT 1
   FROM data_source_policies p
  WHERE ((p.source = provider_activities.source) AND p.coach_visible))) AND source_consent_granted(athlete_id, source))'),
('public','provider_activities','provider_activities_own_file_import','USING','((athlete_id = auth.uid()) AND (source = ''file_import''::data_source))','((athlete_id = (SELECT auth.uid())) AND (source = ''file_import''::data_source))'),
('public','provider_activities','provider_activities_own_file_import','CHECK','((athlete_id = auth.uid()) AND (source = ''file_import''::data_source))','((athlete_id = (SELECT auth.uid())) AND (source = ''file_import''::data_source))'),
('public','provider_activities','provider_activities_own_read','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','provider_connections','provider_connections_coach_read','USING','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','provider_connections','provider_connections_own_read','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','provider_dailies','provider_dailies_coach_read','USING','(is_coach_of(athlete_id) AND (EXISTS ( SELECT 1
   FROM data_source_policies p
  WHERE ((p.source = provider_dailies.source) AND p.coach_visible))) AND source_consent_granted(athlete_id, source))','(((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) AND (EXISTS ( SELECT 1
   FROM data_source_policies p
  WHERE ((p.source = provider_dailies.source) AND p.coach_visible))) AND source_consent_granted(athlete_id, source))'),
('public','provider_dailies','provider_dailies_own_read','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','provider_intraday','provider_intraday_read','USING','activity_detail_visible(athlete_id, source)','((athlete_id = (SELECT auth.uid())) OR (((SELECT public.i_am_coach()) OR (SELECT public.i_am_staff())) AND activity_detail_visible(athlete_id, source)))'),
('public','provider_moveiq','provider_moveiq_read','USING','activity_detail_visible(athlete_id, source)','((athlete_id = (SELECT auth.uid())) OR (((SELECT public.i_am_coach()) OR (SELECT public.i_am_staff())) AND activity_detail_visible(athlete_id, source)))'),
('public','provider_raw_records','provider_raw_records_own_read','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','provider_workout_pushes','provider_workout_pushes_coach_read','USING','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','provider_workout_pushes','provider_workout_pushes_own_read','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','roadmap_items','roadmap_items_admin_write','USING','(EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true))))','(EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.is_admin = true))))'),
('public','roadmap_items','roadmap_items_coach_suggest','CHECK','((status = ''idea''::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_certified_coach = true)))))','((status = ''idea''::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.is_certified_coach = true)))))'),
('public','roadmap_items','roadmap_items_select','USING','(EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_certified_coach = true) OR (p.is_admin = true)))))','(EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND ((p.is_certified_coach = true) OR (p.is_admin = true)))))'),
('public','roadmap_phases','roadmap_phases_select','USING','(EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_certified_coach = true) OR (p.is_admin = true)))))','(EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND ((p.is_certified_coach = true) OR (p.is_admin = true)))))'),
('public','roadmap_phases','roadmap_phases_write','USING','(EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true))))','(EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.is_admin = true))))'),
('public','roadmap_votes','roadmap_votes_select','USING','(EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_certified_coach = true) OR (p.is_admin = true)))))','(EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND ((p.is_certified_coach = true) OR (p.is_admin = true)))))'),
('public','roadmap_votes','roadmap_votes_write','USING','(user_id = auth.uid())','(user_id = (SELECT auth.uid()))'),
('public','roadmap_votes','roadmap_votes_write','CHECK','((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_certified_coach = true) OR (p.is_admin = true))))))','((user_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND ((p.is_certified_coach = true) OR (p.is_admin = true))))))'),
('public','seasons','seasons_delete','USING','can_coach_athlete(athlete_id)','((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id))'),
('public','seasons','seasons_insert','CHECK','can_coach_athlete(athlete_id)','((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id))'),
('public','seasons','seasons_select','USING','((athlete_id = auth.uid()) OR can_coach_athlete(athlete_id))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id)))'),
('public','seasons','seasons_update','USING','can_coach_athlete(athlete_id)','((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id))'),
('public','seasons','seasons_update','CHECK','can_coach_athlete(athlete_id)','((SELECT public.i_am_coach()) AND can_coach_athlete(athlete_id))'),
('public','seasons','staff_seasons_read','USING','staff_can(athlete_id, ''planification''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''planification''::text, ''read''::text))'),
('public','specific_blocks','sb_delete','USING','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','specific_blocks','sb_insert','CHECK','((coach_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))','((coach_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))'),
('public','specific_blocks','sb_select','USING','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','specific_blocks','sb_update','USING','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','specific_blocks','sb_update','CHECK','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','specific_sports','ss_delete','USING','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','specific_sports','ss_insert','CHECK','((coach_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))','((coach_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))'),
('public','specific_sports','ss_select','USING','((coach_id IS NULL) OR (coach_id = auth.uid()) OR is_coach_partner(coach_id))','((coach_id IS NULL) OR (coach_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_partner(coach_id)))'),
('public','specific_sports','ss_update','USING','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','specific_sports','ss_update','CHECK','(coach_id = auth.uid())','(coach_id = (SELECT auth.uid()))'),
('public','staff_invitations','staff_invitations_delete','USING','((used_at IS NULL) AND ((invited_by = auth.uid()) OR is_coach_of(athlete_id)))','((used_at IS NULL) AND ((invited_by = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))))'),
('public','staff_invitations','staff_invitations_insert','CHECK','((invited_by = auth.uid()) AND (is_coach_of(athlete_id) OR (athlete_id = auth.uid())))','((invited_by = (SELECT auth.uid())) AND (((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (athlete_id = (SELECT auth.uid()))))'),
('public','staff_invitations','staff_invitations_select','USING','((invited_by = auth.uid()) OR (athlete_id = auth.uid()) OR is_coach_of(athlete_id))','((invited_by = (SELECT auth.uid())) OR (athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)))'),
('public','test_definitions','td_delete','USING','((auth.uid() = created_by) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','(((SELECT auth.uid()) = created_by) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','test_definitions','td_delete_coach_library','USING','((created_by IS NULL) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))','((created_by IS NULL) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))'),
('public','test_definitions','td_insert','CHECK','((auth.uid() = created_by) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','(((SELECT auth.uid()) = created_by) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','test_definitions','td_select','USING','(auth.uid() IS NOT NULL)','((SELECT auth.uid()) IS NOT NULL)'),
('public','test_definitions','td_update','USING','((auth.uid() = created_by) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','(((SELECT auth.uid()) = created_by) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','test_definitions','td_update_coach_library','USING','((created_by IS NULL) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))','((created_by IS NULL) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))'),
('public','test_results','staff_test_results_read','USING','staff_can(athlete_id, ''tests''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''tests''::text, ''read''::text))'),
('public','test_results','test_results_delete','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)))'),
('public','test_results','test_results_insert','CHECK','((athlete_id = auth.uid()) OR is_coach_of(athlete_id))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)))'),
('public','test_results','test_results_select','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)))'),
('public','test_results','test_results_update','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)))'),
('public','test_sessions','staff_test_sessions_read','USING','staff_can(athlete_id, ''tests''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''tests''::text, ''read''::text))'),
('public','test_sessions','test_delete','USING','((athlete_id = auth.uid()) OR (coach_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((athlete_id = (SELECT auth.uid())) OR (coach_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','test_sessions','test_insert','CHECK','((athlete_id = auth.uid()) OR ((coach_id = auth.uid()) AND ((athlete_id IS NULL) OR is_coach_of(athlete_id))) OR current_user_is_admin())','((athlete_id = (SELECT auth.uid())) OR ((coach_id = (SELECT auth.uid())) AND ((athlete_id IS NULL) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)))) OR (SELECT current_user_is_admin()))'),
('public','test_sessions','test_select','USING','((athlete_id = auth.uid()) OR (coach_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((athlete_id = (SELECT auth.uid())) OR (coach_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','test_sessions','test_update','USING','((athlete_id = auth.uid()) OR (coach_id = auth.uid()) OR is_coach_of(athlete_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((athlete_id = (SELECT auth.uid())) OR (coach_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','test_variables','tv_delete','USING','(EXISTS ( SELECT 1
   FROM test_definitions td
  WHERE ((td.id = test_variables.test_definition_id) AND ((td.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))))))','(EXISTS ( SELECT 1
   FROM test_definitions td
  WHERE ((td.id = test_variables.test_definition_id) AND ((td.created_by = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true))))))))'),
('public','test_variables','tv_insert','CHECK','(EXISTS ( SELECT 1
   FROM test_definitions td
  WHERE ((td.id = test_variables.test_definition_id) AND ((td.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))))))','(EXISTS ( SELECT 1
   FROM test_definitions td
  WHERE ((td.id = test_variables.test_definition_id) AND ((td.created_by = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true))))))))'),
('public','test_variables','tv_select','USING','(auth.uid() IS NOT NULL)','((SELECT auth.uid()) IS NOT NULL)'),
('public','test_variables','tv_update','USING','(EXISTS ( SELECT 1
   FROM test_definitions td
  WHERE ((td.id = test_variables.test_definition_id) AND ((td.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))))))','(EXISTS ( SELECT 1
   FROM test_definitions td
  WHERE ((td.id = test_variables.test_definition_id) AND ((td.created_by = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true))))))))'),
('public','test_variables','tv_write_coach_library','USING','((EXISTS ( SELECT 1
   FROM test_definitions td
  WHERE ((td.id = test_variables.test_definition_id) AND (td.created_by IS NULL)))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))','((EXISTS ( SELECT 1
   FROM test_definitions td
  WHERE ((td.id = test_variables.test_definition_id) AND (td.created_by IS NULL)))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))'),
('public','test_variables','tv_write_coach_library','CHECK','((EXISTS ( SELECT 1
   FROM test_definitions td
  WHERE ((td.id = test_variables.test_definition_id) AND (td.created_by IS NULL)))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))','((EXISTS ( SELECT 1
   FROM test_definitions td
  WHERE ((td.id = test_variables.test_definition_id) AND (td.created_by IS NULL)))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))'),
('public','tests','tests_delete','USING','((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((created_by = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','tests','tests_insert','CHECK','((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))','((created_by = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))'),
('public','tests','tests_select','USING','(auth.uid() IS NOT NULL)','((SELECT auth.uid()) IS NOT NULL)'),
('public','tests','tests_update','USING','((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((created_by = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','training_methods','methods_delete_own','USING','((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((created_by = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','training_methods','methods_insert_coach','CHECK','((is_official = false) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))','((is_official = false) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text]))))))'),
('public','training_methods','methods_update_own','USING','((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))','((created_by = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_admin = true)))))'),
('public','user_consents','user_consents_insert_own','CHECK','(user_id = auth.uid())','(user_id = (SELECT auth.uid()))'),
('public','user_consents','user_consents_select_own','USING','(user_id = auth.uid())','(user_id = (SELECT auth.uid()))'),
('public','weekly_retours','staff_weekly_retours_read','USING','staff_can(athlete_id, ''commentaires''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''commentaires''::text, ''read''::text))'),
('public','weekly_retours','wr_athlete_select','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','weekly_retours','wr_coach_all','USING','((coach_id = auth.uid()) OR is_coach_of(athlete_id))','((coach_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)))'),
('public','weekly_retours','wr_coach_all','CHECK','((coach_id = auth.uid()) AND ((athlete_id IS NULL) OR is_coach_of(athlete_id)))','((coach_id = (SELECT auth.uid())) AND ((athlete_id IS NULL) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))))'),
('public','weekly_reviews','weekly_reviews_coach','USING','((status = ''submitted''::text) AND is_coach_of(athlete_id))','((status = ''submitted''::text) AND ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)))'),
('public','weekly_reviews','weekly_reviews_self','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','weekly_reviews','weekly_reviews_staff','USING','((status = ''submitted''::text) AND staff_can(athlete_id, ''wellness''::text, ''read''::text))','((status = ''submitted''::text) AND ((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''wellness''::text, ''read''::text)))'),
('public','wellness_entries','wellness_entries_coach','USING','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','wellness_entries','wellness_entries_self','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','wellness_entries','wellness_entries_staff','USING','((NOT archived) AND staff_can(athlete_id, ''wellness''::text, ''read''::text))','((NOT archived) AND ((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''wellness''::text, ''read''::text)))'),
('public','workout_exercise_comments','staff_workout_exercise_comments_read','USING','staff_can(workout_log_athlete_id(workout_log_id), ''commentaires''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(workout_log_athlete_id(workout_log_id), ''commentaires''::text, ''read''::text))'),
('public','workout_exercise_comments','workout_exercise_comments_coach_read','USING','(EXISTS ( SELECT 1
   FROM workout_logs wl
  WHERE ((wl.id = workout_exercise_comments.workout_log_id) AND is_coach_of(wl.athlete_id))))','(EXISTS ( SELECT 1
   FROM workout_logs wl
  WHERE ((wl.id = workout_exercise_comments.workout_log_id) AND ((SELECT public.i_am_coach()) AND is_coach_of(wl.athlete_id)))))'),
('public','workout_exercise_comments','workout_exercise_comments_self','USING','(EXISTS ( SELECT 1
   FROM workout_logs wl
  WHERE ((wl.id = workout_exercise_comments.workout_log_id) AND (wl.athlete_id = auth.uid()))))','(EXISTS ( SELECT 1
   FROM workout_logs wl
  WHERE ((wl.id = workout_exercise_comments.workout_log_id) AND (wl.athlete_id = (SELECT auth.uid())))))'),
('public','workout_logs','staff_workout_logs_read','USING','staff_can(athlete_id, ''logs''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''logs''::text, ''read''::text))'),
('public','workout_logs','workout_logs_coach_delete','USING','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','workout_logs','workout_logs_coach_insert','CHECK','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','workout_logs','workout_logs_coach_read','USING','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','workout_logs','workout_logs_coach_update','USING','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','workout_logs','workout_logs_self_insert','CHECK','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','workout_logs','workout_logs_self_select','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','workout_logs','workout_logs_self_update','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','workout_logs','workout_logs_self_update','CHECK','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','workout_rpe','athlete_own_rpe','USING','(athlete_id = auth.uid())','(athlete_id = (SELECT auth.uid()))'),
('public','workout_rpe','coach_read_athlete_rpe','USING','is_coach_of(athlete_id)','((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))'),
('public','workout_rpe','staff_workout_rpe_read','USING','staff_can(athlete_id, ''logs''::text, ''read''::text)','((SELECT public.i_am_staff()) AND staff_can(athlete_id, ''logs''::text, ''read''::text))'),
('public','workout_rpe','workout_rpe_select','USING','((athlete_id = auth.uid()) OR is_coach_of(athlete_id))','((athlete_id = (SELECT auth.uid())) OR ((SELECT public.i_am_coach()) AND is_coach_of(athlete_id)))'),
('storage','objects','athlete_delete_test_media','USING','((bucket_id = ''test-media''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))','((bucket_id = ''test-media''::text) AND ((storage.foldername(name))[1] = ((SELECT auth.uid()))::text))'),
('storage','objects','athlete_read_test_media','USING','((bucket_id = ''test-media''::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_coach_of_folder((storage.foldername(name))[1])))','((bucket_id = ''test-media''::text) AND (((storage.foldername(name))[1] = ((SELECT auth.uid()))::text) OR ((SELECT public.i_am_coach()) AND is_coach_of_folder((storage.foldername(name))[1]))))'),
('storage','objects','athlete_upload_test_media','CHECK','((bucket_id = ''test-media''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))','((bucket_id = ''test-media''::text) AND ((storage.foldername(name))[1] = ((SELECT auth.uid()))::text))'),
('storage','objects','coach_delete_athlete_test_media','USING','((bucket_id = ''test-media''::text) AND is_coach_of_folder((storage.foldername(name))[1]))','((bucket_id = ''test-media''::text) AND ((SELECT public.i_am_coach()) AND is_coach_of_folder((storage.foldername(name))[1])))'),
('storage','objects','coach_upload_athlete_test_media','CHECK','((bucket_id = ''test-media''::text) AND is_coach_of_folder((storage.foldername(name))[1]))','((bucket_id = ''test-media''::text) AND ((SELECT public.i_am_coach()) AND is_coach_of_folder((storage.foldername(name))[1])))'),
('storage','objects','coach_upload_test_media','CHECK','((bucket_id = ''test-media''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ''coach''::text)))))','((bucket_id = ''test-media''::text) AND ((storage.foldername(name))[1] = ((SELECT auth.uid()))::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ''coach''::text)))))'),
('storage','objects','docs_storage_delete','USING','((bucket_id = ''docs''::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (((storage.foldername(name))[2] = ''athletes''::text) AND ((storage.foldername(name))[3] = (auth.uid())::text) AND ((NOT (EXISTS ( SELECT 1
   FROM docs d
  WHERE (d.file_path = objects.name)))) OR (EXISTS ( SELECT 1
   FROM docs d
  WHERE ((d.file_path = objects.name) AND (d.uploaded_by = auth.uid()))))) AND (NOT (EXISTS ( SELECT 1
   FROM doc_comments c
  WHERE ((c.image_path = objects.name) AND (c.author_id <> auth.uid()))))))))','((bucket_id = ''docs''::text) AND (((storage.foldername(name))[1] = ((SELECT auth.uid()))::text) OR (((storage.foldername(name))[2] = ''athletes''::text) AND ((storage.foldername(name))[3] = ((SELECT auth.uid()))::text) AND ((NOT (EXISTS ( SELECT 1
   FROM docs d
  WHERE (d.file_path = objects.name)))) OR (EXISTS ( SELECT 1
   FROM docs d
  WHERE ((d.file_path = objects.name) AND (d.uploaded_by = (SELECT auth.uid())))))) AND (NOT (EXISTS ( SELECT 1
   FROM doc_comments c
  WHERE ((c.image_path = objects.name) AND (c.author_id <> (SELECT auth.uid())))))))))'),
('storage','objects','docs_storage_insert','CHECK','((bucket_id = ''docs''::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (((storage.foldername(name))[1] = (my_coach_id())::text) AND ((storage.foldername(name))[2] = ''athletes''::text) AND ((storage.foldername(name))[3] = (auth.uid())::text))))','((bucket_id = ''docs''::text) AND (((storage.foldername(name))[1] = ((SELECT auth.uid()))::text) OR (((storage.foldername(name))[1] = ((SELECT my_coach_id()))::text) AND ((storage.foldername(name))[2] = ''athletes''::text) AND ((storage.foldername(name))[3] = ((SELECT auth.uid()))::text))))'),
('storage','objects','docs_storage_select','USING','((bucket_id = ''docs''::text) AND (can_read_doc_file(name) OR (owner_id = (auth.uid())::text)))','((bucket_id = ''docs''::text) AND (can_read_doc_file(name) OR (owner_id = ((SELECT auth.uid()))::text)))'),
('storage','objects','energy_photo_delete','USING','((bucket_id = ''energy-exercise-photos''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))','((bucket_id = ''energy-exercise-photos''::text) AND (((SELECT auth.uid()))::text = (storage.foldername(name))[1]))'),
('storage','objects','energy_photo_upload','CHECK','((bucket_id = ''energy-exercise-photos''::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text])) OR (profiles.is_admin = true))))))','((bucket_id = ''energy-exercise-photos''::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND ((profiles.role = ANY (ARRAY[''coach''::text, ''coach_athlete''::text])) OR (profiles.is_admin = true))))))'),
('storage','objects','garmin_delete','USING','((bucket_id = ''garmin-screenshots''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))','((bucket_id = ''garmin-screenshots''::text) AND (((SELECT auth.uid()))::text = (storage.foldername(name))[1]))'),
('storage','objects','garmin_select','USING','((bucket_id = ''garmin-screenshots''::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_coach_of_folder((storage.foldername(name))[1]) OR current_user_is_admin()))','((bucket_id = ''garmin-screenshots''::text) AND (((storage.foldername(name))[1] = ((SELECT auth.uid()))::text) OR ((SELECT public.i_am_coach()) AND is_coach_of_folder((storage.foldername(name))[1])) OR (SELECT current_user_is_admin())))'),
('storage','objects','garmin_upload','CHECK','((bucket_id = ''garmin-screenshots''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))','((bucket_id = ''garmin-screenshots''::text) AND (((SELECT auth.uid()))::text = (storage.foldername(name))[1]))'),
('storage','objects','owner_update_test_media','USING','((bucket_id = ''test-media''::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_coach_of_folder((storage.foldername(name))[1])))','((bucket_id = ''test-media''::text) AND (((storage.foldername(name))[1] = ((SELECT auth.uid()))::text) OR ((SELECT public.i_am_coach()) AND is_coach_of_folder((storage.foldername(name))[1]))))'),
('storage','objects','owner_update_test_media','CHECK','((bucket_id = ''test-media''::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_coach_of_folder((storage.foldername(name))[1])))','((bucket_id = ''test-media''::text) AND (((storage.foldername(name))[1] = ((SELECT auth.uid()))::text) OR ((SELECT public.i_am_coach()) AND is_coach_of_folder((storage.foldername(name))[1]))))'),
('storage','objects','provider_raw_own_read','USING','((bucket_id = ''provider-raw''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))','((bucket_id = ''provider-raw''::text) AND ((storage.foldername(name))[1] = ((SELECT auth.uid()))::text))'),
('storage','objects','staff_docs_storage_delete','USING','((bucket_id = ''docs''::text) AND ((EXISTS ( SELECT 1
   FROM docs d
  WHERE ((d.file_path = objects.name) AND staff_can_edit_doc(d.id)))) OR (EXISTS ( SELECT 1
   FROM doc_comments c
  WHERE ((c.image_path = objects.name) AND (c.author_id = auth.uid())))) OR ((owner_id = (auth.uid())::text) AND (NOT (EXISTS ( SELECT 1
   FROM docs d
  WHERE (d.file_path = objects.name)))) AND (NOT (EXISTS ( SELECT 1
   FROM doc_comments c
  WHERE (c.image_path = objects.name)))) AND staff_can_write_docs_path(name))))','((bucket_id = ''docs''::text) AND ((EXISTS ( SELECT 1
   FROM docs d
  WHERE ((d.file_path = objects.name) AND ((SELECT public.i_am_staff()) AND staff_can_edit_doc(d.id))))) OR (EXISTS ( SELECT 1
   FROM doc_comments c
  WHERE ((c.image_path = objects.name) AND (c.author_id = (SELECT auth.uid()))))) OR ((owner_id = ((SELECT auth.uid()))::text) AND (NOT (EXISTS ( SELECT 1
   FROM docs d
  WHERE (d.file_path = objects.name)))) AND (NOT (EXISTS ( SELECT 1
   FROM doc_comments c
  WHERE (c.image_path = objects.name)))) AND ((SELECT public.i_am_staff()) AND staff_can_write_docs_path(name)))))'),
('storage','objects','staff_docs_storage_insert','CHECK','((bucket_id = ''docs''::text) AND staff_can_write_docs_path(name))','((bucket_id = ''docs''::text) AND ((SELECT public.i_am_staff()) AND staff_can_write_docs_path(name)))'),
('storage','objects','test_files_delete','USING','((bucket_id = ''test-files''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))','((bucket_id = ''test-files''::text) AND (((SELECT auth.uid()))::text = (storage.foldername(name))[1]))'),
('storage','objects','test_files_select','USING','((bucket_id = ''test-files''::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_coach_of_folder((storage.foldername(name))[1]) OR current_user_is_admin()))','((bucket_id = ''test-files''::text) AND (((storage.foldername(name))[1] = ((SELECT auth.uid()))::text) OR ((SELECT public.i_am_coach()) AND is_coach_of_folder((storage.foldername(name))[1])) OR (SELECT current_user_is_admin())))'),
('storage','objects','test_files_upload','CHECK','((bucket_id = ''test-files''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))','((bucket_id = ''test-files''::text) AND (((SELECT auth.uid()))::text = (storage.foldername(name))[1]))');
CREATE TEMP TABLE u ON COMMIT DROP AS
  SELECT id FROM public.profiles
  UNION ALL SELECT NULL::uuid
  UNION ALL SELECT '00000000-0000-4000-8000-00000000abcd'::uuid;
CREATE TEMP TABLE r(tbl text, pol text, kind text, n_eval bigint, n_diff bigint) ON COMMIT DROP;
DO $$
DECLARE e record; usr record; n bigint; d bigint;
BEGIN
  FOR e IN SELECT * FROM ex  LOOP
    IF to_regclass(format('%I.%I', e.sch, e.tbl)) IS NULL THEN CONTINUE; END IF;
    FOR usr IN SELECT id FROM u LOOP
      PERFORM set_config('request.jwt.claims',
        CASE WHEN usr.id IS NULL THEN '{"role":"anon"}'
             ELSE json_build_object('sub', usr.id, 'role', 'authenticated')::text END, true);
      EXECUTE format('SELECT count(*), count(*) FILTER (WHERE (%s) IS DISTINCT FROM (%s)) FROM %I.%I',
                     e.old, e.new, e.sch, e.tbl) INTO n, d;
      INSERT INTO r VALUES (e.sch || '.' || e.tbl, e.pol, e.kind, n, d);
    END LOOP;
  END LOOP;
END $$;
-- is_coach_of en SECURITY DEFINER : même réponse que l'ancienne version (invoker, donc sous la RLS de
-- profiles), pour chaque utilisateur et chaque athlète, évaluée en rôle authenticated / anon.
CREATE FUNCTION pg_temp.is_coach_of_avant(athlete_uuid uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $f$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = athlete_uuid AND coach_id = auth.uid())
      OR public.is_co_coach_of(athlete_uuid);
$f$;
CREATE TEMP TABLE rc(n_eval bigint, n_diff bigint) ON COMMIT DROP;
CREATE TEMP TABLE px ON COMMIT DROP AS
  SELECT id AS x FROM public.profiles UNION ALL SELECT NULL::uuid
  UNION ALL SELECT '00000000-0000-4000-8000-00000000abcd'::uuid;
GRANT ALL ON rc TO authenticated, anon;
GRANT SELECT ON px TO authenticated, anon;
DO $$
DECLARE usr record; n bigint; d bigint;
BEGIN
  FOR usr IN SELECT id FROM u LOOP
    PERFORM set_config('request.jwt.claims',
      CASE WHEN usr.id IS NULL THEN '{"role":"anon"}'
           ELSE json_build_object('sub', usr.id, 'role', 'authenticated')::text END, true);
    EXECUTE CASE WHEN usr.id IS NULL THEN 'SET LOCAL ROLE anon' ELSE 'SET LOCAL ROLE authenticated' END;
    SELECT count(*), count(*) FILTER (WHERE pg_temp.is_coach_of_avant(x) IS DISTINCT FROM public.is_coach_of(x))
      INTO n, d
      FROM px;
    INSERT INTO rc VALUES (n, d);
    EXECUTE 'RESET ROLE';
  END LOOP;
END $$;
INSERT INTO r SELECT 'public.is_coach_of', 'SECURITY DEFINER = ancienne version invoker', 'fonction', sum(n_eval), sum(n_diff) FROM rc;
SELECT tbl || ' / ' || pol || ' / ' || kind || ' : ' || sum(n_eval) || ' évaluations, 0 écart' AS label,
       sum(n_diff) = 0 AS ok
  FROM r GROUP BY tbl, pol, kind ORDER BY ok, tbl, pol, kind;
ROLLBACK;
