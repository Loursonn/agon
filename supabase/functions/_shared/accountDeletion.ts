import { purgeUserStorage, type StorageAdmin } from "./userStorage.ts";

/**
 * Suppression définitive d'un compte (droit à l'effacement, art. 17 RGPD).
 *
 * Une seule implémentation pour :
 *   - `delete-account` : la personne supprime son propre compte ;
 *   - `account-retention` : purge des comptes pré-créés jamais réclamés et des
 *     comptes inactifs (art. 5.1.e, limitation de la conservation).
 *
 * Ordre des opérations, et pourquoi :
 *
 *   1. Journal anonyme écrit en PREMIER. Si l'étape suivante échoue, on garde
 *      une trace de la tentative ; si on l'écrivait en dernier, une
 *      interruption laisserait un compte supprimé sans trace.
 *   2. Fichiers de stockage. Les cascades SQL ne couvrent pas `storage.objects`,
 *      donc sans cette étape fiches et photos survivraient au compte.
 *   3. Jetons des services connectés, révoqués auprès du fournisseur avant
 *      d'être effacés. Effacer un jeton sans le révoquer laisse un accès actif
 *      côté Garmin ou COROS.
 *   4. Utilisateur auth. La contrainte `profiles_id_fkey ON DELETE CASCADE`
 *      propage alors l'effacement aux tables applicatives.
 */

export type DeletionOrigin = "user" | "admin" | "retention";

type DbError = { message: string; code?: string } | null;
type Res<T = unknown> = PromiseLike<{ data: T; error: DbError }>;
interface Filter<T = unknown> extends Res<T> {
  eq(column: string, value: unknown): Filter<T>;
  maybeSingle(): Res<T>;
}

/** Le strict nécessaire du client service_role (testable sans supabase-js). */
export interface DeletionAdmin extends StorageAdmin {
  from(table: string): {
    select(columns: string): Filter;
    insert(row: Record<string, unknown>): Res;
    delete(): Filter;
  };
  functions: {
    invoke(name: string, options: { body: unknown }): PromiseLike<{ error: { message: string } | null }>;
  };
  auth: {
    admin: {
      deleteUser(id: string): PromiseLike<{ error: { message: string } | null }>;
    };
  };
}

function errMessage(err: unknown, fallback = "Erreur"): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err.trim() || fallback;
  return fallback;
}

/**
 * Supprime le compte `userId`. Lève si le compte auth n'a pas pu être
 * supprimé ; renvoie les avertissements (fichier récalcitrant, fournisseur
 * injoignable) sans échouer : le compte est bien parti.
 */
export async function deleteAccount(
  admin: DeletionAdmin,
  userId: string,
  initiatedBy: DeletionOrigin,
): Promise<{ warnings: string[] }> {
  // ---- 1. Journal anonyme -------------------------------------------------
  const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  const { data: coreConsent } = await admin
    .from("current_consents")
    .select("granted, doc_version")
    .eq("user_id", userId)
    .eq("purpose", "health_data")
    .maybeSingle();

  const p = profile as { role?: string } | null;
  const c = coreConsent as { granted?: boolean; doc_version?: string } | null;
  await admin.from("account_deletions").insert({
    role: p?.role ?? null,
    consent_version: c?.doc_version ?? null,
    had_core_consent: c?.granted ?? false,
    initiated_by: initiatedBy,
  });

  // ---- 2. Fichiers --------------------------------------------------------
  // Liste exacte demandée à la base (les conventions de chemin ont varié
  // selon les fonctionnalités) : voir `userStorage.ts`.
  const storageErrors = await purgeUserStorage(admin, userId);

  // ---- 3. Services connectés ---------------------------------------------
  /*
    Révocation auprès du fournisseur avant effacement local. Tolérant à
    l'échec : si Garmin est injoignable, on ne refuse pas pour autant la
    suppression — le droit de la personne ne dépend pas de la disponibilité
    d'un tiers. Le jeton local part dans tous les cas, et sa durée de vie
    limitée clôt l'accès résiduel.
  */
  const revocationErrors: string[] = [];
  // `athlete_id`, et non `user_id` : la colonne porte ce nom dans
  // `provider_connections` (écrit `user_id`, la requête échouait en 42703 et
  // aucune révocation n'avait jamais lieu).
  const { data: connections, error: connError } = await admin
    .from("provider_connections")
    .select("provider, external_user_id")
    .eq("athlete_id", userId);

  // 42P01 : table absente (environnement sans l'intégration des montres).
  // Toute autre erreur est signalée : « aucune connexion » et « connexions
  // illisibles » ne doivent pas se confondre.
  if (connError && connError.code !== "42P01") {
    revocationErrors.push(`lecture des connexions: ${connError.message}`);
  }

  // `provider-disconnect` couvre COROS et Garmin : révocation chez le
  // fournisseur (Garmin : DELETE /user/registration, obligatoire en cas de
  // « Delete my account »), puis `provider_forget`.
  for (const conn of (connections ?? []) as Array<{ provider: string; external_user_id: string | null }>) {
    try {
      const { error } = await admin.functions.invoke("provider-disconnect", {
        body: { userId, provider: conn.provider, internal: true },
      });
      if (error) revocationErrors.push(`${conn.provider}: ${error.message}`);
    } catch (e) {
      revocationErrors.push(`${conn.provider}: ${errMessage(e)}`);
    }
    // Filet de sécurité : `provider_webhook_inbox` n'a pas de clé étrangère
    // vers l'athlète (Garmin ne connaît que son propre identifiant), la
    // cascade ne l'atteint pas.
    if (conn.external_user_id) {
      const { error: inboxError } = await admin
        .from("provider_webhook_inbox")
        .delete()
        .eq("provider", conn.provider)
        .eq("external_user_id", conn.external_user_id);
      if (inboxError && inboxError.code !== "42P01") {
        revocationErrors.push(`${conn.provider} (notifications en attente): ${inboxError.message}`);
      }
    }
  }

  // ---- 4. Compte auth ----------------------------------------------------
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) throw new Error(`Suppression impossible : ${deleteError.message}`);

  return { warnings: [...storageErrors, ...revocationErrors] };
}
