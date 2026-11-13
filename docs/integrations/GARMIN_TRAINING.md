# Garmin : envoi des séances sur la montre

Les séances programmées dans Agon partent dans le calendrier Garmin Connect de
l'athlète, puis sur sa montre à la synchronisation. Décisions : `docs/DECISIONS.md`
(2026-11-13). La documentation Garmin (Training API) est confidentielle : elle
n'est **pas** dans le dépôt (public). Hugo l'a en local.

## Chemin

```
pg_cron « garmin-workouts » (toutes les 10 min)
  └─ trigger_garmin_workouts()  — n'appelle que s'il existe une connexion Garmin active
      └─ Edge Function provider-garmin-workouts (service_role uniquement)
          pour chaque connexion Garmin active :
            verrou provider_sync_try_lock → jeton frais → syncAthleteWorkouts → déverrou
```

Code pur dans `supabase/functions/_shared/garminTraining/` :

| Fichier | Rôle |
|---|---|
| `targets.ts` | cibles Agon → valeurs Garmin (bpm, m/s, watts) ; texte si la donnée manque |
| `translate.ts` | séance énergie / muscu → séance Garmin (étapes, répétitions, numérotation, 100 étapes max) |
| `strength.ts` | séance muscu du programme → paramètres de la bonne semaine, kg calculés comme l'écran athlète |
| `exercises.ts` + `exerciseCatalog.ts` | catalogue d'exercices Garmin, recherche, proposition depuis le nom français |
| `plan.ts` | réconciliation : créer, remplacer, retirer, oublier (empreinte de la séance) |
| `sync.ts` | lecture des séances des 7 jours, exécution des actions, suivi en base |
| `client.ts` | appels HTTP Garmin, erreurs (401/403/412/429 arrêtent l'athlète) |
| `withdraw.ts` | à la déconnexion : retire les séances à venir de la montre |

## Données

- `provider_workout_pushes` : une ligne par séance Agon envoyée (`source_kind`
  energy = id d'affectation, strength = id de `workout_logs`), id Garmin,
  empreinte, statut `sent | error | rejected`, avertissements. Lecture athlète
  et coachs (`is_coach_of`), écriture service_role. Effacée avec la connexion.
- `provider_connections.push_workouts` : interrupteur de l'athlète.
- `exercises.garmin_category` / `garmin_exercise` : équivalent choisi (les deux
  ou aucun).

## Règles

- Une séance faite, commencée ou notée n'est jamais retirée de la montre.
- Erreur Garmin : la ligne passe en `error`, nouvel essai au passage suivant
  (5 essais rapprochés puis toutes les 6 h). 401/403/412/429 arrêtent l'athlète
  pour ce passage.
- 412 = l'athlète n'a pas autorisé l'import de séances dans Garmin Connect :
  l'écran lui demande de reconnecter en cochant cette autorisation.
- Natation : pas de cible principale chez Garmin, consigne en texte.

## Permission « Workout Import »

Garmin répond 412 à tout appel Training si l'athlète n'a pas coché « Workout
Import » à la connexion. `provider-garmin-workouts` lit `granted_scopes` :

- **inconnues** (liste vide) → relues par `GET /user/permissions`
  (`ensureKnownScopes`) et rangées ; une lecture en échec ou vide n'écrit rien ;
- **sans `WORKOUT_IMPORT`** → aucun appel pour cet athlète (compté `noPermission`) ;
  l'écran « Montres » affiche « Envoi bloqué : autorise l'import de séances… » ;
- `userPermissionsChange` met `granted_scopes` à jour (webhook) : une permission
  retirée chez Garmin coupe l'envoi au passage suivant, une permission rendue le relance.

## Activer l'envoi des séances pour les vrais athlètes

État au 13/11/2026 : `push_workouts` (vrai par défaut) a été mis à faux sur les
deux connexions d'athlètes réels ; seuls les comptes admin envoient.

Prérequis, dans l'ordre :

1. **PR dev → main déployée** : l'interrupteur « Envoyer mes séances sur ma
   montre » n'existe que sur `dev`. Sans lui en prod, un athlète ne peut pas
   couper l'envoi.
2. **`provider-garmin-workouts` redéployée** avec la lecture des permissions
   (sinon les connexions du 09/11 aux permissions inconnues tentent l'envoi et
   se font refuser en 412 à chaque passage).
3. **Accord d'Hugo**, puis :

```sql
-- Relire avant : qui passe à vrai (aucune donnée personnelle affichée)
select id, connected_at::date, granted_scopes from provider_connections
 where provider = 'garmin' and status = 'active' and not push_workouts;
-- Activer
update provider_connections set push_workouts = true, updated_at = now()
 where provider = 'garmin' and status = 'active' and not push_workouts;
```

4. Au passage suivant du cron (10 min) : `select status, count(*) from
   provider_workout_pushes group by 1;` — des lignes `sent`, aucune `error` en 412.

## Tests

`supabase/functions/_shared/__tests__/garminTraining.test.ts` (traduction),
`garminTrainingSync.test.ts` (bout en bout, base simulée),
`src/lib/__tests__/garminExercises.test.ts` (catalogue, propositions),
`supabase/tests/garmin_workout_push.sql` (RLS, à blanc).
