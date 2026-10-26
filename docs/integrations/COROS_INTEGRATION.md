# COROS — intégration

**Aucun dossier à déposer.** COROS expose ses données via un serveur MCP
officiel en OAuth 2.0, en libre-service. On implémente, les athlètes
autorisent, c'est tout.

Faits ci-dessous **vérifiés en direct contre les serveurs COROS le 26 octobre
2026**, pas lus dans un billet de blog. Chaque affirmation vient d'une requête
dont la réponse est reproduite.

---

## Ce qui a été vérifié

### Métadonnées OAuth

`GET https://mcpeu.coros.com/.well-known/oauth-authorization-server` →

```json
{
  "issuer": "https://mcpeu.coros.com",
  "authorization_endpoint": "https://mcpeu.coros.com/oauth2/authorize",
  "token_endpoint": "https://mcpeu.coros.com/oauth2/token",
  "revocation_endpoint": "https://mcpeu.coros.com/oauth2/revoke",
  "registration_endpoint": "https://mcpeu.coros.com/connect/register",
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": ["openid", "mcp.tools", "offline_access"],
  "grant_types_supported": ["authorization_code", "client_credentials", "refresh_token", "..."]
}
```

Trois conséquences directes :

- **PKCE S256 obligatoire.** `S256` est la seule méthode annoncée, et `plain`
  est absent. Pas d'option.
- **`offline_access` indispensable.** Sans ce scope, pas de `refresh_token`, et
  la synchronisation s'arrête à l'expiration du premier jeton. À demander dès
  la première autorisation : on ne peut pas l'ajouter après coup sans
  redemander son accord à l'athlète.
- **Le point de révocation existe** (`/oauth2/revoke`). La fonction
  `provider-disconnect` pourra donc réellement révoquer côté COROS, et pas
  seulement effacer le jeton chez nous. C'est la différence entre couper
  l'accès et faire semblant.

### Enregistrement dynamique du client — testé, fonctionne

`POST https://mcpeu.coros.com/connect/register` → **201 Created**

```json
{
  "client_id": "…",
  "client_name": "Agon",
  "redirect_uris": ["https://…/oauth/coros/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "scope": "openid offline_access mcp.tools",
  "token_endpoint_auth_method": "none"
}
```

Notre URI de redirection a été acceptée sans liste blanche préalable. Aucune
approbation humaine dans la boucle.

> **`token_endpoint_auth_method: "none"` — client public, pas de secret.**
> COROS ne délivre pas de `client_secret`. Donc :
>
> - `COROS_CLIENT_SECRET` a été **retiré de `.env.example`** : le laisser ferait
>   croire qu'il manque un secret à configurer, et chercher pendant une heure
>   quelque chose qui n'existe pas.
> - La sécurité de l'échange repose **entièrement** sur PKCE et sur la
>   vérification stricte du `redirect_uri`. Le `code_verifier` ne doit jamais
>   transiter par le navigateur ni être stocké côté client : il est généré et
>   conservé côté Edge Function pour la durée de l'échange.

### Le endpoint MCP est bien protégé

`POST https://mcpeu.coros.com/mcp` sans jeton → **401** avec

```
www-authenticate: Bearer resource_metadata="https://mcpeu.coros.com/.well-known/oauth-protected-resource/mcp"
```

Conforme à la découverte OAuth des ressources protégées.

---

## Le piège de la région

`https://mcp.coros.com/mcp` est un routeur. Interrogé depuis l'Europe, il
renvoie des métadonnées dont l'`issuer` est `https://mcpeu.coros.com` — un
hôte différent de celui qu'on a appelé. Plusieurs clients MCP rejettent la
connexion pour « origin mismatch » à cause de ça.

**Appeler directement l'hôte régional**, jamais le routeur :

| Région du compte COROS | Hôte |
|---|---|
| Europe | `https://mcpeu.coros.com` |
| États-Unis | `https://mcpus.coros.com` |
| Chine continentale | `https://mcpcn.coros.com` |

La région est celle **du compte de l'athlète**, pas celle de notre serveur. Un
athlète ayant créé son compte COROS aux États-Unis n'est pas sur `mcpeu`. Il
faut donc stocker l'hôte retenu avec la connexion, dans
`provider_connections`, et le réutiliser à chaque appel — le deviner à chaque
fois produirait des 401 incompréhensibles pour les comptes hors zone.

---

## Données accessibles

D'après le guide officiel des outils (`coroslab/COROS-MCP`, `docs/en/tools.md`) :

| Domaine | Contenu |
|---|---|
| Activités | liste, détail, tours et segments personnalisés, **fichiers FIT** |
| Santé et récupération | sommeil, VFC, fréquence cardiaque, stress, données quotidiennes, état de récupération, cycles menstruels |
| Forme et charge | évaluations de forme, prédictions de course, charge d'entraînement |
| Plans et séances | lecture, création et modification de plans et de séances, programmation au calendrier |
| Profil et appareils | profil de base, appareils liés |

Deux points de conception :

- **Pull, pas push.** Contrairement à Garmin Starter, on interroge quand on
  veut. Un cron quotidien suffit : interroger plus souvent n'apporte rien à un
  coach qui regarde son tableau de bord le matin, et consomme du quota.
- **L'historique est accessible** (`querySportRecords` accepte une plage de
  dates, défaut 7 jours). Contrairement à Garmin, on peut remonter le passé
  d'un athlète dès sa connexion.

Les cycles menstruels sont accessibles. **Ne pas les récupérer** : aucune
fonctionnalité d'Agon ne s'en sert, et collecter une donnée de santé dont on
n'a pas l'usage est exactement ce que la minimisation interdit. Si la donnée
n'est pas demandée, elle n'a pas à être protégée.

---

## Ce que les outils renvoient réellement — et pourquoi ça change le plan

Lecture de `docs/en/tools.md` du dépôt `coroslab/COROS-MCP`. Le nom des outils
a d'abord été noté de travers ici : l'outil de liste s'appelle
**`querySportRecords`**, pas `getActivityList`. Corrigé.

Mais la vraie découverte est ailleurs : **les outils MCP répondent en prose,
pas en JSON.** `querySportRecords` renvoie des lignes de la forme

```
1. Sport(9807) — 2026-10-03
   Duration: 2:12:38 | Distance: 12.03 km
```

et `getActivityDetail` renvoie ses métriques en texte, **sans identifiant ni
date**. Ce sont des réponses conçues pour être lues par un modèle de langage
dans une conversation, pas parsées par un programme.

Trois conséquences, dont une qui réordonne les chantiers :

1. **Les chiffres doivent venir des fichiers FIT, pas du texte.** Parser
   « 12.03 km » marche aujourd'hui et casse silencieusement le jour où COROS
   change un séparateur, une unité ou une traduction. Un FIT est un format
   binaire versionné : il casse franchement ou pas du tout.
   `queryActivityFitFileDownloadUrls` accepte une plage de dates sans exiger
   d'identifiant d'activité, donc l'ingestion peut être pilotée par les URL de
   FIT — des jetons non ambigus — au lieu d'extraire des identifiants d'une
   phrase.
2. **Le parseur FIT (chantier J) devient une dépendance de la synchronisation
   COROS**, et non un chantier parallèle. L'ordre change : J avant la moitié
   « sync » de H. La moitié « OAuth » (connect, callback, disconnect) ne dépend
   de rien et passe d'abord.
3. **Quota : 50 fichiers par utilisateur et par 24 h**, 10 par appel. Un an
   d'historique représente donc plusieurs jours de rattrapage par lots, pas une
   rafale au moment de la connexion. Le rattrapage doit être une tâche de fond
   reprenable, qui retient où elle s'est arrêtée (`synced_through`), et l'athlète
   doit voir que son historique se remplit progressivement plutôt que de
   conclure que l'intégration ne marche pas.

Les données quotidiennes (sommeil, VFC, FC de repos, stress) **n'ont pas
d'équivalent FIT** : elles ne sont disponibles qu'en prose. On les stockera
telles quelles dans `provider_dailies.raw`, et c'est une raison de plus de
laisser `data_source_policies.ai_allowed = false` pour `coros` : on ne veut pas
qu'un chiffre extrait d'une phrase par heuristique serve de base à un conseil.

> Réserve honnête : ces formats viennent de la documentation, pas d'une réponse
> observée. `/mcp` exige un jeton, et aucun athlète n'est encore connecté. À
> confronter au réel dès la première connexion — et si la prose s'avère être du
> JSON, tant mieux, mais le plan ne doit pas en dépendre.

---

## Ce qui est implémenté

| Pièce | Rôle |
|---|---|
| `_shared/coros.ts` | protocole COROS : hôtes régionaux, métadonnées vérifiées, PKCE, DCR, jetons, révocation, noms d'outils, quotas, fenêtres de dates |
| `_shared/mcp.ts` | transport MCP « streamable HTTP » : JSON-RPC, session par en-tête, corps JSON **ou** SSE |
| `_shared/activityFiles/` | décodeur FIT sans dépendance, partagé avec le navigateur via l'alias `@shared` |
| `provider-coros-connect` | construit l'URL d'autorisation ; refuse sans `APP_URL` |
| `provider-coros-callback` | reçoit le code, échange, écrit les jetons ; `verify_jwt = false` |
| `provider-coros-sync` | rafraîchit le jeton, liste les FIT, télécharge, décode, insère ; stocke la santé en prose |
| `provider-disconnect` | révoque chez COROS puis supprime la connexion |
| `trigger_coros_sync()` + cron `coros-sync` | déclenche la synchronisation à 3 h 40 |

### Le transport MCP, et ses deux pièges

`/mcp` parle JSON-RPC 2.0, pas REST. Deux choses qu'un client naïf rate :

1. **La réponse peut être du JSON ou du SSE** — le serveur choisit. Un client
   qui se contente de `res.json()` marche en test et casse le jour où le serveur
   décide de streamer. Il faut aussi annoncer les deux dans `Accept`, sous peine
   de 406 sur certaines implémentations.
2. **La session est portée par l'en-tête `Mcp-Session-Id`**, émis par
   `initialize` et à renvoyer sur chaque appel suivant. Sans lui, 404 sur une
   session que le serveur ne reconnaît plus. Et `notifications/initialized` doit
   être envoyée après `initialize`, sans `id` — lui en donner un ferait attendre
   une réponse qui ne vient jamais.

### Le rattrapage d'historique

Le quota (50 fichiers / athlète / 24 h, 10 par appel) impose d'avancer par
fenêtres datées : 30 jours, resserrées par moitié jusqu'à tenir dans le budget
restant, et `synced_through` n'avance que si la fenêtre a été traitée en entier.
Lister est gratuit, télécharger est compté — d'où le choix de relister plus
étroit plutôt que de tronquer une liste d'URL dont on ne connaît pas les dates.
Détail du raisonnement dans `docs/DECISIONS.md`.

### Réserve toujours ouverte

Les noms d'outils et le format de leurs réponses viennent encore de la
documentation, pas d'une réponse observée : `/mcp` exige un jeton et aucun
athlète n'est connecté. D'où la résolution des noms contre `tools/list` à chaque
exécution, et la journalisation de la liste obtenue. **À la première connexion
réelle, relire ces journaux et remplacer cette section par ce qui a été vu.**
La documentation s'est déjà révélée fausse une fois (`getActivityList` au lieu
de `querySportRecords`) avant même la première requête.

Restent non vérifiés en particulier : le nom de l'outil de données quotidiennes
(`queryDailyActivity` est une hypothèse, rattrapée par le motif `/daily|sleep/`),
les noms des paramètres de plage de dates (`startDate` / `endDate`), et la forme
exacte des URL de téléchargement.

---

## Conditions d'utilisation

À lire avant de livrer : <https://coros.com/terms> et
<https://coros.com/privacy>.

La documentation COROS est explicite sur le principe — « athletes should own
their data and be free to choose how they use it » — et le modèle est celui
d'un athlète qui autorise une plateforme tierce à accéder à ses propres
données. C'est précisément notre cas.

**Ce qui reste à vérifier noir sur blanc** : rien dans la documentation
publique n'interdit de montrer les données d'un athlète à son coach, mais
l'absence d'interdiction dans un fichier README n'est pas une autorisation
dans des conditions contractuelles. C'est la clause qui a tué Strava (§2.3 de
son API Agreement, qui n'apparaît nulle part dans sa documentation
développeur). Relire les Terms sur ce point précis avant d'ouvrir la
fonctionnalité au coach, et noter la conclusion dans `docs/DECISIONS.md`.
