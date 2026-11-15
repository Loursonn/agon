import type { CSSProperties } from "react";
import { C, alpha } from "@/lib/theme";
import { CARD, DISPLAY, KICKER, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { CATEGORY_LABEL, raceCategory } from "@/lib/hyrox/categories";
import { fmtPace } from "@/lib/hyrox/raceDebrief";
import type { CompareGroup, CompareRow, RaceComparison } from "@/lib/hyrox/raceComparison";
import { fmtClock } from "@/lib/seance";
import { ddmm } from "./raceAnalysisShared";

/**
 * Deux courses côte à côte (demande d'Hugo du 15/11/2026), dans le style du
 * débrief : chrono, ce qui a progressé et reculé, puis runs,
 * stations et Roxzone ligne à ligne. Ce qui n'est pas comparable (run 1,
 * stations entre formats ou charges différentes) reste affiché, grisé.
 */

const GROUP_TITLE: Record<Exclude<CompareGroup, "chrono">, string> = { runs: "Runs", stations: "Stations", roxzone: "Roxzone" };

const val = (r: CompareRow, v: number | null) => (v == null ? "—" : r.unit === "pace" ? `${fmtPace(v)} /km` : r.unit === "count" ? String(v) : fmtClock(v));
const delta = (r: CompareRow) => {
  if (r.deltaS == null) return "—";
  if (r.deltaS === 0) return "0";
  const abs = Math.abs(r.deltaS);
  if (r.unit === "count") return `${r.deltaS < 0 ? "−" : "+"}${abs}`;
  return `${r.deltaS < 0 ? "−" : "+"}${abs >= 60 ? fmtClock(abs) : `${abs} s`}`;
};
const tone = (r: CompareRow) => (r.better == null ? (r.judged ? C.tx2 : C.tx3) : r.better ? C.g : C.o);

function RaceHead({ r, tag, accent }: { r: HyroxResult; tag: string; accent: boolean }) {
  return (
    <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 6, minWidth: 0, borderColor: accent ? alpha(C.ac, 0.45) : C.brd }}>
      <span style={{ ...LABEL, color: accent ? C.ac : C.tx3 }}>{tag} · {ddmm(r.date)}</span>
      <span style={{ ...DISPLAY, fontSize: 15, letterSpacing: "0.05em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.event_name}</span>
      <span style={{ fontSize: 12, color: C.tx2 }}>{CATEGORY_LABEL[raceCategory(r)]}{r.is_official ? "" : " · simulation"}</span>
      <span style={{ ...MONO, fontSize: 26, lineHeight: 1.1 }}>{fmtClock(r.total_s)}</span>
      {r.rank_overall != null && r.participants_overall
        ? <span style={{ ...MONO, fontSize: 12, color: C.tx2 }}>rang {r.rank_overall} / {r.participants_overall}</span>
        : null}
    </div>
  );
}

function DeltaBar({ r, max }: { r: CompareRow; max: number }) {
  const w = r.deltaS == null || !r.judged ? 0 : Math.min(50, (Math.abs(r.deltaS) / max) * 50);
  const left = r.deltaS != null && r.deltaS < 0;
  return (
    <div aria-hidden style={{ position: "relative", height: 8, borderRadius: 999, background: C.s2 }}>
      <span style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1, background: C.brdL }} />
      {w > 0 && <span style={{ position: "absolute", top: 0, bottom: 0, borderRadius: 999, background: tone(r), width: `${w}%`, ...(left ? { right: "50%" } : { left: "50%" }) }} />}
    </div>
  );
}

function Rows({ rows, phone }: { rows: CompareRow[]; phone: boolean }) {
  const max = Math.max(10, ...rows.filter((r) => r.judged && r.deltaS != null).map((r) => Math.abs(r.deltaS!)));
  const cols: CSSProperties = phone
    ? { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 58px 58px 62px", gap: 8, alignItems: "center" }
    : { display: "grid", gridTemplateColumns: "minmax(140px, 1.2fr) 90px 90px minmax(120px, 1fr) 72px", gap: 12, alignItems: "center" };
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map((r, i) => (
        <div key={r.key} style={{ padding: "9px 0", borderTop: i ? `1px solid ${C.brd}` : "none", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={cols}>
            <span style={{ fontSize: 13, color: r.judged ? C.tx : C.tx3, fontWeight: r.key === "cruise" ? 500 : 400 }}>{r.label}</span>
            <span style={{ ...MONO, fontSize: 12, color: C.tx3, textAlign: "right" }}>{val(r, r.before)}</span>
            <span style={{ ...MONO, fontSize: 12, color: r.judged ? C.tx : C.tx3, textAlign: "right" }}>{val(r, r.after)}</span>
            {!phone && (r.unit === "count" ? <span /> : <DeltaBar r={r} max={max} />)}
            <span style={{ ...MONO, fontSize: 13, color: tone(r), textAlign: "right" }}>{delta(r)}</span>
          </div>
          {r.note && <span style={{ fontSize: 11.5, color: C.tx3 }}>{r.note}</span>}
        </div>
      ))}
    </div>
  );
}

function MoveList({ title, color, rows, empty }: { title: string; color: string; rows: CompareRow[]; empty: string }) {
  return (
    <div style={{ ...CARD, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <span style={{ ...KICKER, color }}>{title}</span>
      {rows.length === 0 ? <span style={{ fontSize: 12.5, color: C.tx3 }}>{empty}</span> : rows.slice(0, 5).map((r) => (
        <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", fontSize: 13 }}>
          <span>{r.label}</span>
          <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
            <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{val(r, r.before)} → {val(r, r.after)}</span>
            <span style={{ ...MONO, color }}>{delta(r)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function RaceVersus({ cmp, phone, currentId }: { cmp: RaceComparison; phone: boolean; currentId?: string }) {
  const chrono = cmp.rows.find((r) => r.key === "total")!;
  const groups = (["runs", "stations", "roxzone"] as const).map((g) => ({ g, rows: cmp.rows.filter((r) => r.group === g) }));
  const head = (r: HyroxResult, tag: string) => <RaceHead r={r} tag={tag} accent={currentId ? r.id === currentId : tag === "Après"} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: phone ? 16 : 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr 1fr" : "1fr 1fr minmax(220px, 1fr)", gap: 10 }}>
        {head(cmp.before, "Avant")}
        {head(cmp.after, "Après")}
        <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 8, gridColumn: phone ? "1 / -1" : undefined }}>
          <span style={{ ...KICKER, color: C.ac }}>Écart</span>
          {cmp.sameCategory
            ? <span style={{ ...MONO, fontSize: 30, lineHeight: 1.1, color: tone(chrono) }}>{delta(chrono)}</span>
            : <span style={{ fontSize: 12.5, color: C.tx2 }}>Catégories différentes : le chrono ne se compare pas directement.</span>}
        </div>
      </div>

      {cmp.warnings.map((w) => (
        <div key={w} role="note" style={{ fontSize: 12.5, lineHeight: 1.5, color: C.o, padding: "10px 12px", borderRadius: 10, background: alpha(C.o, 0.1), border: `1px solid ${alpha(C.o, 0.3)}` }}>{w}</div>
      ))}

      <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "1fr 1fr", gap: 10 }}>
        <MoveList title="Ce qui a progressé" color={C.g} rows={cmp.improved} empty={`Aucun écart de plus de 5 s en mieux.`} />
        <MoveList title="Ce qui a reculé" color={C.o} rows={cmp.regressed} empty="Rien n'a reculé de plus de 5 s." />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 10, alignItems: "start" }}>
        {groups.filter((x) => x.g !== "roxzone").map(({ g, rows }) => (
          <section key={g} aria-label={GROUP_TITLE[g]} style={{ ...CARD, padding: "12px 16px" }}>
            <span style={{ ...KICKER, color: C.ac }}>{GROUP_TITLE[g]}</span>
            <Rows rows={g === "stations" ? [...rows, ...groups.find((x) => x.g === "roxzone")!.rows] : rows} phone={phone} />
          </section>
        ))}
      </div>
      <span style={{ fontSize: 11.5, color: C.tx3 }}>Temps : résultats saisis ou officiels · écart = après − avant, négatif = plus rapide · sous 5 s, ni progrès ni recul · aucune donnée montre.</span>
    </div>
  );
}
