/**
 * Rapport d'import affiché après l'import (au-dessus de l'éditeur) :
 * chaque ligne cliquable mène à l'étape / l'exercice concerné.
 */
import { toast } from "sonner";
import { C } from "@/lib/theme";
import type { ImportIssue } from "@/lib/import/yoxx/common";
import ImportIssueList, { issueCounts, scrollToStep } from "./ImportIssueList";

export default function ImportReportPanel({
  issues, onClose, onSelect,
}: {
  issues: ImportIssue[];
  onClose: () => void;
  /** Par défaut : fait défiler jusqu'à l'élément [data-step-id] */
  onSelect?: (stepId: string) => void;
}) {
  const { errors, warnings } = issueCounts(issues);
  const select = onSelect ?? ((id: string) => {
    if (!scrollToStep(id)) toast.info("Élément introuvable (déjà modifié ou supprimé)");
  });
  return (
    <div style={{ border: `1px solid ${C.r}40`, background: C.r + "08", borderRadius: 4, padding: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.tx }}>
          Rapport d'import · {errors} erreur{errors > 1 ? "s" : ""} · {warnings} à vérifier
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
        >
          Masquer
        </button>
      </div>
      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        <ImportIssueList issues={issues} onSelect={select} />
      </div>
    </div>
  );
}
