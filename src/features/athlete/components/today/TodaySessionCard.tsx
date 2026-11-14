import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { blocColor } from "@/lib/peps";
import { blocLetter, prescriptionLine } from "@/lib/todayPreview";
import type { SessionPreviewItem } from "@/features/shared/hooks/useWeekProgram";
import { TypePill } from "./TypePill";

/**
 * Séance du jour (maquette « Aujourd'hui · aperçu ») : d'abord le nom seul ;
 * « Aperçu » déplie la liste des exercices (lettre du bloc, prescription),
 * le lien vers le détail et le gros bouton « Démarrer la séance ».
 * Pas de volume ni de tonnage.
 */
export function TodaySessionCard({
  color,
  typeLabel,
  title,
  items,
  onStart,
  startLabel = "Démarrer la séance",
  onDetail,
  extra,
  defaultOpen = false,
  time,
  badge,
  pattern = false,
}: {
  color: string;
  typeLabel: string;
  title: string;
  /** Exercices prévus ; absent = séance sans aperçu (énergie : on ouvre le détail). */
  items?: SessionPreviewItem[];
  onStart?: () => void;
  startLabel?: string;
  onDetail?: () => void;
  /** Contenu supplémentaire sous l'aperçu (fiches du coach). */
  extra?: ReactNode;
  defaultOpen?: boolean;
  /** Heure prévue (« 9 H 00 »), si connue. */
  time?: string;
  /** Petite mention dans l'en-tête (« Sur ta montre »). */
  badge?: ReactNode;
  /** Motif doré en fond (séance de musculation, maquette). */
  pattern?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasPreview = !!items && items.length > 0;
  const canOpen = hasPreview || !!extra || !!onStart;

  const chevron = (up: boolean) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden>
      <path d={up ? "M6 15L12 9L18 15" : "M6 9L12 15L18 9"} />
    </svg>
  );
  const headBtn =
    "flex h-9 flex-none cursor-pointer items-center gap-1.5 rounded-[10px] border border-agon-brd-l bg-agon-bg/[0.35] px-3 font-[inherit] text-[13px] font-medium text-agon-tx";
  const rowTop = "border-t border-agon-brd";

  return (
    <div className="relative overflow-hidden rounded-[14px] border" style={{ borderColor: `${color}73`, background: `${color}1F` }}>
      <span aria-hidden className="absolute inset-y-0 left-0 z-[1] w-[3px]" style={{ background: color }} />
      {pattern && <div aria-hidden className="absolute inset-0 bg-[url(/maquette/carte-seance-motif.svg)] bg-cover bg-center opacity-[0.14]" />}
      <div className="relative flex items-center gap-3 py-3 pl-[17px] pr-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <TypePill color={color}>{typeLabel}</TypePill>
            {time && <span className="agon-mono text-[11px] tracking-[0.08em] text-agon-tx2">{time}</span>}
            {badge}
          </div>
          <div className="agon-display text-[14px] font-medium leading-[1.3] tracking-[0.06em] text-agon-tx [overflow-wrap:anywhere]">{title}</div>
        </div>
        {canOpen ? (
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={headBtn}>
            {open ? "Fermer" : "Aperçu"} {chevron(open)}
          </button>
        ) : onDetail ? (
          <button type="button" onClick={onDetail} className={headBtn}>
            Aperçu {chevron(false)}
          </button>
        ) : null}
      </div>

      {open && (
        <div className="relative flex flex-col pb-3.5 pl-[17px] pr-3.5">
          {hasPreview && (
            <>
              <div className="flex items-center gap-2 pb-2 pt-0.5">
                <span className="agon-mono text-[11px] uppercase tracking-[0.14em] text-agon-tx3">Aperçu</span>
                <span className="flex-1" />
                <span className="agon-mono text-[11px] uppercase tracking-[0.06em] text-agon-tx3">
                  {items!.length} exercice{items!.length > 1 ? "s" : ""}
                </span>
              </div>
              {items!.map((it, i) => {
                const bi = it.blocIndex ?? 0;
                const bc = blocColor(it.blocColor, bi);
                const line = prescriptionLine(it.mode, it.params);
                return (
                  <div key={it.id + i} className={cn("flex items-center gap-2.5 whitespace-nowrap py-2", rowTop)}>
                    <span className="agon-mono inline-flex size-5 flex-none items-center justify-center rounded-[6px] text-[11px] font-medium text-agon-ink" style={{ background: bc }}>
                      {blocLetter(bi)}
                    </span>
                    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis text-[13px] text-agon-tx">{it.name}</span>
                    {line && <span className="agon-mono flex-none text-[12px] text-agon-tx2">{line}</span>}
                  </div>
                );
              })}
            </>
          )}
          {extra && <div className={cn("py-2", hasPreview && rowTop)}>{extra}</div>}
          {onDetail && (
            <button
              type="button"
              onClick={onDetail}
              className={cn("flex cursor-pointer items-center gap-1.5 bg-transparent pb-3.5 pt-3 text-left font-[inherit] text-[14px] font-medium text-agon-accent", (hasPreview || extra) && rowTop)}
            >
              Voir le détail de la séance <span aria-hidden>→</span>
            </button>
          )}
          {onStart && (
            <button
              type="button"
              onClick={onStart}
              className="flex h-[52px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border-none bg-agon-accent font-[inherit] text-[15px] font-semibold text-agon-ink"
            >
              {startLabel}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4L20 12L7 20Z" /></svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
