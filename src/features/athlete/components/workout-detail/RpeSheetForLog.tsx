import { ACCENT } from "@/features/athlete/components/workout-detail/workoutDetailConstants";
import { C, H } from "@/lib/theme";
import { WORKOUT_GONE_MESSAGE } from "@/features/shared/hooks/useUpsertWorkoutRpe";
import { applyOptimisticWorkout } from "@/lib/optimisticWorkout";
import { hexToRgba } from "@/features/athlete/components/workout-detail/workoutDetailUtils";
import { invalidateWorkouts, isWorkoutNotFound } from "@/api/workouts";
import { notifyQueued, submitWrite } from "@/lib/offline/writes";
import { toast } from "sonner";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

// ── RPE sheet ──────────────────────────────────────────────────────────────────

export function RpeSheetForLog({
  workoutLogId,
  onClose,
}: {
  workoutLogId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { athleteId } = useAthleteContext();
  const [rpe, setRpe] = useState<number | null>(null);

  const { mutate: saveRpe, isPending } = useMutation({
    // Seule source du RPE : `workout_logs.rpe_score` (RPC). L'ancien upsert
    // dans `workout_rpe` échouait au 2e RPE (doublon) et affichait
    // « RPE non enregistré » alors que la note était écrite.
    // Hors ligne : gardé en file (`workout.rpe`), affiché tout de suite.
    mutationFn: async (rpeScore: number) => {
      const res = await submitWrite("workout.rpe", { athleteId, logId: workoutLogId, rpe: rpeScore });
      return { rpeScore, queued: res.status === "queued" };
    },
    onSuccess: ({ rpeScore, queued }) => {
      if (queued) {
        applyOptimisticWorkout(qc, { athleteId, logId: workoutLogId }, { rpe: rpeScore });
        notifyQueued();
      } else {
        void invalidateWorkouts(qc, { athleteId, logId: workoutLogId });
      }
      onClose();
    },
    onError: (err: unknown) => {
      if (isWorkoutNotFound(err)) {
        void invalidateWorkouts(qc, { athleteId, logId: workoutLogId });
        toast.error(WORKOUT_GONE_MESSAGE);
        onClose();
        return;
      }
      toast.error("RPE non enregistré — vérifie ta connexion");
    },
  });

  const RPE_ITEMS: Array<{ v: number; label: string; color: string }> = [
    { v: 1,  label: "Très léger",  color: H.vert },
    { v: 2,  label: "Léger",       color: H.vertMenthe },
    { v: 3,  label: "Facile",      color: H.citron },
    { v: 4,  label: "Modéré",      color: H.jaune },
    { v: 5,  label: "Rythme",      color: H.ambre },
    { v: 6,  label: "Intense",     color: C.o },
    { v: 7,  label: "Dur",         color: H.orange },
    { v: 8,  label: "Très dur",    color: H.rougeVif },
    { v: 9,  label: "Quasi max",   color: H.rougeFonce },
    { v: 10, label: "Maximum",     color: H.bordeaux },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 50,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          background: C.bg,
          borderRadius: "6px 6px 0 0",
          padding: "24px 20px 40px",
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: C.tx,
            textAlign: "center",
            marginBottom: 6,
          }}
        >
          Séance terminée !
        </div>
        <div
          style={{
            fontSize: 12,
            color: C.tx3,
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          Effort global perçu ? (RPE)
        </div>
        {/* 2 rows of 5 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 6,
            marginBottom: 20,
          }}
        >
          {RPE_ITEMS.map(({ v, label, color }) => {
            const selected = rpe === v;
            return (
              <button
                key={v}
                onClick={() => setRpe(v)}
                style={{
                  height: 56,
                  borderRadius: 4,
                  border: `2px solid ${selected ? color : hexToRgba(color, 0.35)}`,
                  background: selected ? hexToRgba(color, 0.22) : hexToRgba(color, 0.07),
                  color: selected ? color : C.tx2,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                  transition: "all 120ms",
                  padding: "3px 2px",
                }}
              >
                <span style={{ fontSize: 16, fontWeight: 900, lineHeight: 1, color: selected ? color : C.tx }}>{v}</span>
                <span style={{ fontSize: 8, fontWeight: 600, lineHeight: 1.2, color: selected ? color : C.tx3, textAlign: "center" as const }}>{label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "12px 0",
              borderRadius: 6,
              border: `1px solid ${C.brdL}`,
              background: "transparent",
              color: C.tx2,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Passer
          </button>
          <button
            onClick={() => rpe != null && saveRpe(rpe)}
            disabled={rpe == null || isPending}
            style={{
              flex: 2,
              padding: "12px 0",
              borderRadius: 6,
              border: "none",
              background: rpe != null ? (RPE_ITEMS.find(r => r.v === rpe)?.color ?? ACCENT) : C.s2,
              color: rpe != null ? C.tx : C.tx3,
              fontSize: 13,
              fontWeight: 700,
              cursor: rpe != null ? "pointer" : "default",
              fontFamily: "inherit",
            }}
          >
            {isPending ? "Enregistrement…" : "Valider"}
          </button>
        </div>
      </div>
    </div>
  );
}
