-- Nouveautés de l'app (vue coach) : qui a vu quelle mise à jour.
-- Le contenu des nouveautés vit dans le code (src/data/releaseNotes.ts) ;
-- la base ne stocke que les accusés de lecture.
-- Idempotente. 2026-10-14

CREATE TABLE IF NOT EXISTS public.app_update_reads (
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  update_id text NOT NULL,
  seen_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, update_id)
);

ALTER TABLE public.app_update_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_update_reads_own_select" ON public.app_update_reads;
CREATE POLICY "app_update_reads_own_select" ON public.app_update_reads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "app_update_reads_own_insert" ON public.app_update_reads;
CREATE POLICY "app_update_reads_own_insert" ON public.app_update_reads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Suivi admin : lectures de tous les coachs (nom + date) et nombre total de coachs.
CREATE OR REPLACE FUNCTION public.get_app_update_reads()
RETURNS TABLE (update_id text, user_id uuid, full_name text, seen_at timestamptz, total_coaches bigint)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  RETURN QUERY
    SELECT r.update_id, r.user_id, p.full_name, r.seen_at,
           (SELECT count(*) FROM public.profiles WHERE role IN ('coach', 'coach_athlete'))
      FROM public.app_update_reads r
      JOIN public.profiles p ON p.id = r.user_id
     WHERE p.role IN ('coach', 'coach_athlete')
     ORDER BY r.seen_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_app_update_reads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_app_update_reads() TO authenticated;

-- Rollback :
-- DROP FUNCTION IF EXISTS public.get_app_update_reads();
-- DROP TABLE IF EXISTS public.app_update_reads;
