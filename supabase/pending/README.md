# Migrations prêtes, en attente d'accord

Le job CI « Rejeu des migrations (R2) » compare `supabase/migrations/` au schéma de la prod
(`supabase/tests/ci/schema.sql`) et devient rouge si un fichier n'est pas appliqué. Une migration
écrite mais pas encore autorisée attend donc ici, avec son test. Ce dossier n'est lu par aucun outil.

## 20261114120000 — IA coupée sans date de naissance (revue juridique C2, phase 2)

> **ANNULÉE par Hugo le 2026-11-17 : ne pas appliquer.** Le préavis athlète (« d'ici le
> 21 novembre ») a été retiré de l'app le même jour ; la date de naissance reste demandée
> (BirthDateGate) et l'accord IA donné avant 18 ans reste refusé (trigger
> `ai_consent_adults_only` existant). Les fichiers restent ici pour mémoire, sans effet.

Durcissement : à appliquer **le 22/11/2026**. Hugo a donné son accord le 14/11, sous condition d'un préavis de 7 jours
(jusqu'au 21/11 inclus, `AI_BIRTH_DATE_DEADLINE`). Aucune Edge Function à déployer :
toutes les lectures serveur de l'accord IA passent par la vue `current_consents`
(`hasConsent` d'`athlete-insights` et `ai-program`, liste des athlètes de `coach-api`,
`ai_eligible_sources`).

Fichiers :
- `20261114120000_ai_requires_birth_date.sql` : la migration ;
- `tests/ai_requires_birth_date.sql` : son test (nouveau) ;
- `tests/ai_consent_adults_only.sql`, `tests/set_my_birth_date.sql` : versions phase 2 des tests
  existants (un accord donné sans date devient un refus), à substituer le même jour, sinon le job
  « Tests SQL » passe au rouge ;
- `20261114120000_ai_requires_birth_date.rollback.sql` : retour arrière.

Test à blanc en prod le 2026-11-14 (migration + les trois tests dans une même transaction
annulée) : 10/10, 5/5, 17/17. Avant : 6 comptes ont l'accord IA « oui » sans date, 12 avec date,
16 profils sans date.

Client de `main` : refus 403 `consentement_ia_absent` d'`athlete-insights` → repli silencieux sur
les phrases calculées (`useAthleteInsights`) ; `ai-program` n'est plus appelé par le client ;
`ConsentGate` ne redemande pas l'accord (il regarde la version, pas la valeur) ; `BirthDateGate`
passe avant et l'IA revient d'elle-même dès la saisie (18 ans ou plus).

Application, dans l'ordre, depuis un dossier sur `dev` à jour :

```bash
PROD="$HOME/Library/Application Support/Claude/side-session-notes/local_5c6d5043-2ee4-41cb-b34d-5a8b413ac928/prod.sh"
git mv supabase/pending/20261114120000_ai_requires_birth_date.sql supabase/migrations/
git mv supabase/pending/tests/ai_requires_birth_date.sql supabase/tests/
git mv -f supabase/pending/tests/ai_consent_adults_only.sql supabase/tests/ai_consent_adults_only.sql
git mv -f supabase/pending/tests/set_my_birth_date.sql supabase/tests/set_my_birth_date.sql
"$PROD" supabase db query --linked -f supabase/migrations/20261114120000_ai_requires_birth_date.sql
for t in ai_requires_birth_date ai_consent_adults_only set_my_birth_date; do "$PROD" supabase db query --linked -f supabase/tests/$t.sql; done
"$PROD" supabase migration repair --status applied 20261114120000 --linked
"$PROD" supabase db push --dry-run --linked
"$PROD" bash -c 'supabase db dump --linked --dry-run 2>/dev/null | bash > supabase/tests/ci/schema.sql'
git diff --stat supabase/tests/ci/schema.sql
```

Attendu : chaque ligne de test égale à la valeur entre parenthèses ; « Remote database is up to
date » ; dans `schema.sql`, seuls changent la vue `current_consents` et la fonction
`ai_consent_adults_only` (et leurs commentaires). Types TS inchangés (mêmes colonnes). Ensuite
`npm run check`, commit, `git push origin dev`, puis
`node ~/agon-roadmap/bin/roadmap.mjs done T-ia-coupee-sans-date-de-naissance-phase-2`.
