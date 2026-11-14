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
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
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
    <Sidebar
      collapsible="icon"
      style={{ background: C.bg, borderRight: `1px solid ${C.brd}` }}
    >
      {/* Le tiroir mobile est rendu dans un portail, hors des variables CSS du
          provider : le fond est donc posé ici, identique à celui du PC. */}
      <div className="flex h-full min-h-0 w-full flex-col" style={{ background: C.bg }}>
        {/* Titre lu par les lecteurs d'écran (tiroir mobile = boîte de dialogue) */}
        {isMobile && (
          <>
            <SheetTitle className="sr-only">Navigation coach</SheetTitle>
            <SheetDescription className="sr-only">Pages de l'espace coach</SheetDescription>
          </>
        )}
        {/* Logo */}
        <SidebarHeader style={{ height: 64, padding: "0 20px", justifyContent: "center", borderBottom: `1px solid ${C.brd}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src="/brand/agon-symbole-or.svg"
              alt="Agon"
              style={{ width: 26, height: 26, flexShrink: 0 }}
            />
            <span
              className="group-data-[collapsible=icon]:hidden"
              style={{ ...DISPLAY, fontSize: 15, fontWeight: 400, letterSpacing: "0.22em", textTransform: "uppercase", color: C.tx }}
            >
              Agon
            </span>
          </div>
        </SidebarHeader>

        {/* Search button — opens command palette */}
        <div className="group-data-[collapsible=icon]:hidden" style={{ padding: "14px 14px 6px" }}>
          <button
            onClick={() => { closeDrawer(); toggle(); }}
            className="coach-sidebar-search"
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              padding: "8px 10px", borderRadius: 8,
              border: `1px solid ${C.brd}`,
              background: "transparent",
              color: C.tx3, fontSize: 12, cursor: "pointer",
              fontFamily: "inherit", transition: "border-color 150ms ease-out",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = alpha(C.ac, 0.4))}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = C.brd)}
          >
            <Search size={13} style={{ flexShrink: 0 }} />
            <span className="coach-sidebar-label" style={{ flex: 1, textAlign: "left" }}>
              Rechercher…
            </span>
            <span className="coach-sidebar-label" style={{ ...MONO, fontSize: 10 }}>
              ⌘K
            </span>
          </button>
        </div>

        {/* Nav items */}
        <SidebarContent style={{ padding: "8px 0", flex: "none", overflow: "visible" }}>
          <SidebarMenu style={{ gap: 2 }}>
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
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      height: "auto",
                      padding: "10px 20px",
                      borderRadius: 0,
                      boxShadow: active ? `inset 2px 0 0 ${C.ac}` : "none",
                      background: active ? alpha(C.ac, 0.12) : "transparent",
                      color: active ? C.ac : C.tx2,
                      fontSize: 13,
                      fontWeight: 400,
                      cursor: "pointer",
                      width: "100%",
                      transition: "all 150ms",
                      fontFamily: "inherit",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) (e.currentTarget as HTMLElement).style.color = C.tx;
                    }}
                    onMouseLeave={(e) => {
                      if (!active) (e.currentTarget as HTMLElement).style.color = C.tx2;
                    }}
                  >
                    <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                      {item.icon}
                    </span>
                    <span className="group-data-[collapsible=icon]:hidden" style={{ flex: 1 }}>{item.label}</span>
                    {item.path === "/coach/nouveautes" && unseenUpdates > 0 && (
                      <span aria-label={`${unseenUpdates} nouveauté(s) non vue(s)`} style={{
                        ...MONO, fontSize: 11, fontWeight: 500, lineHeight: 1.3, borderRadius: 999, padding: "4px 9px",
                        background: C.ac, color: C.ink, display: "inline-flex", alignItems: "center", justifyContent: "center",
                      }}>{unseenUpdates}</span>
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
          className="group-data-[collapsible=icon]:hidden"
          style={{ flex: 1, minHeight: 0, background: "url(/brand/agon-fond-colonnes.svg) center bottom / cover no-repeat", opacity: 0.18 }}
        />

        {/* Footer — coach profile */}
        <SidebarFooter style={{ padding: "14px 20px", borderTop: `1px solid ${C.brd}` }}>

          <div
            className="group-data-[collapsible=icon]:hidden"
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <div
              style={{
                width: 30, height: 30, borderRadius: "50%",
                border: `1px solid ${C.ac}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                ...MONO, fontSize: 11, color: C.ac, flexShrink: 0,
              }}
            >
              {(profile?.full_name || "?").charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12, fontWeight: 500, color: C.tx,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {profile?.full_name || "Coach"}
              </div>
              <button
                onClick={() => void logout()}
                style={{
                  fontSize: 11, color: C.tx3, background: "none", border: "none",
                  cursor: "pointer", fontFamily: "inherit", padding: 0,
                  transition: "color 150ms",
                }}
                onMouseEnter={(e) => ((e.target as HTMLElement).style.color = C.r)}
                onMouseLeave={(e) => ((e.target as HTMLElement).style.color = C.tx3)}
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
      <SidebarInset className="min-w-0" style={{ background: C.bg, display: "flex", flexDirection: "column" }}>
        {/* Topbar with trigger */}
        <div
          className="px-3 md:px-7"
          style={{
            position: "sticky", top: 0, zIndex: 10,
            background: C.bg, borderBottom: `1px solid ${C.brd}`,
            display: "flex", alignItems: "center", gap: 10,
            flexShrink: 0, height: 52,
          }}
        >
          <SidebarTrigger
            aria-label="Menu"
            className="h-9 w-9 md:h-7 md:w-7"
                        style={{
              borderRadius: 6,
              border: "1px solid " + C.brdL, background: "transparent",
              color: C.tx3, cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center", fontSize: 14,
            }}
          />
          {/* Mobile : le logo remplace celui de la sidebar, cachée dans le tiroir */}
          <img
            src="/brand/agon-symbole-or.svg"
            alt="Agon"
            className="md:hidden"
            style={{ width: 24, height: 24, flexShrink: 0 }}
          />
          {/* Cmd+K button in topbar — icône seule sur mobile */}
          <button
            onClick={toggle}
            aria-label="Rechercher"
            className="min-h-9 md:min-h-0"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 8,
              border: `1px solid ${C.brd}`,
              background: "transparent",
              color: C.tx3, fontSize: 12, cursor: "pointer",
              fontFamily: "inherit", transition: "border-color 150ms ease-out",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = alpha(C.ac, 0.4))}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = C.brd)}
          >
            <Search size={12} />
            <span className="hidden md:inline">Rechercher</span>
            <kbd className="hidden md:inline" style={{ ...MONO, fontSize: 10, marginLeft: 2 }}>⌘K</kbd>
          </button>
          {/* Espace pro — coach qui est aussi staff d'athlètes d'autres coachs */}
          {isStaffElsewhere && (
            <button
              onClick={() => navigate("/staff")}
              className="min-h-9 md:min-h-0"
              style={{
                marginLeft: "auto", padding: "6px 14px", borderRadius: 8,
                border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx2,
                ...MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Staff
            </button>
          )}
          {/* Mode switch — visible pour coach et coach_athlete */}
          {(profile?.role === "coach_athlete" || profile?.role === "coach") && (
            <button
              onClick={() => navigate("/athlete")}
              className="min-h-9 md:min-h-0"
              style={{
                marginLeft: isStaffElsewhere ? 0 : "auto", padding: "6px 14px", borderRadius: 8,
                border: `1px solid ${C.ac}`, background: "transparent", color: C.ac,
                ...MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Mode Athlète
            </button>
          )}
        </div>

        <OfflineBanner variant="coach" />

        {/* Page content */}
        <div className="min-w-0" style={{ flex: 1, overflowY: "auto" }}>
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
