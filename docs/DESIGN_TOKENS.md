# Design tokens

Toutes les valeurs de design (couleurs, polices, tailles de texte, rayons, espacements) sont dans **un seul fichier : `src/styles/tokens.css`**. Les autres fichiers ne font que s'y brancher.

```
src/styles/tokens.css      valeurs (variables CSS --agon-*)
   ├─ src/index.css        variables shadcn (--primary, --border…) = var(--agon-…)
   ├─ tailwind.config.ts   classes bg-agon-s1, text-agon-xs, p-agon-md, rounded-lg, font-data…
   └─ src/lib/theme.ts     objet C (hex), BT, BLOC_COLORS, HABIT_COLORS : lus dans tokens.css
src/styles/parseTokens.ts  lecture du fichier (partagée par theme.ts, Tailwind, tests)
src/ui/                    composants de base stylés uniquement avec ces tokens
```

Les noms suivent la charte (`agon-brand-kit/tokens/agon-tokens.css`) : `--agon-bg`, `--agon-s1`, `--agon-tx2`, `--agon-accent`, `--agon-succes`, `--agon-erreur-profond`, `--agon-cat-3`, `--agon-font-data`, `--agon-radius`…

## Pourquoi `C` garde des valeurs hex

Environ 500 endroits écrivent `C.r + "30"` ou `` `${C.ac}40` `` pour ajouter une opacité, et d'autres passent `C.x` à Recharts, au canvas ou à `hexToRgba`. Avec `C.r = "var(--agon-erreur)"`, tout ça casserait. `theme.ts` lit donc `tokens.css` en texte brut (`?raw`) au chargement et met dans `C` la valeur finale (`"#FF5A33"`). Une seule source, et le code existant ne change pas.

Conséquence : les couleurs de `C` (hors `brd`, `brdL` et les fonds `*S`) doivent rester en `#RRGGBB` dans `tokens.css`. Un test le vérifie.

## Brancher la charte finale

1. Dans `src/styles/tokens.css`, remplacer les valeurs (garder les noms). Les noms de la charte qui n'existent pas encore s'ajoutent librement : tout `--agon-<nom>` de couleur devient la classe `bg-agon-<nom>` / `text-agon-<nom>`.
2. Section « Composants shadcn » : remplacer chaque `--agon-ui-*` par la variable indiquée en commentaire (ex. `--agon-ui-accent: var(--agon-accent);`). Aujourd'hui elles gardent les anciennes valeurs shadcn, très légèrement différentes de `C` (or `#FFC533` au lieu de `#FFC933`, fond `#090706` au lieu de `#0E0C0A`), pour ne rien changer au rendu.
3. Rayons : la charte prévoit 6 / 10 / 16 px. Mettre ces valeurs dans `--agon-radius-sm`, `--agon-radius`, `--agon-radius-lg` (ce sont `rounded-sm`, `rounded-md` et `rounded-lg` de Tailwind).
4. `npm test` : le bloc « rendu historique » de `src/styles/__tests__/tokens.test.ts` échoue, c'est voulu. Le mettre à jour (ou le supprimer). Les garde-fous restent.
5. Hors CSS, à reporter à la main : `theme-color` dans `index.html`, `background_color` / `theme_color` du manifeste dans `vite.config.ts`, l'écran d'erreur de `src/main.tsx`, et `HABIT_COLORS` dupliqué dans `supabase/functions/_shared/coachApiCare.ts` (les Edge Functions ne lisent pas le CSS). Attention : les couleurs d'habitude déjà enregistrées en base gardent leur ancien hex.

## Règles d'usage

- **Pas de hex, rgb() ou hsl() en dur dans un nouveau fichier.** Une couleur qui manque s'ajoute dans `tokens.css`.
- Nouveau code : classes Tailwind `*-agon-*` et composants `src/ui/`, pas de `style={{}}` (les media queries ne marchent pas en inline).
- Si un style inline est inévitable : `C.x` pour la couleur, `alpha(C.x, 0.2)` pour l'opacité (même résultat que `C.x + "33"`, et ça marche aussi sur une couleur non hex).
- Opacité en Tailwind : `bg-agon-accent/20` marche (via `color-mix`, iOS 16.2 et plus). Pour un fond teinté courant, préférer le token prévu : `bg-agon-accent-doux`, `bg-agon-erreur-doux`…
- Texte : échelle `text-agon-xs` (11 px, le minimum) à `text-agon-3xl`. Les champs de saisie font 16 px sur mobile (`text-agon-lg md:text-agon-base`), sinon iOS zoome.
- Espacements : `p-agon-md`, `gap-agon-sm`… (2, 4, 8, 12, 16, 24, 32 px). Les classes Tailwind numériques (`p-4`) restent permises.
- Polices : `font-display` (Archivo), `font-ui` (Geist), `font-data` (Geist Mono, pour les chiffres).
- `cn()` (`src/lib/utils.ts`) connaît les échelles `text-agon-*` et `*-agon-*` d'espacement. Sans ça, `cn("text-agon-xs", "text-agon-tx")` perdrait la taille.

## Composants `src/ui/`

| Composant | Base shadcn | Rôle |
|---|---|---|
| `Button` | `components/ui/button` | variantes `primary`, `secondary`, `ghost`, `danger` ; tailles `sm`, `md`, `lg`, `icon` ; `block` ; `asChild` |
| `Input` | `components/ui/input` | champ, `invalid` |
| `Select` | `components/ui/select` | liste à partir de `options` |
| `Dialog` | Radix Dialog + `components/ui/dialog` | feuille en bas sur mobile, centré à partir de `md` (768 px) |
| `Module` | `components/ui/card` | carte, `title` + `action` |
| `Stat` | — | valeur + libellé ; mesure absente → « — » (0 reste 0) |
| `Tag` | — | étiquette, `tone` neutre / accent / succès / alerte / erreur / info |
| `EmptyState` | — | état vide : titre, description, action |
| `Skeleton` | `components/ui/skeleton` | bloc de chargement |

Tests : `src/ui/__tests__/components.test.tsx`.
