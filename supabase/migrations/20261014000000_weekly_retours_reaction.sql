-- Athlete reaction to a coach weekly retour.
-- A reaction means "seen": the retour leaves the athlete home page and stays
-- available in the profile drawer. The coach sees the reaction in Retours.
ALTER TABLE public.weekly_retours
  ADD COLUMN IF NOT EXISTS athlete_reaction text,
  ADD COLUMN IF NOT EXISTS reacted_at timestamptz;

-- Athletes only have SELECT on weekly_retours (RLS): they react through this
-- function, which can only touch the reaction of their own retours.
CREATE OR REPLACE FUNCTION public.react_weekly_retour(p_retour_id uuid, p_reaction text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_reaction IS NULL OR p_reaction NOT IN ('like', 'strong', 'fire', 'heart') THEN
    RAISE EXCEPTION 'invalid reaction';
  END IF;

  UPDATE public.weekly_retours
     SET athlete_reaction = p_reaction,
         reacted_at       = now()
   WHERE id = p_retour_id
     AND athlete_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'retour not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.react_weekly_retour(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.react_weekly_retour(uuid, text) TO authenticated;
