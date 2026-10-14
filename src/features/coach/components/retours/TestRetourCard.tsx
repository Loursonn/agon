import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { FlaskConical } from "lucide-react";
import { C } from "@/lib/theme";
import type { TestDetail } from "@/features/shared/types/retours.types";

const TYPE_COLOR: Record<string, string> = {
  musculation: "#FFC933", endurance: "#33B5FF", vitesse: "#EF4444",
  puissance: "#F59E0B", souplesse: "#10B981", autre: "#6B7280",
};

interface TestRetourCardProps {
  test: TestDetail;
}

export function TestRetourCard({ test }: TestRetourCardProps) {
  const tc = TYPE_COLOR[test.type] ?? "#6B7280";

  const structuredVars = test.results_structured
    ? (test.results_structured as Record<string, Record<string, number>>).variables ?? null
    : null;
  const hasStructured = structuredVars && Object.values(structuredVars).some(v => v != null);

  return (
    <div style={{
      background: test.completed ? tc + "10" : C.s1,
      border: "1px solid " + (test.completed ? tc + "35" : C.brd),
      borderRadius: 6, padding: "10px 14px",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FlaskConical size={13} color={tc} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{test.title}</span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 4,
            background: test.completed ? C.g + "20" : C.s2,
            color: test.completed ? C.g : C.tx3,
          }}>
            {test.completed ? "✓ Complété" : "En attente"}
          </span>
          {test.coach_validated && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 4, background: tc + "20", color: tc }}>
              ✓ Validé
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 4, background: tc + "15", color: tc, textTransform: "capitalize" as const }}>
            {test.type}
          </span>
          <span style={{ fontSize: 10, color: C.tx3 }}>
            {format(new Date(test.date + "T12:00:00"), "EEE d MMM", { locale: fr })}
          </span>
        </div>
      </div>

      {/* Structured results (variable key→value) */}
      {test.completed && hasStructured && (
        <div style={{
          background: C.s2, borderRadius: 4, padding: "7px 10px", marginBottom: 6,
          display: "flex", flexWrap: "wrap" as const, gap: "4px 14px",
        }}>
          {Object.entries(structuredVars!).map(([key, val]) =>
            val != null ? (
              <div key={key} style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
                <span style={{ fontSize: 9, color: C.tx3, textTransform: "capitalize" as const }}>{key}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: tc }}>{val}</span>
              </div>
            ) : null
          )}
        </div>
      )}

      {/* results_note (free text or auto-summary) */}
      {test.completed && test.results_note && !hasStructured && (
        <div style={{ background: C.s2, borderRadius: 4, padding: "7px 10px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 3 }}>
            Résultats
          </div>
          <div style={{ fontSize: 12, color: C.tx2 }}>{test.results_note}</div>
        </div>
      )}

      {/* Show results_note as comment when structured data present */}
      {test.completed && test.results_note && hasStructured && (
        <div style={{ fontSize: 10, color: C.tx3, fontStyle: "italic", marginTop: 2 }}>
          {test.results_note}
        </div>
      )}

      {/* Not completed + no results */}
      {!test.completed && (
        <div style={{ fontSize: 10, color: C.tx3 }}>Résultats en attente</div>
      )}
    </div>
  );
}
