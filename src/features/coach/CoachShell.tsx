import { useLocation, useNavigate, Outlet } from "react-router-dom";
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
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { C } from "@/lib/theme";
import { CommandPaletteProvider } from "./context/CommandPaletteContext";
import { CommandPalette } from "./components/CommandPalette";
import { useCommandPalette } from "./context/CommandPaletteContext";
import { Search } from "lucide-react";

// ── Agon brand icons (inline SVG, currentColor) ─────────────────────────────

const iconProps = { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const };

const AgonIcons = {
  stats:       <svg {...iconProps}><path d="M3 20H21M6 20V13M12 20V5M18 20V9"/></svg>,
  groupe:      <svg {...iconProps}><circle cx="9" cy="8" r="3"/><path d="M3 20V19A6 6 0 0 1 15 19V20"/><path d="M15 5.3A3 3 0 0 1 15 10.7M18 14A5 5 0 0 1 21 18.5V20"/></svg>,
  barre:       <svg {...iconProps}><path d="M3 12H21M6 7V17M9 9V15M15 9V15M18 7V17"/></svg>,
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
  { icon: AgonIcons.barre,       label: "Banque",         path: "/coach/library",    exact: false, certified: false, roadmap: false },
  { icon: AgonIcons.test,        label: "Tests",          path: "/coach/tests",      exact: false, certified: false, roadmap: false },
  { icon: AgonIcons.coach,       label: "Coachs",         path: "/coach/coaches",    exact: false, certified: true,  roadmap: false },
  { icon: AgonIcons.progression, label: "Roadmap",        path: "/coach/roadmap",    exact: false, certified: false, roadmap: true  },
  { icon: AgonIcons.message,     label: "Avis athlètes",  path: "/coach/avis",       exact: false, certified: false, roadmap: true  },
  { icon: AgonIcons.reglages,   label: "Paramètres",     path: "/coach/settings",   exact: false, certified: false, roadmap: false },
];

// ── Sidebar styles (CSS vars overridden via inline style on provider) ─────────

const SIDEBAR_STYLE: React.CSSProperties = {
  "--sidebar-width": "240px",
  "--sidebar-width-icon": "64px",
  "--sidebar-background": "#0E0C0A",
  "--sidebar-foreground": "#7D7468",
  "--sidebar-border": "rgba(231,211,168,0.2)",
  "--sidebar-accent": "rgba(255,201,51,0.10)",
  "--sidebar-accent-foreground": "#FFC933",
  "--sidebar-ring": "#FFC933",
} as React.CSSProperties;

// ── CoachShell ────────────────────────────────────────────────────────────────

function CoachShellInner() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const { toggle } = useCommandPalette();

  function isActive(path: string, exact: boolean) {
    if (exact) return location.pathname === path;
    // Banque muscu = library only (energy-library has its own nav item)
    if (path === "/coach/library") {
      return location.pathname.startsWith("/coach/library");
    }
    return location.pathname.startsWith(path);
  }

  return (
    <SidebarProvider defaultOpen={typeof window !== "undefined" ? window.innerWidth > 1024 : true} style={SIDEBAR_STYLE}>
      {/* ── Sidebar ── */}
      <Sidebar
        collapsible="icon"
        style={{ background: "#0E0C0A", borderRight: "1px solid rgba(231,211,168,0.2)" }}
      >
        {/* Logo */}
        <SidebarHeader style={{ padding: "16px 14px 12px", borderBottom: "1px solid rgba(231,211,168,0.2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src="/brand/agon-symbole-favicon-marbre.svg"
              alt="Agon"
              style={{ width: 32, height: 32, flexShrink: 0 }}
            />
            <span
              className="group-data-[collapsible=icon]:hidden"
              style={{ fontSize: 13, fontWeight: 700, color: C.tx, letterSpacing: "-0.3px" }}
            >
              Agon
            </span>
          </div>
        </SidebarHeader>

        {/* Search button — opens command palette */}
        <div className="group-data-[collapsible=icon]:hidden" style={{ padding: "8px 10px 4px" }}>
          <button
            onClick={toggle}
            className="coach-sidebar-search"
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              padding: "7px 10px", borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              color: C.tx3, fontSize: 12, cursor: "pointer",
              fontFamily: "inherit", transition: "border-color 150ms ease-out",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = C.ac + "60")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)")}
          >
            <Search size={13} style={{ flexShrink: 0 }} />
            <span className="coach-sidebar-label" style={{ flex: 1, textAlign: "left" }}>
              Rechercher…
            </span>
            <span className="coach-sidebar-label" style={{ fontSize: 10, opacity: 0.5, letterSpacing: "0.02em" }}>
              ⌘K
            </span>
          </button>
        </div>

        {/* Nav items */}
        <SidebarContent style={{ padding: "8px 0" }}>
          <SidebarMenu>
            {NAV_ITEMS.filter(item =>
            (!item.certified || profile?.is_certified_coach) &&
            (!item.roadmap   || profile?.is_certified_coach || profile?.is_admin)
          ).map((item) => {
              const active = isActive(item.path, item.exact);
              return (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={active}
                    onClick={() => navigate(item.path)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "9px 14px",
                      borderRadius: 0,
                      borderLeft: "2px solid " + (active ? C.ac : "transparent"),
                      background: active ? "rgba(255,201,51,0.10)" : "transparent",
                      color: active ? C.ac : C.tx2,
                      fontSize: 13,
                      fontWeight: active ? 600 : 400,
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
                    <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>

        {/* Footer — coach profile */}
        <SidebarFooter style={{ padding: "12px 14px", borderTop: "1px solid rgba(231,211,168,0.2)" }}>
          <SidebarSeparator style={{ marginBottom: 10, background: C.brd }} />

          <div
            className="group-data-[collapsible=icon]:hidden"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <div
              style={{
                width: 28, height: 28, borderRadius: "50%",
                background: C.coach + "25", border: "1px solid " + C.coach + "40",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: C.coach, flexShrink: 0,
              }}
            >
              {(profile?.full_name || "?").charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12, fontWeight: 600, color: C.tx,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {profile?.full_name || "Coach"}
              </div>
              <button
                onClick={logout}
                style={{
                  fontSize: 10, color: C.tx3, background: "none", border: "none",
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
      </Sidebar>

      {/* ── Main content ── */}
      <SidebarInset style={{ background: C.bg, display: "flex", flexDirection: "column" }}>
        {/* Topbar with trigger */}
        <div
          style={{
            position: "sticky", top: 0, zIndex: 10,
            background: C.s1, borderBottom: "1px solid " + C.brd,
            padding: "8px 16px", display: "flex", alignItems: "center", gap: 8,
            flexShrink: 0, minHeight: 45,
          }}
        >
          <SidebarTrigger
            style={{
              width: 28, height: 28, borderRadius: 6,
              border: "1px solid " + C.brdL, background: "transparent",
              color: C.tx3, cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center", fontSize: 14,
            }}
          />
          {/* Cmd+K button in topbar */}
          <button
            onClick={toggle}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 12px", borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              color: C.tx3, fontSize: 12, cursor: "pointer",
              fontFamily: "inherit", transition: "border-color 150ms ease-out",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = C.ac + "60")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)")}
          >
            <Search size={12} />
            <span>Rechercher</span>
            <kbd style={{ fontSize: 10, opacity: 0.5, marginLeft: 2, fontFamily: "inherit" }}>⌘K</kbd>
          </button>
          {/* Mode switch — visible pour coach et coach_athlete */}
          {(profile?.role === "coach_athlete" || profile?.role === "coach") && (
            <button
              onClick={() => navigate("/athlete")}
              style={{
                marginLeft: "auto", padding: "5px 12px", borderRadius: 6,
                border: "1px solid " + C.coach + "40",
                background: C.coach + "15", color: C.coach,
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit", whiteSpace: "nowrap",
              }}
            >
              Mode Athlète
            </button>
          )}
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          <Outlet />
        </div>
      </SidebarInset>

      {/* Command palette (coach-only) */}
      <CommandPalette />

    </SidebarProvider>
  );
}

export default function CoachShell() {
  return (
    <CommandPaletteProvider>
      <CoachShellInner />
    </CommandPaletteProvider>
  );
}
