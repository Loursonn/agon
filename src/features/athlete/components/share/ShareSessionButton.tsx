import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AllSets } from "@/features/athlete/components/workout-detail/workoutDetailTypes";
import { buildExSets } from "@/features/athlete/components/workout-detail/workoutDetailUtils";
import { MuscuShareSheet } from "@/features/athlete/components/workout-detail/MuscuShareSheet";
import { EnergyShareSheet, type EnergyShareDone } from "@/features/athlete/components/energy/EnergyShareSheet";
import { SHARE_Z, ShareIconButton } from "@/features/shared/components/share/SessionShareSheet";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useWorkoutSession } from "@/features/shared/hooks/useWorkoutSession";
import { usePRLogs, usePRsByRef, useRecordLinks } from "@/features/shared/hooks/usePRLogs";
import { useEnergySession } from "@/features/shared/hooks/useEnergySessions";
import { useEnergyAssignment } from "@/features/shared/hooks/useEnergyAssignment";
import { useAthleteReferences } from "@/features/shared/hooks/useAthleteReferences";
import { usePlannedVsDone } from "@/features/shared/hooks/usePlannedVsDone";
import type { AthleteModifications } from "@/features/shared/types/athlete";
import { addedExercisesOf, withAddedBloc } from "@/lib/addedExercises";
import { resolveRecordRef } from "@/api/records";
import { C } from "@/lib/theme";
import type { IsoDay } from "@shared/domain/dates";

/** Séance à partager : séance de musculation (workout_logs.id) ou d'énergie / spécifique (assignation). */
export type ShareTarget = { kind: "workout"; id: string } | { kind: "energy"; id: string };

/**
 * Icône « Partager ma séance » posable sur n'importe quelle carte de séance
 * (accueil, aperçu du jour, programme) : charge seule la séance, prévue ou
 * faite, et ouvre la story. Le clic ne déclenche pas la carte en dessous.
 */
export function ShareSessionButton({ target, size = 32, onOpen }: {
  target: ShareTarget;
  size?: number;
  /**
   * Dans un tiroir (Drawer) : le tiroir bloque tout clic hors de lui. Le parent
   * ferme alors le tiroir et ouvre lui-même `ShareSessionLauncher`.
   */
  onOpen?: (t: ShareTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", flex: "none" }}>
      <ShareIconButton onClick={() => (onOpen ? onOpen(target) : setOpen(true))} size={size} />
      {open && <ShareSessionLauncher target={target} onClose={() => setOpen(false)} />}
    </span>
  );
}

export function ShareSessionLauncher({ target, onClose }: { target: ShareTarget; onClose: () => void }) {
  return target.kind === "workout"
    ? <WorkoutShareLoader id={target.id} onClose={onClose} />
    : <EnergyShareLoader id={target.id} onClose={onClose} />;
}

function Preparing({ onClose }: { onClose: () => void }) {
  return (
    <div role="status" onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: SHARE_Z, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", color: C.tx2, fontSize: 14 }}>
      Préparation du partage…
    </div>
  );
}

function useFailClose(failed: boolean, onClose: () => void) {
  useEffect(() => {
    if (!failed) return;
    toast.error("Séance introuvable : partage impossible pour le moment.");
    onClose();
  }, [failed, onClose]);
}

function WorkoutShareLoader({ id, onClose }: { id: string; onClose: () => void }) {
  const { athleteId } = useAthleteContext();
  const workout = useWorkoutSession(id);
  const { bestByRef } = usePRsByRef(athleteId);
  const { data: prLogs } = usePRLogs(athleteId);
  const { data: recordLinks } = useRecordLinks(athleteId);

  const ready = !workout.isLoading && workout.logStatus === "ready" && !!workout.workoutLogId;
  const mods: AthleteModifications = useMemo(() => workout.athleteModifications ?? {}, [workout.athleteModifications]);
  const blocs = useMemo(() => withAddedBloc(workout.blocs, addedExercisesOf(mods)), [workout.blocs, mods]);
  const recordRefByEx = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const b of blocs) for (const ex of b.exercices) out[ex.id] = resolveRecordRef(ex, recordLinks ?? {});
    return out;
  }, [blocs, recordLinks]);
  const oneRmByEx = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const [exId, ref] of Object.entries(recordRefByEx)) out[exId] = ref ? bestByRef[ref]?.kg ?? null : null;
    return out;
  }, [recordRefByEx, bestByRef]);
  const sets = useMemo<AllSets>(() => {
    const out: AllSets = {};
    for (const b of blocs) for (const ex of b.exercices) out[ex.id] = buildExSets(ex, mods.sessionSets?.[ex.id], undefined, oneRmByEx[ex.id]);
    return out;
  }, [blocs, mods, oneRmByEx]);

  const failed = (!workout.isLoading && workout.logStatus === "ready" && !workout.workoutLogId) || workout.logStatus === "error";
  useFailClose(failed, onClose);
  if (!ready || blocs.length === 0) return failed ? null : <Preparing onClose={onClose} />;

  return (
    <MuscuShareSheet
      title={workout.sessionName}
      day={workout.scheduledDate}
      weekNumber={workout.weekNumber}
      blocs={blocs}
      sets={sets}
      completed={workout.status === "completed"}
      rpe={workout.rpeScore}
      comment={mods.sessionComment ?? null}
      oneRmByEx={oneRmByEx}
      recordRefByEx={recordRefByEx}
      prLogs={prLogs}
      onClose={onClose}
    />
  );
}

function EnergyShareLoader({ id, onClose }: { id: string; onClose: () => void }) {
  const { athleteId } = useAthleteContext();
  const { data: assignment, isLoading, isError } = useEnergyAssignment(athleteId, id);
  const { data: session, isLoading: loadingSession, isError: sessionError } = useEnergySession(assignment?.energy_session_id);
  const { data: refs } = useAthleteReferences(athleteId);
  const day = (assignment?.scheduled_date ?? undefined) as IsoDay | undefined;
  const { data: pvd } = usePlannedVsDone(athleteId ?? undefined, day, day);
  const activity = pvd?.flatMap((d) => d.planned).find((p) => p.kind === "energy" && p.id === id)?.activity ?? null;

  const failed = isError || sessionError || (!isLoading && !assignment) || (!!assignment && !loadingSession && !session);
  useFailClose(failed, onClose);
  if (!assignment || !session) return failed ? null : <Preparing onClose={onClose} />;

  const completed = assignment.status === "completed";
  const done: EnergyShareDone | null = completed ? {
    rpe: assignment.rpe_score ?? null,
    durationMin: assignment.actual_duration_min ?? null,
    distanceKm: assignment.distance_km ?? null,
    blockLogs: assignment.block_logs ?? null,
    // `notes` peut porter le journal d'étapes en JSON (ancien Programme) : pas un commentaire.
    comment: assignment.notes && !assignment.notes.trimStart().startsWith("{") ? assignment.notes : null,
  } : null;

  return (
    <EnergyShareSheet
      session={session}
      refs={refs}
      day={assignment.scheduled_date}
      athleteId={athleteId ?? ""}
      completed={completed}
      done={done}
      activity={activity}
      onClose={onClose}
    />
  );
}
