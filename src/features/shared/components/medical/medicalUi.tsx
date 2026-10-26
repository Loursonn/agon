/** Petits contrôles partagés par les écrans médicaux. */
import type React from "react";
import { C } from "@/lib/theme";
import { labelStyle } from "./medicalStyles";

export function Chip({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        padding: "6px 12px", borderRadius: 4, fontSize: 12, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        border: "1px solid " + (active ? C.ac : C.brdL),
        background: active ? C.acS : "transparent",
        color: active ? C.ac : C.tx3,
      }}
    >
      {children}
    </button>
  );
}

/**
 * Une question à choix unique. Recliquer le choix actif le retire : tous ces
 * champs sont facultatifs, il ne faut pas rester coincé sur une réponse donnée
 * par erreur.
 */
export function ChipChoice<K extends string>({ label, labels, value, onChange }: {
  label: string;
  labels: Record<K, string>;
  value: K | null;
  onChange: (v: K | null) => void;
}) {
  return (
    <div>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(Object.keys(labels) as K[]).map((k) => (
          <Chip key={k} active={value === k} onClick={() => onChange(value === k ? null : k)}>
            {labels[k]}
          </Chip>
        ))}
      </div>
    </div>
  );
}
