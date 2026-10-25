# Prompt — Module HYROX pour Agon

> À coller tel quel dans l'agent de code (Visual Studio Code / Copilot / Claude / Cursor) ouvert sur le repo `agon`.
> Il contient : le contexte, les contraintes du repo, le schéma SQL complet, les types, les hooks, les pages, les calculs (formules), les données de référence à seeder, les tests unitaires, la doc à écrire, et la checklist de recette.

---

## 0. Ta mission

Tu es un développeur senior React / TypeScript / Supabase. Tu travailles dans le repo **Agon** (app de suivi d'athlètes, coach + athlète). Tu dois implémenter un **module HYROX** complet, activable athlète par athlète, en respectant strictement les conventions du repo. Tu livres du code fini, typé, testé, documenté. Aucune retouche ne doit être nécessaire derrière toi.

Règle absolue du repo (voir `CLAUDE.md`) : **ne modifie rien tant que tu n'as pas 95 % de confiance** sur ce qu'il faut construire. Ce prompt est écrit pour te donner cette confiance. Si une information te manque vraiment, lis d'abord les fichiers cités ci-dessous ; ne pose une question qu'en dernier recours, et pose-la avant de commencer à coder, pas au milieu.

Ce qu'est un HYROX : une course indoor standardisée. 8 fois de suite : 1 km de course puis une station. Ordre fixe : SkiErg 1000 m · Sled push 50 m · Sled pull 50 m · Burpee broad jump 80 m · Rameur 1000 m · Farmers carry 200 m · Sandbag lunges 100 m · Wall balls 100 reps. Entre la course et chaque station, l'athlète traverse la **Roxzone** (transition chronométrée). Un résultat officiel donne donc **17 segments** : 8 runs, 8 stations, Roxzone (total, parfois par transition), plus le temps total, la division, le groupe d'âge et les rangs. Toujours écrire « un HYROX » (masculin).

---

## 1. Avant de coder : lis ces fichiers

Le repo a deux jeux de docs. **`docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/FEATURES.md` et une partie de `CLAUDE.md` décrivent l'ancien monolithe `WeightliftingTracker.jsx` : ignore-les pour l'architecture.** La référence à jour est :

- `CONTRIBUTING.md` — conventions (skeletons, toasts sonner, mutations optimistes, EmptyState, StatusPill, tokens `C` de `@/lib/theme`, hooks React Query uniquement, `.tsx`, alias `@/`).
- `docs/ENERGY_FEATURE.md` — modèle de doc de module (tables, JSONB, RLS, hooks, composants, routes, flux). Tu écriras `docs/HYROX_FEATURE.md` sur ce modèle.
- `src/App.tsx` — toutes les routes (React Router v6, pages lazy).
- `src/features/coach/components/ContextBar.tsx` — onglets coach par athlète (`TABS`, `SUB_TABS` pilotés par `?view=`). C'est ici que l'onglet HYROX coach s'ajoute.
- `src/features/athlete/AthleteLayout.tsx` — barre basse athlète (`ATH_TABS`, 5 entrées `{k, l, icon}`). C'est ici que l'onglet HYROX athlète s'ajoute.
- `src/features/coach/pages/AthleteViewPage.tsx` — aperçu « Vue athlète » côté coach (`INNER_TABS`), à compléter aussi.
- `src/pages/coach/CoachAthleteArea.tsx`, `src/features/coach/context/SelectedAthleteContext.tsx`, `src/features/shared/context/AthleteContext.tsx` — contexte athlète (`selectedAthlete: Profile`, `athleteProfile`, `athleteId`, `viewOnly`).
- `src/hooks/useAuth.tsx` — interface `Profile`, `fetchProfile` / `fetchAthletes` (`select("*")`), `updateAthleteProfile(athleteId, fields)` (liste de champs typée en dur, à étendre).
- `src/components/coach/AthleteProfileForm.tsx` — formulaire coach de profil (onglet « profil », `handleSaveProfile`).
- `src/features/coach/components/donnees/ProfilGeneralTab.tsx` — affichage Profil Général, section « Tracker d'habitudes » (lignes ~337-357) : **c'est le modèle exact du toggle à reproduire pour HYROX**.
- `src/features/shared/hooks/useHabits.ts` — comment le flag `habit_tracker_enabled` est lu et basculé.
- `src/lib/queryKeys.ts` — fabrique `QK`, à compléter.
- `src/features/shared/types/tests.ts`, `src/features/shared/hooks/tests/useAthleteTests.ts`, `src/features/shared/hooks/tests/useTestDefinitions.ts`, `src/features/athlete/components/TestFillDrawer.tsx` (parse mm:ss), `src/features/coach/pages/TestPage.tsx` (`buildSeries`, `MetricRow`) — système de tests existant, à réutiliser pour les tests HYROX.
- `src/hooks/useCompetitions.ts`, `src/types/planning.ts` (`Competition`) — compétitions existantes (sans résultat).
- `supabase/migrations/20260430100000_test_definitions.sql`, `20260512000000_test_presets_categories.sql`, `20260515000000_test_fill_mode.sql` — tables de tests et pattern de seed avec IDs fixes.
- `supabase/migrations/20260427120300_rls_corrections.sql` — helper `public.is_coach_of(uuid)`.
- `supabase/migrations/20260430200000_certified_coach.sql` — trigger `prevent_flag_self_update` sur `profiles`.
- `supabase/migrations/20260415_habits.sql` — pattern « flag sur profiles + tables ».
- `src/lib/theme.ts` — palette `C` (fond `bg`, surfaces `s1`/`s2`, bordures `brd`/`brdL`, textes `tx`/`tx2`/`tx3`, accent `ac` or, sémantiques `g`/`o`/`r`/`b`, étendues `pat`/`ame`).
- `src/components/ui/chart.tsx` — wrapper shadcn de Recharts (présent, non utilisé). Recharts `^2.15.4` est installé. Il n'existe **aucun** `RadarChart` dans l'app : tu seras le premier.
- `src/lib/__tests__/date.test.ts` — style des tests Vitest (`npm test`).

Note : `src/integrations/supabase/types.ts` est périmé (il manque plusieurs tables récentes). Les hooks récents contournent avec `const db = supabase as any` (voir `useCompetitions.ts`). Fais pareil pour les nouvelles tables, avec le commentaire eslint, **et** ajoute les types manuellement dans `src/features/shared/types/hyrox.ts`.

---

## 2. Périmètre et découpage

Trois phases, dans cet ordre. **Une phase = un commit** (ou une petite série de commits) qui compile, passe `npm run lint`, `npm test` et `npm run build`. Ne commence pas la phase suivante tant que la précédente n'est pas verte.

| Phase | Contenu |
|---|---|
| **P1 — Socle et courses** | Migration SQL complète (flag, tables, RLS, seeds). Flag « athlète HYROX » (coach). Onglet HYROX coach + athlète + aperçu. Sous-vue **Courses** : liste, formulaire de saisie des 17 segments, fiche de course avec calculs, comparaison de deux courses. Sous-vue **Runs et Roxzone**. Sous-vue **Stations**. Sous-vue **Radar**. Doc `HYROX_FEATURE.md`. Tests unitaires des calculs. |
| **P2 — Tests HYROX** | Catégorie de test `hyrox`, 10 définitions de tests pré-remplies (seed SQL). Sous-vue **Tests** : batterie, historique, comparaison test ↔ course, radar de capacités. |
| **P3 — Plan de course** | Table `hyrox_race_plans`. Sous-vue **Plan de course** : génération depuis un objectif, édition, plan vs réalisé, estimation en fourchette, journal prédit / réel. |

Hors périmètre (ne pas faire) : import automatique depuis results.hyrox.com, synchro montre, score gamifié, notifications, mode double/relais détaillé (on stocke la division, on ne modélise pas le partage des stations).

---

## 3. Git

```bash
git fetch origin
git checkout dev
git reset --hard origin/dev
git checkout -b feat/hyrox-module
npm install
npm run dev   # vérifier que l'app charge sans erreur console avant de coder
```

- Commits en français, format `type(scope): message` (ex. `feat(hyrox): migration, flag profil et onglet`). Termine chaque message de commit par la ligne `Co-Authored-By:` de ton outil si elle est attendue par le repo.
- Jamais de commit de `.claude/settings.local.json`. Jamais de `--force`.
- Fin de travail : PR `feat/hyrox-module` → `dev` avec un résumé et une checklist de test (modèle dans `CLAUDE.md`, section PULL REQUEST).

---

## 4. Base de données — migration `supabase/migrations/20261013000000_hyrox_module.sql`

Idempotente (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `ON CONFLICT DO NOTHING`), en-tête de commentaire en français, comme les migrations existantes. Contenu exact attendu :

### 4.1 Flag sur `profiles`

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_hyrox_athlete boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.profiles.is_hyrox_athlete IS
  'Active l''onglet HYROX pour cet athlète. Modifiable par son coach ou un admin, pas par l''athlète lui-même.';
```

Protection : nouveau trigger `trg_prevent_hyrox_flag_update` (fonction `public.prevent_hyrox_flag_self_update()`, `SECURITY DEFINER`, `SET search_path = public`, même style que `prevent_flag_self_update`). Si `NEW.is_hyrox_athlete IS DISTINCT FROM OLD.is_hyrox_athlete` et `auth.uid() IS NOT NULL`, autoriser seulement si : `auth.uid() = OLD.coach_id` **ou** `auth.uid()` est admin **ou** (`auth.uid() = OLD.id` et le rôle de ce profil est `coach` ou `coach_athlete`, cas du coach qui se suit lui-même). Sinon `RAISE EXCEPTION 'Forbidden: only the athlete''s coach can change is_hyrox_athlete'`. Ne touche pas au trigger existant.

### 4.2 Table `hyrox_results` (une ligne = une course ou une simulation)

```sql
CREATE TABLE IF NOT EXISTS public.hyrox_results (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  competition_id   uuid REFERENCES public.competitions(id) ON DELETE SET NULL,
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  date             date NOT NULL,
  event_name       text NOT NULL,                 -- ex. "HYROX Bordeaux"
  venue            text,                          -- ville / salle (sert au filtre "même lieu")
  format           text NOT NULL DEFAULT 'solo'
                   CHECK (format IN ('solo','doubles','relay','sim_full','sim_34','sim_half')),
  division         text NOT NULL
                   CHECK (division IN ('women','women_pro','men','men_pro',
                                       'doubles_women','doubles_men','doubles_mixed',
                                       'doubles_women_pro','doubles_men_pro',
                                       'relay_women','relay_men','relay_mixed','adaptive')),
  age_group        text,                          -- ex. "30-34"
  is_official      boolean NOT NULL DEFAULT true, -- false pour les simulations
  status           text NOT NULL DEFAULT 'finished'
                   CHECK (status IN ('finished','dnf','dns','dq')),
  total_s          integer NOT NULL CHECK (total_s > 0),
  run_1_s integer, run_2_s integer, run_3_s integer, run_4_s integer,
  run_5_s integer, run_6_s integer, run_7_s integer, run_8_s integer,
  ski_s integer, sled_push_s integer, sled_pull_s integer, bbj_s integer,
  row_s integer, farmers_s integer, lunges_s integer, wall_balls_s integer,
  roxzone_total_s  integer,                       -- null → calculé = total - runs - stations
  roxzone_splits   jsonb,                         -- [s1..s8] ou null
  penalties_s      integer NOT NULL DEFAULT 0,
  penalties_note   text,
  rank_overall     integer,
  rank_age_group   integer,
  participants_overall   integer,
  participants_age_group integer,
  activity_url     text,
  athlete_comment  text,
  coach_comment    text,
  source           text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hyrox_results_athlete_date ON public.hyrox_results(athlete_id, date DESC);
```

Trigger `updated_at` : réutilise `public.set_updated_at()` si elle existe (grep les migrations), sinon crée-la.

RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) :
- `hr_select` : `athlete_id = auth.uid() OR public.is_coach_of(athlete_id) OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin)`.
- `hr_insert` : `WITH CHECK` même condition (l'athlète peut saisir sa course, le coach aussi).
- `hr_update` : `USING` même condition.
- `hr_delete` : `USING (public.is_coach_of(athlete_id) OR athlete_id = auth.uid() OR admin)`.

### 4.3 Table `hyrox_reference_segments` (références statistiques)

```sql
CREATE TABLE IF NOT EXISTS public.hyrox_reference_segments (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division  text NOT NULL,       -- 'men','women','men_pro','women_pro' (+ 'all')
  bracket   text NOT NULL DEFAULT 'all',  -- 'all','sub70','70_80','80_90','90_plus'
  segment   text NOT NULL,       -- 'total','run_total','run_1'..'run_8','ski','sled_push','sled_pull','bbj','row','farmers','lunges','wall_balls','roxzone_total'
  p10_s     integer,             -- temps du top 10 % (null si inconnu)
  p50_s     integer NOT NULL,    -- médiane
  p90_s     integer,             -- temps des 10 % les plus lents (null si inconnu)
  source    text NOT NULL,       -- 'RoxHype 25/26', 'HYROX Data Lab S7-S8', 'estimé'
  is_estimate boolean NOT NULL DEFAULT false,
  UNIQUE (division, bracket, segment)
);
```

RLS : select pour tout utilisateur authentifié ; insert/update/delete admin uniquement. Les seeds sont dans la migration (section 4.6).

### 4.4 Table `hyrox_race_plans` (phase 3, mais crée-la dès la migration)

```sql
CREATE TABLE IF NOT EXISTS public.hyrox_race_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  competition_id   uuid REFERENCES public.competitions(id) ON DELETE SET NULL,
  result_id        uuid REFERENCES public.hyrox_results(id) ON DELETE SET NULL, -- le réalisé, lié après la course
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name             text NOT NULL,
  division         text NOT NULL,
  profile          text NOT NULL DEFAULT 'hybrid' CHECK (profile IN ('runner','hybrid','powerhouse')),
  target_total_s   integer NOT NULL CHECK (target_total_s > 0),
  targets          jsonb NOT NULL,   -- { run_1..run_8, ski, sled_push, ..., wall_balls, roxzone_per_transition } en secondes
  predicted_total_s integer,         -- estimation calculée (fourchette basse) au moment de la création
  predicted_high_s  integer,         -- fourchette haute
  predicted_from    jsonb,           -- entrées utilisées pour l'estimation (tests, dernière course)
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
```

RLS : même pattern que `hyrox_results`.

### 4.5 Tests HYROX (catégorie + 10 définitions globales)

`test_definitions.category` est un `text` sans contrainte CHECK : ajoute simplement la valeur `'hyrox'`. Seed avec IDs fixes (préfixe `00000000-0000-0000-0000-0000000000c0`), `kind = 'preset'`, `is_global = true`, `fill_mode = 'self'`, `protocol = jsonb_build_object('text', …)`. Variables (`test_variables`) avec `value_type` et `better_when` :

| ID | Nom | Variables (key · label · unit · value_type · better_when) | Protocole (texte) |
|---|---|---|---|
| `…c001` | 5 km course | `time` · Temps · s · `duration` · lower | Parcours plat mesuré ou tapis 1 %. Départ frais, à fond. |
| `…c002` | SkiErg 1000 m | `time` · Temps · s · `duration` · lower | Damper 5-6. Départ arrêté, 1000 m à fond. Noter le temps affiché. |
| `…c003` | Rameur 1000 m | `time` · Temps · s · `duration` · lower | Damper 5-6, cale-pieds 4. 1000 m à fond. |
| `…c004` | 100 wall balls | `time` · Temps · s · `duration` · lower ; `load_kg` · Charge · kg · `number` · higher | Charge et cible de sa division (H 6 kg / 3 m, F 4 kg / 2,70 m, Men Pro 9 kg). 100 reps pour le temps, pauses comprises. |
| `…c005` | Burpee broad jump 80 m | `time` · Temps · s · `duration` · lower ; `reps` · Sauts · n · `number` · lower | 80 m au standard compétition (pieds écartés de 5 cm max, mains à 30 cm max des orteils). Compter les sauts. |
| `…c006` | Farmers carry 200 m | `time` · Temps · s · `duration` · lower ; `load_kg` · Charge par main · kg · `number` · higher | 200 m avec les kettlebells de sa division (2 × 24 H, 2 × 16 F, 2 × 32 Men Pro). Poses autorisées, chrono qui tourne. |
| `…c007` | Sled push 50 m | `time` · Temps · s · `duration` · lower ; `load_kg` · Charge sled comprise · kg · `number` · higher | 4 × 12,5 m, charge de division (152 kg H / 102 F / 202 Men Pro). Noter la surface. |
| `…c008` | Sled pull 50 m | `time` · Temps · s · `duration` · lower ; `load_kg` · Charge sled comprise · kg · `number` · higher | 4 × 12,5 m, charge de division (103 kg H / 78 F / 153 Men Pro). |
| `…c009` | Sandbag lunges 100 m | `time` · Temps · s · `duration` · lower ; `load_kg` · Charge · kg · `number` · higher | 100 m, sac sur les épaules, genou arrière au sol à chaque fente. |
| `…c00a` | Course compromise (1 km · 100 WB · 1 km) | `run_1` · Run 1 (frais) · s · `duration` · lower ; `wb` · 100 wall balls · s · `duration` · lower ; `run_2` · Run 2 (après WB) · s · `duration` · lower | 1 km à l'allure de course visée, enchaîner 100 wall balls, enchaîner 1 km à la même intention. Aucun repos. La dégradation = (run 2 − run 1) / run 1. |

### 4.6 Seeds de `hyrox_reference_segments`

Toutes les valeurs en secondes. `p10_s` = temps du top 10 % (le plus rapide), `p90_s` = temps des 10 % les plus lents. Insère exactement ces lignes (`ON CONFLICT (division, bracket, segment) DO NOTHING`).

**Totaux par division** (source `'RoxHype 25/26'`, `is_estimate=false`) :

| division | p10 | p50 | p90 |
|---|---|---|---|
| men | 4211 (1:10:11) | 5269 (1:27:49) | 7057 (1:57:37) |
| women | 4688 (1:18:08) | 5768 (1:36:08) | 7646 (2:07:26) |
| men_pro | 3950 (1:05:50) | 4850 (1:20:50) | 6439 (1:47:19) |
| women_pro | 4264 (1:11:04) | 5200 (1:26:40) | 6899 (1:54:59) |

**Stations, division `men`, bracket `all`** (source `'RoxHype 25/26'`) : wall_balls 300 / 435 / 709 · bbj 234 / 338 / 511 · lunges 234 / 322 / 477 · sled_pull 226 / 303 / 424 · sled_push 145 / 190 / 266 · farmers 101 / 133 / 189 · row 265 / 295 / 336 · ski 254 / 276 / 306.

**Stations, division `women`, bracket `all`** (source `'HYROX Data Lab S7-S8'`, p10 et p90 **null**) : ski p50 311 · sled_push 175 · sled_pull 346 · bbj 384 · row 325 · farmers 137 · lunges 307 · wall_balls 390.

**Stations, `men_pro` et `women_pro`** : pas de données fiables → **ne rien seeder** ; l'app doit afficher « référence indisponible » proprement (voir 7.4).

**Course totale `run_total`** (source `'estimé'`, `is_estimate=true`, dérivé de la part de course ≈ 50-52 % des totaux) : men 2100 / 2640 / 3480 · women 2340 / 2895 / 3840 · men_pro 1950 / 2400 / 3180 · women_pro 2130 / 2580 / 3420.

**Roxzone totale `roxzone_total`** (source `'HYROX Data Lab Utrecht'`, p90 estimé) : men 221 / 357 / 510 · women 240 / 394 / 570. Et par bracket, division `all`, segment `roxzone_total`, p50 seul : sub70 221 · 70_80 273 · 80_90 319 · 90_plus 418.

**Runs par bracket, division `men`** (source `'HYROX Data Lab mid-race crisis'`, p50 seul) :
- bracket `70_80` (profil 1 h 20) : run_1 259, run_2 306, run_3 330, run_4 331, run_5 339, run_6 333, run_7 333, run_8 323.
- bracket `90_plus` (profil 1 h 40) : run_1 293, run_2 356, run_3 388, run_4 386, run_5 405, run_6 394, run_7 399, run_8 433.
- bracket `all` (moyenne Open hommes) : run_1 279, run_2 295, run_3 320, run_4 319, run_5 330, run_6 322, run_7 323, run_8 370.

**Runs, division `women`, bracket `all`** (même source) : run_1 314, run_2 333, run_3 350, run_4 352, run_5 362, run_6 357, run_7 356, run_8 398.

---

## 5. Front — types, constantes, calculs (purs, testés)

### 5.1 `src/features/shared/types/hyrox.ts`

Exporte : `HyroxDivision`, `HyroxFormat`, `HyroxStatus`, `HyroxResult` (miroir exact de la table, `number | null` pour les segments), `HyroxResultInsert` (= `Omit<HyroxResult,'id'|'created_at'|'updated_at'>`), `HyroxReferenceSegment`, `HyroxRacePlan`, `HyroxPlanTargets`, `HyroxProfile = 'runner'|'hybrid'|'powerhouse'`, `SegmentKey` (union des 17 clés : `run_1`…`run_8`, `ski`, `sled_push`, `sled_pull`, `bbj`, `row`, `farmers`, `lunges`, `wall_balls`, `roxzone_total`), `StationKey` (les 8 stations).

Constantes :
- `DIVISION_LABEL: Record<HyroxDivision,string>` (« Women », « Women Pro », « Men », « Men Pro », « Doubles femmes »…).
- `FORMAT_LABEL` (« Solo », « Doubles », « Relais », « Simulation complète », « Simulation 3/4 », « Demi-simulation »).
- `RACE_ORDER: SegmentKey[]` = `run_1, ski, run_2, sled_push, run_3, sled_pull, run_4, bbj, run_5, row, run_6, farmers, run_7, lunges, run_8, wall_balls` (ordre réel de la course).
- `STATION_META: Record<StationKey,{label, short, weight}>` avec `weight` = poids de discrimination : wall_balls 1.0, bbj 0.75, lunges 0.6, sled_pull 0.55, sled_push 0.45, row 0.2, farmers 0.2, ski 0.15. Roxzone : poids 1.0.
- `DIVISION_LOADS` : charges par division pour affichage (push 152/102/202, pull 103/78/153, farmers 2×24 / 2×16 / 2×32, lunges 20/10/30, wall balls 6 kg 3 m / 4 kg 2,70 m / 9 kg 3 m ; Women Pro = charges Men).
- `REFERENCE_DIVISION(division): 'men'|'women'|'men_pro'|'women_pro'` : mappe doubles/relais vers la division de référence la plus proche (doubles_men → men, doubles_women → women, doubles_mixed → men, pro → pro, adaptive → men).

### 5.2 `src/lib/time.ts` (nouveau, partagé)

`parseMmSs(raw: string): number | null` (accepte `h:mm:ss`, `mm:ss`, `m:ss`, `ss`, espaces, virgule) et `formatMmSs(s: number | null, opts?: {hours?: boolean}): string` (`1:27:49` si ≥ 3600 ou `hours`, sinon `4:36`), `formatDelta(s: number): string` (`+1:41` / `−0:12`, signe toujours présent, tiret moins typographique). N'altère pas `TestFillDrawer.tsx` ; tu peux y importer ces helpers si tu veux dédupliquer, à condition de ne rien casser.

### 5.3 `src/lib/hyrox/calc.ts` — fonctions pures (aucun import React, aucun accès réseau)

```ts
export function runSplits(r: HyroxResult): (number|null)[]              // [run_1..run_8]
export function stationSplits(r: HyroxResult): Record<StationKey, number|null>
export function runTotal(r): number | null         // somme si les 8 présents, sinon null
export function stationsTotal(r): number | null    // somme si les 8 présentes, sinon null
export function roxzoneTotal(r): number | null     // r.roxzone_total_s ?? (total − runs − stations si ≥ 0)
export function shares(r): { run: number|null; stations: number|null; roxzone: number|null } // en % du total_s, 1 décimale
export function runStats(r): {
  best: {index:number; s:number} | null; worst: {...} | null;
  avg: number|null;
  fade18: number|null;          // run_8 − run_1 (s)
  fadeIndexPct: number|null;    // (worst − best) / best × 100
  drop12: number|null;          // run_2 − run_1
  halvesDelta: number|null;     // avg(run_5..8) − avg(run_1..4)
}
export function cumulative(r): { key: SegmentKey; split: number|null; cumul: number|null }[]  // dans RACE_ORDER, Roxzone répartie : si roxzone_splits présent, insérer une ligne 'roxzone_i' après chaque run ; sinon une seule ligne roxzone_total à la fin
export function percentile(value: number, ref: {p10_s:number|null; p50_s:number; p90_s:number|null}): number | null
export function alerts(r, ref?): HyroxAlert[]
export function stationPriorities(r, refs): { key: StationKey|'roxzone'; athlete_s: number; ref_s: number; gain_s: number; score: number }[]
export function typology(pctRun: number|null, pctStations: number|null): HyroxProfile | null
export function radarAxes(r, refs): { key: SegmentKey|'run_avg'; label: string; value: number|null }[]  // 10 axes
export function bracketOf(total_s: number): 'sub70'|'70_80'|'80_90'|'90_plus'
export function generatePlan(input: {target_total_s; division; profile; refs; weakStations?: StationKey[]}): HyroxPlanTargets
export function planVsActual(plan: HyroxPlanTargets, r: HyroxResult): { key; target; actual; delta }[]
export function estimateFromTests(inputs: {...}): { low_s: number; high_s: number; from: Record<string,number> } | null
```

**Formules, à implémenter exactement :**

- **`percentile`** : convention « part des athlètes de la division plus rapides que la valeur », donc **0 = le meilleur, 100 = le plus lent**. Interpolation linéaire par morceaux sur les points (p10 → 10), (p50 → 50), (p90 → 90). En dessous de p10 : extrapolation linéaire avec la pente p10-p50, bornée à 1. Au-dessus de p90 : extrapolation avec la pente p50-p90, bornée à 99. Si `p10` ou `p90` est null : retourner `null` (on affiche alors seulement l'écart à la médiane). Arrondir à l'entier.
- **`alerts`** (chaque alerte `{code, level:'info'|'warn', message}` en français) :
  - `pacing` warn si `fade18 > 90` s : « Run 1 plus rapide de X que run 8 : parti trop vite ».
  - `early_drop` warn si `drop12 > 60` s.
  - `late_fade` warn si `halvesDelta > 20` s.
  - `too_safe` info si `best.index === 7` (run 8 est le meilleur) : « Meilleur run = dernier : course trop prudente ».
  - `roxzone` warn si `shares.roxzone > 7` %.
  - `penalties` info si `penalties_s > 0`.
- **`stationPriorities`** : pour chaque station et la Roxzone, `ref_s` = `p50_s` de la référence (division de référence, bracket `all` pour les stations ; pour la Roxzone, le bracket du total de la course si disponible, sinon `all`). `gain_s = max(0, athlete_s − ref_s)`. `score = gain_s × weight`. Tri décroissant sur `score`. Exclure les segments sans référence. Retourner la liste complète ; l'UI affiche les 3 premiers comme « Priorité 1, 2, 3 ».
- **`typology`** : `pctStations` = moyenne des percentiles des 8 stations (ignorer les null). `runner` si `pctStations − pctRun ≥ 20` ; `powerhouse` si `pctRun − pctStations ≥ 20` ; sinon `hybrid`. `null` si l'un des deux est null.
- **`radarAxes`** : 10 axes dans l'ordre `run_avg` (percentile de `run_total`), `roxzone_total`, puis les 8 stations dans l'ordre de course. `value = 100 − percentile` (100 = meilleur, pour que le polygone « gros » = bon). `null` si pas de référence.
- **`bracketOf`** : `< 4200` → `sub70` ; `< 4800` → `70_80` ; `< 5400` → `80_90` ; sinon `90_plus`.
- **`generatePlan`** (P3) :
  1. `k = target_total_s / p50_total(division)` (référence `total`). Si la référence manque → `k = target_total_s / 5269` et marquer `is_estimate`.
  2. Cible brute de chaque station = `p50_station × k` (références bracket `all` de la division ; si une station n'a pas de p50, utiliser la valeur `men` × 1,0 pour `men_pro` et `women` × 1,0 pour `women_pro`, en signalant l'estimation).
  3. Roxzone par transition = valeur du bracket de la cible (`sub70` 28 s, `70_80` 34 s, `80_90` 40 s, `90_plus` 52 s) ; total Roxzone = 8 × cette valeur.
  4. Budget course = `target − stations − roxzone`. Allure moyenne `a = budget / 8`. Forme : `run_1 = a − 20`, `run_2..run_4 = a − 5`, `run_5..run_7 = a + 5`, `run_8 = a + 10` (en secondes), puis renormaliser proportionnellement pour que la somme des 8 = budget exactement.
  5. Profil : `runner` → runs × 0,97, et les deux stations les plus faibles (`weakStations`, sinon wall_balls + sled_pull) × 1,04 ; `powerhouse` → l'inverse (runs × 1,03, stations faibles × 0,96) ; `hybrid` → rien. Après ajustement, renormaliser **les runs uniquement** pour que la somme totale = `target_total_s` à la seconde près.
  6. Arrondir chaque cible à la seconde. Retourner `HyroxPlanTargets` = `{ run_1..run_8, ski, …, wall_balls, roxzone_per_transition }`.
- **`planVsActual`** : ligne par segment (RACE_ORDER + roxzone_total avec `target = 8 × roxzone_per_transition`), `delta = actual − target`.
- **`estimateFromTests`** (P3, estimation transparente, affichée toujours comme une fourchette « estimation ») : entrées optionnelles en secondes : `fiveK`, `ski1k`, `row1k`, `wb100`, `bbj80`, `farmers200`, `lastRace?: HyroxResult`. Si `fiveK` absent et pas de `lastRace` → `null`.
  - Course : `runEst = (fiveK / 5) × 8 × 1,15` (allure 5 km dégradée de 15 % sur 8 km entrecoupés).
  - Stations testées : `stationEst = test × 1,15` (split en course 10-20 % plus lent qu'en salle). Stations non testées : `p50` de la division × `(runEst / p50_run_total)` borné à [0,8 ; 1,3].
  - Roxzone : valeur du bracket de la somme provisoire.
  - `low_s = somme × 0,95`, `high_s = somme × 1,08`. Si `lastRace` existe : `low = min(low, lastRace.total × 0,97)`, `high = max(high, lastRace.total × 1,02)`.
  - `from` liste les entrées réellement utilisées (clé → valeur).

### 5.4 `src/lib/__tests__/hyrox.test.ts` (Vitest, obligatoire)

Au minimum : `parseMmSs` / `formatMmSs` (cas `1:27:49`, `4:36`, `95`, entrée invalide), `runTotal`/`stationsTotal`/`roxzoneTotal` (avec et sans `roxzone_total_s`, avec un segment null), `shares` (somme ≈ 100), `runStats` sur la série men `all` (best = run_1, worst = run_8, fade18 = 91), `percentile` (p10 → 10, p50 → 50, p90 → 90, milieu → 30, sous p10 borné à 1, sans p10 → null), `alerts` (déclenchement de `pacing` et `too_safe`), `stationPriorities` (ordre et score), `typology` (3 cas + null), `bracketOf` (bornes), `generatePlan` (somme = target à la seconde, roxzone = 8 × transition, runs croissants de 1 à 8 hors run_1), `planVsActual`, `estimateFromTests` (null sans entrées ; low < high).

---

## 6. Front — données (hooks React Query)

Dossier `src/features/shared/hooks/hyrox/`. `const db = supabase as any` avec le commentaire eslint. Toasts sonner en français. Mutations optimistes selon `CONTRIBUTING.md` pour la liste des courses.

- `useHyroxResults(athleteId)` → `HyroxResult[]` triés par `date DESC`. Clé `QK.hyroxResults(aid)`.
- `useHyroxResult(id)` → une course.
- `useCreateHyroxResult(athleteId)`, `useUpdateHyroxResult(athleteId)`, `useDeleteHyroxResult(athleteId)` : invalident `QK.hyroxResults(aid)` ; `created_by = auth user id`.
- `useHyroxReferences()` → toutes les lignes de `hyrox_reference_segments` (petite table, `staleTime: 24h`), clé `QK.hyroxReferences`. Exporter aussi un sélecteur pur `pickRef(refs, division, segment, bracket)` qui retombe sur `bracket='all'` puis `division='all'` si absent.
- `useHyroxRacePlans(athleteId)`, `useUpsertHyroxRacePlan(athleteId)`, `useDeleteHyroxRacePlan(athleteId)` (P3). Clé `QK.hyroxPlans(aid)`.
- `useHyroxFlag(athleteId)` → `{ enabled, toggling, toggle }` calqué sur `useHabits` (lecture `profiles.is_hyrox_athlete`, update, rollback + `toast.error` si la base refuse). Après succès, rafraîchir le profil via `useAuth` (appeler `fetchAthletes`/`fetchProfile` : expose si besoin une fonction `refreshAthletes()` dans `AuthContextType`, sans casser les appels existants).
- Tests HYROX : **réutilise** `useAthleteTestResults`, `useAthleteCurrentValues`, `useCreateTestResult` et `useTestDefinitions` ; filtre côté client sur `category === 'hyrox'`.

`src/lib/queryKeys.ts` : ajouter sous un commentaire `// ── HYROX ──` :
```ts
hyroxResults:    (aid: string) => ['hyroxResults', aid]    as const,
hyroxResult:     (id: string)  => ['hyroxResult', id]      as const,
hyroxReferences: ['hyroxReferences']                        as const,
hyroxPlans:      (aid: string) => ['hyroxPlans', aid]      as const,
```

---

## 7. Front — profil, onglets, routes

### 7.1 Profil

- `src/hooks/useAuth.tsx` : ajouter `is_hyrox_athlete: boolean;` à `Profile`. Dans la signature de `updateAthleteProfile` (interface **et** implémentation), ajouter `is_hyrox_athlete?: boolean;` (optionnel, pour ne casser aucun appel existant).
- `src/components/coach/AthleteProfileForm.tsx`, onglet « profil », après le choix du genre : une ligne « Athlète HYROX » avec un switch (même style que le toggle habitudes : 46 × 26, rond blanc, couleur active `C.o`), state `isHyrox` initialisé depuis `athlete.is_hyrox_athlete`, envoyé dans `handleSaveProfile`. Visible uniquement si l'utilisateur connecté est le coach de l'athlète ou se suit lui-même (`athlete.coach_id === user.id || athlete.id === user.id`).
- `src/features/coach/components/donnees/ProfilGeneralTab.tsx` : nouvelle `Section` « Suivi HYROX » (icône lucide `Flame`, couleur `#F5A623`, sous-titre « Active l'onglet HYROX : courses, stations, Roxzone, radar, tests ») placée juste avant « Tracker d'habitudes », avec le même toggle, branché sur `useHyroxFlag`. Quand actif : une ligne de résumé « N courses saisies · dernier chrono 1:24:12 (HYROX Bordeaux, 12 oct. 2026) » + bouton « Ouvrir l'onglet HYROX » (`navigate('/coach/athletes/${id}/hyrox')`).
- Côté athlète (`ProfilPage.tsx`, `ProfileEditForm`) : **ne pas** rendre le flag éditable. Afficher au plus un badge « Athlète HYROX » dans l'en-tête du profil si actif.

### 7.2 Onglets

- `ContextBar.tsx` : ajouter `{ key: "hyrox", label: "HYROX" }` dans `TABS` **après** `profil-sportif`. Filtrer au rendu : `TABS.filter(t => t.key !== "hyrox" || selectedAthlete?.is_hyrox_athlete)`. `activeTab` doit aussi reconnaître `hyrox`. `SUB_TABS.hyrox` = `courses` (Courses), `stations` (Stations), `runs` (Runs et Roxzone), `radar` (Radar), `tests` (Tests HYROX), `plan` (Plan de course). En P1, `tests` et `plan` existent dans la liste mais affichent un `EmptyState` « Bientôt » ; en P2/P3 ils deviennent réels.
- `AthleteLayout.tsx` : `ATH_TABS` devient une fonction ou est filtré au rendu : insérer `{ k: "hyrox", l: "HYROX", icon: <svg …flamme simple, même props ip…/> }` entre `test` et `alim` si `athleteProfile?.is_hyrox_athlete` (depuis `useAthleteContext()`). Le calcul de `activeTab` doit inclure `hyrox`. Six onglets tiennent dans 64 px de haut à `fontSize 9` : vérifier sur largeur 360 px.
- `AthleteViewPage.tsx` : ajouter `{ key: "hyrox", label: "HYROX" }` à `INNER_TABS` si `athleteProfile?.is_hyrox_athlete`, rendu `<AthleteHyroxPage />`.

### 7.3 Routes (`src/App.tsx`)

- Coach : `const HyroxPage = lazy(() => import("./features/coach/pages/HyroxPage.tsx"));` et `<Route path="hyrox" element={<HyroxPage />} />` sous `athletes/:athleteId`.
- Athlète : `const AthleteHyroxPage = lazy(() => import("./features/athlete/pages/HyroxPage.tsx"));` et `<Route path="hyrox" element={<AthleteHyroxPage />} />` sous `/athlete`.
- Garde-fou : si le flag est faux et qu'on arrive sur la route (lien direct), afficher un `EmptyState` « Le suivi HYROX n'est pas activé pour cet athlète » avec CTA vers Profil Général (coach) ou rien (athlète). Pas de redirection silencieuse.

### 7.4 Règles d'affichage communes

- Temps toujours en `m:ss` ou `h:mm:ss` via `formatMmSs`. Écarts via `formatDelta`, colorés : gain `C.g`, perte `C.r`, neutre `C.tx3`.
- Percentile affiché « Top 32 % » (valeur = percentile). Si null : « réf. n.d. » en `C.tx3`, jamais une valeur inventée.
- Toute donnée issue d'une référence `is_estimate = true` porte un petit badge « estimé » (`C.o`).
- Loading → skeletons du repo (`CardSkeleton`, `TableSkeleton`, `ChartSkeleton`, `ListSkeleton`). Vide → `EmptyState`. Erreur → `toast.error`.
- Les simulations (`is_official = false`) sont affichées avec un badge « Simulation » et **exclues** des records personnels et des percentiles de classement, mais incluses dans les courbes de progression (trait pointillé).
- Coach = lecture + écriture. Athlète = lecture + ajout/modification de **ses** courses et tests, pas de suppression de ce que le coach a saisi (`created_by !== user.id` → bouton supprimer masqué ; la RLS reste permissive, c'est un choix UI).
- Aucun `any` hors `db`, aucun `console.log` utilisateur, textes en français, pas d'emoji dans l'UI (icônes lucide).

---

## 8. Front — pages et composants

### 8.1 Coach : `src/features/coach/pages/HyroxPage.tsx`

Lit `?view=` (défaut `courses`), en-tête commun (titre + sous-titre, même style que `ProfilAthletePage`), puis rend le composant de la sous-vue. Composants dans `src/features/coach/components/hyrox/` :

**`RacesView.tsx`** (view `courses`)
- En-tête KPI (3 `KPICard` du repo si réutilisable, sinon cartes `C.s1`) : record personnel solo officiel, nombre de courses, dernier chrono avec écart au record.
- Bouton « Ajouter une course » → `RaceFormDrawer`.
- Liste (table desktop) : date, event, lieu, format, division, total, run total, stations total, Roxzone, rang général / AG, badge simulation. Clic → `RaceSheet` (panneau latéral ou page pleine largeur sous la liste, au choix, mais un seul pattern).
- Sélecteur « Comparer » : cocher 2 courses → `RaceCompare`.

**`RaceFormDrawer.tsx`** (création / édition)
- Champs : date, nom d'event, lieu, format, division, groupe d'âge, officielle (switch), statut, lien compétition (select des `useCompetitions(athleteId)` à ± 7 jours de la date, optionnel), total, puis les 16 segments **dans l'ordre de course** (`RACE_ORDER`) en saisie `mm:ss`, Roxzone totale (`mm:ss`, optionnel) avec dépliant « par transition » (8 champs), pénalités (s + note), rangs et partants, lien activité, commentaire.
- Pendant la saisie : afficher en direct « runs + stations + Roxzone = X · total saisi = Y · écart Z » ; si |écart| > 60 s et Roxzone renseignée, avertissement (pas de blocage). Si la Roxzone est vide, l'écart est affiché comme « Roxzone déduite ».
- Validation : date, event, division, total obligatoires ; segments optionnels (une course DNF peut être partielle) ; tout segment doit être > 0 s et < 3 h.
- Mobile-friendly (le même drawer est utilisé côté athlète).

**`RaceSheet.tsx`** (la fiche de course, écran le plus important)
- En-tête : event, date, division, AG, total en gros, rangs, percentile du total (référence `total` de la division), badges (simulation, pénalités).
- Trois pastilles : Course · Stations · Roxzone, chacune avec temps et % (`shares`), et le repère de référence sous chaque (« réf. 52 % »).
- Tableau 17 lignes (`cumulative`) : segment, split, cumul, percentile (stations et Roxzone), écart à la médiane, mini-barre proportionnelle (runs en `C.b`, stations en `C.ac`, Roxzone en `C.tx3`).
- Bloc « Lecture automatique » : meilleur run, pire run, `fade18`, `drop12`, `halvesDelta`, typologie (`typology`), et la liste `alerts` (warn en `C.o`, info en `C.tx2`).
- Bloc « Priorités » : top 3 de `stationPriorities` avec gain estimé « −1:30 possible ».
- Boutons : modifier, supprimer (confirmation `AlertDialog`), comparer avec…, « Lier au plan de course » (P3).

**`RaceCompare.tsx`** : deux courses côte à côte, 17 lignes, delta coloré, plus les 3 totaux et le radar superposé (`HyroxRadar` avec deux séries).

**`RunsView.tsx`** (view `runs`)
- Sélecteur de course (défaut : la dernière officielle).
- Graphique Recharts `LineChart` : X = run 1..8, Y = secondes ; série athlète (`C.ac`) ; série de fond = référence runs du bracket de la course (division de référence, sinon `all`) en `C.tx3` pointillé ; `ReferenceLine` à l'allure moyenne. `DarkTip`-style tooltip (voir `StatsCharts.jsx`).
- Sous le graphique : cartes `fade18`, `fadeIndexPct`, `drop12`, `halvesDelta`, position du meilleur run, et pour chaque run « après : <station précédente> » (run 3 après sled push, etc.).
- Section Roxzone : total, %, par transition si dispo (`BarChart` 8 barres) ; comparaison au bracket (28/34/40/52 s par transition) ; évolution de la Roxzone sur toutes les courses (`LineChart`, X = date).
- Encadré « Lien avec l'entraînement » : si un test « Course compromise » existe (P2), afficher sa dégradation % à côté de `fadeIndexPct`.

**`StationsView.tsx`** (view `stations`)
- 9 cartes (8 stations + Roxzone), en grille 3 colonnes desktop : dernier split, record (officiel), percentile avec barre horizontale (0 → 100, marqueur médiane), écart à la médiane, sparkline des splits sur toutes les courses (réutilise le `Sparkline` SVG de `TestPage.tsx` ou extrais-le dans `src/features/shared/components/Sparkline.tsx`), charge de la division (`DIVISION_LOADS`).
- Si un test salle correspondant existe (P2) : ligne « Salle 4:02 · Course 4:38 · ratio 1,15 ».
- En bas : tableau « Priorités » complet (`stationPriorities`) trié, colonnes station / toi / médiane / gain / poids / score.

**`HyroxRadar.tsx`** (view `radar`, composant réutilisé ailleurs)
- Recharts `RadarChart` + `PolarGrid` + `PolarAngleAxis` + `PolarRadiusAxis` (domaine 0-100, ticks masqués) + `Radar` par série. Props : `series: { name: string; color: string; axes: ReturnType<typeof radarAxes> }[]`, `height?`. Fond `C.s1`, grille `C.brd`, labels `C.tx2` 11 px.
- Vue radar : sélecteur de course (défaut dernière officielle) + case « superposer le record » ; légende ; sous le radar, la typologie en clair avec une phrase (« Profil Runner : course et ergos au-dessus de la division, wall balls et sled pull en dessous. »), générée depuis les 3 meilleurs et 3 pires axes.
- Axes sans référence : non tracés et listés en note « réf. n.d. : sled push, … ».

**`HyroxTestsView.tsx`** (view `tests`, P2)
- Tableau de la batterie : pour chacune des 10 définitions `hyrox` : dernier résultat, date, record (depuis `useAthleteCurrentValues`), évolution premier → dernier (réutilise la logique `MetricRow`), bouton « Saisir » (ouvre le `TestFillDrawer` existant si ses props le permettent ; sinon un formulaire inline date + valeurs mm:ss via `useCreateTestResult`).
- Repères par niveau (affichés en `C.tx3`, étiquetés « repères de coach ») : 5 km : < 26:00 finir · 20-24 compétitif · 18-19 élite ; SkiErg 1000 m H/F : 4:30/5:00 · 4:00/4:30 · 3:30/4:00 ; Rameur : 4:00/4:30 · 3:30/4:00 · 3:15/3:45 ; 100 WB : 7:00 · 5:00 · 4:00 ; BBJ : 6:00 · 4:00 · 3:00 ; Farmers : 3:30 · 2:30 · 2:00 ; Course compromise : > 25 % · 15-25 % · < 15 %. Mets ces repères dans `src/lib/hyrox/benchmarks.ts` (constante typée), pas en dur dans le JSX.
- Bloc « Test ↔ course » : pour ski, row, wall balls, bbj, farmers, lunges, sled push/pull : dernier test vs dernier split de course, ratio course/salle. Pour le 5 km : allure 5 km vs allure moyenne des runs de la dernière course.
- Bloc « Course compromise » : dégradation % = `(run_2 − run_1)/run_1`, historique, et à côté `fadeIndexPct` de la dernière course.
- Radar de capacités (6 axes, même composant `HyroxRadar`) : aérobie (5 km), ergos (moyenne ski + row), endurance musculaire (moyenne WB + lunges + BBJ), portés (farmers), traîneaux (push + pull), résistance (100 − dégradation % × 4, bornée 0-100). Chaque axe = score 0-100 par interpolation sur les repères finir (20) / compétitif (60) / élite (90) de `benchmarks.ts`, sexe de l'athlète (`profile.gender`, défaut `male`). Axes sans test : non tracés.
- Rappel de cadence (texte statique) : retest toutes les 5-6 semaines ; demi-simulation à S-6 ; simulation complète à S-3/4, jamais dans les 14 derniers jours.

**`RacePlanView.tsx`** (view `plan`, P3)
- Liste des plans (nom, compétition liée, objectif, date de création, « réalisé lié » oui/non).
- « Nouveau plan » : nom, compétition (select `useCompetitions`), division, objectif (`mm:ss`, pré-rempli avec l'estimation `estimateFromTests` si disponible, affichée en fourchette « estimation : 1:21 – 1:32 » + liste `from`), profil (défaut = `typology` de la dernière course, sinon hybrid), stations faibles (pré-cochées depuis `stationPriorities`). Bouton « Générer » → `generatePlan` → tableau 17 lignes éditable (chaque cible `mm:ss`), cumul recalculé en direct, somme toujours affichée et comparée à l'objectif. Sauvegarde (`upsert`).
- Plan ouvert : « Lier une course réalisée » (select des `hyrox_results` postérieurs à la création) → tableau `planVsActual` avec delta coloré et résumé (« +2:10 sur les stations, −0:40 sur la course, Roxzone dans le plan »).
- Journal prédit / réel : tableau de tous les plans liés : objectif, estimation (low-high), réalisé, écart. C'est la base pour améliorer l'estimateur plus tard : ne pas l'oublier.

### 8.2 Athlète : `src/features/athlete/pages/HyroxPage.tsx` (mobile, largeur 360-480)

Onglets internes en haut (segmented control) : Courses · Stations · Runs · Radar · Tests. Réutilise les **mêmes composants** que le coach quand ils sont responsives (RaceSheet, HyroxRadar, StationsView en 1 colonne), sinon versions compactes dans `src/features/athlete/components/hyrox/`. Fonctions : voir ses courses, en ajouter une (`RaceFormDrawer`), ouvrir la fiche, voir stations / runs / radar, saisir un test HYROX. Pas de plan de course côté athlète en P3 (lecture seule du plan lié à sa prochaine compétition : tableau cible + cumul, c'est tout).

Dans `TodayPage.tsx` (athlète) : si flag actif et qu'une compétition de type `competition` avec un nom contenant « hyrox » (insensible à la casse) ou liée à un plan existe dans les 60 jours, afficher une carte « J-12 · HYROX Bordeaux · objectif 1:25:00 » qui ouvre l'onglet. Si rien de tel, ne rien afficher. Ne modifie rien d'autre dans `TodayPage`.

---

## 9. Documentation et finitions

- `docs/HYROX_FEATURE.md` : sur le modèle de `docs/ENERGY_FEATURE.md` : tables (DDL), RLS, seeds et leurs sources, format `targets` JSONB, formules de `calc.ts` (recopier la section 5.3 en la mettant à jour si tu as dû dévier, avec la raison), hooks, composants, routes, flux coach et athlète, limites connues (références Pro absentes, run 1 non comparable entre salles, sled dépendant du tapis).
- `docs/DECISIONS.md` : entrée `2026-10 — Module HYROX` : flag sur `profiles` (pattern habitudes), tables dédiées plutôt que `competitions` étendue (pourquoi : 17 segments typés, simulations, RLS propre), références statistiques en table éditable plutôt qu'en constantes (pourquoi : remplaçables par les données clients), percentile 0 = meilleur (pourquoi : convention Rox-Coach).
- `README` ou `CLAUDE.md` du repo : une ligne dans la liste des fichiers clés vers `docs/HYROX_FEATURE.md`. Ne réécris pas le reste du `CLAUDE.md`.
- Régénération des types Supabase : si `supabase gen types` est disponible dans l'environnement, régénère `src/integrations/supabase/types.ts` ; sinon n'y touche pas et dis-le dans la PR.

---

## 10. Recette — à vérifier avant d'ouvrir la PR

Fais réellement ces vérifications (en local, `npm run dev`, un compte coach et un compte athlète liés) et coche-les dans la description de la PR :

- [ ] `npm run lint`, `npm test`, `npm run build` passent sans erreur ni warning nouveau.
- [ ] Migration appliquée sur une base propre sans erreur, relancée une deuxième fois sans erreur (idempotence).
- [ ] Un athlète non flaggé ne voit pas l'onglet HYROX (coach, athlète, aperçu). Lien direct `/athlete/hyrox` → `EmptyState`, pas de crash.
- [ ] Le coach active le flag depuis Profil Général **et** depuis le formulaire de profil ; l'onglet apparaît sans rechargement de page côté coach ; côté athlète après rechargement.
- [ ] L'athlète ne peut pas modifier son propre flag (tentative via l'API Supabase → erreur du trigger).
- [ ] Saisie d'une course complète (exemple ci-dessous) : la fiche affiche total 1:24:12, course 44:10 (52,4 %), stations 33:20 (39,6 %), Roxzone 6:42 (8,0 %), meilleur run = run 1, pire = run 8, fade18 = +2:28, drop12 = +0:31, halvesDelta ≈ +50 s, alertes `pacing` et `late_fade` (pas `early_drop`), Roxzone 8,0 % > 7 % → alerte, wall balls = Top 10 %, typologie calculée, priorités 1-3 non vides.
- [ ] Course avec Roxzone vide → Roxzone déduite = total − runs − stations.
- [ ] Course DNF partielle (stations 7 et 8 vides) → aucune division par zéro, totaux partiels affichés comme « — ».
- [ ] Division `women` : percentiles stations → « réf. n.d. » (p10/p90 null), écart à la médiane affiché ; `men_pro` → « réf. n.d. » partout sauf total et run_total.
- [ ] Simulation (`is_official=false`) : badge, exclue du record, présente dans les courbes.
- [ ] Comparaison de deux courses : 17 deltas, radar à deux séries.
- [ ] Radar : 10 axes, polygone cohérent (un bon coureur a l'axe course vers l'extérieur).
- [ ] P2 : les 10 tests apparaissent dans la banque de tests (catégorie HYROX, couleur dédiée dans `TEST_CATEGORY_COLOR`), saisie d'un 5 km et d'un SkiErg, bloc test ↔ course rempli, radar de capacités tracé avec les axes disponibles seulement.
- [ ] P3 : plan généré pour 1:25:00 → somme des cibles = 5100 s exactement, Roxzone = 8 × 40 s, runs 2-8 croissants ; édition d'une cible → cumul recalculé ; liaison d'une course → plan vs réalisé ; journal prédit / réel alimenté.
- [ ] Mobile 360 px : barre basse à 6 onglets lisible, drawer de saisie utilisable, fiche de course scrollable sans débordement horizontal.
- [ ] Aucun `console.error` en navigation normale.

**Jeu de données d'exemple** (course de recette, division `men`, AG 30-34, HYROX Bordeaux, 2026-10-12, officielle, solo) :
- `total_s` 5052 (1:24:12) · rang 842 / 1450 · AG 71 / 120 · pénalités 0.
- Runs : 271, 302, 328, 325, 341, 330, 334, 419 (somme 2650 = 44:10).
- Stations : ski 278, sled_push 178, sled_pull 195, bbj 326, row 292, farmers 131, lunges 300, wall_balls 300 (somme 2000 = 33:20).
- Roxzone totale 402 (6:42), pas de splits par transition.
Avec ces valeurs, la fiche doit reproduire exactement les chiffres de la checklist ci-dessus.

---

## 11. Ce que je ne veux pas

- Pas de refactor hors périmètre (ne touche pas à `WeightliftingTracker.jsx`, aux séances énergie, à la nutrition).
- Pas de nouvelle dépendance npm. Recharts, lucide-react, date-fns, sonner, Radix sont déjà là.
- Pas de données inventées affichées comme réelles : tout ce qui vient de `hyrox_reference_segments` avec `is_estimate = true` porte le badge « estimé », et aucune valeur n'est affichée quand la référence manque.
- Pas de texte anglais dans l'UI (les noms de stations restent en anglais : SkiErg, Sled push, Sled pull, Burpee broad jump, Rameur, Farmers carry, Sandbag lunges, Wall balls ; « Roxzone » avec majuscule).
- Pas de question à mi-parcours sur un point couvert par ce document. Si tu dévies d'une spécification, écris-le dans `HYROX_FEATURE.md` (section « Écarts au cahier des charges ») et dans la PR, avec la raison.

Commence par la phase 1. Avant d'écrire la première ligne, affiche-moi en 10 lignes maximum ton plan de fichiers (créés / modifiés) pour la phase 1, puis enchaîne sans attendre.
