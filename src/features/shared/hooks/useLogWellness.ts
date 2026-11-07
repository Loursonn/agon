import { useCallback } from "react";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { toast } from "sonner";
import type { WellnessData } from "../types/athlete";

/**
 * Mutation: log today's wellness.
 * Wraps context.saveWellness with toast feedback.
 * L'état local est mis à jour tout de suite ; le toast de succès attend la
 * confirmation serveur (un échec est déjà signalé par le toast de persist).
 */
export function useLogWellness() {
  const { saveWellness } = useAthleteContext();

  // Le succès n'est annoncé qu'après confirmation du serveur (avant, le toast
  // partait avant même l'envoi, y compris hors ligne).
  const mutate = useCallback(
    async (data: WellnessData): Promise<boolean> => {
      try {
        const ok = (await saveWellness(data)) !== false;
        if (ok) toast.success("Wellness enregistré !");
        return ok;
      } catch {
        toast.error("Erreur lors de l'enregistrement");
        return false;
      }
    },
    [saveWellness],
  );

  return { mutate };
}
