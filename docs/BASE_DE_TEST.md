# Base de test `agon-test`

Créée le 2026-11-15 après deux pannes de la prod (plan gratuit, budget d'IO disque épuisé par nos tests). **Toute vérification d'écran, tout seed démo et tout test qui écrit se font ici, pas en prod.**

| | Prod | Test |
|---|---|---|
| Projet Supabase | `myprepapro` (mxbfnkkbtmbrauvqplrt) | `agon-test` (djobcxoohnphozaiyqaa), org « Agon Test », Paris |
| Fichier d'env | `.env` | `.env.staging` (hors git, à la racine du dépôt principal) |
| Données | vrais athlètes | uniquement de faux comptes + Agon Démo / Léa Démo / Sam Démo |

Plan gratuit : aucune donnée réelle n'y va jamais (ni copie, ni dump de la prod).

## Utiliser la base de test

```bash
npm run dev -- --mode staging          # le front parle à agon-test
node scripts/seed-demo.mjs --env staging --link athlete --app http://localhost:5173
```

- Vite lit `.env.staging` à la racine du dossier lancé. Dans un worktree : `ln -s /Users/hugo/myprepapro/.env.staging .env.staging`.
- `seed-demo.mjs` affiche toujours la base visée (`Base visée : TEST` ou `PRODUCTION`). Sans `--env`, c'est la prod.
- Seed démo complet (efface et recrée Léa) : autorisé ici, jamais en prod.
  `DEMO_PASSWORD="$(openssl rand -base64 24)" node scripts/seed-demo.mjs --env staging --set-password`

## Requêtes SQL sur la base de test

`supabase db query` ne vise que le projet lié. Ne jamais relier le dépôt principal à `agon-test` (risque de confondre avec la prod) : passer par un dossier à part.

```bash
mkdir -p ~/agon-test-cli && cd ~/agon-test-cli
supabase link --project-ref djobcxoohnphozaiyqaa < /dev/null
supabase db query --linked -f <fichier>.sql
```

## Reconstruire la base de test

Dans le dossier lié à `agon-test`, dans cet ordre :

1. `supabase/tests/ci/before_schema.sql`
2. `supabase/tests/ci/schema.sql`
3. `supabase/tests/ci/reference_data.sql`
4. `supabase/tests/ci/platform.sql` sans ses lignes `cron.schedule` (pas de crons sur la base de test) :
   `grep -v cron.schedule supabase/tests/ci/platform.sql > /tmp/platform_nocron.sql`
5. `supabase/tests/ci/seed.sql` (faux comptes)
6. `supabase/staging/reference_extra.sql` (sports et qualités par défaut, nécessaires au seed démo)
7. `supabase/staging/fix_auth_tokens.sql` (sinon l'admin auth répond « Database error finding users »)
8. Seed démo complet (ci-dessus).

Une migration validée en prod se rejoue aussi ici (`supabase db query --linked -f` depuis le dossier `agon-test`) pour garder les deux bases au même niveau. C'est d'ici, et jamais de la prod, qu'on régénère `supabase/tests/ci/schema.sql`, `reference_data.sql` et les types (décision du 16/11/2026, après la 3e panne de la prod).

## Ce que la base de test n'a pas

- Edge Functions : non déployées (IA, Garmin, COROS, e-mails). Les écrans qui en dépendent restent à vérifier en prod, en lecture.
- Crons, webhooks montres, secrets (clés IA, OAuth).
