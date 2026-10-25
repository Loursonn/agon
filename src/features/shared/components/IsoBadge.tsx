import { C } from "@/lib/theme";

/** Badge « Iso » : exercice en maintien isométrique (répétitions = secondes). */
export function IsoBadge({ size = 8 }: { size?: number }) {
  return (
    <span
      title="Isométrie : durée de maintien en secondes"
      style={{
        fontSize: size, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
        background: C.bS, color: C.b, letterSpacing: "0.3px",
        verticalAlign: "middle", marginLeft: 5, whiteSpace: "nowrap",
      }}
    >
      Iso
    </span>
  );
}
