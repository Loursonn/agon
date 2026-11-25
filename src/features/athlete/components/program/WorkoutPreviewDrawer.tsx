import { ShareSessionButton } from "@/features/athlete/components/share/ShareSessionButton";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { WeekSession } from "@/features/shared/hooks/useActivePlan";
import { formatClusterReps } from "@/features/coach/components/programmation/clusterFormat";
import { formatReps, hasIso, isAllIso } from "@/lib/formatSetsReps";
import { isMissedWeekSession } from "@/features/athlete/components/program/programUtils";
import { useWorkoutSession } from "@/features/shared/hooks/useWorkoutSession";
import { blocColor } from "@/lib/peps";
import { cn } from "@/lib/utils";

// ── Workout preview drawer ────────────────────────────────────────────────────


export function WorkoutPreviewDrawer({
  session,
  today,
  onStart,
  onReschedule,
  onShare,
  onClose,
}: {
  session: WeekSession;
  today: string;
  onStart?: () => void;
  onReschedule: () => void;
  /** Partage en story : le tiroir se ferme, la page ouvre le partage. */
  onShare: () => void;
  onClose: () => void;
}) {
  const workout = useWorkoutSession(session.id);
  const isPast = session.scheduledDate < today;
  const canMove = !isPast || isMissedWeekSession(session, today);

  return (
    <Drawer open onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="flex max-h-[86vh] flex-col border-t-agon-brd bg-agon-s1 p-0">
        <DrawerHeader className="flex shrink-0 flex-row items-center gap-3 space-y-0 px-5 pb-2 pt-4">
          <DrawerTitle className="min-w-0 flex-1 text-[17px] font-semibold leading-tight text-agon-tx">
            {session.sessionName}
          </DrawerTitle>
          <ShareSessionButton target={{ kind: "workout", id: session.id }} onOpen={onShare} />
        </DrawerHeader>

        {/* Blocs — scrollable */}
        {workout.isLoading ? (
          <div className="px-4 py-6 text-center text-[12px] text-agon-tx3">
            Chargement…
          </div>
        ) : workout.blocs.length > 0 ? (
          <div className="flex-1 overflow-y-auto px-4 [scrollbar-width:none]">
            {workout.blocs.map((bloc, blocIdx) => (
              <div key={bloc.id} className="mb-3.5">
                {/* Bloc header */}
                <div className="agon-mono mb-1.5 text-[11px] uppercase tracking-[0.12em] text-agon-tx3">
                  <span style={{ color: blocColor(bloc.color, blocIdx) }}>Bloc {String.fromCharCode(65 + blocIdx)}</span>{bloc.name && bloc.name.trim().toUpperCase() !== String.fromCharCode(65 + blocIdx) ? " — " + bloc.name : ""}
                </div>
                <div className="overflow-hidden rounded-xl border border-agon-brd bg-agon-s2">
                  {bloc.exercices.map((ex, idx) => {
                    // Superset : chaîne d'exercices liés (superset_with_next), comme en séance
                    const prevLinked = idx > 0 && !!bloc.exercices[idx - 1].superset_with_next;
                    const inSuperset = prevLinked || !!ex.superset_with_next;
                    let chainLen = 0;
                    if (inSuperset && !prevLinked) {
                      chainLen = 1;
                      while (bloc.exercices[idx + chainLen - 1]?.superset_with_next && bloc.exercices[idx + chainLen]) chainLen++;
                    }
                    const nb = ex.params?.nb_series ?? 0;
                    const reps = ex.params?.cluster
                      ? formatClusterReps(ex.params.cluster)
                      : ex.params?.reps?.mode === "global" ? ex.params.reps.value : "?";
                    const rir = ex.params?.rir?.mode === "global" ? ex.params.rir.value : null;
                    const tempo = ex.params?.tempo?.mode === "global" && ex.params.tempo.value ? ex.params.tempo.value : null;
                    return (
                      <div key={ex.id}>
                      {chainLen > 1 && (
                        <div className={cn(
                          "border-l-[3px] border-l-agon-alerte px-3.5 pb-0 pt-1.5 text-[9px] font-extrabold tracking-[0.5px] text-agon-alerte",
                          idx > 0 ? "border-t border-t-agon-brd" : "border-t-0",
                        )}>
                          SUPERSET ×{chainLen} · ENCHAÎNÉS SANS REPOS
                        </div>
                      )}
                      <div
                        className={cn(
                          "flex items-center gap-2.5 border-l-[3px] px-3.5 py-2.5",
                          inSuperset ? "border-l-agon-alerte" : "border-l-transparent",
                          idx > 0 && !prevLinked && chainLen <= 1 ? "border-t border-t-agon-brd" : "border-t-0",
                        )}
                      >
                        <div
                          className="agon-mono flex size-[22px] shrink-0 items-center justify-center rounded-[6px] text-[11px] font-medium text-agon-ink"
                          style={{ background: blocColor(bloc.color, blocIdx) }}
                        >
                          {String.fromCharCode(65 + blocIdx)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="block text-[14px] font-medium text-agon-tx">
                            {ex.exercise_name}
                          </span>
                          <div className="mt-0.5 flex flex-wrap gap-1.5">
                            <span className="agon-mono text-[11.5px] text-agon-tx2">{nb} séries × {ex.params ? formatReps(ex.params) : reps}{ex.params?.cluster || isAllIso(ex.params) ? "" : " reps"}{hasIso(ex.params) ? " · Iso" : ""}</span>
                            {rir != null && (
                              <span className="agon-mono text-[11.5px] text-agon-tx2">· RIR {rir}</span>
                            )}
                            {tempo && (
                              <span className="agon-mono text-[11.5px] text-agon-tx2">· T {tempo}</span>
                            )}
                          </div>
                        </div>
                        {ex.superset_with_next && bloc.exercices[idx + 1] && (
                          <span title="Lié à l'exercice suivant" className="shrink-0 text-[12px] text-agon-alerte">↓</span>
                        )}
                      </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Actions — sticky */}
        <div className="flex shrink-0 flex-col gap-2 px-4 pb-6 pt-3">
          {onStart && (
            <button
              onClick={onStart}
              className="h-[52px] w-full cursor-pointer rounded-xl border-none bg-agon-accent font-[inherit] text-[15px] font-semibold text-agon-ink"
            >
              Démarrer la séance ▶
            </button>
          )}

          {canMove && (
            <button
              onClick={onReschedule}
              className="h-12 w-full cursor-pointer rounded-xl border border-agon-brd-l bg-transparent font-[inherit] text-[14px] font-medium text-agon-tx"
            >
              Déplacer à une autre date
            </button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
