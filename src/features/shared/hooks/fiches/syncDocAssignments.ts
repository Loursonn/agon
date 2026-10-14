/**
 * Synchronisation des attributions de fiches depuis le JSON de programmation.
 *
 * asp:prog (app_data), les overrides d'occurrence (workout_logs.athlete_modifications.coachOverride)
 * et energy_sessions.fiches sont du JSON : la base ne peut pas suivre les
 * références seule. Après chaque sauvegarde, on recalcule la liste des doc_id
 * référencés et on appelle la RPC sync_doc_assignments (source 'programme' ou
 * 'energie'), qui ne touche jamais aux attributions 'manuel'.
 *
 * Fonctions non-hook (appelées depuis des mutations) ; les erreurs sont loguées
 * sans faire échouer la sauvegarde d'origine.
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { collectDocIds, collectProgDocIds, stripFiches } from "../../types/fiches";
import type { FicheAttachment } from "../../types/fiches";
import type { AthleteModifications } from "../../types/athlete";
import type { ProgSession } from "@/features/coach/components/programmation/types";

async function rpcSync(athleteId: string, source: "programme" | "energie", docIds: string[]) {
  const { error } = await supabase.rpc("sync_doc_assignments", {
    p_athlete: athleteId,
    p_source: source,
    p_doc_ids: docIds,
  });
  if (error) throw error;
}

/** doc_id référencés par les overrides d'occurrence de l'athlète. */
async function overrideDocIds(athleteId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("workout_logs")
    .select("athlete_modifications")
    .eq("athlete_id", athleteId)
    .not("athlete_modifications->coachOverride", "is", null);
  if (error) throw error;
  const sessions = (data ?? []).map(r => {
    const o = (r.athlete_modifications as AthleteModifications | null)?.coachOverride;
    return { fiches: o?.fiches, blocs: (o?.blocs ?? []) as { fiches?: FicheAttachment[] }[] };
  });
  return collectProgDocIds(sessions);
}

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
    let list = sessions;
    if (!list) {
      const { data, error } = await supabase
        .from("app_data")
        .select("value")
        .eq("athlete_id", athleteId)
        .eq("key", "asp:prog")
        .maybeSingle();
      if (error) throw error;
      list = (data?.value ?? []) as unknown as ProgSession[];
    }
    const ids = new Set([...collectProgDocIds(list), ...(await overrideDocIds(athleteId))]);
    await rpcSync(athleteId, "programme", [...ids]);
    qc?.invalidateQueries({ queryKey: QK.athleteDocs(athleteId) });
  } catch (e) {
    console.error("[fiches] sync programme", e);
  }
}

/** Source 'energie' : fiches des séances énergie attribuées à l'athlète. */
export async function syncDocAssignmentsFromEnergy(athleteId: string, qc?: QueryClient): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("energy_session_assignments")
      .select("energy_sessions(fiches)")
      .eq("athlete_id", athleteId);
    if (error) throw error;
    const lists = (data ?? []).map(
      r => (r.energy_sessions as unknown as { fiches?: FicheAttachment[] | null } | null)?.fiches,
    );
    await rpcSync(athleteId, "energie", collectDocIds(lists));
    qc?.invalidateQueries({ queryKey: QK.athleteDocs(athleteId) });
  } catch (e) {
    console.error("[fiches] sync energie", e);
  }
}

/** Après sauvegarde d'une séance énergie : resynchronise chaque athlète qui l'a au planning. */
export async function syncEnergySessionAthletes(energySessionId: string, qc?: QueryClient): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("energy_session_assignments")
      .select("athlete_id")
      .eq("energy_session_id", energySessionId);
    if (error) throw error;
    const athletes = [...new Set((data ?? []).map(r => r.athlete_id))];
    await Promise.all(athletes.map(a => syncDocAssignmentsFromEnergy(a, qc)));
  } catch (e) {
    console.error("[fiches] sync energie (séance)", e);
  }
}

/**
 * Duplication vers un autre athlète : retire les rattachements vers une fiche
 * personnelle d'un autre athlète (les fiches de banque suivent sans remapping).
 */
export async function stripForeignPersonalFiches<T extends ProgSession>(
  session: T,
  targetAthleteId: string,
): Promise<{ session: T; removed: number }> {
  const ids = collectProgDocIds([session]);
  if (ids.length === 0) return { session, removed: 0 };
  const { data, error } = await supabase.from("docs").select("id, athlete_id").in("id", ids);
  if (error) throw error;
  const foreign = new Set(
    (data ?? []).filter(d => d.athlete_id && d.athlete_id !== targetAthleteId).map(d => d.id),
  );
  return stripFiches(session, id => foreign.has(id));
}
