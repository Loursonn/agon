import { useSyncExternalStore, type ReactNode } from "react";
import { IsRestoringProvider, QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { PersistenceController } from "@/lib/offline/persistenceController";

/**
 * `QueryClientProvider` + restauration du cache hors ligne.
 *
 * Tant que le cache de l'utilisateur est relu depuis IndexedDB, les `useQuery`
 * ne partent pas (`IsRestoringProvider`) : sans ça, hors ligne, une requête
 * partirait, échouerait, et l'écran afficherait une erreur au lieu des données
 * gardées. Contrairement à `PersistQueryClientProvider`, le changement
 * d'utilisateur ne remonte pas l'arbre (connexion, changement de compte).
 */
export function OfflineQueryProvider({
  client,
  persistence,
  children,
}: {
  client: QueryClient;
  persistence: PersistenceController;
  children: ReactNode;
}) {
  const isRestoring = useSyncExternalStore(persistence.subscribeRestoring, persistence.isRestoring);
  return (
    <QueryClientProvider client={client}>
      <IsRestoringProvider value={isRestoring}>{children}</IsRestoringProvider>
    </QueryClientProvider>
  );
}
