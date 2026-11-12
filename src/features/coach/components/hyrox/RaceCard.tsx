import { C } from "@/lib/theme";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import { TYPE_COLOR } from "@/lib/peps";
import { formatMmSs } from "@/lib/time";
import { runTotal, stationsTotal, roxzoneTotal } from "@/lib/hyrox/calc";
import { DIVISION_LABEL } from "@/features/shared/types/hyrox";
import type { HyroxResult } from "@/features/shared/types/hyrox";

/** Une course HYROX en carte (maquette « HYROX athlète · courses ») : téléphone. */
export function RaceCard({
  race,
  isRecord,
  checked,
  onToggle,
  onOpen,
}: {
  race: HyroxResult;
  isRecord: boolean;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const color = race.is_official ? TYPE_COLOR.competition : TYPE_COLOR.hyrox;
  const [y, m, d] = (race.date ?? "").split("-");
  const stat = (label: string, value: string, col: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span style={{ ...MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: C.tx3 }}>{label}</span>
      <span style={{ ...MONO, fontSize: 13.5, color: col }}>{value}</span>
    </div>
  );
  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 14, border: `1px solid ${checked ? C.ac : color + "59"}`, background: `${color}14` }}>
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: color }} />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 12px 10px 15px" }}>
        <label style={{ display: "flex", paddingTop: 2, cursor: "pointer" }} title="Cocher pour comparer">
          <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Comparer ${race.event_name}`} style={{ width: 18, height: 18, accentColor: C.ac, cursor: "pointer" }} />
        </label>
        <button type="button" onClick={onOpen} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
          <span style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ ...DISPLAY, fontSize: 16, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{race.event_name}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ ...MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: C.bg, background: color, borderRadius: 999, padding: "2px 7px" }}>
                  {race.is_official ? "Compétition" : "Simulation"}
                </span>
                <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{d && m && y ? `${d}/${m}/${y}` : race.date}</span>
                <span style={{ fontSize: 11, color: C.tx3 }}>{DIVISION_LABEL[race.division as keyof typeof DIVISION_LABEL] ?? race.division}</span>
              </span>
            </span>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <span style={{ ...MONO, fontSize: 20, color: C.tx }}>{formatMmSs(race.total_s, { hours: true })}</span>
              {isRecord && <span style={{ ...MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: C.bg, background: C.ac, borderRadius: 999, padding: "2px 7px" }}>Record</span>}
            </span>
          </span>
          <span style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, paddingTop: 8, borderTop: `1px solid ${C.brd}` }}>
            {stat("Course", formatMmSs(runTotal(race)), C.b)}
            {stat("Stations", formatMmSs(stationsTotal(race)), C.ac)}
            {stat("Roxzone", formatMmSs(roxzoneTotal(race)), C.tx2)}
            {stat("Rang", race.rank_overall ? `${race.rank_overall}/${race.participants_overall ?? "?"}` : "—", C.tx2)}
          </span>
        </button>
      </div>
    </div>
  );
}
