-- Fiche d'un test + niveaux de biométrie.
--
-- 1. coach_test_fiches : la fiche (catégorie « test ») que le coach rattache
--    à un test de sa banque, ou à la biométrie (test_key = 'biometrie').
--    Par coach, et pas sur test_definitions : les tests de base sont partagés
--    entre tous les coachs.
-- 2. test_sessions.doc_id : la fiche du test planifié, posée à la création
--    (et mise à jour quand le coach change la fiche du test). L'athlète la
--    lit sur la carte du test.
-- 3. doc_assignments source 'test' : les fiches des tests planifiés sont
--    attribuées à l'athlète (droit de lecture), recalculées par trigger quel
--    que soit l'écran qui planifie (planning, téléphone, coach-api).
-- 4. test_sessions.biometry_levels : niveaux ajoutés à la biométrie classique
--    ('avancee' : envergure et longueurs de segment ; 'myjump' : mesures MyJump).
--
-- Ajout pur : nouvelle table, colonnes nullables / avec défaut, contrainte
-- élargie. Le client de prod (main) n'écrit aucune de ces colonnes.

-- ── 1. Fiche par test, par coach ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_test_fiches (
  coach_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  test_key   text NOT NULL,  -- test_definitions.id (texte) ou 'biometrie'
  doc_id     uuid NOT NULL REFERENCES public.docs(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, test_key)
);

CREATE INDEX IF NOT EXISTS idx_coach_test_fiches_doc ON public.coach_test_fiches (doc_id);

ALTER TABLE public.coach_test_fiches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ctf_select ON public.coach_test_fiches;
CREATE POLICY ctf_select ON public.coach_test_fiches FOR SELECT TO authenticated
  USING (coach_id = (SELECT auth.uid()) OR ((SELECT public.i_am_coach()) AND public.is_coach_partner(coach_id)));

DROP POLICY IF EXISTS ctf_insert ON public.coach_test_fiches;
CREATE POLICY ctf_insert ON public.coach_test_fiches FOR INSERT TO authenticated
  WITH CHECK (coach_id = (SELECT auth.uid()) AND (SELECT public.i_am_coach()));

DROP POLICY IF EXISTS ctf_update ON public.coach_test_fiches;
CREATE POLICY ctf_update ON public.coach_test_fiches FOR UPDATE TO authenticated
  USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()) AND (SELECT public.i_am_coach()));

DROP POLICY IF EXISTS ctf_delete ON public.coach_test_fiches;
CREATE POLICY ctf_delete ON public.coach_test_fiches FOR DELETE TO authenticated
  USING (coach_id = (SELECT auth.uid()));

-- ── 2 et 4. Colonnes des tests planifiés ─────────────────────────────────────
ALTER TABLE public.test_sessions
  ADD COLUMN IF NOT EXISTS doc_id uuid REFERENCES public.docs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS biometry_levels text[] NOT NULL DEFAULT '{}';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_sessions_biometry_levels_check') THEN
    ALTER TABLE public.test_sessions ADD CONSTRAINT test_sessions_biometry_levels_check
      CHECK (biometry_levels <@ ARRAY['avancee', 'myjump']::text[]);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_test_sessions_doc ON public.test_sessions (doc_id);

COMMENT ON COLUMN public.test_sessions.doc_id IS 'Fiche du test (coach_test_fiches), lue par l''athlète sur la carte du test';
COMMENT ON COLUMN public.test_sessions.biometry_levels IS 'Biométrie : niveaux ajoutés à la classique (avancee, myjump)';

-- ── 3. Source d'attribution 'test' ───────────────────────────────────────────
ALTER TABLE public.doc_assignments DROP CONSTRAINT IF EXISTS doc_assignments_source_check;
ALTER TABLE public.doc_assignments ADD CONSTRAINT doc_assignments_source_check
  CHECK (source IN ('manuel', 'programme', 'energie', 'test'));

-- Fiche d'un test planifié : celle du coach principal de l'athlète, sinon
-- celle du coach qui a planifié.
CREATE OR REPLACE FUNCTION public.test_fiche_for(p_athlete uuid, p_coach uuid, p_type text, p_title text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.doc_id
    FROM public.coach_test_fiches f
    LEFT JOIN public.test_definitions d ON f.test_key = d.id::text
   WHERE f.coach_id IN ((SELECT p.coach_id FROM public.profiles p WHERE p.id = p_athlete), p_coach)
     AND (
       (p_type = 'biometric' AND f.test_key = 'biometrie')
       OR (p_type IS DISTINCT FROM 'biometric' AND lower(d.name) = lower(p_title))
     )
   ORDER BY (f.coach_id = (SELECT p.coach_id FROM public.profiles p WHERE p.id = p_athlete)) DESC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.test_fiche_for(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Pose la fiche à la création d'un test planifié.
CREATE OR REPLACE FUNCTION public.tg_test_session_fiche()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.doc_id IS NULL THEN
    NEW.doc_id := public.test_fiche_for(NEW.athlete_id, NEW.coach_id, NEW.type, NEW.title);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_test_session_fiche() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS test_sessions_fiche ON public.test_sessions;
CREATE TRIGGER test_sessions_fiche
  BEFORE INSERT ON public.test_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_test_session_fiche();

-- Attributions source 'test' d'un athlète = fiches de ses tests planifiés.
CREATE OR REPLACE FUNCTION public.sync_test_doc_assignments(p_athlete uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.doc_assignments a
   WHERE a.athlete_id = p_athlete
     AND a.source = 'test'
     AND NOT EXISTS (SELECT 1 FROM public.test_sessions t WHERE t.athlete_id = p_athlete AND t.doc_id = a.doc_id);

  INSERT INTO public.doc_assignments (doc_id, athlete_id, assigned_by, source)
  SELECT DISTINCT t.doc_id, p_athlete, t.coach_id, 'test'
    FROM public.test_sessions t
   WHERE t.athlete_id = p_athlete AND t.doc_id IS NOT NULL
  ON CONFLICT (doc_id, athlete_id, source) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_test_doc_assignments(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_test_session_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.doc_id IS NOT NULL THEN PERFORM public.sync_test_doc_assignments(OLD.athlete_id); END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.doc_id IS NOT NULL THEN PERFORM public.sync_test_doc_assignments(NEW.athlete_id); END IF;
  ELSIF NEW.doc_id IS DISTINCT FROM OLD.doc_id OR NEW.athlete_id IS DISTINCT FROM OLD.athlete_id THEN
    PERFORM public.sync_test_doc_assignments(NEW.athlete_id);
    IF NEW.athlete_id IS DISTINCT FROM OLD.athlete_id THEN PERFORM public.sync_test_doc_assignments(OLD.athlete_id); END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_test_session_assignments() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS test_sessions_fiche_assignments ON public.test_sessions;
CREATE TRIGGER test_sessions_fiche_assignments
  AFTER INSERT OR DELETE OR UPDATE OF doc_id, athlete_id ON public.test_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_test_session_assignments();

-- Le coach change la fiche d'un test : les tests encore à faire suivent.
CREATE OR REPLACE FUNCTION public.tg_coach_test_fiche_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach uuid := COALESCE(NEW.coach_id, OLD.coach_id);
  v_key   text := COALESCE(NEW.test_key, OLD.test_key);
BEGIN
  UPDATE public.test_sessions t
     SET doc_id = public.test_fiche_for(t.athlete_id, t.coach_id, t.type, t.title)
   WHERE COALESCE(t.completed, false) = false
     AND (t.coach_id = v_coach OR t.athlete_id IN (SELECT p.id FROM public.profiles p WHERE p.coach_id = v_coach))
     AND (
       (v_key = 'biometrie' AND t.type = 'biometric')
       OR (v_key <> 'biometrie' AND t.type IS DISTINCT FROM 'biometric'
           AND lower(t.title) = (SELECT lower(d.name) FROM public.test_definitions d WHERE d.id::text = v_key))
     );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_coach_test_fiche_changed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS coach_test_fiches_changed ON public.coach_test_fiches;
CREATE TRIGGER coach_test_fiches_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.coach_test_fiches
  FOR EACH ROW EXECUTE FUNCTION public.tg_coach_test_fiche_changed();
