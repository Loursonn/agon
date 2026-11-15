import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { competitionSessionSummary } from "@/lib/competitionSession";

/**
 * Séance du jour J vue par le coach : résultat libre, RPE et lien saisis par
 * l'athlète (« 12e / 80 · RPE 9 · Résultats ↗ »). Rien si rien n'est saisi.
 */
export function CompetitionResultLine({
  comp,
}: {
  comp: { type?: string; date?: string; result_text?: string | null; result_url?: string | null; rpe_score?: number | null };
}) {
  const summary = competitionSessionSummary({ type: comp.type ?? "competition", date: comp.date ?? "", ...comp });
  if (!summary && !comp.result_url) return null;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
      {summary && <span style={{ ...MONO, fontSize: 12.5, color: C.tx }}>{summary}</span>}
      {comp.result_url && (
        <a href={comp.result_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
          style={{ fontSize: 12, color: C.ac, overflowWrap: "anywhere" }}>
          Résultats ↗
        </a>
      )}
    </div>
  );
}
