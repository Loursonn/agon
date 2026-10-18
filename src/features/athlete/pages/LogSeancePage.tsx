import { useState } from "react";
import { useLocation } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Zap, Check, ChevronDown, ChevronUp } from "lucide-react";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import LogView from "@/components/athlete/LogView";
import {
  useEnergyAssignments,
  useCompleteEnergyAssignment,
  useUpsertEnergyRpe,
  useUpdateEnergyAssignment,
} from "@/features/shared/hooks/useEnergyAssignments";
import { RpeSheet } from "@/features/athlete/components/RpeSheet";
import type { EnergySessionAssignmentRow, EnergyStep, EnergyInterval, BlockLogs } from "@/types/energy";
import { localISO } from "@/lib/date";
import { RunDistanceInput, initialRunDistance, runDistancePayload, type RunDistanceValue } from "@/features/shared/components/RunDistanceInput";

const KIND_COLOR: Record<string, string> = {
  vo2: "#FFC933", tempo: "#33B5FF", seuil: "#F59E0B",
  footing: "#10B981", fartlek: "#EF4444", autre: "#6B7280", custom: "#6B7280",
};
const KIND_LABEL: Record<string, string> = {
  vo2: "VO₂max", tempo: "Tempo", seuil: "Seuil",
  footing: "Footing", fartlek: "Fartlek", autre: "Autre", custom: "Custom",
};

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

function fmtIntervalLabel(iv: EnergyInterval): string {
  const d = iv.duration;
  if (d.kind === "distance" && d.value != null)
    return d.value >= 1000 ? `${(d.value / 1000).toFixed(1)} km` : `${d.value} m`;
  if (d.kind === "time" && d.value != null) {
    const m = Math.floor(d.value / 60), s = d.value % 60;
    return s > 0 ? `${m}min ${s}s` : `${m} min`;
  }
  return iv.notes || "Bloc effort";
}

function assignmentStatus(a: EnergySessionAssignmentRow, today: string): "completed" | "partial" | "missed" | "planned" {
  if (a.status === "completed") return "completed";
  const logs = (a.block_logs ?? {}) as Record<string, { done: boolean }>;
  if (Object.values(logs).some(b => b.done)) return "partial";
  if ((a.scheduled_date ?? "") < today) return "missed";
  return "planned";
}

const STATUS_COLOR = {
  completed: "#66F03C",
  partial:   "#33B5FF",
  missed:    "#FF5A33",
  planned:   "",
};
const STATUS_LABEL = {
  completed: "Fait",
  partial:   "En cours",
  missed:    "Manqué",
  planned:   "Prévu",
};

interface EnergySessionCardProps {
  a: EnergySessionAssignmentRow;
  athleteId: string;
  today: string;
  onRpeDone: (assignmentId: string) => void;
}

function EnergySessionCard({ a, athleteId, today, onRpeDone }: EnergySessionCardProps) {
  const es = (a as Record<string, unknown>).energy_sessions as {
    name: string; session_kind: string; total_duration_s?: number | null; total_distance_m?: number | null; intervals?: EnergyStep[];
  } | null;

  const kind = es?.session_kind ?? "";
  const kindColor = KIND_COLOR[kind] ?? C.tx3;
  const dateStr = a.scheduled_date
    ? format(new Date(a.scheduled_date + "T12:00:00"), "EEE d MMM", { locale: fr })
    : "—";

  const workBlocks = getWorkIntervals(es?.intervals ?? []);
  const isComplex = workBlocks.length > 1;
  const status = assignmentStatus(a, today);
  const statusColor = STATUS_COLOR[status] || C.tx3;
  const isLogable = status !== "completed";

  const [open, setOpen] = useState(false);
  const [localBlocks, setLocalBlocks] = useState<BlockLogs>(() => {
    const existing = (a.block_logs ?? {}) as BlockLogs;
    if (workBlocks.length === 0) return existing;
    const init: BlockLogs = {};
    for (const b of workBlocks) init[b.id] = existing[b.id] ?? { done: false, note: "" };
    return init;
  });
  const [globalNote, setGlobalNote] = useState((a.notes ?? "") as string);
  const [activityUrl, setActivityUrl] = useState(() => ((a as Record<string, unknown>).activity_url as string) ?? "");
  const [actualDuration, setActualDuration] = useState<string>(() => {
    if ((a as Record<string, unknown>).actual_duration_min != null)
      return String((a as Record<string, unknown>).actual_duration_min);
    if (es?.total_duration_s != null) return String(Math.round(es.total_duration_s / 60));
    return "";
  });

  const [runDist, setRunDist] = useState<RunDistanceValue>(() => {
    const ar = a as unknown as Record<string, unknown>;
    if (ar.activity_type) {
      return { activity: ar.activity_type as RunDistanceValue["activity"], km: ar.distance_km != null ? String(ar.distance_km) : "" };
    }
    return initialRunDistance(es?.total_distance_m);
  });

  const complete = useCompleteEnergyAssignment();
  const updateAssignment = useUpdateEnergyAssignment();

  function handleUnvalidate() {
    updateAssignment.mutate({ id: a.id, athleteId, status: "planned", block_logs: {}, rpe_score: null });
  }

  function handleValidate() {
    const logs: BlockLogs = isComplex ? localBlocks : {};
    const durationMin = actualDuration !== "" ? parseInt(actualDuration, 10) : undefined;
    complete.mutate(
      {
        id: a.id,
        athleteId,
        block_logs: logs,
        notes: globalNote || undefined,
        actual_duration_min: durationMin && !isNaN(durationMin) ? durationMin : undefined,
        activity_url: activityUrl.trim() || undefined,
        ...runDistancePayload(runDist),
      },
      { onSuccess: () => onRpeDone(a.id) },
    );
  }

  const allBlocksDone = workBlocks.length === 0 || workBlocks.every(b => localBlocks[b.id]?.done);

  return (
    <div style={{
      borderRadius: 6, border: "1px solid " + (status === "missed" ? C.r + "40" : status === "completed" ? C.g + "40" : status === "partial" ? "#33B5FF40" : C.brdL),
      background: C.s1, marginBottom: 10, overflow: "hidden",
    }}>
      {/* Header row */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: isLogable ? "pointer" : "default" }}
        onClick={() => isLogable && setOpen(o => !o)}
      >
        <div style={{
          width: 32, height: 32, borderRadius: 4, flexShrink: 0,
          background: (status === "missed" ? C.r : status === "completed" ? C.g : kindColor) + "20",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {status === "completed"
            ? <Check size={15} color={C.g} />
            : <Zap size={15} color={status === "missed" ? C.r : kindColor} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: status === "missed" ? C.tx3 : C.tx, marginBottom: 1 }}>
            {es?.name ?? "Séance énergie"}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {kind && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 5, background: kindColor + "20", color: kindColor }}>
                {KIND_LABEL[kind] ?? kind}
              </span>
            )}
            <span style={{ fontSize: 10, color: C.tx3 }}>{dateStr}</span>
            {es?.total_duration_s != null && (
              <span style={{ fontSize: 10, color: C.tx3 }}>{Math.round(es.total_duration_s / 60)} min</span>
            )}
            {a.rpe_score != null && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#FFC933" }}>RPE {a.rpe_score}/10</span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {statusColor && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
              background: statusColor + "20", color: statusColor,
            }}>
              {STATUS_LABEL[status]}
            </span>
          )}
          {status === "completed" && (
            <button
              onClick={e => { e.stopPropagation(); handleUnvalidate(); }}
              style={{
                fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 6,
                border: "1px solid " + C.r + "40", background: "transparent", color: C.r,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >Dévalider</button>
          )}
          {isLogable && (
            open ? <ChevronUp size={14} color={C.tx3} /> : <ChevronDown size={14} color={C.tx3} />
          )}
        </div>
      </div>

      {/* Logging panel */}
      {open && isLogable && (
        <div style={{ borderTop: "1px solid " + C.brd, padding: "14px 14px 16px" }}>
          {isComplex ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 }}>
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
                        Bloc {i + 1} — {fmtIntervalLabel(b)}
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
          ) : (
            <div style={{ fontSize: 12, color: C.tx3, marginBottom: 12 }}>
              {workBlocks.length === 1 ? fmtIntervalLabel(workBlocks[0]) : "Séance continue"}
            </div>
          )}

          {/* Duration input */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>
              Durée réelle (min)
            </div>
            <input
              type="number"
              min={1}
              max={300}
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

          {/* Global note */}
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

          {/* Activité + km (volume de course) */}
          <div style={{ marginTop: 12 }}>
            <RunDistanceInput value={runDist} onChange={setRunDist} />
          </div>

          {/* Lien Strava / Garmin */}
          <input
            type="url"
            placeholder="Lien Strava ou Garmin (optionnel)"
            value={activityUrl}
            onChange={e => setActivityUrl(e.target.value)}
            style={{
              width: "100%", marginTop: 12, padding: "8px 10px", borderRadius: 4,
              border: "1px solid " + C.brdL, background: C.s2,
              color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none",
              boxSizing: "border-box",
            }}
          />

          <button
            onClick={handleValidate}
            disabled={complete.isPending}
            style={{
              width: "100%", marginTop: 10, padding: "11px 0", borderRadius: 4,
              border: "none",
              background: C.g,
              color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: complete.isPending ? "default" : "pointer",
              fontFamily: "inherit",
              opacity: complete.isPending ? 0.7 : 1,
            }}
          >
            {complete.isPending ? "Validation…" : "Valider la séance ✓"}
          </button>
        </div>
      )}
    </div>
  );
}

function EnergyAthleteView({ athleteId }: { athleteId: string }) {
  const { data: assignments = [], isLoading } = useEnergyAssignments(athleteId);
  const today = localISO();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = localISO(cutoff);

  const [rpeAssignmentId, setRpeAssignmentId] = useState<string | null>(null);
  const upsertRpe = useUpsertEnergyRpe();

  const visible = [...assignments]
    .filter(a => (a.scheduled_date ?? "") >= cutoffStr)
    .sort((a, b) => (a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? ""));

  if (isLoading) {
    return <div style={{ padding: "24px 16px", textAlign: "center", color: C.tx3, fontSize: 13 }}>Chargement…</div>;
  }

  if (visible.length === 0) {
    return (
      <div style={{ padding: "48px 20px", textAlign: "center" }}>
        <Zap size={36} style={{ color: C.tx3, margin: "0 auto 12px" }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 4 }}>
          Aucune séance énergétique
        </div>
        <div style={{ fontSize: 12, color: C.tx3 }}>Ton coach planifiera tes séances cardio ici.</div>
      </div>
    );
  }

  const rpeAssignment = rpeAssignmentId ? assignments.find(a => a.id === rpeAssignmentId) : null;

  return (
    <div style={{ padding: "16px" }}>
      {visible.map(a => (
        <EnergySessionCard
          key={a.id}
          a={a}
          athleteId={athleteId}
          today={today}
          onRpeDone={(id) => setRpeAssignmentId(id)}
        />
      ))}

      {rpeAssignment && (
        <>
          <div onClick={() => setRpeAssignmentId(null)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)" }} />
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 101,
            background: C.s1, borderRadius: "6px 6px 0 0", borderTop: "1px solid " + C.brd,
            padding: "24px 20px 40px", animation: "rpeSlideUp 220ms ease-out",
          }}>
            <style>{`@keyframes rpeSlideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: C.brdL, margin: "0 auto 20px" }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: C.tx, marginBottom: 4 }}>Comment s'est passée la séance ?</div>
            <div style={{ fontSize: 12, color: C.tx3, marginBottom: 24 }}>Évalue ton effort global (échelle Foster 1-10)</div>
            <RpeGridInline
              onSubmit={(v) => upsertRpe.mutate({ id: rpeAssignment.id, athleteId, rpe_score: v }, { onSettled: () => setRpeAssignmentId(null) })}
              onSkip={() => setRpeAssignmentId(null)}
              isPending={upsertRpe.isPending}
            />
          </div>
        </>
      )}
    </div>
  );
}

const FOSTER: Record<number, string> = {
  1: "Repos total", 2: "Très facile", 3: "Facile", 4: "Assez difficile",
  5: "Difficile", 6: "Difficile+", 7: "Difficile++", 8: "Très difficile",
  9: "Très difficile+", 10: "Maximal",
};
function rpeColor(v: number) { return v <= 4 ? C.g : v <= 7 ? C.o : C.r; }
function rpeBg(v: number) { return v <= 4 ? C.gS : v <= 7 ? C.oS : C.rS; }

function RpeGridInline({ onSubmit, onSkip, isPending }: { onSubmit: (v: number) => void; onSkip: () => void; isPending: boolean }) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
          <button key={v} onClick={() => setSelected(v)} style={{
            padding: "14px 0", borderRadius: 6,
            border: "1px solid " + (selected === v ? rpeColor(v) + "80" : C.brdL),
            background: selected === v ? rpeBg(v) : C.s2,
            color: selected === v ? rpeColor(v) : C.tx2,
            fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
          }}>{v}</button>
        ))}
      </div>
      <div style={{
        minHeight: 28, textAlign: "center", marginBottom: 28, fontSize: 13, fontWeight: 600,
        color: selected != null ? rpeColor(selected) : C.tx3,
        background: selected != null ? rpeBg(selected) : "transparent",
        borderRadius: 4, padding: "4px 12px",
      }}>
        {selected != null ? `${selected}/10 — ${FOSTER[selected]}` : "Sélectionne une valeur"}
      </div>
      <button
        onClick={() => selected != null && onSubmit(selected)}
        disabled={isPending || selected == null}
        style={{
          width: "100%", padding: "15px 0", borderRadius: 6, border: "none",
          background: selected != null ? C.ac : C.s2,
          color: selected != null ? "#fff" : C.tx3,
          fontSize: 14, fontWeight: 700, cursor: selected != null ? "pointer" : "default",
          fontFamily: "inherit",
        }}
      >
        {isPending ? "Enregistrement…" : "Enregistrer"}
      </button>
      <button onClick={onSkip} style={{
        width: "100%", marginTop: 12, padding: "10px 0", border: "none",
        background: "transparent", color: C.tx3, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
      }}>Passer</button>
    </>
  );
}

export default function LogSeancePage() {
  const location = useLocation();
  const locationState = location.state as { initialSess?: unknown; initialTab?: string } | null;
  const initialSess = locationState?.initialSess ?? null;
  const [logSubTab, setLogSubTab] = useState(locationState?.initialTab ?? "muscu");
  const [rpeSessionId, setRpeSessionId] = useState<string | null>(null);
  const [rpePending, setRpePending] = useState<{ sessionId: string; scheduledDate: string } | null>(null);

  const {
    athleteId, viewOnly, exos, sets, updSets, completedSessions, completeSession,
    uncompleteSession, goals, weeklyTarget, currentWeek, allMethods, athleteNotes,
    setAthleteNotes, sessions, blockConfig, sessionLogs, setSessionLogs,
    freeSessions, setFreeSessions, weekSchedule, setExos,
    timerLeft, timerDur, timerActive, timerFinished,
    timerSetDur, timerStart, timerStop,
  } = useAthleteContext();

  function computeScheduledDate(sessId: string, week: number): string {
    const sess = sessions.find(s => s.id === sessId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dow = (sess as any)?.weekDays?.[String(week)] ?? (sess as any)?.day_of_week;
    if (dow == null || !blockConfig?.startDate) return localISO();
    const d0 = new Date(blockConfig.startDate + "T12:00:00");
    const weekDow = d0.getDay();
    d0.setDate(d0.getDate() + (weekDow === 0 ? -6 : 1 - weekDow) + (week - 1) * 7 + (dow as number));
    return localISO(d0);
  }

  return (
    <>
      {/* Sub-tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid " + C.brd, background: C.bg, paddingLeft: 16, paddingRight: 16, gap: 0 }}>
        {[{ k: "muscu", l: "Musculation" }, { k: "energie", l: "Énergétique" }, { k: "specifique", l: "Spécifique" }].map(t => (
          <button key={t.k} onClick={() => setLogSubTab(t.k)} style={{ padding: "10px 14px", border: "none", borderBottom: "2px solid " + (logSubTab === t.k ? C.ac : "transparent"), background: "transparent", color: logSubTab === t.k ? C.ac : C.tx3, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase" as const, letterSpacing: "0.3px", flexShrink: 0 }}>{t.l}</button>
        ))}
      </div>

      {logSubTab === "muscu" && (
        <LogView
          exos={exos} sets={sets} updSets={updSets}
          completedSessions={completedSessions}
          completeSession={completeSession} uncompleteSession={uncompleteSession}
          goals={goals} weeklyTarget={weeklyTarget} currentWeek={currentWeek}
          allMethods={allMethods} athleteNotes={athleteNotes} setAthleteNotes={setAthleteNotes}
          sessions={sessions} blockConfig={blockConfig} initialSess={initialSess}
          timerLeft={timerLeft} timerDur={timerDur} timerActive={timerActive}
          timerFinished={timerFinished} onTimerSetDur={timerSetDur}
          onTimerStart={timerStart} onTimerStop={timerStop}
          viewOnly={viewOnly} sessionLogs={sessionLogs} setSessionLogs={setSessionLogs}
          freeSessions={freeSessions} setFreeSessions={setFreeSessions}
          onAddExercise={(sessId: string, ex: unknown) => setExos(prev => ({ ...prev, [sessId]: [...(prev[sessId] || []), ex] }))}
          weekSchedule={weekSchedule}
          onSessionCompleted={(sid: string, wk: number) => setRpePending({ sessionId: sid, scheduledDate: computeScheduledDate(sid, wk) })}
        />
      )}

      {logSubTab === "energie" && (
        <EnergyAthleteView athleteId={athleteId} />
      )}

      {rpePending && (
        <RpeSheet
          sessionId={rpePending.sessionId}
          scheduledDate={rpePending.scheduledDate}
          onClose={() => setRpePending(null)}
        />
      )}

      {logSubTab === "specifique" && (
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <Zap size={32} style={{ color: C.tx3, marginBottom: 12, display: "block", marginLeft: "auto", marginRight: "auto" }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 6 }}>Séances Spécifiques</div>
          <div style={{ fontSize: 13, color: C.tx3 }}>Cette fonctionnalité sera disponible prochainement.</div>
        </div>
      )}
    </>
  );
}
