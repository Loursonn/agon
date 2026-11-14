-- ─── Roadmap produit (coaches certifiés) ─────────────────────────────────────
-- Flag sur profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_certified_coach BOOLEAN NOT NULL DEFAULT false;

-- Phases de la roadmap
CREATE TABLE IF NOT EXISTS public.roadmap_phases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  quarter      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'planned'
                 CHECK (status IN ('planned','in_progress','shipped')),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Items de roadmap
CREATE TABLE IF NOT EXISTS public.roadmap_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id     UUID REFERENCES public.roadmap_phases(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  category     TEXT NOT NULL DEFAULT 'coach'
                 CHECK (category IN ('coach','athlete','planning','nutrition','infra','ux')),
  priority     TEXT NOT NULL DEFAULT 'P2'
                 CHECK (priority IN ('P0','P1','P2','P3')),
  status       TEXT NOT NULL DEFAULT 'idea'
                 CHECK (status IN ('idea','backlog','planned','in_progress','shipped')),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Votes sur les items
CREATE TABLE IF NOT EXISTS public.roadmap_votes (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id   UUID NOT NULL REFERENCES public.roadmap_items(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  UNIQUE (item_id, user_id)
);

-- Triggers updated_at
CREATE TRIGGER set_roadmap_phases_updated_at
  BEFORE UPDATE ON public.roadmap_phases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_roadmap_items_updated_at
  BEFORE UPDATE ON public.roadmap_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.roadmap_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_votes  ENABLE ROW LEVEL SECURITY;

-- Lecture : is_certified_coach OU is_admin
CREATE POLICY "roadmap_phases_select" ON public.roadmap_phases FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.is_certified_coach = true OR p.is_admin = true)
    )
  );

CREATE POLICY "roadmap_items_select" ON public.roadmap_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.is_certified_coach = true OR p.is_admin = true)
    )
  );

CREATE POLICY "roadmap_votes_select" ON public.roadmap_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.is_certified_coach = true OR p.is_admin = true)
    )
  );

-- Écriture phases : admin uniquement
CREATE POLICY "roadmap_phases_write" ON public.roadmap_phases
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- Écriture items : admin (toutes opérations)
CREATE POLICY "roadmap_items_admin_write" ON public.roadmap_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- Écriture items : coach certifié (INSERT uniquement, status forcé à 'idea')
CREATE POLICY "roadmap_items_coach_suggest" ON public.roadmap_items
  FOR INSERT WITH CHECK (
    status = 'idea'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_certified_coach = true
    )
  );

-- Votes : coach certifié ou admin
CREATE POLICY "roadmap_votes_write" ON public.roadmap_votes
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.is_certified_coach = true OR p.is_admin = true)
    )
  );
