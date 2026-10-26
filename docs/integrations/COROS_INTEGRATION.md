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
> - `COROS_CLIENT_SECRET` dans `.env.example` est **inutile** : à retirer quand
>   le chantier COROS sera livré, pour ne pas laisser croire qu'il manque un
>   secret à configurer.
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
- **L'historique est accessible** (`getActivityList` accepte une plage de
  dates, défaut 7 jours). Contrairement à Garmin, on peut remonter le passé
  d'un athlète dès sa connexion. Le téléchargement de FIT est plafonné à
  10 fichiers par appel — donc un rattrapage d'historique se fait par lots
  étalés, pas en une rafale.

Les cycles menstruels sont accessibles. **Ne pas les récupérer** : aucune
fonctionnalité d'Agon ne s'en sert, et collecter une donnée de santé dont on
n'a pas l'usage est exactement ce que la minimisation interdit. Si la donnée
n'est pas demandée, elle n'a pas à être protégée.

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
