import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Carte d'une séance dans la semaine du Programme (maquette « Programme
 * athlète ») : teintée de la couleur du type, nom, pastille du type, état
 * (« Fait », « Déplacée du ven. »…), bouton « Démarrer » le jour même et
 * menu ⋯ (déplacer, voir le détail).
 */
export function ProgramSessionCard({
  color,
  typeLabel,
  title,
  done = false,
  muted = false,
  status,
  statusColor,
  highlight = false,
  onPress,
  onStart,
  startLabel = "Démarrer",
  onMenu,
  menuLabel = "Options de la séance",
  share,
}: {
  color: string;
  typeLabel: string;
  title: string;
  done?: boolean;
  /** Séance manquée : carte estompée. */
  muted?: boolean;
  /** Texte d'état à droite de la pastille (« Déplacée du ven. », « Manquée »). */
  status?: ReactNode;
  statusColor?: string;
  /** Jour même : teinte et bordure plus marquées. */
  highlight?: boolean;
  onPress: () => void;
  onStart?: () => void;
  startLabel?: string;
  onMenu?: () => void;
  menuLabel?: string;
  /** Icône « Partager ma séance ». */
  share?: ReactNode;
}) {
  return (
    <div
      className={cn("flex items-center gap-2 rounded-xl border py-[9px] pl-3 pr-1.5", muted && "opacity-[0.55]")}
      style={{ background: color + (highlight ? "24" : "1A"), borderColor: color + (highlight ? "73" : "38") }}
    >
      <button
        type="button"
        onClick={onPress}
        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-[5px] border-none bg-transparent p-0 text-left font-[inherit]"
      >
        <span className={cn("max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[14px]", done ? "text-agon-tx2" : "text-agon-tx")}>{title}</span>
        <span className="flex flex-wrap items-center gap-2">
          <span className="agon-mono rounded-full px-[7px] py-0.5 text-[9.5px] uppercase tracking-[0.08em] text-agon-ink" style={{ background: color }}>{typeLabel}</span>
          {done && (
            <span className="agon-mono flex items-center gap-1 text-[10.5px] text-agon-type-fait">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" aria-hidden><path d="M4 12L10 18L20 6" /></svg>
              Fait
            </span>
          )}
          {status && <span className={cn("text-[11.5px]", !statusColor && "text-agon-tx3")} style={statusColor ? { color: statusColor } : undefined}>{status}</span>}
        </span>
      </button>
      {share}
      {onStart && (
        <button
          type="button"
          onClick={onStart}
          className="h-8 flex-none cursor-pointer rounded-[10px] border-none bg-agon-accent px-3 font-[inherit] text-[13px] font-semibold text-agon-ink"
        >
          {startLabel}
        </button>
      )}
      {onMenu ? (
        <button
          type="button"
          onClick={onMenu}
          aria-label={menuLabel}
          title={menuLabel}
          className="flex size-8 flex-none cursor-pointer items-center justify-center rounded-[9px] border-none bg-transparent text-agon-tx2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        </button>
      ) : (
        <span className="w-1" />
      )}
    </div>
  );
}
