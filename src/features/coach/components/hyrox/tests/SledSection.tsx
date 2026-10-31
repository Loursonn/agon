import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, XAxis, YAxis } from "recharts";
import { C } from "@/lib/theme";
import { fr, type SledProfile, type SledWeek1Analysis } from "@/lib/hyrox/tests";
import { Card, Muted, SectionTitle, SourceTag } from "./ui";

function SledCard({ name, s, raceKg, week1, audience }: { name: string; s: SledProfile; raceKg: number; week1: SledWeek1Analysis | null; audience: "coach" | "athlete" }) {
  return (
    <Card style={{ flex: "1 1 280px", padding: "10px 10px 8px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, padding: "0 4px" }}>{name} · {raceKg} kg</div>
      {s.usable === false ? (
        <Muted style={{ padding: "8px 4px" }}>
          {s.reason === "missing" ? "Il faut au moins 2 passages chronométrés." : "La vitesse ne baisse pas avec la charge : profil non exploitable (chrono ou charges à vérifier)."}
        </Muted>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={170}>
            <ComposedChart margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={C.brd} />
              <XAxis dataKey="load_kg" type="number" domain={[Math.floor(raceKg * 0.6), Math.ceil(Math.max(raceKg * 1.4, Math.min(s.l0_kg, raceKg * 2)))]} tick={{ fill: C.tx3, fontSize: 10 }} unit=" kg" />
              <YAxis type="number" domain={[0, "auto"]} tick={{ fill: C.tx3, fontSize: 10 }} width={40} />
              <ReferenceLine x={raceKg} stroke={C.ac} strokeDasharray="4 4" />
              <Line
                data={[{ load_kg: raceKg * 0.6, v: s.a + s.b * raceKg * 0.6 }, { load_kg: Math.min(s.l0_kg, raceKg * 2), v: Math.max(0, s.a + s.b * Math.min(s.l0_kg, raceKg * 2)) }]}
                dataKey="v" stroke={C.tx3} dot={false} strokeDasharray="3 3" isAnimationActive={false}
              />
              <Scatter data={s.points} dataKey="v" fill={C.ac} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 12, color: C.tx2, padding: "2px 4px", lineHeight: 1.5 }}>
            La charge de course représente <b style={{ color: C.tx }}>{Math.round(s.reserve * 100)} %</b> de la charge max estimée ({Math.round(s.l0_kg)} kg)
            · {fr(s.v_race, 2)} m/s à charge de course.
          </div>
          {(s.two_points || s.low_fit) && (
            <Muted style={{ padding: "0 4px" }}>
              {s.two_points ? "2 passages seulement. " : ""}{s.low_fit ? `Profil peu fiable (R² ${fr(s.r2, 2)}) : à refaire au retest.` : ""}
            </Muted>
          )}
          {audience === "coach" && <Muted style={{ padding: "0 4px" }}>Vitesse à vide {fr(s.a, 2)} m/s · pente {fr(s.b * 100, 2)} m/s par 100 kg · R² {fr(s.r2, 2)}</Muted>}
        </>
      )}
      {week1 && (
        <div style={{ borderTop: "1px solid " + C.brd, marginTop: 8, padding: "8px 4px 0", fontSize: 12, color: C.tx2, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 700, color: C.tx, marginBottom: 2 }}>Semaine 1 · 3 × 50 m</div>
          {week1.mean_speed != null && <div>Vitesse moyenne {fr(week1.mean_speed, 2)} m/s{week1.vs_fresh != null ? ` · ${Math.round(week1.vs_fresh * 100)} % de la vitesse à frais` : ""}</div>}
          {week1.worst_intra_drop != null && <div>Pire chute sur un 50 m : {Math.round((1 - week1.worst_intra_drop) * 100)} %</div>}
          {week1.between_reps_drop != null && <div>Dernière répétition : {Math.round(week1.between_reps_drop * 100)} % de la première</div>}
        </div>
      )}
    </Card>
  );
}

export default function SledSection(props: {
  push: SledProfile; pull: SledProfile; pushKg: number; pullKg: number;
  week1Push: SledWeek1Analysis | null; week1Pull: SledWeek1Analysis | null; audience: "coach" | "athlete";
}) {
  return (
    <>
      <SectionTitle right={<SourceTag source="ma méthode" />}>Sleds · profil charge-vitesse</SectionTitle>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <SledCard name="Sled Push" s={props.push} raceKg={props.pushKg} week1={props.week1Push} audience={props.audience} />
        <SledCard name="Sled Pull" s={props.pull} raceKg={props.pullKg} week1={props.week1Pull} audience={props.audience} />
      </div>
      <Muted style={{ marginTop: 6 }}>Plus le pourcentage est bas, plus il reste de marge de force à charge de course. La charge max estimée surestime la charge max réelle.</Muted>
    </>
  );
}
