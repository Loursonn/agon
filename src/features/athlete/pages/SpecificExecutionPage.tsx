/**
 * SpecificExecutionPage — athlete view for specific (CrossFit/MetCon) sessions.
 *
 * Route: /athlete/specific/:assignmentId
 *
 * Supports two formats:
 * - "wod" (legacy): flat EnergyStep[] intervals with timer execution
 * - "classique": block-based (mix ClassiqueBlock + WodBlock) from classique_structure
 *
 * 3 states: preview → executing → completed
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  useEnergyAssignments,
  useCompleteEnergyAssignment,
  useUpsertEnergyRpe,
} from "@/features/shared/hooks/useEnergyAssignments";
import { useSpecificExecution } from "@/features/athlete/hooks/useSpecificExecution";
import { useAthleteReferences } from "@/features/shared/hooks/useAthleteReferences";
import StepTimeline from "@/features/athlete/components/specific/StepTimeline";
import ExecutionCard from "@/features/athlete/components/specific/ExecutionCard";
import SessionEndForm from "@/features/athlete/components/specific/SessionEndForm";
import { RunDistanceInput, initialRunDistance, runDistancePayload, type RunDistanceValue } from "@/features/shared/components/RunDistanceInput";
import type { EnergySessionAssignmentRow, EnergyStep, BlockLogs } from "@/types/energy";
import type { SessionBlock, ClassiqueBlock, WodBlock } from "@/types/specific";
import { isWodBlock } from "@/types/specific";
import { SchemaViewerWithZoom } from "@/features/coach/components/energy/SchemaViewer";
import { formatSLong } from "@/lib/energy/formatTarget";
import { FicheLinks } from "@/features/shared/components/fiches/FicheLinks";

// ── Colors ──────────────────────────────────────────────────────────────────
const C = {
  bg: "var(--bg, #0E0C0A)",
  card: "var(--card, #0E0C0A)",
  border: "var(--border, #2E2D33)",
  tx: "#F2F1F5",
  tx2: "#8B8A92",
  orange: "#F5A623",
  green: "#66F03C",
  purple: "#FFC933",
};

// ── Classique block preview ─────────────────────────────────────────────────
function ClassiqueBlockPreview({ block }: { block: ClassiqueBlock }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderLeft: `4px solid ${C.green}`,
      borderRadius: 6, padding: "12px 14px", marginBottom: 10,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: C.green,
        textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8,
      }}>
        {block.title || "Bloc classique"}
      </div>
      {block.instructions && (
        <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.4, whiteSpace: "pre-wrap", marginBottom: 8 }}>
          {block.instructions}
        </div>
      )}
      {block.items.map((item) => (
        <div key={item.id} style={{
          display: "flex", gap: 8, alignItems: "baseline",
          padding: "4px 0", borderBottom: `1px solid ${C.border}`,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.tx, flex: 1, minWidth: 0 }}>
            {item.name}
          </span>
          {item.prescription && (
            <span style={{ fontSize: 12, color: C.tx2, textAlign: "right", maxWidth: "55%", whiteSpace: "pre-wrap" }}>
              {item.prescription}
            </span>
          )}
        </div>
      ))}
      {block.items.length > 0 && block.items[block.items.length - 1].rest && (
        <div style={{ fontSize: 11, color: C.tx2, marginTop: 4 }}>
          Repos : {block.items[block.items.length - 1].rest}
        </div>
      )}
    </div>
  );
}

function WodBlockPreview({ block, vma }: { block: WodBlock; vma?: number | null }) {
  return (
    <div style={{
      border: `1px dashed ${C.orange}`,
      borderRadius: 6, padding: 10, marginBottom: 10,
      background: "rgba(245,166,35,0.03)",
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: C.orange,
        textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6,
        padding: "0 4px",
      }}>
        {block.title || "Bloc WOD"}
        <span style={{ fontWeight: 400, marginLeft: 8, fontSize: 10, color: C.tx2 }}>
          {block.steps.length} étape{block.steps.length > 1 ? "s" : ""}
        </span>
      </div>
      {block.instructions && (
        <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.4, whiteSpace: "pre-wrap", marginBottom: 6 }}>
          {block.instructions}
        </div>
      )}
      <div style={{ marginLeft: 6 }}>
        <StepTimeline steps={block.steps} vma={vma} />
      </div>
    </div>
  );
}

// ── Classique execution (checklist per block) ───────────────────────────────
function ClassiqueBlockExecution({
  block,
  blockLogs,
  onToggle,
}: {
  block: ClassiqueBlock;
  blockLogs: Record<string, boolean>;
  onToggle: (itemId: string) => void;
}) {
  const allDone = block.items.every((item) => blockLogs[item.id]);
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderLeft: `4px solid ${allDone ? C.green : C.tx2}`,
      borderRadius: 6, padding: "12px 14px", marginBottom: 10,
      opacity: allDone ? 0.7 : 1, transition: "opacity 200ms",
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: allDone ? C.green : C.tx2,
        textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8,
      }}>
        {block.title || "Bloc classique"}
        {allDone && " ✓"}
      </div>
      {block.instructions && (
        <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.4, whiteSpace: "pre-wrap", marginBottom: 8 }}>
          {block.instructions}
        </div>
      )}
      {block.items.map((item) => {
        const done = !!blockLogs[item.id];
        return (
          <button
            key={item.id}
            onClick={() => onToggle(item.id)}
            style={{
              display: "flex", gap: 8, alignItems: "center", width: "100%",
              padding: "8px 4px", borderBottom: `1px solid ${C.border}`,
              background: "none", border: "none", cursor: "pointer",
              fontFamily: "inherit", textAlign: "left",
              opacity: done ? 0.5 : 1,
            }}
          >
            <span style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
              border: `2px solid ${done ? C.green : C.tx2}`,
              background: done ? C.green + "20" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, color: C.green,
            }}>
              {done ? "✓" : ""}
            </span>
            <span style={{
              fontSize: 14, fontWeight: 600, color: C.tx, flex: 1, minWidth: 0,
              textDecoration: done ? "line-through" : "none",
            }}>
              {item.name}
            </span>
            {item.prescription && (
              <span style={{ fontSize: 12, color: C.tx2, textAlign: "right", maxWidth: "55%", whiteSpace: "pre-wrap" }}>
                {item.prescription}
              </span>
            )}
          </button>
        );
      })}
      {block.items.some((it) => it.notes) && (
        <div style={{ marginTop: 6 }}>
          {block.items.filter((it) => it.notes).map((it) => (
            <div key={it.id} style={{ fontSize: 11, color: C.tx2, padding: "2px 0", whiteSpace: "pre-wrap" }}>
              Note — {it.name} : {it.notes}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function SpecificExecutionPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: assignments = [] } = useEnergyAssignments(user?.id);
  const { data: refs } = useAthleteReferences(user?.id);
  const vma = refs?.VMA ?? null;
  const assignment = assignments.find((a: EnergySessionAssignmentRow) => a.id === assignmentId);
  const session = assignment?.energy_sessions;

  const completeMutation = useCompleteEnergyAssignment();
  // Km courus pendant la séance (runs HYROX…) → volume de course
  const [runDist, setRunDist] = useState<RunDistanceValue>(initialRunDistance());
  const rpeMutation = useUpsertEnergyRpe();

  // ── Format detection ────────────────────────────────────────────────────
  const isClassique = session?.format === "classique";
  const blocks: SessionBlock[] = useMemo(
    () => (isClassique ? session?.classique_structure?.blocks ?? [] : []),
    [isClassique, session?.classique_structure],
  );

  // For WOD format: use session.intervals directly
  // For classique format: extract all WodBlock steps for the timer
  const allIntervals: EnergyStep[] = useMemo(() => {
    if (!isClassique) return session?.intervals ?? [];
    const steps: EnergyStep[] = [];
    for (const b of blocks) {
      if (isWodBlock(b)) steps.push(...b.steps);
    }
    return steps;
  }, [isClassique, session?.intervals, blocks]);

  const hasWodSteps = allIntervals.length > 0;
  const exec = useSpecificExecution(allIntervals);

  // ── Classique checklist state ───────────────────────────────────────────
  const [itemChecks, setItemChecks] = useState<Record<string, boolean>>({});
  const [classiqueStartTime, setClassiqueStartTime] = useState<number | null>(null);
  const [classiquePhase, setClassiquePhase] = useState<"preview" | "executing" | "completed">("preview");

  const toggleItem = useCallback((itemId: string) => {
    setItemChecks((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }, []);

  const classiqueItems = useMemo(
    () => blocks.filter((b): b is ClassiqueBlock => !isWodBlock(b)).flatMap((b) => b.items),
    [blocks],
  );
  const allClassiqueChecked = classiqueItems.length > 0 && classiqueItems.every((it) => itemChecks[it.id]);

  // For pure classique (no WOD steps), manage phase locally
  const effectivePhase = isClassique && !hasWodSteps ? classiquePhase : exec.phase;
  const effectiveStart = isClassique && !hasWodSteps
    ? () => { setClassiquePhase("executing"); setClassiqueStartTime(Date.now()); }
    : exec.start;

  const elapsedTotal = isClassique && !hasWodSteps && classiqueStartTime
    ? Math.floor((Date.now() - classiqueStartTime) / 1000)
    : exec.elapsedTotal;

  // Wake lock
  useEffect(() => {
    if (effectivePhase !== "executing") return;
    let wakeLock: WakeLockSentinel | null = null;
    async function acquire() {
      try {
        wakeLock = await navigator.wakeLock.request("screen");
      } catch { /* Wake Lock not supported */ }
    }
    acquire();
    return () => { wakeLock?.release(); };
  }, [effectivePhase]);

  if (!assignment || !session) {
    return (
      <div style={{ padding: 32, color: C.tx2, fontSize: 13, textAlign: "center" }}>
        {!assignmentId ? "ID manquant" : "Chargement…"}
      </div>
    );
  }

  // ── Meta counts ─────────────────────────────────────────────────────────
  const totalSteps = isClassique
    ? blocks.reduce((n, b) => n + (isWodBlock(b) ? b.steps.length : b.items.length), 0)
    : exec.flatSteps.length;
  const sessionName = session.name;

  // ── End submit ──────────────────────────────────────────────────────────
  async function handleEndSubmit(data: { rpe: number; respected: boolean; comment: string }) {
    if (!assignment || !user) return;
    const dur = elapsedTotal > 0 ? Math.round(elapsedTotal / 60) : undefined;
    const notes = [
      data.respected ? "Séance respectée" : "Séance adaptée",
      data.comment,
    ].filter(Boolean).join(" — ");

    // Build block_logs from checklist
    const blockLogsOut: BlockLogs = {};
    if (isClassique) {
      for (const b of blocks) {
        if (!isWodBlock(b)) {
          const allDone = b.items.every((it) => itemChecks[it.id]);
          blockLogsOut[b.id] = { done: allDone };
        } else {
          blockLogsOut[b.id] = { done: true };
        }
      }
    }

    try {
      await completeMutation.mutateAsync({
        id: assignment.id,
        athleteId: user.id,
        block_logs: blockLogsOut,
        notes,
        actual_duration_min: dur ?? null,
        ...runDistancePayload(runDist),
      });
      await rpeMutation.mutateAsync({
        id: assignment.id,
        athleteId: user.id,
        rpe_score: data.rpe,
      });
      navigate("/athlete");
    } catch { /* Error handled by mutation toast */ }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: C.bg, color: C.tx,
      padding: "20px 16px 110px",
    }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          style={{
            color: C.tx2, fontSize: 13, marginBottom: 10,
            background: "none", border: "none", cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ← Retour
        </button>

        {/* Title */}
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>{sessionName}</h1>

        {/* Meta pills */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 99,
            background: "rgba(245,166,35,0.12)", color: C.orange,
            border: "1px solid rgba(245,166,35,0.3)",
          }}>
            Spécifique
          </span>
          {isClassique && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 99,
              background: "rgba(34,201,147,0.12)", color: C.green,
              border: "1px solid rgba(34,201,147,0.3)",
            }}>
              {blocks.length} bloc{blocks.length > 1 ? "s" : ""}
            </span>
          )}
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 99,
            background: "rgba(139,138,146,0.12)", color: C.tx2,
            border: `1px solid ${C.border}`,
          }}>
            {totalSteps} élément{totalSteps > 1 ? "s" : ""}
          </span>
          {session.total_duration_s != null && session.total_duration_s > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 99,
              background: "rgba(139,138,146,0.12)", color: C.tx2,
              border: `1px solid ${C.border}`,
            }}>
              ~{formatSLong(session.total_duration_s)}
            </span>
          )}
        </div>

        {/* Coach notes */}
        {session.notes && (
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${C.orange}`,
            borderRadius: 6, padding: "12px 14px", fontSize: 13,
            marginBottom: 16, whiteSpace: "pre-wrap",
          }}>
            <strong style={{ display: "block", fontSize: 11, color: C.orange, textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 }}>
              Note coach
            </strong>
            {session.notes}
          </div>
        )}

        {/* Fiches */}
        {session.fiches?.length ? (
          <div style={{ marginBottom: 16 }}>
            <FicheLinks title="Fiches" attachments={session.fiches} athleteId={user?.id} compact />
          </div>
        ) : null}

        {/* Schema */}
        {session.schema && (
          <div style={{ marginBottom: 16, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.border}` }}>
            <SchemaViewerWithZoom schema={session.schema} />
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── PREVIEW ── */}
        {effectivePhase === "preview" && (
          <>
            {isClassique ? (
              blocks.map((b) =>
                isWodBlock(b)
                  ? <WodBlockPreview key={b.id} block={b} vma={vma} />
                  : <ClassiqueBlockPreview key={b.id} block={b} />,
              )
            ) : (
              <StepTimeline steps={allIntervals} vma={vma} />
            )}

            {/* Sticky start button */}
            <div style={{
              position: "fixed", bottom: 0, left: 0, right: 0,
              background: `linear-gradient(transparent, ${C.bg} 30%)`,
              padding: "22px 16px 18px",
            }}>
              <div style={{ maxWidth: 480, margin: "0 auto" }}>
                <button
                  onClick={effectiveStart}
                  style={{
                    width: "100%", background: C.orange, color: "#1a1204",
                    border: "none", borderRadius: 6, padding: 15,
                    fontSize: 16, fontWeight: 700, cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Démarrer la séance
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── EXECUTING ── */}
        {effectivePhase === "executing" && (
          <div style={{ marginTop: 12 }}>
            {/* Elapsed */}
            <div style={{ textAlign: "center", fontSize: 12, color: C.tx2, marginBottom: 12 }}>
              Temps écoulé : <strong style={{ color: C.tx }}>{formatSLong(elapsedTotal)}</strong>
            </div>

            {isClassique ? (
              <>
                {/* Render all blocks as checklists / WOD execution */}
                {blocks.map((b) =>
                  isWodBlock(b) ? (
                    <WodBlockPreview key={b.id} block={b} />
                  ) : (
                    <ClassiqueBlockExecution
                      key={b.id}
                      block={b}
                      blockLogs={itemChecks}
                      onToggle={toggleItem}
                    />
                  ),
                )}

                {/* WOD timer execution (if any WOD blocks exist) */}
                {hasWodSteps && exec.phase === "preview" && (
                  <button
                    onClick={exec.start}
                    style={{
                      width: "100%", background: C.orange, color: "#1a1204",
                      border: "none", borderRadius: 6, padding: 12,
                      fontSize: 14, fontWeight: 700, cursor: "pointer",
                      fontFamily: "inherit", marginTop: 12,
                    }}
                  >
                    ▶ Lancer les chronos WOD
                  </button>
                )}
                {hasWodSteps && exec.phase === "executing" && exec.currentFlatStep && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ textAlign: "center", fontSize: 11, color: C.tx2, marginBottom: 8 }}>
                      WOD — Étape {exec.currentIndex + 1}/{exec.flatSteps.length}
                    </div>
                    <ExecutionCard
                      current={exec.currentFlatStep}
                      next={exec.nextFlatStep}
                      secondsLeft={exec.secondsLeft}
                      isLastStep={exec.isLastStep}
                      onNext={exec.next}
                      onSkip={exec.skip}
                      vma={vma}
                    />
                  </div>
                )}

                {/* Finish button */}
                <button
                  onClick={() => {
                    if (isClassique && !hasWodSteps) setClassiquePhase("completed");
                    else if (exec.phase !== "executing") setClassiquePhase("completed");
                  }}
                  disabled={hasWodSteps && exec.phase === "executing"}
                  style={{
                    width: "100%", marginTop: 16,
                    background: (hasWodSteps && exec.phase === "executing") ? C.tx2 + "30" : C.green,
                    color: (hasWodSteps && exec.phase === "executing") ? C.tx2 : "#0a2618",
                    border: "none", borderRadius: 6, padding: 14,
                    fontSize: 15, fontWeight: 700, cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Terminer la séance
                </button>
              </>
            ) : (
              /* Legacy WOD format */
              exec.currentFlatStep && (
                <>
                  <div style={{ textAlign: "center", fontSize: 12, color: C.tx2, marginBottom: 12 }}>
                    Étape {exec.currentIndex + 1}/{exec.flatSteps.length}
                  </div>
                  <ExecutionCard
                    current={exec.currentFlatStep}
                    next={exec.nextFlatStep}
                    secondsLeft={exec.secondsLeft}
                    isLastStep={exec.isLastStep}
                    onNext={exec.next}
                    onSkip={exec.skip}
                    vma={vma}
                  />
                </>
              )
            )}
          </div>
        )}

        {/* ── COMPLETED ── */}
        {effectivePhase === "completed" && (
          <div style={{ marginTop: 12 }}>
            <h2 style={{
              fontSize: 13, color: C.tx2, textTransform: "uppercase" as const,
              letterSpacing: "0.05em", marginBottom: 12,
            }}>
              Fin de séance — retour athlète
            </h2>
            <div style={{ marginBottom: 14 }}>
              <RunDistanceInput value={runDist} onChange={setRunDist} />
            </div>
            <SessionEndForm
              onSubmit={handleEndSubmit}
              isPending={completeMutation.isPending || rpeMutation.isPending}
            />
          </div>
        )}
      </div>
    </div>
  );
}
