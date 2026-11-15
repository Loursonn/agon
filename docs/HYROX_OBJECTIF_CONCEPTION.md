# HYROX : analyse de course contre un objectif construit depuis le run (conception)

Phase 1, du 15/11/2026. **Rien n'est codé.** Ce document sert à la validation d'Hugo, point par point (questions en §12).
Notes de recherche complètes (sources, citations) : `side-session-notes/.../hyrox-objectif-recherche-roxfit.md` et `hyrox-objectif-recherche-donnees.md`.

---

## 0. En bref

1. **Un objectif, pas une norme.** On choisit le **run moyen** dont l'athlète est capable sur HYROX (ex. 4:55 /km), sa division, et Agon en déduit les 8 runs, les 8 stations, la Roxzone et le chrono final, tels qu'ils sont chez les athlètes qui courent à cette allure. Chaque objectif reste modifiable, comme le plan de course actuel.
2. **ROXFIT ne fait pas exactement ça** (vérifié, §1) : leur outil part d'un **chrono final visé**. Ce n'est pas gênant : avec une table « run moyen → splits », chrono visé et run moyen se déduisent l'un de l'autre. Agon proposera les deux entrées, run moyen en premier. Le calculateur **RoxHype**, lui, part bien du temps de course : c'est la donnée qu'on reprend.
3. **Données.** RoxHype publie les splits médians **à temps de course égal** (1,2 M de résultats, 7 divisions dont Pro et doubles). Ils recoupent la table pyrox déjà en prod à moins de 6 s sur 6 stations sur 8 (§3.3). Tableau à valider tranche par tranche en §3.4. Deux points juridiques pour Hugo (§3.5) : toutes ces sources viennent de résultats aspirés sur results.hyrox.com, et les CGU de RoxHype excluent l'usage commercial (déjà le cas pour le chrono estimé des tests HYROX).
4. **Fin du « fort / dans la norme / faible »** (et des « top x % » calculés, et des équivalences entre catégories). Il reste le **rang officiel** (rang / participants, rang du groupe d'âge).
5. **Course réalisée** : chrono contre objectif en tête, puis 17 lignes « objectif · réalisé · écart en s » avec 3 états : en avance / dans l'objectif / en retard, et une courbe d'avance-retard cumulée.
6. **Saison** du 15 août au 14 août suivant (« Saison 26/27 »), un objectif de saison, les courses rangées par saison.
7. **Ma saison à l'ordinateur** : vraie mise en page en 3 colonnes (§8).
8. **« Et avec une meilleure stratégie ? »** : chaque levier chiffré en secondes, sans double comptage, séparé en **stratégie** (le jour J : allure, Roxzone, no reps) et **capacité** (à l'entraînement), relié aux axes de travail.

---

## 1. Comment fonctionne ROXFIT (vérifié le 15/11/2026)

ROXFIT (ROXFIT Limited, Londres, fondateurs Ben Wilson et Joey Allott ; 260 000 utilisateurs annoncés) a un outil d'objectif appelé **Race Goals** ; **PaceMe** est son exécution sur la montre.

| | Ce que fait ROXFIT | Source |
|---|---|---|
| Entrée | Lieu (une course HYROX précise ou « General Course »), sexe, division (Open, Doubles, Relay, PRO), **chrono final visé**. Aucun champ allure, 5 km ou 10 km : le guide conseille seulement de s'aider de ses splits de course pour choisir un objectif réaliste. | guides/pace-me, blog/pace-me |
| Sortie | Une cible par run (8), par station (8), un temps de Roxzone, total = objectif. Une ligne « Avg Run » affiche l'allure moyenne (Roxzone comprise). | guides/pace-me, FAQ |
| Modification | Chaque split se modifie. Total verrouillé : changer un split redistribue les autres pour garder le chrono. Total déverrouillé : le chrono change. On peut verrouiller un split seul. | guides/pace-me |
| Lieu | Si le parcours est connu, la Roxzone suit les distances réelles du lieu (« varient plus qu'on ne croit »). | guides/pace-me |
| Gratuit / payant | Gratuit : répartition depuis le chrono visé (runs vraisemblablement égaux, non publié). Payant (Ultra) : splits construits depuis l'historique de l'athlète, prédiction de chrono hebdomadaire. | ultra/guides |
| Pendant la course | La montre dit à chaque station si l'athlète est en avance ou en retard sur le plan, écart ± par run. | blog/pace-me |
| Après la course | Splits et rangs par segment, courbe de temps cumulé, « spider » forces / faiblesses, comparaison à la moyenne de la division, du groupe d'âge, à une autre course ou à un autre athlète. **Aucune source ne décrit une comparaison du résultat à l'objectif, ni des leviers chiffrés.** | guides/race-results |
| Méthode | Non publiée (ni formules, ni ratios, ni valeurs). « Tous les résultats viennent de HYROX ». | FAQ |

Chiffres publiés par ROXFIT sur 1,3 M de performances (« Common HYROX Mistakes, By The Numbers ») que nous réutilisons :
- 70,2 % des athlètes courent le run 1 plus vite que leur plan ; **chaque seconde prise d'avance au départ coûte environ 2,5 s à l'arrivée** (sert au levier « départ », §9).
- Le run 3 (après le sled push) est environ 23 s/km plus lent que le run 2 (pyrox : +21 s chez les hommes Open, cohérent).
- Le run 8 est le plus lent pour près de deux tiers des athlètes ; 3,9 % seulement font un negative split.
- Roxzone : environ 4 min pour les plus rapides, environ 9 min pour les hommes Open les plus lents.

Autres outils regardés (méthodes publiées) : **RoxHype** (calculateur « depuis ton temps de course » : splits médians des athlètes qui ont couru le même temps total, chrono p10 / p50 / p90 ; c'est la seule coupe « par run » publiée), FitnessVolt (chrono visé → runs puis stations ; ou 5 km → runs + 3 à 8 % de fatigue, stations = médianes de la tranche), RunDida (5 km/10 km + 15-20 s/km), Rox Lyfe (médiane des athlètes juste sous la barrière visée), HyroxDataLab (athlètes à ±3 min du chrono visé). La méthode commune et la mieux étayée est la même partout : **les splits médians des athlètes du même niveau**. Agon la retient, avec le niveau défini par le run (comme RoxHype) plutôt que par le chrono.

**Ce que ça change pour Agon.** Le principe d'Hugo (« tout part du run ») est gardé, et il est même plus utile que l'entrée de ROXFIT : le run se mesure (courses, tests de VC), un chrono final se devine. Le run moyen et le chrono visé sont deux portes vers la même table.

---

## 2. Le modèle : l'objectif

### 2.1 Définitions

- **Run moyen** `R` (s/km) = somme des 8 runs officiels / 8, **hors Roxzone** (les résultats officiels séparent runs et Roxzone ; ROXFIT, lui, l'inclut dans « Avg Run » : on l'affiche différemment, voir Q3).
- **Division du modèle** : `OH` Open hommes, `OF` Open femmes, `PH` Pro hommes, `PF` Pro femmes, `DH` / `DF` / `DX` doubles hommes / femmes / mixte (Pro doubles : §3.4). Relais : hors champ.
- **Objectif** = 17 temps cibles (8 runs, 8 stations, Roxzone totale) + le chrono = leur somme.

### 2.2 La table de l'objectif

Pour chaque division et chaque **palier de run moyen** (tous les 5 s/km), une ligne :

| colonne | sens |
|---|---|
| `run_avg_s` | run moyen du palier (s/km) |
| `ski` … `wall_balls` | temps médian de la station chez les athlètes de ce run moyen |
| `roxzone_total` | Roxzone médiane |
| `run_shape_1..8` | forme des runs (coefficient de chaque run / run moyen, moyenne = 1) |
| `total` | chrono = 8 × R + stations + Roxzone (calculé, pas stocké) |
| `source`, `is_estimate` | provenance de la ligne ; `true` si extrapolée |

Construction (détail §3.2) : les splits médians **des athlètes qui ont couru le même temps total de course** (RoxHype publie exactement cette coupe, « byRun », par minute de course, soit tous les 7,5 s/km), arrondis à 5 s, gardés tous les 30 s/km ; Agon interpole linéairement entre deux paliers.

### 2.3 Calcul d'un objectif

Entrée : division `d`, run moyen `R`.

```
stations_i(R) = interpolation linéaire de la table de d en R            (i = 8 stations)
roxzone(R)    = idem
forme_k(R)    = idem, forme habituelle telle que mesurée (décision d'Hugo, Q4)
run_k         = arrondi(8 × R × forme_k / 8)  ; l'arrondi est rattrapé sur le run 8 (somme = 8 R)
chrono        = Σ runs + Σ stations + roxzone
```

- Hors de la table : on prolonge la pente des deux derniers paliers, **bornée à ±30 s/km** au-delà du dernier palier mesuré, et l'objectif est marqué « estimé ». Au-delà : refus (« objectif hors des données »).
- Entrée par chrono visé `T` : on cherche le `R` tel que `chrono(R) = T` (la fonction est croissante : recherche par dichotomie à la seconde près). C'est exactement l'inverse : même table, même objectif.

### 2.4 Exemple (Open hommes, R = 5:00 /km, table §3.4)

| | Objectif |
|---|---|
| Runs | 8 × 5:00 = 40:00, forme habituelle : 4:29 · 4:41 · 5:02 · 5:01 · 5:10 · 5:03 · 5:02 · 5:32 |
| SkiErg | 4:30 |
| Sled push | 3:05 |
| Sled pull | 4:45 |
| Burpees broad jumps | 5:20 |
| Rameur | 4:50 |
| Farmers | 2:05 |
| Fentes | 5:05 |
| Wall balls | 6:45 |
| Roxzone | 6:40 |
| **Chrono** | **1:23:05** |

L'exemple d'Hugo : un chrono de 1:27:49 en Open hommes correspond à un run moyen d'environ 5:18. L'objectif SkiErg à ce run est d'environ 4:36 : **un 4:23 a 13 s d'avance.** Aujourd'hui, Agon le classe « dans la norme ».

### 2.5 D'où vient le run moyen ?

Le run moyen se choisit (coach ou athlète), avec une proposition pré-remplie, dans cet ordre :
1. **Plan de la course** s'il existe (`hyrox_race_plans`, champ ajouté `run_avg_s`).
2. **Objectif de saison** de l'athlète (§7).
3. **Proposition calculée** : la croisière de la dernière course de la même division (médiane des runs 2 à 7, puis convertie en run moyen avec la forme du palier), ou l'allure HYROX tirée du dernier bilan de tests validé (`runFromCS` de `src/lib/hyrox/tests/chrono.ts`, déjà en place). Le plus récent des deux.

Pour une **course déjà faite sans plan**, l'analyse propose « objectif depuis ton run du jour » (l'objectif construit sur le run moyen réalisé) : il répond à « avec ce run, que valaient mes stations et ma Roxzone ? ». C'est la lecture la plus juste quand aucun objectif n'avait été fixé. Le coach peut toujours choisir un autre run moyen (Q5).

### 2.6 Modifier un objectif (repris de ROXFIT et du plan actuel)

- Chaque cible se modifie à la main (déjà le cas dans `RacePlanView`).
- **Chrono verrouillé** (par défaut) : modifier une cible redistribue la différence sur les cibles non modifiées, au prorata. **Déverrouillé** : le chrono change.
- « Revenir au modèle » remet les 17 cibles calculées.
- Lieu : pas de Roxzone par lieu en v1 (Agon n'a pas les distances des parcours) ; à garder en idée.

---

## 3. Données

### 3.1 Pourquoi les références actuelles sont fausses

- **Ce qui est en prod n'est plus ce que décrit `PROMPT_MODULE_HYROX.md` §4.6.** La table `hyrox_reference_segments` a été remplacée le 13/10 par 1 140 lignes « pyrox S7-S9 » (`20261013300000_hyrox_pyrox_references.sql`) : 12 catégories (dont Pro et doubles) × 5 tranches de chrono (moins de 70 min, 70-80, 80-90, plus de 90, toutes) × 19 segments, percentiles p1 à p90. Les valeurs citées par Hugo (SkiErg 4:14 / 4:36 / 5:06, médiane 1:27:49) sont celles de l'ancien seed. En prod, SkiErg Open hommes, toutes tranches : 4:09 / 4:31 / 5:01.
- **Le défaut de fond reste le même.** Les deux tables placent un temps de station dans **toute la catégorie**, à tout niveau. Or le SkiErg bouge peu avec le niveau (4:10 pour un run à 3:30 /km, 5:05 pour un run à 8:00 /km) et toute la catégorie fait à peu près le même temps au SkiErg. Une station juste correcte paraît forte chez un athlète lent ; une bonne paraît « dans la norme » chez un rapide. Il faut comparer **à l'objectif du même run**, pas à la catégorie.
- Les « p10 / p50 / p90 » de l'ancien seed n'étaient même pas des percentiles de la station : c'étaient les splits médians des athlètes qui **finissent** aux chronos p10, p50 et p90 (chaque colonne additionnée redonne son chrono). D'où la dispersion trop serrée.
- Les stations femmes venaient d'une autre source (Data Lab S7-S8, p50 seul) et il n'y avait rien en Pro. La table pyrox, en prod, a corrigé ces deux points.

### 3.2 Sources

| Source | Date, taille | Ce qu'on en tire | Fiabilité |
|---|---|---|---|
| **RoxHype**, calculateur grand public ([roxhype.com/racecalculator](https://www.roxhype.com/racecalculator)) et son modèle public | Données du 27/07/2024 au 15/10/2026, **1 200 909 résultats** (Open H 200 k, Open F 116 k, Pro H 39 k, Pro F 18 k, doubles 128 à 144 k par division) | **Splits médians selon le temps de course** (« byRun ») pour 7 divisions, par minute de course : c'est exactement le modèle « tout part du run ». Aussi : chrono p10 / p50 / p90 à run égal, splits par chrono final, dispersion à chrono égal (wall balls, sleds), facteurs de parcours | Haute : très gros échantillon, méthode cohérente (chaque ligne additionnée redonne le chrono). **CGU : usage personnel non commercial** (§3.5) |
| **pyrox S7-S9** (déjà en prod) | 1,1 M de résultats, saisons 7 à 9 | Percentiles par catégorie et par tranche de chrono, 12 catégories | Haute sur les médianes ; tranches de 10 min trop grosses pour un objectif fin. Données aspirées (§3.5) |
| **Roxpace** ([roxpace.app/benchmarks](https://www.roxpace.app/benchmarks)) | 722 841 arrivées en solo, mise à jour le 15/11/2026 | Médianes par station, Open et Pro | Moyenne : source des données non nommée |
| **Rappelt et al.**, Front. Physiol. 2026 ([lien](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2026.1847569/full)) | 39 696 résultats Pro et Elite, saisons 1 à 7 | Moyenne ± écart-type par station chez les 100 meilleurs Pro ; la course pèse 48 à 51 % du chrono ; le rameur est la station la plus prédictive | Haute, publication à comité de lecture ; ne couvre que le haut du Pro |
| **ROXFIT**, « Common HYROX Mistakes, By The Numbers » | 1,3 M de performances | Départ trop rapide (2,5 s perdues par seconde prise), run 3 +23 s/km, run 8 le plus lent | Moyenne : chiffres publiés, méthode non |
| HyroxDataLab, Rox Lyfe, Hyranking | 395 k, ~100 (2022), 460 k | Recoupements ponctuels (SkiErg H médian 4:29) | Faible à moyenne (site injoignable, données datées, erreurs de règlement) |
| pyrox brut, Kaggle, Apify | 1,2 M de lignes | — | **Écartées : résultats individuels aspirés en masse** |

### 3.3 Recoupement

À run moyen égal, la table RoxHype « byRun » et la table pyrox déjà en prod (interpolée entre ses tranches) diffèrent de **moins de 6 s** sur le SkiErg, le sled pull, les burpees, le rameur, les farmers et les fentes, dans les 4 divisions solo. Écarts plus grands : sled push (RoxHype +5 à +15 s, plus en Pro : le sol varie selon les salles et les saisons), wall balls Pro (+3 à +9 s), Roxzone (RoxHype −8 à −18 s). Les splits par chrono final de RoxHype (déjà dans `src/lib/hyrox/tests/chronoData.ts`) redonnent la même table à 5 s près. Roxpace (Pro H : sled pull 5:45, wall balls 6:45) et Rappelt (top 100 Pro) sont cohérents avec les paliers correspondants.

Conclusion : **les médianes sont solides** ; la seule vraie incertitude est le sol des sleds et la Roxzone propres à chaque salle (écart-type de l'effet du parcours sur le chrono : 1,9 %, RoxHype).

### 3.4 Tableau à valider, tranche par tranche

Médianes des athlètes de chaque run moyen, **arrondies à 5 s**, tous les 30 s/km (Agon interpole entre deux lignes). Chrono = 8 × run moyen + stations + Roxzone. Forme des runs = coefficient de chaque run (moyenne 1), telle que mesurée, reprise telle quelle par l'objectif (Q4).
En doubles, les temps de station sont ceux **de la paire** (travail partagé) et les runs sont courus à deux.
Source : RoxHype byRun (07/2024-10/2026), recoupé avec pyrox S7-S9. Lignes hors des bornes ci-dessous : extrapolées et marquées « estimé ».

#### Open hommes (OH)

| Run moyen | SkiErg | Sled push | Sled pull | BBJ | Rameur | Farmers | Fentes | Wall balls | Roxzone | **Chrono** | Forme des runs 1→8 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 3:30 | 4:10 | 2:20 | 3:25 | 3:20 | 4:15 | 1:35 | 3:25 | 4:25 | 4:45 | **59:40** | 0,91 0,95 1,01 1,00 1,02 1,01 1,01 1,09 |
| 4:00 | 4:15 | 2:35 | 3:45 | 3:55 | 4:25 | 1:45 | 3:55 | 5:05 | 5:05 | **1:06:45** | 0,92 0,95 1,00 1,00 1,02 1,01 1,01 1,09 |
| 4:30 | 4:25 | 2:50 | 4:15 | 4:35 | 4:40 | 1:55 | 4:30 | 5:55 | 5:50 | **1:14:55** | 0,91 0,94 1,00 1,00 1,03 1,01 1,01 1,10 |
| 5:00 | 4:30 | 3:05 | 4:45 | 5:20 | 4:50 | 2:05 | 5:05 | 6:45 | 6:40 | **1:23:05** | 0,90 0,94 1,01 1,00 1,03 1,01 1,01 1,11 |
| 5:30 | 4:40 | 3:15 | 5:10 | 5:55 | 5:00 | 2:15 | 5:40 | 7:35 | 7:35 | **1:31:05** | 0,88 0,93 1,00 1,00 1,04 1,01 1,01 1,13 |
| 6:00 | 4:45 | 3:30 | 5:40 | 6:40 | 5:10 | 2:25 | 6:10 | 8:30 | 8:30 | **1:39:20** | 0,85 0,92 1,00 1,00 1,04 1,01 1,01 1,16 |
| 6:30 | 4:50 | 3:45 | 6:05 | 7:10 | 5:20 | 2:35 | 6:45 | 9:15 | 9:30 | **1:47:15** | 0,83 0,91 0,99 1,00 1,05 1,01 1,02 1,19 |
| 7:00 | 4:55 | 3:55 | 6:25 | 7:45 | 5:25 | 2:45 | 7:10 | 10:00 | 10:20 | **1:54:40** | 0,80 0,90 1,00 1,00 1,05 1,01 1,02 1,22 |
| 7:30 | 5:00 | 4:10 | 6:45 | 8:15 | 5:35 | 2:50 | 7:35 | 10:35 | 11:00 | **2:01:45** | 0,78 0,88 0,98 1,00 1,06 1,02 1,02 1,26 |
| 8:00 | 5:05 | 4:15 | 7:05 | 8:35 | 5:40 | 2:55 | 8:05 | 11:20 | 11:45 | **2:08:45** | 0,74 0,87 0,99 0,99 1,06 1,02 1,03 1,30 |

#### Open femmes (OF)

| Run moyen | SkiErg | Sled push | Sled pull | BBJ | Rameur | Farmers | Fentes | Wall balls | Roxzone | **Chrono** | Forme des runs 1→8 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4:00 | 4:45 | 2:15 | 4:10 | 4:20 | 4:55 | 1:45 | 3:35 | 4:25 | 5:15 | **1:07:25** | 0,91 0,96 1,01 1,00 1,03 1,01 1,01 1,08 |
| 4:30 | 4:55 | 2:30 | 4:35 | 4:50 | 5:05 | 1:55 | 3:55 | 4:55 | 5:40 | **1:14:20** | 0,91 0,96 1,00 1,00 1,03 1,01 1,01 1,08 |
| 5:00 | 5:05 | 2:40 | 4:55 | 5:30 | 5:15 | 2:05 | 4:20 | 5:30 | 6:20 | **1:21:40** | 0,92 0,96 1,00 1,00 1,03 1,01 1,01 1,08 |
| 5:30 | 5:10 | 2:50 | 5:20 | 6:10 | 5:25 | 2:15 | 4:50 | 6:10 | 7:05 | **1:29:15** | 0,91 0,95 1,00 1,00 1,03 1,01 1,01 1,09 |
| 6:00 | 5:20 | 3:00 | 5:50 | 6:55 | 5:35 | 2:20 | 5:20 | 7:00 | 7:50 | **1:37:10** | 0,90 0,95 1,00 1,00 1,03 1,01 1,01 1,11 |
| 6:30 | 5:30 | 3:10 | 6:20 | 7:40 | 5:45 | 2:30 | 5:50 | 7:45 | 8:40 | **1:45:10** | 0,88 0,94 0,99 1,00 1,03 1,01 1,01 1,13 |
| 7:00 | 5:35 | 3:20 | 6:45 | 8:30 | 5:50 | 2:40 | 6:25 | 8:35 | 9:30 | **1:53:10** | 0,86 0,93 0,99 1,00 1,04 1,02 1,02 1,15 |
| 7:30 | 5:40 | 3:30 | 7:05 | 9:15 | 6:00 | 2:45 | 6:55 | 9:20 | 10:05 | **2:00:35** | 0,84 0,92 0,98 1,00 1,04 1,02 1,02 1,18 |
| 8:00 | 5:45 | 3:40 | 7:25 | 10:05 | 6:10 | 2:50 | 7:30 | 10:10 | 10:40 | **2:08:15** | 0,81 0,91 0,98 1,00 1,05 1,02 1,03 1,21 |

#### Pro hommes (PH)

| Run moyen | SkiErg | Sled push | Sled pull | BBJ | Rameur | Farmers | Fentes | Wall balls | Roxzone | **Chrono** | Forme des runs 1→8 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 3:30 | 4:00 | 2:50 | 3:40 | 2:50 | 4:05 | 1:35 | 3:15 | 4:25 | 4:35 | **59:15** | 0,92 0,95 1,00 1,00 1,01 1,00 1,01 1,09 |
| 4:00 | 4:10 | 3:25 | 4:35 | 3:30 | 4:20 | 1:50 | 4:05 | 5:40 | 4:55 | **1:08:30** | 0,90 0,94 1,00 1,01 1,02 1,00 1,02 1,10 |
| 4:30 | 4:15 | 3:50 | 5:30 | 4:15 | 4:35 | 2:10 | 4:55 | 6:40 | 5:45 | **1:17:55** | 0,88 0,93 1,01 1,01 1,03 1,01 1,02 1,11 |
| 5:00 | 4:25 | 4:15 | 6:15 | 4:55 | 4:45 | 2:25 | 5:30 | 7:35 | 6:40 | **1:26:45** | 0,86 0,92 1,01 1,02 1,03 1,01 1,03 1,13 |
| 5:30 | 4:30 | 4:40 | 7:00 | 5:30 | 4:50 | 2:40 | 6:05 | 8:30 | 7:35 | **1:35:20** | 0,84 0,91 1,00 1,01 1,04 1,01 1,03 1,15 |
| 6:00 | 4:35 | 5:05 | 7:45 | 5:55 | 5:00 | 2:55 | 6:40 | 9:20 | 8:35 | **1:43:50** | 0,81 0,89 1,00 1,01 1,04 1,02 1,04 1,18 |
| 6:30 | 4:40 | 5:20 | 8:20 | 6:35 | 5:10 | 3:10 | 7:15 | 10:15 | 9:30 | **1:52:15** | 0,79 0,89 0,99 1,01 1,04 1,01 1,04 1,23 |
| 7:00 | 4:45 | 5:40 | 8:45 | 7:00 | 5:20 | 3:10 | 7:40 | 10:50 | 10:35 | **1:59:45** | 0,75 0,87 0,99 1,00 1,05 1,01 1,04 1,27 |

#### Pro femmes (PF)

| Run moyen | SkiErg | Sled push | Sled pull | BBJ | Rameur | Farmers | Fentes | Wall balls | Roxzone | **Chrono** | Forme des runs 1→8 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4:00 | 4:35 | 3:10 | 4:20 | 3:45 | 4:40 | 1:55 | 3:45 | 4:30 | 4:45 | **1:07:25** | 0,85 0,96 1,02 1,02 1,03 1,02 1,02 1,08 |
| 4:30 | 4:45 | 3:40 | 5:00 | 4:25 | 4:55 | 2:15 | 4:25 | 5:20 | 5:25 | **1:16:10** | 0,89 0,95 1,01 1,01 1,03 1,01 1,02 1,09 |
| 5:00 | 4:55 | 4:05 | 5:40 | 5:05 | 5:05 | 2:35 | 5:05 | 6:10 | 6:15 | **1:24:55** | 0,89 0,94 1,00 1,01 1,03 1,01 1,02 1,10 |
| 5:30 | 5:00 | 4:25 | 6:15 | 5:50 | 5:15 | 2:55 | 5:40 | 7:05 | 6:55 | **1:33:20** | 0,88 0,94 1,00 1,01 1,02 1,01 1,02 1,11 |
| 6:00 | 5:10 | 4:45 | 6:50 | 6:30 | 5:25 | 3:10 | 6:15 | 7:55 | 7:55 | **1:41:55** | 0,88 0,93 1,00 1,01 1,03 1,01 1,03 1,12 |
| 6:30 | 5:15 | 5:00 | 7:20 | 7:00 | 5:35 | 3:20 | 6:45 | 8:45 | 8:45 | **1:49:45** | 0,85 0,92 0,99 1,00 1,03 1,02 1,03 1,16 |
| 7:00 | 5:20 | 5:30 | 7:45 | 7:40 | 5:40 | 3:35 | 7:15 | 9:30 | 9:35 | **1:57:50** | 0,84 0,91 0,97 1,00 1,03 1,02 1,04 1,18 |

#### Doubles hommes (DH)

| Run moyen | SkiErg | Sled push | Sled pull | BBJ | Rameur | Farmers | Fentes | Wall balls | Roxzone | **Chrono** | Forme des runs 1→8 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4:00 | 3:50 | 1:40 | 2:50 | 2:30 | 4:10 | 1:25 | 2:50 | 3:50 | 4:40 | **59:45** | 0,93 0,95 1,00 1,00 1,02 1,01 1,02 1,06 |
| 4:30 | 3:55 | 1:45 | 3:05 | 2:50 | 4:20 | 1:35 | 3:10 | 4:05 | 5:20 | **1:06:05** | 0,93 0,94 1,01 1,00 1,03 1,01 1,02 1,06 |
| 5:00 | 4:00 | 1:50 | 3:15 | 3:05 | 4:30 | 1:35 | 3:25 | 4:20 | 6:00 | **1:12:00** | 0,93 0,94 1,01 1,01 1,03 1,01 1,02 1,06 |
| 5:30 | 4:10 | 1:55 | 3:30 | 3:20 | 4:35 | 1:45 | 3:45 | 4:30 | 6:50 | **1:18:20** | 0,91 0,94 1,00 1,01 1,03 1,02 1,02 1,08 |
| 6:00 | 4:15 | 2:00 | 3:40 | 3:35 | 4:45 | 1:50 | 4:00 | 4:50 | 7:40 | **1:24:35** | 0,89 0,93 1,00 1,01 1,04 1,02 1,02 1,09 |
| 6:30 | 4:20 | 2:05 | 3:55 | 3:50 | 4:50 | 1:50 | 4:15 | 5:05 | 8:35 | **1:30:45** | 0,88 0,92 1,00 1,01 1,05 1,02 1,02 1,11 |
| 7:00 | 4:25 | 2:15 | 4:05 | 4:05 | 5:00 | 1:55 | 4:30 | 5:20 | 9:30 | **1:37:05** | 0,84 0,91 1,00 1,01 1,05 1,03 1,03 1,14 |
| 7:30 | 4:30 | 2:20 | 4:15 | 4:15 | 5:05 | 2:00 | 4:45 | 5:35 | 10:05 | **1:42:50** | 0,82 0,90 0,99 1,01 1,06 1,03 1,03 1,16 |
| 8:00 | 4:35 | 2:25 | 4:25 | 4:20 | 5:10 | 2:00 | 5:00 | 5:45 | 10:45 | **1:48:25** | 0,80 0,90 0,99 1,01 1,07 1,03 1,03 1,16 |

#### Doubles femmes (DF)

| Run moyen | SkiErg | Sled push | Sled pull | BBJ | Rameur | Farmers | Fentes | Wall balls | Roxzone | **Chrono** | Forme des runs 1→8 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4:30 | 4:25 | 1:40 | 3:30 | 3:15 | 4:45 | 1:35 | 3:00 | 3:45 | 5:30 | **1:07:25** | 0,91 0,96 1,01 1,00 1,02 1,01 1,02 1,07 |
| 5:00 | 4:35 | 1:40 | 3:40 | 3:30 | 4:55 | 1:40 | 3:10 | 3:55 | 5:55 | **1:13:00** | 0,92 0,96 1,00 1,00 1,02 1,01 1,02 1,06 |
| 5:30 | 4:40 | 1:45 | 3:55 | 3:50 | 5:00 | 1:45 | 3:30 | 4:05 | 6:35 | **1:19:05** | 0,93 0,96 1,00 1,00 1,02 1,01 1,01 1,06 |
| 6:00 | 4:50 | 1:50 | 4:10 | 4:10 | 5:10 | 1:50 | 3:45 | 4:20 | 7:15 | **1:25:20** | 0,93 0,96 1,00 1,01 1,02 1,01 1,01 1,07 |
| 6:30 | 4:55 | 1:55 | 4:25 | 4:30 | 5:20 | 1:55 | 4:00 | 4:35 | 8:00 | **1:31:35** | 0,91 0,95 0,99 1,00 1,03 1,02 1,02 1,08 |
| 7:00 | 5:00 | 2:00 | 4:35 | 4:55 | 5:25 | 2:00 | 4:15 | 4:50 | 8:45 | **1:37:45** | 0,90 0,95 0,99 1,00 1,03 1,02 1,02 1,10 |
| 7:30 | 5:05 | 2:05 | 4:50 | 5:20 | 5:35 | 2:05 | 4:30 | 5:10 | 9:30 | **1:44:10** | 0,88 0,94 0,98 1,00 1,03 1,03 1,03 1,12 |
| 8:00 | 5:10 | 2:10 | 5:00 | 5:40 | 5:40 | 2:05 | 4:45 | 5:25 | 10:00 | **1:49:55** | 0,86 0,93 0,98 1,01 1,04 1,03 1,03 1,13 |

#### Doubles mixte (DX)

| Run moyen | SkiErg | Sled push | Sled pull | BBJ | Rameur | Farmers | Fentes | Wall balls | Roxzone | **Chrono** | Forme des runs 1→8 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4:00 | 3:55 | 1:50 | 3:00 | 2:35 | 4:15 | 1:30 | 2:50 | 3:40 | 4:35 | **1:00:10** | 0,91 0,96 1,01 1,00 1,02 1,01 1,02 1,07 |
| 4:30 | 4:05 | 2:00 | 3:20 | 2:55 | 4:30 | 1:40 | 3:15 | 3:55 | 5:15 | **1:06:55** | 0,91 0,96 1,01 1,00 1,02 1,01 1,02 1,07 |
| 5:00 | 4:15 | 2:05 | 3:40 | 3:10 | 4:35 | 1:45 | 3:35 | 4:10 | 5:55 | **1:13:10** | 0,92 0,95 1,01 1,00 1,02 1,01 1,02 1,06 |
| 5:30 | 4:20 | 2:15 | 3:55 | 3:30 | 4:45 | 1:50 | 3:55 | 4:30 | 6:35 | **1:19:35** | 0,92 0,95 1,00 1,00 1,02 1,01 1,02 1,07 |
| 6:00 | 4:25 | 2:20 | 4:10 | 3:45 | 4:50 | 1:55 | 4:15 | 4:50 | 7:20 | **1:25:50** | 0,91 0,95 1,00 1,01 1,03 1,01 1,02 1,08 |
| 6:30 | 4:30 | 2:25 | 4:25 | 4:05 | 5:00 | 2:00 | 4:35 | 5:10 | 8:05 | **1:32:15** | 0,90 0,94 0,99 1,00 1,03 1,02 1,02 1,09 |
| 7:00 | 4:35 | 2:35 | 4:35 | 4:25 | 5:10 | 2:05 | 4:50 | 5:35 | 8:55 | **1:38:45** | 0,88 0,93 0,99 1,00 1,03 1,02 1,03 1,12 |
| 7:30 | 4:40 | 2:40 | 4:50 | 4:35 | 5:15 | 2:05 | 5:05 | 5:50 | 9:35 | **1:44:35** | 0,85 0,93 0,99 1,00 1,04 1,03 1,03 1,13 |
| 8:00 | 4:45 | 2:45 | 5:00 | 4:50 | 5:20 | 2:10 | 5:20 | 6:15 | 10:20 | **1:50:45** | 0,83 0,92 0,98 1,00 1,04 1,03 1,04 1,16 |

**Pas de ligne pour** : Pro doubles (aucune source à run égal ; proposition : doubles de même sexe × facteur Pro/Open des stations, marqué « estimé ») et relais (hors champ : chacun ne fait qu'une partie).
**Lignes fragiles** : Pro au-delà de 6:30 /km et femmes Pro au-delà de 6:00 /km (peu d'athlètes Pro à ce niveau, distribution tronquée, comme le dit Hugo) ; Open femmes à 4:00 /km.

### 3.5 Droits d'utilisation : décision d'Hugo

- **Toutes les sources volumineuses viennent de résultats tirés de results.hyrox.com** : pyrox l'est de fait, Rappelt le dit, RoxHype aussi selon toute vraisemblance. HYROX a envoyé des mises en demeure aux aspirateurs en octobre 2026. Agon ne récupère et ne récupérera aucun résultat individuel.
- **RoxHype** : CGU §7.1-7.2, usage personnel non commercial, ni copie ni redistribution sans permission. En Europe, le droit des bases de données peut aussi protéger une extraction substantielle de leur modèle. Le fichier du modèle n'a été lu qu'une fois, pour cette étude, et reste hors du dépôt.
- **Déjà dans Agon** : `src/lib/hyrox/tests/chronoData.ts` (chrono estimé des bilans de tests) reprend des tables RoxHype (« BR » = chrono à run égal, « PROF » = splits par chrono final). Le sujet existe donc déjà, quelle que soit la décision ici.
- **Décision d'Hugo (15/11) : Agon n'est pas commercial et ne veut pas le devenir.** On utilise la table arrondie du §3.4 (5 s, tous les 30 s/km, sources citées), jamais le fichier du modèle tel quel. Reste ouvert : les CGU parlent aussi d'usage « personnel » ; un e-mail de courtoisie à RoxHype reste possible si Hugo le souhaite.
- Voies étudiées (Q2) :
  1. **Demander une autorisation à RoxHype** (e-mail court envoyé par Hugo, je peux le rédiger) et, en attendant, utiliser la table **arrondie et espacée** ci-dessus. *Recommandé* : la table est grossière (5 s, 30 s/km), ce sont des faits recoupés par d'autres sources, citées.
  2. **Table Agon sans RoxHype** : construite seulement à partir de pyrox (déjà en prod) et de Roxpace / Rappelt, interpolée entre 4 tranches. Moins précise (tranches de 10 min de chrono, pas de coupe par run), et pyrox vient aussi de résultats aspirés.
  3. Plus tard, dans les deux cas : **recaler sur les courses des athlètes d'Agon** (ils saisissent eux-mêmes leurs résultats), en nouvelle version de la grille.

---

## 4. Course réalisée

### 4.1 En-tête

```
HYROX PARIS · 16 sept. 2026 · Hommes open
1:21:58           objectif 1:22:45 (run moyen 5:00)        −0:47  EN AVANCE
Rang 412 / 2 310 · groupe d'âge 38 / 260                      (rang officiel, information)
```

- Écart chrono : vert si en avance au-delà de la tolérance, gris si dans l'objectif, orange si en retard.
- Rang officiel tel que saisi (`rank_overall / participants_overall`, `rank_age_group / participants_age_group`) et son « top x % » officiel (rang / participants), sans couleur ni jugement.

### 4.2 Les 17 segments

| Segment | Objectif | Réalisé | Écart | État |
|---|---|---|---|---|
| Run 1 | 4:39 | 4:21 | −18 s | départ rapide (orange, voir ci-dessous) |
| SkiErg | 4:33 | 4:23 | −10 s | en avance |
| Run 2 | 4:39 | 4:45 | +6 s | dans l'objectif |
| … | | | | |
| Roxzone | 6:36 | 7:20 | +44 s | en retard |

Règles :
- **Tolérance** « dans l'objectif » : `max(3 s, 2 % de la cible)` par segment ; `1 %` pour le chrono final (Q6). Soit ±6 s sur un run de 5:00, ±8 s sur des wall balls de 6:38, ±50 s sur 1:22:45.
- **Run 1** : en avance au-delà de la tolérance = **« départ rapide »** (orange), jamais vert : c'est l'erreur n° 1 mesurée par ROXFIT, et le run 1 n'est pas une référence (décision du 15/11).
- **Run 8** : jugé, avec la mention habituelle « parcours parfois différent ».
- Une donnée absente : « — », jamais 0.
- Doubles : stations partagées, jugées contre l'objectif doubles (pas solo).

### 4.3 Avance / retard cumulé

Courbe (frise existante `RaceFrise`) : à chaque fin de segment, `cumul réalisé − cumul objectif`. Au-dessus de 0 = en retard. Elle montre d'un coup d'œil où la course a basculé (« en avance de 25 s après le run 2, en retard à partir des fentes »). C'est l'équivalent de la courbe de temps cumulé de ROXFIT, mais contre l'objectif.

### 4.4 Ce qui disparaît de l'analyse

Percentiles, « top x % » calculé par segment, couleurs fort / norme / faible, carte de catégorie et équivalences (§5). Le sélecteur « Comparer à » garde : objectif (défaut), course précédente, autre course.

---

## 5. Retrait du classement par catégorie

Raisons d'Hugo : le terrain Pro est une distribution tronquée (les moins bons courent en Open), les charges diffèrent entre Open et Pro ; une position dans la catégorie ne dit pas si la station était bonne **pour cet athlète**.

| Fichier | Ce qui part | Ce qui le remplace |
|---|---|---|
| `src/lib/hyrox/calc.ts` | `Standing`, `standing()`, `STRONG_MAX_PCT`, `WEAK_MIN_PCT`, `POSITION_BRACKET` ; `percentile()` / `timeAtPercentile()` gardés seulement s'ils servent encore (tests HYROX) | `vsObjective()` (nouveau, §10) |
| `src/lib/hyrox/raceDebrief.ts` | `raceStrip` par position, `stationProfile`, `ownTotalPct`, phrases « top x % » | frise et débrief par écart à l'objectif |
| `src/lib/hyrox/categoryEquivalence.ts` | tout (équivalences de chrono entre catégories) | rien (Q7) |
| `src/lib/hyrox/raceEvolution.ts` | `profilePercentiles` | écarts à l'objectif par course |
| `src/lib/hyrox/raceLevers.ts`, `raceWatch.ts` (`raceGains`, `stationsAtLevel`) | gains contre la médiane | leviers contre l'objectif (§9) |
| `src/lib/hyrox/raceComparison.ts` | jugement par position | inchangé sinon (comparaison de deux courses en secondes) |
| `RaceCategoryCard.tsx`, `StandingLegend`, `standingColor` | supprimés | légende « en avance / dans l'objectif / en retard » |
| `RaceDebriefView.tsx`, `RaceSegmentsTable.tsx`, `RaceAnalysis.tsx`, `HyroxSeasonView.tsx` | couleurs et colonnes de position | colonnes objectif / écart |
| Coach : `StationsView.tsx`, `HyroxRadarView.tsx`, `EvolutionHeatmap.tsx` | priorités vs médiane, radar en percentiles, carte de chaleur en positions | stations et radar en **% de l'objectif** (100 = pile, au-delà = en avance), carte de chaleur en secondes d'écart (Q8) |
| `src/lib/hyrox/categories.ts` | `REFERENCE_CATEGORIES` sert encore au choix de la division du modèle | conservé |
| `src/lib/hyrox/tests/insights.ts` (méthode Roxzone) | lit `top_pct_overall` / `roxzone_top_pct` : rangs officiels saisis, pas des percentiles calculés | conservé |

`hyrox_reference_segments` n'est plus lue par l'analyse. Elle reste en base (rien n'est supprimé), et on la retire dans un second temps.

---

## 6. Saison

- **Règle (décision d'Hugo, Q9)** : une course du 15 août de l'année N au 14 août de N+1 appartient à la « Saison N/N+1 » (`26/27`). Les courses du 1ᵉʳ au 14 août restent dans la saison précédente. La saison 26/27 ouvre à Tenerife le 4 septembre.
- Fonction pure `seasonOf(date) → { key: "2026-27", label: "Saison 26/27", start, end }` dans `src/lib/hyrox/season.ts`, testée (14/08, 15/08, 31/07, 29/02).
- Courses rangées par saison (liste « Courses » groupée, sélecteur de saison dans « Ma saison » et l'Évolution coach).
- **Objectif de saison** : un run moyen visé par saison et par division (ex. « Saison 26/27 : 4:50 /km en Open hommes → 1:20:30 »). Il pré-remplit l'objectif des courses de la saison qui n'ont pas de plan.

---

## 7. Base de données (migration additive, phase 2)

| Objet | Contenu | RLS |
|---|---|---|
| `hyrox_objective_versions` | `version` (ex. `obj@1`), `active` (une seule), `notes`, `created_at` | lecture authentifiée, écriture admin (comme `hyrox_test_grid_versions`) |
| `hyrox_objective_grid` | une ligne par `version`, `division` (`men`, `women`, `men_pro`, `women_pro`, `doubles_men`, `doubles_women`, `doubles_mixed`) et `run_avg_s` : `ski_s` … `wall_balls_s`, `roxzone_s`, `run_shape numeric[8]`, `source`, `is_estimate` ; clé (`version`, `division`, `run_avg_s`) | idem |
| `hyrox_race_plans` + colonnes | `run_avg_s int` (null = plan ancien, par chrono), `model_version text`, `locked_total boolean default true` | inchangées |
| `hyrox_season_goals` | `athlete_id`, `season` (`2026-27`), `division`, `run_avg_s`, `note`, `created_by`, horodatages ; unique (`athlete_id`, `season`, `division`) | `athlete_id = (SELECT auth.uid())` ou `((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))` ou admin, comme `hyrox_results` |

- Pas de donnée de santé nouvelle (un objectif d'allure) ; export et suppression RGPD : `hyrox_season_goals` à ajouter aux listes d'export / purge (`rgpd-check`).
- Seed de la grille généré par une fonction pure testée (même méthode que `seedSql(gridSetToRows(...))` des tests HYROX) : la migration contient exactement la table validée par Hugo.
- Ordre : base de test agon-test (à blanc puis appliquée), puis prod au oui d'Hugo (`prod.sh` → `db query -f` → vérif → `migration repair` → `schema.sql` → types → dry-run).

---

## 8. Écrans

### 8.1 Ma saison, ordinateur (≥ 1100 px)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ HYROX · MA SAISON      [Saison 26/27 ▾]   Objectif de saison : 4:50 /km → 1:20:30  [✎]  │
├───────────────────────────────┬──────────────────────────────────┬───────────────────────┤
│ 01 DERNIÈRE COURSE            │ 02 LE CHRONO CONTRE L'OBJECTIF   │ 03 QUOI TRAVAILLER    │
│ HYROX Paris · 16 sept.        │  courbe : chaque course (point)  │ leviers récurrents de │
│ 1:21:58   objectif 1:22:45    │  et son objectif (tiret), solo / │ la saison, en s, triés│
│ −0:47 en avance               │  duo séparés                     │ 1. Roxzone   −1:10    │
│ Rang 412 / 2 310              │                                  │ 2. Wall balls −0:52   │
│ [Ouvrir l'analyse]            │                                  │ 3. Run après sled −38 │
├───────────────────────────────┴──────────────────────────────────┤  → axe de travail     │
│ 04 SEGMENTS × COURSES (écart à l'objectif, en s)                 │  → « En parler à … »  │
│           R1  Ski  R2  Push R3  Pull R4  BBJ … WB  Rox  Chrono   │                       │
│ Paris    −18  −10  +6   +4  +15  +9  …        +12  +44   −47     ├───────────────────────┤
│ Lyon      …                                                      │ 05 ET AVEC UNE        │
│ (cases colorées en avance / dans l'objectif / en retard)         │ MEILLEURE STRATÉGIE ? │
├──────────────────────────────────────────────────────────────────┤ dernière course :     │
│ 06 LES COURSES DE LA SAISON (liste, date, chrono, écart, rang)   │ 1:21:58 → 1:20:21     │
└──────────────────────────────────────────────────────────────────┴───────────────────────┘
```

Téléphone : les mêmes blocs empilés dans l'ordre 01, 02, 05, 03, 04 (défilement horizontal), 06. Rendu de la maquette à faire valider sur le canvas (Claude Design) avant le code.

### 8.2 Analyse de course

Onglets inchangés (Débrief · Course · Runs · Gains · Comparer), contenus revus :
- **Débrief** : en-tête §4.1, phrase de synthèse (« 47 s d'avance sur l'objectif ; la Roxzone a coûté 44 s »), frise d'avance-retard, 3 points en avance / 3 en retard (secondes).
- **Course** : tableau §4.2 + montre recalée (inchangé).
- **Runs** : runs contre leur objectif (et croisière, inchangé).
- **Gains** → renommé **« Meilleure stratégie »** : §9.
- **Comparer** : inchangé (deux courses, en secondes), objectif de chacune affiché.

### 8.3 Plan / objectif (coach, et athlète en lecture)

`RacePlanView` devient « Objectif » : sélecteur de division, **run moyen** (curseur ±5 s/km et saisie) ou chrono visé, les 17 cibles avec cadenas du chrono, « Revenir au modèle ». Mention « estimé » si la tranche est extrapolée.

---

## 9. « Et avec une meilleure stratégie ? »

But : un chrono possible, levier par levier, en secondes, pour savoir **quoi travailler**. Tout est calculé contre l'**objectif** (§2), plus contre la médiane.

### 9.1 Les leviers et leurs formules

Notations : `a_k` réalisé, `c_k` cible du segment `k`, `perte_k = max(0, a_k − c_k − tol_k)` avec la tolérance du §4.2 (on ne chiffre pas le bruit).

**Stratégie (gagnable le jour J)**

| Levier | Formule | Exemple |
|---|---|---|
| **Départ trop rapide** | si `c_1 − a_1 > tol_1` (run 1 en avance) : `gain = min(1,5 × (c_1 − a_1), Σ pertes runs 2-8)`. ROXFIT : chaque seconde prise au départ en coûte ~2,5 à l'arrivée, soit 1,5 nette ; plafonné par ce qu'on a réellement perdu ensuite. | run 1 −18 s, pertes runs 5-8 = 50 s → 27 s |
| **Régularité des runs 2 à 7** | `Σ perte_k`, k ∈ {2, 5, 6, 7}, moins la part déjà comptée au départ. Les runs 3 et 4 vont au levier suivant. | 21 s |
| **Course après les sleds** | `perte_3 + perte_4` (la cible inclut déjà le ralentissement habituel après les sleds, ~+23 s/km). La FC et la cadence de la montre, si elle est liée, disent pourquoi (indice, §9.3). | 24 s |
| **Run 8** | `perte_8` (mention parcours) | — |
| **Roxzone** | `perte_roxzone` ; si `roxzone_splits` existe, les 3 transitions les plus coûteuses sont citées | 44 s |
| **No reps wall balls** | `n × a_WB / (100 + n)` : chaque no rep coûte une répétition de plus, au rythme de la station. `n` = cible + parallèle saisis. | 6 no reps en 6:50 → 22 s |

**Capacité (à construire à l'entraînement)**

| Levier | Formule |
|---|---|
| **Chaque station** (8) | `perte_station`, moins la part no reps pour les wall balls |
| **Allure de course** | niveau `g` = écart tenu sur les runs les plus réguliers (quart le plus rapide des écarts des runs 2 à 7, au moins 0) ; capacité = `Σ min(max(0, a_k − c_k), g)` sur les 8 runs. Les leviers de stratégie se calculent au-delà de `g` (un ralentissement de fin de course reste de la stratégie). Le départ trop rapide se juge contre `c_1 + g`. |

**Chrono possible** = chrono réalisé − Σ leviers. Chaque seconde de retard est comptée **une seule fois** (les runs sont partagés entre départ / régularité / sleds / run 8 / capacité dans cet ordre). Les avances ne sont jamais retirées.

Affichage : la cascade existante (`RaceGainsCascade`) devient deux groupes, « Stratégie » puis « Capacité », chaque barre en secondes, du chrono réalisé au chrono possible. Un levier sous 10 s n'est pas cité (seuil actuel `GAIN_THRESHOLD_S`).

### 9.2 Relier aux axes de travail

| Levier | Proposition (`workProposals.ts`) | Axe des tests (`hyrox_work_axes_rules`) |
|---|---|---|
| Départ, régularité | nouveau texte : « Allure : 3 séances simulées avec run 1 imposé à l'allure cible, puis 6 × 1 km à allure course avec stations courtes » (à relire) | Seuils (`run_seuils`) |
| Course après les sleds | `runAfterProposal("sled_push" / "sled_pull")` | Endurance de force sleds (`sled_push_endf`, `sled_pull_endf`) |
| Roxzone | `roxzone` | — |
| No reps | nouveau texte : « Technique : 5 × 20 wall balls à la cible, squat filmé de profil » (à relire) | Technique (`wb_tech`) |
| Wall balls (capacité) | `wall_balls` | `wb_endf` |
| Sled push / pull | `sled_push` / `sled_pull` | `sled_*_force`, `sled_pull_gap` |
| SkiErg / rameur | `ski` / `row` | `ergo_tech` ou `ergo_run_first` |
| Burpees | `bbj` | `bbj_endf`, `bj_force` |
| Farmers | `farmers` | `grip` |
| Fentes | `lunges` | Endurance de force |
| Allure de course | — | `run_seuils` / `run_vitesse` / `run_vo2` selon le dernier bilan |

Si un bilan de tests validé existe, le levier affiche l'axe correspondant de ce bilan (« déjà dans tes axes : Endurance de force des sleds »). Sinon, « Ajouter au programme » (existant).

### 9.3 La montre (FC recalée)

La FC ne donne pas de secondes à elle seule ; elle **explique** un levier, sans le chiffrer deux fois :
- station au-dessus de SV2 (`timeAboveHr`) suivie d'une perte sur le run suivant → indice sur « course après … » ou « régularité » ;
- récupération en Roxzone (`roxzoneRecovery`) → indice sur la Roxzone ;
- cadence du run suivant en baisse (`cadenceDrop`) → indice sur « course après les sleds ».
Pastille « indice montre » (existante). Données Garmin : jamais d'IA (aucun changement, tout est en règles).

### 9.4 Sur la saison

« Quoi travailler » (Ma saison, bloc 03) = leviers des courses de la saison, cumulés en moyenne par course, triés ; un levier présent dans 2 courses sur 3 est dit « récurrent ».

---

## 10. Code (phase 2)

| Fichier | Rôle |
|---|---|
| `src/lib/hyrox/objective/grid.ts` | types de la grille, lignes base ↔ grille, `seedSql` |
| `src/lib/hyrox/objective/model.ts` | `objectiveFromRun(grid, d, R)`, `runForTotal(grid, d, T)`, forme des runs, extrapolation bornée |
| `src/lib/hyrox/objective/vsObjective.ts` | écarts, tolérance, états (en avance / dans l'objectif / en retard / départ rapide), courbe cumulée |
| `src/lib/hyrox/objective/strategy.ts` | leviers §9 (partition sans double comptage), chrono possible |
| `src/lib/hyrox/season.ts` | `seasonOf`, regroupement |
| `src/api/hyroxObjective.ts` | grille active, objectifs de saison, plans (`hyroxObjectiveKeys`, `invalidateHyroxObjective`) |
| Tests | un fichier par module (`__tests__/`), golden test : l'exemple du §2.4 et une course de Léa Démo |

`racePlan.ts` garde `planSegments` / `planTargets` / `parseClock` ; `planFromTarget` (prorata des médianes) est remplacé par le modèle.

---

## 11. Découpage proposé (phase 2)

1. **Modèle et données** : grille, migration (agon-test puis prod), `objective/*`, `season.ts`, tests. Rien de visible.
2. **Course réalisée** : en-tête, tableau, frise, débrief contre l'objectif ; retrait du classement (§5).
3. **Meilleure stratégie** : leviers, cascade, axes de travail.
4. **Objectif et saison** : écran Objectif (run moyen), objectif de saison, courses par saison.
5. **Ma saison à l'ordinateur** (maquette validée d'abord), puis vues coach (Stations, Radar, Évolution).

Chaque lot : Nouveautés, `npm run check`, push sur `dev`.

**Avancement**
- Lot 1 (15/11/2026) : fait. Migration `20261116180000` en prod, grille obj@1 (60 lignes).
- Lot 2 (15/11/2026) : fait pour l'analyse de course et Ma saison. `objective/forRace.ts` (plan, sinon run du jour) ; en-tête, frise, débrief, tableau des 17 segments, onglets Runs et Gains, montre, « Comparer à » (objectif / course précédente) lisent l'objectif. Supprimés : `RaceCategoryCard`, `categoryEquivalence.ts`, `profilePercentiles`, `stationProfile`, `ownTotalPct`, positions dans « Comparer », profil runner / hybride de l'en-tête.
- Restent sur la médiane jusqu'à leur lot : leviers coach (`raceLevers`, lot 3, l'onglet Gains passe alors à `raceStrategy`) ; vues coach Stations, Radar, Évolution (`standing()`, `segmentPositions`, lot 5). `hyrox_reference_segments` n'est plus lue que par ces vues.

---

## 12. Questions à Hugo

| | Question | Proposition |
|---|---|---|
| Q1 | Le tableau §3.4 est-il bon, division par division ? | à valider par Hugo |
| Q2 | Données : quelle voie (§3.5) ? | écrire à RoxHype, table arrondie en attendant |
| Q3 | Run moyen : hors Roxzone (résultats officiels) ou Roxzone comprise (comme ROXFIT) ? | hors Roxzone, avec l'allure « Roxzone comprise » affichée à côté |
| Q4 | Forme des runs de l'objectif | proposé : départ maîtrisé ; retenu : forme habituelle |
| Q5 | Objectif d'une course faite sans plan | le run moyen réalisé ce jour-là, modifiable |
| Q6 | Tolérance « dans l'objectif » | 2 % de la cible (au moins 3 s) par segment, 1 % sur le chrono |
| Q7 | Équivalences de chrono entre catégories | supprimées |
| Q8 | Vues coach Stations, Radar, Évolution | en écart à l'objectif (% et secondes) |
| Q9 | Bascule de saison | proposé : 1ᵉʳ août ; retenu : 15 août |
| Q10 | Montre (FC recalée) dans « meilleure stratégie » | indice qui explique un levier, sans secondes propres |

**Réponses d'Hugo (15/11/2026)** :
- Q1 : tableau validé pour les 4 groupes (Open hommes, Open femmes, Pro hommes et femmes, doubles).
- Q2 : « Agon n'est pas commercial et ne veut pas le devenir » → table arrondie du §3.4.
- Q3 : non posée, défaut retenu (hors Roxzone, allure « Roxzone comprise » affichée à côté).
- Q4 : **forme habituelle** (run 1 rapide compris), pas le départ maîtrisé.
- Q5 : run du jour.
- Q6 : 2 % (au moins 3 s), 1 % sur le chrono.
- Q7 et Q8 : vues coach en écart à l'objectif, équivalences supprimées.
- Q9 : **bascule au 15 août**.
- Q10 : FC = indice seulement.

---

## Annexe : prompt pour la maquette « Ma saison » à l'ordinateur (Claude Design)

À coller dans le canvas Agon de Claude Design, après validation de ce document :

> Planche « HYROX · Ma saison · ordinateur » pour Agon, avec le design system Agon. Athlète fictive Léa Démo, Open femmes, Saison 26/27, objectif de saison 5:10 /km → 1:24:10. Largeur 1440 px, 3 colonnes. 01 Dernière course (HYROX Paris, 16 sept., 1:23:38, objectif 1:24:10, « −0:32 en avance », rang 312 / 1 840, bouton « Ouvrir l'analyse »). 02 Le chrono contre l'objectif : courbe des courses de la saison (points) et de leur objectif (tirets), solo et duo séparés. 03 Quoi travailler : 4 leviers récurrents en secondes (Roxzone −1:10, wall balls −0:52, run après sled −0:38, départ trop rapide −0:24), chacun relié à un axe de travail. 04 Segments × courses : grille de 17 colonnes (runs, stations, Roxzone) + chrono, sur 3 courses ; chaque case = écart en secondes à l'objectif, couleurs en avance / dans l'objectif / en retard (jamais « fort / faible »). 05 « Et avec une meilleure stratégie ? » : cascade du chrono réalisé au chrono possible, en deux groupes « Stratégie » et « Capacité ». 06 Les courses de la saison (liste). Aucune donnée réelle. Ajouter la version téléphone (375 px) : mêmes blocs empilés dans l'ordre 01, 02, 05, 03, 04, 06.
