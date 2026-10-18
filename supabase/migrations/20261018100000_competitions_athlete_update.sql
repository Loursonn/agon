-- Bilan de compétition : l'athlète peut enregistrer son retour (athlete_comment).
--
-- Avant : seul le coach (coach_id = auth.uid(), puis can_coach_athlete) avait
-- l'UPDATE sur competitions. Pour une compétition créée par le coach, l'update
-- de l'athlète ne touchait aucune ligne → « Erreur lors de l'enregistrement ».
-- Même périmètre que competitions_insert_athlete / competitions_delete_athlete.
DROP POLICY IF EXISTS competitions_update_athlete ON public.competitions;
CREATE POLICY competitions_update_athlete ON public.competitions FOR UPDATE
  USING (athlete_id = auth.uid())
  WITH CHECK (athlete_id = auth.uid());
