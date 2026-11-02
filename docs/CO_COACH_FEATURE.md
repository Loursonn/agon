# Double coach (co-coach)

Livré le 2026-11-02. Migration : `supabase/migrations/20261102100000_co_coach.sql`.
Tests RLS : `supabase/tests/co_coach_rls.sql` (37 contrôles, ROLLBACK final).

## 1. Décisions

| Sujet | Décision |
|---|---|
| Nombre de coachs | 2 maximum : coach référent (`profiles.coach_id`) + 1 co-coach. |
| Qui ajoute | Le coach référent **ou** l'athlète, avec le **code coach** du 2e coach. |
| Acceptation | Aucune : accès immédiat. |
| Droits | Identiques sur l'entraînement de l'athlète : voir, créer, modifier, gérer le staff. |
| Banque | Chaque coach garde sa banque privée. Ce qui est **attribué à l'athlète commun** est partagé (lisible + modifiable par les deux). |
| Retrait | Le référent ou l'athlète retirent le co-coach ; le co-coach peut partir de lui-même. |
| Délier l'athlète | Réservé au référent (`unlink_athlete`). Changer de coach référent supprime le co-coach. |
| Athlète | Voit ses deux coachs (Profil → « Mes coachs »). Ses retours et alertes vont aux deux. |
| Staff « coach adjoint » | Inchangé : droits réglables par domaine, distinct du co-coach. |
| API coach | Les clés du co-coach couvrent l'athlète partagé (même accord IA requis). |

## 2. Modèle

`athlete_co_coaches (athlete_id PK, co_coach_id, added_by, added_by_role, hidden, created_at)`

- `athlete_id` en clé primaire → un seul co-coach par athlète.
- `hidden` : masquage propre au co-coach (le référent garde `profiles.coach_hidden`).
- Lecture : athlète, co-coach, référent. Écriture : RPC uniquement
  (`add_co_coach(p_athlete, p_coach_code)`, `remove_co_coach(p_athlete)`,
  `set_athlete_hidden`).
- Trigger `trg_drop_co_coach_on_coach_change` : tout changement de
  `profiles.coach_id` supprime le co-coach.

## 3. Accès

`is_coach_of(athlete)` répond « oui » pour le référent **et** le co-coach
(`is_co_coach_of`, SECURITY DEFINER). Les ~116 policies et fonctions qui
l'utilisent (dont `can_coach_athlete`, le staff, la planification) suivent
sans changement.

La migration réécrit en plus ce qui testait `profiles.coach_id` en dur :
`app_data`, `workout_logs`, `exercise_pr_logs`, `measurement_logs`,
`medical_history`, `workout_rpe`, `test_sessions`, `performance_notifications`,
`energy_sessions` (+ `delete_energy_session`), fiches (`docs` update/delete,
`can_read_doc`, `can_read_doc_file`, `sync_doc_assignments`, `doc_schedule`),
médias de tests, `get_coach_overview`, flag HYROX.

Contenu possédé par un coach mais rattaché à l'athlète :
- **Séances énergie** : modifiables par l'autre coach si attribuées à l'athlète
  commun ; suppression réservée à l'auteur (pas la banque de l'autre).
- **Fiches** : fiche perso de l'athlète, ou même famille qu'une fiche
  attribuée → lisible et modifiable (`doc_for_my_athlete`). Suppression : fiches
  perso de l'athlète uniquement. Une fiche ne peut pas passer à un coach tiers.
- **Référentiels perso** (sports, qualités physiques) : lisibles par le coach
  partenaire (`is_coach_partner`) pour afficher les séances de l'autre.
- **Blocs spécifiques** : restent privés (ils sont copiés dans les séances).

Profil athlète : le co-coach le lit et le modifie, mais un trigger
(`guard_co_coach_profile_update`) limite ses changements aux champs
d'entraînement (nom, âge, taille, poids, sexe, % MG, métabolisme, HYROX,
habitudes, sections d'accueil). Jamais `coach_id`, `role`, flags, code…

## 4. Front

- `src/features/shared/hooks/useCoCoach.ts` — lecture des coachs, ajout, retrait.
- `src/features/shared/components/CoCoachPanel.tsx` — onglet « Coachs & staff »
  (coach) et Profil → « Mes coachs » (athlète).
- `useAuth.fetchAthletes` fusionne athlètes en propre et co-coachés
  (`co_coached_by_me`, `co_coach_id`) ; badges « CO-COACH » / « 2 COACHS ».
- Edge Functions : `_shared/auth.ts` (`canActForAthlete`) et `coach-api`
  (`allowedAthletes`, `canWriteFor`) acceptent le co-coach.

## 5. Limites connues (V1)

- Via l'API coach, le co-coach ne modifie pas les fiches perso créées par
  l'autre coach (l'API ne touche qu'aux fiches de sa propre banque).
- Pas de notification push à l'ajout : l'athlète et les coachs le voient dans
  l'app.
