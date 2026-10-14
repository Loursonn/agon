import { useState } from "react";
import { X, Zap } from "lucide-react";
import { C } from "@/lib/theme";
import SessionPreview from "./SessionPreview";
import { SchemaViewerWithZoom } from "./SchemaViewer";
import type { EnergySessionRow, EnergyStep, EnergyGroup, SessionImage } from "@/types/energy";
import type { SessionBlock, ClassiqueBlock, WodBlock } from "@/types/specific";
import { isWodBlock } from "@/types/specific";
import { formatTarget, formatS } from "@/lib/energy/formatTarget";
import { FicheLinks } from "@/features/shared/components/fiches/FicheLinks";

// ── Shared constants ──────────────────────────────────────────────────────────

export const KIND_LABEL: Record<string, string> = {
  vo2: "VO₂max", tempo: "Tempo", seuil: "Seuil",
  footing: "Footing", fartlek: "Fartlek", specifique: "Spécifique", autre: "Autre", custom: "Custom",
};
export const KIND_COLOR: Record<string, string> = {
  vo2: "#FFC933", tempo: "#33B5FF", seuil: "#F59E0B",
  footing: "#10B981", fartlek: "#EF4444", specifique: "#F5A623", autre: "#6B7280", custom: "#6B7280",
};

export const ROLE_COLOR: Record<string, string> = {
  warmup:   "#F59E0B",
  work:     "#EF4444",
  recovery: "#33B5FF",
  rest:     "#6B7280",
  cooldown: "#10B981",
  open:     "#FFC933",
};
export const ROLE_LABEL_FR: Record<string, string> = {
  warmup:   "Écho",
  work:     "Effort",
  recovery: "Récup",
  rest:     "Repos",
  cooldown: "Retour",
  open:     "Libre",
};

export function buildRootGroup(session: EnergySessionRow): EnergyGroup {
  return { type: "group", id: "__root__", role: "open", repeat: 1, children: session.intervals ?? [] };
}

// ── Equipment labels ─────────────────────────────────────────────────────────

const EQUIPMENT_LABEL: Record<string, string> = {
  rameur: "Rameur", skierg: "SkiErg", bikeerg: "BikeErg", velo: "Vélo",
  course: "Course", elliptique: "Elliptique", corde: "Corde", autre: "Autre",
};

// ── StepTree ──────────────────────────────────────────────────────────────────

export function StepTree({ steps, depth = 0 }: { steps: EnergyStep[]; depth?: number }) {
  return (
    <>
      {steps.map((step, i) => {
        if (step.type === "interval") {
          const rc = ROLE_COLOR[step.role] ?? "#6B7280";
          const dur = step.duration.kind === "time"
            ? formatS(step.duration.value ?? 0)
            : step.duration.kind === "distance"
            ? `${step.duration.value ?? 0} m`
            : step.duration.kind === "calories"
            ? `${step.duration.value ?? 0} kcal`
            : "Lap";
          const tgt = formatTarget(step.target);
          return (
            <div
              key={step.id ?? i}
              style={{
                display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8,
                padding: "5px 8px",
                marginLeft: depth * 14,
                borderRadius: 6,
                background: depth > 0 ? "rgba(255,255,255,0.02)" : "transparent",
              }}
            >
              <div style={{ width: 3, height: 20, borderRadius: 2, background: rc, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: rc, minWidth: 36 }}>
                {ROLE_LABEL_FR[step.role] ?? step.role}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.tx, minWidth: 40 }}>{dur}</span>
              {tgt && tgt !== "Libre" && (
                <span style={{ fontSize: 10, color: C.tx3, minWidth: 0 }}>
                  {tgt}
                </span>
              )}
              {step.equipment && step.equipment !== "none" && (
                <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "rgba(255,255,255,0.08)", color: C.tx2, flexShrink: 0 }}>
                  {EQUIPMENT_LABEL[step.equipment] ?? step.equipment}
                </span>
              )}
              {step.notes && (
                <span style={{ fontSize: 9, color: C.tx3, fontStyle: "italic", flexBasis: "100%", paddingLeft: 11, whiteSpace: "pre-wrap" }}>
                  {step.notes}
                </span>
              )}
            </div>
          );
        }
        // Exercise
        if (step.type === "exercise") {
          const exoColor = "#FFC933";
          const detail = [
            step.reps_min ? (step.reps_max && step.reps_max !== step.reps_min ? `${step.reps_min}-${step.reps_max} reps` : `${step.reps_min} reps`) : null,
            step.weight_kg ? `${step.weight_kg} ${step.weight_unit === "bw" ? "BW" : step.weight_unit === "pct_rm" ? "%RM" : "kg"}` : null,
          ].filter(Boolean).join(" · ");
          return (
            <div
              key={step.id ?? i}
              style={{
                display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8,
                padding: "5px 8px",
                marginLeft: depth * 14,
                borderRadius: 6,
                background: depth > 0 ? "rgba(255,255,255,0.02)" : "transparent",
              }}
            >
              <div style={{ width: 3, height: 20, borderRadius: 2, background: exoColor, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: exoColor, minWidth: 36 }}>Exo</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.tx }}>{step.exercise_name}</span>
              {detail && <span style={{ fontSize: 10, color: C.tx3 }}>{detail}</span>}
              {step.notes && (
                <span style={{ fontSize: 9, color: C.tx3, fontStyle: "italic", flexBasis: "100%", paddingLeft: 11, whiteSpace: "pre-wrap" }}>
                  {step.notes}
                </span>
              )}
            </div>
          );
        }
        // Group
        return (
          <div key={step.id ?? i} style={{ marginLeft: depth * 14, marginBottom: 2 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 8px", borderRadius: 6,
              background: "rgba(255,255,255,0.04)",
              borderLeft: "2px solid rgba(255,255,255,0.1)",
              marginBottom: 2,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.ac }}>
                × {step.repeat}
              </span>
              {step.repeat > 1 && (
                <span style={{ fontSize: 9, color: C.tx3 }}>répétitions</span>
              )}
            </div>
            {step.instructions && (
              <div style={{ fontSize: 11, color: C.tx2, lineHeight: 1.4, whiteSpace: "pre-wrap", padding: "0 8px 4px 10px" }}>
                {step.instructions}
              </div>
            )}
            <StepTree steps={step.children} depth={depth + 1} />
            {step.rest_between && (
              <div style={{ marginLeft: (depth + 1) * 14 }}>
                <StepTree steps={[step.rest_between]} depth={depth + 1} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ── Classique block rendering ────────────────────────────────────────────────

function ClassiqueBlockView({ block }: { block: ClassiqueBlock }) {
  return (
    <div style={{
      background: C.s2, border: "1px solid " + C.brd,
      borderLeft: "3px solid #66F03C",
      borderRadius: 4, padding: "10px 12px", marginBottom: 8,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#66F03C", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
        {block.title || "Bloc classique"}
      </div>
      {block.instructions && (
        <div style={{ fontSize: 11, color: C.tx2, lineHeight: 1.4, whiteSpace: "pre-wrap", marginBottom: 6 }}>
          {block.instructions}
        </div>
      )}
      {block.items.map((item) => (
        <div key={item.id} style={{
          display: "flex", gap: 8, alignItems: "baseline",
          padding: "4px 0", borderBottom: "1px solid " + C.brd,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.tx, flex: 1, minWidth: 0 }}>
            {item.name}
          </span>
          {item.prescription && (
            <span style={{ fontSize: 10, color: C.tx3, textAlign: "right", maxWidth: "55%" }}>{item.prescription}</span>
          )}
        </div>
      ))}
      {block.items.some((it) => it.notes) && (
        <div style={{ marginTop: 4 }}>
          {block.items.filter((it) => it.notes).map((it) => (
            <div key={it.id} style={{ fontSize: 9, color: C.tx3, padding: "1px 0", whiteSpace: "pre-wrap" }}>
              {it.name} : {it.notes}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WodBlockView({ block }: { block: WodBlock }) {
  return (
    <div style={{
      border: "1px dashed #F5A623",
      borderRadius: 4, padding: 8, marginBottom: 8,
      background: "rgba(245,166,35,0.03)",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#F5A623", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4, padding: "0 4px" }}>
        {block.title || "Bloc WOD"}
        <span style={{ fontWeight: 400, marginLeft: 6, fontSize: 9, color: C.tx3 }}>
          {block.steps.length} étape{block.steps.length > 1 ? "s" : ""}
        </span>
      </div>
      {block.instructions && (
        <div style={{ fontSize: 11, color: C.tx2, lineHeight: 1.4, whiteSpace: "pre-wrap", marginBottom: 4 }}>
          {block.instructions}
        </div>
      )}
      <div style={{ marginLeft: 4 }}>
        <StepTree steps={block.steps} />
      </div>
    </div>
  );
}

function BlockList({ blocks }: { blocks: SessionBlock[] }) {
  return (
    <>
      {blocks.map((b) =>
        isWodBlock(b)
          ? <WodBlockView key={b.id} block={b} />
          : <ClassiqueBlockView key={b.id} block={b} />,
      )}
    </>
  );
}

// ── SessionPreviewModal ───────────────────────────────────────────────────────

interface SessionPreviewModalProps {
  session: EnergySessionRow;
  athleteId?: string;
  /** If provided, shows "Modifier la séance" button */
  onEdit?: () => void;
  /** If provided (athlete context, not completed), shows action button */
  onStart?: () => void;
  /** Label for the onStart button. Default: "Faire la séance aujourd'hui" */
  startLabel?: string;
  /** If provided (athlete context, completed), shows "Annuler la séance" button */
  onCancel?: () => void;
  /** If provided (athlete view), shows "Valider la séance" button */
  onValidate?: () => void;
  /** If provided (athlete view, already completed), shows "Dévalider" button */
  onUnvalidate?: () => void;
  onClose: () => void;
}

export function SessionPreviewModal({ session, athleteId, onEdit, onStart, startLabel, onCancel, onValidate, onUnvalidate, onClose }: SessionPreviewModalProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const kc = KIND_COLOR[session.session_kind] ?? "#6B7280";
  const rootGroup = buildRootGroup(session);
  const isClassique = session.format === "classique";
  const blocks = isClassique ? session.classique_structure?.blocks ?? [] : [];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.65)" }} />
      <div
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 61,
          overflowWrap: "anywhere",
          maxHeight: "92vh",
          background: C.s1, borderRadius: "6px 6px 0 0", border: "1px solid " + C.brd,
          borderBottom: "none",
          display: "flex", flexDirection: "column",
          animation: "slideUp 200ms ease-out",
        }}
      >
        <style>{`@keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }`}</style>

        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.brdL }} />
        </div>

        {/* Header */}
        <div style={{ padding: "10px 18px 12px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 4, background: kc + "25", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Zap size={16} color={kc} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>
              {session.name}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: kc + "20", color: kc }}>
                {KIND_LABEL[session.session_kind] ?? session.session_kind}
              </span>
              {session.total_duration_s != null && (
                <span style={{ fontSize: 11, color: C.tx3 }}>{Math.round(session.total_duration_s / 60)} min</span>
              )}
              {session.is_verified && <span style={{ fontSize: 9, color: C.g, fontWeight: 700 }}>✓ vérifiée</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={13} />
          </button>
        </div>

        {/* Scrollable body — single column: chart then steps */}
        <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
          {/* Chart (WOD format only) */}
          {!isClassique && (
            <div style={{ padding: "0 18px 12px" }}>
              <SessionPreview intervals={rootGroup} athleteId={athleteId} />
            </div>
          )}

          {/* Fiches (côté athlète) */}
          {athleteId && session.fiches?.length ? (
            <div style={{ margin: "0 18px 12px" }}>
              <FicheLinks title="Fiches" attachments={session.fiches} athleteId={athleteId} compact />
            </div>
          ) : null}

          {/* Notes */}
          {session.notes && (
            <div style={{ margin: "0 18px 12px", padding: "9px 12px", borderRadius: 4, background: C.s2, border: "1px solid " + C.brd, fontSize: 11, color: C.tx2, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 3 }}>Notes</span>
              {session.notes}
            </div>
          )}

          {/* Schema */}
          {session.schema && (
            <div style={{ margin: "0 18px 12px", borderRadius: 4, overflow: "hidden", border: "1px solid " + C.brd }}>
              <SchemaViewerWithZoom schema={session.schema} />
            </div>
          )}

          {/* Images / Illustrations */}
          {((session as any).images as SessionImage[] | null)?.length ? (
            <div style={{ margin: "0 18px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                Illustrations
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {((session as any).images as SessionImage[]).map((img: SessionImage, i: number) => (
                  <div key={i}
                    onClick={() => setLightboxUrl(img.url)}
                    style={{ width: 100, height: 100, borderRadius: 4, overflow: "hidden", border: "1px solid " + C.brd, cursor: "pointer" }}>
                    <img src={img.url} alt={img.caption || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Steps / Blocks detail */}
          <div style={{ padding: "0 18px 20px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              {isClassique ? "Contenu de la séance" : "Déroulé de la séance"}
            </div>
            {isClassique ? (
              <BlockList blocks={blocks} />
            ) : (
              <StepTree steps={session.intervals ?? []} />
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ padding: "10px 18px", paddingBottom: "max(10px, env(safe-area-inset-bottom, 10px))", borderTop: "1px solid " + C.brd, display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {onUnvalidate && (
            <button onClick={onUnvalidate} style={{ padding: "9px 16px", borderRadius: 4, border: "1px solid " + C.r + "50", background: "transparent", color: C.r, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Dévalider
            </button>
          )}
          {onCancel && (
            <button onClick={onCancel} style={{ padding: "9px 16px", borderRadius: 4, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.1)", color: "#EF4444", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Annuler la séance
            </button>
          )}
          {onEdit && (
            <button onClick={onEdit} style={{ padding: "9px 16px", borderRadius: 4, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Modifier
            </button>
          )}
          {onStart && (
            <button onClick={onStart} style={{ flex: 1, padding: "12px 0", borderRadius: 6, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              {startLabel ?? "Faire la séance ▶"}
            </button>
          )}
          {onValidate && (
            <button onClick={onValidate} style={{ flex: 1, padding: "12px 0", borderRadius: 6, border: "none", background: "#66F03C", color: "#0E0C0A", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              Valider la séance ✓
            </button>
          )}
          {!onStart && !onValidate && !onEdit && !onCancel && !onUnvalidate && (
            <button onClick={onClose} style={{ flex: 1, padding: "10px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Fermer
            </button>
          )}
        </div>
      </div>
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          <img src={lightboxUrl} alt="" style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 4 }} />
        </div>
      )}
    </>
  );
}
