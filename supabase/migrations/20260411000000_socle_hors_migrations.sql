-- =============================================================================
-- Socle : objets créés en prod hors migrations (éditeur SQL du dashboard),
-- dont les migrations suivantes ont besoin pour se rejouer dans l'ordre.
--
-- Décision 7, docs/PLAN_LEGACY.md §3 (R2) : sans ce fichier, le rejeu de
-- supabase/migrations/ sur une base vide échoue en cascade dès 20260412
-- (`profiles.is_admin`, puis `exercises`, `test_sessions`, `performance_logs`…).
--
-- Forme reprise de la prod (supabase/tests/ci/schema.sql), sans ce que les
-- migrations ajoutent elles-mêmes plus tard (target_2, garmin_*, index et
-- trigger de 20261113161000 et suivantes).
--
-- Sans effet sur la prod : tout est IF NOT EXISTS et y existe déjà. Ce fichier
-- n'y est jamais exécuté (`migration repair` le marquera appliqué, R3).
-- =============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.exercises (
  id            uuid DEFAULT gen_random_uuid() NOT NULL,
  name          text NOT NULL,
  category      text,
  target        text,
  secondary     text[],
  bloc          text,
  ex_type       text DEFAULT 'muscu'::text,
  tier          integer DEFAULT 3,
  youtube_id    text,
  image_url     text,
  pdf_url       text,
  created_at    timestamp with time zone DEFAULT now(),
  updated_at    timestamp with time zone DEFAULT now(),
  instructions  text,
  tips          text,
  equipment     text,
  difficulty    text,
  is_compound   boolean DEFAULT true,
  is_unilateral boolean DEFAULT false,
  gif_url       text,
  is_public     boolean DEFAULT true,
  is_verified   boolean DEFAULT false,
  created_by    uuid,
  CONSTRAINT exercises_pkey PRIMARY KEY (id),
  CONSTRAINT exercises_name_key UNIQUE (name),
  CONSTRAINT exercises_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS exercises_category_idx ON public.exercises USING btree (category);
CREATE INDEX IF NOT EXISTS exercises_name_idx ON public.exercises USING btree (name);
