/**
 * FicheViewerHost — affiche le viewer quand l'URL porte `?fiche=<docId>`.
 * Monté dans AthleteLayout (athlète) et AthleteViewPage (aperçu coach).
 */
import { useFicheViewer } from "@/features/shared/hooks/fiches/useFicheViewer";
import { FicheViewer } from "./FicheViewer";

export function FicheViewerHost({ athleteId, viewOnly }: { athleteId: string | null | undefined; viewOnly?: boolean }) {
  const { openDocId, close, swap } = useFicheViewer();
  if (!openDocId || !athleteId) return null;
  return (
    <FicheViewer
      key={openDocId}
      docId={openDocId}
      athleteId={athleteId}
      viewOnly={viewOnly}
      onClose={close}
      onSwapVariant={swap}
    />
  );
}
