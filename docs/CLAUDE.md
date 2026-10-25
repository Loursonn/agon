# Agon

App de suivi d'athlètes en préparation physique (coach + athlètes). Cible finale : mobile iOS/Android.

> **Ne faire aucune modification avant d'avoir 95% de confiance dans ce qui doit être construit. Poser des questions jusqu'à atteindre cette confiance.**

## Stack

- **Frontend** : React 18 + TypeScript + Vite, shadcn/ui + Tailwind CSS
- **Backend** : Supabase (PostgreSQL + Auth + Edge Functions)
- **IA** : Google Gemini 2.5 Flash (génération de programmes)
- **Data** : TanStack React Query v5, React Hook Form + Zod, Recharts
- **Mobile cible** : React Native + Expo

## Architecture

Fichier monolithique actuel : `src/components/WeightliftingTracker.jsx` (~2500 lignes, à refactoriser).

Structure cible :
```
src/
├── pages/athlete/    (Dashboard, Session, Stats)
├── pages/coach/      (Programs, Exercises, Athletes, Stats, Settings)
├── components/       ui/ | athlete/ | coach/
├── hooks/
└── lib/supabase.ts
```

## Base de données

BDD actuelle : table `app_data` (JSONB clé-valeur, pas d'auth).

Schéma cible :
```
profiles          (id, role: coach|athlete, full_name, coach_id?)
programs          (id, coach_id, name)
blocks            (id, program_id, week_start, week_end, is_deload)
sessions          (id, block_id, label, day_of_week)
exercises         (id, name, bloc, target, ex_type, tier)
session_exercises (id, session_id, exercise_id, order, weeks_config JSONB)
workout_logs      (id, athlete_id, session_id, date, completed)
set_logs          (id, workout_log_id, exercise_id, set_num, kg, reps, rir, method)
wellness_logs     (id, athlete_id, date, fatigue, sleep, stress, energy, doms JSONB)
body_weight       (id, athlete_id, date, weight_kg)
pr_logs           (id, athlete_id, exercise_id, kg, date)
injuries          (id, athlete_id, zone, date_start, date_end)
```

## Rôles

Coach : créer/assigner programmes, voir stats athlètes, générer IA, commenter.
Athlète : suivre séances, saisir wellness, voir ses stats, commenter.

## Conventions de code

- TypeScript uniquement (`.tsx`, pas de `.jsx`)
- Un composant = un fichier, PascalCase ; hooks : préfixe `use` dans `src/hooks/`
- Imports : alias `@/` pour `src/` ; Styling : Tailwind uniquement
- Requêtes BDD : via hooks React Query, jamais directement dans les composants

## Git

- `main` → production (Vercel auto-deploy) — ne jamais pusher directement
- `dev` → branche de travail partagée
- `feat/xxx` / `fix/xxx` → créées depuis `dev`, PR vers `dev`

## Fichiers clés

- `src/components/WeightliftingTracker.jsx` — monolithe actuel
- `supabase/functions/ai-program/index.ts` — Edge Function IA
- `src/integrations/supabase/types.ts` — types auto-générés
- `docs/` — ARCHITECTURE.md, DATABASE.md, FEATURES.md, DECISIONS.md

## Env

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```
