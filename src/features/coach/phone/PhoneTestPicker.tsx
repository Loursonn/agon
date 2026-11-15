import { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { TYPE_COLOR } from "@/lib/peps";
import { groupBankTests } from "@/lib/testBankGroups";
import { isPickableTest } from "@/features/shared/types/tests";
import { useTestDefinitions } from "@/features/shared/hooks/tests/useTestDefinitions";
import { BIO_TITLE } from "@/features/coach/components/planning/calendar/calendarConstants";
import { CARD, MONO, rowLine } from "./phoneUi";

/**
 * Choix d'un test sur téléphone (feuille « Ajouter » du planning) : recherche
 * puis liste rangée par dominante, comme la banque de la vue Mois.
 */
export function PhoneTestPicker({ coachId, pending, onPick }: {
  coachId: string;
  pending: boolean;
  onPick: (t: { title: string; type: string }) => void;
}) {
  const { data: defs = [], isLoading } = useTestDefinitions(coachId);
  const [search, setSearch] = useState("");
  const groups = useMemo(() => groupBankTests(defs.filter(isPickableTest), search), [defs, search]);
  const row = (key: string, label: string, i: number, onClick: () => void) => (
    <button key={key} type="button" disabled={pending} onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 44, padding: "10px 0", background: "none", border: "none",
      boxShadow: rowLine(i), color: C.tx, fontFamily: "inherit", fontSize: 14, textAlign: "left", cursor: "pointer",
    }}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: TYPE_COLOR.test, flex: "none" }} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontSize: 12, color: C.ac }}>Ajouter</span>
    </button>
  );
  const title = (label: string, n: number) => (
    <div style={{ ...MONO, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: C.tx3, margin: "4px 2px 2px" }}>
      {label} · {n}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un test, une dominante…"
        aria-label="Rechercher un test"
        style={{
          height: 44, padding: "0 12px", borderRadius: 10, border: `1px solid ${C.brdL}`, background: C.bg, color: C.tx,
          fontSize: 16, fontFamily: "inherit", width: "100%", boxSizing: "border-box",
        }}
      />
      {!search.trim() && (
        <>
          {title("Biométrie", 1)}
          <div style={{ ...CARD, padding: "2px 14px", background: C.bg }}>
            {row("bio", BIO_TITLE, 0, () => onPick({ title: BIO_TITLE, type: "biometric" }))}
          </div>
        </>
      )}
      {isLoading ? null : groups.length === 0 ? (
        <div style={{ fontSize: 13, color: C.tx2 }}>{search.trim() ? "Aucun test trouvé." : "Aucun test dans la banque."}</div>
      ) : groups.map((g) => (
        <div key={g.key}>
          {title(g.label, g.tests.length)}
          <div style={{ ...CARD, padding: "2px 14px", background: C.bg }}>
            {g.tests.map((t, i) => row(t.id, t.name, i, () => onPick({ title: t.name, type: "musculation" })))}
          </div>
        </div>
      ))}
    </div>
  );
}
