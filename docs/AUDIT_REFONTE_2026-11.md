# Audit de refonte Agon — novembre 2026

> Audit complet du 2026-11-07 (branche `dev`, commit `c910e5e`), fait en lecture seule après l'appel avec Benjamin (6 nov.).
> Objectif : faire émerger **tout** ce qui doit être repris pour repartir sur des bases saines, puis développer sans régressions — coach et athlète, sur ordi et sur téléphone.
> Gravité : 🔴 bloquant · 🟠 important · 🟡 mineur.

---

## 0. En une page

| Axe | État | Le problème principal |
|---|---|---|
| **Sécurité BDD** | 🔴 | 4 failles exploitables, dont 2 **sans être connecté** (profils coach lisibles avec poids/date de naissance/`coach_code`, tokens d'invitation listables, références perf modifiables par n'importe qui, athlète qui peut se passer coach). |
| **Garmin / Coros** | 🔴 | Coros **n'a jamais tourné** (secrets manquants, 0 connexion, 0 ligne en base) et a 2 bugs qui créeraient des trous définitifs. Coros passe par un canal MCP pas prévu pour la synchro tierce. Garmin : 0 code, mais la base `provider_*` est déjà en partie générique. |
| **Pertes de données athlète** | 🔴 | Un échec réseau au démarrage peut **écraser tout l'historique wellness/poids** en BDD. Saisie de séance perdue si l'app est fermée hors ligne. |
| **Lenteur** | 🔴 | Toute l'app est démontée/remontée **à chaque changement de page** (`App.tsx:95-99`) → tout se recharge. 50–70 requêtes au démarrage athlète, cache React Query non configuré. |
| **Régressions** | 🔴 | Deux modèles de données coexistent (`app_data` JSONB legacy + tables relationnelles), avec des « miroirs ». Même donnée écrite à 2 endroits selon l'écran, lue ailleurs depuis l'autre. **603 appels** BDD dans 140 fichiers, 258 clés de cache écrites à la main. |
| **Garde-fous** | 🔴 | Pas de CI, pas de protection de branche, 119 erreurs TypeScript invisibles, `types.ts` périmé, 1 hook testé sur 128. |
| **Instructions Claude** | 🟠 | `CLAUDE.md` décrit une app qui n'existe plus. Règles critiques seulement dans la mémoire locale d'Hugo → **Tito ne les a pas**. Aucun skill projet. |
| **BDD** | 🟠 | 80 tables, peu de mortes (5-6) mais beaucoup de doublons (6 systèmes de tests, RPE ×2, poids ×3). 5 requêtes visent des tables **qui n'existent pas**. 54 migrations non enregistrées. |
| **Front / design** | 🟠 | ~10 700 styles inline vs ~540 classes Tailwind, 100 couleurs en dur, tokens en double. Bloque le responsive (coach mobile / athlète PC). 86 fichiers morts (~14 700 lignes). |
| **RGPD / stores** | 🟠 | Suppression de compte oublie le bucket `docs`. Export incomplet (données montre, nutrition…). Aucun projet mobile. URL web de suppression requise par Google. |

**Ce qui est bon** : 925 tests verts (logique pure), build OK, aucun secret committé, RLS active partout, consentement RGPD solide, suppression de compte bien structurée, tokens Coros dans Vault, `coach-api` bien pensée, docs légales complètes.

---

## 1. Sécurité (à faire avant tout)

Source : audit BDD (requêtes catalogue sur la prod).

| # | Gravité | Faille | Correctif |
|---|---|---|---|
| S1 | 🔴 | `invitations_read_by_token` = `SELECT true` pour `public` → 30 invitations + tokens lisibles avec la clé anon. | Supprimer la policy (table legacy, 0 utilisée) ou RPC par token. |
| S2 | 🔴 | `profiles_select_coaches` (rôle `public`) → toutes les colonnes des 6 profils coach lisibles sans connexion : `coach_code`, `is_admin`, `weight_kg`, `body_fat_pct`, `birth_date`. | Vue/RPC `id, full_name` pour `authenticated` uniquement. |
| S3 | 🔴 | `set_active_performance_reference` : `SECURITY DEFINER`, sans contrôle, sans `search_path`, exécutable par `anon`. | `is_coach_of` + `search_path` + `REVOKE … FROM anon, public`. |
| S4 | 🔴 | `profiles_update_own` sans `WITH CHECK` : un athlète peut changer son `role` ou son `coach_id`. | Ajouter `role`/`coach_id` au trigger de garde. |
| S5 | 🟠 | `list_user_storage_objects` exécutable par `anon`. Crons exécutables par `anon`. | `REVOKE EXECUTE … FROM anon` global sur les `SECURITY DEFINER`. |
| S6 | 🟠 | Bucket `test-media` public ; upload `exercise-images`/`exercise-pdfs` ouvert à tous. | Bucket privé + URL signées ; écriture `service_role`. |
| S7 | 🟠 | `td_*_coach`, `tv_*_coach` : tout coach modifie/supprime les définitions de tests des autres. | Supprimer ces policies. |
| S8 | 🟠 | `WITH CHECK` sans `is_coach_of(athlete_id)` sur `test_sessions`, `weekly_retours`, `day_themes`, `docs` → un coach peut écrire chez l'athlète d'un autre. | Ajouter `is_coach_of`. |
| S9 | 🟠 | `coach_id` en dur (co-coach non couvert) : `athlete_claims_select_coach`, `docs_coach_insert`, `test_insert`, `unlink_athlete`, storage `athlete_read_test_media`. | Passer à `is_coach_of`. |
| S10 | 🟠 | `provider_connections` / `provider_activities` en écriture libre pour l'athlète → il peut changer `api_host` (le serveur appellerait l'hôte de son choix) ou injecter de fausses activités `garmin`. | Lecture seule ; écriture directe limitée à `source='file_import'`. |
| S11 | 🟠 | GitHub : secret scanning, push protection, Dependabot désactivés. `npm audit` : 14 failles hautes (`react-router`, `xlsx`, `zod`, `ws`). | Activer (gratuit sur repo public), mettre à jour, retirer `xlsx` (code mort). |
| S12 | 🟡 | `.claude/settings.local.json` suivi par git, JSON invalide (ligne 80), autorise `git push:*`. `supabase/.temp/*` suivi. CORS `*`. pgTAP/pg_net dans `public`. | Sortir de git (garder un `settings.json` partagé), ignorer `.temp`, restreindre CORS. |

**Avant de toucher la BDD** : dump complet (`supabase db dump --linked`) + vérifier le PITR dans le dashboard.

---

## 2. Garmin + Coros (priorité n°1 produit)

Source : audit intégrations + docs officielles Garmin (liens en bas).

### 2.1 Coros : état réel

- 🔴 **Jamais fonctionné.** `APP_URL` absent des secrets → `provider-coros-connect` répond 503 (`index.ts:55-65`). Secrets Vault `project_url`/`service_role_key` absents → le cron `coros-sync` tourne chaque nuit sans rien faire (`20261028150000_coros_sync_cron.sql:78-81`). Tables `provider_*` à 0 ligne.
- 🔴 **C1 — activités perdues** : le curseur `synced_through` avance jusqu'à aujourd'hui → une sortie à 18 h après la synchro de 3 h 40 n'est **jamais** récupérée (`provider-coros-sync/index.ts:420-422, 467-468`).
- 🔴 **C2 — trous définitifs** : une erreur Coros (quota, mauvais paramètre) est traitée comme « 0 fichier » et le curseur avance quand même (`:444, :466-467`).
- 🟠 C3 quota 50 FIT/jour non suivi · C4 paramètres `startDate/endDate` jamais vérifiés · C5 refresh token : erreur réseau = « reconnexion requise », pas de verrou cron/manuel · C6 tous les athlètes dans un seul appel → timeout à 15 athlètes · C7 dédoublonnage fichier vs montre incohérent (±2 min côté import, octet-identique côté Coros) · C9 dailies (sommeil, VFC) stockés mais lus par aucun écran.
- 🟠 **Les données montre ne servent à rien dans l'app** : volume de course (`useRunningVolume.ts:33-46`) et km/semaine (`useWeeklyDistances.ts`) ne lisent que la saisie manuelle. Une sortie montre n'est ni comptée ni rattachée à la séance prévue.
- 🔴 **Risque stratégique** : selon le support Coros, le serveur **MCP** utilisé ne couvre pas la synchro vers une plateforme tierce — il faut la **Partner API Coros**. Conditions Coros jamais relues.

### 2.2 Garmin : ce qu'il faut savoir

- **Paliers** : *Starter* = **push uniquement, sans historique**, nb d'utilisateurs limité. *Enterprise* = ping/pull + historique. Clé *Personal* = ton propre compte, en pull (utile pour récupérer des vrais exemples de données).
- **OAuth 2.0 PKCE** avec **`client_secret` obligatoire** (≠ Coros), access token 24 h, refresh ~90 j **renouvelé à chaque usage**.
- **Obligatoire** : endpoint `DELETE /wellness-api/rest/user/registration` (à la déconnexion et à la suppression de compte), webhook *User Permission Change*, `GET /user/id`. Répondre **200 en quelques secondes** puis traiter en arrière-plan, accepter les notifications en double. L'outil *Partner Verification* contrôle ces endpoints avant la prod.
- **Attribution** « Garmin [modèle] » visible sur les vues, dans les exports et les API — sinon suspension possible.
- 🟠 **Piège push** : en Starter on n'appelle presque jamais Garmin → le refresh token expire en 90 j → plus possible d'appeler le `DELETE registration`. Il faut un cron de rafraîchissement.
- 🟠 **Incohérence avec le dossier Garmin** : `GARMIN_DOSSIER.md` §3 promet que la déconnexion supprime les données obtenues, mais `provider-disconnect` **garde** les activités (`:14-18`). À aligner avant la review.

### 2.3 Base commune à construire (prête avant l'approbation Garmin)

Déjà générique : enum `data_source` (avec `garmin`), `provider_connections` (avec `external_user_id`), `provider_tokens`, `provider_activities`, `provider_dailies`, consentement `garmin_sync`, `provider-disconnect`.

À généraliser :
- `_shared/oauth.ts` générique + **un adaptateur par fournisseur** (autoriser, échanger, rafraîchir, révoquer, identifier l'utilisateur).
- `provider-coros-callback` → callback commun. UI `ConnectedServicesSection` → une ligne par fournisseur.
- SQL : `source_consent_granted` fait `ELSE 'coros_sync'` (toute nouvelle source hérite du consentement Coros !) → colonne `consent_purpose` dans `data_source_policies`.
- Ajouts BDD : index unique `(provider, external_user_id)`, colonne `device_name`, table de réception brute des webhooks, `raw` par type de dailies.
- Dédoublonnage ±2 min **côté serveur**, commun à toutes les sources.

---

## 3. Fiabilité de la saisie athlète

Source : audit hors-ligne.

| # | Gravité | Scénario de perte | Où |
|---|---|---|---|
| P1 | 🔴 | **Historique écrasé** : `sLoad` ignore l'erreur et renvoie `{}`. Si la lecture de `asp:wh` échoue au démarrage, le wellness suivant réécrit `{aujourd'hui}` et **efface l'historique en BDD**. Idem poids, séances libres, blessures, nutrition. | `src/lib/storage.ts:45-58` |
| P2 | 🔴 | App fermée/tuée hors ligne pendant la séance → la saisie n'existait qu'en mémoire. | `WorkoutDetailPage.tsx:2195-2197` |
| P3 | 🟠 | Dernier envoi raté sans saisie derrière → perdu (la file est vidée avant l'envoi). | `useSaveWorkoutSets.ts:70` |
| P4 | 🟠 | Séance ouverte hors ligne → au retour du réseau, la 1re série **efface `coachOverride` et les commentaires**. | `useWorkoutSession.ts:221-228` |
| P5 | 🟠 | Le dernier qui écrit gagne : l'athlète renvoie tout `athlete_modifications` et écrase une modif coach faite pendant la séance. | — |
| P7 | 🟠 | Séance énergie et wellness en cours : rien n'est sauvegardé avant « Valider ». | `TodayPage.tsx:488`, `WellnessFlow` |
| P6/P8 | 🟡 | Envois dans le désordre ; doublons au double-tap (pas d'id client). | `useStartUnplannedSession.ts:76` |

Aussi : le manifest est en `display: browser` (l'app ne s'installe pas vraiment) et iOS peut effacer les données d'un site non installé au bout de 7 jours.

---

## 4. Lenteur

Sources : audits front + hors-ligne.

- 🔴 **`App.tsx:95-99`** : `AnimatePresence` + `key={location.pathname}` autour de `<Routes>` → chaque navigation démonte tout (`CoachShell`, `AthleteProvider`…) et relance ~25 requêtes. **C'est LA cause des « pages qui se rechargent ».** ~1 h de correction.
- 🔴 Un seul `<Suspense>` pour toute l'app (`App.tsx:206`) → spinner plein écran à chaque première visite de page.
- 🟠 `new QueryClient()` sans réglages (`App.tsx:72`) : `staleTime` 0 + refetch au focus → chaque déverrouillage du téléphone entre deux séries relance tout.
- 🟠 Démarrage athlète : 5-6 allers-retours en cascade, **50-70 requêtes**, 3 réécritures de blobs et un backfill à **chaque** ouverture (`useAthleteLogic.ts:74-190`, `useAthletePersistedState.ts:198-202`).
- 🟠 Contexte athlète non mémoïsé qui contient le minuteur → `WorkoutDetailPage` (3 494 lignes) se re-rend chaque seconde pendant le repos.
- 🟡 Bundle : ~400-500 Ko gzip avant le premier affichage, Recharts chargé dès le layout athlète, polices Google en `@import` bloquant.

---

## 5. Couche données et régressions

Source : audit couche données.

### 5.1 Les causes concrètes des régressions

1. 🔴 **Lire le programme écrit en base** : ouvrir un cycle réécrit `asp:exos/sessions/completed` (miroirs lus par les vues coach) avec des erreurs avalées (`useAthletePersistedState.ts:194-202`).
2. 🔴 **Validation de séance à 2 endroits** : l'ancien parcours écrit `asp:completed`, l'actuel seulement `workout_logs`. Or le suivi coach (`get_coach_overview`, `useCoachOverview.ts:109`, `useMissedWorkouts.ts:50`) lit `asp:completed` → **suivi coach probablement faux**. RPE : écrit dans `workout_logs` **et/ou** `workout_rpe` selon l'écran, `useMicroStats` lit `workout_rpe` (4 valeurs déjà divergentes en prod).
3. 🔴 **Requêtes vers des tables inexistantes** (erreurs avalées par `?? []`) : `wellness_logs` (`useMicroStats.ts:29`), `nutrition_strategy`/`nutrition_daily_log` (retours hebdo/mensuels), `session_exercises` (`useUnifiedCalendar.ts`). → les retours n'affichent jamais la nutrition, les stats micro jamais le wellness. Colonne inexistante `test_sessions.coach_validated` demandée par les retours → erreur 400, tests absents des retours *(corrigé le 2026-11-07)*.
4. 🟠 **VMA/FCmax** : l'écran athlète `PerformanceProfile.tsx:96-191` est hors React Query et n'invalide jamais `athlete-references` → les cibles d'intensité restent périmées. (= exactement « je change la FC, un autre écran ne suit pas »).
5. 🟠 **Records (1RM)** : deux formules d'Epley (arrondi 0,5 vs 1 kg) → coach et athlète n'affichent pas le même 1RM. `useAutoComputePRs` jamais appelé.
6. 🟠 **Coach et athlète lisent des sources différentes** : nutrition (athlète écrit `app_data`, coach lit des tables vides), blessures (`coach-api` lit l'ancienne clé `asp:injuries` au lieu de `medical_entries`).
7. 🟠 **Invalidations faites à la main** : 6 listes différentes pour `workout_logs`, aucune complète.
8. 🟠 **`athlete_modifications` JSONB sans schéma**, lu/écrit par 24 fichiers chacun à sa façon.
9. 🟡 Score wellness recalculé à 3 endroits avec des seuils différents.

### 5.2 Architecture recommandée (≠ conseil de Benjamin, sur la forme)

Benjamin a raison sur le fond (**un seul contrat d'accès aux données, testé, partagé par toutes les interfaces**). Mais une API REST en Edge Functions serait trop lourde ici : il faudrait réécrire toutes les règles d'accès (RLS contournée par la clé service), ça ajoute de la latence, et ça ne règle pas les doublons (ils passeraient juste côté serveur).

**Recommandation** :
- **`src/api/<entité>.ts`** : fonctions typées au-dessus de supabase-js + RLS (la RLS reste la barrière de sécurité). Une entité = fonctions d'accès + clés de cache + invalidations + tests. Les hooks React Query deviennent de simples adaptateurs.
- **RPC Postgres** seulement pour les opérations multi-tables : valider/rouvrir une séance (log + RPE + PR), déplacer/redimensionner des cycles, résumé coach.
- **Code métier partagé** (lecture `sessionSets`, score wellness, Epley, résumé) dans `supabase/functions/_shared/domain/`, importé par le front (`@shared`) **et** par `coach-api`.
- Règle ESLint : interdit d'importer le client Supabase hors de `src/api/`.
- Réutilisable tel quel en mobile (Capacitor ou Expo).

### 5.3 Ordre de migration (entité par entité, sans big-bang)

1. Séances réalisées (`workout_logs`) : parseur zod d'`athlete_modifications`, RPC `complete_workout`, une seule fonction d'invalidation.
2. Wellness (source unique, `calcScore` unique, corriger `useMicroStats`).
3. Références perf + records.
4. Nutrition + blessures (source unique, aligner coach et `coach-api`).
5. Planification (sortir les 22 appels de `TimelineView.tsx`, RPC atomiques pour les cycles).
6. Énergie, tests/Hyrox, fiches (surtout du déplacement).
7. Ancien programme `asp:*` en dernier : supprimer les miroirs, migrer `get_coach_overview` vers `workout_logs`.
8. Puis sortir les données de santé d'`app_data` vers de vraies tables (`wellness_logs`, `body_weight`, `nutrition_*`) : double écriture → bascule lecture → suppression.

---

## 6. Base de données

Source : audit BDD (80 tables, 34 profils).

- **Mortes** (à supprimer après export) : `planning_blocks`, `seasons`, `tests`, `test_results`, fonction `check_microcycle_dates`, clés `app_data` `test` et `asp:blocs`.
- **Legacy à trancher** : `invitations` (30 lignes, 0 utilisée), `retours`/`retours_votes` (remplacés par `weekly_retours`/`app_feedback`).
- **Doublons à fusionner** : 6 systèmes de tests (le même résultat stocké 3 fois via triggers) · RPE ×2 · poids ×3 (`profiles.weight_kg`, `asp:bw`, `measurement_logs`) · planification relationnelle + `asp:prog` (184 Ko) · `workout_logs.session_id` = texte pointant dans du JSON.
- **Dormantes (à garder)** : `provider_*`, `athlete_claims`, `account_deletions`, `hyrox_race_plans`… (features récentes pas encore utilisées).
- **Migrations** : 54 versions appliquées à la main mais pas enregistrées · 3 numéros de version en double · `20260404_nutrition.sql` jamais appliquée · table `exercises` créée à la main (aucun `CREATE`). Un `supabase migration repair` rendrait `db push` utilisable à nouveau (à décider).
- 🟡 ~60 clés étrangères sans index (dont `profiles.coach_id`, lu par presque toutes les policies) · `updated_at` jamais mis à jour sur 7 tables · policies en double · `test_definitions` exclut le rôle `coach_athlete`.

---

## 7. Front et design system

Source : audit front.

- **Structure** : 3 dossiers qui se chevauchent (`components/`, `features/`, `pages/`), dépendances croisées coach↔athlète (25 imports). 13 `.jsx` dont 6 morts (`WeightliftingTracker.jsx`, `CoachProgramEditor.jsx`…). **86 fichiers morts, ~14 700 lignes** (+ 25 primitives shadcn inutilisées, design system `components/agon` jamais importé).
- **Gros fichiers** : `WorkoutDetailPage.tsx` 3 494 l., `TimelineView.tsx` 2 027, `TodayPage.tsx` 1 932, `ProgramPage.tsx` 1 626.
- **Design** : la charte vit dans un objet JS `C` (`lib/theme.ts`) appliqué en `style={{}}` (~10 700 fois) → **pas de media queries possibles → pas de responsive**. Tokens en double et divergents (`index.css` vs `theme.ts`), 1 189 hex en dur (100 couleurs distinctes, restes de palettes par défaut), polices en inline (1 479×), tailles de 7 à 10 px très fréquentes. 1 422 `<button>` natifs vs 5 `<Button>`, 122 modales maison.
- **Charte** : `public/brand/` contient logos, symboles, motifs (DA « Tranchant B » : obsidienne, basalte, or `#FFC933`, sable, terracotta). Pas de document de charte dans le repo ; la source est sans doute sur le disque externe `AGON` (non monté pendant l'audit).
- **Coach sur mobile bloqué par** : styles inline, timeline `react-rnd`, grilles 7 colonnes fixes, drawers 380-780 px, survols en JS, pas de support tactile dnd-kit.
- **Athlète sur PC bloqué par** : colonne figée 480 px, barre d'onglets fixe en bas, ~10 overlays plein écran, pas de navigation desktop.

**Conseil Benjamin (Claude Design)** : bon, **à condition d'unifier les tokens d'abord** — importer l'état actuel (100 couleurs) figerait le désordre.

---

## 8. Garde-fous, instructions Claude, docs

Source : audit qualité.

- 🔴 **Pas de CI** (`.github/` absent) : Vercel déploie `main` sans `tsc`, tests ni lint. 🔴 **Pas de protection de branche** ; les 10 dernières PR mergées sans review.
- 🟠 **119 erreurs `tsc`** (dont de vrais bugs), `strict: false`, `types.ts` périmé (13 tables manquantes), `.jsx` jamais lintés.
- 🟠 **Tests** : 925 verts mais 1 hook sur 128 ; 8 fichiers de tests RLS pgTAP qui ne tournent jamais automatiquement ; aucun test e2e.
- 🟠 **`CLAUDE.md` périmé** (parle d'`app_data` sans auth et du monolithe de 2 500 lignes ; ignore staff, co-coach, providers). `docs/CLAUDE.md` contredit le workflow (feature branches). `docs/AUTOMATISATION PUSH/` fait `git add .`.
- 🟠 **Règles critiques uniquement dans la mémoire d'Hugo** (jamais `db push`, release notes à chaque lot, `is_coach_of` dans les policies, merger `main` avant PR) → **Tito ne les a pas**.
- 🟠 **Aucun skill projet.** À créer : `nouvelle-fonctionnalite` (checklist coach/athlète/staff/co-coach, RLS, consentement, export RGPD, tests, release notes), `migration-bdd`, `edge-function`, `integration-provider`, `preparer-pr`, `rgpd-check`.
- 🟡 Docs en double racine/`docs/` qui ont divergé (`DB_AUDIT`, `DB_MIGRATIONS`, `PROGRESS`…), docs d'architecture d'avril.

---

## 9. RGPD et stores

- 🔴 **Suppression de compte** : le bucket `docs` n'est pas purgé (`delete-account/index.ts:35`, `20261027110000_right_to_erasure.sql:99`) → photos et fichiers survivent.
- 🔴 **Export** (`src/lib/dataExport.ts`) : manque `provider_activities`/`provider_dailies` (FC, sommeil), nutrition, hyrox, staff, co-coach, `coach_api_*`…
- 🟠 Politique : âge minimum 15 ans annoncé mais **non vérifié** à l'inscription ; durée de sauvegarde à aligner sur le plan Supabase.
- 🟠 **HDS** : Supabase UE mais non certifié HDS. Avec la feature kiné (saisie médicale par des pros de santé), l'app peut tomber sous l'art. L.1111-8 CSP → **avis juriste** à prévoir avant ouverture large.
- 🟠 **Stores** : aucun projet mobile ; Google exige une **URL web** de suppression de compte ; compte démo stable en prod pour la review ; privacy labels Apple / Data safety Google à préparer.

---

## 10. Feuille de route

> Dates : Claude Max s'arrête le **11 novembre** → les chantiers lourds et transverses (beaucoup de fichiers, beaucoup d'agents) passent avant. App stores : janvier-février 2027.

### Phase 0 — Urgences (avant le 11/11) · ~1-2 j
- [ ] Dump BDD + vérif PITR.
- [x] Lot sécurité S1→S10 (une migration, tests pgTAP associés).
- [x] P1 : `sLoad` ne renvoie plus de valeur par défaut sur erreur + blocage des écritures non chargées.
- [x] P2/P3 : brouillon local de la séance en cours (+ énergie, wellness).
- [x] Bucket `docs` dans la suppression de compte.
- [x] `App.tsx` : retirer la remontée à chaque navigation + `Suspense` par shell + réglages `QueryClient`. (Gain de vitesse immédiat, ~1 h.)

### Phase 1 — Garde-fous (avant le 11/11) · ~1-2 j
- [x] CI GitHub Actions (`npm run check` : `tsc` ≤ `.tsc-baseline` (99), lint, vitest, build) + Dependabot (vers `dev`).
- [ ] Protection de `main` + secret scanning (réglages GitHub, à faire par le propriétaire du repo).
- [x] Régénérer `types.ts`.
- [x] Réécrire `CLAUDE.md` à partir du réel ; y mettre les règles de la mémoire d'Hugo ; supprimer `docs/CLAUDE.md` et `AUTOMATISATION PUSH`.
- [ ] Sortir `settings.local.json` de git (JSON invalide ligne 80 : virgule manquante avant les lignes Windows) — décision Hugo/Tito.
- [x] Créer les skills projet (§8) : `.claude/skills/`.
- [x] Supprimer le code mort (84 fichiers, 14 500 lignes) et 24 dépendances inutiles.

### Phase 2 — Garmin + Coros (priorité produit) · ~2-3 sem.
- [ ] Coros : configurer `APP_URL` + secrets Vault, **première vraie connexion** (Hugo ou un athlète Coros), mettre la doc à jour avec ce qu'on observe.
- [ ] Coros : corriger C1, C2, C3, C5, C6, S10, dédoublonnage serveur.
- [ ] Lire les conditions Coros + **demander la Partner API Coros** en parallèle.
- [ ] Base provider générique (OAuth commun + adaptateurs, callback/UI communs, `consent_purpose`, migrations §2.3).
- [ ] Garmin : webhook (stockage brut → 200 → traitement), deregistration + permission change, cron de refresh, attribution « Garmin [modèle] ». Tests sur des exemples de données (clé Personal).
- [ ] Faire compter les données montre dans le volume de course + rattacher aux séances prévues.
- [ ] Aligner `GARMIN_DOSSIER.md` et le comportement de la déconnexion.
- [x] Export RGPD : ajouter les données provider.

### Phase 3 — Confort athlète (hors ligne) · ~2 sem.
- [ ] Phase 1 hors ligne : `vite-plugin-pwa`, manifest `standalone`, cache React Query persisté (IndexedDB), toutes les `queryFn` lèvent une erreur au lieu de renvoyer `null`.
- [ ] Phase 2 hors ligne : file d'attente des écritures (IndexedDB), ids générés côté client, séparer `coachOverride` de `athlete_modifications`, indicateur « N saisies en attente ».
- [ ] Sortir le backfill et les écritures miroir du démarrage.

### Phase 4 — Couche données (fin des régressions) · ~3-4 sem., entité par entité
- [ ] `src/api/` + RPC ciblées (§5.2), dans l'ordre du §5.3.
- [ ] Corriger les 5 requêtes vers des tables inexistantes.
- [ ] Fusion RPE, tests, poids ; suppression des tables mortes ; `migration repair` si validé.
- [ ] Sortir santé puis programme d'`app_data`.

### Phase 5 — Design system · ~1-2 sem.
- [ ] Récupérer la charte source (disque `AGON`) + un seul fichier de tokens → `tailwind.config` + `theme.ts` dérivé (échelle typo ≥ 11 px).
- [ ] Importer dans **Claude Design** ; toutes les maquettes partent de là.
- [ ] Primitives `src/ui` stylées Agon sur shadcn (Button, Input, Select, Dialog/Sheet responsive, Module, Stat, Tag, EmptyState, Skeleton).

### Phase 6 — 4 fronts (coach PC/mobile, athlète mobile/PC) · écran par écran
- [ ] Shell responsive par rôle.
- [ ] Migrer chaque écran inline → Tailwind avec breakpoints, à partir des maquettes Claude Design ; découper les gros fichiers.

### Phase 7 — Stores (janv.-fév. 2027)
- [x] Décision **Capacitor** (recommandé : réutilise tout le code web et le hors-ligne ; plugins santé suffisants) vs React Native/Expo (réécriture de ~13 000 lignes d'UI athlète). À acter dans `DECISIONS.md` (CLAUDE.md dit encore Expo).
- [ ] Comptes Apple (99 $/an) + Google (25 $ une fois). Attention : un compte Google personnel récent doit faire un test fermé (12 testeurs, 14 jours) avant la prod.
- [ ] URL web de suppression de compte, compte démo stable, privacy labels / Data safety, vérification d'âge.
- [ ] Avis juriste HDS si la feature kiné est ouverte largement.

---

## 11. Décisions à prendre (Hugo)

1. ✅ *Décidé : oui.* **Ordre** : sécurité + pertes de données + garde-fous **avant** Garmin ? (recommandé : oui, ~3 j, et c'est ce qui profite le plus de Claude Max).
2. ✅ *Décidé (2026-11-07) : `src/api/` + RPC.* **Couche API** : `src/api/` + RPC (recommandé) plutôt qu'une API REST en Edge Functions ?
3. ✅ *Décidé (2026-11-07) : Capacitor.* **Mobile** : Capacitor (recommandé) ou React Native/Expo ?
4. ✅ *Décidé : supprimer (imports de fichiers gardés).* **Déconnexion d'une montre** : garder ou supprimer les activités importées ? (le dossier Garmin promet la suppression)
5. ✅ *Décidé : oui, comptées une seule fois.* **Données montre** : les compter dans le volume de course et les rattacher automatiquement aux séances prévues ?
6. **Legacy** : supprimer `invitations` et `retours` (archivés en CSV avant) ?
7. **Migrations** : faire le `migration repair` (rend `db push` à nouveau sûr) ?
8. **Charte** : brancher le disque `AGON` pour récupérer la charte source.

---

## Sources Garmin / Coros

- [Garmin – Program overview](https://developer.garmin.com/gc-developer-program/overview/)
- [Garmin – OAuth2 PKCE spec (PDF)](https://developerportal.garmin.com/sites/default/files/OAuth2PKCE.pdf)
- [Garmin – API Brand Guidelines (PDF)](https://developer.garmin.com/downloads/brand/Garmin-Developer-API-Brand-Guidelines.pdf)
- [Garmin – Program FAQ](https://developer.garmin.com/gc-developer-program/enterprise/program-faq/)
- [COROS support – MCP vs Partner API](https://support.coros.com/hc/en-us/articles/53181619102996)
