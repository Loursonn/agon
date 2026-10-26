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

## 2026-10 — Le chemin IA ne lit que des vues filtrées, et jamais `raw`

**Décision** : les constructeurs de prompt lisent `ai_provider_activities` et
`ai_provider_dailies` (vues en `security_invoker`, filtrées sur `ai_allowed`),
jamais `provider_activities` / `provider_dailies` directement. Les colonnes
`raw` et `details` sont **absentes** de ces vues.

**Pourquoi des vues plutôt qu'un `WHERE ai_allowed`** : parce qu'un `WHERE`
s'oublie. On ne cherche pas à ce que le filtre soit écrit correctement à chaque
fois, on retire la possibilité de l'omettre — la surface de lecture du chemin
IA ne contient pas les lignes interdites.

**Pourquoi exclure `raw`** : ce ne sont pas des colonnes de confort mais des
charges utiles de fournisseur, dont on ne contrôle ni le contenu ni son
évolution. Les transmettre à un modèle, c'est envoyer des champs qu'on n'a
jamais inventoriés — y compris des données de cycle menstruel si COROS décidait
d'en inclure dans une réponse qu'on ne lui a pas demandée. On expose des
colonnes nommées, pas un sac.

**`ai_eligible_sources(athlete)`** combine les deux conditions nécessaires :
la règle contractuelle du fournisseur (`data_source_policies.ai_allowed`) et le
consentement personnel (`ai_programming`). Aucune ne rachète l'autre — le
consentement de l'athlète ne nous autorise pas à violer les conditions de
Garmin, et les conditions de Garmin ne consentent pas à sa place. Sans
consentement, le résultat est un tableau vide, et c'est aussi le résultat en
cas d'erreur : si on ne peut pas établir qu'une transmission est permise, elle
ne l'est pas.

---

## 2026-10 — Le serveur décide de ce qui part chez Gemini, pas le client

**Décision** : `athlete-insights` filtre le corps de requête par liste blanche
(`sanitizeTrendStats`) avant de construire son prompt. Seuls des champs connus,
retypés et bornés franchissent la frontière.

**Pourquoi** : le prompt interpolait `JSON.stringify(await req.json())` sur
4 000 caractères. Le serveur ne décidait donc pas de ce qu'il envoyait — le
client pouvait y placer n'importe quel champ et n'importe quel texte, payé par
notre quota et inséré dans les instructions du modèle. Un consentement au
traitement par IA ne porte que sur des données d'entraînement : il ne couvre
pas du texte arbitraire.

**Les bornes ne sont pas de la méfiance** mais les plages où une valeur a un
sens physiologique. Hors de là on renvoie `null` et non `0` : un zéro inventé
est une donnée fausse, que le modèle commenterait comme vraie (« ton sommeil
est tombé à 0 h »).

**Effet de cliquet voulu** : quand les données de montre arriveront, elles ne
pourront entrer dans ce prompt qu'en ajoutant explicitement un champ à
`SafeTrendStats` — l'occasion forcée de vérifier `ai_eligible_sources`.

**Limite connue, non traitée** : `ai-program` reçoit du coach un prompt en
texte libre, construit depuis des champs qu'il a saisis lui-même, et sans
identifiant d'athlète dans le corps de requête. Impossible d'y vérifier le
consentement `ai_programming` de l'athlète concerné sans changer le contrat
d'appel côté client. À traiter séparément.

---

## 2026-10 — Le journal de consentement est ordonné par séquence, pas par horodatage

**Décision** : `user_consents` reçoit une colonne `seq` (identité, `NOT NULL`,
`UNIQUE`), et `current_consents` ordonne par `seq DESC` au lieu de
`created_at DESC`.

**Pourquoi** : `created_at` vaut `now()`, qui est l'heure de *début de
transaction*. Deux décisions écrites dans la même transaction partagent donc
le même horodatage, et le `DISTINCT ON` n'avait aucun départageur : laquelle
est « la courante » devenait l'ordre physique des lignes, c'est-à-dire
indéterminé.

Découvert en testant le retrait du consentement IA — un retrait écrit juste
après un accord restait sans effet une fois sur deux.

**Ce n'est pas un détail de test.** L'article 7.1 demande de pouvoir *prouver*
le consentement. Un journal dont on ne peut pas dire avec certitude quelle est
la dernière décision ne prouve rien, et le sens de l'erreur est le pire
possible : c'est le **retrait** qui peut rester sans effet. Un `bigserial` est
exactement ce dont un journal en écriture seule a besoin — un ordre d'arrivée,
indépendant de l'horloge et du découpage en transactions. `created_at` reste la
donnée métier (quand la personne a décidé), `seq` devient la clé d'ordre (dans
quel ordre elle a décidé).

---

## 2026-10 — Le code d'autorisation COROS revient sur une Edge Function, pas sur une page React

**Décision** : le `redirect_uri` déclaré à COROS est
`{SUPABASE_URL}/functions/v1/provider-coros-callback`, une fonction déployée en
`verify_jwt = false`. Ce qui l'authentifie est le paramètre `state` : 256 bits
d'aléatoire que nous seuls avons émis, stockés côté serveur, consommés une
seule fois par `consume_oauth_state()` (un `DELETE ... RETURNING`), valables
dix minutes.

**Pourquoi** : COROS enregistre les clients en
`token_endpoint_auth_method: "none"`. Il n'y a donc aucun `client_secret`, et
toute la sécurité de l'échange tient au `code_verifier` PKCE. Si le retour se
faisait sur une page de l'application, il faudrait soit envoyer le `verifier`
au navigateur — ce qui annule PKCE, dont le principe est précisément que
personne d'autre que l'initiateur ne le connaisse — soit renvoyer le `code`
vers le serveur depuis le JavaScript, en le faisant au passage transiter par
l'URL d'une page, l'historique du navigateur et tout outil de mesure
d'audience présent.

En faisant atterrir le `code` directement sur la fonction, ni le `code` ni le
`verifier` ne touchent jamais notre code client. Le navigateur ne repart
qu'avec une redirection et un mot sur le résultat.

**Le prix à payer, et pourquoi il est acceptable** : la fonction est publique.
D'où le `state` consommé en une seule opération SQL plutôt qu'un `select` suivi
d'un `delete` — les Edge Functions sont sans état et concurrentes, et la
version en deux temps laisse une fenêtre où deux callbacks simultanés
réussissent tous les deux. Un appel sans `state` valide ne fait rien d'autre
que rediriger vers l'interface, et les trois cas « inconnu », « déjà
consommé » et « expiré » reçoivent volontairement la même réponse : les
distinguer renseignerait quelqu'un qui tâtonne.

---

## 2026-10 — `provider-disconnect` ne croit le `userId` du corps que sur présentation de la clé service_role

**Décision** : la fonction accepte deux appelants. L'athlète avec son jeton de
session, et `delete-account` avec la clé `service_role`. Le `userId` transmis
dans le corps n'est retenu que si le porteur est exactement
`SUPABASE_SERVICE_ROLE_KEY` ; sinon l'identité déconnectée est celle du JWT et
le corps est ignoré.

**Pourquoi** : `delete-account` appelait déjà `provider-disconnect` avec
`{ userId, provider, internal: true }`. Lire `userId` sans condition aurait
donné à n'importe qui le pouvoir de déconnecter la montre de n'importe qui, la
clé publiable suffisant à atteindre une Edge Function — exactement le trou
qu'avaient `ai-program` et `athlete-insights` avant d'être bouchés. Et le
drapeau `internal: true` n'entre pas dans la décision : une requête qui se
déclare interne ne l'est pas pour autant.

**Vérifié après déploiement** : un POST portant la clé publiable et
`userId: "00000000-…"` répond 401.

**Au passage** : `delete-account` lisait `provider_connections.user_id`, colonne
qui n'existe pas — elle s'appelle `athlete_id`. La requête échouait en 42703,
donc aucune révocation n'avait jamais lieu et un jeton fournisseur survivait à
la suppression du compte. Corrigé. Une erreur tolérée « au cas où la table
n'existe pas encore » masquait une erreur de nom : la tolérance au cas attendu
avalait le cas anormal.

---

## 2026-10 — Les métadonnées OAuth de COROS sont vérifiées, pas seulement lues

**Décision** : `fetchMetadata()` refuse de rendre un document dont l'`issuer`
diffère de l'hôte appelé, dont un endpoint sort de cette origine, ou qui
n'annonce pas `S256`.

**Pourquoi** : `mcp.coros.com` est un routeur. Interrogé depuis l'Europe il
renvoie des métadonnées dont l'`issuer` vaut `https://mcpeu.coros.com`, et
plusieurs clients MCP rejettent la connexion pour « origin mismatch ». Le
contrôle d'`issuer` transforme ce piège en message explicite au lieu d'un 401
inexplicable. Le contrôle d'origine des endpoints empêche un document altéré de
nous faire envoyer le `code` ailleurs. Et l'exigence de `S256` doit échouer
bruyamment : se rabattre sur `plain` reviendrait à désactiver la seule
protection d'un client sans secret.

La région est celle **du compte de l'athlète**, pas la nôtre, et rien ne permet
de la deviner avant qu'il se soit authentifié. Elle est donc demandée dans
l'interface (Europe par défaut) et conservée dans `provider_connections.api_host`.
Se tromper ne casse rien de définitif — l'autorisation échoue, on recommence.

---

## 2026-10 — Le `client_id` COROS vit en base, pas en variable d'environnement

**Décision** : un client enregistré par hôte régional via l'enregistrement
dynamique (RFC 7591), conservé dans `provider_oauth_clients`, créé à la volée
au premier athlète qui se connecte sur cette région. `COROS_CLIENT_ID` a été
retiré de `.env.example`.

**Pourquoi** : il n'y a pas *un* `client_id`. Il y en a un par hôte (`mcpeu`,
`mcpus`, `mcpcn`), et en faire des variables d'environnement obligerait à en
gérer trois et à redéployer pour ajouter une région. À l'inverse,
réenregistrer à chaque autorisation — ce que COROS accepte — créerait un client
par connexion, sans moyen de savoir lequel appartient à qui le jour où il faut
en révoquer un.

Pas de colonne pour un secret dans cette table, et c'est volontaire : COROS
n'en délivre pas. Prévoir la colonne laisserait croire le contraire.

---

## 2026-10 — Le consentement montre est demandé au moment de la connexion, pas à l'inscription

**Décision** : le panneau « Montres & services connectés » demande l'accord
`coros_sync` juste avant la redirection, avec le libellé exact archivé dans
`user_consents.statement`, et l'enregistre **avant** de partir — la redirection
n'a lieu qu'en cas de succès. `PrivacySection` n'affiche l'interrupteur
`coros_sync` que si une décision existe déjà.

**Pourquoi** : une case « synchroniser ma montre COROS » cochée à
l'inscription, alors que l'athlète n'a aucun compte COROS relié, n'est pas un
consentement éclairé — il ne sait ni ce qu'il autorise ni quand. Et dans
l'ordre inverse (autoriser chez COROS puis enregistrer l'accord), le
déclencheur `require_sync_consent` refuserait l'insertion au retour, laissant
l'athlète avec une autorisation accordée chez COROS et un échec incompréhensible
chez nous.

**Ce que la déconnexion n'efface pas** : les activités déjà importées. Ce sont
les données d'entraînement de l'athlète, pas celles du fournisseur. Les
supprimer parce qu'il débranche sa montre lui ferait perdre son historique sans
qu'il l'ait demandé — pour tout effacer, il y a la suppression de compte.
L'interface le dit explicitement plutôt que de laisser deviner.

Et quand COROS ne confirme pas la révocation, l'interface le dit aussi :
« déconnecté côté Agon » n'est pas « l'accès est coupé », et masquer la
différence donnerait à l'athlète une certitude qu'on n'a pas.

---

## 2026-10 — Les chiffres COROS viendront des fichiers FIT, pas des réponses MCP

**Décision** : la synchronisation COROS lira les binaires FIT obtenus par
`queryActivityFitFileDownloadUrls`. Les réponses des autres outils MCP sont
stockées telles quelles dans `raw` et ne servent pas de source de vérité
chiffrée. Conséquence sur l'ordre des chantiers : le parseur FIT devient une
dépendance de la synchronisation, pas un chantier parallèle.

**Pourquoi** : les outils MCP de COROS répondent **en prose**, pas en JSON.
`querySportRecords` rend des lignes du genre
`1. Sport(9807) — 2026-10-03 / Duration: 2:12:38 | Distance: 12.03 km`, et
`getActivityDetail` rend ses métriques en texte sans identifiant ni date. Ce
sont des réponses conçues pour être lues par un modèle de langage dans une
conversation. Parser « 12.03 km » marche aujourd'hui et casse silencieusement
le jour où un séparateur, une unité ou une traduction change. Un FIT est un
format binaire versionné : il casse franchement ou pas du tout.

`queryActivityFitFileDownloadUrls` accepte une plage de dates sans exiger
d'identifiant d'activité, donc l'ingestion peut être pilotée par des URL — des
jetons non ambigus — au lieu d'extraire des identifiants d'une phrase.

**Contrainte à intégrer dans la conception, pas à découvrir après** : 50
fichiers par utilisateur et par 24 h, 10 par appel. Un an d'historique
représente plusieurs jours de rattrapage par lots. Le rattrapage doit donc être
une tâche de fond reprenable qui retient où elle s'est arrêtée
(`synced_through`), et l'athlète doit voir son historique se remplir
progressivement plutôt que conclure que l'intégration ne marche pas.

Les données quotidiennes (sommeil, VFC, FC de repos, stress) n'ont pas
d'équivalent FIT et resteront en prose : raison supplémentaire de laisser
`data_source_policies.ai_allowed = false` pour `coros`. On ne veut pas qu'un
chiffre extrait d'une phrase par heuristique serve de base à un conseil.

*Réserve* : ces formats viennent de la documentation (`coroslab/COROS-MCP`),
pas d'une réponse observée — `/mcp` exige un jeton et aucun athlète n'est
encore connecté. À confronter au réel dès la première connexion.

---

## 2026-10 — `provider-coros-connect` refuse de démarrer sans `APP_URL`

**Décision** : si `APP_URL` n'est pas configuré, la fonction répond 503 avec un
message lisible au lieu de construire l'URL d'autorisation.

**Pourquoi** : `APP_URL` est l'adresse vers laquelle la fonction de retour
renvoie l'athlète, et elle vient de la configuration du serveur — jamais d'un
paramètre de requête, sous peine de faire de la fonction de retour une
redirection ouverte. Sans elle, l'athlète s'authentifierait chez COROS,
accorderait l'accès, puis atterrirait sur une adresse morte : autorisation bien
accordée côté COROS, aucune trace visible côté Agon, aucune idée de ce qui a
échoué. Refuser de partir est le seul comportement honnête — un bouton qui
explique qu'il ne marche pas vaut mieux qu'un aller sans retour.

---

## 2026-10 — Le décodeur FIT est écrit à la main, et partagé entre navigateur et Deno

**Décision** : un décodeur FIT sans dépendance dans
`supabase/functions/_shared/activityFiles/`, atteignable depuis `src/` par
l'alias `@shared`. Pas de bibliothèque npm, pas de copie côté client.

**Pourquoi** : le même format doit être lu à deux endroits — l'import manuel
d'un dossier d'activités par l'athlète, dans le navigateur, et la
synchronisation COROS, dans une Edge Function. Deux parseurs du même format
divergent toujours, et c'est alors l'écart entre un import manuel et une
synchronisation automatique du *même fichier* qui devient impossible à
expliquer. Les bibliothèques npm existantes ciblent Node et embarquent les
tables de profil Garmin, soit plusieurs mégaoctets pour lire quatre types de
messages.

Le dossier vit sous `supabase/functions/` et non dans `src/` parce que
`supabase functions deploy` ne met en paquet que ce répertoire : l'inverse
aurait obligé à dupliquer le fichier au déploiement. Seul `activityFiles/` est
portable et typé par `tsconfig.app.json` ; `auth.ts` importe depuis esm.sh et
resterait cassé au build.

**Pièges du format, pour ne pas les réapprendre** : le numéro de type de base
tient sur les bits 0-4, donc `& 0x1f` et non `& 0x0f` — sinon `uint64z` (0x10)
se lit comme `enum`. Les sentinelles d'invalidité (0xFF, 0xFFFF, 0x7FFF…)
deviennent `null` et jamais `0` : une fréquence cardiaque absente affichée à
zéro est un chiffre faux, pas une donnée manquante. `total_timer_time` est
préféré à `total_elapsed_time`, parce que les pauses faussent l'allure sur du
fractionné. Et le décalage UTC vient de l'écart entre `timestamp` et
`local_timestamp` du message `activity` — donc avec le bon changement d'heure,
ce qu'aucun calcul depuis le fuseau actuel de l'athlète ne donnerait.

**Tests** : un encodeur FIT conforme à la spec construit les octets attendus,
plutôt qu'un fichier binaire déposé en fixture. Un fixture opaque ne prouve que
l'absence de régression ; un encodeur prouve la conformité au format.

---

## 2026-10 — Les URL de fichiers FIT sont cherchées dans de la prose, les chiffres jamais

**Décision** : `extractFitUrls` cherche des URL par expression régulière dans
la réponse textuelle des outils MCP. Aucune autre valeur n'est extraite d'un
texte COROS : les métriques viennent du binaire FIT, et les données
quotidiennes sont stockées telles quelles dans `provider_dailies.raw`, colonnes
typées laissées vides.

**Pourquoi** : les outils MCP de COROS répondent en prose, conçue pour être lue
par un modèle de langage. Chercher dans du texte est donc inévitable quelque
part ; la question est de savoir quoi. Une URL est un jeton non ambigu : elle
est présente ou absente, et un lien mal découpé donne un 404 immédiat, pas un
chiffre faux. « 12.03 km » dépend d'un séparateur décimal, d'une unité et d'une
traduction — remplir `distance_m` à partir de là marcherait aujourd'hui et
casserait silencieusement le jour où COROS change une virgule.

Même raisonnement pour la santé : sommeil, VFC et FC de repos n'ont pas
d'équivalent FIT. Plutôt que de deviner `hrv_ms` depuis une phrase, le texte est
conservé brut. Un nombre extrait par heuristique aurait l'apparence d'une mesure
et serait affiché à côté de vraies mesures, indistinguable d'elles. C'est aussi
une raison de plus de laisser `data_source_policies.ai_allowed = false` pour
`coros` : on ne veut pas qu'un conseil s'appuie sur un chiffre deviné.

---

## 2026-10 — Le rattrapage d'historique avance par fenêtres de dates, jamais par sous-ensemble d'URL

**Décision** : la synchronisation demande les URL FIT sur une fenêtre de dates
(30 jours au départ), resserre la fenêtre — en divisant sa largeur — jusqu'à ce
que le nombre d'URL tienne dans le budget restant, et n'avance
`synced_through` que si la fenêtre a été traitée en entier.

**Pourquoi** : COROS limite à 50 téléchargements par athlète et par 24 h, 10 par
appel. Une plage d'un an renverrait des centaines d'URL dont on ne pourrait
traiter que quelques dizaines — et il faudrait alors choisir lesquelles. Comme
les URL ne portent pas de date (la date n'apparaît qu'après décodage du
fichier), tout choix arbitraire créerait des trous dans l'historique dont
personne ne saurait plus la cause. Avancer par fenêtres datées garantit qu'il
n'y a jamais de trou, seulement un bord qui progresse.

Lister est gratuit, télécharger est compté : relister une fenêtre plus étroite
coûte un appel et ne consomme aucun quota. C'est pour cela que la boucle
resserre au lieu de tronquer.

Conséquence assumée : un historique long se remplit sur plusieurs jours, et
l'interface le dit explicitement — sinon l'athlète conclut que l'intégration ne
marche pas.

---

## 2026-10 — Le budget de fichiers est plus étroit pour l'athlète que pour le cron

**Décision** : le cron (clé `service_role`) dispose des 50 fichiers quotidiens ;
un appel authentifié par un jeton de session en obtient 10. La distinction est
appliquée par le serveur, pas par l'interface.

**Pourquoi** : le quota est par athlète et par 24 h, et il est partagé entre le
bouton « synchroniser maintenant » et le rattrapage automatique. Laisser le
quota entier au bouton permettrait de l'épuiser en trois clics, puis de bloquer
le cron de la nuit suivante — l'athlète impatient se punirait lui-même, sans
rien voir. Le bouton est un complément, le cron est le rattrapage.

Côté interface, le même raisonnement se lit dans le compte rendu affiché : les
refus y figurent à côté des réussites. « 12 activités importées » sans mention
des 3 fichiers illisibles laisse croire à un succès complet, et l'athlète
cherche ensuite pourquoi une sortie manque.

---

## 2026-10 — Les noms d'outils MCP sont résolus contre la liste publiée par le serveur

**Décision** : à chaque exécution, la synchronisation appelle `tools/list`,
journalise les noms obtenus, et résout chaque outil dont elle a besoin par nom
exact, puis par casse, puis par motif. `resolveTool` renvoie `null` plutôt que
de deviner, et l'absence est remontée comme un refus explicite.

**Pourquoi** : nos noms d'outils viennent de la documentation, pas d'une réponse
observée — `/mcp` exige un jeton, et il a fallu écrire la synchronisation avant
qu'un athlète soit connecté. Le premier essai avait déjà noté `getActivityList`
là où l'outil s'appelle `querySportRecords` : la documentation s'était révélée
fausse une fois avant même la première requête. Un nom erroné produit une erreur
MCP opaque, qu'on passe une nuit à chercher du côté du serveur.

Le motif n'est pas là pour masquer un problème mais pour survivre à un
renommage tout en le rendant visible dans les journaux. Et la liste
journalisée est ce qui permettra enfin de remplacer, dans
`COROS_INTEGRATION.md`, une réserve documentaire par une observation.

---

## 2026-10 — Le doublon inter-sources est refusé à l'insertion, pas toléré

**Décision** : avant d'insérer une activité, la synchronisation vérifie
l'absence d'`external_id` identique pour cet athlète **toutes sources
confondues**, et non seulement pour `coros`.

**Pourquoi** : `external_id` est l'empreinte SHA-256 du contenu du fichier, et
la contrainte d'unicité porte sur `(athlete_id, source, external_id)`. Un
athlète qui importe son archive Strava *puis* connecte sa montre fournit donc
deux fois les mêmes octets sous deux sources : même empreinte, deux lignes, une
sortie affichée en double. La contrainte ne peut pas l'empêcher sans perdre la
capacité de distinguer les provenances, qui sert au contrôle `ai_allowed`. Le
contrôle explicite coûte une requête et évite un doublon visible que personne ne
saurait expliquer.

L'erreur 23505 reste traitée comme un doublon et non comme un échec : deux
exécutions concurrentes atteignent le résultat voulu.

---

## 2026-10 — Le cron appelle l'Edge Function avec la clé service_role lue dans le Vault

**Décision** : `trigger_coros_sync()` lit `project_url` et `service_role_key`
dans Supabase Vault et appelle la fonction par `net.http_post`. Les secrets ne
sont pas écrits dans la migration, et la fonction avertit puis ne fait rien s'ils
sont absents.

**Pourquoi** : une migration est versionnée, donc un secret écrit dedans est un
secret public. Le Vault est déjà en place pour les jetons fournisseurs ; l'y
ajouter n'élargit pas la surface — quiconque peut lire le Vault détient déjà les
jetons OAuth des athlètes.

**Alternative écartée** : un `CRON_SECRET` dédié, dont la fuite coûterait moins
cher que celle de la clé `service_role`. Il aurait fallu passer la fonction en
`verify_jwt = false`, un secret quelconque n'étant pas un JWT et la passerelle
Supabase le rejetant avant d'atteindre notre code. Pour une fonction capable
d'agir sur n'importe quel athlète, garder la vérification de jeton de la
passerelle vaut mieux qu'un secret plus étroit mais sans rempart devant.

Le choix de ne rien envoyer quand les secrets manquent est volontaire : un appel
vers `null/functions/v1/...` échouerait de façon illisible, alors qu'un
avertissement nommé se retrouve dans les journaux de pg_cron.

L'appel est asynchrone. Plusieurs athlètes, chacun avec des téléchargements de
fichiers, dépassent largement le temps qu'un travail cron doit passer à tenir
une transaction ouverte. Le vrai journal de ce qui s'est passé est
`provider_connections.last_sync_at` / `last_error`, pas le code de retour HTTP.

---

## 2026-10 — Le consentement montre est revérifié à chaque synchronisation

**Décision** : `syncConnection` appelle `hasConsent(..., "coros_sync")` avant de
parler à COROS. S'il est absent, la connexion passe en `consent_withdrawn` et la
synchronisation s'arrête.

**Pourquoi** : le jeton d'accès reste techniquement valide après un retrait de
consentement — c'est le choix documenté en 2026-10 de ne pas révoquer en SQL. Si
le cron continuait à puiser chez COROS avec ce jeton, la case décochée ne serait
qu'un affichage. Le contrôle à la connexion ne suffit pas : il protège le
premier accès, pas les trois cents suivants.

Au passage, l'énumération `provider_status` de l'interface avait été écrite de
mémoire, avec un `expired` et un `error` qui n'existent pas, et sans
`needs_reauth` qui existe — donc le seul état demandant une action de l'athlète
s'affichait comme `undefined`. Les quatre valeurs sont désormais reprises à
l'identique de la base, et distinctes exprès : `needs_reauth` est un refus du
fournisseur, `consent_withdrawn` une décision de l'athlète, et les confondre
ferait afficher « reconnecte ta montre » à quelqu'un qui vient justement de
retirer son accord.

---

## 2026-10 — Les décodeurs de fichiers d'activité sont partagés navigateur / Deno, et écrits à la main

**Décision** : FIT, TCX, GPX et la lecture d'archive vivent dans
`supabase/functions/_shared/activityFiles/`, sans aucune dépendance, et sont
importés par le navigateur via l'alias `@shared`. Le XML est analysé par un
scanner en flux écrit pour l'occasion, pas par `DOMParser` ni par une librairie.

**Pourquoi une seule implémentation** : `supabase functions deploy` ne met en
paquet que `supabase/functions/`, donc le code partagé doit y vivre ; le
navigateur le lit depuis là plutôt que d'en garder une copie. Deux parseurs du
même format divergent toujours, et l'écart apparaîtrait comme une différence
inexplicable entre l'import manuel et la synchronisation automatique du *même*
fichier.

**Pourquoi pas `DOMParser`** : il n'existe pas dans Deno, dont la bibliothèque
par défaut n'a aucun type DOM — `deno check` échouerait. Un parseur DOM coûte
par ailleurs des dizaines de mégaoctets de mémoire de pointe pour un GPX de
50 000 points, sur un téléphone, afin d'en extraire huit nombres. Le scanner
calcule les agrégats point par point.

**Pourquoi réduire les noms qualifiés au nom local** : Garmin écrit `ns3:TPX`,
d'autres `tpx:TPX`, Strava `gpxtpx:hr`. Le préfixe n'a aucune valeur
sémantique ; s'y fier ferait perdre la fréquence cardiaque selon l'exportateur,
sans erreur visible.

---

## 2026-10 — Chaque agrégat reconstitué nomme sa source dans `details`

**Décision** : `details` porte `distanceSource`, `durationSource`,
`avgHrSource`, `elevationSource` et `localDateSource`. Les agrégats sont pris
dans le fichier quand il les donne, et calculés sinon.

**Pourquoi** : les trois formats ne disent pas la même chose. Un FIT porte
`total_distance`, `total_ascent` et `total_timer_time` ; un TCX n'a que la
distance ; un GPX n'a rien. La durée d'un GPX est donc du temps écoulé, pauses
comprises, et son dénivelé est reconstruit. L'écart avec l'application du
fabricant est inévitable — ce qui est évitable, c'est qu'il soit inexplicable.

**Alternative écartée** : détecter les pauses d'un GPX par les trous entre
points. L'enregistrement intelligent laisse légitimement trente secondes entre
deux points en mouvement : la « correction » retirerait du temps réellement
couru.

**`Z` n'est pas le fuseau 0** : `Z` dit que l'instant est en UTC, pas que
l'athlète était à Greenwich. Le jour local retombe alors sur UTC, et
`localDateSource` le dit. Utiliser le fuseau de l'appareil qui importe a été
écarté : il est faux en voyage et, pire, il diffère entre le navigateur et une
Edge Function — soit deux jours locaux pour un seul fichier.

---

## 2026-10 — Garde-fous contre les nombres plausibles mais faux

**Décision** : position exactement (0, 0) ignorée, segments jamais pontés,
vitesse implicite au-delà de 40 m/s traitée comme un saut GPS, dénivelé calculé
avec une hystérésis de 3 m.

**Pourquoi** : chacun de ces cas produit un nombre d'apparence normale. (0, 0)
est la sentinelle d'absence de fix, dans le golfe de Guinée : la prendre pour
une position fait afficher un 10 km à 420 km. Sommer naïvement les écarts
d'altitude positifs fait du bruit barométrique le dénivelé lui-même sur 50 000
points. Et une frontière de `<trkseg>` ou de `<Track>` est une interruption
d'enregistrement : la corde droite qui la franchit n'a jamais été parcourue.

---

## 2026-10 — L'index du zip est lu depuis le répertoire central, par tranches

**Décision** : `listZipEntries` cherche l'EOCD en fin de fichier (ZIP64
compris) et lit l'index central ; les membres sont extraits par
`ByteSource.slice()`. La décompression est bornée pendant la lecture.

**Pourquoi le répertoire central** : les en-têtes locaux portent des zéros
quand le membre a été écrit en flux (descripteur de données différé). L'index
en fin de fichier est la seule source fiable — et c'est aussi ce qui autorise
la lecture ciblée.

**Pourquoi par tranches** : `Blob.slice()` ne lit que la plage demandée, donc
une archive plus grosse que la mémoire disponible reste traitable. Sur un
téléphone, avec un export de plusieurs centaines de mégaoctets, ce n'est pas un
cas théorique.

**Pourquoi la borne est vérifiée pendant la décompression** : un flux piégé ne
déclare pas sa taille. Attendre la fin pour s'apercevoir qu'elle dépasse la
mémoire disponible revient à ne pas la vérifier.

**Aucune dépendance** : `DecompressionStream` est dans la plateforme
(navigateur, Deno, Node 18+). Ajouter JSZip ou fflate aurait aussi signifié le
faire fonctionner sous Deno, pour un service déjà rendu.

---

## 2026-10 — L'aiguillage se fait sur le contenu, et les métadonnées sont comptées, pas refusées

**Décision** : `parseActivityFile` déplie `.gz` par suffixe *ou* par octets
magiques, puis reconnaît FIT, TCX et GPX à leur signature. Les membres
d'archive non exploitables (profil, flux, médias, `__MACOSX`) sont comptés dans
`ignored`, pas listés dans `rejected`.

**Pourquoi le contenu** : un athlète renomme, le système ajoute « (1) », un
exportateur écrit `.gpx` dans un fichier qui est un TCX. Décider sur
l'extension donne alors une erreur de décodage incompréhensible, là où une
signature donne une réponse juste ou un refus clair — « racine `<gpx>` : ce
fichier est un GPX, pas un TCX ».

**Pourquoi compter sans refuser** : un export Strava contient une vingtaine de
fichiers de métadonnées. Les lister comme « refusés » noierait les vrais refus,
ceux dont l'athlète doit s'inquiéter. Pour la même raison, un membre illisible
n'interrompt pas l'archive : sur quatre cents sorties, une seule abîmée
annulerait tout l'import sans que personne sache laquelle retirer.

---

## 2026-10 — L'import de fichiers se fait entièrement dans le navigateur

**Décision** : l'athlète dépose ses fichiers, le navigateur les décode et
n'envoie que les lignes `provider_activities` (`source = 'file_import'`). Les
octets ne quittent pas l'appareil et ne sont pas conservés. Les décodeurs sont
chargés en `import()` dynamique.

**Pourquoi** : une archive d'export pèse couramment plusieurs centaines de
mégaoctets. La téléverser pour en extraire huit nombres par sortie coûterait à
l'athlète son forfait mobile pour un résultat identique — et se heurterait aux
limites de taille de requête et de durée d'une Edge Function. Accessoirement,
ne rien stocker est la position la plus simple à tenir vis-à-vis du RGPD : il
n'y a pas de fichier à effacer.

**Pourquoi le chargement différé** : les quatre formats réunis pèsent plus que
l'écran de séance (26 ko de paquet), et la quasi-totalité des ouvertures de
l'application n'importe aucun fichier. L'import est déjà un geste long,
quelques centaines de millisecondes y sont invisibles ; un démarrage alourdi,
non.

---

## 2026-10 — Deux enregistrements d'une même sortie sont rapprochés sur l'heure de départ et le sport

**Décision** : au-delà du contrôle d'empreinte, une activité dont le départ
tombe à moins de deux minutes d'une activité déjà en base est comptée comme
déjà connue — sauf si les deux sports sont connus et différents.

**Pourquoi** : `external_id` est l'empreinte du *contenu*. Le FIT et le GPX
d'une même sortie ont des octets différents, donc des empreintes différentes, et
la contrainte d'unicité ne peut rien y voir. Strava exporte parfois les deux : un
athlète qui dépose « tout » aurait chaque sortie en double sans qu'aucun chiffre
ne l'explique.

**Pourquoi deux minutes et pas dix** : un export GPX perd les secondes
antérieures à la première position GPS, donc son début arrive après celui du
FIT, mais jamais de beaucoup. **Pourquoi le contrôle du sport** : sans lui, la
transition d'un triathlon — natation puis vélo démarrés à une minute
d'intervalle — ferait disparaître une discipline entière. L'erreur à éviter en
priorité est celle-là : un doublon affiché se voit et s'efface, une sortie
avalée disparaît du suivi sans message.

Le rapprochement s'applique aussi à l'intérieur d'un même dépôt : les deux
fichiers sont alors nouveaux vis-à-vis de la base, et c'est l'un par rapport à
l'autre qu'ils font doublon.

---

*Ajouter une entrée ici à chaque décision technique importante : changement d'architecture, choix de librairie, refactorisation majeure, changement de workflow.*
