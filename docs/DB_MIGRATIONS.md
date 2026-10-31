# DB_MIGRATIONS.md — Instructions de déploiement
**Projet Supabase :** mxbfnkkbtmbrauvqplrt

---

## Pré-requis

- Supabase CLI installée : `npm install -g supabase`
- Variables d'env :
  ```
  VITE_SUPABASE_URL=https://mxbfnkkbtmbrauvqplrt.supabase.co
  VITE_SUPABASE_ANON_KEY=<voir .env>
  ```
- Accès au projet via : `supabase link --project-ref mxbfnkkbtmbrauvqplrt`

---

## Backup avant toute migration

**Toujours faire un backup avant de pousser en production.**

Via Supabase Dashboard :
1. Settings → Database → Backups → Trigger a backup
2. Attendre confirmation

Via CLI :
```bash
supabase db dump --file backup_$(date +%Y%m%d).sql
```

---

## Checklist pour chaque nouvelle migration

- **Nouvelle table liée à un athlète → à quel domaine staff appartient-elle ?** (`seances`, `planification`, `logs`, `wellness`, `medical`, `nutrition`, `tests`, `fiches`, `commentaires` — voir `docs/STAFF_FEATURE.md`.) Ajouter une policy `staff_<table>_select` (et écriture si besoin) appuyée sur `staff_can(athlete_id, '<domaine>', 'read'|'write')`, ou noter explicitement dans la migration que la table est hors staff.
- Nouvelle clé `app_data` → la rattacher à un domaine dans `staff_app_data_domain()` (sinon invisible pour le staff, ce qui est le comportement sûr par défaut).
- Nouveau chemin Storage lié à un athlète → vérifier `staff_can_path()` / `staff_can_write_docs_path()`.
- Ne jamais réécrire `is_coach_of` / `can_coach_athlete` pour y ajouter le staff : les accès staff passent par des policies séparées préfixées `staff_` (elles s'ajoutent en OU).

---

## Ordre d'exécution des migrations PROMPT 6

Les migrations doivent être appliquées dans cet ordre (dépendances) :

| # | Fichier | Dépendances |
|---|---------|-------------|
| A | `20260427120000_performance_indexes.sql` | Aucune |
| B | `20260427120100_workout_logs_status.sql` | profiles |
| C | `20260427120200_rpc_coach_overview.sql` | app_data, competitions, profiles |
| E | `20260427120300_rls_corrections.sql` | Toutes les tables corrigées |
| F | `20260427120400_cron_missed_workouts.sql` | workout_logs (Migration B) |

> Migration D (readiness score RPC) : **skippée** — calcul client-side dans `useReadinessScore.ts`.

---

## Déploiement

### Option 1 — Via Supabase CLI (recommandé)

```bash
# Lier au projet de staging d'abord
supabase link --project-ref <STAGING_PROJECT_ID>
supabase db push

# Vérifier que tout s'est bien passé
supabase db diff

# Si OK, lier au projet de production
supabase link --project-ref mxbfnkkbtmbrauvqplrt
supabase db push
```

### Option 2 — Via Supabase Dashboard (SQL Editor)

Copier-coller chaque fichier dans Dashboard → SQL Editor → Exécuter.
Vérifier qu'aucune erreur n'est retournée avant de passer au suivant.

### Option 3 — Via psql direct

```bash
psql "postgresql://postgres:<password>@db.mxbfnkkbtmbrauvqplrt.supabase.co:5432/postgres" \
  -f supabase/migrations/20260427120000_performance_indexes.sql \
  -f supabase/migrations/20260427120100_workout_logs_status.sql \
  -f supabase/migrations/20260427120200_rpc_coach_overview.sql \
  -f supabase/migrations/20260427120300_rls_corrections.sql \
  -f supabase/migrations/20260427120400_cron_missed_workouts.sql
```

---

## Activation pg_cron (Migration F)

Si le cron `mark-missed-workouts` doit être actif :

1. Dashboard → Database → Extensions
2. Activer `pg_cron`
3. Ré-exécuter `20260427120400_cron_missed_workouts.sql`

Vérifier que le job est enregistré :
```sql
SELECT * FROM cron.job WHERE jobname = 'mark-missed-workouts';
```

**Alternative sans pg_cron :** créer une Edge Function qui appelle `mark_missed_workouts()` via service_role :

```typescript
// supabase/functions/mark-missed/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data, error } = await supabase.rpc("mark_missed_workouts");
  return new Response(JSON.stringify({ data, error }), { status: 200 });
});
```

Puis planifier via Dashboard → Edge Functions → Cron schedules : `0 3 * * *`

---

## Rollback manuel

Chaque migration est **non-destructive** (pas de DROP TABLE, pas de DROP COLUMN).
Rollback si nécessaire :

### Migration A (indexes) — rollback
```sql
DROP INDEX IF EXISTS idx_app_data_key;
DROP INDEX IF EXISTS idx_app_data_updated_at;
DROP INDEX IF EXISTS idx_competitions_athlete_date;
DROP INDEX IF EXISTS idx_competitions_future;
DROP INDEX IF EXISTS idx_planning_blocks_athlete;
DROP INDEX IF EXISTS idx_performance_logs_athlete_date;
DROP INDEX IF EXISTS idx_test_sessions_athlete_date;
DROP INDEX IF EXISTS idx_test_sessions_coach;
DROP INDEX IF EXISTS idx_habits_athlete;
DROP INDEX IF EXISTS idx_habit_logs_athlete_date;
DROP INDEX IF EXISTS idx_retours_athlete_created;
DROP INDEX IF EXISTS idx_energy_cfg_athlete;
DROP INDEX IF EXISTS idx_energy_logs_athlete_date;
```

### Migration B (workout_logs) — rollback
```sql
DROP TABLE IF EXISTS public.workout_logs CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at();
```

### Migration C (RPC) — rollback
```sql
DROP FUNCTION IF EXISTS public.get_coach_overview(uuid);
```

### Migration E (RLS) — rollback
Restaurer les anciennes politiques overly-permissives. Voir le contenu de
`20260427120300_rls_corrections.sql` et inverser les DROP POLICY / CREATE POLICY.

```sql
DROP FUNCTION IF EXISTS public.is_coach_of(uuid);
```

### Migration F (cron) — rollback
```sql
SELECT cron.unschedule('mark-missed-workouts');
DROP FUNCTION IF EXISTS public.mark_missed_workouts();
```

---

## Régénérer les types TypeScript

Après chaque migration qui ajoute/modifie des tables ou fonctions :

```bash
npx supabase gen types typescript \
  --project-id mxbfnkkbtmbrauvqplrt \
  > src/integrations/supabase/types.ts
```

Le fichier `src/integrations/supabase/types.ts` a été mis à jour manuellement
(2026-04-27). La commande ci-dessus produira la version auto-générée officielle.

---

## Tests

```bash
# Installer pgTAP (nécessaire pour les tests)
supabase db reset  # en dev local seulement

# Lancer les tests
supabase test db

# Ou via psql
psql <connection_string> -f supabase/tests/rls_coach_isolation.sql
psql <connection_string> -f supabase/tests/rpc_coach_overview.sql
```

---

## Variables d'environnement à documenter

Aucune variable supplémentaire requise pour les migrations PROMPT 6.
Les migrations utilisent uniquement `auth.uid()` et les tables existantes.
