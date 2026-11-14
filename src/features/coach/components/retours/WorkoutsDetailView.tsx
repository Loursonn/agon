import { useState } from "react";
import { Activity, Target, Zap, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SHEET_CLOSE, SHEET_HEAD, SHEET_OVERLAY, SHEET_PANEL, SHEET_SUB, SHEET_TITLE, STAT_CARD, STAT_LABEL, STAT_VALUE } from "./detailSheet";
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
    <div className={SHEET_OVERLAY}>
      <div className={SHEET_PANEL}>
        {/* Header */}
        <div className={SHEET_HEAD}>
          <div>
            <div className={SHEET_TITLE}>Séances — détails</div>
            <div className={SHEET_SUB}>
              {completed.length} / {workouts.length} muscu+spé complétées
            </div>
          </div>
          <button onClick={onClose} className={SHEET_CLOSE}><X size={16} /></button>
        </div>

        {/* Stats row */}
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Taux complétion", value: completionRate != null ? `${completionRate}%` : "—", color: completionRate != null && completionRate >= 70 ? "text-agon-succes" : "text-agon-alerte" },
            { label: "RPE moyen",       value: avgRpe != null ? `${avgRpe}/10` : "—",             color: "text-agon-accent" },
            { label: "Durée moyenne",   value: avgDurMin != null ? `${avgDurMin} min` : "—",       color: "text-agon-info" },
            { label: "Énergie faites",  value: `${energyDone}/${energySessions.length}`,           color: "text-agon-alerte" },
          ].map(({ label, value, color }) => (
            <div key={label} className={STAT_CARD}>
              <div className={STAT_LABEL}>{label}</div>
              <div className={cn(STAT_VALUE, "text-[17px]", color)}>{value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 rounded-[4px] bg-agon-s2 p-[3px]">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={cn(
              "flex flex-1 cursor-pointer items-center justify-center gap-[5px] rounded-[6px] border-none py-[7px] text-[11px] [transition:all_120ms]",
              tab === t.key ? "bg-agon-s1 font-bold text-agon-tx" : "bg-transparent font-medium text-agon-tx3",
            )}>
              {t.icon}
              {t.label}
              {counts[t.key] > 0 && (
                <span className={cn(
                  "rounded-[4px] px-[5px] py-px text-[9px] font-bold",
                  tab === t.key ? "bg-agon-accent/[0.188] text-agon-accent" : "bg-agon-brd text-agon-tx3",
                )}>
                  {counts[t.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex flex-col gap-2.5">
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
