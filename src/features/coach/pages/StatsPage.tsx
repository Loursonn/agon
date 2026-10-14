import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { MiniChart } from "@/components/athlete/StatsCharts";
import { getBig3, get1rmByWeek } from "@/lib/calculations";

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function StatsPage() {
  const {
    athleteId, exos, sessions, blockConfig,
    prs, tw, currentWeek,
    wellnessHistory,
    sessionLogs,
  } = useAthleteContext();

  const big3 = getBig3(exos);

  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Suivi athlète</div>
      <div style={{ fontSize: 12, color: C.tx2, marginBottom: 12 }}>
        {sessions.length > 0 ? (blockConfig?.blockName || "Programme") + " · S" + currentWeek + "/" + tw : "Aucun bloc actif"}
      </div>

      {/* 1RM Progression */}
      <div style={{ background: C.s1, borderRadius: 6, padding: 14, border: "1px solid " + C.brd, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 12 }}>Progression 1RM</div>
        {big3.map(({ name, label, c }: { name: string; label: string; c: string }) => {
          const pr = (prs as Record<string, { est?: string }>)[name] || null;
          const data = get1rmByWeek(exos, name, tw);
          const filled = data.filter((d: { val: number | null }) => d.val != null);
          const prog = filled.length >= 2 ? filled[filled.length - 1].val - filled[0].val : null;
          return (
            <div key={name} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 3, height: 16, borderRadius: 2, background: c }} /><span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span></div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: c }}>{pr?.est || "--"}</span>
                  <span style={{ fontSize: 10, color: C.tx3 }}>kg</span>
                  {prog != null && <span style={{ fontSize: 11, fontWeight: 700, color: prog > 0 ? C.g : prog < 0 ? C.r : C.tx3, padding: "2px 6px", borderRadius: 5, background: (prog > 0 ? C.g : prog < 0 ? C.r : C.tx3) + "15" }}>{prog > 0 ? "+" : ""}{prog}</span>}
                </div>
              </div>
              <MiniChart data={data} color={c} h={44} />
            </div>
          );
        })}
      </div>

      {/* Comptes rendus de séances */}
      {Object.keys(sessionLogs).filter(k => sessionLogs[k]?.note || sessionLogs[k]?.forme).length > 0 && (() => {
        const logs = Object.entries(sessionLogs).filter(([, l]) => l?.note || l?.forme).sort((a, b) => ((b[1].date || "") > (a[1].date || "") ? 1 : -1)).slice(0, 10);
        return (
          <div style={{ background: C.s1, borderRadius: 6, padding: 14, border: "1px solid " + C.brd, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 10 }}>Comptes rendus de séances</div>
            {logs.map(([key, log]) => {
              const parts = key.split("_"); const wkNum = parts[parts.length - 1]; const sessId = parts.slice(0, -1).join("_");
              const sess = sessions.find(s => s.id === sessId);
              return (
                <div key={key} style={{ padding: "8px 10px", borderRadius: 4, background: C.s2, marginBottom: 6, border: "1px solid " + C.brd }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: log.note ? 4 : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.ac }}>{sess?.name || sessId}</span>
                      <span style={{ fontSize: 9, color: C.tx3, padding: "1px 6px", borderRadius: 4, background: C.acS }}>S{wkNum}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {log.forme && <span style={{ fontSize: 10, fontWeight: 600, color: log.forme >= 4 ? C.g : log.forme >= 3 ? C.o : C.r }}>Forme {log.forme}/5</span>}
                      {log.duration && <span style={{ fontSize: 10, color: C.tx3 }}>{fmtTime(log.duration)}</span>}
                      {log.date && <span style={{ fontSize: 9, color: C.tx3 }}>{new Date(log.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>}
                    </div>
                  </div>
                  {log.note && <div style={{ fontSize: 11, color: C.tx2, lineHeight: 1.5, fontStyle: "italic" }}>"{log.note}"</div>}
                </div>
              );
            })}
          </div>
        );
      })()}
    </>
  );
}
