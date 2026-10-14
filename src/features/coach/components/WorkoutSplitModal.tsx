/**
 * WorkoutSplitModal — split S-1 réalisée (gauche) / S-actuelle éditable (droite).
 * Droite : CoachProgramEditor existant (vue blocs couleurs).
 * Gauche : set_logs athlète lecture seule, set par set.
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

const DOW_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { CoachProgramEditor } from "@/components/coach/CoachProgramEditor";
import { useWorkoutSplitData } from "@/features/coach/hooks/useWorkoutSplitData";
import { getSessionBlocs } from "@/lib/muscles";
import type { Exercise, BlockConfig, WellnessData, SetRow, WeekConfig } from "@/features/shared/types/athlete";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type BlocMeta = { label: string; color: string };
type BlocMap = Record<string, BlocMeta>;

// Relative week offset vs current calendar week (0 = current, +1 = next, -1 = prev…)
function relWeekOffset(mondayISO: string): number {
  if (!mondayISO) return 0;
  const today = new Date();
  const todayDow = (today.getDay() + 6) % 7;
  const curMonday = new Date(today);
  curMonday.setDate(today.getDate() - todayDow);
  curMonday.setHours(0, 0, 0, 0);
  const tgtMonday = new Date(mondayISO + "T00:00:00");
  return Math.round((tgtMonday.getTime() - curMonday.getTime()) / (7 * 86400000));
}

function relWeekLabel(offset: number): string {
  if (offset === 0) return "S0";
  if (offset > 0)  return `S+${offset}`;
  return `S${offset}`;
}

const FALLBACK_COLORS = ["#FFC933","#8b5cf6","#F5A623","#33B5FF","#66F03C","#FF9500"];

function buildBlocMap(session: { blocs?: BlocMeta[] } | undefined, exercises: Exercise[]): BlocMap {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocs: BlocMeta[] = getSessionBlocs(session as any, exercises);
  const map: BlocMap = {};
  blocs.forEach((b, i) => {
    map[b.id ?? String(i)] = { label: b.label, color: b.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length] };
  });
  return map;
}

function groupByBloc(exercises: Exercise[], blocMap: BlocMap): Array<[string, Exercise[]]> {
  // Preserve order defined in blocMap first, then unknown blocs
  const orderIds = Object.keys(blocMap);
  const map: Record<string, Exercise[]> = {};
  for (const ex of exercises) {
    const k = ex.bloc ?? "__none__";
    (map[k] ??= []).push(ex);
  }
  const ordered: Array<[string, Exercise[]]> = [];
  for (const id of orderIds) if (map[id]) ordered.push([id, map[id]]);
  for (const [k, v] of Object.entries(map)) {
    if (!orderIds.includes(k)) ordered.push([k, v]);
  }
  return ordered;
}

// ─────────────────────────────────────────────────────────────────────────────
// Left column — set_logs athlète par série
// ─────────────────────────────────────────────────────────────────────────────

function Pill({ label, value, color }: { label: string; value: string; color?: string }) {
  const c = color ?? C.ac;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 7px", borderRadius: 6,
      background: c + "18", border: `1px solid ${c}40`,
      fontSize: 10, fontWeight: 600, color: c, whiteSpace: "nowrap",
    }}>
      <span style={{ fontSize: 9, color: C.tx3 }}>{label}</span>
      {value}
    </span>
  );
}

function LeftExoBlock({
  ex,
  sets,
  weekIndex,
  athleteNote,
  blocMap,
}: {
  ex: Exercise;
  sets: SetRow[];
  weekIndex: number;
  athleteNote?: string;
  blocMap: BlocMap;
}) {
  const color = blocMap[ex.bloc ?? ""]?.color ?? C.ac;
  const hasSets = sets.length > 0;
  const planned = ex.weeks?.[weekIndex] ?? {};
  const coachNote: string = (planned as Record<string, unknown>).coachNote as string ?? "";

  return (
    <div style={{
      padding: "10px 0",
      borderBottom: `1px solid rgba(255,255,255,0.05)`,
    }}>
      {/* Exercise name + done indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <span style={{
          width: 7, height: 7, borderRadius: "50%",
          background: color, flexShrink: 0,
        }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: C.tx, flex: 1 }}>
          {ex.name}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 800,
          color: hasSets ? "#66F03C" : "#FF9500",
        }}>
          {hasSets ? "✓" : "✗"}
        </span>
      </div>

      {/* Coach instruction */}
      {coachNote && (
        <div style={{
          marginLeft: 14, marginBottom: 5,
          padding: "5px 8px", borderRadius: 6,
          background: "#FFC93312", border: `1px solid #FFC93325`,
          fontSize: 10, color: "#FFC933", fontStyle: "italic", lineHeight: 1.4,
        }}>
          <span style={{ fontSize: 8, fontWeight: 700, display: "block", marginBottom: 2, opacity: 0.8 }}>
            CONSIGNE COACH
          </span>
          {coachNote}
        </div>
      )}

      {hasSets ? (
        /* Actual sets done by athlete */
        <div style={{
          paddingLeft: 14,
          display: "flex", flexDirection: "column", gap: 3,
        }}>
          {sets.map((s, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "4px 10px", borderRadius: 6,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid rgba(255,255,255,0.06)`,
            }}>
              <span style={{
                fontSize: 9, color: C.tx3, minWidth: 20, fontWeight: 700,
              }}>S{i + 1}</span>
              {s.kg != null ? (
                <span style={{ fontSize: 13, fontWeight: 800, color: C.tx }}>
                  {s.kg}<span style={{ fontSize: 9, color: C.tx3, fontWeight: 400, marginLeft: 1 }}>kg</span>
                </span>
              ) : null}
              {s.reps != null && (
                <span style={{ fontSize: 12, color: C.tx2 }}>
                  × <span style={{ fontWeight: 700, color: C.tx }}>{Array.isArray(s.reps) ? (s.reps as number[]).join("+") : s.reps}</span>
                </span>
              )}
              {s.rir != null && (
                <span style={{
                  fontSize: 10, padding: "1px 5px", borderRadius: 4,
                  background: "rgba(255,255,255,0.06)", color: C.tx3,
                }}>
                  RIR {s.rir}
                </span>
              )}
              {s.type && s.type !== "normal" && (
                <span style={{
                  fontSize: 9, padding: "1px 5px", borderRadius: 4,
                  background: color + "22", color, fontWeight: 600, marginLeft: "auto",
                }}>
                  {s.type}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Exercise not done — show planned as reference */
        <div style={{
          paddingLeft: 14, fontSize: 10, color: C.tx3 + "80", fontStyle: "italic",
        }}>
          Prévu : {planned.sets ?? "?"}×{planned.repsRange ?? "?"}
          {(planned as Record<string, unknown>).kg ? ` @ ${(planned as Record<string, unknown>).kg} kg` : ""}
          {(planned as Record<string, unknown>).rir != null ? ` · RIR ${(planned as Record<string, unknown>).rir}` : ""}
        </div>
      )}

      {/* Athlete return note */}
      {athleteNote && (
        <div style={{
          marginLeft: 14, marginTop: 6,
          padding: "5px 8px", borderRadius: 6,
          background: "#33B5FF12", border: `1px solid #33B5FF25`,
          fontSize: 10, color: "#33B5FF", fontStyle: "italic", lineHeight: 1.4,
        }}>
          <span style={{ fontSize: 8, fontWeight: 700, display: "block", marginBottom: 2, opacity: 0.8 }}>
            NOTE ATHLÈTE
          </span>
          {athleteNote}
        </div>
      )}
    </div>
  );
}

function LeftColumn({
  exercises,
  setLogsByExId,
  workoutLog,
  wellness,
  weekLabel,
  weekIndex,
  isLoading,
  isFirstWeek,
  athleteNotes,
  isDone,
  blocMap,
  missedWeekLabel,
}: {
  exercises: Exercise[];
  setLogsByExId: Record<string, SetRow[]>;
  workoutLog: { id: string; status: string; rpe_score: number | null; notes: string | null } | null;
  wellness: WellnessData | null;
  weekLabel: string;
  weekIndex: number;
  isLoading: boolean;
  isFirstWeek: boolean;
  athleteNotes: Record<string, string>;
  isDone: boolean;
  blocMap: BlocMap;
  missedWeekLabel?: string; // set when showing fallback due to missed week
}) {
  const grouped = useMemo(() => groupByBloc(exercises, blocMap), [exercises, blocMap]);

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: "rgba(0,0,0,0.15)",
    }}>
      {/* Missed-week context banner */}
      {missedWeekLabel && (
        <div style={{
          padding: "7px 14px",
          background: "linear-gradient(90deg, #FF950018 0%, #FF950008 100%)",
          borderBottom: `1px solid #FF950030`,
          borderLeft: `3px solid #FF9500`,
          display: "flex", alignItems: "center", gap: 8,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14 }}></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#FF9500", textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Séance manquée — {missedWeekLabel}
            </div>
            <div style={{ fontSize: 9, color: "#FF950099", marginTop: 1 }}>
              Affichage de la dernière séance réalisée
            </div>
          </div>
        </div>
      )}

      {/* Column header */}
      <div style={{
        padding: "10px 14px 8px",
        borderBottom: `0.5px solid rgba(255,255,255,0.06)`,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
            background: isDone ? "#66F03C18" : "rgba(255,255,255,0.06)",
            color: isDone ? "#66F03C" : C.tx3,
            border: `1px solid ${isDone ? "#66F03C40" : "rgba(255,255,255,0.1)"}`,
          }}>
            {isDone ? "✓ Dernière réalisée" : "Réalisé athlète"}
          </span>
          <span style={{ fontSize: 10, color: isDone ? "#66F03C" : C.tx3 }}>{weekLabel}</span>
        </div>
        {/* Wellness pills */}
        {!isFirstWeek && workoutLog && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4 }}>
            {workoutLog.rpe_score != null && (
              <Pill label="RPE" value={`${workoutLog.rpe_score}/10`} color="#FFC933" />
            )}
            {wellness?.fatigue != null && (
              <Pill label="Fatigue" value={`${wellness.fatigue}/10`} color="#FF9500" />
            )}
            {(wellness?.sleepDur ?? wellness?.sommeil) != null && (
              <Pill
                label="Sommeil"
                value={`${wellness?.sleepDur ?? wellness?.sommeil}h`}
                color="#33B5FF"
              />
            )}
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px 20px" }}>

        {isFirstWeek ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}></div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.tx2 }}>Première semaine</div>
            <div style={{ fontSize: 10, color: C.tx3, marginTop: 4 }}>Aucune donnée précédente</div>
          </div>
        ) : isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[70, 50, 60].map((w, i) => (
              <div key={i} style={{ height: 11, width: `${w}%`, background: C.s2, borderRadius: 4 }} />
            ))}
          </div>
        ) : !workoutLog ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}></div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.tx2 }}>Aucune séance enregistrée</div>
            <div style={{ fontSize: 10, color: C.tx3, marginTop: 4 }}>S{weekIndex} — non réalisée</div>
          </div>
        ) : (
          <>
            {/* Athlete notes */}
            {workoutLog.notes && (
              <div style={{
                padding: "8px 10px", borderRadius: 4, marginBottom: 12,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid rgba(255,255,255,0.08)`,
                fontSize: 11, color: C.tx2, fontStyle: "italic",
              }}>
                "{workoutLog.notes}"
              </div>
            )}

            {/* Exercises by bloc */}
            {grouped.map(([bloc, exos]) => (
              <div key={bloc} style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 9, fontWeight: 800,
                  color: blocMap[bloc]?.color ?? C.ac,
                  textTransform: "uppercase", letterSpacing: "0.6px",
                  marginBottom: 4,
                  borderLeft: `2px solid ${blocMap[bloc]?.color ?? C.ac}`,
                  paddingLeft: 6,
                }}>
                  {blocMap[bloc]?.label ?? bloc}
                </div>
                {exos.map(ex => (
                  <LeftExoBlock
                    key={ex.id}
                    ex={ex}
                    sets={setLogsByExId[ex.id] ?? []}
                    weekIndex={weekIndex}
                    athleteNote={athleteNotes[`${ex.id}_${weekIndex}`]}
                    blocMap={blocMap}
                  />
                ))}
              </div>
            ))}

            {/* Status */}
            <div style={{ marginTop: 8 }}>
              <span style={{
                fontSize: 9, padding: "2px 8px", borderRadius: 6, fontWeight: 700,
                background: workoutLog.status === "completed" ? "#66F03C18" : workoutLog.status === "missed" || workoutLog.status === "skipped" ? "#FF950018" : "rgba(255,255,255,0.04)",
                color: workoutLog.status === "completed" ? "#66F03C" : workoutLog.status === "missed" || workoutLog.status === "skipped" ? "#FF9500" : C.tx3,
                border: `1px solid ${workoutLog.status === "completed" ? "#66F03C40" : workoutLog.status === "missed" || workoutLog.status === "skipped" ? "#FF950040" : "rgba(255,255,255,0.08)"}`,
              }}>
                {workoutLog.status === "completed" ? "✓ Complétée"
                  : workoutLog.status === "missed" || workoutLog.status === "skipped" ? "✗ Manquée"
                  : workoutLog.status === "in_progress" ? "⏳ En cours"
                  : "— En attente"}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkoutSplitModalProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  sessionName: string;
  sessionDay: string;
  dayOfWeek?: number;
  onDayChange?: (day: number) => void;
  athleteId: string;
  cycleWeekCount: number;
  currentWeekIndex: number;
  blockConfig: BlockConfig | null;
}

export function WorkoutSplitModal({
  open,
  onClose,
  sessionId,
  sessionName,
  sessionDay,
  dayOfWeek,
  onDayChange,
  athleteId,
  cycleWeekCount,
  currentWeekIndex,
  blockConfig,
}: WorkoutSplitModalProps) {
  const ctx = useAthleteContext();
  const [mobileTab, setMobileTab] = useState<"left" | "right">("right");
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const dayPickerRef = useRef<HTMLDivElement>(null);

  // Find last completed week for this session → default right = lastDone+1
  // If no completions but current week's session date has passed → advance to next week
  const initialWeekIndex = useMemo(() => {
    for (let w = cycleWeekCount; w >= 1; w--) {
      if (ctx.completedSessions[w]?.includes(sessionId)) {
        return Math.min(w + 1, cycleWeekCount);
      }
    }
    if (blockConfig?.startDate) {
      const session = ctx.sessions.find(s => s.id === sessionId);
      const dow = session?.day_of_week ?? 0;
      const blockMonday = new Date(blockConfig.startDate + "T12:00:00");
      blockMonday.setDate(blockMonday.getDate() - ((blockMonday.getDay() + 6) % 7));
      const sessDate = new Date(blockMonday);
      sessDate.setDate(sessDate.getDate() + (currentWeekIndex - 1) * 7 + dow);
      sessDate.setHours(23, 59, 59);
      if (sessDate < new Date()) return Math.min(currentWeekIndex + 1, cycleWeekCount);
    }
    return currentWeekIndex;
  }, [ctx.completedSessions, ctx.sessions, sessionId, cycleWeekCount, currentWeekIndex, blockConfig]);

  useEffect(() => {
    if (!showDayPicker) return;
    function handleClick(e: MouseEvent) {
      if (dayPickerRef.current && !dayPickerRef.current.contains(e.target as Node)) {
        setShowDayPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDayPicker]);

  const {
    leftData, rightData, rightWeekIndex,
    fallbackLeftData, fallbackWeekIndex,
    navigateRight, canGoPrev, canGoNext,
    isRightEditable,
  } = useWorkoutSplitData({
    sessId: sessionId,
    athleteId,
    blockConfig,
    currentWeekIndex,
    cycleWeekCount,
    wellnessHistory: ctx.wellnessHistory,
    initialWeekIndex,
    completedSessions: ctx.completedSessions,
  });

  const exercises: Exercise[] = useMemo(
    () => ctx.exos[sessionId] ?? [],
    [ctx.exos, sessionId]
  );

  const blocMap = useMemo(() => {
    const session = ctx.sessions.find(s => s.id === sessionId);
    return buildBlocMap(session as { blocs?: BlocMeta[] } | undefined, exercises);
  }, [ctx.sessions, sessionId, exercises]);

  // Left is "missed" = session date is in the past + not completed
  const leftIsMissed = useMemo(() => {
    if (!leftData.mondayISO || leftData.weekIndex < 1) return false;
    if (ctx.completedSessions[leftData.weekIndex]?.includes(sessionId)) return false;
    const session = ctx.sessions.find(s => s.id === sessionId);
    const dow = session?.day_of_week ?? 6;
    const sessionDate = new Date(leftData.mondayISO + "T23:59:59");
    sessionDate.setDate(sessionDate.getDate() + dow);
    return sessionDate < new Date();
  }, [leftData.mondayISO, leftData.weekIndex, ctx.completedSessions, ctx.sessions, sessionId]);

  // When missed → fall back to truly last completed week for display
  const displayLeftData = leftIsMissed && fallbackLeftData ? fallbackLeftData : leftData;
  const displayLeftWeekIndex = leftIsMissed && fallbackWeekIndex ? fallbackWeekIndex : leftData.weekIndex;

  const leftIsDone = displayLeftWeekIndex >= 1 &&
    !!(ctx.completedSessions[displayLeftWeekIndex]?.includes(sessionId));

  // Sets from localStorage: ctx.sets[exId + "_" + weekNum], filter done only
  const setLogsByExId = useMemo<Record<string, SetRow[]>>(() => {
    const map: Record<string, SetRow[]> = {};
    for (const ex of exercises) {
      const raw = ctx.sets[`${ex.id}_${displayLeftWeekIndex}`] ?? [];
      const done = raw.filter(s => s.done);
      if (done.length > 0) map[ex.id] = done;
    }
    return map;
  }, [ctx.sets, exercises, displayLeftWeekIndex]);

  // Duplicate logged data (left) → planned session (right)
  // Missing sets: extend to planned count using last logged set as template
  // Missing exercises: fallback to most recent historical log
  function handleDuplicate() {
    const lw = displayLeftWeekIndex;
    if (lw < 1) return;

    const updated = {
      ...ctx.exos,
      [sessionId]: exercises.map(ex => {
        const logged = setLogsByExId[ex.id] ?? [];

        // Find last logged set: this week first, then search history
        let lastSet: SetRow | undefined = logged.length > 0
          ? logged[logged.length - 1]
          : undefined;

        if (!lastSet) {
          const allKeys = Object.keys(ctx.sets)
            .filter(k => k.startsWith(`${ex.id}_`))
            .sort((a, b) => {
              const wa = parseInt(a.split("_").pop() ?? "0");
              const wb = parseInt(b.split("_").pop() ?? "0");
              return wb - wa;
            });
          for (const key of allKeys) {
            const rows = (ctx.sets[key] ?? []).filter(s => s.done);
            if (rows.length > 0) { lastSet = rows[rows.length - 1]; break; }
          }
        }

        const plannedSets = ex.weeks?.[lw]?.sets ?? logged.length;
        const setsCount = Math.max(logged.length, plannedSets || 0) || 3;

        const newWeekConfig: WeekConfig = lastSet ? {
          ...(ex.weeks?.[lw] ?? {}),
          kg: lastSet.kg,
          repsRange: lastSet.reps != null ? String(lastSet.reps) : ex.weeks?.[lw]?.repsRange,
          rir: lastSet.rir != null ? lastSet.rir : ex.weeks?.[lw]?.rir,
          sets: setsCount,
        } : { ...(ex.weeks?.[lw] ?? {}) };

        return {
          ...ex,
          weeks: { ...(ex.weeks ?? {}), [rightWeekIndex]: newWeekConfig },
        };
      }),
    };

    ctx.setExos(updated);
    setConfirmDuplicate(false);
    toast.success(`S${lw} dupliquée → S${rightWeekIndex}`);
  }

  const hasRightData = exercises.some(ex => !!(ex.weeks?.[rightWeekIndex]));
  const isPast = rightWeekIndex < currentWeekIndex;

  // Relative calendar week offset for right side
  const rightOffset = relWeekOffset(rightData.mondayISO);
  const rightRelLabel = relWeekLabel(rightOffset);

  // Props for CoachProgramEditor (same as SessionWeekDrawer)
  const editorProps = {
    exos:            ctx.exos,
    setExos:         ctx.setExos,
    sessions:        ctx.sessions,
    setSessions:     ctx.setSessions,
    athleteNotes:    ctx.athleteNotes,
    allMethods:      ctx.allMethods,
    customMethods:   ctx.customMethods,
    setCustomMethods: ctx.setCustomMethods,
    blockConfig:     ctx.blockConfig,
    exMeta:          ctx.exMeta,
    setExMeta:       ctx.setExMeta,
    sets:            ctx.sets,
    completedSessions: ctx.completedSessions,
    weekSchedule:    ctx.weekSchedule,
    setWeekSchedule: ctx.setWeekSchedule,
    currentWeek:     ctx.currentWeek,
    hideWeekNav:        true,
    lockedSessId:       sessionId,
    defaultWeek:        rightWeekIndex,
    hideSplitControls:  true,
    athleteId,
  };

  if (!open) return null;

  const navBadgeColor = isPast ? C.tx3 : rightWeekIndex === currentWeekIndex ? "#FFC933" : C.tx3;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      display: "flex", alignItems: "flex-start", justifyContent: "center",
    }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)",
      }} />

      {/* Panel */}
      <div style={{
        position: "relative",
        width: "min(97vw, 1040px)",
        height: "min(94vh, 920px)",
        marginTop: "3vh",
        background: "#13121A",
        borderRadius: 6,
        border: `1px solid rgba(255,255,255,0.08)`,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: "12px 18px 10px",
          borderBottom: `0.5px solid rgba(255,255,255,0.08)`,
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>{sessionName}</span>
            {/* Day-of-week badge + picker */}
            <div ref={dayPickerRef} style={{ position: "relative" }}>
              <button
                onClick={() => onDayChange && setShowDayPicker(v => !v)}
                title={onDayChange ? "Changer le jour" : undefined}
                style={{
                  padding: "3px 9px", borderRadius: 6, border: "none",
                  background: dayOfWeek !== undefined ? C.coachS : "rgba(255,255,255,0.05)",
                  color: dayOfWeek !== undefined ? C.coach : C.tx3,
                  fontSize: 11, fontWeight: 700, cursor: onDayChange ? "pointer" : "default",
                  fontFamily: "inherit",
                }}
              >
                {dayOfWeek !== undefined ? DOW_LABELS[dayOfWeek] : sessionDay || "—"}
              </button>
              {showDayPicker && (
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 600,
                  background: "#1E1C2A", borderRadius: 6, padding: 8,
                  border: `1px solid rgba(255,255,255,0.12)`,
                  display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4,
                  minWidth: 280,
                }}>
                  {DOW_LABELS.map((label, idx) => (
                    <button
                      key={idx}
                      onClick={() => { onDayChange?.(idx); setShowDayPicker(false); }}
                      style={{
                        padding: "8px 4px", borderRadius: 4, border: "none",
                        background: dayOfWeek === idx ? C.coachS : "rgba(255,255,255,0.04)",
                        color: dayOfWeek === idx ? C.coach : C.tx2,
                        fontSize: 11, fontWeight: dayOfWeek === idx ? 800 : 400,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 7,
            border: `1px solid rgba(255,255,255,0.1)`, background: "transparent",
            color: C.tx3, cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <X size={13} />
          </button>
        </div>

        {/* ── Week nav ── */}
        <div style={{
          padding: "8px 18px 10px",
          borderBottom: `0.5px solid rgba(255,255,255,0.08)`,
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          background: "rgba(123,111,255,0.04)",
        }}>
          {/* Left arrow */}
          <button
            onClick={() => navigateRight("prev")} disabled={!canGoPrev}
            style={{
              width: 28, height: 28, borderRadius: 7, flexShrink: 0,
              border: `1px solid rgba(255,255,255,0.1)`, background: "transparent",
              color: canGoPrev ? C.tx2 : "rgba(255,255,255,0.15)",
              cursor: canGoPrev ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "inherit",
            }}
          ><ChevronLeft size={13} /></button>

          {/* Main label */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#FFC933", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 3 }}>
              Semaine à planifier
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {/* Relative week badge */}
              <span style={{
                fontSize: 15, fontWeight: 800,
                color: isPast ? C.tx3 : "#FFC933",
              }}>
                {rightRelLabel}
              </span>
              {/* Separator */}
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>·</span>
              {/* Block week */}
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: C.tx2, letterSpacing: "0.3px",
              }}>
                SEMAINE {rightWeekIndex} DU BLOC
              </span>
              {/* Missed badge */}
              {leftIsMissed && (
                <span style={{
                  fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 6,
                  background: "#FF950018", color: "#FF9500",
                  border: `1px solid #FF950040`,
                  textTransform: "uppercase", letterSpacing: "0.4px",
                }}>
                  Séance manquée
                </span>
              )}
              {/* Past indicator */}
              {isPast && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                  background: "rgba(255,255,255,0.05)", color: C.tx3,
                  border: `1px solid rgba(255,255,255,0.08)`,
                }}>passée</span>
              )}
            </div>
          </div>

          {/* Right arrow */}
          <button
            onClick={() => navigateRight("next")} disabled={!canGoNext}
            style={{
              width: 28, height: 28, borderRadius: 7, flexShrink: 0,
              border: `1px solid rgba(255,255,255,0.1)`, background: "transparent",
              color: canGoNext ? C.tx2 : "rgba(255,255,255,0.15)",
              cursor: canGoNext ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "inherit",
            }}
          ><ChevronRight size={13} /></button>
        </div>

        {/* ── Mobile tab switcher ── */}
        <div className="wsm-tabs" style={{
          borderBottom: `0.5px solid rgba(255,255,255,0.08)`,
          flexShrink: 0, display: "none",
        }}>
          {(["left", "right"] as const).map(t => (
            <button key={t} onClick={() => setMobileTab(t)} style={{
              flex: 1, padding: "8px 4px", border: "none",
              borderBottom: `2px solid ${mobileTab === t ? "#FFC933" : "transparent"}`,
              background: "transparent",
              color: mobileTab === t ? "#FFC933" : C.tx3,
              fontSize: 10, fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit", textTransform: "uppercase" as const,
            }}>
              {t === "left" ? `S${leftData.weekIndex || rightWeekIndex - 1} Réalisée` : `S${rightWeekIndex} Planifiée`}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

          {/* LEFT — realized (read-only) */}
          <div
            className={mobileTab === "right" ? "wsm-hide-mobile" : ""}
            style={{
              width: "40%", minWidth: 0, flexShrink: 0,
              borderRight: leftIsDone
                ? `1px solid #66F03C30`
                : `0.5px solid rgba(255,255,255,0.08)`,
              overflow: "hidden", display: "flex", flexDirection: "column",
              position: "relative",
            }}
          >
            <LeftColumn
              exercises={exercises}
              setLogsByExId={setLogsByExId}
              workoutLog={displayLeftData.workoutLog}
              wellness={displayLeftData.wellness}
              weekLabel={displayLeftData.label}
              weekIndex={displayLeftWeekIndex}
              isLoading={displayLeftData.isLoading}
              isFirstWeek={displayLeftWeekIndex < 1}
              athleteNotes={ctx.athleteNotes}
              isDone={leftIsDone}
              blocMap={blocMap}
              missedWeekLabel={leftIsMissed ? leftData.label : undefined}
            />
            {/* Arrow badge on the divider */}
            {leftIsDone && (
              <div style={{
                position: "absolute", right: -14, top: "50%",
                transform: "translateY(-50%)",
                zIndex: 10,
                width: 28, height: 28, borderRadius: "50%",
                background: "#13121A",
                border: `1px solid #66F03C40`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, color: "#66F03C",
                pointerEvents: "none",
              }}>→</div>
            )}
          </div>

          {/* RIGHT — planned / editable via CoachProgramEditor */}
          <div
            className={mobileTab === "left" ? "wsm-hide-mobile" : ""}
            style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}
          >
            {/* Right column header */}
            <div style={{
              padding: "8px 14px 6px",
              borderBottom: `0.5px solid rgba(255,255,255,0.06)`,
              flexShrink: 0,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              {(() => {
                const isNextAfterDone = leftIsDone && rightWeekIndex === leftData.weekIndex + 1;
                if (isPast) return (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                    background: "rgba(255,255,255,0.05)", color: C.tx3,
                    border: `1px solid rgba(255,255,255,0.08)`,
                  }}>Séance passée</span>
                );
                if (isNextAfterDone) return (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                    background: "#FFC93322", color: "#FFC933",
                    border: `1px solid #FFC93350`,
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <span style={{ fontSize: 11 }}>→</span> Prochaine à planifier
                  </span>
                );
                return (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                    background: "#FFC93318", color: "#FFC933",
                    border: `1px solid #FFC93330`,
                  }}>
                    {rightWeekIndex === currentWeekIndex ? "À planifier · actuelle" : "À planifier"}
                  </span>
                );
              })()}
              <span style={{ fontSize: 10, color: C.tx3 }}>{rightData.label}</span>
            </div>

            {/* CoachProgramEditor */}
            <div style={{ flex: 1, overflowY: "auto", opacity: isPast ? 0.7 : 1 }}>
              {/* @ts-expect-error CoachProgramEditor is JSX */}
              <CoachProgramEditor {...editorProps} />
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: "9px 18px",
          borderTop: `0.5px solid rgba(255,255,255,0.08)`,
          display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
        }}>
          {isRightEditable && leftData.weekIndex >= 1 ? (
            confirmDuplicate ? (
              <>
                <span style={{ flex: 1, fontSize: 11, color: C.tx2 }}>
                  {hasRightData
                    ? `Remplacer S${rightWeekIndex} par S${leftData.weekIndex} ?`
                    : `Copier S${leftData.weekIndex} → S${rightWeekIndex} ?`}
                </span>
                <button onClick={handleDuplicate} style={{
                  padding: "6px 16px", borderRadius: 7, border: "none",
                  background: "#FFC933", color: "#0E0C0A",
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>
                  Confirmer
                </button>
                <button onClick={() => setConfirmDuplicate(false)} style={{
                  padding: "6px 12px", borderRadius: 7,
                  border: `1px solid rgba(255,255,255,0.1)`, background: "transparent",
                  color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                }}>
                  Annuler
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => hasRightData ? setConfirmDuplicate(true) : handleDuplicate()}
                  style={{
                    padding: "6px 14px", borderRadius: 7,
                    border: `1px solid rgba(255,255,255,0.1)`, background: "transparent",
                    color: C.tx2, fontSize: 11, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  ↙ Dupliquer S{leftData.weekIndex}
                </button>
                <div style={{ flex: 1 }} />
                {!isPast && (
                  <button onClick={() => { toast.success(`S${rightWeekIndex} enregistrée`); onClose(); }} style={{
                    padding: "6px 20px", borderRadius: 7, border: "none",
                    background: "#FFC933", color: "#0E0C0A",
                    fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}>
                    Enregistrer S{rightWeekIndex}
                  </button>
                )}
              </>
            )
          ) : (
            <>
              <div style={{ flex: 1 }} />
              <button onClick={onClose} style={{
                padding: "6px 20px", borderRadius: 7,
                border: `1px solid rgba(255,255,255,0.1)`, background: "transparent",
                color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
              }}>
                Fermer
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 767px) {
          .wsm-tabs { display: flex !important; }
          .wsm-hide-mobile { display: none !important; }
        }
      `}</style>
    </div>
  );
}
