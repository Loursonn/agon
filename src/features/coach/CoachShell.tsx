import { useLocation, useNavigate, Outlet, Navigate } from "react-router-dom";
import { useHasStaffLinks } from "@/features/staff/hooks/useMyStaffLinks";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { C, alpha } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { CommandPaletteProvider } from "./context/CommandPaletteContext";
import { CommandPalette } from "./components/CommandPalette";
import { useCommandPalette } from "./context/CommandPaletteContext";
import { Search } from "lucide-react";
import { useAppUpdates } from "@/features/shared/hooks/useAppUpdates";
import OfflineBanner from "@/features/shared/components/OfflineBanner";
import { useIsPhone } from "@/hooks/useIsPhone";
import CoachPhoneShell from "./phone/CoachPhoneShell";

// ── Agon brand icons (inline SVG, currentColor) ─────────────────────────────

const iconProps = { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const };

const AgonIcons = {
  stats:       <svg {...iconProps}><path d="M3 20H21M6 20V13M12 20V5M18 20V9"/></svg>,
  groupe:      <svg {...iconProps}><circle cx="9" cy="8" r="3"/><path d="M3 20V19A6 6 0 0 1 15 19V20"/><path d="M15 5.3A3 3 0 0 1 15 10.7M18 14A5 5 0 0 1 21 18.5V20"/></svg>,
  barre:       <svg {...iconProps}><path d="M3 12H21M6 7V17M9 9V15M15 9V15M18 7V17"/></svg>,
  nouveautes:  <svg {...iconProps}><path d="M6 17V11A6 6 0 0 1 18 11V17M4 17H20M12 3V5M10 20H14"/></svg>,
  fiche:       <svg {...iconProps}><path d="M6 3H14L19 8V21H6Z"/><path d="M14 3V8H19M9 12H16M9 15.5H16M9 19H13"/></svg>,
  test:        <svg {...iconProps}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>,
  coach:       <svg {...iconProps}><rect x="5" y="4" width="14" height="17"/><path d="M9 4V2.5H15V4M8.5 9H15.5M8.5 13H15.5M8.5 17H12"/></svg>,
  progression: <svg {...iconProps}><path d="M3 20H8V15H13V10H18V5H21"/></svg>,
  message:     <svg {...iconProps}><path d="M4 5H20V16H10L6 20V16H4Z"/></svg>,
  reglages:    <svg {...iconProps}><circle cx="12" cy="12" r="3"/><path d="M12 2V5M12 19V22M2 12H5M19 12H22M4.93 4.93L7.05 7.05M16.95 16.95L19.07 19.07M19.07 4.93L16.95 7.05M7.05 16.95L4.93 19.07"/></svg>,
};

// ── Navigation items ──────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { icon: AgonIcons.stats,       label: "Home",          path: "/coach",            exact: true,  certified: false, roadmap: false },
  { icon: AgonIcons.groupe,      label: "Athlètes",      path: "/coach/athletes",   exact: false, certified: false, roadmap: false },
  { icon: AgonIcons.message,     label: "Reviews",       path: "/coach/reviews",    exact: false, certified: false, roadmap: false },
  { icon: AgonIcons.barre,       label: "Banque",         path: "/coach/library",    exact: false, certified: false, roadmap: false },
  { icon: AgonIcons.test,        label: "Tests",          path: "/coach/tests",      exact: false, certified: false, roadmap: false },
  { icon: AgonIcons.fiche,       label: "Fiches",         path: "/coach/fiches",     exact: false, certified: false, roadmap: false },
  { icon: AgonIcons.coach,       label: "Coachs",         path: "/coach/coaches",    exact: false, certified: true,  roadmap: false },
  { icon: AgonIcons.progression, label: "Roadmap",        path: "/coach/roadmap",    exact: false, certified: false, roadmap: true  },
  { icon: AgonIcons.message,     label: "Avis athlètes",  path: "/coach/avis",       exact: false, certified: false, roadmap: true  },
  { icon: AgonIcons.nouveautes, label: "Nouveautés",     path: "/coach/nouveautes", exact: false, certified: false, roadmap: false },
  { icon: AgonIcons.reglages,   label: "Paramètres",     path: "/coach/settings",   exact: false, certified: false, roadmap: false },
];

// ── Sidebar styles (CSS vars overridden via inline style on provider) ─────────

const SIDEBAR_STYLE: React.CSSProperties = {
  "--sidebar-width": "240px",
  "--sidebar-width-icon": "64px",
  "--sidebar-background": C.bg,
  "--sidebar-foreground": C.tx3,
  "--sidebar-border": C.brd,
  "--sidebar-accent": alpha(C.ac, 0.12),
  "--sidebar-accent-foreground": C.ac,
  "--sidebar-ring": C.ac,
} as React.CSSProperties;

const TOP_PILL = "agon-mono min-h-9 cursor-pointer whitespace-nowrap rounded-[8px] border bg-transparent px-3.5 py-1.5 text-[11px] uppercase tracking-[0.12em] md:min-h-0";

// ── CoachShell ────────────────────────────────────────────────────────────────

// Sur mobile (< 768 px), la sidebar shadcn devient un tiroir (Sheet) ouvert par
// le bouton de la barre du haut ; sur PC elle reste fixe, repliable en icônes.
function CoachSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, logout } = useAuth();
  const unseenUpdates = useAppUpdates(user?.id).unseen.length;
  const { toggle } = useCommandPalette();
  const { isMobile, setOpenMobile } = useSidebar();

  // Tiroir mobile : on le referme dès qu'on change de page ou qu'on ouvre la recherche.
  function closeDrawer() {
    if (isMobile) setOpenMobile(false);
  }

  function isActive(path: string, exact: boolean) {
    if (exact) return location.pathname === path;
    // Banque muscu = library only (energy-library has its own nav item)
    if (path === "/coach/library") {
      return location.pathname.startsWith("/coach/library");
    }
    return location.pathname.startsWith(path);
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-agon-brd bg-agon-bg">
      {/* Le tiroir mobile est rendu dans un portail, hors des variables CSS du
          provider : le fond est donc posé ici, identique à celui du PC. */}
      <div className="flex h-full min-h-0 w-full flex-col bg-agon-bg">
        {/* Titre lu par les lecteurs d'écran (tiroir mobile = boîte de dialogue) */}
        {isMobile && (
          <>
            <SheetTitle className="sr-only">Navigation coach</SheetTitle>
            <SheetDescription className="sr-only">Pages de l'espace coach</SheetDescription>
          </>
        )}
        {/* Logo */}
        <SidebarHeader className="h-16 justify-center border-b border-agon-brd px-5 py-0">
          <div className="flex items-center gap-2.5">
            <img src="/brand/agon-symbole-or.svg" alt="Agon" className="size-[26px] flex-shrink-0" />
            <span className="agon-display text-[15px] font-normal uppercase tracking-[0.22em] text-agon-tx group-data-[collapsible=icon]:hidden">
              Agon
            </span>
          </div>
        </SidebarHeader>

        {/* Search button — opens command palette */}
        <div className="px-3.5 pb-1.5 pt-3.5 group-data-[collapsible=icon]:hidden">
          <button
            onClick={() => { closeDrawer(); toggle(); }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-[8px] border border-agon-brd bg-transparent px-2.5 py-2 text-[12px] text-agon-tx3 transition-[border-color] duration-150 ease-out hover:border-agon-accent/40"
          >
            <Search size={13} className="flex-shrink-0" />
            <span className="flex-1 text-left">Rechercher…</span>
            <span className="agon-mono text-[10px]">⌘K</span>
          </button>
        </div>

        {/* Nav items */}
        <SidebarContent className="flex-none overflow-visible px-0 py-2 group-data-[collapsible=icon]:overflow-visible">
          <SidebarMenu className="gap-0.5">
            {NAV_ITEMS.filter(item =>
            (!item.certified || profile?.is_certified_coach) &&
            (!item.roadmap   || profile?.is_certified_coach || profile?.is_admin)
          ).map((item) => {
              const active = isActive(item.path, item.exact);
              return (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={active}
                    onClick={() => { navigate(item.path); closeDrawer(); }}
                    className={cn(
                      "flex h-auto w-full cursor-pointer items-center gap-3 rounded-none px-5 py-2.5 text-[13px] font-normal transition-all duration-150 data-[active=true]:font-normal",
                      active
                        ? "bg-agon-accent/[0.12] text-agon-accent shadow-[inset_2px_0_0_var(--agon-accent)] hover:bg-agon-accent/[0.12] hover:text-agon-accent active:bg-agon-accent/[0.12] active:text-agon-accent data-[active=true]:bg-agon-accent/[0.12] data-[active=true]:text-agon-accent"
                        : "bg-transparent text-agon-tx2 shadow-none hover:bg-transparent hover:text-agon-tx active:bg-transparent active:text-agon-tx",
                      "leading-5",
                    )}
                  >
                    <span className="flex flex-shrink-0 items-center">{item.icon}</span>
                    <span className="flex-1 group-data-[collapsible=icon]:hidden">{item.label}</span>
                    {item.path === "/coach/nouveautes" && unseenUpdates > 0 && (
                      <span
                        aria-label={`${unseenUpdates} nouveauté(s) non vue(s)`}
                        className="agon-mono inline-flex items-center justify-center rounded-full bg-agon-accent px-[9px] py-1 text-[11px] font-medium leading-[1.3] text-agon-ink"
                      >
                        {unseenUpdates}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>

        {/* Motif colonnes sous la navigation (planche Coach) */}
        <div
          aria-hidden
          className="min-h-0 flex-1 bg-[url(/brand/agon-fond-colonnes.svg)] bg-cover bg-bottom bg-no-repeat opacity-[0.18] group-data-[collapsible=icon]:hidden"
        />

        {/* Footer — coach profile */}
        <SidebarFooter className="border-t border-agon-brd px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="agon-mono flex size-[30px] flex-shrink-0 items-center justify-center rounded-full border border-agon-accent text-[11px] text-agon-accent">
              {(profile?.full_name || "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-medium text-agon-tx">
                {profile?.full_name || "Coach"}
              </div>
              <button
                onClick={() => void logout()}
                className="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-agon-tx3 transition-colors duration-150 hover:text-agon-erreur"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </SidebarFooter>
      </div>
    </Sidebar>
  );
}

function CoachShellInner() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toggle } = useCommandPalette();
  // Double casquette : un coach qui est aussi pro chez un autre coach
  const { hasLinks: isStaffElsewhere } = useHasStaffLinks();

  return (
    <SidebarProvider defaultOpen={typeof window !== "undefined" ? window.innerWidth > 1024 : true} style={SIDEBAR_STYLE}>
      {/* ── Sidebar ── */}
      <CoachSidebar />

      {/* ── Main content ── */}
      {/* min-w-0 : une page trop large défile dans sa zone, sans élargir l'écran entier. */}
      <SidebarInset className="flex min-w-0 flex-col bg-agon-bg">
        {/* Topbar with trigger */}
        <div className="sticky top-0 z-10 flex h-[52px] flex-shrink-0 items-center gap-2.5 border-b border-agon-brd bg-agon-bg px-3 md:px-7">
          <SidebarTrigger
            aria-label="Menu"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[6px] border border-agon-brd-l bg-transparent text-[14px] leading-5 text-agon-tx3 hover:bg-transparent hover:text-agon-tx3 md:h-7 md:w-7"
          />
          {/* Mobile : le logo remplace celui de la sidebar, cachée dans le tiroir */}
          <img src="/brand/agon-symbole-or.svg" alt="Agon" className="size-6 flex-shrink-0 md:hidden" />
          {/* Cmd+K button in topbar — icône seule sur mobile */}
          <button
            onClick={toggle}
            aria-label="Rechercher"
            className="flex min-h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-agon-brd bg-transparent px-3 py-1.5 text-[12px] text-agon-tx3 transition-[border-color] duration-150 ease-out hover:border-agon-accent/40 md:min-h-0"
          >
            <Search size={12} />
            <span className="hidden md:inline">Rechercher</span>
            <kbd className="agon-mono ml-0.5 hidden text-[10px] md:inline">⌘K</kbd>
          </button>
          {/* Espace pro — coach qui est aussi staff d'athlètes d'autres coachs */}
          {isStaffElsewhere && (
            <button onClick={() => navigate("/staff")} className={cn(TOP_PILL, "ml-auto border-agon-brd-l text-agon-tx2")}>
              Staff
            </button>
          )}
          {/* Mode switch — visible pour coach et coach_athlete */}
          {(profile?.role === "coach_athlete" || profile?.role === "coach") && (
            <button
              onClick={() => navigate("/athlete")}
              className={cn(TOP_PILL, "border-agon-accent text-agon-accent", isStaffElsewhere ? "ml-0" : "ml-auto")}
            >
              Mode Athlète
            </button>
          )}
        </div>

        <OfflineBanner variant="coach" />

        {/* Page content */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </SidebarInset>

      {/* Command palette (coach-only) */}
      <CommandPalette />

    </SidebarProvider>
  );
}

export default function CoachShell() {
  const { profile } = useAuth();
  // Compte professionnel uniquement : pas d'espace coach.
  const isPhone = useIsPhone();
  if (profile?.role === "staff") return <Navigate to="/staff" replace />;
  // Téléphone : app coach à part (barre du bas, en-têtes des planches « Coach tél. »).
  if (isPhone) return <CoachPhoneShell />;
  return (
    <CommandPaletteProvider>
      <CoachShellInner />
    </CommandPaletteProvider>
  );
}
