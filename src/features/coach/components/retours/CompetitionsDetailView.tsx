import { priorityLabel } from "@/types/planning";
import { Trophy, X, MapPin } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { C } from "@/lib/theme";
import { EmptyState } from "@/features/shared/components/EmptyState";
import type { CompetitionDetail } from "@/features/shared/types/retours.types";

interface CompetitionsDetailViewProps {
  competitions: CompetitionDetail[];
  onClose: () => void;
}

const PRIORITY_COLORS: Record<string, string> = { A: C.r, B: C.o, C: C.y };

function CompCard({ comp }: { comp: CompetitionDetail }) {
  return (
    <div style={{ background: C.s2, borderRadius: 4, padding: "12px 14px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {comp.name}
          </span>
          {comp.type && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: C.brd, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.3px", flexShrink: 0 }}>
              {comp.type}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {comp.priority && (
            <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 6, background: PRIORITY_COLORS[comp.priority] + "20", color: PRIORITY_COLORS[comp.priority] }}>
              {priorityLabel(comp.priority)}
            </span>
          )}
          <span style={{ fontSize: 10, color: C.tx3 }}>
            {format(parseISO(comp.date), "d MMM yyyy", { locale: fr })}
          </span>
        </div>
      </div>

      {/* Location */}
      {comp.location && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
          <MapPin size={10} color={C.tx3} />
          <span style={{ fontSize: 11, color: C.tx3 }}>{comp.location}</span>
        </div>
      )}

      {/* Retour de l'athlète (lecture seule) */}
      {comp.athlete_comment ? (
        <div style={{ background: C.acS, borderRadius: 4, padding: "8px 10px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.ac, marginBottom: 3 }}>Retour de l'athlète</div>
          <div style={{ fontSize: 12, color: C.tx2, whiteSpace: "pre-wrap" }}>{comp.athlete_comment}</div>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: C.tx3, fontStyle: "italic" }}>Pas encore de retour de l'athlète</div>
      )}
    </div>
  );
}

export function CompetitionsDetailView({ competitions, onClose }: CompetitionsDetailViewProps) {
  const countA = competitions.filter((c) => c.priority === "A").length;
  const countB = competitions.filter((c) => c.priority === "B").length;
  const countC = competitions.filter((c) => c.priority === "C").length;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>Compétitions — détails</div>
            <div style={{ fontSize: 11, color: C.tx3 }}>{competitions.length} au total</div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}><X size={16} /></button>
        </div>

        {/* Stats row */}
        {competitions.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
            {[
              { label: "Total",       value: competitions.length, color: C.ac },
              { label: "Importance A",  value: countA,              color: C.r  },
              { label: "Importance B",  value: countB,              color: C.o  },
              { label: "Importance C",  value: countC,              color: C.y  },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: C.s2, borderRadius: 4, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {competitions.length === 0
          ? <EmptyState icon={Trophy} title="Aucune compétition ce mois" />
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {competitions.map((c) => <CompCard key={c.id} comp={c} />)}
            </div>
          )
        }
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
  zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center",
};

const panelStyle: React.CSSProperties = {
  background: C.s1, borderRadius: "6px 6px 0 0",
  width: "100%", maxWidth: 860,
  maxHeight: "92vh", overflowY: "auto",
  padding: "20px 20px 40px",
};

const closeBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 32, height: 32, borderRadius: 4,
  border: "1px solid " + C.brd, background: C.s2,
  color: C.tx3, cursor: "pointer", fontFamily: "inherit",
};
