# Couche données `src/api/` — conception

> Rédigé le 2026-11-07 à partir de 4 cartographies du code et de la base (séances, références/records, wellness, nutrition/blessures). Décision de principe : `docs/DECISIONS.md` « Une couche `src/api/` typée, pas une API REST ». Audit : `docs/AUDIT_REFONTE_2026-11.md` §5.

## 1. Pourquoi, en une phrase

Aujourd'hui ~135 fichiers parlent à Supabase, chacun avec son format de date, sa formule, sa clé de cache et ses invalidations. C'est ce qui produit les régressions. Après : **une entité = un module**, seul à lire et écrire ses données, testé ; les écrans n'appellent que lui.

## 2. Règles de la couche

```
src/api/
├── client.ts            client Supabase + `unwrap()` (lève une ApiError lisible, jamais de `?? []` silencieux)
├── keys.ts              toutes les clés React Query, par entité, préfixées ['<entité>', athleteId, …]
├── workouts.ts          séances réalisées (workout_logs)
├── wellness.ts          wellness (app_data `asp:wh` pour l'instant)
├── references.ts        VMA, FC, seuils… (performance_logs)
├── records.ts           records / 1RM (exercise_pr_logs)
├── nutrition.ts         stratégie + journal (app_data pour l'instant)
├── injuries.ts          medical_entries / attachments / history
└── __tests__/           tests avec un faux client Supabase (comme supabase/functions/_shared/__tests__/fakeDb.ts)
supabase/functions/_shared/domain/
├── dates.ts             UN format de jour exposé : "YYYY-MM-DD" (lit aussi l'ancien "YYYYMMDD")
├── wellness.ts          parseur + score + paliers — un seul calcul
├── performance.ts       noms de métriques canoniques, Epley, arrondi 0,5 kg, % RM → kg
├── athleteMods.ts       schéma zod d'`athlete_modifications` + « la séance a-t-elle une saisie ? »
└── injuries.ts          ce que coach-api a le droit d'exporter d'une blessure
```

- `domain/` est **pur** (aucun accès réseau) et importé par le front (`@shared`) **et** par `coach-api` : coach et IA calculent pareil.
- Chaque module exporte : fonctions de lecture (lèvent en cas d'erreur), fonctions d'écriture, et **une** fonction `invalidate<Entité>(qc, athleteId)` qui invalide tout ce qui dépend de l'entité. Les hooks React Query deviennent des adaptateurs de 5 lignes.
- Écritures multi-champs ou concurrentes → **RPC Postgres atomique** (jamais « relire tout le blob, le modifier, le réécrire »).
- ESLint : importer `@/integrations/supabase/client` hors de `src/api/` = **avertissement** au début (liste des fichiers pas encore migrés), puis **erreur** une fois une entité migrée pour ses fichiers.
- Pas de changement de stockage dans ce chantier (wellness et nutrition restent dans `app_data`) : seul le module changera le jour où on passe à de vraies tables.

## 3. Ce que chaque lot corrige (visible)

### Lot 0 — urgence, avant la couche
- 🔴 **Raccourcir ou déplacer un cycle supprime les séances réalisées** de l'athlète (`CycleDrawer.tsx`, `useResizeCycle.ts`, `useDragCycle.ts` : suppression par plage de dates sans regarder le statut). Correctif : ne supprimer que les séances non réalisées et sans saisie ; les autres sont détachées du cycle et gardées.
- 🔴 **Ouvrir un athlète en vue coach / staff réécrit ses séances** (rattrapage `asp:completed` de `useAthleteLogic` à chaque chargement, y compris en lecture seule) → arrêté en lecture seule ; supprimé quand le lot 2 est fait.

### Lot 1 — socle
`client.ts`, `keys.ts`, `domain/dates.ts`, faux client de test, règle ESLint en avertissement, `CLAUDE.md` mis à jour.

### Lot 2 — séances (`workouts.ts`) — le plus gros
- RPC `complete_workout`, `reopen_workout`, `set_workout_rpe`, `patch_workout_entries` (fusion qui **garde l'adaptation du coach**), `set_coach_override`.
- RPE : une seule source, `workout_logs.rpe_score` → RPE de nouveau visible dans la timeline et les cartes de cycle ; fin de l'erreur « RPE non enregistré » au 2ᵉ RPE.
- Série et « N séances réalisées » de l'athlète calculées depuis `workout_logs` (aujourd'hui ≈ 0).
- Section « modifications » des Retours de nouveau remplie (colonne inexistante retirée) ; clé de cache partagée par deux requêtes séparée.
- Une seule invalidation au lieu de 9 listes ; une seule définition de « séance saisie » (front = SQL du cron).

### Lot 3 — wellness (`wellness.ts`)
- **Accueil coach** : le wellness du jour s'affiche de nouveau (comparaison `20261107` ≠ `2026-11-07`).
- **Alertes wellness** coach : enfin déclenchées.
- **Assistant IA du coach** : voit le wellness et le poids.
- Un seul score, un seul jeu de paliers pour l'athlète et le coach ; score absent = « — », jamais 0.
- Libellés inversés du calendrier des Retours corrigés ; historique archivé visible partout ; résumé de microcycle rempli.
- RPC `wellness_set_day` : un appareil n'efface plus la saisie d'un autre.
- Staff : le wellness archivé ne fuit plus via le domaine « séances ».

### Lot 4 — références et records (`references.ts`, `records.ts`)
- Noms canoniques : la FC max saisie par l'athlète (« FC Max ») est enfin utilisée par les séances énergie (4 lignes à renommer en base).
- Changer la VMA/FC rafraîchit immédiatement tous les écrans (aujourd'hui jusqu'à 5 min ou rechargement).
- Une formule de 1RM, un arrondi (0,5 kg), partout. Records calculés à la validation de séance (aujourd'hui jamais).
- Accueil coach « Records & tests » : plus de zones FC affichées comme des records.
- À vérifier : prescription en % RM pré-remplie « 75 » kg côté athlète.

### Lot 5 — nutrition et blessures (`nutrition.ts`, `injuries.ts`)
- **Retours** : la nutrition s'affiche (5 athlètes, 55 jours), avec un « respect de la stratégie » juste (aujourd'hui les % sont lus comme des kcal).
- RPC `nutrition_save_day` : plus d'écrasement entre appareils ; date locale (plus de saisie basculée sur la veille après minuit).
- Le coach voit tout de suite la stratégie qu'il vient d'enregistrer.
- **Assistant IA du coach** : voit les blessures en cours (lit aujourd'hui une clé vide).
- Réponse « blessé/malade » du wellness visible côté coach.

## 4. Ordre et parallélisme

1. Lot 0 puis lot 1 (moi, séquentiel).
2. Lots 2, 3, 4, 5 en parallèle (un agent par lot, fichiers séparés). Les fichiers communs (`useWeeklyRetours`, `useMonthlyRetours`, `RetoursPage`, `AthleteContext`, `useAthletePersistedState`) ne sont modifiés que **par moi, à l'intégration**, à partir de ce que chaque module expose.
3. Chaque migration SQL : test à blanc (`BEGIN … ROLLBACK`), puis accord d'Hugo, puis application. Toutes additives (nouvelles RPC) : compatibles avec le client en prod.
4. Après chaque lot : `npm run check`, parcours des pages avec les comptes de démo, entrée « Nouveautés ».

## 5. Choix par défaut (sauf avis contraire d'Hugo)

- Wellness et nutrition restent dans `app_data` (aucune migration de données) ; vraies tables plus tard, seul le module changera.
- Assistant IA, blessures : exporte type, statut, douleur, impact, dates et zone ; **pas** le texte libre (diagnostic, notes).
- 1RM saisi par l'athlète : rangé dans les records (`exercise_pr_logs`), comme ceux du coach.
- Supprimer un résultat de test ne défait pas la référence qu'il a créée (le coach la corrige à la main) — à revoir si gênant.

## 6. Décisions d'Hugo (2026-11-07)

- Plan validé, lots 0 → 5.
- Score wellness : **5 paliers 80 / 65 / 50 / 35** (Optimal, Bon, Modéré, Fatigué, Surmenage) pour l'athlète et le coach ; couleurs vert / orange / rouge qui en découlent.
- Réponse « blessé/malade » du wellness : **alerte visible dans les Retours et l'accueil coach**, avec le commentaire ; pas de fiche blessure automatique.
- RPE : **seulement `workout_logs.rpe_score`** ; `workout_rpe` n'est plus écrite, supprimée plus tard après export.
