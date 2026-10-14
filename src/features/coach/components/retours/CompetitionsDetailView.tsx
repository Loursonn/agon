import { Trophy, X, MapPin, MessageSquare } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { C } from "@/lib/theme";
import { EmptyState } from "@/features/shared/components/EmptyState";
import { useUpdateCompetitionComment } from "@/features/shared/hooks/retoursComments.mutations";
import type { CompetitionDetail } from "@/features/shared/types/retours.types";
import { useState } from "react";

interface CompetitionsDetailViewProps {
  competitions: CompetitionDetail[];
  onClose: () => void;
}

const PRIORITY_COLORS: Record<string, string> = { A: C.r, B: C.o, C: C.y };

function CompCard({ comp }: { comp: CompetitionDetail }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comp.athlete_comment ?? "");
  const update = useUpdateCompetitionComment();

  const save = () => {
    update.mutate(
      { competitionId: comp.id, athleteComment: text },
      { onSuccess: () => setEditing(false) }
    );
  };

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
              {comp.priority}
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

      {/* Athlete comment */}
      {comp.athlete_comment && !editing && (
        <div style={{ background: C.acS, borderRadius: 4, padding: "8px 10px", marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.ac, marginBottom: 3 }}>Commentaire athlète</div>
          <div style={{ fontSize: 12, color: C.tx2 }}>{comp.athlete_comment}</div>
        </div>
      )}

      {/* Edit button */}
      {!editing && (
        <button
          onClick={() => setEditing(true)}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}
        >
          <MessageSquare size={10} />
          {comp.athlete_comment ? "Modifier" : "Ajouter commentaire"}
        </button>
      )}

      {/* Edit form */}
      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Commentaire de l'athlète sur sa performance…"
            style={{ width: "100%", background: C.s1, border: "1px solid " + C.brdL, borderRadius: 4, padding: "7px 10px", color: C.tx, fontSize: 12, fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={save} disabled={update.isPending}
              style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Enregistrer
            </button>
            <button onClick={() => { setEditing(false); setText(comp.athlete_comment ?? ""); }}
              style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
              Annuler
            </button>
          </div>
        </div>
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
              { label: "Priorité A",  value: countA,              color: C.r  },
              { label: "Priorité B",  value: countB,              color: C.o  },
              { label: "Priorité C",  value: countC,              color: C.y  },
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
