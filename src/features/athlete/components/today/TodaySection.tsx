import type { ReactNode } from "react";

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
    <section aria-label={title} className="flex flex-col" style={{ gap }}>
      <div className="flex flex-col gap-2">
        <div className="flex min-h-6 items-center justify-between gap-3">
          <h2 className="agon-mono m-0 whitespace-nowrap text-[11px] font-normal uppercase tracking-[0.12em] text-agon-tx2">
            <span className="text-agon-tx3">{String(num).padStart(2, "0")} —</span> {title}
          </h2>
          {right && <div className="flex items-center gap-3">{right}</div>}
        </div>
        <div className="h-px bg-agon-sable/[0.12]" />
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
      className="agon-mono cursor-pointer border-none bg-transparent p-0 text-[11px] uppercase tracking-[0.12em] text-agon-accent"
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
      className="flex size-6 cursor-pointer items-center justify-center rounded-[6px] border border-agon-brd-l bg-transparent p-0 text-agon-tx2"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden><path d="M12 5V19M5 12H19" /></svg>
    </button>
  );
}
