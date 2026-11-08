import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { getHyroxFlag, hyroxKeys, setHyroxFlag } from "@/api/hyrox";

/**
 * Lit et bascule `is_hyrox_athlete` sur un profil (mise à jour optimiste,
 * retour arrière en cas d'erreur). Après succès, la liste des athlètes du
 * coach est rechargée : l'onglet HYROX apparaît / disparaît tout de suite
 * dans la barre de contexte.
 */
export function useHyroxFlag(athleteId: string | undefined) {
  const qc = useQueryClient();
  const { user, refreshAthletes } = useAuth();
  const key = hyroxKeys.flag(athleteId ?? "");

  const { data: enabled = false } = useQuery({
    queryKey: key,
    enabled: !!athleteId,
    queryFn: () => getHyroxFlag(athleteId as string),
  });

  const mutation = useMutation({
    mutationFn: (next: boolean) => setHyroxFlag(athleteId as string, next),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<boolean>(key);
      qc.setQueryData(key, next);
      return { previous };
    },
    onError: (err, _next, ctx) => {
      qc.setQueryData(key, ctx?.previous ?? false);
      toast.error("Impossible de modifier le flag HYROX");
      console.error("hyrox flag toggle:", err);
    },
    onSuccess: (_d, next) => {
      void qc.invalidateQueries({ queryKey: key });
      if (user) void refreshAthletes();
      window.dispatchEvent(new CustomEvent("hyrox-flag-changed", { detail: { athleteId, enabled: next } }));
    },
  });

  const toggle = async () => {
    if (!athleteId) return;
    try {
      await mutation.mutateAsync(!enabled);
    } catch {
      /* déjà signalé */
    }
  };

  return { enabled, toggling: mutation.isPending, toggle };
}
