/**
 * Fiches posées sur un jour (par un pro du staff ou le coach), affichées dans
 * le planning de l'athlète et du coach. Un clic ouvre la fiche (viewer par
 * query param, monté par la page hôte).
 */
import { cn } from "@/lib/utils";
import { useFicheViewer } from "@/features/shared/hooks/fiches/useFicheViewer";
import { CATEGORY_SOFT } from "@/features/shared/components/fiches/ficheStyles";
import type { ScheduledDoc } from "@/features/shared/hooks/fiches/useDocSchedule";

export function DayFiches({ items, compact }: { items: ScheduledDoc[]; compact?: boolean }) {
  const viewer = useFicheViewer();
  const visible = items.filter((f) => f.doc);
  if (visible.length === 0) return null;
  return (
    <div className={cn("flex flex-col", compact ? "gap-0.5" : "gap-1")}>
      {visible.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={(e) => { e.stopPropagation(); viewer.open(f.doc!.id); }}
          title={f.note ?? f.doc!.title}
          className={cn(
            "flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-[4px] border text-left font-[inherit]",
            compact ? "px-1 py-px" : "px-2.5 py-1.5",
            CATEGORY_SOFT[f.doc!.category] ?? "border-agon-info/[0.25] bg-agon-info/[0.08]",
          )}
        >
          <span className={compact ? "text-[9px]" : "text-[12px]"}>📄</span>
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate font-semibold text-agon-tx", compact ? "text-[10px]" : "text-[12px]")}>
              {f.doc!.title}
            </span>
            {!compact && f.note && (
              <span className="block text-[11px] text-agon-tx2">{f.note}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
