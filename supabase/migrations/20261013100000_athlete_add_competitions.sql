-- Allow athletes to insert their own competitions
CREATE POLICY "competitions_insert_athlete" ON competitions FOR INSERT
  WITH CHECK (athlete_id = auth.uid());

-- Allow athletes to delete their own competitions
CREATE POLICY "competitions_delete_athlete" ON competitions FOR DELETE
  USING (athlete_id = auth.uid());
