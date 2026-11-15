import { C, alpha } from "@/lib/theme";
import { CARD, KICKER, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import type { RefLookup } from "@/lib/hyrox/calc";
import { CATEGORY_LABEL, categoryOptions, crossFormatNote, type ReferenceCategory } from "@/lib/hyrox/categories";
import { equivalences } from "@/lib/hyrox/categoryEquivalence";
import { fmtClock } from "@/lib/seance";

/**
 * « Comparer à une autre catégorie » (décision d'Hugo, 15/11/2026) : le
 * sélecteur change les médianes et positions de toute l'analyse ; la carte
 * traduit le chrono au même rang dans les autres catégories du même sexe et
 * mixtes. Toutes les valeurs viennent des références HYROX (pyrox S7-S9).
 */
export default function RaceCategoryCard({ totalS, own, value, onChange, refs }: {
  totalS: number;
  own: ReferenceCategory;
  value: ReferenceCategory;
  onChange: (c: ReferenceCategory) => void;
  refs: RefLookup;
}) {
  const rows = equivalences(totalS, own, refs);
  const note = crossFormatNote(own, value);
  const pct = rows[0]?.pct ?? null;
  return (
    <section style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 12 }} aria-label="Comparer à une autre catégorie">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={KICKER}>Comparer à la catégorie</span>
        <select value={value} onChange={(e) => onChange(e.target.value as ReferenceCategory)} aria-label="Catégorie de comparaison"
          style={{ height: 32, padding: "0 10px", borderRadius: 8, border: `1px solid ${value === own ? C.brdL : C.ac}`, background: C.s2, color: C.tx, fontFamily: "inherit", fontSize: 12.5 }}>
          {categoryOptions(own).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}{c === own ? " (sa catégorie)" : ""}</option>)}
        </select>
      </div>
      {note && <div style={{ fontSize: 12, color: C.o, lineHeight: 1.45, padding: "8px 10px", borderRadius: 8, background: alpha(C.o, 0.1) }}>{note}</div>}
      {rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.tx2 }}>
            Le même rang{pct != null ? ` (top ${pct} % ${CATEGORY_LABEL[own].toLowerCase()})` : ""} vaudrait :
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
            {rows.map((r) => (
              <button key={r.category} type="button" onClick={() => onChange(r.category)} aria-pressed={value === r.category}
                style={{
                  display: "flex", flexDirection: "column", gap: 3, textAlign: "left", padding: "8px 10px", borderRadius: 10, cursor: "pointer",
                  border: `1px solid ${value === r.category ? C.ac : C.brd}`, background: value === r.category ? alpha(C.ac, 0.1) : "transparent", color: C.tx,
                }}>
                <span style={{ ...LABEL, fontSize: 9.5 }}>{r.label}</span>
                <span style={{ ...MONO, fontSize: 17 }}>{fmtClock(r.timeS)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
