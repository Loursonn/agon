import type { CSSProperties } from "react";
import { CalendarDays } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { FIELD_BOX, fmtLongDay } from "./dateFormat";



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
