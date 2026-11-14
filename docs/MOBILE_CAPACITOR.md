# Apps iOS et Android (Capacitor)

Décision : `docs/DECISIONS.md`, « L'app mobile sera faite avec Capacitor » (2026-11-07).
Cible stores : janvier-février 2027. Tâche roadmap : P11.

L'app native est **le build web (`dist/`) empaqueté tel quel** dans une WebView.
Même code, mêmes routes, même base Supabase. Pas de code natif métier.

| | |
|---|---|
| appId (iOS bundle id / Android package) | `com.agontraining.app` — **définitif** une fois publié (choisi par Hugo le 2026-11-12) |
| Nom affiché | Agon |
| Capacitor | 8.6 (`@capacitor/core`, `ios`, `android`, `cli`) + plugins `@capacitor/app`, `@capacitor/browser` |
| iOS minimum | 15.0 — dépendances natives par Swift Package Manager (pas de CocoaPods) |
| Android | minSdk 24, targetSdk 36 |
| Origine de la WebView | iOS `capacitor://localhost`, Android `https://localhost` |

## Fichiers

- `capacitor.config.ts` : appId, nom, `webDir: "dist"`, couleur de fond.
  **Ne jamais changer `androidScheme`** : l'origine change, ce qui efface la session
  et les saisies hors ligne en attente sur tous les téléphones.
- `ios/` et `android/` : projets Xcode et Android Studio, suivis dans git.
  Les copies du build web (`ios/App/App/public`, `android/app/src/main/assets/public`)
  et les builds sont ignorés (`.gitignore` de chaque dossier). Le `.gitignore` racine
  refuse toute clé de signature (`*.jks`, `*.keystore`, `*.p12`, `*.p8`, profils…).
- `src/lib/native.ts` (appelé une fois dans `src/main.tsx`, sans effet sur le web) :
  - `appUrlOpen` : un lien `https://agon-training.com/...` ouvert par le système
    (lien universel / App Link) est routé dans l'app ; tout autre hôte est ignoré ;
  - bouton retour Android : page précédente, sinon sortie de l'app ;
  - `publicWebOrigin()` : origine à mettre dans un lien partagé (mot de passe oublié,
    réclamation, invitation staff) ;
  - `openAuthorization()` : autorisation COROS / Garmin dans une fenêtre in-app
    (`@capacitor/browser`), fermée au retour par lien universel ; à sa fermeture, les
    lectures sont relancées (connexion de la montre à jour).
- `public/.well-known/apple-app-site-association` et `assetlinks.json` : liens universels
  et App Links, servis en `application/json` (`vercel.json`). **Valeurs à remplacer** :
  `APPLE_TEAM_ID` (compte Apple) et `PLAY_APP_SIGNING_SHA256` (Play Console → Intégrité
  de l'app). Tant qu'elles restent, les liens s'ouvrent dans le navigateur, sans erreur.
- `assets/` : sources des icônes et de l'écran de lancement, tirées de `public/brand`
  (`agon-app-icon.svg`, `agon-symbole-or-poli.svg` sur fond `#0E0C0A`). Regénérer :
  `./node_modules/.bin/capacitor-assets generate --ios --android --iconBackgroundColor '#C9A14A'
  --iconBackgroundColorDark '#C9A14A' --splashBackgroundColor '#0E0C0A' --splashBackgroundColorDark '#0E0C0A'`.
- `src/lib/pwa.ts` (déjà là) : pas de service worker dans l'app native (les fichiers
  sont dans le paquet, mis à jour par le store).

## Commandes

```bash
npm run cap:sync      # build Vite (avec .env) + copie dans ios/ et android/ + plugins
npm run cap:ios       # cap:sync puis ouvre Xcode
npm run cap:android   # cap:sync puis ouvre Android Studio
```

Le build lit `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) : le paquet
pointe vers la base de prod, comme le site.

### Tests natifs dans la CI (pas de Xcode sur le Mac)

Hugo n'installe pas Xcode : les apps sont construites et lancées par GitHub Actions,
`.github/workflows/mobile.yml` (lancement à la main, ou à chaque changement de `ios/`,
`android/`, `capacitor.config.ts`) :
- **iOS** (`macos-latest`) : build simulateur sans signature, installation, lancement,
  capture de l'écran de connexion ;
- **Android** (`ubuntu-latest`, JDK 21) : APK debug, émulateur
  (`reactivecircus/android-emulator-runner`, API 34), lancement, capture ;
- captures et APK en **artefacts du run** (Actions → run → Artifacts). Aucun secret :
  le build web prend les valeurs factices de `src/integrations/supabase/client.ts`, donc
  l'app ne parle pas à la base de prod (l'écran de connexion s'affiche, rien de plus).

**Signature iOS plus tard, dans la CI, par Fastlane** (`match` pour les certificats et
profils, `gym` pour l'archive, `pilot` pour TestFlight), avec les secrets du compte Apple
dans les secrets GitHub, jamais dans le repo. Même principe pour Android (`supply`, clé
d'envoi en secret GitHub). Les sections « Signer et publier » ci-dessous décrivent la voie
manuelle, à n'utiliser que si un Mac avec Xcode est disponible.

### Prérequis sur un Mac (facultatif depuis le 2026-11-13 : la CI les remplace)

- **iOS** : Xcode complet depuis l'App Store (seuls les Command Line Tools sont installés),
  puis `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` et
  `xcodebuild -runFirstLaunch`. Simulateur : Xcode → Product → Run.
- **Android** : Android Studio (SDK + émulateur) et **JDK 21** (la machine a Java 11,
  trop ancien pour Gradle / Capacitor 8). Android Studio fournit son propre JDK.

## Ce qui a été vérifié, ce qui ne l'a pas été

Vérifié (code, sans simulateur) :
- Auth Supabase : session dans `localStorage` de la WebView, gardée entre deux lancements ;
  Supabase et toutes les Edge Functions répondent à toute origine (CORS `*`).
- Service worker désactivé en natif (`shouldRegisterServiceWorker`, testé).
- Hors ligne : IndexedDB et la file d'écritures (`src/lib/offline/`) marchent dans
  WKWebView et la WebView Android sans changement ; origine fixe, donc données gardées.
- `version.json` est dans le paquet : la vérification de nouvelle version compare le
  bundle à lui-même et ne propose jamais de recharger (c'est le store qui met à jour).

**Pas vérifié** : aucun lancement en simulateur (pas de Xcode ni de SDK Android sur la
machine). À faire dès qu'ils sont installés, avec **Léa Démo** uniquement
(`scripts/seed-demo.mjs`) : démarrage, connexion, session après redémarrage, saisie hors
ligne puis retour réseau, bouton retour Android, zones sûres (encoche, barre du bas).

## Reste à faire avant les stores

### Liens (invitation, réclamation, mot de passe, montres)

1. ~~**Liens générés dans l'app**~~ (fait le 2026-11-13) : `publicWebOrigin()` dans
   `Login.tsx` (mot de passe oublié), `useAthleteClaimLink.ts` (`/claim/…`) et
   `staffPermissions.ts` (`/staff-invite/…`). Les liens `/invite/…` n'existent plus
   (décision 6).
2. **Liens universels iOS / App Links Android** (pour qu'un lien reçu par mail ouvre l'app).
   Fichiers publiés le 2026-11-13 avec des valeurs à remplacer (voir « Fichiers ») ; restent
   le Team ID, l'empreinte Play et la capacité Associated Domains (ajoutée au moment de la
   signature, par Fastlane ou Xcode) :
   - publier `https://agon-training.com/.well-known/apple-app-site-association`
     (`applinks`, `appID` = `<TEAM_ID>.com.agontraining.app`, chemins `*`) — Team ID
     connu une fois le compte Apple créé ; servir en `application/json` (règle Vercel) ;
   - Xcode → Signing & Capabilities → Associated Domains : `applinks:agon-training.com` ;
   - publier `https://agon-training.com/.well-known/assetlinks.json` avec l'empreinte
     SHA-256 de la clé de signature Play (Play Console → Intégrité de l'app).
     L'`intent-filter autoVerify` est déjà dans `AndroidManifest.xml`.
   - Le service worker exclut déjà `/.well-known/` de son fallback.
3. **Retour OAuth COROS / Garmin** — fait le 2026-11-13 (`openAuthorization`, fenêtre
   in-app ; sans lien universel, l'athlète ferme la fenêtre et la connexion se relit) : `window.location.assign(authorizeUrl)` quitte la
   WebView et ouvre le navigateur du système ; le callback renvoie vers
   `APP_URL/athlete/profil` (site web). La connexion est bien enregistrée côté serveur
   (le `state` est stocké en base), mais l'athlète finit dans le navigateur. Avec les
   liens universels (point 2) le retour peut rouvrir l'app ; plus propre : ouvrir
   l'autorisation avec `@capacitor/browser` (fenêtre in-app) et la fermer sur
   `appUrlOpen`. Ne jamais accepter une URL de retour venant du client (redirection
   ouverte, voir `provider-coros-callback`).
4. **Supabase Auth** : ajouter `https://agon-training.com/**` aux Redirect URLs si ce
   n'est pas déjà le cas (Dashboard → Authentication → URL Configuration).

### Apparence

- ~~Icônes et écran de lancement~~ : faits le 2026-11-13 depuis `public/brand` (`assets/`).
- Zones sûres : `index.html` n'a pas `viewport-fit=cover`, la WebView reste donc sous la
  barre d'état et au-dessus de l'indicateur d'accueil. À revoir avec la refonte des
  écrans (P43) si on veut un rendu bord à bord.
- Barre d'état : `@capacitor/status-bar` si le texte clair sur fond sombre ne suit pas.

### Comptes et publication (Hugo)

1. **Apple Developer Program** : 99 $/an, compte « Individual » ou « Organization »
   (organisation = numéro D-U-N-S, plusieurs jours). Puis App Store Connect → nouvelle
   app, bundle id `com.agontraining.app`.
2. **Google Play Console** : 25 $ une fois, vérification d'identité. **Compte personnel
   récent : test fermé obligatoire avec au moins 12 testeurs inscrits pendant 14 jours
   d'affilée avant de pouvoir publier en production.** Prévoir la liste (athlètes et
   coachs volontaires) dès la création du compte : au plus tard mi-décembre pour une
   sortie fin janvier.
3. Fiches stores : URL de suppression de compte (P12), compte démo pour les
   relecteurs (P13), « App Privacy » Apple et « Sécurité des données » Google (P14),
   politique de confidentialité (`/confidentialite`), captures avec Léa Démo.
4. Apple refuse les apps « simple site web » (règle 4.2) : mettre en avant le hors
   ligne, la saisie en salle, et à terme notifications / Santé (HealthKit,
   Health Connect).

### Signer et publier

**iOS** : Xcode → target App → Signing & Capabilities → équipe Apple, « Automatically
manage signing ». Product → Archive → Distribute App → App Store Connect. TestFlight
pour les tests, puis soumission. Le numéro de version (`MARKETING_VERSION`) et le build
(`CURRENT_PROJECT_VERSION`) se changent dans Xcode à chaque envoi.

**Android** : Android Studio → Build → Generate Signed App Bundle → créer une clé
d'envoi (`.jks`) **hors du repo**, sauvegardée dans un gestionnaire de mots de passe
(perdue = plus de mise à jour possible sans procédure Google). Activer « Play App
Signing ». Envoyer l'`.aab` en test interne, puis test fermé (12 × 14 jours), puis
production. `versionCode` / `versionName` dans `android/app/build.gradle`, à
incrémenter à chaque envoi.

Jamais de clé, mot de passe de keystore ou fichier `.p8` / `.p12` dans git.
