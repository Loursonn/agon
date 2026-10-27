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

1. **Le webhook entrant.** Le palier Starter est *push only*, donc Garmin
   enverra les données vers un endpoint public permanent. Cette fonction
   n'existe pas (`supabase/functions/` n'a que les fonctions COROS). L'URL
   devra être configurée dans le portail développeur avant la première
   connexion d'un athlète. Le schéma `provider_activities` est déjà commun aux
   deux fournisseurs, donc ce travail ne repart pas de zéro.

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
> can revoke it at any time from the same screen — which deletes the stored
> tokens and the data obtained through them.

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
- **versionné** : un accord donné sur une version antérieure des documents est
  traité comme une absence d'accord et redemandé ;
- **journalisé en append-only** : un retrait est une écriture nouvelle, jamais
  une modification. Une preuve qu'on peut réécrire n'est pas une preuve.

Garmin est **responsable de traitement indépendant**, pas notre sous-traitant :
c'est ce que dit le §4.3 de la politique de confidentialité, et c'est ce qui
est juridiquement exact. Le présenter comme un sous-traitant serait une erreur
qu'un relecteur Garmin repérerait.
