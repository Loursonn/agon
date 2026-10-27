import { useMutation } from "@tanstack/react-query";
import { buildDataExport, downloadExport, type ExportResult } from "@/lib/dataExport";

/**
 * Export des données personnelles au format JSON (RGPD art. 15 et 20).
 *
 * Mutation et non requête : c'est une action déclenchée par l'utilisateur, à
 * ne jamais mettre en cache ni rejouer automatiquement — lire 37 tables au
 * montage d'un écran serait absurde.
 */
export function useDataExport() {
  return useMutation<ExportResult, Error, string>({
    mutationFn: async (userId: string) => {
      const result = await buildDataExport(userId);
      downloadExport(result.payload);
      return result;
    },
  });
}
