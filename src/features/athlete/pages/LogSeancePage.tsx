import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Zap, Check, ChevronDown, ChevronUp } from "lucide-react";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import LogView from "@/components/athlete/LogView";
import {
  useEnergyAssignments,
  useCompleteEnergyAssignment,
  useUpsertEnergyRpe,
  useUpdateEnergyAssignment,
} from "@/features/shared/hooks/useEnergyAssignments";
import { RpeSheet } from "@/features/athlete/components/RpeSheet";
import { SessionPainQuestion } from "@/features/athlete/components/session/SessionPainQuestion";
import { useSaveSessionPain } from "@/features/shared/hooks/useSessionPain";
import { EMPTY_SESSION_PAIN, sessionPainPayload, type SessionPainAnswer } from "@/lib/sessionPain";
import type { EnergySessionAssignmentRow, EnergyStep, EnergyInterval, BlockLogs } from "@/types/energy";
import { localISO } from "@/lib/date";
import type { ExosMap } from "@/features/shared/types/athlete";
import { RunDistanceInput } from "@/features/shared/components/RunDistanceInput";
import { initialRunDistance, runDistancePayload, type RunDistanceValue } from "@/features/shared/components/runDistance";

const KIND_COLOR: Record<string, string> = {
  vo2: C.ac, tempo: C.b, seuil: C.o,
  footing: C.g, fartlek: C.r, autre: C.tx3, custom: C.tx3,
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

const STATUS_PILL = {
  completed: "bg-agon-succes/[0.125] text-agon-succes",
  partial:   "bg-agon-info/[0.125] text-agon-info",
  missed:    "bg-agon-erreur/[0.125] text-agon-erreur",
  planned:   "bg-agon-tx3/[0.125] text-agon-tx3",
};
const STATUS_BORDER = {
  completed: "border-agon-succes/[0.25]",
  partial:   "border-agon-info/[0.25]",
  missed:    "border-agon-erreur/[0.25]",
  planned:   "border-agon-brd-l",
};
const INPUT = "box-border w-full rounded-[4px] border border-agon-brd-l bg-agon-s2 px-2.5 font-[inherit] text-agon-tx [outline:none]";
const FIELD_LABEL = "text-[11px] font-semibold uppercase tracking-[0.4px] text-agon-tx3";
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
  const es = (a as unknown as Record<string, unknown>).energy_sessions as {
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
  const [activityUrl, setActivityUrl] = useState(() => ((a as unknown as Record<string, unknown>).activity_url as string) ?? "");
  const [actualDuration, setActualDuration] = useState<string>(() => {
    if ((a as unknown as Record<string, unknown>).actual_duration_min != null)
      return String((a as unknown as Record<string, unknown>).actual_duration_min);
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
    <div className={cn("mb-2.5 overflow-hidden rounded-[6px] border bg-agon-s1", STATUS_BORDER[status])}>
      {/* Header row */}
      <div
        className={cn("flex items-center gap-2.5 px-3.5 py-3", isLogable ? "cursor-pointer" : "cursor-default")}
        onClick={() => isLogable && setOpen(o => !o)}
      >
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-[4px]",
            status === "missed" && "bg-agon-erreur/[0.125]",
            status === "completed" && "bg-agon-succes/[0.125]",
          )}
          style={status === "missed" || status === "completed" ? undefined : { background: kindColor + "20" }}
        >
          {status === "completed"
            ? <Check size={15} color={C.g} />
            : <Zap size={15} color={status === "missed" ? C.r : kindColor} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className={cn("mb-px text-[13px] font-bold", status === "missed" ? "text-agon-tx3" : "text-agon-tx")}>
            {es?.name ?? "Séance énergie"}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {kind && (
              <span className="rounded-[5px] px-[5px] py-px text-[9px] font-bold" style={{ background: kindColor + "20", color: kindColor }}>
                {KIND_LABEL[kind] ?? kind}
              </span>
            )}
            <span className="text-[10px] text-agon-tx3">{dateStr}</span>
            {es?.total_duration_s != null && (
              <span className="text-[10px] text-agon-tx3">{Math.round(es.total_duration_s / 60)} min</span>
            )}
            {a.rpe_score != null && (
              <span className="text-[10px] font-bold text-agon-accent">RPE {a.rpe_score}/10</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={cn("rounded-[6px] px-[7px] py-0.5 text-[9px] font-bold", STATUS_PILL[status])}>
            {STATUS_LABEL[status]}
          </span>
          {status === "completed" && (
            <button
              onClick={e => { e.stopPropagation(); handleUnvalidate(); }}
              className="cursor-pointer rounded-[6px] border border-agon-erreur/[0.25] bg-transparent px-[7px] py-0.5 font-[inherit] text-[9px] font-semibold text-agon-erreur"
            >Dévalider</button>
          )}
          {isLogable && (
            open ? <ChevronUp size={14} color={C.tx3} /> : <ChevronDown size={14} color={C.tx3} />
          )}
        </div>
      </div>

      {/* Logging panel */}
      {open && isLogable && (
        <div className="border-t border-agon-brd px-3.5 pb-4 pt-3.5">
          {isComplex ? (
            <>
              <div className={cn(FIELD_LABEL, "mb-2.5")}>
                Blocs d'effort
              </div>
              {workBlocks.map((b, i) => {
                const done = localBlocks[b.id]?.done ?? false;
                return (
                  <div key={b.id} className={cn("flex items-start gap-2.5 py-2.5", i < workBlocks.length - 1 && "border-b border-agon-brd-l")}>
                    <button
                      onClick={() => setLocalBlocks(prev => ({ ...prev, [b.id]: { ...prev[b.id], done: !done } }))}
                      className={cn(
                        "flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] border-[1.5px]",
                        done ? "border-agon-succes bg-agon-succes/[0.125]" : "border-agon-brd-l bg-transparent",
                      )}
                    >
                      {done && <Check size={13} color={C.g} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className={cn("mb-1 text-[12px] font-semibold", done ? "text-agon-tx3" : "text-agon-tx")}>
                        Bloc {i + 1} — {fmtIntervalLabel(b)}
                      </div>
                      <input
                        placeholder="Note (optionnel)"
                        value={localBlocks[b.id]?.note ?? ""}
                        onChange={e => setLocalBlocks(prev => ({ ...prev, [b.id]: { ...prev[b.id], note: e.target.value } }))}
                        className={cn(INPUT, "py-1.5 text-[12px]")}
                      />
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="mb-3 text-[12px] text-agon-tx3">
              {workBlocks.length === 1 ? fmtIntervalLabel(workBlocks[0]) : "Séance continue"}
            </div>
          )}

          {/* Duration input */}
          <div className="mt-3">
            <div className={cn(FIELD_LABEL, "mb-1.5")}>
              Durée réelle (min)
            </div>
            <input
              type="number"
              min={1}
              max={300}
              value={actualDuration}
              onChange={e => setActualDuration(e.target.value)}
              placeholder="Durée en minutes"
              className={cn(INPUT, "py-2 text-[13px]")}
            />
          </div>

          {/* Global note */}
          <textarea
            placeholder="Note sur la séance…"
            value={globalNote}
            onChange={e => setGlobalNote(e.target.value)}
            rows={2}
            className={cn(INPUT, "mt-3 resize-none py-2 text-[12px]")}
          />

          {/* Activité + km (volume de course) */}
          <div className="mt-3">
            <RunDistanceInput value={runDist} onChange={setRunDist} />
          </div>

          {/* Lien Strava / Garmin */}
          <input
            type="url"
            placeholder="Lien Strava ou Garmin (optionnel)"
            value={activityUrl}
            onChange={e => setActivityUrl(e.target.value)}
            className={cn(INPUT, "mt-3 py-2 text-[12px]")}
          />

          <button
            onClick={handleValidate}
            disabled={complete.isPending}
            className={cn(
              "mt-2.5 w-full rounded-[4px] border-none bg-agon-succes py-[11px] font-[inherit] text-[13px] font-bold text-agon-ink",
              complete.isPending ? "cursor-default opacity-70" : "cursor-pointer",
            )}
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
  // Question douleur de fin de séance (15/11) : Non par défaut, jamais bloquante.
  const [pain, setPain] = useState<SessionPainAnswer>(EMPTY_SESSION_PAIN);
  const savePain = useSaveSessionPain();
  const painPayload = sessionPainPayload(pain);
  const closeRpe = () => { setRpeAssignmentId(null); setPain(EMPTY_SESSION_PAIN); };

  const visible = [...assignments]
    .filter(a => (a.scheduled_date ?? "") >= cutoffStr)
    .sort((a, b) => (a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? ""));

  if (isLoading) {
    return <div className="px-4 py-6 text-center text-[13px] text-agon-tx3">Chargement…</div>;
  }

  if (visible.length === 0) {
    return (
      <div className="px-5 py-12 text-center">
        <Zap size={36} className="mx-auto mb-3 mt-0 text-agon-tx3" />
        <div className="mb-1 text-[14px] font-bold text-agon-tx">
          Aucune séance énergétique
        </div>
        <div className="text-[12px] text-agon-tx3">Ton coach planifiera tes séances cardio ici.</div>
      </div>
    );
  }

  const rpeAssignment = rpeAssignmentId ? assignments.find(a => a.id === rpeAssignmentId) : null;

  return (
    <div className="p-4">
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
          <div onClick={closeRpe} className="fixed inset-0 z-[100] bg-agon-ink/[0.6]" />
          <div className="fixed inset-x-0 bottom-0 z-[101] animate-[rpeSlideUp_220ms_ease-out] max-h-[92dvh] overflow-y-auto rounded-t-[6px] border-t border-agon-brd bg-agon-s1 px-5 pb-10 pt-6">
            <style>{`@keyframes rpeSlideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
            <div className="mx-auto mb-5 h-1 w-9 rounded-[2px] bg-agon-brd-l" />
            <div className="mb-1 text-[16px] font-extrabold text-agon-tx">Comment s'est passée la séance ?</div>
            <div className="mb-6 text-[12px] text-agon-tx3">Évalue ton effort global (échelle Foster 1-10)</div>
            <RpeGridInline
              onSubmit={(v) => {
                if (painPayload) savePain.mutate({ target: { kind: "energy", id: rpeAssignment.id }, athleteId, ...painPayload });
                if (v != null) upsertRpe.mutate({ id: rpeAssignment.id, athleteId, rpe_score: v }, { onSettled: closeRpe });
                else closeRpe();
              }}
              onSkip={closeRpe}
              isPending={upsertRpe.isPending}
              canSubmitWithout={painPayload != null}
            >
              <SessionPainQuestion value={pain} onChange={setPain} />
            </RpeGridInline>
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
type RpeTone = "succes" | "alerte" | "erreur";
function rpeTone(v: number): RpeTone { return v <= 4 ? "succes" : v <= 7 ? "alerte" : "erreur"; }
/** Case choisie : contour (hex 80), fond doux, texte. */
const RPE_CELL: Record<RpeTone, string> = {
  succes: "border-agon-succes/[0.5] bg-agon-succes-doux text-agon-succes",
  alerte: "border-agon-alerte/[0.5] bg-agon-alerte-doux text-agon-alerte",
  erreur: "border-agon-erreur/[0.5] bg-agon-erreur-doux text-agon-erreur",
};
const RPE_LABEL: Record<RpeTone, string> = {
  succes: "bg-agon-succes-doux text-agon-succes",
  alerte: "bg-agon-alerte-doux text-agon-alerte",
  erreur: "bg-agon-erreur-doux text-agon-erreur",
};

function RpeGridInline({ onSubmit, onSkip, isPending, children, canSubmitWithout = false }: {
  onSubmit: (v: number | null) => void;
  onSkip: () => void;
  isPending: boolean;
  /** Affiché entre l'échelle et le bouton (question douleur). */
  children?: ReactNode;
  /** Enregistrer sans RPE (une douleur a été saisie). */
  canSubmitWithout?: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const canSubmit = selected != null || canSubmitWithout;
  return (
    <>
      <div className="mb-4 grid grid-cols-[repeat(5,1fr)] gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
          <button
            key={v}
            onClick={() => setSelected(v)}
            className={cn(
              "cursor-pointer rounded-[6px] border py-3.5 font-[inherit] text-[18px] font-extrabold",
              selected === v ? RPE_CELL[rpeTone(v)] : "border-agon-brd-l bg-agon-s2 text-agon-tx2",
            )}
          >{v}</button>
        ))}
      </div>
      <div className={cn(
        "mb-5 min-h-[28px] rounded-[4px] px-3 py-1 text-center text-[13px] font-semibold",
        selected != null ? RPE_LABEL[rpeTone(selected)] : "bg-transparent text-agon-tx3",
      )}>
        {selected != null ? `${selected}/10 — ${FOSTER[selected]}` : "Sélectionne une valeur"}
      </div>
      {children && <div className="mb-6">{children}</div>}
      <button
        onClick={() => canSubmit && onSubmit(selected)}
        disabled={isPending || !canSubmit}
        className={cn(
          "w-full rounded-[6px] border-none py-[15px] font-[inherit] text-[14px] font-bold",
          canSubmit ? "cursor-pointer bg-agon-accent text-agon-ink" : "cursor-default bg-agon-s2 text-agon-tx3",
        )}
      >
        {isPending ? "Enregistrement…" : "Enregistrer"}
      </button>
      <button onClick={onSkip} className="mt-3 w-full cursor-pointer border-none bg-transparent py-2.5 font-[inherit] text-[13px] text-agon-tx3">Passer</button>
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
      <div className="flex gap-0 border-b border-agon-brd bg-agon-bg px-4">
        {[{ k: "muscu", l: "Musculation" }, { k: "energie", l: "Énergétique" }, { k: "specifique", l: "Spécifique" }].map(t => (
          <button
            key={t.k}
            onClick={() => setLogSubTab(t.k)}
            className={cn(
              "shrink-0 cursor-pointer border-0 border-b-2 bg-transparent px-3.5 py-2.5 font-[inherit] text-[11px] font-semibold uppercase tracking-[0.3px]",
              logSubTab === t.k ? "border-agon-accent text-agon-accent" : "border-transparent text-agon-tx3",
            )}
          >{t.l}</button>
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
          onAddExercise={(sessId: string, ex: unknown) => setExos(prev => ({ ...prev, [sessId]: [...(prev[sessId] || []), ex as ExosMap[string][number]] }))}
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
        <div className="px-5 py-10 text-center">
          <Zap size={32} className="mx-auto mb-3 block text-agon-tx3" />
          <div className="mb-1.5 text-[15px] font-bold text-agon-tx">Séances Spécifiques</div>
          <div className="text-[13px] text-agon-tx3">Cette fonctionnalité sera disponible prochainement.</div>
        </div>
      )}
    </>
  );
}
