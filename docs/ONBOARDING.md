# Onboarding — Nouveau développeur

Bienvenue sur Agon. Ce guide te permet d'être opérationnel en local en 15 minutes.

---

## Prérequis

- Node.js v18+ (`node -v` pour vérifier)
- Git
- Un éditeur (VS Code recommandé)
- Accès au repo GitHub : `https://github.com/Loursonn/agon`
- Accès au projet Supabase (demande à Hugo)

---

## Installation

```bash
# 1. Cloner le repo
git clone https://github.com/Loursonn/agon.git
cd agon

# 2. Installer les dépendances
npm install

# 3. Créer le fichier d'environnement
touch .env
```

Colle dans `.env` (demande les valeurs à Hugo) :

```
VITE_SUPABASE_URL=https://mxbfnkkbtmbrauvqplrt.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<clé anon Supabase — demande à Hugo>
```

```bash
# 4. Démarrer l'app
npm run dev
# → ouvre http://localhost:5173
```

---

## Créer un compte

L'app tourne en local → va sur `http://localhost:5173` → "Créer un compte" → Coach ou Athlète.

---

## Workflow Git

```bash
# Avant de commencer (chaque jour)
git fetch origin
git checkout dev
git pull origin dev

# Créer une branche pour ta feature
git checkout -b feat/nom-de-ta-feature

# Sauvegarder ton travail
git add fichier-modifié.tsx
git commit -m "description courte"
git push origin feat/nom-de-ta-feature

# Quand c'est prêt : ouvrir une Pull Request sur GitHub (feat/xxx → dev)
```

**Ne jamais pusher directement sur `main` ou `dev`.**

---

## Structure du projet

```
src/
├── components/
│   ├── WeightliftingTracker.jsx   ← composant principal (2500+ lignes, à refactoriser)
│   └── ui/                        ← composants shadcn (ne pas modifier)
├── hooks/
│   └── useAuth.tsx                ← authentification Supabase
├── pages/
│   ├── Login.tsx
│   ├── coach/Dashboard.tsx
│   └── athlete/Dashboard.tsx
├── integrations/supabase/
│   └── client.ts                  ← client Supabase
└── App.tsx                        ← routing principal
```

---

## Commandes utiles

```bash
npm run dev        # dev local
npm run build      # build production
npm run test       # tests
npx tsc --noEmit  # vérification TypeScript sans compiler
```

---

## Contacts

- Hugo (chef de projet / coach) — propriétaire du repo et du projet Supabase
- Voir `docs/ARCHITECTURE.md` pour comprendre le code
- Voir `docs/FEATURES.md` pour les specs fonctionnelles
- Voir `docs/DATABASE.md` pour le schéma BDD
