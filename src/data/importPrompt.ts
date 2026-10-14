/**
 * Prompt à donner à Claude / ChatGPT pour transformer une séance écrite
 * librement en texte au format YOXX, importable dans Agon
 * (« Importer un texte »). Proposé dans les Nouveautés (copier / télécharger .md).
 * Garder aligné avec docs/format-seance-yoxx.md et les parseurs src/lib/import/yoxx/.
 */

export const IMPORT_PROMPT_FILENAME = "agon-format-import-seances.md";

export const IMPORT_PROMPT = `# Agon — mettre une séance au format d'import

Tu es mon assistant de programmation. Je vais te donner une ou plusieurs séances d'entraînement écrites librement (notes, tableau, photo…). Réécris chaque séance au format ci-dessous, pour que je puisse la coller dans l'application Agon (bouton « Importer un texte »).

## Règles

- Réponds UNIQUEMENT avec le texte de la séance, dans un bloc de code, sans explication. Une séance = un bloc de code.
- Une ligne = une chose. La 1re ligne dit le type de séance.
- Chaque valeur porte son unité : 10' · 1'30 · 30" · 400m · 1,5km · 15cal · 80kg · 4'40/km.
- N'invente jamais une valeur absente : écris-la en clair entre guillemets (ex. "allure confortable") pour que je la complète.
- Choisis le type selon la séance :
  - course / vélo / rameur / cardio structuré → SÉANCE ÉNERGÉTIQUE
  - musculation (séries × répétitions) → SÉANCE MUSCU
  - séance mixte par blocs (HYROX, CrossFit, circuits, stations) → SÉANCE SPÉCIFIQUE

---

## 1. SÉANCE ÉNERGÉTIQUE

En-tête : SÉANCE ÉNERGÉTIQUE : titre · TYPE : VO2 | Tempo | Seuil | Footing | Fartlek | Autre · CONSIGNE : …
Étape : RÔLE DURÉE [MATÉRIEL] @ CIBLE | consigne
- Rôles : ÉCHAUFFEMENT · EFFORT · RÉCUP (active) · REPOS (passive) · RETOUR · LIBRE
- Durées : 10' · 1'30 · 30" · 1h20 · 400m · 1,5km · 15cal · LAP (fin au bouton)
- Matériel : [Course] [Rameur] [SkiErg] [BikeErg] [Vélo] [Elliptique] [Corde] [Autre]
- Cibles : Z2 · 80-85% FCmax · 150-160bpm · 4'40-4'50/km · 14-15km/h · 95-100% VMA · 90% Allure 10K · 250-280W · 90% FTP · 85-90rpm · chrono 1:37-1:40 · "texte libre"
- RPE : dans la consigne → | RPE 8
- Répétitions : GROUPE x6 (départ 4'30 si départ fixe) | consigne … puis FIN

Exemple :
\`\`\`
SÉANCE ÉNERGÉTIQUE : 6 x 400 + 4 x 200
TYPE : VO2
ÉCHAUFFEMENT 10' @ Z2 | + quelques accélérations
GROUPE x6
  EFFORT 400m [Course] @ chrono 1:37-1:40
  RÉCUP 1' [Course] @ 6'00-7'00/km
FIN
GROUPE x4
  EFFORT 200m @ chrono 0:46-0:48
  RÉCUP 30" @ 6'00-7'00/km
FIN
RETOUR 10' @ Z1
\`\`\`

---

## 2. SÉANCE MUSCU

En-tête : SÉANCE MUSCU : titre · ABRÉGÉ : FB2 · JOUR : Lundi · CONSIGNE : …
Bloc : BLOC Nom [Catégorie] repos 2'30 | consigne   (ou « départ 3' », « repos libre »)
- Catégories : [Echauffement] [Force] [Hypertrophie] [Explo/vitesse] [Mixte] [Cardio]
Exercice : A1 Nom : 3×8 @75% RIR 2 tempo 3-0-1 | commentaire
- Superset : A1.1 puis A1.2 (exercices enchaînés)
- Séries × reps : 3×8 · 3×8-10 · 4×10/8/6/6 · 3×20" ISO · 3×(3+3) R15" (cluster) · 3×AMRAP
- Charge : @80kg · @75% (du 1RM) · @70/75/80% (par série) · @PDC
- Intensité : RIR 2 · RIR 3/2/1 · RPE 8
- Méthode : méthode "Rest-Pause" sur séries 3-4
- Consigne libre : A1 Mobilité : libre "5' de flow"
- Plusieurs semaines : sous l'exercice, une ligne par semaine → S1 : 3×8 RIR 3 · S2 : 4×8 RIR 2

Exemple :
\`\`\`
SÉANCE MUSCU : Full body 2
ABRÉGÉ : FB2
JOUR : Vendredi

BLOC Échauffement [Echauffement] repos libre
A1 Mobilité hanches et épaules : libre "6'"

BLOC A [Force] repos 2'
A1.1 Split squat haltères : 3×8 RIR 3 | Par jambe.
A1.2 Développé militaire haltères : 3×8 RIR 3

BLOC B [Hypertrophie] repos 1'30
B1 Hip thrust : 3×10 @80kg RIR 2 | Pause 2" en haut.
  S1 : 3×10 RIR 3
  S2 : 4×10 RIR 2
\`\`\`

---

## 3. SÉANCE SPÉCIFIQUE (HYROX, CrossFit, circuits…)

En-tête : SÉANCE SPÉCIFIQUE : titre · SPORT : Hyrox · QUALITÉ : Compromised · CONSIGNE : …
Deux sortes de blocs :
- BLOC CLASSIQUE : titre | consigne — puis une ligne par exercice ou consigne :
  - Nom : prescription libre | repos 1' | notes
- BLOC WOD : titre | consigne — puis les étapes de l'énergétique (EFFORT, RÉCUP, GROUPE…) et des exercices :
  - EXO Nom QUANTITÉ @CHARGE | consigne
  - Quantité : 10 reps · 8-10 reps · 15m · 1km · 30" · 1'30 · 15cal
  - Charge : @110kg · @2x24kg · @75% · @PDC · @PDC+10kg
  - EMOM / départ fixe : GROUPE x10 départ 1' … FIN

Exemple :
\`\`\`
SÉANCE SPÉCIFIQUE : HYROX — Compromised running
SPORT : Hyrox
QUALITÉ : Compromised
CONSIGNE : Allure course régulière malgré la fatigue des stations.

BLOC CLASSIQUE : Échauffement | 15' progressif
- Footing : 8' | Z2
- Fentes marchées : 2x10 | repos 30" | par jambe

BLOC WOD : Compromised | régularité des 1000 m
GROUPE x4
  EFFORT 1km [Course] @ 4'20-4'30/km
  EXO Sled Push 50m @152kg | pas courts
  EXO Wall Ball Shot 20 reps @9kg
  RÉCUP 1'30 [Course] | marche
FIN

BLOC WOD : Finisher EMOM 10'
GROUPE x5 départ 2'
  EXO Burpee Broad Jump 10 reps
  EXO Farmers Carry 200m @2x24kg
FIN
\`\`\`

---

Voici ma séance à mettre au format :
`;
