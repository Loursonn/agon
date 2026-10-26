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

## 2026-10 — Jetons OAuth dans Supabase Vault, jamais dans une table lisible

**Décision** : `provider_tokens` ne contient aucun jeton, seulement les UUID de
secrets Vault. La table a RLS activée et **aucune politique** — donc
inaccessible à `authenticated` quelle que soit la requête. L'accès passe par
deux fonctions `SECURITY DEFINER` (`provider_token_write`, `provider_token_read`)
dont le droit d'exécution est révoqué de `PUBLIC`, `anon` et `authenticated`, et
accordé à `service_role` seul.

**Pourquoi une table séparée** : `provider_connections` est lisible par
l'athlète *et* par son coach, parce que le coach doit voir qu'un jeton a expiré
— sans quoi il prend un athlète déconnecté pour un athlète qui a décroché. Si
les jetons vivaient sur cette table, un `select *` depuis le client — le
réflexe le plus courant — les renverrait. On peut restreindre les colonnes par
`GRANT`, mais c'est une protection qu'une migration distraite défait sans
bruit. Une table sans politique, non.

**Pourquoi le Vault par-dessus** : une fuite du contenu de `provider_tokens` ne
donne alors que des UUID. Un trigger `AFTER DELETE` supprime les secrets, sinon
le `ON DELETE CASCADE` effacerait la ligne et laisserait des jetons d'accès
vivants dans le Vault après que l'athlète a demandé la déconnexion — exactement
ce qu'on s'engage à ne pas faire.

---

## 2026-10 — `ai_allowed` posé par trigger, et une source inconnue est interdite

**Décision** : la règle « cette donnée peut-elle partir chez Gemini ? » vit dans
`data_source_policies`, une ligne par source. Un trigger `BEFORE INSERT` lit la
politique et **écrase** ce que l'appelant a mis dans `ai_allowed`. Une source
absente de la table fait **échouer** l'insertion.

**Pourquoi** : la réponse dépend des conditions contractuelles du fournisseur,
donc de la provenance de la donnée — pas du soin apporté par la fonction
d'import qui l'écrit. Mettre la décision dans chaque chemin d'import, c'est
garantir qu'un chemin futur l'oubliera. Et l'échec sur source inconnue est le
point important : par défaut une source nouvelle est **interdite**, pas
permise. Le défaut silencieux est le seul qui se trahit en production.

`coros` est à `ai_allowed = false` en attendant une relecture de ses conditions.

---

## 2026-10 — Visibilité coach : trois conditions cumulatives, relues à chaque requête

**Décision** : les politiques `provider_*_coach_read` exigent simultanément
`is_coach_of()`, `data_source_policies.coach_visible`, et
`source_consent_granted(athlete_id, source)`.

**Pourquoi relire le consentement à chaque requête** plutôt que le figer à
l'import : un athlète qui retire son accord ce matin doit disparaître du
tableau de bord ce matin, sans qu'il faille se souvenir d'effacer ou de
re-marquer quoi que ce soit. Aucune tâche de nettoyage à oublier.

**`source_consent_granted` est `SECURITY DEFINER`, et c'est indispensable.**
`current_consents` est une vue en `security_invoker=true` au-dessus de
`user_consents`, dont la seule politique de lecture est `user_id = auth.uid()` :
un coach n'a pas le droit de lire le journal de consentement de son athlète.
Évaluée avec les droits de l'appelant, la fonction renvoie donc toujours faux
pour un coach, les politiques sont toujours fausses, et la fonctionnalité est
morte — pas restreinte, morte. Contrepartie assumée : la fonction contournant
RLS deviendrait un oracle (« cet UUID a-t-il connecté une montre ? »), donc son
corps vérifie explicitement que l'appelant est l'athlète, son coach, ou un
appel serveur.

Ce test serveur porte sur `auth.uid() IS NULL`, pas sur
`auth.role() = 'service_role'` : `auth.role()` est nul sous pg_cron, sous psql
et pendant une migration, ce qui aurait fait échouer le trigger
`require_sync_consent` dans ces contextes — un piège qui ne se serait montré
qu'au premier passage du cron.

---

## 2026-10 — Le retrait de consentement arrête la synchronisation, mais ne révoque pas en SQL

**Décision** : un trigger `AFTER INSERT ON user_consents` passe la connexion
correspondante en `consent_withdrawn`. Il ne supprime pas les jetons et
n'appelle pas le fournisseur. La révocation distante est faite ensuite par
l'Edge Function `provider-disconnect`.

**Pourquoi** : révoquer exige un appel HTTP, qui n'a rien à faire dans une
transaction SQL. Si Garmin répond en trois secondes, l'écriture du retrait
attend trois secondes ; si Garmin ne répond pas, **le retrait échoue**. C'est
inacceptable : le retrait doit toujours aboutir, et une panne chez le
fournisseur ne doit pas pouvoir retenir quelqu'un dans un traitement qu'il
refuse. Séparer les deux rend l'arrêt de la synchronisation immédiat et
inconditionnel, et la révocation distante simplement *réessayable*.

Symétriquement, un trigger `BEFORE INSERT OR UPDATE` interdit à une connexion
de devenir `active` sans consentement : l'engagement pris auprès de Garmin
reste vrai même si un futur chemin de code oublie de le vérifier.

---

*Ajouter une entrée ici à chaque décision technique importante : changement d'architecture, choix de librairie, refactorisation majeure, changement de workflow.*
