-- Compétitions annulées : une compétition annulée reste visible (barrée), mais
-- sort des décomptes J-x, de la prochaine compétition, de la frise et de ce que
-- lit l'IA. Elle peut être rétablie.
--
-- Qui peut annuler / rétablir : les mêmes que pour modifier, rien ne change
-- (competitions_update : coach référent et co-coach via can_coach_athlete ;
-- competitions_update_athlete : l'athlète sur ses compétitions).
--
-- cancelled_at / cancelled_by sont posés par le serveur (trigger) : le client
-- écrit seulement cancelled_at non nul (annuler) ou nul (rétablir). La date
-- vient de now(), l'auteur de auth.uid() ; une compétition déjà annulée garde
-- sa date et son auteur d'origine.
--
-- Additive : le client en prod (main) ne lit pas ces colonnes, rien ne casse.

ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.competitions.cancelled_at IS
  'Annulée le (null = maintenue). Posé par le trigger competitions_stamp_cancel.';
COMMENT ON COLUMN public.competitions.cancelled_by IS
  'Qui a annulé (coach, co-coach ou athlète). Posé par le trigger, null si rétablie.';

CREATE OR REPLACE FUNCTION public.competitions_stamp_cancel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.cancelled_at IS NULL THEN
    NEW.cancelled_by := NULL;
  ELSIF TG_OP = 'INSERT' OR OLD.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
    NEW.cancelled_by := auth.uid();
  ELSE
    NEW.cancelled_at := OLD.cancelled_at;
    NEW.cancelled_by := OLD.cancelled_by;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.competitions_stamp_cancel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS competitions_stamp_cancel ON public.competitions;
CREATE TRIGGER competitions_stamp_cancel
  BEFORE INSERT OR UPDATE OF cancelled_at, cancelled_by ON public.competitions
  FOR EACH ROW EXECUTE FUNCTION public.competitions_stamp_cancel();
