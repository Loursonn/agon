/**
 * Badge du type de nouveauté : fonctionnalité (« NOUVEAUTÉ ») ou correctif.
 */
import { C } from "@/lib/theme";
import type { ReleaseNoteKind } from "@/data/releaseNotes";

const KIND: Record<ReleaseNoteKind, { label: string; bg: string }> = {
  feature: { label: "NOUVEAUTÉ", bg: C.ac },
  fix:     { label: "CORRECTIF", bg: C.b },
};

export function ReleaseNoteKindBadge({ kind }: { kind: ReleaseNoteKind }) {
  const k = KIND[kind];
  return (
    <span style={{ fontSize: 10, fontWeight: 800, color: "#0E0C0A", background: k.bg, borderRadius: 3, padding: "2px 6px" }}>
      {k.label}
    </span>
  );
}
