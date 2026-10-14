/**
 * PeriodConflictDialog — §2.a
 * Affiché quand deux périodes du même type se chevauchent.
 * 3 actions : décaler en cascade, réduire la nouvelle, annuler.
 */
import { X } from "lucide-react";
import { C } from "@/lib/theme";

export interface ConflictingPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface Props {
  /** Type de période en conflit ("macrocycle" | "mesocycle" | "cycle" | "microcycle") */
  periodType: string;
  /** Période en cours de création / modification */
  incoming: { name?: string; start_date: string; end_date: string };
  /** Périodes existantes qui chevauchent */
  conflicting: ConflictingPeriod[];
  onShiftFollowing: () => void;  // Décaler les périodes suivantes
  onShrinkNew: () => void;       // Réduire la nouvelle période
  onCancel: () => void;
}

export function PeriodConflictDialog({
  periodType, incoming, conflicting, onShiftFollowing, onShrinkNew, onCancel,
}: Props) {
  const LEVEL_COLOR: Record<string, string> = {
    macrocycle: C.ac, mesocycle: C.coach, cycle: C.o, microcycle: C.tx3,
  };
  const color = LEVEL_COLOR[periodType] ?? C.ac;

  const btnBase: React.CSSProperties = {
    width: "100%", padding: "11px 0", borderRadius: 4,
    fontSize: 13, fontWeight: 600, cursor: "pointer",
    fontFamily: "inherit", border: "none",
  };

  return (
    <>
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.6)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 81,
        transform: "translate(-50%,-50%)",
        width: 420, maxWidth: "92vw",
        background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
        padding: "20px 22px",
        animation: "fadeScaleIn 150ms ease-out",
      }}>
        <style>{`@keyframes fadeScaleIn { from { opacity:0; transform:translate(-50%,-50%) scale(0.95) } to { opacity:1; transform:translate(-50%,-50%) scale(1) } }`}</style>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 4, height: 28, borderRadius: 3, background: color }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Chevauchement détecté
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>
              Cette période chevauche {conflicting.length > 1 ? `${conflicting.length} périodes` : "une période"} existante
            </div>
          </div>
          <button onClick={onCancel} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} />
          </button>
        </div>

        {/* Conflicting periods */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: C.tx3, marginBottom: 6 }}>Période{conflicting.length > 1 ? "s" : ""} en conflit :</div>
          {conflicting.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 4, background: C.s2, marginBottom: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: 2, background: color, flexShrink: 0 }} />
              <div style={{ fontSize: 12, fontWeight: 600, color: C.tx, flex: 1 }}>{p.name || "Période"}</div>
              <div style={{ fontSize: 10, color: C.tx3 }}>{p.start_date} → {p.end_date}</div>
            </div>
          ))}
          <div style={{ fontSize: 10, color: C.tx3, marginTop: 6, fontStyle: "italic" }}>
            Nouvelle période : {incoming.start_date} → {incoming.end_date}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={onShiftFollowing}
            style={{ ...btnBase, background: color, color: "#fff" }}
          >
            Décaler les périodes suivantes en cascade
          </button>
          <button
            onClick={onShrinkNew}
            style={{ ...btnBase, background: "transparent", border: "1px solid " + C.brdL, color: C.tx2 }}
          >
            Réduire cette période pour éviter le conflit
          </button>
          <button
            onClick={onCancel}
            style={{ ...btnBase, background: "transparent", color: C.tx3, fontSize: 12 }}
          >
            Annuler
          </button>
        </div>
      </div>
    </>
  );
}
