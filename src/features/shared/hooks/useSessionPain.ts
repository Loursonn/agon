import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PainLevels } from "@shared/domain/wellness";
import { invalidateMedical, isSessionPainNotFound } from "@/api/injuries";
import { invalidateWeeklyReviews } from "@/api/weeklyReviews";
import { notifyQueued, submitWrite } from "@/lib/offline/writes";
import { sessionPainByLabel } from "@/lib/sessionPain";

export type SessionPainTarget =
  | { kind: "workout"; logId: string }
  | { kind: "energy"; id: string }
  | { kind: "competition"; id: string };

/**
 * « Oui, douleur » en fin de séance (muscu, énergie ou compétition) : blessure déclarée, ou
 * suivi de la blessure déjà en cours sur la même zone (décision d'Hugo, 15/11).
 * Gardée sur le téléphone sans réseau, comme le RPE. Rafraîchit les blessures
 * (badge « blessure active », profil) et le rappel de la weekly review.
 */
export function useSaveSessionPain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ target, athleteId, levels, note }: { target: SessionPainTarget; athleteId: string; levels: PainLevels; note: string | null }) =>
      submitWrite("session.pain", {
        athleteId,
        source: target.kind === "workout" ? { workoutLogId: target.logId }
          : target.kind === "energy" ? { energyAssignmentId: target.id }
          : { competitionId: target.id },
        levels: sessionPainByLabel(levels),
        note,
      }),
    onSuccess: (res, { athleteId }) => {
      if (res.status === "queued") {
        notifyQueued();
        return;
      }
      void invalidateMedical(qc, athleteId);
      void invalidateWeeklyReviews(qc, athleteId);
      toast.success("Douleur transmise à ton coach");
    },
    onError: (err) => {
      if (isSessionPainNotFound(err)) {
        toast.error("Cette séance n'existe plus : ton coach l'a retirée.");
        return;
      }
      toast.error("Douleur non enregistrée — vérifie ta connexion");
    },
  });
}
