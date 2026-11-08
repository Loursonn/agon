import { useSyncExternalStore } from "react";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { C } from "@/lib/theme";
import { formatOfflineStamp, latestDataTimestamp } from "@/lib/offline/offlineCache";
import { pendingLabel, usePendingWrites } from "@/lib/offline/writes";

const subscribe = (cb: () => void) => onlineManager.subscribe(cb);
const isOnline = () => onlineManager.isOnline();

/**
 * Bandeau hors ligne.
 * - athlète : « Hors ligne — données du 08/11 14:32 · 2 saisies en attente d'envoi » ;
 * - coach : « Hors ligne : modifications désactivées — données du … » (les
 *   écritures coach ne sont pas gardées, elles échouent tout de suite) ;
 * - en ligne avec des saisies pas encore parties : « 2 saisies en attente d'envoi ».
 * Rien sinon. La date est celle de la donnée la plus récente du cache, à peu
 * près la dernière fois que l'app a eu du réseau.
 */
export default function OfflineBanner({ variant = "athlete" }: { variant?: "athlete" | "coach" }) {
  const online = useSyncExternalStore(subscribe, isOnline, () => true);
  const pending = usePendingWrites();
  const qc = useQueryClient();
  if (online && pending === 0) return null;

  let text: string;
  if (online) {
    text = pendingLabel(pending);
  } else {
    const ts = latestDataTimestamp(qc.getQueryCache().getAll());
    const head = variant === "coach" ? "Hors ligne : modifications désactivées" : "Hors ligne";
    text = head + (ts ? ` — données du ${formatOfflineStamp(ts)}` : "") + (pending > 0 ? ` · ${pendingLabel(pending)}` : "");
  }
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
      {text}
    </div>
  );
}
