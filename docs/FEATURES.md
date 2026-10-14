# Fonctionnalités

Statuts : ✅ Fait — 🔄 En cours — ⬜ À faire — ❌ Abandonné

---

## Phase 1 — MVP (usage personnel, un coach + ses athlètes)

### Vue Coach

| Fonctionnalité | Statut | Notes |
|----------------|--------|-------|
| Création de blocs d'entraînement (6 sem + deload) | ✅ | |
| Programmation exercices par séance et par semaine | ✅ | |
| Types d'exercices : Muscu, Haltérophilie, Plio, Mobilité | ✅ | |
| Option PDC (Poids De Corps) sur les exercices | ✅ | |
| Méthodes avancées : Dropset, Myoreps, Rest-pause, Superset, AMRAP, Excentrique, Isométrique | ✅ | |
| Méthodes custom (coach peut en créer) | ✅ | |
| Banque d'exercices avec filtres et recherche | ✅ | |
| Filtre/recherche dans l'onglet Exos d'une séance | ✅ | |
| Surcharge progressive automatique au tierCfg | ✅ | Recalcul à chaque séance terminée |
| Consignes techniques par exercice | ✅ | |
| Génération IA de programme (Gemini 2.5 Flash) | ✅ | Via Edge Function Supabase |
| Vue Stats coach | ✅ | Courbes volume, intensité, wellness |
| Gestion des blessures | ✅ | |
| Historique des blocs | ✅ | |

### Vue Athlète

| Fonctionnalité | Statut | Notes |
|----------------|--------|-------|
| Dashboard accueil (wellness, prochaine séance, score) | ✅ | |
| Déroulement séance set par set | ✅ | |
| Saisie kg / reps / RIR par set | ✅ | |
| Méthodes avancées affichées pendant la séance | ✅ | |
| Minuterie de repos | ✅ | |
| Wellness quotidien (fatigue, sommeil, stress, énergie, DOMS) | ✅ | |
| Suivi poids corporel + jalons | ✅ | |
| Courbes de progression par exercice | ✅ | |
| PR automatiques par exercice | ✅ | |
| Vue Stats (1RM estimé, volume, wellness) | ✅ | |

### Transversal

| Fonctionnalité | Statut | Notes |
|----------------|--------|-------|
| Authentification Supabase Auth | ✅ | |
| Rôles coach / athlète / coach-athlète | ✅ | |
| Inscription coach avec code unique | ✅ | |
| Inscription athlète via code coach | ✅ | |
| Invitation athlète via lien | ✅ | |
| Multi-athlètes (coach gère plusieurs athlètes) | ✅ | |
| Données isolées par athlète | ✅ | |

---

## Module Séances Énergétiques (cardio structuré)

### Coach

| Fonctionnalité | Statut | Notes |
|----------------|--------|-------|
| Banque partagée de séances énergétiques | ✅ | `/coach/energy-library` |
| Éditeur visuel d'intervalles (EnergyGroup JSONB) | ✅ | Drag & drop, groupes imbriqués, répétitions |
| 7 types de séance : VO₂max / Tempo / Seuil / Footing / Fartlek / Autres / Custom | ✅ | |
| 11 variantes de cible d'intensité | ✅ | Zone FC, % FCmax, FC bpm, allure, % test, puissance, cadence, texte… |
| Aperçu graphique SVG (largeur proportionnelle, couleur intensité) | ✅ | `SessionPreview.tsx` |
| Répartition zones Z1-Z5 + durée estimée + distance | ✅ | |
| Vérification séances par coachs certifiés | ✅ | Badge "✓ Vérifiée", RLS protégée |
| Planification séance → athlète sur date | ✅ | Calendrier mensuel onglet Énergétique de PlanningPage |
| Drag & drop event vers autre date (calendrier) | ✅ | |
| Drawer assignation : reschedule, duplicate, delete | ✅ | `EnergyAssignmentDrawer` |
| Picker séance depuis calendrier (clic sur date vide) | ✅ | `SessionPickerDialog` |

---

## Module Fiches (documents coach → athlète)

Détail : `docs/FICHES_FEATURE.md`.

| Fonctionnalité | Statut | Notes |
|----------------|--------|-------|
| Banque de fiches PDF / images, catégories, tags | ✅ | `/coach/fiches`, import multi-fichiers |
| Variantes d'une fiche (V1, V2, Prog S5…) | ✅ | Une ligne + un fichier par variante |
| Libre-service pour les athlètes du coach | ✅ | Archivage = retrait |
| Rattachement séance / bloc / occurrence / séance énergie | ✅ | Variante par semaine possible |
| Fiches personnelles d'un athlète + attribution manuelle avec note | ✅ | Onglet Fiches de l'espace athlète |
| Vue athlète Programme → Fiches (Mes fiches, Banque, Mes ajouts) | ✅ | `?vue=fiches` |
| Viewer plein écran (react-pdf), vu / non vu, commentaires avec image | ✅ | |
| Ajouts athlète (captures, photos, PDF) compressés | ✅ | WebP 1600 px |
| Questionnaires (POMS…) | ⬜ | V2, esquisse dans FICHES_FEATURE.md |

---

## Phase 2 — Refactorisation + Multi-coachs

| Fonctionnalité | Statut | Notes |
|----------------|--------|-------|
| Refactoriser `WeightliftingTracker.jsx` en composants séparés | ⬜ | Fichier actuel : 2500+ lignes |
| Migrer vers schéma BDD relationnel (voir `DATABASE.md`) | ⬜ | Actuellement clé-valeur JSONB |
| Inscription libre pour les coachs | ⬜ | |
| Messagerie coach ↔ athlète | ⬜ | |
| Abonnement / plans tarifaires | ⬜ | |
| Commentaires de séance | ⬜ | |

---

## Phase 3 — Mobile natif

| Fonctionnalité | Statut | Notes |
|----------------|--------|-------|
| Migration React Native + Expo | ⬜ | |
| Notifications push (rappel séance, feedback coach) | ⬜ | |
| Mode hors-ligne (séance sans connexion) | ⬜ | |
| Wearables (Apple Watch, Garmin) | ⬜ | |

---

## Groupes musculaires supportés

Pecs, Dos-GD, Dos-Trap, Dos-Rhom, Dos-Erec, Ep-Ant, Ep-Lat, Ep-Post, Quads, Ischios, Fessiers, Adducteurs, Triceps, Biceps, Core, Mollets, AB (avant-bras)

## Méthodes d'entraînement supportées

Dropset, Myoreps, Rest-pause, Superset, AMRAP, Excentrique, Isométrique + méthodes custom coach
