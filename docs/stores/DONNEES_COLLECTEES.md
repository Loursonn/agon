# Données collectées — brouillon des fiches stores (P14)

> Brouillon du 2026-11-12 pour les **privacy labels Apple** (App Store Connect → App Privacy) et la
> section **Data safety** de Google Play. Établi à partir du code (`supabase/migrations`,
> `src/api`, `src/lib/dataExport.ts`, `supabase/functions/delete-account`, `_shared/aiGuard.ts`)
> et de la politique de confidentialité en vigueur (`src/pages/legal/PrivacyPolicy.tsx`, version
> 2026-10-31). À relire par Hugo avant de remplir les formulaires ; les points à trancher sont en
> fin de document (§5).
>
> Périmètre : l'app telle qu'elle est aujourd'hui (web empaqueté avec Capacitor, sans HealthKit ni
> Health Connect). **Si un plugin santé natif, des notifications push, un outil d'analyse ou de
> plantage est ajouté, ces fiches changent.**

## 1. Vue d'ensemble

Constats valables pour toutes les catégories :

- **Aucun suivi publicitaire** (« tracking » au sens Apple) : pas de SDK publicitaire, pas d'outil
  de mesure d'audience, pas de cookie tiers, pas de revente. `package.json` ne contient ni Sentry,
  ni Firebase, ni PostHog, ni Vercel Analytics.
- **Toutes les données sont liées à l'identité** de l'utilisateur (rattachées à son compte), sauf
  la trace anonyme de suppression (`account_deletions`).
- **Chiffrement en transit** : oui (HTTPS partout, Supabase et Vercel).
- **Suppression** : en libre-service, dans l'app (Profil → Confidentialité) et sur la page web
  publique `/suppression-compte` (exigée par Google). Edge Function `delete-account` : fichiers
  Storage purgés, accès Garmin / COROS révoqués chez le fournisseur, puis suppression de
  l'utilisateur et cascade sur toutes les tables. Restent : une ligne anonyme
  (`account_deletions` : date, rôle, version de l'accord) et les sauvegardes Supabase (30 jours au
  plus, à vérifier sur le plan, voir §5).
- **Export** : en libre-service (Profil → Confidentialité → JSON, `src/lib/dataExport.ts`).
- **Âge minimum** : 15 ans, vérifié à l'inscription (`src/lib/age.ts` + triggers `min_age_signup`).

### Destinataires

| Tiers | Rôle | Ce qu'il reçoit | Au sens des stores |
|---|---|---|---|
| Supabase (UE) | Sous-traitant : base, auth, fichiers | Tout | Prestataire → **pas un partage** |
| Vercel (US) | Sous-traitant : hébergement web | Adresse IP, requêtes (pas de données en base) | Prestataire → **pas un partage** |
| Google Gemini (API payante) | Sous-traitant IA | Données d'entraînement et de forme **saisies dans Agon ou importées par fichier**. **Jamais de données Garmin ni COROS** (`data_source_policies.ai_allowed = false`, vues `ai_provider_*`). Seulement si l'athlète a donné l'accord IA. | Prestataire → **pas un partage** (pas d'entraînement des modèles) |
| Garmin, COROS | Responsables indépendants | Ils **envoient** des données (sur connexion volontaire). Agon leur envoie : jetons, révocation, séances planifiées (`provider_workout_pushes`) | Source de collecte. L'envoi de séances vers Garmin = action demandée par l'utilisateur → pas un partage |
| Anthropic (Claude, via le compte du coach) | **Ni prestataire ni choisi par Agon** : clé API générée par le coach (`coach-api`) | Prénom, séances, charges, bien-être, poids, blessures (zones, dates), compétitions, tests, données de montre autorisées, titres d'événements de calendrier. Seulement si l'athlète a donné l'accord IA. | **Probablement un partage** (voir §5, point 1) |
| Staff et co-coach | Utilisateurs de l'app | Domaines ouverts par le coach, avec l'accord staff de l'athlète | Partage entre utilisateurs de l'app → pas un partage au sens des stores |

## 2. Inventaire par catégorie

Légende : **Obl.** = obligatoire pour utiliser l'app ; **Fac.** = facultatif.

### 2.1 Identité et contact

| Donnée | Où | Obl./Fac. | Usage | Partage |
|---|---|---|---|---|
| E-mail, mot de passe (haché) | `auth.users` | Obl. | Compte, connexion | Non |
| Nom, prénom | `profiles.full_name`, `first_name`, `last_name` | Obl. | Compte, affichage au coach | Anthropic (prénom) si accord IA |
| Date de naissance, âge | `profiles.birth_date`, `age` | Obl. | Vérification d'âge, calculs (zones FC) | Non |
| Genre | `profiles.gender` | Fac. | Calculs, tests | Non |
| Rôle, rattachement coach, métier (staff) | `profiles.role`, `coach_id`, `profession`, `athlete_staff` | Obl. | Fonctionnement | Non |
| Lien de prise de rendez-vous (coach) | `profiles.booking_url` | Fac. | Affichage aux athlètes | Non |

### 2.2 Santé et forme (données sensibles, art. 9 RGPD)

| Donnée | Où | Obl./Fac. | Usage | Gemini | Anthropic |
|---|---|---|---|---|---|
| Séances, charges, séries, RPE/RIR, records | `workout_logs`, `set_logs`, `exercise_pr_logs`, `workout_rpe`, `energy_*`, `performance_logs` | Fac.* | Fonctionnement, suivi coach | Oui (agrégats) | Oui |
| Bien-être (sommeil, fatigue, stress, courbatures) | `app_data` `asp:*`, `wellness_entries` | Fac. | Suivi coach, IA | Oui | Oui |
| Poids, taille, masse grasse, métabolisme, mensurations | `profiles.weight_kg` / `height_cm` / `body_fat_pct` / `base_metabolism`, `body_weight_*`, `measurement_logs` | Fac. | Suivi, calculs | Oui (poids) | Oui (poids) |
| Blessures, suivi médical, antécédents | `medical_entries`, `medical_history`, `medical_attachments` | Fac. | Suivi coach / staff | Zones et dates seulement | Zones et dates seulement |
| Nutrition | `app_data` `asp:*` (tables `nutrition_*` non utilisées par le front) | Fac. | Suivi | Non (`athlete-insights` n'en reçoit pas) | Non |
| Tests, résultats HYROX, compétitions | `test_*`, `athlete_test_*`, `hyrox_*`, `competitions` | Fac. | Suivi, programmation | Oui | Oui |
| Habitudes | `habits`, `habit_logs` | Fac. | Suivi | Non | Oui (fiches/habitudes écrites) |
| Événements de vie (examens, voyages) | `athlete_life_events` | Fac. | Planification | Non | Titres et dates |

\* Facultatif au sens strict (l'app s'ouvre sans), mais c'est l'objet même de l'app.

### 2.3 Données de montre et fichiers d'activité

Source : connexion volontaire Garmin ou COROS, ou import manuel de fichiers (FIT, TCX, GPX, archive
Strava / Garmin). Toujours **facultatif**.

| Donnée | Où | Gemini | Anthropic |
|---|---|---|---|
| Activités : sport, durée, distance, allure, dénivelé, calories, tours, séries | `provider_activities`, `activity_laps`, `activity_sets`, `activity_zone_summaries` | Fichiers importés seulement | Fichiers importés seulement (vues `ai_provider_*`) |
| Séries temporelles : FC, vitesse, cadence, puissance, altitude, température, dynamique de course | `activity_streams` | Non | Non (`coach-api` ne lit que les vues `ai_provider_activities` / `ai_provider_dailies`) |
| **Position GPS précise** (lat/lon point par point) | `activity_streams.lat` / `lon` | Non | Non |
| Données quotidiennes : pas, FC repos, VFC, sommeil, VO2max, charge | `provider_dailies` | Non (Garmin, COROS) | Non (Garmin, COROS) |
| Séries de la journée : FC 15 s, stress, Body Battery, respiration, SpO2 | `provider_intraday`, `provider_moveiq` | Non | Non |
| Données brutes reçues de Garmin (tout le JSON) | `provider_raw_records`, bucket `provider-raw` | Non | Non |
| Jetons d'accès Garmin / COROS | `provider_tokens` (Vault) | Non | Non |

### 2.4 Photos, vidéos et fichiers

| Donnée | Bucket | Obl./Fac. |
|---|---|---|
| Photos de mensurations (corps) | `test-media` | Fac. |
| Médias et fichiers de tests | `test-media`, `test-files` | Fac. |
| Captures d'écran Garmin (tests énergie) | `garmin-screenshots` | Fac. |
| Documents médicaux (PDF, images) | `medical` | Fac. |
| Fiches (photos de fiches, documents du coach) | `docs` | Fac. |
| Fichiers d'activité importés | traités dans le navigateur, bruts Garmin dans `provider-raw` | Fac. |

Tous ces buckets sont privés et purgés à la suppression du compte (`_shared/userStorage.ts`).

### 2.5 Contenus et messages

| Donnée | Où | Obl./Fac. |
|---|---|---|
| Commentaires coach ↔ athlète (séances, exercices, tours, fiches) | `workout_exercise_comments`, `doc_comments`, `weekly_retours` | Fac. |
| Retours sur l'app (bug / idée), avec page et navigateur | `app_feedback` (`page`, `user_agent`) | Fac. |
| Votes et likes (roadmap, citations, retours) | `roadmap_votes`, `citation_likes`, `retours_votes` | Fac. |

### 2.6 Usage et diagnostic

| Donnée | Où | Usage |
|---|---|---|
| Version de l'app utilisée | `profiles.client_build`, `client_build_at` | Savoir quand une ancienne version n'est plus en service (P4) |
| « Nouveautés » lues | `app_update_reads` | Affichage |
| Erreurs de synchronisation santé | `health_sync_errors` | Débogage |
| Journaux Supabase (IP, date, requête) | côté Supabase | Sécurité |
| Journal des lectures de l'assistant du coach | `coach_api_access_log` | Traçabilité (promis par la politique) |

Pas d'outil de plantage, pas de mesure d'audience, pas d'identifiant publicitaire.

### 2.7 Non collecté

Localisation de l'appareil (aucun appel à `geolocation` : la position ne vient que des fichiers
d'activité), contacts, carnet d'adresses, historique de navigation, recherches, données
financières, achats, SMS, audio, identifiants d'appareil ou de publicité.

## 3. Apple — App Privacy (réponses à recopier)

**Collectez-vous des données ?** Oui.

**Tracking** (données utilisées pour suivre l'utilisateur sur des apps / sites d'autres
entreprises) : **Non**, pour toutes les catégories.

Pour chaque type ci-dessous : *Linked to the user* = **Oui** ; *Used for tracking* = **Non**.
Finalité cochée : **App Functionality** (+ **Product Personalization** quand indiqué, pour les
analyses IA présentées à l'athlète).

| Catégorie Apple | Type | Finalités |
|---|---|---|
| Contact Info | Name | App Functionality |
| Contact Info | Email Address | App Functionality |
| Health & Fitness | Health | App Functionality, Product Personalization |
| Health & Fitness | Fitness | App Functionality, Product Personalization |
| Location | Precise Location | App Functionality (tracés GPS des activités importées) |
| User Content | Photos or Videos | App Functionality |
| User Content | Customer Support | App Functionality (retours sur l'app) |
| User Content | Other User Content | App Functionality (commentaires, fiches, documents) |
| Identifiers | User ID | App Functionality |
| Usage Data | Product Interaction | App Functionality (version utilisée, nouveautés lues) |
| Diagnostics | Other Diagnostic Data | App Functionality (navigateur joint aux retours, erreurs de synchro) |
| Other Data | Other Data Types | App Functionality (date de naissance, genre, taille) |

Non cochés : Financial Info, Contacts, Browsing History, Search History, Sensitive Info (Apple y
range orientation, religion, opinions… : non collectés), Purchases, Crash Data, Performance Data,
Advertising Data, Device ID, Audio, Gameplay, Emails or Text Messages, Physical Address, Phone
Number.

**Note pour la review Apple** (champ « App Review Information ») : l'app ne lit pas HealthKit ;
les données de forme viennent de la saisie, de Garmin / COROS (OAuth) ou de fichiers importés.

## 4. Google Play — Data safety (réponses à recopier)

**Collecte ou partage de données utilisateur ?** Oui.
**Toutes les données sont-elles chiffrées en transit ?** Oui.
**Méthode de suppression ?** Oui : dans l'app et sur
`https://agon-training.com/suppression-compte` (à confirmer : domaine de prod).

Colonnes : *Collecté* / *Partagé* / *Traitement éphémère* / *Obligatoire ou facultatif* /
*Finalités*. Finalité par défaut : **Fonctionnalités de l'appli** ; **Gestion du compte** pour le
compte ; **Personnalisation** pour les analyses IA.

| Catégorie Google | Type | Collecté | Partagé | Obl./Fac. | Finalités |
|---|---|---|---|---|---|
| Infos personnelles | Nom | Oui | Voir §5.1 | Obl. | Fonctionnalités, Gestion du compte |
| Infos personnelles | Adresse e-mail | Oui | Non | Obl. | Gestion du compte |
| Infos personnelles | ID utilisateur | Oui | Non | Obl. | Gestion du compte |
| Infos personnelles | Autres infos (date de naissance, genre) | Oui | Non | Obl. (naissance) | Fonctionnalités, Gestion du compte |
| Santé et remise en forme | Infos de santé | Oui | Voir §5.1 | Fac. | Fonctionnalités, Personnalisation |
| Santé et remise en forme | Infos sur la remise en forme | Oui | Voir §5.1 | Fac. | Fonctionnalités, Personnalisation |
| Position | Position exacte | Oui | Non | Fac. | Fonctionnalités |
| Photos et vidéos | Photos | Oui | Non | Fac. | Fonctionnalités |
| Fichiers et documents | Fichiers et documents | Oui | Non | Fac. | Fonctionnalités |
| Messages | Autres messages dans l'appli | Oui | Non | Fac. | Fonctionnalités |
| Activité dans les applis | Interactions avec l'appli | Oui | Non | Obl. (version) | Fonctionnalités |
| Activité dans les applis | Autres contenus générés par l'utilisateur | Oui | Non | Fac. | Fonctionnalités |
| Infos et performances de l'appli | Autres données de performances | Oui | Non | Fac. | Fonctionnalités (retours, erreurs de synchro) |

Non cochés : Infos financières, Contacts, Agenda (les événements de vie sont saisis dans Agon, pas
lus dans l'agenda du téléphone), Navigation Web, Fichiers audio, E-mails, SMS, Position
approximative, Identifiants de l'appareil, Journaux de plantage, Diagnostics.

Remarques Google :
- Les envois à Supabase, Vercel et Gemini sont des **prestataires** : Google ne les compte pas
  comme partage.
- Google exige aussi la **déclaration « Health apps »** (Contenu de l'appli → Applications de
  santé) : cocher « Suivi de l'activité et de la forme » et « Gestion de la santé » si le suivi
  médical / kiné est présenté.

## 5. Écarts et points à trancher (Hugo)

1. **Assistant Claude du coach (Anthropic) : partage ou pas ?** La politique le présente comme
   hors prestataires (« Anthropic n'est pas notre prestataire »). Pour Google, un transfert vers un
   tiers qui n'est pas notre prestataire est un **partage**, sauf s'il est fait à l'initiative de
   l'utilisateur lui-même ; ici c'est le coach qui l'initie, avec l'accord de l'athlète.
   Recommandation : déclarer **Partagé = Oui** pour Nom, Infos de santé, Remise en forme (finalité
   « Fonctionnalités de l'appli »). Apple n'a pas de case « partage » hors tracking : rien à
   changer côté Apple.
2. **Politique incomplète sur les données Garmin** : §2.3 cite FC, pas, VFC, sommeil, VO2max,
   charge. Le code stocke aussi **stress, Body Battery, respiration, SpO2** (`provider_intraday`)
   et **tout le JSON brut reçu** (`provider_raw_records`, depuis le 2026-11-10). À ajouter à la
   politique (et au dossier Garmin s'il liste les types).
3. **Photos du corps** (mensurations, bucket `test-media`) : absentes de la politique §2.2, qui ne
   parle que de « mesures corporelles que vous saisissez ». Donnée très sensible : à nommer.
4. **Genre, taille, masse grasse, métabolisme de base** (`profiles`) : absents de §2.1 / §2.2.
5. **Retours sur l'app** (`app_feedback`, avec page et navigateur) et **version utilisée**
   (`profiles.client_build`) : absents de §2.4 « Données techniques ».
6. **Tests, HYROX, compétitions, habitudes, événements de vie** : utilisés (et envoyés à
   l'assistant du coach selon §4.1) mais absents de la liste §2.2.
7. **Vérifié, pas d'écart** : la nutrition ne part pas chez Gemini ; l'assistant du coach
   (`coach-api`) ne lit que les vues `ai_provider_*` (pas de Garmin, pas de COROS, pas de séries
   seconde par seconde ni de GPS). La politique pourrait le dire plus précisément que « données de
   montre autorisées ».
8. **Durée des sauvegardes** : la politique annonce 30 jours ; l'audit (§9) demande de l'aligner
   sur le plan Supabase réel (PITR ou sauvegarde quotidienne, 7 jours sur Pro). À vérifier dans le
   tableau de bord Supabase, puis corriger la politique ou la page `/suppression-compte`.
9. **Coach qui supprime son compte** : ses athlètes gardent leurs données et sont détachés
    (`profiles.coach_id ON DELETE SET NULL`) ; les documents du coach partent avec lui. Cohérent
    avec la page de suppression, mais pas écrit dans la politique.

Les points 2 à 6 changent la politique de confidentialité : nouvelle catégorie de données ⇒
`LEGAL_VERSION` à incrémenter (`src/lib/legal.ts`), ce qui redemande l'accord des utilisateurs.
Mieux vaut les grouper en une seule révision, avant la soumission aux stores.
