import { C } from "@/lib/theme";
import { getReco } from "@/lib/wellness";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useWellnessHistory } from "@/features/shared/hooks/useWellness";
import { WELLNESS_ITEMS, WELLNESS_ITEM_LABEL, WELLNESS_ITEM_SHORT, wellnessEntries, wellnessScore } from "@shared/domain/wellness";
import { empty, tabTitle } from "./staffTabStyles";

/**
 * Bien-être (domaine `wellness`) — 21 derniers relevés, lecture seule.
 * Lu par src/api/wellness : jours ISO, clés de semaine parasites ("1".."4")
 * écartées (elles donnaient des lignes « Invalid Date »), score recalculé.
 * La RLS ne laisse voir que `asp:wh` (l'archive des blocs n'est pas ouverte au staff).
 */
export function StaffWellnessTab() {
  const { athleteId } = useAthleteContext();
  const { data, isLoading, error } = useWellnessHistory(athleteId);
  const rows = wellnessEntries(data ?? {}).reverse().slice(0, 21);

  if (isLoading) return <div style={empty}>Chargement…</div>;
  if (error) return <div style={empty}>Bien-être indisponible : {(error as Error).message}</div>;
  if (rows.length === 0) return <div style={empty}>Aucun relevé de bien-être.</div>;

  const th = { textAlign: "right" as const, padding: "6px 8px", color: C.tx3, fontWeight: 600 };
  return (
    <div>
      <h2 style={tabTitle}>21 derniers relevés</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Date</th>
              <th style={th}>Score</th>
              {WELLNESS_ITEMS.map((k) => <th key={k} title={WELLNESS_ITEM_LABEL[k]} style={th}>{WELLNESS_ITEM_SHORT[k]}</th>)}
              <th style={th}>Durée</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const score = wellnessScore(e);
              return (
                <tr key={e.day} style={{ borderTop: "1px solid " + C.brd }}>
                  <td style={{ padding: "6px 8px", color: C.tx2, whiteSpace: "nowrap" }}>
                    {new Date(e.day + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: getReco(score).c, fontWeight: 700 }}>{score ?? "—"}</td>
                  {WELLNESS_ITEMS.map((k) => (
                    <td key={k} style={{ padding: "6px 8px", textAlign: "right", color: C.tx }}>{e.items[k] ?? "—"}</td>
                  ))}
                  <td style={{ padding: "6px 8px", textAlign: "right", color: C.tx2 }}>{e.sleep.hours != null ? `${e.sleep.hours} h` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
