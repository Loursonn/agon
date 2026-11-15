import { KICKER } from "@/features/shared/components/seance/seanceUi";
import { C } from "@/lib/theme";
import { hyroxPictoColor } from "@/features/shared/components/hyroxStation";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { raceShortName, timeSplit } from "@/lib/hyrox/raceEvolution";
import { compromisedFromTimes } from "@/lib/hyrox/raceWatch";
import type { RunLookup } from "@/lib/hyrox/runPacing";
import { formatMmSs } from "@/lib/time";

const BOX = { background: C.s1, borderRadius: 14, border: "1px solid " + C.brd, padding: "14px 16px", marginBottom: 16 } as const;
const ROX_THRESHOLD = 7;
const pctTxt = (p: number | null) => (p == null ? "—" : `${String(p).replace(".", ",")} %`);
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * « 02 — Où passe le temps » (planche HyroxAnaCoachEvolution) : part course /
 * stations / Roxzone de chaque course, puis la course compromise : écart
 * entre le plus rapide et le plus lent des runs 2 à 7 (le run 1 ne se compare
 * pas), face à l'écart habituel du niveau. Calculé sur les seuls temps.
 */
export default function EvolutionTimeSplit({ races, levelOf }: {
  races: HyroxResult[];
  /** Médianes des runs du niveau de chaque course (catégorie + tranche). */
  levelOf?: (r: HyroxResult) => RunLookup | null;
}) {
  const rows = races.map((r) => ({ r, s: timeSplit(r), c: compromisedFromTimes(r, levelOf?.(r) ?? null) }));
  const colors = { run: hyroxPictoColor("course"), stations: hyroxPictoColor("skierg"), roxzone: C.brdL };
  const roxAbove = rows.filter((x) => x.s.pct.roxzone != null && x.s.pct.roxzone > ROX_THRESHOLD).length;
  const withCost = rows.filter((x) => x.c != null);
  return (
    <>
      <div style={BOX}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <div style={{ ...KICKER, fontSize: 11, color: C.tx3 }}>Part course / stations / roxzone</div>
          <div style={{ display: "flex", gap: 12, fontSize: 10, color: C.tx3 }}>
            <span><span style={{ color: colors.run }}>■</span> Course</span>
            <span><span style={{ color: colors.stations }}>■</span> Stations</span>
            <span><span style={{ color: colors.roxzone }}>■</span> Roxzone</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map(({ r, s }) => {
            const parts = (["run", "stations", "roxzone"] as const).map((k) => ({ k, v: s[k], p: s.pct[k] }));
            const known = parts.every((x) => x.v != null);
            return (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: 11, color: C.tx }}>{r.event_name} <span style={{ color: C.tx3, fontFamily: "monospace" }}>{ddmm(r.date)}</span></div>
                {known ? (
                  <div>
                    <div style={{ display: "flex", height: 14, borderRadius: 4, overflow: "hidden", gap: 1 }}>
                      {parts.map((x) => <div key={x.k} style={{ flex: `${x.v} 0 0`, background: colors[x.k], minWidth: 4 }} />)}
                    </div>
                    <div style={{ display: "flex", gap: 1, marginTop: 3, fontSize: 10, color: C.tx2, fontFamily: "monospace" }}>
                      {parts.map((x) => (
                        <div key={x.k} style={{ flex: `${x.v} 0 0`, minWidth: 44, whiteSpace: "nowrap", overflow: "hidden" }}>
                          {formatMmSs(x.v)}{x.k !== "roxzone" ? ` · ${pctTxt(x.p)}` : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : <div style={{ fontSize: 11, color: C.tx3 }}>— temps incomplets</div>}
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: C.tx3, marginTop: 10 }}>
          Roxzone au-dessus du seuil de {ROX_THRESHOLD} % du chrono sur {roxAbove} course{roxAbove > 1 ? "s" : ""} sur {rows.length}.
          {" "}Dernière : {pctTxt(rows[rows.length - 1]?.s.pct.roxzone ?? null)}.
        </div>
      </div>

      {withCost.length > 0 && (
        <div style={BOX}>
          <div style={{ ...KICKER, fontSize: 11, color: C.tx3 }}>Coût de la course compromise</div>
          <div style={{ fontSize: 10, color: C.tx3, marginBottom: 10 }}>Écart entre le run le plus rapide et le plus lent des runs 2 à 7 (habituel du niveau entre parenthèses)</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${withCost.length}, minmax(0, 1fr))`, gap: 10 }}>
            {withCost.map(({ r, c }) => (
              <div key={r.id}>
                <div style={{ fontSize: 10, color: C.tx3 }}>{raceShortName(r)}</div>
                <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace", color: c!.usualSpreadS != null && c!.spreadS - c!.usualSpreadS >= 10 ? C.o : C.tx }}>
                  {c!.spreadS} s/km{c!.usualSpreadS != null && <span style={{ fontSize: 11, fontWeight: 400, color: C.tx3 }}> ({c!.usualSpreadS})</span>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: C.tx3, marginTop: 8 }}>Calcul Agon sur les temps des runs (un run = 1 km), sans montre.</div>
        </div>
      )}
    </>
  );
}
