import { C, alpha } from "@/lib/theme";
import { CARD, KICKER, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { RACE_FORMAT_LABEL, raceFormat, type RaceFormat } from "@/lib/hyrox/categories";
import { raceShortName } from "@/lib/hyrox/raceEvolution";
import type { SegmentGapRow } from "@/lib/hyrox/objective/seasonView";
import type { ObjectiveState } from "@/lib/hyrox/objective/vsObjective";
import { ddmm, fmtGap } from "@/features/shared/components/hyrox/raceAnalysisShared";

/**
 * Carte de chaleur coach « Évolution » (Q8, docs/HYROX_OBJECTIF_CONCEPTION.md) :
 * une ligne par station, runs et Roxzone, une colonne par course ; chaque case
 * = écart en secondes à l'objectif de la course (vert en avance, orange en
 * retard). À droite : ce qui a progressé et ce qui stagne, en secondes,
 * entre le premier et le dernier écart connus.
 */

const FORMAT_COLOR: Record<RaceFormat, string> = { solo: C.tx2, duo: C.b, relais: C.ame };
/** Variation d'écart (s) au-delà de laquelle une ligne a bougé. */
const MOVE_S = 5;

function cellStyle(s: ObjectiveState | null) {
  if (s == null) return { background: alpha(C.tx3, 0.08), color: C.tx3 };
  if (s === "ahead") return { background: alpha(C.g, 0.2), color: C.g };
  if (s === "behind" || s === "fast_start") return { background: alpha(C.o, 0.22), color: C.o };
  return { background: alpha(C.tx2, 0.12), color: C.tx2 };
}
const signed = (d: number) => (d === 0 ? "0" : `${d > 0 ? "+" : "−"}${Math.abs(d) >= 100 ? fmtGap(d) : Math.abs(d)}`);
const firstKnown = (r: SegmentGapRow) => r.deltas.find((d) => d != null) ?? null;
const lastKnown = (r: SegmentGapRow) => [...r.deltas].reverse().find((d) => d != null) ?? null;

export default function EvolutionHeatmap({ races, rows }: { races: HyroxResult[]; rows: SegmentGapRow[] }) {
  const cols = `minmax(130px, 170px) repeat(${races.length}, minmax(64px, 1fr)) 84px`;
  const up = rows.filter((r) => r.changeS != null && r.changeS <= -MOVE_S).sort((a, b) => a.changeS! - b.changeS!);
  const flat = rows.filter((r) => r.changeS != null && r.changeS > -MOVE_S && (lastKnown(r) ?? 0) > 0).sort((a, b) => b.changeS! - a.changeS!);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 14, alignItems: "start" }}>
      <div style={{ ...CARD, padding: "14px 16px", overflowX: "auto", gridColumn: "span 2", minWidth: 0 }}>
        <div role="table" aria-label="Écart à l'objectif par course, en secondes" style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 140 + races.length * 70 + 90 }}>
          <div role="row" style={{ display: "grid", gridTemplateColumns: cols, gap: 5, alignItems: "end" }}>
            <span />
            {races.map((r) => (
              <span role="columnheader" key={r.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, paddingBottom: 4, minWidth: 0 }}>
                <span style={{ ...MONO, fontSize: 11.5, color: C.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{raceShortName(r)}</span>
                <span style={{ ...MONO, fontSize: 11, color: FORMAT_COLOR[raceFormat(r)] }}>{ddmm(r.date)} · {RACE_FORMAT_LABEL[raceFormat(r)]}</span>
              </span>
            ))}
            <span role="columnheader" style={{ ...LABEL, textAlign: "right" }}>Évolution</span>
          </div>
          {rows.map((row) => (
            <div role="row" key={row.key} style={{ display: "grid", gridTemplateColumns: cols, gap: 5, alignItems: "center" }}>
              <span role="rowheader" style={{ fontSize: 13, color: C.tx, fontWeight: row.key === "total" ? 500 : 400 }}>{row.label}</span>
              {row.deltas.map((d, i) => (
                <span role="cell" key={races[i].id} style={{ ...MONO, ...cellStyle(row.states[i]), height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
                  {d != null ? signed(d) : "—"}
                </span>
              ))}
              <span role="cell" style={{ ...MONO, fontSize: 12.5, textAlign: "right", color: row.changeS == null ? C.tx3 : row.changeS <= -MOVE_S ? C.g : row.changeS >= MOVE_S ? C.o : C.tx2 }}>
                {row.changeS == null ? "—" : `${signed(row.changeS)}${Math.abs(row.changeS) < 100 ? " s" : ""}`}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ ...CARD, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 9 }}>
          <span style={{ ...KICKER, color: C.g }}>Ce qui a progressé</span>
          {up.length ? up.slice(0, 4).map((r) => (
            <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
              <span>{r.label}</span><span style={{ ...MONO, color: C.g }}>{signed(firstKnown(r)!)} → {signed(lastKnown(r)!)}</span>
            </div>
          )) : <span style={{ fontSize: 12.5, color: C.tx3 }}>Pas encore assez de courses comparables.</span>}
        </div>
        <div style={{ ...CARD, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 9 }}>
          <span style={{ ...KICKER, color: C.o }}>Ce qui stagne</span>
          {flat.length ? flat.slice(0, 3).map((r) => (
            <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
              <span>{r.label}</span><span style={{ ...MONO, color: C.o }}>{signed(firstKnown(r)!)} → {signed(lastKnown(r)!)}</span>
            </div>
          )) : <span style={{ fontSize: 12.5, color: C.tx3 }}>Rien : tout progresse ou est en avance.</span>}
        </div>
      </div>
    </div>
  );
}
