import { useEffect, type ReactNode } from "react";
import { C } from "@/lib/theme";
import { MONO, DISPLAY } from "@/features/shared/components/seance/seanceUi";
import { headerDate } from "@/lib/date";
import { useAthleteChrome } from "../context/AthleteChromeContext";

export interface HeaderTab<K extends string = string> {
  key: K;
  label: string;
}

/**
 * En-tête de page athlète, copié des maquettes : symbole Agon et date en
 * haut (avec une petite icône de menu), grand titre fin en capitales,
 * halo de couleur facultatif, onglets segmentés facultatifs.
 */
export function AthletePageHeader<K extends string>({
  title,
  titleSize = 28,
  titleGap = 28,
  background,
  dateStyle = "short",
  tabs,
  activeTab,
  onTab,
  tabTone = "neutral",
  decor,
  padding = "56px 20px 26px",
  children,
}: {
  title: ReactNode;
  titleSize?: number;
  titleGap?: number;
  /** Fond CSS complet (halo, image). Par défaut : fond uni. */
  background?: string;
  dateStyle?: "short" | "long";
  tabs?: ReadonlyArray<HeaderTab<K>>;
  activeTab?: K;
  onTab?: (k: K) => void;
  /** Onglet actif : or (HYROX) ou blanc sur fond neutre (Programme). */
  tabTone?: "gold" | "neutral";
  /** Décor absolu derrière le contenu (cadran de l'accueil). */
  decor?: ReactNode;
  padding?: string;
  children?: ReactNode;
}) {
  const chrome = useAthleteChrome();
  const register = chrome?.register;
  useEffect(() => (register ? register() : undefined), [register]);

  return (
    <header
      style={{
        position: "relative", overflow: "hidden", padding,
        background: background ?? C.bg, borderBottom: "1px solid rgba(231,211,168,0.10)",
      }}
    >
      {decor}
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, minHeight: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
          <img src="/brand/agon-symbole-or.svg" alt="Agon" width={24} height={24} style={{ width: 24, height: 24, flex: "none" }} className="lg:hidden" />
          {chrome?.badges}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
          <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx2, whiteSpace: "nowrap" }}>
            {headerDate(new Date(), dateStyle)}
          </span>
          {chrome?.onSwitchMode && (
            <button
              type="button"
              onClick={chrome.onSwitchMode}
              className="lg:hidden"
              style={{ ...MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.ac, background: "rgba(255,201,51,0.10)", border: "1px solid rgba(255,201,51,0.35)", borderRadius: 999, padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap" }}
            >
              Coach
            </button>
          )}
          {chrome && (
            <button
              type="button"
              onClick={chrome.openMenu}
              aria-label="Menu"
              title="Menu"
              className="lg:hidden"
              style={{ width: 24, height: 24, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: C.tx2, cursor: "pointer" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" aria-hidden>
                <path d="M4 7H20M4 12H20M4 17H14" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <h1
        style={{
          position: "relative", margin: `${titleGap}px 0 0`, ...DISPLAY, fontWeight: 300, fontSize: titleSize,
          lineHeight: titleSize >= 28 ? 1.1 : 1.15, letterSpacing: "0.06em", color: C.tx,
        }}
      >
        {title}
      </h1>
      {children}
      {tabs && tabs.length > 0 && (
        <div
          role="tablist"
          style={{ position: "relative", marginTop: 16, display: "flex", gap: 2, padding: 3, border: "1px solid rgba(231,211,168,0.10)", borderRadius: 11 }}
        >
          {tabs.map((t) => {
            const on = t.key === activeTab;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onTab?.(t.key)}
                style={{
                  flex: 1, minWidth: 0, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "none",
                  ...MONO, fontSize: 10.5, letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap", cursor: "pointer",
                  background: on ? (tabTone === "gold" ? "rgba(255,201,51,0.14)" : "rgba(231,211,168,0.10)") : "transparent",
                  color: on ? (tabTone === "gold" ? C.ac : C.tx) : C.tx3,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
