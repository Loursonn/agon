/**
 * Dépendances réelles du traitement de l'inbox Garmin, communes au webhook et
 * au cron `provider-garmin-maintenance` : base service_role (avec Storage),
 * téléchargement des fichiers .FIT avec le jeton
 * d'accès de l'utilisateur (rafraîchi si besoin).
 */
import { garminFromEnv } from "./garminConfig.ts";
import { type Db, freshAccessToken } from "./oauth.ts";
import { activityFileDownloader, type IngestDeps } from "./providers/garminIngest.ts";

export function garminIngestDeps(admin: Db): IngestDeps {
  const adapter = garminFromEnv();
  return {
    db: admin,
    downloadActivityFile: adapter
      ? activityFileDownloader({
        fetchImpl: fetch,
        accessToken: (connectionId) => freshAccessToken(admin, adapter, connectionId),
      })
      : undefined,
  };
}
