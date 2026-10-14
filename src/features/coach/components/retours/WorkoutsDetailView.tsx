import { useState } from "react";
import { Activity, Target, Zap, X } from "lucide-react";
import { C } from "@/lib/theme";
import { WorkoutRetourCard } from "./WorkoutRetourCard";
import { EnergyRetourCard } from "./EnergyRetourCard";
import { EmptyState } from "@/features/shared/components/EmptyState";
import type { WorkoutDetail, EnergySessionDetail } from "@/features/shared/types/retours.types";

interface WorkoutsDetailViewProps {
  workouts: WorkoutDetail[];
  energySessions: EnergySessionDetail[];
  onClose: () => void;
}

type Tab = "muscu" | "specific" | "energy";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "muscu",    label: "Musculation", icon: <Activity size={11} /> },
  { key: "specific", label: "Spécifique",  icon: <Target size={11} /> },
  { key: "energy",   label: "Énergétique", icon: <Zap size={11} /> },
];

function avgNum(nums: (number | null)[]): number | null {
  const valid = nums.filter((n): n is number => n != null);
  if (!valid.length) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length * 10) / 10;
}

export function WorkoutsDetailView({ workouts, energySessions, onClose }: WorkoutsDetailViewProps) {
  const [tab, setTab] = useState<Tab>("muscu");

  const muscu    = workouts.filter((w) => w.session_type === "muscu");
  const specific = workouts.filter((w) => w.session_type === "specific");
  const completed = workouts.filter((w) => w.status === "completed");

  const counts: Record<Tab, number> = {
    muscu:    muscu.length,
    specific: specific.length,
    energy:   energySessions.length,
  };

  const completionRate = workouts.length > 0
    ? Math.round(completed.length / workouts.length * 100)
    : null;
  const avgRpe     = avgNum([
    ...completed.map((w) => w.rpe_score),
    ...energySessions.filter((e) => e.completed).map((e) => e.rpe_score),
  ]);
  const avgDurMin  = avgNum(completed.map((w) => w.duration_s != null ? Math.round(w.duration_s / 60) : null));
  const energyDone = energySessions.filter((e) => e.completed).length;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>Séances — détails</div>
            <div style={{ fontSize: 11, color: C.tx3 }}>
              {completed.length} / {workouts.length} muscu+spé complétées
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}><X size={16} /></button>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
          {[
            { label: "Taux complétion", value: completionRate != null ? `${completionRate}%` : "—", color: completionRate != null && completionRate >= 70 ? C.g : C.o },
            { label: "RPE moyen",       value: avgRpe != null ? `${avgRpe}/10` : "—",             color: C.ac },
            { label: "Durée moyenne",   value: avgDurMin != null ? `${avgDurMin} min` : "—",       color: C.b  },
            { label: "Énergie faites",  value: `${energyDone}/${energySessions.length}`,           color: C.o  },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: C.s2, borderRadius: 4, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: C.s2, padding: 3, borderRadius: 4 }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              padding: "7px 0", borderRadius: 6, border: "none",
              background: tab === t.key ? C.s1 : "transparent",
              color: tab === t.key ? C.tx : C.tx3,
              fontSize: 11, fontWeight: tab === t.key ? 700 : 500,
              cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
            }}>
              {t.icon}
              {t.label}
              {counts[t.key] > 0 && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                  background: tab === t.key ? C.ac + "30" : C.brd,
                  color:      tab === t.key ? C.ac : C.tx3,
                }}>
                  {counts[t.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tab === "muscu" && (
            muscu.length === 0
              ? <EmptyState icon={Activity} title="Aucune séance muscu ce mois" />
              : muscu.map((w) => <WorkoutRetourCard key={w.id} workout={w} />)
          )}

          {tab === "specific" && (
            specific.length === 0
              ? <EmptyState icon={Target} title="Aucune séance spécifique ce mois" />
              : specific.map((w) => <WorkoutRetourCard key={w.id} workout={w} />)
          )}

          {tab === "energy" && (
            energySessions.length === 0
              ? <EmptyState icon={Zap} title="Aucune session énergétique ce mois" />
              : energySessions.map((s) => <EnergyRetourCard key={s.id} session={s} />)
          )}
        </div>
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
