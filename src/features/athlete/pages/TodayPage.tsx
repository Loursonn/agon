import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { C } from "@/lib/theme";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { TodaySection, SectionLink, SectionAdd } from "@/features/athlete/components/today/TodaySection";
import { TodayWellnessCard } from "@/features/athlete/components/today/TodayWellnessCard";
import { TodayWeekStrip, type WeekStripDay } from "@/features/athlete/components/today/TodayWeekStrip";
import { TodayThemeCard } from "@/features/athlete/components/today/TodayThemeCard";
import { TodaySessionCard } from "@/features/athlete/components/today/TodaySessionCard";
import { TodayFormeTrend } from "@/features/athlete/components/today/TodayFormeTrend";
import { TintCard } from "@/features/athlete/components/today/TintCard";
import { TypePill } from "@/features/athlete/components/today/TypePill";
import { TYPE_COLOR, TYPE_LABEL, ROUGE, MACRO_COLOR } from "@/lib/peps";
import { MONO, DISPLAY } from "@/features/shared/components/seance/seanceUi";
import { useDayThemesRange } from "@/features/shared/hooks/useDayThemes";
import { DayThemeBanner } from "@/features/shared/components/DayThemePill";
import {
  indexDayThemesByDate,
  type DayThemeLike,
} from "@/lib/dayTheme";
import { CitationFigure } from "@/features/shared/components/CitationDuJour";
import { AthletePageHeader } from "@/features/athlete/components/AthletePageHeader";
import { TodayDial } from "@/features/athlete/components/today/TodayDial";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useTodayWellness } from "@/features/shared/hooks/useTodayWellness";
import { useReadinessScore } from "@/features/shared/hooks/useReadinessScore";
import { useUpcomingCompetition } from "@/features/shared/hooks/useUpcomingCompetition";
import { useWeekProgram } from "@/features/shared/hooks/useWeekProgram";
import { WatchPushBadge } from "@/features/athlete/components/today/WatchPushBadge";
import { TodayWorkoutFiches } from "@/features/athlete/components/fiches/TodayWorkoutFiches";
import { useActivePlan } from "@/features/shared/hooks/useActivePlan";
import { useStartUnplannedSession } from "@/features/shared/hooks/useStartUnplannedSession";
import { useUnifiedCalendar } from "@/features/shared/hooks/useUnifiedCalendar";
import type { UnifiedCalendarEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { useEnergySession } from "@/features/shared/hooks/useEnergySessions";
import { useCompleteEnergyAssignment, useUpdateEnergyAssignment, useUpsertEnergyRpe } from "@/features/shared/hooks/useEnergyAssignments";
import { SessionPreviewModal } from "@/features/coach/components/energy/SessionPreviewModal";
import type { EnergyStep, EnergyInterval, BlockLogs } from "@/types/energy";
import { Check, Zap, Dumbbell } from "lucide-react";
import { AgonIcon } from "@/components/ui/AgonIcon";
import { TestEntryPage } from "@/features/athlete/components/TestEntryPage";
import { MensurationsDrawer } from "@/features/athlete/components/MensurationsDrawer";
import { useCompetitions } from "@/hooks/useCompetitions";
import { priorityLabel } from "@/types/planning";
import { CompetitionDayCard, type CompetitionDayCardData } from "@/features/athlete/components/CompetitionDayCard";
import { useHomeHiddenSections } from "@/features/shared/hooks/useHomeSections";
import { RunDistanceInput, initialRunDistance, runDistancePayload, type RunDistanceValue } from "@/features/shared/components/RunDistanceInput";
import type { DayProgram, SessionPreviewItem } from "@/features/shared/hooks/useWeekProgram";
import { formatSetsReps, hasIso } from "@/lib/formatSetsReps";
import type { WeekSession } from "@/features/shared/hooks/useActivePlan";
import type { FreeSession } from "@/features/shared/types/athlete";
import { evaluateNutritionDay, type NutritionStrategy, type NutritionDailyLog } from "@/lib/nutrition";
import { localISO, normalizeDayMap } from "@/lib/date";
import { calcScore, wellnessColor, getReco } from "@/lib/wellness";
import { averageScore, wellnessBand } from "@shared/domain/wellness";
import { loadDraft, saveDraft, clearDraft, energyDraftKey } from "@/lib/localDraft";
import { queueIsDurable } from "@/lib/offline/writes";
import { FreeActivityModal } from "@/features/athlete/components/FreeActivityModal";
import { useAthleteRetours, useReactWeeklyRetour } from "@/features/shared/hooks/useWeeklyCoachRetour";
import { CoachRetourCard } from "@/features/athlete/components/CoachRetourCard";
import { useAthleteCoaches } from "@/features/shared/hooks/useCoCoach";
import { useRunningVolume, type RunMatch } from "@/features/shared/hooks/useRunningVolume";
import { watchRunMeasure, watchRunText } from "@/lib/watchRunLabel";
import { useLifeEvents, useDeleteLifeEvent } from "@/hooks/useLifeEvents";
import { EventFormPage } from "@/features/athlete/components/EventFormPage";
import { TodayTips } from "@/features/athlete/components/today/TodayTips";
import { useAuth } from "@/hooks/useAuth";
import { competitionAfter, eventTag, upcomingEvents } from "@/lib/athleteEvents";
import { AllCompetitionsSheet } from "@/features/athlete/components/AllCompetitionsSheet";
import { CalendarDays, GraduationCap, Plane, Trash2, Trophy } from "lucide-react";
import { daysUntil } from "@/api/competitions";

// ── Helpers ───────────────────────────────────────────────────────────────────

function haptic() {
  if (navigator.vibrate) navigator.vibrate(10);
}

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS_FR = ["jan", "fév", "mar", "avr", "mai", "jun", "jul", "aoû", "sep", "oct", "nov", "déc"];

function todayFr(): string {
  const d = new Date();
  return `${DAYS_FR[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
}

/** « 18 NOV. » : jour court d'une date ISO, pour les cartes de l'accueil. */
function fmtShortDay(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// FreeActivityModal + SPORTS imported from @/features/athlete/components/FreeActivityModal

// ── Day preview bottom sheet ──────────────────────────────────────────────────

const DAYS_FULL_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/** Prescription courte d'un exercice de ProgSession (« 4 × 8 »). */
function previewDetail(it: SessionPreviewItem): string {
  if (it.mode === "libre" || !it.params) return it.mode === "libre" ? "Libre" : "";
  return formatSetsReps(it.params) + (hasIso(it.params) ? " · Iso" : "");
}

interface DayPreviewSheetProps {
  day: DayProgram | null;
  onClose: () => void;
  onStartSession: (sess: DayProgram["sessions"][number]["session"], workoutLogId?: string) => void;
  freeSessions: FreeSession[];
  energyByDate: Map<string, UnifiedCalendarEvent[]>;
  onEnergyPreview: (ev: UnifiedCalendarEvent) => void;
  onAddActivity: (date: string) => void;
  onEditActivity: (session: FreeSession) => void;
  onTestPress: (id: string) => void;
  competitionsByDate: Map<string, CompetitionDayCardData[]>;
  viewOnly?: boolean;
  dayTheme?: DayThemeLike | null;
  /** Sortie de montre rattachée à chaque séance énergie prévue (par id d'assignation) */
  watchByPlanned?: Map<string, RunMatch>;
}

function DayPreviewSheet({ day, onClose, onStartSession, freeSessions, energyByDate, onEnergyPreview, onAddActivity, onEditActivity, onTestPress, competitionsByDate, viewOnly, dayTheme, watchByPlanned }: DayPreviewSheetProps) {
  if (!day) return null;
  const date = new Date(day.date + "T12:00:00");
  const dateLabel = `${DAYS_FULL_FR[day.dow]} ${date.getDate()} ${MONTHS_FR[date.getMonth()]}`;
  const todayISO = localISO();
  const isToday = day.date === todayISO;
  const isPast  = day.date < todayISO;
  const isFuture = day.date > todayISO;
  const dayEnergySessions = energyByDate.get(day.date) ?? [];
  const dayComps = competitionsByDate.get(day.date) ?? [];
  const empty   = day.sessions.length === 0 && day.tests.length === 0 && dayEnergySessions.length === 0 && dayComps.length === 0;
  const dayFreeActivities = freeSessions.filter((f) => f.date === day.date && f.sport);

  const ENERGY_KIND_COLOR: Record<string, string> = {
    vo2: "#FFC933", tempo: "#33B5FF", seuil: "#F59E0B",
    footing: "#10B981", fartlek: "#EF4444", specifique: "#F5A623", autre: "#6B7280", custom: "#6B7280",
  };
  const ENERGY_KIND_LABEL: Record<string, string> = {
    vo2: "VO₂", tempo: "Tempo", seuil: "Seuil",
    footing: "Footing", fartlek: "Fartlek", specifique: "Spécifique", autre: "Autre", custom: "Custom",
  };

  return (
    <Drawer open={!!day} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent style={{ background: C.s1, borderTop: "1px solid " + C.brd, padding: "0 0 32px" }}>
        <DrawerHeader style={{ padding: "16px 20px 8px" }}>
          <DrawerTitle style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>
            {dateLabel}
            {isToday && (
              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: C.coachS, color: C.coach }}>
                Aujourd'hui
              </span>
            )}
          </DrawerTitle>
        </DrawerHeader>

        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Hors du test `empty` : un jour sans séance peut très bien porter un
              thème (« Repos complet »), et c'est justement là qu'il informe. */}
          <DayThemeBanner theme={dayTheme} />

          {empty ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: C.tx3, fontSize: 13 }}>
              Jour de repos — rien de prévu
            </div>
          ) : (
            <>
              {/* Jour de compétition — en tête du jour */}
              {dayComps.map((c) => (
                <CompetitionDayCard key={c.id} competition={c} viewOnly={viewOnly} />
              ))}

              {/* Sessions */}
              {day.sessions.map(({ session, exercises: legacyExercises, items, isCompleted, workoutLogId }) => {
                // ProgSession d'abord ; l'ancien asp:exos seulement à défaut
                const exercises = items?.length
                  ? items.map((it) => ({ id: it.id, name: it.name, detail: previewDetail(it) }))
                  : legacyExercises.map((ex) => {
                      const w = ex.weeks ? (Object.values(ex.weeks)[0] as { sets?: number; repsRange?: string } | undefined) : undefined;
                      return { id: ex.id, name: ex.name, detail: w?.sets ? `${w.sets}×${w.repsRange ?? ""}` : "" };
                    });
                return (

                <div
                  key={session.id}
                  style={{
                    background: isCompleted ? C.gS : C.coachS,
                    borderRadius: 6, padding: "14px 16px",
                    border: "1px solid " + (isCompleted ? C.g + "40" : C.coach + "40"),
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: exercises.length ? 10 : 0 }}>
                    <div
                      style={{
                        width: 32, height: 32, borderRadius: 4, flexShrink: 0,
                        background: isCompleted ? C.g + "20" : C.coach + "20",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16,
                      }}
                    >
                      {isCompleted ? <Check size={16} color={C.g} /> : <Dumbbell size={16} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{session.name}</div>
                      <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>
                        {session.short} · {exercises.length} exercice{exercises.length !== 1 ? "s" : ""}
                        {isCompleted ? " · Complétée ✓" : isPast ? " · Manquée" : ""}
                      </div>
                    </div>
                  </div>

                  {/* Exercise preview (up to 5) */}
                  {exercises.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: isCompleted || isPast ? 0 : 10 }}>
                      {exercises.slice(0, 5).map((ex) => (
                        <div
                          key={ex.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "6px 10px", borderRadius: 4, background: C.s2,
                          }}
                        >
                          <div style={{ fontSize: 11, color: C.tx, flex: 1 }}>{ex.name}</div>
                          {ex.detail && (
                            <div style={{ fontSize: 10, color: C.tx3 }}>{ex.detail}</div>
                          )}
                        </div>
                      ))}
                      {exercises.length > 5 && (
                        <div style={{ fontSize: 10, color: C.tx3, paddingLeft: 10 }}>
                          +{exercises.length - 5} exercice{exercises.length - 5 !== 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  )}

                  {!isCompleted && !isPast && !viewOnly && (
                    <button
                      onClick={() => { onStartSession(session, workoutLogId); onClose(); haptic(); }}
                      style={{
                        width: "100%", padding: "11px 0", borderRadius: 4,
                        border: "none", background: C.acV, color: "#0E0C0A",
                        fontSize: 13, fontWeight: 700, cursor: "pointer",
                        fontFamily: "inherit", minHeight: 44,
                      }}
                    >
                      Démarrer ▶
                    </button>
                  )}
                </div>
                );
              })}

              {/* Séances énergie */}
              {dayEnergySessions.map((ev) => {
                const kc = ENERGY_KIND_COLOR[ev.sessionKind ?? ""] ?? "#FFC933";
                const kl = ENERGY_KIND_LABEL[ev.sessionKind ?? ""] ?? ev.sessionKind ?? "Énergie";
                const isDone = ev.status === "completed";
                const watchRun = watchByPlanned?.get(ev.id);
                return (
                  <button
                    key={ev.id}
                    onClick={() => { onEnergyPreview(ev); onClose(); haptic(); }}
                    style={{
                      width: "100%", background: isDone ? C.gS : kc + "12",
                      borderRadius: 6, padding: "14px 16px",
                      border: "1px solid " + (isDone ? C.g + "40" : kc + "40"),
                      display: "flex", alignItems: "center", gap: 12,
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32 }}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter"><path d="M13 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM7 21l3-9 3 2v7M5 16l3-4 3 2M14 8l4 2 3-3"/></svg></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{ev.title}</div>
                      <div style={{ fontSize: 10, marginTop: 2, fontWeight: 600, color: kc }}>
                        {kl} · {isDone ? "Complétée ✓" : watchRun ? watchRunText(watchRun) : isPast ? "Manquée" : "À faire"}
                        {isDone && watchRun && <span style={{ color: C.g }}> · {watchRunMeasure(watchRun)}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: C.tx3 }}>Voir →</span>
                  </button>
                );
              })}

              {/* Tests */}
              {day.tests.map((t) => {
                const tc = t.type === "musculation" ? "#FFC933"
                  : t.type === "energetique" ? "#FF5A33"
                  : t.type === "specifique" ? "#F5A623"
                  : "#66F03C";
                return (
                  <button
                    key={t.id}
                    onClick={() => { onTestPress(t.id); onClose(); haptic(); }}
                    style={{
                      width: "100%", background: t.completed ? C.gS : tc + "12",
                      borderRadius: 6, padding: "14px 16px",
                      border: "1px solid " + (t.completed ? C.g + "40" : tc + "40"),
                      display: "flex", alignItems: "center", gap: 12,
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24 }}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{t.title}</div>
                      <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>
                        {t.type === "biometric" ? "biométrie" : t.type} · {t.completed ? "Réalisé ✓" : "À faire"}
                      </div>
                    </div>
                    {t.completed
                      ? <span style={{ fontSize: 18, color: C.g }}>✓</span>
                      : <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: tc + "20", color: tc, flexShrink: 0 }}>Remplir →</span>
                    }
                  </button>
                );
              })}
            </>
          )}

          {/* Free activities logged for this day */}
          {dayFreeActivities.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: empty ? 0 : 4 }}>
              {dayFreeActivities.map((f) => {
                const intColor = f.intensity != null
                  ? (f.intensity <= 3 ? C.g : f.intensity <= 6 ? C.o : C.r)
                  : C.tx3;
                return (
                  <button
                    key={f.id}
                    onClick={() => { onEditActivity(f); onClose(); haptic(); }}
                    style={{
                      width: "100%", background: C.gS, borderRadius: 6, padding: "12px 14px",
                      border: "1px solid " + C.g + "40",
                      display: "flex", alignItems: "center", gap: 12,
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
                    }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 4, background: C.gS, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: C.g }}>{f.sportEmoji ?? "AC"}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{f.name}</div>
                      <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>
                        {f.duration ? `${f.duration} min` : ""}
                        {f.duration && f.intensity != null ? " · " : ""}
                        {f.intensity != null ? <span style={{ color: intColor }}>Intensité {f.intensity}/10</span> : null}
                        {f.note ? ` · "${f.note}"` : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: C.tx3 }}></span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Add free activity button (today + past only) */}
          {!isFuture && (
            <button
              onClick={() => { onAddActivity(day.date); onClose(); haptic(); }}
              style={{
                width: "100%", padding: "11px 0", borderRadius: 4,
                border: "1px dashed " + C.brdL, background: "transparent",
                color: C.tx3, fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                marginTop: (empty && dayFreeActivities.length === 0) ? 0 : 4,
              }}
            >
              + Activité libre
            </button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ── Forme advice ──────────────────────────────────────────────────────────────

const FORM_FIELDS_ICONS: Record<string, React.ReactNode> = {
  fatigue: <AgonIcon name="fatigue" size={16} />,
  sommeil: <AgonIcon name="sommeil" size={16} />,
  stress:  <AgonIcon name="stress" size={16} />,
  energie: <Zap size={16} />,
  doms:    <Dumbbell size={16} />,
};

// Chaque note du wellness va de 1 à 5, 5 = le mieux (voir WELL_ITEMS dans lib/wellness).
// Seuil d'alerte aligné sur getAlerts : 2 ou moins.
type FormeTip = { text: string; tone: "bad" | "good" };
const FORM_FIELDS: Array<{ key: string; label: string; advice: (v: number) => FormeTip | null }> = [
  { key: "fatigue", label: "Récupération",
    advice: (v) => v <= 2 ? { text: "Grande fatigue détectée. Priorise le sommeil et réduis l'intensité cette semaine.", tone: "bad" }
      : v >= 4 ? { text: "Bonne récupération. Tu peux pousser plus fort.", tone: "good" } : null },
  { key: "sommeil", label: "Sommeil",
    advice: (v) => v <= 2 ? { text: "Sommeil insuffisant. Vise 7-9h et couche-toi avant minuit.", tone: "bad" } : null },
  { key: "stress",  label: "Stress",
    advice: (v) => v <= 2 ? { text: "Stress élevé : évite les séances HIIT, préfère l'endurance légère.", tone: "bad" } : null },
  { key: "energie", label: "Énergie",
    advice: (v) => v <= 2 ? { text: "Énergie basse : vérifie tes apports glucidiques avant les séances.", tone: "bad" } : null },
  { key: "doms",    label: "Courbatures",
    advice: (v) => v <= 2 ? { text: "Courbatures importantes. Privilégie du travail léger ou une séance d'activation.", tone: "bad" } : null },
];

function getFormeAdvice(wellness: Record<string, number> | null): Array<{ icon: React.ReactNode; label: string; text: string; color: string }> {
  if (!wellness) return [];
  const tips: Array<{ icon: React.ReactNode; label: string; text: string; color: string }> = [];
  for (const f of FORM_FIELDS) {
    const v = wellness[f.key] as number | undefined;
    if (v == null) continue;
    const tip = f.advice(v);
    if (!tip) continue;
    tips.push({ icon: FORM_FIELDS_ICONS[f.key], label: f.label, text: tip.text, color: tip.tone === "bad" ? "#FF9500" : "#66F03C" });
  }
  return tips;
}

// ── Energy preview overlay ────────────────────────────────────────────────────

function getWorkIntervals(steps: EnergyStep[], parentRepeat = 1): EnergyInterval[] {
  const out: EnergyInterval[] = [];
  for (const step of steps) {
    if (step.type === "interval" && step.role === "work") {
      for (let r = 0; r < parentRepeat; r++)
        out.push({ ...step, id: parentRepeat > 1 ? `${step.id}__r${r}` : step.id });
    } else if (step.type === "group") {
      out.push(...getWorkIntervals(step.children, step.repeat * parentRepeat));
    }
  }
  return out;
}

function fmtIv(iv: EnergyInterval): string {
  const d = iv.duration;
  if (d.kind === "distance" && d.value != null)
    return d.value >= 1000 ? `${(d.value / 1000).toFixed(1)} km` : `${d.value} m`;
  if (d.kind === "time" && d.value != null) {
    const m = Math.floor(d.value / 60), s = d.value % 60;
    return s > 0 ? `${m}min ${s}s` : `${m} min`;
  }
  return iv.notes || "Bloc effort";
}

const FOSTER_LABELS: Record<number, string> = {
  1: "Repos total", 2: "Très facile", 3: "Facile", 4: "Assez difficile",
  5: "Difficile", 6: "Difficile+", 7: "Difficile++", 8: "Très difficile",
  9: "Très difficile+", 10: "Maximal",
};
function rpeColor(v: number) { return v <= 4 ? C.g : v <= 7 ? C.o : C.r; }
function rpeBg(v: number)    { return v <= 4 ? C.gS : v <= 7 ? C.oS : C.rS; }

interface EnergyDraft {
  phase: "preview" | "log" | "rpe";
  localBlocks: BlockLogs;
  globalNote: string;
  actualDuration: string;
  runDist: RunDistanceValue;
}

function EnergyPreviewOverlay({
  event,
  athleteId,
  onClose,
}: {
  event: UnifiedCalendarEvent;
  athleteId: string;
  onClose: () => void;
}) {
  const sessionId    = event.energySessionId ?? (event.raw?.energy_session_id as string | undefined);
  const assignmentId = event.id;
  const isCompleted  = event.status === "completed";

  const [phase, setPhase]               = useState<"preview" | "log" | "rpe">("preview");
  const [localBlocks, setLocalBlocks]   = useState<BlockLogs>({});
  const [globalNote, setGlobalNote]     = useState("");
  const [actualDuration, setActualDuration] = useState<string>("");
  const [runDist, setRunDist]           = useState<RunDistanceValue>(initialRunDistance());
  const [rpeSelected, setRpeSelected]   = useState<number | null>(null);

  const { data: session, isLoading, isError } = useEnergySession(sessionId);
  const complete        = useCompleteEnergyAssignment();
  const updateAssignment = useUpdateEnergyAssignment();
  const upsertRpe       = useUpsertEnergyRpe();

  const workBlocks = getWorkIntervals(session?.intervals ?? []);
  const isComplex  = workBlocks.length > 1;

  // Le brouillon n'est écrit qu'après l'init (sinon il serait écrasé par les défauts).
  const draftReadyRef = useRef(false);
  useEffect(() => {
    if (!session) return;
    if (workBlocks.length > 0) {
      const existing = (event.raw?.block_logs ?? {}) as BlockLogs;
      const init: BlockLogs = {};
      for (const b of workBlocks) init[b.id] = existing[b.id] ?? { done: false, note: "" };
      setLocalBlocks(init);
    }
    if (session.total_duration_s != null)
      setActualDuration(String(Math.round(session.total_duration_s / 60)));
    setRunDist(initialRunDistance(session.total_distance_m));
    // Saisie en cours retrouvée (app fermée/tuée avant « Valider ») : on la
    // restaure par-dessus les valeurs par défaut.
    const draft = !isCompleted && athleteId
      ? loadDraft<EnergyDraft>(energyDraftKey(athleteId, assignmentId), { maxAgeMs: 48 * 3600 * 1000 })
      : null;
    if (draft) {
      const d = draft.value;
      if (d.localBlocks) setLocalBlocks((prev) => ({ ...prev, ...d.localBlocks }));
      if (d.globalNote != null) setGlobalNote(d.globalNote);
      if (d.actualDuration != null) setActualDuration(d.actualDuration);
      if (d.runDist) setRunDist(d.runDist);
      if (d.phase === "log") setPhase("log");
    }
    draftReadyRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  // Brouillon local de la saisie en cours (par athlète + séance du jour), écrit
  // à chaque modification pendant la saisie, purgé une fois la validation confirmée.
  const energyDraft: EnergyDraft = { phase, localBlocks, globalNote, actualDuration, runDist };
  const energyDraftJson = JSON.stringify(energyDraft);
  useEffect(() => {
    if (!draftReadyRef.current || isCompleted || !athleteId || phase !== "log" || complete.isSuccess) return;
    saveDraft(energyDraftKey(athleteId, assignmentId), JSON.parse(energyDraftJson));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [energyDraftJson]);
  useEffect(() => {
    // Gardée en file sans IndexedDB (perdue au rechargement) : brouillon gardé.
    const queued = (complete.data as { status?: string } | undefined)?.status === "queued";
    if (complete.isSuccess && athleteId && (!queued || queueIsDurable())) clearDraft(energyDraftKey(athleteId, assignmentId));
  }, [complete.isSuccess, complete.data, athleteId, assignmentId]);

  function handleValidate() {
    const logs: BlockLogs = isComplex ? localBlocks : {};
    const durationMin = actualDuration !== "" ? parseInt(actualDuration, 10) : undefined;
    complete.mutate({
      id: assignmentId, athleteId,
      block_logs: logs,
      notes: globalNote || undefined,
      actual_duration_min: durationMin && !isNaN(durationMin) ? durationMin : undefined,
      ...runDistancePayload(runDist),
    });
  }

  function handleUnvalidate() {
    updateAssignment.mutate(
      { id: assignmentId, athleteId, status: "planned", block_logs: {}, rpe_score: null },
      { onSuccess: onClose },
    );
  }

  if (!sessionId || isError || (!isLoading && !session)) {
    return (
      <>
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.65)" }} />
        <div style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 61,
          transform: "translate(-50%, -50%)",
          width: 420, maxWidth: "96vw",
          background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
          padding: "40px", textAlign: "center", color: C.tx3, fontSize: 13,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        }}>
          <span>Séance introuvable</span>
          <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Fermer</button>
        </div>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.65)" }} />
        <div style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 61,
          transform: "translate(-50%, -50%)",
          width: 420, maxWidth: "96vw",
          background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
          padding: "40px", textAlign: "center", color: C.tx3, fontSize: 13,
        }}>Chargement…</div>
      </>
    );
  }
  if (!session) return null;

  // ── Phase RPE ──────────────────────────────────────────────────────────────
  if (phase === "rpe" || complete.isSuccess) {
    return (
      <>
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.65)" }} />
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 61,
          background: C.s1, borderRadius: "6px 6px 0 0", borderTop: "1px solid " + C.brd,
          padding: "24px 20px 40px",
        }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.brdL, margin: "0 auto 20px" }} />
          <div style={{ fontSize: 16, fontWeight: 800, color: C.tx, marginBottom: 4 }}>Comment s'est passée la séance ?</div>
          <div style={{ fontSize: 12, color: C.tx3, marginBottom: 24 }}>Évalue ton effort global (échelle Foster 1-10)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
            {[1,2,3,4,5,6,7,8,9,10].map(v => (
              <button key={v} onClick={() => setRpeSelected(v)} style={{
                padding: "14px 0", borderRadius: 6,
                border: "1px solid " + (rpeSelected === v ? rpeColor(v) + "80" : C.brdL),
                background: rpeSelected === v ? rpeBg(v) : C.s2,
                color: rpeSelected === v ? rpeColor(v) : C.tx2,
                fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              }}>{v}</button>
            ))}
          </div>
          <div style={{
            minHeight: 28, textAlign: "center", marginBottom: 28, fontSize: 13, fontWeight: 600,
            color: rpeSelected != null ? rpeColor(rpeSelected) : C.tx3,
            background: rpeSelected != null ? rpeBg(rpeSelected) : "transparent",
            borderRadius: 4, padding: "4px 12px",
          }}>
            {rpeSelected != null ? `${rpeSelected}/10 — ${FOSTER_LABELS[rpeSelected]}` : "Sélectionne une valeur"}
          </div>
          <button
            onClick={() => {
              if (rpeSelected != null)
                upsertRpe.mutate({ id: assignmentId, athleteId, rpe_score: rpeSelected }, { onSettled: onClose });
              else
                onClose();
            }}
            disabled={upsertRpe.isPending}
            style={{
              width: "100%", padding: "15px 0", borderRadius: 6, border: "none",
              background: rpeSelected != null ? C.ac : C.s2,
              color: rpeSelected != null ? "#fff" : C.tx3,
              fontSize: 14, fontWeight: 700, cursor: rpeSelected != null ? "pointer" : "default",
              fontFamily: "inherit",
            }}
          >{upsertRpe.isPending ? "Enregistrement…" : "Enregistrer"}</button>
          <button onClick={onClose} style={{
            width: "100%", marginTop: 12, padding: "10px 0", border: "none",
            background: "transparent", color: C.tx3, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          }}>Passer</button>
        </div>
      </>
    );
  }

  // ── Phase LOG ──────────────────────────────────────────────────────────────
  if (phase === "log") {
    const allBlocksDone = workBlocks.length === 0 || workBlocks.every(b => localBlocks[b.id]?.done);
    return (
      <>
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.65)" }} />
        <div style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 61,
          transform: "translate(-50%, -50%)",
          width: 480, maxWidth: "96vw", maxHeight: "88vh",
          background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "14px 18px", borderBottom: "1px solid " + C.brd, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <button onClick={() => setPhase("preview")} style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← Retour</button>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.tx }}>{session.name}</div>
          </div>
          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", scrollbarWidth: "none" }}>
            {isComplex && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 }}>
                  Blocs d'effort
                </div>
                {workBlocks.map((b, i) => {
                  const done = localBlocks[b.id]?.done ?? false;
                  return (
                    <div key={b.id} style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "10px 0", borderBottom: i < workBlocks.length - 1 ? "1px solid " + C.brdL : "none",
                    }}>
                      <button
                        onClick={() => setLocalBlocks(prev => ({ ...prev, [b.id]: { ...prev[b.id], done: !done } }))}
                        style={{
                          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                          border: "1.5px solid " + (done ? C.g : C.brdL),
                          background: done ? C.g + "20" : "transparent",
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {done && <Check size={13} color={C.g} />}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: done ? C.tx3 : C.tx, marginBottom: 4 }}>
                          Bloc {i + 1} — {fmtIv(b)}
                        </div>
                        <input
                          placeholder="Note (optionnel)"
                          value={localBlocks[b.id]?.note ?? ""}
                          onChange={e => setLocalBlocks(prev => ({ ...prev, [b.id]: { ...prev[b.id], note: e.target.value } }))}
                          style={{
                            width: "100%", padding: "6px 10px", borderRadius: 4,
                            border: "1px solid " + C.brdL, background: C.s2,
                            color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            {/* Durée réelle */}
            <div style={{ marginTop: isComplex ? 16 : 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>
                Durée réelle (min)
              </div>
              <input
                type="number" min={1} max={300}
                value={actualDuration}
                onChange={e => setActualDuration(e.target.value)}
                placeholder="Durée en minutes"
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 4,
                  border: "1px solid " + C.brdL, background: C.s2,
                  color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            {/* Activité + km (volume de course) */}
            <div style={{ marginTop: 16 }}>
              <RunDistanceInput value={runDist} onChange={setRunDist} />
            </div>
            {/* Note globale */}
            <textarea
              placeholder="Note sur la séance…"
              value={globalNote}
              onChange={e => setGlobalNote(e.target.value)}
              rows={2}
              style={{
                width: "100%", marginTop: 12, padding: "8px 10px", borderRadius: 4,
                border: "1px solid " + C.brdL, background: C.s2,
                color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none",
                resize: "none", boxSizing: "border-box",
              }}
            />
          </div>
          {/* Footer */}
          <div style={{ padding: "12px 18px", borderTop: "1px solid " + C.brd, flexShrink: 0 }}>
            <button
              onClick={handleValidate}
              disabled={complete.isPending || (isComplex && !allBlocksDone)}
              style={{
                width: "100%", padding: "11px 0", borderRadius: 4, border: "none",
                background: (isComplex && !allBlocksDone) ? C.s2 : C.g,
                color: (isComplex && !allBlocksDone) ? C.tx3 : "#fff",
                fontSize: 13, fontWeight: 700,
                cursor: complete.isPending || (isComplex && !allBlocksDone) ? "default" : "pointer",
                fontFamily: "inherit", opacity: complete.isPending ? 0.7 : 1,
              }}
            >
              {complete.isPending ? "Validation…" : "Valider la séance ✓"}
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Phase PREVIEW ─────────────────────────────────────────────────────────
  return (
    <SessionPreviewModal
      session={session}
      athleteId={athleteId}
      onClose={onClose}
      onValidate={!isCompleted ? () => setPhase("log") : undefined}
      onUnvalidate={isCompleted ? handleUnvalidate : undefined}
    />
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function localMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

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
          const s06 = (<>
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

          </>);
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
