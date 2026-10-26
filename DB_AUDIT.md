# DB_AUDIT.md — Agon Supabase Schema Audit
**Date :** 2026-04-27  
**Projet :** mxbfnkkbtmbrauvqplrt.supabase.co

---

## 1. Tables existantes

### `profiles`
| Colonne | Type | Contraintes |
|---|---|---|
| id | UUID | PK, FK → auth.users |
| role | TEXT | CHECK IN ('coach','athlete','coach_athlete') |
| full_name | TEXT | NOT NULL |
| coach_id | UUID | FK → profiles(id) SET NULL |
| coach_code | TEXT | UNIQUE |
| first_name | TEXT | |
| last_name | TEXT | |
| age | INTEGER | |
| height_cm | INTEGER | |
| gender | TEXT | CHECK IN ('male','female') |
| weight_kg | NUMERIC(5,2) | |
| body_fat_pct | NUMERIC(4,1) | |
| base_metabolism | INTEGER | |
| birth_date | DATE | |
| is_admin | BOOLEAN | DEFAULT false |
| habit_tracker_enabled | BOOLEAN | DEFAULT false |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### `app_data` ← stockage JSONB principal de l'app
| Colonne | Type | Contraintes |
|---|---|---|
| athlete_id | UUID | PK(partiel), FK → profiles |
| key | TEXT | PK(partiel) |
| value | JSONB | NOT NULL |
| updated_at | TIMESTAMPTZ | DEFAULT now() |

**Clés app_data utilisées en production :**
- `asp:wellness` — WellnessData du jour (score, fatigue, sommeil, stress, energie, doms)
- `asp:wh` — historique wellness (`Record<date_ISO, WellnessData>`)
- `asp:blockConfig` — configuration du bloc actif (startDate, totalWeeks, ...)
- `asp:sessions` — tableau des séances (`Session[]`)
- `asp:completed` — séances terminées (`Record<week_number, session_id[]>`)
- `asp:sessionlogs` — logs détaillés de séances
- `asp:prs` — PRs (`Record<exercise_id, number>`)
- `asp:coach_feedback` — feedbacks du coach pour cet athlète
- `app:user_feedback` — feedbacks in-app de l'athlète

### `invitations`
| Colonne | Type |
|---|---|
| id | UUID PK |
| coach_id | UUID FK → profiles |
| token | TEXT UNIQUE |
| email | TEXT |
| used_at | TIMESTAMPTZ |
| created_at | TIMESTAMPTZ |

### `seasons`
| Colonne | Type |
|---|---|
| id | UUID PK |
| coach_id | UUID FK → profiles |
| athlete_id | UUID FK → profiles |
| name | TEXT NOT NULL |
| start_date | DATE |
| end_date | DATE |
| created_at | TIMESTAMPTZ |

### `planning_blocks`
| Colonne | Type |
|---|---|
| id | UUID PK |
| season_id | UUID FK → seasons |
| coach_id | UUID FK → profiles |
| athlete_id | UUID FK → profiles |
| name | TEXT NOT NULL |
| type | TEXT DEFAULT 'custom' |
| start_week / end_week | INT |
| color | TEXT |
| parent_block_id | UUID FK → planning_blocks |
| sort_order | INT |
| created_at / updated_at | TIMESTAMPTZ |

### `competitions`
| Colonne | Type |
|---|---|
| id | UUID PK |
| coach_id | UUID FK → profiles |
| athlete_id | UUID FK → profiles |
| planning_block_id | UUID FK → planning_blocks |
| season_id | UUID FK → seasons |
| name | TEXT NOT NULL |
| type | TEXT DEFAULT 'competition' |
| date | DATE NOT NULL |
| location | TEXT |
| priority | TEXT DEFAULT 'A' |
| created_at | TIMESTAMPTZ |

### `exercises`
| Colonne | Type |
|---|---|
| id | UUID PK |
| name | TEXT |
| bloc | TEXT |
| target | TEXT |
| ex_type | TEXT |
| tier | TEXT |
| is_verified | BOOLEAN |
| created_by | UUID FK → profiles |
| youtube_id | TEXT |
| created_at | TIMESTAMPTZ |

### `nutrition_strategy`
| Colonne | Type |
|---|---|
| id | UUID PK |
| athlete_id | UUID FK UNIQUE |
| coach_id | UUID FK |
| strategy | TEXT CHECK IN ('maintenance','seche','prise_de_masse') |
| can_track_calories | BOOLEAN |
| total_calories_coach / macros_* | INTEGER |
| target_weight | DECIMAL(5,2) |
| created_at / updated_at | TIMESTAMPTZ |

### `nutrition_daily_log`
| Colonne | Type |
|---|---|
| id | UUID PK |
| athlete_id | UUID FK |
| date | DATE |
| active_calories / total_calories_consumed / macros_* | INTEGER |
| UNIQUE(athlete_id, date) | |

### ~~`energy_exercises`~~ ~~`energy_session_config`~~ ~~`energy_workout_logs`~~
> **SUPPRIMÉES** — migration `20260501000000_energy_sessions_refonte.sql`

### `energy_sessions` *(nouveau — 2026-05-01)*
| Colonne | Type | Contraintes |
|---|---|---|
| id | UUID | PK |
| name | TEXT | NOT NULL |
| session_kind | TEXT | NOT NULL CHECK IN ('vo2','tempo','seuil','footing','fartlek','autre','custom') |
| custom_kind | TEXT | NULL (obligatoire si kind='custom') |
| structure_type | TEXT | NOT NULL CHECK IN ('continu','fractionne') |
| intervals | JSONB | NOT NULL DEFAULT '[]' — voir src/types/energy.ts |
| total_duration_s | INTEGER | NULL |
| total_distance_m | INTEGER | NULL |
| notes | TEXT | NULL |
| created_by | UUID | FK → profiles(id) SET NULL |
| is_verified | BOOLEAN | NOT NULL DEFAULT false |
| verified_by | UUID | FK → profiles(id) SET NULL |
| verified_at | TIMESTAMPTZ | NULL |
| created_at / updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

**RLS :**
- SELECT : `authenticated` (banque partagée)
- INSERT : `role IN ('coach','coach_athlete')` + `is_verified = false` forcé
- UPDATE (auteur) : `created_by = auth.uid()` + session non-vérifiée seulement
- UPDATE (certifié) : `is_certified_coach = true OR is_admin = true` (peut set is_verified=true)
- DELETE : auteur (non-vérifiée) ou admin

### `energy_session_assignments` *(nouveau — 2026-05-01)*
| Colonne | Type | Contraintes |
|---|---|---|
| id | UUID | PK |
| athlete_id | UUID | NOT NULL FK → profiles(id) CASCADE |
| coach_id | UUID | FK → profiles(id) SET NULL |
| energy_session_id | UUID | NOT NULL FK → energy_sessions(id) RESTRICT |
| scheduled_date | DATE | NOT NULL |
| status | TEXT | DEFAULT 'planned' CHECK IN ('planned','in_progress','completed','missed','skipped') |
| microcycle_id | UUID | FK → microcycles(id) SET NULL |
| notes | TEXT | NULL |
| created_at / updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

**RLS :** `athlete_id = auth.uid()` OR `is_coach_of(athlete_id)` OR `is_admin`

### `test_sessions`
| Colonne | Type |
|---|---|
| id | UUID PK |
| athlete_id | UUID FK |
| coach_id | UUID FK |
| type | TEXT |
| title | TEXT NOT NULL |
| date | DATE |
| completed | BOOLEAN |
| results_structured | JSONB |
| planning_block_id | UUID FK |

### `performance_logs`
| Colonne | Type |
|---|---|
| id | UUID PK |
| athlete_id | UUID FK |
| metric_type / metric_name | TEXT |
| value | NUMERIC |
| unit | TEXT |
| date | DATE |
| test_session_id | UUID FK |
| is_active_reference | BOOLEAN |
| coach_validated | BOOLEAN |
| created_by | UUID FK |

### `performance_notifications`
| Colonne | Type |
|---|---|
| id | UUID PK |
| coach_id / athlete_id | UUID FK |
| performance_log_id | UUID FK |
| status | TEXT DEFAULT 'pending' |

### `retours`
| Colonne | Type |
|---|---|
| id | UUID PK |
| athlete_id | UUID FK |
| content | TEXT NOT NULL |
| created_at | TIMESTAMPTZ |

### `retours_votes`
| Colonne | Type |
|---|---|
| id | UUID PK |
| retour_id / user_id | UUID FK |
| vote | TEXT CHECK IN ('like','dislike') |
| UNIQUE(retour_id, user_id) | |

### `habits`
| Colonne | Type |
|---|---|
| id | UUID PK |
| athlete_id | UUID FK |
| name / emoji / color | TEXT |
| sort_order | INT |
| is_active | BOOLEAN |

### `habit_logs`
| Colonne | Type |
|---|---|
| id | UUID PK |
| habit_id / athlete_id | UUID FK |
| date | DATE |
| UNIQUE(habit_id, date) | |

---

## 2. Politiques RLS actuelles

### `profiles`
| Politique | Op | Condition |
|---|---|---|
| profiles_select_own | SELECT | auth.uid() = id |
| profiles_select_athletes | SELECT | coach_id = auth.uid() |
| profiles_select_coaches | SELECT | role IN ('coach','coach_athlete') |
| profiles_insert_own | INSERT | auth.uid() = id |
| profiles_update_own | UPDATE | auth.uid() = id |
| Users can update own profile | UPDATE | auth.uid() = id |
| coaches_can_update_athlete_profiles | UPDATE | coach_id = auth.uid() |
| Coach can unlink own athletes | UPDATE | coach_id = auth.uid() → SET NULL |

### `app_data`
| Politique | Op | Condition |
|---|---|---|
| app_data_self | ALL | athlete_id = auth.uid() |
| app_data_coach | ALL | EXISTS(profiles WHERE id=athlete_id AND coach_id=auth.uid()) |

### `invitations`
| Politique | Op | Condition |
|---|---|---|
| invitations_coach | ALL | coach_id = auth.uid() |
| invitations_read_by_token | SELECT | true (public) |

### `seasons`, `planning_blocks`, `competitions`
| Politique | Op | Condition |
|---|---|---|
| *_select | SELECT | coach_id = auth.uid() OR athlete_id = auth.uid() |
| *_insert | INSERT | coach_id = auth.uid() |
| *_update | UPDATE | coach_id = auth.uid() |
| *_delete | DELETE | coach_id = auth.uid() |

### `exercises`
| Politique | Op | Condition |
|---|---|---|
| exercises_select_all | SELECT | true (public) |
| exercises_insert_coach | INSERT | auth.uid() IS NOT NULL AND is_verified=false AND role IN ('coach','coach_athlete') |
| exercises_insert_admin | INSERT | is_admin = true |
| exercises_update_admin | UPDATE | is_admin = true |
| exercises_update_own | UPDATE | created_by = auth.uid() AND is_verified=false |
| exercises_delete_admin | DELETE | is_admin = true OR (created_by=auth.uid() AND is_verified=false) |

### `energy_session_config` ⚠️ PROBLÈME
| Politique | Op | Condition |
|---|---|---|
| energy_cfg_select | SELECT | athlete_id=auth.uid() **OR** role IN ('coach','coach_athlete') — **tout coach voit TOUTES les configs** |
| energy_cfg_insert/update/delete | * | role IN ('coach','coach_athlete') — **pas de filtre par athlète assigné** |

### `energy_workout_logs` ⚠️ PROBLÈME
| energy_log_select | SELECT | athlete_id=auth.uid() **OR** role IN ('coach','coach_athlete') — **idem** |

### `habits` ⚠️ PROBLÈME
| habits_select | SELECT | athlete_id=auth.uid() **OR** role='coach' — **tout coach voit TOUTES les habitudes** |

### `habit_logs` ⚠️ PROBLÈME (même pattern)

### `performance_logs` ⚠️ PROBLÈME
| perf_select | SELECT | athlete_id=auth.uid() **OR** role IN ('coach','coach_athlete') — **idem** |

### `test_sessions` ✅ OK
| test_select | SELECT | athlete_id=auth.uid() **OR** coach_id=auth.uid() — coach limité à ses tests |

### `retours` ⚠️ PROBLÈME
| Lecture retours | SELECT | auth.uid() IS NOT NULL — **tout utilisateur connecté voit tous les retours** |

---

## 3. Manques identifiés pour les nouvelles features

### 3.1 Home coach — vue agrégée multi-athlètes
**Besoin :** une seule requête pour KPIs (wellness, séances, compétitions, alertes, activité récente).

**État actuel :** 5 appels Supabase séparés dans useCoachOverview + hooks dédiés.

**Solution :** RPC `get_coach_overview(coach_uuid)` (Migration C).

### 3.2 Readiness Score — wellness_logs
**Besoin :** wellness avec colonnes explicites (fatigue, sommeil, stress, energie, doms, score, date, athlete_id).

**État actuel :** stocké en JSONB dans `app_data` clé `asp:wellness` (aujourd'hui) et `asp:wh` (historique).  
La structure JSONB est compatible — le schéma SQL dédié serait une migration future pour structurer les données existantes.  
Le readiness score est calculé côté client dans `useReadinessScore.ts` — pas besoin de RPC serveur.

### 3.3 Optimistic updates — retour de l'enregistrement complet
**Besoin :** les mutations doivent utiliser `.select().single()` pour que React Query reçoive la valeur serveur.

**État actuel :** `useFeedbacks.ts` et `useEnergySessions.ts` font des upsert sans `.select()`. Corrigé dans PROMPT 5 pour useFeedbacks.

### 3.4 Status workouts — champ statut
**Besoin :** status = planned | in_progress | completed | missed | skipped sur les séances.

**État actuel :** pas de table dédiée. Completion stockée dans `app_data[asp:completed]` (Set de session IDs).  
**Solution :** créer une table `workout_logs` (Migration B) pour les nouvelles séances. Données historiques restent dans app_data.

---

## 4. Indexes manquants

| Table | Colonnes | Motif |
|---|---|---|
| `app_data` | (key) | toujours filtré sur key |
| `app_data` | (athlete_id, key) | filtre composé fréquent |
| `competitions` | (athlete_id, date) | requêtes upcoming + dashboard |
| `planning_blocks` | (athlete_id) | lecture par athlète |
| `performance_logs` | (athlete_id, date DESC) | stats athlète |
| `test_sessions` | (athlete_id, date DESC) | tests athlète |
| `test_sessions` | (coach_id) | lecture coach |
| `habits` | (athlete_id) | filtre unique |
| `habit_logs` | (athlete_id, date DESC) | suivi journalier |
| `retours` | (athlete_id, created_at DESC) | vue coach |
| `energy_sessions` | (created_by), (session_kind), (is_verified) | banque partagée |
| `energy_session_assignments` | (athlete_id, scheduled_date), (energy_session_id) | planning énergie |

---

## 5. Requêtes N+1 identifiées

**Aucune N+1 critique** dans le code actuel. Tous les hooks coach utilisent `.in("athlete_id", athleteIds)` pour des requêtes batch.

Points d'attention :
- `useRecentActivity` : `limit * 3` over-fetch + dédup côté client — acceptable
- `useMissedWorkouts` : ré-utilise la même requête que `useCoachOverview` sur `app_data` — les données ne sont pas mise en cache entre hooks (clés React Query différentes). Une RPC consolidée éviterait ce doublon réseau.

---

## 6. Résumé des risques RLS

| Risque | Sévérité | Tables concernées |
|---|---|---|
| Coach voit les données d'athlètes d'autres coachs | 🔴 CRITIQUE | performance_logs, habits, habit_logs (energy_session_config/workout_logs supprimées) |
| Tous les utilisateurs voient tous les retours | 🟡 MODÉRÉ | retours |
| Backfill workout status impossible sans table dédiée | 🟡 MODÉRÉ | — |
| Données JSONB non structurées → migration future | 🟡 MODÉRÉ | app_data |

---

## 7. Ajouts 2026-07-18 — Banque Spécifique

| Table | Système | Rôle |
|---|---|---|
| `specific_sports` | relationnel | référentiel sports (globaux + customs coach) |
| `physical_qualities` | relationnel | référentiel qualités physiques (globaux + customs coach) |
| `specific_blocks` | relationnel | banque de blocs spécifiques, **privée par coach** |
| `energy_sessions.sport_id/quality_id/format/classique_structure` | relationnel | tri Sport→Qualité + format WOD/Classique des séances spécifiques |

Rappel : les séances spécifiques (WOD) sont **relationnelles** (`energy_sessions`, `session_kind='specifique'`) — aucun legacy `app_data` côté spécifique. La banque de blocs **musculaires** reste en JSONB `app_data` (`asp:bloc-bank`).
