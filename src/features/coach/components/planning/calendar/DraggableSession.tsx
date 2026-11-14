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

  if (variant === "card") {
    return (
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        title={name}
        style={{
          width: 186, flex: "none", minHeight: 84, boxSizing: "border-box",
          padding: "10px 12px", borderRadius: 12, position: "relative", overflow: "hidden",
          border: "1px solid " + alpha(color, 0.35),
          background: alpha(color, 0.12),
          cursor: "grab", userSelect: "none", opacity: isDragging ? 0.45 : 1,
          display: "flex", flexDirection: "column", gap: 6,
        }}
      >
        <span style={{ fontFamily: CARD_MONO, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color }}>{BANK_TYPE_LABEL[sessionType]}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.tx, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{name}</span>
        {meta && <span style={{ fontFamily: CARD_MONO, fontSize: 10.5, color: C.tx3, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: "auto" }}>{meta}</span>}
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
