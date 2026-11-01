# HYROX_FEATURE.md — Module HYROX

**Date :** 2026-10-12
**Statut :** P1 en cours (branche `ui/agon-modules`)

---

## 1. Architecture

### Tables DB

| Table | Description |
|-------|-------------|
| `hyrox_results` | Courses et simulations HYROX (17 segments + métadonnées) |
| `hyrox_reference_segments` | Références statistiques par division/bracket/segment |
| `hyrox_race_plans` | Plans de course avec cibles par segment (P3) |

Flag `is_hyrox_athlete` sur `profiles` — active l'onglet HYROX pour un athlète.

### Migration

`supabase/migrations/20261013200000_hyrox_module.sql` :
- Flag + trigger `prevent_hyrox_flag_self_update`
- 3 tables avec RLS (athlete + coach + admin)
- Seeds : références statistiques (RoxHype 25/26, HYROX Data Lab S7-S8)
- Seeds : 10 test_definitions (catégorie `hyrox`) + 18 test_variables

### RLS

- `hyrox_results` : SELECT/INSERT/UPDATE si `athlete_id = auth.uid()` ou `is_coach_of(athlete_id)` ou admin. DELETE idem.
- `hyrox_reference_segments` : SELECT pour tout utilisateur authentifié. Écriture admin seulement.
- `hyrox_race_plans` : même pattern que `hyrox_results`.

---

## 2. Types et constantes

Fichier : `src/features/shared/types/hyrox.ts`

Types : `HyroxDivision`, `HyroxFormat`, `HyroxStatus`, `HyroxProfile`, `StationKey`, `RunKey`, `SegmentKey`, `HyroxResult`, `HyroxResultInsert`, `HyroxReferenceSegment`, `HyroxPlanTargets`, `HyroxRacePlan`, `HyroxAlert`.

Constantes : `DIVISION_LABEL`, `FORMAT_LABEL`, `RACE_ORDER` (16 segments dans l'ordre de course), `STATION_KEYS`, `RUN_KEYS`, `STATION_META` (label, short, weight), `ROXZONE_WEIGHT`, `DIVISION_LOADS`, `SEGMENT_LABEL`, `REFERENCE_DIVISION()`.

---

## 3. Calculs purs

Fichier : `src/lib/hyrox/calc.ts` — aucun import React, aucun accès réseau.

| Fonction | Description |
|----------|-------------|
| `runSplits(r)` | 8 splits course |
| `stationSplits(r)` | 8 splits stations |
| `runTotal(r)` / `stationsTotal(r)` | Somme (null si un segment manque) |
| `roxzoneTotal(r)` | Explicite ou déduit (total − runs − stations) |
| `shares(r)` | % course / stations / roxzone (1 décimale) |
| `runStats(r)` | best, worst, avg, fade18, fadeIndexPct, drop12, halvesDelta |
| `cumulative(r)` | Tableau 17 lignes avec cumul |
| `percentile(value, ref)` | Interpolation linéaire par morceaux (0=meilleur, 100=plus lent) |
| `alerts(r)` | Alertes : pacing, early_drop, late_fade, too_safe, roxzone, penalties |
| `stationPriorities(r, refs)` | Gain × poids, trié décroissant |
| `typology(pctRun, pctStations)` | runner / hybrid / powerhouse |
| `radarAxes(r, refs)` | 10 axes (100 = meilleur) |
| `bracketOf(total_s)` | sub70 / 70_80 / 80_90 / 90_plus |
| `generatePlan(input)` | Plan de course (P3) |
| `planVsActual(plan, r)` | Comparaison plan vs réalisé |
| `estimateFromTests(inputs)` | Estimation en fourchette (P3) |

### Formules clés

- **Percentile** : interpolation linéaire p10→10, p50→50, p90→90. Extrapolation bornée 1-99. Null si p10 ou p90 absent.
- **Alerts** : fade18 > 90s → pacing ; drop12 > 60s → early_drop ; halvesDelta > 20s → late_fade ; run 8 best → too_safe ; roxzone > 7% → roxzone.
- **stationPriorities** : `gain = max(0, athlete − p50)`, `score = gain × weight`. Roxzone poids 1.0.
- **typology** : écart ≥ 20 entre pctStations et pctRun.

---

## 4. Hooks

Dossier : `src/features/shared/hooks/hyrox/`

| Hook | Description |
|------|-------------|
| `useHyroxResults(athleteId)` | CRUD courses |
| `useHyroxReferences()` | Références (staleTime 24h) |
| `useHyroxFlag(athleteId)` | Toggle is_hyrox_athlete |

Sélecteur pur : `pickRef(refs, division, segment, bracket)` — fallback bracket→'all' puis division→'all'.

Query keys dans `src/lib/queryKeys.ts` : `hyroxResults`, `hyroxResult`, `hyroxReferences`, `hyroxPlans`.

---

## 5. Routes

| Route | Page |
|-------|------|
| `/coach/athletes/:athleteId/hyrox` | `HyroxPage` (coach, sub-vues via `?view=`) |
| `/athlete/hyrox` | `AthleteHyroxPage` (athlète, onglets internes) |

Garde-fou : si `is_hyrox_athlete = false`, EmptyState.

---

## 6. Composants

### Coach (`src/features/coach/components/hyrox/`)

| Composant | Vue |
|-----------|-----|
| `RacesView` | Liste courses + KPI + formulaire + fiche |
| `RaceFormDrawer` | Création / édition (17 segments mm:ss) |
| `RaceSheet` | Fiche de course détaillée |
| `RaceCompare` | Comparaison 2 courses |
| `StationsView` | 9 cartes stations + priorités |
| `RunsView` | Graphique runs + stats + Roxzone |
| `HyroxRadar` | Composant Recharts RadarChart réutilisable |
| `HyroxRadarView` | Vue radar avec typology |

### Athlète (`src/features/athlete/pages/HyroxPage.tsx`)

Réutilise les composants coach (responsive). Onglets : Courses, Stations, Runs, Radar.

---

## 7. Références statistiques (seeds)

Sources : RoxHype 25/26, HYROX Data Lab S7-S8, HYROX Data Lab Utrecht.

- Totaux : men, women, men_pro, women_pro (p10/p50/p90)
- Stations men (p10/p50/p90) : toutes les 8
- Stations women (p50 seul, p10/p90 null)
- Stations men_pro / women_pro : **pas de données** → "réf. n.d." dans l'UI
- Run total (estimé) : dérivé de ~50-52% des totaux
- Roxzone : men/women p10/p50/p90 + par bracket (p50 seul)
- Runs par bracket : men 70_80, men 90_plus, men all, women all

---

## 8. Limites connues

- Références Pro absentes pour les stations (affiche "réf. n.d.")
- Run 1 non comparable entre salles (terrain, dénivelé, revêtement)
- Sled push/pull dépend fortement de la surface (turf, béton) → pas de benchmark universel
- Import automatique depuis results.hyrox.com hors périmètre
- Mode doubles/relais : on stocke la division mais on ne modélise pas le partage des stations

---

## 9. Décisions

| Décision | Raison |
|----------|--------|
| Flag sur `profiles` | Même pattern que `habit_tracker_enabled` |
| Tables dédiées (pas extension `competitions`) | 17 segments typés, simulations, RLS propre |
| Références en table (pas constantes) | Remplaçables par données clients |
| Percentile 0 = meilleur | Convention Rox-Coach (temps : plus bas = mieux) |
| `const db = supabase as any` | Types Supabase auto-générés périmés |

---

## 10. Tests HYROX (bilan d'entrée et retests)

Prompt source : `Prompt-Agon-Tests-HYROX-2026-10-31.md` (Hugo, 31/10/2026). Livré en une seule PR (moteur, base, saisie, fiche résultat, comparaison et recalcul, calibration). Migration **appliquée en prod le 2026-11-01** (accord de Hugo) via `supabase db query --linked -f`, jamais `db push` (voir `DB_MIGRATIONS.md`). Tests RLS en prod : `supabase/tests/hyrox_tests_rls.sql`.

### Moteur : `src/lib/hyrox/tests/`
TS pur, aucun import React ni réseau. Point d'entrée : `analyzeTests(inputs, profile, { set, target_s, context })`.

| Fichier | Rôle |
|---|---|
| `types.ts` | Entrées brutes (`HyroxTestInputs`), profil, grilles (`GridSet`), règles |
| `params.ts` | `GRID_SET_V1` = seed v1 (grilles, poids, paramètres course, paramètres d'axes, règles) ; `ALGO_VERSION`, `RACE_LOADS` |
| `running.ts` | VC, D′, E (Riegel), S, seuil 1, 3 zones athlète, 6 zones coach, FC seuil (CHR), 5 et 10 km, réserve de vitesse et profil, tableau % VC → durée tenable |
| `sled.ts` | Profil charge-vitesse (régression, L0, réserve, R²) et lecture semaine 1 |
| `scores.ts` | Notes 1-5 par mesure, note par axe (moyenne pondérée, arrondie à 0,5), plafonds robustesse |
| `chrono.ts` + `chronoData.ts` | Chrono estimé (fourchette, leviers), VC minimum par chrono visé, splits médians par chrono |
| `insights.ts` | Points forts / faibles, drapeaux, moteur de règles, plan de bloc (`axesPlan`), Roxzone |
| `index.ts` | `analyzeTests` : tout calculer, stamper `algo_version` + `grid_version` ; `storedOutputs` (sorties gardées en base, sans la proposition d'axes) |
| `db.ts` | GridSet <-> lignes de la base, `seedSql`, types des lignes, `ValidatedAxes` (axes réécrits par le coach) |
| `mapping.ts` | Résultats de la batterie v3 -> `HyroxTestInputs` (le plus récent de chaque test dans une période), profil -> `AthleteTestProfile` (avertissements), semaine type |
| `calibration.ts` | Dernière analyse avant chaque course solo vs chrono réel, par segment, résumé, export CSV |

Principes :
- **Aucune grille en dur dans le calcul** : le moteur reçoit un `GridSet`. `GRID_SET_V1` sert de seed à la base (PR 2) et de défaut en test.
- **Entrées brutes jamais modifiées** : un recalcul avec une autre version produit une nouvelle sortie, l'ancienne reste lisible.
- **Une entrée manquante donne « — »**, jamais NaN. 2 points de course suffisent (signalé).
- Chaque mesure porte sa **source** : publiée, calée chrono, ma méthode, méthode vitesse critique / Riegel.
- Vocabulaire côté athlète : « système cardio-respiratoire », « seuils », 3 zones (Zone 1 Endurance, Zone 2 Seuils, Zone 3 Haute intensité). Les 6 zones de vitesse, les 5 zones FC, E et le tableau % VC restent côté coach.
- Analyse course : modèle vitesse critique (Monod-Scherrer / Jones) + loi de puissance de Riegel, seuils selon la méthode Rivet.

Tests : `src/lib/__tests__/hyroxTests.test.ts` (golden tests 1 à 3 du prompt, cas limites, sled, versions de grille). Oracle : le radar bilan YOXX (`radar-bilan.html`, fonctions `compute`, `axisScores`, `predict`, `axesPlan`, `roxPlan`), résultats identiques.

Seuils sans source, seedés actifs mais marqués `to_recalibrate` : chute sled en semaine 1 (85 %), chute wall balls (75 %), écart Push / Pull (2 notes). Grille de la réserve au sled à recaler (L0 surestime la charge max réelle).

### Base (PR 2) : `20261101130000_hyrox_tests.sql`

| Table / colonne | Rôle | RLS |
|---|---|---|
| `profiles.hyrox_category` | `open` / `pro` : charges de course des tests | profil |
| `test_definitions.battery`, `battery_session`, `battery_order` | Batterie v3 (`hyrox_v3`, séances S1-S5 + W1) ; les 10 anciens presets HYROX gardés, `hyrox_legacy` | inchangée |
| `hyrox_test_grid_versions` | Une version = un jeu complet ; une seule `active` (index unique partiel) | lecture authentifiée, écriture admin |
| `hyrox_test_grids` | Grilles 1-5 (4 bornes), sens, source, poids, par sexe / catégorie | idem |
| `hyrox_test_params` | Paramètres `scoring` et `running` (jsonb) | idem |
| `hyrox_axes_params` | Paramètres du plan de bloc (jsonb) | idem |
| `hyrox_work_axes_rules` | Règles d'axes de travail (`condition` jsonb, `to_recalibrate`) | idem |
| `hyrox_test_analyses` | Snapshot figé : `inputs`, `profile`, `outputs`, `algo_version`, `grid_version` ; `recalculated_from` ; `axes_validated` + `validated_at` | coach / admin ; l'athlète lit seulement une analyse validée |
| `hyrox_test_axes_drafts` | Proposition du moteur + contexte de l'athlète (cas types, douleur, envie) | coach / admin seulement |
| `hyrox_results.top_pct_overall`, `roxzone_rank`, `roxzone_top_pct`, `roxzone_cause` | Méthode Roxzone | inchangée |

- Seed v1 généré par `seedSql(gridSetToRows(GRID_SET_V1))` (`src/lib/hyrox/tests/db.ts`) ; `hyroxTestsDb.test.ts` vérifie que la migration le contient à l'identique. `gridSetFromRows` reconstruit le `GridSet` depuis la base.
- Trigger `hyrox_test_analyses_freeze` : entrées, profil, sorties et versions ne changent plus après création ; seuls la validation, le chrono visé et les axes validés bougent.
- Hors staff en V1, comme les autres tables HYROX.
- Banc local : `supabase/tests/hyrox_tests_pglite.mjs` (PGlite, sans Docker) : migrations rejouées, idempotence, seed, RLS.
- Les 10 anciens presets HYROX (`hyrox_legacy`) sont masqués des listes de choix (`isPickableTest` dans `src/features/shared/types/tests.ts`) : banque de tests du coach, ajout rapide et colonne de tests du planning, « ajouter un résultat ». Ils restent en base et restent chargés : leurs anciens résultats s'affichent et se corrigent toujours.
- Saisie : les séances remplies par l'athlète passent par le circuit existant (`test_sessions` → trigger → `athlete_test_results` / `athlete_test_values`) ; les noms des presets v3 sont uniques, entre eux et face aux presets existants, pour que le trigger les retrouve. D'où « Burpee broad jump 80 m · bilan » (l'ancien preset « Burpee broad jump 80 m » existe toujours ; test dédié).

### Interface

Coach : `/coach/athletes/:athleteId/hyrox?view=tests` → `src/features/coach/components/hyrox/tests/TestsView.tsx`.
- **Semaine de tests** (`BatteryPlan`) : séances S1 à S5 + semaine 1 avec le jour de la semaine type (lun S1 · mar S2 · jeu S3 · ven S4 · dim S5), protocole, vidéo à filmer, dernier résultat ; saisie dans `TestEntryDrawer` (charges des sleds pré-remplies à 80 / 100 / 120 % de la charge de course de la catégorie, grille 3 × 4 tronçons pour la semaine 1, temps en « m:ss » ou en secondes). Enregistrement = une ligne `test_sessions` complétée (mise à jour si le test existe déjà ce jour-là).
- **Analyses** : liste (validée ou non), « Nouvelle analyse » (`NewAnalysisPanel` : type, période, chrono visé, tests manquants, avertissements de profil, aperçu du chrono), comparaison de 2 analyses (`CompareAnalyses` : écarts colorés selon le sens de la grille).
- **Fiche résultat** (`AnalysisSheet`), dans l'ordre du prompt : chrono estimé + fourchette + leviers, radar bilan vs analyse précédente, points forts / faibles + drapeaux, course (`RunningSection` : VC, seuil 1, FC seuil, courbe vitesse-durée, 3 zones ; côté coach E, D′, 5 / 10 km, 6 zones de vitesse, zones FC, tableau % VC), sleds (`SledSection` : profils Push / Pull, ligne de la charge de course, réserve, semaine 1), détail par axe (`AxisDetail` : note, source, grille 1-5 dépliable « à construire, en dessous, moyen Open, haut d'Open, niveau Pro »), pistes par station (règles, coach), axes de travail (`AxesEditor`).
- **Axes** : contexte de l'athlète (compétition, cas types, envie, défauts techniques, dernière course pour la Roxzone, reprise depuis l'onglet Courses), proposition recalculée en direct, puis texte validé par le coach (`axes_validated`) avec alerte de vocabulaire (moteur, tenue, le HYROX, jargon coach). « Valider et montrer à l'athlète » / « Retirer la validation ».
- **Recalcul** (admin) : quand la version active des grilles ou du calcul a changé, crée une nouvelle analyse (`recalculated_from`), l'ancienne reste.
- **Calibration** (admin, onglet du même écran) : `CalibrationView`, écart réel − estimé, part dans la fourchette, plus gros écarts par segment, export CSV.

Athlète : onglet « Tests » de `/athlete/hyrox` → `AthleteTestsView` : ses bilans validés (fiche en mode athlète : 3 zones, pas de E, pas de 6 zones, pas de règles, axes validés seulement) et sa semaine de tests (saisie des tests en auto-saisie).

Hooks : `src/features/shared/hooks/hyrox/useHyroxTests.ts` (batterie, résultats, profil et catégorie, grilles par version et version active, analyses, brouillon, création, validation, calibration). Tests d'affichage : `src/features/coach/components/hyrox/tests/__tests__/AnalysisSheet.test.tsx` (vue athlète sans rien du côté coach).
