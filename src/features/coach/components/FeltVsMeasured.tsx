import { localIsoDay } from "@shared/domain/dates";
import { useWellnessHistory } from "@/features/shared/hooks/useWellness";
import { useHealthWindow } from "@/features/athlete/hooks/useHealthWindow";
import { dailyValues, fmtMinutes } from "@/lib/healthView";
import { FELT_WORDS } from "@/lib/feltVsMeasured";
import { feltMeasuredRows } from "@/lib/santeCoach";
import { C, alpha } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";

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
  const rows = feltMeasuredRows(health, wh, day);
  // Durée de la nuit à côté du score de sommeil (« score · 6 h 05 · moy. 78 »).
  const sleepMin = dailyValues(health, (d) => d.sleepTotalMin).get(day)?.v ?? null;

  if (rows.length === 0) {
    return (
      <div style={{ fontSize: 13, color: C.tx3, padding: "12px 0" }}>
        {today ? "Pas de mesure de montre ce matin à mettre en face du ressenti." : `${firstName} n’a pas encore rempli son wellness ce matin.`}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
      {rows.map(({ def: r, felt, measured: m, source, mean, agr }) => {
        const col = agr === "ecart" ? C.o : C.g;
        return (
          <div key={r.key} style={{ borderRadius: 14, background: C.s1, border: `1px solid ${agr === "ecart" ? alpha(C.o, 0.5) : C.brd}`, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{r.label}</span>
              {agr && <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: col, border: `1px solid ${alpha(col, 0.5)}`, borderRadius: 999, padding: "2px 9px" }}>{agr === "ecart" ? "Écart" : "Cohérent"}</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr", alignItems: "center", gap: 6 }}>
              <div>
                <div style={{ fontSize: 11, color: C.tx3 }}>Ressenti de {firstName}</div>
                <div style={{ ...MONO, fontSize: 26, marginTop: 4 }}>{felt}<span style={{ fontSize: 12, color: C.tx3 }}> / 5</span></div>
                <div style={{ fontSize: 11.5, color: C.tx2 }}>« {FELT_WORDS[r.key][felt - 1]} »</div>
              </div>
              <span style={{ ...MONO, fontSize: 18, color: col, textAlign: "center" }}>{agr === "ecart" ? "≠" : "="}</span>
              <div>
                <div style={{ fontSize: 11, color: C.tx3 }}>Mesuré par {source ?? "la montre"}</div>
                <div style={{ ...MONO, fontSize: 26, marginTop: 4 }}>{Math.round(m)}{r.key === "sommeil" && <span style={{ fontSize: 12, color: C.tx3 }}> / 100</span>}</div>
                <div style={{ fontSize: 11.5, color: C.tx2 }}>
                  {r.measuredLabel}{r.key === "sommeil" && sleepMin != null ? ` · ${fmtMinutes(sleepMin)}` : ""}{mean != null ? ` · moy. ${Math.round(mean)}` : ""}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
