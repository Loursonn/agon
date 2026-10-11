import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import {
  format, addMonths, subMonths, startOfMonth,
  addWeeks, subWeeks, startOfWeek,
} from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Heart, Dumbbell, FlaskConical, Trophy, UtensilsCrossed, MessageSquare } from "lucide-react";
import { C } from "@/lib/theme";
import { MuscleVolumeCard } from "@/components/athlete/StatsViews";
import { stC, ALL_BZ } from "@/lib/muscles";
import { PageSkeleton } from "@/features/shared/components/skeletons";
import { KPICard } from "@/features/coach/components/KPICard";
import { useMonthlyRetours } from "@/features/shared/hooks/useMonthlyRetours";
import { useWeeklyRetours } from "@/features/shared/hooks/useWeeklyRetours";
import { useAthleteModifications } from "@/features/shared/hooks/useAthleteModifications";
import { MonthCalendarView } from "../components/retours/MonthCalendarView";
import { WeekView } from "../components/retours/WeekView";
import { WellnessDetailView } from "../components/retours/WellnessDetailView";
import { WorkoutsDetailView } from "../components/retours/WorkoutsDetailView";
import { TestsDetailView } from "../components/retours/TestsDetailView";
import { CompetitionsDetailView } from "../components/retours/CompetitionsDetailView";
import { NutritionDetailView } from "../components/retours/NutritionDetailView";
import { useWeeklyCoachRetour, useUpsertWeeklyRetour } from "@/features/shared/hooks/useWeeklyCoachRetour";
import { useAuth } from "@/hooks/useAuth";

type ViewMode = "month" | "week";
type DetailView = "wellness" | "workouts" | "tests" | "competitions" | "nutrition" | null;

export default function RetoursPage() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const { goals, exos, exMeta, sets, sessions, weeksArr, tw, currentWeek, injuries, activeInjuries } = useAthleteContext();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));
  const [selectedWeek, setSelectedWeek]   = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [detailView, setDetailView]       = useState<DetailView>(null);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: monthData, isLoading: monthLoading } = useMonthlyRetours(athleteId!, selectedMonth);
  const { data: weekData,  isLoading: weekLoading  } = useWeeklyRetours(athleteId!, selectedWeek);
  const { data: modifications = [] } = useAthleteModifications(athleteId!);
  const { user } = useAuth();
  const weekStartStr = format(selectedWeek, "yyyy-MM-dd");
  const { data: retourData } = useWeeklyCoachRetour(athleteId, weekStartStr);
  const upsertRetour = useUpsertWeeklyRetour();
  const [retourDraft, setRetourDraft] = useState("");
  const retourSynced = useRef(false);

  // Sync draft with DB data
  useEffect(() => {
    if (retourData !== undefined && !retourSynced.current) {
      setRetourDraft(retourData?.comment ?? "");
      retourSynced.current = true;
    }
  }, [retourData]);

  // Reset sync flag on week change
  useEffect(() => {
    retourSynced.current = false;
    setRetourDraft("");
  }, [weekStartStr]);

  const isLoading = viewMode === "month" ? monthLoading : weekLoading;
  if (isLoading) return <PageSkeleton />;

  // ── Labels ────────────────────────────────────────────────────────────────
  const monthLabel = format(selectedMonth, "MMMM yyyy", { locale: fr });
  const monthTitle = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const weekLabel = `${format(selectedWeek, "d MMM", { locale: fr })} → ${format(addWeeks(selectedWeek, 1), "d MMM yyyy", { locale: fr })}`;

  const periodLabel = viewMode === "month" ? monthTitle : weekLabel;

  // ── KPI source ────────────────────────────────────────────────────────────
  const kpiData = viewMode === "month" ? monthData : null;
  const weekCurrent = weekData?.current_week;

  const weekDone  = weekCurrent ? weekCurrent.workouts.filter(w => w.status === "completed").length + weekCurrent.energy_sessions.filter(e => e.completed || e.partial).length : 0;
  const weekTotal = weekCurrent ? weekCurrent.workouts.length + weekCurrent.energy_sessions.length : 0;

  const completionRate = kpiData && kpiData.workouts_total > 0
    ? Math.round((kpiData.workouts_completed / kpiData.workouts_total) * 100)
    : weekCurrent
      ? weekTotal > 0
        ? Math.round(weekDone / weekTotal * 100)
        : null
      : null;

  const avgWellness = kpiData?.avg_wellness ?? weekCurrent?.avg_wellness ?? null;

  function calcAvgRpe(workouts: { rpe_score: number | null }[], energySessions: { completed: boolean; rpe_score: number | null }[]): string | undefined {
    const vals = [
      ...workouts.filter(w => (w as { status?: string }).status === "completed").map(w => w.rpe_score),
      ...energySessions.filter(e => e.completed).map(e => e.rpe_score),
    ].filter((v): v is number => v != null);
    if (!vals.length) return undefined;
    return `RPE ${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)}/10`;
  }

  const avgRpeSubtitle = kpiData
    ? calcAvgRpe(kpiData.workouts, kpiData.energy_sessions)
    : weekCurrent
      ? calcAvgRpe(weekCurrent.workouts, weekCurrent.energy_sessions)
      : undefined;

  const workoutsVal = kpiData
    ? `${kpiData.workouts_completed}/${kpiData.workouts_total}`
    : weekCurrent
      ? `${weekDone}/${weekTotal}`
      : null;

  const testsVal = kpiData?.tests_completed
    ?? (weekCurrent ? weekCurrent.test_sessions.filter(t => t.completed).length : null);

  const compsVal = kpiData?.competitions.length
    ?? (weekCurrent ? weekCurrent.competitions.length : null);

  const nutritionLogs     = kpiData ? (monthData?.nutrition_logs ?? []) : (weekCurrent?.nutrition_logs ?? []);
  const nutritionStrategy = kpiData ? (monthData?.nutrition_strategy ?? null) : (weekCurrent?.nutrition_strategy ?? null);
  const calLogs           = nutritionLogs.filter((l) => l.total_calories_consumed != null);
  const avgKcal           = calLogs.length > 0
    ? Math.round(calLogs.reduce((s, l) => s + l.total_calories_consumed!, 0) / calLogs.length)
    : null;

  return (
    <div style={{ padding: "16px 20px 80px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.tx, letterSpacing: "-0.3px" }}>Retours</div>
          <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>{periodLabel}</div>
        </div>

        {/* View toggle + nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Month/Week toggle */}
          <div style={{ display: "flex", background: C.s2, borderRadius: 4, padding: 2 }}>
            {(["week", "month"] as ViewMode[]).map((m) => (
              <button key={m} onClick={() => setViewMode(m)} style={{
                padding: "4px 10px", borderRadius: 6, border: "none",
                background: viewMode === m ? C.s1 : "transparent",
                color: viewMode === m ? C.tx : C.tx3,
                fontSize: 11, fontWeight: viewMode === m ? 700 : 500,
                cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
              }}>
                {m === "week" ? "Semaine" : "Mois"}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <button
            onClick={() => viewMode === "month"
              ? setSelectedMonth(m => subMonths(m, 1))
              : setSelectedWeek(w => subWeeks(w, 1))}
            style={navBtn}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => viewMode === "month"
              ? setSelectedMonth(startOfMonth(new Date()))
              : setSelectedWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            style={{ ...navBtn, padding: "5px 10px", fontSize: 11, fontWeight: 600 }}
          >
            Auj.
          </button>
          <button
            onClick={() => viewMode === "month"
              ? setSelectedMonth(m => addMonths(m, 1))
              : setSelectedWeek(w => addWeeks(w, 1))}
            style={navBtn}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 140px)", justifyContent: "center", gap: 10, marginBottom: 16 }}>
        {[
          { icon: <Heart size={14} style={{ color: "#66F03C" }} />,              title: "Wellness moyen", value: avgWellness, subtitle: "/100",                                                    onClick: () => setDetailView("wellness")     },
          { icon: <Dumbbell size={14} style={{ color: C.ac }} />,            title: "Séances",         value: workoutsVal, subtitle: completionRate != null ? `${completionRate}%` : undefined, subtitle2: avgRpeSubtitle, onClick: () => setDetailView("workouts") },
          { icon: <FlaskConical size={14} style={{ color: C.b }} />,         title: "Tests",           value: testsVal,    subtitle: undefined,                                                onClick: () => setDetailView("tests")        },
          { icon: <Trophy size={14} style={{ color: "#F5A623" }} />,         title: "Compétitions",    value: compsVal,    subtitle: undefined,                                                onClick: () => setDetailView("competitions") },
          { icon: <UtensilsCrossed size={14} style={{ color: "#F59E0B" }} />, title: "Nutrition",       value: avgKcal,     subtitle: avgKcal != null ? "kcal/j" : undefined,                  onClick: () => setDetailView("nutrition")    },
        ].map((kpi) => (
          <KPICard key={kpi.title} {...kpi} />
        ))}
      </div>

      {/* Main content */}
      {viewMode === "week" && weekCurrent && (
        <WeekView
          weekData={weekCurrent}
          prevWeekData={weekData?.previous_week}
        />
      )}

      {/* Coach retour */}
      {viewMode === "week" && (
        <div style={{ marginTop: 16, background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <MessageSquare size={14} color={C.ac} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>Retour coach</span>
            {retourData?.comment && retourDraft === retourData.comment && (
              <span style={{ fontSize: 9, color: C.g, fontWeight: 600 }}>Enregistré</span>
            )}
          </div>
          <textarea
            value={retourDraft}
            onChange={(e) => setRetourDraft(e.target.value)}
            placeholder="Écris ton retour sur la semaine ici… L'athlète le verra dans son onglet Aujourd'hui."
            rows={4}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 4,
              border: "1px solid " + C.brdL, background: C.s2,
              color: C.tx, fontSize: 13, fontFamily: "inherit",
              resize: "vertical", outline: "none", boxSizing: "border-box",
              lineHeight: 1.5,
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button
              onClick={() => {
                if (!athleteId || !user?.id) return;
                upsertRetour.mutate({
                  athleteId,
                  coachId: user.id,
                  weekStart: weekStartStr,
                  comment: retourDraft.trim(),
                });
              }}
              disabled={upsertRetour.isPending || retourDraft.trim() === (retourData?.comment ?? "")}
              style={{
                padding: "8px 20px", borderRadius: 4,
                border: "none",
                background: retourDraft.trim() !== (retourData?.comment ?? "") ? C.ac : C.s2,
                color: retourDraft.trim() !== (retourData?.comment ?? "") ? "#0E0C0A" : C.tx3,
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit", opacity: upsertRetour.isPending ? 0.6 : 1,
              }}
            >
              {upsertRetour.isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      )}

      {viewMode === "month" && monthData && (
        <MonthCalendarView
          month={selectedMonth}
          dailyData={monthData.daily_data}
          workouts={monthData.workouts}
          energySessions={monthData.energy_sessions}
          energyByDate={Object.fromEntries(
            monthData.energy_sessions.reduce((acc, e) => {
              acc.set(e.date, (acc.get(e.date) ?? 0) + 1);
              return acc;
            }, new Map<string, number>())
          )}
          freeActivities={monthData.free_activities ?? []}
        />
      )}

      {/* Detail overlays */}
      {detailView === "wellness" && (
        <WellnessDetailView
          dailyData={
            viewMode === "month" && monthData
              ? monthData.daily_data
              : weekCurrent
                ? Object.fromEntries(
                    Object.entries(weekCurrent.daily_wellness).map(([d, w]) => [d, {
                      date: d,
                      wellness: w,
                      workouts_completed: weekCurrent.workouts.filter(wk => wk.scheduled_date === d && wk.status === "completed").length,
                      has_competition: false,
                      has_test: false,
                    }])
                  )
                : {}
          }
          avgWellness={avgWellness}
          sleepGoals={{
            bedtime:        goals.sleepBedtime,
            wakeup:         goals.sleepWakeup,
            durationTarget: goals.sleepTarget,
          }}
          onClose={() => setDetailView(null)}
        />
      )}
      {detailView === "workouts" && (
        <WorkoutsDetailView
          workouts={
            viewMode === "month"
              ? (monthData?.workouts ?? [])
              : (weekCurrent?.workouts.map(w => ({
                  ...w,
                  session_type: "muscu" as const,
                })) ?? [])
          }
          energySessions={
            viewMode === "month"
              ? (monthData?.energy_sessions ?? [])
              : (weekCurrent?.energy_sessions ?? [])
          }
          onClose={() => setDetailView(null)}
        />
      )}
      {detailView === "tests" && (
        <TestsDetailView
          tests={
            viewMode === "month"
              ? (monthData?.test_sessions ?? [])
              : (weekCurrent?.test_sessions ?? [])
          }
          onClose={() => setDetailView(null)}
        />
      )}
      {detailView === "competitions" && (
        <CompetitionsDetailView
          competitions={
            viewMode === "month"
              ? (monthData?.competitions ?? [])
              : (weekCurrent?.competitions ?? [])
          }
          onClose={() => setDetailView(null)}
        />
      )}
      {detailView === "nutrition" && (
        <NutritionDetailView
          logs={nutritionLogs}
          strategy={nutritionStrategy}
          onClose={() => setDetailView(null)}
        />
      )}

      {/* ── Modifications planning athlète ── */}
      {modifications.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            Modifications planning athlète
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
              background: "rgba(245,158,11,0.12)", color: "#F59E0B",
              border: "1px solid rgba(245,158,11,0.3)",
            }}>
              {modifications.length}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {modifications.map((mod) => {
              const isAlert   = mod.coachAlert;
              const hasBonus  = mod.athleteModifications !== null;
              const dateLabel = new Date(mod.scheduledDate + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
              const origLabel = mod.rescheduledByAthlete && mod.originalScheduledDate !== mod.scheduledDate
                ? new Date(mod.originalScheduledDate + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
                : null;
              const bonusSetsCount = mod.athleteModifications?.bonusSets?.reduce((n, b) => n + b.sets.length, 0) ?? 0;
              const customExCount  = mod.athleteModifications?.customExercises?.length ?? 0;

              return (
                <div
                  key={mod.id}
                  style={{
                    background: C.s1, borderRadius: 6, padding: "12px 14px",
                    border: "1px solid " + (isAlert ? "rgba(245,158,11,0.4)" : C.brd),
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{mod.sessionName}</div>
                      <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
                        {dateLabel}
                        {origLabel && <span style={{ color: "#F59E0B" }}> · Décalée du {origLabel}</span>}
                      </div>
                      {mod.rescheduleReason && (
                        <div style={{ fontSize: 11, color: C.tx3, marginTop: 4, fontStyle: "italic" }}>
                          « {mod.rescheduleReason} »
                        </div>
                      )}
                      {hasBonus && (
                        <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {bonusSetsCount > 0 && (
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "rgba(245,158,11,0.1)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.25)" }}>
                              +{bonusSetsCount} série{bonusSetsCount > 1 ? "s" : ""} bonus
                            </span>
                          )}
                          {customExCount > 0 && (
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "rgba(59,141,240,0.1)", color: "#33B5FF", border: "1px solid rgba(59,141,240,0.25)" }}>
                              +{customExCount} exercice{customExCount > 1 ? "s" : ""} ajouté{customExCount > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                      {isAlert && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.4)" }}>
                          À vérifier
                        </span>
                      )}
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                        background: mod.status === "completed" ? C.gS : mod.status === "missed" ? "rgba(239,75,75,0.12)" : C.s2,
                        color: mod.status === "completed" ? C.g : mod.status === "missed" ? C.r : C.tx3,
                      }}>
                        {mod.status === "completed" ? "✓ Complétée" : mod.status === "missed" ? "Manquée" : mod.status === "in_progress" ? "En cours" : "Planifiée"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Séries par muscle par semaine ── */}
      <div style={{ marginTop: 24 }}>
        <MuscleVolumeCard exos={exos} exMeta={exMeta} sets={sets} sessions={sessions} weeksArr={weeksArr} tw={tw} initialWeek={currentWeek} />
      </div>

      {/* ── Blessures ── */}
      <div style={{ marginTop: 16 }}>
        {injuries.length > 0 ? (
          <div style={{ background: C.s1, borderRadius: 6, padding: 14, border: "1px solid " + C.r + "30" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.r, textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 10 }}>Blessures ({activeInjuries.length} active{activeInjuries.length > 1 ? "s" : ""})</div>
            {injuries.map(inj => {
              const sc = stC(inj.status);
              const zn = ALL_BZ.filter((z: { id: string; label: string }) => inj.zones.includes(z.id)).map((z: { label: string }) => z.label).join(", ") || "Zone non précisée";
              return (
                <div key={inj.id} style={{ padding: "8px 12px", borderRadius: 4, background: C.s2, border: "1px solid " + sc + "30", marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div><div style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{zn}</div><div style={{ fontSize: 10, color: C.tx3 }}>{inj.type || "Type non précisé"} - Intensité {inj.intensity}/10</div></div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: sc, padding: "2px 8px", borderRadius: 5, background: sc + "15" }}>{inj.status}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ background: C.s1, borderRadius: 6, padding: "14px", border: "1px solid " + C.g + "30", textAlign: "center" }}>
            <span style={{ fontSize: 12, color: C.g, fontWeight: 600 }}>Aucune blessure</span>
          </div>
        )}
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 28, height: 28, borderRadius: 4,
  border: "1px solid " + C.brd, background: C.s1,
  color: C.tx2, cursor: "pointer", fontFamily: "inherit",
};
