import type { ReactNode } from "react";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";

/**
 * Section numérotée de l'accueil athlète (maquette « Aujourd'hui ») :
 * « 01 — Wellness du jour », action à droite, filet fin dessous.
 */
export function TodaySection({
  num,
  title,
  right,
  gap = 12,
  children,
}: {
  num: number;
  title: string;
  right?: ReactNode;
  gap?: number;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} style={{ display: "flex", flexDirection: "column", gap }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 24, gap: 12 }}>
          <h2 style={{ margin: 0, ...MONO, fontWeight: 400, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.tx2, whiteSpace: "nowrap" }}>
            <span style={{ color: C.tx3 }}>{String(num).padStart(2, "0")} —</span> {title}
          </h2>
          {right && <div style={{ display: "flex", gap: 12, alignItems: "center" }}>{right}</div>}
        </div>
        <div style={{ height: 1, background: "rgba(231,211,168,0.12)" }} />
      </div>
      {children}
    </section>
  );
}

/** Lien d'action d'une section (« Modifier », « Détail → »), en or Mono. */
export function SectionLink({ children, onClick, label }: { children: ReactNode; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{ ...MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.ac, background: "none", border: "none", padding: 0, cursor: "pointer" }}
    >
      {children}
    </button>
  );
}

/** Petit bouton carré « + » d'une section. */
export function SectionAdd({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{ width: 24, height: 24, border: `1px solid ${C.brdL}`, borderRadius: 6, background: "none", color: C.tx2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden><path d="M12 5V19M5 12H19" /></svg>
    </button>
  );
}
