-- Nature du thème du jour : d'où il tire son sens (raccourci d'intensité,
-- raccourci de dominante, ou texte libre du coach).
--
-- Colonne GÉNÉRÉE, pas saisie : l'information existe déjà dans label /
-- intensity / dominante. Une quatrième colonne écrite à la main finirait par
-- diverger du contenu réel le jour où une écriture oublierait de la mettre à
-- jour. Postgres la recalcule à chaque écriture, elle ne peut pas mentir.
--
-- La règle de priorité est la même que dayThemeKind() et dayThemeChipLabel()
-- côté client : le libellé tapé par le coach l'emporte, puisque c'est lui que
-- l'athlète lit sur la pastille.
ALTER TABLE public.day_themes
  ADD COLUMN IF NOT EXISTS kind text
  GENERATED ALWAYS AS (
    CASE
      WHEN label IS NOT NULL AND btrim(label) <> '' THEN 'libre'
      WHEN dominante IS NOT NULL THEN 'dominante'
      WHEN intensity IS NOT NULL THEN 'intensite'
      ELSE NULL
    END
  ) STORED;

COMMENT ON COLUMN public.day_themes.kind IS
  'Nature du thème (intensite | dominante | libre), dérivée de label/intensity/dominante. Lecture seule : miroir SQL de dayThemeKind() dans src/lib/dayTheme.ts.';
