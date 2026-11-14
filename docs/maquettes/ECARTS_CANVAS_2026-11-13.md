# Écarts canvas ↔ code — planches restantes (2026-11-13)

Canvas : https://claude.ai/artifact/NGPdJXa1TCp7N2hGTVoQhN (`project/<Planche>.dc.html`).
Planches comparées : accès (connexion, pages simples), athlète téléphone (onboarding, événement, saisir un test, séance spécifique, montres, zones, santé, analyse HYROX), coach téléphone (Tests, Fiches, Banque, Santé, Plus), coach ordinateur (Santé, éditeur énergie, Avis, Nouveautés, Paramètres, espace staff, analyse et évolution HYROX).

Classement :
- **A — à corriger front** : faisable sans nouvelle donnée ni fonction serveur. Corrigé dans ce lot sauf mention « non fait » en fin de fichier.
- **B — hors périmètre** : demande une donnée, une colonne, une fonction serveur ou un choix produit (dit lequel).
- **C — volontaire** : le code fait mieux, donnée de démo, ou retrait voulu (ex. données médicales retirées le 13/11, mot de passe 8 caractères).

Les lignes A marquées « conforme » ou « rien à faire » n'appellent pas de correction.


## AccesConnexion → `src/pages/Login.tsx` + `src/pages/auth/AuthUi.tsx` + `src/components/ConsentGate.tsx` (routes `/login`, barrière avant l'app)
- C · Connexion, mot de passe oublié, rôle, code coach (vérifié dès le 6ᵉ caractère, coach trouvé), compte, e-mail à confirmer : textes, ordre et états déjà alignés sur la planche (`Login.tsx:131-304`).
- C · « 6 caractères minimum » (maquette) vs « 8 caractères minimum » (`Login.tsx:282`) : le code suit la décision H10 du 13/11 (8 caractères).
- C · Placeholder e-mail `ton@email.fr` au lieu de `lea.demo@exemple.fr` : donnée de démo.
- C · Étape rôle : le code ajoute « Déjà un compte ? Me connecter » et les onglets en haut (`Login.tsx:210,217`), absents de la maquette : utile, sans importance.
- B · Carte « Coach trouvé » sans la ligne « Préparateur physique · HYROX » (`Login.tsx:249-258`) → `coachPreviewByCode` ne renvoie que le nom : il manque une colonne spécialité/titre sur `profiles` (+ champ à renseigner par le coach) et à exposer par la RPC.
- B · Arrivée par lien d'invitation = étape code sautée : aucun lien d'invitation coach n'existe plus (`/invite/:token` redirige vers `/login`, décision 6 du 13/11). Seul `/claim/:token` subsiste (voir AccesPagesSimples).
- C · ConsentGate (`ConsentGate.tsx:143-282`) : libellés de cases longs et détail de chaque accord (texte juridique complet, art. 9 RGPD), là où la maquette montre des phrases courtes + « En savoir plus » ; le code est volontairement plus complet.
- C · ConsentGate : bouton « Refuser et me déconnecter » (`ConsentGate.tsx:262`), absent de la maquette, requis (art. 7.3 RGPD).
- C · ConsentGate : contenu centré verticalement (`Centered`, `ConsentGate.tsx:24`) au lieu du bouton collé en bas comme `AuthScreen` : l'écran sert aussi aux coachs sur ordinateur.
- C · Accord IA masqué pour les moins de 18 ans, accord staff ajouté : règles produit/RGPD absentes de la maquette.

## AccesPagesSimples → `src/pages/ResetPassword.tsx` (`/reset-password`), `src/pages/ClaimAthlete.tsx` (`/claim/:token`), `src/pages/legal/*` (`/cgu`, `/confidentialite`, `/mentions-legales`), `src/pages/NotFound.tsx` (`*`)
- C · Nouveau mot de passe : alignée (AuthScreen, erreur rouge sous « Confirmer », e-mail dans le texte) ; 8 caractères au lieu de 6 (décision H10) ; écran « Mot de passe modifié » en plus.
- A · Invitation : la page n'utilise pas les briques d'accès (fond noir, `Card` shadcn, `h1` « Agon ») → refaire avec `AuthScreen` / `AuthLogo` / `AuthTitle` / `AuthField` / `AuthButton` (`ClaimAthlete.tsx:52-137`).
- A · Titre « Ton coach t'a préparé ton espace » / « Activer mon compte » → titre « {coach_name} t'invite » + texte « Crée ton compte athlète pour recevoir tes séances. » (`coach_name` déjà dans `ClaimInfo`) (`ClaimAthlete.tsx:57,76-79`).
- A · Carte coach (rond d'initiales + nom) absente → l'ajouter avec `initials(info.coach_name)` comme dans `Login.tsx:249-258` (`ClaimAthlete.tsx:~82`).
- A · Champs « Prénom » / « Nom » séparés en lecture seule + champ « Code coach » en lecture seule : la maquette n'a qu'un « Prénom et nom » et pas de code (« pas de code à saisir ») → fusionner en un champ lecture seule `first_name last_name` et retirer « Code coach » (`ClaimAthlete.tsx:83-96`).
- A · Aide « 8 caractères minimum. » absente sous le mot de passe → ajouter un `hint` (`ClaimAthlete.tsx:106-109`).
- A · Message « Les mots de passe ne correspondent pas » → « Les deux mots de passe ne sont pas identiques. » et l'afficher sous le champ « Confirmer » en rouge (`ClaimAthlete.tsx:37-40`).
- A · Lien « Déjà un compte ? Me connecter » absent → l'ajouter sous le bouton (`ClaimAthlete.tsx:~130`). Bouton « Activer mon compte » → « Créer mon compte » (libellé maquette ; au choix).
- B · Ligne « Préparateur physique · HYROX » sous le nom du coach → même manque que ci-dessus (spécialité du coach non stockée).
- B · Le flux « invitation » de la maquette crée le compte de zéro (nom + date + e-mail) pour un coach connu ; le code n'a plus que le compte pré-créé par le coach (`/claim`), les invitations coach étant supprimées (décision 6). Choix produit à confirmer si on veut ce lien.
- C · Légal : onglets CGU / Confidentialité / Mentions, sommaire (6 puis « + N autres sections »), encart « Agon n'est pas un dispositif médical », en-tête logo : présents (`LegalLayout.tsx:149-253`, `Terms.tsx:24`).
- C · « MISES À JOUR LE 30 OCT. 2026 » → code « Version X · en vigueur depuis le … » (`LegalLayout.tsx:219`) : équivalent.
- A · Sommaire : « 4 bis. Professionnels du staff » garde son numéro dans le libellé (la regex ne retire que `4.`) et les numéros du sommaire (1…) se décalent par rapport aux titres des sections (« 5. Génération » listée 6) → n'enlever que le préfixe et afficher le numéro propre de la section (regex `^\d+( bis)?\.\s*` et numéro extrait du titre) (`LegalLayout.tsx:156,168`).
- A · `LegalLayout.tsx:22-33` : objet `S` en hex en dur au lieu des tokens `C` de `src/lib/theme.ts` → utiliser `C` (style, sans effet visible).
- C · 404 : alignée (`NotFound.tsx`).

## Ath1Onboarding → `src/features/athlete/components/AthleteOnboarding.tsx` (+ `components/today/TodayTips.tsx`, `lib/onboarding.ts`), affiché par `TodayPage.tsx` (`/athlete`)
- C · Bienvenue (3 points, « Passer », « Commencer »), premier wellness 3 lignes, points de pagination : alignés mot pour mot (`AthleteOnboarding.tsx:129-210`).
- C · Écran 3 : un seul « Valider » (la maquette le montre en double pour annoter).
- A · Écran montre : les cartes `ProviderCards` affichent une pastille « GRM » / « CRS » et pas la ligne « Via ton compte Garmin Connect » / « Via ton compte COROS » → ajouter ce sous-titre sous `PROVIDER_LABEL[p]` (`ConnectedServicesSection.tsx:192`).
- C · Bouton « Lier » (maquette) vs « Connecter mon compte Garmin / COROS » après accord (`ConnectedServicesSection.tsx:702,790`) : le code passe par l'accord de partage, voulu.
- C · Bulles d'aide : 3 astuces, « Passer », halo or, « Compris » à la dernière au lieu de « Suivant » (`TodayTips.tsx:65`) ; « Ton programme » / « Tes tests » : textes propres au code.

## Ath1Evenement → `src/features/athlete/components/EventFormPage.tsx` (ouvert depuis `TodayPage.tsx:1124,1416,1639`)
- C · Formulaire compétition (Nom, Type, Date + « + Date de fin », Priorité A/B/C + ligne d'explication, Lieu, « Visible par … ») et variante voyage (Du / Au, « Indisponible pour m'entraîner », « Pas de priorité hors compétition ») : conformes (`EventFormPage.tsx:139-261`).
- C · Aujourd'hui : « Mes événements » avec badge « Nouveau », « 22 NOV. · COMPÉTITION B », « Prochaine compétition » « Importance B », ligne « Puis … J-27 · A », « Toutes (n) » : présents (`TodayPage.tsx:1120-1160,1412-1465`, `lib/athleteEvents.ts:42`).
- C · Toast « Événement ajouté · {coach} le voit sur ton planning » (`EventFormPage.tsx:95`) au lieu de « {coach} est prévenu » : aucune notification n'est envoyée au coach, le texte du code est exact.
- C · Type « Compétition » masqué quand l'athlète n'a pas de coach (`EventFormPage.tsx:154`) : garde-fou (colonne `coach_id` obligatoire).
- C · Couleurs : compétition `ROUGE`, autres types `TYPE_COLOR.hyrox` (orange) comme demandé.

## Ath1SaisirTest → `src/features/athlete/components/TestEntryPage.tsx` (ouvert depuis `TodayPage.tsx:1617`, `ProgramPage.tsx:1239`, `CoachPhoneTests.tsx:49`)
- C · Saisie VMA (en-tête « Test prévu » + date, titre, pastille catégorie, « Prévu par … · km/h · plus haut = mieux », Protocole, valeur, record, date, ressenti, commentaire, « Valider le résultat ») : alignée (`TestEntryPage.tsx:382-475`).
- C · Confirmation : « Résultat enregistré », « Nouveau record » en vert, écart « vs date », « Tes allures de course sont recalculées sur … km/h » (VMA seulement), « Voir le détail du test » / « Retour à Aujourd'hui » (`TestEntryPage.tsx:330-375`) ; « {coach} voit ton résultat » au lieu de « est prévenu » : même raison que le toast événement.
- C · Quatre formats de valeur (nombre virgule, allure, durée avec case « h », échelle 1-5) : tous gérés (`ValueInput`, `TestEntryPage.tsx:89-163`).
- B · Ligne « Protocole · VAMEVAL » : le code n'affiche que « Protocole » (`TestEntryPage.tsx:405`) → `test_definitions.protocol` n'est qu'un texte `{ text }` (`features/shared/types/tests.ts:48`), pas de nom de protocole séparé.
- B · Variante compacte « Remplir → » en feuille sur Aujourd'hui (2 valeurs côte à côte, commentaire et date repliés) : le code ouvre toujours la page plein écran, 2 valeurs en grille 2 colonnes (`TestEntryPage.tsx:427`) ; à décider si on construit la feuille (composant nouveau, choix produit).
- B · « Record : 95 kg × 1 · 4 nov. » (record du couple charge × reps) : le code montre un record par variable (`recordText`, `TestEntryPage.tsx:165`) ; un record combiné demande une règle de comparaison (e-1RM) qui n'existe pas.
- C · Libellé « Ta valeur · VMA » au lieu de « Ta VMA » (`TestEntryPage.tsx:422`) : générique pour tout test.
- C · Détail du test après saisie : hors de cette planche (planche « Tests · détail »).

## Ath2SeanceSpecifique → `src/features/athlete/pages/SpecificExecutionPage.tsx` + `components/specific/ExecutionCard.tsx`, `ClassiqueBlockExecution.tsx` (route `/athlete/specific/:assignmentId`)
- A · Format classique en cours : l'en-tête affiche « Bloc 2 / 4 » sans le préfixe de la séance (maquette « HYROX · Bloc 2 / 4 ») → préfixer par le type de séance (ex. `session.type`/« HYROX » si la séance est HYROX, sinon « Spécifique ») (`SpecificExecutionPage.tsx:304`)
- A · Maquette : sous le titre, sous-titre « HYROX Format classique » puis « Stations techniques » ; le code n'a que les pastilles Spécifique / n blocs / n éléments / durée → ajouter une ligne « <type> Format classique » si le format est classique (`SpecificExecutionPage.tsx:235-246`)
- C · Minuteur plein écran effort (orange) / récup (bleu), tour n/N, exercice n/N, picto station, « Ensuite », « Ce tour », Passer / Terminer, EMOM « Minute 7 / 12 » : déjà conformes (`ExecutionCard.tsx`)
- C · Récup : « Prochain exercice », « Puis » présents ; fin de séance avec retour athlète présent (`SessionEndForm`)
- C · Blocs classiques cochables (tout le bloc ou élément), bouton « Minuteur » sur bloc WOD, légende « Coche tout le bloc… » : conformes (`ClassiqueBlockExecution.tsx`)
- C · Annotation « Fin des 40 s » de la maquette = note de design, pas d'élément d'interface
- C · Le code ajoute aperçu avant départ, note coach, fiches, schéma, saisie des km courus : plus complet que la maquette

## Ath2Montres → `src/features/athlete/pages/AthleteMontresPage.tsx` (route `/athlete/montres`)
- A · Carte Garmin connectée : « Connecté le 3 nov. 2026 · dernière donnée reçue le … » (date) au lieu de « Dernière synchro il y a 5 min » → afficher une durée relative (« il y a 5 min », « hier ») calculée à partir de `connection.lastSyncAt` (`ConnectedServicesSection.tsx:724-728`, Coros `:384`)
- A · Carte Garmin : badge « Connectée » vert à droite du nom, et ligne « Activités, sommeil, VFC, FC de repos, stress. » (ce que la montre envoie) absents → ajouter la phrase fixe sous l'état quand `status === "active"` (`ConnectedServicesSection.tsx:719-735`)
- A · COROS non connectée : maquette = une ligne « Non connectée » + bouton « Connecter » dans la carte ; le code affiche le texte long + case de consentement + bouton « Connecter mon compte COROS » → c'est le consentement RGPD demandé au moment utile : garder, mais raccourcir en « Connecter » si la case est déjà acceptée (`ConnectedServicesSection.tsx:440-480`)
- A · Import, écran 1 : choix de la provenance en deux boutons « Strava / archive .zip » et « Garmin / export .zip », avec lien « Comment récupérer mon archive Strava › » → ajouter deux boutons de choix au-dessus de la zone de dépôt qui ouvrent le tuto correspondant (`AthleteMontresPage.tsx:55-63`, `ActivityFileImport.tsx:142`)
- A · Import en cours : maquette = nom du fichier, taille, source, pourcentage (64 %), « Lecture des sorties… 242 / 379 » + bouton « Annuler l'import » ; code = barre fine + « Lecture 242/379 · <date> », sans pourcentage ni bouton annuler → afficher le pourcentage et le libellé « Lecture des sorties… » (`ActivityFileImport.tsx:194-219`)
- A · Rapport d'import : maquette = titre « Import terminé », « 379 sorties lues », trois chiffres (312 nouvelles / 41 complétées / 26 déjà complètes) avec une phrase chacun, bandeau « Aucun fichier refusé », bouton « Terminé » ; code = une seule ligne de texte `reportSummary` → remplacer `Rapport` par trois blocs chiffrés à partir de `report.created / merged / unchanged / rejected` qui existent déjà (`ActivityFileImport.tsx:229-256`)
- A · Phrase « Aucune sortie en double : une même sortie venue de Strava et de ta montre n'apparaît qu'une fois » et « Ces sorties portent la source Import Strava. <coach> les voit dans ton planning. » absentes du rapport → les ajouter (le nom du coach est déjà dans la page) (`ActivityFileImport.tsx:229`)
- B · Boutons « Synchroniser » et « Déconnecter » côte à côte sur la carte Garmin, et nom du modèle (« Garmin Forerunner 265 ») dans la carte : Garmin pousse ses données par webhook, il n'existe pas de synchro manuelle Garmin ; le modèle vient de `provider_activities.device_name` (déjà lu dans `api/health.ts`) mais pas exposé par `useProviderConnections` → à décider (afficher le modèle = lecture seule faisable, bouton synchro = fonction serveur absente)
- B · Case « Partager avec <coach> » comme interrupteur d'accord : la page affiche seulement un texte ; l'accord existe dans `useConsents` (`garmin_sync`) mais la maquette ne montre pas d'interrupteur, à trancher côté produit
- C · Garmin en « Bientôt disponible » tant que `GARMIN_ENABLED` est faux : volontaire (candidature développeur en cours)
- C · Barre d'onglets du bas (Aujourd'hui…Profil) : fournie par le gabarit athlète

## Ath2Zones → `src/features/athlete/pages/AthleteZonesPage.tsx` (route `/athlete/zones`)
- C · Bandeau « Fixé par <coach> · dernier test le … · lecture seule », 4 seuils (SV1, SV2, FC max, FC de repos + source montre), sélecteur de modèle, barre colorée avec SV1/SV2, lignes Z1..Zn, phrases de bas de page : tous présents et fidèles
- C · Variante 5 zones : couleurs vert→rouge via `zoneColor(zone, n)`, libellés Récupération/Endurance/Tempo/Seuil/Maximal fournis par `zoneRows` : conforme
- C · Le code ajoute un état vide « Ton coach n'a pas encore fixé tes zones… » absent de la maquette : utile
- C · Aucun écart de libellé constaté (à vérifier seulement à l'écran : « Z1 Facile · sous SV1 / moins de 152 » en modèle 3 zones, `lib/athleteZones.ts` `zoneRows`)

## Ath2Sante → `src/features/athlete/pages/AthleteSantePage.tsx` (route `/athlete/sante`)
- A · En-tête : maquette « Garmin Forerunner 265 synchro 06:58 » ; le code affiche seulement l'attribution → ajouter l'heure de dernière synchro si `provider_dailies` expose `updated_at`/`synced_at` (sinon rester sans) (`AthleteSantePage.tsx:144`, `api/health.ts` `DAY_COLS`)
- C · Légende bas de page « ▒ ta moyenne · courbes sur 7 jours · touche une mesure » : OK ; en détail, maquette met la source « Garmin Forerunner 265 » juste sous le titre puis les onglets, le code le fait aussi → rien
- C · Température cutanée : maquette montre la carte même absente avec « Non fournie par cette montre — » ; le code le fait déjà (`:185-189`) → rien
- C · Sommeil : durée, heures coucher → lever, moyenne, score /100, phases (Profond/Léger/Paradoxal/Éveil), pastille d'état, courbe : conforme
- C · Détail d'une mesure : valeur, pastille, « 3ᵉ nuit sous ta zone habituelle », courbe 28 j + bande, Plus bas / Moyenne / Plus haut, « C'est quoi ? », phrase finale : conforme (`:97-133`)
- C · Le code gère aussi la vue coach (`coachView`) et le bureau (4 colonnes) : absent de la maquette téléphone, volontaire

## HyroxAnaTel → `src/features/shared/components/hyrox/RaceAnalysis.tsx` + `raceShareCard.ts`, ouvert depuis `src/features/athlete/pages/HyroxPage.tsx` (route `/athlete/hyrox`, onglet Courses)
- A · En-tête : maquette « Record 1 min 18 s sous ton objectif » ; le code n'affiche que « Record » → voir B pour l'objectif ; en attendant garder « Record » (`RaceAnalysis.tsx:219`)
- A · Onglets : maquette COURSE / RUNS / GAINS en capitales (4ᵉ écran « Partager » = bouton séparé) ; le code a 4 onglets en pastilles « Course / Runs / Gains / Partager » → passer en capitales mono et sortir « Partager » en bouton d'en-tête si on veut coller (`RaceAnalysis.tsx:28-33, 240-247`)
- A · Runs : bascule « Cette course | Évolution » absente → ajouter l'onglet « Évolution » : les allures par run de toutes les courses (`useHyroxResults`) sont déjà chargées dans `RaceAnalysis` (`RaceAnalysis.tsx:331 RunsTab`)
- A · Runs : les barres affichent le delta « +13 » au-dessus et le chiffre du run 1 en allure ; la maquette ajoute une ligne « réf. » sur le run 1 et l'axe d'allure → ajouter le mot « réf. » sous la 1ʳᵉ barre (`RaceAnalysis.tsx:350-356`)
- A · Runs : phrase de synthèse maquette « …ton cœur monte plus pour la même allure » absente ; le code ne cite que la cadence → ajouter la FC moyenne des 2 runs lents si > FC run 1 (`RaceAnalysis.tsx:373-378`)
- A · Gains : maquette = cascade (barre de départ 1:18:42, marches −46 s, −28 s…, barre « Possible » 1:16:55) avec mention « Échelle coupée » ; le code = liste de barres horizontales → remplacer par une cascade SVG à partir de `gains.items` (`RaceAnalysis.tsx:402-420`)
- A · Gains : ligne finale « SkiErg, rameur, burpees, farmers, fentes et sled pull : déjà au niveau ou devant » absente → la déduire des stations hors de `gains.items` (`RaceAnalysis.tsx:422`)
- A · Gains : la phrase de médiane « Médiane Women Open · 1:15–1:20, comme le radar » est remplacée par « (même tranche de chrono) » dans Sources → ajouter la tranche de chrono lisible (`RaceAnalysis.tsx:422`, `bracket`)
- A · Carte à partager : maquette « Course 38:55 · Stations 33:30 · Roxzone 6:17 » en bas ; le code dessine allure moy. et coach mais pas ces trois totaux → ajouter la ligne via `shares(race)` / `roxzone_total_s` (`raceShareCard.ts:195-208`)
- B · « En parler à <coach> » et « Ajouter à mon plan de course » (Gains) : pas de messagerie athlète → coach ni de plan de course (`hyrox_plans`/`targets` existent en base mais aucun hook front ne les lit) ; choix produit à faire
- B · « Record 1 min 18 s sous ton objectif » : exige de relier le résultat à son plan (`hyrox_plans.target_total_s`, via `competition_id`/`result_id`) ; aucun hook front aujourd'hui
- B · Run 8 touché : « bulle de détail » flottante avec +31 s/km vs run 1 ; le code affiche une carte `SegmentDetail` sous la frise → même contenu, choix de présentation
- C · Frise 17 segments sous la courbe de FC, légende Run/Station/Roxzone/Z1-Z3, 3 constats calculés, Sources, tableau des segments : présents (le code ajoute « Ce que dit la montre » et « Les segments un par un », plus complet)
- C · Onglets HYROX Courses / Stations / Runs / Radar / Tests : conformes (`HyroxPage.tsx:11-17`) ; le contenu de Stations, Radar et Tests réutilise les vues coach (`coach/components/hyrox/*`), hors de cette planche
- C · Données Léa Démo (HYROX Lyon 1:18:42, rang 142 / 611) : données de démo

## CoachTelTests → `src/features/coach/phone/CoachPhoneTests.tsx` (route `/coach/athletes/:athleteId/tests`, vue téléphone via `PhoneOr`)
- A · Liste « Prévus au planning » : la maquette met un sous-titre « Endurance · dans la séance du jour » sous le nom ; le code n'affiche que le titre et un lien « Saisir » → ajouter une 2e ligne grise avec le domaine du test (colonne `type` déjà lue par `listTestSessions`, `src/api/tests.ts:403`) (`CoachPhoneTests.tsx:72`)
- A · Saisie libre : le sélecteur « Test » ne montre que le nom ; la maquette ajoute le domaine à côté (« Test VMA · VAMEVAL  Endurance ») → suffixer l'option avec `TEST_GROUP_LABEL` du groupe de la définition (`CoachPhoneTests.tsx:176`)
- B · Saisie libre : « Compte pour le test prévu jeu. 12 nov. » et le passage du test prévu en « fait » après enregistrement → la saisie libre ne rattache pas le résultat à un `test_sessions` (il faudrait un lien résultat → séance de test prévue et sa clôture à l'enregistrement) ; le chemin par la ligne « Prévus » (`TestEntryPage`) fait déjà cette clôture
- C · Textes sous le bouton / mentions « Banque de tests et création d'un test : sur ordinateur », « {prénom} le voit tout de suite dans ses tests » : identiques à la maquette
- C · Commentaire facultatif, Préc. / écart en direct, ordre des groupes : conformes ; états vide / erreur présents (maquette n'en montre pas)

## CoachTelFiches → `src/features/coach/phone/CoachPhoneFiches.tsx` (route `/coach/fiches`, via Plus)
- B · Détail fiche : « Avec la séance Seuil 3 × 10 min » (nom de la séance qui a porté la fiche) → le code affiche seulement « Avec une séance » (`CoachPhoneFiches.tsx:16,145`) ; le nom exige de joindre l'attribution à la séance (non chargé par `useDocFamilyAssignments`)
- B · Détail fiche : ligne « Déjà partagée · avec une séance » dans le sélecteur d'athlètes (même donnée, source de l'attribution) → le code affiche « Déjà partagée » (`CoachPhoneFiches.tsx:216`)
- B · Aperçu : barre « 1 / 3 · Plein écran » sous le document → à vérifier dans `FichePreview` (composant partagé, pas de pagination côté téléphone relevée dans ce fichier)
- B · Détail : « Modifier sur ordinateur » est un lien dans la maquette, simple texte dans le code → pas de lien vers l'ordinateur possible (le coach est sur téléphone), choix produit
- C · Pas de « 3 athlètes / 1 athlète » dans les lignes de liste (acté : écart volontaire téléphone)
- C · Partage : pas de mention « avec une notification » sous le bouton ; le code écrit « Ils la retrouvent dans « Mes fiches » » (acté : pas de notification push au partage)
- C · Compteur d'en-tête « 8 fiches » (conforme) ; message « Partage interrompu » en cas d'erreur (en plus de la maquette)

## CoachTelBanque → `src/features/coach/phone/CoachPhoneBanque.tsx` (route `/coach/library`, via Plus)
- C · Pas d'onglets Musculaire / Énergétique / Spécifique : le code est une banque d'exercices seule, avec puces de type (`EX_TYPES`: Musculaire, Haltérophilie, Mobilité, Pliométrie, Vitesse) (acté)
- A · Ligne d'exercice : la maquette écrit le type sous le nom (« Musculaire », « Pliométrie ») et « Musculaire · communauté » ; le code met le type à droite en couleur, sans mention « communauté » → ajouter une étiquette « communauté » quand l'exercice n'est pas officiel (`ex.is_verified` faux) (`CoachPhoneBanque.tsx:97`)
- B · Fiche exercice : durée de la vidéo « 0:42 » sur l'aperçu → le code intègre la vidéo YouTube directement, sans pastille de durée (pas de colonne durée)
- C · Compteur « 412 exercices » masqué dès qu'un filtre est actif (remplacé par « N résultats ») : même logique que la maquette
- C · Filtre « Type » de la maquette = puces « Tous + types » dans le code ; différence de présentation sans importance

## CoachTelSante → `src/features/coach/phone/CoachPhoneSante.tsx` (route `/coach/athletes/:athleteId/sante`)
- A · Phrase de synthèse sous l'encart « Écart avec son ressenti » : la maquette est précise (« sa nuit est courte et sa récupération basse depuis 3 jours »), le code écrit une phrase fixe « {prénom} se dit en forme, mais la montre mesure moins bien que d'habitude » → construire la phrase avec les `streak` déjà calculés (`sleepV.streak`, `bbV.streak`) : « …et sa récupération est basse depuis {n} jours » (`CoachPhoneSante.tsx:160`)
- A · Lien « Détails sur 28 jours › » en bas : absent → au tap, ouvrir la première mesure hors normale (ou la liste complète) en mode 28 j ; le tap ligne par ligne existe déjà (`CoachPhoneSante.tsx:175`)
- C · Seuil « écart » du code (déclaré ≥ 4 et mesure basse) : règle plus stricte que la maquette (qui montre un cas particulier) ; voulu pour éviter les faux positifs
- C · Textes d'état (« Bas · 3 j », « Haute ») : conformes ; état vide ajouté (« Aucune donnée de montre ») en plus

## CoachTelPlus → `src/features/coach/phone/CoachPhonePlus.tsx` (route `/coach/plus`)
- C · Pas de compteurs « Fiches 8 / Banque d'exercices 412 / Banque de tests 9 » dans la liste Outils (acté)
- C · Le code ajoute « Reviews de la semaine », « Mode athlète », « Espace pro (staff) », « Avis athlètes », « Roadmap », « Coachs » (selon rôle) en plus de la maquette : fonctions existantes accessibles depuis le téléphone
- C · Bloc « Ton code coach », « Copier / Partager », Nouveautés (3 dernières, « N non lues », « Toutes les nouveautés › »), Paramètres, Se déconnecter, pied « Agon · version du… » : conformes aux textes

## CoachOrdiASante → `src/features/coach/pages/RetoursPage.tsx` (onglet « Santé », route `/coach/athletes/:athleteId/retours?vue=sante` ; `/coach/athletes/:athleteId/sante` redirige vers `donnees`, page d'historique des séances, sans rapport) + `src/features/coach/components/FeltVsMeasured.tsx` + `src/features/athlete/pages/AthleteSantePage.tsx` (mode `coachView`)
- A · Bloc « 01 Ressenti / mesuré », carte Sommeil : la maquette écrit « 52 / 100, score · 6 h 05 min · moy. 78 » ; le code n'affiche que le score arrondi et « score de sommeil · moy. 78 » → ajouter la durée mesurée (`sleepTotalMin`, déjà dans `HealthDay`) à la légende (`FeltVsMeasured.tsx:76`)
- A · Section « 03 — Wellness déclaré » (note /100 + « Bon » + habitude, 6 notes avec pastille « ≠ MONTRE » sur Sommeil et Énergie, courbe wellness 7 j, lien « Voir le wellness détaillé › ») : absente de l'onglet Santé → composer avec `useWellnessHistory`, `wellnessScore`, `wellnessBand`, `feltSummary` (`src/lib/coachWellness.ts:48`) et `agreement` (`src/lib/feltVsMeasured.ts:14`) ; le lien renvoie vers `?vue=wellness` (`AthleteSantePage` reçoit déjà `top`, ajouter `bottom`) (`RetoursPage.tsx:262`)
- A · Mention « Body Battery, score de sommeil et stress sont des scores Garmin : affichés pour information, Agon ne s'en sert dans aucun calcul » en bas : absente → ajouter la ligne de pied (`AthleteSantePage.tsx:207`)
- A · Section « 04 — Ressenti et mesuré · 28 jours » (courbes ressenti ×20 contre mesure, bascule Sommeil / Énergie / Sérénité) : absente → graphique Recharts avec `useWellnessHistory` (28 j) + `dailyValues` des mêmes métriques déjà chargés (`FeltVsMeasured.tsx`) ; données existantes
- A · Numérotation des sections : le code s'arrête à « 02 — Mesures de la montre » ; passer à 03 / 04 une fois les blocs ci-dessus ajoutés
- A · Carte Sommeil de « 02 — Mesures » : la maquette affiche « Moy. 28 j : 7 h 30 min · score 78 · coucher 23 h 48 → lever 6 h 35 » et « Score de sommeil · 7 nuits » en barres avec jours ; le code met « 23:48 → 06:35 · moy. 7 h 30 » sans « 28 j », sans moyenne du score, et trace la durée en courbe → ajouter « 28 j » et la moyenne du score (série `sleepScore` disponible) et passer la mini-courbe sur le score (`AthleteSantePage.tsx:162,177`)
- A · Légende des petites cartes : « moy. 28 j 63 ms · 7 j » (période explicite) ; le code écrit seulement « moy. 63 » → ajouter « 28 j » (`AthleteSantePage.tsx:198`)
- A · En-tête : « Santé  jeu. 12 nov. » en minuscule ; le code met la date avec majuscule (« Jeu. 12 nov. ») → sans importance mais simple : retirer la mise en majuscule pour le mode coach (`AthleteSantePage.tsx:61`)
- B · « Garmin Forerunner 265 · synchronisée à 7 h 42 » : l'heure de synchro n'est stockée nulle part côté santé (pas de date de dernière synchro dans `HealthDay` ni `provider_*` exposé au front) ; le code garde « Garmin Forerunner 265 »
- B · Phrases d'interprétation sous chaque carte « Ressenti / mesuré » (« Léa se sent reposée mais la nuit a été courte et agitée, 3 e nuit sous sa moyenne… », « La réserve d'énergie mesurée baisse depuis 4 jours », « Ressenti et mesure vont dans le même sens ») → texte écrit à la main dans la maquette ; produire ces phrases demande un choix produit (règles de rédaction, éviter l'IA sur Garmin)
- B · Barre de navigation : maquette « Semaine | Mois | Wellness | Santé » dans un seul sélecteur ; le code a « Retours | Wellness | Santé » avec Semaine / Mois dans Retours → choix de navigation déjà tranché (P26)
- C · Sélecteur de période « Jour | 7 j | 28 j » dans le code contre « 7 j | 28 j » dans la maquette : « Jour » est plus utile
- C · Pastilles d'état « ↓ Bas / ↑ Haut / Normal » (avec flèche) contre « Bas / Haut / Normal » : sans importance
- C · Pas de diagnostic, traitement ni antécédents (retirés le 13/11) : non montré dans la maquette non plus

## CoachOrdiAEditeurEnergie → `src/features/coach/pages/EnergySessionEditorPage.tsx` (routes `/coach/athletes/:athleteId/energy/new` et `.../energy/:sessionId/edit`, `/coach/energy-library/new`)
- A · Légende du profil : « Hauteur = intensité · couleur = zone » et « Estimé avec VMA 15,5 km/h · SV1 152 · SV2 172 » sous le graphique : absentes ; les références de l'athlète sont déjà lues (`useAthleteReferences`, `SessionPreview.tsx:88`, `refs.VMA`) → ajouter les deux lignes sous la barre des zones (`SessionPreview.tsx` fin du bloc zones) ; SV1 / SV2 à lire dans les références (déjà utilisées par `ZoneModelPanel`)
- A · Pied de page de la carte Enregistrer : « La séance part sur la montre de Léa (Garmin Forerunner 265) avec ses blocs et ses cibles. » → absent ; la montre de l'athlète existe via `latestDevices` (`src/api/health.ts:77`, à exposer) ; à ajouter sous le bouton Enregistrer (`EnergySessionEditorPage.tsx:~735`)
- A · Carte du bloc « Intervalles » : la maquette affiche une cible traduite (« 4'15 à 4'25 /km ≈ FC 165–171 · zone 2 pour Léa ») ; le code affiche zone Z{n} et la cible saisie, sans la traduction FC « pour Léa » → lire `refs` de l'athlète pour calculer la FC équivalente (`EnergyBlockCards.tsx:93,299`)
- B · Bouton « Voir comme Léa » : n'existe pas (aperçu de la séance côté athlète à construire)
- B · Sports : la maquette propose « Course / Vélo / Rameur / SkiErg » ; le code a « Course / Vélo / Natation / Rameur / Autre cardio » (`src/lib/energy/sports.ts`) → SkiErg demande une nouvelle valeur de sport et son mode côté montre (Garmin)
- C · Carte « Place d'origine du bloc 3 » / « DÉPOSER ICI » : états de glisser-déposer visibles seulement pendant le geste (maquette = capture en cours de geste) ; le code a « Glisse un bloc pour le déplacer » et le tri par poignée
- C · Sélecteur de date : champ de date natif (« Le ») au lieu du texte « mar. 17 nov. » ; fonction équivalente
- C · Boutons « Importer une séance / Importer un texte », « Ajouter un schéma terrain », « Fiches » en plus de la maquette : fonctions existantes

## CoachOrdiBAvis → `src/features/coach/pages/AthleteFeedbackPage.tsx` (route `/coach/avis`)
- A · Titre de page : maquette « Avis athlètes » + compteur « 5 retours · 2 nouveaux » à droite → ajouter `{data.length} retours · {counts.new} nouveau(x)` sous le titre (`AthleteFeedbackPage.tsx:47`)
- A · Libellé filtre maquette « Nouveaux / En cours / Faits / Tous » (code : `FEEDBACK_STATUS_LABEL` + « · n », ordre identique) → aligner les libellés des puces filtre sur les pluriels « Nouveaux / Faits » et mettre le compteur dans une pastille (`:63`)
- A · Phrase d'intro : maquette ajoute « Visible par l'admin et les coachs certifiés. » → compléter le texte (`:48-50`)
- A · Avatar à initiales (LD, MD…) à gauche de chaque carte, absent du code → ajouter un rond d'initiales via `initials(authorName(r))` (`:79-84`)
- A · Date au format « 12 nov. · 08:41 » (maquette) ; le code sort « 12 nov., 08:41 » via `toLocaleDateString` → formater « jour mois · HH:mm » (`:27-29`)
- A · Page affichée en rubrique de la zone « Séance en cours / Programme / Wellness… » : maquette traduit le champ `page` en libellé lisible (Séance en cours, Programme, Wellness, Tests, Profil) ; le code affiche la valeur brute `r.page` → table de correspondance (`:86`)
- C · Barre latérale / en-tête coach (Rechercher ⌘K, Mode athlète, Déconnexion) : layout coach commun, hors page
- C · Suppression (corbeille) et confirm() présents dans le code, absents de la maquette : fonction utile, à garder
- C · Statut maquette en 3 boutons « Nouveau / En cours / Fait » : identique au code

## CoachOrdiBNouveautes → `src/features/coach/pages/CoachUpdatesPage.tsx` + `src/data/releaseNotes.ts` (route `/coach/nouveautes`)
- A · Badge de type : maquette « Nouveauté » / « Correctif » ; vérifier que `ReleaseNoteKindBadge` affiche exactement ces mots (`components/updates/ReleaseNoteKindBadge.tsx`)
- A · Bouton « J'ai vu » et date « Vue le 9 nov. » : maquette abrège le mois (« 9 nov. ») alors que le code écrit « Vue le 9 novembre 2026 » (`CoachUpdatesPage.tsx:65`, `fmtDate`) → format court pour la mention « Vue le »
- A · Date de tête : maquette « 12 novembre 2026 · Non vue » sur la même ligne que le badge de type ; code identique (`:62-68`), rien à faire
- A · Résumé : la maquette montre le détail déplié sur les non vues et replié (« Voir le détail ›») sur les vues ; déjà fait (`:58,73-77`), seul écart : le lien est après le résumé, la maquette le place à droite du bouton « J'ai vu » (note 2) → déplacer le lien sur la même ligne que « J'ai vu » (`:73-87`)
- C · Admin « Vue par X / Y coachs » : présent dans le code, non montré dans la maquette (démo non admin)
- C · Contenu des entrées (Strava, mise à jour auto…) : données de démo de la maquette ≠ `releaseNotes.ts`

## CoachOrdiBParametres → `src/features/coach/pages/SettingsPage.tsx` (route `/coach/settings`)
- A · Titre « Paramètres » + sous-titre « Compte coach · Agon Démo » : conforme
- A · Profil : bouton « Modifier » à droite du nom/e-mail absent → B si aucun écran d'édition de profil n'existe côté coach ; sinon A (`SettingsPage.tsx:95-106`). Aucun écran trouvé → classé B ci-dessous
- B · « Modifier » le profil coach : pas d'écran/hook d'édition du nom/e-mail dans le code
- B · Section « Notifications » (Blessure déclarée, Wellness en alerte, Séance manquée, Staff, Nouveautés d'Agon, « Dans l'app et par e-mail ») : aucune préférence de notification en base ni fonction d'envoi e-mail ; à créer (table de préférences + déclencheurs serveur)
- A · Assistant IA : maquette affiche « 1 clé active · « Claude sur mon Mac » · Utilisée le 11 nov. » en résumé ; le code liste clés actives/révoquées dans une carte plus longue (`CoachApiKeysSection.tsx:67-120`) → afficher la date « Utilisée le » si `last_used_at` existe dans le hook, sinon C
- A · « Données et confidentialité » : maquette = carte toujours ouverte ; code = accordéon replié par défaut « Confidentialité & données » (`PrivacySection.tsx:75-85`) → renommer « Données et confidentialité » et ouvrir par défaut dans les Paramètres coach
- A · Accord de santé : maquette montre une ligne « Traitement de tes données de santé · Accord donné le … · Accordé » (pastille verte) ; le code l'affiche dans un bloc gris avec un long texte (`PrivacySection.tsx:92-102`) → remplacer par une ligne courte + pastille « Accordé »
- A · « Exporter mes données … Télécharger (JSON) » : code = grand bouton pleine largeur « Télécharger toutes mes données (JSON) » (`:112-127`) → ligne libellé + bouton court à droite
- A · « Zone danger » : maquette titre une zone dédiée (« Zone danger », texte « Irréversible… tape SUPPRIMER », bouton rouge) ; code : bouton seul sans texte d'avertissement (`:167-176`) → ajouter titre « Zone danger » et la phrase d'avertissement
- A · Déconnexion : présente dans le code (bas de colonne), absente de la page maquette (déjà dans l'en-tête) → C si le bouton d'en-tête existe
- A · Mise en page : maquette en colonne unique ; code en 2 colonnes sur ordinateur (`:92`) → à trancher, sinon C
- C · Code coach, Point hebdo, Mode coach-athlète : textes identiques à la maquette

## CoachOrdiBStaffAccueil → `src/features/staff/pages/StaffHomePage.tsx` (route `/staff`)
- A · En-tête : maquette « Mes athlètes · 4 athlètes · 2 coachs » à droite du titre → ajouter le compteur `data.length athlètes · n coachs` (distincts par `coachName`) (`StaffHomePage.tsx:90`)
- A · Carte athlète : maquette « HYROX PARIS · S1 / 5 » (objectif + semaine du bloc) à côté du nom → absent (`:35`). Donnée objectif/semaine non chargée par `useMyStaffLinks` → B si nouvelle lecture RLS staff nécessaire
- B · Pastille « HYROX PARIS · S1 / 5 » : le staff n'a pas accès à la compétition cible ni au bloc de l'athlète (domaines `seances`/`planification` seulement)
- A · Libellé du domaine « Médical » (maquette) ↔ « Blessures » (code, `staffPermissions.ts:54`) → C : retiré/renommé volontairement le 13/11 (hors HDS)
- A · Droits : maquette sépare « Écriture … · Lecture … » ; code identique (`:41-44`). Maquette : mêmes blocs
- A · Pastille « 1 blessure en cours » : conforme (`:51-55`)
- A · « À surveiller » : maquette montre aussi « wellness en baisse (Sommeil 2 / 5 deux matins de suite) » → le code ne montre que les blessures (`:62-82`) ; donnée de bien-être existe (`useStaffAthleteData`/wellness) → A si lisible par le staff selon le droit `wellness` (réutiliser `wellnessLight.ts`), sinon B
- A · Date « 10 nov. » alignée à droite dans « À surveiller » : conforme (`:77`)
- A · Bas de page : maquette « (fiches, notes médicales) » ; code « (fiches, blessures saisies) » (`:112`) → C (RGPD, notes médicales retirées)
- C · Ordre : maquette met « À surveiller » à droite ; code idem (grille 1,6fr/1fr)
- C · Écran « Eva Démo : En attente de l'accord de l'athlète : rien de visible » : conforme (`:47-49`)

## CoachOrdiBStaffFiche → `src/features/staff/pages/StaffAthleteArea.tsx` (route `/staff/athletes/:athleteId`)
- A · En-tête : maquette « Mes athlètes » en fil d'Ariane + badge « HYROX PARIS · S1 / 5 » ; code : flèche « ‹ » et nom en titre uppercase (`:195-200`) → remplacer par fil « ‹ Mes athlètes » (`:195`)
- B · Badge « HYROX PARIS · S1 / 5 » : mêmes données que l'accueil, non exposées au staff
- C · Onglet « Médical » (+ « Ajouter une note », « Suivi », fiche « Séance de kiné », « Antécédent par… ») : retiré le 13/11 ; le code a « Blessures » + « Déclarer une blessure » (`MedicalEntriesSection.tsx`)
- C · Chip « 3 / 10 gêne » et notes de suivi : lié au médical retiré
- A · Onglet « Mes accès » : maquette le conserve dans la barre d'onglets ET en aside ; code identique (`:204`, `AccessAside`)
- A · Aside « Tes accès sur Léa » : maquette liste « Séances, Planification, Séances réalisées, Bien-être, Médical, Nutrition, Tests, Fiches, Commentaires, Montres connectées » ; code idem avec « Blessures » (`:80-93`) → C pour le libellé
- A · Texte aside : maquette « Droits réglés par Agon Démo. Tu ne modifies que ce que tu as créé ; tes notes vont dans sa banque, à ton nom. » ; code identique (`:96-97`)
- A · Lien « Me retirer du staff de Léa » : conforme (`:105`)
- A · Badge « Écriture / Lecture / Non partagé » : coloris conforme ; l'icône ✎ sur onglets du code est un plus → C
- A · Barre d'onglets : le code place `Nutrition` après `Blessures` comme la maquette ; ordre conforme

## CoachOrdiBStaffInvitation → `src/features/staff/pages/StaffInviteAccept.tsx` (route `/staff-invite/:token`)
- A · Rangées « Ce que tu pourras faire » : maquette « Écrire / Consulter / Non partagé » ; code « Écrire / Consulter / Non partagé » : conforme (`:112-121`)
- A · Titre, sous-titre, durée de validité : conformes (`:95-132`)
- A · Date de naissance : placeholder maquette « jj / mm / aaaa » ; champ `type="date"` natif (`:251`) → C (sélecteur natif selon navigateur)
- A · Champ e-mail exemple : démo → C
- A · Libellés des domaines non partagés : maquette « Nutrition, données des montres » ; code liste aussi « Blessures » si non partagé (`:91`) → C (renommage Médical → Blessures)
- A · Texte des conditions : liens `/cgu` et `/confidentialite` conformes
- A · Pied de page « Tu es déjà coach sur Agon ? Connecte-toi… » : conforme (`:224`)
- C · Variante « Déjà connecté » et erreurs (lien utilisé/expiré) : absentes de la maquette, utiles

## HyroxAnaCoachOrdi → `src/features/coach/components/hyrox/RaceSheet.tsx` → `src/features/shared/components/hyrox/RaceAnalysis.tsx` (route `/coach/athletes/:id/hyrox?view=courses`)
- A · Fil d'Ariane « HYROX › Courses › Simulation HYROX · 07/11 · Analyse » + bouton retour : code a « ← Course » (`RaceAnalysis.tsx:178`) → afficher le fil d'Ariane complet
- A · Sous-onglets HYROX : maquette « Courses · Stations · Runs · Radar · Tests » ; code : « Bilan · Courses · Stations · Runs et Roxzone · Radar · Tests HYROX · Plan de course » (`ContextBar.tsx:56-64`) → renommer « Runs et Roxzone » en « Runs », « Tests HYROX » en « Tests » ; « Bilan » et « Plan de course » (placeholder « Bientôt disponible ») à trancher
- A · Bandeau de synthèse : maquette « Chrono / Position Top 17 % Women, réf. RoxHype 25/26 / Vs plan de course / Profil Hybride course top 15 % · stations top 19 % » ; code : Chrono, Position, Profil (`:192-196`) → ajouter les percentiles course / stations dans le sous-texte du Profil (valeurs déjà calculées, `pctRun`/`pctStations` dans BilanView)
- A · Ligne « +2:23 vs record (Lyon) » sous le Chrono : code affiche « Record » seulement si record (`:192`) → afficher l'écart au record et la course (données déjà dans `allRaces`)
- B · « Vs plan de course +1:35 · plan 1:19:30 » : pas de plan de course en base (onglet « Plan de course » vide)
- B · Menu « Comparer à : Course précédente · Plan de course · Médiane Women 1:15–1:20 » + bandeau « 1 alerte · Roxzone 7,6 % du chrono » : sélecteur de référence inexistant (le code ne compare qu'à la médiane dans le tableau) ; plan de course manquant
- A · Frise : maquette « 17 segments à l'échelle du temps · survoler un segment pour le détail », légende « Run 1 km · Station · Roxzone · FC par zone · Allure · Plan · Cadence » ; code : légende Run/Station/Roxzone + zones, détail au clic (`:212-225`) → libellé « 01 — Frise de course · 17 segments… » à la place de « Le film de ta course » (`:212`) ; courbes Allure/Plan/Cadence absentes (Plan = B)
- A · Titre « 02 — Ce que dit la montre » : code a « 02 — n constat(s) » puis « Ce que dit la montre » sans numéro (`:233,245`) → ordre maquette : 02 = « Ce que dit la montre » (5 cartes), puis 03 Leviers ; supprimer le doublon « constats » ou l'intégrer
- A · Cartes de la montre : maquette 5 cartes (Course compromise, Dérive cardiaque, Récupération en Roxzone, Au-dessus de SV2, Chute de cadence) ; code a les 4 premières (`:248-253`) → ajouter « Chute de cadence » (cadence disponible dans `RaceWatchAnalysis`) ; ajouter la ligne de comparaison « Lyon +24 s/km » (course précédente) en sous-texte
- A · Dérive cardiaque : maquette « −19 % » (avec « − ») ; code `+`/`−` selon signe (`:249`) → conforme, décimales à la virgule déjà gérées
- B · « Leviers · quoi travailler, classés par priorité calculée » avec formule `+29 s × 1 = 29,0` et boutons « Ajouter au programme » : le code a un onglet « Gains » (écart à la médiane, `GainsTab`) sans pondération par station ni action d'ajout au programme ; pondérations (poids de station) et séance type par levier n'existent pas
- A · Pastille « INDICE MONTRE » sur le levier dérivé de la montre : à ajouter si Leviers est construit
- A · Tableau « 04 — Les 17 segments » : maquette colonnes N°, Segment, Temps, Plan, Écart, Médiane, Position (top %), FC moy., FC max, % Z3, Cadence, Coût run suiv. ; code : Segment, Temps, Médiane, Écart, FC moy., FC max, Cadence (`:285-286`), roxzone hors tableau (`:273`) → ajouter colonnes N°, Position (percentile), % Z3, Coût run suivant ; ajouter la ligne Roxzone (15 passages) et la ligne Total ; tableau déplié par défaut (« Replier ») ; Plan = B
- A · Bandeau de sources en bas : maquette « Temps : tours Garmin validés par le coach… · Mesure absente : « — » » ; code similaire (`:256`) → compléter la mention « Mesure absente : — »
- C · « Garmin Forerunner 265 » nommé dans la maquette : le code affiche `attribution` selon l'appareil (règle Garmin) ; et aucune donnée Garmin vers l'IA : les constats sont bien « calculés, sans IA »
- C · Onglets internes du code « Course · Runs · Gains · Partager » : le code garde plus de fonctions que la maquette (page unique)

## HyroxAnaCoachEvolution → (aucun écran équivalent ; plus proche : `src/features/coach/components/hyrox/BilanView.tsx`, route `?view=bilan`)
- B · Page « Évolution HYROX : 3 courses · Paris → Lyon → Simulation » avec filtre « Afficher : Toutes / Officielles » : n'existe pas ; `BilanView` ne prend que les courses officielles terminées et propose « Bilan global » + « Évolution du total » (graphique)
- B · « 01 — Chrono et projection » (fourchette 1:17:20–1:19:40, valeur centrale, fiabilité « 4 courses sur 5 dans la fourchette », décomposition Course/Stations/Roxzone, « Si wall balls et Roxzone rejoignent la médiane : −1:11 ») : projection par course cible absente ; une estimation existe côté tests (`tests/AnalysisSheet.tsx:70-94`, « Chrono HYROX estimé », vitesse critique) mais pas de fourchette ni de fiabilité rétroactive
- A · « 02 — Où passe le temps » (part Course/Stations/Roxzone par course, avec %) : toutes les valeurs (`shares`, `runTotal`) sont déjà calculées dans `BilanView.tsx:72,150-170` → ajouter la barre empilée par course
- A · « Coût de la course compromise » et « Efficacité des runs » par course (+33 s/km, 1,24 → 1,01 m/bat.) : fonctions `compromisedRunning`/`runEfficiency` de `src/lib/hyrox/raceWatch.ts:241-301` existent mais exigent la montre de chaque course ; ajoutables en front si les flux sont déjà chargés (sinon B : chargement multi-course)
- A · « 03 — Position par station » (10 lignes, top %, évolution en points, mini-courbe Paris → Lyon → Simulation, bande verte « top 35 % ») : `buildSegmentSummaries`/percentiles disponibles dans `BilanView.tsx:150-165` → ajouter la liste des positions ; le code a un tableau « Moy. %ile / Meilleur %ile » (`:247-248`) à remplacer
- C · Courses non officielles (Simulation) : exclues du Bilan du code (`is_official && finished`) ; la maquette les inclut via le filtre → B si on veut les inclure (choix produit : mélange officielles/simulations)
- C · Mention « Positions et projection : calcul Agon » : formulation à reprendre si la page est créée
