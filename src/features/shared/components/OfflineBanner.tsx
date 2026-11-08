import { useSyncExternalStore } from "react";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { C } from "@/lib/theme";
import { formatOfflineStamp, latestDataTimestamp } from "@/lib/offline/offlineCache";

const subscribe = (cb: () => void) => onlineManager.subscribe(cb);
const isOnline = () => onlineManager.isOnline();

/**
 * Bandeau « Hors ligne — données du 08/11 14:32 ».
 * Rien quand le réseau est là. La date est celle de la donnée la plus récente
 * du cache, c'est-à-dire, à peu près, la dernière fois que l'app a eu du réseau.
 */
export default function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, isOnline, () => true);
  const qc = useQueryClient();
  if (online) return null;
  const ts = latestDataTimestamp(qc.getQueryCache().getAll());
  return (
    <div
      role="status"
      style={{
        padding: "4px 16px",
        fontSize: 11,
        fontWeight: 600,
        textAlign: "center",
        background: C.oS,
        color: C.o,
        borderTop: "1px solid " + C.brd,
      }}
    >
      Hors ligne{ts ? ` — données du ${formatOfflineStamp(ts)}` : ""}
    </div>
  );
}
