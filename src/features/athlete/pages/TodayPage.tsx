import { AllCompetitionsSheet } from "@/features/athlete/components/AllCompetitionsSheet";
import { AthletePageHeader } from "@/features/athlete/components/AthletePageHeader";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { CalendarDays, Check, GraduationCap, Plane, Trash2, Trophy } from "lucide-react";
import { CitationFigure } from "@/features/shared/components/CitationDuJour";
import { CoachRetourCard } from "@/features/athlete/components/CoachRetourCard";
import { CompetitionDayCard, type CompetitionDayCardData } from "@/features/athlete/components/CompetitionDayCard";
import { DayPreviewSheet } from "@/features/athlete/components/today/DayPreviewSheet";
import { type DayProgram, useWeekProgram } from "@/features/shared/hooks/useWeekProgram";
import { EnergyPreviewOverlay } from "@/features/athlete/components/today/EnergyPreviewOverlay";
import { EventFormPage } from "@/features/athlete/components/EventFormPage";
import { FreeActivityModal } from "@/features/athlete/components/FreeActivityModal";
import type { FreeSession } from "@/features/shared/types/athlete";
import { MACRO_COLOR, ROUGE, TYPE_COLOR, TYPE_LABEL } from "@/lib/peps";
import { MensurationsDrawer } from "@/features/athlete/components/MensurationsDrawer";
import { type NutritionDailyLog, type NutritionStrategy, evaluateNutritionDay } from "@/lib/nutrition";
import { SectionAdd, SectionLink, TodaySection } from "@/features/athlete/components/today/TodaySection";
import { TestEntryPage } from "@/features/athlete/components/TestEntryPage";
import { TintCard } from "@/features/athlete/components/today/TintCard";
import { TodayDial } from "@/features/athlete/components/today/TodayDial";
import { TodayFormeTrend } from "@/features/athlete/components/today/TodayFormeTrend";
import { TodaySessionCard } from "@/features/athlete/components/today/TodaySessionCard";
import { TodayThemeCard } from "@/features/athlete/components/today/TodayThemeCard";
import { TodayTips } from "@/features/athlete/components/today/TodayTips";
import { TodayWeekStrip, type WeekStripDay } from "@/features/athlete/components/today/TodayWeekStrip";
import { TodayWellnessCard } from "@/features/athlete/components/today/TodayWellnessCard";
import { TodayWorkoutFiches } from "@/features/athlete/components/fiches/TodayWorkoutFiches";
import { TypePill } from "@/features/athlete/components/today/TypePill";
import { type UnifiedCalendarEvent, useUnifiedCalendar } from "@/features/shared/hooks/useUnifiedCalendar";
import { WatchPushBadge } from "@/features/athlete/components/today/WatchPushBadge";
import { type WeekSession, useActivePlan } from "@/features/shared/hooks/useActivePlan";
import { WeeklyReviewBanner } from "@/features/athlete/components/today/WeeklyReviewBanner";
import { averageScore, wellnessBand } from "@shared/domain/wellness";
import { calcScore, getReco, wellnessColor } from "@/lib/wellness";
import { competitionAfter, eventTag, upcomingEvents } from "@/lib/athleteEvents";
import { daysUntil } from "@/api/competitions";
import { fmtShortDay, haptic, localMonday } from "@/features/athlete/components/today/todayUtils";
import { getFormeAdvice } from "@/features/athlete/components/today/todayFormeAdvice";
import { indexDayThemesByDate } from "@/lib/dayTheme";
import { localISO, normalizeDayMap } from "@/lib/date";
import { priorityLabel } from "@/types/planning";
import { useAthleteCoaches } from "@/features/shared/hooks/useCoCoach";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useAthleteRetours, useReactWeeklyRetour } from "@/features/shared/hooks/useWeeklyCoachRetour";
import { useAuth } from "@/hooks/useAuth";
import { useCompetitions } from "@/hooks/useCompetitions";
import { useDayThemesRange } from "@/features/shared/hooks/useDayThemes";
import { useDeleteLifeEvent, useLifeEvents } from "@/hooks/useLifeEvents";
import { useHomeHiddenSections } from "@/features/shared/hooks/useHomeSections";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useReadinessScore } from "@/features/shared/hooks/useReadinessScore";
import { useRunningVolume } from "@/features/shared/hooks/useRunningVolume";
import { useStartUnplannedSession } from "@/features/shared/hooks/useStartUnplannedSession";
import { useTodayWellness } from "@/features/shared/hooks/useTodayWellness";
import { useUpcomingCompetition } from "@/features/shared/hooks/useUpcomingCompetition";
import { useWellnessLight } from "@/features/shared/hooks/useWellnessLight";


// FreeActivityModal + SPORTS imported from @/features/athlete/components/FreeActivityModal

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TodayPage() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [selectedDay, setSelectedDay] = useState<DayProgram | null>(null);
  const [activityDate, setActivityDate] = useState<string | null>(null);
  const [editActivity, setEditActivity] = useState<FreeSession | null>(null);
  const [energyPreview, setEnergyPreview] = useState<UnifiedCalendarEvent | null>(null);
  const [fbExpanded, setFbExpanded] = useState(false);
  const [confirmDelEvt, setConfirmDelEvt] = useState<string | null>(null);
  const [showOtherSessions, setShowOtherSessions] = useState(false);
  const [testPreviewId, setTestPreviewId] = useState<string | null>(null);
  const [mensuOpen, setMensuOpen] = useState(false);
  const [eventForm, setEventForm] = useState<null | "competition" | "voyage">(null);
  const { user: authUser } = useAuth();
  const [showAllComps, setShowAllComps] = useState(false);

  const {
    athleteId, athleteProfile, wellnessHistory,
    setShowWellness, freeSessions, setFreeSessions,
    nutritionStrategy, nutritionLog,
    athleteProfile: profile,
    viewOnly, coachFeedbacks,
  } = useAthleteContext();

  const wellness        = useTodayWellness();
  const readiness       = useReadinessScore(wellness);
  const { data: light } = useWellnessLight(athleteId);
  const { data: nextComp } = useUpcomingCompetition(athleteId);
  const { data: allCompetitions = [] } = useCompetitions(athleteId);
  const weekDays = useWeekProgram(null);

  // Active plan (new system) for other sessions + unplanned session start
  const { data: activePlanData } = useActivePlan(athleteId ?? "");
  const { mutate: startUnplanned, isPending: startingUnplanned } = useStartUnplannedSession();
  const weekMondayISO = useMemo(localMonday, []);
  const today = localISO();
  // Retours coach pas encore vus (= sans réaction), toutes semaines confondues
  const { data: coachRetours = [] } = useAthleteRetours(athleteId ?? undefined);
  const unreadRetours = coachRetours.filter((r) => !r.athlete_reaction);
  const { data: athleteCoaches } = useAthleteCoaches(athleteId);
  const coachName = athleteCoaches?.referent?.full_name ?? null;
  const { mutate: reactRetour } = useReactWeeklyRetour();
  const { data: lifeEvents = [] } = useLifeEvents(athleteId ?? "");
  const { mutate: deleteLifeEvent } = useDeleteLifeEvent();
  const myCoachId = profile?.coach_id;
  // Sections de l'accueil masquées par le coach
  const { isVisible: show } = useHomeHiddenSections(athleteId);
  // Sorties de montre rattachées aux séances énergie prévues (8 dernières semaines)
  const { matchByPlanned: watchByPlanned } = useRunningVolume(athleteId ?? undefined, freeSessions);

  // `wellnessHistory` est écrit par saveWellness() avec la clé compacte de
  // todayKey() ("20260817"), alors que tout TodayPage raisonne en ISO à tirets.
  // Sans cette normalisation aucune clé ne matchait : le récap d'hier et la
  // courbe 14 jours ne trouvaient jamais de données et restaient masqués.
  const wellnessByISO = useMemo(
    () => normalizeDayMap(wellnessHistory as Record<string, unknown>),
    [wellnessHistory],
  );

  // Week ISO range for current week (same logic as useWeekProgram)
  const { mondayISO, sundayISO } = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(0, 0, 0, 0);
    const mon = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const sun = new Date(d);
    sun.setDate(d.getDate() + 6);
    return {
      mondayISO: mon,
      sundayISO: `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, "0")}-${String(sun.getDate()).padStart(2, "0")}`,
    };
  }, []);

  const { data: calEvents = [] } = useUnifiedCalendar(
    athleteId ?? "",
    { start: mondayISO, end: sundayISO },
  );

  // Thèmes du jour posés par le coach, sur la semaine affichée : le bandeau
  // d'aujourd'hui et la fiche d'un jour quelconque lisent le même index.
  const { data: dayThemeRows = [] } = useDayThemesRange(athleteId ?? undefined, mondayISO, sundayISO);
  const dayThemesByDate = useMemo(() => indexDayThemesByDate(dayThemeRows), [dayThemeRows]);
  const todayTheme = dayThemesByDate[today] ?? null;

  const energyByDate = useMemo(() => {
    const m = new Map<string, UnifiedCalendarEvent[]>();
    for (const ev of calEvents) {
      if (ev.type === "energy") {
        const arr = m.get(ev.date) ?? [];
        arr.push(ev);
        m.set(ev.date, arr);
      }
    }
    return m;
  }, [calEvents]);

  const todayEnergySessions = energyByDate.get(today) ?? [];

  // Derive today's workouts from the date-based week schedule
  const todayDay = weekDays.find((d) => d.date === today);
  const workouts = todayDay?.sessions ?? [];
  const todayTests = todayDay?.tests ?? [];

  // Mesure biométrique planifiée → formulaire Mensurations/Photos, sinon TestEntryPage
  const openTest = (id: string) => {
    const t = weekDays.flatMap((d) => d.tests).find((x) => x.id === id);
    if (t?.type === "biometric") setMensuOpen(true);
    else setTestPreviewId(id);
  };
  const allDoneToday = workouts.length > 0 && workouts.every((w) => w.isCompleted);
  const restDay = workouts.length === 0 && todayEnergySessions.length === 0;

  // ── Séances non complétées de la semaine (hors aujourd'hui) ──────────────
  const otherUndoneSessions = useMemo((): WeekSession[] => {
    if (!activePlanData?.weekDays) return [];
    return activePlanData.weekDays.flatMap((d) => {
      if (d.date === today) return [];
      return d.sessions.filter(
        (s) => s.kind === "workout" && s.status !== "completed" && s.status !== "skipped"
      );
    });
  }, [activePlanData, today]);

  // ── Compétitions par jour (posées dans le planning comme une séance) ─────
  const competitionsByDate = useMemo(() => {
    const m = new Map<string, CompetitionDayCardData[]>();
    for (const c of allCompetitions) {
      m.set(c.date, [...(m.get(c.date) ?? []), {
        id: c.id, name: c.name, type: c.type, date: c.date,
        location: c.location, priority: c.priority,
        athlete_comment: c.athlete_comment ?? null,
      }]);
    }
    return m;
  }, [allCompetitions]);
  const todayComps = competitionsByDate.get(today) ?? [];

  // ── Compétitions passées sans bilan : restent « à commenter » jusqu'au bilan
  const uncommentedComps = allCompetitions
    .filter((c) => c.date < today && !c.athlete_comment)
    .map((c) => competitionsByDate.get(c.date)!.find((x) => x.id === c.id)!);

  // ── Wellness trend (last 14 days) ────────────────────────────────────────
  const wellnessTrend = Array.from({ length: 14 }, (_, i) => {
    const iso = localISO(new Date(Date.now() - (13 - i) * 86400000));
    // Score unique (domaine wellness) : null si une note manque, jamais inventé.
    const score = calcScore(wellnessByISO?.[iso] ?? null);
    return { d: iso.slice(5), iso, score };
  });
  const wellnessTrendHasData = wellnessTrend.some((d) => d.score !== null);

  // ── Form advice from today's wellness ────────────────────────────────────
  const formeAdvice = getFormeAdvice(wellness as Record<string, number> | null);

  // ── Nutrition du jour vs objectif ─────────────────────────────────────────
  const todayNutrition = (() => {
    if (!nutritionStrategy) return null;
    const strat = nutritionStrategy as NutritionStrategy;
    const l = (nutritionLog?.[today] ?? null) as NutritionDailyLog | null;
    const consumed = l?.total_calories_consumed || 0;
    const bmrV = (athleteProfile as { base_metabolism?: number } | null)?.base_metabolism || 0;
    const calorieMode = strat.calorie_mode ?? (strat.can_track_calories ? "active" : "nap");
    const activeCal = l?.active_calories || 0;
    const dynDepense = calorieMode !== "nap" && activeCal > 0 && bmrV ? bmrV + activeCal : null;
    const ev = consumed > 0 ? evaluateNutritionDay(strat, consumed, dynDepense) : null;
    const zone = evaluateNutritionDay(strat, 1, dynDepense); // bornes affichage
    const meta = strat.strategy === "seche" ? { label: "Sèche", color: C.r }
      : strat.strategy === "prise_de_masse" ? { label: "Prise de masse", color: C.g }
      : { label: "Maintenance", color: C.b };
    return { consumed, ev, zone, meta, log: l };
  })();

  // ── Average wellness score (last 7 days with data) ───────────────────────
  // Mêmes 5 paliers que le coach (80 / 65 / 50 / 35).
  const avgFormeScore = averageScore(wellnessTrend.slice(-7).map((d) => d.score));
  const formeColor = avgFormeScore == null ? C.tx3 : wellnessColor(avgFormeScore);
  const formeLabel = wellnessBand(avgFormeScore)?.label ?? "—";

  // Recent coach feedback (14 days)
  const recentFb = useMemo(() => {
    if (!coachFeedbacks) return null;
    return Object.entries(coachFeedbacks)
      .map(([w, fb]) => ({ week: Number(w), ...fb }))
      .filter((fb) => fb.note && fb.date && Date.now() - new Date(fb.date).getTime() <= 14 * 86_400_000)
      .sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? 1 : -1))[0] ?? null;
  }, [coachFeedbacks]);

  // Numérotation des sections visibles (« 01 — », « 02 — »…), dans l'ordre d'affichage.
  let secNum = 0;
  const sec = () => ++secNum;

  // Semaine de l'accueil : teinte du thème, une pastille par séance (couleur du type).
  const weekStripDays: WeekStripDay[] = weekDays.map((day) => {
    const dayEnergy = energyByDate.get(day.date) ?? [];
    const dayFree = freeSessions.filter((f) => f.date === day.date && f.sport);
    const dots = [
      ...day.sessions.map((x) => (x.isCompleted ? TYPE_COLOR.fait : TYPE_COLOR.muscu)),
      ...dayEnergy.map((ev) => (ev.status === "completed" ? TYPE_COLOR.fait : ev.sessionKind === "specifique" ? TYPE_COLOR.hyrox : TYPE_COLOR.energie)),
      ...day.tests.map((t) => (t.completed ? TYPE_COLOR.fait : TYPE_COLOR.test)),
      ...dayFree.map(() => TYPE_COLOR.fait),
    ];
    const planned = day.sessions.length + dayEnergy.length;
    const done = day.sessions.filter((x) => x.isCompleted).length + dayEnergy.filter((ev) => ev.status === "completed").length;
    return {
      day,
      theme: dayThemesByDate[day.date] ?? null,
      dots,
      allDone: planned > 0 && done === planned,
      empty: dots.length === 0,
      isCompetition: competitionsByDate.has(day.date),
    };
  });
  const weekCount = weekDays.reduce(
    (acc, day) => {
      const dayEnergy = energyByDate.get(day.date) ?? [];
      acc.planned += day.sessions.length + dayEnergy.length;
      acc.done += day.sessions.filter((x) => x.isCompleted).length + dayEnergy.filter((ev) => ev.status === "completed").length;
      return acc;
    },
    { planned: 0, done: 0 },
  );

  return (
    <>
      <div className={cn("mx-auto", isDesktop ? "max-w-[1248px]" : "max-w-[480px]")}>
      {/* En-tête — symbole, date, prénom, citation (maquette « Aujourd'hui ») */}
      <AthletePageHeader
        title={<>Bonjour,{isDesktop ? " " : <br />}{athleteProfile?.first_name ?? athleteProfile?.full_name?.split(" ")[0] ?? "athlète"}</>}
        titleSize={isDesktop ? 34 : 30}
        titleGap={24}
        padding={isDesktop ? "22px 20px 0" : "52px 20px 22px"}
        background={`${C.bg} url(/maquette/accueil-fond.svg) center/cover no-repeat`}
        decor={<TodayDial />}
        inline={isDesktop}
      >
        {show("quote") && <CitationFigure />}
      </AthletePageHeader>
      <div className="flex flex-col gap-7 px-5 pb-6 pt-[22px] [scrollbar-width:none]">

        {!viewOnly && <WeeklyReviewBanner athleteId={athleteId} />}

        {(() => {
          const s01 = (<>
        {/* 01 — Wellness du jour, replié */}
        {show("wellness") && (
          <TodaySection
            num={sec()}
            title="Wellness du jour"
            right={readiness ? <SectionLink onClick={() => { setShowWellness(true); haptic(); }}>Modifier</SectionLink> : undefined}
          >
            <TodayWellnessCard
              readiness={readiness}
              advice={readiness ? getReco(readiness.score).desc : null}
              wellness={wellness}
              light={light}
              onLog={() => { setShowWellness(true); haptic(); }}
            />
          </TodaySection>
        )}

          </>);
          const s02 = (<>
        {/* 02 — Retour du coach */}
        {(unreadRetours.length > 0 || recentFb) && (() => {
          const fbBlock = recentFb ? (
            <button
              type="button"
              onClick={() => { setFbExpanded((v) => !v); haptic(); }}
              className="flex cursor-pointer flex-col gap-1 border-none bg-transparent p-0 text-left font-[inherit]"
            >
              <span className="agon-mono text-[11px] uppercase tracking-[0.12em] text-agon-tx3">
                Sur ta séance du {new Date(recentFb.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
              </span>
              <span className={cn("text-[13px] italic leading-normal text-agon-tx", fbExpanded ? "whitespace-pre-wrap" : "line-clamp-2")}>
                « {recentFb.note} »
              </span>
            </button>
          ) : null;
          return (
            <TodaySection
              num={sec()}
              title="Retour du coach"
              right={unreadRetours.length > 0 ? (
                <span className="agon-mono flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-agon-type-energie">
                  <span aria-hidden className="size-[7px] rounded-full bg-agon-type-energie" />
                  Nouveau
                </span>
              ) : undefined}
            >
              {unreadRetours.length === 0 ? (
                <CoachRetourCard>{fbBlock}</CoachRetourCard>
              ) : unreadRetours.map((r, i) => (
                <CoachRetourCard
                  key={r.id}
                  retour={r}
                  coachName={coachName}
                  onReact={viewOnly || !athleteId ? undefined : (reaction) => {
                    haptic();
                    reactRetour({ retourId: r.id, athleteId, reaction });
                  }}
                >
                  {i === 0 ? fbBlock : null}
                </CoachRetourCard>
              ))}
            </TodaySection>
          );
        })()}

          </>);
          const s03 = (<>
        {/* 03 — Cette semaine + thème du jour */}
        {show("week") && (
          <TodaySection
            num={sec()}
            title="Cette semaine"
            right={weekCount.planned > 0 ? <span className="agon-mono text-[11px] text-agon-tx3">{weekCount.done} / {weekCount.planned} faites</span> : undefined}
          >
            <TodayWeekStrip days={weekStripDays} today={today} onSelect={(d) => { setSelectedDay(d); haptic(); }} />
            <TodayThemeCard theme={todayTheme} />
          </TodaySection>
        )}
        {!show("week") && todayTheme && <TodayThemeCard theme={todayTheme} />}

          </>);
          const s04 = (<>
        {/* 04 — Mes événements */}
        {show("events") && (
          <TodaySection
            num={sec()}
            title="Mes événements"
            right={<SectionAdd label="Ajouter un événement" onClick={() => setEventForm(myCoachId ? "competition" : "voyage")} />}
          >
            {(() => {
              const upcoming = upcomingEvents(allCompetitions, lifeEvents, today);
              if (upcoming.length === 0) return (
                <div className="rounded-xl border border-dashed border-agon-brd-l p-3.5 text-center">
                  <div className="text-[13px] text-agon-tx2">Aucun événement prévu</div>
                  <div className="mt-1 text-[12px] text-agon-tx3">Ajoute tes compétitions et indisponibilités pour que ton coach adapte le planning</div>
                </div>
              );
              return upcoming.map((evt) => {
                const isComp = evt.source === "competition";
                const tint = isComp ? ROUGE : TYPE_COLOR.hyrox;
                const Icon = isComp ? Trophy : evt.kind === "voyage" ? Plane : evt.kind === "examen" ? GraduationCap : CalendarDays;
                return (
                <div key={evt.source + evt.id} className="flex flex-col gap-1.5">
                  <TintCard color={tint} onClick={isComp ? () => setShowAllComps(true) : undefined}>
                    <Icon size={18} color={tint} strokeWidth={1.75} className="flex-none" />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-agon-tx">{evt.title}</span>
                        {evt.isNew && <span className="agon-mono inline-flex h-[22px] flex-none items-center whitespace-nowrap rounded-full bg-agon-accent px-2 text-[9.5px] font-medium uppercase tracking-[0.08em] text-agon-bg">Nouveau</span>}
                      </div>
                      <div className="agon-mono truncate text-[11px] uppercase tracking-[0.08em] text-agon-tx2">
                        {fmtShortDay(evt.start)}{evt.end !== evt.start ? ` → ${fmtShortDay(evt.end)}` : ""} · <span style={{ color: tint }}>{eventTag(evt)}</span>
                      </div>
                    </div>
                    {!isComp && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelEvt((cur) => (cur === evt.id ? null : evt.id)); }}
                      aria-label="Supprimer l'événement"
                      className={cn("flex size-7 flex-none cursor-pointer items-center justify-center rounded-[8px] border border-agon-brd-l bg-transparent", confirmDelEvt === evt.id ? "text-agon-rouge" : "text-agon-tx3")}
                    >
                      <Trash2 size={13} />
                    </button>
                    )}
                  </TintCard>
                  {!isComp && confirmDelEvt === evt.id && (
                    <div className="rounded-[10px] border border-agon-rouge/[0.4] px-3 py-2.5">
                      <div className="mb-2.5 text-[13px] text-agon-tx2">Supprimer cet événement ? Ton coach ne le verra plus sur le planning.</div>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmDelEvt(null)} className="h-10 flex-1 cursor-pointer rounded-[10px] border border-agon-brd-l bg-transparent font-[inherit] text-[13px] text-agon-tx">Annuler</button>
                        <button onClick={() => { deleteLifeEvent({ id: evt.id, athlete_id: athleteId ?? "" }); setConfirmDelEvt(null); }} className="h-10 flex-1 cursor-pointer rounded-[10px] border border-agon-rouge/[0.4] bg-transparent font-[inherit] text-[13px] font-semibold text-agon-rouge">Supprimer</button>
                      </div>
                    </div>
                  )}
                </div>
                );
              });
            })()}
          </TodaySection>
        )}

          </>);
          const s05 = (<>
        {/* 05 — Nutrition */}
        {show("nutrition") && todayNutrition && (() => {
          const { consumed, ev, zone, meta, log: nl } = todayNutrition;
          const zoneLabel = zone
            ? (zone.targetMin !== zone.targetMax
              ? `${zone.targetMin.toLocaleString("fr-FR")}–${zone.targetMax.toLocaleString("fr-FR")}`
              : zone.targetMin.toLocaleString("fr-FR"))
            : null;
          const scale = zone ? zone.targetMax * 1.15 : 0;
          const pct = (v: number) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`;
          const left = zone && consumed < zone.targetMin
            ? (zone.targetMin !== zone.targetMax
              ? `Il reste ${(zone.targetMin - consumed).toLocaleString("fr-FR")} à ${(zone.targetMax - consumed).toLocaleString("fr-FR")} kcal pour la zone cible.`
              : `Il reste ${(zone.targetMin - consumed).toLocaleString("fr-FR")} kcal pour la cible.`)
            : null;
          return (
            <TodaySection num={sec()} title="Nutrition" right={<SectionLink onClick={() => { navigate("/athlete/alim"); haptic(); }}>Détail →</SectionLink>}>
              <div className="flex flex-col gap-2.5 rounded-xl border border-agon-type-hyrox/[0.45] bg-agon-type-hyrox/[0.12] px-3.5 py-3">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className={cn("agon-mono text-[24px]", consumed > 0 ? "text-agon-type-hyrox" : "text-agon-tx")}>{consumed > 0 ? consumed.toLocaleString("fr-FR") : "—"}</span>
                  {zoneLabel && <span className="agon-mono text-[12px] text-agon-tx3">/ {zoneLabel} kcal</span>}
                  <span className="flex-1" />
                  <span className="agon-mono rounded-full px-[9px] py-[3px] text-[10px] font-medium uppercase tracking-[0.10em] text-agon-ink" style={{ background: meta.color }}>{meta.label}</span>
                </div>
                {zone && (
                  <div className="relative h-2 overflow-hidden rounded-[4px] bg-agon-brd">
                    <span aria-hidden className="absolute inset-y-0 bg-agon-type-fait/[0.25]" style={{ left: pct(zone.targetMin), width: `calc(${pct(zone.targetMax)} - ${pct(zone.targetMin)})` }} />
                    <span aria-hidden className="absolute inset-y-0 left-0 rounded-[4px] bg-agon-type-hyrox" style={{ width: pct(consumed) }} />
                  </div>
                )}
                {consumed <= 0 ? (
                  <div className="text-[13px] text-agon-tx3">Aucune saisie aujourd'hui.</div>
                ) : (
                  <div className="flex gap-3.5">
                    {[
                      { l: "G", v: nl?.glucides_consumed, c: MACRO_COLOR.g },
                      { l: "L", v: nl?.lipides_consumed, c: MACRO_COLOR.l },
                      { l: "P", v: nl?.proteines_consumed, c: MACRO_COLOR.p },
                    ].map((m) => (
                      <span key={m.l} className="agon-mono flex items-center gap-[5px] text-[12px] text-agon-tx2">
                        <span aria-hidden className="size-2 rounded-[2px]" style={{ background: m.c }} />
                        {m.l} {m.v ?? "—"} g
                      </span>
                    ))}
                  </div>
                )}
                {left && <div className="text-[13px] text-agon-tx2">{left}</div>}
                {!left && ev && (
                  <div className={cn("text-[13px]", ev.status === "ok" ? "text-agon-type-fait" : ev.status === "close" ? "text-agon-type-hyrox" : "text-agon-rouge")}>
                    {ev.status === "ok"
                      ? "Dans l'objectif."
                      : `${ev.status === "close" ? "Proche de l'objectif" : "Hors objectif"} (${ev.diffPct > 0 ? "+" : ""}${ev.diffPct.toFixed(1)} % d'écart).`}
                  </div>
                )}
              </div>
            </TodaySection>
          );
        })()}

          </>);
          const sComp = (<>
        {/* Jour de compétition (avant les séances) */}
        {todayComps.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {todayComps.map((c) => (
              <CompetitionDayCard key={c.id} competition={c} viewOnly={viewOnly} />
            ))}
          </div>
        )}

          </>);
          const s06 = (<div data-tip="seance" className="contents">
        {/* 06 — Séances du jour : nom → aperçu → détail */}
        {(() => {
          const EKL: Record<string, string> = { vo2: "VO₂", tempo: "Tempo", seuil: "Seuil", footing: "Footing", fartlek: "Fartlek", specifique: "HYROX", autre: "Énergie", custom: "Énergie" };
          const pendingWorkouts = workouts.filter(w => !w.isCompleted);
          const pendingEnergy   = todayEnergySessions.filter(ev => ev.status !== "completed");
          const totalToday      = workouts.length + todayEnergySessions.length;
          const hasPending      = pendingWorkouts.length > 0 || pendingEnergy.length > 0;
          const showOther = !viewOnly && (allDoneToday || restDay) && otherUndoneSessions.length > 0;

          // Jour avec uniquement test/biométrie/compétition : leur section suffit
          if (totalToday === 0 && !showOther && (todayTests.length > 0 || todayComps.length > 0)) return null;

          return (
            <TodaySection
              num={sec()}
              title="Séances du jour"
              right={totalToday > 0 ? <span className="agon-mono text-[11px] text-agon-tx3">{totalToday} prévue{totalToday > 1 ? "s" : ""}</span> : undefined}
            >
              {totalToday === 0 ? (
                <div className="rounded-xl border border-agon-brd bg-agon-s1 px-3.5 py-4 text-center">
                  <div className="agon-display mb-1 text-[16px] text-agon-tx">Récupération</div>
                  <div className="text-[13px] text-agon-tx3">Rien de prévu, profite pour te reposer.</div>
                </div>
              ) : !hasPending ? (
                <div className="rounded-xl border border-agon-type-fait/[0.45] bg-agon-type-fait/[0.12] px-3.5 py-4 text-center">
                  <div className="mb-1.5"><Check size={26} color={TYPE_COLOR.fait} /></div>
                  <div className="agon-display text-[16px] text-agon-type-fait">
                    {totalToday > 1 ? "Séances terminées" : "Séance terminée"}
                  </div>
                  <div className="mt-1 text-[13px] text-agon-tx3">Bien joué, récupère bien.</div>
                </div>
              ) : (
                <>
                  {pendingWorkouts.map((w, wi) => (
                    <TodaySessionCard
                      key={w.session.id}
                      color={TYPE_COLOR.muscu}
                      typeLabel={TYPE_LABEL.muscu}
                      title={w.session.name}
                      pattern
                      items={w.items}
                      defaultOpen={wi === 0 && pendingWorkouts.length + pendingEnergy.length === 1}
                      extra={w.workoutLogId ? <TodayWorkoutFiches workoutLogId={w.workoutLogId} athleteId={athleteId} /> : undefined}
                      badge={<WatchPushBadge athleteId={athleteId} kind="strength" sourceId={w.workoutLogId} />}
                      onDetail={todayDay ? () => { setSelectedDay(todayDay); haptic(); } : undefined}
                      onStart={viewOnly || !w.workoutLogId ? undefined : () => { haptic(); navigate("/athlete/program/workout/" + w.workoutLogId); }}
                    />
                  ))}
                  {pendingEnergy.map((ev) => {
                    const hyrox = ev.sessionKind === "specifique";
                    const color = hyrox ? TYPE_COLOR.hyrox : TYPE_COLOR.energie;
                    const open = () => { if (hyrox && !viewOnly) navigate(`/athlete/specific/${ev.id}`); else setEnergyPreview(ev); haptic(); };
                    return (
                      <TodaySessionCard
                        key={ev.id}
                        color={color}
                        typeLabel={EKL[ev.sessionKind ?? ""] ?? TYPE_LABEL.energie}
                        title={ev.title}
                        onDetail={open}
                        badge={<WatchPushBadge athleteId={athleteId} kind="energy" sourceId={ev.id} />}
                      />
                    );
                  })}
                </>
              )}
        {!viewOnly && (allDoneToday || restDay) && otherUndoneSessions.length > 0 && (
          <div>
            <button
              onClick={() => { setShowOtherSessions((v) => !v); haptic(); }}
              className="flex min-h-11 w-full cursor-pointer items-center justify-between rounded-[6px] border border-dashed border-agon-brd-l bg-agon-s1 px-3.5 py-2.5 font-[inherit] text-[12px] font-semibold text-agon-tx3"
            >
              <span>Faire une autre séance cette semaine</span>
              <span className="text-[10px]">{showOtherSessions ? "▲" : "▼"}</span>
            </button>

            {showOtherSessions && (
              <div className="mt-2 flex flex-col gap-2">
                {otherUndoneSessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      haptic();
                      if (!athleteId) return;
                      // Create unplanned workout_log then navigate
                      startUnplanned(
                        {
                          athleteId,
                          coachId:        null,
                          sessionId:      s.sessionId ?? s.id,
                          sessionName:    s.sessionName,
                          scheduledDate:  today,
                          weekMondayISO,
                        },
                        {
                          // Écran de séance actuel (blocs, consignes, clusters) — pas l'ancien LogView
                          onSuccess: (log) => {
                            navigate("/athlete/program/workout/" + log.id);
                          },
                        }
                      );
                    }}
                    disabled={startingUnplanned}
                    className="flex w-full cursor-pointer items-center justify-between rounded-[6px] border border-agon-coach/[0.25] bg-agon-coach-doux px-3.5 py-3 text-left font-[inherit]"
                  >
                    <div>
                      <div className="text-[13px] font-bold text-agon-tx">{s.sessionName}</div>
                      <div className="mt-px text-[10px] text-agon-tx3">
                        Planifiée {new Date(s.scheduledDate + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long" })}
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-agon-coach">
                      Démarrer ▶
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
            </TodaySection>
          );
        })()}

          </div>);
          const s07 = (<>
        {/* 07 — Test du jour */}
        {show("test") && todayTests.length > 0 && (
          <TodaySection num={sec()} title={todayTests.length > 1 ? "Tests du jour" : "Test du jour"}>
            {todayTests.map((t) => {
              const bio = t.type === "biometric";
              const tc = t.completed ? TYPE_COLOR.fait : TYPE_COLOR.test;
              return (
                <TintCard key={t.id} as="button" color={tc} onClick={() => { openTest(t.id); haptic(); }}>
                  <div className="min-w-0 flex-1">
                    <div className="agon-mono text-[10px] uppercase tracking-[0.12em] text-agon-tx3">{bio ? "Biométrie" : "Test"}</div>
                    <div className="mt-0.5 truncate text-[15px] font-medium text-agon-tx">{t.title}</div>
                  </div>
                  {t.completed
                    ? <Check size={18} color={TYPE_COLOR.fait} />
                    : <TypePill color={tc}>Remplir →</TypePill>}
                </TintCard>
              );
            })}
          </TodaySection>
        )}

          </>);
          const s08 = (<>
        {/* 08 — Prochaine compétition (+ compétitions à commenter) */}
        {show("next_comp") && (
          <TodaySection
            num={sec()}
            title="Prochaine compétition"
            right={<>
              {allCompetitions.length > 0 && <SectionLink onClick={() => setShowAllComps(true)}>Toutes ({allCompetitions.length})</SectionLink>}
              {myCoachId && <SectionAdd label="Ajouter une compétition" onClick={() => setEventForm("competition")} />}
            </>}
          >
            {nextComp ? (
              <button
                type="button"
                onClick={() => setShowAllComps(true)}
                className="relative flex w-full cursor-pointer flex-col gap-1.5 overflow-hidden rounded-[14px] border border-agon-rouge/[0.45] bg-agon-h-brun bg-[url('/maquette/competition-fond.svg')] bg-cover bg-center py-3 pl-[17px] pr-3.5 text-left font-[inherit] text-agon-tx"
              >
                <span aria-hidden className="absolute inset-0 bg-[rgba(21,18,15,0.72)]" />
                <span aria-hidden className="absolute inset-0 bg-agon-rouge/[0.1]" />
                <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-agon-rouge" />
                <span className="relative flex w-full items-center gap-2.5 whitespace-nowrap">
                  <span className="agon-display min-w-0 truncate text-[14px] font-medium tracking-[0.08em]">{nextComp.name}</span>
                  <span className="flex-1" />
                  <TypePill color={ROUGE}>{priorityLabel(nextComp.priority)}</TypePill>
                </span>
                <span className="relative flex min-w-0 items-baseline gap-2.5">
                  <span className="agon-mono flex-none text-[22px] text-agon-rouge">{nextComp.daysUntil === 0 ? "J" : `J-${nextComp.daysUntil}`}</span>
                  <span className="agon-mono truncate text-[11px] uppercase tracking-[0.06em] text-agon-tx">
                    {fmtShortDay(nextComp.date)}{nextComp.location ? ` · ${nextComp.location}` : ""}
                  </span>
                </span>
              </button>
            ) : null}
            {nextComp && (() => {
              const then = competitionAfter(allCompetitions, nextComp.id, today);
              if (!then) return null;
              const j = daysUntil(then.date, today);
              return (
                <button type="button" onClick={() => setShowAllComps(true)} className="flex w-full cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-xl border border-agon-brd bg-agon-s1 px-3.5 py-2.5 text-left font-[inherit] text-agon-tx">
                  <span className="text-[12px] text-agon-tx3">Puis</span>
                  <span className="agon-display min-w-0 truncate text-[12.5px] tracking-[0.08em]">{then.name}</span>
                  <span className="flex-1" />
                  <span className="agon-mono text-[12px] text-agon-rouge">{j === 0 ? "J" : `J-${j}`}</span>
                  <span className="agon-mono text-[11px] text-agon-tx2">· {then.priority}</span>
                </button>
              );
            })()}
            {!nextComp && (
              <div className="rounded-xl border border-dashed border-agon-brd-l p-4 text-center">
                <div className={cn("text-[13px] text-agon-tx3", myCoachId && "mb-2.5")}>Aucune compétition prévue</div>
                {myCoachId && (
                  <button
                    onClick={() => setEventForm("competition")}
                    className="h-11 cursor-pointer rounded-xl border border-agon-brd-l bg-transparent px-[18px] font-[inherit] text-[14px] font-semibold text-agon-tx"
                  >
                    Ajouter une compétition
                  </button>
                )}
              </div>
            )}
            {uncommentedComps.length > 0 && (
              <>
                <div className="agon-mono mt-1 text-[10px] uppercase tracking-[0.12em] text-agon-type-competition">
                  {uncommentedComps.length > 1 ? "Compétitions à commenter" : "Compétition à commenter"}
                </div>
                {uncommentedComps.map((comp) => (
                  <CompetitionDayCard key={comp.id} competition={comp} viewOnly={viewOnly} showDate />
                ))}
              </>
            )}
          </TodaySection>
        )}
        {!show("next_comp") && uncommentedComps.length > 0 && uncommentedComps.map((comp) => (
          <CompetitionDayCard key={comp.id} competition={comp} viewOnly={viewOnly} showDate />
        ))}

          </>);
          const s09 = (<>
        {/* 09 — Tendance de forme */}
        {show("trend") && wellnessTrendHasData && (
          <TodaySection num={sec()} title="Tendance de forme" right={<SectionLink onClick={() => navigate("profil")}>Historique →</SectionLink>}>
            <div className="flex items-center gap-2.5">
              <span className="agon-mono text-[11px] uppercase tracking-[0.14em] text-agon-tx3">Forme moyenne · 7 j</span>
              <span className="flex-1" />
              <span className="agon-mono text-[18px] leading-none" style={{ color: formeColor }}>
                {avgFormeScore ?? "—"}
                {avgFormeScore != null && <span className="text-[11px] text-agon-tx3"> / 100</span>}
              </span>
              {avgFormeScore != null && <TypePill color={formeColor}>{formeLabel}</TypePill>}
            </div>
            <TodayFormeTrend scores={wellnessTrend.map((d) => d.score)} color={formeColor} />
            <div className="flex justify-between">
              {[wellnessTrend[0].iso, wellnessTrend[wellnessTrend.length - 1].iso].map((iso) => (
                <span key={iso} className="agon-mono text-[11px] uppercase tracking-[0.14em] text-agon-tx3">
                  {new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                </span>
              ))}
            </div>

            {(formeAdvice.length > 0 || wellnessBand(avgFormeScore)?.tone === "good") && (
              <div className="flex flex-col gap-1.5">
                {(formeAdvice.length > 0
                  ? formeAdvice
                  : [{ icon: <Check size={16} />, label: "Forme", text: "bonne, continue sur ta lancée.", color: C.g }]
                ).map((tip) => (
                  <div
                    key={tip.label}
                    className="relative flex items-center gap-2.5 overflow-hidden rounded-[10px] py-[9px] pl-[15px] pr-3"
                    style={{ border: `1px solid ${tip.color}66`, background: `${tip.color}1A` }}
                  >
                    <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tip.color }} />
                    <span className="flex flex-none" style={{ color: tip.color }}>{tip.icon}</span>
                    <div className="text-[12px] leading-[1.4] text-agon-tx2">
                      <span className="font-medium" style={{ color: tip.color }}>{tip.label}</span> · {tip.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TodaySection>
        )}
          </>);
          if (!isDesktop) return <>{s01}{s02}{s03}{s04}{s05}{sComp}{s06}{s07}{s08}{s09}</>;
          // Ordinateur (planche AthOrdiAAujourdhui) : 3 colonnes, puis séances du jour + tendance.
          const col = "flex min-w-0 flex-col gap-7";
          return (
            <>
              <div className="grid grid-cols-3 items-start gap-6">
                <div className={col}>{s01}{s02}</div>
                <div className={col}>{s03}{s04}{s05}</div>
                <div className={col}>{sComp}{s07}{s08}</div>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start gap-6">
                <div className={col}>{s06}</div>
                <div className={col}>{s09}</div>
              </div>
            </>
          );
        })()}

        <div aria-hidden className="flex flex-col items-center gap-2 pt-1.5 opacity-[0.55]">
          <img src="/maquette/agon-grec.svg" alt="" className="h-3.5" />
          <span className="agon-mono text-[10px] tracking-[0.2em] text-agon-tx3">LA PROGRESSION PAR LE PLAN</span>
        </div>
      </div>
      </div>

      {/* Day preview BottomSheet */}
      <DayPreviewSheet
        day={selectedDay}
        onClose={() => setSelectedDay(null)}
        onStartSession={viewOnly ? () => {} : (sess, workoutLogId) => {
          // Écran de séance actuel ; /athlete/log (LogView legacy) seulement sans log
          if (workoutLogId) navigate("/athlete/program/workout/" + workoutLogId);
          else navigate("/athlete/log", { state: { initialSess: sess } });
        }}
        freeSessions={freeSessions}
        energyByDate={energyByDate}
        watchByPlanned={watchByPlanned}
        onEnergyPreview={(ev) => {
          if (ev.sessionKind === "specifique" && !viewOnly) {
            navigate(`/athlete/specific/${ev.id}`);
          } else {
            setEnergyPreview(ev);
          }
        }}
        viewOnly={viewOnly}
        competitionsByDate={competitionsByDate}
        onAddActivity={(date) => setActivityDate(date)}
        onEditActivity={(f) => setEditActivity(f)}
        onTestPress={openTest}
        dayTheme={selectedDay ? dayThemesByDate[selectedDay.date] ?? null : null}
      />

      {/* Energy session preview overlay */}
      {energyPreview && (
        <EnergyPreviewOverlay
          event={energyPreview}
          athleteId={athleteId ?? ""}
          onClose={() => setEnergyPreview(null)}
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

      {/* Test preview / fill drawer */}
      <TestEntryPage
        testId={testPreviewId}
        athleteId={athleteId ?? ""}
        coachName={coachName}
        onClose={() => setTestPreviewId(null)}
      />

      {/* Mesure biométrique planifiée → saisie mensurations/photos */}
      {mensuOpen && (
        <MensurationsDrawer
          athleteId={athleteId ?? ""}
          viewOnly={viewOnly}
          initialNew
          onClose={() => setMensuOpen(false)}
        />
      )}

      {/* Bulles d'aide après le premier lancement */}
      {!viewOnly && <TodayTips uid={authUser?.id} />}

      {/* Nouvel événement (compétition, stage, voyage, examen, autre) */}
      {eventForm && (
        <EventFormPage
          athleteId={athleteId ?? ""}
          coachId={myCoachId}
          coachName={coachName}
          initialType={eventForm}
          onClose={() => setEventForm(null)}
        />
      )}

      {/* Toutes les compétitions */}
      {showAllComps && (
        <AllCompetitionsSheet
          competitions={allCompetitions}
          viewOnly={viewOnly}
          onClose={() => setShowAllComps(false)}
        />
      )}

    </>
  );
}
