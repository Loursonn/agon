# API coach — assistant IA

Cette API permet à ton assistant IA (Claude, sur ton ordinateur) de lire les
données de tes athlètes pour t'en faire des analyses, synthèses et
visualisations, et de planifier avec toi. Il n'inscrit rien sans ton accord :
- par défaut, il **dépose** une proposition qui t'attend dans Agon (badge
  « Claude » en haut de la fiche de l'athlète) ; rien ne change pour
  l'athlète tant que tu ne l'as pas appliquée ;
- quand tu lui dis de l'inscrire directement, il **l'applique** lui-même.

Dans les deux cas, tout ce qui a été inscrit **s'annule** : Agon garde l'état
d'avant, et « Annuler » (dans le panneau Claude, ou en le demandant à
l'assistant) remet tout comme avant. Ce que l'athlète a réalisé entre-temps
(une séance faite) n'est jamais effacé.

## Démarrer

1. Dans Agon : **Paramètres → Assistant IA (Claude) → Générer une clé**.
   La clé (`agon_…`) n'est affichée qu'une fois : copie-la.
2. Donne à ton assistant la clé, l'adresse de base et le mode d'emploi
   téléchargeable dans les Nouveautés. Il faut un Claude qui peut lancer des
   commandes sur ton ordinateur (Claude Code) : Claude dans le navigateur
   (claude.ai) ne peut pas envoyer l'en-tête d'authentification.

   Adresse de base :

```
https://mxbfnkkbtmbrauvqplrt.supabase.co/functions/v1/coach-api
```

Chaque requête porte l'en-tête :

```
Authorization: Bearer agon_xxxxxxxx
```

Une clé perdue ne se récupère pas : révoque-la et génère-en une autre.

## Qui est visible

Seuls apparaissent les athlètes **rattachés à toi** qui ont **accepté le
traitement de leurs données par l'IA** sous le texte qui nomme ton assistant
(en vigueur depuis le 30 octobre 2026). Un athlète absent de la liste n'a pas
donné cet accord, ou l'a donné sous l'ancien texte qui ne nommait que Google
Gemini : il peut l'activer dans son profil, section Confidentialité.

Ce que l'assistant reçoit : prénom, séances et charges réalisées, séances
énergétiques (durée, distance, RPE), thèmes du jour que tu as posés,
compétitions, tests (valeurs mesurées), événements du calendrier de l'athlète
(dates et titre), bien-être, poids, blessures (zones, dates), records,
objectifs, données de montre autorisées. Jamais le texte libre écrit par
l'athlète sur ses séances, ses tests, ses compétitions ou ses blessures ;
seul le titre de ses événements de calendrier passe, et le texte de
consentement le lui dit.
Les données Garmin ne sont jamais transmises à une IA.

Chaque lecture est journalisée.

## Routes

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/athletes` | Athlètes visibles (id, prénom) |
| GET | `/athletes/:id/summary?from=AAAA-MM-JJ&to=AAAA-MM-JJ` | Données d'une période (28 jours par défaut, 90 max) |
| GET | `/athletes/:id/program` | Programme en cours, avec les ids à citer dans les propositions |
| POST | `/athletes/:id/drafts` | Déposer une proposition |
| GET | `/drafts?status=pending\|applied\|rejected\|undone&athlete_id=…` | Propositions et leur sort |
| POST | `/drafts/:id/appliquer` | Appliquer une proposition déposée |
| POST | `/drafts/:id/annuler` | Annuler une proposition appliquée (`{ "forcer": true }` si besoin, voir plus bas) |
| GET | `/exercices?q=squat` | Chercher un exercice dans ta bibliothèque |
| GET | `/seances-energie?q=vma` | Chercher une séance énergétique dans ta banque (sans `q` : les 50 dernières) |

Les écritures passent toutes par une proposition, appliquée par toi ou à ta
demande, et annulable.

### Exemples

```bash
BASE=https://mxbfnkkbtmbrauvqplrt.supabase.co/functions/v1/coach-api
KEY=agon_xxxxxxxx

curl -s -H "Authorization: Bearer $KEY" $BASE/athletes
curl -s -H "Authorization: Bearer $KEY" "$BASE/athletes/<id>/summary?from=2026-10-01&to=2026-10-28"
curl -s -H "Authorization: Bearer $KEY" $BASE/athletes/<id>/program
```

## Propositions

Le mode d'emploi demande à l'assistant de **présenter chaque proposition dans
la discussion d'abord**, et de ne la déposer dans Agon que lorsque tu le lui
demandes. Tu valides donc deux fois : en discussion, puis « Appliquer » dans
Agon.

Une proposition a un `kind`, un `title` (120 caractères max) et un `body`
(4 000 max), plus des `ops` sauf pour un axe de travail. 50 opérations maximum.

### Appliquer directement, annuler

Ajoute `"appliquer": true` à la proposition pour qu'elle soit appliquée tout
de suite. Le mode d'emploi demande à l'assistant de ne le faire que quand tu
le lui dis explicitement. Si elle ne s'applique pas (une séance citée a
disparu), rien n'est modifié et elle reste en attente dans Agon.

`POST /drafts/:id/annuler` défait une proposition appliquée. Si le programme
ou les objectifs ont été modifiés depuis, la réponse est `409
modifie_depuis` : annuler effacerait aussi ces modifications. L'assistant te
demande alors confirmation avant de renvoyer `{ "forcer": true }`.

### Axe de travail — texte seul

```bash
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  $BASE/athletes/<id>/drafts -d '{
    "kind": "axe",
    "title": "Sommeil avant les séances de force",
    "body": "Couchée après minuit 4 soirs sur 7 ce mois-ci, et RPE moyen +1,5 le lendemain. Piste : avancer le coucher les veilles de séance lourde."
  }'
```

### Programme

`GET /program` donne les ids de séance, de bloc et d'exercice, et pour chaque
séance `prochaine_occurrence` : le numéro de la prochaine fois qu'elle aura
lieu.

| op | Champs |
|---|---|
| `add_exercice` | `session_id`, `bloc_id`, `position?`, `exercice: { exercise_name, mode?: "classique"\|"libre", libre_text?, comment?, params }` |
| `update_exercice` | `session_id`, `exercice_id`, `a_partir_de` (obligatoire avec `params`), `params?`, `comment?`, `libre_text?` |
| `remove_exercice` | `session_id`, `exercice_id` |
| `set_bloc_instructions` | `session_id`, `bloc_id`, `instructions` |

`a_partir_de` : numéro de l'occurrence de la séance à partir de laquelle la
modification vaut — en général `prochaine_occurrence`. Elle vaut jusqu'à la
prochaine occurrence qui a ses propres valeurs ; les séances déjà faites ne
changent pas.

`params` : `nb_series` (1–20) obligatoire ; `reps`, `reps_max`, `charge`,
`rir`, `tempo`, `reps_mode` (`"EC"` ou `"iso"`) acceptent une valeur seule
(identique pour toutes les séries) ou un tableau (une valeur par série) ;
`charge_unit` : `"kg"` (défaut), `"%RM"` ou `"PDC"`.

Un exercice dont le nom correspond à ta bibliothèque y est relié ; sinon il est
ajouté hors bibliothèque, et la proposition l'indique. Les exercices en mode
méthode se modifient dans Agon.

```bash
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  $BASE/athletes/<id>/drafts -d '{
    "kind": "programme",
    "title": "Squat : passer en force",
    "body": "RIR 3 tenu sans peine sur les 3 dernières séances.",
    "ops": [{
      "op": "update_exercice", "session_id": "<s>", "exercice_id": "<e>",
      "a_partir_de": 7,
      "params": { "nb_series": 5, "reps": 3, "charge": 82.5, "charge_unit": "%RM", "rir": 2 }
    }]
  }'
```

### Semaine d'entraînement

Une semaine se propose en une seule proposition `"kind": "semaine"` : elle
crée des séances, les place sur des dates et pose le thème de chaque jour. Tu
l'appliques d'un clic. Elle **ajoute** et ne supprime rien : une séance déjà
prévue le reste. Seul le thème d'un jour qui en avait déjà un est remplacé,
et l'aperçu montre l'ancien barré.

Dates au format `AAAA-MM-JJ`, d'aujourd'hui à 56 jours plus tard. Pour voir
ce qui est déjà prévu, l'assistant lit `GET /summary` sur la semaine à venir
(`from` et `to` peuvent être dans le futur).

| op | Champs |
|---|---|
| `create_session` | `ref`, `name`, `short?`, `blocs: [{ name, category?, instructions?, exercices: [exercice] }]` |
| `place_session` | `date`, et `session_id` (séance du programme) **ou** `ref` (séance créée plus haut) |
| `create_energy_session` | `ref`, `name`, `session_kind`, `structure_type?`, `notes?`, `intervals` |
| `place_energy_session` | `date`, et `energy_session_id` (de ta banque) **ou** `ref` |
| `set_day_theme` | `date`, `label?` (40 car.), `intensity?`, `dominante?`, `color?` (`#rrggbb`), `note?` |

- `ref` : un nom court choisi par l'assistant (`"vma"`, `"force-a"`), pour
  placer ensuite la séance qu'il vient de créer. Créer avant de placer.
- Une séance de musculation créée est **ponctuelle** : elle n'a lieu qu'aux
  dates où elle est placée. `exercice` : comme dans `add_exercice`.
  `category` : `Echauffement`, `Force`, `Hypertrophie`, `Explo/vitesse`,
  `Mixte` (défaut) ou `Cardio`.
- Une séance énergétique créée est propre à l'athlète (elle n'entre pas dans
  ta banque). `session_kind` : `vo2`, `tempo`, `seuil`, `footing`, `fartlek`,
  `autre`. Les séances spécifiques (exercices, format classique) se
  construisent dans Agon.
- `intensity` : `hard`, `moyen`, `easy`, `recup_active`, `repos`.
  `dominante` : `force`, `puissance_vitesse`, `volume`, `aerobie`, `seuil`,
  `hyrox`, `technique`, `mixte`. Sans `color`, celle de l'intensité.

`intervals` reprend la structure de l'éditeur énergie :

```json
[
  { "type": "interval", "role": "warmup", "duration": { "kind": "time", "value": 600 },
    "target": { "kind": "hr_zone", "zone": 2 } },
  { "type": "group", "repeat": 6, "children": [
    { "type": "interval", "role": "work", "duration": { "kind": "distance", "value": 400 },
      "target": { "kind": "pace_test_pct", "test_metric": "VMA", "min": 95, "max": 100 },
      "equipment": "course" },
    { "type": "interval", "role": "recovery", "duration": { "kind": "time", "value": 60 } }
  ] }
]
```

| Champ | Valeurs |
|---|---|
| `role` | `warmup`, `work`, `recovery`, `rest`, `cooldown`, `open` |
| `duration` | `{ kind: "time", value: secondes }`, `"distance"` (mètres), `"calories"`, ou `{ kind: "lap_button" }` |
| `target` | `none` · `hr_zone` (`zone` 1–5) · `hr_pct` / `hr_bpm` / `power` (`min`, `max`) · `pace` (`min_s_per_unit`, `max_s_per_unit` en secondes par km, `unit` `min_per_km` ou `kmh`) · `pace_test_pct` (`test_metric` `VMA`, `VC`, `Allure 10K`, `Allure semi`, `Allure marathon`) · `power_test_pct` (`PMA`, `FTP`, `PC30`, `PC5`) · `cadence` (`unit` `spm` ou `rpm`) · `text` (`value`) |
| `equipment` | `course`, `rameur`, `skierg`, `bikeerg`, `velo`, `elliptique`, `corde`, `autre` |
| groupe | `repeat` (1–50), `children`, `rest_between?`, `departure_every_s?`, `instructions?` ; 3 niveaux au plus |

Si une application est interrompue (réseau), un nouveau clic sur
« Appliquer » termine la semaine sans rien poser en double.

### Planning

`set_session_schedule` : `session_id`, `day_of_week` (0 = lundi … 6 =
dimanche, ou `null`), `recurrence?` (`"weekly"` ou `"once"`).

### Objectifs

`set_goals` : `sessionsPerWeek?` (1–14), `sleepTarget?` (heures),
`sleepBedtime?` et `sleepWakeup?` (`{ "h": 22, "m": 30 }`).

## Erreurs

Toutes en JSON : `{ "error": "code", "message": "explication" }`.

| Statut | Code | Sens |
|---|---|---|
| 400 | `proposition_invalide` | Le message nomme le champ fautif |
| 400 | `periode_invalide` | Dates mal formées ou plus de 90 jours |
| 401 | `cle_invalide` | Clé absente, inconnue ou révoquée |
| 403 | `compte_non_coach` | La clé appartient à un compte qui n'est plus coach |
| 404 | `athlete_introuvable` | Pas ton athlète, ou pas d'accord IA |
| 409 | `deja_traitee` | Proposition déjà appliquée, écartée ou annulée |
| 409 | `ne_s_applique_plus` | Elle cite quelque chose qui n'existe plus ; rien n'est modifié |
| 409 | `modifie_depuis` | Annulation : le contenu a changé depuis ; `forcer` pour annuler quand même |
| 429 | `trop_de_requetes` | Plus de 60 requêtes par minute |
