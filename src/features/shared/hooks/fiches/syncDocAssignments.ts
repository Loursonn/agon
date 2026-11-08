/**
 * Synchronisation des attributions de fiches depuis le JSON de programmation
 * (calcul et RPC atomique `sync_doc_assignments` : `src/api/docs.ts`).
 *
 * Fonctions non-hook (appelées depuis des mutations) ; les erreurs sont loguées
 * sans faire échouer la sauvegarde d'origine.
 */
import type { QueryClient } from "@tanstack/react-query";
import {
  invalidateDocs, listEnergySessionAthletes, syncEnergyAssignments, syncProgrammeAssignments,
} from "@/api/docs";
import type { ProgSession } from "@/features/coach/components/programmation/types";

export { stripForeignPersonalFiches } from "@/api/docs";

/**
 * Source 'programme' : séances + blocs de asp:prog (variantes par semaine
 * comprises) + overrides d'occurrence. `sessions` absent → relu en base.
 */
export async function syncDocAssignmentsFromProg(
  athleteId: string,
  sessions?: ProgSession[],
  qc?: QueryClient,
): Promise<void> {
  try {
    await syncProgrammeAssignments(athleteId, sessions);
    if (qc) void invalidateDocs(qc, athleteId);
  } catch (e) {
    console.error("[fiches] sync programme", e);
  }
}

/** Source 'energie' : fiches des séances énergie attribuées à l'athlète. */
export async function syncDocAssignmentsFromEnergy(athleteId: string, qc?: QueryClient): Promise<void> {
  try {
    await syncEnergyAssignments(athleteId);
    if (qc) void invalidateDocs(qc, athleteId);
  } catch (e) {
    console.error("[fiches] sync energie", e);
  }
}

/** Après sauvegarde d'une séance énergie : resynchronise chaque athlète qui l'a au planning. */
export async function syncEnergySessionAthletes(energySessionId: string, qc?: QueryClient): Promise<void> {
  try {
    const athletes = await listEnergySessionAthletes(energySessionId);
    await Promise.all(athletes.map((a) => syncDocAssignmentsFromEnergy(a, qc)));
  } catch (e) {
    console.error("[fiches] sync energie (séance)", e);
  }
}
