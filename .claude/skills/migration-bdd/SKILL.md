---
name: migration-bdd
description: Écrire, tester et appliquer une migration SQL Supabase sur la base de production d'Agon. Déclencheurs - nouvelle table, colonne, policy RLS, fonction SQL, « migration », « change la base ».
---

# Migration BDD

Il n'y a **qu'une base : la prod**. Pas de staging, pas de Docker local.

## Écrire
- Fichier `supabase/migrations/AAAAMMJJHHMMSS_nom.sql`, idempotent quand c'est possible (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`).
- RLS activée sur toute nouvelle table. Policies via `is_coach_of(athlete_id)`, `auth.uid() = athlete_id`, `staff_can(...)`, `current_user_is_admin()`. **Jamais** `coach_id = auth.uid()` en dur (casse le co-coach).
- Forme rapide (obligatoire, `20261115193700_rls_perf_preconditions.sql`) : `athlete_id = (SELECT auth.uid())`, `(SELECT public.current_user_is_admin())`, `((SELECT public.i_am_coach()) AND is_coach_of(athlete_id))` (idem `can_coach_athlete`, `is_co_coach_of`, `is_coach_partner`, `is_coach_of_folder`), `((SELECT public.i_am_staff()) AND staff_can(...))` (idem `staff_can_edit*`, `staff_can_write_*`). Sans précondition, la fonction tourne à chaque ligne pour tout le monde. Une nouvelle fonction « coach » ou « staff » doit rester vraie seulement si `i_am_coach()` / `i_am_staff()` l'est.
- Fonctions `SECURITY DEFINER` : `SET search_path = public`, vérifier `auth.uid()` dedans, `REVOKE ALL … FROM PUBLIC, anon` puis `GRANT EXECUTE` au strict nécessaire.
- Storage : chemins préfixés par l'uuid de l'athlète ; policies via `is_coach_of_folder`.
- Donnée personnelle nouvelle ? Skill `rgpd-check`.

## Tester à blanc
Script dans `supabase/tests/<nom>.sql`, entièrement dans `BEGIN; … ROLLBACK;`, qui joue chaque rôle :
```sql
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '<uuid>', 'role', 'authenticated')::text, true);
```
Cas à couvrir : l'athlète voit ses lignes, pas celles d'un autre ; le coach (référent et co-coach) voit ses athlètes, pas ceux d'un autre coach ; anon ne voit rien. Lancer la migration + le test ensemble dans une transaction annulée.

## Compatibilité avec la prod
`git rev-list --count origin/main..origin/dev` : le client en prod vient de `main`. Si la migration ferme un accès que ce client utilise encore, la couper en deux (partie compatible maintenant, durcissement après merge + déploiement Vercel). Exemple : `20261107110000_security_lockdown.sql` / `20261107120000_security_lockdown_after_client.sql`.

## Appliquer
1. **Demander à Hugo** (outil de question) en résumant ce qui change.
2. `supabase db query --linked -f supabase/migrations/<fichier>.sql` — pas de `supabase db push` ; puis `supabase migration repair --status applied <version> --linked` (la version = les 14 chiffres du nom, unique).
3. Vérifier par une requête en lecture (`pg_policies`, `information_schema`).
4. `supabase gen types typescript --linked > src/integrations/supabase/types.ts`, puis `npm run typecheck`.
