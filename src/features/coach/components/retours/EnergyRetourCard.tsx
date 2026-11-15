import { useState } from "react";
import { SessionPainChip, SessionPainDetail } from "@/features/shared/components/SessionPain";
import { WatchRunTag } from "@/features/shared/components/WatchRunTag";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Zap, Check, ChevronDown, ChevronUp } from "lucide-react";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { ROLE_COLOR, ROLE_LABEL_FR } from "@/features/coach/components/energy/energyLabels";
import { formatS, formatTarget } from "@/lib/energy/formatTarget";
import type { EnergySessionDetail, EnergyStepLog } from "@/features/shared/types/retours.types";

// ── Kind labels / colors ──────────────────────────────────────────────────────

/** Type de séance : couleur de l'icône (SVG) et pastille teintée 12,5 %. */
const KIND_COLOR: Record<string, string> = {
  vo2: C.ac, tempo: C.b, seuil: C.o,
  footing: C.g, fartlek: C.r, autre: C.pierre, custom: C.pierre,
};
const KIND_TINT: Record<string, string> = {
  vo2: "bg-agon-accent/[0.125] text-agon-accent", tempo: "bg-agon-info/[0.125] text-agon-info",
  seuil: "bg-agon-alerte/[0.125] text-agon-alerte", footing: "bg-agon-succes/[0.125] text-agon-succes",
  fartlek: "bg-agon-erreur/[0.125] text-agon-erreur",
};
const KIND_TINT_OTHER = "bg-agon-pierre/[0.125] text-agon-pierre";
const STEP_DONE = "text-[10px] font-bold text-agon-succes";
const STEP_PARTIAL = "text-[10px] font-bold text-agon-alerte";
const SECTION_LABEL = "text-[9px] font-bold uppercase tracking-[0.4px] text-agon-tx3";
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
  const cfg: Record<string, { label: string; tone: string }> = {
    completed: { label: "Complétée",   tone: "bg-agon-succes/15 text-agon-succes" },
    missed:    { label: "Manquée",     tone: "bg-agon-erreur/15 text-agon-erreur" },
    skipped:   { label: "Passée",      tone: "bg-agon-pierre/20 text-agon-pierre" },
    planned:   { label: "Planifiée",   tone: "bg-agon-info/15 text-agon-info" },
    in_progress: { label: "En cours",  tone: "bg-agon-alerte/15 text-agon-alerte" },
  };
  const s = cfg[status] ?? cfg["planned"];
  return (
    <span className={cn("rounded-[4px] px-[7px] py-0.5 text-[10px] font-semibold", s.tone)}>
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
    const rc  = ROLE_COLOR[step.role as string] ?? C.pierre;
    const dur = step.duration?.kind === "time"
      ? formatS(step.duration.value ?? 0)
      : step.duration?.kind === "distance"
      ? `${step.duration.value ?? 0} m`
      : step.duration?.kind === "calories"
      ? `${step.duration.value ?? 0} kcal`
      : "Lap";
    const tgt = step.target ? formatTarget(step.target) : null;

    return (
      <div className={cn(
        "flex items-start gap-2.5 rounded-[4px] px-2.5 py-2",
        entry?.status === "done" ? "bg-agon-succes/[0.063]" : entry?.status === "partial" ? "bg-agon-alerte/[0.063]" : "bg-transparent",
      )}>
        {/* Role bar */}
        <div className="mt-0.5 h-8 w-[3px] flex-none rounded-[2px]" style={{ background: rc }} />
        {/* Step info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold" style={{ color: rc }}>{ROLE_LABEL_FR[step.role as string] ?? step.role}</span>
            <span className="text-[12px] font-bold text-agon-tx">{dur}</span>
            {tgt && tgt !== "Libre" && (
              <span className="truncate text-[10px] text-agon-tx3">{tgt}</span>
            )}
          </div>
          {entry?.status === "partial" && entry.comment && (
            <div className="mt-0.5 text-[10px] italic text-agon-alerte">
              {entry.comment}
            </div>
          )}
        </div>
        {/* Status badge */}
        {hasLog && (
          <div className="flex-none">
            {entry?.status === "done" && (
              <span className={STEP_DONE}>✓ Fait</span>
            )}
            {entry?.status === "partial" && (
              <span className={STEP_PARTIAL}>~ Partiel</span>
            )}
            {!entry && (
              <span className="text-[10px] text-agon-tx3">—</span>
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
    <div className={cn(
      "rounded-[4px] px-2.5 py-[7px]",
      entry?.status === "done" ? "bg-agon-succes/[0.063]" : entry?.status === "partial" ? "bg-agon-alerte/[0.063]" : "bg-agon-info/[0.06]",
    )}>
      <div className="flex items-center gap-2.5">
        <span className="text-[11px] font-extrabold text-agon-info">× {step.repeat}</span>
        <span className="text-[10px] text-agon-tx3">{childCount} étape{childCount !== 1 ? "s" : ""}</span>
        {hasLog && (
          <div className="ml-auto flex-none">
            {entry?.status === "done"    && <span className={STEP_DONE}>✓ Fait</span>}
            {entry?.status === "partial" && <span className={STEP_PARTIAL}>~ Partiel</span>}
            {!entry                      && <span className="text-[10px] text-agon-tx3">—</span>}
          </div>
        )}
      </div>
      {entry?.status === "partial" && entry.comment && (
        <div className="mt-1 text-[10px] italic text-agon-alerte">
          {entry.comment}
        </div>
      )}
    </div>
  );
}

/** RPE : vert jusqu'à 4, orange jusqu'à 7, rouge au-delà (aplat doux). */
function rpeTone(v: number) {
  return v <= 4 ? "bg-agon-succes-doux text-agon-succes" : v <= 7 ? "bg-agon-alerte-doux text-agon-alerte" : "bg-agon-erreur-doux text-agon-erreur";
}

// ── Main card ─────────────────────────────────────────────────────────────────

interface EnergyRetourCardProps {
  session: EnergySessionDetail;
}

export function EnergyRetourCard({ session }: EnergyRetourCardProps) {
  const [expanded, setExpanded] = useState(false);
  const kc = KIND_COLOR[session.session_kind ?? ""] ?? C.pierre;
  const kindTint = KIND_TINT[session.session_kind ?? ""] ?? KIND_TINT_OTHER;

  // Support both step_log (old) and block_logs (new)
  const hasBlockLogs = session.block_logs && Object.keys(session.block_logs).length > 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasIntervals = ((session as any).intervals?.length ?? 0) > 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasStepLog   = (session as any).step_log !== null && (session as any).step_log !== undefined;

  const blVals     = session.block_logs ? Object.values(session.block_logs) : [];
  const doneCount  = blVals.filter((b) => b.done).length;
  const totalCount = blVals.length;

  const statusTone = session.partial
    ? "bg-agon-info/[0.145] text-agon-info"
    : session.completed ? "bg-agon-succes/[0.145] text-agon-succes" : "bg-agon-alerte/[0.145] text-agon-alerte";
  const statusLabel = session.partial
    ? `✓ Partielle ${doneCount}/${totalCount}`
    : session.completed ? "✓ Complétée" : "Non faite";

  const blockEntries = session.block_logs
    ? Object.entries(session.block_logs).filter(([, b]) => (b as { note?: string }).note)
    : [];

  return (
    <div className="overflow-hidden rounded-[6px] border border-agon-brd bg-agon-s1">
      {/* Header (clickable) */}
      <div
        onClick={() => setExpanded(v => !v)}
        className="flex cursor-pointer items-center justify-between px-3.5 py-2.5"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className={cn("flex size-7 flex-none items-center justify-center rounded-[4px]", kindTint)}>
            <Zap size={12} color={kc} />
          </div>
          <span className="truncate text-[13px] font-bold text-agon-tx">
            {session.session_label}
          </span>
          <span className={cn("rounded-[4px] px-[7px] py-0.5 text-[10px] font-semibold", statusTone)}>
            {statusLabel}
          </span>
          <WatchRunTag match={session.watch_run} />
          {session.rpe_score != null && (
            <span className={cn("rounded-[4px] px-[7px] py-0.5 text-[10px] font-bold", rpeTone(session.rpe_score))}>
              RPE {session.rpe_score}/10
            </span>
          )}
          <SessionPainChip levels={session.pain_levels} />
          {session.session_kind && (
            <span className={cn("flex-none rounded-[4px] px-[5px] py-px text-[9px] font-bold", kindTint)}>
              {KIND_LABELS[session.session_kind] ?? session.session_kind}
            </span>
          )}
        </div>
        <div className="ml-2 flex flex-none items-center gap-2">
          <span className="text-[10px] text-agon-tx3">
            {format(new Date(session.date + "T12:00:00"), "EEE d MMM", { locale: fr })}
          </span>
          {expanded ? <ChevronUp size={13} color={C.tx3} /> : <ChevronDown size={13} color={C.tx3} />}
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="flex flex-col gap-2.5 border-t border-agon-brd px-3.5 py-3">
          <SessionPainDetail levels={session.pain_levels} note={session.pain_note} />
          {/* Meta row */}
          <div className="flex flex-wrap gap-3">
            {session.duration_min != null && (
              <div className="text-[11px] text-agon-tx2">
                Durée : <span className="font-semibold text-agon-tx">{session.duration_min} min</span>
              </div>
            )}
            {session.distance_m != null && (
              <div className="text-[11px] text-agon-tx2">
                Distance : <span className="font-semibold text-agon-tx">{(session.distance_m / 1000).toFixed(2)} km</span>
              </div>
            )}
          </div>

          {/* Block completion summary (new system) */}
          {hasBlockLogs && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(session.block_logs!).map(([id, b], i) => (
                <span key={id} className={cn(
                  "flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[10px]",
                  b.done ? "bg-agon-succes/[0.125] text-agon-succes" : "bg-agon-s2 text-agon-tx3",
                )}>
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
                <div key={id} className="mb-[3px] text-[11px] text-agon-tx2">
                  <span className="text-agon-tx3">Bloc {i + 1} : </span>{(b as { note?: string }).note}
                </div>
              ))}
            </div>
          )}

          {/* Note */}
          {session.note && (
            <div className="rounded-[4px] bg-agon-s2 px-2.5 py-2">
              <div className={cn(SECTION_LABEL, "mb-[3px]")}>Note</div>
              <div className="text-[12px] text-agon-tx2">{session.note}</div>
            </div>
          )}

          {/* Lien Strava / Garmin */}
          {session.activity_url && (
            <a
              href={session.activity_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1.5 rounded-[4px] border border-agon-alerte/20 bg-agon-alerte/[0.08] px-2.5 py-1.5 text-[11px] font-semibold text-agon-alerte no-underline"
            >
              {session.activity_url.includes("strava") ? "Strava" : session.activity_url.includes("garmin") ? "Garmin" : "Activité"} ↗
            </a>
          )}

          {/* Intervals: planned + step log (old system) */}
          {hasIntervals && (
            <div>
              <div className={cn(SECTION_LABEL, "mb-1.5 flex gap-2.5")}>
                <span>Déroulé</span>
                {hasStepLog && <span className="text-agon-accent">avec réalisé</span>}
              </div>
              <div className="flex flex-col gap-0.5 rounded-[4px] bg-agon-s2 px-0.5 py-1">
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
            <div className="py-2 text-center text-[12px] text-agon-tx3">Aucun détail disponible</div>
          )}
        </div>
      )}
    </div>
  );
}
