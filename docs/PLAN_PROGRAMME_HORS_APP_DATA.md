# Programme d'entraînement hors d'`app_data` (P17) : conception

> Rédigé le 2026-11-12. **Conception seule : aucun code, aucune migration, aucune écriture en prod.**
> Modèle suivi : `docs/SANTE_TABLES.md` (santé sortie d'`app_data` en 4 étapes). Références : `docs/COUCHE_API.md`, `docs/AUDIT_REFONTE_2026-11.md` §5.1, §5.3 point 7, §6, `src/api/program.ts`.
> Compteurs prod lus le 2026-11-12 (agrégats seulement, aucune donnée d'athlète).

## 1. Point de départ

### 1.1 Volumes en prod

| Clé `app_data` | Lignes | Athlètes | Taille totale (max) | Dernière écriture | Statut |
|---|---|---|---|---|---|
| `asp:prog` | 23 | 23 | 202 Ko (24 Ko) | 2026-11-09 | **modèle actuel** : 98 séances, 285 blocs |
| `asp:session-bank` / `asp:bloc-bank` | 1 / 3 | (clé = coach) | 3 Ko / 7 Ko | 2026-10-31 | banques du coach, vivantes |
| `asp:blockConfig` | 18 | 18 | 5 Ko | 2026-11-10 | vivante (écrans planning, retours) |
| `asp:exos` (+ `::cycle`) | 40 | 14 | 68 Ko | **2026-11-12** | ancien modèle ; réécrite à chaque ouverture de cycle (miroir) |
| `asp:sessions` (+ `::cycle`) | 39 | 14 | 17 Ko | 2026-11-06 | ancien modèle, idem |
| `asp:completed` (+ `::cycle`) | 39 | 14 | 2 Ko | **2026-11-12** | ancien modèle ; plus lue par aucune stat vivante |
| `asp:freesess` | 11 | 11 | 7 Ko | 2026-11-12 | séances libres, **vivante** |
| `asp:sets` | 7 | 7 | 18 Ko | 2026-06-09 | morte en pratique (1RM historiques) |
| `asp:blockHistory` | 3 | 3 | 19 Ko | 2026-04-27 | blocs archivés (partie santé déjà projetée) |
| `asp:weekschedule`, `asp:exMeta`, `asp:anotes`, `asp:goals`, `asp:coach_feedback`, `asp:percycle_migrated` | 7, 5, 7, 7, 2, 34 | — | < 5 Ko chacune | variable | marginales |

`workout_logs` (679 lignes) pointe vers le programme par `session_id` **texte, sans clé étrangère** :
- 518 lignes : uuid d'une séance d'`asp:prog`, dont **40 orphelines** (séance supprimée du programme depuis) ;
- 144 lignes : identifiant de l'ancien modèle `s_…` (6 athlètes, dernière séance prévue 2026-10-15) ;
- 17 lignes : `demo-…` (compte démo, `scripts/seed-demo.mjs`).

### 1.2 Qui lit, qui écrit `asp:prog`

- **Écrivains** :
  - App : RPC `program_save_sessions` (`20261109110000_program_rpcs.sql`), appelée par `saveProgram` / `addProgramSessions` (`src/api/program.ts:135-166`). Verrou de ligne, séances envoyées seulement, conflit `40001` si une séance a changé entre-temps. Atomique.
  - **coach-api** (assistant IA du coach) : `writeKey` (`supabase/functions/_shared/coachApiDb.ts:38`), appelé par `coachApiApply.ts:124, 199, 435, 455` et `coachApiCareApply.ts:63`. **Upsert du blob entier, sans verrou**, protégé seulement par une empreinte prise à la création du brouillon (`coach-api/index.ts:705-711`).
  - Anciens clients (`main` et PWA restées ouvertes) : upsert direct possible.
- **Lecteurs** : `src/api/program.ts:71` → `useProgrammation` (semaine athlète, séance, calendrier coach, tiroir du jour, adaptation coach, volume musculaire, brouillons IA, staff, historique), `useWeeklyRetours`, `useMonthlyRetours`, `src/api/docs.ts:415`, `src/api/coaches.ts:305` ; côté serveur `coach-api/index.ts:356, 373, 516, 682`, `coachApiPlanApply.ts:260`, `coachApiCareApply.ts:35, 282`, `_shared/garminTraining/sync.ts:107`.
- **Effets de bord** : après un enregistrement, `syncDocAssignmentsFromProg` recopie les fiches des séances dans `doc_assignments` (RPC `sync_doc_assignments`).

### 1.3 L'ancien modèle « bloc » (clés par cycle)

`src/lib/storage.ts` et `useAthletePersistedState.ts` écrivent chaque valeur deux fois (clé du cycle `asp:x::<cycleId>` puis clé globale) et **recopient les clés du cycle sur les clés globales à chaque chargement** (`useAthletePersistedState.ts:374-378`, erreurs avalées). C'est la régression n°1 de l'audit (§5.1), toujours ouverte. `completeSession` écrit encore `asp:completed` **et** `workout_logs` (écran `/athlete/log`). `get_coach_overview` (SQL) lit `asp:completed` / `asp:sessions` / `asp:blockConfig` mais **n'est plus appelée nulle part**.

## 2. Modèle proposé

Trois principes, repris de la santé : une ligne par objet, `athlete_id → profiles(id) ON DELETE CASCADE`, écritures **uniquement par RPC** (les clients lisent, n'écrivent pas en direct).

### 2.1 Granularité : la question principale

| Option | Tables | Pour | Contre |
|---|---|---|---|
| **A. Une ligne par séance** (recommandée pour la bascule) | `program_sessions` avec `blocs jsonb` | correspond à l'unité de la RPC actuelle (conflit par séance) ; bascule simple ; le JSON des blocs est déjà validé par zod côté client | requêtes « quels athlètes font cet exercice » toujours en JSON |
| B. Normalisé jusqu'à l'exercice | `program_sessions` → `program_blocks` → `program_exercises` (`params jsonb` par occurrence) | requêtes SQL directes (volume, usage d'un exercice, envoi Garmin) ; FK vers `exercises` | 3 tables à synchroniser, réécriture de la RPC et de coach-api, ordre des éléments à maintenir sur 3 niveaux |

Recommandation : **A maintenant, B plus tard si un besoin SQL le justifie** (A → B est une migration interne sans changement de contrat pour le front, puisque tout passe par `src/api/program.ts`).

### 2.2 Tables (option A)

| Table | Clé | Colonnes |
|---|---|---|
| `program_sessions` | `id uuid` (**on garde les uuid actuels d'`asp:prog`** : les 518 `workout_logs.session_id` restent valides) | `athlete_id uuid NOT NULL` · `position int NOT NULL` (ordre d'affichage) · `name text NOT NULL` · `short text` · `day_of_week smallint CHECK 0-6` (0 = lundi) · `recurrence text CHECK ('weekly','once')` · `multi_semaine boolean` · `nb_semaines smallint` · `fiches jsonb` · `blocs jsonb NOT NULL CHECK (jsonb_typeof = 'array')` · `version int NOT NULL DEFAULT 1` (remplace la comparaison au `p_base` : conflit si la version envoyée ≠ version en base) · `legacy_key text UNIQUE` (identifiant `s_…` pour l'ancien modèle) · `archived_at timestamptz` (séance retirée du programme mais encore référencée) · `created_at`, `updated_at`, `updated_by uuid` |
| `coach_program_bank` | `id uuid` | `coach_id uuid NOT NULL → profiles` · `kind text CHECK ('session','bloc')` · `position int` · `payload jsonb` · `created_at`, `updated_at` (remplace `asp:session-bank` et `asp:bloc-bank`) |
| `workout_logs` (existante) | — | **ajout** `program_session_id uuid NULL REFERENCES program_sessions ON DELETE SET NULL` ; `session_id` texte gardé tel quel pendant toute la bascule ; `session_name` reste la copie affichée si la séance disparaît |

Les 40 séances orphelines deviennent des lignes `archived_at` reconstituées à partir de `session_name` (sans blocs) **ou** restent sans lien (`program_session_id NULL`) : question pour Hugo (§6).

### 2.3 RLS, droits, index

- `SELECT` : `athlete_id = auth.uid() OR is_coach_of(athlete_id) OR staff_can(athlete_id, 'seances', 'read')` (même domaine que `staff_app_data_domain('asp:prog')` aujourd'hui). Jamais `coach_id = auth.uid()` en dur. Banque : `coach_id = auth.uid()` (objet privé du coach, pas d'athlète).
- `INSERT / UPDATE / DELETE` : **aucun** pour `authenticated` et `anon`. Écritures par RPC `SECURITY DEFINER` qui contrôlent `auth.uid() = athlete OR is_coach_of(athlete)`.
- RPC : `program_save_sessions` (même signature qu'aujourd'hui, nouvelle implémentation), `program_archive_session`, `program_bank_save`. coach-api passe par les mêmes RPC (fin des upserts sans verrou).
- Index : `(athlete_id, position)`, `workout_logs(program_session_id)`, `coach_program_bank(coach_id, kind, position)`. Contrainte `UNIQUE (athlete_id, position) DEFERRABLE` pour l'ordre.
- `updated_at` par le trigger `set_updated_at` existant.

### 2.4 RGPD (skill `rgpd-check`)

Pas de donnée de santé (un programme est une donnée d'entraînement). Export : ajouter `program_sessions` et `coach_program_bank` à `src/lib/dataExport.ts` ; suppression : cascade depuis `profiles`. IA : `ai-program` (Gemini) ne lit pas `asp:prog` ; coach-api (assistant du coach) le lit et lira les tables avec les mêmes droits, rien ne change pour le consentement.

## 3. Synchronisation pendant la bascule

Comme pour la santé, la prod tourne avec le client de `main` et d'anciennes PWA qui réécrivent le blob entier. À chaque étape, **toutes les versions doivent continuer à marcher**.

- Étape 1 : trigger `AFTER INSERT OR UPDATE ON app_data WHEN key = 'asp:prog'` → `program_sync_from_app_data(athlete)` : upsert des séances présentes, `archived_at` pour celles qui ont disparu (jamais de suppression : des `workout_logs` peuvent y pointer). Erreurs consignées dans une table `program_sync_errors` (comme `health_sync_errors`), jamais bloquantes pour l'écrivain.
- Étape 3 : sens inverse, trigger sur `program_sessions` → réécrit `asp:prog` pour les vieux lecteurs ; garde anti-boucle par GUC `agon.program_sync` (même mécanisme que `agon.health_sync`).

## 4. Étapes

| # | Étape | Prod après l'étape | Retour arrière |
|---|---|---|---|
| **0** | Prérequis : P4 (version minimale des clients) en prod ; couper les miroirs de l'ancien modèle (`useAthletePersistedState.ts:374-378`) et l'écriture `asp:completed` de `/athlete/log` ; supprimer `get_coach_overview` (aucun appelant). | ancien modèle figé en lecture | git revert |
| **1** | Migration additive : tables, RLS, RPC internes, trigger `app_data → tables`, rattrapage des 23 programmes, colonne `workout_logs.program_session_id` remplie (uuid direct ; `s_…` via `legacy_key` à l'étape 5). Test SQL `supabase/tests/program_tables.sql` (BEGIN … ROLLBACK, joué par la CI « Tests SQL ») : rattrapage = blob (séance par séance), rejouer = aucun écart, RLS athlète / coach / co-coach / staff / autre coach / anon. Personne ne lit encore les tables. | inchangée pour les utilisateurs | `DROP` des nouvelles tables et du trigger (rien ne les lit) |
| **2** | Lecteurs migrés (dev → main) : `src/api/program.ts` lit `program_sessions` ; coach-api, `garminTraining/sync.ts`, `docs.ts`, `coaches.ts`, retours. Écritures toujours via `program_save_sessions` (qui écrit encore le blob, le trigger suit). | lectures sur les tables | revenir à la lecture du blob (git) ; le trigger maintient les deux |
| **3** | Inversion : `program_save_sessions` écrit les tables ; trigger `tables → app_data` pour les anciens clients ; coach-api passe par la RPC (fin des upserts sans verrou). Banques migrées de la même façon. | tables = source | réactiver l'écriture du blob dans la RPC (le trigger inverse garde le blob à jour, rien n'est perdu) |
| **4** | Quand plus aucun client d'avant l'étape 2 (suivi P4) : export JSON des clés, suppression des triggers et des clés `asp:prog`, `asp:session-bank`, `asp:bloc-bank`. **Irréversible** : accord explicite d'Hugo. | blob supprimé | restauration depuis l'export |
| **5** | Ancien modèle (piste séparée, après décision §6) : `asp:exos/sessions/completed/sets` des 14 athlètes → `program_sessions` archivées (`legacy_key`) pour garder l'historique des 144 `workout_logs` `s_…` ; `asp:blockConfig` → `cycles` / `microcycles` (déjà existants) ; `asp:freesess` → `workout_logs` de type « libre » ; `asp:blockHistory` → export puis suppression. | plus de clé programme dans `app_data` | export JSON pris avant |

Chaque étape : migration rejouable, script de rollback écrit avant, test à blanc sur la base liée, accord d'Hugo avant application, types régénérés, `docs/DECISIONS.md` à jour.

## 5. Ce que la bascule corrige au passage

- coach-api ne peut plus écraser une séance modifiée entre-temps (même RPC que l'app).
- `workout_logs` → séance devient une vraie clé étrangère (plus de texte qui pointe dans un JSON).
- Fin des miroirs de l'ancien modèle (régression n°1 de l'audit) et de la double écriture de la validation (n°2).
- Requêtes partielles possibles (une séance sans charger les 24 Ko du programme entier).

## 6. Questions pour Hugo

1. **Granularité** : option A (une ligne par séance, blocs en JSON) maintenant, B plus tard si besoin ? Recommandé : A.
2. **Séances orphelines** (40 `workout_logs` dont la séance a été retirée du programme) : reconstituer une séance archivée sans contenu, ou laisser sans lien ? Recommandé : laisser sans lien, `session_name` suffit à l'affichage.
3. **Ancien modèle** (14 athlètes, 144 séances `s_…` jusqu'au 2026-10-15) : migrer l'historique en séances archivées, ou le figer en lecture (export JSON) et ne plus l'afficher ? Recommandé : migrer, c'est l'historique d'athlètes réels.
4. **Séances libres** (`asp:freesess`, 11 athlètes) : dans `workout_logs` (type « libre ») ou dans `provider_activities` (comme une activité importée) ? Recommandé : `workout_logs`, c'est une saisie de l'athlète, pas d'une montre.
5. **Ordre avec P15/P16** (santé, bloqués exprès) : P17 peut démarrer l'étape 0-1 sans attendre. Feu vert ?
