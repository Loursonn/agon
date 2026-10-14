# Base de données

---

## État actuel

Supabase (PostgreSQL). Une seule table `app_data` en clé-valeur JSONB — pas de schéma relationnel.

```sql
app_data (
  key   TEXT,
  value JSONB,
  user_id UUID   -- isolement par athlète
)
```

Les données sont lues/écrites via `sLoad()` / `sSave()` dans `WeightliftingTracker.jsx`.

---

## Tables d'authentification (Supabase Auth)

Ces tables sont gérées automatiquement par Supabase.

```sql
-- Profils utilisateurs (étend auth.users)
profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users,
  role        TEXT CHECK (role IN ('coach', 'athlete', 'coach_athlete')),
  full_name   TEXT,
  coach_id    UUID REFERENCES profiles(id),   -- null si coach
  coach_code  TEXT UNIQUE                      -- code 6 caractères pour inviter des athlètes
)

-- Invitations par lien
invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  coach_id    UUID REFERENCES profiles(id),
  used_at     TIMESTAMPTZ
)
```

---

## Schéma cible (migration prévue en Phase 2)

La migration vers un schéma relationnel permettra :
- Requêtes performantes (pas de parsing JSONB)
- Historique propre
- Support multi-coachs

```sql
-- Structure entraînement
programs          (id, coach_id, name, description, created_at)
blocks            (id, program_id, week_start, week_end, is_deload)
sessions          (id, block_id, label, day_of_week)
exercises         (id, name, bloc, target, ex_type, tier)
session_exercises  (id, session_id, exercise_id, order, weeks_config JSONB)

-- Suivi athlète
workout_logs      (id, athlete_id, session_id, date, completed)
set_logs          (id, workout_log_id, exercise_id, set_num, kg, reps, rir, method)
wellness_logs     (id, athlete_id, date, fatigue, sleep, stress, energy, doms JSONB)
body_weight       (id, athlete_id, date, weight_kg)
injuries          (id, athlete_id, zone, description, date_start, date_end)
pr_logs           (id, athlete_id, exercise_id, kg, date)
```

---

## Module Fiches (2026-10-14)

```
docs             (id, coach_id, athlete_id?, uploaded_by?, origin_id?, variant_label, variant_order,
                  title, description, category, tags[], kind, file_path, file_size, mime_type,
                  is_self_service, archived_at, created_at, updated_at)
doc_assignments  (id, doc_id, athlete_id, assigned_by, source: manuel|programme|energie,
                  coach_note, seen_at, created_at)  UNIQUE (doc_id, athlete_id, source)
doc_comments     (id, doc_id, athlete_id, author_id, body, image_path, created_at)
energy_sessions.fiches  jsonb  (FicheAttachment[])
```

Bucket Storage privé `docs` (10 Mo, PDF + images). RLS via `can_read_doc()` / `can_read_doc_file()`,
RPC `mark_doc_seen`, `sync_doc_assignments`. Voir `docs/FICHES_FEATURE.md`.

---

## Row Level Security (RLS)

Supabase RLS est actif. Règles en place :
- Un athlète ne peut lire/écrire que ses propres données (`user_id = auth.uid()`)
- Un coach peut lire les données de ses athlètes (`coach_id = auth.uid()`)

---

## Migrations

Les fichiers de migration sont dans `supabase/migrations/`.

Pour appliquer une migration en local :
```bash
npx supabase db push
```

---

## Accès Supabase

- Dashboard : https://supabase.com → projet `mxbfnkkbtmbrauvqplrt`
- URL : `https://mxbfnkkbtmbrauvqplrt.supabase.co`
- Edge Functions : `supabase/functions/`
  - `ai-program/index.ts` — génération de programme via Gemini 2.5 Flash
