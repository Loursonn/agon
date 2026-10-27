# Montres connectées — état des démarches

Vérifié le **26 octobre 2026**. Les programmes développeur bougent vite :
revérifier avant de déposer quoi que ce soit.

## Où on en est

| Fournisseur | Accès | Démarche | Statut |
|---|---|---|---|
| **COROS** | MCP officiel, OAuth 2.0 | **Aucune** — libre-service | Prêt à coder |
| **Garmin** | Connect Developer Program, palier *Starter* | Formulaire à déposer | Dossier prêt, bloqué par le domaine et la mise en production |
| **Strava** | — | Abandonné | Voir `docs/DECISIONS.md` |

## Ce qui bloque le dépôt Garmin

1. ~~**Identité de l'entreprise**~~ — fait. Nom légal, SIREN et adresse sont
   renseignés dans `src/lib/legal.ts`, et le bandeau d'avertissement des pages
   légales a disparu. `hasLegalPlaceholders()` reste en place : il le fera
   réapparaître si un champ d'identité est vidé plus tard.

2. **Website URL + Privacy Policy URL publiques.** Domaine retenu :
   `agon-training.com`. Il doit pointer vers le déploiement de production avant
   le dépôt, parce que Garmin ouvrira les deux URL pendant la revue — un domaine
   déclaré qui ne répond pas vaut moins qu'un sous-domaine `vercel.app` qui
   répond.

   À noter : `agon.fr` **n'est pas à nous**. C'est un site de vente d'adresses
   e-mail. Ne pas le donner à Garmin.

## Ordre conseillé

1. ~~Compléter `src/lib/legal.ts`~~ — fait.
2. Brancher `agon-training.com` sur le projet Vercel de production, et le
   vérifier depuis l'extérieur : les trois pages légales doivent répondre sans
   compte. C'est ce que Garmin ouvrira.
3. Mettre `dev` en production.
4. Déposer le dossier Garmin (`GARMIN_DOSSIER.md`) — la revue prend du temps,
   autant la lancer tôt.
5. ~~Pendant l'attente : coder COROS et l'import de fichiers~~ — fait. Reste la
   relecture des conditions COROS pour trancher `ai_allowed`, et les secrets
   Supabase (`APP_URL`, `project_url`, `service_role_key`).

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
