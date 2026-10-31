import { useEffect, useState } from "react";
import { C } from "@/lib/theme";
import { professionLabel, summarizePermissions, type StaffPermissions } from "../lib/staffPermissions";
import {
  personName,
  useApplyStaffToAll,
  useRevokeStaffLink,
  useUpdateStaffLink,
  type StaffLink,
} from "../hooks/useAthleteStaff";
import { StaffPermissionsGrid } from "./StaffPermissionsGrid";

const btn: React.CSSProperties = {
  padding: "7px 12px", minHeight: 34, borderRadius: 4, border: "1px solid " + C.brdL,
  background: "transparent", color: C.tx2, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
};

function sameGrid(a: StaffPermissions, b: StaffPermissions) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Un professionnel du staff d'un athlète.
 *  - `manage` (coach principal) : grille modifiable, option « peut modifier
 *    mes contenus », raccourci « appliquer à tous », retrait ;
 *  - sinon (athlète) : métier et droits en lecture, retrait.
 */
export function StaffLinkCard({
  link,
  manage,
  isNew,
}: {
  link: StaffLink;
  manage: boolean;
  isNew?: boolean;
}) {
  const update = useUpdateStaffLink();
  const revoke = useRevokeStaffLink();
  const applyAll = useApplyStaffToAll();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(link.permissions);
  const [canEdit, setCanEdit] = useState(link.can_edit_coach_content);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  // Resynchronise si la base change (autre onglet, « appliquer à tous »).
  useEffect(() => { setDraft(link.permissions); setCanEdit(link.can_edit_coach_content); }, [link.permissions, link.can_edit_coach_content]);

  const dirty = !sameGrid(draft, link.permissions) || canEdit !== link.can_edit_coach_content;
  const name = personName(link.staff);
  const revoked = link.status === "revoked";

  return (
    <div style={{ background: C.s1, border: "1px solid " + (isNew ? C.ac + "70" : C.brd), borderRadius: 6, padding: "12px 14px", opacity: revoked ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%", background: C.b + "22", color: C.b,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0,
        }}>
          {name.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
            {name}
            {isNew && <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 800, color: "#0E0C0A", background: C.ac, borderRadius: 3, padding: "1px 5px" }}>NOUVEAU</span>}
          </div>
          <div style={{ fontSize: 11, color: C.tx3 }}>
            {professionLabel(link.profession)}
            {" · "}
            {revoked
              ? `accès retiré le ${new Date(link.revoked_at ?? link.updated_at).toLocaleDateString("fr-FR")}`
              : `ajouté par ${link.added_by_role === "athlete" ? "l'athlète" : "le coach"} le ${new Date(link.created_at).toLocaleDateString("fr-FR")}`}
          </div>
        </div>
        {!revoked && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button style={btn} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {manage ? (open ? "Fermer" : "Régler les droits") : open ? "Masquer" : "Voir ses accès"}
            </button>
            {confirmRevoke ? (
              <>
                <button style={{ ...btn, color: C.r, borderColor: C.r + "70" }} disabled={revoke.isPending} onClick={() => revoke.mutate(link.id)}>
                  Confirmer le retrait
                </button>
                <button style={btn} onClick={() => setConfirmRevoke(false)}>Annuler</button>
              </>
            ) : (
              <button style={btn} onClick={() => setConfirmRevoke(true)}>Retirer l'accès</button>
            )}
          </div>
        )}
      </div>

      {!open && !revoked && (
        <div style={{ fontSize: 11.5, color: C.tx2, marginTop: 8, lineHeight: 1.5 }}>
          {summarizePermissions(link.permissions)}
          {link.can_edit_coach_content && <span style={{ color: C.ac }}> · peut modifier les contenus du coach</span>}
        </div>
      )}

      {open && !revoked && (
        <div style={{ marginTop: 12 }}>
          <StaffPermissionsGrid value={draft} onChange={manage ? setDraft : undefined} />
          {manage ? (
            <>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, cursor: "pointer" }}>
                <input type="checkbox" checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)} style={{ marginTop: 2, accentColor: C.ac }} />
                <span style={{ fontSize: 12, color: C.tx2, lineHeight: 1.5 }}>
                  Peut modifier mes contenus
                  <span style={{ display: "block", fontSize: 10.5, color: C.tx3 }}>
                    Sinon il ne modifie que ce qu'il a créé. Ne s'applique qu'aux domaines en écriture.
                  </span>
                </span>
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                <button
                  disabled={!dirty || update.isPending}
                  onClick={() => update.mutate({ id: link.id, permissions: draft, canEditCoachContent: canEdit })}
                  style={{ ...btn, border: "none", background: dirty ? C.ac : C.s2, color: dirty ? "#0E0C0A" : C.tx3, fontWeight: 700 }}
                >
                  {update.isPending ? "Enregistrement…" : "Enregistrer"}
                </button>
                {dirty && <button style={btn} onClick={() => { setDraft(link.permissions); setCanEdit(link.can_edit_coach_content); }}>Annuler</button>}
                <button
                  style={btn}
                  disabled={dirty || applyAll.isPending}
                  title={dirty ? "Enregistre d'abord ces droits" : undefined}
                  onClick={() => applyAll.mutate(link.id)}
                >
                  Appliquer à tous mes athlètes suivis par ce pro
                </button>
              </div>
              <div style={{ fontSize: 10.5, color: C.tx3, marginTop: 8 }}>
                L'athlète est informé de chaque changement de droits.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 10.5, color: C.tx3, marginTop: 8 }}>
              Ces droits sont réglés par ton coach. Tu peux retirer l'accès à tout moment.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
