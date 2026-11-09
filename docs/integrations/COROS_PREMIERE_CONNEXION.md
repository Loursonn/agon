# COROS — première connexion réelle (P7)

Guide pour la première connexion d'un vrai compte COROS depuis l'app, et journal
de ce qu'on observe. Contexte du code : `COROS_INTEGRATION.md`.

Règle : on ne lit ni n'affiche jamais les données d'un athlète. Seulement des
compteurs, des statuts et des codes d'erreur.

---

## 1. État vérifié avant la connexion (2026-11-09)

Contrôles faits en lecture seule sur la base liée (production). Aucune valeur de
secret lue : le CLI n'affiche que des empreintes, et seuls les noms comptent.

| Point | Résultat |
|---|---|
| Secrets Edge Functions | `APP_URL` présent (posé le 2026-11-07). Aucun secret `COROS_*` n'est requis : client public (PKCE, pas de `client_secret`), `client_id` obtenu par enregistrement dynamique. `COROS_HISTORY_DAYS` / `COROS_DAILY_DAYS` absents → valeurs par défaut (365 / 7). |
| Vault | `project_url` et `service_role_key` présents (nécessaires au cron). |
| Cron `coros-sync` | actif, `40 3 * * *`. Trois derniers passages (7, 8, 9 nov, 03:40 UTC) : `succeeded`. Aucune connexion COROS n'existe, donc ils n'ont rien synchronisé. |
| Fonctions déployées | `provider-coros-connect` v4 et `provider-coros-callback` v4 (26 oct, callback en `verify_jwt = false`, correct), `provider-coros-sync` v6 (8 nov), `provider-disconnect` v6. Les modifications de `_shared/coros.ts` du 7 nov ne touchent que la synchro et le rafraîchissement du jeton, pas le flux d'autorisation. |
| Tables / fonctions SQL | `provider_oauth_states`, `provider_fit_quota`, `trigger_coros_sync()` présents. |
| `provider_connections` | 1 ligne Garmin `active`, **0 ligne COROS**. |
| `provider_oauth_clients` | 1 client COROS déjà enregistré pour `https://mcpeu.coros.com`, scope `offline_access openid mcp.tools`. |
| Drapeau d'interface | **Il n'y a pas de `VITE_COROS_ENABLED`** : la ligne COROS est toujours visible (seul `VITE_GARMIN_ENABLED` existe). Le panneau « Montres & services connectés » est déjà dans `origin/main`, donc dans la prod Vercel. |

Adresse de retour que COROS appellera (déduite de `SUPABASE_URL` par le code) :
`https://mxbfnkkbtmbrauvqplrt.supabase.co/functions/v1/provider-coros-callback`

---

## 2. Ce qui peut échouer à la première connexion

Du plus probable au moins probable.

1. **`redirect_uri` rejeté par COROS.** Il n'y a pas de console développeur à
   configurer : l'adresse est déclarée à l'enregistrement dynamique. Mais le
   client COROS EU déjà présent en base a été enregistré avant ce jour, avec une
   adresse que la table ne conserve pas. Si elle diffère de celle ci-dessus,
   COROS affichera une erreur `invalid_redirect_uri` / `invalid_client` sur sa
   page d'autorisation. Remède : supprimer la ligne `provider_oauth_clients`
   (EU) pour que `provider-coros-connect` ré-enregistre — **écriture en prod,
   confirmation de Titouan requise**.
2. **Mauvaise région.** L'interface propose Europe (défaut), États-Unis / reste
   du monde, Chine. Un compte COROS créé hors Europe échoue à l'autorisation ou
   donne des 401 ensuite. Choisir la région où le compte a été créé.
3. **Consentement `coros_sync` absent.** L'interface le coche avant la
   redirection ; sans lui, `provider-coros-connect` répond 403
   `consentement_absent` et la base refuse aussi l'insertion au retour
   (`?coros=consentement_absent`).
4. **`APP_URL` mal pointé.** La valeur n'est pas lisible. Elle doit être l'URL
   publique de la prod : le callback renvoie vers `APP_URL/athlete/profil?coros=…`.
   Si elle pointe ailleurs, la connexion est quand même enregistrée mais le
   message de résultat s'affiche au mauvais endroit : vérifier en base, pas
   seulement à l'écran.
5. **Authentification COROS.** La page d'autorisation COROS exige un compte
   COROS ; le navigateur doit pouvoir y ouvrir une session (pas de bloqueur qui
   coupe la redirection).
6. **`offline_access` non accordé** (`?coros=partiel`, `last_error` rempli) :
   pas de `refresh_token`, la synchro s'arrête à l'expiration du jeton. À
   reconnecter en acceptant toutes les autorisations.
7. **Délai de 10 minutes.** Le `state` expire 10 min après le clic. Faire
   l'opération d'une traite.
8. **Noms d'outils / format des réponses MCP (non observés).** La synchro
   résout les outils contre `tools/list` et les paramètres de dates contre leur
   `inputSchema`. En cas d'écart elle s'arrête avec une erreur explicite dans
   `last_error`, sans deviner. C'est le point le plus susceptible de demander un
   correctif : la doc COROS s'est déjà trompée une fois.
9. **Quota** : 50 fichiers FIT / 24 h / athlète, 10 par appel. Un an d'historique
   se rattrape sur plusieurs jours ; un quota atteint n'est pas une erreur
   (`pending`). Le bouton « Synchroniser maintenant » a un budget plus étroit
   que le cron de 3 h 40.
10. **Hors périmètre de ce test** : relecture des conditions d'utilisation
    COROS (afficher les données au coach) et décision sur `ai_allowed` — voir fin
    de `COROS_INTEGRATION.md`. Garder `ai_allowed = false` pour `coros`.

---

## 3. Guide pas à pas pour Titouan

Prérequis : un compte COROS réel avec au moins quelques activités, connaître sa
région, et être connecté à Agon avec un compte **athlète ou coach_athlete** (le
panneau n'apparaît pas pour un coach seul ni en mode consultation).

1. Ouvre la prod dans un navigateur normal, connecté à ton compte Agon, puis va
   dans **Profil** (`/athlete/profil`).
2. Déplie **« Montres & services connectés »**, ligne **COROS**.
3. Choisis la **région** de ton compte COROS (Europe par défaut).
4. Coche la case de consentement de synchronisation COROS.
5. Clique **« Connecter mon compte COROS »**. Tu es redirigé vers la page
   d'autorisation COROS (`mcpeu.coros.com/oauth2/authorize` pour l'Europe).
6. Connecte-toi à COROS si demandé, puis **accepte toutes les autorisations**
   (en particulier l'accès durable / hors ligne).
7. Tu reviens sur `…/athlete/profil?coros=…`. Le résultat attendu est un toast
   « Compte COROS connecté ». Note la valeur de `?coros=` si autre chose
   s'affiche (`refus`, `expire`, `partiel`, `erreur`, `consentement_absent`,
   `client_introuvable`).
8. **Dis-moi « connecté »** (ou le code d'erreur vu). Ne clique pas encore sur
   « Synchroniser maintenant » : je veux d'abord relever l'état brut.
9. Ensuite, soit tu cliques « Synchroniser maintenant » (budget étroit, bon pour
   un premier essai), soit on attend le cron de 3 h 40 UTC.

Si l'écran COROS affiche une erreur d'adresse de retour : arrête-toi, note le
message exact et dis-le-moi (cas 1 ci-dessus).

---

## 4. Ce que je surveille

**Logs de `provider-coros-callback`** : le CLI n'a pas de commande `functions
logs`. Source : tableau de bord Supabase → Edge Functions →
`provider-coros-callback` → Logs
(`https://supabase.com/dashboard/project/mxbfnkkbtmbrauvqplrt/functions/provider-coros-callback/logs`),
à relire avec Titouan si je ne peux pas les atteindre. Lignes qui comptent :

| Ligne | Sens |
|---|---|
| `consommation du state : …` | RPC `consume_oauth_state` en échec |
| `COROS jeton refusé (4xx) : …` | échange du code refusé (redirect_uri, verifier, client) |
| `COROS réponse de jeton illisible` | corps de réponse inattendu |
| `connexion refusée` | consentement retiré ou contrainte en base |
| `écriture du jeton : …` | RPC `provider_token_write` / Vault |

Aucune ligne d'erreur + redirection `?coros=ok` = succès.

**Base (lecture seule, sans jeton, sans donnée d'activité)** : pour la ligne
COROS de `provider_connections` : `status`, `api_host`, `granted_scopes`,
`last_error`, `synced_through`, `last_sync_at`.

**Logs de `provider-coros-sync`** : la liste réelle des outils avec leurs
paramètres (`outils disponibles (N) : …`) est journalisée à chaque exécution.
Elle doit être recopiée dans `COROS_INTEGRATION.md` (section « Réserve toujours
ouverte ») après la première synchro.

---

## 5. Observations de la connexion réelle

### 2026-11-09, après la connexion de Titouan (lecture seule)

- **Autorisation réussie.** Une ligne `provider_connections` COROS : `status = active`,
  hôte `mcpeu.coros.com`, scopes accordés `mcp.tools`, `openid`, `offline_access`
  (donc un `refresh_token` a été délivré), `last_error` vide, mise à jour à 15:45 UTC.
  Le client enregistré avant ce jour a été accepté : le cas « redirect_uri rejeté » ne
  s'est pas produit.
- **Plusieurs tentatives.** `provider_oauth_states` garde deux états COROS non consommés
  (15:11 expiré, 15:43 encore valide à la lecture) : des départs vers COROS sans retour
  (page fermée, ou clic répété). La connexion à 15:45 vient d'un autre état, consommé.
  La purge de 3 h 10 les nettoiera.
- **Aucune synchro encore faite** : `last_sync_at` et `synced_through` vides,
  `provider_activities` = 0 et `provider_dailies` = 0 pour `source = 'coros'`,
  `provider_fit_quota` vide. Le cron de 3 h 40 UTC n'a pas encore tourné depuis la connexion.
- Reste à faire : synchro (bouton ou cron), puis compteurs, volume de course, format
  des FIT, liste réelle des outils MCP.

### 2026-11-09 15:49 UTC — première synchro manuelle

- La synchro a tourné (`last_sync_at` 15:48:59) et la connexion reste `active`.
- **Premier écart avec la doc** : l'outil de données quotidiennes s'appelle
  `queryDailyHealthData` (pas `queryDailyActivity`) et son schéma publié n'a pas de
  paramètres de début / fin : il prend `days`. `resolveDateArgs` refuse de deviner, d'où
  `last_error` = « données quotidiennes non lues : queryDailyHealthData : paramètres de
  début / fin de période introuvables dans le schéma publié (days) ». Correctif à écrire
  en local avec un test : accepter un paramètre `days` (nombre de jours en arrière) pour
  cet outil. Redéploiement de `provider-coros-sync` : accord requis.
- Compteurs juste après : 0 activité, 0 donnée quotidienne, quota FIT à 0,
  `synced_through` toujours vide. Le côté FIT n'a donc rien importé ni ne s'est
  clairement arrêté : le journal de `provider-coros-sync` (ligne « outils disponibles »
  et suites) ou le compte rendu affiché par le bouton est nécessaire pour trancher.

### Lecture du résultat

Le compte COROS de Titouan est neuf : aucune activité, jamais utilisé. Les 0 activité et
0 donnée quotidienne sont donc attendus. Ce test valide l'autorisation, le stockage des
jetons (avec `refresh_token`), l'ouverture de session MCP, `tools/list` et la résolution
des outils. Il ne valide **pas** le listing des FIT, leur téléchargement ni leur décodage,
faute de fichier. Pour les valider, il faut au moins une activité dans le compte COROS
(séance réelle, ou saisie manuelle dans l'app COROS), puis une nouvelle synchro.
