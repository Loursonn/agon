import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { C } from "@/lib/theme";
import { CitationDuJour } from "@/features/shared/components/CitationDuJour";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useTodayWellness } from "@/features/shared/hooks/useTodayWellness";
import { useReadinessScore } from "@/features/shared/hooks/useReadinessScore";
import { useUpcomingCompetition } from "@/features/shared/hooks/useUpcomingCompetition";
import { useWeekProgram } from "@/features/shared/hooks/useWeekProgram";
import { TodayWorkoutFiches } from "@/features/athlete/components/fiches/TodayWorkoutFiches";
import { useActivePlan } from "@/features/shared/hooks/useActivePlan";
import { useStartUnplannedSession } from "@/features/shared/hooks/useStartUnplannedSession";
import { useUnifiedCalendar } from "@/features/shared/hooks/useUnifiedCalendar";
import type { UnifiedCalendarEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { useEnergySession } from "@/features/shared/hooks/useEnergySessions";
import { useCompleteEnergyAssignment, useUpdateEnergyAssignment, useUpsertEnergyRpe } from "@/features/shared/hooks/useEnergyAssignments";
import { SessionPreviewModal } from "@/features/coach/components/energy/SessionPreviewModal";
import type { EnergyStep, EnergyInterval, BlockLogs } from "@/types/energy";
import { Check, Moon, Zap, AlertTriangle, Dumbbell, Heart, Info } from "lucide-react";
import { AgonIcon } from "@/components/ui/AgonIcon";
import { TestFillDrawer } from "@/features/athlete/components/TestFillDrawer";
import { MensurationsDrawer } from "@/features/athlete/components/MensurationsDrawer";
import { useCompetitions } from "@/hooks/useCompetitions";
import { COMPETITION_META } from "@/types/planning";
import { CompetitionDayCard, type CompetitionDayCardData } from "@/features/athlete/components/CompetitionDayCard";
import { RunDistanceInput, initialRunDistance, runDistancePayload, type RunDistanceValue } from "@/features/shared/components/RunDistanceInput";
import type { DayProgram } from "@/features/shared/hooks/useWeekProgram";
import type { WeekSession } from "@/features/shared/hooks/useActivePlan";
import type { FreeSession } from "@/features/shared/types/athlete";
import { evaluateNutritionDay, type NutritionStrategy, type NutritionDailyLog } from "@/lib/nutrition";
import { localISO, normalizeDayMap } from "@/lib/date";
import { FreeActivityModal, SPORTS } from "@/features/athlete/components/FreeActivityModal";
import { useAthleteRetours, useReactWeeklyRetour } from "@/features/shared/hooks/useWeeklyCoachRetour";
import { CoachRetourCard } from "@/features/athlete/components/CoachRetourCard";
import { useLifeEvents, useDeleteLifeEvent } from "@/hooks/useLifeEvents";
import { LifeEventFormModal } from "@/features/athlete/components/LifeEventFormModal";
import { CompetitionFormModal } from "@/features/coach/components/planning/CompetitionFormModal";
import { Plus, Trash2, CalendarDays, Trophy } from "lucide-react";

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

// ── Readiness circle (SVG) ────────────────────────────────────────────────────

function ReadinessCircle({ score, color }: { score: number; color: string }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  // Use gradient for score > 70 (violet→rose), solid color otherwise
  const useGradient = score > 70;
  const gradientId = "scoreGradient";
  return (
    <div style={{ position: "relative", width: 136, height: 136, flexShrink: 0 }}>
      <svg width={136} height={136} viewBox="0 0 136 136" style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFC933" />
            <stop offset="100%" stopColor="#FFC933" />
          </linearGradient>
        </defs>
        <circle cx={68} cy={68} r={r} fill="none" stroke="rgba(231,211,168,0.2)" strokeWidth={10} />
        <circle
          cx={68} cy={68} r={r} fill="none"
          stroke={useGradient ? `url(#${gradientId})` : color}
          strokeWidth={10}
          strokeDasharray={String(circ)}
          strokeDashoffset={String(circ * (1 - score / 100))}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontSize: 30, fontWeight: 900, color: useGradient ? "#FFC933" : color, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>/ 100</div>
      </div>
    </div>
  );
}



// ── Wellness field labels (for readiness display) ─────────────────────────────

const WELL_FIELDS: Array<{ key: string; label: string; icon: React.ReactNode; inv: boolean }> = [
  { key: "fatigue", label: "Fatigue",  icon: <AgonIcon name="fatigue" size={12} />, inv: true  },
  { key: "sommeil", label: "Sommeil",  icon: <Moon size={12} />, inv: false },
  { key: "stress",  label: "Stress",   icon: <AlertTriangle size={12} />, inv: true  },
  { key: "energie", label: "Énergie",  icon: <Zap size={12} />, inv: false },
  { key: "doms",    label: "DOMS",     icon: <Dumbbell size={12} />, inv: true  },
];

// FreeActivityModal + SPORTS imported from @/features/athlete/components/FreeActivityModal

// ── Day preview bottom sheet ──────────────────────────────────────────────────

const DAYS_FULL_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

interface DayPreviewSheetProps {
  day: DayProgram | null;
  onClose: () => void;
  onStartSession: (sess: DayProgram["sessions"][number]["session"]) => void;
  freeSessions: FreeSession[];
  energyByDate: Map<string, UnifiedCalendarEvent[]>;
  onEnergyPreview: (ev: UnifiedCalendarEvent) => void;
  onAddActivity: (date: string) => void;
  onEditActivity: (session: FreeSession) => void;
  onTestPress: (id: string) => void;
  competitionsByDate: Map<string, CompetitionDayCardData[]>;
  viewOnly?: boolean;
}

function DayPreviewSheet({ day, onClose, onStartSession, freeSessions, energyByDate, onEnergyPreview, onAddActivity, onEditActivity, onTestPress, competitionsByDate, viewOnly }: DayPreviewSheetProps) {
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
              {day.sessions.map(({ session, exercises, isCompleted }) => (
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
                          {ex.weeks && Object.values(ex.weeks)[0] && (
                            <div style={{ fontSize: 10, color: C.tx3 }}>
                              {(Object.values(ex.weeks)[0] as { sets?: number; repsRange?: string }).sets}×{(Object.values(ex.weeks)[0] as { sets?: number; repsRange?: string }).repsRange}
                            </div>
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
                      onClick={() => { onStartSession(session); onClose(); haptic(); }}
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
              ))}

              {/* Séances énergie */}
              {dayEnergySessions.map((ev) => {
                const kc = ENERGY_KIND_COLOR[ev.sessionKind ?? ""] ?? "#FFC933";
                const kl = ENERGY_KIND_LABEL[ev.sessionKind ?? ""] ?? ev.sessionKind ?? "Énergie";
                const isDone = ev.status === "completed";
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
                        {kl} · {isDone ? "Complétée ✓" : isPast ? "Manquée" : "À faire"}
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

const FORM_FIELDS = [
  { key: "fatigue", label: "Récupération", inv: true,
    advice: (v: number) => v >= 7 ? "Grande fatigue détectée. Priorise le sommeil et réduis l'intensité cette semaine." : v <= 3 ? "Bonne récupération. Tu peux pousser plus fort." : null },
  { key: "sommeil", label: "Sommeil",      inv: false,
    advice: (v: number) => v <= 4 ? "Sommeil insuffisant. Vise 7-9h et couche-toi avant minuit." : null },
  { key: "stress",  label: "Stress",       inv: true,
    advice: (v: number) => v >= 7 ? "Stress élevé : évite les séances HIIT, préfère l'endurance légère." : null },
  { key: "energie", label: "Énergie",      inv: false,
    advice: (v: number) => v <= 3 ? "Énergie basse : vérifie tes apports glucidiques avant les séances." : null },
  { key: "doms",    label: "DOMS",         inv: true,
    advice: (v: number) => v >= 7 ? "Courbatures importantes. Privilégie du travail léger ou une séance d'activation." : null },
];

function getFormeAdvice(wellness: Record<string, number> | null): Array<{ icon: React.ReactNode; label: string; text: string; color: string }> {
  if (!wellness) return [];
  const tips: Array<{ icon: React.ReactNode; label: string; text: string; color: string }> = [];
  for (const f of FORM_FIELDS) {
    const v = wellness[f.key] as number | undefined;
    if (v == null) continue;
    const tip = f.advice(v);
    if (!tip) continue;
    const isBad = f.inv ? v >= 7 : v <= 3;
    tips.push({ icon: FORM_FIELDS_ICONS[f.key], label: f.label, text: tip, color: isBad ? C.r : C.o });
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

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
  const [selectedDay, setSelectedDay] = useState<DayProgram | null>(null);
  const [activityDate, setActivityDate] = useState<string | null>(null);
  const [editActivity, setEditActivity] = useState<FreeSession | null>(null);
  const [energyPreview, setEnergyPreview] = useState<UnifiedCalendarEvent | null>(null);
  const [showOtherSessions, setShowOtherSessions] = useState(false);
  const [testPreviewId, setTestPreviewId] = useState<string | null>(null);
  const [mensuOpen, setMensuOpen] = useState(false);
  const [showLifeEventForm, setShowLifeEventForm] = useState(false);
  const [showCompForm, setShowCompForm] = useState(false);

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
  const { mutate: reactRetour } = useReactWeeklyRetour();
  const { data: lifeEvents = [] } = useLifeEvents(athleteId ?? "");
  const { mutate: deleteLifeEvent } = useDeleteLifeEvent();
  const myCoachId = profile?.coach_id;

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

  // Mesure biométrique planifiée → formulaire Mensurations/Photos, sinon TestFillDrawer
  const openTest = (id: string) => {
    const t = weekDays.flatMap((d) => d.tests).find((x) => x.id === id);
    if (t?.type === "biometric") setMensuOpen(true);
    else setTestPreviewId(id);
  };
  const nextWorkout = workouts.find((w) => !w.isCompleted) ?? null;
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

  // Badge "2 séances aujourd'hui" : si activePlan a plusieurs workout sessions aujourd'hui
  const todayActivePlanSessions = useMemo((): WeekSession[] => {
    return activePlanData?.weekDays
      .find((d) => d.date === today)
      ?.sessions.filter((s) => s.kind === "workout") ?? [];
  }, [activePlanData, today]);
  const hasTwoSessionsToday = todayActivePlanSessions.length >= 2;

  // ── Coach id (for unplanned session insert) ───────────────────────────────
  // Not directly in AthleteContext — we extract from first workout_log if available
  const coachIdForUnplanned = activePlanData?.weekDays
    .flatMap((d) => d.sessions)
    .find((s) => s.kind === "workout")
    ?.id ? null : null; // No coach_id available in WeekSession — use null

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

  // ── Yesterday's recap ─────────────────────────────────────────────────────
  const yesterdayISO = localISO(new Date(Date.now() - 86400000));
  const yesterdayWellness = wellnessByISO?.[yesterdayISO] as { score?: number } | undefined ?? null;
  const yesterdayDay = weekDays.find((d) => d.date === yesterdayISO);
  const yesterdaySessName = yesterdayDay?.sessions.find((s) => s.isCompleted)?.session.name
    ?? yesterdayDay?.sessions[0]?.session.name
    ?? null;

  // ── Wellness trend (last 14 days) ────────────────────────────────────────
  const wellnessTrend = Array.from({ length: 14 }, (_, i) => {
    const iso = localISO(new Date(Date.now() - (13 - i) * 86400000));
    const w = wellnessByISO?.[iso] as Record<string, number> | null | undefined;
    const score = w ? Math.round(
      ((w.fatigue ?? 3) + (w.sommeil ?? 3) + (w.stress ?? 3) + (w.energie ?? 3) + (w.doms ?? 3)) / 25 * 100
    ) : null;
    return { d: iso.slice(5), score };
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
  const recentScores = wellnessTrend.slice(-7).map((d) => d.score).filter((s): s is number => s !== null);
  const avgFormeScore = recentScores.length > 0
    ? Math.round(recentScores.reduce((a, b) => a + b, 0) / recentScores.length)
    : null;
  const formeColor = avgFormeScore == null ? C.tx3
    : avgFormeScore >= 75 ? C.g
    : avgFormeScore >= 55 ? C.o
    : C.r;
  const formeLabel = avgFormeScore == null ? "—"
    : avgFormeScore >= 75 ? "Excellente"
    : avgFormeScore >= 60 ? "Bonne"
    : avgFormeScore >= 45 ? "Correcte"
    : "À surveiller";

  // Recent coach feedback (14 days)
  const recentFb = useMemo(() => {
    if (!coachFeedbacks) return null;
    return Object.entries(coachFeedbacks)
      .map(([w, fb]: [string, any]) => ({ week: Number(w), ...fb }))
      .filter((fb: any) => fb.note && fb.date && Date.now() - new Date(fb.date).getTime() <= 14 * 86_400_000)
      .sort((a: any, b: any) => (a.date < b.date ? 1 : -1))[0] ?? null;
  }, [coachFeedbacks]);

  return (
    <>
      <div
        style={{
          maxWidth: 480, margin: "0 auto", padding: "16px 16px 32px",
          scrollbarWidth: "none",
        }}
      >
        {/* Section 1 — Greeting + Readiness */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: C.tx3, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.4px" }}>
            {todayFr()}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.tx, letterSpacing: "-0.4px", marginBottom: 16 }}>
            Bonjour, {athleteProfile?.first_name ?? athleteProfile?.full_name?.split(" ")[0] ?? "athlete"}
          </div>

          <div style={{ marginBottom: 16 }}>
            <CitationDuJour />
          </div>

          {unreadRetours.length > 0 && (
            <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              {unreadRetours.map((r) => (
                <CoachRetourCard
                  key={r.id}
                  retour={r}
                  onReact={viewOnly || !athleteId ? undefined : (reaction) => {
                    haptic();
                    reactRetour({ retourId: r.id, athleteId, reaction });
                  }}
                />
              ))}
            </div>
          )}

          {readiness ? (
            <div
              style={{
                background: C.s1, borderRadius: 6, padding: 16,
                border: "1px solid " + C.brd,
                display: "flex", alignItems: "center", gap: 20,
              }}
            >
              <ReadinessCircle score={readiness.score} color={readiness.color} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: readiness.color, marginBottom: 4 }}>
                  {readiness.label}
                </div>
                <div style={{ fontSize: 11, color: C.tx3, marginBottom: 12 }}>Readiness du jour</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {WELL_FIELDS.map((f) => {
                    const v = (wellness as Record<string, number> | null)?.[f.key as string];
                    if (v == null) return null;
                    return (
                      <div key={f.key as string} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 10 }}>{f.icon}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{v}</div>
                        <div style={{ fontSize: 8, color: C.tx3 }}>{f.label.slice(0, 3)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setShowWellness(true); haptic(); }}
              style={{
                width: "100%", padding: "16px", borderRadius: 6,
                border: "1.5px dashed " + C.coach + "60", background: C.coachS,
                color: C.coach, fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit", minHeight: 44,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <Heart size={14} /> Logger mon wellness du jour
            </button>
          )}

          {readiness && (
            <button
              onClick={() => { setShowWellness(true); haptic(); }}
              style={{
                marginTop: 8, fontSize: 11, color: C.tx3,
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "inherit", padding: 0, textDecoration: "underline",
              }}
            >
              Modifier
            </button>
          )}
        </div>

        {/* Section 1a — Message du coach */}
        {recentFb && (
          <button
            onClick={() => { navigate("coach-feedback"); haptic(); }}
            style={{
              width: "100%", marginBottom: 20, padding: "13px 16px",
              background: C.s1, borderRadius: 6,
              border: "1px solid " + C.coach + "40",
              cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.coach }}>Retour du coach</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 9, color: C.tx3 }}>{new Date(recentFb.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                <span style={{ fontSize: 11, color: C.coach }}>›</span>
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.tx2, lineHeight: 1.55, fontStyle: "italic", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
              "{recentFb.note}"
            </div>
          </button>
        )}

        {/* Section 1b — Nutrition du jour */}
        {todayNutrition && (() => {
          const { consumed, ev, zone, meta, log: nl } = todayNutrition;
          const statusC = ev ? (ev.status === "ok" ? C.g : ev.status === "close" ? C.o : C.r) : null;
          const zoneLabel = zone
            ? (zone.targetMin !== zone.targetMax
              ? `${zone.targetMin.toLocaleString("fr-FR")}–${zone.targetMax.toLocaleString("fr-FR")}`
              : zone.targetMin.toLocaleString("fr-FR"))
            : null;
          return (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                Nutrition du jour
              </div>
              <button
                onClick={() => { navigate("/athlete/alim"); haptic(); }}
                style={{
                  width: "100%", background: C.s1, borderRadius: 6, padding: "13px 16px",
                  border: "1px solid " + (statusC ? statusC + "40" : C.brd),
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: consumed > 0 ? 10 : 6 }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5.5"/><path d="M7 11L10 6M17 11L14 6"/></svg>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.tx2 }}>Alimentation</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: meta.color + "18", border: "1px solid " + meta.color + "40", color: meta.color }}>
                    {meta.label}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 10, color: C.ac }}>Détail →</span>
                </div>

                {consumed <= 0 ? (
                  <div style={{ fontSize: 11, color: C.tx3 }}>
                    Aucune saisie aujourd'hui{zoneLabel ? ` · zone cible ${zoneLabel} kcal` : ""}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div>
                      <span style={{ fontSize: 20, fontWeight: 900, color: statusC ?? C.tx }}>{consumed.toLocaleString("fr-FR")}</span>
                      {zoneLabel && <span style={{ fontSize: 10, color: C.tx3 }}> / {zoneLabel} kcal</span>}
                    </div>
                    <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
                      {[
                        { l: "G", v: nl?.glucides_consumed, c: C.b },
                        { l: "L", v: nl?.lipides_consumed, c: C.o },
                        { l: "P", v: nl?.proteines_consumed, c: C.g },
                      ].map(m => (
                        <div key={m.l} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: m.c }}>{m.v ?? "—"}</div>
                          <div style={{ fontSize: 8, color: C.tx3 }}>{m.l} (g)</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {ev && (
                  <div style={{ marginTop: 8, fontSize: 11, fontWeight: 600, color: statusC!, padding: "5px 10px", borderRadius: 7, background: statusC + "12" }}>
                    {ev.status === "ok"
                      ? `Dans l'objectif — ${ev.actualPct <= 0 ? "déficit" : "surplus"} réel ${ev.actualPct > 0 ? "+" : ""}${ev.actualPct.toFixed(1)}%`
                      : ev.status === "close"
                      ? `Proche de l'objectif (${ev.diffPct > 0 ? "+" : ""}${ev.diffPct.toFixed(1)}% d'écart)`
                      : `Hors objectif (${ev.diffPct > 0 ? "+" : ""}${ev.diffPct.toFixed(1)}% d'écart)`}
                  </div>
                )}
              </button>
            </div>
          );
        })()}

        {/* Section 1b — Test / biométrie du jour (au-dessus de la séance) */}
        {todayTests.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
              {todayTests.length > 1 ? "Tests du jour" : "Test du jour"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {todayTests.map((t) => {
                const bio = t.type === "biometric";
                const tc = t.completed ? C.g : bio ? "#66F03C" : C.ac;
                return (
                  <button
                    key={t.id}
                    onClick={() => { openTest(t.id); haptic(); }}
                    style={{ width: "100%", background: t.completed ? C.gS : tc + "12", borderRadius: 6, padding: "14px 16px", border: "1px solid " + tc + "40", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 4, flexShrink: 0, background: tc + "20", display: "flex", alignItems: "center", justifyContent: "center" }}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                      <div style={{ fontSize: 10, color: C.tx3, marginTop: 1, textTransform: "capitalize" }}>{bio ? "Biométrie" : t.type + " · Test"}</div>
                    </div>
                    {t.completed
                      ? <span style={{ fontSize: 16, color: C.g, flexShrink: 0 }}>✓</span>
                      : <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: tc + "20", color: tc, flexShrink: 0 }}>Remplir →</span>
                    }
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Section 1b — Jour de compétition (en tête, séances éventuelles dessous) */}
        {todayComps.length > 0 && (
          <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            {todayComps.map((c) => (
              <CompetitionDayCard key={c.id} competition={c} viewOnly={viewOnly} />
            ))}
          </div>
        )}

        {/* Section 2 — Séance du jour */}
        {(() => {
          const EKC: Record<string, string> = { vo2: "#FFC933", tempo: "#33B5FF", seuil: "#F59E0B", footing: "#10B981", fartlek: "#EF4444", specifique: "#F5A623", autre: "#6B7280", custom: "#6B7280" };
          const EKL: Record<string, string> = { vo2: "VO₂", tempo: "Tempo", seuil: "Seuil", footing: "Footing", fartlek: "Fartlek", specifique: "Spécifique", autre: "Autre", custom: "Custom" };

          const pendingWorkouts = workouts.filter(w => !w.isCompleted);
          const pendingEnergy   = todayEnergySessions.filter(ev => ev.status !== "completed");
          const totalToday      = workouts.length + todayEnergySessions.length;
          const hasPending      = pendingWorkouts.length > 0 || pendingEnergy.length > 0;

          // Jour avec uniquement test/biométrie : la section test suffit
          if (totalToday === 0 && (todayTests.length > 0 || todayComps.length > 0)) return null;

          return (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                Séance du jour
              </div>

              {totalToday === 0 ? (
                /* ── Repos ── */
                <div style={{ background: C.s1, borderRadius: 6, padding: "18px 16px", border: "1px solid " + C.brd, textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 2 }}>Récupération</div>
                  <div style={{ fontSize: 11, color: C.tx3 }}>Rien de prévu — profite pour te reposer</div>
                </div>

              ) : !hasPending ? (
                /* ── Tout terminé ── */
                <div style={{ background: C.gS, borderRadius: 6, padding: "18px 16px", border: "1px solid " + C.g + "40", textAlign: "center" }}>
                  <div style={{ marginBottom: 6 }}><Check size={28} color={C.g} /></div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.g }}>
                    {totalToday > 1 ? "Séances terminées" : "Séance terminée"}
                  </div>
                  <div style={{ fontSize: 11, color: C.tx3, marginTop: 4 }}>Bien joué, récupère bien</div>
                </div>

              ) : (
                /* ── Items à faire ── */
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Workouts en attente */}
                  {pendingWorkouts.map((w, wi) => (
                    <div key={w.session.id} style={{ position: "relative", overflow: "hidden", background: C.s1, borderRadius: 6, padding: 16, border: "1px solid " + C.ac + "59" }}>
                      {wi === 0 && <div aria-hidden style={{ position: "absolute", top: 0, right: 0, width: 320, height: 320, backgroundImage: "url(/brand/agon-pattern-arene-sombre.svg)", backgroundSize: "700px", backgroundRepeat: "no-repeat", backgroundPosition: "top right", opacity: 0.35, pointerEvents: "none", zIndex: 0, maskImage: "radial-gradient(circle at 80% 20%, #000 0%, transparent 70%)", WebkitMaskImage: "radial-gradient(circle at 80% 20%, #000 0%, transparent 70%)" }} />}
                      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 4, flexShrink: 0, background: C.coachS, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Dumbbell size={18} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.session.name}</div>
                          <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>
                            Musculation · {w.session.short}
                          </div>
                        </div>
                      </div>
                      {w.workoutLogId && <TodayWorkoutFiches workoutLogId={w.workoutLogId} athleteId={athleteId} />}
                      {!viewOnly && (
                        <button
                          onClick={() => { haptic(); navigate("/athlete/program/workout/" + w.workoutLogId); }}
                          style={{ position: "relative", zIndex: 1, width: "100%", padding: "13px 0", borderRadius: 6, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", minHeight: 44 }}
                        >
                          Démarrer ▶
                        </button>
                      )}
                    </div>
                  ))}

                  {/* Energy en attente */}
                  {pendingEnergy.map((ev) => {
                    const kc = EKC[ev.sessionKind ?? ""] ?? "#FFC933";
                    const kl = EKL[ev.sessionKind ?? ""] ?? ev.sessionKind ?? "Énergie";
                    return (
                      <button
                        key={ev.id}
                        onClick={() => { if (ev.sessionKind === "specifique" && !viewOnly) { navigate(`/athlete/specific/${ev.id}`); } else { setEnergyPreview(ev); } haptic(); }}
                        style={{ width: "100%", background: kc + "12", borderRadius: 6, padding: "14px 16px", border: "1px solid " + kc + "40", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}
                      >
                        <div style={{ width: 36, height: 36, borderRadius: 4, flexShrink: 0, background: kc + "20", display: "flex", alignItems: "center", justifyContent: "center" }}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter"><path d="M13 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM7 21l3-9 3 2v7M5 16l3-4 3 2M14 8l4 2 3-3"/></svg></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                          <div style={{ fontSize: 10, color: kc, marginTop: 1, fontWeight: 600 }}>{kl}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: kc + "20", color: kc, flexShrink: 0 }}>Voir →</span>
                      </button>
                    );
                  })}

                </div>
              )}
            </div>
          );
        })()}

        {/* Section 2b — Badge 2 séances aujourd'hui */}
        {hasTwoSessionsToday && (
          <div style={{
            marginBottom: 12, padding: "8px 14px", borderRadius: 4,
            background: "rgba(59,141,240,0.1)", border: "1px solid rgba(59,141,240,0.3)",
            fontSize: 12, fontWeight: 600, color: "#33B5FF",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <Info size={13} style={{ flexShrink: 0 }} /> {todayActivePlanSessions.length} séances prévues aujourd'hui
          </div>
        )}

        {/* Section 2c — Faire une autre séance */}
        {!viewOnly && (allDoneToday || restDay) && otherUndoneSessions.length > 0 && (
          <div style={{ marginBottom: 20 }}>
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

        {/* Section 3 — Planning semaine horizontal */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
            Cette semaine
          </div>
          <div
            style={{
              display: "flex", gap: 6,
              overflowX: "auto", scrollbarWidth: "none",
              paddingBottom: 2,
            }}
          >
            {weekDays.map((day) => {
              const isToday = day.date === today;
              const hasSess = day.sessions.length > 0;
              const hasTest = day.tests.length > 0;
              const dayEnergy = energyByDate.get(day.date) ?? [];
              const dayFree = freeSessions.filter((f) => f.date === day.date && f.sport);
              const allDone = hasSess && day.sessions.every(s => s.isCompleted);
              const isCompDay = competitionsByDate.has(day.date);
              const DOW_SHORT = ["L", "M", "M", "J", "V", "S", "D"];
              return (
                <button
                  key={day.date}
                  onClick={() => { setSelectedDay(day); haptic(); }}
                  style={{
                    flex: "1 0 0",
                    minWidth: 40,
                    padding: "8px 4px",
                    borderRadius: 6,
                    border: "1px solid " + (isCompDay ? C.r + "80" : isToday ? C.coach + "60" : C.brd),
                    background: isCompDay ? C.rS : isToday ? C.coachS : C.s1,
                    cursor: "pointer", fontFamily: "inherit",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  }}
                >
                  {/* Day letter */}
                  <div style={{ fontSize: 9, fontWeight: 600, color: isToday ? C.coach : C.tx3 }}>
                    {DOW_SHORT[day.dow]}
                  </div>
                  {/* Date number */}
                  <div
                    style={{
                      width: 26, height: 26, borderRadius: "50%",
                      background: isToday ? C.coach : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700,
                      color: isToday ? "#fff" : (hasSess || hasTest || dayEnergy.length > 0 || dayFree.length > 0) ? C.tx : C.tx3,
                    }}
                  >
                    {new Date(day.date + "T12:00:00").getDate()}
                  </div>
                  {/* Dots: sessions + energy + tests + free activities */}
                  <div style={{ display: "flex", gap: 3, height: 6, alignItems: "center" }}>
                    {day.sessions.map((s) => (
                      <div
                        key={s.session.id}
                        style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: s.isCompleted ? "#66F03C" : C.coach,
                        }}
                      />
                    ))}
                    {dayEnergy.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: ev.status === "completed" ? "#66F03C" : "#FFC933",
                        }}
                      />
                    ))}
                    {day.tests.map((t) => (
                      <div
                        key={t.id}
                        style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: t.completed ? "#66F03C" : C.ac,
                        }}
                      />
                    ))}
                    {dayFree.map((f) => (
                      <div
                        key={f.id}
                        style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: "#66F03C",
                        }}
                      />
                    ))}
                  </div>
                  {/* Compétition / "Repos" label / done check */}
                  {isCompDay ? (
                    <Trophy size={10} color={C.r} />
                  ) : allDone ? (
                    <div style={{ fontSize: 8, color: "#66F03C", fontWeight: 700 }}>✓</div>
                  ) : !hasSess && !hasTest && dayFree.length === 0 ? (
                    <div style={{ fontSize: 8, color: C.tx3 }}>—</div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 4 — Récap hier */}
        {(yesterdayWellness || yesterdaySessName) && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
              Hier
            </div>
            <div
              style={{
                background: C.s1, borderRadius: 6, padding: "12px 16px",
                border: "1px solid " + C.brd,
                display: "flex", alignItems: "center", gap: 16,
              }}
            >
              {yesterdaySessName && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Check size={14} color={C.g} />
                  <div>
                    <div style={{ fontSize: 10, color: C.tx3 }}>Séance</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{yesterdaySessName}</div>
                  </div>
                </div>
              )}
              {yesterdayWellness?.score != null && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Heart size={14} color={C.r} />
                  <div>
                    <div style={{ fontSize: 10, color: C.tx3 }}>Wellness</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{yesterdayWellness.score}/100</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Section 4 — Prochaine compétition */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Prochaine compétition
            </div>
            {myCoachId && (
              <button
                onClick={() => setShowCompForm(true)}
                style={{ fontSize: 10, color: C.ac, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, display: "flex", alignItems: "center", gap: 3 }}
              >
                <Plus size={12} /> Ajouter
              </button>
            )}
          </div>
          {nextComp ? (
            <div
              style={{
                background: C.s1, borderRadius: 6, padding: 16,
                border: "1px solid " + C.coach + "40",
                display: "flex", alignItems: "center", gap: 14,
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 4, background: C.coachS, display: "flex", alignItems: "center", justifyContent: "center" }}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={20} height={20} fill="none" stroke={C.coach} strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter"><path d="M6 9V2H18V9A6 6 0 0 1 6 9ZM4 2H6M18 2H20M12 15V19M8 22H16M8 19H16"/></svg></div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{nextComp.name}</div>
                  <span
                    style={{
                      fontSize: 9, fontWeight: 700,
                      padding: "2px 7px", borderRadius: 6,
                      background: nextComp.priority === "A" ? C.coachS : C.oS,
                      color: nextComp.priority === "A" ? C.coach : C.o,
                    }}
                  >
                    {nextComp.priority}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: C.tx3 }}>
                  J-{nextComp.daysUntil} · {nextComp.date}
                  {nextComp.location ? ` · ${nextComp.location}` : ""}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background: C.s1, borderRadius: 6, padding: 20, border: "1px dashed " + C.brd, textAlign: "center" }}>
              <div style={{ fontSize: 12, color: C.tx3, marginBottom: myCoachId ? 10 : 0 }}>Aucune compétition prévue</div>
              {myCoachId && (
                <button
                  onClick={() => setShowCompForm(true)}
                  style={{
                    padding: "10px 20px", borderRadius: 6, border: "none",
                    background: C.ac, color: "#fff",
                    fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Ajouter une compétition
                </button>
              )}
            </div>
          )}
        </div>

        {/* Section 4b — Compétitions à commenter (jusqu'à ce que le bilan soit rempli) */}
        {uncommentedComps.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.r, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
              {uncommentedComps.length > 1 ? "Compétitions à commenter" : "Compétition à commenter"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {uncommentedComps.map((comp) => (
                <CompetitionDayCard key={comp.id} competition={comp} viewOnly={viewOnly} showDate />
              ))}
            </div>
          </div>
        )}

        {/* Section 4c — Mes événements (life events) */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Mes événements
            </div>
            <button
              onClick={() => setShowLifeEventForm(true)}
              style={{ fontSize: 10, color: C.ac, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, display: "flex", alignItems: "center", gap: 3 }}
            >
              <Plus size={12} /> Ajouter
            </button>
          </div>
          {(() => {
            const upcoming = lifeEvents.filter((e) => e.date_end >= today);
            if (upcoming.length === 0) return (
              <div style={{ background: C.s1, borderRadius: 6, padding: 16, border: "1px dashed " + C.brd, textAlign: "center" }}>
                <div style={{ fontSize: 12, color: C.tx3 }}>Aucun événement prévu</div>
                <div style={{ fontSize: 10, color: C.tx3, marginTop: 4 }}>Ajoute tes indisponibilités pour que ton coach adapte le planning</div>
              </div>
            );
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {upcoming.map((evt) => (
                  <div
                    key={evt.id}
                    style={{
                      background: C.s1, borderRadius: 6, padding: "10px 14px",
                      border: "1px solid " + C.brd,
                      display: "flex", alignItems: "center", gap: 10,
                    }}
                  >
                    <CalendarDays size={14} style={{ color: "#9194A0", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {evt.title}
                      </div>
                      <div style={{ fontSize: 10, color: C.tx3 }}>
                        {evt.date_start === evt.date_end
                          ? evt.date_start
                          : `${evt.date_start} → ${evt.date_end}`}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteLifeEvent({ id: evt.id, athlete_id: athleteId ?? "" }); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: C.tx3, padding: 4, flexShrink: 0 }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Section 5 — Tendance de forme */}
        {wellnessTrendHasData && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Tendance de forme
              </div>
              <button
                onClick={() => navigate("profil")}
                style={{ fontSize: 10, color: C.ac, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
              >
                Historique →
              </button>
            </div>

            {/* Score + graph */}
            <div style={{ background: C.s1, borderRadius: 6, padding: "14px 16px", border: "1px solid " + C.brd, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.tx3, marginBottom: 2 }}>Forme moyenne · 7j</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: formeColor }}>
                    {avgFormeScore ?? "—"}
                    {avgFormeScore != null && <span style={{ fontSize: 12, fontWeight: 400, color: C.tx3 }}>/100</span>}
                  </div>
                </div>
                <div
                  style={{
                    padding: "5px 12px", borderRadius: 6,
                    background: formeColor + "18", border: "1px solid " + formeColor + "40",
                    fontSize: 12, fontWeight: 700, color: formeColor,
                  }}
                >
                  {formeLabel}
                </div>
              </div>

              {/* 14-day line chart */}
              <ResponsiveContainer width="100%" height={80}>
                <LineChart data={wellnessTrend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <ReferenceLine y={60} stroke={C.brd} strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke={formeColor}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <XAxis
                    dataKey="d"
                    tick={{ fontSize: 9, fill: C.tx3 }}
                    axisLine={false} tickLine={false}
                    interval={3}
                  />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    contentStyle={{ background: C.s1, border: "none", borderRadius: 4, fontSize: 11 }}
                    labelStyle={{ color: C.tx3 }}
                    formatter={(v: number) => [`${v}/100`, "Forme"]}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Advice cards */}
            {formeAdvice.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {formeAdvice.map((tip) => (
                  <div
                    key={tip.label}
                    style={{
                      background: C.s1, borderRadius: 6, padding: "12px 14px",
                      border: "1px solid " + tip.color + "30",
                      display: "flex", gap: 12, alignItems: "flex-start",
                    }}
                  >
                    <div
                      style={{
                        width: 34, height: 34, borderRadius: 4, flexShrink: 0,
                        background: tip.color + "15",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 18,
                      }}
                    >
                      {tip.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: tip.color, marginBottom: 3 }}>
                        {tip.label}
                      </div>
                      <div style={{ fontSize: 11, color: C.tx2, lineHeight: 1.4 }}>{tip.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {formeAdvice.length === 0 && avgFormeScore != null && avgFormeScore >= 70 && (
              <div
                style={{
                  background: C.gS, borderRadius: 6, padding: "12px 14px",
                  border: "1px solid " + C.g + "30",
                  display: "flex", gap: 10, alignItems: "center",
                }}
              >
                <Check size={20} color={C.g} />
                <div style={{ fontSize: 11, color: C.tx2, lineHeight: 1.4 }}>
                  Ton état de forme est bon. Continue sur ta lancée et maintiens tes bonnes habitudes !
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Day preview BottomSheet */}
      <DayPreviewSheet
        day={selectedDay}
        onClose={() => setSelectedDay(null)}
        onStartSession={viewOnly ? () => {} : (sess) => navigate("/athlete/log", { state: { initialSess: sess } })}
        freeSessions={freeSessions}
        energyByDate={energyByDate}
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
      <TestFillDrawer
        testId={testPreviewId}
        athleteId={athleteId ?? ""}
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

      {/* Life event form */}
      {showLifeEventForm && (
        <LifeEventFormModal
          athleteId={athleteId ?? ""}
          onClose={() => setShowLifeEventForm(false)}
        />
      )}

      {/* Competition form (athlete self-add) */}
      {showCompForm && myCoachId && (
        <CompetitionFormModal
          athleteId={athleteId ?? ""}
          coachId={myCoachId}
          onClose={() => setShowCompForm(false)}
        />
      )}
    </>
  );
}
