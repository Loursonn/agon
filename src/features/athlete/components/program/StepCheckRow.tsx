import { C, H } from "@/lib/theme";
import { EQUIPMENT_LABEL } from "@/features/athlete/components/program/programConstants";
import type { EnergyStep } from "@/types/energy";
import { PaceEquivalents } from "@/features/shared/components/PaceEquivalents";
import { ROLE_COLOR, ROLE_LABEL_FR } from "@/features/coach/components/energy/energyLabels";
import type { StepState } from "@/features/athlete/components/program/programTypes";
import { formatExerciseStep, formatS, formatTarget } from "@/lib/energy/formatTarget";
import { stepDistanceM } from "@/lib/energy/paceEquivalents";

// ── Step card (done / partial + comment) ──────────────────────────────────────

export function StepCheckRow({
  step, state, vma, onDone, onPartial, onComment,
}: {
  step: EnergyStep;
  state: StepState | undefined;
  vma?: number | null;
  onDone: () => void;
  onPartial: () => void;
  onComment: (v: string) => void;
}) {
  const status    = state?.status;
  const isDone    = status === "done";
  const isPartial = status === "partial";
  const comment   = state?.comment ?? "";
  const bg        = isDone ? C.g + "18" : isPartial ? `${H.ambre}18` : C.s2;
  const borderCol = isDone ? C.g + "40" : isPartial ? `${H.ambre}50` : "transparent";

  // ── shared step-info block ──────────────────────────────────────────────────
  let infoNode: React.ReactNode;
  if (step.type === "interval") {
    const rc  = ROLE_COLOR[step.role] ?? H.gris;
    const dur = step.duration.kind === "time"
      ? formatS(step.duration.value ?? 0)
      : step.duration.kind === "distance"
      ? `${step.duration.value ?? 0} m`
      : step.duration.kind === "calories"
      ? `${step.duration.value ?? 0} kcal`
      : "Lap";
    const tgt = formatTarget(step.target);
    infoNode = (
      <>
        <div style={{ width: 3, height: 34, borderRadius: 2, background: rc, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: rc }}>{ROLE_LABEL_FR[step.role] ?? step.role}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{dur}</span>
          </div>
          {tgt && tgt !== "Libre" && (
            <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>{tgt}</div>
          )}
          <PaceEquivalents
            target={step.target}
            repDistanceM={stepDistanceM(step.duration)}
            vma={vma}
            omitPrimary
            fontSize={9}
          />
          {step.equipment && step.equipment !== "none" && (
            <div style={{ marginTop: 2 }}>
              <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "rgba(255,255,255,0.08)", color: C.tx2 }}>
                {EQUIPMENT_LABEL[step.equipment] ?? step.equipment}
              </span>
            </div>
          )}
          {step.notes && (
            <div style={{ fontSize: 9, color: C.tx3, fontStyle: "italic", marginTop: 1 }}>{step.notes}</div>
          )}
        </div>
      </>
    );
  } else if (step.type === "exercise") {
    // Step exercice (séance spécifique / MetCon) : pas de `children` ni de `repeat`.
    // Sans cette branche, on tombait dans le cas "groupe" → step.children undefined → crash.
    const rc = ROLE_COLOR[step.role] ?? H.gris;
    const detail = formatExerciseStep(step);
    infoNode = (
      <>
        <div style={{ width: 3, height: 34, borderRadius: 2, background: rc, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {step.exercise_name}
          </div>
          {detail && <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>{detail}</div>}
          {step.notes && (
            <div style={{ fontSize: 9, color: C.tx3, fontStyle: "italic", marginTop: 1 }}>{step.notes}</div>
          )}
        </div>
      </>
    );
  } else {
    const previewChildren = (step.children ?? [])
      .filter((c): c is Extract<EnergyStep, { type: "interval" }> => c.type === "interval")
      .slice(0, 3);
    const childSummary = previewChildren.map(c =>
      c.duration.kind === "time" ? formatS(c.duration.value ?? 0) : `${c.duration.value ?? 0}m`
    ).join(" + ");
    infoNode = (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.b }}>× {step.repeat}</span>
          <span style={{ fontSize: 10, color: C.tx3 }}>répétitions</span>
        </div>
        {childSummary && (
          <div style={{ fontSize: 10, color: C.tx2, marginTop: 1 }}>
            {childSummary}{(step.children?.length ?? 0) > 3 ? " …" : ""}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 6, background: bg, border: "1px solid " + borderCol, overflow: "hidden" }}>
      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
        {infoNode}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          {/* ✓ Fait */}
          <button
            onClick={onDone}
            title="Bloc fait"
            style={{
              width: 32, height: 32, borderRadius: 4, border: "none",
              background: isDone ? C.g : "rgba(255,255,255,0.07)",
              color: isDone ? C.tx : C.tx3,
              cursor: "pointer", fontFamily: "inherit", fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700,
            }}
          >✓</button>

          {/* ~ Incomplet */}
          <button
            onClick={onPartial}
            title="Bloc non terminé"
            style={{
              width: 32, height: 32, borderRadius: 4, border: "none",
              background: isPartial ? H.ambre : "rgba(255,255,255,0.07)",
              color: isPartial ? C.tx : C.tx3,
              cursor: "pointer", fontFamily: "inherit", fontSize: 13,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700,
            }}
          >~</button>
        </div>
      </div>

      {/* Comment — mandatory when partial */}
      {isPartial && (
        <div style={{ padding: "0 14px 12px" }}>
          <input
            value={comment}
            onChange={(e) => onComment(e.target.value)}
            placeholder="Commentaire obligatoire…"
            autoFocus
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 4,
              border: "1.5px solid " + (comment.trim() ? C.brdL : `${H.ambre}80`),
              background: "rgba(245,158,11,0.06)",
              color: C.tx, fontSize: 12, fontFamily: "inherit",
              boxSizing: "border-box" as const, outline: "none",
            }}
          />
          {!comment.trim() && (
            <div style={{ fontSize: 9, color: H.ambre, marginTop: 3 }}>
              Requis avant de terminer la séance
            </div>
          )}
        </div>
      )}
    </div>
  );
}
