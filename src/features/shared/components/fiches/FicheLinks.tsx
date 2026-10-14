/**
 * FicheLinks — liens 📄 côté athlète (séance, bloc, séance énergie, carte du jour).
 * Résout la variante de la semaine, badge « Nouveau » si jamais ouverte,
 * clic = viewer plein écran (retour à l'écran d'origine).
 */
import { useMemo } from "react";
import { C } from "@/lib/theme";
import type { FicheAttachment } from "@/features/shared/types/fiches";
import { useAthleteDocs, useDocsByIds } from "@/features/shared/hooks/fiches/useDocs";
import { useFicheViewer } from "@/features/shared/hooks/fiches/useFicheViewer";
import { resolveFicheIds } from "@/features/shared/hooks/fiches/useHasUnseenFiche";
import { FicheChip } from "./FicheChip";

interface Props {
  attachments: FicheAttachment[] | null | undefined;
  week?: number;
  athleteId: string | null | undefined;
  compact?: boolean;
  /** Titre de section (ex. « Fiches de la séance ») */
  title?: string;
  /** Ouverture personnalisée (sinon viewer par query param) */
  onOpen?: (docId: string) => void;
}

export function FicheLinks({ attachments, week, athleteId, compact, title, onOpen }: Props) {
  const ids = useMemo(() => resolveFicheIds(attachments, week), [attachments, week]);
  const { data: docs = {} } = useDocsByIds(ids);
  const { data: mine } = useAthleteDocs(ids.length ? athleteId : null);
  const viewer = useFicheViewer();

  if (ids.length === 0) return null;
  const seen = new Map((mine?.assigned ?? []).map(a => [a.doc.id, !!a.seenAt]));
  // Fiches illisibles (retirées, autre athlète…) : masquées côté athlète
  const visible = ids.filter(id => docs[id]);
  if (visible.length === 0) return null;

  return (
    <div>
      {title && (
        <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
          {title}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {visible.map(id => (
          <FicheChip
            key={id}
            doc={docs[id]}
            compact={compact}
            isNew={seen.has(id) && !seen.get(id)}
            onClick={() => (onOpen ? onOpen(id) : viewer.open(id))}
          />
        ))}
      </div>
    </div>
  );
}
