import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { C } from "@/lib/theme";
import { fmtPace, fmtTime, fr, type RunningAnalysis } from "@/lib/hyrox/tests";
import { Card, Muted, SectionTitle, SourceTag } from "./ui";

const PROFILE_LABEL = { complet: "complet (vitesse et seuils)", vitesse: "vitesse", endurance: "endurance", moyen: "à développer des deux côtés" } as const;
const ZONE_COLORS = { z1: C.g, z2: C.ac, z3: C.r } as const;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card style={{ flex: "1 1 140px", padding: "10px 12px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: C.tx, marginTop: 2 }}>{value}</div>
      {sub && <Muted>{sub}</Muted>}
    </Card>
  );
}

/** Courbe vitesse-durée (loi de puissance) et efforts mesurés. */
function SpeedDurationChart({ r }: { r: RunningAnalysis }) {
  if (r.e == null || r.s_kmh == null) return null;
  const S = r.s_kmh, E = r.e;
  const curve = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60].map(min => ({ min, kmh: S * Math.pow(min * 60, E - 1) }));
  const pts = r.points.map(p => ({ min: p.t / 60, measured: (p.d / p.t) * 3.6 }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
        <CartesianGrid stroke={C.brd} />
        <XAxis dataKey="min" type="number" domain={[0, 60]} ticks={[0, 10, 20, 30, 40, 50, 60]} tick={{ fill: C.tx3, fontSize: 10 }} unit=" min" />
        <YAxis type="number" domain={["auto", "auto"]} tick={{ fill: C.tx3, fontSize: 10 }} unit="" width={44} />
        <Tooltip
          contentStyle={{ background: C.s2, border: "1px solid " + C.brd, fontSize: 11 }}
          formatter={(v: number) => [`${fr(v)} km/h · ${fmtPace(v)} /km`, ""]}
          labelFormatter={(m: number) => `${fr(m, 0)} min`}
        />
        {r.cs_kmh != null && <ReferenceLine y={r.cs_kmh} stroke={C.r} strokeDasharray="4 4" />}
        {r.s1_kmh != null && <ReferenceLine y={r.s1_kmh} stroke={C.g} strokeDasharray="4 4" />}
        <Line data={curve} dataKey="kmh" type="monotone" stroke={C.ac} dot={false} strokeWidth={2} isAnimationActive={false} />
        <Scatter data={pts} dataKey="measured" fill={C.tx} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default function RunningSection({ r, audience }: { r: RunningAnalysis; audience: "coach" | "athlete" }) {
  const coach = audience === "coach";
  if (r.cs_kmh == null)
    return (
      <>
        <SectionTitle>Course</SectionTitle>
        <Muted>Il faut au moins 2 efforts de course (1200 m, 6 min, 12 min) pour calculer les seuils.</Muted>
      </>
    );
  return (
    <>
      <SectionTitle right={<SourceTag source="méthode vitesse critique / Riegel" />}>Course</SectionTitle>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Stat label="Vitesse critique (seuil 2)" value={`${fr(r.cs_kmh)} km/h`} sub={`${fmtPace(r.cs_kmh)} /km`} />
        <Stat label="Seuil 1" value={`${fr(r.s1_kmh)} km/h`} sub={`${fmtPace(r.s1_kmh)} /km`} />
        <Stat label="FC seuil" value={r.hr_threshold ? `${Math.round(r.hr_threshold)} bpm` : "—"} sub={r.hr_threshold ? undefined : "FC moyenne de 2 courses au moins"} />
      </div>

      <Card style={{ marginTop: 10, padding: "8px 8px 4px" }}>
        <div style={{ fontSize: 11, color: C.tx2, padding: "2px 6px 4px" }}>
          Vitesse tenable selon la durée{r.n_points ? ` · ${r.n_points} efforts mesurés` : ""} <span style={{ color: C.r }}>— seuil 2</span> <span style={{ color: C.g }}>— seuil 1</span>
        </div>
        <SpeedDurationChart r={r} />
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
        {r.athlete_zones.map(z => (
          <Card key={z.key} style={{ padding: "10px 12px", borderLeft: "3px solid " + ZONE_COLORS[z.key] }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{z.label}</span>
              <span style={{ fontSize: 12, color: C.tx2 }}>
                {z.low_kmh == null ? `sous ${fr(z.high_kmh)} km/h (plus lent que ${fmtPace(z.high_kmh)} /km)`
                  : z.high_kmh == null ? `au-dessus de ${fr(z.low_kmh)} km/h (plus vite que ${fmtPace(z.low_kmh)} /km)`
                  : `${fr(z.low_kmh)} à ${fr(z.high_kmh)} km/h (${fmtPace(z.low_kmh)} à ${fmtPace(z.high_kmh)} /km)`}
              </span>
            </div>
            <Muted>
              {z.hr_low == null && z.hr_high == null ? "" : `FC ${z.hr_low == null ? `sous ${Math.round(z.hr_high!)}` : z.hr_high == null ? `au-dessus de ${Math.round(z.hr_low)}` : `${Math.round(z.hr_low)} à ${Math.round(z.hr_high)}`} bpm · `}
              on parle par {z.feel}
            </Muted>
          </Card>
        ))}
      </div>

      {coach && (
        <Card style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.coach, marginBottom: 8 }}>Côté coach</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8, fontSize: 12, color: C.tx2 }}>
            <div>Facteur d'endurance <b style={{ color: C.tx }}>{fr(r.e, 2)}</b> · lecture {r.e_reading ?? "—"}</div>
            <div>D′ <b style={{ color: C.tx }}>{Math.round(r.dprime_m ?? 0)} m</b></div>
            <div>Seuil 1 = {r.s1_factor ? Math.round(r.s1_factor * 100) : "—"} % de la VC</div>
            <div>5 km <b style={{ color: C.tx }}>{fmtTime(r.predictions.km5_s, { floor: true })}</b> · 10 km <b style={{ color: C.tx }}>{fmtTime(r.predictions.km10_s, { floor: true })}</b></div>
            {r.speed_reserve && <div>Vmax {fr(r.speed_reserve.vmax_kmh)} km/h · réserve {fr(r.speed_reserve.reserve_kmh)} km/h</div>}
            {r.profile && <div>Profil : {PROFILE_LABEL[r.profile]}</div>}
          </div>
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, color: C.tx2 }}>
              <thead>
                <tr style={{ color: C.tx3, textAlign: "left" }}>
                  <th style={{ padding: "4px 6px" }}>Zone</th><th style={{ padding: "4px 6px" }}>km/h</th><th style={{ padding: "4px 6px" }}>Allure</th>
                </tr>
              </thead>
              <tbody>
                {r.coach_speed_zones.map(z => {
                  return (
                    <tr key={z.key} style={{ borderTop: "1px solid " + C.brd }}>
                      <td style={{ padding: "4px 6px", color: C.tx }}>{z.key} {z.label}</td>
                      <td style={{ padding: "4px 6px" }}>{z.low_kmh == null ? "" : fr(z.low_kmh)}{z.high_kmh == null ? " +" : ` – ${fr(z.high_kmh)}`}</td>
                      <td style={{ padding: "4px 6px" }}>{z.high_kmh == null ? `< ${fmtPace(z.low_kmh)}` : `${fmtPace(z.high_kmh)} – ${fmtPace(z.low_kmh)}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {r.coach_hr_zones.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {r.coach_hr_zones.map(z => (
                <span key={z.key} style={{ fontSize: 11, color: C.tx2, background: C.s2, borderRadius: 3, padding: "3px 7px" }}>
                  FC {z.key} · {z.low == null ? `< ${Math.round(z.high!)}` : z.high == null ? `> ${Math.round(z.low)}` : `${Math.round(z.low)} – ${Math.round(z.high)}`} bpm
                </span>
              ))}
            </div>
          )}
          {r.pct_vc_table.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {r.pct_vc_table.map(x => (
                <span key={x.pct} style={{ fontSize: 11, color: C.tx2, background: C.s2, borderRadius: 3, padding: "3px 7px" }}>
                  {Math.round(x.pct * 100)} % VC · {fr(x.kmh)} km/h · {x.sustain_s == null ? "—" : fmtTime(x.sustain_s)}
                </span>
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
