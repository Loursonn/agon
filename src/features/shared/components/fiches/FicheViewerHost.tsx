/**
 * FicheViewerHost — affiche le viewer quand l'URL porte `?fiche=<docId>`.
 * Monté dans AthleteLayout (athlète) et AthleteViewPage (aperçu coach).
 */
import { useFicheViewer } from "@/features/shared/hooks/fiches/useFicheViewer";
import { useSearchParams } from "react-router-dom";
import { useIsWide } from "@/hooks/useIsWide";
import { FicheViewer } from "./FicheViewer";

export function FicheViewerHost({ athleteId, viewOnly }: { athleteId: string | null | undefined; viewOnly?: boolean }) {
  const { openDocId, close, swap } = useFicheViewer();
  const [params] = useSearchParams();
  const wide = useIsWide();
  if (!openDocId || !athleteId) return null;
  // Ordinateur, page Fiches : la fiche s'ouvre dans la page (AthleteFichesView)
  if (wide && params.get("vue") === "fiches") return null;
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
