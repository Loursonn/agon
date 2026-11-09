# Dossier Garmin — palier Starter

Formulaire : <https://www.garmin.com/en-US/forms/StarterGarminConnectDeveloperAccess/>

Réponses prêtes à coller, champ par champ. Tout ce qui est entre `[...]` doit
être complété par Hugo : ce sont des faits que seul lui connaît, pas des trous
à remplir au hasard.

> **Le formulaire est en anglais.** Les réponses ci-dessous le sont donc aussi.
> Un relecteur Garmin ne lit pas le français, et une réponse traduite à la
> va-vite donne l'impression d'un dossier recopié.

---

## Ce qu'il reste à fournir avant de déposer

**Plus rien.** Le dossier est complet et le site répond.

| Point | État |
|---|---|
| §1 Identité | Renseignée depuis `src/lib/legal.ts` |
| §2–4 Description et usage des APIs | Rédigés |
| §5 Modèle économique | Gratuit, sans offre payante — arbitré le 27/10/2026 |
| §6 Tiers | Supabase, Vercel, Gemini — avec exclusion vérifiable des données Garmin |
| §7 APIs | Activity + Health + Training |
| §8 Volumétrie | 10–50 aujourd'hui, 300 maximum à 12 mois |
| §9 Contact antérieur | Aucun |
| `agon-training.com` | Répond en production, pages légales publiques sans compte |

Il reste à **copier-coller dans le formulaire**, section par section.

**Après approbation, pas avant** — deux chantiers, aucun ne bloque le dépôt :

1. **Le webhook entrant — codé, pas déployé (07/11/2026).** Connexion,
   callback, webhook, entretien et déconnexion existent (voir « Mise en service
   le jour de l'approbation » en fin de dossier). Toutes les fonctions Garmin
   répondent 503 tant que les secrets ne sont pas posés, et la ligne Garmin du
   profil athlète reste « bientôt disponible » tant que `VITE_GARMIN_ENABLED`
   n'est pas à `true`.

2. **La publication des séances (Training API).** Demandée dans ce dossier,
   pas encore codée. Il faut traduire une séance Agon en *workout* Garmin, et
   tenir la mise à jour et la suppression — une séance modifiée par le coach
   doit l'être aussi dans le calendrier de l'athlète, sans quoi il s'entraîne
   sur une version périmée. Le rendu sur la montre dépend du modèle : une
   séance de course structurée passe bien, une séance de force détaillée moins.

---

## Ce que donne le palier Starter

Vérifié le 26 octobre 2026 :

- **Gratuit jusqu'à 1 000 utilisateurs connectés.**
- **Push uniquement.** Garmin envoie les données vers un webhook à nous ; on ne
  peut pas interroger l'API quand on veut. Conséquence de conception : il faut
  un endpoint public permanent, et aucune donnée n'arrive pour les jours
  antérieurs à la connexion.
- **Pas d'historique.** Un athlète qui connecte sa montre aujourd'hui ne
  remonte pas ses six derniers mois. C'est la raison d'être de l'import de
  fichiers — à présenter à l'athlète dès l'écran de connexion, sinon il croira
  à un bug.
- APIs disponibles : Activity, Courses, Health, Training, Women's Health.
- L'app porte une mention **« unverified »** jusqu'à ce que Garmin l'ait
  relue, avec un plafond de connexions pendant cette période.

Passage à Enterprise (historique, ping/pull, utilisateurs illimités) : demande
depuis le portail développeur, après approbation du Starter. On ne commence pas
par là.

---

## 1. Company & contact

Valeurs tirées de `src/lib/legal.ts` — ne pas les ressaisir à la main ici, les
recopier depuis le fichier pour qu'elles restent identiques à ce que Garmin
lira sur les pages légales.

| Champ | Réponse |
|---|---|
| Company name | Hugo TANGUY — *sole proprietorship (Entrepreneur individuel), SIREN 940221187* |
| Website URL | https://agon-training.com |
| Privacy Policy URL | https://agon-training.com/confidentialite |
| Contact name | Hugo TANGUY |
| Job title | Founder |
| Email | prep.hugoo@gmail.com |
| Company address | 36 Chemin de Charlemagne, 33133 Galgon, France |

> **Company name en entreprise individuelle** : il n'y a pas de personne morale
> distincte, donc le nom légal *est* le nom de la personne physique. Déclarer
> « Agon » seul créerait un écart avec les mentions légales que Garmin ouvrira
> — et un écart entre deux documents du même dossier est précisément ce qu'un
> relecteur cherche. Mentionner « Agon » comme nom commercial à côté, pas à la
> place.

> Garmin ouvre réellement la Privacy Policy URL. Elle doit répondre **sans
> compte** — c'est le cas, les trois routes légales sont hors `ProtectedRoute`
> dans `src/App.tsx` — et mentionner Garmin nommément : c'est fait, Garmin est
> déclaré comme responsable de traitement indépendant dans `SUBPROCESSORS`.
>
> Les deux URL doivent répondre **au moment du dépôt**. Tant que
> `agon-training.com` ne pointe pas sur la production, déclarer ce domaine vaut
> moins qu'un sous-domaine `vercel.app` qui répond.

---

## 2. Primary business service and industry

> Sports coaching software. Agon is a training-management platform used by
> strength-and-conditioning coaches to program, monitor and adjust the training
> of the athletes they coach. Industry: fitness and sports performance.

---

## 3. App overview and user experience

> Agon is a coaching platform with two roles.
>
> A **coach** builds training programs — resistance training, conditioning,
> running and HYROX-specific work — assigns them to his athletes, and monitors
> execution and recovery over time.
>
> An **athlete** follows the assigned sessions in the app, logs what he
> actually did (loads, repetitions, perceived effort), and records daily
> wellness markers: sleep, fatigue, stress, soreness, body weight.
>
> Today the athlete types his watch data in by hand, or sends his coach a
> screenshot of Garmin Connect. This is unreliable and it is the gap the Garmin
> integration closes: heart-rate and activity data recorded by the device would
> flow into the same timeline as the programmed session, so the coach sees
> prescription and reality side by side.
>
> Connecting a Garmin account is **optional and per-athlete**. The athlete
> initiates it from his own profile, grants explicit consent to the sync, and
> can revoke it at any time from the same screen — which deregisters him at
> Garmin, then deletes the stored tokens and every activity and daily summary
> obtained through them. Activities he imported from his own files are kept.
> The same deletion happens when he withdraws his consent, or removes Agon from
> his Garmin Connect account.

---

## 4. How the APIs will be used

> **Health API** — daily summaries (sleep, resting heart rate, steps, stress,
> body battery) displayed on the athlete's own dashboard and on his coach's
> monitoring view, next to the wellness values the athlete reports himself. The
> purpose is to detect the divergence between the two: an athlete who declares
> himself fresh while his resting heart rate has climbed for four days is the
> case a coach must catch early.
>
> **Activity API** — recorded activities with their metrics and FIT files,
> matched against the session that was prescribed for that day. The coach
> compares planned versus executed: intended pace versus actual pace, intended
> intensity versus heart-rate response.
>
> **Training API** — publishing the session a coach has programmed to the
> athlete's Garmin Connect calendar, so that it reaches his watch. Agon's
> purpose is to put a coach's prescription in front of the athlete at the
> moment he trains; today that means reading it on a phone screen between sets.
> The athlete would start his watch and find the prescribed work on it —
> intervals, targets, rest — instead of switching back and forth.
>
> This is the one capability we are requesting ahead of its implementation. We
> state that plainly rather than describe it as existing: the data model is in
> place and the mapping from an Agon session to a Garmin workout is the
> remaining work. A session published this way stays under the athlete's
> control — it lands in his own Garmin Connect calendar, and he may delete it
> there like any other entry.
>
> We do not request the Courses or Women's Health APIs. Agon does not plan
> routes, and does not process menstrual-cycle data. We would rather apply
> again if that changes than request scopes we have no use for.
>
> **Garmin data is excluded from AI processing.** Agon does use a third-party
> AI service elsewhere in the product (see section 6), but data obtained
> through the Garmin APIs is never part of it. This is enforced in the database
> schema rather than left to application code: see section 6 for how.

---

## 5. Business model

*Arbitré : l'accès est entièrement gratuit pour les coachs, sans modèle payant
arrêté à ce jour. La réponse ci-dessous le dit sans promettre un modèle
économique qui n'existe pas encore — annoncer un abonnement non décidé serait
une déclaration à corriger plus tard.*

> Agon is provided free of charge. Coaches and athletes pay nothing to use it,
> and there is currently no paid tier, no trial conversion and no commercial
> offer attached to it.
>
> Garmin data is never sold, resold, licensed, sub-licensed or used for
> advertising, and is never aggregated into any dataset offered to third
> parties. It is used solely to display an athlete's own recorded training to
> that athlete and to the coach he has explicitly connected himself to.

---

## 6. Third-party services processing Garmin data

**Le champ qui fait refuser les dossiers.** Garmin veut la liste complète des
tiers qui touchent aux données de l'appareil, analytics et IA compris. Omettre
Gemini serait une fausse déclaration, et une fausse déclaration découverte
après approbation coûte l'accès.

> | Service | Role | Location | What it processes |
> |---|---|---|---|
> | Supabase (AWS) | Database, authentication, serverless functions — sub-processor | EU (Frankfurt) | Stores all application data, including data received from Garmin |
> | Vercel | Static front-end hosting — sub-processor | EU edge | Serves the application; does not store Garmin data |
> | Google Gemini API | AI-assisted program drafting, elsewhere in the product — sub-processor | EU / US, standard contractual clauses | **Never receives Garmin data.** Garmin-sourced records are flagged as ineligible for AI processing in the database itself, so they are excluded from every query that feeds the AI service. Gemini receives only data entered manually in Agon or imported by the athlete from his own files. No model is trained on any of it. |
>
> We use no advertising, tracking or analytics SDK. No machine-learning model
> is trained on Garmin data, and no Garmin data is sent to any AI service.
>
> **How the exclusion is enforced.** Each data source carries an `ai_allowed`
> flag in a dedicated policy table. Garmin is set to `false`. The flag is
> written onto every row by a database trigger that reads that table and
> overwrites whatever the caller supplied, so application code — or a
> compromised client — cannot mark Garmin data as eligible. Every query that
> builds a prompt filters on that flag. A source with no policy row fails the
> insert outright: an unknown source is treated as forbidden, not as allowed by
> default.

*Pour nous, pas pour Garmin :* la clause 4.1(b) **n'impose pas** cette
exclusion — elle autorise l'affichage au coach avec le consentement de
l'utilisateur et ne dit rien de l'IA. C'est une restriction qu'on se donne,
décidée le 27/10/2026, pour pouvoir déclarer une garantie vérifiable au lieu
d'une intention. Migration `20261029100000_garmin_ai_opt_out.sql`, appliquée.

Conséquence à connaître avant d'y revenir : **le consentement de l'athlète ne
lève pas cette exclusion.** Un athlète qui accepte le traitement par IA verra
quand même ses données Garmin en être écartées — l'inverse lui ferait porter
une décision qui n'est pas la sienne. Repasser `garmin` à `true` suppose d'en
informer Garmin, pas seulement de modifier une ligne.

Implémentation : `20261027130000_provider_schema.sql` (table et trigger),
`20261028090000_ai_source_guard.sql` (filtrage des vues et
`ai_eligible_sources`), `20261029100000_garmin_ai_opt_out.sql` (bascule).

---

## 7. APIs requested

- [x] Activity
- [x] Health
- [x] Training
- [ ] Courses
- [ ] Women's Health

*Training est demandée avant d'être codée — c'est assumé et dit tel quel au
§4. L'ajouter après coup supposerait de redéposer une demande et de repasser
une revue ; la demander maintenant sans la décrire aurait l'air d'une prise de
périmètre. La troisième voie, la seule tenable, est de la demander en disant
qu'elle est à construire.*

---

## 8. Expected users in the next 12 months

*Arbitré : entre 10 et 50 athlètes aujourd'hui, 300 grand maximum à 12 mois.
Si le formulaire exige un nombre entier plutôt qu'une fourchette, donner le
chiffre exact du jour — il est vérifiable, autant qu'il soit juste.*

> Between 10 and 50 athletes are currently monitored on the platform. We expect
> at most 300 within the next twelve months.
>
> This is an upper bound rather than a growth target: Agon is operated by a
> single person, is free of charge, and grows only through coaches who adopt
> it directly. We would rather state a ceiling we are confident we will stay
> under than a projection we would have to revise.

Le palier Starter plafonne à 1 000 utilisateurs connectés : 300 reste
confortablement en dessous, donc aucune demande de passage à Enterprise n'est
à anticiper dans le dossier.

---

## 9. Prior contact with Garmin or a Garmin distributor

*Arbitré : aucun contact antérieur.*

> No. We have had no prior contact with Garmin or with any Garmin distributor,
> and no existing commercial relationship.

---

## Pourquoi ce dossier peut passer

La clause **4.1(b)** du Garmin Connect Developer Program Agreement autorise
l'affichage des données d'un utilisateur à un tiers — ici son coach — dès lors
que l'utilisateur y a consenti. C'est exactement l'inverse de la clause 2.3 de
Strava, qui interdit cet affichage en toute circonstance et nous a fait
abandonner Strava.

Ce qui rend le consentement défendable ici, et pas seulement allégué :

- consentement **distinct** pour la synchronisation de la montre, demandé au
  moment de la connexion et non noyé dans une acceptation globale ;
- **révocable** depuis le même écran, en un clic ;
- **versionné** : un accord donné sur une version des documents qui ne couvre
  plus le traitement concerné est traité comme une absence d'accord et
  redemandé ;
- **journalisé en append-only** : un retrait est une écriture nouvelle, jamais
  une modification. Une preuve qu'on peut réécrire n'est pas une preuve.

Garmin est **responsable de traitement indépendant**, pas notre sous-traitant :
c'est ce que dit le §4.4 de la politique de confidentialité, et c'est ce qui
est juridiquement exact. Le présenter comme un sous-traitant serait une erreur
qu'un relecteur Garmin repérerait.

---

## Mise en service le jour de l'approbation

Tout est codé (07/11/2026) et rien n'est actif : sans secrets, chaque fonction
Garmin répond 503 ; sans connexion Garmin, le cron ne fait rien. L'ordre
ci-dessous compte — chaque étape suppose la précédente.

### Ce qui est implémenté

| Pièce | Rôle |
|---|---|
| `provider-garmin-connect` | Vérifie l'accord `garmin_sync`, crée `state` + PKCE (S256), renvoie l'URL `https://connect.garmin.com/oauth2Confirm` |
| `provider-garmin-callback` | Consomme `state`, échange le code (`POST https://connectapi.garmin.com/di-oauth2-service/oauth/token`, avec `client_secret`), lit `GET /wellness-api/rest/user/id` et `/user/permissions`, range les jetons dans Vault, renvoie vers `APP_URL/athlete/profil?garmin=…` |
| `provider-garmin-webhook` | Vérifie le jeton d'URL, écrit chaque entrée brute dans `provider_webhook_inbox`, répond 200, puis traite (activités, `dailies`, `sleeps`, `hrv`, `deregistrations`, `userPermissionsChange`) |
| `provider-garmin-maintenance` | Appelée par le cron : reprend l'inbox en retard, renouvelle les refresh tokens (~90 j) à 60 jours de l'échéance, déconnecte les connexions dont l'accord a été retiré |
| `provider-disconnect` | `DELETE /wellness-api/rest/user/registration` puis suppression des activités et journées Garmin, de la connexion et des jetons. Les imports de fichiers restent |
| `delete-account` | Passe par `provider-disconnect` pour chaque montre, puis purge l'inbox de l'athlète |
| Migration `20261107140000_provider_base_garmin.sql` | `consent_purpose`, unicité `(provider, external_user_id)`, `device_name`, inbox, bail de rafraîchissement, `provider_forget`, cron `garmin-maintenance` |

Endpoints Garmin vérifiés dans la spec publique *OAuth2 PKCE* ; le format des
notifications push (clés `activities`, `dailies`, … contenant des listes
d'entrées avec `userId` et `summaryId`) est **supposé** d'après la doc
partenaire usuelle — à vérifier dans le portail dès l'accès, voir « À vérifier ».

### 1. Base — avant tout déploiement de fonction

Appliquer `supabase/migrations/20261107140000_provider_base_garmin.sql` selon
le skill `migration-bdd` (`supabase db query --linked -f …`, jamais `db push`).
Elle est additive : le client de production ne lit ni n'écrit ce qu'elle
change. Test à blanc : `supabase/tests/provider_base_garmin.sql` (51 contrôles,
`ROLLBACK`). **Le front qui lit `device_name` ne doit pas partir en production
avant cette migration.**

### 2. Secrets Supabase

```bash
supabase secrets set GARMIN_CLIENT_ID=…        # « Consumer key » du portail
supabase secrets set GARMIN_CLIENT_SECRET=…    # « Consumer secret »
supabase secrets set GARMIN_WEBHOOK_TOKEN=$(openssl rand -hex 32)
```

`APP_URL` (déjà posé pour COROS) doit valoir `https://agon-training.com`. Le
cron lit `project_url` et `service_role_key` dans Vault — déjà présents.
Conserver `GARMIN_WEBHOOK_TOKEN` : il entre dans l'URL du portail.

### 3. Fonctions

Depuis le worktree de la branche déployée (skill `edge-function`) :

```bash
supabase functions deploy provider-garmin-connect
supabase functions deploy provider-garmin-callback      # verify_jwt = false (config.toml)
supabase functions deploy provider-garmin-webhook       # verify_jwt = false (config.toml)
supabase functions deploy provider-garmin-maintenance
supabase functions deploy provider-disconnect
supabase functions deploy delete-account
```

`provider-disconnect` et `delete-account` changent de comportement pour COROS
aussi (suppression des données à la déconnexion) : à déployer avec le front
qui annonce cette suppression.

### 4. Portail développeur Garmin

- **Redirect URI** : `https://mxbfnkkbtmbrauvqplrt.supabase.co/functions/v1/provider-garmin-callback`
- **Endpoint configuration**, mode **push**, pour Activities, Activity Details
  (facultatif), Manually updated activities, Dailies, Sleeps, HRV,
  **Deregistrations** et **User Permissions Change** :
  `https://mxbfnkkbtmbrauvqplrt.supabase.co/functions/v1/provider-garmin-webhook?token=<GARMIN_WEBHOOK_TOKEN>`
  Si le portail refuse les paramètres d'URL : `…/provider-garmin-webhook/<GARMIN_WEBHOOK_TOKEN>`
  (la fonction lit les deux).
- Ne pas activer de type **ping** : la fonction ne suit pas les `callbackURL`
  (elle les marque traitées sans rien importer).

### 5. Essai avec la clé d'évaluation

1. Sur Vercel, Preview uniquement : `VITE_GARMIN_ENABLED=true`.
2. Avec le compte Garmin de Hugo : accord `garmin_sync` → Connecter → retour
   `?garmin=ok`.
3. Enregistrer une courte activité ; vérifier dans l'heure qu'elle apparaît
   avec « Garmin [modèle] », et que `provider_webhook_inbox` se vide
   (`select type, processed_at, error from provider_webhook_inbox order by received_at desc limit 20`).
4. Lire `raw` d'une ligne `provider_activities` et d'une `provider_dailies` :
   comparer les noms de champs avec `mapGarminActivity` / `mapGarminDaily`
   (`supabase/functions/_shared/providers/garmin.ts`). Corriger avant
   d'ouvrir à d'autres.
5. Déconnecter : les activités Garmin disparaissent, l'app disparaît de
   Garmin Connect → *Applications tierces*.
6. Retirer Agon depuis Garmin Connect (reconnexion préalable) : la
   désinscription arrive par webhook, les données sont supprimées.

### 6. Ouverture et Partner Verification

- `VITE_GARMIN_ENABLED=true` en Production sur Vercel, redéploiement.
- Demander la **Partner Verification** depuis le portail. Garmin vérifie
  notamment : déconnexion fonctionnelle (DELETE registration), réponse 200
  rapide du webhook, traitement de `deregistrations` et `userPermissionsChange`,
  attribution « Garmin [modèle] » partout où une donnée est affichée ou
  exportée, et l'absence de traitement non déclaré (§6). Tenir prêtes des
  captures de la ligne d'activité, du récapitulatif « Sources : … » et de
  l'export RGPD (champ `attribution`).
- Jusqu'à la vérification, l'app reste « unverified » avec un plafond de
  connexions : n'ouvrir qu'aux athlètes volontaires.

### Vérifié dans la doc du portail (09/11/2026)

Lu : Start Guide 2.0, OAuth2 PKCE 2.0, Health API 2.1, Activity API 2.1
(PDF confidentiels du portail, non versionnés).

- **Corrigé** : jeton sur `https://diauth.garmin.com/di-oauth2-service/oauth/token`
  (et non `connectapi.garmin.com`) ; routes utilisateur sous
  `https://apis.garmin.com/partner-gateway/rest/user/{id,permissions,registration}`
  (et non `/wellness-api/`).
- **Corrigé** : les `dailies` ne portent pas de body battery mini/maxi (seulement
  `bodyBatteryChargedValue` / `DrainedValue`) ; le mapping ne l'invente plus.
- **Conforme** : forme des notifications (clé = type, liste d'entrées avec
  `userId`, `summaryId`), champs d'activité (`deviceName`, `activityType`…),
  sommeil (`overallSleepScore.value`), HRV (`lastNightAvg`), `deregistrations`,
  `userPermissionsChange` (`permissions`), réponse `{"permissions": […]}`.
- **Délai et rejeu** : 30 s pour répondre 200 ; rejeu une fois par heure
  pendant 7 jours sinon. Plages IP d'émission publiées dans la Health API §4.
- **En-tête** : les notifications portent le client ID en en-tête (contrôle
  `garmin-client-id` conservé).
- `deviceName` vaut « unknown » pour une activité saisie à la main, et peut
  déjà commencer par « Garmin » : `providerAttribution` gère le second cas.
- Starter : **un seul client ID** par licencié ; tout nouveau domaine déclaré
  dans API Tools passe une revue de sécurité de 24 à 48 h.

Reste à confirmer au premier essai : acceptation de `?token=` dans l'URL du
portail.

---

## Checklist « jour J » — contrôles P8 (09/11/2026)

Légende : `[x]` vérifié, `[ ]` reste à faire, `[!]` écart constaté. Aucune valeur de
secret, aucune donnée d'athlète lue. Rien déployé, rien écrit en prod.

- [x] **Secrets Garmin posés.** `supabase secrets list` (projet de prod, noms et dates
  seulement) : `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, `GARMIN_WEBHOOK_TOKEN` et
  `APP_URL` sont présents, posés le 09/11/2026 vers 12 h 19 UTC (`APP_URL` le 07/11).
  Valeurs non lues. Le sondage HTTP confirme le jeton webhook (401, pas 503).
- [!] **Webhook reçoit / stocke / traite** — **rien reçu à ce jour (09/11/2026, lecture seule)**. Compteurs prod : 1 connexion Garmin `active` (12 h 24 UTC, 3 permissions, jamais synchronisée, sans erreur), `provider_webhook_inbox` vide, 0 activité, 0 journée, 0 en attente. Aucune notification n'a donc atteint le webhook : soit l'URL n'est pas (ou mal) déclarée dans le portail Garmin (mode push, `?token=` ou /<token>), soit aucune activité n'a été enregistrée depuis la connexion. À refaire après un essai. Code relu : jeton d'URL → écriture brute idempotente → 200 → traitement via `waitUntil`, reprise par le cron. Tests Vitest verts.
- [x] **Endpoints obligatoires de la Partner Verification, présents dans le code** (l'outil
  lui-même se lance depuis le portail Garmin, par Hugo) :
  | Exigence | Où |
  |---|---|
  | Autorisation OAuth2 PKCE, `connect.garmin.com/oauth2Confirm` | `provider-garmin-connect` |
  | Jeton `diauth.garmin.com/di-oauth2-service/oauth/token` | `providers/garmin.ts`, `provider-garmin-callback` |
  | `GET /partner-gateway/rest/user/id` et `/user/permissions` | `provider-garmin-callback` |
  | `DELETE /partner-gateway/rest/user/registration` | `provider-disconnect` (et `delete-account`) |
  | Webhook 200 rapide, doublons acceptés, GET/HEAD → 200 | `provider-garmin-webhook` |
  | `deregistrations` → effacement des données | `garminIngest.ts` |
  | `userPermissionsChange` → arrêt d'import et effacement du type retiré | `garminIngest.ts` |
  | Renouvellement du refresh token avant 90 j | `provider-garmin-maintenance` |
  Sondage des fonctions déployées : webhook, connect, maintenance, disconnect répondent
  401 sans jeton/JWT (comportement voulu), callback 302 vers `?garmin=parametres_manquants`.
- [x] **Attribution « Garmin [modèle] ».** Conforme : ligne d'activité et récapitulatif
  « Sources » (`ProviderActivityList`), pastille « Réalisée — … » (`watchRunLabel`), export
  RGPD (champ `attribution`, `dataExport`). **Écart corrigé dans ce lot** : les totaux de
  km de course (carte « Volume de course » du profil athlète et de la fiche coach, KPI
  « Course à pied » de la page Retours) disaient « montre » sans nom. Ils affichent
  maintenant « Garmin [modèle] » (`watchOrigins`, testé). `provider_dailies` n'est affiché
  nulle part dans l'UI aujourd'hui (seulement l'export, qui porte l'attribution) : à
  rattacher à l'attribution le jour où une vue sommeil/FC repos Garmin sera ajoutée.
  API coach (`coach-api`) : n'expose pas Garmin (voir ligne suivante).
- [x] **Données Garmin exclues de tout traitement IA.** `ai-program` : aucune lecture
  base, corps de requête seul, et aucun appel côté front. `athlete-insights` : n'accepte
  que des agrégats numériques filtrés par `sanitizeTrendStats`, calculés côté client à
  partir du bien-être, du poids, des records et des séances saisis — jamais de
  `provider_*`. `coach-api` (agents IA externes) : lit uniquement `ai_provider_activities` /
  `ai_provider_dailies`, vues qui excluent `ai_allowed = false` (Garmin) ; trigger
  `data_source_policies` en base (migrations `20261028090000`, `20261029100000`).
  Non vérifié ici : l'état réel des vues en prod (lecture SQL à faire par Hugo si besoin).
- [ ] **Partner Verification demandée dans le portail** — Hugo.
- [ ] **`VITE_GARMIN_ENABLED=true`** sur Vercel (Preview puis Production) — Hugo uniquement.
