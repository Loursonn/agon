import { AllCompetitionsSheet } from "@/features/athlete/components/AllCompetitionsSheet";
import { AthletePageHeader } from "@/features/athlete/components/AthletePageHeader";
import { C } from "@/lib/theme";
import { CalendarDays, Check, GraduationCap, Plane, Trash2, Trophy } from "lucide-react";
import { CitationFigure } from "@/features/shared/components/CitationDuJour";
import { CoachRetourCard } from "@/features/athlete/components/CoachRetourCard";
import { CompetitionDayCard, type CompetitionDayCardData } from "@/features/athlete/components/CompetitionDayCard";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
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
      <div style={{ maxWidth: isDesktop ? 1248 : 480, margin: "0 auto" }}>
      {/* En-tête — symbole, date, prénom, citation (maquette « Aujourd'hui ») */}
      <AthletePageHeader
        title={<>Bonjour,<br />{athleteProfile?.first_name ?? athleteProfile?.full_name?.split(" ")[0] ?? "athlète"}</>}
        titleSize={30}
        titleGap={24}
        padding="52px 20px 22px"
        background={`${C.bg} url(/maquette/accueil-fond.svg) center/cover no-repeat`}
        decor={<TodayDial />}
      >
        {show("quote") && <CitationFigure />}
      </AthletePageHeader>
      <div
        style={{
          padding: "22px 20px 24px",
          scrollbarWidth: "none", display: "flex", flexDirection: "column", gap: 28,
        }}
      >

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
              style={{ display: "flex", flexDirection: "column", gap: 4, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}
            >
              <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.tx3 }}>
                Sur ta séance du {new Date(recentFb.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
              </span>
              <span style={fbExpanded
                ? { fontSize: 13, color: C.tx, lineHeight: 1.5, whiteSpace: "pre-wrap" as const, fontStyle: "italic" }
                : { fontSize: 13, color: C.tx, lineHeight: 1.5, fontStyle: "italic", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                « {recentFb.note} »
              </span>
            </button>
          ) : null;
          return (
            <TodaySection
              num={sec()}
              title="Retour du coach"
              right={unreadRetours.length > 0 ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6, ...MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: TYPE_COLOR.energie }}>
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: TYPE_COLOR.energie }} />
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
            right={weekCount.planned > 0 ? <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{weekCount.done} / {weekCount.planned} faites</span> : undefined}
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
                <div style={{ borderRadius: 12, padding: 14, border: "1px dashed " + C.brdL, textAlign: "center" }}>
                  <div style={{ fontSize: 13, color: C.tx2 }}>Aucun événement prévu</div>
                  <div style={{ fontSize: 12, color: C.tx3, marginTop: 4 }}>Ajoute tes compétitions et indisponibilités pour que ton coach adapte le planning</div>
                </div>
              );
              return upcoming.map((evt) => {
                const isComp = evt.source === "competition";
                const tint = isComp ? ROUGE : TYPE_COLOR.hyrox;
                const Icon = isComp ? Trophy : evt.kind === "voyage" ? Plane : evt.kind === "examen" ? GraduationCap : CalendarDays;
                return (
                <div key={evt.source + evt.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <TintCard color={tint} onClick={isComp ? () => setShowAllComps(true) : undefined}>
                    <Icon size={18} color={tint} strokeWidth={1.75} style={{ flex: "none" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: C.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{evt.title}</span>
                        {evt.isNew && <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px", borderRadius: 999, background: C.ac, color: C.bg, ...MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500, whiteSpace: "nowrap", flex: "none" }}>Nouveau</span>}
                      </div>
                      <div style={{ ...MONO, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.tx2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {fmtShortDay(evt.start)}{evt.end !== evt.start ? ` → ${fmtShortDay(evt.end)}` : ""} · <span style={{ color: tint }}>{eventTag(evt)}</span>
                      </div>
                    </div>
                    {!isComp && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelEvt((cur) => (cur === evt.id ? null : evt.id)); }}
                      aria-label="Supprimer l'événement"
                      style={{ width: 28, height: 28, flex: "none", borderRadius: 8, border: "1px solid " + C.brdL, background: "none", cursor: "pointer", color: confirmDelEvt === evt.id ? ROUGE : C.tx3, display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <Trash2 size={13} />
                    </button>
                    )}
                  </TintCard>
                  {!isComp && confirmDelEvt === evt.id && (
                    <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid " + ROUGE + "66" }}>
                      <div style={{ fontSize: 13, color: C.tx2, marginBottom: 10 }}>Supprimer cet événement ? Ton coach ne le verra plus sur le planning.</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setConfirmDelEvt(null)} style={{ flex: 1, height: 40, borderRadius: 10, border: "1px solid " + C.brdL, background: "transparent", color: C.tx, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
                        <button onClick={() => { deleteLifeEvent({ id: evt.id, athlete_id: athleteId ?? "" }); setConfirmDelEvt(null); }} style={{ flex: 1, height: 40, borderRadius: 10, border: "1px solid " + ROUGE + "66", background: "transparent", color: ROUGE, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Supprimer</button>
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
          const tint = TYPE_COLOR.hyrox;
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
              <div style={{ borderRadius: 12, border: `1px solid ${tint}73`, background: `${tint}1F`, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ ...MONO, fontSize: 24, color: C.tx }}>{consumed > 0 ? consumed.toLocaleString("fr-FR") : "—"}</span>
                  {zoneLabel && <span style={{ ...MONO, fontSize: 12, color: C.tx3 }}>/ {zoneLabel} kcal</span>}
                  <span style={{ flex: 1 }} />
                  <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: meta.color, border: `1px solid ${meta.color}`, borderRadius: 999, padding: "2px 8px" }}>{meta.label}</span>
                </div>
                {zone && (
                  <div style={{ position: "relative", height: 8, borderRadius: 4, background: "rgba(231,211,168,0.10)", overflow: "hidden" }}>
                    <span aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: pct(zone.targetMin), width: `calc(${pct(zone.targetMax)} - ${pct(zone.targetMin)})`, background: TYPE_COLOR.fait + "40" }} />
                    <span aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: pct(consumed), background: tint, borderRadius: 4 }} />
                  </div>
                )}
                {consumed <= 0 ? (
                  <div style={{ fontSize: 13, color: C.tx3 }}>Aucune saisie aujourd'hui.</div>
                ) : (
                  <div style={{ display: "flex", gap: 14 }}>
                    {[
                      { l: "G", v: nl?.glucides_consumed, c: MACRO_COLOR.g },
                      { l: "L", v: nl?.lipides_consumed, c: MACRO_COLOR.l },
                      { l: "P", v: nl?.proteines_consumed, c: MACRO_COLOR.p },
                    ].map((m) => (
                      <span key={m.l} style={{ display: "flex", alignItems: "center", gap: 5, ...MONO, fontSize: 12, color: C.tx2 }}>
                        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: m.c }} />
                        {m.l} {m.v ?? "—"} g
                      </span>
                    ))}
                  </div>
                )}
                {left && <div style={{ fontSize: 13, color: C.tx2 }}>{left}</div>}
                {!left && ev && (
                  <div style={{ fontSize: 13, color: ev.status === "ok" ? TYPE_COLOR.fait : ev.status === "close" ? TYPE_COLOR.hyrox : ROUGE }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {todayComps.map((c) => (
              <CompetitionDayCard key={c.id} competition={c} viewOnly={viewOnly} />
            ))}
          </div>
        )}

          </>);
          const s06 = (<div data-tip="seance" style={{ display: "contents" }}>
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
              right={totalToday > 0 ? <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{totalToday} prévue{totalToday > 1 ? "s" : ""}</span> : undefined}
            >
              {totalToday === 0 ? (
                <div style={{ borderRadius: 12, padding: "16px 14px", border: "1px solid " + C.brd, background: C.s1, textAlign: "center" }}>
                  <div style={{ ...DISPLAY, fontSize: 16, color: C.tx, marginBottom: 4 }}>Récupération</div>
                  <div style={{ fontSize: 13, color: C.tx3 }}>Rien de prévu, profite pour te reposer.</div>
                </div>
              ) : !hasPending ? (
                <div style={{ borderRadius: 12, padding: "16px 14px", border: "1px solid " + TYPE_COLOR.fait + "73", background: TYPE_COLOR.fait + "1F", textAlign: "center" }}>
                  <div style={{ marginBottom: 6 }}><Check size={26} color={TYPE_COLOR.fait} /></div>
                  <div style={{ ...DISPLAY, fontSize: 16, color: TYPE_COLOR.fait }}>
                    {totalToday > 1 ? "Séances terminées" : "Séance terminée"}
                  </div>
                  <div style={{ fontSize: 13, color: C.tx3, marginTop: 4 }}>Bien joué, récupère bien.</div>
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
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", borderRadius: 6,
                border: "1px dashed " + C.brdL, background: C.s1,
                color: C.tx3, fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit", minHeight: 44,
              }}
            >
              <span>Faire une autre séance cette semaine</span>
              <span style={{ fontSize: 10 }}>{showOtherSessions ? "▲" : "▼"}</span>
            </button>

            {showOtherSessions && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
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
                    style={{
                      width: "100%", padding: "12px 14px", borderRadius: 6,
                      border: "1px solid " + C.coach + "40", background: C.coachS,
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{s.sessionName}</div>
                      <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>
                        Planifiée {new Date(s.scheduledDate + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long" })}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.coach }}>
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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.tx3 }}>{bio ? "Biométrie" : "Test"}</div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: C.tx, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
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
                style={{
                  position: "relative", overflow: "hidden", width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: C.tx,
                  borderRadius: 14, border: `1px solid ${ROUGE}73`, background: "#2A1D17 url(/maquette/competition-fond.svg) center/cover",
                  padding: "12px 14px 12px 17px", display: "flex", flexDirection: "column", gap: 6,
                }}
              >
                <span aria-hidden style={{ position: "absolute", inset: 0, background: "rgba(21,18,15,0.72)" }} />
                <span aria-hidden style={{ position: "absolute", inset: 0, background: `${ROUGE}1A` }} />
                <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: ROUGE }} />
                <span style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, width: "100%", whiteSpace: "nowrap" }}>
                  <span style={{ ...DISPLAY, fontSize: 14, fontWeight: 500, letterSpacing: "0.08em", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{nextComp.name}</span>
                  <span style={{ flex: 1 }} />
                  <TypePill color={ROUGE}>{priorityLabel(nextComp.priority)}</TypePill>
                </span>
                <span style={{ position: "relative", display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
                  <span style={{ ...MONO, fontSize: 22, color: ROUGE, flex: "none" }}>{nextComp.daysUntil === 0 ? "J" : `J-${nextComp.daysUntil}`}</span>
                  <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                <button type="button" onClick={() => setShowAllComps(true)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, background: C.s1, border: `1px solid ${C.brd}`, whiteSpace: "nowrap", width: "100%", cursor: "pointer", fontFamily: "inherit", color: C.tx, textAlign: "left" }}>
                  <span style={{ fontSize: 12, color: C.tx3 }}>Puis</span>
                  <span style={{ ...DISPLAY, fontSize: 12.5, letterSpacing: "0.08em", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{then.name}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ ...MONO, fontSize: 12, color: ROUGE }}>{j === 0 ? "J" : `J-${j}`}</span>
                  <span style={{ ...MONO, fontSize: 11, color: C.tx2 }}>· {then.priority}</span>
                </button>
              );
            })()}
            {!nextComp && (
              <div style={{ borderRadius: 12, padding: 16, border: "1px dashed " + C.brdL, textAlign: "center" }}>
                <div style={{ fontSize: 13, color: C.tx3, marginBottom: myCoachId ? 10 : 0 }}>Aucune compétition prévue</div>
                {myCoachId && (
                  <button
                    onClick={() => setEventForm("competition")}
                    style={{ height: 44, padding: "0 18px", borderRadius: 12, border: "1px solid " + C.brdL, background: "transparent", color: C.tx, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Ajouter une compétition
                  </button>
                )}
              </div>
            )}
            {uncommentedComps.length > 0 && (
              <>
                <div style={{ ...MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: TYPE_COLOR.competition, marginTop: 4 }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx3 }}>Forme moyenne · 7 j</span>
              <span style={{ flex: 1 }} />
              <span style={{ ...MONO, fontSize: 18, lineHeight: 1, color: formeColor }}>
                {avgFormeScore ?? "—"}
                {avgFormeScore != null && <span style={{ fontSize: 11, color: C.tx3 }}> / 100</span>}
              </span>
              {avgFormeScore != null && <TypePill color={formeColor}>{formeLabel}</TypePill>}
            </div>
            <TodayFormeTrend scores={wellnessTrend.map((d) => d.score)} color={formeColor} />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {[wellnessTrend[0].iso, wellnessTrend[wellnessTrend.length - 1].iso].map((iso) => (
                <span key={iso} style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx3 }}>
                  {new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                </span>
              ))}
            </div>

            {(formeAdvice.length > 0 || wellnessBand(avgFormeScore)?.tone === "good") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(formeAdvice.length > 0
                  ? formeAdvice
                  : [{ icon: <Check size={16} />, label: "Forme", text: "bonne, continue sur ta lancée.", color: C.g }]
                ).map((tip) => (
                  <div
                    key={tip.label}
                    style={{
                      position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 12px 9px 15px", borderRadius: 10, border: `1px solid ${tip.color}66`, background: `${tip.color}1A`,
                    }}
                  >
                    <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: tip.color }} />
                    <span style={{ display: "flex", flex: "none", color: tip.color }}>{tip.icon}</span>
                    <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.4 }}>
                      <span style={{ color: tip.color, fontWeight: 500 }}>{tip.label}</span> · {tip.text}
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
          const col = { display: "flex", flexDirection: "column", gap: 28, minWidth: 0 } as const;
          return (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 24, alignItems: "start" }}>
                <div style={col}>{s01}{s02}</div>
                <div style={col}>{s03}{s04}{s05}</div>
                <div style={col}>{sComp}{s07}{s08}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)", gap: 24, alignItems: "start" }}>
                <div style={col}>{s06}</div>
                <div style={col}>{s09}</div>
              </div>
            </>
          );
        })()}

        <div aria-hidden style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "6px 0 0", opacity: 0.55 }}>
          <img src="/maquette/agon-grec.svg" alt="" style={{ height: 14 }} />
          <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.2em", color: C.tx3 }}>LA PROGRESSION PAR LE PLAN</span>
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
