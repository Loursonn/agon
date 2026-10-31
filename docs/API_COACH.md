# API coach — assistant IA

Cette API permet à ton assistant IA (Claude, sur ton ordinateur) de lire les
données de tes athlètes pour t'en faire des analyses, synthèses et
visualisations, et de te **proposer** des axes de travail ou des
modifications. Il ne modifie jamais rien seul : ses propositions t'attendent
dans Agon (badge « Claude » en haut de la fiche de l'athlète), et rien ne
change pour l'athlète tant que tu ne les as pas appliquées.

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

Ce que l'assistant reçoit : prénom, séances et charges réalisées, bien-être,
poids, blessures (zones, dates), records, objectifs, données de montre
autorisées. Jamais le texte libre écrit par l'athlète (ressenti, commentaires).
Les données Garmin ne sont jamais transmises à une IA.

Chaque lecture est journalisée.

## Routes

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/athletes` | Athlètes visibles (id, prénom) |
| GET | `/athletes/:id/summary?from=AAAA-MM-JJ&to=AAAA-MM-JJ` | Données d'une période (28 jours par défaut, 90 max) |
| GET | `/athletes/:id/program` | Programme en cours, avec les ids à citer dans les propositions |
| POST | `/athletes/:id/drafts` | Déposer une proposition |
| GET | `/drafts?status=pending\|applied\|rejected&athlete_id=…` | Propositions déposées et leur sort |
| GET | `/exercices?q=squat` | Chercher un exercice dans ta bibliothèque |

Aucune route ne supprime ni n'écrit directement.

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
| 429 | `trop_de_requetes` | Plus de 60 requêtes par minute |
