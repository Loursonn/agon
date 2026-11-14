import type { ReactNode } from "react";
import { C } from "@/lib/theme";

/** Carte teintée d'une couleur de type, avec le filet vertical à gauche. */
export function TintCard({
  color,
  children,
  radius = 12,
  padding = "10px 12px 10px 17px",
  onClick,
  as = "div",
  ariaLabel,
}: {
  color: string;
  children: ReactNode;
  radius?: number;
  padding?: string;
  onClick?: () => void;
  as?: "div" | "button";
  ariaLabel?: string;
}) {
  const style = {
    position: "relative" as const,
    overflow: "hidden" as const,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding,
    borderRadius: radius,
    border: `1px solid ${color}73`,
    background: `${color}1F`,
    color: C.tx,
    width: "100%",
    textAlign: "left" as const,
    fontFamily: "inherit",
    cursor: onClick ? "pointer" : undefined,
    boxSizing: "border-box" as const,
  };
  const bar = <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: color }} />;
  return as === "button" ? (
    <button type="button" onClick={onClick} style={style} aria-label={ariaLabel}>{bar}{children}</button>
  ) : (
    <div onClick={onClick} style={style} aria-label={ariaLabel}>{bar}{children}</div>
  );
}
