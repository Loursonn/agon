/**
 * Fiches posées sur un jour (par un pro du staff ou le coach), affichées dans
 * le planning de l'athlète et du coach. Un clic ouvre la fiche (viewer par
 * query param, monté par la page hôte).
 */
import { C } from "@/lib/theme";
import { useFicheViewer } from "@/features/shared/hooks/fiches/useFicheViewer";
import { CATEGORY_COLOR } from "@/features/shared/components/fiches/ficheStyles";
import type { ScheduledDoc } from "@/features/shared/hooks/fiches/useDocSchedule";

export function DayFiches({ items, compact }: { items: ScheduledDoc[]; compact?: boolean }) {
  const viewer = useFicheViewer();
  const visible = items.filter((f) => f.doc);
  if (visible.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 2 : 4 }}>
      {visible.map((f) => {
        const color = CATEGORY_COLOR[f.doc!.category] ?? C.b;
        return (
          <button
            key={f.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); viewer.open(f.doc!.id); }}
            title={f.note ?? f.doc!.title}
            style={{
              display: "flex", alignItems: "center", gap: 6, textAlign: "left", width: "100%", minWidth: 0,
              padding: compact ? "1px 4px" : "6px 10px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit",
              background: color + "14", border: "1px solid " + color + "40",
            }}
          >
            <span style={{ fontSize: compact ? 9 : 12 }}>📄</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: compact ? 10 : 12, fontWeight: 600, color: C.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {f.doc!.title}
              </span>
              {!compact && f.note && (
                <span style={{ display: "block", fontSize: 11, color: C.tx2 }}>{f.note}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
