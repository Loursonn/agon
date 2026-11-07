/**
 * useSyncHistoricalPRs — bouton « Sync » du Profil sportif : recalcule les
 * records depuis les séries de l'ancien stockage (`asp:sets`, plus écrit
 * depuis 2026-06). Les séances actuelles enregistrent leurs records à la
 * validation (`computeRecordsFromSession`).
 *
 * Même formule et même règle que la validation : 1RM Epley arrondi 0,5 kg,
 * un record n'est ajouté que s'il bat le précédent.
 */
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { computeRecordsFromSession, getLegacyRecordSets, invalidateRecords } from "@/api/records";
import { recordRefOf } from "@shared/domain/performance";
import type { Exercise } from "../types/athlete";

interface SyncParams {
  athleteId: string;
  exercises: Exercise[];
}

export function useSyncHistoricalPRs() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async ({ athleteId, exercises }: SyncParams) => {
    if (syncing) return;
    if (!exercises.some((ex) => recordRefOf(ex))) {
      toast("Aucun exercice avec référence RM dans le programme", { duration: 2000 });
      return;
    }
    setSyncing(true);
    try {
      const sets = await getLegacyRecordSets(athleteId, exercises);
      if (sets.length === 0) {
        toast("Aucun historique de séries trouvé", { duration: 2000 });
        return;
      }
      const found = await computeRecordsFromSession(athleteId, sets);
      await invalidateRecords(qc, athleteId);
      if (found.length > 0) {
        toast.success(`${found.length} PR${found.length > 1 ? "s" : ""} calculé${found.length > 1 ? "s" : ""} depuis l'historique`);
      } else {
        toast("PRs déjà à jour", { duration: 2000 });
      }
    } catch (err) {
      toast.error("Erreur sync historique : " + (err as Error).message);
    } finally {
      setSyncing(false);
    }
  }, [qc, syncing]);

  return { sync, syncing };
}
