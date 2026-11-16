import { useEffect, useState, type CSSProperties } from "react";
import { C } from "@/lib/theme";
import { MONO } from "./seanceUi";

interface Props {
  /** Valeur affichée (déjà mise en forme) ; « — » ou "" = vide. */
  value: string;
  /** Texte tapé ; renvoie `false` s'il est illisible (la case revient à sa valeur). */
  onCommit: (text: string) => boolean;
  label: string;
  /** Valeur corrigée à la main : point doré, valeur d'avant au survol. */
  edited?: boolean;
  before?: string | null;
  width?: number | string;
  align?: "left" | "right" | "center";
  inputMode?: "text" | "numeric" | "decimal";
  disabled?: boolean;
  big?: boolean;
  placeholder?: string;
}

/** Case du tableau des tours en mode « Modifier tours » : validée à la sortie ou sur Entrée, Échap annule. */
export function LapCellInput(p: Props) {
  const shown = p.value === "—" ? "" : p.value;
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    if (text.trim() === shown.trim()) return;
    if (!p.onCommit(text)) setText(shown);
  };
  const box: CSSProperties = {
    ...MONO,
    width: p.width ?? "100%",
    minWidth: 0,
    height: p.big ? 40 : 30,
    padding: "0 6px",
    borderRadius: 7,
    background: p.disabled ? "transparent" : C.s2,
    border: `1px solid ${p.edited ? C.ac : C.brdL}`,
    color: p.disabled ? C.tx3 : C.tx,
    fontSize: p.big ? 16 : 12.5,
    textAlign: p.align ?? "right",
    outline: "none",
    boxSizing: "border-box",
  };
  const title = p.edited && p.before ? `${p.label} · avant correction : ${p.before}` : p.label;
  return (
    <span style={{ position: "relative", display: "inline-flex", width: p.width ?? "100%", minWidth: 0 }} title={title}>
      <input
        aria-label={p.label}
        value={text}
        disabled={p.disabled}
        inputMode={p.inputMode ?? "text"}
        placeholder={p.placeholder ?? "—"}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onFocus={(e) => e.currentTarget.select()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setText(shown); (e.target as HTMLInputElement).blur(); }
        }}
        style={box}
      />
      {p.edited && (
        <span aria-hidden style={{ position: "absolute", top: -3, right: -3, width: 7, height: 7, borderRadius: 999, background: C.ac, border: `1.5px solid ${C.s1}` }} />
      )}
    </span>
  );
}
