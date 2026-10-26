import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DeleteAccountResult {
  success: boolean;
  /** Étapes qui n'ont pas abouti (ex. révocation d'un provider injoignable). */
  warnings?: string[];
}

/**
 * Suppression définitive du compte et de toutes les données associées
 * (RGPD art. 17).
 *
 * Le mot de confirmation est exigé par la fonction serveur, pas seulement par
 * l'interface : une suppression déclenchée par un appel direct à l'API doit
 * elle aussi être intentionnelle.
 *
 * `invoke()` porte le jeton de session, donc l'identité supprimée est celle du
 * demandeur. La fonction ne lit jamais d'identifiant dans le corps de la
 * requête : sinon n'importe qui pourrait demander la suppression du compte
 * d'un autre.
 */
export function useDeleteAccount() {
  return useMutation<DeleteAccountResult, Error, void>({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<DeleteAccountResult>(
        "delete-account",
        { body: { confirm: "SUPPRIMER" } },
      );
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error("La suppression n'a pas abouti");
      return data;
    },
    onSuccess: async () => {
      // Le compte n'existe plus : garder la session en mémoire n'aurait aucun
      // sens et le prochain appel échouerait de façon incompréhensible.
      await supabase.auth.signOut({ scope: "local" });
    },
  });
}
