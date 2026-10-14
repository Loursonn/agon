import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Trash2 } from "lucide-react";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useAuth } from "@/hooks/useAuth";
import { calcScore, getReco } from "@/lib/wellness";
import type { WellnessData } from "@/features/shared/types/athlete";
import { useHistorique, useDeleteWorkoutLog, useCopySessionAsType, type HistoLog } from "./useHistorique";
import type { Cycle, Mesocycle, Macrocycle } from "@/features/coach/components/planning/hooks/useTimelineData";
import { localISO } from "@/lib/date";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { icon: string; color: string; label: string }> = {
  completed: { icon: "✓", color: C.g,   label: "Faite"    },
  missed:    { icon: "✗", color: C.r,   label: "Manquée"  },
  skipped:   { icon: "⏭", color: C.tx3, label: "Passée"   },
  planned:   { icon: "○", color: C.b,   label: "Prévue"   },
};

function fmtDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}
function fmtRange(a: string, b: string): string {
  return `${fmtDate(a)} → ${fmtDate(b)}`;
}

/** Semaines (lundi → dimanche) couvrant [start, end] */
function weeksBetween(start: string, end: string): { start: string; end: string }[] {
  const s = new Date(start + "T12:00:00");
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); // lundi
  const weeks: { start: string; end: string }[] = [];
  const cur = new Date(s);
  while (localISO(cur) <= end) {
    const wEnd = new Date(cur); wEnd.setDate(cur.getDate() + 6);
    weeks.push({ start: localISO(cur), end: localISO(wEnd) });
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

// ── Accordion header ──────────────────────────────────────────────────────────

function AccordionHeader({
  open, onToggle, level, title, subtitle, badge, color,
}: {
  open: boolean; onToggle: () => void;
  level: "macro" | "meso" | "cycle";
  title: string; subtitle?: string; badge?: string; color: string;
}) {
  const pad = level === "macro" ? "12px 14px" : level === "meso" ? "10px 12px" : "9px 12px";
  const fs  = level === "macro" ? 14 : level === "meso" ? 13 : 12.5;
  return (
    <button
      onClick={onToggle}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8, padding: pad,
        background: open ? color + "10" : C.s1, border: "1px solid " + (open ? color + "40" : C.brd),
        borderRadius: 4, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
      }}
    >
      {open ? <ChevronDown size={14} color={color} /> : <ChevronRight size={14} color={C.tx3} />}
      <span style={{ fontSize: fs, fontWeight: 700, color: open ? color : C.tx, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {title}
      </span>
      {badge && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: color + "20", color, flexShrink: 0 }}>{badge}</span>}
      {subtitle && <span style={{ fontSize: 10, color: C.tx3, flexShrink: 0 }}>{subtitle}</span>}
    </button>
  );
}

// ── Log row ───────────────────────────────────────────────────────────────────

function LogRow({ log, onCopy, onDelete }: { log: HistoLog; onCopy: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const meta = STATUS_META[log.status] ?? STATUS_META.planned;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: C.s2, borderRadius: 4, border: "1px solid " + C.brd }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: meta.color, width: 16, textAlign: "center", flexShrink: 0 }} title={meta.label}>{meta.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.session_name}</div>
        <div style={{ fontSize: 10, color: C.tx3 }}>{fmtDate(log.scheduled_date)} · {meta.label}</div>
      </div>
      {confirm ? (
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={() => setConfirm(false)} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
          <button onClick={() => { onDelete(); setConfirm(false); }} style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: C.rV, color: "#0E0C0A", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Supprimer</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button onClick={onCopy} title="Copier vers Séances Type" style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Copy size={12} />
          </button>
          <button onClick={() => setConfirm(true)} title="Supprimer ce log" style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent", color: C.r, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Copy target dialog ────────────────────────────────────────────────────────

function CopyDialog({
  log, onPick, onClose,
}: {
  log: HistoLog;
  onPick: (targetAthleteId: string) => void;
  onClose: () => void;
}) {
  const { athletes, profile, user } = useAuth();
  const { athleteId } = useAthleteContext();

  const current = athletes.find((a) => a.id === athleteId);
  const others  = athletes.filter((a) => a.id !== athleteId);
  const selfAsAthlete = profile?.role === "coach_athlete" && user && user.id !== athleteId
    ? { id: user.id, full_name: (profile.full_name || "Moi") + " (moi)" }
    : null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, background: C.s1, borderRadius: 6, border: "1px solid " + C.brdL, padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.tx, marginBottom: 4 }}>Copier « {log.session_name} »</div>
        <div style={{ fontSize: 11, color: C.tx3, marginBottom: 14 }}>
          La séance sera ajoutée aux <b>Séances Type</b> de l'athlète choisi (squelette réutilisable).
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
          {current && (
            <button onClick={() => onPick(current.id)} style={{ padding: "10px 12px", borderRadius: 4, border: "1px solid " + C.coach + "50", background: C.coachS, color: C.coach, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}>
              {current.full_name} <span style={{ fontSize: 10, fontWeight: 400, color: C.tx3 }}>(cet athlète)</span>
            </button>
          )}
          {selfAsAthlete && (
            <button onClick={() => onPick(selfAsAthlete.id)} style={{ padding: "10px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}>
              {selfAsAthlete.full_name}
            </button>
          )}
          {others.map((a) => (
            <button key={a.id} onClick={() => onPick(a.id)} style={{ padding: "10px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}>
              {a.full_name}
            </button>
          ))}
        </div>
        <button onClick={onClose} style={{ width: "100%", marginTop: 12, padding: "9px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── Cycle content (semaines + logs) ───────────────────────────────────────────

function CycleContent({
  cycle, logs, onCopy, onDelete,
}: {
  cycle: Cycle;
  logs: HistoLog[];
  onCopy: (log: HistoLog) => void;
  onDelete: (logId: string) => void;
}) {
  const weeks = weeksBetween(cycle.start_date, cycle.end_date);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0 4px 22px" }}>
      {weeks.map((w, i) => {
        const wLogs = logs.filter((l) => l.scheduled_date >= w.start && l.scheduled_date <= w.end);
        if (wLogs.length === 0) return null;
        const done = wLogs.filter((l) => l.status === "completed").length;
        return (
          <div key={w.start}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 5, display: "flex", justifyContent: "space-between" }}>
              <span>Semaine {i + 1} · {fmtRange(w.start, w.end)}</span>
              <span style={{ color: done === wLogs.length && wLogs.length > 0 ? C.g : C.tx3 }}>{done}/{wLogs.length} faites</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {wLogs.map((l) => (
                <LogRow key={l.id} log={l} onCopy={() => onCopy(l)} onDelete={() => onDelete(l.id)} />
              ))}
            </div>
          </div>
        );
      })}
      {logs.length === 0 && (
        <div style={{ fontSize: 11, color: C.tx3, padding: "4px 0" }}>Aucune séance sur ce cycle.</div>
      )}
    </div>
  );
}

// ── Wellness history ──────────────────────────────────────────────────────────

const WELL_METRICS: { k: keyof WellnessData; label: string }[] = [
  { k: "fatigue", label: "Récup"   },
  { k: "sommeil", label: "Sommeil" },
  { k: "stress",  label: "Stress"  },
  { k: "energie", label: "Énergie" },
  { k: "doms",    label: "DOMS"    },
];

/** Normalise "yyyymmdd" ou "yyyy-mm-dd" → "yyyy-mm-dd" */
function normDate(key: string): string {
  return key.includes("-") ? key : `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
}

function metricColor(v?: number): string {
  if (v == null) return C.tx3;
  return v >= 4 ? C.g : v >= 3 ? C.o : C.r;
}

function WellnessRow({ date, w, onDelete }: { date: string; w: WellnessData; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const score = calcScore(w);
  const reco = getReco(score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: C.s2, borderRadius: 4, border: "1px solid " + C.brd }}>
      <div style={{ width: 44, flexShrink: 0, textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: reco.c, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 8, color: C.tx3, marginTop: 2 }}>{reco.label}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.tx, marginBottom: 4 }}>
          {new Date(date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })}
          {w.poids != null && <span style={{ fontWeight: 400, color: C.tx3 }}> · {w.poids} kg</span>}
          {w.sleepDur != null && <span style={{ fontWeight: 400, color: C.tx3 }}> · {Math.floor(w.sleepDur)}h{Math.round((w.sleepDur % 1) * 60) > 0 ? String(Math.round((w.sleepDur % 1) * 60)).padStart(2, "0") : ""} sommeil</span>}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {WELL_METRICS.map((m) => {
            const v = w[m.k] as number | undefined;
            return (
              <span key={m.k} style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: metricColor(v) + "18", color: metricColor(v) }}>
                {m.label} {v ?? "—"}/5
              </span>
            );
          })}
        </div>
        {w.domsZones && w.domsZones.length > 0 && (
          <div style={{ fontSize: 9, color: C.tx3, marginTop: 3 }}>Zones : {w.domsZones.join(", ")}</div>
        )}
      </div>
      {confirm ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
          <button onClick={() => { onDelete(); setConfirm(false); }} style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: C.rV, color: "#0E0C0A", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Supprimer</button>
          <button onClick={() => setConfirm(false)} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
        </div>
      ) : (
        <button onClick={() => setConfirm(true)} title="Supprimer ce wellness" style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent", color: C.r, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

function WellnessHistory() {
  const { wellnessHistory, setWellnessHistory } = useAthleteContext();
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());

  const deleteWellness = (origKey: string) => {
    const next = { ...(wellnessHistory ?? {}) };
    delete next[origKey];
    setWellnessHistory(next);
  };

  // Groupé par mois, plus récent en premier
  const byMonth = useMemo(() => {
    const entries = Object.entries(wellnessHistory ?? {})
      .map(([k, w]) => ({ origKey: k, date: normDate(k), w }))
      .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date))
      .sort((a, b) => b.date.localeCompare(a.date));
    const m = new Map<string, { origKey: string; date: string; w: WellnessData }[]>();
    for (const e of entries) {
      const month = e.date.slice(0, 7); // yyyy-mm
      const arr = m.get(month) ?? [];
      arr.push(e);
      m.set(month, arr);
    }
    return [...m.entries()];
  }, [wellnessHistory]);

  const toggle = (month: string) => {
    setOpenMonths((prev) => {
      const n = new Set(prev);
      if (n.has(month)) n.delete(month); else n.add(month);
      return n;
    });
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Historique wellness</div>
      <div style={{ fontSize: 12, color: C.tx2, marginBottom: 12 }}>
        Check-ins quotidiens · score global /100 + détail /5
      </div>

      {byMonth.length === 0 ? (
        <div style={{ background: C.s1, borderRadius: 6, padding: "14px 16px", border: "1px solid " + C.brd, fontSize: 12, color: C.tx3 }}>
          Aucun wellness enregistré par cet athlète.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {byMonth.map(([month, entries]) => {
            const open = openMonths.has(month);
            const avg = Math.round(entries.reduce((s, e) => s + calcScore(e.w), 0) / entries.length);
            const label = new Date(month + "-15T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
            return (
              <div key={month} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <AccordionHeader
                  open={open}
                  onToggle={() => toggle(month)}
                  level="cycle"
                  title={label.charAt(0).toUpperCase() + label.slice(1)}
                  subtitle={`${entries.length} jour${entries.length > 1 ? "s" : ""}`}
                  badge={`moy. ${avg}`}
                  color={getReco(avg).c}
                />
                {open && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingLeft: 22 }}>
                    {entries.map((e) => <WellnessRow key={e.date} date={e.date} w={e.w} onDelete={() => deleteWellness(e.origKey)} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── HistoriqueTab ─────────────────────────────────────────────────────────────

export function HistoriqueTab() {
  const { athleteId } = useAthleteContext();
  const { data, isLoading } = useHistorique(athleteId);
  const del = useDeleteWorkoutLog(athleteId);
  const copy = useCopySessionAsType();

  const [openMacros, setOpenMacros] = useState<Set<string>>(new Set());
  const [openMesos, setOpenMesos]   = useState<Set<string>>(new Set());
  const [openCycles, setOpenCycles] = useState<Set<string>>(new Set());
  const [copyLog, setCopyLog] = useState<HistoLog | null>(null);

  const toggle = (set: Set<string>, setter: (v: Set<string>) => void, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id); else n.add(id);
    setter(n);
  };

  const logsInRange = (start: string, end: string): HistoLog[] =>
    (data?.logs ?? []).filter((l) => l.scheduled_date >= start && l.scheduled_date <= end);

  // Logs hors de tout cycle
  const orphanLogs = useMemo(() => {
    const cycles = data?.cycles ?? [];
    return (data?.logs ?? []).filter(
      (l) => !cycles.some((c) => l.scheduled_date >= c.start_date && l.scheduled_date <= c.end_date),
    );
  }, [data]);
  const [orphansOpen, setOrphansOpen] = useState(false);

  const cycleStats = (c: Cycle) => {
    const logs = logsInRange(c.start_date, c.end_date);
    const done = logs.filter((l) => l.status === "completed").length;
    return `${done}/${logs.length}`;
  };

  const renderCycle = (c: Cycle) => (
    <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <AccordionHeader
        open={openCycles.has(c.id)}
        onToggle={() => toggle(openCycles, setOpenCycles, c.id)}
        level="cycle"
        title={c.name}
        subtitle={fmtRange(c.start_date, c.end_date)}
        badge={cycleStats(c)}
        color={C.o}
      />
      {openCycles.has(c.id) && (
        <CycleContent
          cycle={c}
          logs={logsInRange(c.start_date, c.end_date)}
          onCopy={(l) => setCopyLog(l)}
          onDelete={(id) => del.mutate(id)}
        />
      )}
    </div>
  );

  const renderMeso = (m: Mesocycle) => {
    const mesoCycles = (data?.cycles ?? []).filter((c) => c.mesocycle_id === m.id);
    return (
      <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <AccordionHeader
          open={openMesos.has(m.id)}
          onToggle={() => toggle(openMesos, setOpenMesos, m.id)}
          level="meso"
          title={m.name}
          subtitle={fmtRange(m.start_date, m.end_date)}
          badge={`${mesoCycles.length} cycle${mesoCycles.length > 1 ? "s" : ""}`}
          color="#FF6B9D"
        />
        {openMesos.has(m.id) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 16 }}>
            {mesoCycles.length === 0
              ? <div style={{ fontSize: 11, color: C.tx3, padding: "2px 0 4px 6px" }}>Aucun cycle dans ce méso.</div>
              : mesoCycles.map(renderCycle)}
          </div>
        )}
      </div>
    );
  };

  const renderMacro = (mc: Macrocycle) => {
    const macroMesos = (data?.mesos ?? []).filter((m) => m.macrocycle_id === mc.id);
    return (
      <div key={mc.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <AccordionHeader
          open={openMacros.has(mc.id)}
          onToggle={() => toggle(openMacros, setOpenMacros, mc.id)}
          level="macro"
          title={mc.name}
          subtitle={fmtRange(mc.start_date, mc.end_date)}
          badge={`${macroMesos.length} méso${macroMesos.length > 1 ? "s" : ""}`}
          color={C.ac}
        />
        {openMacros.has(mc.id) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 16 }}>
            {macroMesos.length === 0
              ? <div style={{ fontSize: 11, color: C.tx3, padding: "2px 0 4px 6px" }}>Aucun mésocycle dans ce macro.</div>
              : macroMesos.map(renderMeso)}
          </div>
        )}
      </div>
    );
  };

  const standaloneCycles = (data?.cycles ?? []).filter((c) => !c.mesocycle_id);

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Historique d'entraînement</div>
      <div style={{ fontSize: 12, color: C.tx2, marginBottom: 12 }}>
        Macros → mésos → cycles · séances par semaine · ✓ faite, ✗ manquée, ○ prévue
      </div>

      {isLoading ? (
        <div style={{ fontSize: 12, color: C.tx3, padding: "16px 0" }}>Chargement…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
          {(data?.macros ?? []).length === 0 && standaloneCycles.length === 0 && (
            <div style={{ background: C.s1, borderRadius: 6, padding: "14px 16px", border: "1px solid " + C.brd, fontSize: 12, color: C.tx3 }}>
              Aucune planification pour cet athlète — crée un macro/cycle dans l'onglet Planning.
            </div>
          )}

          {(data?.macros ?? []).map(renderMacro)}

          {standaloneCycles.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px", margin: "10px 0 2px" }}>
                Cycles indépendants
              </div>
              {standaloneCycles.map(renderCycle)}
            </>
          )}

          {orphanLogs.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
              <AccordionHeader
                open={orphansOpen}
                onToggle={() => setOrphansOpen(!orphansOpen)}
                level="cycle"
                title="Séances hors cycle"
                badge={String(orphanLogs.length)}
                color={C.tx3}
              />
              {orphansOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingLeft: 22 }}>
                  {orphanLogs.map((l) => (
                    <LogRow key={l.id} log={l} onCopy={() => setCopyLog(l)} onDelete={() => del.mutate(l.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <WellnessHistory />

      {copyLog && (
        <CopyDialog
          log={copyLog}
          onClose={() => setCopyLog(null)}
          onPick={(targetAthleteId) => {
            copy.mutate({ sourceAthleteId: athleteId, sessionId: copyLog.session_id, targetAthleteId });
            setCopyLog(null);
          }}
        />
      )}
    </div>
  );
}
