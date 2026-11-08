import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { appContentKeys, getHomeHiddenSections, invalidateHomeSections, setHomeHiddenSections } from "@/api/appContent";

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

/** Sections masquées sur l'accueil de l'athlète (réglées par le coach) */
export function useHomeHiddenSections(athleteId: string | null | undefined) {
  const { data } = useQuery<string[]>({
    queryKey: appContentKeys.homeHidden(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 5 * 60_000,
    queryFn: async () => (await getHomeHiddenSections(athleteId!)) ?? DEFAULT_HIDDEN,
  });
  const hidden = data ?? DEFAULT_HIDDEN;
  return { hidden, isVisible: (k: HomeSectionKey) => !hidden.includes(k) };
}

export function useSetHomeHiddenSections(athleteId: string) {
  const qc = useQueryClient();
  const key = appContentKeys.homeHidden(athleteId);
  return useMutation({
    mutationFn: (hidden: string[]) => setHomeHiddenSections(athleteId, hidden),
    onMutate: async (hidden) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<string[]>(key);
      qc.setQueryData(key, hidden);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error("Impossible de modifier l'accueil de l'athlète");
    },
    onSettled: () => invalidateHomeSections(qc, athleteId),
  });
}
