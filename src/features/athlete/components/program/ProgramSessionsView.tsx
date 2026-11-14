import { ActivePlanCard } from "@/features/athlete/components/program/ActivePlanCard";
import { C } from "@/lib/theme";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { CompetitionFormModal } from "@/features/coach/components/planning/CompetitionFormModal";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import { DayRow } from "@/features/athlete/components/program/DayRow";
import { EmptyState } from "@/features/shared/components/EmptyState";
import { EnergyPreviewOverlay } from "@/features/athlete/components/program/EnergyPreviewOverlay";
import { FreeActivityModal } from "@/features/athlete/components/FreeActivityModal";
import type { FreeSession } from "@/features/shared/types/athlete";
import { PastCycleCard } from "@/features/athlete/components/program/PastCycleCard";
import { ProgramHeader } from "@/features/athlete/components/program/ProgramHeader";
import { ProgramSkeleton } from "@/features/athlete/components/program/ProgramSkeleton";
import { RescheduleSheet } from "@/features/athlete/components/program/RescheduleSheet";
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/peps";
import { TestEntryPage } from "@/features/athlete/components/TestEntryPage";
import { WEEK_NAV_BTN } from "@/features/athlete/components/program/programConstants";
import { type WeekSession, useActivePlan } from "@/features/shared/hooks/useActivePlan";
import { WorkoutPreviewDrawer } from "@/features/athlete/components/program/WorkoutPreviewDrawer";
import { cn } from "@/lib/utils";
import { groupScheduleByDate, useDocSchedule } from "@/features/shared/hooks/fiches/useDocSchedule";
import { haptic, isMissedWeekSession, localMonday, weekLabel, weekRangeLabel } from "@/features/athlete/components/program/programUtils";
import { indexDayThemesByDate } from "@/lib/dayTheme";
import { invalidateEnergy, moveEnergyAssignment, reopenEnergyAssignment, restEnergyAssignment } from "@/api/energy";
import { invalidateSessionStatus } from "@/features/shared/hooks/invalidateSessionStatus";
import { invalidateWorkouts, restWorkoutByAthlete } from "@/api/workouts";
import { toast } from "sonner";
import { useAthleteCoaches } from "@/features/shared/hooks/useCoCoach";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useCompleteEnergyAssignment } from "@/features/shared/hooks/useEnergyAssignments";
import { useDayThemesRange } from "@/features/shared/hooks/useDayThemes";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { usePlannedVsDone } from "@/features/shared/hooks/usePlannedVsDone";
import { useRescheduleWorkout } from "@/features/shared/hooks/useRescheduleWorkout";

export function ProgramSessionsView() {
  const isDesktop = useIsDesktop();
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const { athleteId, viewOnly, freeSessions, setFreeSessions, athleteProfile } = useAthleteContext();
  const { data: athleteCoaches } = useAthleteCoaches(athleteId);
  const myCoachId = athleteProfile?.coach_id ?? null;
  const [weekOffset, setWeekOffset] = useState(0);
  const { data, isLoading, isPlaceholderData } = useActivePlan(athleteId ?? "", weekOffset);

  const [workoutPreview,   setWorkoutPreview]   = useState<WeekSession | null>(null);
  const [energyPreview,    setEnergyPreview]    = useState<{ sessionId: string; assignmentId: string; status: string; scheduledDate: string } | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<WeekSession | null>(null);
  const [testPreviewId,    setTestPreviewId]    = useState<string | null>(null);
  const [activityDate,     setActivityDate]     = useState<string | null>(null);
  const [editActivity,     setEditActivity]     = useState<FreeSession | null>(null);
  const [compDate,         setCompDate]         = useState<string | null>(null);
  const [showPastCycles,   setShowPastCycles]   = useState(false);

  const today         = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }, []);
  const weekMondayISO = useMemo(localMonday, []);

  // Thèmes du coach sur la semaine réellement affichée : les bornes viennent de
  // `weekDays`, pas du lundi courant, sinon la navigation ±1 semaine montrerait
  // les thèmes de la semaine en cours sur une autre semaine.
  const weekBounds = useMemo(() => {
    const dates = (data?.weekDays ?? []).map((d) => d.date).sort();
    return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
  }, [data?.weekDays]);
  const { data: dayThemeRows = [] } = useDayThemesRange(
    athleteId ?? undefined, weekBounds?.start, weekBounds?.end,
  );
  const dayThemesByDate = useMemo(() => indexDayThemesByDate(dayThemeRows), [dayThemeRows]);
  const { data: watchWeek } = usePlannedVsDone(athleteId ?? undefined, weekBounds?.start, weekBounds?.end);
  const watchByDate = useMemo(() => new Map((watchWeek ?? []).map((d) => [d.date, d])), [watchWeek]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const watchNow = useMemo(() => Date.now(), [watchWeek]);
  const { data: scheduledDocs = [] } = useDocSchedule(
    weekBounds ? athleteId : null, weekBounds ?? { start: "", end: "" },
  );
  const fichesByDate = useMemo(() => groupScheduleByDate(scheduledDocs), [scheduledDocs]);
  const weekDone = useMemo(() => {
    const all = (data?.weekDays ?? []).flatMap((d) => d.sessions);
    return { planned: all.length, done: all.filter((x) => x.status === "completed").length };
  }, [data?.weekDays]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const rescheduleWorkout = useRescheduleWorkout();

  const rescheduleEnergy = useMutation({
    mutationFn: async ({ assignmentId, newDate }: { assignmentId: string; newDate: string }) => {
      await moveEnergyAssignment(assignmentId, newDate);
    },
    onSuccess: () => {
      void invalidateEnergy(qc, athleteId);
      toast.success("Séance déplacée");
      setRescheduleTarget(null);
    },
    onError: () => toast.error("Erreur lors du déplacement"),
  });

  const rescheduleEnergyToToday = useMutation({
    mutationFn: async (assignmentId: string) => {
      await moveEnergyAssignment(assignmentId, today);
    },
    onSuccess: () => {
      void invalidateEnergy(qc, athleteId);
      toast.success("Séance déplacée à aujourd'hui");
      setEnergyPreview(prev => prev ? { ...prev, scheduledDate: today } : null);
    },
    onError: () => toast.error("Erreur lors du déplacement"),
  });

  // Validation : gardée sur le téléphone sans réseau (file hors ligne).
  const completeEnergy = useCompleteEnergyAssignment();

  const cancelEnergy = useMutation({
    mutationFn: async (assignmentId: string) => {
      // Même remise à zéro que depuis l'accueil : blocs cochés et RPE effacés
      await reopenEnergyAssignment(assignmentId);
    },
    onSuccess: () => {
      invalidateSessionStatus(qc, athleteId);
      void invalidateEnergy(qc, athleteId);
      toast.success("Validation annulée");
      setEnergyPreview(null);
    },
    onError: () => toast.error("Erreur lors de l'annulation"),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleSessionPress(s: WeekSession) {
    if (s.kind === "energy" && s.energySessionId) {
      setEnergyPreview({ sessionId: s.energySessionId, assignmentId: s.id, status: s.status ?? "planned", scheduledDate: s.scheduledDate });
    } else if (s.kind === "workout") {
      setWorkoutPreview(s);
    }
  }

  const restSession = useMutation({
    mutationFn: async (t: WeekSession) => {
      if (t.kind === "workout") await restWorkoutByAthlete(t.id);
      else await restEnergyAssignment(t.id);
    },
    onSuccess: () => {
      setRescheduleTarget(null);
      if (athleteId) { void invalidateWorkouts(qc, { athleteId }); void invalidateEnergy(qc, athleteId); }
      toast.success("Séance passée en repos");
    },
    onError: () => toast.error("Impossible : la séance a déjà une saisie"),
  });

  function handleRescheduleConfirm(newDate: string, reason?: string) {
    if (!rescheduleTarget) return;
    if (rescheduleTarget.kind === "workout") {
      rescheduleWorkout.mutate(
        { workoutLogId: rescheduleTarget.id, athleteId: athleteId ?? "", currentDate: rescheduleTarget.scheduledDate, newDate, reason, weekMondayISO },
        { onSuccess: () => setRescheduleTarget(null) },
      );
    } else {
      rescheduleEnergy.mutate({ assignmentId: rescheduleTarget.id, newDate });
    }
  }

  const reschedulePending = rescheduleTarget?.kind === "workout"
    ? rescheduleWorkout.isPending
    : rescheduleEnergy.isPending;

  return (
    <div className="mx-auto w-full max-w-[480px] font-ui text-agon-tx lg:max-w-none">
      <ProgramHeader />

      {isLoading ? (
        <ProgramSkeleton />
      ) : (
        // Téléphone : une colonne. PC : rail du plan à gauche, semaine à droite.
        <div className="grid grid-cols-1 gap-agon-xl px-agon-lg pb-8 pt-agon-lg lg:grid-cols-[360px_minmax(0,1fr)] lg:items-center lg:px-0">
          <div className="flex flex-col gap-agon-xl">
            {data?.cycle ? (
              <ActivePlanCard meso={data.cycle} />
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="Aucun cycle en cours"
                description="Tu n'es dans aucun cycle pour le moment. Ton coach programmera la suite."
              />
            )}
          </div>

          {/* PC (planche AthOrdiAProgramme) : plan et navigation de semaine sur une rangée, jours en dessous. */}
          <section className="flex flex-col gap-[18px] lg:contents">
            <div className="flex items-center gap-agon-md lg:mx-auto lg:w-full lg:max-w-[440px]">
              <button
                type="button"
                aria-label="Semaine précédente"
                className={WEEK_NAV_BTN}
                onClick={() => { haptic(); setWeekOffset(o => o - 1); }}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                disabled={weekOffset === 0}
                className={cn("min-w-0 flex-1 bg-transparent p-0 text-center", weekOffset === 0 ? "cursor-default" : "cursor-pointer")}
              >
                <div style={{ ...DISPLAY, fontSize: 15, color: C.tx }}>{weekLabel(weekOffset)}</div>
                <div style={{ ...MONO, fontSize: 11, color: C.tx3, marginTop: 2 }}>
                  {weekRangeLabel(data?.weekDays ?? [])}
                  {weekDone.planned > 0 && (
                    <> · <span style={{ color: TYPE_COLOR.fait }}>{weekDone.done}</span> / {weekDone.planned} faites</>
                  )}
                  {weekOffset !== 0 && <span style={{ color: C.ac }}> · revenir à aujourd'hui</span>}
                </div>
              </button>
              <button
                type="button"
                aria-label="Semaine suivante"
                className={WEEK_NAV_BTN}
                onClick={() => { haptic(); setWeekOffset(o => o + 1); }}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-[18px] lg:col-span-2">
            {!data?.weekDays.length ? (
              <div className="rounded-lg border border-agon-brd bg-agon-s1 px-agon-lg py-agon-xl text-center text-agon-sm text-agon-tx3">
                Aucune séance cette semaine
              </div>
            ) : (
              <div className={cn("flex flex-col gap-[14px] transition-opacity duration-150 lg:grid lg:grid-cols-7 lg:items-stretch lg:gap-2", isPlaceholderData && "opacity-50")}>
                {data.weekDays.map(day => (
                  <DayRow
                    key={day.date}
                    day={day}
                    today={today}
                    onSessionPress={handleSessionPress}
                    onReschedule={setRescheduleTarget}
                    onStart={(s) => navigate("/athlete/program/workout/" + s.id)}
                    onTestPress={(id) => setTestPreviewId(id)}
                    freeActivities={freeSessions.filter(f => f.date === day.date && f.sport)}
                    onAddActivity={setActivityDate}
                    onEditActivity={setEditActivity}
                    onAddCompetition={myCoachId ? setCompDate : null}
                    viewOnly={viewOnly}
                    dayTheme={dayThemesByDate[day.date] ?? null}
                    dayFiches={fichesByDate.get(day.date)}
                    watch={athleteId ? { day: watchByDate.get(day.date), athleteId, now: watchNow } : undefined}
                    vertical={isDesktop}
                  />
                ))}
              </div>
            )}

            {/* Cycles précédents : en bas, repliés */}
            {data?.pastCycles && data.pastCycles.length > 0 && (
              <div>
                <button
                  type="button"
                  aria-expanded={showPastCycles}
                  onClick={() => setShowPastCycles((v) => !v)}
                  className="flex h-12 w-full items-center gap-agon-sm bg-transparent px-1 text-left"
                  style={{ fontFamily: "inherit", cursor: "pointer" }}
                >
                  <span style={{ fontSize: 13, color: C.tx2 }}>
                    Cycles précédents <span style={{ ...MONO, color: C.tx3 }}>({data.pastCycles.length})</span>
                  </span>
                  <span style={{ flex: 1 }} />
                  <ChevronRight size={16} color={C.tx3} style={{ transform: showPastCycles ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
                </button>
                {showPastCycles && (
                  <div className="flex flex-col gap-agon-sm">
                    {data.pastCycles.map((c) => <PastCycleCard key={c.id} cycle={c} />)}
                  </div>
                )}
              </div>
            )}
            </div>
          </section>
        </div>
      )}

      {/* Workout preview drawer */}
      {workoutPreview && (
        <WorkoutPreviewDrawer
          session={workoutPreview}
          today={today}
          onStart={viewOnly ? undefined : (() => {
            setWorkoutPreview(null);
            navigate("/athlete/program/workout/" + workoutPreview.id);
          })}
          onReschedule={() => { setRescheduleTarget(workoutPreview); setWorkoutPreview(null); }}
          onClose={() => setWorkoutPreview(null)}
        />
      )}

      {/* Energy preview overlay */}
      {energyPreview && (
        <EnergyPreviewOverlay
          energySessionId={energyPreview.sessionId}
          assignmentId={energyPreview.assignmentId}
          scheduledDate={energyPreview.scheduledDate}
          initialStatus={energyPreview.status}
          today={today}
          athleteId={athleteId ?? ""}
          onClose={() => setEnergyPreview(null)}
          onRescheduleToToday={() => rescheduleEnergyToToday.mutate(energyPreview.assignmentId)}
          onComplete={(log) => {
            // Build step log JSON — stored in notes field
            const stepLogNotes: string | null = log.size > 0
              ? JSON.stringify({
                  __type: "step_log_v1",
                  steps: Object.fromEntries(
                    Array.from(log.entries()).map(([k, v]) => [k, { status: v.status, comment: v.comment }])
                  ),
                  session_comment: null,
                })
              : null;
            if (!athleteId) return;
            // Toasts (validée / gardée hors ligne / séance retirée) : dans le hook.
            completeEnergy.mutate(
              { id: energyPreview.assignmentId, athleteId, ...(stepLogNotes ? { notes: stepLogNotes } : {}) },
              { onSuccess: () => setEnergyPreview(null) },
            );
          }}
          onCancel={() => cancelEnergy.mutate(energyPreview.assignmentId)}
        />
      )}

      {/* Reschedule drawer (workout + energy) */}
      {rescheduleTarget && (
        <RescheduleSheet
          sessionName={rescheduleTarget.sessionName}
          scheduledDate={rescheduleTarget.scheduledDate}
          today={today}
          weekMondayISO={weekMondayISO}
          typeColor={rescheduleTarget.kind === "workout" ? TYPE_COLOR.muscu : rescheduleTarget.sessionKind === "specifique" ? TYPE_COLOR.hyrox : TYPE_COLOR.energie}
          typeLabel={rescheduleTarget.kind === "workout" ? TYPE_LABEL.muscu : rescheduleTarget.sessionKind === "specifique" ? TYPE_LABEL.hyrox : TYPE_LABEL.energie}
          missed={isMissedWeekSession(rescheduleTarget, today)}
          onDetail={() => { const t = rescheduleTarget; setRescheduleTarget(null); handleSessionPress(t); }}
          onRest={() => restSession.mutate(rescheduleTarget)}
          onConfirm={(d) => handleRescheduleConfirm(d)}
          isPending={reschedulePending || restSession.isPending}
          onClose={() => setRescheduleTarget(null)}
        />
      )}

      {/* Test preview / fill drawer */}
      <TestEntryPage
        testId={testPreviewId}
        athleteId={athleteId ?? ""}
        coachName={athleteCoaches?.referent?.full_name ?? null}
        onClose={() => setTestPreviewId(null)}
      />

      {/* Compétition posée sur un jour par l'athlète */}
      {compDate && myCoachId && (
        <CompetitionFormModal
          athleteId={athleteId ?? ""}
          coachId={myCoachId}
          initialDate={compDate}
          onClose={() => setCompDate(null)}
        />
      )}

      {/* Free activity create modal */}
      <FreeActivityModal
        date={activityDate}
        onClose={() => setActivityDate(null)}
        onSave={(session) => setFreeSessions((prev) => [...prev, session])}
      />

      {/* Free activity edit modal */}
      <FreeActivityModal
        date={editActivity?.date ?? null}
        existing={editActivity}
        onClose={() => setEditActivity(null)}
        onSave={(session) => setFreeSessions((prev) => prev.map((f) => f.id === session.id ? session : f))}
        onDelete={(id) => setFreeSessions((prev) => prev.filter((f) => f.id !== id))}
      />
    </div>
  );
}
