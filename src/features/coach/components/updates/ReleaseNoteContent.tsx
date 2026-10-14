/** Détail d'une nouveauté : sections + points. */
import { C } from "@/lib/theme";
import type { ReleaseNote } from "@/data/releaseNotes";

export function ReleaseNoteContent({ note }: { note: ReleaseNote }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {note.sections.map(sec => (
        <div key={sec.title}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
            {sec.title}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
            {sec.points.map(p => (
              <li key={p} style={{ fontSize: 13, color: C.tx2, lineHeight: 1.5 }}>{p}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
