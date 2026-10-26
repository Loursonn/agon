# CONTRIBUTING — Conventions Agon

## Stack

React 18 + TypeScript + Vite · shadcn/ui + Tailwind · TanStack React Query v5 · Supabase · sonner · framer-motion

---

## Skeletons

Utilise les composants de `src/features/shared/components/skeletons/` à la place de tout spinner ou texte "Loading…".

| Composant | Usage |
|-----------|-------|
| `PageSkeleton` | Page entière en cours de chargement |
| `CardSkeleton` | Carte KPI ou métrique |
| `TableSkeleton` | Tableau de données (`rows?`, `cols?`) |
| `ChartSkeleton` | Zone graphique (`height?`) |
| `ListSkeleton` | Liste verticale d'éléments (`rows?`) |

```tsx
// ✅ Bien
import { ListSkeleton } from "@/features/shared/components/skeletons";
if (isLoading) return <ListSkeleton rows={4} />;

// ❌ Pas bien
if (isLoading) return <div>Loading...</div>;
if (isLoading) return <Spinner />;
```

---

## Toasts (sonner)

Toujours utiliser `sonner` pour les retours utilisateur. Jamais `alert()` ou `console.log` exposé à l'utilisateur.

```ts
import { toast } from "sonner";

toast.success("Séance terminée !");
toast.error("Erreur lors de l'enregistrement");
toast.loading("Chargement…");
toast.info("Information");
```

**Messages** : toujours en français, concis, action passée (ex. "Wellness enregistré" pas "Enregistrement en cours").

**Position** :
- Coach (desktop) : `bottom-right` (configuré dans `App.tsx`)
- Athlète (mobile) : `top-center` via prop sur `<Toaster />` si différent du défaut

---

## Mutations optimistes

Toute `useMutation` qui modifie une liste/objet visible doit répondre en < 50ms, indépendamment de la latence réseau.

Pattern standard :

```ts
const mutation = useMutation({
  mutationFn: async (input) => {
    // Appel Supabase (peut prendre 200ms–2s)
    const { data } = await supabase.from("table").upsert(input).select().single();
    return data;
  },

  onMutate: async (input) => {
    // 1. Annuler les refetch en cours
    await qc.cancelQueries({ queryKey: QK.myKey(id) });
    // 2. Snapshot pour rollback
    const previous = qc.getQueryData(QK.myKey(id));
    // 3. Mise à jour UI immédiate (optimiste)
    qc.setQueryData(QK.myKey(id), (old) => applyUpdate(old, input));
    return { previous };
  },

  onError: (_err, _input, ctx) => {
    // Rollback si l'API échoue
    if (ctx?.previous !== undefined) {
      qc.setQueryData(QK.myKey(id), ctx.previous);
    }
    toast.error("Erreur, modification annulée");
  },

  onSuccess: (data) => {
    // Synchroniser avec la valeur réelle du serveur
    qc.setQueryData(QK.myKey(id), data);
  },
});
```

---

## Empty states

Utilise `EmptyState` (`src/features/shared/components/EmptyState.tsx`) quand une liste est vide.

```tsx
import { EmptyState } from "@/features/shared/components/EmptyState";
import { Users } from "lucide-react";

<EmptyState
  icon={Users}
  title="Aucun athlète"
  description="Partage ton code coach pour que tes athlètes te rejoignent."
  cta={{ label: "Gérer les athlètes", onClick: () => navigate("/coach/athletes") }}
/>
```

Props : `icon` (LucideIcon, requis), `title` (requis), `description?`, `cta?` (`{ label, onClick }`).

---

## StatusPill

Utilise `StatusPill` (`src/features/shared/components/StatusPill.tsx`) pour afficher le statut d'une séance.

```tsx
import { StatusPill } from "@/features/shared/components/StatusPill";

<StatusPill status="completed" />
<StatusPill status="missed" size="sm" />
<StatusPill status="in-progress" label="En cours..." />
```

Variants disponibles : `planned` · `in-progress` · `completed` · `missed` · `skipped`

---

## Transitions

- Hover/active : toujours `transition: "all 150ms ease-out"` ou classe Tailwind `transition-all duration-150 ease-out`
- Transitions de routes : `AnimatePresence` + `motion.div` dans `App.tsx` (fade 100ms)
- Ne pas ajouter de transition sur des éléments déjà animés par le système (Drawer, Dialog, etc.)

---

## Command palette (coach uniquement)

- Hook : `useCommandPalette()` depuis `@/features/coach/context/CommandPaletteContext`
- Ouvre/ferme : `toggle()` ou `setOpen(true)`
- Récents : `pushRecent({ label, path, icon? })` à appeler à chaque navigation importante

```tsx
const { toggle } = useCommandPalette();
<button onClick={toggle}>Rechercher ⌘K</button>
```

La palette est montée uniquement dans `CoachShell` — ne pas l'importer dans les pages athlète.

---

## Conventions générales

- **Fichiers** : un composant = un fichier, PascalCase, `.tsx`
- **Hooks** : préfixe `use`, dans `src/features/shared/hooks/` ou `src/hooks/`
- **Imports** : alias `@/` pour `src/`
- **Styles** : Tailwind + inline style pour les valeurs dynamiques (tokens de `@/lib/theme`)
- **Requêtes BDD** : uniquement dans les hooks React Query, jamais directement dans les composants
- **TypeScript strict** : pas de `any` sauf cas exceptionnel documenté
