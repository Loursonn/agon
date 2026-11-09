/**
 * Dépendances réelles du traitement de l'inbox Garmin, communes au webhook et
 * au cron `provider-garmin-maintenance` : base service_role (avec Storage),
 * doublons inter-sources, téléchargement des fichiers .FIT avec le jeton
 * d'accès de l'utilisateur (rafraîchi si besoin).
 */
import { findCrossSourceDuplicate } from "./activityDedup.ts";
import { garminFromEnv } from "./garminConfig.ts";
import { type Db, freshAccessToken } from "./oauth.ts";
import { activityFileDownloader, type IngestDeps } from "./providers/garminIngest.ts";

export function garminIngestDeps(admin: Db): IngestDeps {
  const adapter = garminFromEnv();
  return {
    db: admin,
    findDuplicate: (_db, c) => findCrossSourceDuplicate(admin, c),
    downloadActivityFile: adapter
      ? activityFileDownloader({
        fetchImpl: fetch,
        accessToken: (connectionId) => freshAccessToken(admin, adapter, connectionId),
      })
      : undefined,
  };
}
