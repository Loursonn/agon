import { C } from "@/lib/theme";
import { getAllPRs } from "@/lib/calculations";
import { getBig3 } from "@/lib/calculations";
import { MiniChart } from "@/components/athlete/StatsCharts";
import { get1rmByWeek } from "@/lib/calculations";
import type { ArchivedBlock } from "@/features/shared/types/athlete";

interface Props {
  blockHistory: ArchivedBlock[];
  onClose: () => void;
  onDelete?: (idx: number) => void;
}

export default function BlockHistoryViewer({ blockHistory, onClose, onDelete }: Props) {
  if (!blockHistory?.length) return (
    <div style={{ padding: 20, textAlign: "center" }}>
      <div style={{ fontSize: 14, color: C.tx3, marginBottom: 16 }}>Aucun bloc archivé</div>
      <button onClick={onClose} style={{ padding: "8px 20px", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Fermer</button>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: C.bg, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid " + C.brd, position: "sticky", top: 0, background: C.bg, zIndex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Historique des blocs</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.tx3, fontSize: 20, cursor: "pointer", fontFamily: "inherit" }}>×</button>
      </div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {blockHistory.slice().reverse().map((block, i) => {
          const realIdx = blockHistory.length - 1 - i;
          const prs = getAllPRs(block.exos || {});
          const totalDone = Object.values(block.completedSessions || {}).flat().length;
          const tw = block.blockConfig?.totalWeeks || 6;
          const totalTarget = (block.goals?.sessionsPerWeek || 6) * tw;
          const adherence = totalTarget ? Math.round((totalDone / totalTarget) * 100) : 0;
          const date = block.archivedAt ? new Date(block.archivedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "";
          const big3 = getBig3(block.exos || {});
          return (
            <div key={(block as { id?: string }).id || i} style={{ background: C.s1, borderRadius: 6, padding: 16, border: "1px solid " + C.brd }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{block.blockConfig?.blockName || "Bloc " + (blockHistory.length - i)}</div>
                  <div style={{ fontSize: 10, color: C.tx3 }}>{date} · {tw} sem. · {totalDone}/{totalTarget} séances ({adherence}%)</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <div style={{ padding: "4px 10px", borderRadius: 4, background: adherence >= 80 ? C.gS : adherence >= 50 ? C.oS : C.rS, color: adherence >= 80 ? C.g : adherence >= 50 ? C.o : C.r, fontSize: 11, fontWeight: 700 }}>{adherence}%</div>
                  {onDelete && <button onClick={() => onDelete(realIdx)} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid " + C.r + "40", background: "transparent", color: C.r, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Suppr.</button>}
                </div>
              </div>
              {big3.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  {big3.map(({ name, label, c }: { name: string; label: string; c: string }) => {
                    const pr = (prs as Record<string, { est?: string }>)[name];
                    return (
                      <div key={label} style={{ flex: 1, background: C.s2, borderRadius: 4, padding: "10px 8px", textAlign: "center", border: "1px solid " + c + "20" }}>
                        <div style={{ fontSize: 9, color: C.tx3, marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: c }}>{pr?.est || "--"}</div>
                        <div style={{ fontSize: 8, color: C.tx3 }}>kg est.</div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {(block.sessions || []).map(s => (
                  <span key={s.id} style={{ padding: "3px 8px", borderRadius: 6, background: C.s2, border: "1px solid " + C.brd, fontSize: 10, color: C.tx2 }}>{s.short || s.name}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
