# Migrations prêtes, en attente d'accord

Le job CI « Rejeu des migrations (R2) » compare `supabase/migrations/` au schéma de la prod
(`supabase/tests/ci/schema.sql`) et devient rouge si un fichier n'est pas appliqué. Une migration
écrite mais pas encore autorisée attend donc ici, avec son test. Ce dossier n'est lu par aucun outil.

## 20261115100000_hds_temps2_suppression.sql — P44, HDS temps 2

Supprime `medical_entries.diagnosis / treatment / diagnosed_by`, les tables `medical_history` et
`medical_attachments`, le bucket `medical` et ses 4 policies, et retire `medical` de
`list_user_storage_objects`. S'arrête sans rien supprimer si une ligne, un champ ou un fichier subsiste.

**Condition** : `git log origin/main` contient la mise en prod du 13/11 (PR #150) **et** Vercel l'a
déployée : l'ancien client écrit encore `diagnosis` et échouerait.

Essai à blanc en prod le 2026-11-13 (migration + test, `BEGIN … ROLLBACK`) : 9/9, colonnes, tables et
bucket absents dans la transaction. Prod ce jour : 0 champ rempli, 0 ligne, bucket vide.

Application (accord d'Hugo) :

```bash
git mv supabase/pending/20261115100000_hds_temps2_suppression.sql supabase/migrations/
git mv -f supabase/pending/tests/hds_retrait_soins.sql supabase/tests/hds_retrait_soins.sql
supabase db query --linked -f supabase/migrations/20261115100000_hds_temps2_suppression.sql   # via prod.sh
supabase db query --linked -f supabase/tests/hds_retrait_soins.sql                           # « 9 / 9 »
supabase migration repair --status applied 20261115100000 --linked
supabase db dump --linked -f supabase/tests/ci/schema.sql      # voir supabase/tests/ci/README.md
supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

Puis à la main : `supabase/tests/ci/platform.sql` (retirer le bucket `medical` et ses 4 policies),
`docs/juridique/REGISTRE.md` T2 (ligne « Fichiers » : plus de bucket `medical`), entrée
`docs/DECISIONS.md`, commentaire d'en-tête de `src/api/injuries.ts`. Déployer `delete-account` et
`pending-athlete` (liste `USER_BUCKETS` sans `medical`). `npm run check`, push.

## 20261115110000_purge_comptes.sql — purge des comptes (revue juridique I6)

Voir `docs/PURGE_COMPTES.md` (règles, essai à blanc, activation). Application : mêmes étapes
(`git mv` vers `supabase/migrations/` et `supabase/tests/purge_comptes.sql`, `db query`, `repair
20261115110000`, dump de `schema.sql`), et dans `platform.sql` :

```sql
SELECT cron.schedule('account-retention', '30 4 * * 1', 'SELECT public.trigger_account_retention();');
```

(avant la ligne qui désactive toutes les tâches). La tâche reste inactive en prod jusqu'à l'étape 5 de
`docs/PURGE_COMPTES.md`.

## 20261114120000_ai_requires_birth_date.sql — accord IA sans effet sans date de naissance (revue C2, phase 2)

Pour l'accord IA (`ai_programming`), `current_consents` ne vaut « oui » que si la date de naissance est connue
et indique 18 ans ou plus ; le trigger `ai_consent_adults_only` enregistre en refus un accord donné sans date.
Rien n'est effacé du journal : l'IA revient seule une fois la date saisie.

**Condition** : l'écran « Ta date de naissance » (`BirthDateGate`, appelle `set_my_birth_date`, appliquée le
2026-11-14) est en production sur `main` et Vercel l'a déployé ; sinon les comptes sans date perdraient l'IA
sans pouvoir saisir leur date.

Essai à blanc en prod le 2026-11-14 (`BEGIN … ROLLBACK`) : 10/10. Application : mêmes étapes que ci-dessus
(`git mv` vers `supabase/migrations/` et `supabase/tests/ai_requires_birth_date.sql`, `db query`, `repair
20261114120000`, dump de `schema.sql`, `gen types`).
