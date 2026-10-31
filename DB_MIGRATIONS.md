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

---

## Migration 20260501000000 — Refonte module énergie (2026-05-01)

### Ce qu'elle fait

1. **DROP** `energy_session_config`, `energy_workout_logs`, `energy_exercises` (CASCADE)
2. **DELETE** clés `app_data` liées au planning énergie legacy
3. **ADD COLUMN IF NOT EXISTS** `profiles.is_certified_coach` (idempotent)
4. **CREATE** `energy_sessions` — banque partagée de séances énergétiques
5. **CREATE** `energy_session_assignments` — planning d'une session pour un athlète/date

### Commandes déployées

```bash
supabase db push
supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

### Types associés

`src/types/energy.ts` — types stricts pour le JSONB `intervals` :
- `EnergyStep` = `EnergyInterval | EnergyGroup` (union discriminée)
- `EnergyTarget` — 11 variantes (hr_zone, hr_pct, pace, pace_test_pct, power, cadence, x_per_y, text…)
- `EnergyDuration` — time / distance / calories / lap_button

### Rollback

```sql
DROP TABLE IF EXISTS public.energy_session_assignments CASCADE;
DROP TABLE IF EXISTS public.energy_sessions CASCADE;
-- Les anciennes tables (energy_session_config etc.) ne peuvent pas être restaurées
-- automatiquement — restaurer depuis un backup Supabase si nécessaire.
```

### Notes

- `is_coach_of(athlete_uuid uuid)` prend **un seul argument** (auth.uid() est implicite)
- `set_updated_at()` existait déjà — utilisé pour les deux nouveaux triggers
- `is_certified_coach` protégé par trigger `trg_prevent_flag_update` (pas de RLS séparée)

---

## Migration 2026-07-18 — Banque Spécifique (sports / qualités / format / blocs)

**Fichier :** `supabase/migrations/20260718000000_specifique_sport_quality.sql`
**Statut : ⚠️ NON APPLIQUÉE — à déployer** (`npx supabase login` puis `npx supabase db push`, ou coller le SQL dans le Dashboard → SQL Editor).

### Contenu

1. `specific_sports` — référentiel sports (seed 9 sports globaux `coach_id NULL` + customs coach). RLS : lecture globaux + siens, écriture siens.
2. `physical_qualities` — référentiel qualités physiques (seed 13 qualités). Même RLS.
3. `energy_sessions` — nouvelles colonnes :
   - `sport_id` / `quality_id` (FK référentiels, `ON DELETE SET NULL`)
   - `format` text `'wod' | 'classique'` (défaut `'wod'`, `'classique'` réservé à `session_kind='specifique'`)
   - `classique_structure` JSONB (`{ blocks: ClassiqueBlock[] }` — voir `src/types/specific.ts`)
   - Backfill : `custom_kind` des séances spécifiques → `quality_id` (vo2→vo2max-vma, tempo, seuil, footing→endurance, fartlek)
4. `specific_blocks` — banque de blocs spécifiques **privée par coach** (RLS `coach_id = auth.uid()` sur tout). `content` JSONB `{ title, items }`.

### Rollback

```sql
ALTER TABLE public.energy_sessions
  DROP COLUMN IF EXISTS sport_id,
  DROP COLUMN IF EXISTS quality_id,
  DROP COLUMN IF EXISTS format,
  DROP COLUMN IF EXISTS classique_structure;
DROP TABLE IF EXISTS public.specific_blocks CASCADE;
DROP TABLE IF EXISTS public.physical_qualities CASCADE;
DROP TABLE IF EXISTS public.specific_sports CASCADE;
```

### Notes

- L'app tolère l'absence des tables (référentiels vides → rails/sélecteurs vides), mais l'enregistrement d'une séance spécifique échouera tant que les colonnes n'existent pas.
- L'ancien dropdown catégorie (`SPECIFIQUE_CATEGORIES` → `custom_kind`) est remplacé par le sélecteur Qualité ; `custom_kind` est préservé en lecture pour le legacy.

---

## Migration 2026-07-18 (2) — Édition exercices par coach certifié

**Fichier :** `supabase/migrations/20260718100000_exercises_certified_update.sql`
**Statut : ⚠️ NON APPLIQUÉE** — même déploiement que la précédente.

Policy `exercises_update_certified` : coach certifié (`is_certified_coach`) ou admin peut modifier n''importe quel exercice (caractéristiques de tri : type, muscles, équipement, difficulté…). Indépendante de la migration Banque Spécifique — peut se déployer seule.

Rollback : `DROP POLICY IF EXISTS "exercises_update_certified" ON public.exercises;`

Note taxonomie `ex_type` : valeurs DB `muscu | halterophilie | mobilite | plio | vitesse | gainage` (labels français dans `src/lib/exerciseTypes.ts`). Pas de contrainte CHECK sur la colonne — les deux nouvelles valeurs ne nécessitent pas de migration.

---

## Migration 2026-10-14 — Module Fiches

**Fichier :** `supabase/migrations/20261014100000_fiches.sql`
**Statut : ✅ APPLIQUÉE en prod le 2026-10-14** via `supabase db query --linked -f` (pas de `db push` : historique distant désynchronisé).

Tables `docs`, `doc_assignments`, `doc_comments` ; colonne `energy_sessions.fiches` ; fonctions `my_coach_id`, `can_read_doc`, `can_read_doc_file`, `mark_doc_seen`, `sync_doc_assignments` ; bucket privé `docs` + 3 policies `storage.objects`. Détail : `docs/FICHES_FEATURE.md`.

Tests : `supabase db query --linked -f supabase/tests/fiches_rls.sql` → message `RESULTS ok=29 ko=0` (bloc DO toujours annulé).

### Rollback

```sql
DROP POLICY IF EXISTS "docs_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "docs_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "docs_storage_delete" ON storage.objects;
-- vider le bucket depuis le Dashboard s'il contient des fichiers, puis :
DELETE FROM storage.buckets WHERE id = 'docs';
DROP FUNCTION IF EXISTS public.sync_doc_assignments(uuid, text, uuid[]);
DROP FUNCTION IF EXISTS public.mark_doc_seen(uuid);
DROP TABLE IF EXISTS public.doc_comments, public.doc_assignments, public.docs CASCADE;
DROP FUNCTION IF EXISTS public.can_read_doc_file(text);
DROP FUNCTION IF EXISTS public.can_read_doc(uuid);
DROP FUNCTION IF EXISTS public.my_coach_id();
ALTER TABLE public.energy_sessions DROP COLUMN IF EXISTS fiches;
```


---

## Migration 2026-10-09 — Citation du jour (likes)

**Fichier :** `supabase/migrations/20261009000000_citation_du_jour.sql`
**Statut : ✅ APPLIQUÉE en prod le 2026-10-14** (n'avait jamais été appliquée : le like échouait).

Rollback : `DROP TABLE IF EXISTS public.citation_likes, public.citation_stats CASCADE; DROP FUNCTION IF EXISTS public.citation_likes_sync();`

---

## Migration 2026-10-14 (2) — Nouveautés coach (accusés de lecture)

**Fichier :** `supabase/migrations/20261014200000_app_update_reads.sql`
**Statut : ✅ APPLIQUÉE en prod le 2026-10-14** — table `app_update_reads` (lecture / insertion de ses propres lignes) + RPC admin `get_app_update_reads()`.
Le contenu des nouveautés est dans `src/data/releaseNotes.ts`. Sans la table, la carte d'accueil reste masquée.

Rollback : `DROP FUNCTION IF EXISTS public.get_app_update_reads(); DROP TABLE IF EXISTS public.app_update_reads;`

---

## Migration 2026-10-31 — Staff V1 (pros autour des athlètes)

**Fichiers :**
- `supabase/migrations/20261031120000_staff_core.sql` — rôle `staff` + colonne `profiles.profession`, valeur `staff_sharing` de `consent_purpose`, tables `athlete_staff` et `staff_invitations` (+ triggers de garde), fonctions `staff_can`, `staff_can_edit`, `staff_sharing_consented`…, RPC `get_staff_invitation` (anon), `accept_staff_invitation`, `staff_apply_to_all`.
- `supabase/migrations/20261031121000_staff_policies.sql` — policies `staff_*` en lecture sur les tables par domaine, écriture sur `medical_entries`/`medical_attachments`, fiches (`docs`, `doc_assignments`, `doc_comments`) ; `declared_by` accepte `'staff'` ; `can_read_doc` et `can_read_doc_file` remplacées (branches staff ajoutées).
- `supabase/migrations/20261031122000_staff_docs_storage.sql` — dépôt / suppression de fichiers par le staff dans le bucket `docs` (banque du coach, dossier de l'athlète).
- `supabase/migrations/20261031123000_staff_profile_fields.sql` — le pro ne lit plus la ligne `profiles` de l'athlète : policy `profiles_select_staff_athletes` retirée, RPC `staff_athlete_profiles()` qui ne renvoie que les champs permis par ses domaines (nom et coach toujours ; sexe/âge si tests, nutrition ou médical ; poids/taille/métabolisme si nutrition ; consentement exigé pour les domaines santé).

**Statut : ✅ APPLIQUÉES en prod le 2026-10-31** via `supabase db query --linked -f` (pas de `db push`).

Tests : `supabase db query --linked -f supabase/tests/staff_rls.sql` — simulation des rôles (coach, athlète, 2 pros) dans une transaction annulée — 50 vérifications OK (lecture par domaine, champs du profil filtrés, consentement santé, garde des droits, usurpation d'auteur, réutilisation d'invitation, révocation). Aucune ligne laissée en base.

Spec : `docs/STAFF_FEATURE.md`.

### Rollback

Les accès staff sont des policies séparées : les supprimer suffit à couper tout accès sans toucher aux policies existantes.

```sql
BEGIN;
-- 1. Policies staff_* (tables + storage)
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE policyname LIKE 'staff\_%' OR policyname LIKE 'profiles_select_staff%'
  LOOP EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename); END LOOP;
END $$;
-- 1b. Migration 4 : RPC du profil filtré (la policy profiles_select_staff_athletes
--     est déjà retirée ; ne pas la recréer, elle ouvrait la ligne entière).
DROP FUNCTION IF EXISTS public.staff_athlete_profiles();
-- 2. can_read_doc / can_read_doc_file : rejouer leur définition d'origine
--    (blocs CREATE OR REPLACE de supabase/migrations/20261014100000_fiches.sql).
-- 3. Tables et fonctions
DROP TABLE IF EXISTS public.staff_invitations, public.athlete_staff CASCADE;
DROP FUNCTION IF EXISTS public.accept_staff_invitation(text), public.get_staff_invitation(text),
  public.staff_apply_to_all(uuid), public.staff_can(uuid,text,text), public.staff_can_edit(uuid,text,uuid),
  public.staff_can_path(text,text,text), public.staff_can_write_docs_path(text), public.staff_can_write_bank(uuid),
  public.staff_can_edit_doc(uuid), public.staff_doc_for_athlete(uuid,uuid), public.staff_is_linked(uuid),
  public.staff_profile_visible(uuid), public.staff_sharing_consented(uuid), public.staff_app_data_domain(text),
  public.staff_default_permissions(text), public.staff_normalize_permissions(jsonb), public.staff_domains(),
  public.workout_log_athlete_id(uuid), public.athlete_staff_before_insert(), public.athlete_staff_before_update(),
  public.staff_invitations_before_insert();
-- 4. Contraintes (seulement si aucun compte staff / aucune saisie staff n'existe)
--    profiles_role_check sans 'staff', DROP COLUMN profiles.profession,
--    medical_entries_declared_by_check sans 'staff'.
--    La valeur d'enum consent_purpose 'staff_sharing' ne peut pas être retirée : la laisser.
COMMIT;
```
