import { C } from "@/lib/theme";
import { describeOp, type namesFrom } from "@/lib/coachApiDraftText";
import type { DraftOp, ProgSessionShape } from "@shared/coachApiOps.ts";
import { isPlanOpName } from "@shared/coachApiPlan.ts";
import { WeekDraftPreview } from "./WeekDraftPreview";

const SECTIONS: { title: string; match: (op: string) => boolean }[] = [
  { title: "Périodisation", match: (op) => /cycle|week_deload/.test(op) },
  { title: "Compétitions et tests", match: (op) => /competition|test/.test(op) },
  { title: "Retiré du planning", match: (op) => op.startsWith("remove_") },
];

const sectionTitle = { fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.4px", margin: "10px 0 6px" };

/**
 * Aperçu d'une planification : la périodisation, les événements et les
 * retraits en phrases, puis les semaines qu'elle construit, jour par jour.
 * Les suppressions sont en rouge : le coach doit les voir avant d'appliquer.
 */
export function PlanDraftPreview({ athleteId, ops, prog, names }: {
  athleteId: string;
  ops: DraftOp[];
  prog: ProgSessionShape[] | undefined;
  names: ReturnType<typeof namesFrom>;
}) {
  const plan = ops.filter((o) => isPlanOpName(o.op));
  const week = ops.filter((o) => !isPlanOpName(o.op));

  return (
    <div style={{ marginBottom: 10 }}>
      {SECTIONS.map(({ title, match }) => {
        const list = plan.filter((o) => match(o.op));
        if (list.length === 0) return null;
        return (
          <div key={title}>
            <div style={sectionTitle}>{title}</div>
            <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 4 }}>
              {list.map((op, i) => (
                <li
                  key={i}
                  style={{
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: op.op.startsWith("delete_") || op.op.startsWith("remove_") ? "#EF4444" : C.tx,
                  }}
                >
                  {describeOp(op, names)}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {week.length > 0 && (
        <>
          <div style={sectionTitle}>Semaine</div>
          <WeekDraftPreview athleteId={athleteId} ops={week} prog={prog} />
        </>
      )}
    </div>
  );
}
