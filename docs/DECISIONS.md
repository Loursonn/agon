# Journal des décisions techniques

Chaque décision importante est documentée ici avec son contexte et sa justification.
Format : `[DATE] Titre — Décision — Pourquoi`

---

## 2025-04 — Fichier monolithique conservé temporairement

**Décision** : garder `WeightliftingTracker.jsx` en un seul fichier pour l'instant.

**Pourquoi** : c'est un prototype issu de Lovable. La priorité était de valider les fonctionnalités rapidement. La refactorisation est prévue en Phase 2 une fois le MVP stabilisé.

**Impact** : un seul contributeur à la fois sur ce fichier pour éviter les conflits Git.

---

## 2025-04 — Persistance JSONB (app_data) au lieu d'un schéma relationnel

**Décision** : utiliser une table clé-valeur JSONB `app_data` pour stocker toutes les données.

**Pourquoi** : rapidité de développement sur le prototype. Le schéma des données évolue encore (nouvelles features). Un schéma relationnel rigide ralentirait les itérations.

**Plan de migration** : Phase 2 — migration vers schéma relationnel complet (voir `DATABASE.md`).

---

## 2025-04 — Clé Supabase nommée VITE_SUPABASE_PUBLISHABLE_KEY

**Décision** : utiliser `VITE_SUPABASE_PUBLISHABLE_KEY` (et non `VITE_SUPABASE_ANON_KEY`).

**Pourquoi** : nom généré automatiquement par Lovable. C'est la même clé anonyme Supabase, juste nommée différemment.

**À noter** : dans Vercel, configurer `VITE_SUPABASE_PUBLISHABLE_KEY` (pas `VITE_SUPABASE_ANON_KEY`).

---

## 2025-04 — Ajout type Haltérophilie (4ème type d'exercice)

**Décision** : ajouter `halterophilie` comme type distinct de `muscu`.

**Pourquoi** : les exercices d'haltérophilie (arraché, épaulé-jeté, etc.) ont une logique de charge identique à muscu (kg, sets, RIR, méthodes) mais méritent une catégorie visuelle distincte (couleur violet `#8b5cf6`).

**Impact code** : partout où `isFlex = eType !== "muscu"`, remplacé par `eType !== "muscu" && eType !== "halterophilie"`.

---

## 2025-04 — Surcharge progressive automatique à la complétion de séance

**Décision** : quand une séance est marquée terminée, recalculer automatiquement toutes les semaines futures.

**Pourquoi** : le coach programme la semaine 1, les semaines suivantes s'adaptent aux vraies performances (pas aux valeurs théoriques prévues). Gain de temps, meilleure précision.

**Logique** : fonction `autoProgressOnComplete()` dans `WeightliftingTracker.jsx`. Utilise le `tierConfig` pour calculer la progression selon le tier (1=RIR, 2=reps, 3=charge).

---

## 2025-04 — Workflow Git : main / dev / feat

**Décision** : 3 niveaux de branches.

**Pourquoi** : deux développeurs sur le projet. `main` = production stable (Vercel). `dev` = intégration continue. `feat/xxx` = développement isolé par feature.

**Règle** : ne jamais pusher directement sur `main`. Toujours passer par une PR.

---

## 2026-10 — Pas d'API Strava : import de fichiers à la place

**Décision** : ne pas déposer de demande d'accès à l'API Strava. Les données
Strava entrent dans Agon par import de fichiers (export d'archive, FIT, TCX,
GPX).

**Pourquoi** : la clause **2.3** du Strava API Agreement dispose que les
données Strava d'un utilisateur ne peuvent être affichées ou divulguées, dans
une application tierce, **qu'à cet utilisateur lui-même**. Un tableau de bord
coach est donc exclu — et aucun consentement de l'athlète n'y change quoi que
ce soit, puisque l'interdiction est contractuelle entre Strava et nous, pas
entre nous et l'athlète. La clause 5.3 interdit par ailleurs tout traitement
par IA ou ML, mais elle est secondaire : même sans la moindre IA, 2.3 suffit à
rendre l'intégration inutile pour Agon.

Précédent : intervals.icu, coupé par Strava en décembre 2024.

**Ce que l'API « athlète seul » aurait apporté** : presque rien. L'athlète
aurait vu ses propres sorties dans Agon au lieu de les voir dans Strava, le
coach n'y aurait pas eu accès. Contre une demande d'approbation, un abonnement
mensuel à partir de juin 2026, un quota de départ d'un seul athlète, et un
tunnel OAuth à maintenir.

**Conséquence** : l'import de fichiers n'est pas un pis-aller mais la brique
centrale. Il règle aussi le trou d'historique de Garmin Starter, qui ne livre
aucune donnée antérieure à la connexion.

---

## 2026-10 — Consentement RGPD : journal append-only et versionné

**Décision** : `user_consents` est un journal en écriture seule. Donner et
retirer son consentement sont deux INSERT. L'état courant est lu via la vue
`current_consents`, qui ne garde que la dernière décision par finalité. Chaque
ligne archive le **libellé exact** affiché et la **version** des documents.

**Pourquoi** : l'article 7.1 du RGPD exige de pouvoir *prouver* le
consentement. Une ligne qu'on peut modifier par UPDATE ne prouve rien — on ne
peut pas distinguer un historique authentique d'un historique réécrit. Archiver
le libellé répond à la question qui vient après : à quoi exactement la personne
a-t-elle dit oui, sachant que le texte a pu être reformulé depuis.

Une version périmée vaut **absence** de consentement et déclenche une nouvelle
sollicitation : si le texte a changé de façon substantielle, la personne n'a
pas consenti au nouveau traitement.

**Tension avec l'article 17** (effacement) : la preuve du consentement
identifie nécessairement une personne, ce qui contredit le droit à l'oubli.
Tranché en faveur de l'effacement — `user_consents` disparaît avec le compte,
et seule une ligne **sans aucun identifiant** subsiste dans
`account_deletions`. Elle prouve qu'un mécanisme de consentement existait à une
date donnée, sans conserver de donnée personnelle.

---

## 2026-10 — Suppression de compte : CASCADE vers l'athlète, SET NULL vers le coach

**Décision** : `profiles.id` référence `auth.users(id)` en `ON DELETE CASCADE`.
Les références au coach (`macrocycles.coach_id`, `cycles.coach_id`,
`roadmap_items.created_by`, `roadmap_phases.created_by`) passent en
`ON DELETE SET NULL`.

**Pourquoi** : `public.profiles` n'avait **aucune** clé étrangère vers
`auth.users`. Supprimer un compte laissait donc la ligne de profil et les
~45 tables dépendantes intactes : la personne ne pouvait plus se connecter,
mais ses données de santé restaient en base et restaient visibles de son coach.
Le droit à l'effacement était inopérant, pas seulement incomplet.

Quatre contraintes en `RESTRICT` / `NO ACTION` rendaient par ailleurs tout
coach ayant déjà programmé **littéralement non supprimable** par Postgres.

SET NULL et non CASCADE pour le coach, parce que les deux propagations ne
détruisent pas la même chose : un coach qui part ne doit pas emporter les plans
d'entraînement de ses athlètes, qui sont *leurs* données.

---

## 2026-10 — Export des données construit côté client, pas en service_role

**Décision** : l'export RGPD (art. 15 et 20) est construit dans le navigateur
avec le jeton de session de l'utilisateur, via `src/lib/dataExport.ts`, et non
par une Edge Function à clé `service_role`.

**Pourquoi** : les politiques RLS s'appliquent, donc l'export ne peut
structurellement contenir que les lignes que ce compte a le droit de lire. Une
Edge Function en `service_role` devrait filtrer elle-même sur l'identifiant,
table par table — 37 tables — et un seul oubli dans ce filtre livrerait
l'historique d'entraînement d'un autre athlète. Ici, l'erreur est impossible
par construction plutôt qu'évitée par vigilance.

---

*Ajouter une entrée ici à chaque décision technique importante : changement d'architecture, choix de librairie, refactorisation majeure, changement de workflow.*
