import { FlaskConical, X, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { C } from "@/lib/theme";
import { EmptyState } from "@/features/shared/components/EmptyState";
import type { TestDetail } from "@/features/shared/types/retours.types";

interface TestsDetailViewProps {
  tests: TestDetail[];
  onClose: () => void;
}

export function TestsDetailView({ tests, onClose }: TestsDetailViewProps) {
  const completed  = tests.filter((t) => t.completed).length;
  const validated  = tests.filter((t) => t.coach_validated).length;
  const rate       = tests.length > 0 ? Math.round(completed / tests.length * 100) : null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>Tests — détails</div>
            <div style={{ fontSize: 11, color: C.tx3 }}>
              {completed} / {tests.length} réalisé{completed !== 1 ? "s" : ""}
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}><X size={16} /></button>
        </div>

        {/* Stats row */}
        {tests.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
            {[
              { label: "Réalisés",          value: `${completed}/${tests.length}`, color: completed === tests.length ? C.g : C.o },
              { label: "Taux réalisation",  value: rate != null ? `${rate}%` : "—", color: rate != null && rate >= 70 ? C.g : C.o },
              { label: "Validés coach",     value: `${validated}/${completed || 1}`, color: C.ac },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: C.s2, borderRadius: 4, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {tests.length === 0 ? (
          <EmptyState icon={FlaskConical} title="Aucun test ce mois" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {tests.map((t) => (
              <div key={t.id} style={{ background: C.s2, borderRadius: 4, padding: "12px 14px" }}>
                {/* Title + status row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{t.title}</span>
                    {t.type && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: C.brd, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                        {t.type}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {t.coach_validated && (
                      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <ShieldCheck size={11} color={C.g} />
                        <span style={{ fontSize: 9, color: C.g }}>Validé</span>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      {t.completed
                        ? <CheckCircle2 size={11} color={C.g} />
                        : <Clock size={11} color={C.o} />}
                      <span style={{ fontSize: 9, color: t.completed ? C.g : C.o }}>
                        {t.completed ? "Réalisé" : "Non réalisé"}
                      </span>
                    </div>
                    <span style={{ fontSize: 10, color: C.tx3 }}>
                      {format(parseISO(t.date), "d MMM", { locale: fr })}
                    </span>
                  </div>
                </div>

                {/* Results note */}
                {t.results_note && (
                  <div style={{ background: C.s1, borderRadius: 4, padding: "8px 10px" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>
                      Résultats
                    </div>
                    <div style={{ fontSize: 12, color: C.tx2 }}>{t.results_note}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
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
