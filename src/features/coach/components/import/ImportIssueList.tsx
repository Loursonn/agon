/**
 * ImportIssueList — rapport d'import ligne par ligne (erreurs / avertissements / infos).
 * Une ligne cliquable (onSelect) mène à l'étape concernée dans l'éditeur.
 */
import { C } from "@/lib/theme";
import type { ImportIssue, ImportIssueLevel } from "@/lib/import/yoxx/common";

const LEVEL: Record<ImportIssueLevel, { label: string; color: string }> = {
  error:   { label: "Erreur", color: C.r },
  warning: { label: "À vérifier", color: C.o },
  info:    { label: "Info", color: C.b },
};

export function issueCounts(issues: ImportIssue[]) {
  return {
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warning").length,
    infos: issues.filter((i) => i.level === "info").length,
  };
}

export default function ImportIssueList({
  issues, onSelect,
}: {
  issues: ImportIssue[];
  onSelect?: (stepId: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {issues.map((issue, idx) => {
        const lv = LEVEL[issue.level];
        const clickable = !!(onSelect && issue.stepId);
        return (
          <div
            key={idx}
            onClick={clickable ? () => onSelect!(issue.stepId!) : undefined}
            title={clickable ? "Aller à l'étape dans l'éditeur" : undefined}
            style={{
              display: "flex", gap: 8, alignItems: "flex-start",
              padding: "6px 8px", borderRadius: 4,
              borderLeft: `3px solid ${lv.color}`,
              background: lv.color + "0F",
              cursor: clickable ? "pointer" : "default",
            }}
          >
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4, flexShrink: 0,
              background: lv.color + "22", color: lv.color, marginTop: 1,
            }}>
              {lv.label}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: C.tx }}>
                <span style={{ fontWeight: 700, color: C.tx2 }}>
                  {issue.line > 0 ? `Ligne ${issue.line}` : "Séance"}
                </span>
                {" — "}{issue.message}
              </div>
              {issue.raw && (
                <div style={{
                  fontSize: 11, color: C.tx3, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {issue.raw}
                </div>
              )}
            </div>
            {clickable && <span style={{ fontSize: 11, color: lv.color, flexShrink: 0, fontWeight: 600 }}>Voir →</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Fait défiler l'éditeur jusqu'à l'étape et la fait clignoter. false si introuvable. */
export function scrollToStep(stepId: string): boolean {
  const el = document.querySelector<HTMLElement>(`[data-step-id="${CSS.escape(stepId)}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.animate(
    [{ boxShadow: `0 0 0 2px ${C.r}` }, { boxShadow: "0 0 0 2px transparent" }],
    { duration: 1800, easing: "ease-out" },
  );
  return true;
}
