import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Vérification d'identité commune aux Edge Functions.
 *
 * Problème corrigé : `ai-program` et `athlete-insights` n'effectuaient aucune
 * vérification. Elles se contentaient de la présence d'un en-tête
 * `Authorization`, que Supabase accepte dès lors qu'il contient la clé anonyme
 * — laquelle est publique, présente dans le bundle JavaScript, donc connue de
 * quiconque ouvre les outils de développement. N'importe qui pouvait donc
 * appeler ces fonctions et consommer le quota Gemini, indéfiniment.
 *
 * `getUser()` sur la clé anonyme échoue : seul un véritable jeton de session
 * utilisateur est accepté. C'est précisément la distinction qu'on veut.
 */

export interface AuthedUser {
  id: string;
  email?: string;
  /** Jeton de session présenté, requis pour rejouer les règles RLS en son nom. */
  token: string;
}

/**
 * Renvoie l'utilisateur authentifié, ou lève une erreur.
 *
 * À appeler avant tout traitement, et avant toute dépense d'appel à un service
 * payant.
 */
export async function requireUser(req: Request): Promise<AuthedUser> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Non autorisé");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new Error("Non autorisé");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Non autorisé");

  return { id: data.user.id, email: data.user.email ?? undefined, token };
}

/**
 * Vrai si l'appelant a le droit d'agir pour cet athlète : lui-même, ou son
 * coach.
 *
 * Sans cette vérification, un identifiant d'athlète transmis dans le corps de
 * requête n'est qu'une déclaration : il suffirait d'y mettre celui d'un athlète
 * consentant pour contourner le refus d'un autre.
 *
 * La règle « est le coach de » n'est pas réécrite ici. On appelle
 * `is_coach_of()` avec le jeton de l'appelant, donc sous ses propres droits :
 * la seule définition de la relation coach/athlète reste celle du schéma, et
 * c'est elle qui sert déjà aux politiques RLS.
 */
export async function canActForAthlete(user: AuthedUser, athleteId: string): Promise<boolean> {
  if (athleteId === user.id) return true;

  const asCaller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${user.token}` } } },
  );

  const { data, error } = await asCaller.rpc("is_coach_of", { athlete_uuid: athleteId });
  if (error) {
    // Un identifiant malformé ou une panne de lecture ne vaut pas autorisation.
    console.error("is_coach_of:", error.message);
    return false;
  }
  return data === true;
}

/**
 * Vrai si l'utilisateur a accordé une finalité de consentement donnée.
 *
 * Utilisé pour refuser le traitement par IA aux utilisateurs qui l'ont refusé :
 * le consentement doit avoir un effet réel côté serveur, sinon la case cochée
 * dans l'interface n'est qu'un décor.
 */
export async function hasConsent(userId: string, purpose: string): Promise<boolean> {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data } = await admin
    .from("current_consents")
    .select("granted")
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .maybeSingle();

  return !!data?.granted;
}
