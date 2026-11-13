import { useNavigate } from "react-router-dom";
import { Pencil } from "lucide-react";
import { C } from "@/lib/theme";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import type { Bloc } from "@/features/coach/components/programmation/types";
import { ENERGY_KIND_LABEL, STATUS_LABEL } from "./dayDetailsConstants";
import { rpeColor, rpeBg } from "./dayDetailsUtils";

export function EnergyDetailView({ event, onOpenPreview, athleteId }: { event: CalEvent; onOpenPreview: () => void; athleteId?: string }) {
  const navigate = useNavigate();
  const blockLogs = event.raw?.block_logs as Record<string, { done: boolean; note?: string }> | null | undefined;
  const blEntries = blockLogs ? Object.entries(blockLogs) : [];
  const doneCount  = blEntries.filter(([, b]) => b.done).length;
  const totalCount = blEntries.length;

  const statusInfo = event.partial
    ? { label: `Partielle ${doneCount}/${totalCount}`, color: "#33B5FF" }
    : event.status ? STATUS_LABEL[event.status] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Badges */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {statusInfo && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
            background: statusInfo.color + "20", color: statusInfo.color,
            textTransform: "uppercase", letterSpacing: "0.4px",
          }}>
            {statusInfo.label}
          </span>
        )}
        {event.sessionKind && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
            background: C.oS, color: C.o,
          }}>
            {ENERGY_KIND_LABEL[event.sessionKind] ?? event.sessionKind}
          </span>
        )}
        {event.rpe != null && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
            background: rpeBg(event.rpe), color: rpeColor(event.rpe),
          }}>
            RPE {event.rpe}/10
          </span>
        )}
      </div>

      {/* Block completion */}
      {blEntries.length > 0 && (
        <div style={{ background: C.s2, borderRadius: 4, border: "1px solid " + C.brd, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid " + C.brd, fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Blocs
          </div>
          <div style={{ padding: "6px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
            {blEntries.map(([key, b], i) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                <span style={{
                  width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                  background: b.done ? C.g : C.s2,
                  border: "1px solid " + (b.done ? C.g : C.brd),
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 8, color: "#fff",
                }}>
                  {b.done ? "✓" : ""}
                </span>
                <span style={{ color: b.done ? C.tx : C.tx3 }}>Bloc {i + 1}</span>
                {b.note && <span style={{ fontSize: 9, color: C.tx3, fontStyle: "italic" }}>{b.note}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {event.raw?.notes && (
        <div style={{ background: C.s2, borderRadius: 4, border: "1px solid " + C.brd, padding: "10px 12px", fontSize: 12, color: C.tx2, fontStyle: "italic" }}>
          {String(event.raw.notes)}
        </div>
      )}

      {/* Link to full session programme */}
      <button
        onClick={onOpenPreview}
        style={{
          padding: "10px 14px", borderRadius: 4, border: "1px solid " + C.o + "40",
          background: C.oS, color: C.o, fontSize: 12, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
        }}
      >
        Voir le programme de la séance →
      </button>

      {/* Edit energy session */}
      {event.energySessionId && (
        <button
          onClick={() => {
            const base = athleteId
              ? `/coach/athletes/${athleteId}/energy/${event.energySessionId}/edit`
              : `/coach/energy-library/${event.energySessionId}/edit`;
            navigate(base);
          }}
          style={{
            padding: "10px 14px", borderRadius: 4, border: "1px solid " + C.coach + "40",
            background: C.coachS, color: C.coach, fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          <Pencil size={13} /> Modifier la séance
        </button>
      )}
    </div>
  );
}
