# Purge des comptes (limitation de la conservation)

Revue juridique `docs/juridique/REVUE_2026-11.md` I6, AIPD A6. Préparé le 2026-11-13, **inactif** tant
qu'Hugo ne l'a pas activé.

## Règles

| Règle | Qui | Ce qui se passe |
|---|---|---|
| Compte pré-créé jamais réclamé | athlète créé par son coach (`profiles.is_pending`), jeton de réclamation de plus de 6 mois, **et** aucune séance créée ni modifiée pour lui depuis 6 mois | suppression |
| Compte inactif | ni connexion, ni session rafraîchie, ni ouverture de l'application (`client_build_at`) depuis 3 ans ; jamais l'admin ; jamais un coach (référent ou co-coach) dont un athlète est encore actif | e-mail de préavis, puis suppression 30 jours plus tard si la personne ne s'est pas reconnectée ; une reconnexion annule le préavis |

La seconde condition de la règle 1 protège le coach qui suit un athlète « sans application » : tant
qu'il lui programme des séances, le compte reste.

La suppression est celle du droit à l'effacement (`_shared/accountDeletion.ts`, partagée avec
`delete-account`) : journal anonyme (`account_deletions.initiated_by = 'retention'`), fichiers,
révocation Garmin / COROS, compte auth puis cascade.

## Pièces

| Pièce | Rôle |
|---|---|
| `supabase/pending/20261115110000_purge_comptes.sql` | table `account_retention_notices`, fonctions `account_retention_candidates()` (qui) et `account_retention_preview()` (combien, sans identifiant), `trigger_account_retention()`, tâche cron `account-retention` (lundi 4 h 30 UTC) **créée inactive** |
| `supabase/functions/account-retention` | déroulé d'un passage ; ne fait que compter sans le secret `RETENTION_ENABLED=true` |
| `supabase/functions/_shared/accountRetention.ts` | logique testée : annulations, suppressions (20 au plus par passage), préavis (e-mail **avant** enregistrement) ; rapport en nombres seulement |
| `supabase/pending/tests/purge_comptes.sql` | 23 cas sur comptes fictifs, droits, journal, cron inactif |
| `src/lib/legal.ts` (`RETENTION`) | politique de confidentialité : les deux durées |

## Ce que la purge viserait aujourd'hui

Essai à blanc en prod le 2026-11-13 (migration + aperçu dans `BEGIN … ROLLBACK`) : **0** compte
pré-créé à supprimer, **0** compte à prévenir, **0** à supprimer, **0** préavis à annuler.

Pour recompter, une fois la migration appliquée (nombres seulement) :

```sql
SELECT * FROM public.account_retention_preview();
```

## Activation (accord d'Hugo)

1. Appliquer la migration : la déplacer de `supabase/pending/` vers `supabase/migrations/` et son
   test vers `supabase/tests/`, puis `supabase db query --linked -f …`, vérifier,
   `supabase migration repair --status applied 20261115110000 --linked`, rafraîchir
   `supabase/tests/ci/schema.sql` et ajouter la ligne cron à `supabase/tests/ci/platform.sql`
   (voir `supabase/pending/README.md`).
2. Déployer `account-retention` **et** `delete-account` (elle utilise maintenant le module partagé).
3. Préavis par e-mail : choisir un service d'envoi (Resend prévu dans le code, offre gratuite
   suffisante ; c'est un **nouveau sous-traitant** à ajouter à `SUBPROCESSORS`, au registre et à
   la politique), poser `RESEND_API_KEY` et `RETENTION_MAIL_FROM` (adresse d'un domaine vérifié).
   Sans eux, seule la règle 1 s'applique : aucun compte inactif n'est supprimé.
4. `supabase secrets set RETENTION_ENABLED=true`.
5. Activer la tâche : `SELECT cron.alter_job(jobid, active := true) FROM cron.job WHERE jobname = 'account-retention';`
6. Registre (`docs/juridique/REGISTRE.md` T1, durée) et AIPD (A6 → fait).

Arrêt d'urgence : `supabase secrets set RETENTION_ENABLED=false` (effet immédiat), puis désactiver
la tâche cron.

## Texte du préavis

Construit par `retentionNotice()` (`_shared/accountRetention.ts`). Objet : « Votre compte Agon sera
supprimé le 14 décembre 2029 ». Corps :

> Bonjour,
>
> Vous n'avez pas utilisé votre compte Agon depuis plus de 3 ans. Pour ne pas garder vos données plus
> longtemps que nécessaire, nous supprimerons ce compte le 14 décembre 2029, avec tout ce qu'il
> contient : séances, charges, bien-être, blessures, mesures, données de montre et fichiers.
>
> Vous voulez le garder ? Connectez-vous simplement avant cette date : https://agon-training.com
> La suppression est alors annulée, il n'y a rien d'autre à faire.
>
> Vous voulez récupérer vos données avant ? Une fois connecté, ouvrez la rubrique Confidentialité et
> choisissez « Télécharger toutes mes données ».
>
> Sans connexion de votre part, la suppression sera définitive : nous ne pourrons pas récupérer le
> compte ensuite.
>
> L'équipe Agon
>
> Vous recevez ce message une seule fois, parce qu'un compte Agon est ouvert à cette adresse.
> Politique de confidentialité : https://agon-training.com/confidentialite
