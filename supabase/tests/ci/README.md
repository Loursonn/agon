# Tests SQL en CI

Le job « Tests SQL » (`.github/workflows/sql-tests.yml`) rejoue chaque `supabase/tests/*.sql` sur chaque push vers `dev` / `main` et chaque PR, contre une base Supabase **locale et éphémère** démarrée dans le runner (`supabase start`). Il ne touche jamais la prod, et `run.mjs` refuse toute URL qui n'est pas locale.

## Pourquoi un dump de schéma et pas les migrations

Reconstruire la base à partir de `supabase/migrations/` n'est pas fiable aujourd'hui :
- 3 numéros de version en double, 12 fichiers à version courte ;
- `20260404_nutrition.sql` est enregistrée comme appliquée mais ses tables n'existent pas en prod ;
- la table `exercises` a été créée à la main (aucune migration ne la crée) ;
- l'historique distant s'arrête en juillet 2026 (le reste a été appliqué avec `db query -f`).

Détail et plan pour réaligner : `docs/PLAN_LEGACY.md` §3. Tant que ce n'est pas fait, la base de test part du **schéma réel de la prod** (structure seule).

## Les fichiers, dans l'ordre de chargement

| Fichier | Contenu | Origine |
|---|---|---|
| `before_schema.sql` | retire les droits par défaut de Supabase local sur `public`, pour que les droits de la prod soient reproduits à l'identique | écrit à la main |
| `schema.sql` | schéma de la prod (tables, fonctions, policies, droits), **aucune donnée** | `supabase db dump --linked` (lecture) |
| `reference_data.sql` | bibliothèques : exercices, définitions et variables de tests, séances d'énergie, grilles et règles HYROX, politiques des sources (`created_by` remis à NULL). Aucune donnée d'athlète ni de coach | `export_reference_data.mjs` (lecture) |
| `platform.sql` | buckets et policies Storage, tâches pg_cron (le dump de schéma ne couvre pas le schéma `storage` ni `cron.job`) | requêtes de lecture sur `storage.buckets`, `pg_policies`, `cron.job` |
| `seed.sql` | utilisateurs **fictifs** (admin, coachs, athlètes dont « Léa Démo », e-mails `@example.invalid`) et ce que les scripts de test cherchent dans la base | écrit à la main |

Puis `run.mjs` exécute chaque script dans `BEGIN … ROLLBACK` et lit ses lignes de résultat (formats décrits en tête du fichier). Le test HYROX (`hyrox_tests_pglite.mjs`, PGlite) tourne dans la même CI.

## Rafraîchir après une migration appliquée en prod

Le schéma de test doit suivre la prod. Après chaque migration appliquée (`supabase db query --linked -f …`) :

```bash
supabase db dump --linked -f supabase/tests/ci/schema.sql
```

Sans Docker (`pg_dump` 17+ installé, par exemple `brew install libpq`) : `supabase db dump --linked --dry-run` affiche le script `pg_dump` ; le lancer avec `bash` et rediriger la sortie vers `schema.sql`. Ne jamais copier ce script ailleurs : il contient un mot de passe temporaire.

Si la migration ajoute des lignes de bibliothèque (nouvelle table de référence, nouveaux presets) :

```bash
node supabase/tests/ci/export_reference_data.mjs > supabase/tests/ci/reference_data.sql
```

(liste des tables dans le script ; n'y ajouter **que** des tables sans donnée personnelle). Un nouveau bucket, une nouvelle policy Storage ou une nouvelle tâche cron : les ajouter à `platform.sql`.

Écrire un nouveau test : même forme que les existants (`BEGIN; … ROLLBACK;`, une ligne par cas avec `ok` booléen, ou `k`/`v` avec la valeur attendue entre parenthèses à la fin du libellé). S'il a besoin d'un rôle ou d'une donnée que `seed.sql` n'a pas, l'ajouter au seed, en fictif.

## Lancer en local

Avec Docker :

```bash
supabase start   # dans un dossier vide initialisé par `supabase init`, pas à la racine du repo
for f in before_schema schema reference_data platform seed; do psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q -v ON_ERROR_STOP=1 -f supabase/tests/ci/$f.sql; done
(cd supabase/tests && npm i --no-save --no-package-lock --prefix . pg@8 @electric-sql/pglite@0.2.17)
node supabase/tests/ci/run.mjs                       # tous les scripts
node supabase/tests/ci/run.mjs supabase/tests/staff_rls.sql   # un seul
```

## Échecs connus

`known_failures.txt` liste les cas (ou, en dernier recours, les fichiers) que le job signale « ignoré (connu) » sans échouer. Chaque ligne est une dette : corriger la base ou le script, puis retirer la ligne. Au 2026-11-13 :

- **Régression en prod** : `20261112200000_hr_zone_models_coach` a recréé `hr_zone_bounds_at` sans le repli « modèle actuel » ajouté par `20261112160000_history_zones_garmin_ai` (une sortie antérieure à tout modèle de zones n'a pas de résumé de zones).
- **Schéma de prod** : 8 clés étrangères ajoutées depuis la migration d'hygiène n'ont pas d'index.
- **Donnée réelle** : un cas de `references_rpcs.sql` vérifie une ligne précise de la prod.
- **Scripts à corriger** (fichiers entiers ignorés) : `hr_zone_models.sql` (périmé depuis que seul le coach enregistre les zones), `rls_coach_isolation.sql` (INSERT exécuté sous l'identité du mauvais coach), `sante_tables.sql` (profil de test sans date de naissance créé avec un jwt encore posé).

Image Postgres : le workflow force la version de la prod (`17.6.1.084`) ; l'image par défaut de la CLI 2.95.4 plante sur « permission denied for function ».
