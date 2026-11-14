import { useEffect, type ReactNode } from "react";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { headerDate } from "@/lib/date";
import { useIsDesktop } from "@/hooks/useIsDesktop";
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
  inline,
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
  /**
   * Ordinateur (planche AthOrdiAAujourdhui) : date en kicker au-dessus du titre
   * sur une ligne, `children` (citation) à droite, sans décor.
   */
  inline?: boolean;
  children?: ReactNode;
}) {
  const chrome = useAthleteChrome();
  const isDesktop = useIsDesktop();
  const register = chrome?.register;
  useEffect(() => (register ? register() : undefined), [register]);

  // Ordinateur : en-tête compact par défaut (planches AthOrdi*), sauf avis contraire de la page.
  const compact = inline ?? isDesktop;
  const tabClass = (on: boolean) =>
    on ? (tabTone === "gold" ? "bg-agon-accent/[0.14] text-agon-accent" : "bg-agon-brd text-agon-tx") : "bg-transparent text-agon-tx3";

  if (compact) {
    return (
      <header className="flex flex-wrap items-end justify-between gap-8" style={{ padding: inline ? padding : "28px 20px 8px" }}>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="agon-mono whitespace-nowrap text-[11px] uppercase tracking-[0.14em] text-agon-tx2">
            {headerDate(new Date(), "long")}
          </span>
          <h1 className="agon-display m-0 font-normal leading-[1.1] tracking-[0.06em] text-agon-tx" style={{ fontSize: titleSize }}>{title}</h1>
        </div>
        {children && <div className="w-[560px] max-w-full">{children}</div>}
        {tabs && tabs.length > 0 && (
          <div role="tablist" className="flex gap-0.5 rounded-[10px] border border-agon-brd p-[3px]">
            {tabs.map((t) => {
              const on = t.key === activeTab;
              return (
                <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => onTab?.(t.key)}
                  className={cn("agon-mono h-[30px] cursor-pointer whitespace-nowrap rounded-[7px] border-none px-3.5 text-[10.5px] uppercase tracking-[0.06em]", tabClass(on))}>
                  {t.label}
                </button>
              );
            })}
          </div>
        )}
      </header>
    );
  }

  return (
    <header className="relative overflow-hidden border-b border-agon-brd" style={{ padding, background: background ?? C.bg }}>
      {decor}
      <div className="relative flex min-h-6 items-center justify-between gap-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <img src="/brand/agon-symbole-or.svg" alt="Agon" width={24} height={24} className="size-6 flex-none lg:hidden" />
          {chrome?.badges}
        </div>
        <div className="flex flex-none items-center gap-2.5">
          <span className="agon-mono whitespace-nowrap text-[11px] uppercase tracking-[0.14em] text-agon-tx2">
            {headerDate(new Date(), dateStyle)}
          </span>
          {chrome?.onSwitchMode && (
            <button
              type="button"
              onClick={chrome.onSwitchMode}
              className="agon-mono cursor-pointer whitespace-nowrap rounded-full border border-agon-accent/35 bg-agon-accent/10 px-2 py-[3px] text-[10px] uppercase tracking-[0.08em] text-agon-accent lg:hidden"
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
              className="flex size-6 cursor-pointer items-center justify-center border-none bg-transparent p-0 text-agon-tx2 lg:hidden"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" aria-hidden>
                <path d="M4 7H20M4 12H20M4 17H14" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <h1
        className={cn("agon-display relative mb-0 tracking-[0.06em] text-agon-tx", titleSize >= 28 ? "leading-[1.1]" : "leading-[1.15]")}
        style={{ marginTop: titleGap, fontSize: titleSize }}
      >
        {title}
      </h1>
      {children}
      {tabs && tabs.length > 0 && (
        <div role="tablist" className="relative mt-4 flex gap-0.5 rounded-[11px] border border-agon-brd p-[3px]">
          {tabs.map((t) => {
            const on = t.key === activeTab;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onTab?.(t.key)}
                className={cn(
                  "agon-mono flex h-[34px] min-w-0 flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-[8px] border-none text-[10.5px] uppercase tracking-[0.04em]",
                  tabClass(on),
                )}
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
