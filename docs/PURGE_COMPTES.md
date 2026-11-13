# Purge des comptes (limitation de la conservation)

Revue juridique `docs/juridique/REVUE_2026-11.md` I6, AIPD A6. Préparé le 2026-11-13.

**État au 2026-11-13 (accord d'Hugo)** : migration appliquée, `account-retention` et `delete-account`
déployées, `RETENTION_ENABLED=true`, tâche cron **active** (lundi 4 h 30 UTC). Premier passage réel :
0 compte visé. Seule la règle 1 agit : aucun service d'e-mail n'est choisi (décision d'Hugo : plus tard,
aucun compte ne peut avoir 3 ans d'inactivité avant 2029), donc aucun compte inactif n'est prévenu ni
supprimé.

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
| `supabase/migrations/20261115110000_purge_comptes.sql` | table `account_retention_notices`, fonctions `account_retention_candidates()` (qui) et `account_retention_preview()` (combien, sans identifiant), `trigger_account_retention()`, tâche cron `account-retention` (lundi 4 h 30 UTC) **créée inactive** |
| `supabase/functions/account-retention` | déroulé d'un passage ; ne fait que compter sans le secret `RETENTION_ENABLED=true` |
| `supabase/functions/_shared/accountRetention.ts` | logique testée : annulations, suppressions (20 au plus par passage), préavis (e-mail **avant** enregistrement) ; rapport en nombres seulement |
| `supabase/tests/purge_comptes.sql` | 23 cas sur comptes fictifs, droits, journal, cron inactif |
| `src/lib/legal.ts` (`RETENTION`) | politique de confidentialité : les deux durées |

## Ce que la purge viserait aujourd'hui

Essai à blanc puis premier passage réel en prod le 2026-11-13 : **0** compte pré-créé à supprimer,
**0** compte à prévenir, **0** à supprimer, **0** préavis à annuler.

Pour recompter (nombres seulement) :

```sql
SELECT * FROM public.account_retention_preview();
```

## Reste à faire : préavis par e-mail (règle 2)

Choisir un service d'envoi (Resend prévu dans le code ; Brevo, hébergé dans l'UE, en remplaçant
`resendSender`). C'est un **nouveau sous-traitant** : l'ajouter à `SUBPROCESSORS`, au registre et à la
politique. Puis poser `RESEND_API_KEY` et `RETENTION_MAIL_FROM` (adresse d'un domaine vérifié).

Arrêt d'urgence : `supabase secrets set RETENTION_ENABLED=false` (effet immédiat : le passage ne fait
plus que compter), puis
`SELECT cron.alter_job(jobid, active := false) FROM cron.job WHERE jobname = 'account-retention';`.

Dernier rapport (nombres seulement) : `SELECT status_code, content FROM net._http_response ORDER BY
created DESC LIMIT 5;` peu après lundi 4 h 30 UTC.

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
