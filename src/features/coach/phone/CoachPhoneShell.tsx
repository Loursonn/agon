import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { useAppUpdates } from "@/features/shared/hooks/useAppUpdates";
import OfflineBanner from "@/features/shared/components/OfflineBanner";
import { TAB_BAR_H } from "./phoneUi";

const ic = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "square" as const };

const TABS = [
  { key: "home", label: "Accueil", path: "/coach", icon: <svg {...ic}><path d="M4 11L12 4L20 11V20H14V14H10V20H4Z" /></svg> },
  { key: "athletes", label: "Athlètes", path: "/coach/athletes", icon: <svg {...ic}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20C3.5 15.5 14.5 15.5 15.5 20" /><path d="M15 4.8A3.5 3.5 0 0 1 15 11.2M18 14.5C20 15.3 21.2 17 21.5 20" /></svg> },
  { key: "plus", label: "Plus", path: "/coach/plus", icon: <svg {...ic}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg> },
] as const;

/** Onglet actif : Accueil (« /coach »), Athlètes (fiches comprises), sinon Plus. */
export function activeTab(pathname: string): (typeof TABS)[number]["key"] {
  if (pathname === "/coach" || pathname === "/coach/") return "home";
  if (pathname.startsWith("/coach/athletes")) return "athletes";
  return "plus";
}

/**
 * Coquille coach sur téléphone (planches « Coach tél. ») : pas de barre
 * latérale ni de barre du haut, chaque page porte son en-tête ; barre du bas
 * Accueil / Athlètes / Plus.
 */
export default function CoachPhoneShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const unseen = useAppUpdates(user?.id).unseen.length;
  const active = activeTab(pathname);

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, color: C.tx }}>
      <OfflineBanner variant="coach" />
      <main style={{ paddingBottom: `calc(${TAB_BAR_H + 24}px + env(safe-area-inset-bottom))`, minWidth: 0 }}>
        <Outlet />
      </main>
      <nav
        aria-label="Navigation coach"
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
          height: `calc(${TAB_BAR_H}px + env(safe-area-inset-bottom))`, padding: "10px 8px env(safe-area-inset-bottom)",
          boxSizing: "border-box", display: "flex", background: "rgba(14,12,10,0.94)", borderTop: `1px solid ${C.brd}`,
          backdropFilter: "blur(12px)",
        }}
      >
        {TABS.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => navigate(t.path)}
              aria-current={on ? "page" : undefined}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, position: "relative",
                background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                color: on ? C.ac : C.tx3, fontSize: 10.5, padding: 0,
              }}
            >
              {t.icon}
              {t.label}
              {t.key === "plus" && unseen > 0 && (
                <span aria-label={`${unseen} nouveauté(s) non lue(s)`} style={{
                  position: "absolute", top: -2, left: "calc(50% + 6px)", minWidth: 16, height: 16, borderRadius: 8, padding: "0 4px",
                  background: C.ac, color: C.bg, fontSize: 9.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                }}>{unseen}</span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
