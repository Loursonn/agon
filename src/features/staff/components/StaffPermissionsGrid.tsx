import { C } from "@/lib/theme";
import { MONO, Segmented, LockIcon } from "@/features/shared/components/ordi/OrdiUi";
import {
  DOMAIN_HINT,
  DOMAIN_LABEL,
  HEALTH_DOMAINS,
  LEVEL_LABEL,
  STAFF_DOMAINS,
  WRITABLE_V1,
  type StaffDomain,
  type StaffLevel,
  type StaffPermissions,
} from "../lib/staffPermissions";

const LEVELS: StaffLevel[] = ["none", "read", "write"];
/** Ordre de la planche : programme → santé → contenus. */
const DISPLAY_ORDER: StaffDomain[] = ["seances", "planification", "logs", "wellness", "medical", "nutrition", "tests", "fiches", "commentaires"];
const levelColor = (l: StaffLevel) => (l === "write" ? C.ac : l === "read" ? C.b : C.tx2);

/**
 * Grille domaine × (aucun / lecture / écriture), sur deux colonnes quand la
 * largeur le permet (planche CoachOrdiBStaff).
 * Sans `onChange`, la grille est en lecture seule (vue athlète, vue pro).
 * `saved` : grille enregistrée, pour marquer « ● MODIFIÉ » les domaines changés.
 */
export function StaffPermissionsGrid({
  value,
  onChange,
  saved,
  compact = false,
}: {
  value: StaffPermissions;
  onChange?: (next: StaffPermissions) => void;
  saved?: StaffPermissions;
  compact?: boolean;
}) {
  return (
    <div>
      <div style={{ columns: "2 380px", columnGap: 40 }}>
        {DISPLAY_ORDER.map((d) => {
          const changed = !!saved && saved[d] !== value[d];
          const writeLater = value[d] === "write" && !WRITABLE_V1.has(d);
          return (
            <div key={d} style={{ breakInside: "avoid", display: "flex", alignItems: "center", gap: 14, padding: compact ? "6px 0" : "10px 0", borderBottom: `1px solid ${C.brd}`, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: C.tx }}>
                  {DOMAIN_LABEL[d]}
                  {HEALTH_DOMAINS.has(d) && (
                    <span title="Donnée de santé sensible" style={{ ...MONO, marginLeft: 8, fontSize: 9.5, letterSpacing: "0.12em", color: C.o }}>SANTÉ</span>
                  )}
                  {changed && <span style={{ ...MONO, marginLeft: 8, fontSize: 9.5, letterSpacing: "0.12em", color: C.ac }}>● MODIFIÉ</span>}
                  {writeLater && <span title="L'écriture arrive dans une prochaine version : vaut lecture pour l'instant" style={{ marginLeft: 4, color: C.tx3 }}>*</span>}
                </div>
                {!compact && <div style={{ fontSize: 12, color: C.tx3 }}>{DOMAIN_HINT[d]}</div>}
              </div>
              <Segmented<StaffLevel>
                ariaLabel={DOMAIN_LABEL[d]}
                value={value[d]}
                onChange={onChange ? (lvl) => onChange({ ...value, [d]: lvl }) : undefined}
                colorOf={levelColor}
                options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))}
              />
            </div>
          );
        })}
      </div>
      {STAFF_DOMAINS.some((d) => value[d] === "write" && !WRITABLE_V1.has(d)) && (
        <div style={{ fontSize: 11.5, color: C.tx3, marginTop: 8 }}>
          * Écriture prévue dans une prochaine version : pour l'instant, le pro a la lecture sur ce domaine.
        </div>
      )}
    </div>
  );
}

/** Liste « Tes accès sur Léa » (planche CoachOrdiBStaffFiche) : domaine → niveau, cadenas si non partagé. */
export function StaffAccessList({ value }: { value: StaffPermissions }) {
  return (
    <div>
      {DISPLAY_ORDER.map((d) => {
        const lvl = value[d];
        const off = lvl === "none";
        return (
          <div key={d} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 36, borderTop: `1px solid ${C.brd}`, opacity: off ? 0.6 : 1 }}>
            <span style={{ fontSize: 13, color: off ? C.tx3 : C.tx }}>{DOMAIN_LABEL[d]}</span>
            {off ? (
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: C.tx3 }}><LockIcon />Non partagé</span>
            ) : (
              <span style={{ fontSize: 12.5, color: levelColor(lvl) }}>{LEVEL_LABEL[lvl]}</span>
            )}
          </div>
        );
      })}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 36, borderTop: `1px solid ${C.brd}`, opacity: 0.6 }}>
        <span style={{ fontSize: 13, color: C.tx3 }}>Montres connectées</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: C.tx3 }}><LockIcon />Non partagé</span>
      </div>
    </div>
  );
}
