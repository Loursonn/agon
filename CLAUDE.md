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

## Git workflow

### Branches
- `main` → production (Vercel auto-deploy). Ne jamais committer directement.
- `dev` → branche de travail partagée. Les deux développeurs pushent ici directement. Pas de feature branches.

### Début de session obligatoire

**1. Récupérer la dernière version GitHub (priorité absolue sur la version locale)**
```bash
git checkout dev
git fetch origin
git reset --hard origin/dev
```
> `reset --hard` garantit que la version locale = version GitHub exacte, même si Hugo a pushé entre temps. Ne jamais utiliser `git pull` seul — risque de merge inutile si divergence.

**2. Lancer l'app en local pour vérifier qu'elle tourne**
```bash
npm run dev
```
Ouvrir dans le navigateur, vérifier que l'app charge sans erreur console bloquante avant de commencer à coder.

### PUSH — sauvegarder sur dev
```bash
git add <fichiers modifiés>   # jamais .claude/settings.local.json
git commit -m "type(scope): message

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin dev
```
Si push rejeté (non-fast-forward = l'autre dev a pushé entre-temps) :
```bash
git pull origin dev --rebase
# résoudre conflits si besoin → lire les deux versions avant de choisir
git push origin dev
```

### PULL REQUEST — dev → main (mise en prod)
```bash
gh pr create --base main --head dev \
  --title "feat: ..." \
  --body "$(cat <<'EOF'
## Summary
- ...

## Test plan
- [ ] ...

🤖 Generated with Claude Code
EOF
)"
```
Le propriétaire du repo review + merge → Vercel déploie automatiquement.

### Règles absolues
- Toujours commencer par `git fetch origin && git reset --hard origin/dev`
- Ne jamais committer `.claude/settings.local.json`
- Ne jamais `--force` push sur `dev` ou `main`
- En cas de conflit rebase : lire les deux versions avant de choisir — ne pas écraser aveuglément

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
