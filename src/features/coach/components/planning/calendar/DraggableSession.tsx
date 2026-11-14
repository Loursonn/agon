import { Dumbbell, Zap, FlaskConical, Ruler } from "lucide-react";
import { DragOverlay, useDraggable } from "@dnd-kit/core";
import { C, alpha, H } from "@/lib/theme";
import { TEST_COLOR, BIO_COLOR, CARD_MONO, BankItemType, BANK_TYPE_LABEL } from "./calendarConstants";

export function DraggableSession({
  session,
  sessionType,
  isDragging,
  variant = "chip",
  meta,
}: {
  session: { id: string; name?: string; label?: string };
  sessionType: BankItemType;
  isDragging: boolean;
  /** "card" : petite carte du bandeau (vue Semaine). */
  variant?: "chip" | "card";
  meta?: string | null;
}) {
  const color  = sessionType === "energy" ? C.b : sessionType === "specifique" ? H.miel : sessionType === "test" ? TEST_COLOR : sessionType === "biometric" ? BIO_COLOR : C.ac;
  const colorS = sessionType === "energy" ? C.bS : sessionType === "specifique" ? `${H.miel}20` : sessionType === "test" ? TEST_COLOR + "20" : sessionType === "biometric" ? BIO_COLOR + "20" : C.acS;

  // Idem : le fantôme est rendu par <DragOverlay>, la vignette source reste en place.
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: session.id,
    data: { ...session, sessionType },
  });
  const name = session.name ?? session.label ?? "Séance";

  const Icon = sessionType === "energy" ? Zap : sessionType === "test" ? FlaskConical : sessionType === "biometric" ? Ruler : Dumbbell;

  if (variant === "card") {
    // Carte du bandeau « Programmer » (planche CoachPlanningLarge3) : aplat
    // 12 %, liseré 3 px, pictogramme plein, titre sur une ligne.
    return (
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        title={`${BANK_TYPE_LABEL[sessionType]} · ${name}`}
        style={{
          width: 186, height: 64, flex: "none", boxSizing: "border-box",
          padding: "10px 10px 10px 14px", borderRadius: 10, position: "relative", overflow: "hidden",
          border: "1px solid " + alpha(color, 0.33),
          background: alpha(color, 0.12),
          cursor: "grab", userSelect: "none", opacity: isDragging ? 0.45 : 1,
          display: "flex", alignItems: "center", gap: 10,
        }}
      >
        <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: color }} />
        <span aria-hidden style={{ width: 24, height: 24, flex: "none", borderRadius: 7, background: color, display: "flex", alignItems: "center", justifyContent: "center", color: C.ink }}>
          <Icon size={13} strokeWidth={2} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: C.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          {meta && <div style={{ fontFamily: CARD_MONO, fontSize: 10, color: C.tx3, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</div>}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        padding: "7px 10px",
        borderRadius: 4,
        border: "1px solid " + color + "40",
        background: isDragging ? color : colorS,
        color: isDragging ? C.tx : color,
        fontSize: 11, fontWeight: 600,
        cursor: "grab",
        userSelect: "none",
        opacity: isDragging ? 0.5 : 1,
        transition: "opacity 120ms",
        display: "flex", alignItems: "center", gap: 6,
      }}
    >
      {sessionType === "energy" ? <Zap size={11} /> : sessionType === "test" ? <FlaskConical size={11} /> : sessionType === "biometric" ? <Ruler size={11} /> : <Dumbbell size={11} />}
      {name}
    </div>
  );
}
