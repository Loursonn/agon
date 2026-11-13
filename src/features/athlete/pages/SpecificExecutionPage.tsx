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
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  useEnergyAssignments,
  useCompleteEnergyAssignment,
} from "@/features/shared/hooks/useEnergyAssignments";
import { useSpecificExecution } from "@/features/athlete/hooks/useSpecificExecution";
import { useAthleteReferences } from "@/features/shared/hooks/useAthleteReferences";
import StepTimeline from "@/features/athlete/components/specific/StepTimeline";
import ExecutionCard from "@/features/athlete/components/specific/ExecutionCard";
import SessionEndForm from "@/features/athlete/components/specific/SessionEndForm";
import { RunDistanceInput } from "@/features/shared/components/RunDistanceInput";
import { initialRunDistance, runDistancePayload, type RunDistanceValue } from "@/features/shared/components/runDistance";
import type { EnergySessionAssignmentRow, EnergyStep, BlockLogs } from "@/types/energy";
import type { SessionBlock, ClassiqueBlock, WodBlock } from "@/types/specific";
import { isWodBlock } from "@/types/specific";
import { SchemaViewerWithZoom } from "@/features/coach/components/energy/SchemaViewer";
import { formatSLong } from "@/lib/energy/formatTarget";
import { cn } from "@/lib/utils";
import { fmtClock } from "@/lib/specificTimer";
import { TYPE_COLOR } from "@/lib/peps";
import { ClassiqueBlockPreview } from "@/features/athlete/components/specific/ClassiqueBlockPreview";
import { WodBlockPreview } from "@/features/athlete/components/specific/WodBlockPreview";
import { ClassiqueBlockExecution, WodBlockExecution } from "@/features/athlete/components/specific/ClassiqueBlockExecution";
import { FicheLinks } from "@/features/shared/components/fiches/FicheLinks";


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

  // ── Format detection ────────────────────────────────────────────────────
  const isClassique = session?.format === "classique";
  const blocks: SessionBlock[] = useMemo(
    () => (isClassique ? session?.classique_structure?.blocks ?? [] : []),
    [isClassique, session?.classique_structure],
  );

  // Format WOD : le minuteur parcourt session.intervals.
  // Format classique : le minuteur parcourt le bloc WOD lancé (« Minuteur »).
  const [wodBlockId, setWodBlockId] = useState<string | null>(null);
  const [wodDone, setWodDone] = useState<Set<string>>(() => new Set());
  const allIntervals: EnergyStep[] = useMemo(() => {
    if (!isClassique) return session?.intervals ?? [];
    const b = blocks.find((x) => x.id === wodBlockId);
    return b && isWodBlock(b) ? b.steps : [];
  }, [isClassique, session?.intervals, blocks, wodBlockId]);

  const exec = useSpecificExecution(allIntervals);
  // Le minuteur démarre une fois les pas du bloc choisi en place.
  const pendingStart = useRef(false);
  const execStart = exec.start;
  useEffect(() => {
    if (!pendingStart.current || allIntervals.length === 0) return;
    pendingStart.current = false;
    execStart();
  }, [allIntervals, execStart]);
  const launchWod = (blockId: string) => {
    if (blockId === wodBlockId) { execStart(); return; }
    pendingStart.current = true;
    setWodBlockId(blockId);
  };
  // Bloc WOD fini (ou « Terminer ») : retour à la liste des blocs.
  const execPhase = exec.phase;
  useEffect(() => {
    if (!isClassique || execPhase !== "completed" || !wodBlockId) return;
    setWodDone((cur) => new Set(cur).add(wodBlockId));
  }, [isClassique, execPhase, wodBlockId]);

  // ── Classique checklist state ───────────────────────────────────────────
  const [itemChecks, setItemChecks] = useState<Record<string, boolean>>({});
  const [classiqueStartTime, setClassiqueStartTime] = useState<number | null>(null);
  const [classiquePhase, setClassiquePhase] = useState<"preview" | "executing" | "completed">("preview");

  const blockDoneToast = useCallback((itemIds: string[], next: Record<string, boolean>, prev: Record<string, boolean>) => {
    const idx = blocks.findIndex((b) => !isWodBlock(b) && b.items.some((it) => itemIds.includes(it.id)));
    const b = blocks[idx];
    if (!b || isWodBlock(b) || b.items.length === 0) return;
    const was = b.items.every((it) => prev[it.id]);
    const now = b.items.every((it) => next[it.id]);
    if (!was && now) toast.success(`Bloc ${idx + 1} terminé`);
  }, [blocks]);

  const toggleItem = useCallback((itemId: string) => {
    setItemChecks((prev) => {
      const next = { ...prev, [itemId]: !prev[itemId] };
      blockDoneToast([itemId], next, prev);
      return next;
    });
  }, [blockDoneToast]);

  const toggleAll = useCallback((itemIds: string[], done: boolean) => {
    setItemChecks((prev) => {
      const next = { ...prev };
      for (const id of itemIds) next[id] = done;
      blockDoneToast(itemIds, next, prev);
      return next;
    });
  }, [blockDoneToast]);

  const classiqueItems = useMemo(
    () => blocks.filter((b): b is ClassiqueBlock => !isWodBlock(b)).flatMap((b) => b.items),
    [blocks],
  );
  const allClassiqueChecked = classiqueItems.length > 0 && classiqueItems.every((it) => itemChecks[it.id]);

  // For pure classique (no WOD steps), manage phase locally
  const effectivePhase = isClassique ? classiquePhase : exec.phase;
  const effectiveStart = isClassique
    ? () => { setClassiquePhase("executing"); setClassiqueStartTime(Date.now()); }
    : exec.start;

  // Format classique : l'horloge avance d'elle-même (pas de minuteur actif).
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isClassique || classiquePhase !== "executing") return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [isClassique, classiquePhase]);
  const elapsedTotal = isClassique && classiqueStartTime
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
      <div className="p-8 text-center font-ui text-agon-sm text-agon-tx2">
        {!assignmentId ? "ID manquant" : "Chargement…"}
      </div>
    );
  }

  // ── Meta counts ─────────────────────────────────────────────────────────
  const totalSteps = isClassique
    ? blocks.reduce((n, b) => n + (isWodBlock(b) ? b.steps.length : b.items.length), 0)
    : exec.flatSteps.length;
  const sessionName = session.name;

  const doneBlocks = blocks.filter((b) => (isWodBlock(b) ? wodDone.has(b.id) : b.items.length > 0 && b.items.every((it) => itemChecks[it.id]))).length;
  const classiqueProgress = `Bloc ${Math.min(doneBlocks + 1, blocks.length)} / ${blocks.length}`;

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
        // RPE dans la même écriture : une seule saisie à garder hors ligne.
        rpe_score: data.rpe,
      });
      // Envoyée ou gardée sur le téléphone : la séance est enregistrée.
      navigate("/athlete");
    } catch { /* Error handled by mutation toast */ }
  }


  const PILL = "rounded-full border px-agon-md py-agon-xs text-agon-xs font-semibold";
  const NEUTRAL_PILL = cn(PILL, "border-agon-brd bg-agon-tx2/10 text-agon-tx2");

  // Téléphone : une colonne de 480 px. PC : colonne large, blocs sur deux colonnes.
  return (
    <div className="min-h-screen bg-agon-bg px-agon-lg pb-6 pt-5 font-ui text-agon-tx lg:px-agon-2xl lg:pt-agon-xl">
      <div className="mx-auto w-full max-w-[480px] lg:max-w-5xl">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-agon-sm min-h-10 text-agon-base text-agon-tx2"
        >
          ← Retour
        </button>

        <h1 className="mb-agon-sm font-display text-agon-2xl font-bold">{sessionName}</h1>

        <div className="mb-agon-lg flex flex-wrap gap-agon-sm">
          <span className={cn(PILL, "border-agon-alerte/30 bg-agon-alerte/10 text-agon-alerte")}>Spécifique</span>
          {isClassique && (
            <span className={cn(PILL, "border-agon-succes/30 bg-agon-succes/10 text-agon-succes")}>
              {blocks.length} bloc{blocks.length > 1 ? "s" : ""}
            </span>
          )}
          <span className={NEUTRAL_PILL}>{totalSteps} élément{totalSteps > 1 ? "s" : ""}</span>
          {session.total_duration_s != null && session.total_duration_s > 0 && (
            <span className={NEUTRAL_PILL}>~{formatSLong(session.total_duration_s)}</span>
          )}
        </div>

        {/* Note du coach, fiches, schéma : en tête, pleine largeur */}
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-agon-lg">
          {session.notes && (
            <div className="mb-agon-lg whitespace-pre-wrap rounded-md border border-l-[3px] border-agon-brd border-l-agon-alerte bg-agon-bg px-agon-md py-agon-md text-agon-base">
              <strong className="mb-agon-xs block text-agon-xs uppercase tracking-wide text-agon-alerte">Note coach</strong>
              {session.notes}
            </div>
          )}

          {session.fiches?.length ? (
            <div className="mb-agon-lg">
              <FicheLinks title="Fiches" attachments={session.fiches} athleteId={user?.id} compact />
            </div>
          ) : null}

          {session.schema && (
            <div className="mb-agon-lg overflow-hidden rounded-md border border-agon-brd lg:col-span-2">
              <SchemaViewerWithZoom schema={session.schema} />
            </div>
          )}
        </div>

        {/* ── APERÇU ── */}
        {effectivePhase === "preview" && (
          <>
            {isClassique ? (
              <div className="lg:columns-2 lg:gap-agon-lg">
                {blocks.map((b) =>
                  isWodBlock(b)
                    ? <WodBlockPreview key={b.id} block={b} vma={vma} />
                    : <ClassiqueBlockPreview key={b.id} block={b} />,
                )}
              </div>
            ) : (
              <div className="lg:mx-auto lg:max-w-2xl">
                <StepTimeline steps={allIntervals} vma={vma} />
              </div>
            )}

            {/* Bouton de départ : collé au bas de l'écran, au-dessus de la barre d'onglets sur téléphone */}
            <div className="sticky bottom-16 z-10 -mx-agon-lg mt-agon-lg bg-gradient-to-t from-agon-bg from-70% to-transparent px-agon-lg pb-agon-md pt-6 lg:bottom-0 lg:mx-0 lg:px-0">
              <button
                type="button"
                onClick={effectiveStart}
                className="min-h-12 w-full rounded-md bg-agon-alerte p-[15px] text-agon-lg font-bold text-agon-ink lg:mx-auto lg:block lg:max-w-md"
              >
                Démarrer la séance
              </button>
            </div>
          </>
        )}

        {/* ── EN COURS ── */}
        {effectivePhase === "executing" && isClassique && (
          <div className="mt-agon-md">
            <div className="mb-agon-md flex items-center justify-between font-mono text-agon-xs uppercase tracking-[0.14em]" style={{ color: TYPE_COLOR.hyrox }}>
              <span>{classiqueProgress}</span>
              <span className="text-agon-sm normal-case tracking-normal text-agon-tx2">{fmtClock(elapsedTotal)}</span>
            </div>
            <div className="lg:columns-2 lg:gap-agon-lg">
              {blocks.map((b, i) =>
                isWodBlock(b) ? (
                  <WodBlockExecution key={b.id} block={b} number={i + 1} done={wodDone.has(b.id)} onTimer={() => launchWod(b.id)} />
                ) : (
                  <ClassiqueBlockExecution key={b.id} block={b} number={i + 1} blockLogs={itemChecks} onToggle={toggleItem} onToggleAll={toggleAll} />
                ),
              )}
            </div>
            <div className="mt-agon-xs text-center text-agon-xs text-agon-tx3">Coche tout le bloc d’un coup, ou élément par élément</div>
            <div className="lg:mx-auto lg:max-w-md">
              <button
                type="button"
                onClick={() => setClassiquePhase("completed")}
                className="mt-agon-lg min-h-12 w-full rounded-md bg-agon-accent p-[14px] text-agon-base font-bold text-agon-ink"
              >
                Terminer la séance
              </button>
            </div>
          </div>
        )}

        {/* Minuteur plein écran : format WOD, ou bloc WOD lancé depuis le format classique */}
        {exec.phase === "executing" && (effectivePhase === "executing" || isClassique) && (
          <ExecutionCard
            flat={exec.flatSteps}
            index={exec.currentIndex}
            secondsLeft={exec.secondsLeft}
            minuteLeft={exec.minuteLeft}
            elapsed={isClassique ? elapsedTotal : exec.elapsedTotal}
            onSkip={exec.skip}
            onFinish={exec.stop}
            vma={vma}
          />
        )}

        {/* ── TERMINÉE ── */}
        {effectivePhase === "completed" && (
          <div className="mt-agon-md lg:mx-auto lg:max-w-md">
            <h2 className="mb-agon-md text-agon-base uppercase tracking-wide text-agon-tx2">Fin de séance — retour athlète</h2>
            <div className="mb-agon-md">
              <RunDistanceInput value={runDist} onChange={setRunDist} />
            </div>
            <SessionEndForm onSubmit={handleEndSubmit} isPending={completeMutation.isPending} />
          </div>
        )}
      </div>
    </div>
  );
}
