# Plan : tables legacy, fusion des tests (P18), `migration repair`

> Rédigé le 2026-11-12. Lecture seule sur la prod : compteurs et définitions uniquement, aucune écriture, aucune donnée d'athlète affichée.
> Suite de `docs/AUDIT_REFONTE_2026-11.md` §6, §10 phase 4 et §11 (décisions 6 et 7).
> **État au 2026-11-13** : décision 6 exécutée (accord d'Hugo) : liens désactivés (`20261113162000`), lecteurs retirés de `src/`, archive CSV hors repo (disque externe d'Hugo), tables et fonctions supprimées (`20261113170100`). Hugo a accepté de supprimer avant la mise en prod de dev : jusque-là, l'export RGPD de `main` signale 3 tables en échec.
> Décision 7 : R0 (dump complet sur le disque externe ; le projet n'a ni PITR ni sauvegarde listée), R1 (3 doublons renommés +1 s), R2 (job `migrations-replay`) faits. R3 `repair` seulement si le diff R2 est vide.
> **R2 → R4 faits le 2026-11-13** : migration socle `20260411000000`, rattrapage `20261113235900` (écarts de la prod repérés dedans), 2 vieux fichiers corrigés, `20260510000000` neutralisée ; diff vide (run 43445643326). Doublons de version renommés. `repair --status applied` sur 116 versions (liste dans les notes de session), `20260503`/`20260507` renommées `…200000` et réinscrites. `db push --dry-run` : « Remote database is up to date ». R5 : règle dans `CLAUDE.md` et le skill `migration-bdd`, job R2 bloquant.
> **Résultat R2 (run 43345653860)** : diff non vide, donc **pas de `repair`**. 32 fichiers sur ~160 échouent au rejeu, en cascade depuis des objets créés hors migrations (`profiles.is_admin`, `test_sessions`, `performance_logs`, `exercises`, `energy_session_config`), plus un index refusé (`20260427120000`, fonction non IMMUTABLE dans le prédicat). Prochaine étape : une migration « socle » datée avant `20260412` qui crée ces objets tels qu'en prod, puis relancer le job jusqu'au diff vide.

Sommaire :
1. `invitations`, `retours`, `retours_votes` (décision 6)
2. P18 : fusion des tests et tables mortes
3. `supabase migration repair` (décision 7)
4. Ce qu'Hugo doit trancher

Règle commune à toutes les suppressions : **le client de prod vient de `main`**. Une table ne disparaît qu'après le déploiement sur `main` d'un client qui ne la lit plus (sinon l'export RGPD ou un écran tombe en erreur). D'où l'ordre, partout : export CSV → code sans lecteur (dev → main) → table fermée (réversible) → suppression.

---

## 1. `invitations`, `retours`, `retours_votes`

### 1.1 État en prod (2026-11-12)

| Table | Lignes | Dernière création | Activité depuis le dernier reset des stats | Contenu |
|---|---|---|---|---|
| `invitations` | 30 | 2026-07-16 | 30 insertions, 0 mise à jour | 3 coachs, **0 utilisée**, 0 e-mail. `token` texte, **sans date d'expiration** |
| `retours` | 1 | 2026-04-20 | 2 insertions, 1 suppression | ancien mur de suggestions (texte libre d'un athlète) |
| `retours_votes` | 1 | 2026-04-20 | 3 insertions, 2 suppressions | like / dislike sur `retours` |

Remplaçants déjà en place : `weekly_retours` (retours hebdo coach), `app_feedback` (avis sur l'app), `staff_invitations` + code coach (`link_to_coach_by_code`) pour le rattachement.

### 1.2 Lecteurs restants

**`invitations` n'est pas morte, elle est orpheline** : plus personne ne crée de lien, mais un ancien lien marche encore.
- Route `/invite/:token` (`src/App.tsx:176`) → `invitationIsValid` / `redeemInvitation` (`src/api/account.ts:94`, `:117`) → RPC `invitation_is_valid` et `redeem_invitation` (SECURITY DEFINER).
- `createInvitation` (`src/api/account.ts:236`) et `createInviteLink` (`src/hooks/useAuth.tsx:279`) : aucun composant ne les appelle.
- Export RGPD : `src/lib/dataExport.ts:148` (sans le jeton) et son test `src/lib/__tests__/dataExport.test.ts:61`.
- Policy `invitations` (1), test SQL `supabase/tests/security_lockdown.sql:27`.
- ⚠️ Sécurité : `invitation_is_valid` ne regarde que `used_at IS NULL`. Les 30 jetons restent valables sans limite de temps ; quiconque a gardé un lien peut encore se rattacher au coach qui l'a créé. Risque faible (jetons UUID aléatoires), mais aucune raison de le garder.

**`retours` / `retours_votes`** : plus aucun écran. Restent :
- l'export RGPD `src/lib/dataExport.ts:121` et `:133`, et `src/lib/__tests__/dataExport.test.ts:37` ;
- 7 policies, la FK `retours_votes.retour_id → retours ON DELETE CASCADE` ;
- les migrations `20260412_retours.sql` et `20260503200000_retours_comments.sql` (ex-`20260503_…`).
- La route `retours` de `App.tsx:240` et `useWeeklyRetours` lisent `weekly_retours`, pas ces tables.

`delete-account` s'appuie sur les cascades depuis `profiles` : supprimer ces tables ne change rien à la suppression de compte.

### 1.3 Plan (5 étapes, les 3 premières réversibles)

| # | Étape | Qui | Réversible |
|---|---|---|---|
| 1 | **Archive CSV** hors du repo (dossier choisi par Hugo) : `retours`, `retours_votes` en entier ; `invitations` **sans la colonne `token`** (un CSV qui traîne ne doit pas contenir de lien utilisable). Compteurs vérifiés : 30 / 1 / 1. Commande : `supabase db query --linked -o csv "select id, coach_id, email, used_at, created_at from invitations"` (idem pour les deux autres). | Hugo (ou Claude avec accord) | oui (lecture) |
| 2 | **Code** (dev → PR → main) : retirer la route `/invite/:token` et `InviteAccept`, `invitationIsValid`, `redeemInvitation`, `createInvitation`, `createInviteLink`, les 3 jobs de `dataExport.ts` et leurs tests, la ligne `invitations` de `security_lockdown.sql`. Une note dans « Nouveautés » n'est pas utile (rien de visible). | dev | oui (git) |
| 3 | **Fermer sans supprimer** (après déploiement de l'étape 2 sur `main`) : migration `REVOKE ALL ON invitations, retours, retours_votes FROM anon, authenticated` + `REVOKE EXECUTE` sur `invitation_is_valid` / `redeem_invitation`. Un vieux téléphone qui ouvrirait un lien reçoit « invitation inutilisable » au lieu de se rattacher. Observer une semaine (journaux PostgREST : aucun 401/403 sur ces tables). | migration, accord Hugo | oui (`GRANT` inverse dans le même fichier, commenté) |
| 4 | **Supprimer** : `DROP FUNCTION redeem_invitation(text), invitation_is_valid(text); DROP TABLE retours_votes, retours, invitations;` Test à blanc d'abord (`BEGIN; … ROLLBACK;` + `supabase/tests/` à jour), puis `supabase db query --linked -f`. | migration, accord Hugo | non (restauration = migrations d'origine + import du CSV) |
| 5 | Régénérer `src/integrations/supabase/types.ts`, cocher §11 décision 6 dans l'audit, entrée `docs/DECISIONS.md`. | dev | — |

**Recommandation : oui, supprimer.** Rien n'en dépend, `invitations` est même une petite porte ouverte. Coût : ~1 h de code + 2 migrations courtes.

---

## 2. P18 : fusion des tests et tables mortes

### 2.1 Où vivent les résultats de tests aujourd'hui

| Stockage | Lignes prod | Rôle | Vivant ? |
|---|---|---|---|
| `test_definitions` + `test_variables` | 68 / 144 (54 / 125 de bibliothèque) | catalogue (nom, variables, unité, extrapolation) | oui, à garder |
| `test_sessions` (+ JSON `results_structured`) | 28 (9 terminées avec résultats) | test **planifié** au calendrier, saisi par l'athlète ou le coach | oui |
| `athlete_test_results` + `athlete_test_values` | 15 / 19 | résultats en lignes typées | oui |
| `performance_logs` | 99 | **références actives** (VMA, FCmax, seuils) validées par le coach | oui, rôle différent |
| `tests` + `test_results` | 0 / 0 | ancien modèle | **lu** par 2 écrans planning, jamais écrit |
| `hyrox_results`, `hyrox_test_analyses`, `exercise_pr_logs` | 11 / ~3 / 48 | courses, analyses calculées, records de force | oui, hors périmètre (pas des tests) |

**Le même résultat est stocké 3 fois**, par triggers :

```
saisie athlète/coach ──► test_sessions.results_structured (JSON)
        trigger sync_test_session_to_results  (rapprochement par lower(nom) = lower(titre))
                    ──► athlete_test_results + athlete_test_values
        trigger sync_extrap_to_performance    (si la variable a une extrapolation)
                    ──► performance_logs (nouvelle référence active, coach_validated = true)
        trigger tg_test_values_propose_zones  (sv1_hr / sv2_hr) ──► hr_zone_models (proposition)
```

Défauts mesurés :
- **Rapprochement par le titre** : 3 des 9 séances de test terminées en prod (33 %) ont un titre qui ne correspond à aucune définition. Leur résultat reste dans le JSON, n'arrive jamais dans les courbes ni dans les références, et rien ne le signale.
- Saisie directe par le coach (`save_athlete_test_result`) : aucune `test_sessions`, donc rien au calendrier.
- Une référence posée par extrapolation est marquée `coach_validated = true` sans validation.
- Les écrans « progression des tests » d'un macrocycle (`getTestProgression`, `listMacrocycleTestResults`, `src/api/tests.ts:533` et `:614`) lisent `test_results`, **toujours vide** : ils affichent toujours « aucun résultat ».

### 2.2 Cible proposée

- **Une seule source pour un résultat : `athlete_test_results` / `athlete_test_values`.** Ajout d'une colonne `test_session_id uuid NULL REFERENCES test_sessions ON DELETE SET NULL` (et `test_definition_id` déjà présent) : le lien devient une clé, plus un titre.
- `test_sessions` reste l'objet **calendrier** (prévu, fait, note). `results_structured` devient une copie de lecture, puis disparaît.
- `performance_logs` reste la table des **références** (ce que le coach retient), alimentée depuis un résultat par une RPC explicite (`promote_test_value_to_reference`), avec `source_value_id`. Plus de « validé » automatique.
- `tests` / `test_results` supprimées ; les écrans de progression lisent `athlete_test_results`.

### 2.3 Étapes (toutes additives jusqu'à la dernière)

| # | Étape | Réversible | Bloquant |
|---|---|---|---|
| T1 | Requête de contrôle (lecture) : pour chaque séance terminée, résultat présent dans `athlete_test_values` ? écarts de valeurs ? Lister les 3 titres orphelins à Hugo (titres seulement). | oui | — |
| T2 | Migration additive : colonne `athlete_test_results.test_session_id` + index ; rattrapage des liens existants (même athlète, même définition, même date) ; le trigger existant renseigne la colonne. | oui (`DROP COLUMN`) | — |
| T3 | RPC `complete_test_session(p_session, p_values jsonb)` : écrit `test_sessions` (fait) **et** `athlete_test_results` par `test_definition_id` (choisi à la planification, plus deviné par le titre). Le trigger reste pour les anciens clients. | oui | P4 (version minimale des clients) conseillé |
| T4 | Front (dev → main) : saisie via la RPC, lectures uniquement sur `athlete_test_results`, écrans de progression macrocycle réécrits dessus. | oui (git) | T3 |
| T5 | Références : RPC `promote_test_value_to_reference` ; `sync_extrap_to_performance` crée une **proposition** (comme les zones FC) au lieu d'une référence validée. Décision produit d'Hugo (voir §4). | oui | décision |
| T6 | Quand plus aucun client d'avant T4 (suivi de version P4) : suppression du trigger `sync_test_session_to_results`, `results_structured` figé puis supprimé. | non | export JSON des 28 lignes |

### 2.4 Tables et objets morts

Méthode réversible pour chacun : **export → retrait des lecteurs dans le code → `ALTER TABLE x RENAME TO _archive_x` + `REVOKE ALL` (un écran oublié casse bruyamment, on renomme en sens inverse) → une à deux semaines → `DROP`.**

| Objet | Lignes | Ce qui le référence encore | Avant suppression |
|---|---|---|---|
| `workout_rpe` | 136 | export RGPD `dataExport.ts:128`, `scripts/seed-demo.mjs:71,190`, `supabase/tests/db_hygiene.sql`, `workout_rpcs.sql` ; FKs vers `workout_logs`, `profiles` | Export CSV. Contrôle : chaque RPE a son équivalent dans `workout_logs.rpe_score` (P18 du lot RPE : seule source depuis le 2026-11-08). Retirer export, seed, 2 tests. |
| `tests` + `test_results` | 0 / 0 | `src/api/tests.ts:533-537`, `:614-617` (2 écrans planning), `dataExport.ts:124`, `src/api/__tests__/tests.test.ts:281` | Étape T4 d'abord. |
| `planning_blocks` | 0 | FKs `competitions.planning_block_id` et `test_sessions.planning_block_id` (0 ligne renseignée), 5 policies, `dataExport.ts:96` | Retirer les 2 colonnes FK, puis la table. |
| `seasons` | 0 | **`src/api/staff.ts:294`** (planning du staff : casserait la vue), FKs `competitions.season_id` (0 renseignée), `planning_blocks.season_id`, `dataExport.ts:122` | Retirer la requête staff d'abord. |
| fonction `check_microcycle_dates` | — | aucun trigger ne l'utilise | `DROP FUNCTION` direct. |
| clés `app_data` `test` et `asp:blocs` | 1 + 1 (13 et 5 octets) | aucun code | Export puis `DELETE`. |
| `get_coach_overview` | — | aucun appel dans `src/` ni `supabase/functions/` ; seulement `supabase/tests/rpc_coach_overview.sql` ; lit `asp:completed` | À traiter avec P17 (voir `docs/PLAN_PROGRAMME_HORS_APP_DATA.md`). |

Ordre conseillé : `check_microcycle_dates` et clés mortes (aucun lecteur) → `workout_rpe` → `planning_blocks` / `seasons` → `tests` / `test_results` (avec T4).

**Avancement (2026-11-13)** :
- `workout_rpe` : plus aucun écrivain ni lecteur dans le code (dev et main), dernière écriture le 2026-11-09 ; 136 lignes, toutes rattachées à une séance, 1 seule valeur différente de `workout_logs.rpe_score` (qui fait foi). Le seed démo ne l'écrit plus. Restent `supabase/tests/db_hygiene.sql` (policies) à adapter le jour du `DROP`.
- `seasons` : la requête staff n'est plus dans dev ; **encore dans main** (`src/api/staff.ts:294`) → suppression après le prochain déploiement de main.
- Export RGPD : `workout_rpe`, `planning_blocks`, `seasons`, `test_results` sont tolérés absents (`OPTIONAL_TABLES`) : à déployer sur main **avant** toute suppression.
- `tests` / `test_results` : encore lus par `src/api/tests.ts` (progression d'un macrocycle) → T4 d'abord.
- Prochaine écriture en prod, à faire valider par Hugo (export CSV puis suppression irréversible) : `check_microcycle_dates`, clés `app_data` `test` et `asp:blocs`, `workout_rpe` (après déploiement de main), puis `planning_blocks` / `seasons` (colonnes FK vides comprises).

---

## 3. `supabase migration repair` (décision 7)

### 3.1 État mesuré (2026-11-12, `supabase migration list --linked`, lecture)

- **Distant** (`supabase_migrations.schema_migrations`) : 67 versions, la dernière `20260711000000`. Rien n'y est enregistré depuis juillet : tout ce qui a suivi a été appliqué à la main (`supabase db query --linked -f`), comme le veut `CLAUDE.md`.
- **Local** (`supabase/migrations/`) : 157 fichiers, dont **90 versions absentes de l'historique distant** (toutes celles d'après juillet, plus quelques-unes plus anciennes).
- **3 numéros en double** localement : `20260501000000` (energy_sessions_refonte + roadmap), `20261031100000` (athlete_hidden_by_coach + coach_api_semaine_annulation), `20261101100000` (coach_api_plan + exercises_second_primary_muscle). Le distant n'a qu'une ligne pour chacun.
- **12 fichiers à version courte** (`20260404_…`, 8 chiffres). Ils correspondent bien au distant ; `migration list` les affiche faussement « local seul / distant seul » (`20260503`, `20260507`) à cause de l'ordre de tri.
- **`20260404_nutrition.sql` est enregistrée comme appliquée, mais ses tables n'existent pas** (`nutrition_strategy`, `nutrition_daily_log` absentes). L'historique distant ment déjà à un endroit.
- **`exercises`** : aucune migration ne la crée (créée à la main). Une base reconstruite depuis `supabase/migrations/` n'a pas cette table : c'est pour ça que la CI des tests SQL part d'un dump de schéma (`supabase/tests/ci/README.md`).

### 3.2 Ce que fait `repair`, et ce qui peut mal tourner

`supabase migration repair --status applied <versions…>` **n'exécute aucun SQL de migration** : il insère ou supprime des lignes dans `supabase_migrations.schema_migrations`. L'opération elle-même est donc sans risque pour les données et se défait par `--status reverted`.

Le vrai risque est ce qu'on en déduit : « l'historique est aligné, donc `db push` est sûr ».

| Risque | Conséquence | Parade |
|---|---|---|
| Marquer « appliquée » une migration dont l'effet manque en prod (cas `20260404_nutrition`) | `db push` ne la rejouera jamais ; écart invisible | Comparer le schéma, pas les listes : étape R2 |
| Numéros en double | `repair` / `push` refusent ou n'enregistrent qu'un des deux fichiers | Renommer le second fichier de chaque paire (étape R1) |
| Deux développeurs (Hugo, Titouan, sessions Claude) créent des migrations en parallèle sur `dev` | `db push` applique dans l'ordre des numéros ; un fichier daté avant la dernière version enregistrée est refusé (« Remote migration versions not found ») ou exige `--include-all` | Garder une seule personne qui applique ; toujours `db push --dry-run` d'abord |
| `db push` applique toutes les migrations en attente d'un coup | Une migration « phase 2 » (durcissement que le client de `main` ne sait pas encore appeler, cf. `CLAUDE.md`) part trop tôt | Règle inchangée : découper avant / après déploiement ; `--dry-run` relu |
| Les fichiers contiennent parfois des corrections de données (backfill) écrites pour un état de la base donné | Les rejouer serait destructeur | `repair` ne rejoue rien ; c'est justement l'intérêt |

### 3.3 Étapes proposées

| # | Étape | Écrit en prod ? |
|---|---|---|
| R0 | Sauvegarde : dump complet + vérifier que la restauration PITR fonctionne (déjà l'urgence n°1 de la liste « Hors développement »). | non |
| R1 | Dans le repo : renommer le second fichier de chacune des 3 paires (`+1 s`, ex. `20260501000001_roadmap.sql`) ; ne pas toucher aux 12 versions courtes (elles correspondent au distant). Fait un jour où personne d'autre n'écrit de migration. | non |
| R2 | **Preuve par le schéma** : dans la CI (Supabase éphémère, comme le job « Tests SQL »), rejouer `supabase/migrations/` dans l'ordre, puis `supabase db diff` contre `supabase/tests/ci/schema.sql`. Chaque écart est soit une migration à corriger, soit un objet créé à la main à rapatrier dans une migration (`exercises`), soit un fichier jamais appliqué (`20260404_nutrition`, à neutraliser : contenu remplacé par un commentaire). Objectif : diff vide. | non |
| R3 | `supabase migration repair --status applied <les 90 versions + les 3 renommées>` en une commande, liste relue par Hugo avant. | oui, métadonnées seulement |
| R4 | `supabase migration list --linked` : toutes les lignes appariées. `supabase db push --dry-run` : « Remote database is up to date ». | non |
| R5 | Nouvelle règle dans `CLAUDE.md` et le skill `migration-bdd` : appliquer avec `supabase db push --dry-run` relu puis `supabase db push` (une seule personne à la fois), ou continuer avec `db query -f` **suivi** de `migration repair --status applied <version>`. Ajouter à la CI le job R2 en permanence (une migration qui ne rejoue pas casse la CI). | non |
| Retour arrière | `supabase migration repair --status reverted <mêmes versions>` remet l'historique dans l'état d'aujourd'hui. Rien d'autre n'a changé. | métadonnées |

**Recommandation : oui, mais seulement R0 → R2 d'abord** (sans écrire en prod), et R3 quand le diff de R2 est vide. Faire `repair` sans R2 donnerait une fausse impression de sécurité. Gain : `db push --dry-run` redevient un contrôle fiable, et la CI peut construire la base depuis les migrations au lieu d'un dump à rafraîchir.

---

## 4. Ce qu'Hugo doit trancher

1. **Décision 6** : supprimer `invitations`, `retours`, `retours_votes` selon §1.3 (archive CSV sans jeton → code → fermeture → suppression) ? Recommandé : oui.
2. **Décision 7** : lancer `migration repair` selon §3.3, en commençant par R0-R2 sans écriture ? Recommandé : oui, R3 seulement quand le diff est vide.
3. **P18, références** (§2.3 T5) : une valeur de test extrapolée (ex. VMA calculée) doit-elle devenir une référence **proposée** au coach (comme les zones FC) plutôt que validée d'office ? Recommandé : proposée.
4. **P18, tables mortes** (§2.4) : feu vert pour la méthode « renommer `_archive_` puis supprimer » ? Recommandé : oui, en commençant par `check_microcycle_dates`, les 2 clés `app_data` mortes et `workout_rpe`.
