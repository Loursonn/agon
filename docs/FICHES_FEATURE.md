# FICHES_FEATURE.md — Module Fiches

**Date :** 2026-10-14
**Statut :** V1 livrée sur `dev` (migration appliquée en prod le 2026-10-14)

Banque de documents du coach (PDF + images : mobilité, pacing individualisé, éducatif, nutrition…) avec variantes, rattachement aux séances / blocs de la programmation et aux séances énergie, libre-service pour les athlètes, fiches personnelles, ajouts de l'athlète et commentaires. Objectif : un maximum d'infos pour un coût de stockage minimal (un fichier n'est stocké qu'une fois, images compressées).

---

## 1. Modèle de données

Migration : `supabase/migrations/20261014100000_fiches.sql`

| Table | Rôle |
|-------|------|
| `docs` | Fiches. `athlete_id NULL` = banque ; sinon fiche personnelle (`uploaded_by` = coach) ou ajout de l'athlète (`uploaded_by` = athlète). Variantes : `origin_id` → fiche d'origine, `variant_label`, `variant_order`. `is_self_service` (banque uniquement, porté par l'origine), `archived_at`. |
| `doc_assignments` | Qui voit quoi : `(doc_id, athlete_id, source)` unique, `source` ∈ `manuel` / `programme` / `energie`, `coach_note`, `seen_at`. |
| `doc_comments` | Fil de commentaires d'une fiche **par athlète** (`athlete_id`), texte + `image_path` optionnelle. |
| `energy_sessions.fiches` | `jsonb` : `FicheAttachment[]`. |

Catégories (CHECK) : `mobilite`, `pacing`, `prevention`, `recuperation`, `nutrition`, `education`, `questionnaire` (réservé V2), `autre`. `kind` : `pdf`, `image`, `questionnaire` (réservé V2).

### Rattachements dans le JSON

```ts
interface FicheAttachment {
  id: string;                      // id local du rattachement
  doc_id: string;                  // fiche / variante par défaut
  weeks?: Record<number, string>;  // semaine → doc_id de la variante
}
```

Champ optionnel `fiches?: FicheAttachment[]` sur `ProgSession`, `Bloc`, `CoachSessionOverride` et `EnergySessionRow`. Les données existantes restent valides sans migration JSON. Les banques de blocs / séances (`asp:bloc-bank`, `asp:session-bank`) conservent les rattachements (copie JSON) ; en mode « une seule semaine », ils sont aplatis sur la variante de cette semaine.

### Synchronisation des attributions

`asp:prog` étant du JSON, la RPC `sync_doc_assignments(p_athlete, p_source, p_doc_ids)` recalcule les attributions d'une source :
- `programme` : séances + blocs de `asp:prog` (toutes les variantes de `weeks`) + overrides d'occurrence (`workout_logs.athlete_modifications.coachOverride`). Appelée après `useUpdateProgrammation`, `useDuplicateProgSession`, `useCoachSessionOverride`.
- `energie` : fiches des séances énergie attribuées à l'athlète. Appelée à l'attribution / suppression d'une séance énergie et à la sauvegarde d'une séance (pour chaque athlète qui l'a au planning).

La RPC n'insère que des fiches du coach appelant, **jamais la fiche personnelle d'un autre athlète**, supprime les lignes de la source qui ne sont plus référencées, ne touche jamais `manuel` et conserve `seen_at`.

---

## 2. RLS

Fonctions `SECURITY DEFINER` : `my_coach_id()`, `can_read_doc(uuid)`, `can_read_doc_file(text)`, `mark_doc_seen(uuid)`, `sync_doc_assignments(...)`.

`can_read_doc` est vraie si l'utilisateur est le coach propriétaire ou l'auteur, si la fiche est la sienne (`athlete_id`), si une fiche de la même famille (origine + variantes) lui est attribuée, ou si l'origine est en libre-service, non archivée, chez son coach.

| Table | Règles |
|-------|--------|
| `docs` | SELECT `can_read_doc(id)`. Coach : INSERT / UPDATE / DELETE si `coach_id = auth.uid()`. Athlète : INSERT de ses ajouts uniquement (`athlete_id = uploaded_by = auth.uid()`, pas de libre-service, pas de variante, `coach_id` = son coach) ; DELETE de ses ajouts. |
| `doc_assignments` | Coach : ALL si `is_coach_of(athlete_id)`. Athlète : SELECT de ses lignes ; `seen_at` via la RPC `mark_doc_seen` (aucun UPDATE direct). |
| `doc_comments` | SELECT si athlète du fil ou son coach ; INSERT si auteur = soi, fil = soi ou un de ses athlètes, fiche lisible ; DELETE de ses commentaires. |

Tests : `supabase/tests/fiches_rls.sql` (29 vérifications, bloc `DO` toujours annulé : aucun effet de bord, exécutable en prod).

---

## 3. Stockage

Bucket **privé** `docs`, 10 Mo max, mime `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.

| Contenu | Chemin |
|---------|--------|
| Fiche de banque | `{coach_id}/banque/{doc_id}.{ext}` |
| Fiche perso / ajout athlète | `{coach_id}/athletes/{athlete_id}/{doc_id}.{ext}` |
| Image de commentaire | `{coach_id}/athletes/{athlete_id}/comments/{comment_id}.webp` |

Policies `storage.objects` : SELECT via `can_read_doc_file(name)` ou auteur de l'upload (`owner_id`) ; INSERT coach dans `{auth.uid()}/…`, athlète uniquement dans `{son_coach}/athletes/{auth.uid()}/…` ; DELETE coach propriétaire du dossier, athlète pour ses propres dépôts (jamais une fiche perso déposée par le coach).

Affichage par **URL signée** (3 600 s, cache React Query 50 min). Jamais d'URL publique.

Coût : aucune copie de fichier à l'attribution ; images compressées côté client (`compressFicheImage` : 1 600 px max, WebP 0.75, repli JPEG) ; PDF > 10 Mo refusé avec message « Compresse le PDF avant import, ex. ilovepdf ».

---

## 4. Code

| Couche | Fichiers |
|--------|----------|
| Types + helpers purs | `src/features/shared/types/fiches.ts` (`resolveFicheForWeek`, `collectProgDocIds`, `stripFiches`, `flattenFichesToWeek`, `groupFamilies`…) |
| Hooks | `src/features/shared/hooks/fiches/` : `useDocs.ts` (banque, libre-service, fiche, variantes, par ids, fiches d'un athlète, attributions d'une famille, URL signée), `useDocMutations.ts` (upload, update, archive, remplacement, suppression, attribution, vu), `useDocComments.ts`, `syncDocAssignments.ts`, `useFicheViewer.ts`, `useHasUnseenFiche.ts` |
| Utilitaires | `src/lib/compressImage.ts` (`compressFicheImage`, `fitDimensions`, `formatFileSize`) |
| Composants partagés | `src/features/shared/components/fiches/` : `FicheChip`, `FichePreview`, `FichePdfView` (react-pdf, lazy), `FicheViewer`, `FicheViewerHost`, `FicheCommentThread`, `FicheUploadDropzone`, `FichePickerDrawer`, `FicheAttachmentsEditor`, `FicheLinks` |
| Coach | `pages/FichesPage.tsx`, `pages/AthleteFichesPage.tsx`, `components/fiches/` (`FicheImportDialog`, `FicheDetailPanel`, `CoachFichePreviewDrawer`) |
| Athlète | `components/fiches/AthleteFichesView.tsx`, `TodayWorkoutFiches.tsx` |

Query keys : `QK.docs*` dans `src/lib/queryKeys.ts` (préfixe `['docs']`, invalidé après chaque mutation).

Tests unitaires : `src/features/shared/types/__tests__/fiches.test.ts`, `src/lib/__tests__/compressImage.test.ts`.

---

## 5. Écrans

### Coach
- **`/coach/fiches`** (sidebar « Fiches ») : liste par catégorie, recherche, filtres catégorie / libre-service / archivées, import multi-fichiers par glisser-déposer (titre pré-rempli). Détail : aperçu, versions (+ ajouter une variante), suivi (athlètes concernés, vu le…), métadonnées, libre-service, archiver / désarchiver, remplacer le fichier (« Remplacer partout » ou « Nouvelle variante » si la version est attribuée), suppression seulement si jamais attribuée.
- **Programmation** : « Fiches de la séance » (en tête de `SessionBlocEditor`) et chips sous chaque bloc (`BlocCard`), donc aussi dans les banques de séances / blocs et dans « Adapter pour ce jour » (`CoachSessionOverrideModal`, fiches aplaties sur la semaine).
- **Séance énergie** : section « Fiches » de `EnergySessionEditorPage`.
- **`/coach/athletes/:id/fiches`** (ContextBar) : attributions (source, vu / non vu, retirer le manuel), fiches personnelles (import), ajouts de l'athlète (badge nouveau depuis la dernière visite), commentaires récents, « Attribuer depuis la banque » avec note.
- `FichePickerDrawer` : onglets Banque · Fiches de l'athlète · Importer (banque ou fiche perso), puis variante + « Varier selon la semaine » (S1…Sn).

### Athlète
- **Programme → `Séances | Fiches`** (`?vue=fiches`, deep-link) : Mes fiches (par catégorie, badge Nouveau), Banque libre-service (chips catégorie, recherche), Mes ajouts (+ Ajouter, 📷 Photo, suppression).
- **Séance** (`WorkoutDetailPage`) : « Fiches de la séance » avant les blocs, liens 📄 sous les consignes de chaque bloc, variante résolue sur la semaine de la séance.
- **Aujourd'hui** : chips sur la carte de la séance du jour + pastille si une fiche n'a jamais été ouverte.
- **Séances énergie** : section Fiches dans l'aperçu (`SessionPreviewModal`, côté athlète) et dans `SpecificExecutionPage`.
- **Menu ☰** : « Mes fiches » → `/athlete/program?vue=fiches`.
- **Viewer** : plein écran par query param `?fiche=<docId>` sur la page courante (la page d'origine n'est pas démontée, retour = `navigate(-1)`), PDF via react-pdf (pages en défilement vertical, largeur écran, zoom pincé natif), bouton « Ouvrir / Télécharger », version, note du coach, fil de commentaires (texte + image compressée). L'ouverture marque la fiche comme vue (sauf aperçu coach).

---

## 6. Choix faits en autonomie

| Choix | Raison |
|-------|--------|
| `docs.uploaded_by` nullable | `NOT NULL` + `ON DELETE SET NULL` aurait bloqué la suppression d'un profil. |
| Override d'occurrence branché dans `CoachSessionOverrideModal` (Planning), pas `ProgSessionWeekDrawer` | C'est là que vit réellement `CoachSessionOverride` (`workout_logs.athlete_modifications`). |
| Fiches de séance éditées en tête de `SessionBlocEditor` plutôt que dans `SessionForm` | Un seul point d'intégration couvre programmation, banque de séances et override ; `SessionForm` ne gère que les métadonnées. |
| Libre-service porté par l'origine ; ses variantes deviennent lisibles | Le libellé « variante » se choisit dans le viewer ; pas de flag à dupliquer. |
| Viewer par query param `?fiche=` plutôt qu'une route `/athlete/fiches/:id` | Les routes sont animées par `pathname` : une route dédiée démonterait la séance en cours (saisies, scroll). |
| `sync_doc_assignments` refuse la fiche perso d'un autre athlète | Un bloc de banque créé depuis la programmation d'un athlète aurait sinon exposé sa fiche perso à un autre. |
| Policy Storage SELECT : l'auteur voit ses uploads | La RLS de DELETE exige la visibilité SELECT : sans ça, suppression impossible une fois la ligne `docs` retirée, et upload orphelin non nettoyable. Suppression : fichier d'abord, ligne ensuite. |
| Badge « nouveau » des ajouts athlète côté coach par `localStorage` (dernière visite de l'onglet) | Pas de colonne « vu par le coach » dans le schéma figé ; par appareil. |
| Suppression d'une fiche de banque seulement si aucune attribution | Sinon archivage (consigne). |
| `react-pdf` 10.5.0 (pdf.js 5), worker servi par Vite | Chunk lazy séparé (~137 Ko gzip + worker), aucun impact sur le chargement initial. |
| Types Supabase régénérés (`supabase gen types --linked`) | Les types étaient périmés ; erreurs `tsc` 226 → 128, aucune nouvelle. |
| `coach_athlete` sans coach = son propre coach (libre-service, dossier Storage) | Cas du coach qui se suit lui-même. |
| Styles inline + tokens `C` (pas Tailwind) | Le prompt demande de reproduire le style des pages voisines (Énergie, Programmation, pages athlète), toutes en styles inline. |

---

## 7. Limites connues

- Les tests navigateur de bout en bout (import, rattachement, ouverture côté athlète, duplication) n'ont pas pu être joués : aucun compte coach / athlète de test et la seule base est la prod. La sécurité et la sync sont couvertes par `supabase/tests/fiches_rls.sql`.
- pdf.js 5 nécessite un navigateur récent (iOS ≥ 17.4) ; en cas d'échec, l'aperçu bascule sur « Ouvrir / Télécharger ».
- Une fiche rattachée à une séance énergie d'un **autre** coach (banque partagée) n'est pas attribuée (la sync n'attribue que les fiches du coach appelant) : l'athlète ne la voit pas.
- Supprimer une fiche personnelle encore rattachée dans le JSON laisse un rattachement orphelin (chip « Fiche indisponible » côté coach, masqué côté athlète).
- Pas de nettoyage automatique des rattachements vers une fiche supprimée dans les banques de blocs / séances.
- Un rattachement dans une banque de blocs vers une fiche perso reste dans le JSON s'il est inséré chez un autre athlète (non attribué, invisible pour lui) ; seule la duplication de séance le retire avec toast.

---

## 8. V2 Questionnaires (esquisse, non créé)

Catégorie `questionnaire` et `kind = 'questionnaire'` déjà acceptés par les CHECK ; `file_path` peut être NULL pour ce kind.

```sql
-- Items d'un questionnaire (POMS, Hooper, RESTQ…)
CREATE TABLE public.questionnaire_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id      uuid NOT NULL REFERENCES public.docs(id) ON DELETE CASCADE,
  position    smallint NOT NULL,
  label       text NOT NULL,
  item_type   text NOT NULL CHECK (item_type IN ('likert','number','text','choice')),
  scale_min   smallint,
  scale_max   smallint,
  choices     jsonb,          -- options pour 'choice'
  subscale    text            -- ex. POMS : tension, dépression, vigueur…
);

-- Réponses d'un athlète (une ligne par passation)
CREATE TABLE public.questionnaire_responses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id       uuid NOT NULL REFERENCES public.docs(id) ON DELETE CASCADE,
  athlete_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  answers      jsonb NOT NULL,   -- { item_id: valeur }
  scores       jsonb,            -- sous-scores calculés
  submitted_at timestamptz NOT NULL DEFAULT now()
);
```

RLS envisagée : items lisibles via `can_read_doc(doc_id)` ; réponses SELECT / INSERT par l'athlète, SELECT par `is_coach_of(athlete_id)`. Hors V1 également : déclenchement automatique (J-7 compétition), envoi groupé, notifications push.
