import { C } from "@/lib/theme";
import { useStaffWorkoutLogs } from "../../hooks/useStaffAthleteData";
import { empty, fmtDate, row, tabTitle } from "./staffTabStyles";

const STATUS: Record<string, { l: string; c: string }> = {
  completed: { l: "Réalisée", c: C.g },
  missed: { l: "Manquée", c: C.r },
  skipped: { l: "Sautée", c: C.o },
  planned: { l: "Prévue", c: C.tx3 },
  in_progress: { l: "En cours", c: C.b },
};

/** Séances réalisées (domaine `logs`) — lecture seule. */
export function StaffLogsTab({ athleteId }: { athleteId: string }) {
  const { data = [], isLoading } = useStaffWorkoutLogs(athleteId, true);
  return (
    <div>
      <h2 style={tabTitle}>60 dernières séances</h2>
      {isLoading ? <div style={empty}>Chargement…</div> : data.length === 0 ? <div style={empty}>Aucune séance enregistrée.</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data.map((l) => {
            const st = STATUS[l.status] ?? { l: l.status, c: C.tx3 };
            return (
              <div key={l.id} style={{ ...row, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ width: 92, fontSize: 11, color: C.tx3, flexShrink: 0 }}>{fmtDate(l.scheduled_date)}</div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{l.session_name}</div>
                  {l.notes && <div style={{ fontSize: 11, color: C.tx2, marginTop: 2 }}>{l.notes}</div>}
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 11, color: C.tx2 }}>
                  {l.rpe_score != null && <span>RPE {l.rpe_score}</span>}
                  {l.duration_s != null && <span>{Math.round(l.duration_s / 60)} min</span>}
                  {l.run_distance_km != null && <span>{l.run_distance_km} km</span>}
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: st.c }}>{st.l}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
