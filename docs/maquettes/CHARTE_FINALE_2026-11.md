# Charte finale « peps » : valeurs à reporter dans `src/styles/tokens.css`

Roadmap P10 (prérequis du code). Écrit le 2026-11-13.

Sources :
- canvas Claude Design « Agon · maquettes app » (note n3 « Direction peps », planche « À valider · boutons sans dégradé + pictos HYROX » du 12 nov., planches passées en peps le 13 nov.) ;
- design system Agon v4 (https://claude.ai/artifact/X2AVcNsL8NuQNsmu5Ln5u8), section « Direction peps » du README et `tokens.json`, mis à jour le 13 nov. avec ces règles.

Valeurs « actuelles » lues dans `src/styles/tokens.css` au commit `69bc71d` (`origin/dev`, fichier identique à `c8f89fc`).

**Ce document ne modifie pas `tokens.css`** : la session qui code reporte les lignes ci-dessous, puis met à jour `src/styles/__tests__/tokens.test.ts` si une valeur testée change.

## 1. Ce qui est déjà conforme (rien à faire)

La direction peps est déjà dans le fichier depuis le 12 nov. Vérifié ligne à ligne :

| Token | Valeur actuelle | Charte |
|---|---|---|
| `--agon-type-muscu` | `var(--agon-or-vif)` = #FFC933 | #FFC933 |
| `--agon-type-energie` | `var(--agon-ardoise-vif)` = #33B5FF | #33B5FF |
| `--agon-type-hyrox` | `var(--agon-ocre-vif)` = #FF9500 | #FF9500 |
| `--agon-type-test` | `var(--agon-amethyste-vif)` = #F060C0 | #F060C0 |
| `--agon-type-competition` | `var(--agon-rouge)` = #FF3B1F | #FF3B1F |
| `--agon-type-fait` | `var(--agon-vert-vif)` = #66F03C | #66F03C |
| `--agon-bloc-perf` | `var(--agon-or-vif)` | #FFC933 |
| `--agon-bloc-esth` | `var(--agon-amethyste-vif)` | #F060C0 |
| `--agon-bloc-besoin` | `var(--agon-ardoise-vif)` | #33B5FF |
| `--agon-bloc-assoc` | `#2EE6C5` | #2EE6C5 |
| `--agon-bloc-core` | `#FF7A45` | #FF7A45 |
| `--agon-macro-g` / `-l` / `-p` | ardoise / or / terracotta | #33B5FF / #FFC933 / #FF5A33 |
| `--agon-zone-1` / `-2` / `-3` | vert / ocre / rouge | #66F03C / #FF9500 / #FF3B1F |
| `--agon-cadence` | `#2EE6C5` | #2EE6C5 |
| `--agon-hyrox-station` / `-course` | #FF9500 / #FFB54D | idem |
| `--agon-accent` | `var(--agon-or-vif)` | #FFC933 (aplat, jamais de dégradé) |
| `--agon-or-poli` | dégradé | réservé au logo (déjà commenté ainsi) |

## 2. Valeurs à changer

| Token | Valeur actuelle | Nouvelle valeur | Pourquoi |
|---|---|---|---|
| `--agon-tx3` | `#7D7468` | `#8E8780` | **Décidé par Hugo le 14/11.** Toutes les maquettes peps utilisent #8E8780 pour les labels et unités. #7D7468 fait 4,25:1 sur le fond et 3,76:1 sur une carte (sous 4,5) ; #8E8780 fait 5,51:1 et 4,88:1. Casse `tokens.test.ts` (NEUTRAL attendu #7D7468) : mettre à jour le test. |
| `--agon-ui-bg` | `hsl(20 17% 3%)` | `var(--agon-bg)` | Composants shadcn alignés sur la charte (le commentaire du fichier l'annonce pour la charte finale). |
| `--agon-ui-s1` | `hsl(24 14% 10%)` | `var(--agon-s1)` | idem |
| `--agon-ui-s2` | `hsl(24 12% 13%)` | `var(--agon-s2)` | idem |
| `--agon-ui-tx` | `hsl(0 0% 100%)` | `var(--agon-tx)` | idem |
| `--agon-ui-tx3` | `hsl(27 8% 45%)` | `var(--agon-tx3)` | idem |
| `--agon-ui-accent` | `hsl(43 100% 60%)` (= #FFC533) | `var(--agon-accent)` (#FFC933) | idem |
| `--agon-ui-accent-doux` | `hsl(43 100% 60% / 0.1)` | `var(--agon-accent-doux)` | idem |
| `--agon-ui-ink` | `hsl(24 28% 7%)` | `var(--agon-ink)` | idem |
| `--agon-ui-sable` | `hsl(38 50% 78%)` | `var(--agon-sable)` | idem |
| `--agon-ui-erreur` | `hsl(13 100% 60%)` | `var(--agon-erreur)` | idem |
| `--agon-ui-brd` | `hsl(38 43% 78% / 0.12)` | `var(--agon-brd)` | idem |
| `--agon-ui-brd-sidebar` | `hsl(38 43% 78% / 0.10)` | `var(--agon-brd)` | idem |

Vérifié : `src/index.css` relaie ces variables (`--primary: var(--agon-ui-accent)`…) et `tailwind.config.ts` les lit avec `cssColor()`, qui accepte aussi les valeurs hex. Le remplacement par `var(--agon-…)` est donc direct. L'écart visible est faible (or #FFC533 → #FFC933, fonds à 1-2 % près).

## 3. Tokens à ajouter

### Couleurs de base

| Token | Valeur | Usage |
|---|---|---|
| `--agon-turquoise-vif` | `#2EE6C5` | bloc Muscles assoc., cadence, zone 2 / 7. Puis `--agon-bloc-assoc: var(--agon-turquoise-vif)` et `--agon-cadence: var(--agon-turquoise-vif)`. |
| `--agon-corail-vif` | `#FF7A45` | bloc Core. Puis `--agon-bloc-core: var(--agon-corail-vif)`. |

### Zones à 5 et 7 zones

Aujourd'hui composées dans `src/lib/seance.ts` (`ZONE_COLORS_5`, `ZONE_COLORS_7`) à partir d'autres tokens. Les nommer dans `tokens.css`, puis faire lire ces noms par `seance.ts` :

| Token | Valeur |
|---|---|
| `--agon-zone5-1` | `var(--agon-ardoise-vif)` #33B5FF |
| `--agon-zone5-2` | `var(--agon-vert-vif)` #66F03C |
| `--agon-zone5-3` | `var(--agon-or-vif)` #FFC933 |
| `--agon-zone5-4` | `var(--agon-ocre-vif)` #FF9500 |
| `--agon-zone5-5` | `var(--agon-rouge)` #FF3B1F |
| `--agon-zone7-1` | `var(--agon-ardoise-vif)` #33B5FF |
| `--agon-zone7-2` | `var(--agon-turquoise-vif)` #2EE6C5 |
| `--agon-zone7-3` | `var(--agon-vert-vif)` #66F03C |
| `--agon-zone7-4` | `var(--agon-or-vif)` #FFC933 |
| `--agon-zone7-5` | `var(--agon-ocre-vif)` #FF9500 |
| `--agon-zone7-6` | `var(--agon-rouge)` #FF3B1F |
| `--agon-zone7-7` | `var(--agon-amethyste-vif)` #F060C0 |

**Décidé par Hugo le 14/11** : suite vert → rouge. La note « Pages manquantes » du canvas (12 nov., point 4) proposait pour 5 zones une suite vert → rouge `#66F03C · #B5EB2E · #FF9500 · #FF6A1F · #FF3B1F`. Le code et le brief de la séance d'énergie (13 nov.) gardaient la suite froid → chaud. Les valeurs du tableau ci-dessus (froid → chaud) sont remplacées pour 5 zones par `#66F03C · #B5EB2E · #FF9500 · #FF6A1F · #FF3B1F` ; 7 zones inchangées.

### Peps : cartes, états, boutons

| Token | Valeur | Usage |
|---|---|---|
| `--agon-peps-fond` | `0.12` | Alpha du fond d'une carte de type (en JS : suffixe hex `1F`). |
| `--agon-peps-contour` | `0.45` | Alpha du contour d'une carte de type (suffixe `73`). |
| `--agon-peps-barre` | `3px` | Barre gauche pleine d'une carte de type. |
| `--agon-btn-h-tel` | `52px` | Bouton principal en bas d'écran téléphone. |
| `--agon-btn-h-tel-2` | `48px` | Autres boutons téléphone. |
| `--agon-btn-h-ordi` | `40px` | Boutons ordinateur (44 px pour le principal d'une page). |
| `--agon-btn-radius` | `12px` | Rayon des boutons (planche du 12 nov.). |

Règles (pas des valeurs) : bouton principal = aplat `--agon-accent`, texte `--agon-ink`, Geist 600, casse normale, un seul par écran ; secondaire = contour `--agon-brd-l`, texte `--agon-tx` ; danger = contour `--agon-rouge`, jamais plein ; valider une série = aplat `--agon-succes`. Aucun `box-shadow` flou, aucun dégradé, aucun halo.

### Tailles de texte

| Token | Valeur | Usage |
|---|---|---|
| `--agon-text-chrono` | `78px` | Chrono / compte à rebours d'un minuteur plein écran (Geist Mono). |
| `--agon-text-cible` | `54px` | Cible principale pendant un bloc d'énergie (Geist Mono, couleur de la zone). |
| `--agon-text-bouton` | `15px` | Bouton principal téléphone (Geist 600). Ordinateur : `--agon-text-base` 14 px. |

Inchangés : `--agon-text-xs` 11 px (minimum, pastilles et labels), `-sm` 12, `-base` 14, `-lg` 16, `-xl` 18, `-2xl` 22 (chiffre clé), `-3xl` 28.

## 4. Non reporté (volontairement)

- Rayons `--agon-radius-*` (2 / 4 / 6 px, échelle Tailwind) : la charte dit 10 px par défaut, 14 px carte, 16 px carte séance. Changer ces trois valeurs modifie tous les composants shadcn d'un coup ; à faire dans un lot séparé avec vérification à l'écran.
- Espacements `--agon-space-*` : l'échelle actuelle (2 / 4 / 8 / 12 / 16 / 24 / 32) couvre les maquettes.
- `--agon-type-libre` (`var(--agon-patine-vif)` #1FF0B0) : présent dans le code, absent de la note n3 du canvas. Gardé ; à confirmer.
