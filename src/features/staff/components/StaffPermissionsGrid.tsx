import { C } from "@/lib/theme";
import {
  DOMAIN_HINT,
  DOMAIN_LABEL,
  HEALTH_DOMAINS,
  LEVEL_LABEL,
  STAFF_DOMAINS,
  WRITABLE_V1,
  type StaffLevel,
  type StaffPermissions,
} from "../lib/staffPermissions";

const LEVELS: StaffLevel[] = ["none", "read", "write"];

/**
 * Grille domaine × (aucun / lecture / écriture).
 * Sans `onChange`, la grille est en lecture seule (vue athlète, vue pro).
 */
export function StaffPermissionsGrid({
  value,
  onChange,
  compact = false,
}: {
  value: StaffPermissions;
  onChange?: (next: StaffPermissions) => void;
  compact?: boolean;
}) {
  const editable = !!onChange;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {STAFF_DOMAINS.map((d) => (
        <div
          key={d}
          style={{
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            padding: compact ? "4px 0" : "6px 0", borderBottom: "1px solid " + C.brd,
          }}
        >
          <div style={{ flex: 1, minWidth: 150 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.tx }}>
              {DOMAIN_LABEL[d]}
              {HEALTH_DOMAINS.has(d) && (
                <span title="Donnée de santé sensible" style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: C.o }}>
                  SANTÉ
                </span>
              )}
            </div>
            {!compact && <div style={{ fontSize: 10.5, color: C.tx3 }}>{DOMAIN_HINT[d]}</div>}
          </div>
          <div role="radiogroup" aria-label={DOMAIN_LABEL[d]} style={{ display: "flex", gap: 2 }}>
            {LEVELS.map((lvl) => {
              const on = value[d] === lvl;
              const writeLater = lvl === "write" && !WRITABLE_V1.has(d);
              const color = lvl === "write" ? C.ac : lvl === "read" ? C.b : C.tx3;
              return (
                <button
                  key={lvl}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!editable}
                  title={writeLater ? "L'écriture arrive dans une prochaine version : vaut lecture pour l'instant" : undefined}
                  onClick={() => onChange?.({ ...value, [d]: lvl })}
                  style={{
                    minWidth: 68, minHeight: 30, padding: "4px 8px", borderRadius: 4,
                    border: "1px solid " + (on ? color : C.brd),
                    background: on ? color + "22" : "transparent",
                    color: on ? color : C.tx3,
                    fontSize: 11, fontWeight: on ? 700 : 500,
                    cursor: editable ? "pointer" : "default",
                    fontFamily: "inherit",
                    opacity: !editable && !on ? 0.45 : 1,
                  }}
                >
                  {LEVEL_LABEL[lvl]}{writeLater && on ? "*" : ""}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {STAFF_DOMAINS.some((d) => value[d] === "write" && !WRITABLE_V1.has(d)) && (
        <div style={{ fontSize: 10.5, color: C.tx3, marginTop: 4 }}>
          * Écriture prévue dans une prochaine version : pour l'instant, le pro a la lecture sur ce domaine.
        </div>
      )}
    </div>
  );
}
