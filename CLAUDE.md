# Agon

App de suivi d'athlètes en préparation physique. Les **coachs** travaillent sur ordinateur, les **athlètes** sur téléphone (web mobile aujourd'hui, App Store / Play Store visés janvier-février 2027). ~15 utilisateurs réels, une seule base Supabase = la production.

> **Ne faire aucune modification avant d'avoir 95 % de confiance dans ce qui doit être construit. Poser des questions jusqu'à atteindre cette confiance.**

Feuille de route et dette connue : `docs/AUDIT_REFONTE_2026-11.md` (à lire avant tout chantier structurel).

## Stack

- **Front** : React 18 + TypeScript + Vite, React Router v6, TanStack React Query v5, Recharts. UI : composants `src/components/ui` (shadcn) + beaucoup de styles inline hérités — pas de design system unifié pour l'instant.
- **Back** : Supabase — PostgreSQL + RLS, Auth, Storage, Edge Functions (Deno), Vault, pg_cron / pg_net.
- **IA** : Google Gemini (Edge Functions `ai-program`, `athlete-insights`). Les données Garmin sont exclues de tout traitement IA.
- **Déploiement** : Vercel déploie `main` automatiquement.
- **Mobile natif** : **Capacitor** (décidé le 2026-11-07) — l'app web empaquetée pour l'App Store / Play Store, même code. Pas démarré (cible janvier-février 2027).

## Rôles

| Rôle | Où | Ce qu'il fait |
|------|----|---------------|
| `coach` | `/coach` | programmes, planning, tests, fiches, retours, stats de ses athlètes |
| `athlete` | `/athlete` | séances du jour, saisie des charges, wellness, profil, tests |
| `coach_athlete` | les deux | coach qui s'entraîne aussi |
| co-coach | `/coach` | 2ᵉ coach d'un athlète (`athlete_co_coaches`), mêmes droits que le référent (`docs/CO_COACH_FEATURE.md`) |
| staff | `/staff` | kiné, coach adjoint, nutri : droits par lien d'invitation, gérés par le coach (`docs/STAFF_FEATURE.md`) |
| admin | — | `profiles.is_admin` (Hugo) : liste des coachs, certification, roadmap |

`profiles.coach_id` = coach référent. **Toute policy RLS passe par `is_coach_of(athlete_id)`** (référent OU co-coach), jamais `coach_id = auth.uid()` en dur. Autres helpers : `is_co_coach_of`, `my_coach_id`, `staff_can`, `current_user_is_admin`, `is_coach_of_folder` (chemins Storage).

## Où est le code

```
src/
├── App.tsx                 routes (lazy) + QueryClient
├── features/
│   ├── athlete/  pages/ components/ hooks/      app athlète (Today, Program, WorkoutDetail, Profil, Hyrox…)
│   ├── coach/    pages/ components/ hooks/ context/   app coach (athlètes, planning, programmation, banque…)
│   ├── staff/    pages/ components/ hooks/ lib/
│   └── shared/   hooks/ context/ components/ types/   état athlète persisté, hooks communs
├── lib/                    logique pure testée (calculs, dates, énergie, hyrox, import FIT/zip, brouillons locaux)
├── hooks/useAuth.tsx       inscription, connexion, rattachement coach (RPC)
├── integrations/supabase/  client.ts + types.ts (généré)
├── data/releaseNotes.ts    fil « Nouveautés » des coachs
└── components/ui/          primitives shadcn
supabase/
├── migrations/             SQL (historique distant désynchronisé, voir plus bas)
├── functions/              Edge Functions ; _shared/ est aussi importé par le front (décodeurs FIT)
└── tests/                  scripts SQL de test RLS, exécutés en transaction annulée
```

### Données : deux modèles cohabitent

1. **Hérité** : table `app_data` (clé-valeur JSONB, clés `asp:*` par athlète), lue/écrite via `src/lib/storage.ts` (`sLoad`/`sSave`) et `useAthletePersistedState`.
2. **Relationnel** : `workout_logs`, `set_logs`, cycles, tests, wellness, fiches, `provider_*`… lus via des hooks React Query (`src/features/*/hooks`, clés dans `src/lib/queryKeys.ts`).

Les écritures « miroir » entre les deux sont la première source de régressions. Ne pas en ajouter. Cible décidée : couche `src/api/<entité>.ts` typée et testée, seule à parler à Supabase ; les hooks React Query deviennent de simples adaptateurs (audit §5.2-5.3). Une entité migrée n'est plus lue ni écrite ailleurs.

### Couche données `src/api/` (en cours de migration)

Conception et ordre : `docs/COUCHE_API.md`. Règles :
- Une entité = `src/api/<entité>.ts` : lectures (lèvent en cas d'erreur, jamais `?? []` silencieux), écritures, clés React Query de l'entité (`<entité>Keys`, préfixe `['<entité>', athleteId, …]`) et **une** fonction `invalidate<Entité>(qc, athleteId)`.
- Accès Supabase uniquement via `db()` / `unwrap` / `unwrapRows` / `check` de `src/api/client.ts`. ESLint avertit sur tout import de `@/integrations/supabase/client` ailleurs (136 fichiers au 2026-11-07, objectif 0).
- Calculs partagés coach / athlète / IA dans `supabase/functions/_shared/domain/` (pur, importé via `@shared/domain/...` et par les Edge Functions). Jours : toujours `"YYYY-MM-DD"` via `domain/dates.ts` (l'ancien stockage écrit `"YYYYMMDD"`).
- Écritures concurrentes ou multi-champs : RPC Postgres atomique, jamais « relire le blob, modifier, réécrire ».
- Tests : base simulée `supabase/functions/_shared/__tests__/fakeDb.ts` + `setDbForTests` (exemple : `src/api/__tests__/workouts.test.ts`).
- Une opération de planification ne supprime jamais une séance réalisée, commencée ou notée : `deletePlannedWorkouts`.

### Montres connectées

- **COROS** : OAuth2 PKCE (`provider-coros-connect` / `-callback`), synchro par cron (`provider-coros-sync`), fichiers FIT décodés à la main (`supabase/functions/_shared`).
- **Garmin** : candidature développeur en cours ; dossier `docs/integrations/`. Attribution « Garmin [appareil] » obligatoire, désinscription et changement de permissions à gérer.
- Import manuel de fichiers (FIT/zip) dans le navigateur (`src/lib/import`).
- Décisions détaillées : `docs/DECISIONS.md` (entrées 2026-10).

## Commandes

```bash
npm run dev          # Vite sur le port 5173 — un seul serveur à la fois
npm test             # vitest
npm run typecheck    # tsc : le nombre d'erreurs ne doit pas dépasser .tsc-baseline
npm run lint
npm run build
npm run check        # les quatre d'un coup — à lancer avant chaque push
```

La CI GitHub (`.github/workflows/ci.yml`) lance `typecheck`, `lint`, `test`, `build` sur chaque push et chaque PR. Une PR rouge ne se merge pas.

## Conventions

- TypeScript (`.tsx`/`.ts`) pour tout nouveau fichier. Un composant = un fichier, PascalCase. Hooks préfixés `use`.
- Alias `@/` → `src/`.
- Accès BDD dans des hooks React Query, jamais directement dans un composant.
- Tout calcul non trivial va dans `src/lib/` avec un test à côté (`__tests__/`).
- Une mesure absente s'affiche « — », jamais 0.
- Tu corriges des erreurs TypeScript ? Baisse `.tsc-baseline`.

## Base de données — règles

- **Jamais `supabase db push`** : l'historique distant ne connaît pas les migrations locales de 2026-05 à aujourd'hui, il rejouerait tout sur la prod.
- Appliquer une migration : `supabase db query --linked -f supabase/migrations/<fichier>.sql`, puis vérifier par une requête en lecture.
- **Demander à Hugo avant toute écriture en prod.** Tester d'abord à blanc : `BEGIN; … ; ROLLBACK;` avec `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', …)` (exemples dans `supabase/tests/`).
- Durcissement côté serveur : mesurer `git rev-list --count origin/main..origin/dev`. Le client de prod vient de `main` ; s'il ne sait pas encore appeler la nouvelle règle, découper la migration (avant / après déploiement).
- Après une migration : régénérer `supabase gen types typescript --linked > src/integrations/supabase/types.ts`.
- Changer `profiles.coach_id` : seulement via les RPC `link_to_coach_by_code`, `redeem_invitation`, `unlink_athlete` ou les Edge Functions.

## Edge Functions — déploiement

1. `pwd` : lancer `supabase functions deploy <nom>` depuis le dossier (ou worktree) qui contient le bon code.
2. `grep` le symbole attendu dans le fichier avant de déployer.
3. Si le contrat d'appel change, vérifier que `main` sait déjà l'appeler (voir ci-dessus).

## « Nouveautés » coachs

Chaque lot livré ajoute une entrée en tête de `src/data/releaseNotes.ts` : id daté unique, `kind: "feature"` **ou** `"fix"` (jamais mélangés), texte compréhensible par un coach, sans jargon.

## Données réelles

Ne jamais montrer, capturer ni exporter de vrais athlètes. Pour les captures et démos : coach « Agon Démo » et athlète « Léa Démo » (`scripts/seed-demo.mjs`, code coach `DEMO42`).

## Git

- `main` = production (Vercel). On n'y committe jamais directement.
- `dev` = branche de travail partagée par Hugo et Tito. Pas de feature branches.

**Début de session** :
```bash
git checkout dev
git fetch origin
git reset --hard origin/dev
```
Puis `npm run dev` et vérifier que l'app charge sans erreur console bloquante.

**Pousser** : `git add <fichiers>` (jamais `git add .`), commit `type(scope): message` terminé par `Co-Authored-By: <modèle Claude> <noreply@anthropic.com>`, `npm run check`, `git push origin dev`. Push refusé → `git pull origin dev --rebase`, lire les deux versions de chaque conflit, puis repousser.

**PR dev → main** : environ tous les 3 lots, pas à chaque prompt. Avant : `git fetch origin && git merge origin/main --no-edit`, `npm run check`, push, puis `gh pr create --base main --head dev`. Hugo relit et merge.

**Interdits** : `--force` sur `dev` ou `main` ; committer `.claude/settings.local.json`, `supabase/.temp/` ou `.env*`.

Skills du projet (`.claude/skills/`) : `pousser`, `preparer-pr`, `recuperer`, `nouvelle-fonctionnalite`, `migration-bdd`, `edge-function`, `integration-provider`, `rgpd-check`, `release-notes`.

## Documentation

- À jour : `docs/AUDIT_REFONTE_2026-11.md`, `docs/DECISIONS.md` (journal des choix, entrée la plus récente en bas), `docs/*_FEATURE.md`, `docs/integrations/`.
- Historiques, ne pas s'y fier : `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/FEATURES.md`, `docs/AUDIT.md`, `docs/PROGRESS.md` (époque du monolithe `WeightliftingTracker`).
