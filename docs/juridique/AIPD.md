# Analyse d'impact relative à la protection des données (AIPD) — Agon

Version 1, 2026-11-13. Rédigée par Claude à la place d'un juriste (décision d'Hugo du 13/11) :
ce n'est pas un avis d'avocat. Méthode : guide PIA de la CNIL (contexte, principes
fondamentaux, risques, plan d'action). Responsable de traitement : Hugo TANGUY (EI, Agon).
Pas de DPO à consulter (art. 35.2 sans objet). Avis des personnes concernées (art. 35.9) : non
recueilli, recommandé à faible coût (question aux ~15 utilisateurs, voir plan d'action A9).

À revoir : avant la sortie sur les stores, à chaque nouvelle catégorie de données ou nouveau
destinataire, et au plus tard dans un an.

## 1. Pourquoi une AIPD est obligatoire ici

L'art. 35.1 impose une AIPD quand un traitement est « susceptible d'engendrer un risque élevé ».
Les lignes directrices WP248 rév.01 (reprises par l'EDPB) retiennent qu'un traitement qui
remplit **au moins deux** de leurs neuf critères doit en principe faire l'objet d'une AIPD.
Agon en remplit quatre :

| Critère WP248 | Agon |
|---|---|
| 1. Évaluation ou notation, dont profilage de la santé | Feu du matin (VFC, FC de repos, ressentis, charge comparés à la norme de la personne), charge d'entraînement, synthèses IA |
| 4. Données sensibles | Données de santé (art. 9) : douleur, maladie, VFC, photos du corps, blessures, antécédents, documents médicaux |
| 7. Personnes vulnérables | Mineurs de 15 à 17 ans ; athlètes dans une relation de dépendance avec leur coach |
| 8. Usage innovant | Objets connectés (montres), IA générative |

Le critère « grande échelle » n'est pas rempli (une quinzaine d'utilisateurs), mais il ne
conditionne pas l'obligation. **Conclusion : AIPD obligatoire.** L'absence d'AIPD quand elle est
requise est sanctionnable (art. 83.4).

Consultation préalable de la CNIL (art. 36) : seulement si un risque résiduel élevé subsiste
après mesures. Voir §5 : ce n'est pas le cas si les actions C1 et C2 sont menées.

## 2. Contexte

**Le traitement.** Application web (bientôt empaquetée pour iOS et Android) où des coachs de
préparation physique programment l'entraînement de leurs athlètes, et où les athlètes saisissent
leurs séances, leur forme du matin, leurs bilans, leurs mesures, et peuvent connecter une montre.
Inventaire complet des données : `REGISTRE.md` (T1 à T8).

**Acteurs.**
- Responsable de traitement de la plateforme : Agon (Hugo TANGUY, EI).
- Coachs, co-coachs, professionnels du staff : destinataires, responsables distincts de l'usage
  qu'ils font des données dans leur propre activité (`REVUE_2026-11.md` §2.8).
- Sous-traitants : Supabase (base, Irlande), Vercel (site, États-Unis), Google (API Gemini).
- Responsables indépendants : Garmin, COROS.

**Supports.** Navigateur ou application de l'utilisateur → Supabase (PostgreSQL avec RLS,
Storage, Edge Functions Deno, Vault) ; Vercel ne sert que le code du site. Données en Irlande.

## 3. Principes fondamentaux

| Principe | Constat | Appréciation |
|---|---|---|
| Finalités déterminées (art. 5.1.b) | Suivi sportif partagé avec le coach, staff, montres, IA, retours, sécurité, preuve | Conforme |
| Base légale (art. 6 et 9) | Consentement explicite séparé, versionné, horodaté, libellé archivé ; accords facultatifs distincts (IA, staff, Garmin, COROS) | Conforme. Le refus de l'accord socle bloque l'app : admis, car le partage avec le coach *est* le service (art. 7.4 non méconnu, lignes directrices EDPB 05/2020 §36-37) |
| Minimisation (art. 5.1.c) | Saisie à l'initiative de l'athlète ; liste blanche de colonnes vers l'IA ; mais copie intégrale Garmin, y compris des types non affichés | **À améliorer** (A5) |
| Exactitude (art. 5.1.d) | Rectification dans l'app ; provenance des mesures affichée ; « — » pour une mesure absente | Conforme |
| Durées (art. 5.1.e) | Durée de vie du compte ; effacement à la suppression ; pas de purge des comptes inactifs ni des comptes pré-créés jamais réclamés | **À améliorer** (A6) |
| Information (art. 12-14) | Politique détaillée, version 2026-11-13 ; complétée par cette revue | Conforme après corrections |
| Droits (art. 15-22) | Export JSON complet en libre-service, suppression en libre-service (app et page web), retrait des accords en un clic | Conforme |
| Sous-traitance (art. 28) | DPA Supabase non signé, statut Vercel et Gemini à vérifier | **Non conforme tant que H1-H3 ne sont pas faits** |
| Transferts (chap. V) | Vercel et Google certifiés DPF ; Supabase par clauses types | Conforme après H2 |
| Mineurs (art. 8, loi I&L art. 45) | 15 ans minimum vérifié en base ; IA ouverte aux 15-17 ans alors que Gemini et Claude l'interdisent | **Corrigé** : client et trigger en base (C2) |
| Hébergement de santé (CSP L.1111-8) | Fonctions de suivi médical (diagnostic, traitement, documents médicaux) sur un hébergeur non certifié HDS | **Non conforme** (C1) |

## 4. Risques

Échelle CNIL : négligeable, limitée, importante, maximale.

### R1. Accès illégitime aux données

| | |
|---|---|
| Impacts | Divulgation d'informations de santé (douleurs, maladie, antécédents, traitements), de photos du corps, de la position GPS des sorties (domicile déductible). Atteinte à la vie privée, gêne, discrimination (club, employeur), risque physique (lieu de vie). |
| Sources | Erreur de règle d'accès (RLS) ; bucket mal configuré (cas réel : `test-media` public du 2026-08-25 au 2026-11-13) ; compte de coach compromis ; clé d'assistant IA du coach divulguée ; coach ou staff indélicat ; prestataire. |
| Mesures existantes | RLS sur 95/95 tables, `is_coach_of` partout ; buckets de données privés, URL signées courtes ; tests SQL des règles en CI sur le schéma de prod ; jetons OAuth dans le Vault ; clés d'API coach hachées, révocables, à débit limité, lectures journalisées ; IA en liste blanche ; chiffrement en transit et au repos. |
| Gravité | **Maximale** (santé, photos du corps, mineurs). |
| Vraisemblance | **Limitée** : contrôles serveur testés ; mais une faille réelle a existé 80 jours et une autre session corrige encore des règles trop larges (`policies-prod-trop-large`). |
| Mesures prévues | A1 (revue des policies en cours), A2 (alerte sur tout bucket public), A3 (mots de passe : longueur minimale et MFA pour les coachs), A7 (procédure de violation). |

### R2. Modification non désirée des données

| | |
|---|---|
| Impacts | Charge erronée, programme inadapté → blessure ; feu du matin faux. |
| Sources | Bug d'écriture concurrente (« miroirs » `app_data` ↔ tables), assistant IA du coach qui écrit, staff en écriture. |
| Mesures existantes | Écritures santé par RPC atomiques ; l'assistant propose des brouillons que le coach valide (`coach_api_drafts`, annulables) ; jamais de suppression d'une séance réalisée (`deletePlannedWorkouts`) ; auteur affiché. |
| Gravité | Importante. Vraisemblance : limitée. |

### R3. Disparition des données

| | |
|---|---|
| Impacts | Perte de l'historique d'entraînement et de santé. |
| Sources | Erreur de migration, suppression accidentelle, incident Supabase. |
| Mesures existantes | Migrations testées à blanc, rejeu CI (R2) ; mais **plan Supabase gratuit : aucune sauvegarde accessible** selon la documentation Supabase (sauvegardes quotidiennes à partir de l'offre Pro, 7 jours). |
| Gravité | Importante. Vraisemblance : **importante** sur l'offre gratuite. |
| Mesures prévues | A4 : passer sur l'offre Pro (sauvegardes quotidiennes 7 jours) avant les stores, ou exporter chaque jour (`supabase db dump`) vers un stockage chiffré en UE. |

### R4. Usage détourné par les destinataires (coach, staff, IA)

| | |
|---|---|
| Impacts | Données de santé utilisées hors du suivi (sélection en club, communication à des tiers) ; données d'un mineur envoyées à une IA qui l'interdit. |
| Mesures existantes | Accord staff séparé et visible ; IA soumise à accord révocable ; Anthropic présenté comme relevant du compte du coach. |
| Mesures prévues | C2 (IA réservée aux 18 ans), CGU : engagements du coach et du staff (fait le 13/11). |
| Gravité | Importante. Vraisemblance : limitée. |

## 5. Risque résiduel et validation

Après les actions **C1** (sortir du champ HDS ou héberger chez un HDS) et **C2** (IA 18 ans),
et les actions H1 à H3 (contrats), le risque résiduel est **limité** pour R2 et R4 et reste
**important en gravité mais limité en vraisemblance** pour R1. Il n'y a pas de risque résiduel
élevé justifiant une consultation préalable de la CNIL (art. 36).

Tant que C1 n'est pas tranché, le traitement des données de soins (diagnostics et traitements
écrits par un professionnel de santé, documents médicaux) n'est **pas** conforme : la
recommandation est de le suspendre (masquer ces champs et l'envoi de documents médicaux) en
attendant.

Validation par le responsable de traitement : **à faire par Hugo** (date, signature, ou « validé »
dans `docs/DECISIONS.md`).

## 6. Plan d'action

| # | Action | Qui | Échéance |
|---|---|---|---|
| C1 | Décidé le 13/11 (Hugo) : retirer. Données de soins (aujourd'hui : 1 diagnostic et 2 traitements saisis par les athlètes, 0 document) : retirer les champs diagnostic / traitement / antécédents / documents médicaux (ou les réserver à un hébergeur HDS) | Hugo décide, dev | Avant toute nouvelle saisie ; avant les stores au plus tard |
| C2 | Accord IA 18 ans : client (fait, sur `dev`), trigger en base appliqué le 13/11 | — | Fait |
| H1-H3 | DPA Supabase signé, facturation Gemini active, offre Vercel compatible | Hugo | Avant les stores |
| A1 | Finir la correction des règles trop larges | session `policies-prod-trop-large` | En cours |
| A2 | Test CI : aucun bucket public hors liste blanche (`energy-exercise-photos`, `exercise-*`, `public-assets`) | dev | Prochain lot |
| A3 | Mot de passe : 8 caractères minimum au lieu de 6 (client et réglage Supabase Auth), MFA proposé aux coachs | dev + Hugo (réglage) | Avant les stores |
| A4 | Sauvegardes : offre Pro ou dump quotidien chiffré | Hugo | Avant les stores |
| A5 | Copie Garmin : ne garder que les types utiles, ou purger le brut après 12 mois | dev + Hugo | 2027 T1 |
| A6 | Purge : comptes pré-créés non réclamés après 6 mois, comptes inactifs après 3 ans (avec préavis par e-mail) | dev | 2027 T1 |
| A7 | Procédure et registre des violations (`REGISTRE_VIOLATIONS.md`) | fait le 13/11 | — |
| A8 | Polices Google servies depuis le site (plus d'appel à Google à chaque chargement) | dev | Avant les stores |
| A9 | Demander l'avis de quelques athlètes et coachs sur cette AIPD | Hugo | Facultatif |
