import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { TestGroupIcon } from "./TestGroupIcon";
import { displayUnit, fmtTestDate, formatTestDelta, formatTestValue, type TestValueCard } from "@/lib/athleteTestValues";


/** Une valeur de test (maquette « Tests athlète ») : nom, dernière valeur, date, écart. */
export function TestValueTile({ card, color, onOpen, variant = "tile", selected = false }: {
  card: TestValueCard; color: string; onOpen: () => void;
  /** « row » : ligne de liste sur ordinateur (planche AthOrdiBTests). */
  variant?: "tile" | "row"; selected?: boolean;
}) {
  const deltaTone = card.improved === true ? "bg-agon-type-fait text-agon-ink" : card.improved === false ? "bg-agon-rouge text-agon-ink" : "bg-agon-s2 text-agon-tx2";
  const delta = card.delta != null && (
    <span className={cn("agon-mono whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] font-medium", deltaTone)}>
      {formatTestDelta(card.delta, card.valueType)}
    </span>
  );
  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-pressed={selected}
        className={cn(
          "relative flex w-full min-w-0 cursor-pointer items-center gap-3 overflow-hidden rounded-xl border py-2.5 pl-4 pr-3.5 text-left font-[inherit] text-agon-tx",
          !selected && "border-agon-brd bg-agon-s1",
        )}
        style={selected ? { borderColor: color, background: `linear-gradient(160deg, ${color}29, ${color}0F), var(--agon-s1)` } : undefined}
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
        <TestGroupIcon group={card.group} color={color} testName={card.testName} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">{card.title}</span>
          <span className="mt-0.5 block text-[11.5px] text-agon-tx3">{fmtTestDate(card.latest.date)}</span>
        </span>
        <span className="flex items-baseline gap-1 whitespace-nowrap">
          <span className="agon-mono text-[20px]" style={{ color }}>{formatTestValue(card.latest.value, card.valueType)}</span>
          <span className="agon-mono text-[11px] text-agon-tx2">{displayUnit(card.unit, card.valueType)}</span>
        </span>
        <span className="flex w-16 justify-end">{delta}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative flex min-w-0 cursor-pointer flex-col gap-2 overflow-hidden rounded-[14px] border px-3 pb-2.5 pt-3 text-left font-[inherit]"
      style={{ borderColor: `${color}73`, background: `linear-gradient(160deg, ${color}29, ${color}0F), var(--agon-s1)` }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
      <svg aria-hidden className="absolute right-2.5 top-[13px]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.tx3} strokeWidth="1.8" strokeLinecap="square"><path d="M9 5L16 12L9 19" /></svg>
      <span className="flex min-w-0 items-center gap-2 pr-3.5">
        <TestGroupIcon group={card.group} color={color} testName={card.testName} />
        <span className="agon-mono truncate text-[10px] uppercase tracking-[0.08em] text-agon-tx2">
          {card.title}
        </span>
      </span>
      <span className="flex min-w-0 items-baseline gap-[5px]">
        <span className="agon-mono text-[34px] leading-none" style={{ color }}>{formatTestValue(card.latest.value, card.valueType)}</span>
        <span className="agon-mono text-[11px] text-agon-tx2">{displayUnit(card.unit, card.valueType)}</span>
      </span>
      <span className="flex items-center justify-between gap-1.5">
        <span className="text-[11px] text-agon-tx3">{fmtTestDate(card.latest.date)}</span>
        {delta}
      </span>
    </button>
  );
}
