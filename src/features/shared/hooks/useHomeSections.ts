import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { appContentKeys, getHomeHiddenSections, invalidateHomeSections, setHomeHiddenSections } from "@/api/appContent";

/** Sections de l'accueil athlète que le coach peut masquer (ordre d'affichage) */
export const HOME_SECTIONS = [
  { key: "quote",     label: "Citation du jour" },
  { key: "wellness",  label: "Wellness du jour" },
  { key: "week",      label: "Cette semaine" },
  { key: "events",    label: "Mes événements" },
  { key: "nutrition", label: "Alimentation du jour" },
  { key: "test",      label: "Test / mesure du jour" },
  { key: "next_comp", label: "Prochaine compétition" },
  { key: "trend",     label: "Tendance de forme" },
] as const;

/** Toujours visibles, non masquables */
export const HOME_LOCKED_SECTIONS = ["Retour du coach", "Séances du jour", "Jour de compétition / à commenter"];

export type HomeSectionKey = (typeof HOME_SECTIONS)[number]["key"];

/**
 * Sections désactivées par défaut, que le coach active athlète par athlète
 * (weekly review : décision d'Hugo du 2026-11-15, « ça dépend du profil »).
 * Rangées dans le même tableau `profiles.home_hidden_sections` sous la forme
 * « +clé » (présent = activé), pour ne pas ajouter de colonne.
 */
export const HOME_OPT_IN_SECTIONS = [
  { key: "weekly_review", label: "Weekly review" },
] as const;

export type HomeOptInKey = (typeof HOME_OPT_IN_SECTIONS)[number]["key"];

const optInMarker = (k: HomeOptInKey) => `+${k}`;

/** La section `k` est-elle activée par le coach ? (réglages bruts du profil) */
export function isOptedIn(hidden: readonly string[] | null | undefined, k: HomeOptInKey): boolean {
  return (hidden ?? []).includes(optInMarker(k));
}

/** Réglages avec la section `k` activée ou non. */
export function withOptIn(hidden: readonly string[], k: HomeOptInKey, on: boolean): string[] {
  const rest = hidden.filter((x) => x !== optInMarker(k));
  return on ? [...rest, optInMarker(k)] : rest;
}

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
  return {
    hidden,
    isVisible: (k: HomeSectionKey) => !hidden.includes(k),
    isEnabled: (k: HomeOptInKey) => isOptedIn(hidden, k),
    /** Réglages encore en chargement : ne rien décider (une section activée clignoterait). */
    isLoading: !!athleteId && data === undefined,
  };
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
