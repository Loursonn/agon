/**
 * Double coach : coach référent (profiles.coach_id) + co-coach éventuel
 * (table athlete_co_coaches, 1 max). Les deux ont les mêmes droits sur
 * l'entraînement ; la base fait foi (is_coach_of couvre les deux).
 *
 * Ajout : par le coach référent ou par l'athlète, avec le code coach du 2e coach.
 * Retrait : coach référent, athlète, ou le co-coach lui-même.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";

// Table et RPC pas encore dans les types générés
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface CoachPerson {
  id: string;
  full_name: string;
}

export interface AthleteCoaches {
  referent: CoachPerson | null;
  coCoach: (CoachPerson & { added_by_role: "coach" | "athlete"; created_at: string }) | null;
}

export function useAthleteCoaches(athleteId: string | null | undefined) {
  return useQuery<AthleteCoaches>({
    queryKey: QK.athleteCoaches(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: athlete, error: e1 }, { data: link, error: e2 }] = await Promise.all([
        supabase.from("profiles").select("coach_id").eq("id", athleteId!).maybeSingle(),
        db.from("athlete_co_coaches").select("co_coach_id, added_by_role, created_at").eq("athlete_id", athleteId!).maybeSingle(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const referentId = (athlete?.coach_id as string | null) ?? null;
      const coId = (link?.co_coach_id as string | undefined) ?? null;
      const ids = [referentId, coId].filter((x): x is string => !!x);
      const names = new Map<string, string>();
      if (ids.length) {
        const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        for (const p of data ?? []) names.set(p.id, p.full_name ?? "Coach");
      }
      return {
        referent: referentId ? { id: referentId, full_name: names.get(referentId) ?? "Coach" } : null,
        coCoach: coId
          ? { id: coId, full_name: names.get(coId) ?? "Coach", added_by_role: link.added_by_role, created_at: link.created_at }
          : null,
      };
    },
  });
}

/** Messages lisibles pour les refus de la RPC (RAISE côté base). */
function cleanError(e: { message?: string } | null): Error {
  const m = e?.message ?? "Erreur";
  return new Error(m.replace(/^.*?ERROR:\s*/, ""));
}

export function useAddCoCoach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ athleteId, coachCode }: { athleteId: string; coachCode: string }) => {
      const { data, error } = await db.rpc("add_co_coach", { p_athlete: athleteId, p_coach_code: coachCode.trim() });
      if (error) throw cleanError(error);
      return data as { co_coach_id: string; full_name: string };
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: QK.athleteCoaches(vars.athleteId) }),
  });
}

export function useRemoveCoCoach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ athleteId }: { athleteId: string }) => {
      const { error } = await db.rpc("remove_co_coach", { p_athlete: athleteId });
      if (error) throw cleanError(error);
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: QK.athleteCoaches(vars.athleteId) }),
  });
}

/**
 * Coach-athlète suivi par un autre coach : se déclare co-coach de lui-même.
 * Utilisé quand il ouvre sa propre invitation staff (il ne peut pas être son
 * propre staff) : l'invitation en attente est retirée au passage.
 */
export async function addSelfAsCoCoach(userId: string, ownCoachCode: string, staffInviteToken?: string) {
  const { error } = await db.rpc("add_co_coach", { p_athlete: userId, p_coach_code: ownCoachCode });
  if (error) throw cleanError(error);
  if (staffInviteToken) {
    await supabase.from("staff_invitations").delete().eq("token", staffInviteToken).eq("athlete_id", userId);
  }
}
