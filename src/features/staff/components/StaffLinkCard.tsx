import { useEffect, useState } from "react";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, CheckBox, ORDI_CARD, PermissionsLine, Pill } from "@/features/shared/components/ordi/OrdiUi";
import { btnStyle, frDate } from "@/features/shared/components/ordi/ordiStyles";
import { permissionLists, professionLabel, type StaffPermissions } from "../lib/staffPermissions";
import {
  personName,
  useApplyStaffToAll,
  useRevokeStaffLink,
  useUpdateStaffLink,
  type StaffLink,
} from "../hooks/useAthleteStaff";
import { StaffPermissionsGrid } from "./StaffPermissionsGrid";

function sameGrid(a: StaffPermissions, b: StaffPermissions) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function addedLine(link: StaffLink, viewerId: string | undefined, athleteFirstName: string | undefined, mode: "coach" | "athlete") {
  const me = link.added_by && link.added_by === viewerId;
  const by = me
    ? "toi"
    : link.added_by_role === "athlete"
      ? (mode === "athlete" ? "toi" : athleteFirstName || "l'athlète")
      : (mode === "athlete" ? "ton coach" : "le coach");
  return `ajouté par ${by} le ${frDate(link.created_at)}`;
}

/**
 * Un professionnel du staff d'un athlète (planche CoachOrdiBStaff).
 *  - `manage` (coach principal) : grille modifiable sur deux colonnes, option
 *    « peut modifier mes contenus », raccourci « appliquer à tous », retrait ;
 *  - sinon (athlète) : métier et droits en lecture, retrait.
 */
export function StaffLinkCard({
  link,
  manage,
  isNew,
  athleteFirstName,
  mode = manage ? "coach" : "athlete",
}: {
  link: StaffLink;
  manage: boolean;
  isNew?: boolean;
  athleteFirstName?: string;
  mode?: "coach" | "athlete";
}) {
  const { user } = useAuth();
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
  const lists = permissionLists(link.permissions);
  const who = athleteFirstName || "l'athlète";

  return (
    <div style={{ ...ORDI_CARD, padding: open ? "18px 22px" : "16px 22px", borderColor: open || isNew ? C.brdL : C.brd, opacity: revoked ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Avatar name={name} color={C.b} size={40} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: C.tx }}>{name}</span>
            {isNew && <Pill color={C.ac} filled>Nouveau</Pill>}
          </div>
          <div style={{ fontSize: 12.5, color: C.tx3, marginTop: 1 }}>
            {professionLabel(link.profession)}
            {" · "}
            {revoked
              ? `accès retiré le ${frDate(link.revoked_at ?? link.updated_at)}`
              : addedLine(link, user?.id, athleteFirstName, mode)}
          </div>
        </div>
        {!revoked && !confirmRevoke && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={btnStyle("ghost", "sm")} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {manage ? (open ? "Fermer" : "Régler les droits") : open ? "Masquer" : "Voir ses accès"}
            </button>
            <button style={btnStyle("ghost", "sm")} onClick={() => setConfirmRevoke(true)}>Retirer l'accès</button>
          </div>
        )}
      </div>

      {!open && !revoked && (
        <div style={{ marginTop: 10, paddingLeft: 54 }}>
          <PermissionsLine {...lists} />
          {link.can_edit_coach_content && <div style={{ fontSize: 12, color: C.ac }}>Peut modifier les contenus du coach</div>}
        </div>
      )}

      {confirmRevoke && !revoked && (
        <div style={{ margin: "14px 0 0 54px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.r}55`, background: C.r + "14" }}>
          <div style={{ flex: 1, minWidth: 220, fontSize: 13, color: C.tx }}>
            Retirer l'accès de {name} ?{" "}
            <span style={{ color: C.tx2 }}>
              {mode === "coach"
                ? `Il ne voit plus rien de ${who}, tout de suite. Ce qu'il a créé reste dans ta banque.`
                : "Il ne voit plus rien de tes données, tout de suite."}
            </span>
          </div>
          <button style={btnStyle("danger", "sm", revoke.isPending)} disabled={revoke.isPending} onClick={() => revoke.mutate(link.id)}>
            Confirmer le retrait
          </button>
          <button style={btnStyle("ghost", "sm")} onClick={() => setConfirmRevoke(false)}>Annuler</button>
        </div>
      )}

      {open && !revoked && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${C.brd}` }}>
          <StaffPermissionsGrid value={draft} onChange={manage ? setDraft : undefined} saved={manage ? link.permissions : undefined} />
          {manage ? (
            <>
              <div style={{ marginTop: 16 }}>
                <CheckBox
                  checked={canEdit}
                  onChange={setCanEdit}
                  label="Peut modifier mes contenus"
                  hint="Sinon il ne modifie que ce qu'il a créé. Ne vaut que pour les domaines en écriture."
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
                <button
                  disabled={!dirty || update.isPending}
                  onClick={() => update.mutate({ id: link.id, permissions: draft, canEditCoachContent: canEdit })}
                  style={btnStyle("primary", "lg", !dirty || update.isPending)}
                >
                  {update.isPending ? "Enregistrement…" : "Enregistrer"}
                </button>
                <button
                  style={btnStyle("ghost", "lg", !dirty)}
                  disabled={!dirty}
                  onClick={() => { setDraft(link.permissions); setCanEdit(link.can_edit_coach_content); }}
                >
                  Annuler
                </button>
                <span style={{ width: 8 }} />
                <button
                  style={{ ...btnStyle("link", "md", dirty || applyAll.isPending), fontSize: 12.5 }}
                  disabled={dirty || applyAll.isPending}
                  title={dirty ? "Enregistre d'abord ces droits" : undefined}
                  onClick={() => applyAll.mutate(link.id)}
                >
                  Appliquer à tous mes athlètes suivis par {name}
                </button>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: C.tx3 }}>{athleteFirstName ? `${athleteFirstName} est prévenu(e)` : "L'athlète est prévenu(e)"} de chaque changement de droits.</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: C.tx3, marginTop: 10 }}>
              Ces droits sont réglés par ton coach. Tu peux retirer l'accès à tout moment.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
