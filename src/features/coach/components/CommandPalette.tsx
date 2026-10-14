import { useNavigate } from "react-router-dom";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Home,
  Users,
  BookOpen,
  FlaskConical,
  Settings,
  Dumbbell,
  ClipboardList,
  Download,
  Clock,
} from "lucide-react";
import { useCommandPalette } from "../context/CommandPaletteContext";

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV = [
  { label: "Home",       path: "/coach",          Icon: Home,         shortcut: "H" },
  { label: "Athlètes",   path: "/coach/athletes", Icon: Users,        shortcut: "A" },
  { label: "Banque",     path: "/coach/library",  Icon: BookOpen,     shortcut: "B" },
  { label: "Tests",      path: "/coach/tests",    Icon: FlaskConical, shortcut: "T" },
  { label: "Paramètres", path: "/coach/settings", Icon: Settings,     shortcut: "P" },
] as const;

// ── Quick actions ─────────────────────────────────────────────────────────────

const ACTIONS = [
  {
    label: "Nouvelle séance",
    Icon: Dumbbell,
    action: (navigate: ReturnType<typeof useNavigate>) => navigate("/coach/athletes"),
  },
  {
    label: "Nouveau test",
    Icon: ClipboardList,
    action: (navigate: ReturnType<typeof useNavigate>) => navigate("/coach/tests"),
  },
  {
    label: "Exporter données",
    Icon: Download,
    action: (_navigate: ReturnType<typeof useNavigate>) => {
      // Placeholder — hook into DataManager export in a real impl
      import("sonner").then(({ toast }) =>
        toast.info("Export disponible depuis Données athlète"),
      );
    },
  },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const { open, setOpen, recents, pushRecent } = useCommandPalette();
  const { athletes } = useAuth();
  const navigate = useNavigate();

  function go(path: string, label: string, icon?: string) {
    pushRecent({ label, path, icon });
    navigate(path);
    setOpen(false);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Rechercher un athlète, une page, une action…" />
      <CommandList>
        <CommandEmpty>Aucun résultat.</CommandEmpty>

        {/* ── Athlètes ── */}
        {athletes.length > 0 && (
          <>
            <CommandGroup heading="Athlètes">
              {athletes.map((a) => (
                <CommandItem
                  key={a.id}
                  value={a.full_name}
                  onSelect={() => go(`/coach/athletes/${a.id}/planning`, a.full_name, "athlete")}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: C.coachS,
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.coach,
                      flexShrink: 0,
                      marginRight: 8,
                    }}
                  >
                    {a.full_name.charAt(0).toUpperCase()}
                  </span>
                  {a.full_name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* ── Navigation ── */}
        <CommandGroup heading="Navigation">
          {NAV.map(({ label, path, Icon, shortcut }) => (
            <CommandItem key={path} value={label} onSelect={() => go(path, label)}>
              <Icon size={15} style={{ marginRight: 8, opacity: 0.7 }} />
              {label}
              <CommandShortcut>⌘{shortcut}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* ── Actions rapides ── */}
        <CommandGroup heading="Actions rapides">
          {ACTIONS.map(({ label, Icon, action }) => (
            <CommandItem
              key={label}
              value={label}
              onSelect={() => {
                action(navigate);
                setOpen(false);
              }}
            >
              <Icon size={15} style={{ marginRight: 8, opacity: 0.7 }} />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>

        {/* ── Récents ── */}
        {recents.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Récents">
              {recents.map((r) => (
                <CommandItem
                  key={r.path}
                  value={r.label + " recent"}
                  onSelect={() => go(r.path, r.label, r.icon)}
                >
                  <Clock size={14} style={{ marginRight: 8, opacity: 0.5 }} />
                  {r.icon && <span style={{ marginRight: 4 }}>{r.icon}</span>}
                  {r.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
