import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { empty, tabTitle } from "./staffTabStyles";

const COLS: { k: "score" | "sommeil" | "fatigue" | "stress" | "energie" | "doms"; l: string }[] = [
  { k: "score", l: "Score" },
  { k: "sommeil", l: "Sommeil" },
  { k: "fatigue", l: "Fatigue" },
  { k: "stress", l: "Stress" },
  { k: "energie", l: "Énergie" },
  { k: "doms", l: "Courbatures" },
];

/** Clés « 20261018 » ou ISO → ISO */
function toISO(k: string): string {
  return /^\d{8}$/.test(k) ? `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}` : k.slice(0, 10);
}

/** Bien-être (domaine `wellness`) — 21 derniers relevés, lecture seule. */
export function StaffWellnessTab() {
  const { wellnessHistory, loaded } = useAthleteContext();
  const rows = Object.entries(wellnessHistory ?? {})
    .map(([k, v]) => ({ date: toISO(v?.date ?? k), v }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 21);

  if (!loaded) return <div style={empty}>Chargement…</div>;
  if (rows.length === 0) return <div style={empty}>Aucun relevé de bien-être.</div>;

  return (
    <div>
      <h2 style={tabTitle}>21 derniers relevés</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "6px 8px", color: C.tx3, fontWeight: 600 }}>Date</th>
              {COLS.map((c) => <th key={c.k} style={{ textAlign: "right", padding: "6px 8px", color: C.tx3, fontWeight: 600 }}>{c.l}</th>)}
              <th style={{ textAlign: "right", padding: "6px 8px", color: C.tx3, fontWeight: 600 }}>Durée</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ date, v }) => (
              <tr key={date} style={{ borderTop: "1px solid " + C.brd }}>
                <td style={{ padding: "6px 8px", color: C.tx2, whiteSpace: "nowrap" }}>
                  {new Date(date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                </td>
                {COLS.map((c) => (
                  <td key={c.k} style={{ padding: "6px 8px", textAlign: "right", color: C.tx, fontWeight: c.k === "score" ? 700 : 400 }}>
                    {typeof v?.[c.k] === "number" ? v[c.k] : "—"}
                  </td>
                ))}
                <td style={{ padding: "6px 8px", textAlign: "right", color: C.tx2 }}>{typeof v?.sleepDur === "number" ? `${v.sleepDur} h` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
