import { C } from "@/lib/theme";
import type { ImportIssue, ImportIssueLevel } from "@/lib/import/yoxx/common";


export function issueCounts(issues: ImportIssue[]) {
  return {
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warning").length,
    infos: issues.filter((i) => i.level === "info").length,
  };
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
