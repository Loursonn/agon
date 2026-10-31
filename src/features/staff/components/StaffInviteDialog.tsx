import { useState } from "react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import {
  DEFAULT_PERMISSIONS,
  PROFESSION_LABEL,
  STAFF_PROFESSIONS,
  summarizePermissions,
  type StaffPermissions,
  type StaffProfession,
} from "../lib/staffPermissions";
import { useCreateStaffInvitation } from "../hooks/useAthleteStaff";
import { StaffPermissionsGrid } from "./StaffPermissionsGrid";
import { copyText } from "../lib/clipboard";

/**
 * Ajout d'un professionnel par lien d'invitation (pas d'email en V1).
 *  - mode coach : métier → grille pré-cochée, modifiable, + option « peut
 *    modifier mes contenus » ;
 *  - mode athlete : métier seulement, la grille par défaut s'applique et le
 *    coach principal ajustera.
 */
export function StaffInviteDialog({
  athleteId,
  athleteName,
  mode,
  onClose,
}: {
  athleteId: string;
  athleteName: string;
  mode: "coach" | "athlete";
  onClose: () => void;
}) {
  const [profession, setProfession] = useState<StaffProfession>("kine");
  const [perms, setPerms] = useState<StaffPermissions>(DEFAULT_PERMISSIONS.kine);
  const [canEdit, setCanEdit] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const create = useCreateStaffInvitation();

  function pickProfession(p: StaffProfession) {
    setProfession(p);
    setPerms(DEFAULT_PERMISSIONS[p]);
  }

  async function submit() {
    const link = await create.mutateAsync({
      athleteId,
      profession,
      permissions: mode === "coach" ? perms : undefined,
      canEditCoachContent: mode === "coach" ? canEdit : false,
    });
    setUrl(link);
    if (await copyText(link)) toast.success("Lien copié");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ajouter un professionnel"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div style={{
        width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto",
        background: C.s1, border: "1px solid " + C.brdL, borderRadius: 6, padding: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.tx, flex: 1 }}>Ajouter un professionnel</div>
          <button onClick={onClose} aria-label="Fermer" style={{ background: "none", border: "none", color: C.tx3, fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: C.tx3, marginBottom: 16 }}>
          {mode === "coach"
            ? `Kiné, ostéo, nutritionniste… autour de ${athleteName}. Tu choisis ce qu'il voit et ce qu'il peut modifier.`
            : "Kiné, ostéo, nutritionniste… Il aura les accès habituels de son métier ; ton coach pourra les ajuster, et tu peux retirer l'accès à tout moment."}
        </div>

        {url ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: C.tx2, lineHeight: 1.6 }}>
              Envoie ce lien au {PROFESSION_LABEL[profession].toLowerCase()} (SMS, email, messagerie). Il crée son compte
              gratuit ou se connecte, et l'accès s'ouvre aussitôt. Le lien est valable 14 jours et ne sert qu'une fois.
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                style={{
                  flex: 1, minWidth: 0, padding: "9px 10px", borderRadius: 4, border: "1px solid " + C.brdL,
                  background: C.s2, color: C.tx, fontSize: 12, fontFamily: "inherit",
                }}
              />
              <button
                onClick={async () => { if (await copyText(url)) toast.success("Lien copié"); }}
                style={{ padding: "8px 14px", borderRadius: 4, border: "none", background: C.ac, color: "#0E0C0A", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
              >
                Copier
              </button>
            </div>
            <button onClick={onClose} style={{ alignSelf: "flex-end", padding: "8px 14px", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              Terminé
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Métier</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {STAFF_PROFESSIONS.map((p) => {
                const on = p === profession;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => pickProfession(p)}
                    style={{
                      padding: "7px 12px", borderRadius: 4, minHeight: 34,
                      border: "1px solid " + (on ? C.ac : C.brdL),
                      background: on ? C.acS : "transparent",
                      color: on ? C.ac : C.tx2, fontSize: 12, fontWeight: on ? 700 : 500,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {PROFESSION_LABEL[p]}
                  </button>
                );
              })}
            </div>

            {mode === "coach" ? (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>
                  Droits (pré-cochés selon le métier)
                </div>
                <StaffPermissionsGrid value={perms} onChange={setPerms} />
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)} style={{ marginTop: 2, accentColor: C.ac }} />
                  <span style={{ fontSize: 12, color: C.tx2, lineHeight: 1.5 }}>
                    Peut modifier mes contenus
                    <span style={{ display: "block", fontSize: 10.5, color: C.tx3 }}>
                      Sinon il ne modifie que ce qu'il a créé. Ne s'applique qu'aux domaines en écriture.
                    </span>
                  </span>
                </label>
              </>
            ) : (
              <div style={{ fontSize: 12, color: C.tx2, background: C.s2, borderRadius: 4, padding: "10px 12px", lineHeight: 1.6 }}>
                <b style={{ color: C.tx }}>Accès habituels :</b> {summarizePermissions(DEFAULT_PERMISSIONS[profession])}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button onClick={onClose} style={{ padding: "9px 14px", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                Annuler
              </button>
              <button
                onClick={submit}
                disabled={create.isPending}
                style={{ padding: "9px 16px", borderRadius: 4, border: "none", background: C.ac, color: "#0E0C0A", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", opacity: create.isPending ? 0.6 : 1 }}
              >
                {create.isPending ? "Création…" : "Créer le lien d'invitation"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
