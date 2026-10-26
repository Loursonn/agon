-- « Thème du jour » : l'intention que le coach pose sur une date.
--
-- Un thème par athlète et par jour (UNIQUE), écrit par le coach, lu par
-- l'athlète. Tout le contenu est facultatif : la contrainte ne force rien,
-- c'est l'app qui masque un thème sans texte ni code.
CREATE TABLE IF NOT EXISTS public.day_themes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date        date NOT NULL,
  label       text NOT NULL DEFAULT '',
  intensity   text,
  dominante   text,
  color       text NOT NULL DEFAULT '#3b82f6',
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, date),
  -- Au-delà de 40 caractères le libellé ne tient dans aucune case de
  -- calendrier : on refuse en base plutôt que de tronquer à l'affichage.
  CONSTRAINT day_themes_label_len CHECK (char_length(label) <= 40),
  CONSTRAINT day_themes_note_len  CHECK (char_length(note)  <= 500),
  CONSTRAINT day_themes_intensity_chk CHECK (
    intensity IS NULL OR intensity IN ('hard', 'moyen', 'easy', 'recup_active', 'repos')
  ),
  CONSTRAINT day_themes_dominante_chk CHECK (
    dominante IS NULL OR dominante IN (
      'force', 'puissance_vitesse', 'volume', 'aerobie',
      'seuil', 'hyrox', 'technique', 'mixte'
    )
  ),
  -- Forme canonique `#rrggbb` en minuscules, la même que normalizeHexColor()
  -- côté client. Sans ça une couleur `#ABC` casserait le calcul de contraste.
  CONSTRAINT day_themes_color_chk CHECK (color ~ '^#[0-9a-f]{6}$')
);

-- Les vues calendrier chargent toujours une fenêtre de dates pour un athlète.
CREATE INDEX IF NOT EXISTS day_themes_athlete_date_idx
  ON public.day_themes (athlete_id, date);

DROP TRIGGER IF EXISTS set_day_themes_updated_at ON public.day_themes;
CREATE TRIGGER set_day_themes_updated_at
  BEFORE UPDATE ON public.day_themes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.day_themes ENABLE ROW LEVEL SECURITY;

-- Le coach lit et écrit les thèmes de ses athlètes.
DROP POLICY IF EXISTS "dt_coach_all" ON public.day_themes;
CREATE POLICY "dt_coach_all" ON public.day_themes
  FOR ALL TO authenticated
  USING (coach_id = auth.uid() OR public.is_coach_of(athlete_id))
  WITH CHECK (coach_id = auth.uid());

-- L'athlète lit les siens, et seulement en lecture : un thème est une
-- consigne, pas une négociation.
DROP POLICY IF EXISTS "dt_athlete_select" ON public.day_themes;
CREATE POLICY "dt_athlete_select" ON public.day_themes
  FOR SELECT TO authenticated
  USING (athlete_id = auth.uid());
