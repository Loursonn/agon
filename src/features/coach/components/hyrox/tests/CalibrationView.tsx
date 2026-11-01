import { useMemo } from "react";
import { C } from "@/lib/theme";
import { calibrationCsv, calibrationRows, calibrationSummary, fmtHm, fmtTime } from "@/lib/hyrox/tests";
import { useHyroxCalibration } from "@/features/shared/hooks/hyrox/useHyroxTests";
import { ListSkeleton } from "@/features/shared/components/skeletons";
import { Btn, Card, Muted, SectionTitle } from "./ui";
import { fmtDate } from "./format";

const signed = (s: number) => `${s >= 0 ? "+" : "−"}${fmtTime(Math.abs(s))}`;

/** Admin : dernière analyse avant chaque course vs chrono réel, tous athlètes. */
export default function CalibrationView() {
  const { data, isLoading, error } = useHyroxCalibration(true);
  const rows = useMemo(() => (data ? calibrationRows(data.analyses, data.races) : []), [data]);
  const sum = calibrationSummary(rows);

  const download = () => {
    const blob = new Blob(["﻿" + calibrationCsv(rows, data?.names)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calibration-tests-hyrox-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <ListSkeleton rows={4} />;
  if (error) return <Muted style={{ color: C.r }}>Lecture impossible : {(error as Error).message}</Muted>;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <SectionTitle right={<Btn small onClick={download} disabled={!rows.length}>Exporter en CSV</Btn>}>
        Calibration du chrono estimé
      </SectionTitle>
      <Muted style={{ marginBottom: 10 }}>
        Pour chaque course solo terminée : la dernière analyse de l'athlète faite avant. Écart = réel − estimé (positif = plus lent que prévu).
      </Muted>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {[
          ["Courses", String(sum.n)],
          ["Écart moyen", sum.mean_gap_s == null ? "—" : signed(sum.mean_gap_s)],
          ["Écart absolu moyen", sum.mean_abs_gap_s == null ? "—" : fmtTime(sum.mean_abs_gap_s)],
          ["Dans la fourchette", sum.in_range_pct == null ? "—" : `${Math.round(sum.in_range_pct * 100)} %`],
        ].map(([l, v]) => (
          <Card key={l} style={{ flex: "1 1 150px", padding: "10px 12px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase" }}>{l}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.tx }}>{v}</div>
          </Card>
        ))}
      </div>
      {!rows.length ? (
        <Muted>Pas encore de course après une analyse. La calibration se remplit avec les courses saisies dans l'onglet Courses.</Muted>
      ) : (
        <Card style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, color: C.tx2 }}>
            <thead>
              <tr style={{ color: C.tx3, textAlign: "left" }}>
                {["Athlète", "Course", "Analyse", "Estimé", "Réel", "Écart", "Fourchette", "Plus gros écarts"].map(h => <th key={h} style={{ padding: "8px 10px", fontWeight: 600 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const worst = [...r.segments].sort((x, y) => Math.abs(y.gap_s) - Math.abs(x.gap_s)).slice(0, 2);
                return (
                  <tr key={r.race_id} style={{ borderTop: "1px solid " + C.brd, verticalAlign: "top" }}>
                    <td style={{ padding: "8px 10px", color: C.tx }}>{data?.names[r.athlete_id] ?? "—"}</td>
                    <td style={{ padding: "8px 10px" }}>{r.event_name}<br /><Muted>{fmtDate(r.race_date)} · {r.race_division}{r.division_mismatch ? " (≠ profil)" : ""}</Muted></td>
                    <td style={{ padding: "8px 10px" }}>{fmtDate(r.analysis_date)}<br /><Muted>{r.days_before} j avant · {r.grid_version}</Muted></td>
                    <td style={{ padding: "8px 10px" }}>{fmtHm(r.predicted_s)}</td>
                    <td style={{ padding: "8px 10px", color: C.tx }}>{fmtHm(r.real_s)}</td>
                    <td style={{ padding: "8px 10px", color: Math.abs(r.gap_pct) <= 0.03 ? C.g : C.o, fontWeight: 700 }}>{signed(r.gap_s)}<br /><Muted>{(r.gap_pct * 100).toFixed(1).replace(".", ",")} %</Muted></td>
                    <td style={{ padding: "8px 10px" }}>{r.in_range ? "oui" : "non"}</td>
                    <td style={{ padding: "8px 10px" }}>{worst.map(s => <div key={s.segment}>{s.segment} {signed(s.gap_s)}</div>)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
