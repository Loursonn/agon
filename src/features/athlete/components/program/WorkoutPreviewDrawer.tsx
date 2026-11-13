import { C } from "@/lib/theme";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { WeekSession } from "@/features/shared/hooks/useActivePlan";
import { formatClusterReps } from "@/features/coach/components/programmation/clusterFormat";
import { formatReps, hasIso, isAllIso } from "@/lib/formatSetsReps";
import { isMissedWeekSession } from "@/features/athlete/components/program/programUtils";
import { useWorkoutSession } from "@/features/shared/hooks/useWorkoutSession";

// ── Workout preview drawer ────────────────────────────────────────────────────


export function WorkoutPreviewDrawer({
  session,
  today,
  onStart,
  onReschedule,
  onClose,
}: {
  session: WeekSession;
  today: string;
  onStart?: () => void;
  onReschedule: () => void;
  onClose: () => void;
}) {
  const workout = useWorkoutSession(session.id);
  const isPast = session.scheduledDate < today;
  const canMove = !isPast || isMissedWeekSession(session, today);

  return (
    <Drawer open onOpenChange={(v) => !v && onClose()}>
      <DrawerContent style={{ background: C.s1, borderTop: "1px solid " + C.brd, padding: 0, maxHeight: "86vh", display: "flex", flexDirection: "column" }}>
        <DrawerHeader style={{ padding: "16px 20px 8px", flexShrink: 0 }}>
          <DrawerTitle style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>
            {session.sessionName}
          </DrawerTitle>
        </DrawerHeader>

        {/* Blocs — scrollable */}
        {workout.isLoading ? (
          <div style={{ padding: "24px 16px", textAlign: "center", color: C.tx3, fontSize: 12 }}>
            Chargement…
          </div>
        ) : workout.blocs.length > 0 ? (
          <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", padding: "0 16px" }}>
            {workout.blocs.map((bloc, blocIdx) => (
              <div key={bloc.id} style={{ marginBottom: 14 }}>
                {/* Bloc header */}
                <div style={{ fontSize: 10, fontWeight: 700, color: C.ac, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                  Bloc {String.fromCharCode(65 + blocIdx)}{bloc.name ? " — " + bloc.name : ""}
                </div>
                <div style={{ background: C.s2, borderRadius: 6, overflow: "hidden" }}>
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
                        <div style={{
                          padding: "6px 14px 0", borderTop: idx > 0 ? "1px solid " + C.brd : "none",
                          borderLeft: "3px solid #F5A623",
                          fontSize: 9, fontWeight: 800, color: "#F5A623", letterSpacing: "0.5px",
                        }}>
                          SUPERSET ×{chainLen} · ENCHAÎNÉS SANS REPOS
                        </div>
                      )}
                      <div
                        style={{
                          padding: "10px 14px",
                          borderTop: idx > 0 && !prevLinked && chainLen <= 1 ? "1px solid " + C.brd : "none",
                          borderLeft: inSuperset ? "3px solid #F5A623" : "3px solid transparent",
                          display: "flex", alignItems: "center", gap: 10,
                        }}
                      >
                        <div style={{
                          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                          background: C.ac + "20", color: C.ac,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 800,
                        }}>
                          {String.fromCharCode(65 + blocIdx)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.tx, display: "block" }}>
                            {ex.exercise_name}
                          </span>
                          <div style={{ display: "flex", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, color: C.tx3 }}>{nb} séries × {ex.params ? formatReps(ex.params) : reps}{ex.params?.cluster || isAllIso(ex.params) ? "" : " reps"}{hasIso(ex.params) ? " · Iso" : ""}</span>
                            {rir != null && (
                              <span style={{ fontSize: 10, color: C.tx3 }}>· RIR {rir}</span>
                            )}
                            {tempo && (
                              <span style={{ fontSize: 10, color: C.tx3 }}>· T {tempo}</span>
                            )}
                          </div>
                        </div>
                        {ex.superset_with_next && bloc.exercices[idx + 1] && (
                          <span title="Lié à l'exercice suivant" style={{ fontSize: 12, color: "#F5A623", flexShrink: 0 }}>↓</span>
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
        <div style={{ padding: "12px 16px 24px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {onStart && (
            <button
              onClick={onStart}
              style={{
                width: "100%", padding: "14px 0", borderRadius: 6, border: "none",
                background: C.acV, color: "#0E0C0A",
                fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", minHeight: 44,
              }}
            >
              Démarrer la séance ▶
            </button>
          )}

          {canMove && (
            <button
              onClick={onReschedule}
              style={{
                width: "100%", padding: "11px 0", borderRadius: 6,
                border: "1px solid " + C.brd, background: "transparent",
                color: C.tx2, fontSize: 13, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Déplacer à une autre date
            </button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
