-- =============================================================================
-- Hygiène de la base (audit 2026-11 §6, points 🟡). Idempotente.
--
-- Mesuré sur la prod le 2026-11-08 (lecture de pg_catalog / pg_policies) :
--   * 59 clés étrangères sans index dont le 1er champ est la colonne de la clé
--     (dont `profiles.coach_id`, lu par presque toutes les policies via
--     `is_coach_of`). Tables minuscules (la plus grosse : 1 Mo, 1 140 lignes) :
--     CREATE INDEX simple, dans la transaction, verrou de quelques ms.
--   * 7 tables ont une colonne `updated_at` qu'aucun trigger ne tient à jour.
--     Exclues volontairement :
--       - `app_data` : `updated_at` ne doit PAS bouger à chaque édition du
--         programme (fils d'activité, voir 20261030110000 et 20261109110000) ;
--       - `athlete_staff` : son trigger `athlete_staff_before_update` le fait ;
--       - `provider_fit_quota`, `provider_tokens` : écrits explicitement par
--         leurs fonctions, la date sert au calcul des quotas / du
--         rafraîchissement ;
--       - `planning_blocks` : table morte (audit §6).
--   * Policies en double STRICT (mêmes droits déjà donnés par UNE autre policy
--     de la même table, mêmes rôles) : 6 supprimées. Chaque suppression vérifie
--     d'abord que la policy qui la couvre existe toujours telle quelle.
--   * `test_definitions` / `test_variables` : la banque commune (created_by
--     NULL) n'était modifiable que par `role = 'coach'` → `coach_athlete`
--     ajouté.
--   * RPC des séances énergie : refusées à l'admin alors que la RLS de
--     `energy_session_assignments` l'accepte et que les RPC références / tests
--     (`current_user_is_admin()`) aussi → alignées.
--   * `set_own_coach` : la seule écriture directe de `profiles.coach_id` par le
--     client (quitter son coach / se coacher soi-même) passe par une RPC,
--     comme le veut CLAUDE.md. Le trigger `guard_profile_privileged_fields`
--     garde les mêmes règles ; le client en prod (main) continue d'écrire en
--     direct, toujours permis : rien n'est fermé ici.
--
-- Additive pour le client en prod : aucune colonne, aucune donnée, aucun accès
-- retiré (les policies supprimées sont redondantes).
--
-- Rollback : DROP INDEX des index *_fk_idx ; DROP TRIGGER set_<table>_updated_at
-- sur les 7 tables ; recréer les 6 policies (définitions dans le rapport du
-- 2026-11-08 et ci-dessous en commentaire) ; remettre role = 'coach' dans les
-- 3 policies de banque ; retirer `OR current_user_is_admin()` du helper
-- énergie ; DROP FUNCTION public.set_own_coach(uuid).
-- =============================================================================

-- ── 1. Index des clés étrangères ─────────────────────────────────────────────
-- Une table ou colonne absente (table morte supprimée entre-temps) est sautée.
DO $$
DECLARE
  fk text;
  v_table text;
  v_col text;
  v_name text;
BEGIN
  FOREACH fk IN ARRAY ARRAY[
    'app_feedback.author_id',
    'athlete_co_coaches.added_by',
    'athlete_staff.added_by',
    'athlete_staff.revoked_by',
    'coach_api_access_log.coach_id',
    'coach_api_access_log.key_id',
    'coach_api_drafts.athlete_id',
    'coach_api_drafts.key_id',
    'competitions.coach_id',
    'cycles.coach_id',
    'day_themes.coach_id',
    'doc_assignments.assigned_by',
    'doc_comments.athlete_id',
    'doc_comments.author_id',
    'doc_schedule.added_by',
    'docs.uploaded_by',
    'energy_session_assignments.coach_id',
    'energy_sessions.quality_id',
    'energy_sessions.verified_by',
    'exercises.created_by',
    'habits.created_by',
    'hyrox_race_plans.athlete_id',
    'hyrox_race_plans.competition_id',
    'hyrox_race_plans.created_by',
    'hyrox_race_plans.result_id',
    'hyrox_results.competition_id',
    'hyrox_results.created_by',
    'hyrox_test_analyses.created_by',
    'hyrox_test_analyses.grid_version',
    'hyrox_test_analyses.recalculated_from',
    'hyrox_test_analyses.validated_by',
    'hyrox_test_axes_drafts.updated_by',
    'hyrox_test_grid_versions.created_by',
    'invitations.coach_id',
    'medical_attachments.athlete_id',
    'medical_attachments.created_by',
    'medical_entries.created_by',
    'performance_logs.created_by',
    'performance_logs.test_session_id',
    'performance_notifications.athlete_id',
    'performance_notifications.coach_id',
    'performance_notifications.performance_log_id',
    'planning_blocks.coach_id',
    'profiles.coach_id',
    'provider_oauth_states.athlete_id',
    'retours_votes.user_id',
    'roadmap_items.created_by',
    'roadmap_items.phase_id',
    'roadmap_phases.created_by',
    'roadmap_votes.user_id',
    'seasons.coach_id',
    'specific_blocks.quality_id',
    'staff_invitations.invited_by',
    'staff_invitations.used_by',
    'test_definitions.created_by',
    'test_results.test_session_id',
    'test_sessions.planning_block_id',
    'tests.created_by',
    'weekly_retours.coach_id'
  ] LOOP
    v_table := split_part(fk, '.', 1);
    v_col   := split_part(fk, '.', 2);
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = v_table AND column_name = v_col);
    v_name := left(v_table || '_' || v_col, 56) || '_fk_idx';
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)', v_name, v_table, v_col);
  END LOOP;
END $$;

-- ── 2. updated_at tenu à jour ────────────────────────────────────────────────
-- Même fonction que les autres tables (`public.set_updated_at`).
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'app_feedback',
    'athlete_profile_items',
    'athlete_test_results',
    'exercises',
    'test_definitions',
    'test_sessions',
    'weekly_retours'
  ] LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'updated_at');
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'set_' || v_table || '_updated_at', v_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      'set_' || v_table || '_updated_at', v_table);
  END LOOP;
END $$;

-- ── 3. Policies en double strict ─────────────────────────────────────────────
-- (schéma, table, policy supprimée, policy qui donne déjà les mêmes droits)
--   public.exercises       "Public read"            ← exercises_select_all
--       SELECT, public, USING (true) — identiques
--   public.medical_history coach_read_athlete_medical ← coach_write_athlete_medical
--       SELECT USING is_coach_of(athlete_id) — déjà dans la policy ALL, même USING
--   public.workout_rpe     workout_rpe_insert / _update / _delete ← athlete_own_rpe
--       athlete_id = auth.uid() — déjà dans la policy ALL, mêmes conditions
--   storage.objects        coach_delete_test_media  ← athlete_delete_test_media
--       DELETE, authenticated, test-media + 1er dossier = auth.uid() — identiques
--
-- La suppression n'a lieu que si la policy couvrante existe, est permissive,
-- couvre la commande (même commande ou ALL), a au moins les mêmes rôles et le
-- même USING / WITH CHECK. Sinon : rien n'est supprimé, un NOTICE le signale.
DO $$
DECLARE
  d record;
  v_drop record;
  v_keep record;
  v_ok boolean;
BEGIN
  FOR d IN
    SELECT * FROM (VALUES
      ('public',  'exercises',       'Public read',                'exercises_select_all'),
      ('public',  'medical_history', 'coach_read_athlete_medical', 'coach_write_athlete_medical'),
      ('public',  'workout_rpe',     'workout_rpe_insert',         'athlete_own_rpe'),
      ('public',  'workout_rpe',     'workout_rpe_update',         'athlete_own_rpe'),
      ('public',  'workout_rpe',     'workout_rpe_delete',         'athlete_own_rpe'),
      ('storage', 'objects',         'coach_delete_test_media',    'athlete_delete_test_media')
    ) AS t(sch, tbl, drop_name, keep_name)
  LOOP
    SELECT * INTO v_drop FROM pg_policies
     WHERE schemaname = d.sch AND tablename = d.tbl AND policyname = d.drop_name;
    CONTINUE WHEN NOT FOUND;  -- déjà supprimée
    SELECT * INTO v_keep FROM pg_policies
     WHERE schemaname = d.sch AND tablename = d.tbl AND policyname = d.keep_name;
    v_ok := FOUND
      AND v_keep.permissive = 'PERMISSIVE' AND v_drop.permissive = 'PERMISSIVE'
      AND (v_keep.cmd = v_drop.cmd OR v_keep.cmd = 'ALL')
      AND (v_keep.roles @> v_drop.roles OR v_keep.roles = '{public}')
      AND CASE v_drop.cmd
            WHEN 'SELECT' THEN v_keep.qual IS NOT DISTINCT FROM v_drop.qual
            WHEN 'DELETE' THEN v_keep.qual IS NOT DISTINCT FROM v_drop.qual
            WHEN 'INSERT' THEN coalesce(v_keep.with_check, v_keep.qual) IS NOT DISTINCT FROM v_drop.with_check
            WHEN 'UPDATE' THEN v_keep.qual IS NOT DISTINCT FROM v_drop.qual
                           AND coalesce(v_keep.with_check, v_keep.qual)
                               IS NOT DISTINCT FROM coalesce(v_drop.with_check, v_drop.qual)
            ELSE false
          END;
    IF v_ok THEN
      EXECUTE format('DROP POLICY %I ON %I.%I', d.drop_name, d.sch, d.tbl);
    ELSE
      RAISE NOTICE 'Policy % sur %.% gardée : % ne la couvre plus à l''identique', d.drop_name, d.sch, d.tbl, d.keep_name;
    END IF;
  END LOOP;
END $$;

-- ── 4. Banque de tests commune : coach_athlete inclus ────────────────────────
DROP POLICY IF EXISTS td_update_coach_library ON public.test_definitions;
CREATE POLICY td_update_coach_library ON public.test_definitions
  FOR UPDATE TO authenticated
  USING (created_by IS NULL
         AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coach', 'coach_athlete')))
  WITH CHECK (created_by IS NULL);

DROP POLICY IF EXISTS td_delete_coach_library ON public.test_definitions;
CREATE POLICY td_delete_coach_library ON public.test_definitions
  FOR DELETE TO authenticated
  USING (created_by IS NULL
         AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coach', 'coach_athlete')));

DROP POLICY IF EXISTS tv_write_coach_library ON public.test_variables;
CREATE POLICY tv_write_coach_library ON public.test_variables
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.test_definitions td
                  WHERE td.id = test_variables.test_definition_id AND td.created_by IS NULL)
         AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coach', 'coach_athlete')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.test_definitions td
                       WHERE td.id = test_variables.test_definition_id AND td.created_by IS NULL)
              AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coach', 'coach_athlete')));

-- ── 5. RPC énergie : l'admin, comme la RLS de la table et les RPC tests ──────
CREATE OR REPLACE FUNCTION public._energy_assignment_for_write(p_assignment uuid)
RETURNS public.energy_session_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  uuid := auth.uid();
  v_row public.energy_session_assignments;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  IF p_assignment IS NULL THEN
    RAISE EXCEPTION 'Séance obligatoire' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.energy_session_assignments WHERE id = p_assignment FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Séance introuvable' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_row.athlete_id = v_me OR public.is_coach_of(v_row.athlete_id) OR public.current_user_is_admin()) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public._energy_assignment_for_write(uuid) FROM PUBLIC, anon, authenticated;

-- ── 6. set_own_coach : quitter son coach / se coacher soi-même ───────────────
-- Seules valeurs permises (mêmes règles que guard_profile_privileged_fields) :
--   NULL       quitter son coach (athlète) ou se retirer de ses propres
--              athlètes (coach-athlète) ;
--   auth.uid() coach ou coach-athlète qui redevient son propre coach.
-- Tout autre coach : `link_to_coach_by_code` / `redeem_invitation`.
-- Le trigger `drop_co_coach_on_coach_change` retire le co-coach au changement,
-- comme pour l'écriture directe.
CREATE OR REPLACE FUNCTION public.set_own_coach(p_coach uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_role text;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_me FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil introuvable' USING ERRCODE = 'P0002';
  END IF;
  IF p_coach IS NOT NULL AND p_coach <> v_me THEN
    RAISE EXCEPTION 'Rattachement à un autre coach : passer par le code coach' USING ERRCODE = '42501';
  END IF;
  IF p_coach = v_me AND v_role NOT IN ('coach', 'coach_athlete') THEN
    RAISE EXCEPTION 'Seul un coach peut être son propre coach' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles SET coach_id = p_coach WHERE id = v_me AND coach_id IS DISTINCT FROM p_coach;
  RETURN p_coach;
END;
$$;

REVOKE ALL ON FUNCTION public.set_own_coach(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_own_coach(uuid) TO authenticated;

COMMENT ON FUNCTION public.set_own_coach(uuid) IS
  'Quitter son coach (NULL) ou se coacher soi-même (son propre id, coach / coach-athlète). Voir src/api/account.ts setOwnCoach.';
