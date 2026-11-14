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
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { SectionHead } from "@/features/shared/components/ordi/OrdiUi";

const RETOURS_TITLE = "agon-display m-0 mb-3 text-[30px] font-medium tracking-[0.06em] text-agon-tx leading-[1.1]";
const KICK = "agon-mono whitespace-nowrap text-[11px] uppercase tracking-[0.14em]";
const NAV_BTN = "flex size-7 cursor-pointer items-center justify-center rounded-[4px] border border-agon-brd bg-agon-s1 text-agon-tx2";
const PAGE = "px-4 pb-20 pt-4 md:px-5";
/** Statut d'une séance modifiée par l'athlète. */
const MOD_STATUS_TONE: Record<string, string> = {
  completed: "bg-agon-succes-doux text-agon-succes",
  missed: "bg-agon-erreur/[0.12] text-agon-erreur",
};
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
      <div className="p-8 text-center text-[14px] text-agon-tx2">
        <p className="mb-3">Les retours de cette période n'ont pas pu être chargés.</p>
        <button
          onClick={() => void activeQ.refetch()}
          className="cursor-pointer rounded-[6px] border border-agon-brd-l bg-transparent px-4 py-2 text-agon-tx"
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
    <div role="tablist" className="mb-4 flex self-start rounded-[8px] bg-agon-s2 p-0.5">
      {(["wellness", "bienetre", "sante"] as const).map((k) => (
        <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn(
          "cursor-pointer rounded-[6px] border-none px-3.5 py-[5px] text-[12px]",
          tab === k ? "bg-agon-s1 font-semibold text-agon-tx" : "bg-transparent font-medium text-agon-tx3",
        )}>
          {k === "wellness" ? "Retours" : k === "bienetre" ? "Wellness" : "Santé"}
        </button>
      ))}
    </div>
  );

  if (tab === "bienetre" && athleteId) {
    return (
      <div className={cn(PAGE, "flex flex-col")}>
        <h1 className={RETOURS_TITLE}>Retours</h1>
        {tabSwitch}
        <CoachWellnessPanel athleteId={athleteId} firstName={firstName} />
      </div>
    );
  }

  if (tab === "sante" && athleteId) {
    return (
      <div className={cn(PAGE, "flex flex-col")}>
        <h1 className={RETOURS_TITLE}>Retours</h1>
        {tabSwitch}
        <AthleteSantePage
          coachView={{ firstName }}
          top={
            <section className="mb-3 flex flex-col gap-2.5">
              <SanteKicker n={1}>Ressenti / mesuré · ce matin</SanteKicker>
              <div className="text-[12.5px] text-agon-tx3">Ce que {firstName} déclare face à ce que mesure sa montre.</div>
              <FeltVsMeasured athleteId={athleteId} firstName={firstName} />
            </section>
          }
          montreTitle={<SanteKicker n={2} style={{ marginTop: 14 }}>Mesures de la montre</SanteKicker>}
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
    <div className={PAGE}>

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={cn(RETOURS_TITLE, "mb-1.5")}>Retours</h1>
          <div className={cn(KICK, "text-agon-accent")}>{periodLabel}</div>
        </div>

        {/* View toggle + nav */}
        <div className="flex items-center gap-2">
          {/* Month/Week toggle */}
          <div className="flex rounded-[4px] bg-agon-s2 p-0.5">
            {(["week", "month"] as ViewMode[]).map((m) => (
              <button key={m} onClick={() => setViewMode(m)} className={cn(
                "cursor-pointer rounded-[6px] border-none px-2.5 py-1 text-[11px] [transition:all_120ms]",
                viewMode === m ? "bg-agon-s1 font-bold text-agon-tx" : "bg-transparent font-medium text-agon-tx3",
              )}>
                {m === "week" ? "Semaine" : "Mois"}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <button
            onClick={() => viewMode === "month"
              ? setSelectedMonth(m => subMonths(m, 1))
              : setSelectedWeek(w => subWeeks(w, 1))}
            className={NAV_BTN}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => viewMode === "month"
              ? setSelectedMonth(startOfMonth(new Date()))
              : setSelectedWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className={cn(NAV_BTN, "px-2.5 py-[5px] text-[11px] font-semibold")}
          >
            Auj.
          </button>
          <button
            onClick={() => viewMode === "month"
              ? setSelectedMonth(m => addMonths(m, 1))
              : setSelectedWeek(w => addWeeks(w, 1))}
            className={NAV_BTN}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {tabSwitch}

      {/* Feu du matin calculé (règles du 07/11) */}
      <div className="mb-4">
        <WellnessLightBadge result={light.data} loading={light.isLoading} detail />
      </div>

      {/* KPI cards */}
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
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
        <div role="alert" className="mb-4 rounded-[8px] border border-agon-erreur/30 bg-agon-erreur/[0.08] px-3.5 py-2.5">
          <div className="mb-1.5 text-[12px] font-bold text-agon-erreur">
            Blessé / malade signalé dans le wellness
          </div>
          {injuryDays.map(([d, note]) => (
            <div key={d} className="text-[12px] text-agon-tx leading-normal">
              <span className="mr-2 text-agon-tx3">
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
        <div className="relative mt-4 overflow-hidden rounded-[14px] border border-agon-accent/40 bg-agon-s1 py-[18px] pl-[23px] pr-5">
          <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-agon-accent" />
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <MessageSquare size={14} color={C.ac} />
            <span className="agon-display text-[14px] font-medium tracking-[0.08em] text-agon-tx">Retour coach</span>
            {retourData?.comment && retourDraft === retourData.comment && (
              <span className="agon-mono rounded-full bg-agon-succes px-[9px] py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-agon-ink">Enregistré</span>
            )}
            {retourData?.comment && (
              <span className="ml-auto flex items-center gap-[5px] text-[11px] text-agon-tx3">
                {retourData.athlete_reaction ? (
                  <>
                    Vu par l'athlète
                    <span className="text-[14px]">{reactionEmoji(retourData.athlete_reaction)}</span>
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
            className="box-border min-h-[84px] w-full resize-y rounded-[10px] border border-agon-brd-l bg-agon-bg px-4 py-3.5 text-[14px] text-agon-tx outline-none leading-normal"
          />
          <div className="mt-2 flex justify-end">
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
              className={cn(
                "h-[38px] cursor-pointer rounded-[10px] border-none px-5 text-[14px] font-semibold",
                retourDraft.trim() !== (retourData?.comment ?? "") ? "bg-agon-accent text-agon-ink" : "bg-agon-s2 text-agon-tx3",
                upsertRetour.isPending && "opacity-60",
              )}
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
        <div className="mt-6">
          <div className="mb-3">
            <SectionHead
              n={1}
              title="Modifications planning athlète"
              right={<span className="agon-mono rounded-full bg-agon-alerte px-[9px] py-0.5 text-[11px] text-agon-ink">{modifications.length}</span>}
            />
          </div>
          <div className="flex flex-col gap-2">
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
                  className={cn("rounded-[6px] border bg-agon-s1 px-3.5 py-3", isAlert ? "border-agon-alerte/40" : "border-agon-brd")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-agon-tx">{mod.sessionName}</div>
                      <div className="mt-0.5 text-[11px] text-agon-tx3">
                        {dateLabel}
                        {origLabel && <span className="text-agon-alerte"> · Décalée du {origLabel}</span>}
                      </div>
                      {mod.rescheduleReason && (
                        <div className="mt-1 text-[11px] italic text-agon-tx3">
                          « {mod.rescheduleReason} »
                        </div>
                      )}
                      {hasBonus && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {bonusSetsCount > 0 && (
                            <span className="rounded-[6px] border border-agon-alerte/25 bg-agon-alerte/10 px-2 py-0.5 text-[10px] text-agon-alerte">
                              +{bonusSetsCount} série{bonusSetsCount > 1 ? "s" : ""} bonus
                            </span>
                          )}
                          {customExCount > 0 && (
                            <span className="rounded-[6px] border border-agon-info/25 bg-agon-info/10 px-2 py-0.5 text-[10px] text-agon-info">
                              +{customExCount} exercice{customExCount > 1 ? "s" : ""} ajouté{customExCount > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-none flex-col items-end gap-1">
                      {isAlert && (
                        <span className="rounded-[6px] border border-agon-alerte/40 bg-agon-alerte/15 px-[7px] py-0.5 text-[9px] font-bold text-agon-alerte">
                          À vérifier
                        </span>
                      )}
                      <span className={cn("rounded-[6px] px-[7px] py-0.5 text-[9px] font-bold", MOD_STATUS_TONE[mod.status] ?? "bg-agon-s2 text-agon-tx3")}>
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
      <div className="mt-6 flex flex-col gap-3">
        <SectionHead n={modifications.length > 0 ? 2 : 1} title="Séries par muscle et par semaine" />
        <RetoursMuscleVolume athleteId={athleteId} weekStart={selectedWeek} />
      </div>

      {/* ── Blessures ── */}
      {/* Lues dans `medical_entries` : ce que le coach voit ici est exactement ce
          que l'athlète a déclaré, détail compris. */}
      <div className="mt-6 flex flex-col gap-3">
        <SectionHead n={modifications.length > 0 ? 3 : 2} title="Blessures" />
        {injuries.length > 0 ? (
          <div className="rounded-[6px] border border-agon-erreur/[0.188] bg-agon-s1 p-3.5">
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-agon-erreur">
              Blessures ({activeCount} active{activeCount > 1 ? "s" : ""})
            </div>
            {injuries.map(inj => {
              const ongoing = inj.status === "en_cours";
              return (
                <div key={inj.id} className={cn("mb-1 rounded-[4px] border bg-agon-s2 px-3 py-2", ongoing ? "border-agon-erreur/[0.188]" : "border-agon-succes/[0.188]")}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-agon-tx">{inj.title}</div>
                      <div className="text-[10px] text-agon-tx3">
                        {[injurySummary(inj), fmtInjuryDate(inj.date), inj.declared_by ? DECLARED_BY_LABEL[inj.declared_by] : null]
                          .filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <span className={cn(
                      "flex-none rounded-[5px] px-2 py-0.5 text-[10px] font-bold",
                      ongoing ? "bg-agon-erreur/[0.082] text-agon-erreur" : "bg-agon-succes/[0.082] text-agon-succes",
                    )}>
                      {MEDICAL_STATUS_LABEL[inj.status]}
                    </span>
                  </div>
                  {injuryFacts(inj).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {injuryFacts(inj).map(({ l, v }) => (
                        <span key={l} className="rounded-[4px] border border-agon-brd bg-agon-s1 px-[7px] py-0.5 text-[9px] text-agon-tx2">
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
          <div className="rounded-[6px] border border-agon-succes/[0.188] bg-agon-s1 p-3.5 text-center">
            <span className="text-[12px] font-semibold text-agon-succes">Aucune blessure</span>
          </div>
        )}
      </div>
    </div>
  );
}
