# Sauvegarde de la base Agon

Dernière vérification : **2026-11-09** (tâche P0). Projet Supabase `myprepapro` (`mxbfnkkbtmbrauvqplrt`), PostgreSQL 17.6, région eu-west-1.

## État constaté

| Point | Résultat |
| --- | --- |
| Sauvegardes automatiques Supabase | **Aucune** (`backups: []`, vérifié avec `supabase backups list`) |
| PITR (restauration à une date) | **Désactivé** (`pitr_enabled: false`), donc pas de fenêtre de rétention |
| Taille de la base | environ 30 Mo |
| Seule sauvegarde existante | le dump manuel décrit ci-dessous |

Conséquence : **sans dump manuel, il n'y a aucun moyen de revenir en arrière.** Recommandation à Hugo : passer au plan Pro (sauvegardes quotidiennes) et ajouter l'option PITR avant d'ouvrir à plus d'utilisateurs.

## Où est le dump

- Dossier : `C:\Users\titou\Backups\agon\` (PC de Titouan, **hors du repo**, jamais à committer).
- Fichier : `agon_AAAA-MM-JJ.dump.gpg`, chiffré AES-256 (gpg, mot de passe). Le mot de passe est dans le gestionnaire de mots de passe de Titouan, pas dans le repo.
- À faire (décision Hugo + Titouan) : une **seconde copie** hors du PC (disque externe ou stockage chiffré).
- Contient les données des athlètes : ne jamais l'envoyer par mail ni le déposer non chiffré.

## Faire un dump

Prérequis : PostgreSQL 17 (`pg_dump`, `psql`), `gpg`, le mot de passe de la base (Supabase > Project Settings > Database). Connexion par le pooler (session).

```powershell
$env:PGPASSWORD = '<mot de passe base>'
$env:PGSSLMODE  = 'require'
$bin  = 'C:\Program Files\PostgreSQL\17\bin'
$conn = '-h','aws-1-eu-west-1.pooler.supabase.com','-p','5432','-U','postgres.mxbfnkkbtmbrauvqplrt','-d','postgres'
$date = Get-Date -Format yyyy-MM-dd
$out  = 'C:\Users\titou\Backups\agon'

# 1. Compteurs de lignes AVANT
$sql = "select table_schema||'.'||table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint from information_schema.tables where table_type='BASE TABLE' and table_schema in ('public','auth','storage','vault','cron') order by 1"
$env:PGOPTIONS = '-c default_transaction_read_only=on'
& "$bin\psql.exe" @conn -At -F ',' -c $sql | Set-Content -Encoding utf8 "$out\counts_avant_$date.csv"

# 2. Dump (lecture seule côté prod)
& "$bin\pg_dump.exe" @conn -Fc --no-owner -n public -n auth -n storage -n vault -n cron -f "$out\agon_$date.dump"

# 3. Compteurs APRÈS, comparaison
& "$bin\psql.exe" @conn -At -F ',' -c $sql | Set-Content -Encoding utf8 "$out\counts_apres_$date.csv"
Compare-Object (Get-Content "$out\counts_avant_$date.csv") (Get-Content "$out\counts_apres_$date.csv")   # doit ne rien afficher

# 4. Chiffrer puis supprimer le fichier en clair
gpg --symmetric --cipher-algo AES256 -o "$out\agon_$date.dump.gpg" "$out\agon_$date.dump"
Remove-Item "$out\agon_$date.dump"
```

Le dump ne touche que les schémas `public`, `auth`, `storage` (métadonnées, pas les fichiers), `vault` et `cron`. **Les fichiers du Storage (photos, FIT importés) ne sont pas dans le dump** : à sauvegarder séparément si on y tient.

## Tester la restauration (jamais sur la prod)

Base locale jetable, PostgreSQL 17 sur le PC (port 55432 dans notre cas). Les rôles Supabase doivent exister, sinon les droits échouent.

```powershell
gpg -o "$out\agon.dump" -d "$out\agon_AAAA-MM-JJ.dump.gpg"
psql -h localhost -p 55432 -U postgres -c "create database agon_restore_test"
psql -h localhost -p 55432 -U postgres -d agon_restore_test -c "create role anon nologin; create role authenticated nologin; create role service_role nologin; create role supabase_admin nologin; create role authenticator nologin; create role supabase_auth_admin nologin; create role supabase_storage_admin nologin; create role dashboard_user nologin;"
pg_restore -h localhost -p 55432 -U postgres -d agon_restore_test --no-owner "$out\agon.dump"
# puis relancer la requête de compteurs sur la base locale et comparer avec counts_avant
psql -h localhost -p 55432 -U postgres -c "drop database agon_restore_test"
Remove-Item "$out\agon.dump"
```

## Résultat du test du 2026-11-09

- Dump : 2 Mo, dont 127 tables comptées (schémas ci-dessus). Compteurs avant et après le dump **identiques**.
- Restauration en local : 124 tables sur 127, **toutes avec exactement le même nombre de lignes**.
- Les 3 tables absentes en local sont `cron.job`, `cron.job_run_details` et `vault.secrets` : les extensions `pg_cron` et `vault` n'existent pas sur un PostgreSQL ordinaire. Leurs données sont bien dans le dump ; elles se restaurent sur un vrai projet Supabase.
- 5 erreurs `pg_restore` ignorées, toutes liées à ces deux extensions (schéma `cron` / table `vault.secrets` / droits par défaut) et au schéma `public` déjà présent.
- Le fichier chiffré a été déchiffré et comparé (hash identique) au dump d'origine.

Limite : ce test valide les données, pas une remise en prod complète (extensions, droits fins, Storage). Pour une vraie reprise, restaurer dans un **projet Supabase de test** puis rejouer les migrations manquantes.

## Fréquence recommandée

- **Avant chaque lot qui écrit en prod** (migration, Edge Function qui change les données) : obligatoire tant qu'il n'y a ni sauvegardes Supabase ni PITR.
- En plus, **une fois par semaine** (la base est petite : moins d'une minute).
- Garder les 4 derniers dumps et en copier un chaque mois hors du PC.
- Dès que le plan Pro est pris : activer les sauvegardes quotidiennes et le PITR, puis ramener le dump manuel à un par mois.
