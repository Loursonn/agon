import { C } from "@/lib/theme";
import type { RunMatch } from "@/lib/watchRunMatching";
import { watchRunText } from "@/lib/watchRunLabel";

/**
 * Pastille posée sur une séance prévue quand une sortie de montre s'y rattache.
 *
 * Elle renvoie à la sortie, elle ne la remplace pas : la séance garde son statut
 * et ses blocs, la sortie reste dans son propre cadre (décision « deux blocs
 * séparés », assouplie le 2026-11).
 */
export function WatchRunTag({ match, size = 10 }: { match: RunMatch | null | undefined; size?: number }) {
  if (!match) return null;
  return (
    <span
      title="Sortie enregistrée par la montre ou importée, rattachée à cette séance (même jour, même sport)"
      style={{
        fontSize: size, fontWeight: 600, padding: "1px 6px", borderRadius: 4,
        background: C.g + "20", color: C.g, whiteSpace: "nowrap", flexShrink: 0,
      }}
    >
      {watchRunText(match)}
    </span>
  );
}
