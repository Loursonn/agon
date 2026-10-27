import { supabase } from "@/integrations/supabase/client";

/**
 * En-têtes d'appel d'une Edge Function, portant le jeton de session de
 * l'utilisateur.
 *
 * Pourquoi ce helper existe : plusieurs appels historiques envoyaient la clé
 * publique anonyme dans l'en-tête `Authorization`. Cette clé est, par
 * construction, publique — elle est dans le bundle JS. Une fonction qui s'en
 * contente est donc appelable par n'importe qui, sans compte. En envoyant le
 * jeton de session, la fonction peut identifier l'appelant réel et refuser les
 * requêtes anonymes.
 *
 * `supabase.functions.invoke()` fait cela nativement ; ce helper couvre les
 * appels encore écrits en `fetch` brut.
 */
export async function functionAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Session expirée — reconnecte-toi");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}
