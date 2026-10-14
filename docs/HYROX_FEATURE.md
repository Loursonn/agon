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
