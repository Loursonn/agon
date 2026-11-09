# Prompt pour Titouan — Garmin : toutes les données santé + l'historique

> À coller tel quel dans Claude Code, sur la branche `dev` à jour.

---

Objectif d'Hugo : **tout ce que Garmin sait d'un athlète doit pouvoir être lu dans Agon** — sommeil, VFC, fréquence cardiaque au repos et toutes les autres données santé, au fil de l'eau **et** pour le passé (avant la connexion). Les coachs et les athlètes doivent le voir à l'écran.

Avant de coder quoi que ce soit, lis : `CLAUDE.md`, `docs/integrations/GARMIN_DOSSIER.md` (surtout « Mise en service » et « Vérifié dans la doc du portail »), les entrées 2026-10 et 2026-11 de `docs/DECISIONS.md` sur Garmin, et les skills `integration-provider`, `nouvelle-fonctionnalite`, `migration-bdd`, `rgpd-check`, `release-notes`. Règle du projet : **95 % de confiance avant de modifier** — pose tes questions à Hugo d'abord (liste plus bas).

## Où on en est (09/11/2026)

- App Garmin « Agon » **approuvée** (palier Starter : push uniquement, **aucun historique** par l'API, 1 000 utilisateurs max). Secrets posés, fonctions déployées, compte Garmin d'Hugo connecté (`provider_connections` : `active`, permissions `ACTIVITY_EXPORT`, `HEALTH_EXPORT`, `WORKOUT_IMPORT`).
- Réception : `provider-garmin-webhook` écrit chaque entrée dans `provider_webhook_inbox`, puis `_shared/providers/garminIngest.ts` traite. Mapping dans `_shared/providers/garmin.ts`.
- Types traités aujourd'hui : `activities`, `manuallyUpdatedActivities`, `activityDetails`, `dailies`, `sleeps`, `hrv`, `deregistrations`, `userPermissionsChange`. **Tout autre type est ignoré.**
- `provider_dailies` (une ligne par athlète × source × jour, fusion par `provider_daily_merge`, `raw` rangé par type) a les colonnes : `resting_hr, hrv_ms, sleep_total_min, sleep_deep_min, sleep_rem_min, sleep_score, steps, stress_avg, body_battery_min, body_battery_max, vo2max, training_load`. Seules les 8 premières sont remplies ; `body_battery_*`, `vo2max`, `training_load` restent vides.
- **Aucun écran ne lit `provider_dailies`** (seuls l'export RGPD et la déconnexion y touchent). C'est le premier trou visible.
- Import de fichiers (`useActivityFileImport`, `_shared/activityFiles/`) : lit `.fit/.tcx/.gpx`, `.gz`, et un zip à plat (export Strava). **Ne lit pas les zips imbriqués** ni aucun fichier santé.

## Accès à la doc Garmin

Doc officielle (PDF confidentiels, **ne jamais les committer**) sur https://developerportal.garmin.com → Documentation : Health API 2.1, Activity API 2.1, OAuth2 PKCE 2.0, Start Guide 2.0. Garmin impose que chaque développeur soit **membre vérifié** du compte : Hugo doit t'ajouter (portail → nom de la company → *Members*) avant que tu les consultes. Les noms de champs ci-dessous viennent de la Health API 2.1 ; revérifie chacun dans le PDF.

## Lot 1 — Recevoir toutes les données santé en direct

1. **Types à ajouter** au traitement (clés de notification, Health API 2.1 §4.1) :
   - `stressDetails` → `body_battery_min/max` calculés depuis `timeOffsetBodyBatteryValues` (les `dailies` n'ont que `bodyBatteryChargedValue/DrainedValue` — à garder aussi).
   - `userMetrics` → `vo2max` (`vo2Max`, `vo2MaxCycling`), âge fitness si présent.
   - `bodyComps` → poids, % de masse grasse, IMC, masse musculaire/osseuse, hydratation.
   - `pulseox` → SpO2 moyenne/mini de la nuit.
   - `allDayRespiration` → fréquence respiratoire moyenne.
   - `skinTemp` → écart de température cutanée.
   - `healthSnapshot`, `bloodPressures` → valeurs du relevé.
   - `hrv` : garder aussi `lastNight5MinHigh` et le détail utile (aujourd'hui seul `lastNightAvg`).
   - `sleeps` : ajouter `lightSleepDurationInSeconds`, `awakeDurationInSeconds`, et ce que contient `sleepScores`.
   - `dailies` : ajouter calories actives/totales, minutes d'intensité, distance, FC min/max, `bodyBatteryChargedValue/DrainedValue`.
   - `epochs`, `nutrition`, `hydration`, `breathingVariations` : propose à Hugo s'ils valent le coût (volumineux / peu utiles au coach) avant de les brancher.
2. **Schéma** : migration additive (skill `migration-bdd`, jamais `db push`, test à blanc `BEGIN … ROLLBACK`, demander à Hugo avant d'appliquer). Colonnes typées pour ce qui sera affiché ; le reste reste dans `raw` par type. Revoir la contrainte de `provider_daily_merge` sur les types acceptés. Régénérer `types.ts`.
3. **Mapping** : une fonction par type dans `garmin.ts`, une mesure absente = `null`, jamais 0 ; valeurs sentinelles Garmin (−1/−2 stress, etc.) → `null`. Tests Vitest avec des exemples tirés du PDF (`_shared/__tests__/garmin.test.ts`).
4. **Permission** : tous ces types relèvent de `HEALTH_EXPORT` (`permissionFor`) — un retrait de permission doit toujours supprimer ces données.
5. **À dire à Hugo** : il doit cocher ces nouveaux types dans API Tools (mode push, même URL de webhook). Donne-lui la liste exacte.

## Lot 2 — Afficher

1. Couche `src/api/` : `providerDailies` (ou extension de `providers.ts`) — lecture par athlète et plage de jours, clés `['providerDailies', athleteId, …]`, `invalidate…`. Lève en cas d'erreur.
2. **Athlète** : une vue « Santé » (jour + tendance 7/28 j) : sommeil (durée, phases, score), VFC, FC repos, body battery, stress, pas, SpO2, respiration, poids/composition, VO2max.
3. **Coach** : sur la fiche athlète et la vue de suivi, les mêmes mesures **à côté du wellness déclaré** — c'est la promesse faite à Garmin : repérer l'écart entre ressenti et mesure (ex. « se dit en forme, FC repos +6 depuis 4 jours »).
4. Règles d'affichage : chaque chiffre nomme sa source (« Garmin » / « Garmin [appareil] », « Import de fichier ») ; absent = « — » ; visibilité coach gouvernée par le consentement `garmin_sync` (RLS existante, ne pas contourner) ; co-coach via `is_coach_of`.
5. Données Garmin **jamais envoyées à l'IA** (`ai_allowed=false`, déjà imposé par trigger) : vérifier qu'aucune nouvelle vue/requête IA ne les reprend.

## Lot 3 — L'historique (tout ce qu'il a fait avant)

L'API Starter ne donne **rien** d'antérieur à la connexion. La seule voie : l'export de compte Garmin (garmin.com → compte → *Gestion des données* → *Exporter vos données*, lien reçu par e-mail).

1. **Demander à Hugo son propre export** et en lire la structure réelle avant de coder (anonymiser tout fichier gardé en test). De mémoire — **à vérifier** — : `DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_*.zip` (les `.fit` des activités, dans des zips imbriqués), `DI_CONNECT/DI-Connect-Wellness/*sleepData*.json`, `DI_CONNECT/DI-Connect-Aggregator/UDSFile_*.json` (résumés quotidiens : FC repos, pas, stress, body battery), `DI_CONNECT/DI-Connect-Metrics/*` (VO2max…), fichiers de poids/biométrie, VFC.
2. **Activités** : faire lire les zips imbriqués à `parseActivityArchive` (récursif, profondeur bornée, mêmes limites de taille ; lecture par morceaux, l'export pèse des centaines de Mo). Doublons refusés (même sport, ±2 min) contre les activités Garmin push et COROS.
3. **Santé** : nouveau décodeur pur dans `_shared/` (testé) pour les JSON santé de l'export → mêmes champs que `provider_dailies`. Écriture via une RPC atomique (pas de « relire, modifier, réécrire »), avec `source = 'file_import'`, sans écraser un jour déjà reçu par push (règle de priorité à valider avec Hugo).
4. **Écran** : dans « Montres connectées », sous Garmin : « Récupérer mon historique » avec les étapes d'export Garmin et le dépôt du zip, progression, bilan (X activités, Y jours de santé, Z doublons ignorés).
5. RGPD (skill `rgpd-check`) : export et suppression de compte couvrent les nouvelles données.

## Questions à poser à Hugo avant de coder

1. Quels types du Lot 1 brancher (`epochs`, `nutrition`, `hydration`, `breathingVariations` compris ou non) ?
2. Santé importée depuis l'export : `source = 'file_import'` (donc éligible à l'IA comme les autres fichiers importés) ou une source dédiée exclue de l'IA comme `garmin` ?
3. Un même jour présent en push et dans l'export : lequel l'emporte ?
4. Où placer la vue « Santé » côté athlète et côté coach (maquette Claude Design Agon ?) ?
5. Poids Garmin : doit-il alimenter le suivi de poids existant d'Agon ou rester affiché à part ?

## Livraison

Un lot = un commit (`feat(garmin): …`), `npm run check` vert, entrée « Nouveautés » (`kind: "feature"`) pour chaque lot visible, `GARMIN_DOSSIER.md` et `DECISIONS.md` mis à jour. Edge Functions redéployées depuis le bon dossier (skill `edge-function`) ; migrations appliquées seulement avec l'accord d'Hugo.
