import { C, alpha } from "@/lib/theme";
import { useInjuryStageHistory, useSetInjuryStage } from "@/features/shared/hooks/useMedicalEntries";
import {
  RECOVERY_STAGES,
  RECOVERY_STAGE_LABEL,
  RECOVERY_STAGE_SHORT,
  type MedicalEntry,
  type RecoveryStage,
} from "@/features/shared/types/medical";
import { fmtStageDay, fmtStageDuration, stageIndex, stageOf, stagePassages } from "@/lib/injuryStage";

/** Couleur d'une étape : rouge blessé, orange en réhab, bleu en réathlé, vert guéri. */
export function stageColor(s: RecoveryStage): string {
  if (s === "blesse") return C.r;
  if (s === "gueri") return C.g;
  if (s === "reathletisation") return C.ac;
  return C.o;
}

/**
 * Frise des 5 étapes de résolution d'une blessure (Hugo, 15/11/2026).
 * Un geste pour changer d'étape (athlète, coach, staff autorisé) ; dessous,
 * depuis quand et l'historique daté.
 */
export function InjuryStageTrack({ entry, athleteId, canEdit, compact = false }: {
  entry: Pick<MedicalEntry, "id" | "status" | "recovery_stage">;
  athleteId: string;
  canEdit: boolean;
  /** Libellés courts (téléphone, listes serrées). */
  compact?: boolean;
}) {
  const { data: history = [] } = useInjuryStageHistory(athleteId);
  const set = useSetInjuryStage(athleteId);
  const current = set.isPending && set.variables?.entryId === entry.id ? set.variables.stage : stageOf(entry);
  const at = stageIndex(current);
  const passages = stagePassages(history, entry.id);
  const last = passages[passages.length - 1];
  const labels = compact ? RECOVERY_STAGE_SHORT : RECOVERY_STAGE_LABEL;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div role="group" aria-label="Étape de résolution" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 4 }}>
        {RECOVERY_STAGES.map((s, i) => {
          const isCurrent = s === current;
          const reached = i <= at;
          const tone = stageColor(current);
          return (
            <button
              key={s}
              type="button"
              disabled={!canEdit || set.isPending || isCurrent}
              aria-pressed={isCurrent}
              title={canEdit && !isCurrent ? `Passer à « ${RECOVERY_STAGE_LABEL[s]} »` : RECOVERY_STAGE_LABEL[s]}
              onClick={() => set.mutate({ entryId: entry.id, stage: s })}
              style={{
                minHeight: 40, padding: "6px 4px 5px", borderRadius: 8, fontFamily: "inherit",
                display: "flex", flexDirection: "column", alignItems: "stretch", gap: 5,
                border: "1px solid " + (isCurrent ? tone : C.brd),
                background: isCurrent ? alpha(tone, 0.12) : "transparent",
                cursor: canEdit && !isCurrent ? "pointer" : "default",
                opacity: set.isPending && !isCurrent ? 0.6 : 1,
              }}
            >
              <span aria-hidden style={{ height: 4, borderRadius: 2, background: reached ? tone : C.s2 }} />
              <span style={{
                fontSize: compact ? 10.5 : 11, lineHeight: 1.2, textAlign: "center",
                fontWeight: isCurrent ? 600 : 500, color: isCurrent ? C.tx : reached ? C.tx2 : C.tx3,
                overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {labels[s]}
              </span>
            </button>
          );
        })}
      </div>
      {last && last.stage === current && (
        <div style={{ fontSize: 11.5, color: C.tx3, lineHeight: 1.45 }}>
          {RECOVERY_STAGE_LABEL[current]} depuis le {fmtStageDay(last.day)} ({fmtStageDuration(last.days)})
          {passages.length > 1 && (
            <> · {passages.slice(0, -1).map((p) => `${RECOVERY_STAGE_SHORT[p.stage]} ${fmtStageDay(p.day)} (${fmtStageDuration(p.days)})`).join(" → ")}</>
          )}
        </div>
      )}
    </div>
  );
}
