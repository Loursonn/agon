-- ════════════════════════════════════════════════════════════════════════════
-- Double coach : un coach-athlète peut être co-coach de lui-même — 2026-11-02
--
-- Cas : un coach-athlète suivi par un autre coach (profiles.coach_id = ce coach)
-- veut programmer son propre entraînement EN DUO avec lui. Il devient co-coach
-- de lui-même : le coach externe reste référent, les deux ont les mêmes droits.
--
-- Seul l'athlète lui-même peut s'ajouter (pas son coach référent à sa place),
-- et seulement s'il a un compte coach (role coach / coach_athlete : garanti par
-- la recherche du code coach).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.athlete_co_coaches DROP CONSTRAINT IF EXISTS athlete_co_coaches_check;

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
  -- Se co-coacher soi-même : uniquement à sa propre demande
  IF v_coach.id = p_athlete AND v_role <> 'athlete' THEN
    RAISE EXCEPTION 'Seul l''athlète peut se déclarer co-coach de lui-même' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.athlete_co_coaches WHERE athlete_id = p_athlete) THEN
    RAISE EXCEPTION 'L''athlète a déjà deux coachs' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.athlete_co_coaches (athlete_id, co_coach_id, added_by, added_by_role)
  VALUES (p_athlete, v_coach.id, auth.uid(), v_role);

  RETURN jsonb_build_object('co_coach_id', v_coach.id, 'full_name', v_coach.full_name);
END;
$$;
