import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { MapPin, Trophy } from "lucide-react";
import { C } from "@/lib/theme";
import type { Competition } from "../hooks/useTimelineData";

const PRIORITY_COLOR: Record<string, string> = { A: C.coach, B: C.ac, C: C.tx3 };
const PRIORITY_LABEL: Record<string, string> = { A: "Priorité A", B: "Priorité B", C: "Priorité C" };

interface Props {
  comp: Competition;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function CompetitionDrawer({ comp, onEdit, onDelete }: Props) {
  const color = PRIORITY_COLOR[comp.priority ?? "C"] ?? C.tx3;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Priority badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 44, height: 44, borderRadius: 6, background: color + "20", border: "1px solid " + color + "40", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Trophy size={20} color={color} />
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.4px" }}>
            {PRIORITY_LABEL[comp.priority ?? "C"]}
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>{comp.name}</div>
        </div>
      </div>

      {/* Date */}
      <div style={{ background: C.s2, borderRadius: 4, padding: "12px 14px", border: "1px solid " + C.brd }}>
        <div style={{ fontSize: 9, color: C.tx3, marginBottom: 4 }}>Date</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
          {format(parseISO(comp.date), "EEEE d MMMM yyyy", { locale: fr })}
        </div>
      </div>

      {/* Location */}
      {comp.location && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.s2, borderRadius: 4, padding: "12px 14px", border: "1px solid " + C.brd }}>
          <MapPin size={14} color={C.tx3} />
          <div>
            <div style={{ fontSize: 9, color: C.tx3, marginBottom: 2 }}>Lieu</div>
            <div style={{ fontSize: 13, color: C.tx }}>{comp.location}</div>
          </div>
        </div>
      )}

      {/* Notes */}
      {comp.notes && (
        <div style={{ background: C.s2, borderRadius: 4, padding: "12px 14px", border: "1px solid " + C.brd }}>
          <div style={{ fontSize: 9, color: C.tx3, marginBottom: 4 }}>Notes</div>
          <div style={{ fontSize: 13, color: C.tx2, lineHeight: 1.5 }}>{comp.notes}</div>
        </div>
      )}

      {/* Actions */}
      {(onEdit || onDelete) && (
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {onEdit && (
            <button
              onClick={onEdit}
              style={{
                flex: 1, padding: "11px 0", borderRadius: 4,
                border: "1px solid " + C.coach + "50", background: C.coachS,
                color: C.coach, fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Modifier
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              style={{
                padding: "11px 16px", borderRadius: 4,
                border: "1px solid " + C.r + "40", background: "rgba(239,75,75,0.08)",
                color: C.r, fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Supprimer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
