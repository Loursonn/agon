# Dossier Garmin — palier Starter

Formulaire : <https://www.garmin.com/en-US/forms/StarterGarminConnectDeveloperAccess/>

Réponses prêtes à coller, champ par champ. Tout ce qui est entre `[...]` doit
être complété par Hugo : ce sont des faits que seul lui connaît, pas des trous
à remplir au hasard.

> **Le formulaire est en anglais.** Les réponses ci-dessous le sont donc aussi.
> Un relecteur Garmin ne lit pas le français, et une réponse traduite à la
> va-vite donne l'impression d'un dossier recopié.

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

| Champ | Réponse |
|---|---|
| Company name | `[Nom légal exact — cf. src/lib/legal.ts]` |
| Website URL | `[https://… — cf. README.md de ce dossier]` |
| Privacy Policy URL | `[URL du site]/confidentialite` |
| Contact name | `[Prénom NOM]` |
| Job title | Founder |
| Email | prep.hugoo@gmail.com |
| Company address | `[adresse postale complète]` |

> Garmin ouvre réellement la Privacy Policy URL. Elle doit répondre sans
> compte, et mentionner Garmin nommément — c'est fait, au §4.3 de la politique
> (« responsables indépendants »).

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
> We do not request the Courses, Training or Women's Health APIs. Agon does not
> push content to devices and does not process menstrual-cycle data. We will
> apply again if that changes, rather than request scopes we have no use for.

---

## 5. Business model

> `[À ARBITRER — réponse honnête obligatoire. Garmin demande ce champ pour
> savoir si les données Garmin servent d'argument commercial.]`
>
> Si c'est encore gratuit / en test privé, le dire tel quel :
>
> > Agon is currently operated at no charge for a small number of coaches while
> > the product is being validated. The intended model is a subscription paid
> > by the coach, priced per athlete monitored. Garmin data is never sold,
> > resold, licensed, or used for advertising, and is not aggregated into any
> > dataset offered to third parties.

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
> | Google Gemini API | AI-assisted program drafting — sub-processor | — | Receives training history **only** when a coach explicitly requests program generation for one athlete, and **only** if that athlete has separately consented to AI processing. Not used to train Google's models. Consent is checked server-side before the call is made. |
>
> We use no advertising, tracking or analytics SDK. No machine-learning model
> is trained on Garmin data.

> **À faire avant de cocher quoi que ce soit ici** : le drapeau `ai_allowed`
> par source de données (chantier G) n'est pas encore en place. Il garantit
> techniquement qu'une donnée issue d'un fournisseur dont les conditions
> l'interdisent ne puisse pas atteindre Gemini. Déclarer cette garantie à
> Garmin avant de l'avoir codée serait un engagement en l'air.

---

## 7. APIs requested

- [x] Activity
- [x] Health
- [ ] Courses
- [ ] Training
- [ ] Women's Health

---

## 8. Expected users in the next 12 months

> `[CHIFFRE RÉEL — nombre d'athlètes suivis aujourd'hui, et projection à
> 12 mois.]`
>
> Ne pas gonfler. Le palier Starter plafonne à 1 000 utilisateurs et un chiffre
> invraisemblable pour une entreprise individuelle attire l'attention au
> mauvais endroit. Une réponse du type « 15 aujourd'hui, 50 à 100 d'ici
> 12 mois » est crédible et suffisante.

---

## 9. Prior contact with Garmin or a Garmin distributor

> `[Non, sauf si Hugo a déjà échangé avec quelqu'un chez Garmin — dans ce cas,
> donner le nom : le formulaire le demande explicitement.]`

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
