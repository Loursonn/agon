import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { QK } from "@/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { professionLabel, staffInviteUrl } from "../lib/staffPermissions";
import {
  useAthleteStaff,
  useCancelStaffInvitation,
  useMarkStaffSeen,
  useStaffInvitations,
} from "../hooks/useAthleteStaff";
import { StaffLinkCard } from "./StaffLinkCard";
import { StaffInviteDialog } from "./StaffInviteDialog";
import { copyText } from "../lib/clipboard";

const sectionTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px",
};

/** Consentement unique de l'athlète au partage de ses données de santé avec son staff. */
function useStaffHealthConsent(athleteId: string) {
  return useQuery({
    queryKey: QK.staffConsent(athleteId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("staff_sharing_consented", { athlete_uuid: athleteId });
      if (error) throw error;
      return !!data;
    },
  });
}

/**
 * Staff d'un athlète.
 *  - mode `coach` : coach principal (ou athlète autocoaché) — invite avec une
 *    grille libre, règle les droits ;
 *  - mode `athlete` : l'athlète voit ses pros, en ajoute (grille par défaut),
 *    retire un accès. Il est informé des ajouts et changements (badge NOUVEAU,
 *    marqué vu à l'ouverture).
 */
export function AthleteStaffPanel({
  athleteId,
  athleteName,
  mode,
}: {
  athleteId: string;
  athleteName: string;
  mode: "coach" | "athlete";
}) {
  const { data: links = [], isLoading } = useAthleteStaff(athleteId);
  const { data: invitations = [] } = useStaffInvitations(athleteId);
  const { data: consent } = useStaffHealthConsent(athleteId);
  const cancel = useCancelStaffInvitation();
  const markSeen = useMarkStaffSeen();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [showRevoked, setShowRevoked] = useState(false);

  const active = links.filter((l) => l.status === "active");
  const revoked = links.filter((l) => l.status === "revoked");

  // « Nouveau » = pas encore vu par ce lecteur. Figé à l'ouverture pour que le
  // badge reste visible pendant la visite, puis marqué vu en base.
  const unseen = active.filter((l) => (mode === "athlete" ? !l.athlete_notified_at : !l.coach_notified_at));
  const [newIds, setNewIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (isLoading || newIds) return;
    setNewIds(new Set(unseen.map((l) => l.id)));
    if (unseen.length) markSeen.mutate({ ids: unseen.map((l) => l.id), as: mode });
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220, fontSize: 12, color: C.tx3, lineHeight: 1.6 }}>
          {mode === "coach"
            ? "Kiné, ostéo, nutritionniste, coach adjoint… Chaque pro voit uniquement les domaines que tu ouvres, sur cet athlète. Ce qu'il crée va dans ta banque."
            : "Les professionnels qui t'accompagnent : ce qu'ils voient est réglé par ton coach. Tu peux en ajouter et retirer un accès à tout moment."}
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          style={{ padding: "9px 16px", borderRadius: 4, border: "none", background: C.ac, color: "#0E0C0A", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
        >
          Ajouter un professionnel
        </button>
      </div>

      {consent === false && (
        <div style={{ fontSize: 12, color: C.o, background: C.oS, border: "1px solid " + C.o + "40", borderRadius: 4, padding: "10px 12px", lineHeight: 1.6 }}>
          {mode === "coach"
            ? `${athleteName} n'a pas encore donné son accord au partage de ses données de santé : médical, nutrition et bien-être restent masqués aux pros, quels que soient leurs droits.`
            : "Tu n'as pas encore donné ton accord au partage de tes données de santé : médical, nutrition et bien-être restent masqués à ton staff."}
        </div>
      )}

      <section>
        <h2 style={sectionTitle}>Professionnels · {active.length}</h2>
        {isLoading ? (
          <div style={{ fontSize: 13, color: C.tx3 }}>Chargement…</div>
        ) : active.length === 0 ? (
          <div style={{ fontSize: 13, color: C.tx3 }}>Aucun professionnel pour l'instant.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {active.map((l) => (
              <StaffLinkCard key={l.id} link={l} manage={mode === "coach"} isNew={newIds?.has(l.id) ?? false} />
            ))}
          </div>
        )}
      </section>

      {invitations.length > 0 && (
        <section>
          <h2 style={sectionTitle}>Invitations en attente · {invitations.length}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {invitations.map((inv) => (
              <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: C.s1, border: "1px dashed " + C.brdL, borderRadius: 6, padding: "8px 12px" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{professionLabel(inv.profession)}</div>
                  <div style={{ fontSize: 11, color: C.tx3 }}>
                    Invité par {inv.invited_by_role === "athlete" ? "l'athlète" : "le coach"} · expire le {new Date(inv.expires_at).toLocaleDateString("fr-FR")}
                  </div>
                </div>
                <button
                  onClick={async () => { if (await copyText(staffInviteUrl(inv.token))) toast.success("Lien copié"); }}
                  style={{ padding: "6px 10px", minHeight: 32, borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Copier le lien
                </button>
                <button
                  onClick={() => cancel.mutate(inv.id)}
                  style={{ padding: "6px 10px", minHeight: 32, borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Annuler
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {revoked.length > 0 && (
        <section>
          <button onClick={() => setShowRevoked((v) => !v)} style={{ ...sectionTitle, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
            {showRevoked ? "▾" : "▸"} Accès retirés · {revoked.length}
          </button>
          {showRevoked && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {revoked.map((l) => <StaffLinkCard key={l.id} link={l} manage={false} />)}
            </div>
          )}
        </section>
      )}

      {inviteOpen && (
        <StaffInviteDialog athleteId={athleteId} athleteName={athleteName} mode={mode} onClose={() => setInviteOpen(false)} />
      )}
    </div>
  );
}
