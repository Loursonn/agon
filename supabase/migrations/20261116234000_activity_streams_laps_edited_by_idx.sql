-- Index de la clé étrangère activity_streams.laps_edited_by (20261116223000) :
-- le test d'hygiène refuse toute FK sans index (suppression d'un profil = parcours
-- de la table entière sinon). Table de ~700 lignes : création instantanée.
CREATE INDEX IF NOT EXISTS activity_streams_laps_edited_by_idx
  ON public.activity_streams (laps_edited_by)
  WHERE laps_edited_by IS NOT NULL;
