/*
  Fiches posées sur un jour du planning (Staff V1).

  Un professionnel (fiches: write) pose une fiche de la banque du coach sur
  une ou plusieurs dates d'un athlète suivi : « mobilité genou » lun/mer/ven.
  L'athlète la voit ce jour-là dans son programme, le coach dans son planning.
  Le programme du coach (asp:prog) n'est jamais modifié.

  Domaine staff : `fiches`.
*/
BEGIN;

CREATE TABLE IF NOT EXISTS public.doc_schedule (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id     uuid NOT NULL REFERENCES public.docs(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date       date NOT NULL,
  added_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  note       text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doc_id, athlete_id, date)
);

CREATE INDEX IF NOT EXISTS doc_schedule_athlete_date_idx ON public.doc_schedule (athlete_id, date);

ALTER TABLE public.doc_schedule ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.doc_schedule TO authenticated;
REVOKE ALL ON public.doc_schedule FROM anon;

-- Lecture : l'athlète, son coach principal, et le staff qui voit ses fiches.
DROP POLICY IF EXISTS doc_schedule_select ON public.doc_schedule;
CREATE POLICY doc_schedule_select ON public.doc_schedule
  FOR SELECT TO authenticated
  USING (
    athlete_id = auth.uid()
    OR public.is_coach_of(athlete_id)
    OR public.staff_can(athlete_id, 'fiches', 'read')
  );

-- Ajout : le pro (fiches: write, fiche de la banque du coach de l'athlète) ou
-- le coach principal (ses propres fiches).
DROP POLICY IF EXISTS doc_schedule_insert ON public.doc_schedule;
CREATE POLICY doc_schedule_insert ON public.doc_schedule
  FOR INSERT TO authenticated
  WITH CHECK (
    added_by = auth.uid()
    AND (
      (public.staff_can(athlete_id, 'fiches', 'write') AND public.staff_doc_for_athlete(doc_id, athlete_id))
      OR (public.is_coach_of(athlete_id)
          AND EXISTS (SELECT 1 FROM public.docs d WHERE d.id = doc_id AND d.coach_id = auth.uid()))
    )
  );

-- Retrait : le pro qui l'a posée (ou celles du coach si « peut modifier mes
-- contenus »), et le coach principal. Pas de modification : on retire et on repose.
DROP POLICY IF EXISTS doc_schedule_delete ON public.doc_schedule;
CREATE POLICY doc_schedule_delete ON public.doc_schedule
  FOR DELETE TO authenticated
  USING (
    public.is_coach_of(athlete_id)
    OR public.staff_can_edit(athlete_id, 'fiches', added_by)
  );

-- Pose une fiche sur plusieurs dates et l'attribue à l'athlète (pour qu'il
-- puisse l'ouvrir). SECURITY INVOKER : les policies ci-dessus s'appliquent.
CREATE OR REPLACE FUNCTION public.schedule_doc(p_athlete uuid, p_doc uuid, p_dates date[], p_note text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_dates IS NULL OR array_length(p_dates, 1) IS NULL THEN
    RAISE EXCEPTION 'Choisis au moins un jour' USING ERRCODE = '22023';
  END IF;
  IF array_length(p_dates, 1) > 120 THEN
    RAISE EXCEPTION 'Trop de jours d''un coup (120 max)' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.doc_assignments (doc_id, athlete_id, assigned_by, source)
  VALUES (p_doc, p_athlete, auth.uid(), 'manuel')
  ON CONFLICT (doc_id, athlete_id, source) DO NOTHING;

  INSERT INTO public.doc_schedule (doc_id, athlete_id, date, added_by, note)
  SELECT p_doc, p_athlete, d, auth.uid(), NULLIF(btrim(p_note), '')
    FROM unnest(p_dates) AS d
  ON CONFLICT (doc_id, athlete_id, date) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_doc(uuid, uuid, date[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_doc(uuid, uuid, date[], text) TO authenticated;

COMMIT;
