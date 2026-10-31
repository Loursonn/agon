# STAFF_FEATURE.md — Staff autour des athlètes

**Date :** 2026-10-30
**Statut :** Spec validée en brainstorm, rien n'est implémenté.

Permettre d'ajouter des professionnels (kiné, ostéo, coach adjoint, nutritionniste, préparateur mental, médecin…) autour d'un athlète. Chaque pro accède aux données de l'athlète selon des droits que le **coach principal** règle librement. Un kiné autorisé peut par exemple ajouter des séances ou des fiches.

---

## 1. Décisions validées

| Sujet | Décision |
|---|---|
| Coach principal | Inchangé : `profiles.coach_id`. Il reste propriétaire de l'athlète et seul à gérer les droits du staff. |
| Qui ajoute un pro | Le coach principal **ou** l'athlète. |
| Qui règle les droits | Le coach principal uniquement. |
| Ajout par l'athlète | Le pro reçoit tout de suite la **grille par défaut de son métier**, puis le coach ajuste. Le coach est notifié. |
| Niveau de réglage | **Par lien pro ↔ athlète** (un kiné peut avoir des droits différents sur deux athlètes). |
| Droits | Libres : pour chaque domaine, `aucun` / `lecture` / `écriture`. Le métier ne fait que pré-cocher. |
| Contenus créés par un pro | Vont dans la **banque du coach principal**, avec auteur et métier affichés. |
| Modifier les contenus du coach | Par défaut le pro ne modifie que ce qu'il a créé. Le coach peut l'autoriser à modifier ses contenus, **par lien** (option `can_edit_coach_content`). |
| Validation par l'athlète | **Aucune** : l'athlète est informé de chaque ajout et de chaque changement de droits, et peut retirer l'accès. Voir l'alerte RGPD au §6. |
| Double casquette | Un même compte peut être coach de ses athlètes **et** staff chez un autre coach. Le rôle staff est porté par le lien, pas par le compte. |
| Prix | Compte staff **gratuit**. |

---

## 2. Pourquoi une table à côté (et pas un 2e `coach_id`)

L'accès coach repose sur `is_coach_of(athlete_id)` (lit `profiles.coach_id`) : **93 usages dans 17 migrations**, plus `can_coach_athlete` pour la planification. Toucher à ce mécanisme casserait tout.

Le staff passe donc par une table de liaison et une fonction dédiée, ajoutée en `OR` **uniquement** dans les policies des domaines ouverts au staff. Les policies existantes ne bougent pas.

---

## 3. Modèle de données

### 3.1 `profiles`

- `role` : ajouter `'staff'` au CHECK (`coach`, `athlete`, `coach_athlete`, `staff`). `staff` = compte **uniquement** pro (pas d'athlètes à lui). Il n'a pas de `coach_id`.
- Nouvelle colonne `profession text` (nullable) : métier par défaut du compte, pré-rempli à l'invitation. `kine`, `osteo`, `coach_adjoint`, `nutritionniste`, `prepa_mentale`, `medecin`, `autre`.
- **Double casquette** : un `coach` ou `coach_athlete` peut aussi avoir des liens dans `athlete_staff`. Son rôle ne change pas. L'accès staff se déduit uniquement de `athlete_staff`, jamais de `profiles.role`. Le métier qui compte est celui du lien (`athlete_staff.profession`).

### 3.2 `athlete_staff` (nouvelle)

```sql
CREATE TABLE public.athlete_staff (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  profession   text NOT NULL CHECK (profession IN
               ('kine','osteo','coach_adjoint','nutritionniste','prepa_mentale','medecin','autre')),
  permissions  jsonb NOT NULL DEFAULT '{}',   -- { "seances": "write", "medical": "read", ... }
  can_edit_coach_content boolean NOT NULL DEFAULT false, -- peut modifier les contenus du coach (domaines en write)
  status       text NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','revoked')),  -- le lien n'existe qu'une fois l'invitation acceptée
  added_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,  -- coach ou athlète
  added_by_role text NOT NULL CHECK (added_by_role IN ('coach','athlete')),
  athlete_notified_at timestamptz,             -- information de l'athlète (pas de validation, cf. §6)
  revoked_at   timestamptz,
  revoked_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, staff_id)
);
```

`permissions` en JSONB plutôt qu'une colonne par domaine : on ajoute un domaine sans migration de structure. Les valeurs sont validées par un CHECK ou un trigger (`none` / `read` / `write`, clés connues).

### 3.3 `staff_invitations` (nouvelle)

Même principe que `invitations` (coach → athlète), mais vers un pro qui n'a pas encore de compte.

```
id, athlete_id, email, profession, permissions jsonb,
invited_by, invited_by_role ('coach'|'athlete'),
token, used_at, expires_at, created_at
```

À l'acceptation : création du compte `staff` si besoin, puis création de la ligne `athlete_staff`.

### 3.4 Traçabilité des contenus

Ajouter sur les contenus que le staff peut créer :
- `docs.uploaded_by` existe déjà → suffit pour les fiches.
- Séances et blocs (JSON dans `app_data`) : ajouter `createdBy` / `createdByProfession` dans `ProgSession` et `Bloc` (champs optionnels, pas de migration JSON).

### 3.5 Journal des accès (V2)

`staff_access_log (staff_id, athlete_id, domain, action, at)`, utile pour les données de santé. Alimenté par les hooks de lecture des domaines sensibles (médical, nutrition), pas par toutes les requêtes.

---

## 4. Domaines et grille par défaut

| Domaine (clé) | Contenu | Kiné / Ostéo | Coach adjoint | Nutritionniste | Prépa mentale | Médecin |
|---|---|---|---|---|---|---|
| `seances` | Programme (`asp:prog`), séances énergie, overrides | read | write | none | none | read |
| `fiches` | Fiches attribuées + ajout dans la banque du coach | write | write | write | write | read |
| `planification` | Saisons, macro → microcycles, compétitions | read | write | read | read | read |
| `logs` | Séances réalisées, charges, RPE, PR | read | read | read | none | read |
| `wellness` | Sommeil, fatigue, stress, courbatures, habitudes | read | read | read | read | read |
| `medical` | Antécédents, blessures, pièces jointes médicales | write | read | none | none | write |
| `nutrition` | Stratégie, journal, poids, mensurations | none | read | write | none | read |
| `tests` | Tests de performance, résultats | read | write | none | none | read |
| `commentaires` | Commentaires séances, retours hebdo, fiches | write | write | write | write | write |

Le coach peut tout modifier, pro par pro et athlète par athlète. Les données des montres (`provider_*`) sont **hors staff en V1** (cf. §6).

### Correspondance domaine → tables

| Domaine | Tables / clés |
|---|---|
| `seances` | `app_data` (clé `asp:prog`, `asp:visibility`), `energy_session_assignments`, `workout_logs.athlete_modifications.coachOverride` |
| `fiches` | `docs`, `doc_assignments`, `doc_comments` |
| `planification` | `seasons`, `planning_blocks`, `macrocycles`, `mesocycles`, `cycles`, `microcycles`, `competitions`, `day_themes` |
| `logs` | `workout_logs`, `workout_rpe`, `energy_workout_logs`, `exercise_pr_logs`, `performance_logs` |
| `wellness` | `app_data` (clé `asp:wellness`), `habit_logs` |
| `medical` | `medical_history`, `medical_entries`, `medical_attachments`, `athlete_life_events` |
| `nutrition` | `nutrition_strategy`, `nutrition_daily_log`, mesures corporelles |
| `tests` | `test_sessions`, `test_results`, `athlete_test_results`, `athlete_test_values` |
| `commentaires` | `workout_exercise_comments`, `weekly_retours`, `doc_comments` |

---

## 5. Règles d'accès (RLS)

### 5.1 Fonction centrale

```sql
CREATE OR REPLACE FUNCTION public.staff_can(athlete_uuid uuid, domain text, level text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.athlete_staff s
    WHERE s.athlete_id = athlete_uuid
      AND s.staff_id   = auth.uid()
      AND s.status     = 'active'
      AND CASE level
            WHEN 'read'  THEN s.permissions->>domain IN ('read','write')
            WHEN 'write' THEN s.permissions->>domain = 'write'
          END
  );
$$;
```

Usage dans chaque policy concernée :

```sql
-- lecture
USING (athlete_id = auth.uid() OR is_coach_of(athlete_id) OR staff_can(athlete_id, 'medical', 'read'))
-- écriture
WITH CHECK (is_coach_of(athlete_id) OR staff_can(athlete_id, 'medical', 'write'))
```

### 5.2 `athlete_staff` elle-même

- **Lecture** : le pro (ses liens), l'athlète (son staff), le coach principal.
- **Insertion** : le coach principal, ou l'athlète (permissions forcées à la grille par défaut via trigger, `added_by_role = 'athlete'`).
- **Mise à jour des `permissions` et de `can_edit_coach_content`** : coach principal uniquement (trigger qui bloque toute autre modification de ces colonnes). Chaque changement notifie l'athlète.
- **Révocation** (`status = 'revoked'`) : coach principal **et** athlète. Le pro peut aussi se retirer.
- Pas de suppression physique (garder l'historique pour l'audit).

### 5.3 Le piège du JSON (`app_data`)

Le programme (`asp:prog`) et les banques (`asp:session-bank`, `asp:bloc-bank`) sont **un seul document JSON** par clé. La RLS ne peut pas limiter l'écriture à « ses propres séances » à l'intérieur du document.

Conséquences :
- Un pro avec `seances: write` peut techniquement réécrire tout le programme de l'athlète, séances du coach comprises.
- Ajouter le staff dans la banque du coach (`app_data` du coach, clé `asp:session-bank`) lui donne la main sur **toute** la banque.

Mesures :
1. Policy `app_data` staff **filtrée par clé** : un staff n'accède qu'aux clés de ses domaines (`asp:prog` pour `seances`, etc.), jamais aux autres.
2. Les écritures staff sur le programme et la banque passent par une **RPC** (`staff_add_session`, `staff_update_session`, `staff_delete_session`) au lieu d'un `upsert` direct du JSON. La RPC vérifie, élément par élément : `createdBy = auth.uid()`, **ou** `can_edit_coach_content = true` sur le lien. Elle refuse toujours de toucher aux éléments créés par un **autre pro**. Le staff n'a pas de policy d'écriture directe sur `app_data`.
3. Côté UI, un pro voit modifier/supprimer sur ses propres contenus, et sur ceux du coach seulement si l'option est activée.

Pour les tables relationnelles (`docs`, `medical_entries`…), même règle via policy : un staff modifie/supprime les lignes où `uploaded_by` / `created_by = auth.uid()`, ou celles du coach principal si `can_edit_coach_content`. Le coach garde la main sur tout.

> `can_edit_coach_content` ne donne jamais plus que les domaines en `write` : un kiné en `seances: read` ne modifie aucune séance, même avec l'option.

### 5.4 Checklist pour chaque future migration

À ajouter dans `DB_MIGRATIONS.md` : « Nouvelle table liée à un athlète → à quel domaine staff appartient-elle ? Ajouter `staff_can(...)` dans les policies, ou noter explicitement qu'elle est hors staff. »

---

## 6. Données de santé, consentement, conformité

- **Décision** : pas de validation de l'athlète, ni à l'ajout d'un pro par le coach, ni quand ses droits s'étendent. L'athlète est **informé** (notification + liste « Mon staff » avec métier et droits de chacun) et peut retirer l'accès à tout moment.
- ⚠️ **Alerte RGPD (art. 9)** : partager des données de santé (médical, nutrition, wellness) avec un tiers demande une base légale, en pratique le consentement explicite de l'athlète. Sans aucun consentement, la fonctionnalité expose juridiquement.
  - **Décidé (2026-10-30)** : un **consentement unique**, donné une fois par l'athlète (à l'inscription pour les nouveaux, à la première ouverture après la mise en ligne pour les existants) : « J'accepte que les professionnels ajoutés par mon coach accèdent à mes données selon les droits qu'il définit. » Tracé dans `user_consents` (journal append-only existant). Le parcours reste fluide : rien à valider à chaque ajout.
  - Tant que ce consentement n'est pas donné, `staff_can()` renvoie `false` pour les domaines `medical`, `nutrition` et `wellness`.
  - À faire relire par un juriste avant la mise en ligne.
- **Données des montres** (Garmin, COROS) : hors staff en V1. Le dossier Garmin vient d'exclure toute IA ; un partage à des tiers doit être vérifié contre les conditions Garmin avant ouverture.
- **Hébergement de données de santé (HDS)** : si des kinés ou des médecins utilisent l'app pour tracer des soins, la question d'un hébergement certifié se pose. À vérifier avec un juriste avant la V2. Pas bloquant pour une V1 centrée sur le suivi sportif.
- **Droit à l'effacement** : `right_to_erasure` doit couvrir `athlete_staff`, `staff_invitations`, `staff_access_log`. Suppression d'un compte staff → liens révoqués, contenus créés conservés dans la banque du coach avec auteur anonymisé.

---

## 7. Parcours

### 7.1 Coach ajoute un pro
1. Fiche athlète → onglet **Staff** → « Ajouter un professionnel ».
2. Email + métier → grille pré-cochée, modifiable.
3. Envoi de l'invitation (email avec lien).
4. Le pro crée son compte (ou se connecte) → lien créé, accès actif immédiatement.
5. L'athlète est notifié (« Paul, kiné, a été ajouté à ton staff »).

### 7.2 Athlète ajoute un pro
1. Profil athlète → **Mon staff** → « Ajouter un professionnel ».
2. Email + métier → pas de réglage de droits (grille par défaut du métier).
3. Invitation envoyée, coach notifié (« Lucas a ajouté Paul, kiné »).
4. Le pro accepte → accès actif avec la grille par défaut. Le coach peut ajuster.

### 7.3 Coach règle les droits
Onglet **Staff** de l'athlète → liste des pros → grille domaine × (aucun / lecture / écriture) + case « peut modifier mes contenus ». Raccourci « appliquer à tous mes athlètes suivis par ce pro » (applique la même grille à chaque lien, le réglage reste par lien).

### 7.4 Révocation
Coach ou athlète → « Retirer l'accès » → effet immédiat. Les contenus créés restent dans la banque du coach.

### 7.5 Vue du pro
- Nouvelle route `/staff`, distincte de `/coach` et `/athlete`.
- Accueil : liste de ses athlètes (avec le coach principal de chacun), alertes récentes (nouvelle blessure, wellness dégradé).
- Fiche athlète : seulement les onglets des domaines autorisés, en lecture ou en écriture.
- Un pro qui suit des athlètes de plusieurs coachs : ses contenus vont dans la banque du coach principal **de l'athlète concerné**.
- Double casquette : un coach qui est aussi staff ailleurs garde son espace `/coach` et voit une entrée « Staff » qui ouvre `/staff` sur les athlètes des autres coachs.

### 7.6 Athlète sans coach (autocoaché, `coach_athlete`)
Il est son propre coach principal : il ajoute et règle les droits lui-même (même écran que le coach).

---

## 8. Notifications

| Événement | Destinataires |
|---|---|
| Pro ajouté par l'athlète | Coach principal |
| Pro ajouté par le coach | Athlète |
| Droits d'un pro modifiés | Athlète + le pro concerné |
| Invitation acceptée | Celui qui a invité + coach |
| Pro ajoute une blessure / entrée médicale | Coach principal (+ bandeau sur les séances concernées) |
| Pro ajoute une séance ou une fiche | Coach principal + athlète |
| Accès révoqué | Le pro concerné |

---

## 9. Découpage

### V1 — socle
- Migrations : rôle `staff`, `athlete_staff`, `staff_invitations`, `staff_can()`.
- Invitations coach + athlète, acceptation, révocation.
- Écran de réglage des droits (coach).
- Vue `/staff` en **lecture** sur tous les domaines selon droits.
- **Écriture** V1 : `medical`, `fiches` (banque du coach ; contenus du coach si `can_edit_coach_content`), `commentaires`.
- Information de l'athlète (notifications + « Mon staff ») et consentement unique dans `user_consents` (cf. §6).
- Entrée « Nouveautés » coach (`src/data/releaseNotes.ts`).

### V2 — écriture élargie
- Écriture `seances` via RPC (§5.3), `planification`, `nutrition`, `tests`.
- Notifications complètes, bandeau blessure dans la séance.
- Journal des accès.
- Fil « équipe » par athlète (notes partagées entre pros, notes privées par pro).

### V3
- Données montres pour le staff (après validation Garmin / COROS).
- Vérification HDS.
- Cas multi-coachs avancés (un pro avec sa propre banque en plus de celle des coachs).

---

## 10. Questions tranchées (2026-10-30)

| Question | Décision |
|---|---|
| Validation de l'athlète quand le coach ajoute un pro | Non : simple information. |
| Revalidation si les droits s'étendent au médical / à la nutrition | Non : information seulement. |
| Un pro peut-il modifier les contenus du coach | Oui, si le coach l'autorise sur ce lien (`can_edit_coach_content`). |
| Coach et staff sur le même compte | Oui, double casquette. |
| Base légale RGPD | Consentement unique de l'athlète, tracé dans `user_consents` (§6). |

## 11. Reste à faire avant la mise en ligne

1. Faire relire le texte du consentement unique et le §6 par un juriste.
