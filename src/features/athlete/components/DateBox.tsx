import type { CSSProperties } from "react";
import { CalendarDays } from "lucide-react";
import { C, alpha } from "@/lib/theme";

export const FIELD_BOX: CSSProperties = {
  height: 48, boxSizing: "border-box", borderRadius: 12, border: `1px solid ${alpha(C.tx, 0.18)}`, background: C.s1,
  display: "flex", alignItems: "center", gap: 10, padding: "0 14px", position: "relative",
};

/** « Dim. 22 nov. 2026 » (avec l'année) ou « Mer. 18 nov. » (sans). */
export function fmtLongDay(iso: string, withYear: boolean): string {
  const d = new Date(iso + "T12:00:00");
  const s = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Champ date des planches : texte formaté, sélecteur natif invisible par-dessus. */
export function DateBox({ value, min, max, onChange, label, withYear }: {
  value: string; min?: string; max?: string; onChange: (v: string) => void; label: string; withYear: boolean;
}) {
  return (
    <label style={{ ...FIELD_BOX, cursor: "pointer" }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 15, color: value ? C.tx : C.tx3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value ? fmtLongDay(value, withYear) : "Choisir"}
      </span>
      <CalendarDays size={18} color={C.tx3} strokeWidth={1.75} />
      <input
        type="date"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
        onClick={(e) => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* navigateur sans showPicker */ } }}
        style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", colorScheme: "dark" }}
      />
    </label>
  );
}
