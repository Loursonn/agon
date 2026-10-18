import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { C } from "@/lib/theme";
import type { RunningVolume } from "@/features/shared/hooks/useRunningVolume";

const MONTHS_FR = ["jan", "fév", "mar", "avr", "mai", "jun", "jul", "aoû", "sep", "oct", "nov", "déc"];

function shortDate(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
}

const fmtKm = (km: number) => `${km.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;

/** Volume de course à pied : semaine, 7 jours glissants, 8 dernières semaines */
export function RunningVolumeCard({ volume, isLoading }: { volume: RunningVolume; isLoading?: boolean }) {
  const data = volume.weeks.map((w, i) => ({
    label: shortDate(w.monday),
    km: w.km,
    current: i === volume.weeks.length - 1,
  }));
  const hasData = volume.weeks.some((w) => w.km > 0);
  const delta = volume.weekKm - volume.lastWeekKm;

  return (
    <div style={{ background: C.s1, borderRadius: 6, padding: 16, border: "1px solid " + C.brd }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
        {[
          { l: "Cette semaine", v: fmtKm(volume.weekKm), sub: "lun → dim" },
          { l: "7 jours glissants", v: fmtKm(volume.rolling7Km), sub: "jusqu'à aujourd'hui" },
          {
            l: "Semaine dernière", v: fmtKm(volume.lastWeekKm),
            sub: volume.lastWeekKm > 0 || volume.weekKm > 0
              ? `${delta >= 0 ? "+" : "−"}${fmtKm(Math.abs(Math.round(delta * 10) / 10))} cette sem.`
              : "—",
          },
        ].map(({ l, v, sub }) => (
          <div key={l} style={{ background: C.s2, borderRadius: 4, padding: "8px 10px", minWidth: 0 }}>
            <div style={{ fontSize: 9, color: C.tx3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.tx, lineHeight: 1.3 }}>{isLoading ? "…" : v}</div>
            <div style={{ fontSize: 9, color: C.tx3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
          </div>
        ))}
      </div>

      {hasData ? (
        <>
          <div style={{ fontSize: 10, color: C.tx3, marginBottom: 6 }}>Km de course par semaine — 8 dernières semaines</div>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={data} margin={{ top: 4, right: 0, left: -24, bottom: 0 }} barCategoryGap="30%">
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: C.tx3 }} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={{ fontSize: 9, fill: C.tx3 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: C.s2 }}
                contentStyle={{ background: C.s2, border: "1px solid " + C.brd, borderRadius: 4, fontSize: 11, color: C.tx }}
                labelStyle={{ color: C.tx3 }}
                labelFormatter={(l) => `Semaine du ${l}`}
                formatter={(v: number) => [fmtKm(v), "Course"]}
              />
              <Bar dataKey="km" radius={[4, 4, 0, 0]} maxBarSize={22}>
                {data.map((d) => (
                  <Cell key={d.label} fill={C.ac} fillOpacity={d.current ? 1 : 0.55} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      ) : (
        <div style={{ fontSize: 11, color: C.tx3, textAlign: "center", padding: "8px 0" }}>
          Aucune course enregistrée sur les 8 dernières semaines. Les km se saisissent en fin de séance.
        </div>
      )}
    </div>
  );
}
