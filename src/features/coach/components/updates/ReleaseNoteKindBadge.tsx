/**
 * Badge du type de nouveauté : fonctionnalité (« Nouveauté ») ou correctif.
 */
import { C } from "@/lib/theme";
import type { ReleaseNoteKind } from "@/data/releaseNotes";

const KIND: Record<ReleaseNoteKind, { label: string; bg: string }> = {
  feature: { label: "Nouveauté", bg: C.ac },
  fix:     { label: "Correctif", bg: C.b },
};

export function ReleaseNoteKindBadge({ kind }: { kind: ReleaseNoteKind }) {
  const k = KIND[kind];
  return (
    <span style={{ fontSize: 10, fontWeight: 800, color: C.ink, background: k.bg, borderRadius: 3, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 6px" }}>
      {k.label}
    </span>
  );
}
