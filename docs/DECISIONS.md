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

**Suite, sur `ai-program`** : la fonction recevait du coach un prompt en texte
libre et aucun identifiant d'athlète. Elle ne pouvait donc vérifier aucun
consentement — un coach générait un programme par IA pour un athlète qui avait
refusé, et la case décochée ne protégeait de rien. Le contrat d'appel a été
changé : `athleteId` est désormais obligatoire dans le corps de requête, et un
identifiant absent vaut refus (400). Laisser passer en son absence aurait rendu
la protection silencieusement caduque le jour où un appelant oublie le champ.

**Pourquoi la vérification est en deux temps** : `canActForAthlete()` d'abord,
`hasConsent()` ensuite. Un identifiant transmis par le client n'est qu'une
déclaration ; sans contrôle, il suffirait d'envoyer celui d'un athlète
consentant pour contourner le refus d'un autre. L'appelant doit donc être
l'athlète lui-même ou son coach.

**Pourquoi `canActForAthlete()` lit `profiles` au lieu d'appeler
`is_coach_of()`**, qui exprime pourtant déjà cette relation : la fonction SQL
est en `SECURITY INVOKER` et repose sur `auth.uid()`. L'appeler depuis une Edge
Function suppose un client portant le jeton de l'appelant, donc une clé
publiable disponible côté serveur. Or le projet est passé aux clés
`sb_publishable_…`, et la présence de l'ancienne `SUPABASE_ANON_KEY` dans
l'environnement des fonctions n'est pas vérifiable sans session réelle. Une
règle d'autorisation adossée à une variable incertaine ne tombe pas en panne
franchement : elle refuse tout le monde, et le message ment — « tu n'es pas le
coach de cet athlète » pour une clé absente. On préfère ici une comparaison de
colonne en `service_role`, déterministe, comme le fait déjà `unlink-athlete`.
Le prix est une duplication de la règle ; il est payé consciemment contre un
mode de panne trompeur sur un chemin d'autorisation.

**Ce que ça ne couvre pas** : le prompt reste du texte libre saisi par le
coach. On vérifie *qui* peut déclencher un traitement et *pour qui*, pas ce que
le coach choisit d'y écrire. Le filtrage par liste blanche d'`athlete-insights`
n'a pas d'équivalent ici, parce que la consigne de programmation est, par
nature, rédigée.

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

## 2026-10 — Un seul composant et un seul hook de sorties pour l'athlète et pour son coach

**Décision** : `ProviderActivityList` et `useProviderActivities` sont montés tels
quels des deux côtés. Aucun filtre de visibilité n'est écrit en TypeScript ; la
requête est identique et c'est RLS qui tranche.

**Pourquoi** : côté coach, trois conditions doivent être réunies — être le coach
de cet athlète, que les conditions du fournisseur autorisent l'affichage à un
tiers (`coach_visible`), et que l'athlète ait consenti à la synchronisation de
cette source. Les réécrire dans le client donnerait deux règles à maintenir dont
une seule protège vraiment, et celle du client serait contournable. Deux
composants divergeraient aussi avec le temps, et l'athlète finirait par ne plus
savoir ce que son coach voit.

**Conséquence assumée** : un coach peut voir une liste plus courte que son
athlète, sans message d'erreur. C'est le comportement voulu — un retrait de
consentement doit agir tout de suite, pas après un nettoyage qu'on penserait à
faire.

**Exception au masquage en `viewOnly`** : dans le profil athlète, les blocs
« Montres & services connectés » et « Confidentialité » sont cachés au coach
parce qu'ils engagent l'athlète auprès d'un tiers. La liste des sorties, elle,
reste visible : elle ne fait que lire, et la base limite déjà ce qu'elle rend.

---

## 2026-10 — La provenance des chiffres est affichée, pas seulement stockée

**Décision** : chaque ligne de sortie se déplie sur les mentions de provenance
écrites par les décodeurs (`distanceSource`, `durationSource`,
`elevationSource`, `avgHrSource`, `localDateSource`, `skippedLegs`), rendues
telles quelles. Un FIT, dont les valeurs sont lues et non calculées, affiche à la
place une phrase unique disant exactement cela.

**Pourquoi** : un GPX n'a ni durée de mouvement ni dénivelé mesuré. L'écart avec
l'application du fabricant est donc inévitable, et sans explication la seule
conclusion possible pour l'athlète est « Agon se trompe ». C'est la partie de
l'interface qui paraît superflue et qui ne l'est pas.

**Pourquoi ne pas retraduire les mentions côté affichage** : les décodeurs les
écrivent déjà en français lisible. Les reformuler ici créerait une deuxième
version du même texte, qui cesserait de correspondre à la première dès la
prochaine modification d'un décodeur.

---

## 2026-10 — Une mesure absente affiche un tiret, jamais zéro, et seules les mesures présentes sont affichées

**Décision** : les formateurs de `activityDisplay.ts` rendent « — » pour `null`,
`undefined`, `NaN` et — pour une durée ou une allure — pour zéro. La liste ne
construit la rangée de mesures qu'avec les champs qui ont une valeur.

**Pourquoi** : une allure à 0:00 posée à côté de vraies mesures a le même poids
visuel qu'elles alors qu'elle ne mesure rien, et `distance_m / 1000` rendrait
`NaN` sans la conversion des `numeric` que PostgREST sérialise en texte — le
symptôme serait une colonne vide, pas une erreur. Inversement, afficher
systématiquement les six mesures donnerait des rangées de tirets : une case vide
en dit plus qu'un zéro, mais quatre cases vides ne disent rien. Les mesures
disponibles dépendent de ce que le fichier contient, pas du sport — une
« natation » sans distance et un renforcement avec cardio existent tous les deux.

**Cas voisin** : `+0 m` de dénivelé est conservé, parce que c'est une vraie
mesure sur du plat.

---

## 2026-10 — Les sorties réelles et les séances programmées restent deux blocs séparés

**Décision** : dans l'onglet Historique, la liste des sorties de montre est
placée au-dessus de l'historique des séances, dans son propre cadre. Le
récapitulatif par sport se limite à trois chiffres et ne produit aucun graphique.

**Pourquoi** : ce que la montre a enregistré n'est pas ce que le coach avait
programmé. Un graphique de plus à côté de ceux du suivi inviterait à comparer
deux séries qui ne mesurent pas la même chose, et un écart serait lu comme une
erreur de l'application. L'ordre reflète la question que le coach se pose en
ouvrant l'onglet : ce que l'athlète a réellement fait.

---

## 2026-10 — Les données Garmin sont exclues de tout traitement par IA, sans y être obligées

**Décision** : `data_source_policies.ai_allowed` passe à `false` pour `garmin`
(migration `20261029100000_garmin_ai_opt_out.sql`). Gemini reste déclaré comme
sous-traitant dans le dossier Garmin et dans la politique de confidentialité —
il est toujours utilisé pour la rédaction assistée de programmes, la barre de
chat du coach et les insights d'athlète — mais aucune donnée issue de l'API
Garmin ne l'atteint.

**Pourquoi, alors que rien ne l'impose** : la clause 4.1(b) du Connect
Developer Program Agreement autorise l'affichage à un tiers avec le
consentement de l'utilisateur et ne dit rien de l'IA. Le champ « tiers qui
traitent les données de l'appareil » du formulaire est celui qui fait refuser
les dossiers, et il appelle une réponse qu'un relecteur puisse contrôler.
Déclarer « Gemini est utilisé, mais pas sur vos données » n'a de valeur que si
c'est le schéma qui l'empêche, et pas la discipline du code applicatif. Le
trigger `apply_source_ai_policy` écrase ce que l'appelant a posé : un client
compromis ne peut pas marquer une donnée Garmin comme transmissible.

**Ce qui a motivé la vérification** : la fonctionnalité IA était crue
abandonnée. Elle ne l'est pas — trois surfaces sont montées et actives
(`CoachProgramEditor`, `AIChatBar` dans `CoachLayout`, `athlete-insights` via
`useAthleteTrends`). Déclarer à Garmin l'absence de traitement IA aurait été
une fausse déclaration, et une fausse déclaration découverte après approbation
coûte l'accès. D'où la règle : on vérifie dans le code avant de déclarer, même
quand on est à peu près sûr.

**Conséquence assumée** : le consentement `ai_programming` de l'athlète ne
lève pas cette exclusion. Un athlète qui accepte le traitement par IA verra
quand même ses données Garmin en être écartées. L'inverse lui ferait porter une
décision qui est la nôtre, prise vis-à-vis d'un fournisseur.

**Pour revenir en arrière** : il ne suffit pas de repasser la ligne à `true`.
L'exclusion est déclarée dans le dossier, donc le changement doit être annoncé
à Garmin. `coros` reste à `false` pour une raison différente — ses conditions
n'ont pas été relues sur ce point.

---

## 2026-10 — La Training API est demandée à Garmin avant d'être codée, et le dossier le dit

**Décision** : le dossier Garmin demande trois APIs — Activity, Health et
**Training** — au lieu des deux initialement prévues. Courses et Women's Health
restent écartées.

**Pourquoi Training** : elle publie une séance vers le calendrier Garmin
Connect de l'athlète, qui la synchronise sur sa montre. C'est le seul sens
Agon → appareil qu'offre le palier Starter, et il correspond au cœur du
produit : mettre la prescription du coach sous les yeux de l'athlète au moment
où il s'entraîne. Aujourd'hui cela veut dire lire son téléphone entre deux
séries.

**Pourquoi la demander maintenant alors qu'elle n'est pas codée** : trois voies
existaient, deux étaient mauvaises. L'ajouter après coup suppose de redéposer
une demande et de repasser une revue. La demander en laissant croire qu'elle
est implémentée est une fausse déclaration. Reste la troisième : la demander en
écrivant qu'elle est à construire, ce que fait le §4. Un périmètre annoncé
comme futur et décrit précisément se défend ; un périmètre non décrit se lit
comme une prise de scope.

**Ce que ça ajoute au travail d'après approbation** : traduire une séance Agon
en *workout* Garmin, et tenir la mise à jour et la suppression. Une séance
modifiée par le coach doit l'être aussi dans le calendrier de l'athlète, sinon
il s'entraîne sur une version périmée — c'est le bogue qui ferait perdre
confiance le plus vite. Le rendu dépend du modèle de montre : une séance de
course structurée passe bien, une séance de force détaillée moins.

**Pourquoi pas Courses ni Women's Health** : Agon ne planifie pas d'itinéraire.
Les données de cycle menstruel relèvent de l'article 9 du RGPD — consentement
explicite distinct, analyse d'impact, conservation propre. C'est un chantier de
conformité entier, pas une case à cocher.


## 2026-10 — L'assistant IA du coach lit par une API et propose, il n'écrit pas

**Contexte** : un coach veut que son assistant IA personnel (Claude, sur son
ordinateur) lise les données de ses athlètes pour en faire des analyses et des
synthèses, et lui propose des axes de travail ou des modifications. Modèle
repris d'une autre app (Polaris), adapté à ce qui diffère ici : des données de
santé, et plusieurs personnes autour d'un même athlète.

**Décision** : Edge Function `coach-api`, clé `agon_…` réservée aux coachs
(hash SHA-256 seul en base), lecture des athlètes consentants, et dépôt de
propositions dans `coach_api_drafts` que le coach applique ou écarte dans Agon.

**Pourquoi des propositions et pas des écritures** : deux raisons, chacune
suffisante.
- Le front charge chaque clé `app_data` entière et la réécrit entière à la
  sauvegarde suivante. Une écriture serveur faite pendant qu'un onglet est
  ouvert serait écrasée sans bruit. Polaris règle ce problème par une file
  d'opérations rejouée automatiquement ; ici le rejeu est un clic du coach, et
  il passe par la même mutation que l'éditeur.
- Le texte de consentement dit à l'athlète que son coach « relit tout ». Une
  écriture directe le rendrait faux.

**Pourquoi un module d'opérations partagé** (`_shared/coachApiOps.ts`) : le
serveur valide la proposition, l'app l'applique. Avec deux définitions, une
proposition acceptée par l'un pourrait être appliquée autrement par l'autre.
L'id d'un exercice ajouté est fixé à la validation, donc l'application est
déterministe. Une modification de paramètres exige `a_partir_de` (numéro
d'occurrence de la séance) : sans lui, elle réécrirait aussi les séances déjà
faites, comme le rappelle `toMultiWeekSession`.

**Pourquoi une empreinte de contenu et pas `updated_at`** : pour prévenir le
coach qu'un programme a changé depuis la proposition. `app_data.updated_at`
n'est écrit que par `sSave`, pas par `useUpdateProgrammation`, et aucun trigger
ne le tient à jour. Le faire bouger à chaque édition aurait changé les fils
d'activité qui le lisent. La proposition garde le SHA-256 du JSON visé ; l'app
le recalcule avant d'appliquer.

**Consentement** : une seule case IA (`ai_programming`), élargie pour nommer
Google Gemini (via Agon) et l'assistant Claude du coach. Choix du propriétaire,
contre une case séparée par destinataire comme pour Garmin et COROS. Le texte
reste exact sur ce qui diffère : Agon peut garantir que Gemini n'entraîne pas
ses modèles avec ces données (API payante), pas Claude, qui passe par le compte
personnel du coach. Un accord donné sous l'ancien texte ne vaut pas pour
Claude : le serveur exige `doc_version >= AI_ASSISTANT_SINCE`, et
`LEGAL_VERSION` passe au 30 octobre pour re-solliciter tout le monde.

**Ce qui ne sort pas** : le texte libre écrit par l'athlète (ressenti,
commentaires de séance, notes de sommeil ou de blessure) — c'est là qu'un
diagnostic ou un traitement peut se glisser. Le nom de famille. Les données
Garmin (les vues `ai_provider_*` les excluent déjà). Un athlète qui n'a pas
consenti n'apparaît pas du tout, et « pas ton athlète » et « pas d'accord »
renvoient la même 404 : la différence révélerait sa décision.

**Traçabilité** : chaque lecture est écrite dans `coach_api_access_log` avant
d'être servie ; si l'écriture échoue, rien n'est servi. C'est ce qui permet de
répondre à l'art. 15.1.c (à qui ses données ont été communiquées) avec des
faits.

**Semaine d'entraînement** (`kind: "semaine"`) : l'assistant propose en un
bloc des séances créées (musculation dans `asp:prog`, énergie en copie propre
à l'athlète), leurs placements sur des dates et le thème de chaque jour. Elle
ajoute sans rien supprimer ; seul le thème d'un jour déjà posé est remplacé,
et l'aperçu le montre barré (choix du propriétaire). Les séances de muscu
créées sont `once`, sans jour fixe : elles n'ont lieu qu'aux dates placées.
Les séances énergétiques arrivent en JSON structuré, validé côté serveur
comme le reste, plutôt qu'en texte YOXX : les parseurs YOXX dépendent de
`src/` et ne tournent pas dans Deno, donc l'assistant n'aurait reçu aucune
erreur à corriger. Les écritures d'une semaine (programme, séances,
placements, thèmes) ne sont pas atomiques : une panne en route est défaite
par le journal d'annulation (voir plus bas).

**Écriture directe et annulation** (31/10/2026) : le coach veut que
l'assistant inscrive lui-même ce qu'ils ont validé ensemble, sans clic de
plus. `"appliquer": true` sur une proposition l'applique tout de suite ; le
mode d'emploi réserve ce cas à une demande explicite du coach. Pas
d'interrupteur par clé (choix du propriétaire, contre ma recommandation : une
clé volée peut donc écrire). Contrepartie demandée par le propriétaire : tout
doit pouvoir être défait. L'application se fait désormais **côté serveur**,
pour le clic dans Agon comme pour l'assistant (l'app appelle `coach-api` avec
la session du coach) : un seul code, et un journal d'annulation (`undo`) que
seul le serveur écrit — il est rejoué avec la clé de service, il ne doit pas
venir du navigateur. Le journal sert aussi de rollback : une application qui
échoue en route est défaite avant de répondre. L'annulation ne supprime
jamais ce que l'athlète a réalisé (séance faite, séance énergie faite), ni la
définition d'une séance qu'il a faite ; elle refuse d'écraser un programme ou
des objectifs modifiés depuis sans confirmation (`forcer`). La politique RLS
ne laisse plus au coach que « écarter » depuis le navigateur.

**Événements** : compétitions, tests (valeurs mesurées), et événements du
calendrier de l'athlète **avec leur titre**, texte libre de l'athlète —
exception assumée à la règle ci-dessus, choisie par le propriétaire et
annoncée dans le texte de consentement.

**Planification** (`kind: "plan"`, 01/11/2026) : périodisation, compétitions,
tests et retraits du planning, plus toutes les opérations d'une semaine, dans
**une seule proposition** — donc une seule annulation pour un plan entier.
Les règles du planning de l'app (lundi → dimanche, une semaine par semaine
ISO, pas de chevauchement entre sœurs, un enfant dans son parent) sont
vérifiées à la validation sur une copie de l'état, opération après
opération : l'assistant reçoit une erreur qui nomme le champ. C'est la seule
garde : la base ne les vérifie pas. La copie suit aussi les séances prévues
qui partent avec leur semaine, pour refuser dès la validation ce qui
échouerait à l'application. Testé contre la structure réelle des tables
(contraintes, cascades, triggers) chargée dans PGlite : saison complète,
suppressions en cascade, déplacement de cycle, panne en route, annulation
exacte. Choix du propriétaire : suppression
autorisée, mais **le réalisé reste** — supprimer un cycle retire ses séances
prévues, les séances faites restent sans semaine (alors que l'écran de l'app
les supprime) ; un test passé ne se modifie pas ; une séance retirée passe
« sautée » (comme le calendrier du coach, pour ne pas réapparaître).
Journal : lignes supprimées (colonnes listées, `ROW_COLUMNS`), modifiées, et
liens remis à zéro par une suppression (`relink` : semaine d'une séance faite,
compétition d'un plan de course) ; les enfants sont inscrits avant les
parents, pour que l'annulation recrée les parents d'abord. Mésocycles et
semaines n'ont pas d'`athlete_id` : l'annulation vérifie que leur parent est
à l'athlète, et force `athlete_id` sur toute ligne recréée.

**Fiches et habitudes** (01/11/2026, même `kind: "plan"`) : l'assistant
attribue une fiche du coach (`doc_assignments` source `manuel`, avec note),
la rattache à une séance (JSON de `asp:prog` ou `energy_sessions.fiches`),
crée des habitudes, et dépose une fiche qu'il a fabriquée (`POST /fiches`).
- Une fiche fabriquée arrive **en banque**, étiquetée `claude`, jamais
  directement en fiche perso : la RLS `can_read_doc` rend une fiche perso
  visible à l'athlète dès qu'elle existe, ce qui contournerait la
  proposition. `assign_fiche` avec `perso: true` la range chez l'athlète
  (l'annulation la remet en banque), seulement si elle vient de l'assistant
  et n'est donnée à personne d'autre. Le dépôt n'écrit rien chez un athlète :
  il est direct (choix du propriétaire), et se défait par `DELETE /fiches/:id`
  ou depuis la banque.
- Pas de rattachement sur une séance énergétique de la bibliothèque : elle est
  partagée, le changement toucherait d'autres athlètes.
- Rattachements journalisés à l'unité (`fiche_link` / `fiche_unlink`), pas par
  copie de tout `asp:prog` : annuler ne refuse pas pour un programme modifié
  depuis, et n'efface pas les retouches du coach.
- Le serveur resynchronise lui-même les attributions `programme` / `energie`
  après chaque application et annulation (`syncFicheAssignments`, même calcul
  que la RPC `sync_doc_assignments`, qui exige une session) : une écriture
  directe est vue tout de suite par l'athlète. Une attribution recréée ainsi
  repart « non vue ».
- `habits.created_by` (migration 20261101120000) : NULL = posée par l'athlète.
  Le nom de ces habitudes est un texte libre de l'athlète, il ne sort pas
  (assiduité seulement) et l'assistant ne les modifie pas. La première
  habitude active `habit_tracker_enabled` ; l'annulation le désactive, sauf
  si une habitude créée avec lui a été cochée (elle reste, le suivi aussi).
- Testé contre la structure réelle des tables (PGlite) : contraintes
  d'unicité, cascades, panne en route, annulation exacte.

**Limites connues** :
- Si l'athlète renomme une habitude posée par le coach, son nouveau nom part
  chez l'assistant.
- La base ne vérifie ni les chevauchements ni l'inclusion dans le parent
  (aucun trigger, vérifié le 01/11/2026 ; seul `end_date > start_date`) : le
  validateur est la seule garde. Une proposition appliquée longtemps après sa
  validation n'est pas recontrôlée.
- L'athlète ne voit pas lui-même ce journal : il faut le lui fournir sur
  demande.
- Si l'éditeur de programmation est ouvert pendant une écriture directe, sa
  sauvegarde différée peut l'écraser.

- Si le coach applique une proposition pendant que l'éditeur de programmation
  a une sauvegarde différée en cours (800 ms), cette sauvegarde peut l'écraser.
  Fenêtre étroite, non traitée.

---

## 2026-10 — Tests HYROX : moteur pur, paramètres versionnés injectés

**Décision** : le moteur des Tests HYROX (`src/lib/hyrox/tests/`) ne lit aucune constante de grille. Il reçoit un `GridSet` (grilles 1-5, poids, paramètres course, paramètres d'axes, règles), stampe chaque sortie `algo_version` + `grid_version`, et ne modifie jamais les entrées brutes. `GRID_SET_V1` est la seule copie des valeurs v1 : il servira de seed SQL.

**Pourquoi** : Hugo veut perfectionner la batterie et les calculs en continu, sans redéployer, et pouvoir recalculer une ancienne analyse avec une nouvelle version sans perdre l'ancienne (comparaison aux vrais chronos de course).

**Détails** :
- Port fidèle du radar bilan YOXX du 31/10/2026, vérifié par les golden tests 1 à 3 (le radar exécuté dans node a servi d'oracle).
- Les prédictions 5 et 10 km tronquent les secondes à l'affichage (`fmtTime(s, { floor: true })`), comme l'outil de référence (10 km = 55:22,8 → 55:22).
- Le moteur propose les axes de travail ; seule la version validée par le coach sera montrée à l'athlète (PR 2 et 4).
- Règles d'axes sous forme de données (`condition` jsonb : métrique, opérateur, seuil, `all` / `any`), pour vivre dans `hyrox_work_axes_rules`.

---

## 2026-11 — Tests HYROX en base : snapshot figé, brouillon d'axes séparé, courses dans hyrox_results

**Décision** :
- Une analyse (`hyrox_test_analyses`) est un snapshot figé par trigger : entrées brutes, profil, sorties et versions. Recalculer avec une autre version crée une nouvelle ligne (`recalculated_from`), l'ancienne reste.
- La proposition d'axes du moteur et le contexte de l'athlète (douleur, blessure, envie) vivent dans `hyrox_test_axes_drafts`, lisible par le coach et l'admin seulement. L'athlète lit une analyse seulement après validation (`validated_at`, qui exige `axes_validated`). La RLS n'est donc pas calquée à l'identique sur `hyrox_results` : l'athlète n'écrit pas d'analyse.
- Pas de table `hyrox_race_results` : les courses vivent déjà dans `hyrox_results` (runs, stations, Roxzone, rang, participants) ; on y ajoute top % final, rang et top % Roxzone, cause.
- Grilles, paramètres et règles dans 5 tables versionnées, une seule version active.
- Seed généré depuis `GRID_SET_V1` et vérifié par un test : une seule source pour les valeurs v1.

**Pourquoi** : « l'athlète ne voit que ce que le coach a validé, jamais un brouillon » ne tient pas avec une RLS par ligne si brouillon et version validée partagent la ligne. Une table de courses parallèle aurait dédoublé la saisie du coach.

**Testé** : PGlite (`supabase/tests/hyrox_tests_pglite.mjs`), 29 contrôles : idempotence, seed, presets, RLS coach / athlète / autre coach / admin, gel, une seule version active, synchro des saisies.


## 2026-11 — Tests HYROX : calcul côté client, saisie par le circuit des tests programmés

**Contexte** : il fallait brancher la saisie de la semaine de bilan, la fiche résultat, la validation des axes, le recalcul et la calibration.

**Décisions** :
- **Saisie** : athlète et coach écrivent une ligne `test_sessions` complétée ; le trigger existant `sync_test_session_to_results` alimente `athlete_test_results`. Pas de deuxième chemin d'écriture, et la saisie apparaît dans le calendrier comme les autres tests.
- **Noms des presets** : le trigger retrouve un test par son nom. Le preset v3 du BBJ s'appelle « Burpee broad jump 80 m · bilan » parce que l'ancien preset « Burpee broad jump 80 m » existe toujours (aucun preset existant renommé ni supprimé). Un test bloque toute future collision.
- **Calcul** : dans le navigateur, avec le moteur pur et la version de grilles lue en base ; le résultat est enregistré figé (`storedOutputs`, sans la proposition d'axes qui vit dans le brouillon). Pas d'Edge Function : mêmes résultats que les tests, rien à déployer.
- **Analyse = une période** : pour chaque test, le résultat le plus récent entre deux dates (21 jours par défaut jusqu'au dernier résultat). Les ids des résultats retenus sont gardés (`source_result_ids`).
- **Axes validés** : type `ValidatedAxes` (textes réécrits par le coach), distinct de la proposition `AxesPlan`. L'athlète ne lit que lui.
- **Ce que voit l'athlète** : la base lui donne l'analyse validée entière (`outputs` compris) ; c'est l'interface qui retire E, les 6 zones, D′, le tableau % VC et les règles. Acceptable : ce sont ses propres données, pas celles d'un autre ; à revoir si on veut cacher ces valeurs au niveau de la base (vue ou colonne séparée).
- **Recalcul** réservé à l'admin, seulement quand la version active des grilles ou du calcul diffère.

**Testé** : `hyroxTestsMapping.test.ts` (golden 1 saisi dans les presets v3 = mêmes notes, fenêtre, profil, calibration, CSV), `AnalysisSheet.test.tsx` (vue athlète), PGlite 30 contrôles (dont la synchro du BBJ vers le preset v3).

---

## 2026-11 — Les sorties de montre comptent dans le volume de course, une seule fois

**Décision** : le volume de course (profil athlète, fiche coach, km des retours)
additionne les sorties de course de `provider_activities` (montre ou fichier
importé) et la saisie manuelle, après dédoublonnage. Le calcul est pur et vit
dans `src/lib/watchRunMatching.ts` (`buildRunLedger`) ; `useRunningVolume` est le
seul hook qui le lit. Calcul côté client, aucun changement de schéma.

**Ce qui est de la course** : `running` et ses variantes (trail, tapis, piste,
virtuel, et les types Garmin à venir), comparés sans casse ni séparateur. La
marche, la randonnée, `wheelchair_push_run` et un sport inconnu ne comptent pas.

**Rattachement** : une sortie se rattache à une séance énergie / spécifique
prévue **le même jour local** (`local_date` = `scheduled_date`), une pour une. Une
séance est « de la course » si elle a été validée en « Course », ou, tant qu'elle
ne l'est pas, si son type est VMA, tempo, seuil, footing ou fartlek ; jamais si
elle est `skipped`. S'il y a plusieurs candidats, le couple le plus proche en
distance et en durée passe d'abord (saisie si elle existe, sinon prévu). Les
sorties restantes se rapprochent ensuite des activités libres « course » du jour.

**Dédoublonnage** : un couple rapproché ne produit qu'une ligne de km, celle de
la montre ; la saisie ne sert que si la sortie n'a pas de distance. Pourquoi la
montre : le champ km de fin de séance est pré-rempli avec la distance *prévue*,
donc valider sans corriger enregistre le plan ; la montre a mesuré. Deux copies
d'une même sortie (FIT importé + synchro, départs à moins de 2 min) ne comptent
qu'une fois. Les km courus en séance de muscu s'ajoutent toujours, sans
rapprochement.

**Comment évolue « deux blocs séparés »** : les blocs restent séparés et aucun
graphique ne compare prévu et réalisé. Ils se *citent* : la séance prévue porte
« Réalisée — 10,2 km montre » (retours coach, aperçu du jour athlète), la sortie
porte « Séance prévue : Footing » (liste des sorties, des deux côtés). Le statut
de la séance n'est pas modifié en base — c'est l'athlète qui valide, avec son
RPE. Le graphique de volume mélange les deux sources parce qu'il mesure une seule
chose, des km réellement courus ; la part montre est écrite sous le graphique et
sur la tuile des retours (décision « la provenance des chiffres est affichée »).

**Testé** : `src/lib/__tests__/watchRunMatching.test.ts`.

---

## 2026-11 — Synchro COROS : le curseur ne couvre que des journées terminées, et chaque passage relit les derniers jours

**Décision** : `synced_through` ne dépasse jamais le dernier jour *terminé*
(`lastSettledDay`) : la veille du jour local de l'athlète si son fuseau est
connu (décalage UTC lu dans son dernier FIT), sinon le jour de `now − 36 h`,
terminé partout sur Terre. Chaque passage relit d'abord une fenêtre récente —
les 2 derniers jours terminés, la veille et aujourd'hui (`COROS_RESCAN_DAYS`) —
puis rattrape l'écart éventuel entre le curseur et cette fenêtre. Le curseur
n'avance que sur une couverture contiguë de fenêtres traitées en entier
(`nextSyncedThrough`), et ne recule jamais.

**Pourquoi** : le curseur avançait jusqu'à aujourd'hui à 3 h 40, donc une sortie
faite à 18 h n'était jamais redemandée (audit C1). La relecture couvre aussi une
montre qui remonte une sortie chez COROS avec plusieurs jours de retard, et
l'incertitude sur la date utilisée par COROS pour filtrer (locale ou UTC, non
documentée). Les fichiers relus sont reconnus comme doublons ; ils coûtent du
quota (~4 à 8 fichiers par nuit en régime établi), c'est le prix de ne pas
perdre de sortie. La fenêtre récente passe avant le rattrapage parce que c'est
ce que le coach regarde le matin, même pendant un rattrapage d'un an.

**Corollaire (C2)** : une erreur n'est jamais « 0 fichier ». Panne réseau,
réponse illisible, `isError`, texte d'erreur ou de quota en prose sans
`isError`, téléchargement non 2xx, base indisponible : le parcours s'arrête au
bord de la dernière fenêtre complète et `last_error` reçoit un message lisible.
Seuls un contenu qui n'est pas un FIT, un décodage impossible ou un refus de
contrainte en base (22xxx / 23xxx) sont des refus définitifs, nommés, qui
laissent la fenêtre avancer — sinon un fichier corrompu bloquerait l'historique
pour toujours. Dans le doute (`classifyFitListing`), c'est une erreur : le pire
cas devient un curseur qui stagne avec un message, pas une sortie perdue.

**Corollaire (troncature)** : COROS rend au plus 10 URL par appel. Une liste de
10 URL est donc peut-être tronquée : la fenêtre est resserrée jusqu'à recevoir
moins de 10 URL ; à un seul jour, elle est acceptée avec un avertissement.

---

## 2026-11 — Quota COROS suivi en base, par connexion et par jour UTC, réservé avant téléchargement

**Décision** : table `provider_fit_quota (connection_id, day, used)`, service_role
seulement. `provider_fit_quota_reserve` réserve tous les fichiers d'une fenêtre
d'un coup (tout ou rien, UPDATE conditionnel atomique) avant de les télécharger,
et ne rend jamais : un téléchargement raté a peut-être été compté par COROS.
Le cron dispose du reste de la journée (50 − consommé), le bouton manuel de
min(10, reste). Un refus de quota venu de COROS (texte ou 429) marque la journée
épuisée (`provider_fit_quota_exhaust`). Atteindre le quota n'est pas une erreur :
`last_error` reste vide, le compte rendu porte `pending`, et le passage suivant
reprend au même bord.

**Pourquoi** : le quota (50 / 24 h) n'était pas suivi (C3). Un compteur en
mémoire ne voyait pas le bouton manuel de la veille au soir. Jour UTC plutôt que
fenêtre glissante parce que COROS ne précise pas ; si sa fenêtre glisse, un
refus peut arriver avant nos 50, et il est traité comme une erreur — sans trou.

**Limite connue** : le décompte est par connexion. Un athlète qui se déconnecte
puis se reconnecte le même jour repart à 50 chez nous alors que COROS compte
peut-être toujours : il tombera alors sur un refus de quota, géré.

---

## 2026-11 — Verrou de synchronisation par bail en colonne, pas par verrou consultatif

**Décision** : `provider_connections.sync_locked_until` + `sync_lock_token`, pris
par `provider_sync_try_lock(connection_id, ttl)` (UPDATE conditionnel, renvoie un
jeton ou NULL) et rendu par `provider_sync_unlock(connection_id, jeton)`. Toute la
synchronisation d'une connexion — rafraîchissement du jeton compris — se fait
sous ce bail de 10 min (plafonné à 1 h). Une synchro manuelle qui tombe pendant
le cron reçoit « Une synchronisation est déjà en cours ».

**Pourquoi** : le cron et le bouton manuel pouvaient présenter le même refresh
token ; COROS le fait tourner, donc le second se faisait refuser et la connexion
passait en « reconnexion requise » (C5). `pg_try_advisory_xact_lock` ne marche
pas avec supabase-js : chaque RPC est sa propre transaction, le verrou serait
rendu à la fin de l'appel qui le prend ; un verrou de session resterait accroché
à une connexion du pool PostgREST. Le bail en colonne survit entre les appels et
expire seul si la fonction est tuée. Le jeton empêche une exécution dont le bail
a expiré de libérer celui qu'une autre a pris entre-temps.

**Avec (C5)** : seul un refus explicite du point de jetons (`invalid_grant`,
`invalid_client`, `unauthorized_client` — `CorosTokenError.oauthError`) passe la
connexion en `needs_reauth`. Réseau, 5xx, 429, réponse illisible : la connexion
reste active, `last_error` dit « nouvel essai à la prochaine synchronisation ».
Un 401 du serveur MCP avec un jeton qu'on croyait valide déclenche un seul
rafraîchissement forcé.

---

## 2026-11 — Le cron appelle la synchronisation COROS une fois par connexion

**Décision** : `trigger_coros_sync()` émet un `net.http_post` par connexion
COROS active, corps `{ "connection_id": … }`, les moins récemment synchronisées
d'abord. `provider-coros-sync` ne lit `connection_id` que sous la clé
`service_role` ; appelé sans, en `service_role`, il garde l'ancien comportement
(toutes les connexions à la suite) pour la transition. Chaque connexion s'arrête
d'elle-même après `COROS_SYNC_DEADLINE_MS` (110 s) en enregistrant son curseur.

**Pourquoi** : un seul appel pour tous les athlètes dépassait le temps
d'exécution d'une Edge Function dès une quinzaine d'athlètes (C6), et un
athlète lent retardait tous les suivants. pg_net met les appels en file et rend
la main : la transaction du cron reste courte quel que soit le nombre
d'athlètes.

**Ordre de déploiement** : migration `20261107130000_coros_sync_reliability.sql`
d'abord (la nouvelle fonction appelle ses RPC), puis `provider-coros-sync`
aussitôt après. Entre les deux, l'ancienne fonction ignore `connection_id` et
traite toutes les connexions à chaque appel : sans effet tant qu'il y a au plus
une connexion active (zéro au 07/11/2026).

---

## 2026-11 — Doublons inter-sources : une fonction serveur commune, même règle que l'import navigateur

**Décision** : `_shared/activityDedup.ts` exporte `findCrossSourceDuplicate(db,
candidat, toleranceSec = 120)` — même `external_id`, OU départ à ±2 min avec
sports compatibles (inconnu = compatible ; deux sports connus doivent être
égaux, sans casse), toutes sources confondues — et la règle pure
`isSameOuting(a, b, toleranceSec)`. La synchronisation COROS l'appelle avant
chaque insertion ; la synchronisation Garmin l'importera avec la même
signature. Un index `(athlete_id, started_at)` sert la recherche.

**Pourquoi** : COROS ne refusait que l'empreinte identique (octets identiques),
alors que l'import de fichiers rapprochait déjà à ±2 min (C7) : un GPX Strava
puis le FIT de la montre donnaient deux lignes. La fonction **lève** si la base
ne répond pas — « pas pu vérifier » n'est pas « pas de doublon » ; l'appelant
traite l'exception comme un échec passager.

**Reste à faire** : `src/lib/activityImport.ts` garde sa propre copie de la
règle (même tolérance, même condition de sport). Pour qu'elle pointe vers la
version serveur, sortir `isSameOuting` dans un module sans import distant
(`activityDedup.ts` importe le type `SupabaseClient` depuis esm.sh, que `tsc`
côté navigateur ne résout pas), puis l'importer par `@shared`.

---

## 2026-11 — Déconnecter une montre supprime ce que le fournisseur a apporté

**Décision (Hugo, 07/11/2026)** : `provider-disconnect` révoque d'abord chez le
fournisseur (COROS : `/oauth2/revoke` ; Garmin : `DELETE
/wellness-api/rest/user/registration`), puis supprime en une transaction
(`provider_forget`) les activités et données quotidiennes de **cette source**,
ses notifications en attente, la connexion et les jetons (Vault compris). Les
activités `file_import` restent. L'interface demande une confirmation qui le
dit.

**Remplace** le paragraphe « Ce que la déconnexion n'efface pas » de l'entrée
2026-10 sur le consentement montre. **Pourquoi** : le dossier Garmin (§3) et la
politique de confidentialité (« suppression immédiate à la déconnexion »)
promettaient déjà la suppression ; le code faisait l'inverse. Un relecteur
Garmin qui teste la déconnexion doit voir disparaître les données. L'historique
de l'athlète n'est pas perdu sans recours : l'import de fichiers le restitue.

Même effet pour une **désinscription côté Garmin** (webhook `deregistrations`)
et pour un **retrait de l'accord `garmin_sync`** (le cron `garmin-maintenance`
déconnecte la connexion passée en `consent_withdrawn`) : la spec Garmin impose
l'appel à `DELETE /user/registration` dès que l'utilisateur pense retirer son
consentement. COROS garde l'ancien comportement sur ce dernier point (connexion
`consent_withdrawn`, données masquées au coach) — à aligner si on le veut.

---

## 2026-11 — Base OAuth commune et adaptateur par fournisseur ; COROS garde son code

**Décision** : `_shared/oauth.ts` porte ce qui est commun (PKCE S256, `state`
écrit puis consommé en une requête et refusé s'il a été émis pour un autre
fournisseur, échange, rafraîchissement sous bail, écriture Vault, révocation
puis oubli). Chaque fournisseur fournit un adaptateur (`_shared/providers/
garmin.ts` : URLs, `client_secret`, `fetchUserId`, `revoke`). Module pur,
testé par Vitest.

**Pourquoi COROS n'y est pas basculé** : son client est enregistré
dynamiquement par hôte régional et ses métadonnées sont revérifiées à chaque
appel — deux mécanismes que la base n'a pas à connaître —, `coros.ts` est en
cours de modification par le chantier fiabilité COROS, et
`provider-coros-connect` / `-callback` n'ont pas de tests qui prouveraient
qu'une bascule ne change rien. Le gain (quelques dizaines de lignes) ne vaut pas
le risque d'une régression sur la seule intégration qui tourne. À refaire quand
un troisième fournisseur arrivera, avec des tests de ces deux fonctions d'abord.

**Bail de rafraîchissement** (`provider_token_claim_refresh`) : Garmin délivre
un nouveau refresh token à chaque usage et l'ancien meurt. Deux
rafraîchissements simultanés (cron et déconnexion) en brûleraient un et le
second passerait la connexion en `needs_reauth` à tort. Celui qui n'a pas le
bail relit le jeton écrit par l'autre.

---

## 2026-11 — La finalité de consentement est une colonne de `data_source_policies`

**Décision** : `data_source_policies.consent_purpose` (NULL seulement pour
`file_import` et `manual`, imposé par contrainte). `source_consent_granted` et
le trigger de retrait la lisent ; une source sans ligne de politique est
refusée.

**Pourquoi** : la fonction faisait `CASE … WHEN 'garmin' THEN 'garmin_sync'
ELSE 'coros_sync'` — toute nouvelle source (Whoop, Polar…) aurait hérité du
consentement COROS, donc été visible du coach sur un accord donné pour une
autre montre. Même logique que `ai_allowed` : la règle par source vit dans une
table, et l'inconnu est interdit.

---

## 2026-11 — Webhook Garmin : écrire le brut, répondre 200, traiter ensuite

**Décision** : `provider-garmin-webhook` n'écrit que dans
`provider_webhook_inbox` (une ligne par entrée, empreinte SHA-256 unique) puis
répond 200. Le traitement suit dans la même invocation
(`EdgeRuntime.waitUntil`), et le cron `garmin-maintenance` reprend ce qui n'a
pas abouti (bail de 5 min, 5 tentatives, `FOR UPDATE SKIP LOCKED`).

**Pourquoi** : Garmin exige un 200 « en quelques secondes » et rejoue les
échecs ; un traitement synchrone (dédoublonnage, plusieurs écritures) ferait
dépasser le délai sur un gros lot, Garmin rejouerait, et on traiterait deux
fois. Une ligne par entrée plutôt que par requête : une entrée fautive se
rejoue seule sans bloquer les autres, et l'empreinte rend un doublon de Garmin
inoffensif.

**Données d'un inconnu** (userId Garmin lié à aucune connexion), d'une
connexion sans accord ou d'un type non autorisé : la ligne est **supprimée**,
pas gardée « au cas où ». Le reste de l'inbox est purgé 7 jours après
traitement (30 jours s'il reste en échec).

**Origine** : Garmin ne signe pas ses notifications. Le secret
`GARMIN_WEBHOOK_TOKEN` (≥ 32 caractères, comparé en temps constant) est mis
dans l'URL déclarée au portail ; sans lui la fonction répond 503 — l'endpoint
n'est jamais ouvert « en attendant ». L'en-tête `garmin-client-id`, s'il est
présent, doit valoir notre client_id (présence supposée, non documentée
publiquement).

---

## 2026-11 — Cron d'entretien Garmin : jetons rafraîchis tous les ~30 jours, silence tant qu'il n'y a rien

**Décision** : `garmin-maintenance` toutes les 15 minutes appelle
`trigger_garmin_maintenance()`, qui purge l'inbox en SQL et n'émet l'appel HTTP
vers `provider-garmin-maintenance` que s'il y a un message en retard, un refresh
token qui expire dans moins de 60 jours, ou une connexion à fermer après
retrait d'accord.

**Pourquoi** : en push on n'appelle presque jamais Garmin, donc le refresh
token (~90 j) expirerait, et avec lui la possibilité d'appeler `DELETE
/user/registration` — c'est-à-dire de tenir la promesse de déconnexion. Le
renouveler à 60 jours de l'échéance laisse deux mois de reprises si Garmin est
indisponible. Un refus explicite (invalid_grant, 400/401) passe la connexion en
`needs_reauth` ; une panne réseau ou un 5xx, non. Sans connexion Garmin (état
normal jusqu'à l'approbation), le cron ne fait rien et n'écrit rien.

---

## 2026-11 — Permission Garmin retirée = import arrêté et données de ce type supprimées

**Décision** : sur `userPermissionsChange`, `granted_scopes` est remplacé par la
liste reçue. Sans `ACTIVITY_EXPORT`, les activités Garmin de l'athlète sont
supprimées ; sans `HEALTH_EXPORT`, ses données quotidiennes Garmin. Chaque
import revérifie la permission.

**Pourquoi** : c'est une déconnexion partielle, décidée par l'athlète chez
Garmin. Garder ce qui a été obtenu grâce à une permission retirée
contredirait la règle de la déconnexion complète. Liste vide (lecture échouée
au callback) = inconnue, on n'en déduit rien.

---

## 2026-11 — Garmin ouvert par `VITE_GARMIN_ENABLED`, le serveur refuse en 503 sans secrets

**Décision** : la ligne Garmin du panneau « Montres » est « bientôt
disponible » (désactivée) tant que `VITE_GARMIN_ENABLED` ≠ `true`. Côté serveur,
chaque fonction Garmin répond 503 tant que `GARMIN_CLIENT_ID` /
`GARMIN_CLIENT_SECRET` (et `GARMIN_WEBHOOK_TOKEN` pour le webhook) manquent ; le
bouton traduit `garmin_indisponible` en « bientôt disponible ».

**Pourquoi deux niveaux** : le drapeau évite de montrer un bouton qui échoue ;
le 503 protège réellement, quel que soit le drapeau. Un appel à la fonction
pour savoir s'il faut afficher le bouton coûterait une requête à chaque
ouverture de profil, pour une information qui change une fois.

---

## 2026-11 — Attribution « Garmin [modèle] » : colonne `device_name`, à l'écran et dans l'export

**Décision** : `provider_activities.device_name` reçoit le `deviceName` du
résumé Garmin. `providerAttribution(source, device)` (`src/lib/activityDisplay.ts`)
rend « Garmin Forerunner 265 », ou « Garmin » seul si l'appareil est inconnu ;
elle est affichée sur chaque sortie, dans le récapitulatif par sport (ligne
« Sources : … ») et ajoutée (`attribution`) à chaque ligne d'activité et de
journée dans l'export RGPD.

**Pourquoi** : les API Brand Guidelines Garmin exigent cette mention partout où
une donnée Garmin est montrée ou exportée, sous peine de suspension. En
colonne et non dans `raw`, que le client ne lit pas. Tout nouvel écran qui
affiche des données de montre (volume de course…) doit passer par
`providerAttribution`.

---

## 2026-11 — `provider_dailies` en lecture seule pour l'athlète ; fusion par type de résumé

**Décision** : la politique `provider_dailies_own` (FOR ALL) devient
`provider_dailies_own_read` (SELECT). Les écritures passent par
`provider_daily_merge` (service_role), qui range `raw` par type
(`{"dailies": …, "sleeps": …, "hrv": …}`) et ne met à jour que les colonnes que
ce type renseigne.

**Pourquoi** : un athlète pouvait écrire une fausse FC de repos estampillée
« Garmin » — c'est le pendant de S10 pour les activités. Le client n'a jamais
écrit dans cette table (ni sur `main` ni sur `dev`), donc rien ne casse en
production. La fusion par type parce que Garmin envoie la même journée en
plusieurs résumés séparés : un upsert simple aurait effacé le sommeil en
recevant les pas.

---

*Ajouter une entrée ici à chaque décision technique importante : changement d'architecture, choix de librairie, refactorisation majeure, changement de workflow.*

## 2026-11 — Une clé `service_role` se prouve, elle ne se compare pas

**Décision** : les fonctions appelées par un cron (`provider-coros-sync`,
`provider-garmin-maintenance`) reconnaissent l'appel serveur avec
`isServiceRoleBearer` (`_shared/auth.ts`) : égalité avec
`SUPABASE_SERVICE_ROLE_KEY`, sinon jeton qui se dit `service_role` **et** réussit
un appel réservé à l'administration.

**Pourquoi** : le cron lit sa clé dans le Vault. Le projet a plusieurs clés
`service_role` valides qui ne sont pas la même chaîne ; celle du Vault était
refusée par la comparaison stricte. Le cron COROS n'aurait donc jamais rien
synchronisé, sans autre trace qu'un 401 dans `net._http_response`. Constaté au
premier appel réel, le 2026-11-07.

## 2026-11 — L'app mobile sera faite avec Capacitor

**Décision** : l'app App Store / Play Store (janvier-février 2027) empaquette
l'app web existante avec Capacitor. Pas de réécriture React Native / Expo.

**Pourquoi** : Capacitor réutilise tout le code (≈ 13 000 lignes d'UI athlète),
le travail hors ligne de la phase 3 et la future couche `src/api/`. Les plugins
nécessaires (notifications, santé, fichiers) existent. Expo imposait de
réécrire chaque écran, donc deux applications à maintenir à deux développeurs.

## 2026-11 — Une couche `src/api/` typée, pas une API REST

**Décision** : toute lecture et écriture de données passe par
`src/api/<entité>.ts` (fonctions typées au-dessus de supabase-js, clés de cache
et invalidations de l'entité, tests). RPC Postgres seulement pour les
opérations multi-tables. Les hooks React Query appellent `src/api/` et rien
d'autre. Migration entité par entité, en commençant par les sources de
régressions connues (audit §5.1).

**Pourquoi** : c'est le « contrat unique, testé, partagé par toutes les
interfaces » recommandé par Benjamin, sans serveur REST en plus : la RLS reste
la barrière de sécurité (une API en Edge Functions la contournerait avec la clé
service et obligerait à réécrire chaque règle d'accès), pas de latence
supplémentaire, et le même module sert le web, Capacitor et `coach-api`.

## 2026-11 — Saisies athlète sans réseau : file d'attente sur le téléphone

**Décision** : fin de séance muscu, RPE, saisie des séries, séance énergie,
wellness, nutrition et pesée passent par `submitWrite` (`src/lib/offline/writes.ts`).
Sans réseau, la saisie est gardée dans IndexedDB (par utilisateur), affichée
tout de suite, puis rejouée dans l'ordre au retour du réseau. Une saisie de
même cible (même séance, même jour) remplace la précédente. Chaque écriture
est une RPC idempotente, donc la rejouer ne double rien.
- Séance déplacée par le coach : même id, la saisie s'y enregistre (fusion
  serveur qui garde l'adaptation du coach). Séance supprimée (`P0002`) :
  saisie abandonnée, l'athlète est prévenu.
- Déconnexion avec des saisies en attente : confirmation, puis effacement.
- Coach hors ligne : pas de file. Mutations en `networkMode: "always"`, elles
  échouent tout de suite avec leur message ; bandeau « Hors ligne :
  modifications désactivées ».

**Pourquoi** : les athlètes saisissent à la salle, souvent sans réseau ; avant,
la saisie restait en pause dans l'onglet et disparaissait à sa fermeture. Les
écritures coach (programmation, planning) touchent beaucoup de lignes et se
font au bureau : les rejouer plus tard ouvrirait des conflits pour peu de gain.

## 2026-11 — Âge minimum 15 ans vérifié à l'inscription

**Décision** : date de naissance obligatoire à toute création de compte (coach,
coach-athlète, athlète par code ou par lien, staff, activation d'un compte
pré-créé par le coach). Moins de 15 ans : refus, message « Tu dois avoir au
moins 15 ans pour utiliser Agon. ». Les comptes existants ne sont pas touchés.
- Règle pure : `@shared/domain/age` (front via `src/lib/age.ts`, Edge Function
  `claim-athlete`). Né un 29 février : 15 ans le 1er mars.
- Le client vérifie AVANT `auth.signUp` (sinon un refus laisserait un compte
  d'authentification sans profil). La date va dans `profiles.birth_date`.
- Serveur : trigger `enforce_min_age_on_signup` sur `profiles` (INSERT, et
  `is_pending` true → false). « Aujourd'hui » = UTC+14 (personne n'est refusé
  à cause du fuseau). Autres mises à jour non contrôlées.
- **Date absente** : acceptée tant que `main` ne l'envoie pas (phase 1,
  migration 20261109160000, applicable tout de suite). Phase 2
  (20261109170000 + `BIRTH_DATE_REQUIRED = true` dans `claim-athlete`) après
  déploiement du nouveau client sur `main` : date absente refusée, sauf profils
  créés côté serveur (athlète pré-créé, seed démo).

**Pourquoi** : CGU et politique annoncent 15 ans (majorité numérique, art. 8
RGPD / loi Informatique et libertés art. 45) sans aucun contrôle. Le
contrôle serveur seul évite qu'on le contourne en appelant l'API directement ;
la phase 1 évite de casser les inscriptions du client en production.

## 2026-11-08 — Écritures en prod du lot refonte

**Fait** (accord d'Hugo) : `claim-athlete` déployé (date de naissance
facultative), migration âge minimum phase 1 (20261109160000), hygiène base
(20261109180000), tables santé (20261110100000), types régénérés,
`pending-athlete` et `delete-account` déployés. Phase 2 de l'âge (date
obligatoire) : après déploiement de `main`.

**Incident** : le test `supabase/tests/db_hygiene.sql` a été lancé seul alors
qu'il n'avait pas sa propre transaction annulée : ses écritures de test sont
restées en prod (une séance énergie + assignation et une séance « Test hygiène
BDD » à J+400 chez un athlète, un coach-athlète inactif remis sans coach
référent, la date de modification d'un test de la banque). Tout a été
retiré ou remis le jour même, avec l'accord d'Hugo ; aucun co-coach ni lien
coach perdu (vérifié).

**Règle** : chaque fichier de `supabase/tests/` contient son propre
`BEGIN; … ROLLBACK;` (corrigé pour `db_hygiene.sql`, déjà le cas des autres).
Avant de lancer un test, vérifier `grep -n "^ROLLBACK;" <fichier>`.


## 2026-11-09 — Âge minimum, phase 2 appliquée

**Fait** (accord de Titouan) : `main` envoie bien `birthDate` / `birth_date`
(Login, InviteAccept, ClaimAthlete, StaffInviteAccept, useAuth). Test à blanc
phase 1 + 2 : 22 lignes ok. `claim-athlete` déployé avec
`BIRTH_DATE_REQUIRED = true`, migration 20261109170000 appliquée, puis
`supabase/tests/min_age_signup.sql` relancé en phase 2 : tout ok.
Date de naissance désormais obligatoire côté serveur, sauf profils créés côté
serveur (athlète pré-créé, seed démo). Pas de « Nouveautés » : aucun coach ne
remarque le changement.

## 2026-11-10 — Derniers écrivains santé par RPC (P6)

**Fait (code)** : la pesée de la fiche profil (`ProfilPage`) passe par `saveWeighIn`
→ file hors ligne → RPC `weight_set_day`, plus aucune réécriture de `asp:wlog`.
L'objectif de poids a sa RPC `weight_set_goal(p_athlete, p_target_kg)`
(`20261110110100_weight_set_goal.sql`, test `supabase/tests/weight_set_goal.sql`),
exposée par `saveWeightGoal` (`src/api/profile.ts`) ; les setters blob
`setWeightLog` / `setBodyWeight` (sans autre appelant) sont supprimés.
`seed-demo.mjs` écrit wellness, pesées, palier et objectif par les RPC avec la
session de l'athlète démo (mot de passe : `DEMO_PASSWORD` ou aléatoire).

**`archiveAndNewBlock`** : le trigger `app_data → wellness_entries` passe en
`archived = true` les saisies présentes dans `asp:blockHistory[].wellnessHistory`
et SUPPRIME celles qui ne sont plus nulle part. Cas perdant trouvé : un bloc sans
programme saisi mais avec du wellness n'était pas archivé, puis `asp:wh` était
vidé. Corrigé : on archive aussi quand il reste du wellness.

**Appliquée en prod le 2026-11-10 (accord de Titouan)** : test à blanc vert, migration, types
régénérés, test relancé (0 KO). Migration purement additive (le client de `main` ne l'appelle pas).
Pas de « Nouveautés » : invisible pour un coach.

## 2026-11-09 — Garmin : tout ce qui est reçu est stocké brut

- **Choix (Hugo)** : stocker intégralement chaque résumé Garmin, exploité ou non, pour pouvoir tout analyser plus tard. Détail des séances gardé **deux fois** : échantillons seconde par seconde (FC, vitesse/allure, puissance, cadence, altitude, GPS) en `.json.gz`, et fichier `.FIT` d'origine.
- **Où** : table `provider_raw_records` (une ligne par résumé, JSON complet, upsert sur `summary_id`) + bucket privé `provider-raw` (`<athlete>/garmin/<type>/<summaryId>.json.gz|.fit`). Migration `20261110120000_provider_raw_records.sql`, tests `supabase/tests/provider_raw_records.sql`.
- **Garanties** : `ai_allowed=false` imposé ; écriture service_role seulement ; l'athlète lit ses lignes (export RGPD) ; retrait de permission, désinscription, déconnexion et suppression de compte effacent lignes et fichiers.
- **Fichiers .FIT** : URL de rappel valable 24 h, un seul téléchargement (410 ensuite) ; jamais stockée (porte un jeton).
- **Capacité** : plan Supabase gratuit (500 Mo base, 1 Go Storage). Storage saturera en premier (~4 mois à 50 athlètes). Alerte hebdomadaire locale (tâche `alerte-capacite-supabase`) ; passage Pro à décider quand elle sonne.

## 2026-11-12 — Séances de montre et santé rangées en tables (P41)

**Choix validés par Hugo (Q1-Q8, 2026-11-11)** :
- Séries seconde par seconde : **une ligne par activité** avec des tableaux
  (`activity_streams`), pas une ligne par seconde. Tours (`activity_laps`) et
  séries de muscu (`activity_sets`) en lignes.
- Zones FC : table dédiée `hr_zone_models` (modèle `five` lu dans les
  références `FCzone_*`, `three` = SV1 / SV2, `custom`), bornes **datées** : une
  séance utilise les bornes valides à sa date. Temps par zone calculé en TS
  (`domain/hrZones.ts`), résumé stocké (`activity_zone_summaries`) pour le
  planning.
- Toutes les séries de la journée sont gardées (`provider_intraday`).
- Export de compte Garmin (lot H, à venir) : source `garmin_export`, exclue de
  l'IA, gardée à la déconnexion ; le push l'emporte sur l'export.
- Poids Garmin (`bodyComps`) : reste à part, n'alimente pas le suivi de poids.
- HYROX : WOD et Classique ; stations dans la banque `exercises`.

**Calculs** :
- D+ / D− : altitude lissée ±2 s puis hystérésis 1 m. Calibré sur un FIT de
  course d'Hugo (6 tours) : 0,17 m d'écart moyen par tour avec la montre ;
  séance D+ 4 / D− 3 contre 5 / 4. Variante pic à pic écartée (1,25 m).
- Allure max : vitesses plausibles seulement (12,5 m/s à pied, 40 m/s sinon,
  sauts > 4 m/s écartés) ; = la montre sur le fichier de calibration.
- Tour identique à un tour de la montre (±1 s) : valeurs de la montre ;
  sinon calculées par Agon. Station HYROX : pas d'allure.
- Écart de plus de 10 s entre deux points : compté « sans FC », pas dans une
  zone.
- Séries de la journée : décalages en secondes **depuis minuit local** du jour
  (négatifs pour le coucher de la veille). Nuit datée au jour du réveil.
- Affichage : série allégée à ≤ 3 000 points, min / max par seau (pics
  conservés) ; la série complète reste chargée pour recalculer les tours.

**Rapprochement planning** : calculé en base (`auto_link_day`, triggers
protégés qui n'écrivent que dans `activity_plan_links`). Familles : muscu =
`strength` ; HYROX accepte HYROX, course, renfo, rameur ; séance « Autre » ou
sans sport jamais rapprochée automatiquement. Une séance rapprochée n'est
jamais supprimée par une opération de planification.

### Choix pris de nuit, à relire (11 → 12/11)

1. **Test global « Seuils ventilatoires (FC) »** (id `…00f1`, variables
   `sv1_hr` / `sv2_hr`) créé : les préréglages SV1/SV2 évoqués en 2026-04
   n'existaient pas en prod. Il apparaît dans la banque de **tous** les coachs.
2. Série stockée uniquement pour les fichiers isolés (une activité = une
   série) ; activité multisport : première séance seulement.
3. Message FIT `user_profile` ignoré (données personnelles inutiles).
4. Staff : lecture des séances via le droit `seances`.
5. Fin de tour FIT = début + durée quand l'horodatage du tour vaut son début
   (bug de certaines montres) — 9 tours corrigés au rattrapage.
6. Exercices publics ajoutés : SkiErg, Sled Pull, Course (stations HYROX
   manquantes).
7. Brut rangé dans `provider_dailies.raw` allégé (sans les grandes séries,
   déjà dans `provider_raw_records` et `provider_intraday`).
8. `provider_daily_merge` : liste blanche de colonnes (`provider_daily_columns()`),
   clé inconnue ignorée.
9. Démo : `scripts/seed-demo-montre.mjs` (additif) ajoute à Léa Démo une
   course, une séance HYROX, des zones FC et 7 jours de santé fictifs.

**Écritures en prod de la nuit** (toutes additives, test à blanc puis lecture) :
migrations 20261112090000 (détail des activités), 20261112100000 (zones),
20261112110000 (édition des tours), 20261112120000 (rapprochement planning),
20261112130000 (exercices HYROX), 20261112140000 (santé Garmin) ; rattrapage
du détail des activités (8 activités) ; Edge Functions provider-garmin-webhook,
provider-garmin-maintenance, provider-coros-sync redéployées ; démo Léa Démo.

**Rattrapage santé appliqué le 2026-11-12 avec l'accord d'Hugo** :
`node scripts/backfill-garmin-health.mjs --apply` — 1 957 enregistrements
rejoués, 6 283 séries fusionnées, 6 activités Move IQ, 0 erreur. Lecture
après : 205 lignes `provider_intraday` (119 204 points, contre 84 / 37 342
avant), 19 résumés Garmin sur 20 avec les champs étendus, 6 lignes
`provider_moveiq`.

**En attente d'Hugo** : lot H (export Garmin).

## 2026-11-12 — Archive Strava et fusion des sources d'une sortie (P42)

Décisions d'Hugo (brief P42) et choix pris en route. Pas d'API Strava : seule
l'archive RGPD déposée par l'athlète (ou par son coach, `is_coach_of`).

**Fusion, plus d'écartement.** Une sortie = une ligne de `provider_activities`,
quelle que soit la source et l'ordre d'arrivée (Garmin puis Strava = Strava puis
Garmin, testé dans `supabase/tests/activity_merge.sql`). Toute écriture passe
par `merge_provider_activity` (Garmin, COROS, fichiers, archive ; lot de 100
max via `merge_provider_activities`), verrou par athlète. Même sortie : départ
à ±2 min et sports compatibles (`activity_sport_family` ; HYROX ↔ renfo
compatibles) ; deux identifiants différents d'une même API ne fusionnent
jamais. Chaque source complète les champs vides, n'écrase jamais une valeur ;
même source + même identifiant = correction du fournisseur, qui l'emporte.

**Qualité de la courbe** : FIT > TCX / JSON Garmin > GPX > résumé
(`origin_quality`, `stream_quality_rank`). `activity_detail_upsert` refuse une
courbe moins bonne ; à égalité, seule la synchro serveur remplace. Tours
modifiés à la main jamais touchés.

**Source de la ligne** : la meilleure (garmin / coros > fichier) ; les sources
présentes sont listées dans `sources` (`garmin`, `coros`, `file`,
`strava_archive`, `garmin_export`, `manual`). Conséquence assumée : une sortie
Garmin complétée par l'archive suit les règles Garmin — exclue de l'IA, et
**supprimée si l'athlète retire Agon chez Garmin** (`provider_forget` efface
`source = 'garmin'`). Redéposer l'archive la recrée (sans la courbe Garmin).

**RPE** : celui saisi dans Agon gagne toujours ; celui de Strava est rangé
sur la sortie (`provider_activities.rpe`) et ne sert qu'à défaut, **calculé à
la lecture** (`effectiveRpe`, `src/lib/plannedVsDone.ts`). Écart au brief :
pas de recopie dans `workout_logs.rpe_score` (écriture miroir interdite ; un
lien refusé laisserait une valeur orpheline). Aucun écran ne l'affiche encore
côté séance prévue.

**Note privée Strava** jamais lue (colonne ignorée par le décodeur) ; la
description publique est importée.

**IA** (réponse d'Hugo) : une sortie enregistrée par une montre Garmin n'est
jamais envoyée à l'IA, quelle que soit sa source (fabricant FIT = 1, créateur
TCX/GPX, appareil, source Garmin fusionnée). Déclencheur
`provider_activities_ai_zz_garmin_device`, qui ne peut que retirer l'accord.

**Matériel** : km cumulés par paire / vélo (`gear`, `src/lib/gearTotals.ts`).
**Trajets** (`commute`) gardés, marqués « Trajet ». **Planning** : rapprochement
de l'historique en `auto` (« à confirmer ») seulement. **Zones** : une sortie
antérieure à tout modèle de zones est classée avec le modèle actuel.

**À vérifier sur une vraie archive** (celle d'Hugo, pas encore reçue) : en-têtes
CSV français (alias écrits sans exemple réel) ; « Activity Date » supposée en
UTC ; date locale d'une sortie sans fichier = fuseau de l'appareil qui dépose
(le CSV n'a pas de décalage horaire).

**Écritures en prod** (accord d'Hugo à chaque fois, test à blanc avant) :
migrations 20261112150000 (fusion) et 20261112160000 (zones de l'historique,
IA Garmin) ; Edge Functions provider-garmin-webhook / -maintenance et
provider-coros-sync redéployées ; démo : `scripts/demo-strava-archive.mjs
--import` sur Léa Démo (30 sorties fictives, 2ᵉ import 100 % « déjà
complètes », 9 contrôles OK).

---

## 2026-11-12 — Style « peps » et choix de la planche « À valider » (P43, lot 0)

Hugo : « les maquettes sont prêtes ». Les choix de la planche « À valider »
du canvas sont **pris tels que maquettés, 12/11** :

- **Boutons** : aplat or `#FFC933` (texte noir, Geist demi-gras, casse
  normale, un seul par écran), secondaire en contour fin, lien en texte or,
  « Valider » en vert Fait `#66F03C` (séance en cours uniquement), danger en
  contour rouge jamais plein. 52 px au pouce pour l'action principale, 48 px
  pour les autres. **Plus aucun dégradé doré** : l'or poli est réservé au
  logo. Les filets et halos dorés partent aussi. Titres d'écran en Archivo
  gardés. Composant : `src/ui/Button.tsx`.
- **Pictos HYROX** : 8 stations + course + transition (Roxzone) + « autre
  exercice », dessinés sur la planche. Composant
  `src/features/shared/components/HyroxPicto.tsx`.
- **Superset** : la récup s'affiche sur l'exercice 1.
- **Dominantes de tests** : HYROX rose `#F060C0`, Biométrie bleu `#33B5FF`.

**Couleur fixe par type** (note « peps » du canvas) : Musculation `#FFC933`,
Énergie `#33B5FF`, HYROX `#FF9500`, Test `#F060C0`, Compétition `#FF3B1F`,
Fait `#66F03C`. Blocs : Mvt principal `#FFC933`, Hypertrophie `#F060C0`,
Besoin indiv. `#33B5FF`, Muscles assoc. `#2EE6C5`, Core `#FF7A45`. Macros :
G `#33B5FF`, L `#FFC933`, P `#FF5A33`. Un seul endroit : `src/styles/tokens.css`
(`--agon-type-*`, `--agon-bloc-*`, `--agon-macro-*`), lu par `src/lib/peps.ts`.
Ces valeurs priment sur `tokens.json` du design system (bloc-perf terracotta,
bloc-core pierre), plus ancien. Les blocs déjà enregistrés avec l'ancienne
palette (`#F97316`, `#22C55E`…) s'affichent dans leur équivalent peps
(`blocColor`), sans réécrire la base.

## 2026-11-12 — Zones FC fixées par le coach (3 / 5 / 7 zones)

- **Qui** : seul le coach (référent ou co-coach, `is_coach_of`) enregistre un
  modèle (`save_hr_zone_model`) ou accepte une proposition de test
  (`decide_hr_zone_model`). L'athlète lit seulement (`/athlete/zones`).
- **7 zones = `custom` à 6 bornes**, pas de nouveau kind. Bornes proposées
  (`sevenZoneBounds`) : 55 / 65 / 75 / 82 / 89 / 95 % de la FC max, en
  Karvonen si la FC repos est connue ; chaque borne reste modifiable.
  5 zones = références `FCzone_*` (éditeur historique), défaut 60/70/80/90 %.
- **Dater** : un modèle vaut à partir du jour où il est enregistré ; une
  proposition acceptée prend la date du jour (pas celle du test). Les séances
  passées gardent leurs zones.
- **« Appliquer aussi aux séances passées »** (`apply_hr_zone_model_to_past`) :
  le modèle actif devient valable depuis le 2000-01-01, les modèles plus
  anciens passent à `replaced` (gardés dans l'historique). Un modèle 5 zones
  fige alors les références `FCzone_*` du jour (`refs_day`). Usage : corriger
  une erreur de saisie.
- **Couleurs** (`zoneColor`) — 3 zones : vert, orange, rouge (inchangé).
  5 zones : `#33B5FF` `#66F03C` `#FFC933` `#FF9500` `#FF3B1F`.
  7 zones : `#33B5FF` `#2EE6C5` `#66F03C` `#FFC933` `#FF9500` `#FF3B1F` `#F060C0`.
  À valider par Hugo.

## 2026-11-13 — Wellness copié de la planche retenue

- Planche `AthleteWellness` (complète, retenue le 12/11) copiée telle quelle.
- **Corps par zones** (`src/lib/bodyZones.ts`, rectangles de la planche) notées
  1 légère `#FFC933` / 2 marquée `#FF9500` / 3 intense `#FF3B1F`, stockées dans
  `domsLevels` (colonne `wellness_entries.doms_levels`). Les points libres ne
  sont plus saisis ; les anciens restent lus. `domsZones` = les zones notées.
- **Envie de t'entraîner** 1-5 (`envie`) : hors score, le score reste les 5 notes.
- **Douleur** 0-10 (`pain`) et **malade** (`sick`). La note « blessé / malade »
  lue par le coach est déduite (« Malade… · Douleur n/10 (zones) »).
- Retirés (absents de la planche) : « Réveillé·e cette nuit ? » + sa note,
  commentaire libre de blessure, boutons −/+ du poids.
- Migration `20261113090000_wellness_planche.sql` (additive) appliquée le 2026-11-13.

## 2026-11-13 — Séances envoyées sur la montre (Garmin Training API)

- **Garmin d'abord**, COROS ensuite. Tous les types de séance, en un lot.
- **Automatique, coupable par l'athlète** (`provider_connections.push_workouts`,
  vrai par défaut, RPC `set_workout_push`). Couper retire les séances à venir.
- **Tout part d'Agon** : zones FC d'Agon (`hr_zone_bounds_at`) en bpm, %VMA en
  allure, %FCmax en bpm, %FTP en watts, %RM en kg (record, sinon 1RM du coach).
  Donnée absente → consigne en texte, jamais un chiffre inventé.
- **Sport** : champ `energy_sessions.modality` (course par défaut). HYROX et
  spécifique = séance de course, ateliers au bouton Tour avec leur consigne.
- **Exercices** : `exercises.garmin_category` / `garmin_exercise` choisis par le
  coach ; sinon proposition depuis le nom (`_shared/garminTraining/exercises.ts`),
  sinon l'étape part sous le nom Agon. Pas d'écriture en masse dans la banque.
- **Fenêtre** : 7 jours. Cron toutes les 10 min, empreinte par séance : une
  séance inchangée ne coûte aucun appel ; modifiée = supprimée puis recréée.
  Une séance faite ou commencée n'est jamais retirée.
- Détail technique : `docs/integrations/GARMIN_TRAINING.md`.

## 2026-11-12 — Séance libre démarrée sans réseau : id choisi sur le téléphone

**Décision** : l'id de la séance (uuid) est tiré sur le téléphone au démarrage
(`useStartUnplannedSession`) et sert à toutes les saisies en file. La création
(`workout.plan` → `planWorkout` avec id) passe en tête, avant les séries, la
fin et la note de cette séance. Rejouer = ne rien créer de plus :
`INSERT … ON CONFLICT (athlete_id, session_id, scheduled_date) DO NOTHING`
puis relecture par id.
- Réponse perdue, onglet fermé, double appui : même id, une seule séance.
- Séance déjà créée puis déplacée par le coach : le rejeu lève 23505 sur la
  clé primaire, la séance est relue par son id et reçoit les saisies.
- Place déjà prise ce jour-là (séance du coach, prévue ou annulée) : rien n'est
  créé, les saisies vont sur la séance existante (id local → id serveur gardé
  dans `localStorage`, brouillon laissé sous l'id local). Une séance annulée
  par le coach peut donc être validée si l'athlète l'a faite sans réseau :
  on garde la saisie plutôt que de la perdre.
- Création refusée par le serveur : ses saisies sont retirées avec elle (un seul
  message), le brouillon local reste.
- Pas de migration : index unique et RLS `workout_logs_self` déjà en prod,
  vérifiés par `supabase/tests/free_session_offline.sql` (à blanc, 13/13).
- Limite connue : déplacer à aujourd'hui une séance prévue un autre jour reste
  à faire en ligne (elle change la séance du coach).

**Pourquoi** : un id attribué par la base obligeait à attendre le réseau pour
écrire la première série. Un id client rend chaque écriture autonome et
rejouable, sans table de correspondance à tenir (sauf le cas « place prise »).

## 2026-11-12 — Identifiant des apps : `com.agontraining.app`

**Décision** : bundle id iOS et package Android `com.agontraining.app`, nom affiché
« Agon ». Capacitor 8, projets `ios/` et `android/` suivis dans git. Les liens
`https://agon-training.com/...` ouvriront l'app (liens universels / App Links).

**Pourquoi** : l'identifiant ne peut plus changer après publication ; il dérive du
domaine possédé `agon-training.com` (Android refuse le tiret). Mode d'emploi et
reste à faire : `docs/MOBILE_CAPACITOR.md`.

## 2026-11-12 — Tests SQL en CI sur le schéma de la prod, pas sur les migrations

- Les scripts `supabase/tests/*.sql` tournent maintenant à chaque push sur `dev` / `main`
  et chaque PR (job « Tests SQL », `.github/workflows/sql-tests.yml`), contre un Supabase
  **local** démarré dans le runner. Jamais la prod.
- La base de test part d'un **dump de schéma** de la prod (`supabase/tests/ci/schema.sql`),
  pas de `supabase/migrations/` : l'historique ne se rejoue pas (doublons de versions,
  `exercises` créée à la main, `20260404_nutrition` enregistrée mais jamais appliquée).
  Le jour où `migration repair` est fait et le diff migrations ↔ prod vide
  (`docs/PLAN_LEGACY.md` §3), la CI pourra repartir des migrations.
- Données : bibliothèques exportées de la prod (aucune donnée d'athlète ni de coach) +
  utilisateurs **fictifs** (`seed.sql`, `@example.invalid`).
- Contrepartie : `schema.sql` est à rafraîchir après chaque migration appliquée
  (`supabase/tests/ci/README.md`).

## 2026-11-13 — Vitesse critique : un calcul, trois sources, la plus récente

- **Formule** (Monod-Scherrer / Jones, méthode Rivet) : distance (m) = VC (m/s) × durée (s) + D′ (m).
  VC = pente de la régression linéaire distance / durée d'au moins deux efforts maximaux de durées
  différentes ; D′ = ordonnée à l'origine. Un seul code : `_shared/domain/criticalSpeed.ts`
  (`fitCriticalSpeed`), utilisé aussi par l'analyse des tests HYROX (`src/lib/hyrox/tests/running.ts`,
  dont le `linreg` vient désormais du même fichier).
- **Sources** : analyse de tests HYROX (1200 m / 6 min / 12 min, VC + seuil 1 du moteur), VC active du
  profil sportif (`performance_logs` « VC »), courses des 90 derniers jours (meilleurs efforts de 3, 6 et
  12 min d'affilée dans les séries seconde par seconde, fenêtre cassée par un trou > 10 s ou une vitesse
  > 10 m/s ; ajustement retenu si R² ≥ 0,95).
- **Choix (Hugo, 13/11)** : VC retenue = la plus récente entre test et saisie (même jour : la saisie).
  La VC des courses est seulement **proposée** au coach (écart ≥ 0,3 km/h), jamais appliquée seule.
- **Seuil 1** : celui du test ; pour une VC saisie, VC × 0,84 (facteur médian de la méthode Rivet,
  `GridSet.running.s1_factor`).
- Lecture seule, aucune migration. Sert à la charge YOXX : Zone 2 jusqu'à la VC, Zone 3 au-delà.

## 2026-11-13 — Charge d'entraînement YOXX (P28) et D13

- **D13 tranchée (Hugo, 13/11)** : ratio aigu / chronique **affiché** sous la semaine (zone 0,8–1,3, comme la
  maquette), **jamais** dans un feu ni une alerte. Aigu = charge de la semaine ; chronique = moyenne des 4 semaines
  précédentes, semaine en cours exclue (ratio découplé, même chiffre que la « charge chronique » du modèle YOXX).
- **Calcul** : `_shared/domain/trainingLoad.ts` (points, SDP, prévu, tableau de semaine) et
  `src/lib/trainingLoadWeek.ts` (assemblage des lectures). Calculé à la volée (`src/api/load.ts`), **aucune table** :
  pas de cache tant que c'est rapide. Formules de `regles.md` (coach-chef, 7/11) sans changement.
- **Zones** (Hugo, 13/11) : minutes classées avec le modèle de zones FC de la date de la séance ; 3 zones telles
  quelles ; 5 zones Z1-Z2 → 1, Z3-Z4 → 2, Z5 → 3 ; 7 zones Z1-Z3 → 1, Z4-Z5 → 2, Z6-Z7 → 3. Course avec série :
  tour plus rapide que le seuil 1 → Z2 jusqu'à la VC, Z3 au-delà ; sinon chaque seconde à la FC. Tours = ceux
  d'Agon (`activity_laps`), sinon ceux de la montre ; sans tours, toute la sortie est un tour.
- **Musculation** (Hugo, 13/11) : pas de migration ; f(exercice) déduit de la fiche (`is_compound`, cible, nom) :
  bas du corps polyarticulaire → 1,5 ; autre polyarticulaire → 1 ; isolation, mollets, gainage → 0,5. k = 6 pour
  tous. Bloc « Échauffement » et exercices en mode libre exclus. RIR saisi, sinon prévu, sinon 0,75 (signalé).
- **Prévu** (étapes de la séance énergie) : échauffement, récup, repos, retour au calme → Z1 ; effort classé par sa
  cible (zone FC 1-5 de l'éditeur ramenée à 3, bpm et % FC max avec le modèle de la date, allure et % VMA / VC
  avec seuil 1 et VC) ; sans cible : Z2. Séance spécifique (= mixte) : station → Z3, **60 s par station sans
  durée** (hypothèse à revoir). Distance convertie en temps à la vitesse visée, sinon à celle de la zone.
- **Réalisé sans montre** : séance énergie validée = prévu × durée réelle ÷ durée prévue (« fait comme prévu »).
  Activité libre de muscu ignorée (la séance saisie compte déjà). Limites : la VC et les bornes « 5 zones » sont
  celles d'aujourd'hui pour toute la plage (les modèles 3 / 7 zones sont bien datés) ; km d'une séance mixte =
  tous en compromised.
- **Affichage** : `WeekLoadPanel` sous le calendrier du planning (vue Mois, semaine en cours) en attendant la
  vue semaine large (P24, P9) ; `useMesoLoad` (résumé des mésocycles) passe aux points prévus / réalisés.

## 2026-11-13 — Liens d'invitation coach et ancien fil « retours » supprimés (décision 6)

- Les liens `/invite/…` ne s'utilisaient plus et n'expiraient jamais : désactivés puis supprimés avec les
  tables `invitations`, `retours`, `retours_votes` et les fonctions `invitation_is_valid`,
  `redeem_invitation`, `invitation_coach_name`. Rejoindre un coach = son code (ou un lien staff).
- Archive CSV faite avant (sans les jetons), hors repo. Un vieux lien `/invite/…` mène à la connexion.
- Choix d'Hugo : supprimer sans attendre la mise en prod de dev ; l'export RGPD de `main` signale ces
  3 tables en échec jusque-là.
- Décision 7 en cours : R0-R2 faits (`docs/PLAN_LEGACY.md` §3), `migration repair` seulement si le
  rejeu des migrations donne le même schéma que la prod.

## 2026-11-13 — Feu du matin calculé (T-feux-wellness)

- **Règles** : `regles.md` coach-chef (arbitrage Hugo du 07/11), appliquées telles quelles dans
  `_shared/domain/wellnessLight.ts` (pur, paramètres versionnés `feux-2026-11-13`). Lecture : `src/api/wellnessLight.ts`,
  calcul à la volée, aucune table, aucune migration. Les mesures de montre (Garmin compris) n'entrent dans aucun appel IA.
- **VFC** : ln RMSSD de nuit (`provider_dailies.hrv_ms`), moyenne 7 j si ≥ 5 nuits ; zone = moyenne ± 0,5 écart-type (n − 1)
  des 28 jours avant la fenêtre, depuis J1 (fenêtre comprise) tant qu'il y a moins de 5 nuits avant elle ; alerte active à J14.
  « Depuis N jours » = jours de suite où la moyenne 7 j est sous la zone.
- **FC de repos** : moyenne 7 j (≥ 5 jours) contre les 28 jours d'avant (≥ 5 jours, jamais la fenêtre), plancher d'écart-type 1 bpm.
- **Une marque** : celle de la mesure la plus récente ; un export Garmin = Garmin. Changement de montre → habitude depuis J1 de la nouvelle.
- **Charge** : les 7 jours glissants finissant aujourd'hui (`getLoadWeeks(today − 6, 2)`) contre les 7 d'avant. « Monte » =
  réalisé > 7 jours d'avant ou > prévu. Le prévu inclut les séances du jour pas encore faites (prudent : sous-estime l'écart).
- **Wellness** : saisie d'aujourd'hui ou d'hier, comparée par `assessWellness` (items z < −1,5 ; score z < −1).
- **Hypothèses à valider par Hugo** : « douleur hors règle des 3 douleurs » = douleur du matin > 3/10 ; « sommeil en baisse » =
  item sommeil z < −1,5 ou durée de sommeil montre 7 j à z < −1 (plancher 15 min) ; « séance repère ratée » et « douleur qui
  modifie la foulée » : aucune donnée dans Agon, donc jamais comptées. Le résumé roadmap « rouge à 3 sur 5 » diffère de
  regles.md : c'est regles.md qui est appliqué (charge en hausse **et** VFC sous la zone **et** ≥ 2 signes sur 5).
- **Affichage** : Retours (coach, détail des signaux) et carte wellness d'Aujourd'hui (athlète). Accueil coach et vue
  globale wellness (P26) : pas branchés (P26 bloqué), un feu par athlète y coûterait une lecture par athlète.

## 2026-11-13 — Documents légaux, version 2026-11-13 (re-consentement)

- `LEGAL_VERSION` et `CORE_CONSENT_SINCE` passent au 2026-11-13. L'accord socle couvre de nouvelles catégories de données
  de santé : photos du corps, composition corporelle, douleur et maladie du matin, bilan hebdomadaire, feu du matin,
  copie intégrale Garmin. Tous les utilisateurs sont donc re-sollicités par `ConsentGate`. L'accord IA (`AI_CONSENT_SINCE`)
  ne bouge pas : rien de nouveau n'est envoyé à une IA.
- Politique : ajouts de `docs/stores/DONNEES_COLLECTEES.md` §5 (points 2 à 6, 8 et 9) et de P39 (weekly review).
  Liste explicite de ce qui ne part jamais vers une IA.
- Faits corrigés :
  - région Supabase : Irlande (`supabase backups list`), et non eu-central-1 ;
  - la preuve du consentement n'est pas gardée 5 ans après la suppression du compte : le journal part avec le compte,
    seule `account_deletions` reste, anonyme ;
  - renvoi « section 4.2 » corrigé en 4.3.
- Constaté en lisant la base : le bucket `test-media` est **public** (migration du 2026-08-25, audit S6). Il contient des
  photos du corps. La politique ne dit donc plus « espace privé ». Correctif et qualification juridique :
  `docs/QUESTIONS_JURISTE_HDS.md` §4.
- Pas de CGV : aucun paiement aujourd'hui. Questions ouvertes : `docs/QUESTIONS_JURISTE_HDS.md`.

## 2026-11-13 — Bucket `test-media` privé (faille S6)

- **Faille** : le bucket est public depuis 2026-08-25 (`20260825000000_coach_upload_test_media.sql`). Toute personne qui
  connaît l'adresse d'un fichier peut le lire sans compte. En prod, il contient 12 photos du corps
  (`<athlete>/mensurations/…`) et 6 illustrations de séances énergie (`<coach>/sessions/…`). Seules ces 6 illustrations
  utilisent l'URL publique, et 4 liens sont enregistrés dans `energy_sessions.images`.
- **Choix** :
  - Les illustrations de séances, contenu du coach et non donnée personnelle, passent dans le bucket public
    `energy-exercise-photos` (`ENERGY_IMAGE_BUCKET`, `src/api/energy.ts`).
  - Les photos du corps restent dans `test-media`, qui devient privé ; elles sont lues par URL signée de 10 min
    (`PHOTO_URL_TTL_S`, `src/api/profile.ts`).
  - Lecture et écriture : le propriétaire du dossier ou son coach (`is_coach_of_folder` : référent ou co-coach).
    Pas de staff, car la table des mensurations n'a pas de règle staff.
- **Liens déjà enregistrés** : réécrits par migration vers `energy-exercise-photos`, seulement si la copie du fichier
  existe. Un lien sans copie reste tel quel.
- **Ordre en prod** (accord d'Hugo requis) :
  1. Copier les 6 fichiers `test-media/<coach>/sessions/*` vers `energy-exercise-photos` avec l'API Storage
     (`supabase storage cp … --experimental`), hors SQL.
  2. Appliquer `20261113190000_test_media_private_part1.sql` : règles d'accès et réécriture des liens. Compatible
     avec le client de `main`.
  3. Appliquer `20261113190100_test_media_private_part2.sql` : `public = false`. Le client de `main` lit déjà les
     photos par URL signée. Seule une **nouvelle** illustration de séance envoyée depuis `main` aurait un lien cassé
     jusqu'au déploiement de `dev`. Si cela arrive, refaire 1 puis rejouer la réécriture de la partie 1.
- Test à blanc : `supabase/tests/test_media_storage.sql`, passé le 2026-11-13 dans une transaction annulée.
- **Appliqué en prod le 2026-11-13** avec l'accord d'Hugo : 6 fichiers copiés, parties 1 et 2 appliquées. Contrôles : bucket
  privé, 0 lien `public/test-media` restant, 4 liens réécrits, photo du corps en accès anonyme → 400, image de séance → 200,
  `test_media_storage.sql` vert. `platform.sql` rafraîchi, test retiré de `known_failures.txt`.
  - Anonyme : refusé.
  - Autre coach : refusé en lecture et en dépôt.
  - Athlète et son coach : lecture, dépôt et remplacement acceptés.
  - 4 liens sur 4 réécrits.
  - La suppression SQL directe dans `storage.objects` est interdite par Supabase, donc non testable ici.
- Reste : les illustrations d'un coach dans `energy-exercise-photos` ne sont pas dans `USER_BUCKETS`
  (`_shared/userStorage.ts`). Elles ne partent pas à la suppression de son compte. À ajouter avec un redéploiement
  de `delete-account`.

## 2026-11-13 — Apps natives : tests dans la CI, pas sur un poste

- Hugo n'installe pas Xcode. Les apps iOS et Android sont construites, installées et lancées dans
  `.github/workflows/mobile.yml` : simulateur iOS sur `macos-latest`, émulateur Android sur `ubuntu-latest`. Le
  workflow capture l'écran de connexion et publie les captures et l'APK en artefacts. Il se lance à la main ou à
  chaque changement de `ios/`, `android/` ou `capacitor.config.ts`. Il n'utilise aucun secret de prod.
- La signature iOS (et l'envoi aux stores) se fera plus tard dans la CI, par Fastlane, avec les secrets du compte
  Apple dans GitHub.
- Liens de l'app native : `publicWebOrigin()` (mot de passe oublié, réclamation, staff). Autorisation des montres
  dans une fenêtre in-app (`@capacitor/browser`).
- `public/.well-known` (AASA, assetlinks) est publié avec des valeurs à remplacer (Team ID Apple, empreinte Play).
- Icônes et écran de lancement tirés de `public/brand`.

## 2026-11-13 — Retirer d'Agon une activité de montre (P38)

- **Pourquoi** : Garmin et COROS ne préviennent pas quand une activité est
  supprimée dans leur application. Sans action, elle reste dans Agon, le
  volume et le planning.
- **Qui** : l'athlète, ou son coach (référent ou co-coach, `is_coach_of`) pour
  une activité qu'il voit (même règle que `provider_activities_coach_read`).
  Un autre coach reçoit « introuvable », comme pour une ligne absente.
- **Comment** : RPC `remove_provider_activity` (migration `20261113180000`).
  Elle supprime la ligne ; courbe, tours, séries, résumés de zones et liens au
  planning partent en cascade. La séance Agon rapprochée garde son statut, ses
  séries et ses notes : seul le lien part. Refusée si la ligne porte la source
  `manual` (séance saisie dans Agon).
- **Gardé** : le brut (`provider_raw_records`, fichiers `provider-raw`), stocké
  par choix d'Hugo (09/11), part à la déconnexion, au retrait de permission ou
  à la suppression du compte. À relire si Hugo préfère l'effacer aussi (il
  faudrait passer par une Edge Function : l'athlète n'écrit pas dans ce bucket).
- **Limite connue** : une correction envoyée plus tard par Garmin
  (`manuallyUpdatedActivities`) ou un nouvel import du même fichier recrée
  l'activité.
- **Écran** : bouton « Retirer d'Agon » au dépli d'une sortie
  (`RemoveActivityButton`, partagé athlète / coach), confirmation en deux temps.

## 2026-11-13 — Export RGPD : fichiers bruts de montre par liens signés (P37)

- L'export JSON liste les fichiers du bucket `provider-raw` cités par
  `provider_raw_records` (`samples_path` .json.gz, `file_path` .FIT) dans
  `provider_raw_files`, avec un **lien signé valable 7 jours** et l'attribution
  « Garmin ».
- **Pourquoi des liens et pas un zip** : plusieurs centaines de fichiers par
  athlète, construits dans le navigateur d'un téléphone ; un zip tiendrait
  tout en mémoire. Les liens se signent avec les droits de l'utilisateur
  (policy existante `provider_raw_own_read`, dossier = son id) : pas de clé
  service_role, même principe que le reste de l'export.
- Lien expiré : refaire un export. Fichier absent ou signature en panne :
  listé sans lien et signalé dans `tables_unreadable`.

## 2026-11-13 — Séances Agon vers la montre COROS : bloqué, l'API ne sait pas retirer

Lu le 13/11/2026 : guide des outils `coroslab/COROS-MCP` (`docs/en/tools.md`)
et son README.

- **Ce que COROS permet** : `createScheduledWorkout` (une séance à une date,
  ≤ 90 jours), `createSingleWorkout` + `scheduleWorkout`, `updateScheduledWorkout`
  (contenu d'une date), `queryTrainingSchedule`. Sports : **course, vélo, trail
  seulement** (pas de muscu, pas de natation à la création).
- **Ce qu'il ne permet pas** : *« No tool in this set deletes content »* —
  aucune suppression, aucun déplacement, aucune sortie de plan ; il faut le
  faire dans l'app COROS. Le format de `course` (étapes, cibles, répétitions)
  n'est pas documenté (« complete workout content »).
- **Pourquoi c'est bloquant** : la réconciliation de `_shared/garminTraining`
  (`plan.ts`) repose sur « modifiée = supprimée puis recréée » et « annulée ou
  déplacée = retirée ». Avec COROS, une séance déplacée ou annulée par le coach
  resterait sur la montre à l'ancienne date : l'athlète s'entraînerait sur une
  version périmée, ce que la règle Garmin (DECISIONS 2026-11-13) interdit.
  La muscu et le HYROX (la moitié des séances Agon) ne passeraient pas.
- **Droits** : le README présente le MCP pour l'usage d'un assistant IA choisi
  par l'athlète ; il ne restreint pas les intégrations tierces, renvoie aux CGU
  COROS. Notre connexion actuelle est en lecture (synchro) ; l'écriture au
  calendrier serait une nouvelle finalité à annoncer à l'athlète.
- **Pistes, à décider par Hugo** : (a) attendre un outil de suppression
  (demande à COROS) ; (b) envoi partiel : course / vélo / trail, contenu mis à
  jour sur la même date, et une séance déplacée ou annulée remplacée par un
  contenu « Annulée — voir Agon » (rien d'inventé, mais l'entrée reste au
  calendrier) ; (c) abandonner COROS pour l'envoi. Avant (b), lire le schéma
  réel de `course` par `tools/list` avec le compte COROS d'Hugo.
