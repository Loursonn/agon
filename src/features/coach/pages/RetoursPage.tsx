import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import AthleteSantePage from "@/features/athlete/pages/AthleteSantePage";
import { DeclaredWellness } from "@/features/coach/components/sante/DeclaredWellness";
import { FeltMeasuredChart } from "@/features/coach/components/sante/FeltMeasuredChart";
import { SanteKicker } from "@/features/coach/components/sante/SanteParts";
import { FeltVsMeasured } from "@/features/coach/components/FeltVsMeasured";
import { CoachWellnessPanel } from "@/features/coach/components/retours/CoachWellnessPanel";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  addWeeks, subWeeks, startOfWeek, addDays,
} from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Heart, Dumbbell, FlaskConical, Trophy, UtensilsCrossed, MessageSquare, Footprints } from "lucide-react";
import { useRunningVolume } from "@/features/shared/hooks/useRunningVolume";
import { C, H, alpha } from "@/lib/theme";
import { DISPLAY, KICK, MONO, SectionHead } from "@/features/shared/components/ordi/OrdiUi";

const RETOURS_TITLE: React.CSSProperties = { margin: "0 0 12px", ...DISPLAY, fontWeight: 500, fontSize: 30, lineHeight: 1.1, letterSpacing: "0.06em", textTransform: "uppercase", color: C.tx };
import { MuscleVolumePanel } from "@/features/coach/components/programmation/MuscleVolumePanel";
import { useMuscleVolume } from "@/features/coach/components/programmation/hooks/useMuscleVolume";
import { localISO } from "@/lib/date";
import { PageSkeleton } from "@/features/shared/components/skeletons";
import { KPICard } from "@/features/coach/components/KPICard";
import { useMonthlyRetours } from "@/features/shared/hooks/useMonthlyRetours";
import { useWeeklyRetours } from "@/features/shared/hooks/useWeeklyRetours";
import { useAthleteModifications } from "@/features/shared/hooks/useAthleteModifications";
import { MonthCalendarView } from "../components/retours/MonthCalendarView";
import { WeekView } from "../components/retours/WeekView";
import { WellnessDetailView } from "../components/retours/WellnessDetailView";
import { WellnessLightBadge } from "@/features/shared/components/WellnessLightBadge";
import { useWellnessLight } from "@/features/shared/hooks/useWellnessLight";
import { WorkoutsDetailView } from "../components/retours/WorkoutsDetailView";
import { TestsDetailView } from "../components/retours/TestsDetailView";
import { CompetitionsDetailView } from "../components/retours/CompetitionsDetailView";
import { NutritionDetailView } from "../components/retours/NutritionDetailView";
import { useWeeklyCoachRetour, useUpsertWeeklyRetour, reactionEmoji } from "@/features/shared/hooks/useWeeklyCoachRetour";
import { useAuth } from "@/hooks/useAuth";
import { useMedicalEntries } from "@/features/shared/hooks/useMedicalEntries";
import { activeInjuries, fmtInjuryDate, injuryFacts, injurySummary } from "@/lib/injuryDetails";
import { DECLARED_BY_LABEL, MEDICAL_STATUS_LABEL } from "@/features/shared/types/medical";
import type { EnergySessionDetail } from "@/features/shared/types/retours.types";
import { watchOrigins } from "@/lib/watchRunLabel";

type ViewMode = "month" | "week";
type DetailView = "wellness" | "workouts" | "tests" | "competitions" | "nutrition" | null;

const DETAIL_VIEWS = ["wellness", "workouts", "tests", "competitions", "nutrition"] as const;

/** `?detail=wellness` ouvre directement le détail : utilisé par les alertes de l'accueil coach. */
function detailFromParam(raw: string | null): DetailView {
  return DETAIL_VIEWS.includes(raw as (typeof DETAIL_VIEWS)[number]) ? (raw as DetailView) : null;
}

/** Séries par muscle : 4 semaines avant → 3 après la semaine consultée, prévu et terminé. */
function RetoursMuscleVolume({ athleteId, weekStart }: { athleteId: string | undefined; weekStart: Date }) {
  const { weeks, byWeek, isLoading } = useMuscleVolume(
    athleteId,
    localISO(subWeeks(weekStart, 4)),
    localISO(addWeeks(weekStart, 3)),
  );
  return <MuscleVolumePanel weeks={weeks} byWeek={byWeek} isLoading={isLoading} showDone title="" />;
}

export default function RetoursPage() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { goals, freeSessions, athleteProfile } = useAthleteContext();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  // Planche CoachOrdiASante : « Wellness | Santé » (mesures de la montre).
  // « Retours | Wellness | Santé » : "wellness" garde la vue semaine / mois historique ; "bienetre" = Wellness P26.
  const [tab, setTab] = useState<"wellness" | "bienetre" | "sante">(() => {
    const v = searchParams.get("vue");
    return v === "sante" ? "sante" : v === "wellness" ? "bienetre" : "wellness";
  });
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));
  const [selectedWeek, setSelectedWeek]   = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [detailView, setDetailView]       = useState<DetailView>(() => detailFromParam(searchParams.get("detail")));

  /** Referme le détail et retire le paramètre d'URL, pour ne pas le réouvrir au retour. */
  const closeDetail = () => {
    setDetailView(null);
    if (searchParams.has("detail")) {
      const next = new URLSearchParams(searchParams);
      next.delete("detail");
      setSearchParams(next, { replace: true });
    }
  };

  // Blessures déclarées, en cours d'abord (l'ordre vient déjà de la requête).
  const { data: medicalEntries = [] } = useMedicalEntries(athleteId);
  const light = useWellnessLight(athleteId);
  const injuries = medicalEntries.filter((e) => e.kind === "blessure");
  const activeCount = activeInjuries(injuries).length;

  // ── Data ──────────────────────────────────────────────────────────────────
  const monthQ = useMonthlyRetours(athleteId!, selectedMonth);
  const weekQ = useWeeklyRetours(athleteId!, selectedWeek);
  const { data: monthDataRaw, isLoading: monthLoading } = monthQ;
  const { data: weekData,  isLoading: weekLoading  } = weekQ;
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
  // Km de course sur la période affichée (semaine ou mois) — hook avant tout return anticipé
  const periodStart = format(viewMode === "month" ? selectedMonth : selectedWeek, "yyyy-MM-dd");
  const periodEnd   = format(viewMode === "month" ? endOfMonth(selectedMonth) : addDays(selectedWeek, 6), "yyyy-MM-dd");
  // Même calcul que le volume du profil : saisie + montre, une sortie comptée une fois.
  const { runs, summaryBetween, matchByPlanned } = useRunningVolume(athleteId, freeSessions, periodStart);
  const { km: runKm, watchKm: runWatchKm } = summaryBetween(periodStart, periodEnd);
  // « Garmin [modèle] » : attribution exigée là où un total inclut des km Garmin.
  const runOrigins = watchOrigins(runs, periodStart, periodEnd);

  if (isLoading) return <PageSkeleton />;
  // Lecture en échec : le dire, plutôt qu'afficher une période vide trompeuse.
  const activeQ = viewMode === "month" ? monthQ : weekQ;
  if (activeQ.isError && !activeQ.data) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: C.tx2, fontSize: 14 }}>
        <p style={{ marginBottom: 12 }}>Les retours de cette période n'ont pas pu être chargés.</p>
        <button
          onClick={() => void activeQ.refetch()}
          style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent", color: C.tx, cursor: "pointer", fontFamily: "inherit" }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  /** Pose sur chaque séance prévue la sortie de montre qui s'y rattache (affichage seul). */
  const withWatch = (list: EnergySessionDetail[]): EnergySessionDetail[] =>
    list.map((e) => ({ ...e, watch_run: matchByPlanned.get(e.id) ?? null }));
  const weekCurrentRaw = weekData?.current_week;
  const weekCurrent = weekCurrentRaw
    ? { ...weekCurrentRaw, energy_sessions: withWatch(weekCurrentRaw.energy_sessions) }
    : weekCurrentRaw;
  const monthData = monthDataRaw
    ? { ...monthDataRaw, energy_sessions: withWatch(monthDataRaw.energy_sessions) }
    : monthDataRaw;

  // ── Labels ────────────────────────────────────────────────────────────────
  const monthLabel = format(selectedMonth, "MMMM yyyy", { locale: fr });
  const monthTitle = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const weekLabel = `${format(selectedWeek, "d MMM", { locale: fr })} → ${format(addWeeks(selectedWeek, 1), "d MMM yyyy", { locale: fr })}`;

  const periodLabel = viewMode === "month" ? monthTitle : weekLabel;

  // ── KPI source ────────────────────────────────────────────────────────────
  const kpiData = viewMode === "month" ? monthData : null;

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
  const bmr               = (athleteProfile as { base_metabolism?: number | null } | null)?.base_metabolism ?? null;
  const calLogs           = nutritionLogs.filter((l) => l.total_calories_consumed != null);

  // Réponse « blessé / malade » du wellness sur la période affichée.
  const injuryDays = (viewMode === "month" && monthData
    ? Object.entries(monthData.daily_data).map(([d, x]) => [d, x.wellness?.injuryNote ?? null] as const)
    : Object.entries(weekCurrent?.daily_wellness ?? {}).map(([d, w]) => [d, w?.injuryNote ?? null] as const)
  )
    .filter((e): e is readonly [string, string] => !!e[1])
    .sort(([a], [b]) => a.localeCompare(b));
  const avgKcal           = calLogs.length > 0
    ? Math.round(calLogs.reduce((s, l) => s + l.total_calories_consumed!, 0) / calLogs.length)
    : null;

  const firstName = ((athleteProfile as { full_name?: string | null } | null)?.full_name ?? "").trim().split(/\s+/)[0] || "L’athlète";
  const tabSwitch = (
    <div role="tablist" style={{ display: "flex", background: C.s2, borderRadius: 8, padding: 2, alignSelf: "flex-start", marginBottom: 16 }}>
      {(["wellness", "bienetre", "sante"] as const).map((k) => (
        <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{
          padding: "5px 14px", borderRadius: 6, border: "none", background: tab === k ? C.s1 : "transparent",
          color: tab === k ? C.tx : C.tx3, fontSize: 12, fontWeight: tab === k ? 600 : 500, cursor: "pointer", fontFamily: "inherit",
        }}>
          {k === "wellness" ? "Retours" : k === "bienetre" ? "Wellness" : "Santé"}
        </button>
      ))}
    </div>
  );

  if (tab === "bienetre" && athleteId) {
    return (
      <div style={{ padding: "16px 20px 80px", display: "flex", flexDirection: "column" }}>
        <h1 style={RETOURS_TITLE}>Retours</h1>
        {tabSwitch}
        <CoachWellnessPanel athleteId={athleteId} firstName={firstName} />
      </div>
    );
  }

  if (tab === "sante" && athleteId) {
    return (
      <div style={{ padding: "16px 20px 80px", display: "flex", flexDirection: "column" }}>
        <h1 style={RETOURS_TITLE}>Retours</h1>
        {tabSwitch}
        <AthleteSantePage
          coachView={{ firstName }}
          top={
            <section style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
              <SanteKicker n={1}>Ressenti / mesuré · ce matin</SanteKicker>
              <div style={{ fontSize: 12.5, color: C.tx3 }}>Ce que {firstName} déclare face à ce que mesure sa montre.</div>
              <FeltVsMeasured athleteId={athleteId} firstName={firstName} />
              <SanteKicker n={2} style={{ marginTop: 14 }}>Mesures de la montre</SanteKicker>
            </section>
          }
          bottom={
            <>
              <DeclaredWellness athleteId={athleteId} firstName={firstName} n={3} onOpenWellness={() => setTab("bienetre")} />
              <FeltMeasuredChart athleteId={athleteId} n={4} />
            </>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 20px 80px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ ...RETOURS_TITLE, marginBottom: 6 }}>Retours</h1>
          <div style={{ ...KICK, color: C.ac }}>{periodLabel}</div>
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

      {tabSwitch}

      {/* Feu du matin calculé (règles du 07/11) */}
      <div style={{ marginBottom: 16 }}>
        <WellnessLightBadge result={light.data} loading={light.isLoading} detail />
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
        {[
          { icon: <Heart size={14} />,           accent: C.g,     title: "Wellness moyen", value: avgWellness, subtitle: "/100",                                                    onClick: () => setDetailView("wellness")     },
          { icon: <Dumbbell size={14} />,        accent: C.ac,    title: "Séances",         value: workoutsVal, subtitle: completionRate != null ? `${completionRate} %` : undefined, subtitle2: avgRpeSubtitle, onClick: () => setDetailView("workouts") },
          { icon: <FlaskConical size={14} />,    accent: C.ame,   title: "Tests",           value: testsVal,    subtitle: undefined,                                                onClick: () => setDetailView("tests")        },
          { icon: <Footprints size={14} />,      accent: C.b,     title: "Course à pied",   value: runKm.toLocaleString("fr-FR", { maximumFractionDigits: 1 }), subtitle: "km", subtitle2: runWatchKm > 0 ? `dont ${runWatchKm.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${runOrigins.length ? runOrigins.join(", ") : "montre"}` : undefined },
          { icon: <Trophy size={14} />,          accent: C.rouge, title: "Compétitions",    value: compsVal,    subtitle: undefined,                                                onClick: () => setDetailView("competitions") },
          { icon: <UtensilsCrossed size={14} />, accent: C.r,     title: "Nutrition",       value: avgKcal,     subtitle: avgKcal != null ? "kcal/j" : undefined,                  onClick: () => setDetailView("nutrition")    },
        ].map((kpi) => (
          <KPICard key={kpi.title} {...kpi} />
        ))}
      </div>

      {injuryDays.length > 0 && (
        <div role="alert" style={{
          marginBottom: 16, padding: "10px 14px", borderRadius: 8,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: H.rougeVif, marginBottom: 6 }}>
            Blessé / malade signalé dans le wellness
          </div>
          {injuryDays.map(([d, note]) => (
            <div key={d} style={{ fontSize: 12, color: C.tx, lineHeight: 1.5 }}>
              <span style={{ color: C.tx3, marginRight: 8 }}>
                {format(new Date(d + "T12:00:00"), "EEE d MMM", { locale: fr })}
              </span>
              {note}
            </div>
          ))}
        </div>
      )}

      {/* Main content */}
      {viewMode === "week" && weekCurrent && (
        <WeekView
          weekData={weekCurrent}
          prevWeekData={weekData?.previous_week}
          athleteId={athleteId}
        />
      )}

      {/* Coach retour */}
      {viewMode === "week" && (
        <div style={{ position: "relative", overflow: "hidden", marginTop: 16, background: C.s1, borderRadius: 14, border: `1px solid ${alpha(C.ac, 0.4)}`, padding: "18px 20px 18px 23px" }}>
          <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: C.ac }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <MessageSquare size={14} color={C.ac} />
            <span style={{ ...DISPLAY, fontSize: 14, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: C.tx }}>Retour coach</span>
            {retourData?.comment && retourDraft === retourData.comment && (
              <span style={{ ...MONO, fontSize: 10.5, fontWeight: 500, letterSpacing: "0.10em", textTransform: "uppercase", color: C.ink, background: C.g, borderRadius: 999, padding: "3px 9px" }}>Enregistré</span>
            )}
            {retourData?.comment && (
              <span style={{ marginLeft: "auto", fontSize: 11, color: C.tx3, display: "flex", alignItems: "center", gap: 5 }}>
                {retourData.athlete_reaction ? (
                  <>
                    Vu par l'athlète
                    <span style={{ fontSize: 14 }}>{reactionEmoji(retourData.athlete_reaction)}</span>
                    {retourData.reacted_at && new Date(retourData.reacted_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  </>
                ) : "Pas encore vu"}
              </span>
            )}
          </div>
          <textarea
            value={retourDraft}
            onChange={(e) => setRetourDraft(e.target.value)}
            placeholder="Écris ton retour sur la semaine ici… L'athlète le verra sur son accueil jusqu'à ce qu'il réagisse."
            rows={4}
            style={{
              width: "100%", minHeight: 84, padding: "14px 16px", borderRadius: 10,
              border: "1px solid " + C.brdL, background: C.bg,
              color: C.tx, fontSize: 14, fontFamily: "inherit",
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
                height: 38, padding: "0 20px", borderRadius: 10,
                border: "none",
                background: retourDraft.trim() !== (retourData?.comment ?? "") ? C.ac : C.s2,
                color: retourDraft.trim() !== (retourData?.comment ?? "") ? C.ink : C.tx3,
                fontSize: 14, fontWeight: 600, cursor: "pointer",
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
          athleteId={athleteId}
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
          onClose={closeDetail}
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
          onClose={closeDetail}
        />
      )}
      {detailView === "tests" && (
        <TestsDetailView
          tests={
            viewMode === "month"
              ? (monthData?.test_sessions ?? [])
              : (weekCurrent?.test_sessions ?? [])
          }
          onClose={closeDetail}
        />
      )}
      {detailView === "competitions" && (
        <CompetitionsDetailView
          competitions={
            viewMode === "month"
              ? (monthData?.competitions ?? [])
              : (weekCurrent?.competitions ?? [])
          }
          onClose={closeDetail}
        />
      )}
      {detailView === "nutrition" && (
        <NutritionDetailView
          logs={nutritionLogs}
          strategy={nutritionStrategy}
          bmr={bmr}
          onClose={closeDetail}
        />
      )}

      {/* ── Modifications planning athlète ── */}
      {modifications.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ marginBottom: 12 }}>
            <SectionHead
              n={1}
              title="Modifications planning athlète"
              right={<span style={{ ...MONO, fontSize: 10.5, padding: "2px 9px", borderRadius: 999, background: C.o, color: C.ink }}>{modifications.length}</span>}
            />
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
                        {origLabel && <span style={{ color: H.ambre }}> · Décalée du {origLabel}</span>}
                      </div>
                      {mod.rescheduleReason && (
                        <div style={{ fontSize: 11, color: C.tx3, marginTop: 4, fontStyle: "italic" }}>
                          « {mod.rescheduleReason} »
                        </div>
                      )}
                      {hasBonus && (
                        <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {bonusSetsCount > 0 && (
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "rgba(245,158,11,0.1)", color: H.ambre, border: "1px solid rgba(245,158,11,0.25)" }}>
                              +{bonusSetsCount} série{bonusSetsCount > 1 ? "s" : ""} bonus
                            </span>
                          )}
                          {customExCount > 0 && (
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "rgba(59,141,240,0.1)", color: C.b, border: "1px solid rgba(59,141,240,0.25)" }}>
                              +{customExCount} exercice{customExCount > 1 ? "s" : ""} ajouté{customExCount > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                      {isAlert && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: "rgba(245,158,11,0.15)", color: H.ambre, border: "1px solid rgba(245,158,11,0.4)" }}>
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
      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHead n={modifications.length > 0 ? 2 : 1} title="Séries par muscle et par semaine" />
        <RetoursMuscleVolume athleteId={athleteId} weekStart={selectedWeek} />
      </div>

      {/* ── Blessures ── */}
      {/* Lues dans `medical_entries` : ce que le coach voit ici est exactement ce
          que l'athlète a déclaré, détail compris. */}
      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHead n={modifications.length > 0 ? 3 : 2} title="Blessures" />
        {injuries.length > 0 ? (
          <div style={{ background: C.s1, borderRadius: 6, padding: 14, border: "1px solid " + C.r + "30" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.r, textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 10 }}>
              Blessures ({activeCount} active{activeCount > 1 ? "s" : ""})
            </div>
            {injuries.map(inj => {
              const ongoing = inj.status === "en_cours";
              const sc = ongoing ? C.r : C.g;
              return (
                <div key={inj.id} style={{ padding: "8px 12px", borderRadius: 4, background: C.s2, border: "1px solid " + sc + "30", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{inj.title}</div>
                      <div style={{ fontSize: 10, color: C.tx3 }}>
                        {[injurySummary(inj), fmtInjuryDate(inj.date), inj.declared_by ? DECLARED_BY_LABEL[inj.declared_by] : null]
                          .filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: sc, padding: "2px 8px", borderRadius: 5, background: sc + "15", flexShrink: 0 }}>
                      {MEDICAL_STATUS_LABEL[inj.status]}
                    </span>
                  </div>
                  {injuryFacts(inj).length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {injuryFacts(inj).map(({ l, v }) => (
                        <span key={l} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: C.s1, border: "1px solid " + C.brd, color: C.tx2 }}>
                          {l} : {v}
                        </span>
                      ))}
                    </div>
                  )}
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
