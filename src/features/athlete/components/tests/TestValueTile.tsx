import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { TYPE_COLOR, ROUGE } from "@/lib/peps";
import { displayUnit, fmtTestDate, formatTestDelta, formatTestValue, type TestValueCard } from "@/lib/athleteTestValues";


/** Une valeur de test (maquette « Tests athlète ») : nom, dernière valeur, date, écart. */
export function TestValueTile({ card, color, onOpen }: { card: TestValueCard; color: string; onOpen: () => void }) {
  const deltaBg = card.improved === true ? TYPE_COLOR.fait : card.improved === false ? ROUGE : C.s2;
  const deltaTx = card.improved == null ? C.tx2 : C.bg;
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        position: "relative", overflow: "hidden", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
        borderRadius: 14, border: `1px solid ${color}73`, background: `linear-gradient(160deg, ${color}29, ${color}0F), ${C.s1}`,
        padding: "12px 12px 10px 14px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0,
      }}
    >
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: color }} />
      <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: C.tx2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {card.title}
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
        <span style={{ ...MONO, fontSize: 30, lineHeight: 1, color }}>{formatTestValue(card.latest.value, card.valueType)}</span>
        <span style={{ ...MONO, fontSize: 11, color: C.tx2 }}>{displayUnit(card.unit, card.valueType)}</span>
      </span>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontSize: 11, color: C.tx3 }}>{fmtTestDate(card.latest.date)}</span>
        {card.delta != null && (
          <span style={{ ...MONO, fontSize: 11, color: deltaTx, background: deltaBg, borderRadius: 999, padding: "3px 8px" }}>
            {formatTestDelta(card.delta, card.valueType)}
          </span>
        )}
      </span>
    </button>
  );
}
