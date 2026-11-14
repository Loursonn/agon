import { useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { addDays, localIsoDay } from "@shared/domain/dates";
import { useWellnessHistory } from "@/features/shared/hooks/useWellness";
import { useHealthWindow } from "@/features/athlete/hooks/useHealthWindow";
import { FELT_MEASURED, feltMeasuredSeries, type FeltKey } from "@/lib/santeCoach";
import { C } from "@/lib/theme";
import { Segmented } from "@/features/shared/components/ordi/OrdiUi";
import { frDate } from "@/features/shared/components/ordi/ordiStyles";
import { SANTE_WELLNESS_DAYS } from "./DeclaredWellness";
import { SanteKicker } from "./SanteParts";

const OPTIONS: Array<{ value: FeltKey; label: string }> = [
  { value: "sommeil", label: "Sommeil" },
  { value: "energie", label: "Énergie / Body Battery" },
  { value: "stress", label: "Sérénité / stress" },
];

const MEASURED_NAME: Record<FeltKey, string> = {
  sommeil: "Score de sommeil mesuré",
  energie: "Body Battery mesurée",
  stress: "Stress moyen mesuré",
};

/**
 * « 04 — Ressenti et mesuré · 28 jours » (planche CoachOrdiASante) : la note
 * du wellness (× 20) contre la mesure de la montre, jour par jour. Mesures
 * Garmin affichées telles quelles, sans calcul.
 */
export function FeltMeasuredChart({ athleteId, n }: { athleteId: string; n: number }) {
  const day = localIsoDay();
  const [key, setKey] = useState<FeltKey>("sommeil");
  const { data: wh = {} } = useWellnessHistory(athleteId, { from: addDays(day, -SANTE_WELLNESS_DAYS), includeArchived: false });
  const { data: health = [] } = useHealthWindow(athleteId, day);
  const data = useMemo(() => feltMeasuredSeries(health, wh, key, day, 28), [health, wh, key, day]);
  const def = FELT_MEASURED.find((d) => d.key === key)!;
  const feltName = `${def.label} ressenti (× 20)`;
  const empty = !data.some((p) => p.felt != null || p.measured != null);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
      <SanteKicker n={n}>Ressenti et mesuré · 28 jours</SanteKicker>
      <div style={{ borderRadius: 14, background: C.s1, border: `1px solid ${C.brd}`, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ overflowX: "auto" }}>
          <Segmented<FeltKey> value={key} options={OPTIONS} onChange={setKey} width={150} ariaLabel="Mesure comparée" />
        </div>
        {empty ? (
          <div style={{ fontSize: 13, color: C.tx3 }}>Pas de ressenti ni de mesure sur les 28 derniers jours.</div>
        ) : (
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
                <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(8)} tick={{ fill: C.tx3, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={16} />
                <YAxis domain={[0, 100]} tick={{ fill: C.tx3, fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  contentStyle={{ background: C.s2, border: `1px solid ${C.brdL}`, borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(d) => frDate(String(d), false)}
                  formatter={(v, name) => [v == null ? "—" : String(Math.round(Number(v))), String(name)]}
                />
                <Line type="monotone" dataKey="felt" name={feltName} stroke={C.ac} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                <Line type="monotone" dataKey="measured" name={MEASURED_NAME[key]} stroke={C.b} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11.5, color: C.tx3 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span aria-hidden style={{ width: 12, height: 2, background: C.ac }} />{feltName}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span aria-hidden style={{ width: 12, height: 2, background: C.b }} />{MEASURED_NAME[key]}</span>
        </div>
      </div>
    </section>
  );
}
