# Registre des activités de traitement (art. 30 RGPD)

Tenu par : **Hugo TANGUY**, entrepreneur individuel, nom commercial **Agon**, SIREN 940 221 187,
36 Chemin de Charlemagne, 33133 Galgon. Contact : l'adresse de la politique de confidentialité
(`COMPANY.contactEmail`, `src/lib/legal.ts`). Pas de délégué à la protection des données (voir
`REVUE_2026-11.md` §2.10).

Établi le 2026-11-13 par Claude (revue juridique faite à la place d'un juriste, décision d'Hugo du
13/11 ; ce n'est pas un avis d'avocat), à partir du **schéma réel de la prod**
(`supabase/tests/ci/schema.sql`, `platform.sql`), de `src/api/*` et de `supabase/functions/*`.
À relire et à dater par Hugo à chaque changement de traitement.

**Pourquoi un registre alors qu'Agon a moins de 250 salariés** : l'exemption de l'art. 30.5 ne
joue pas quand le traitement porte sur des catégories particulières de données (art. 9) ou n'est
pas occasionnel. Les deux cas s'appliquent.

Mise à jour : à chaque nouvelle table ou colonne de donnée personnelle (skill `rgpd-check`), et au
moins une fois par an.

---

## T1. Gestion des comptes et authentification

| Rubrique | Contenu |
|---|---|
| Finalité | Créer et gérer les comptes (coach, athlète, coach-athlète, staff), authentifier, rattacher un athlète à son coach, vérifier l'âge minimum. |
| Base légale | Exécution du contrat (CGU), art. 6.1.b. Vérification d'âge : art. 6.1.c (art. 8 RGPD et art. 45 loi Informatique et Libertés). |
| Personnes | Coachs, athlètes, professionnels du staff, administrateur. |
| Données | `auth.users` (e-mail, mot de passe haché, dates de connexion) ; `profiles` : `full_name`, `first_name`, `last_name`, `birth_date`, `age`, `gender`, `role`, `coach_id`, `coach_code`, `profession`, `booking_url`, `is_admin`, `is_certified_coach`, `is_pending`, `onboarded_at`, `client_build`, `client_build_at`, préférences (`home_hidden_sections`, `habit_tracker_enabled`, `coach_hidden`, `hyrox_category`, `is_hyrox_athlete`) ; `athlete_claims` (jeton de réclamation d'un compte pré-créé) ; `athlete_co_coaches` ; `staff_invitations` (e-mail du professionnel invité, métier, droits, jeton). |
| Destinataires | Coach et co-coach (profil de l'athlète) ; Supabase (sous-traitant). |
| Durée | Durée de vie du compte ; jeton de réclamation jusqu'à réclamation ou suppression par le coach ; invitation staff jusqu'à expiration (`expires_at`). Compte supprimé : effacement immédiat, sauvegardes 30 jours au plus. |
| Transferts | Supabase Inc. (société américaine, données en Irlande) : clauses types du DPA Supabase (à signer, action H2). |
| Sécurité | RLS sur toutes les tables (vérifié : 95/95 tables `public` ont la RLS), trigger `enforce_min_age_on_signup`, modification de `coach_id` seulement par RPC. |

## T2. Suivi sportif partagé avec le coach (finalité principale)

| Rubrique | Contenu |
|---|---|
| Finalité | Permettre à l'athlète d'exécuter et d'enregistrer son entraînement, et à son coach (référent et co-coach) de programmer, suivre et adapter la charge. |
| Base légale | Art. 9.2.a, **consentement explicite** « socle » (`user_consents.purpose = 'health_data'`, version `CORE_CONSENT_SINCE`) ; art. 6.1.b pour la part contractuelle. |
| Personnes | Athlètes (dont mineurs de 15 à 17 ans), coach-athlètes. |
| Données d'entraînement | `workout_logs`, `workout_rpe`, `workout_exercise_comments`, `energy_session_assignments` (`rpe_score`, `block_logs`, `notes`), `exercise_pr_logs`, `performance_logs`, `performance_notifications`, `test_sessions`, `test_results`, `athlete_test_results`, `athlete_test_values`, `hyrox_results`, `hyrox_race_plans`, `hyrox_test_analyses`, `hyrox_test_axes_drafts`, `competitions`, `macrocycles`, `mesocycles`, `microcycles`, `cycles`, `seasons`, `planning_blocks`, `day_themes`, `hr_zone_models`, `habits`, `habit_logs`, `athlete_life_events`, `athlete_profile_items`, `doc_assignments`, `doc_schedule`, `doc_comments`, `weekly_retours`, `app_data` (clés `asp:*`, modèle hérité). |
| Données de santé | `wellness_entries` (fatigue, sommeil et horaires, stress, énergie, envie, courbatures et zones, **douleur 0-10**, **malade**, note de blessure, poids) ; `weekly_reviews` (ressenti, douleur, message, bilan figé, feu) ; `body_weight_logs`, `body_weight_goals`, `body_weight_milestones` ; `profiles.height_cm`, `weight_kg`, `body_fat_pct`, `base_metabolism` ; `measurement_logs` (mensurations, **photos du corps**, bucket privé `test-media`) ; `medical_entries` (blessures : zone, type, mécanisme, douleur, impact, jours d'arrêt, **diagnostic, traitement**, `diagnosed_by`) ; `medical_history` (**pathologies, allergies, opérations, traitements en cours, notes médicales**) ; `medical_attachments` + bucket `medical` (**documents médicaux**). |
| Fichiers | Buckets privés `test-media` (photos du corps, médias de tests), `test-files`, `garmin-screenshots`, `medical`, `docs`. |
| Indicateurs calculés | Charge d'entraînement, vitesse critique, **feu du matin** (profilage au sens de l'art. 4.4, sans décision automatisée au sens de l'art. 22 : le coach décide). Recalculés à l'affichage ; le feu est figé dans `weekly_reviews.light` à l'envoi. |
| Destinataires | Coach référent et co-coach (`is_coach_of`) ; staff selon T3 ; Supabase (sous-traitant). |
| Durée | Durée de vie du compte. Suppression du compte : cascade depuis `profiles` + purge des buckets (`delete-account`, `_shared/userStorage.ts`). Coach supprimé : `SET NULL`, l'athlète garde ses plans. Déliaison : rien n'est supprimé, l'accès du coach cesse. |
| Transferts | Supabase (voir T1). |
| Sécurité | RLS par `is_coach_of` ; photos lues par URL signée de 10 min ; écritures santé par RPC ; export complet (`src/lib/dataExport.ts`). |
| Point ouvert | Hébergement HDS des données de soins (`medical_entries` diagnostic/traitement écrits par un professionnel de santé, `medical_history`, `medical_attachments`) : `REVUE_2026-11.md` risque C1. |

## T3. Accès des professionnels du staff

| Rubrique | Contenu |
|---|---|
| Finalité | Permettre aux professionnels choisis (kiné, ostéo, nutritionniste, préparateur mental, médecin, coach adjoint) d'accompagner l'athlète, dans les domaines ouverts par le coach. |
| Base légale | Art. 9.2.a, consentement explicite spécifique et facultatif (`staff_sharing`). |
| Données | `athlete_staff` (métier, droits, dates d'ajout, de notification, de retrait) ; contenus écrits par le staff dans `medical_entries`, `docs`, `doc_comments` ; lecture des domaines ouverts. |
| Destinataires | Les professionnels ajoutés, chacun responsable de son propre usage (secret professionnel pour les professions de santé, art. L.1110-4 CSP). |
| Durée | Durée de vie du compte ; un accès retiré reste comme historique, sans lecture possible. |
| Sécurité | `staff_can`, `staff_can_path`, refus sans `staff_sharing` ; liste visible par l'athlète (« Mon staff »). |

## T4. Synchronisation des montres et import de fichiers

| Rubrique | Contenu |
|---|---|
| Finalité | Récupérer les activités et mesures de santé de la montre de l'athlète (Garmin, COROS) ou de fichiers qu'il importe (FIT, TCX, GPX, archives Strava ou Garmin), et les montrer à son coach ; envoyer des séances planifiées vers la montre Garmin. |
| Base légale | Art. 9.2.a, consentement spécifique par service (`garmin_sync`, `coros_sync`), demandé à la connexion. Import manuel : accord socle (l'athlète fournit lui-même le fichier). |
| Données | `provider_connections`, `provider_tokens` (identifiants Vault, jetons jamais en clair), `provider_oauth_states`, `provider_activities` (dont `raw`), `activity_streams` (FC, vitesse, cadence, puissance, altitude, **GPS précis**, température), `activity_laps`, `activity_sets`, `activity_zone_summaries`, `activity_plan_links`, `provider_dailies` (FC de repos, **VFC**, sommeil, stress, Body Battery, SpO2, respiration, température cutanée, **tension artérielle**, composition corporelle, hydratation…), `provider_intraday`, `provider_moveiq`, `provider_raw_records` + bucket `provider-raw` (copie intégrale Garmin), `provider_webhook_inbox` (brut en attente de traitement), `provider_workout_pushes`, `provider_fit_quota`, `health_sync_errors`. |
| Destinataires | Coach et co-coach (`coach_visible` par source) ; Garmin et COROS sont **responsables indépendants** (source des données ; Agon leur envoie jetons, révocations et séances planifiées). Jamais d'IA (`data_source_policies.ai_allowed = false`). |
| Durée | Durée de vie du compte ; effacement à la déconnexion, au retrait de l'accord, au retrait d'une permission Garmin et à la suppression du compte. Boîte de réception webhook : supprimée après traitement. États OAuth : purge quotidienne (`purge-oauth-states`). |
| Transferts | Échanges avec Garmin (États-Unis) et COROS (point d'accès UE, société chinoise) à l'initiative de l'athlète ; chacun encadre ses propres transferts. |
| Point ouvert | Minimisation de la copie intégrale Garmin (types non affichés) : `REVUE_2026-11.md` risque I5. |

## T5. Analyses par intelligence artificielle

| Rubrique | Contenu |
|---|---|
| Finalité | Synthèses « Tendances » pour l'athlète (`athlete-insights`), propositions de programme au coach (`ai-program`), lecture par l'assistant Claude du coach (`coach-api`). |
| Base légale | Art. 9.2.a, consentement explicite spécifique et facultatif (`ai_programming`, version `AI_CONSENT_SINCE`), **réservé aux 18 ans et plus** (conditions Gemini et Claude ; garde-fou client livré, trigger base à appliquer, risque C2). |
| Données envoyées | Historique d'entraînement, moyennes de bien-être (fatigue, stress, sommeil, score), poids, objectifs, blessures (zones et dates) ; pour `coach-api` aussi prénom, compétitions, tests, titres d'événements de calendrier, vues `ai_provider_*` (fichiers importés seulement). Jamais : Garmin, COROS, photos, douleur et maladie du matin, bilan hebdomadaire, feu, charge, séries temporelles, GPS. |
| Destinataires | Google (API Gemini payante, sous-traitant, DPA « Products where Google is a Data Processor ») ; Anthropic via le compte personnel du coach (le coach en est responsable, Agon ne le choisit pas). |
| Durée | Pas de conservation des réponses brutes chez Agon au-delà de l'affichage ; journal des lectures `coach_api_access_log` et brouillons `coach_api_drafts` : durée de vie du compte. Chez Google (offre payante) : rétention limitée pour détection d'abus selon ses conditions. |
| Transferts | Google LLC : Data Privacy Framework + clauses types du DPA Google. |

## T6. Retours, nouveautés, roadmap

| Rubrique | Contenu |
|---|---|
| Finalité | Recevoir les retours sur l'app, savoir quelle version est utilisée, afficher les nouveautés, voter sur la roadmap. |
| Base légale | Intérêt légitime (art. 6.1.f) : améliorer et corriger le service. |
| Données | `app_feedback` (message, page, navigateur), `profiles.client_build`, `app_update_reads`, `roadmap_votes`, `citation_likes`. |
| Durée | Durée de vie du compte. |

## T7. Preuve du consentement et suppression de compte

| Rubrique | Contenu |
|---|---|
| Finalité | Prouver les consentements (art. 7.1) ; tracer qu'une suppression a eu lieu. |
| Base légale | Obligation légale (art. 6.1.c, avec art. 5.2 et 7.1). |
| Données | `user_consents` (journal append-only : finalité, oui/non, version, libellé exact, date) ; `account_deletions` (date, rôle, version, sans identifiant). |
| Durée | Journal : durée de vie du compte. `account_deletions` : sans limite (aucune donnée personnelle). |

## T8. Sécurité et journaux techniques

| Rubrique | Contenu |
|---|---|
| Finalité | Sécurité du service, détection des abus, débogage. |
| Base légale | Intérêt légitime (art. 6.1.f). |
| Données | Journaux Supabase (IP, requêtes, authentification), journaux Vercel (IP, requêtes du site), `coach_api_rate`, `coach_api_access_log`. |
| Durée | Selon les offres des prestataires (quelques jours sur les offres actuelles), 12 mois au plus. |
| Transferts | Vercel Inc. (États-Unis) : Data Privacy Framework + DPA Vercel. |

## Sous-traitants et tiers

| Tiers | Rôle | Pays | Encadrement | DPA |
|---|---|---|---|---|
| Supabase Inc. (sur AWS Irlande) | Sous-traitant : base, auth, fichiers | Données en Irlande ; société américaine | DPA Supabase avec clauses types | **À signer** (H2) |
| Vercel Inc. | Sous-traitant : distribution du site | États-Unis | DPF (certifié, vérifié le 13/11) + DPA Vercel | **À vérifier** : offre utilisée (H3) |
| Google (API Gemini payante) | Sous-traitant IA | UE / États-Unis | DPF + DPA Google | **À vérifier** : facturation active (H1) |
| Garmin, COROS | Responsables indépendants | États-Unis / Chine (point d'accès UE) | Leurs propres conditions | Accords développeur |
| Anthropic (assistant du coach) | Ni sous-traitant ni choisi par Agon | États-Unis | Compte personnel du coach | Aucun |
| YouTube (vidéos d'exercices, mode `youtube-nocookie`), Google Fonts, Calendly (prise de rendez-vous du coach) | Contenus tiers chargés par le navigateur | États-Unis | Conditions de chaque service | Aucun |
| Strava | Aucun lien : import de fichiers par l'athlète, pas d'API | — | — | — |
