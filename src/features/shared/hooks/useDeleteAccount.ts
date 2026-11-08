import { useMutation } from "@tanstack/react-query";
import { deleteAccount, type DeleteAccountResult } from "@/api/account";
import { logoutDevice } from "@/lib/offline/logoutDevice";

export type { DeleteAccountResult };

/**
 * Suppression définitive du compte et de toutes les données associées
 * (RGPD art. 17).
 *
 * Le mot de confirmation est exigé par la fonction serveur, pas seulement par
 * l'interface : une suppression déclenchée par un appel direct à l'API doit
 * elle aussi être intentionnelle.
 *
 * L'identité supprimée est celle du jeton de session. La fonction ne lit
 * jamais d'identifiant dans le corps de la requête : sinon n'importe qui
 * pourrait demander la suppression du compte d'un autre.
 */
export function useDeleteAccount() {
  return useMutation<DeleteAccountResult, Error, void>({
    mutationFn: () => deleteAccount(),
    onSuccess: async () => {
      // Le compte n'existe plus : garder la session en mémoire n'aurait aucun
      // sens et le prochain appel échouerait de façon incompréhensible.
      await logoutDevice().catch(() => {});
    },
  });
}
