import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Zap, Check, ChevronDown, ChevronUp } from "lucide-react";
import { C } from "@/lib/theme";
import { ROLE_COLOR, ROLE_LABEL_FR } from "@/features/coach/components/energy/SessionPreviewModal";
import { formatS, formatTarget } from "@/lib/energy/formatTarget";
import type { EnergySessionDetail, EnergyStepLog } from "@/features/shared/types/retours.types";

// ── Kind labels / colors ──────────────────────────────────────────────────────

const KIND_COLOR: Record<string, string> = {
  vo2: "#FFC933", tempo: "#33B5FF", seuil: "#F59E0B",
  footing: "#10B981", fartlek: "#EF4444", autre: "#6B7280", custom: "#6B7280",
};
const KIND_LABEL: Record<string, string> = {
  vo2: "VO₂max", tempo: "Tempo", seuil: "Seuil",
  footing: "Footing", fartlek: "Fartlek", autre: "Autre", custom: "Custom",
};

const KIND_LABELS: Record<string, string> = {
  ...KIND_LABEL,
  intermittent: "Intermittent", continu: "Continu",
  coupures: "Coupures", sprint: "Sprint", circuit: "Circuit",
};

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    completed: { label: "Complétée",   bg: "rgba(34,201,147,0.15)", color: "#66F03C" },
    missed:    { label: "Manquée",     bg: "rgba(239,68,68,0.15)",  color: "#EF4444" },
    skipped:   { label: "Passée",      bg: "rgba(107,114,128,0.2)", color: "#9CA3AF" },
    planned:   { label: "Planifiée",   bg: "rgba(59,141,240,0.15)", color: "#33B5FF" },
    in_progress: { label: "En cours",  bg: "rgba(245,158,11,0.15)", color: "#F59E0B" },
  };
  const s = cfg[status] ?? cfg["planned"];
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ── Step row (plan + log) ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StepLogRow({ step, log, index }: { step: any; log: Record<string, EnergyStepLog> | null; index: number }) {
  const id    = step.id ?? String(index);
  const entry = log?.[id];
  const hasLog = log !== null;

  if (step.type === "interval") {
    const rc  = ROLE_COLOR[step.role as string] ?? "#6B7280";
    const dur = step.duration?.kind === "time"
      ? formatS(step.duration.value ?? 0)
      : step.duration?.kind === "distance"
      ? `${step.duration.value ?? 0} m`
      : step.duration?.kind === "calories"
      ? `${step.duration.value ?? 0} kcal`
      : "Lap";
    const tgt = step.target ? formatTarget(step.target) : null;

    return (
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "8px 10px", borderRadius: 4,
        background: entry?.status === "done" ? C.g + "10"
          : entry?.status === "partial" ? "#F59E0B10"
          : "transparent",
      }}>
        {/* Role bar */}
        <div style={{ width: 3, height: 32, borderRadius: 2, background: rc, flexShrink: 0, marginTop: 2 }} />
        {/* Step info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: rc }}>{ROLE_LABEL_FR[step.role as string] ?? step.role}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{dur}</span>
            {tgt && tgt !== "Libre" && (
              <span style={{ fontSize: 10, color: C.tx3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tgt}</span>
            )}
          </div>
          {entry?.status === "partial" && entry.comment && (
            <div style={{ fontSize: 10, color: "#F59E0B", marginTop: 2, fontStyle: "italic" }}>
              {entry.comment}
            </div>
          )}
        </div>
        {/* Status badge */}
        {hasLog && (
          <div style={{ flexShrink: 0 }}>
            {entry?.status === "done" && (
              <span style={{ fontSize: 10, fontWeight: 700, color: C.g }}>✓ Fait</span>
            )}
            {entry?.status === "partial" && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#F59E0B" }}>~ Partiel</span>
            )}
            {!entry && (
              <span style={{ fontSize: 10, color: C.tx3 }}>—</span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Group
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const childCount = (step.children as any[])?.length ?? 0;
  return (
    <div style={{
      padding: "7px 10px", borderRadius: 4,
      background: entry?.status === "done" ? C.g + "10"
        : entry?.status === "partial" ? "#F59E0B10"
        : "rgba(59,141,240,0.06)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: C.b }}>× {step.repeat}</span>
        <span style={{ fontSize: 10, color: C.tx3 }}>{childCount} étape{childCount !== 1 ? "s" : ""}</span>
        {hasLog && (
          <div style={{ marginLeft: "auto", flexShrink: 0 }}>
            {entry?.status === "done"    && <span style={{ fontSize: 10, fontWeight: 700, color: C.g }}>✓ Fait</span>}
            {entry?.status === "partial" && <span style={{ fontSize: 10, fontWeight: 700, color: "#F59E0B" }}>~ Partiel</span>}
            {!entry                      && <span style={{ fontSize: 10, color: C.tx3 }}>—</span>}
          </div>
        )}
      </div>
      {entry?.status === "partial" && entry.comment && (
        <div style={{ fontSize: 10, color: "#F59E0B", marginTop: 4, fontStyle: "italic" }}>
          {entry.comment}
        </div>
      )}
    </div>
  );
}

function rpeColor(v: number) { return v <= 4 ? C.g : v <= 7 ? C.o : C.r; }
function rpeBg(v: number)    { return v <= 4 ? C.gS : v <= 7 ? C.oS : C.rS; }

// ── Main card ─────────────────────────────────────────────────────────────────

interface EnergyRetourCardProps {
  session: EnergySessionDetail;
}

export function EnergyRetourCard({ session }: EnergyRetourCardProps) {
  const [expanded, setExpanded] = useState(false);
  const kc = KIND_COLOR[session.session_kind ?? ""] ?? "#6B7280";

  // Support both step_log (old) and block_logs (new)
  const hasBlockLogs = session.block_logs && Object.keys(session.block_logs).length > 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasIntervals = ((session as any).intervals?.length ?? 0) > 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasStepLog   = (session as any).step_log !== null && (session as any).step_log !== undefined;

  const blVals     = session.block_logs ? Object.values(session.block_logs) : [];
  const doneCount  = blVals.filter((b) => b.done).length;
  const totalCount = blVals.length;

  const statusColor = session.partial ? "#33B5FF" : session.completed ? "#66F03C" : "#FF9500";
  const statusLabel = session.partial
    ? `✓ Partielle ${doneCount}/${totalCount}`
    : session.completed ? "✓ Complétée" : "Non faite";

  const blockEntries = session.block_logs
    ? Object.entries(session.block_logs).filter(([, b]) => (b as { note?: string }).note)
    : [];

  return (
    <div style={{ background: C.s1, border: "1px solid " + C.brd, borderRadius: 6, overflow: "hidden" }}>
      {/* Header (clickable) */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1, flexWrap: "wrap" }}>
          <div style={{ width: 28, height: 28, borderRadius: 4, background: kc + "20", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Zap size={12} color={kc} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {session.session_label}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4,
            background: statusColor + "25", color: statusColor,
          }}>
            {statusLabel}
          </span>
          {session.rpe_score != null && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
              background: rpeBg(session.rpe_score), color: rpeColor(session.rpe_score),
            }}>
              RPE {session.rpe_score}/10
            </span>
          )}
          {session.session_kind && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: kc + "20", color: kc, flexShrink: 0 }}>
              {KIND_LABELS[session.session_kind] ?? session.session_kind}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 8 }}>
          <span style={{ fontSize: 10, color: C.tx3 }}>
            {format(new Date(session.date + "T12:00:00"), "EEE d MMM", { locale: fr })}
          </span>
          {expanded ? <ChevronUp size={13} color={C.tx3} /> : <ChevronDown size={13} color={C.tx3} />}
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ borderTop: "1px solid " + C.brd, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Meta row */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {session.duration_min != null && (
              <div style={{ fontSize: 11, color: C.tx2 }}>
                Durée : <span style={{ fontWeight: 600, color: C.tx }}>{session.duration_min} min</span>
              </div>
            )}
            {session.distance_m != null && (
              <div style={{ fontSize: 11, color: C.tx2 }}>
                Distance : <span style={{ fontWeight: 600, color: C.tx }}>{(session.distance_m / 1000).toFixed(2)} km</span>
              </div>
            )}
          </div>

          {/* Block completion summary (new system) */}
          {hasBlockLogs && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(session.block_logs!).map(([id, b], i) => (
                <span key={id} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 6,
                  background: b.done ? C.g + "20" : C.s2,
                  color: b.done ? C.g : C.tx3,
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  {b.done && <Check size={9} />}
                  Bloc {i + 1}
                </span>
              ))}
            </div>
          )}

          {/* Block notes */}
          {blockEntries.length > 0 && (
            <div>
              {blockEntries.map(([id, b], i) => (
                <div key={id} style={{ fontSize: 11, color: C.tx2, marginBottom: 3 }}>
                  <span style={{ color: C.tx3 }}>Bloc {i + 1} : </span>{(b as { note?: string }).note}
                </div>
              ))}
            </div>
          )}

          {/* Note */}
          {session.note && (
            <div style={{ background: C.s2, borderRadius: 4, padding: "8px 10px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>Note</div>
              <div style={{ fontSize: 12, color: C.tx2 }}>{session.note}</div>
            </div>
          )}

          {/* Lien Strava / Garmin */}
          {session.activity_url && (
            <a
              href={session.activity_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 11, fontWeight: 600, color: "#FF5500",
                padding: "6px 10px", borderRadius: 4,
                background: "rgba(255,85,0,0.08)", border: "1px solid rgba(255,85,0,0.2)",
                textDecoration: "none", width: "fit-content",
              }}
            >
              {session.activity_url.includes("strava") ? "Strava" : session.activity_url.includes("garmin") ? "Garmin" : "Activité"} ↗
            </a>
          )}

          {/* Intervals: planned + step log (old system) */}
          {hasIntervals && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6, display: "flex", gap: 10 }}>
                <span>Déroulé</span>
                {hasStepLog && <span style={{ color: C.ac }}>avec réalisé</span>}
              </div>
              <div style={{ background: C.s2, borderRadius: 4, padding: "4px 2px", display: "flex", flexDirection: "column", gap: 2 }}>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {((session as any).intervals as any[]).map((step, i) => (
                  <StepLogRow
                    key={(step as { id?: string }).id ?? i}
                    step={step}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    log={(session as any).step_log ?? null}
                    index={i}
                  />
                ))}
              </div>
            </div>
          )}

          {!hasIntervals && !hasBlockLogs && !session.note && (
            <div style={{ fontSize: 12, color: C.tx3, textAlign: "center", padding: "8px 0" }}>Aucun détail disponible</div>
          )}
        </div>
      )}
    </div>
  );
}
