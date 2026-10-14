-- Module Fiches : banque de documents (PDF / images) du coach, variantes,
-- fiches personnelles, ajouts athlète, attributions, commentaires.
-- Voir docs/FICHES_FEATURE.md.
-- Idempotente : IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS.
-- 2026-10-14

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Tables
-- ════════════════════════════════════════════════════════════════════════════

-- Fiches (banque, personnelles, ajouts athlète)
CREATE TABLE IF NOT EXISTS public.docs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, -- coach propriétaire (ajout athlète : son coach)
  athlete_id      uuid REFERENCES public.profiles(id) ON DELETE CASCADE,          -- NULL = banque ; sinon fiche perso / ajout athlète
  uploaded_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,          -- nullable : ON DELETE SET NULL
  origin_id       uuid REFERENCES public.docs(id) ON DELETE CASCADE,              -- NULL = fiche d'origine ; sinon variante
  variant_label   text,                                                           -- 'V2', 'Prog S5'… (NULL = « Originale »)
  variant_order   smallint NOT NULL DEFAULT 0,
  title           text NOT NULL,
  description     text,
  category        text NOT NULL DEFAULT 'autre'
                  CHECK (category IN ('mobilite','pacing','prevention','recuperation','nutrition','education','questionnaire','autre')),
  tags            text[] NOT NULL DEFAULT '{}',
  kind            text NOT NULL DEFAULT 'pdf' CHECK (kind IN ('pdf','image','questionnaire')),
  file_path       text,          -- chemin dans le bucket 'docs' (NULL seulement pour kind='questionnaire', V2)
  file_size       integer,       -- octets
  mime_type       text,
  is_self_service boolean NOT NULL DEFAULT false,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT docs_self_service_bank_only CHECK (NOT is_self_service OR athlete_id IS NULL),
  CONSTRAINT docs_file_required CHECK (kind = 'questionnaire' OR file_path IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_docs_coach    ON public.docs (coach_id);
CREATE INDEX IF NOT EXISTS idx_docs_athlete  ON public.docs (athlete_id);
CREATE INDEX IF NOT EXISTS idx_docs_origin   ON public.docs (origin_id);
CREATE INDEX IF NOT EXISTS idx_docs_category ON public.docs (category);
CREATE INDEX IF NOT EXISTS idx_docs_file_path ON public.docs (file_path);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'set_docs_updated_at'
      AND event_object_table = 'docs'
  ) THEN
    CREATE TRIGGER set_docs_updated_at
      BEFORE UPDATE ON public.docs
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Attributions (qui voit quoi). Jamais de copie de fichier : une ligne pointe vers la fiche.
CREATE TABLE IF NOT EXISTS public.doc_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id      uuid NOT NULL REFERENCES public.docs(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source      text NOT NULL CHECK (source IN ('manuel','programme','energie')),
  coach_note  text,
  seen_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doc_id, athlete_id, source)
);

CREATE INDEX IF NOT EXISTS idx_doc_assignments_athlete ON public.doc_assignments (athlete_id);
CREATE INDEX IF NOT EXISTS idx_doc_assignments_doc     ON public.doc_assignments (doc_id);

-- Commentaires sur une fiche, fil propre à un athlète
CREATE TABLE IF NOT EXISTS public.doc_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id     uuid NOT NULL REFERENCES public.docs(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body       text NOT NULL DEFAULT '',
  image_path text,  -- image compressée optionnelle dans le bucket 'docs'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_comments_thread ON public.doc_comments (doc_id, athlete_id, created_at);

-- Séances énergie : rattachements de fiches (FicheAttachment[])
ALTER TABLE public.energy_sessions ADD COLUMN IF NOT EXISTS fiches jsonb DEFAULT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Fonctions d'accès
-- ════════════════════════════════════════════════════════════════════════════

-- Coach de l'utilisateur courant (contourne la RLS profiles).
CREATE OR REPLACE FUNCTION public.my_coach_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT coach_id FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_coach_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_coach_id() TO authenticated;

-- Vrai si l'utilisateur courant peut lire la fiche.
CREATE OR REPLACE FUNCTION public.can_read_doc(doc_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
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
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_doc(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_doc(uuid) TO authenticated;

-- Vrai si l'utilisateur courant peut lire l'objet Storage (fichier de fiche ou image de commentaire).
-- Chemin image de commentaire : {coach_id}/athletes/{athlete_id}/comments/{comment_id}.webp
CREATE OR REPLACE FUNCTION public.can_read_doc_file(object_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
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
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = c.athlete_id AND p.coach_id = auth.uid())
        )
    );
$$;

REVOKE ALL ON FUNCTION public.can_read_doc_file(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_doc_file(text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. RLS
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.docs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_comments    ENABLE ROW LEVEL SECURITY;

-- ── docs ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "docs_select" ON public.docs;
CREATE POLICY "docs_select" ON public.docs
  FOR SELECT TO authenticated
  USING (public.can_read_doc(id));

DROP POLICY IF EXISTS "docs_coach_insert" ON public.docs;
CREATE POLICY "docs_coach_insert" ON public.docs
  FOR INSERT TO authenticated
  WITH CHECK (coach_id = auth.uid() AND uploaded_by = auth.uid());

DROP POLICY IF EXISTS "docs_coach_update" ON public.docs;
CREATE POLICY "docs_coach_update" ON public.docs
  FOR UPDATE TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

DROP POLICY IF EXISTS "docs_coach_delete" ON public.docs;
CREATE POLICY "docs_coach_delete" ON public.docs
  FOR DELETE TO authenticated
  USING (coach_id = auth.uid());

DROP POLICY IF EXISTS "docs_athlete_insert" ON public.docs;
CREATE POLICY "docs_athlete_insert" ON public.docs
  FOR INSERT TO authenticated
  WITH CHECK (
    athlete_id = auth.uid()
    AND uploaded_by = auth.uid()
    AND is_self_service = false
    AND origin_id IS NULL
    AND coach_id = public.my_coach_id()
  );

DROP POLICY IF EXISTS "docs_athlete_delete" ON public.docs;
CREATE POLICY "docs_athlete_delete" ON public.docs
  FOR DELETE TO authenticated
  USING (athlete_id = auth.uid() AND uploaded_by = auth.uid());

-- ── doc_assignments ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "doc_assignments_coach_all" ON public.doc_assignments;
CREATE POLICY "doc_assignments_coach_all" ON public.doc_assignments
  FOR ALL TO authenticated
  USING (public.is_coach_of(athlete_id))
  WITH CHECK (public.is_coach_of(athlete_id));

DROP POLICY IF EXISTS "doc_assignments_athlete_select" ON public.doc_assignments;
CREATE POLICY "doc_assignments_athlete_select" ON public.doc_assignments
  FOR SELECT TO authenticated
  USING (athlete_id = auth.uid());
-- Pas d'UPDATE athlète : seen_at passe par la RPC mark_doc_seen.

-- ── doc_comments ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "doc_comments_select" ON public.doc_comments;
CREATE POLICY "doc_comments_select" ON public.doc_comments
  FOR SELECT TO authenticated
  USING (athlete_id = auth.uid() OR public.is_coach_of(athlete_id));

DROP POLICY IF EXISTS "doc_comments_insert" ON public.doc_comments;
CREATE POLICY "doc_comments_insert" ON public.doc_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (athlete_id = auth.uid() OR public.is_coach_of(athlete_id))
    AND public.can_read_doc(doc_id)
  );

DROP POLICY IF EXISTS "doc_comments_delete_own" ON public.doc_comments;
CREATE POLICY "doc_comments_delete_own" ON public.doc_comments
  FOR DELETE TO authenticated
  USING (author_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RPC
-- ════════════════════════════════════════════════════════════════════════════

-- L'athlète marque une fiche comme vue (toutes ses attributions de cette fiche).
CREATE OR REPLACE FUNCTION public.mark_doc_seen(doc_uuid uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.doc_assignments
     SET seen_at = now()
   WHERE doc_id = doc_uuid
     AND athlete_id = auth.uid()
     AND seen_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.mark_doc_seen(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_doc_seen(uuid) TO authenticated;

-- Synchronise les attributions d'une source ('programme' | 'energie') avec la
-- liste des fiches référencées dans le JSON (asp:prog, overrides, energy_sessions.fiches).
-- Insère les manquantes, supprime celles de cette source qui ne sont plus
-- référencées. Ne touche jamais 'manuel'. Conserve seen_at des lignes gardées.
-- N'attribue que des fiches du coach appelant, et jamais la fiche personnelle
-- d'un autre athlète (ex. bloc de banque créé depuis la programmation d'un autre).
CREATE OR REPLACE FUNCTION public.sync_doc_assignments(p_athlete uuid, p_source text, p_doc_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_source NOT IN ('programme', 'energie') THEN
    RAISE EXCEPTION 'invalid source';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = p_athlete AND coach_id = auth.uid())
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
     AND d.coach_id = auth.uid()
     -- fiche de banque, ou fiche personnelle de CET athlète uniquement
     AND (d.athlete_id IS NULL OR d.athlete_id = p_athlete)
  ON CONFLICT (doc_id, athlete_id, source) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_doc_assignments(uuid, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_doc_assignments(uuid, text, uuid[]) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Storage : bucket privé 'docs'
-- ════════════════════════════════════════════════════════════════════════════
-- Chemins :
--   banque               {coach_id}/banque/{doc_id}.{ext}
--   perso / ajout athlète {coach_id}/athletes/{athlete_id}/{doc_id}.{ext}
--   image de commentaire  {coach_id}/athletes/{athlete_id}/comments/{comment_id}.webp

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'docs',
  'docs',
  false,
  10485760, -- 10 Mo
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "docs_storage_select" ON storage.objects;
CREATE POLICY "docs_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'docs' AND (
      public.can_read_doc_file(name)
      -- l'auteur d'un upload le voit toujours (nettoyage d'un orphelin, suppression)
      OR owner_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "docs_storage_insert" ON storage.objects;
CREATE POLICY "docs_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'docs' AND (
      -- coach : tout son dossier
      (storage.foldername(name))[1] = auth.uid()::text
      -- athlète : uniquement {son_coach}/athletes/{lui}/…
      OR (
        (storage.foldername(name))[1] = public.my_coach_id()::text
        AND (storage.foldername(name))[2] = 'athletes'
        AND (storage.foldername(name))[3] = auth.uid()::text
      )
    )
  );

DROP POLICY IF EXISTS "docs_storage_delete" ON storage.objects;
CREATE POLICY "docs_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'docs' AND (
      -- coach propriétaire du dossier
      (storage.foldername(name))[1] = auth.uid()::text
      -- athlète : ses propres dépôts dans son dossier (pas les fiches perso du coach)
      OR (
        (storage.foldername(name))[2] = 'athletes'
        AND (storage.foldername(name))[3] = auth.uid()::text
        AND (
          -- fichier non encore référencé (rollback d'un upload raté) ou ajout de l'athlète
          NOT EXISTS (SELECT 1 FROM public.docs d WHERE d.file_path = name)
          OR EXISTS (SELECT 1 FROM public.docs d WHERE d.file_path = name AND d.uploaded_by = auth.uid())
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.doc_comments c WHERE c.image_path = name AND c.author_id <> auth.uid()
        )
      )
    )
  );
