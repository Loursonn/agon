import { localIsoDay } from "@shared/domain/dates";
import { useWellnessHistory } from "@/features/shared/hooks/useWellness";
import { useHealthWindow } from "@/features/athlete/hooks/useHealthWindow";
import { baselineAt, dailyValues } from "@/lib/healthView";
import { agreement, FELT_WORDS } from "@/lib/feltVsMeasured";
import type { HealthDay } from "@/api/health";
import { C, alpha } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";

type Row = {
  key: "sommeil" | "energie" | "stress";
  label: string;
  measuredLabel: string;
  pick: (d: HealthDay) => number | null;
  higherIsBetter: boolean;
};

const ROWS: Row[] = [
  { key: "sommeil", label: "Sommeil", measuredLabel: "score de sommeil", pick: (d) => d.sleepScore, higherIsBetter: true },
  { key: "energie", label: "Énergie", measuredLabel: "Body Battery", pick: (d) => d.bodyBatteryMax, higherIsBetter: true },
  { key: "stress", label: "Sérénité", measuredLabel: "stress moyen", pick: (d) => d.stressAvg, higherIsBetter: false },
];

/**
 * « Ressenti / mesuré · ce matin » (planche CoachOrdiASante) : la note du
 * wellness du jour face à la mesure de la montre, comparée à la moyenne de
 * l'athlète. Une ligne n'apparaît que si les deux existent.
 */
export function FeltVsMeasured({ athleteId, firstName }: { athleteId: string; firstName: string }) {
  const day = localIsoDay();
  const { data: health = [] } = useHealthWindow(athleteId, day);
  const { data: wh } = useWellnessHistory(athleteId, { from: day, includeArchived: false });
  const today = wh?.[day] ?? null;

  const rows = ROWS.flatMap((r) => {
    const felt = today?.items[r.key] ?? null;
    const values = dailyValues(health, r.pick);
    const m = values.get(day)?.v ?? null;
    const base = baselineAt(values, day);
    if (felt == null || m == null) return [];
    return [{ r, felt, m, mean: base?.mean ?? null, agr: base ? agreement(felt, m, base.mean, r.higherIsBetter) : null }];
  });

  if (rows.length === 0) {
    return (
      <div style={{ fontSize: 13, color: C.tx3, padding: "12px 0" }}>
        {today ? "Pas de mesure de montre ce matin à mettre en face du ressenti." : `${firstName} n’a pas encore rempli son wellness ce matin.`}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
      {rows.map(({ r, felt, m, mean, agr }) => {
        const col = agr === "ecart" ? C.o : C.g;
        return (
          <div key={r.key} style={{ borderRadius: 14, background: C.s1, border: `1px solid ${agr === "ecart" ? alpha(C.o, 0.5) : C.brd}`, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{r.label}</span>
              {agr && <span style={{ ...MONO, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: col, border: `1px solid ${alpha(col, 0.5)}`, borderRadius: 999, padding: "2px 9px" }}>{agr === "ecart" ? "Écart" : "Cohérent"}</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr", alignItems: "center", gap: 6 }}>
              <div>
                <div style={{ fontSize: 11, color: C.tx3 }}>Ressenti de {firstName}</div>
                <div style={{ ...MONO, fontSize: 26, marginTop: 4 }}>{felt}<span style={{ fontSize: 12, color: C.tx3 }}> / 5</span></div>
                <div style={{ fontSize: 11.5, color: C.tx2 }}>« {FELT_WORDS[r.key][felt - 1]} »</div>
              </div>
              <span style={{ ...MONO, fontSize: 18, color: col, textAlign: "center" }}>{agr === "ecart" ? "≠" : "="}</span>
              <div>
                <div style={{ fontSize: 11, color: C.tx3 }}>Mesuré par la montre</div>
                <div style={{ ...MONO, fontSize: 26, marginTop: 4 }}>{Math.round(m)}</div>
                <div style={{ fontSize: 11.5, color: C.tx2 }}>{r.measuredLabel}{mean != null ? ` · moy. ${Math.round(mean)}` : ""}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
