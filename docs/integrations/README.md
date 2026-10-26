# Montres connectées — état des démarches

Vérifié le **26 octobre 2026**. Les programmes développeur bougent vite :
revérifier avant de déposer quoi que ce soit.

## Où on en est

| Fournisseur | Accès | Démarche | Statut |
|---|---|---|---|
| **COROS** | MCP officiel, OAuth 2.0 | **Aucune** — libre-service | Prêt à coder |
| **Garmin** | Connect Developer Program, palier *Starter* | Formulaire à déposer | Dossier prêt, bloqué par 2 pré-requis |
| **Strava** | — | Abandonné | Voir `docs/DECISIONS.md` |

## Ce qui bloque le dépôt Garmin

Deux champs du formulaire sont obligatoires et ne peuvent pas être inventés :

1. **Identité de l'entreprise** — nom légal, SIREN, adresse. Les champs sont
   encore à `[À COMPLÉTER]` dans `src/lib/legal.ts`, et les pages légales
   affichent un bandeau rouge tant qu'ils y sont. Un dossier déposé avec des
   mentions légales incomplètes est pire qu'un dossier non déposé : il donne
   une raison de refuser.

2. **Website URL + Privacy Policy URL publiques.** L'app est en ligne sur
   `https://myprepapro.vercel.app`, et les pages légales y seront accessibles
   sans compte dès la prochaine mise en production. C'est techniquement
   suffisant. Mais c'est un sous-domaine `vercel.app` sans marque : pour un
   relecteur qui vérifie qu'il a affaire à une vraie entreprise, un nom de
   domaine propre pèse plus lourd. À trancher avant le dépôt — pas après.

   À noter : `agon.fr` **n'est pas à nous**. C'est un site de vente d'adresses
   e-mail. Ne pas le donner à Garmin.

## Ordre conseillé

1. Compléter `src/lib/legal.ts` (nom, SIREN, adresse, URL du site).
2. Mettre `dev` en production pour que les trois pages légales soient
   publiquement accessibles. Garmin les ouvrira.
3. Déposer le dossier Garmin (`GARMIN_DOSSIER.md`) — la revue prend du temps,
   autant la lancer tôt.
4. Pendant l'attente : coder COROS (`COROS_INTEGRATION.md`), qui ne demande
   aucune autorisation, et l'import de fichiers. Le schéma de données est
   commun aux deux fournisseurs, donc ce travail ne sera pas à refaire quand
   Garmin répondra.

## Raccourci pour tester tout de suite : la clé Garmin « Personal »

Depuis octobre 2026, Garmin délivre une clé API personnelle sans aucune
démarche : connexion à Garmin Connect, page des jetons API dans les réglages
du compte.

Utile pour vérifier la forme réelle des données avant d'avoir le palier
Starter. Deux limites qui interdisent de s'en contenter :

- **Un seul compte** — le tien. Inutilisable pour une app multi-utilisateurs.
- **Pull uniquement**, et Garmin retire de l'API certaines métriques calculées
  (VO2max estimé, temps de récupération, performance condition) qui restent
  présentes dans un fichier téléchargé à la main. Ne pas promettre à un coach
  des indicateurs qui n'arriveront jamais.
