import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Sections de l'accueil athlète que le coach peut masquer (ordre d'affichage) */
export const HOME_SECTIONS = [
  { key: "quote",     label: "Citation du jour" },
  { key: "wellness",  label: "Wellness du jour" },
  { key: "nutrition", label: "Alimentation du jour" },
  { key: "test",      label: "Test / mesure du jour" },
  { key: "week",      label: "Cette semaine" },
  { key: "yesterday", label: "Hier" },
  { key: "next_comp", label: "Prochaine compétition" },
  { key: "events",    label: "Mes événements" },
  { key: "trend",     label: "Tendance de forme" },
] as const;

/** Toujours visibles, non masquables */
export const HOME_LOCKED_SECTIONS = ["Séance du jour", "Message du coach", "Jour de compétition / à commenter"];

export type HomeSectionKey = (typeof HOME_SECTIONS)[number]["key"];

const DEFAULT_HIDDEN: HomeSectionKey[] = ["nutrition"];
const key = (athleteId: string) => ["homeHiddenSections", athleteId] as const;

/** Sections masquées sur l'accueil de l'athlète (réglées par le coach) */
export function useHomeHiddenSections(athleteId: string | null | undefined) {
  const { data } = useQuery<string[]>({
    queryKey: key(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("profiles")
        .select("home_hidden_sections")
        .eq("id", athleteId)
        .single();
      if (error) throw error;
      return (data?.home_hidden_sections as string[] | null) ?? DEFAULT_HIDDEN;
    },
  });
  const hidden = data ?? DEFAULT_HIDDEN;
  return { hidden, isVisible: (k: HomeSectionKey) => !hidden.includes(k) };
}

export function useSetHomeHiddenSections(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (hidden: string[]) => {
      const { error } = await db.from("profiles").update({ home_hidden_sections: hidden }).eq("id", athleteId);
      if (error) throw error;
    },
    onMutate: async (hidden) => {
      await qc.cancelQueries({ queryKey: key(athleteId) });
      const prev = qc.getQueryData<string[]>(key(athleteId));
      qc.setQueryData(key(athleteId), hidden);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key(athleteId), ctx.prev);
      toast.error("Impossible de modifier l'accueil de l'athlète");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key(athleteId) }),
  });
}
