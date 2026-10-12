# Format YOXX — import de séances par copier-coller

Référence du texte que l'agent de programmation de Hugo produit et que l'app
importe **sans IA** (parseur déterministe, `src/lib/import/yoxx/`).

| Étape | Contenu | État |
|---|---|---|
| 1 | Séance **ÉNERGÉTIQUE** | ✅ disponible (bouton « Importer un texte ») |
| 2 | Séance **MUSCU** (toutes les méthodes) | inventaire fait, notation à valider |
| 3 | Séance **SPÉCIFIQUE** (blocs classique + WOD) | inventaire fait, notation à valider |
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

## 2. Séance MUSCU — inventaire (notation à valider à l'étape 2)

Stockage : `app_data` clé `asp:prog` (par athlète) et `asp:session-bank` / banque de blocs (par coach).
Types : `src/features/coach/components/programmation/types.ts`, méthodes : `src/types/trainingMethods.ts`.

**Séance** (`ProgSession`) : nom · abrégé (`short`, ex. FB1) · jour (`day_of_week`) · récurrence (`weekly` | `once`) ·
multi-semaine (`multi_semaine`, `nb_semaines`) · blocs.

**Bloc** (`Bloc`) : nom · catégorie (`Echauffement` · `Force` · `Hypertrophie` · `Explo/vitesse` · `Mixte` · `Cardio`) · couleur ·
séries du bloc (`series_mode` libre | fixe + `series_count`) · timing (`timing_mode` libre | départ toutes les X | repos X entre séries,
en min + s) · consigne du bloc (`instructions`) · exercices.

**Exercice** (`Exercice`) : exercice de la banque (`exercise_id`, `exercise_name`) · mode (`classique` | `methode` | `libre` + `libre_text`) ·
méthode (`methode_id`, `applied_to_sets` = sur quelles séries pour une méthode de scope « set ») · superset avec le suivant
(`superset_with_next`) · multi-semaine propre à l'exercice · commentaire coach (`comment`) · paramètres (une fois, ou par semaine S1/S2/S3…).

**Paramètres** (`ExerciceParams`), chacun « global » ou « par série » :
nombre de séries · reps (+ `reps_max` = fourchette) · EC / ISO (`reps_mode`) · unité de charge (`%RM` | `kg` | `PDC`) · charge ·
RIR (vide = libre) · tempo (`3-0-1` / `3-0-1-0`) · cluster (`nb_clusters`, reps par cluster, récup en s) · 1RM fictif (`manual_rm`).

**Méthodes** (`training_methods`, 3 scopes) :
- `classic` : séries × reps (fixe / fourchette / AMRAP), repos (libre / fixe / variable), charge (identique / montante / descendante / par série, kg ou %1RM), RIR.
- `set` : sous-séries sur une série (nombre fixe ou fourchette ; reps fixes / dégressives / progressives / AMRAP / motif `5,4,3,2,1` ; récup intra libre ou fixe ; charge identique / libre / ±% / par sous-série).
- `exercise` : remplace toutes les séries (reps fixes / montantes / descendantes / motif ; repos ; charge ; tempo).
- toutes : `weekly_configs` (config par semaine).
- Officielles (seed) : Cluster, Drop Set, Rest-Pause, Myoreps, Drop Set mécanique, Pyramide montante, Pyramide descendante,
  Volume constant, AMRAP, Tempo contrôlé, Vagues de charge (+ méthodes perso de Hugo, à recenser via Supabase).

**Notation proposée (brouillon)** :

```
SÉANCE MUSCU : FullBody 1
ABRÉGÉ : FB1

BLOC Échauffement [Echauffement] repos libre
A1 RAC Hanche + Cheville : S1 2×60% · S2 2×60% · S3 2×60%
A2 RAC Genou : S1 4×60% · S2 4×80% RIR 2
A3 Montée en charge : 1×1

BLOC A [Force] repos 2'29 | consigne du bloc
A1.1 Box Squat barre : 3×20 @75% RIR 4 tempo 3-0-1
A1.2 Traction assistée : 3 × 3 R15 @PDC RIR 3          ← cluster (3×(3+3 + 15s))
```
- `A1, A2` = exercices séparés ; `A1.1, A1.2` = superset (enchaînés).
- Charge : `@80kg` · `@75%` (du 1RM, calculé depuis les records ; sans record le % est gardé) · `@PDC` · `RIR 2` · `RPE 8` → converti en **RIR 2** (RIR = 10 − RPE).
- Par série : `4×10/8/6/6 @70/75/80/80%` · fourchette `3×8-10` · `AMRAP` · `ISO`.
- Méthode : `méthode Rest-Pause` (nom exact de la banque) ; méthode introuvable → « méthode non importée » à cet endroit.
- Semaines : `S1 … · S2 … · S3 …`.

## 3. Séance SPÉCIFIQUE — inventaire (notation à valider à l'étape 3)

Stockage : `energy_sessions` avec `session_kind = specifique`, `format = classique`, `classique_structure.blocks`.

**Séance** : nom · sport (`sport_id`, ex. Hyrox) · qualité physique (`quality_id`, ex. Compromised) · consigne · images · schéma terrain.

**Bloc CLASSIQUE** (`ClassiqueBlock`) : titre · consigne (`instructions`) · items : nom (exercice de la banque ou consigne libre) ·
prescription libre (« 4x30m, 5x8, 3' ») · repos · notes · vidéo (via l'exercice).

**Bloc WOD** (`WodBlock`) : titre · consigne · étapes = **mêmes étapes que l'énergétique** (intervalles, groupes, départ fixe)
**+ étape EXERCICE** (`ExerciseInterval`) : exercice de la banque · rôle · reps min / max · charge (`kg` | `PDC` | `%RM`) ·
durée (temps) · consigne · vidéo.

**Notation proposée (brouillon)** :

```
SÉANCE SPÉCIFIQUE : Compromised Run
SPORT : Hyrox
QUALITÉ : Compromised

BLOC CLASSIQUE : Échauffement en autonomie | consigne du bloc
- Mobilisation + Run + Force progressive : 4x30m, 5x8, 3' | repos 1'

BLOC WOD : Compromised SPush + Run + WB | décrément < 1'15
GROUPE x6
  EXO Sled Push 15m @ 110kg
  EFFORT 600m [Course] @ 4'45/km
  EXO Wall Ball Shot 10 reps @ 6kg
  RÉCUP 2' [Course] | Footing léger permet de récup
FIN
```

**Manque repéré dans l'app** : une étape EXERCICE du WOD ne sait saisir qu'un **temps**, pas une **distance**
(Sled Push « 15 reps » au lieu de « 15 m »). Le type de données l'accepte déjà (`duration.kind = distance`) :
à ajouter dans l'éditeur et l'affichage avant l'étape 3.
