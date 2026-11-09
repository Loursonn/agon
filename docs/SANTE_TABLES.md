# Santé hors d'`app_data` : wellness, poids, paliers

> Rédigé le 2026-11-08. Suite de `docs/COUCHE_API.md` (lots 3 et poids) et de l'audit `docs/AUDIT_REFONTE_2026-11.md` §5.3 point 8 et §6 (« poids ×3 »).
> Migration : `supabase/migrations/20261110100000_sante_tables.sql`. Test à blanc : `supabase/tests/sante_tables.sql` (60 contrôles, tous verts le 2026-11-08).

## 1. Point de départ (mesures prod du 2026-11-08, agrégats)

| Clé `app_data` | Lignes | Contenu | Écrite par |
|---|---|---|---|
| `asp:wh` | 18 athlètes, 24 Ko | 295 saisies, toutes en clés compactes `YYYYMMDD` ; 12 clés parasites `"1".."4"` à valeur numérique ; 11 notes hors échelle 1-5 | RPC `wellness_set_day` / `wellness_delete_day` (client actuel) ; blob entier (anciennes PWA, `archiveAndNewBlock` qui le vide) |
| `asp:wellness` | 18 | copie de la saisie la plus récente ; 18/18 présentes dans `asp:wh`, identiques | `wellness_set_day`, anciens clients |
| `asp:blockHistory` | 3 athlètes (avril 2026) | blocs archivés ; 19 saisies wellness qui ne sont **que** là | blob entier |
| `asp:wlog` | 18 | 245 pesées, clés compactes, 48,5–105 kg | RPC `weight_set_day` ; blob entier (`ProfilPage`, anciens clients) |
| `asp:wmile` | 11 | 23 paliers `{date: "YYYYMMDD", kg}`, aucun doublon | RPC `weight_record_milestone`, anciens clients |
| `asp:bw` | 11 | `{current, target}` ; `current` jamais 0, `target` = 0 pour 10/11 | `weight_record_milestone`, `setBodyWeight` (blob) |

Poids ailleurs : `profiles.weight_kg` (14 renseignés), `measurement_logs.weight_kg` (7 saisies), champ `poids` des saisies wellness (123, **toutes égales** à la pesée du même jour dans `asp:wlog`).

Contrainte : la prod tourne avec le client de `main`, et des téléphones gardent d'anciennes versions (PWA) qui réécrivent les blobs entiers. `git rev-list --count origin/main..origin/dev` = 207 le 2026-11-08, mais les arbres sont identiques depuis la PR #138 (dev = main en contenu). Toutes ces versions doivent continuer à marcher pendant toute la bascule.

## 2. Modèle

Une ligne par fait, clé naturelle, `athlete_id → profiles(id) ON DELETE CASCADE` partout.

| Table | Clé | Colonnes | Source (étape 1) |
|---|---|---|---|
| `wellness_entries` | `(athlete_id, day)` | `fatigue, sommeil, stress, energie, doms` numeric 1-5 ou NULL · `score` smallint **généré** (somme × 4, NULL si une note manque = `wellnessScore`) · `bedtime, wake` time · `sleep_hours` · `sleep_interrupted` · `sleep_interrupt_note` · `doms_zones` text[] · `doms_points` jsonb (tableau normalisé) · `injury_note` · `weight_kg` · `archived` (vrai = seulement dans un bloc archivé) · `created_at, updated_at` | `asp:wh` + `asp:blockHistory[].wellnessHistory` |
| `body_weight_logs` | `(athlete_id, day)` | `kg` (0 < kg < 500) · `created_at, updated_at` | `asp:wlog` |
| `body_weight_milestones` | `(athlete_id, day, kg)` | `created_at` | `asp:wmile` |
| `body_weight_goals` | `athlete_id` | `reference_kg` (ancien `current`, dernier palier) · `target_kg` (0 → NULL) · `updated_at` | `asp:bw` |
| `health_sync_errors` | `id` | `athlete_id, key, sqlstate, constraint_name, created_at` — **aucune valeur, aucun message** | échecs de synchro |

- Pas de table pour `asp:wellness` : c'est la dernière ligne de `wellness_entries`.
- Index : les clés primaires servent toutes les lectures (un athlète, une plage de jours, plusieurs athlètes `IN (…)`). Index `created_at` sur les erreurs.
- Noms choisis pour ne **pas** réveiller d'anciens clients : `wellness_logs` est lu par d'anciennes versions de `useMicroStats` (table inexistante aujourd'hui, erreur avalée) ; la créer leur renverrait un schéma inattendu.
- Lecture des anciens formats : fonctions SQL `health_day`, `health_num`, `health_item`, `health_text`, `health_hm`, `health_parse_wellness`, miroir de `parseWellnessHistory` (`_shared/domain/wellness.ts`) : clé du dictionnaire prioritaire sur `date`, clé compacte prioritaire sur l'ISO, `asp:wh` prioritaire sur l'archive, bloc le plus récent prioritaire, notes hors 1-5 → NULL, textes nettoyés. Seule différence connue : heures de coucher non entières → NULL (0 en prod).

### RLS et droits

| Qui | wellness_entries | body_weight_* |
|---|---|---|
| athlète | ses lignes (`athlete_id = auth.uid()`) | idem |
| coach référent / co-coach | `is_coach_of(athlete_id)` | idem |
| staff | `staff_can(athlete_id, 'wellness', 'read')` | `staff_can(athlete_id, 'nutrition', 'read')` |
| anon | aucun droit (42501) | idem |
| admin | — | `health_sync_errors` : `current_user_is_admin()` |

Domaines staff = ceux des clés d'origine (`staff_app_data_domain` : `asp:wh` → wellness, `asp:wlog/wmile/bw` → nutrition, comme `measurement_logs`), consentement `staff_sharing` compris. **Écriture : aucune côté client** (pas de policy, `INSERT/UPDATE/DELETE` retirés à `authenticated`), seuls les triggers écrivent. Les fonctions `health_*` ne sont exécutables par aucun client.

Saisies **archivées** (anciens blocs, 19 lignes, 3 athlètes) : fermées au staff (`NOT archived` dans `wellness_entries_staff`), comme aujourd'hui où `asp:blockHistory` lui est fermé en entier. Décidé le 2026-11-09 : ne pas élargir l'accès du staff ; à rouvrir si Hugo le demande.

## 3. Synchro : `app_data` → tables, côté serveur

**Sens unique pendant la transition : `app_data` reste la source, les tables sont une projection.**

- Trois triggers `AFTER INSERT / UPDATE / DELETE` sur `app_data`, filtrés sur les clés `asp:wh`, `asp:blockHistory`, `asp:wlog`, `asp:wmile`, `asp:bw`.
- À chaque écriture, la projection **de cet athlète** pour cette clé est recalculée en entier (`health_sync_wellness / _weight / _milestones / _goals`) : insert / mise à jour des lignes qui changent, suppression de celles qui ont disparu. Les lignes identiques ne sont pas réécrites (vérifié : même `ctid`).
- Même transaction que l'écriture : une RPC, un ancien client qui réécrit tout le blob, le coach, un script : les tables suivent toujours, sans rien changer aux clients ni aux RPC.
- Verrou consultatif par athlète (`pg_advisory_xact_lock`) : `asp:wh` et `asp:blockHistory` sont deux lignes ; deux écritures concurrentes (cas de `archiveAndNewBlock`, qui envoie les deux en parallèle) se synchronisent l'une après l'autre et la dernière voit l'état final.
- **Une synchro en échec (hors délai de requête dépassé, 8 s) ne bloque pas l'écriture de l'athlète** : sous-transaction annulée, `RAISE WARNING` (clé + code SQL), ligne dans `health_sync_errors`. Réparation : `SELECT health_resync('<athlete>')` (ou `health_resync()` pour tous), rejouable.
- Compte supprimé : la synchro voit le profil absent et ne recrée rien ; tout part en cascade (testé : 0 ligne restante, aucune erreur).

Pourquoi les RPC n'écrivent pas directement les tables à cette étape : avec deux chemins d'écriture (RPC → tables, anciens clients → `app_data`), il faudrait une synchro dans les deux sens avec garde anti-boucle, et deux vérités possibles. En passant par `app_data`, les RPC « écrivent les tables » dans la même transaction, par le trigger, et il n'y a qu'une vérité. L'inversion vient à l'étape 3.

## 4. Plan de bascule

| Étape | Quand | Quoi | Compatible avec |
|---|---|---|---|
| 0 ✅ | fait (2026-11-08/09) | RPC atomiques `wellness_set_day`, `wellness_delete_day`, `weight_set_day`, `weight_record_milestone` | tout |
| **1** ✅ | fait le 2026-11-08 (314 wellness / 245 pesées / 23 paliers / 11 objectifs, 0 erreur, test 60/60, types régénérés) | appliquer `20261110100000_sante_tables.sql` (tables, RLS, triggers, copie) ; vérifier ; régénérer `types.ts` | main, dev, anciennes PWA : rien ne change pour eux |
| **2** ✅ (code) | après l'étape 1, via la PR dev → main | `src/api/wellness.ts` et `src/api/profile.ts` lisent les tables ; tous les autres lecteurs migrés (P5, liste ci-dessous) ; reste le déploiement de `coach-api` | tout : les écritures restent les mêmes |
| 3 | quand plus aucun client ne **lit** les clés legacy (main déployé + délai PWA, cf. ci-dessous) | inverser la source : nouvelles RPC qui écrivent les tables (`wellness_set_day` réécrit), trigger `app_data → tables` gardé pour les anciens écrivains, trigger `tables → app_data` pour les anciens lecteurs, garde anti-boucle par GUC `agon.health_sync` ; ajouter `weight_set_goal` (objectif) | tout |
| 4 | plusieurs semaines après 3, export fait | suppression : fallback `app_data` retiré de `src/api`, triggers supprimés, clés `asp:wh`, `asp:wellness`, `asp:wlog`, `asp:wmile`, `asp:bw` exportées puis supprimées, `wellnessHistory` / `bodyWeight` retirés de `asp:blockHistory`, entrées retirées de `staff_app_data_domain` | seulement les versions ≥ étape 2 |

Le client de ce lot **retombe sur `app_data`** si la table n'existe pas (erreur `PGRST205` / `42P01`) : un merge sur `main` avant l'étape 1 ne casse rien. Ce repli disparaît à l'étape 4.

Mesure avant 3 et 4 : `git rev-list --count origin/main..origin/dev` (le client de prod vient de `main`) et ancienneté des PWA : aucune télémétrie de version aujourd'hui. Proposition : à l'étape 2, ajouter un contrôle de version au démarrage (fichier `version.json` servi par Vercel, rechargement forcé si l'app est plus vieille) ; l'étape 4 attend ensuite au moins 30 jours.

**Fait (P4)** : `/version.json` + rechargement propre (`src/lib/versionCheck.ts`, `UpdatePrompt`) ; suivi serveur par `profiles.client_build` / `client_build_at` et la RPC `report_client_build` (migration `20261110110000_client_build.sql`, test `supabase/tests/client_build.sql`, appel `ClientBuildReporter`). Comptage : `select client_build, count(*) from profiles where client_build_at > now() - interval '30 days' group by 1 order by 2 desc;`. Test à blanc vert le 2026-11-09 ; migration à appliquer AVANT de merger vers `main` (sinon l'appel échoue en silence).


### Lecteurs migrés (P5, 2026-11-09) et écrivains encore branchés sur les clés legacy

Lecteurs : **plus aucun code ne lit `asp:wh`, `asp:wellness`, `asp:wlog`, `asp:wmile`, `asp:bw` ni les champs santé d'`asp:blockHistory`**, sauf le repli de `src/api` (table absente, à retirer à l'étape 4) :
- ✅ `src/features/shared/hooks/useAthletePersistedState.ts` → `getWellnessHistory({ includeArchived: false })` (+ `toLegacyWellnessHistory`, `toLegacyToday`), `getWeightLog` + `toLegacyWeightLog`, `getWeightMilestones` + `toLegacyMilestones`, `getBodyWeightGoal` + `toLegacyBodyWeight`. Les composants reçoivent les mêmes formes qu'avant (clés compactes `YYYYMMDD`, `{ current, target }` à 0 si absent). Une lecture en erreur bloque l'écriture de la clé (`markKeyLoad` dans `src/lib/storage.ts`, même garde que `sLoadResult`) et relance la lecture automatique.
- ✅ `useWeeklyRetours.ts`, `useMonthlyRetours.ts` → `getWellnessHistory` (archives comprises). `retoursWellnessHistory` supprimé.
- ✅ `src/api/appContent.ts` `listRecentActivity` → dernier `wellness_entries.updated_at` non archivé de chaque athlète (repli `app_data` si table absente).
- ✅ `supabase/functions/coach-api` + `_shared/coachApiRead.ts` → `_shared/coachApiHealth.ts` (`readSummaryHealth`) lit `wellness_entries`, `body_weight_logs`, `body_weight_goals` sur la période. `asp:goals` et `asp:prog` restent dans `app_data` (hors périmètre santé). **À redéployer** : `supabase functions deploy coach-api`, accord d'Hugo requis.
- Composants qui lisent l'état du contexte (`StatsCharts.jsx`, `WellnessFlow.jsx`, `NutritionView.tsx`, `ProfileDrawer.tsx`, `ProfilSportifPage.tsx`, `StaffWellnessTab.tsx`…) : rien changé.
- Lecture des lignes dans le domaine partagé : `wellnessRowToEntry` / `wellnessRowsToHistory` (`_shared/domain/wellness.ts`), réexportés par `src/api/wellness.ts`.

Contrat de `coach-api` : sortie de `GET /athletes/:id/summary` strictement identique, figée par `_shared/__tests__/coachApiHealth.test.ts` contre `coachApiSummary.golden.json`, produit **avant** la migration par l'ancien code alimenté avec les clés `app_data`.

Limite connue : `wellnessHistory` du contexte ne contient plus les clés parasites (`"1"`..`"4"`) ni les champs inconnus d'une saisie ; quand un écrivain réécrit encore le blob `asp:wh` entier, il l'écrit nettoyé (le trigger projette de toute façon l'état nettoyé). Sans effet sur les tables.

Écrivains qui réécrivaient un blob entier : **P6 (2026-11-10) les a tous passés par RPC** (code ; migration `20261110110000_weight_set_goal.sql` à appliquer) :
- `ProfilPage.tsx` → `saveWeighIn` (file hors ligne, RPC `weight_set_day`).
- Objectif → `weight_set_goal` (`saveWeightGoal`) ; les setters blob sans appelant sont supprimés.
- `useAthleteLogic.archiveAndNewBlock` : `asp:wh = {}` après archivage ; les saisies passent `archived = true` si elles sont dans `asp:blockHistory` (désormais toujours le cas quand il reste du wellness). Reste un écrivain blob (`asp:blockHistory`, programme) : hors santé, voir P17.
- `scripts/seed-demo.mjs` → RPC, avec la session de l'athlète démo.

## 5. Fusion du poids (« poids ×3 »)

Constat :
- Champ `poids` du wellness : **doublon pur** (123/123 égaux à `asp:wlog` le même jour, aucune pesée wellness sans entrée `asp:wlog`).
- `measurement_logs.weight_kg` : 7 saisies, 4 égales à la pesée du jour, 1 jour sans pesée, 1 jour avec deux mensurations.
- `profiles.weight_kg` : 14 renseignés, 13 athlètes ont des pesées, **3 seulement** égaux à la dernière pesée. C'est un poids de fiche saisi à part (lu par Hyrox, énergie, fiche coach).

Proposition (étape 3, à valider) :
1. `body_weight_logs` = **seule source** du poids du jour. Le formulaire wellness, la fiche profil et les mensurations écrivent une pesée par `weight_set_day`.
2. `wellness_entries.weight_kg` : gardé jusqu'à l'étape 4 pour la compatibilité, puis supprimé (lecture par jointure sur `body_weight_logs`).
3. `measurement_logs.weight_kg` : reste un instantané de la séance de mesures, mais saisi = pesée écrite dans `body_weight_logs` ; reprise unique du jour sans pesée (1 cas).
4. `profiles.weight_kg` : devient dérivé (trigger sur `body_weight_logs` → dernière pesée), la fiche ne l'écrit plus directement. **Décision d'Hugo** : à la fusion, pour les 10 athlètes où la fiche et la dernière pesée diffèrent, laquelle garder ? (recommandé : la dernière pesée ; la valeur de fiche est copiée dans l'export avant).
5. Objectif : `body_weight_goals.target_kg` et `nutrition strategy.target_weight` coexistent (l'écran prend la stratégie d'abord). Garder un seul objectif (recommandé : celui de la stratégie nutrition, `target_kg` alimenté par elle).

## 6. Rollback

- Étape 1 : `app_data` n'est jamais modifiée → rollback sans perte. Script en tête de la migration (DROP des 3 triggers, des fonctions `health_*`, des 5 tables). Le client de l'étape 2 retombe automatiquement sur `app_data` (table absente).
- Étape 2 : revert du commit client ; les tables restent à jour.
- Étape 3 : garder la migration « avant » rejouable (RPC d'origine) ; la synchro double sens permet de revenir à `app_data` comme source.
- Étape 4 : irréversible → export des clés supprimées avant (fichier JSON chiffré hors repo).

## 7. RGPD (skill `rgpd-check`)

| Point | Statut | Fichier |
|---|---|---|
| Accès : athlète, coachs (`is_coach_of`), staff autorisé (`staff_can` + consentement), rien pour anon | OK (testé) | migration §2 |
| Suppression de compte : cascade `profiles → tables` (aucun bucket) ; `health_sync_errors` en cascade aussi | OK (testé D2) | — |
| Export : les 4 tables à ajouter à `ATHLETE_TABLES` | **à faire** (autre agent) | `src/lib/dataExport.ts` |
| Finalité : même donnée, mêmes destinataires | OK, `legal.ts` inchangé | — |
| IA : aucune nouvelle donnée envoyée (`athlete-insights` reçoit des agrégats, `coach-api` inchangé) ; pas de Garmin | OK | — |
| Logs : `RAISE WARNING` = clé + code SQL, jamais de valeur | OK | migration §5 |

`health_sync_errors` ne contient que l'athlète, la clé et un code : non exportable par le client (lecture admin), purge proposée à 90 jours quand un cron sera ajouté.

## 8. Appliquer (étape 1)

1. Accord d'Hugo.
2. `supabase db query --linked -f supabase/migrations/20261110100000_sante_tables.sql` (jamais `db push`).
3. Vérifier :
   ```sql
   SELECT (SELECT count(*) FROM wellness_entries) we, (SELECT count(*) FROM wellness_entries WHERE archived) arch,
          (SELECT count(*) FROM body_weight_logs) wl, (SELECT count(*) FROM body_weight_milestones) wm,
          (SELECT count(*) FROM body_weight_goals) bw, (SELECT count(*) FROM health_sync_errors) err;
   -- attendu le 2026-11-08 : ≈ 314 / 19 / 245 / 23 / 11 / 0 (plus les saisies faites depuis)
   ```
   puis `supabase db query --linked -f supabase/tests/sante_tables.sql` (60 contrôles).
4. `supabase gen types typescript --linked > src/integrations/supabase/types.ts`, `npm run typecheck` ; retirer ensuite les petits shims « table non typée » de `wellness.ts` / `profile.ts`.
5. Surveiller `health_sync_errors` les premiers jours.
