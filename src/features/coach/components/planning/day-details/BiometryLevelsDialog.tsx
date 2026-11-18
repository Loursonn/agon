import { useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Ruler, X } from "lucide-react";
import { C } from "@/lib/theme";
import { BIOMETRY_LEVEL_OPTIONS, type BiometryLevel } from "@/features/shared/types/measurements";

/**
 * Pop-up affichée quand le coach glisse « Mensurations / Photos » sur un jour :
 * il choisit le type de biométrie (classique toujours, avancée et MyJump en plus).
 */
export function BiometryLevelsDialog({ date, onConfirm, onCancel }: {
  date: string;
  onConfirm: (levels: BiometryLevel[]) => void;
  onCancel: () => void;
}) {
  const [levels, setLevels] = useState<BiometryLevel[]>([]);
  const toggle = (l: BiometryLevel) =>
    setLevels((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]));

  return (
    <>
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.6)" }} />
      <div
        role="dialog"
        aria-label="Type de biométrie"
        style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 60, transform: "translate(-50%, -50%)",
          width: 420, maxWidth: "92vw", background: C.s1, borderRadius: 12, border: "1px solid " + C.brdL,
          padding: 20, display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Ruler size={18} color={C.ame} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.tx }}>Type de biométrie</div>
            <div style={{ fontSize: 12, color: C.tx3 }}>{format(parseISO(date), "EEEE d MMMM", { locale: fr })}</div>
          </div>
          <button onClick={onCancel} aria-label="Fermer" style={{ background: "none", border: "none", color: C.tx3, cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>

        <label style={{ display: "flex", gap: 10, fontSize: 13, color: C.tx2 }}>
          <input type="checkbox" checked disabled style={{ marginTop: 2 }} />
          <span><strong style={{ color: C.tx, fontWeight: 600 }}>Classique</strong> · poids, taille debout, tours, photos (toujours)</span>
        </label>
        {BIOMETRY_LEVEL_OPTIONS.map((o) => (
          <label key={o.key} style={{ display: "flex", gap: 10, fontSize: 13, color: C.tx2, cursor: "pointer" }}>
            <input type="checkbox" checked={levels.includes(o.key)} onChange={() => toggle(o.key)} style={{ marginTop: 2 }} />
            <span><strong style={{ color: C.tx, fontWeight: 600 }}>{o.label}</strong> · {o.detail}</span>
          </label>
        ))}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button
            onClick={onCancel}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, cursor: "pointer", fontFamily: "inherit" }}
          >
            Annuler
          </button>
          <button
            onClick={() => onConfirm(levels)}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: C.ac, color: C.ink, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            Planifier
          </button>
        </div>
      </div>
    </>
  );
}
