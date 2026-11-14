/** Détail d'une nouveauté : sections + points. */
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import type { ReleaseNote } from "@/data/releaseNotes";
import { ReleaseNoteResourceBox } from "./ReleaseNoteResourceBox";

export function ReleaseNoteContent({ note }: { note: ReleaseNote }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {note.sections.map(sec => (
        <div key={sec.title}>
          {/* Planche CoachOrdiBNouveautes : titre mono espacé, puces rondes or. */}
          <div style={{ ...MONO, fontSize: 11, color: C.tx2, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 7 }}>
            {sec.title}
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
            {sec.points.map(p => (
              <li key={p} style={{ display: "flex", gap: 10, fontSize: 13.5, color: C.tx2, lineHeight: 1.55 }}>
                <span aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: C.ac, flex: "none", marginTop: 8 }} />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {note.resources?.map(r => <ReleaseNoteResourceBox key={r.label} resource={r} />)}
    </div>
  );
}
