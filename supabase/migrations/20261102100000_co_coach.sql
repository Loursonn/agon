-- ════════════════════════════════════════════════════════════════════════════
-- Double coach (co-coach) — 2026-11-02
--
-- Un athlète peut avoir un 2e coach (« co-coach ») en plus de son coach référent
-- (profiles.coach_id). Les deux ont les mêmes droits sur l'entraînement de
-- l'athlète : voir, créer, modifier. Seuls changements de hiérarchie :
--   - seul le référent (ou l'athlète) retire le co-coach ; le co-coach peut partir ;
--   - délier l'athlète (unlink) reste réservé au référent.
--
-- Mécanique : is_coach_of() répond aussi « oui » pour le co-coach. Toutes les
-- policies qui passent par is_coach_of / can_coach_athlete suivent donc toutes
-- seules. Cette migration réécrit en plus les policies qui testaient
-- profiles.coach_id en dur, et ouvre au co-coach le contenu « possédé » par un
-- coach mais rattaché à l'athlète commun (fiches, séances énergie, tests).
--
-- Max 2 coachs : athlete_id est la clé primaire de athlete_co_coaches.
-- Spec : docs/CO_COACH_FEATURE.md
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Table de liaison ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.athlete_co_coaches (
  athlete_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  co_coach_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_by_role text NOT NULL CHECK (added_by_role IN ('coach', 'athlete')),
  -- Masquage propre au co-coach (le référent garde profiles.coach_hidden)
  hidden        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (co_coach_id <> athlete_id)
);

CREATE INDEX IF NOT EXISTS idx_athlete_co_coaches_co_coach
  ON public.athlete_co_coaches (co_coach_id);

ALTER TABLE public.athlete_co_coaches ENABLE ROW LEVEL SECURITY;

-- Lecture : l'athlète, le co-coach, le coach référent. Écritures : RPC uniquement.
DROP POLICY IF EXISTS acc_select ON public.athlete_co_coaches;
CREATE POLICY acc_select ON public.athlete_co_coaches FOR SELECT
  USING (
    athlete_id = auth.uid()
    OR co_coach_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.id = athlete_co_coaches.athlete_id AND p.coach_id = auth.uid())
  );

-- ── 2. Fonctions d'accès ────────────────────────────────────────────────────
-- Co-coach de l'athlète ? (SECURITY DEFINER : utilisable dans les policies de
-- profiles sans récursion RLS)
CREATE OR REPLACE FUNCTION public.is_co_coach_of(athlete_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.athlete_co_coaches cc
     WHERE cc.athlete_id = athlete_uuid
       AND cc.co_coach_id = auth.uid()
  );
$$;

-- Coach référent OU co-coach. Même signature qu'avant : les ~116 usages suivent.
CREATE OR REPLACE FUNCTION public.is_coach_of(athlete_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = athlete_uuid
      AND coach_id = auth.uid()
  ) OR public.is_co_coach_of(athlete_uuid);
$$;

-- p_coach est-il un des coachs (référent ou co-coach) de l'athlète ?
CREATE OR REPLACE FUNCTION public.is_athlete_coach(athlete_uuid uuid, p_coach uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_coach IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = athlete_uuid AND coach_id = p_coach)
    OR EXISTS (SELECT 1 FROM public.athlete_co_coaches
                WHERE athlete_id = athlete_uuid AND co_coach_id = p_coach)
  );
$$;

-- p_coach partage-t-il au moins un athlète avec moi (dans un sens ou l'autre) ?
-- Sert à lire les référentiels perso de l'autre coach (sports, qualités).
CREATE OR REPLACE FUNCTION public.is_coach_partner(p_coach uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_coach IS NOT NULL AND p_coach <> auth.uid() AND EXISTS (
    SELECT 1
      FROM public.athlete_co_coaches cc
      JOIN public.profiles a ON a.id = cc.athlete_id
     WHERE (a.coach_id = auth.uid() AND cc.co_coach_id = p_coach)
        OR (cc.co_coach_id = auth.uid() AND a.coach_id = p_coach)
  );
$$;

-- Fiche rattachée à un athlète que je coache (fiche perso, ou même famille
-- qu'une fiche attribuée) ?
CREATE OR REPLACE FUNCTION public.doc_for_my_athlete(doc_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.docs d
     WHERE d.id = doc_uuid
       AND (
         (d.athlete_id IS NOT NULL AND public.is_coach_of(d.athlete_id))
         OR EXISTS (
           SELECT 1
             FROM public.doc_assignments a
             JOIN public.docs ad ON ad.id = a.doc_id
            WHERE COALESCE(ad.origin_id, ad.id) = COALESCE(d.origin_id, d.id)
              AND public.is_coach_of(a.athlete_id)
         )
       )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_co_coach_of(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_athlete_coach(uuid, uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_coach_partner(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.doc_for_my_athlete(uuid)      TO authenticated;

-- ── 3. RPC : ajouter / retirer le co-coach ──────────────────────────────────
-- Appelée par l'athlète (sur lui-même) ou par son coach référent, avec le code
-- coach du 2e coach. Accès immédiat (pas d'acceptation).
CREATE OR REPLACE FUNCTION public.add_co_coach(p_athlete uuid, p_coach_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referent uuid;
  v_role     text;
  v_coach    public.profiles%ROWTYPE;
BEGIN
  SELECT coach_id INTO v_referent FROM public.profiles WHERE id = p_athlete;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Athlète introuvable' USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() = p_athlete THEN
    v_role := 'athlete';
  ELSIF v_referent IS NOT NULL AND auth.uid() = v_referent THEN
    v_role := 'coach';
  ELSE
    RAISE EXCEPTION 'Non autorisé' USING ERRCODE = '42501';
  END IF;

  IF v_referent IS NULL THEN
    RAISE EXCEPTION 'L''athlète doit d''abord avoir un coach' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_coach FROM public.profiles
   WHERE upper(coach_code) = upper(trim(p_coach_code))
     AND role IN ('coach', 'coach_athlete');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Code coach invalide' USING ERRCODE = 'P0001';
  END IF;

  IF v_coach.id = v_referent THEN
    RAISE EXCEPTION 'Ce coach est déjà le coach de l''athlète' USING ERRCODE = 'P0001';
  END IF;
  IF v_coach.id = p_athlete THEN
    RAISE EXCEPTION 'Un athlète ne peut pas être son propre co-coach' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.athlete_co_coaches WHERE athlete_id = p_athlete) THEN
    RAISE EXCEPTION 'L''athlète a déjà deux coachs' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.athlete_co_coaches (athlete_id, co_coach_id, added_by, added_by_role)
  VALUES (p_athlete, v_coach.id, auth.uid(), v_role);

  RETURN jsonb_build_object('co_coach_id', v_coach.id, 'full_name', v_coach.full_name);
END;
$$;

-- Retrait : le coach référent, l'athlète, ou le co-coach lui-même.
CREATE OR REPLACE FUNCTION public.remove_co_coach(p_athlete uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    auth.uid() = p_athlete
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_athlete AND coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.athlete_co_coaches
                WHERE athlete_id = p_athlete AND co_coach_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Non autorisé' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.athlete_co_coaches WHERE athlete_id = p_athlete;
END;
$$;

REVOKE ALL ON FUNCTION public.add_co_coach(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_co_coach(uuid)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_co_coach(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_co_coach(uuid)    TO authenticated;

-- Changement de coach référent (unlink, changement de code…) → le co-coach part.
CREATE OR REPLACE FUNCTION public.drop_co_coach_on_coach_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.coach_id IS DISTINCT FROM OLD.coach_id THEN
    DELETE FROM public.athlete_co_coaches WHERE athlete_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drop_co_coach_on_coach_change ON public.profiles;
CREATE TRIGGER trg_drop_co_coach_on_coach_change
  AFTER UPDATE OF coach_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.drop_co_coach_on_coach_change();

-- ── 4. profiles : lecture + mise à jour du profil athlète par le co-coach ───
DROP POLICY IF EXISTS profiles_select_co_coached ON public.profiles;
CREATE POLICY profiles_select_co_coached ON public.profiles FOR SELECT
  USING (public.is_co_coach_of(id));

DROP POLICY IF EXISTS profiles_update_co_coached ON public.profiles;
CREATE POLICY profiles_update_co_coached ON public.profiles FOR UPDATE
  USING (public.is_co_coach_of(id))
  WITH CHECK (public.is_co_coach_of(id));

-- Le co-coach ne modifie que les champs « entraînement » du profil : jamais le
-- lien coach, le rôle, les flags admin/certifié, le code, le masquage…
CREATE OR REPLACE FUNCTION public.guard_co_coach_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  allowed text[] := ARRAY[
    'first_name', 'last_name', 'full_name', 'age', 'birth_date', 'height_cm',
    'gender', 'weight_kg', 'body_fat_pct', 'base_metabolism',
    'is_hyrox_athlete', 'hyrox_category', 'habit_tracker_enabled', 'home_hidden_sections'
  ];
BEGIN
  IF auth.uid() IS NULL OR auth.uid() = OLD.id OR auth.uid() IS NOT DISTINCT FROM OLD.coach_id THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_co_coach_of(OLD.id) THEN
    RETURN NEW;  -- autres cas (admin…) : policies existantes
  END IF;
  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'Le co-coach ne peut pas modifier ce champ du profil' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_co_coach_profile_update ON public.profiles;
CREATE TRIGGER trg_guard_co_coach_profile_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_co_coach_profile_update();

-- Flag HYROX : le co-coach peut aussi le changer
CREATE OR REPLACE FUNCTION public.prevent_hyrox_flag_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_hyrox_athlete IS DISTINCT FROM OLD.is_hyrox_athlete THEN
    IF auth.uid() IS NOT NULL THEN
      -- Coach de l'athlète (référent ou co-coach)
      IF auth.uid() = OLD.coach_id OR public.is_co_coach_of(OLD.id) THEN RETURN NEW; END IF;
      -- Admin
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN RETURN NEW; END IF;
      -- Coach_athlete qui se suit lui-même
      IF auth.uid() = OLD.id AND EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coach', 'coach_athlete')
      ) THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'Forbidden: only the athlete''s coach can change is_hyrox_athlete';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Masquer un athlète : le référent masque via profiles.coach_hidden, le
-- co-coach via sa ligne de liaison (chacun son affichage).
CREATE OR REPLACE FUNCTION public.set_athlete_hidden(athlete_id uuid, hidden boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE id = set_athlete_hidden.athlete_id AND coach_id = auth.uid()) THEN
    UPDATE profiles SET coach_hidden = set_athlete_hidden.hidden WHERE id = set_athlete_hidden.athlete_id;
  ELSIF EXISTS (SELECT 1 FROM athlete_co_coaches cc
                 WHERE cc.athlete_id = set_athlete_hidden.athlete_id AND cc.co_coach_id = auth.uid()) THEN
    UPDATE athlete_co_coaches cc SET hidden = set_athlete_hidden.hidden
     WHERE cc.athlete_id = set_athlete_hidden.athlete_id AND cc.co_coach_id = auth.uid();
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$$;

-- ── 5. Policies qui testaient profiles.coach_id en dur → is_coach_of ────────
-- app_data (programmes muscu, wellness, séances…)
DROP POLICY IF EXISTS app_data_coach ON public.app_data;
CREATE POLICY app_data_coach ON public.app_data FOR ALL
  USING (public.is_coach_of(athlete_id));

-- exercise_pr_logs
DROP POLICY IF EXISTS coach_sees_athlete_prs   ON public.exercise_pr_logs;
DROP POLICY IF EXISTS coach_insert_athlete_prs ON public.exercise_pr_logs;
DROP POLICY IF EXISTS coach_delete_athlete_prs ON public.exercise_pr_logs;
CREATE POLICY coach_sees_athlete_prs   ON public.exercise_pr_logs FOR SELECT USING (public.is_coach_of(athlete_id));
CREATE POLICY coach_insert_athlete_prs ON public.exercise_pr_logs FOR INSERT WITH CHECK (public.is_coach_of(athlete_id));
CREATE POLICY coach_delete_athlete_prs ON public.exercise_pr_logs FOR DELETE USING (public.is_coach_of(athlete_id));

-- measurement_logs, medical_history, workout_rpe (lecture coach)
DROP POLICY IF EXISTS coach_read_measurements ON public.measurement_logs;
CREATE POLICY coach_read_measurements ON public.measurement_logs FOR SELECT USING (public.is_coach_of(athlete_id));

DROP POLICY IF EXISTS coach_read_athlete_medical ON public.medical_history;
CREATE POLICY coach_read_athlete_medical ON public.medical_history FOR SELECT USING (public.is_coach_of(athlete_id));

DROP POLICY IF EXISTS coach_read_athlete_rpe ON public.workout_rpe;
CREATE POLICY coach_read_athlete_rpe ON public.workout_rpe FOR SELECT USING (public.is_coach_of(athlete_id));

-- workout_logs
DROP POLICY IF EXISTS workout_logs_coach_read   ON public.workout_logs;
DROP POLICY IF EXISTS workout_logs_coach_insert ON public.workout_logs;
DROP POLICY IF EXISTS workout_logs_coach_update ON public.workout_logs;
DROP POLICY IF EXISTS workout_logs_coach_delete ON public.workout_logs;
CREATE POLICY workout_logs_coach_read   ON public.workout_logs FOR SELECT USING (public.is_coach_of(athlete_id));
CREATE POLICY workout_logs_coach_insert ON public.workout_logs FOR INSERT WITH CHECK (public.is_coach_of(athlete_id));
CREATE POLICY workout_logs_coach_update ON public.workout_logs FOR UPDATE USING (public.is_coach_of(athlete_id));
CREATE POLICY workout_logs_coach_delete ON public.workout_logs FOR DELETE USING (public.is_coach_of(athlete_id));

-- test_sessions : la ligne porte le coach qui l'a créée → l'autre coach aussi
DROP POLICY IF EXISTS test_select ON public.test_sessions;
DROP POLICY IF EXISTS test_insert ON public.test_sessions;
DROP POLICY IF EXISTS test_update ON public.test_sessions;
DROP POLICY IF EXISTS test_delete ON public.test_sessions;
CREATE POLICY test_select ON public.test_sessions FOR SELECT
  USING ((athlete_id = auth.uid()) OR (coach_id = auth.uid()) OR public.is_coach_of(athlete_id)
         OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
CREATE POLICY test_insert ON public.test_sessions FOR INSERT
  WITH CHECK ((athlete_id = auth.uid()) OR (coach_id = auth.uid())
         OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
CREATE POLICY test_update ON public.test_sessions FOR UPDATE
  USING ((athlete_id = auth.uid()) OR (coach_id = auth.uid()) OR public.is_coach_of(athlete_id)
         OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
CREATE POLICY test_delete ON public.test_sessions FOR DELETE
  USING ((athlete_id = auth.uid()) OR (coach_id = auth.uid()) OR public.is_coach_of(athlete_id)
         OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- performance_notifications : les deux coachs voient et traitent les alertes
DROP POLICY IF EXISTS perf_notif_select ON public.performance_notifications;
DROP POLICY IF EXISTS perf_notif_update ON public.performance_notifications;
CREATE POLICY perf_notif_select ON public.performance_notifications FOR SELECT
  USING ((coach_id = auth.uid()) OR (athlete_id = auth.uid()) OR public.is_coach_of(athlete_id));
CREATE POLICY perf_notif_update ON public.performance_notifications FOR UPDATE
  USING ((coach_id = auth.uid()) OR public.is_coach_of(athlete_id)
         OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- ── 6. Séances énergie : contenu assigné à l'athlète commun ─────────────────
DROP POLICY IF EXISTS es_select        ON public.energy_sessions;
DROP POLICY IF EXISTS es_update_author ON public.energy_sessions;
DROP POLICY IF EXISTS es_delete        ON public.energy_sessions;
CREATE POLICY es_select ON public.energy_sessions FOR SELECT
  USING (
    (is_public = true)
    OR (created_by = auth.uid())
    OR (athlete_id = auth.uid())
    OR (athlete_id IS NOT NULL AND public.is_coach_of(athlete_id))
    OR (id IN (SELECT a.energy_session_id FROM energy_session_assignments a WHERE a.athlete_id = auth.uid()))
    OR (id IN (SELECT a.energy_session_id FROM energy_session_assignments a WHERE public.is_coach_of(a.athlete_id)))
  );
CREATE POLICY es_update_author ON public.energy_sessions FOR UPDATE
  USING (
    (created_by = auth.uid())
    OR (athlete_id IS NOT NULL AND public.is_coach_of(athlete_id))
    OR (id IN (SELECT a.energy_session_id FROM energy_session_assignments a WHERE public.is_coach_of(a.athlete_id)))
  )
  WITH CHECK (
    (created_by = auth.uid())
    OR (athlete_id IS NOT NULL AND public.is_coach_of(athlete_id))
    OR (id IN (SELECT a.energy_session_id FROM energy_session_assignments a WHERE public.is_coach_of(a.athlete_id)))
  );
-- Suppression : pas d'une séance de la banque de l'autre coach
CREATE POLICY es_delete ON public.energy_sessions FOR DELETE
  USING ((created_by = auth.uid()) OR (athlete_id IS NOT NULL AND public.is_coach_of(athlete_id)));

CREATE OR REPLACE FUNCTION public.delete_energy_session(p_session_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_created_by uuid;
  v_athlete_id uuid;
BEGIN
  SELECT created_by, athlete_id INTO v_created_by, v_athlete_id
  FROM energy_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  -- Mêmes droits que la policy es_delete, plus les admins
  IF NOT (
    v_created_by = auth.uid()
    OR (v_athlete_id IS NOT NULL AND public.is_coach_of(v_athlete_id))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  ) THEN
    RAISE EXCEPTION 'Suppression non autorisée' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM energy_session_assignments WHERE energy_session_id = p_session_id) THEN
    UPDATE energy_sessions SET archived_at = now(), updated_at = now() WHERE id = p_session_id;
    RETURN 'archived';
  END IF;

  DELETE FROM energy_sessions WHERE id = p_session_id;
  RETURN 'deleted';
END;
$$;

-- ── 7. Fiches ───────────────────────────────────────────────────────────────
-- Modifier : ses fiches, ou une fiche rattachée à un athlète commun.
-- La fiche ne peut pas changer de propriétaire hors des coachs partenaires.
DROP POLICY IF EXISTS docs_coach_update ON public.docs;
CREATE POLICY docs_coach_update ON public.docs FOR UPDATE
  USING ((coach_id = auth.uid()) OR public.doc_for_my_athlete(id))
  WITH CHECK ((coach_id = auth.uid()) OR public.is_coach_partner(coach_id));

-- Supprimer : ses fiches, ou une fiche perso d'un athlète commun (pas la banque de l'autre)
DROP POLICY IF EXISTS docs_coach_delete ON public.docs;
CREATE POLICY docs_coach_delete ON public.docs FOR DELETE
  USING ((coach_id = auth.uid()) OR (athlete_id IS NOT NULL AND public.is_coach_of(athlete_id)));

CREATE OR REPLACE FUNCTION public.can_read_doc(doc_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
        -- CO-COACH / RÉFÉRENT : fiche perso d'un athlète commun, ou même famille
        -- qu'une fiche attribuée à un athlète que je coache
        OR (d.athlete_id IS NOT NULL AND public.is_coach_of(d.athlete_id))
        OR EXISTS (
          SELECT 1
          FROM public.doc_assignments a
          JOIN public.docs ad ON ad.id = a.doc_id
          WHERE COALESCE(ad.origin_id, ad.id) = COALESCE(d.origin_id, d.id)
            AND public.is_coach_of(a.athlete_id)
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
$$;

CREATE OR REPLACE FUNCTION public.can_read_doc_file(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
          OR public.is_coach_of(c.athlete_id)
          -- STAFF
          OR public.staff_can(c.athlete_id, 'commentaires', 'read')
        )
    );
$$;

-- Attribution des fiches d'un programme : les deux coachs, fiches des deux coachs
CREATE OR REPLACE FUNCTION public.sync_doc_assignments(p_athlete uuid, p_source text, p_doc_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_source NOT IN ('programme', 'energie') THEN
    RAISE EXCEPTION 'invalid source';
  END IF;

  IF NOT (
    public.is_coach_of(p_athlete)
    OR (p_athlete = auth.uid()
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coach', 'coach_athlete')))
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  DELETE FROM public.doc_assignments
   WHERE athlete_id = p_athlete
     AND source = p_source
     AND NOT (doc_id = ANY (COALESCE(p_doc_ids, '{}'::uuid[])));

  INSERT INTO public.doc_assignments (doc_id, athlete_id, assigned_by, source)
  SELECT d.id, p_athlete, auth.uid(), p_source
    FROM public.docs d
   WHERE d.id = ANY (COALESCE(p_doc_ids, '{}'::uuid[]))
     AND (d.coach_id = auth.uid() OR public.is_athlete_coach(p_athlete, d.coach_id))
     -- fiche de banque, ou fiche personnelle de CET athlète uniquement
     AND (d.athlete_id IS NULL OR d.athlete_id = p_athlete)
  ON CONFLICT (doc_id, athlete_id, source) DO NOTHING;
END;
$$;

DROP POLICY IF EXISTS doc_schedule_insert ON public.doc_schedule;
CREATE POLICY doc_schedule_insert ON public.doc_schedule FOR INSERT
  WITH CHECK (
    (added_by = auth.uid()) AND (
      (public.staff_can(athlete_id, 'fiches', 'write') AND public.staff_doc_for_athlete(doc_id, athlete_id))
      OR (public.is_coach_of(athlete_id) AND EXISTS (
            SELECT 1 FROM public.docs d
             WHERE d.id = doc_schedule.doc_id
               AND (d.coach_id = auth.uid() OR public.is_athlete_coach(doc_schedule.athlete_id, d.coach_id))))
    )
  );

-- ── 8. Référentiels perso (sports, qualités) : lisibles par le coach partenaire
DROP POLICY IF EXISTS pq_select ON public.physical_qualities;
CREATE POLICY pq_select ON public.physical_qualities FOR SELECT
  USING ((coach_id IS NULL) OR (coach_id = auth.uid()) OR public.is_coach_partner(coach_id));

DROP POLICY IF EXISTS ss_select ON public.specific_sports;
CREATE POLICY ss_select ON public.specific_sports FOR SELECT
  USING ((coach_id IS NULL) OR (coach_id = auth.uid()) OR public.is_coach_partner(coach_id));

-- ── 9. Médias de tests : les coachs de l'athlète lisent son dossier ─────────
DROP POLICY IF EXISTS coach_read_athlete_test_media ON storage.objects;
CREATE POLICY coach_read_athlete_test_media ON storage.objects FOR SELECT
  USING (
    bucket_id = 'test-media'
    AND (storage.foldername(name))[1] IN (
      SELECT a.id::text FROM public.profiles a WHERE public.is_coach_of(a.id)
    )
  );

-- ── 10. Vue d'ensemble coach : inclut les athlètes co-coachés ───────────────
CREATE OR REPLACE FUNCTION public.get_coach_overview(coach_uuid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_athlete_ids uuid[];
  v_today       date := CURRENT_DATE;
  v_yesterday   date := CURRENT_DATE - 1;
  v_30_days     date := CURRENT_DATE + 30;
  v_result      jsonb;
BEGIN
  -- Sécurité : le coach ne peut demander que ses propres données
  IF auth.uid() != coach_uuid THEN
    RAISE EXCEPTION 'Accès refusé : coach_uuid ne correspond pas à l''utilisateur connecté';
  END IF;

  -- 1. IDs des athlètes de ce coach
  -- (+ athlètes co-coachés : co-coach = mêmes droits que le coach référent)
  SELECT array_agg(id) INTO v_athlete_ids
  FROM public.profiles
  WHERE coach_id = coach_uuid
     OR id IN (SELECT cc.athlete_id FROM public.athlete_co_coaches cc WHERE cc.co_coach_id = coach_uuid);

  -- Pas d'athlètes → retourne un état vide
  IF v_athlete_ids IS NULL OR array_length(v_athlete_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'athlete_count',       0,
      'competitions_count',  0,
      'wellness_today',      '[]'::jsonb,
      'wellness_history',    '[]'::jsonb,
      'sessions_data',       '[]'::jsonb,
      'competitions_upcoming','[]'::jsonb,
      'recent_activity',     '[]'::jsonb
    );
  END IF;

  SELECT jsonb_build_object(
    -- KPI : nombre d'athlètes
    'athlete_count', array_length(v_athlete_ids, 1),

    -- KPI : compétitions dans les 30 prochains jours
    'competitions_count', (
      SELECT COUNT(*)
      FROM public.competitions
      WHERE athlete_id = ANY(v_athlete_ids)
        AND date >= v_today
        AND date <= v_30_days
    ),

    -- Wellness du jour (score + détails) par athlète
    'wellness_today', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'athlete_id', athlete_id,
        'value', value
      ))
      FROM public.app_data
      WHERE athlete_id = ANY(v_athlete_ids)
        AND key = 'asp:wellness'
    ), '[]'::jsonb),

    -- Historique wellness (7 derniers jours) pour détection surcharge
    'wellness_history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'athlete_id', athlete_id,
        'value', value
      ))
      FROM public.app_data
      WHERE athlete_id = ANY(v_athlete_ids)
        AND key = 'asp:wh'
    ), '[]'::jsonb),

    -- Données sessions (blockConfig + sessions + completed) pour ratio + missed
    'sessions_data', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'athlete_id', athlete_id,
        'key', key,
        'value', value
      ))
      FROM public.app_data
      WHERE athlete_id = ANY(v_athlete_ids)
        AND key IN ('asp:completed', 'asp:blockConfig', 'asp:sessions')
    ), '[]'::jsonb),

    -- Compétitions à venir (données complètes pour AlertCards)
    'competitions_upcoming', COALESCE((
      SELECT jsonb_agg(row_to_json(c.*)::jsonb ORDER BY c.date ASC)
      FROM public.competitions c
      WHERE c.athlete_id = ANY(v_athlete_ids)
        AND c.date >= v_today
        AND c.date <= v_30_days
    ), '[]'::jsonb),

    -- Activité récente (app_data mis à jour) pour la timeline
    'recent_activity', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'athlete_id', athlete_id,
        'key', key,
        'updated_at', updated_at
      ) ORDER BY updated_at DESC)
      FROM (
        SELECT athlete_id, key, updated_at
        FROM public.app_data
        WHERE athlete_id = ANY(v_athlete_ids)
          AND key IN ('asp:sessionlogs', 'asp:wh')
        ORDER BY updated_at DESC
        LIMIT 30
      ) sub
    ), '[]'::jsonb)

  ) INTO v_result;

  RETURN v_result;
END;
$function$;
