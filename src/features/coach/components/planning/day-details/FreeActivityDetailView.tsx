import { C } from "@/lib/theme";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { FREE_COLOR } from "./dayDetailsConstants";

export function FreeActivityDetailView({ event }: { event: CalEvent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Sport */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 32 }}>{event.sportEmoji ?? "course"}</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.tx }}>{event.sport ?? "Activité libre"}</div>
          <div style={{ fontSize: 11, color: FREE_COLOR, fontWeight: 600 }}>Activité libre</div>
        </div>
      </div>

      {/* Metrics */}
      {(event.duration != null || event.intensity != null) && (
        <div style={{ display: "flex", gap: 10 }}>
          {event.duration != null && (
            <div style={{ background: C.s2, borderRadius: 4, padding: "10px 14px", flex: 1, border: "1px solid " + C.brd }}>
              <div style={{ fontSize: 9, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>Durée</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.tx }}>{event.duration} <span style={{ fontSize: 11, fontWeight: 400, color: C.tx3 }}>min</span></div>
            </div>
          )}
          {event.intensity != null && (
            <div style={{ background: C.s2, borderRadius: 4, padding: "10px 14px", flex: 1, border: "1px solid " + C.brd }}>
              <div style={{ fontSize: 9, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>RPE</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: FREE_COLOR }}>{event.intensity}<span style={{ fontSize: 11, fontWeight: 400, color: C.tx3 }}>/10</span></div>
            </div>
          )}
        </div>
      )}

      {/* Note */}
      {event.raw?.note && (
        <div style={{ background: C.s2, borderRadius: 4, border: "1px solid " + C.brd, padding: "10px 12px", fontSize: 12, color: C.tx2, fontStyle: "italic" }}>
          {String(event.raw.note)}
        </div>
      )}
    </div>
  );
}
