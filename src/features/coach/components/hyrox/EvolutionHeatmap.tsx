import { C, alpha } from "@/lib/theme";
import { CARD, KICKER, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { POSITION_BRACKET, percentile, standing, type RefLookup } from "@/lib/hyrox/calc";
import { RACE_FORMAT_LABEL, raceCategory, raceFormat, type RaceFormat } from "@/lib/hyrox/categories";
import { raceShortName, type SegmentPosition } from "@/lib/hyrox/raceEvolution";
import { ddmm } from "@/features/shared/components/hyrox/raceAnalysisShared";

/**
 * Carte de chaleur des positions (planche « Coach · Évolution », validée par
 * Hugo le 15/11/2026) : une ligne par station, runs et Roxzone, une colonne
 * par course ; chaque case = top x % dans toute la catégorie de la course
 * (vert top 35 %, orange 35 % les plus lents). À droite : ce qui a progressé
 * et ce qui stagne, entre la première et la dernière position connues.
 */

const FORMAT_COLOR: Record<RaceFormat, string> = { solo: C.tx2, duo: C.b, relais: C.ame };
/** Écart de position (points) au-delà duquel une ligne a bougé. */
const MOVE_PTS = 5;

function cellStyle(pct: number | null) {
  const s = standing(pct);
  if (s == null) return { background: alpha(C.tx3, 0.08), color: C.tx3 };
  if (s === "fort") return { background: alpha(C.g, 0.2), color: C.g };
  if (s === "faible") return { background: alpha(C.o, 0.22), color: C.o };
  return { background: alpha(C.tx2, 0.12), color: C.tx2 };
}

export default function EvolutionHeatmap({ races, rows, refs }: { races: HyroxResult[]; rows: SegmentPosition[]; refs: RefLookup }) {
  const chrono: SegmentPosition = {
    key: "total", label: "Chrono", values: races.map((r) => r.total_s),
    pcts: races.map((r) => {
      const ref = refs(raceCategory(r), "total", POSITION_BRACKET);
      return ref ? percentile(r.total_s, ref) : null;
    }),
    latestPct: null, deltaPts: null,
  };
  const known = chrono.pcts.filter((p): p is number => p != null);
  chrono.deltaPts = known.length >= 2 ? known[known.length - 1] - known[0] : null;
  const all = [chrono, ...rows];
  const cols = `minmax(130px, 170px) repeat(${races.length}, minmax(64px, 1fr)) 84px`;
  const up = all.filter((r) => r.deltaPts != null && r.deltaPts <= -MOVE_PTS).sort((a, b) => a.deltaPts! - b.deltaPts!);
  const flat = all.filter((r) => r.deltaPts != null && r.deltaPts > -MOVE_PTS && standing(r.pcts[r.pcts.length - 1] ?? null) !== "fort")
    .sort((a, b) => b.deltaPts! - a.deltaPts!);
  const first = (r: SegmentPosition) => r.pcts.find((p) => p != null);
  const lastPct = (r: SegmentPosition) => [...r.pcts].reverse().find((p) => p != null);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 280px)", gap: 14, alignItems: "start" }}>
      <div style={{ ...CARD, padding: "14px 16px", overflowX: "auto" }}>
        <div role="table" aria-label="Position par course, top % de la catégorie" style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 140 + races.length * 70 + 90 }}>
          <div role="row" style={{ display: "grid", gridTemplateColumns: cols, gap: 5, alignItems: "end" }}>
            <span />
            {races.map((r) => (
              <span role="columnheader" key={r.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, paddingBottom: 4, minWidth: 0 }}>
                <span style={{ ...MONO, fontSize: 11.5, color: C.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{raceShortName(r)}</span>
                <span style={{ ...MONO, fontSize: 10.5, color: FORMAT_COLOR[raceFormat(r)] }}>{ddmm(r.date)} · {RACE_FORMAT_LABEL[raceFormat(r)]}</span>
              </span>
            ))}
            <span role="columnheader" style={{ ...LABEL, textAlign: "right" }}>Écart</span>
          </div>
          {all.map((row) => (
            <div role="row" key={row.key} style={{ display: "grid", gridTemplateColumns: cols, gap: 5, alignItems: "center" }}>
              <span role="rowheader" style={{ fontSize: 13, color: C.tx, fontWeight: row.key === "total" ? 500 : 400 }}>{row.label}</span>
              {row.pcts.map((p, i) => (
                <span role="cell" key={races[i].id} style={{ ...MONO, ...cellStyle(p), height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
                  {p != null ? `top ${p} %` : "—"}
                </span>
              ))}
              <span role="cell" style={{ ...MONO, fontSize: 12.5, textAlign: "right", color: row.deltaPts == null ? C.tx3 : row.deltaPts <= -MOVE_PTS ? C.g : row.deltaPts >= MOVE_PTS ? C.o : C.tx2 }}>
                {row.deltaPts == null ? "—" : row.deltaPts === 0 ? "0" : `${row.deltaPts < 0 ? "+" : "−"}${Math.abs(row.deltaPts)} pts`}
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
              <span>{r.label}</span><span style={{ ...MONO, color: C.g }}>top {first(r)} → {lastPct(r)} %</span>
            </div>
          )) : <span style={{ fontSize: 12.5, color: C.tx3 }}>Pas encore assez de courses comparables.</span>}
        </div>
        <div style={{ ...CARD, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 9 }}>
          <span style={{ ...KICKER, color: C.o }}>Ce qui stagne</span>
          {flat.length ? flat.slice(0, 3).map((r) => (
            <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
              <span>{r.label}</span><span style={{ ...MONO, color: C.o }}>top {first(r)} → {lastPct(r)} %</span>
            </div>
          )) : <span style={{ fontSize: 12.5, color: C.tx3 }}>Rien : tout progresse ou est déjà fort.</span>}
        </div>
      </div>
    </div>
  );
}
