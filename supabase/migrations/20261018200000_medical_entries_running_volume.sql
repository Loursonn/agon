-- Profil athlète refait :
--   1. Antécédents médicaux détaillés (une ligne par antécédent) + pièces
--      jointes (photos compressées / PDF) dans un bucket privé « medical ».
--      Athlète ET coach actuel peuvent créer / modifier.
--   2. Volume de course à pied : km réalisés saisis en fin de séance
--      (énergie / spécifique : type d'activité + distance ; muscu : km courus).

-- ── 1. Antécédents ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.medical_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'blessure'
              CHECK (kind IN ('blessure', 'operation', 'pathologie', 'autre')),
  title       text NOT NULL,
  zone        text,
  date        date,
  diagnosis   text,          -- diagnostic posé par le médecin
  treatment   text,          -- traitement / rééducation
  status      text NOT NULL DEFAULT 'gueri' CHECK (status IN ('gueri', 'en_cours')),
  notes       text,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_medical_entries_athlete ON public.medical_entries(athlete_id, date DESC);

DROP TRIGGER IF EXISTS set_medical_entries_updated_at ON public.medical_entries;
CREATE TRIGGER set_medical_entries_updated_at
  BEFORE UPDATE ON public.medical_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.medical_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    uuid NOT NULL REFERENCES public.medical_entries(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_path   text NOT NULL,   -- {athlete_id}/{entry_id}/{id}.{ext} dans le bucket « medical »
  file_name   text,
  mime_type   text NOT NULL,
  file_size   integer,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_medical_attachments_entry ON public.medical_attachments(entry_id);

ALTER TABLE public.medical_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS medical_entries_all ON public.medical_entries;
CREATE POLICY medical_entries_all ON public.medical_entries FOR ALL
  USING (athlete_id = auth.uid() OR public.is_coach_of(athlete_id))
  WITH CHECK (athlete_id = auth.uid() OR public.is_coach_of(athlete_id));

DROP POLICY IF EXISTS medical_attachments_all ON public.medical_attachments;
CREATE POLICY medical_attachments_all ON public.medical_attachments FOR ALL
  USING (athlete_id = auth.uid() OR public.is_coach_of(athlete_id))
  WITH CHECK (athlete_id = auth.uid() OR public.is_coach_of(athlete_id));

-- Allergies / traitements en cours restent sur medical_history : le coach peut
-- maintenant aussi les modifier.
DROP POLICY IF EXISTS coach_write_athlete_medical ON public.medical_history;
CREATE POLICY coach_write_athlete_medical ON public.medical_history FOR ALL
  USING (public.is_coach_of(athlete_id))
  WITH CHECK (public.is_coach_of(athlete_id));

-- Reprise des anciennes listes (opérations / blessures passées)
INSERT INTO public.medical_entries (athlete_id, kind, title, zone, date, notes, created_by)
SELECT mh.athlete_id, 'operation',
       COALESCE(NULLIF(s->>'zone', ''), 'Opération'),
       NULLIF(s->>'zone', ''),
       CASE WHEN s->>'date' ~ '^\d{4}-\d{2}-\d{2}$' THEN (s->>'date')::date END,
       NULLIF(concat_ws(' — ', CASE WHEN s->>'date' !~ '^\d{4}-\d{2}-\d{2}$' THEN NULLIF(s->>'date', '') END, NULLIF(s->>'details', '')), ''),
       mh.athlete_id
FROM public.medical_history mh, jsonb_array_elements(COALESCE(mh.surgeries, '[]'::jsonb)) s
WHERE NOT EXISTS (SELECT 1 FROM public.medical_entries e WHERE e.athlete_id = mh.athlete_id);

INSERT INTO public.medical_entries (athlete_id, kind, title, zone, date, notes, created_by)
SELECT mh.athlete_id, 'blessure',
       COALESCE(NULLIF(i->>'type', ''), NULLIF(i->>'zone', ''), 'Blessure'),
       NULLIF(i->>'zone', ''),
       CASE WHEN i->>'date' ~ '^\d{4}-\d{2}-\d{2}$' THEN (i->>'date')::date END,
       NULLIF(concat_ws(' — ', CASE WHEN i->>'date' !~ '^\d{4}-\d{2}-\d{2}$' THEN NULLIF(i->>'date', '') END, NULLIF(i->>'details', '')), ''),
       mh.athlete_id
FROM public.medical_history mh, jsonb_array_elements(COALESCE(mh.past_injuries, '[]'::jsonb)) i
WHERE NOT EXISTS (SELECT 1 FROM public.medical_entries e WHERE e.athlete_id = mh.athlete_id AND e.kind = 'blessure');

INSERT INTO public.medical_entries (athlete_id, kind, title, notes, created_by)
SELECT athlete_id, 'pathologie', 'Pathologies', conditions, athlete_id
FROM public.medical_history
WHERE COALESCE(conditions, '') <> ''
  AND NOT EXISTS (SELECT 1 FROM public.medical_entries e WHERE e.athlete_id = medical_history.athlete_id AND e.kind = 'pathologie');

-- Bucket privé : {athlete_id}/...
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('medical', 'medical', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS medical_storage_all ON storage.objects;
CREATE POLICY medical_storage_all ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'medical' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_coach_of(((storage.foldername(name))[1])::uuid)
    )
  )
  WITH CHECK (
    bucket_id = 'medical' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_coach_of(((storage.foldername(name))[1])::uuid)
    )
  );

-- ── 2. Volume de course ─────────────────────────────────────────────────────

ALTER TABLE public.energy_session_assignments
  ADD COLUMN IF NOT EXISTS activity_type text
    CHECK (activity_type IN ('course', 'velo', 'rameur', 'natation', 'autre')),
  ADD COLUMN IF NOT EXISTS distance_km numeric(6,2)
    CHECK (distance_km IS NULL OR distance_km >= 0);

ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS run_distance_km numeric(6,2)
    CHECK (run_distance_km IS NULL OR run_distance_km >= 0);

COMMENT ON COLUMN public.energy_session_assignments.activity_type IS 'Activité réellement faite (saisie athlète en fin de séance)';
COMMENT ON COLUMN public.energy_session_assignments.distance_km  IS 'Distance réalisée (km) — compte dans le volume de course si activity_type = course';
COMMENT ON COLUMN public.workout_logs.run_distance_km           IS 'Km courus pendant une séance de muscu (échauffement, finisher…)';
