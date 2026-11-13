/**
 * Purge des fichiers d'un utilisateur dans Storage (droit à l'effacement).
 *
 * Les cascades SQL ne touchent pas `storage.objects` : sans cette étape, les
 * pièces jointes médicales, fiches et photos de tests survivent au compte.
 * La liste exacte vient de la base (`list_user_storage_objects`, réservée au
 * service_role) ; la suppression passe par l'API Storage, seule voie qui
 * retire aussi le fichier du bucket.
 *
 * Utilisée par `delete-account` (compte supprimé par l'utilisateur) et
 * `pending-athlete` (athlète pré-créé supprimé par son coach : avant, ses
 * fiches personnalisées restaient dans `docs`).
 */

/** Buckets susceptibles de contenir des fichiers rattachés à un utilisateur. */
export const USER_BUCKETS = ["medical", "test-files", "garmin-screenshots", "test-media", "avatars", "docs", "provider-raw", "energy-exercise-photos"];

/** Le strict nécessaire du client service_role (testable sans supabase-js). */
export interface StorageAdmin {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
}

/**
 * Supprime tous les fichiers de `userId` ; renvoie les erreurs (bucket :
 * message) sans lever : un fichier récalcitrant ne doit pas bloquer
 * l'effacement du compte, il est signalé.
 */
export async function purgeUserStorage(admin: StorageAdmin, userId: string): Promise<string[]> {
  const errors: string[] = [];
  const { data: objects, error: listError } = await admin.rpc("list_user_storage_objects", { target_user: userId });
  if (listError) return [`liste des fichiers: ${listError.message}`];

  const byBucket = new Map<string, string[]>();
  for (const o of (objects ?? []) as Array<{ bucket_id: string; object_name: string }>) {
    if (!USER_BUCKETS.includes(o.bucket_id)) continue;
    const list = byBucket.get(o.bucket_id) ?? [];
    list.push(o.object_name);
    byBucket.set(o.bucket_id, list);
  }

  for (const [bucket, names] of byBucket) {
    // L'API Storage limite la taille des lots : on découpe.
    for (let i = 0; i < names.length; i += 100) {
      const { error } = await admin.storage.from(bucket).remove(names.slice(i, i + 100));
      if (error) errors.push(`${bucket}: ${error.message}`);
    }
  }
  return errors;
}
