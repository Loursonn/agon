import { useState, type FormEvent } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Copy, Send, X } from "lucide-react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { publicWebOrigin } from "@/lib/native";
import { coachInvitationLink, coachInvitationStatus, type CoachInvitation, type CoachInvitationStatus } from "@/api/account";
import { useCoachInvitations, useCreateCoachInvitation, useRevokeCoachInvitation } from "@/features/coach/hooks/useCoachInvitations";

/**
 * Inviter un coach (Hugo, 15/11/2026) : l'inscription coach est fermée, un
 * coach ne s'inscrit qu'avec un lien lié à son e-mail, valable 7 jours, à
 * usage unique. Réservé à l'admin et aux coachs certifiés.
 */

const STATUS: Record<CoachInvitationStatus, { label: string; color: string }> = {
  valide:   { label: "En attente", color: C.ac },
  utilisee: { label: "Inscrit",    color: C.g },
  expiree:  { label: "Expirée",    color: C.tx3 },
  revoquee: { label: "Annulée",    color: C.tx3 },
};

const day = (iso: string) => format(new Date(iso), "d MMM", { locale: fr });

async function copyLink(token: string) {
  const link = coachInvitationLink(publicWebOrigin(), token);
  try {
    await navigator.clipboard.writeText(link);
    toast.success("Lien copié : envoie-le au coach");
  } catch {
    toast.message(link);
  }
}

export function CoachInvitationsPanel() {
  const { data: invitations = [], isLoading } = useCoachInvitations(true);
  const create = useCreateCoachInvitation();
  const revoke = useRevokeCoachInvitation();
  const [email, setEmail] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!v) return;
    create.mutate(v, {
      onSuccess: (inv) => {
        setEmail("");
        void copyLink(inv.token);
      },
    });
  };

  return (
    <section style={{ marginBottom: 28 }} aria-label="Inviter un coach">
      <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 12 }}>
        Inviter un coach
      </div>
      <form onSubmit={submit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e-mail du coach"
          aria-label="E-mail du coach à inviter"
          style={{ flex: "1 1 220px", minWidth: 0, height: 40, padding: "0 12px", borderRadius: 6, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontFamily: "inherit", fontSize: 13 }}
        />
        <button type="submit" disabled={create.isPending || !email.trim()}
          style={{ height: 40, padding: "0 14px", borderRadius: 6, border: "none", background: C.ac, color: C.ink, fontWeight: 600, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, opacity: create.isPending || !email.trim() ? 0.6 : 1, fontFamily: "inherit" }}>
          <Send size={14} /> {create.isPending ? "Création…" : "Créer le lien"}
        </button>
      </form>
      <div style={{ fontSize: 12, color: C.tx3, marginTop: 8, lineHeight: 1.5 }}>
        Le lien est copié : envoie-le au coach. Il ne marche qu’avec cet e-mail, une seule fois, pendant 7 jours.
      </div>

      {!isLoading && invitations.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
          {invitations.map((inv) => <InvitationRow key={inv.id} inv={inv} onRevoke={() => revoke.mutate(inv.id)} revoking={revoke.isPending && revoke.variables === inv.id} />)}
        </div>
      )}
    </section>
  );
}

function InvitationRow({ inv, onRevoke, revoking }: { inv: CoachInvitation; onRevoke: () => void; revoking: boolean }) {
  const status = coachInvitationStatus(inv);
  const s = STATUS[status];
  const when = status === "utilisee" && inv.usedAt ? `inscrit le ${day(inv.usedAt)}`
    : status === "valide" ? `jusqu’au ${day(inv.expiresAt)}`
    : `créée le ${day(inv.createdAt)}`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, opacity: revoking ? 0.6 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.email}</div>
        <div style={{ fontSize: 11.5, color: C.tx3, marginTop: 2 }}>{when}</div>
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: s.color + "18", color: s.color, textTransform: "uppercase", letterSpacing: "0.4px" }}>{s.label}</span>
      {status === "valide" && (
        <>
          <button type="button" title="Copier le lien" aria-label={`Copier le lien de ${inv.email}`} onClick={() => void copyLink(inv.token)}
            style={{ width: 40, height: 40, borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Copy size={14} />
          </button>
          <button type="button" title="Annuler l'invitation" aria-label={`Annuler l'invitation de ${inv.email}`} onClick={onRevoke} disabled={revoking}
            style={{ width: 40, height: 40, borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} />
          </button>
        </>
      )}
    </div>
  );
}
