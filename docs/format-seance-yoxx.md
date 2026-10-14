# Format YOXX — import de séances par copier-coller

Référence du texte que l'agent de programmation de Hugo produit et que l'app
importe **sans IA** (parseur déterministe, `src/lib/import/yoxx/`).

| Étape | Contenu | État |
|---|---|---|
| 1 | Séance **ÉNERGÉTIQUE** | ✅ disponible (bouton « Importer un texte ») |
| 2 | Séance **MUSCU** (toutes les méthodes) | ✅ disponible (Programmation athlète > Muscu, et Banque de séances) |
| 3 | Séance **SPÉCIFIQUE** (blocs classique + WOD) | ✅ disponible (éditeur de séance spécifique, catalogue Spécifique, Programmation athlète > Spécifique) |
| 4 | **PROGRAMME** complet d'un athlète | à faire |

Principes communs :

- **Une ligne = une chose.** Majuscules, accents et indentation facultatifs.
  Lignes vides, lignes `# …` / `// …` et blocs ```` ``` ```` ignorés. Les puces `- ` en début de ligne sont ignorées.
- **Chaque valeur porte son unité ou son mot-clé** : un chiffre seul n'est jamais deviné
  (`4'40/km` = allure, `chrono 1:37` = temps visé, `15cal` = calories, `250W` = puissance…).
- **Jamais tout bloquer.** Tout ce qui est lisible est importé. Chaque problème apparaît
  dans le rapport « Ligne N — explication » ; une valeur illisible devient une zone
  **« ⚠ À SAISIR »** à son endroit exact, et un clic sur la ligne du rapport y amène dans l'éditeur.
- La 1re ligne dit ce que contient le texte : `SÉANCE ÉNERGÉTIQUE :`, `SÉANCE MUSCU :`,
  `SÉANCE SPÉCIFIQUE :`, `PROGRAMME :`.
- Durées / temps acceptés partout : `10'` · `1'30` · `1'30"` · `30"` · `30s` · `10min` · `1h` · `1h20` · `10:00` · `1:30:00`.
- Apostrophes et guillemets typographiques (’ ″ « »), tirets longs (–) et `×` sont acceptés.

---

## 1. Séance ÉNERGÉTIQUE ✅

```
SÉANCE ÉNERGÉTIQUE : <titre>
TYPE : VO2 | Tempo | Seuil | Footing | Fartlek | Autre | <type perso>
STRUCTURE : fractionné | continu
MATÉRIEL : Course
CONSIGNE : <consigne générale de la séance>
IMAGE : https://…

<RÔLE> <DURÉE> [MATÉRIEL] @ <CIBLE> | <consigne de l'étape>
GROUPE x<N> [départ <durée>] | <consigne du groupe>
  … étapes ou sous-groupes …
FIN
```

### En-têtes de séance

| Paramètre app (`energy_sessions`) | Écriture | Si absent |
|---|---|---|
| Nom (`name`) | `SÉANCE ÉNERGÉTIQUE : 6 x 400 + 4 x 200` | « Séance importée » + avertissement |
| Type (`session_kind`) | `TYPE : VO2` · `Tempo` · `Seuil` · `Footing` (= Endurance, EF) · `Fartlek` · `Autre` | « Autres » + avertissement |
| Type personnalisé (`custom_kind`) | `TYPE : Côtes` (tout mot non standard) | — |
| Structure (`structure_type`) | `STRUCTURE : fractionné` ou `continu` | fractionné s'il y a un GROUPE, sinon continu |
| Matériel par défaut | `MATÉRIEL : Course` → appliqué aux étapes sans `[…]` (sauf REPOS) | aucun |
| Consigne de séance (`notes`) | `CONSIGNE : Terrain plat` (plusieurs lignes CONSIGNE = plusieurs paragraphes) | aucune |
| Illustration (`images`) | `IMAGE : https://…/photo.jpg` (une ligne par image) | aucune |
| Schéma terrain (`schema`) | **non importable** (dessin) → à faire dans l'éditeur | — |

### Étape : `<RÔLE> <DURÉE> [MATÉRIEL] @ <CIBLE> | <consigne>`

| Paramètre app | Écriture |
|---|---|
| Rôle `warmup` | `ÉCHAUFFEMENT` (ou `ÉCHA`) |
| Rôle `work` | `EFFORT` |
| Rôle `recovery` (récup **active**) | `RÉCUP` |
| Rôle `rest` (récup **passive**) | `REPOS` |
| Rôle `cooldown` | `RETOUR` (ou `RETOUR AU CALME`) |
| Rôle `open` | `LIBRE` |
| Durée : temps | `10'` · `1'30` · `30"` · `1h20` |
| Durée : distance | `400m` · `1,5km` (`m` = **mètres**, les minutes s'écrivent `'` ou `min`) |
| Durée : calories | `15cal` |
| Durée : bouton Lap | `LAP` |
| Matériel | `[Course]` `[Rameur]` `[SkiErg]` `[BikeErg]` `[Vélo]` `[Elliptique]` `[Corde]` `[Autre]` |
| Consigne de l'étape (`notes`) | tout ce qui suit `\|` |

### Cible (après `@`) — une seule par étape, valeur seule ou fourchette `a-b`

| Cible app (`target.kind`) | Écriture |
|---|---|
| Zone FC (`hr_zone`) | `Z2` (ou `Zone 2`), de Z1 à Z5 |
| % FC max (`hr_pct`) | `80-85% FCmax` |
| FC en bpm (`hr_bpm`) | `150-160bpm` |
| Allure (`pace`, min/km) | `4'40-4'50/km` |
| Vitesse (`pace`, km/h) | `14-15km/h` |
| % test allure (`pace_test_pct`) | `95-100% VMA` · `98% VC` · `90% Allure 10K` · `% Allure semi` · `% Allure marathon` |
| Puissance (`power`) | `250-280W` |
| % test puissance (`power_test_pct`) | `110% PMA` · `90% FTP` · `% PC30` · `% PC5` |
| Cadence (`cadence`) | `170-180spm` (pas/min, course) · `85-90rpm` (tours/min, vélo/rameur) |
| Temps visé sur la distance | `chrono 1:37-1:40` → affiché « 1:37-1:40 » (texte, l'app n'a pas de champ chrono) |
| Texte libre (`text`) | `"footing très lent"` (entre guillemets) |
| Aucune (`none`) | pas de `@` |
| **RPE** | pas une cible en énergétique : écrire `\| RPE 8` (consigne). `@ RPE 8` est accepté et déplacé dans la consigne. |

Une cible sans unité reconnue (ex. `@ 4.40`) est gardée en texte libre **avec un avertissement**.
Une cible invalide (ex. `Z9`, `90%` sans référence, `% XYZ`) devient « ⚠ À SAISIR ».

### Groupe répété

| Paramètre app (`EnergyGroup`) | Écriture |
|---|---|
| Répétitions (`repeat`) | `GROUPE x6` (aussi `GROUPE 6x`, `GROUPE ×6`) |
| Départ fixe (`departure_every_s`) | `GROUPE x5 départ 4'30` |
| Consigne du groupe (`instructions`) | `GROUPE x6 \| décrément < 1'15` |
| Fin du groupe | `FIN` (oubli → fermé automatiquement en fin de texte + avertissement) |
| Imbrication | un `GROUPE … FIN` dans un autre |
| Récup entre répétitions | une étape `RÉCUP` / `REPOS` **dans** le groupe (comme dans l'éditeur) |

### Exemples

```
SÉANCE ÉNERGÉTIQUE : 6 x 400 + 4 x 200
TYPE : VO2

ÉCHAUFFEMENT 10' @ Z2 | + qlq accel
ÉCHAUFFEMENT 5' [Autre] | Pogo jump bilatéraux (3x15 intention de raideur total)
GROUPE x6
  EFFORT 400m [Course] @ chrono 1:37-1:40
  RÉCUP 1' [Course] @ 6'00-7'00/km
FIN
EFFORT 1'
GROUPE x2
  EFFORT 200m @ chrono 0:46-0:48
  RÉCUP 30" @ 6'00-7'00/km
FIN
```

```
SÉANCE ÉNERGÉTIQUE : 2 × (10 × 30/30)
TYPE : VO2
MATÉRIEL : Course
CONSIGNE : Terrain plat, pas de descente (périostite).

ÉCHAUFFEMENT 15' @ Z1 | Footing facile + RACs cheville / hanche / rotations tibia + 3 lignes droites
ÉCHAUFFEMENT 3' | RPE 7 — juste sous l'intensité visée
GROUPE x2 | Allure la plus rapide tenable IDENTIQUE sur les 20 reps. Les 2-3 premières plus tranquilles.
  GROUPE x10
    EFFORT 30" | RPE 8
    RÉCUP 30" @ "footing très lent"
  FIN
  RÉCUP 3' @ Z1 | Footing
FIN
RETOUR 10' @ Z1 | Footing
```

```
SÉANCE ÉNERGÉTIQUE : Seuil mixte rameur / course
TYPE : Seuil

ÉCHAUFFEMENT 10' [Rameur] @ 150-170W
GROUPE x5 départ 4'30 | Départ fixe : le temps restant = récup passive
  EFFORT 1000m [Course] @ 95-98% VC
FIN
REPOS 2'
GROUPE x4
  EFFORT 15cal [BikeErg] | RPE 9
  RÉCUP 1'30 [BikeErg] @ Z1
FIN
RETOUR 8' [Course] @ 9-10km/h
```

---

## 2. Séance MUSCU ✅

Où : **Programmation d'un athlète → Muscu → « Importer un texte »** (ajoute la séance à son planning)
et **Bibliothèque → Musculaire → Séances → « Importer un texte »** (ajoute à la banque).

```
SÉANCE MUSCU : <titre>
ABRÉGÉ : FB2
JOUR : Lundi … Dimanche
RÉCURRENCE : hebdo | unique
SEMAINES : 4
CONSIGNE : <consigne générale>

BLOC <nom> [Catégorie] <timing> <N séries> | <consigne du bloc>
A1 <Exercice> : <prescription> | <commentaire>
A2.1 <Exercice> : <prescription>          ← A2.1 + A2.2 = superset
A2.2 <Exercice>
  S1 : <prescription>                      ← une ligne par semaine
  S2 : <prescription>
```

### En-têtes de séance (`ProgSession`)

| Paramètre app | Écriture | Si absent |
|---|---|---|
| Nom | `SÉANCE MUSCU : Full body 2` | « Séance importée » + avertissement |
| Abrégé (`short`) | `ABRÉGÉ : FB2` | initiales du titre (« Full body 2 » → FB2) |
| Jour (`day_of_week`) | `JOUR : Vendredi` | aucun jour |
| Récurrence | `RÉCURRENCE : hebdo` ou `unique` | hebdo |
| Multi-semaine (`multi_semaine`, `nb_semaines`) | automatique dès qu'il y a des lignes `S1 :`, `S2 :` ; `SEMAINES : 5` pour forcer le nombre | séance sur 1 semaine |
| Consigne de séance | `CONSIGNE : …` → placée dans la consigne du **1er bloc** (pas de champ séance en muscu) | — |

### Bloc (`Bloc`) : `BLOC <nom> [Catégorie] <timing> <séries> | <consigne>`

| Paramètre app | Écriture |
|---|---|
| Nom | le texte après `BLOC` (ex. `BLOC A`, `BLOC Échauffement`) |
| Catégorie | `[Echauffement]` `[Force]` `[Hypertrophie]` `[Explo/vitesse]` `[Mixte]` `[Cardio]` — absente = Mixte |
| Timing repos entre séries | `repos 2'30` |
| Timing départ fixe | `départ 3'` |
| Timing libre | `repos libre` ou rien |
| Nombre de séries du bloc (`series_mode` fixe) | `3 séries` (ou `3 tours`) |
| Consigne du bloc (`instructions`) | après `\|` |
| Couleur | automatique (palette de l'app, dans l'ordre des blocs) |

Sans aucune ligne `BLOC`, les blocs sont déduits des lettres (`A1`, `A2` → bloc A ; `B1` → bloc B).

### Exercice : `<code> <nom> : <prescription> | <commentaire>`

- **Code** : `A1`, `A2`… = exercices séparés ; `A1.1`, `A1.2` (même `A1`) = **superset** (enchaînés).
- **Nom** : cherché dans ta bibliothèque. Nom identique (majuscules, accents, tirets ignorés) → lié.
  Noms proches → l'écran d'import te les propose (choisir, ou « Créer »). Aucun nom proche → **créé** dans ta bibliothèque.
- **Commentaire** (`comment`) : après `|`.

| Paramètre app (`ExerciceParams`) | Écriture |
|---|---|
| Séries × reps | `3×8` (aussi `3x8`) |
| Fourchette de reps (`reps_max`) | `3×8-10` |
| Reps par série | `4×10/8/6/6` |
| ISO (secondes) | `3×20" ISO` ou `3×20"` |
| Cluster | `3×(3+3) R15"` = 3 séries de 2 clusters de 3 reps, 15 s entre clusters (affiché « 3×(3+3 + 15s) ») |
| Charge en kg | `@80kg` · par série `@60/70/80kg` |
| Charge en % du 1RM | `@75%` · par série `@70/75/80/80%` (calculée depuis les records ; sans record le % est gardé) |
| Poids du corps | `@PDC` |
| RIR | `RIR 2` · par série `RIR 3/2/1` |
| RPE | `RPE 8` → **converti en RIR 2** (RIR = 10 − RPE ; `RPE 5-6` → RIR 4) |
| Tempo | `tempo 3-0-1` · `tempo 3-0-1-0` · `tempo 3010` · `tempo 42X` (gardé tel qu'écrit) |
| Mode libre (`libre_text`) | `A1 Mobilité : libre "5' de flow"` |
| Méthode (`methode_id`) | `méthode "Rest-Pause"` en **fin de ligne**, nom exact de ta banque entre guillemets |
| Séries concernées (méthodes « sur une série ») | `méthode "Drop Set" sur séries 3-4` (sinon toutes les séries) |
| AMRAP | `3×AMRAP` → méthode « AMRAP » de la banque |

Méthodes :
- Avec séries×reps écrits → les paramètres du texte sont gardés et la méthode est attachée
  (méthode « sur une série » : le découpage en sous-séries vient de la méthode si le texte n'en donne pas).
- Méthode seule (`A2 Squat : méthode "6 x 6"`) → paramètres pris dans la méthode.
- Méthode introuvable → l'exercice reste en classique avec le commentaire **« ⚠ Méthode non importée : … »** + erreur dans le rapport.
- Méthodes de la banque au 12/10 : 5×5, AMRAP, Pyramide descendante, Pyramide montante, Tempo contrôlé, Vagues de charge,
  Volume constant, 21 rep, Cluster, Double contraction, Drop Set, Drop Set mécanique, Myoreps, Rest-Pause,
  4 x 10-12, 4 x 12-15, 4 x 4-6, 4 x 6-8, 5x5 -> 8x8, 6 x 6, 10-8-6-15 : Thibarmy, 3/7 ondulatoire (4semaines), 3/7 linéaire legeard.

### Progression par semaine : une ligne par semaine sous l'exercice

```
A1.1 Split squat haltères | Par jambe.
  S1 : 3×8 RIR 3
  S2 : 4×8 RIR 3
  S3 : 4×8 RIR 2
```
- `S1 :` (ou `Semaine 1 :`) = **semaine**. Les valeurs par **série** s'écrivent avec des `/` (`4×10/8/6/6`).
  ⚠ Dans l'app, l'affichage « S1: 2×60% / S2: … » d'un exercice veut dire *série 1, série 2* : ne pas confondre.
- Une semaine non écrite reprend la précédente. Un exercice sans lignes `S` garde les mêmes paramètres toutes les semaines.
- Si la ligne de l'exercice a aussi une prescription, elle sert de base aux semaines non écrites.
- **Réglages communs** : un tempo, une charge, un RIR ou `ISO` écrit sur la ligne de l'exercice s'applique à **toutes ses semaines**,
  sauf si la ligne de semaine le réécrit :
  ```
  B1.1 Hip thrust : tempo 4012
    S1 : 3×8 RIR 3
    S2 : 4×8 RIR 3
    S3 : 4×8 RIR 2      ← tempo 4012 sur les 3 semaines
  ```

### Exemple : Full body 2 d'Eva

```
SÉANCE MUSCU : Full body 2
ABRÉGÉ : FB2
JOUR : Vendredi
CONSIGNE : Easy day, lendemain du compromised.

BLOC Échauffement [Echauffement] repos libre
A1 RACs hanche, cheville, épaule : libre "6'"
A2 Mobilité thoracique : libre "4' — extension sur banc, rotations en quadrupédie"

BLOC A [Force] repos 2'
A1.1 Split squat haltères | Par jambe. Amplitude sans douleur.
  S1 : 3×8 RIR 3
  S2 : 4×8 RIR 3
A1.2 Développé militaire haltères : 3×8 RIR 4

BLOC B [Force] repos 2'
B1.1 Hip thrust : 3×10 RIR 4 | Pause 2" en haut.
B1.2 Rowing haltère : 3×10 RIR 4 | Par bras.

BLOC C [Mixte] repos libre
C1.1 Abduction de hanche élastique : 3×15 | Par côté.
C1.2 Copenhagen plank levier court : 3×20" ISO | Par côté.
C2 Extension lombaire banc 45° (ou GHD) : 3×12-15 | Pause 2" en haut.
```

Exemple avec cluster et méthode (Full body 1 tel qu'enregistré dans la banque) :

```
BLOC A [Mixte] repos 2'29
A1.1 Box Squat barre : 3×20" ISO @75% RIR 4
A1.2 Traction assistée : 3×(3+3) R15" @PDC RIR 3
BLOC C [Mixte] repos 1'30
C1.1 Leg curl swiss ball : 3×6-8 @PDC RIR 3 tempo 401
C1.2 Leg extension : 3×6 @75% RIR 2 méthode "Double contraction"
```

## 3. Séance SPÉCIFIQUE ✅

Où : **« Importer un texte »** dans l'éditeur d'une séance spécifique, le catalogue Spécifique
et Programmation d'un athlète → Spécifique. L'import remplit l'éditeur (blocs), puis « Enregistrer » / « Enregistrer & planifier ».

```
SÉANCE SPÉCIFIQUE : <titre>
SPORT : Hyrox
QUALITÉ : Compromised
CONSIGNE : <consigne générale>
IMAGE : https://…

BLOC CLASSIQUE : <titre> | <consigne du bloc>
- <nom> : <prescription libre> | repos 1' | <notes>

BLOC WOD : <titre> | <consigne du bloc>
<lignes de l'énergétique : ÉCHAUFFEMENT / EFFORT / RÉCUP / REPOS / RETOUR / LIBRE, GROUPE … FIN>
EXO <exercice> <quantité> @<charge> | <consigne>
```

### En-têtes

| Paramètre app | Écriture | Si absent |
|---|---|---|
| Nom | `SÉANCE SPÉCIFIQUE : Compromised Run` | « Séance importée » |
| Sport (`sport_id`) | `SPORT : Hyrox` — lié par nom, **créé** s'il n'existe pas | à choisir dans l'éditeur |
| Qualité physique (`quality_id`) | `QUALITÉ : Compromised` — liée par nom, **créée** sinon | aucune |
| Consigne de séance (`notes`) | `CONSIGNE : …` (affichée à l'athlète) | aucune |
| Illustration | `IMAGE : https://…` | aucune |
| Schéma terrain | non importable (dessin) | — |

### Bloc CLASSIQUE

| Paramètre app (`ClassiqueItem`) | Écriture |
|---|---|
| Titre du bloc / consigne du bloc | `BLOC CLASSIQUE : Échauffement en autonomie \| consigne` |
| Nom (consigne ou exercice) | texte avant `:` — **consigne simple** ; lié à la bibliothèque (vidéo) seulement si le nom est **identique** à un exercice |
| Prescription libre | après `:` (ex. `4x30m, 5x8, 3'`) |
| Repos | segment `\| repos 1'` |
| Notes | autres segments après `\|` |

### Bloc WOD

Toutes les lignes de l'énergétique (rôles, durées, matériel, cibles, `GROUPE x6 départ 4' | consigne … FIN`), plus :

| Paramètre app (`ExerciseInterval`) | Écriture |
|---|---|
| Exercice | `EXO <nom>` — nom identique → lié ; noms proches → choix ; sinon **créé** dans la bibliothèque |
| Répétitions | `10 reps` · `8-10 reps` (ou `EXO Wall ball : 15`) |
| **Distance** | `15m` · `1km` (ex. Sled Push 15 m) |
| Temps | `30"` · `1'30` |
| Calories | `15cal` |
| Charge | `@110kg` · `@75%` (du 1RM) · `@PDC` · `@PDC+10kg` |
| Consigne | après `\|` |

Nom et quantité : `EXO Sled Push 15m @110kg` ou, plus sûr si le nom contient des chiffres, `EXO Sled Push : 15m @110kg`.

### Exemple : Compromised Run

```
SÉANCE SPÉCIFIQUE : Compromised Run
SPORT : Hyrox
QUALITÉ : Compromised
CONSIGNE : Wall balls toujours avec une box dessous.

BLOC CLASSIQUE : Échauffement en autonomie | Mobilisation + Run + Force progressive + stimulation cardiaque
- Mobilisation + Run + Force progressive : 4x30m, 5x8, 3' | repos 1'

BLOC WOD : Compromised SPush + Run + WB | Aucun bloc > bloc le plus rapide + 1'15
GROUPE x6
  EXO Sled Push 15m @110kg | Buste un peu plus haut. Pousse le sol derrière toi.
  EFFORT 600m [Course] @ 4'45/km
  EXO Wall Ball Shot 10 reps @6kg
  RÉCUP 2' [Course] | Footing léger permet de récup
FIN
```
