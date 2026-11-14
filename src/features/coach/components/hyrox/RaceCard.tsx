import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { TYPE_COLOR } from "@/lib/peps";
import { formatMmSs } from "@/lib/time";
import { runTotal, stationsTotal, roxzoneTotal } from "@/lib/hyrox/calc";
import type { HyroxResult } from "@/features/shared/types/hyrox";

/** Une course HYROX en ligne de liste (planche « HYROX athlète · courses ») : téléphone. */
export function RaceCard({
  race,
  isRecord,
  checked,
  onToggle,
  onOpen,
  last,
}: {
  race: HyroxResult;
  isRecord: boolean;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
  last?: boolean;
}) {
  const color = race.is_official ? TYPE_COLOR.competition : TYPE_COLOR.hyrox;
  const [y, m, d] = (race.date ?? "").split("-");
  const stat = (label: string, value: string, col: string, right?: boolean) => (
    <span style={{ display: "block", textAlign: right ? "right" : "left", minWidth: 0 }}>
      <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: C.tx3 }}>{label}</span>
      <span style={{ ...MONO, display: "block", fontSize: 13, color: col, marginTop: 2 }}>{value}</span>
    </span>
  );
  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, borderBottom: last ? "none" : `1px solid ${C.brd}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={`Comparer ${race.event_name}`}
          title="Cocher pour comparer"
          onClick={onToggle}
          style={{
            width: 18, height: 18, flex: "none", boxSizing: "border-box", borderRadius: 5, padding: 0, cursor: "pointer",
            background: checked ? C.ac : "transparent", border: checked ? "none" : `1.5px solid ${C.tx3}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {checked && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="2.4" strokeLinecap="square"><path d="M4 12.5L9.5 18L20 6" /></svg>
          )}
        </button>
        <button type="button" onClick={onOpen} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-start", gap: 12, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: C.tx }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14, fontWeight: 500, lineHeight: "18px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{race.event_name}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span style={{ ...MONO, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap", flex: "none", color: C.ink, background: color, borderRadius: 999, padding: "2px 8px" }}>
                {race.is_official ? "Compétition" : "Simulation"}
              </span>
              <span style={{ ...MONO, fontSize: 11, color: C.tx3, whiteSpace: "nowrap" }}>{d && m && y ? `${d}/${m}/${y}` : race.date}</span>
            </span>
          </span>
          <span style={{ display: "block", textAlign: "right" }}>
            <span style={{ ...MONO, display: "block", fontSize: 16, lineHeight: "18px", whiteSpace: "nowrap" }}>{formatMmSs(race.total_s, { hours: true })}</span>
            {isRecord && <span style={{ ...MONO, display: "block", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.g, marginTop: 2 }}>Record</span>}
          </span>
        </button>
      </div>
      <button type="button" onClick={onOpen} style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", background: "none", border: "none", padding: 0, marginLeft: 30, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
        {stat("Course", formatMmSs(runTotal(race)), C.b)}
        {stat("Stations", formatMmSs(stationsTotal(race)), C.o)}
        {stat("Roxzone", formatMmSs(roxzoneTotal(race)), C.tx2)}
        {stat("Rang", race.rank_overall ? `${race.rank_overall}/${race.participants_overall ?? "?"}` : "—", C.tx2, true)}
      </button>
    </div>
  );
}
