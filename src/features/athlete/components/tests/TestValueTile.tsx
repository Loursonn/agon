import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { TYPE_COLOR, ROUGE } from "@/lib/peps";
import { TestGroupIcon } from "./TestGroupIcon";
import { displayUnit, fmtTestDate, formatTestDelta, formatTestValue, type TestValueCard } from "@/lib/athleteTestValues";


/** Une valeur de test (maquette « Tests athlète ») : nom, dernière valeur, date, écart. */
export function TestValueTile({ card, color, onOpen, variant = "tile", selected = false }: {
  card: TestValueCard; color: string; onOpen: () => void;
  /** « row » : ligne de liste sur ordinateur (planche AthOrdiBTests). */
  variant?: "tile" | "row"; selected?: boolean;
}) {
  const deltaBg = card.improved === true ? TYPE_COLOR.fait : card.improved === false ? ROUGE : C.s2;
  const deltaTx = card.improved == null ? C.tx2 : C.bg;
  const delta = card.delta != null && (
    <span style={{ ...MONO, fontSize: 11, color: deltaTx, background: deltaBg, fontWeight: 500, whiteSpace: "nowrap", borderRadius: 999, padding: "3px 9px" }}>
      {formatTestDelta(card.delta, card.valueType)}
    </span>
  );
  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-pressed={selected}
        style={{
          position: "relative", overflow: "hidden", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: C.tx,
          borderRadius: 12, border: `1px solid ${selected ? color : C.brd}`, background: selected ? `linear-gradient(160deg, ${color}29, ${color}0F), ${C.s1}` : C.s1,
          padding: "10px 14px 10px 16px", display: "flex", alignItems: "center", gap: 12, minWidth: 0, width: "100%",
        }}
      >
        <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: color }} />
        <TestGroupIcon group={card.group} color={color} testName={card.testName} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.title}</span>
          <span style={{ display: "block", fontSize: 11.5, color: C.tx3, marginTop: 2 }}>{fmtTestDate(card.latest.date)}</span>
        </span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 4, whiteSpace: "nowrap" }}>
          <span style={{ ...MONO, fontSize: 20, color }}>{formatTestValue(card.latest.value, card.valueType)}</span>
          <span style={{ ...MONO, fontSize: 11, color: C.tx2 }}>{displayUnit(card.unit, card.valueType)}</span>
        </span>
        <span style={{ width: 64, display: "flex", justifyContent: "flex-end" }}>{delta}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        position: "relative", overflow: "hidden", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
        borderRadius: 14, border: `1px solid ${color}73`, background: `linear-gradient(160deg, ${color}29, ${color}0F), ${C.s1}`,
        padding: "12px 12px 10px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0,
      }}
    >
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: color }} />
      <svg aria-hidden style={{ position: "absolute", right: 10, top: 13 }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.tx3} strokeWidth="1.8" strokeLinecap="square"><path d="M9 5L16 12L9 19" /></svg>
      <span style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 14, minWidth: 0 }}>
        <TestGroupIcon group={card.group} color={color} testName={card.testName} />
        <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.tx2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {card.title}
        </span>
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
        <span style={{ ...MONO, fontSize: 34, lineHeight: 1, color }}>{formatTestValue(card.latest.value, card.valueType)}</span>
        <span style={{ ...MONO, fontSize: 11, color: C.tx2 }}>{displayUnit(card.unit, card.valueType)}</span>
      </span>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontSize: 11, color: C.tx3 }}>{fmtTestDate(card.latest.date)}</span>
        {delta}
      </span>
    </button>
  );
}
