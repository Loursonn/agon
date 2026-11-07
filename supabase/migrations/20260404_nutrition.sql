-- =============================================================================
-- ⛔ NE PAS APPLIQUER — migration OBSOLÈTE, neutralisée le 2026-11-08 (lot 5).
--
-- Ces tables `nutrition_strategy` / `nutrition_daily_log` n'existent pas en
-- prod : la nutrition vit dans `app_data` (`asp:nutrition_strategy`,
-- `asp:nutrition_log`), écrite via src/api/nutrition.ts et la RPC
-- `nutrition_save_day` (20261108130000_nutrition_rpcs.sql). Ses policies
-- (`coach_id = auth.uid()` en dur) casseraient en plus le co-coach.
--
-- Le fichier garde son nom parce que la version 20260404 est inscrite dans
-- l'historique distant (`supabase_migrations.schema_migrations`) : le renommer
-- ferait apparaître une version « distante seulement » et pousserait à un
-- `migration repair`. Le contenu est mis en commentaire pour qu'un rejeu
-- (base neuve, `db reset`) ne crée rien. Ancien contenu, pour mémoire :
-- =============================================================================

/*
-- Migration : Module Alimentation
-- Tables : nutrition_strategy, nutrition_daily_log

CREATE TABLE IF NOT EXISTS public.nutrition_strategy (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  strategy             TEXT NOT NULL CHECK (strategy IN ('maintenance', 'seche', 'prise_de_masse')),
  can_track_calories   BOOLEAN NOT NULL DEFAULT false,
  total_calories_coach INTEGER,
  target_weight        DECIMAL(5,2),
  surplus_deficit_min  DECIMAL(5,2),
  surplus_deficit_max  DECIMAL(5,2),
  macros_glucides      INTEGER,
  macros_lipides       INTEGER,
  macros_proteines     INTEGER,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE (athlete_id)
);

CREATE TABLE IF NOT EXISTS public.nutrition_daily_log (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date                     DATE NOT NULL DEFAULT CURRENT_DATE,
  active_calories          INTEGER,
  total_calories_consumed  INTEGER,
  glucides_consumed        INTEGER,
  lipides_consumed         INTEGER,
  proteines_consumed       INTEGER,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now(),
  UNIQUE (athlete_id, date)
);

-- RLS
ALTER TABLE public.nutrition_strategy  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_daily_log ENABLE ROW LEVEL SECURITY;

-- nutrition_strategy : athlète lit sa propre stratégie
CREATE POLICY "nutrition_strategy_athlete_read" ON public.nutrition_strategy
  FOR SELECT USING (athlete_id = auth.uid());

-- nutrition_strategy : coach lit/écrit les stratégies de ses athlètes
CREATE POLICY "nutrition_strategy_coach_all" ON public.nutrition_strategy
  FOR ALL USING (
    coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = nutrition_strategy.athlete_id AND coach_id = auth.uid()
    )
  );

-- nutrition_daily_log : athlète lit/écrit ses propres logs
CREATE POLICY "nutrition_daily_log_self" ON public.nutrition_daily_log
  FOR ALL USING (athlete_id = auth.uid());

-- nutrition_daily_log : coach lit les logs de ses athlètes
CREATE POLICY "nutrition_daily_log_coach_read" ON public.nutrition_daily_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = nutrition_daily_log.athlete_id AND coach_id = auth.uid()
    )
  );

*/
