import { useState } from "react";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { X, ExternalLink, Calendar, Check, Minus, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { C } from "@/lib/theme";
import type { Macrocycle, Mesocycle, Cycle, Microcycle } from "@/features/shared/hooks/useTimelineData";
import {
  useUpdateMesocycle,
  useUpdateMacrocycle,
  useUpdateCycle,
  useUpdateMicrocycle,
  useMicroDayData,
  useCycleSessions,
} from "@/features/shared/hooks/useTimelineData";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CycleLevel = "macrocycle" | "mesocycle" | "cycle" | "microcycle";
export type CycleItem  = Macrocycle | Mesocycle | Cycle | Microcycle;

// ── MicroDayCard ──────────────────────────────────────────────────────────────

function MicroDayCard({ athleteId, day }: { athleteId: string; day: Date }) {
  const dateStr = format(day, "yyyy-MM-dd");
  const { data } = useMicroDayData(athleteId, dateStr);
  const today = format(new Date(), "yyyy-MM-dd") === dateStr;

  const workouts  = data?.workouts ?? [];
  const completed = workouts.filter((w) => w.status === "completed");
  const planned   = workouts.filter((w) => w.status === "planned");
  const missed    = workouts.filter((w) => w.status === "missed");

  return (
    <div
      style={{
        borderRadius: 4,
        border: "1px solid " + (today ? C.ac + "40" : C.brd),
        background: today ? C.acS : C.s2,
        padding: "6px 7px",
        minHeight: 68,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {/* Day label */}
      <div style={{ fontSize: 9, fontWeight: 700, color: today ? C.ac : C.tx3, textTransform: "uppercase" }}>
        {format(day, "EEE", { locale: fr })}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: today ? C.ac : C.tx }}>
        {format(day, "d")}
      </div>

      {/* Workout status */}
      {workouts.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {completed.map((w) => (
            <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <Check size={10} color={C.g} />
              {w.rpe != null && (
                <span style={{ fontSize: 8, background: C.acS, color: C.ac, borderRadius: 4, padding: "0 4px", fontWeight: 700 }}>
                  RPE {w.rpe}
                </span>
              )}
            </div>
          ))}
          {planned.map((w) => (
            <div key={w.id} style={{ fontSize: 8, color: C.tx3 }}>▷ {w.session_name.slice(0, 10)}</div>
          ))}
          {missed.map((w) => (
            <div key={w.id} style={{ fontSize: 8, color: C.r }}>✕</div>
          ))}
        </div>
      ) : (
        <Minus size={10} color={C.tx3} style={{ opacity: 0.4 }} />
      )}
    </div>
  );
}

// ── MicrocycleDashboard ───────────────────────────────────────────────────────

function MicrocycleDashboard({
  micro,
  athleteId,
  prevMicro,
}: {
  micro: Microcycle;
  athleteId: string;
  prevMicro?: Microcycle;
}) {
  const { mutate: update, isPending } = useUpdateMicrocycle(athleteId);
  const [startDate, setStartDate] = useState(micro.start_date);
  const [endDate,   setEndDate]   = useState(micro.end_date);
  const dirty = startDate !== micro.start_date || endDate !== micro.end_date;
  const [showPrev, setShowPrev] = useState(false);

  const currentDays = eachDayOfInterval({
    start: parseISO(micro.start_date),
    end:   parseISO(micro.end_date),
  });

  const prevDays = prevMicro
    ? eachDayOfInterval({
        start: parseISO(prevMicro.start_date),
        end:   parseISO(prevMicro.end_date),
      })
    : [];

  const weeks = showPrev && prevMicro
    ? [
        { label: `S-1 · ${format(parseISO(prevMicro.start_date), "d MMM", { locale: fr })}`, days: prevDays, isDeload: prevMicro.is_deload },
        { label: `S${micro.week_number} · ${format(parseISO(micro.start_date), "d MMM", { locale: fr })}`, days: currentDays, isDeload: micro.is_deload },
      ]
    : [
        { label: `S${micro.week_number} · ${format(parseISO(micro.start_date), "d MMM", { locale: fr })}`, days: currentDays, isDeload: micro.is_deload },
      ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Dates */}
      <DateFields
        startDate={startDate} endDate={endDate}
        onStartChange={setStartDate} onEndChange={setEndDate}
        color={C.tx3}
      />
      {dirty && (
        <button
          onClick={() => update({ id: micro.id, start_date: startDate, end_date: endDate })}
          disabled={isPending}
          style={{ width: "100%", padding: "10px 0", borderRadius: 4, border: "none", background: C.tx2, color: "#fff", fontSize: 13, fontWeight: 700, cursor: isPending ? "default" : "pointer", fontFamily: "inherit", opacity: isPending ? 0.7 : 1 }}
        >
          {isPending ? "Sauvegarde…" : "Enregistrer les dates"}
        </button>
      )}
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {micro.is_deload && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: C.bS, color: C.b }}>
              DELOAD
            </span>
          )}
          <span style={{ fontSize: 12, color: C.tx3 }}>
            {format(parseISO(micro.start_date), "d MMM", { locale: fr })} → {format(parseISO(micro.end_date), "d MMM", { locale: fr })}
          </span>
        </div>
        {prevMicro && (
          <button
            onClick={() => setShowPrev((p) => !p)}
            style={{
              padding: "4px 10px", borderRadius: 7,
              border: "1px solid " + C.brdL, background: showPrev ? C.s2 : "transparent",
              color: C.tx3, fontSize: 10, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {showPrev ? "Masquer S-1" : "Voir S-1"}
          </button>
        )}
      </div>

      {/* Week grids */}
      {weeks.map(({ label, days, isDeload }) => (
        <div key={label}>
          <div style={{ fontSize: 10, fontWeight: 700, color: isDeload ? C.b : C.tx3, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.4px" }}>
            {label}{isDeload ? " · Deload" : ""}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {days.map((day) => (
              <MicroDayCard key={format(day, "yyyy-MM-dd")} athleteId={athleteId} day={day} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── MesocycleForm ─────────────────────────────────────────────────────────────

function MesocycleForm({
  meso,
  athleteId,
  parentObjective,
}: {
  meso: Mesocycle;
  athleteId: string;
  parentObjective?: string | null;
}) {
  const { mutate: update, isPending } = useUpdateMesocycle(athleteId);

  const [startDate,   setStartDate]   = useState(meso.start_date);
  const [endDate,     setEndDate]     = useState(meso.end_date);
  const [objective,   setObjective]   = useState(meso.objective ?? "");
  const [frequency,   setFrequency]   = useState<number>(meso.frequency ?? 3);
  const [deloadWeek,  setDeloadWeek]  = useState<number>(meso.deload_week ?? 4);
  const [volumeType,  setVolumeType]  = useState<string>(meso.volume_config?.type ?? "progressive");
  const [zones,       setZones]       = useState<string[]>(meso.intensity_config?.zones ?? []);

  const VOLUME_TYPES = [
    { value: "progressive", label: "Progressif"  },
    { value: "ondulant",    label: "Ondulant"     },
    { value: "polarize",    label: "Polarisé"     },
    { value: "constant",    label: "Constant"     },
  ];

  const ZONES = ["Z1", "Z2", "Z3", "Z4", "Z5"] as const;

  function save() {
    update({
      id: meso.id,
      start_date: startDate,
      end_date: endDate,
      objective: objective || null,
      frequency,
      deload_week: deloadWeek,
      volume_config: { type: volumeType },
      intensity_config: { zones },
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Objectif */}
      <ObjectiveField value={objective} onChange={setObjective} parentObjective={parentObjective} color={C.coach} />
      {/* Dates */}
      <DateFields
        startDate={startDate} endDate={endDate}
        onStartChange={setStartDate} onEndChange={setEndDate}
        color={C.coach}
      />
      {/* Volume */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, marginBottom: 6, textTransform: "uppercase" }}>
          Volume
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {VOLUME_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setVolumeType(value)}
              style={{
                padding: "5px 12px", borderRadius: 4,
                border: "1px solid " + (volumeType === value ? C.ac + "60" : C.brdL),
                background: volumeType === value ? C.acS : "transparent",
                color: volumeType === value ? C.ac : C.tx3,
                fontSize: 11, fontWeight: volumeType === value ? 600 : 400,
                cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Intensity zones */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, marginBottom: 6, textTransform: "uppercase" }}>
          Zones d'intensité
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {ZONES.map((z) => {
            const active = zones.includes(z);
            return (
              <button
                key={z}
                onClick={() => setZones((prev) => active ? prev.filter((x) => x !== z) : [...prev, z])}
                style={{
                  width: 40, height: 36, borderRadius: 4,
                  border: "1px solid " + (active ? C.coach + "60" : C.brdL),
                  background: active ? C.coachS : "transparent",
                  color: active ? C.coach : C.tx3,
                  fontSize: 12, fontWeight: active ? 700 : 400,
                  cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
                }}
              >
                {z}
              </button>
            );
          })}
        </div>
      </div>

      {/* Frequency */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, marginBottom: 6, textTransform: "uppercase" }}>
          Fréquence ({frequency} séances/sem)
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setFrequency((f) => Math.max(1, f - 1))}
            style={{ width: 32, height: 32, borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", fontSize: 16 }}
          >−</button>
          <div style={{ width: 40, textAlign: "center", fontSize: 20, fontWeight: 800, color: C.tx }}>{frequency}</div>
          <button
            onClick={() => setFrequency((f) => Math.min(14, f + 1))}
            style={{ width: 32, height: 32, borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", fontSize: 16 }}
          >+</button>
        </div>
      </div>

      {/* Deload week */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, marginBottom: 6, textTransform: "uppercase" }}>
          Semaine deload
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {[2, 3, 4, 5, 6].map((w) => (
            <button
              key={w}
              onClick={() => setDeloadWeek(w)}
              style={{
                width: 40, height: 32, borderRadius: 4,
                border: "1px solid " + (deloadWeek === w ? C.b + "60" : C.brdL),
                background: deloadWeek === w ? C.bS : "transparent",
                color: deloadWeek === w ? C.b : C.tx3,
                fontSize: 11, fontWeight: deloadWeek === w ? 700 : 400,
                cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
              }}
            >
              S{w}
            </button>
          ))}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={save}
        disabled={isPending}
        style={{
          width: "100%", padding: "12px 0", borderRadius: 6,
          border: "none", background: isPending ? C.s2 : C.ac,
          color: isPending ? C.tx3 : "#fff",
          fontSize: 14, fontWeight: 700, cursor: isPending ? "default" : "pointer",
          fontFamily: "inherit", marginTop: 4,
        }}
      >
        {isPending ? "Sauvegarde..." : "Enregistrer"}
      </button>
    </div>
  );
}

// ── ObjectiveField helper ─────────────────────────────────────────────────────

function ObjectiveField({
  value, onChange, parentObjective, color,
}: {
  value: string; onChange: (v: string) => void;
  parentObjective?: string | null; color: string;
}) {
  return (
    <div>
      {parentObjective && (
        <div style={{ fontSize: 10, color: C.tx3, marginBottom: 6, padding: "6px 10px", borderRadius: 7, background: C.s2, border: "1px solid " + C.brd }}>
          <span style={{ fontWeight: 700, color }}>↑ Parent : </span>{parentObjective}
        </div>
      )}
      <div style={{ fontSize: 9, color: C.tx3, marginBottom: 4 }}>Objectif</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ex: Courir en 4:00/km…"
        style={{
          width: "100%", padding: "7px 10px", borderRadius: 4,
          border: "1px solid " + color + "40", background: C.s2,
          color: C.tx, fontSize: 12, fontFamily: "inherit",
          outline: "none", boxSizing: "border-box",
        }}
      />
    </div>
  );
}

// ── DateFields helper ─────────────────────────────────────────────────────────

function DateFields({
  startDate, endDate,
  onStartChange, onEndChange,
  color,
}: {
  startDate: string; endDate: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  color: string;
}) {
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "7px 10px", borderRadius: 4,
    border: "1px solid " + color + "40", background: C.s2,
    color: C.tx, fontSize: 12, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box",
  };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {[
        { label: "Début", value: startDate, onChange: onStartChange },
        { label: "Fin",   value: endDate,   onChange: onEndChange   },
      ].map(({ label, value, onChange }) => (
        <div key={label} style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: C.tx3, marginBottom: 4 }}>{label}</div>
          <input type="date" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
        </div>
      ))}
    </div>
  );
}

// ── MacrocyclePanel ───────────────────────────────────────────────────────────

function MacrocyclePanel({ macro, athleteId }: { macro: Macrocycle; athleteId: string }) {
  const { mutate: update, isPending } = useUpdateMacrocycle(athleteId);
  const [startDate, setStartDate] = useState(macro.start_date);
  const [endDate,   setEndDate]   = useState(macro.end_date);
  const [objective, setObjective] = useState(macro.objective ?? "");
  const dirty = startDate !== macro.start_date || endDate !== macro.end_date || objective !== (macro.objective ?? "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <ObjectiveField value={objective} onChange={setObjective} color={C.ac} />
      <DateFields
        startDate={startDate} endDate={endDate}
        onStartChange={setStartDate} onEndChange={setEndDate}
        color={C.ac}
      />
      {dirty && (
        <button
          onClick={() => update({ id: macro.id, start_date: startDate, end_date: endDate, objective: objective || null })}
          disabled={isPending}
          style={{ width: "100%", padding: "10px 0", borderRadius: 4, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 13, fontWeight: 700, cursor: isPending ? "default" : "pointer", fontFamily: "inherit", opacity: isPending ? 0.7 : 1 }}
        >
          {isPending ? "Sauvegarde…" : "Enregistrer"}
        </button>
      )}
    </div>
  );
}

// ── CyclePanel ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  completed: { label: "Réalisée",   color: C.g,     bg: C.g  + "18" },
  planned:   { label: "Planifiée",  color: C.tx3,   bg: C.s2       },
  missed:    { label: "Manquée",    color: C.r,     bg: C.r  + "18" },
  skipped:   { label: "Ignorée",    color: C.tx3,   bg: C.s2       },
};

function CyclePanel({ cycle, athleteId, parentObjective }: { cycle: Cycle; athleteId: string; parentObjective?: string | null }) {
  const navigate = useNavigate();
  const { mutate: update, isPending } = useUpdateCycle(athleteId);
  const [startDate, setStartDate] = useState(cycle.start_date);
  const [endDate,   setEndDate]   = useState(cycle.end_date);
  const [objective, setObjective] = useState(cycle.objective ?? "");
  const dirty = startDate !== cycle.start_date || endDate !== cycle.end_date || objective !== (cycle.objective ?? "");
  const { data: sessions = [], isLoading } = useCycleSessions(athleteId, cycle.start_date, cycle.end_date);

  const completed = sessions.filter((s) => s.status === "completed");
  const planned   = sessions.filter((s) => s.status === "planned");
  const missed    = sessions.filter((s) => s.status === "missed");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Objectif */}
      <ObjectiveField value={objective} onChange={setObjective} parentObjective={parentObjective} color={C.o} />
      {/* Dates */}
      <DateFields
        startDate={startDate} endDate={endDate}
        onStartChange={setStartDate} onEndChange={setEndDate}
        color={C.o}
      />
      {dirty && (
        <button
          onClick={() => update({ id: cycle.id, start_date: startDate, end_date: endDate, objective: objective || null })}
          disabled={isPending}
          style={{ width: "100%", padding: "10px 0", borderRadius: 4, border: "none", background: C.oV, color: "#0E0C0A", fontSize: 13, fontWeight: 700, cursor: isPending ? "default" : "pointer", fontFamily: "inherit", opacity: isPending ? 0.7 : 1 }}
        >
          {isPending ? "Sauvegarde…" : "Enregistrer"}
        </button>
      )}

      {/* Stats summary */}
      {sessions.length > 0 && (
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "Réalisées", count: completed.length, color: C.g },
            { label: "Planifiées", count: planned.length,  color: C.tx3 },
            { label: "Manquées",  count: missed.length,    color: C.r },
          ].map(({ label, count, color }) => (
            <div key={label} style={{ flex: 1, background: C.s2, borderRadius: 4, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color }}>{count}</div>
              <div style={{ fontSize: 9, color: C.tx3, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Sessions list */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>
          Séances du cycle
        </div>

        {isLoading ? (
          <div style={{ padding: "20px 0", textAlign: "center" }}>
            <div style={{ width: 18, height: 18, border: "2px solid " + C.brdL, borderTopColor: C.o, borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: "16px 0", textAlign: "center", fontSize: 12, color: C.tx3 }}>
            Aucune séance sur cette période
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sessions.map((s) => {
              const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.planned;
              return (
                <div
                  key={s.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 12px", borderRadius: 4,
                    background: cfg.bg,
                    border: "1px solid " + cfg.color + "30",
                  }}
                >
                  {/* Status dot */}
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />

                  {/* Date */}
                  <div style={{ fontSize: 10, color: C.tx3, minWidth: 52, flexShrink: 0 }}>
                    {format(parseISO(s.scheduled_date), "EEE d MMM", { locale: fr })}
                  </div>

                  {/* Name */}
                  <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.session_name}
                  </div>

                  {/* RPE badge */}
                  {s.rpe != null && (
                    <div style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: C.acS, color: C.ac, flexShrink: 0 }}>
                      RPE {s.rpe}
                    </div>
                  )}

                  {/* Status label */}
                  <div style={{ fontSize: 9, fontWeight: 700, color: cfg.color, flexShrink: 0 }}>
                    {cfg.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Calendar month button */}
      <button
        onClick={() =>
          navigate(`/coach/athletes/${athleteId}/planning?view=month&month=${cycle.start_date.slice(0, 7)}`)
        }
        style={{
          width: "100%", padding: "12px 0", borderRadius: 6,
          border: "1px solid " + C.ac + "40", background: C.acS,
          color: C.ac, fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}
      >
        <Calendar size={15} />
        Voir dans le calendrier mois
        <ChevronRight size={13} style={{ opacity: 0.6 }} />
      </button>
    </div>
  );
}

// ── CycleDrawer ───────────────────────────────────────────────────────────────

interface CycleDrawerProps {
  open: boolean;
  onClose: () => void;
  level: CycleLevel | null;
  item: CycleItem | null;
  athleteId: string;
  prevMicrocycle?: Microcycle;
  // Full timeline data to look up parent objectives
  macrocycles?: Macrocycle[];
  mesocycles?:  Mesocycle[];
  cycles?:      Cycle[];
}

const LEVEL_LABELS: Record<CycleLevel, string> = {
  macrocycle: "Macrocycle",
  mesocycle:  "Mésocycle",
  cycle:      "Cycle",
  microcycle: "Microcycle",
};

const LEVEL_COLORS: Record<CycleLevel, string> = {
  macrocycle: C.ac,
  mesocycle:  C.coach,
  cycle:      C.o,
  microcycle: C.tx3,
};

export function CycleDrawer({
  open, onClose, level, item, athleteId, prevMicrocycle,
  macrocycles = [], mesocycles = [], cycles = [],
}: CycleDrawerProps) {
  if (!open || !level || !item) return null;

  const color = LEVEL_COLORS[level];

  // Resolve parent objectives for hierarchy display
  const mesoParentObjective = level === "mesocycle"
    ? macrocycles.find((m) => m.id === (item as Mesocycle).macrocycle_id)?.objective
    : undefined;
  const cycleParentObjective = level === "cycle"
    ? mesocycles.find((m) => m.id === (item as Cycle).mesocycle_id)?.objective
    : undefined;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.5)" }}
      />
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 50,
          width: 440, maxWidth: "92vw",
          background: C.s1, borderLeft: "1px solid " + C.brd,
          display: "flex", flexDirection: "column",
          animation: "tlSlideIn 200ms ease-out",
        }}
      >
        <style>{`
          @keyframes tlSlideIn {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>

        {/* Header */}
        <div
          style={{
            padding: "16px 20px", borderBottom: "1px solid " + C.brd,
            display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 8, height: 32, borderRadius: 4,
              background: color, flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {LEVEL_LABELS[level]}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {(item as Macrocycle | Mesocycle | Cycle).name ??
               `Semaine ${(item as Microcycle).week_number}`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 4,
              border: "1px solid " + C.brdL, background: "transparent",
              color: C.tx3, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px", scrollbarWidth: "none" }}>
          {level === "macrocycle" && (
            <MacrocyclePanel macro={item as Macrocycle} athleteId={athleteId} />
          )}
          {level === "mesocycle" && (
            <MesocycleForm meso={item as Mesocycle} athleteId={athleteId} parentObjective={mesoParentObjective} />
          )}
          {level === "cycle" && (
            <CyclePanel cycle={item as Cycle} athleteId={athleteId} parentObjective={cycleParentObjective} />
          )}
          {level === "microcycle" && (
            <MicrocycleDashboard
              micro={item as Microcycle}
              athleteId={athleteId}
              prevMicro={prevMicrocycle}
            />
          )}
        </div>
      </div>
    </>
  );
}
