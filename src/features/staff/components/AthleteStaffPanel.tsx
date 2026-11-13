import { useEffect, useState } from "react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { Avatar, CheckIcon, LinkIcon, ORDI_CARD, PlusIcon, SectionHead } from "@/features/shared/components/ordi/OrdiUi";
import { btnStyle, frDate } from "@/features/shared/components/ordi/ordiStyles";
import { professionLabel, staffInviteUrl } from "../lib/staffPermissions";
import {
  useAthleteStaff,
  useCancelStaffInvitation,
  useMarkStaffSeen,
  useStaffHealthConsent,
  useStaffInvitations,
} from "../hooks/useAthleteStaff";
import { StaffLinkCard } from "./StaffLinkCard";
import { StaffInviteDialog } from "./StaffInviteDialog";
import { copyText } from "../lib/clipboard";
import { useSetConsent } from "@/features/shared/hooks/useConsent";
import { useAuth } from "@/hooks/useAuth";

/**
 * Staff d'un athlète (planche CoachOrdiBStaff, rubriques 02 et 03).
 *  - mode `coach` : coach principal (ou athlète autocoaché) — invite avec une
 *    grille libre, règle les droits ;
 *  - mode `athlete` : l'athlète voit ses pros, en ajoute (grille par défaut),
 *    retire un accès. Il est informé des ajouts et changements (pastille
 *    NOUVEAU, marquée vue à l'ouverture).
 * `sectionStart` : numéro de la première rubrique (« 02 — Staff »).
 * `inviteOpen` / `onInviteOpenChange` : bouton « Ajouter un professionnel »
 * porté par l'en-tête de page ; sans eux, le panneau affiche son propre bouton.
 */
export function AthleteStaffPanel({
  athleteId,
  athleteName,
  athleteFirstName,
  mode,
  sectionStart,
  inviteOpen: inviteOpenProp,
  onInviteOpenChange,
}: {
  athleteId: string;
  athleteName: string;
  athleteFirstName?: string;
  mode: "coach" | "athlete";
  sectionStart?: number;
  inviteOpen?: boolean;
  onInviteOpenChange?: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { data: links = [], isLoading } = useAthleteStaff(athleteId);
  const { data: invitations = [] } = useStaffInvitations(athleteId);
  const { data: consent } = useStaffHealthConsent(athleteId);
  const setConsent = useSetConsent();
  const cancel = useCancelStaffInvitation();
  const markSeen = useMarkStaffSeen();
  const [inviteOpenLocal, setInviteOpenLocal] = useState(false);
  const inviteOpen = inviteOpenProp ?? inviteOpenLocal;
  const setInviteOpen = onInviteOpenChange ?? setInviteOpenLocal;
  const [showRevoked, setShowRevoked] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const active = links.filter((l) => l.status === "active");
  const revoked = links.filter((l) => l.status === "revoked");
  const first = athleteFirstName || athleteName;

  // « Nouveau » = pas encore vu par ce lecteur. Figé à l'ouverture pour que la
  // pastille reste visible pendant la visite, puis marqué vu en base.
  const unseen = active.filter((l) => (mode === "athlete" ? !l.athlete_notified_at : !l.coach_notified_at));
  const [newIds, setNewIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (isLoading || newIds) return;
    setNewIds(new Set(unseen.map((l) => l.id)));
    if (unseen.length) markSeen.mutate({ ids: unseen.map((l) => l.id), as: mode });
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = (k: number) => (sectionStart != null ? sectionStart + k : undefined);

  const consentRight = consent === true ? (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.g }}>
      <CheckIcon />{mode === "coach" ? `${first} a accepté le partage avec son staff` : "Tu as accepté le partage avec ton staff"}
    </span>
  ) : undefined;

  const staffHint = mode === "coach"
    ? `Kiné, ostéo, nutritionniste, coach adjoint… Chacun voit seulement ce que tu ouvres, sur ${first}. Ce qu'il crée va dans ta banque, à son nom.`
    : "Les professionnels qui t'accompagnent : ce qu'ils voient est réglé par ton coach. Tu peux en ajouter et retirer un accès à tout moment.";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {sectionStart != null ? (
          <SectionHead n={n(0)} title={`Staff · ${active.length} pro${active.length > 1 ? "s" : ""}`} right={consentRight} hint={staffHint} />
        ) : (
          <div style={{ fontSize: 13, color: C.tx3, lineHeight: 1.5 }}>
            {staffHint}
            {consentRight && <div style={{ fontSize: 12.5, marginTop: 6 }}>{consentRight}</div>}
          </div>
        )}

        {inviteOpenProp === undefined && (
          <div>
            <button onClick={() => setInviteOpen(true)} style={btnStyle("ghost")}>
              <PlusIcon />Ajouter un professionnel
            </button>
          </div>
        )}

        {consent === false && (
          <div style={{ fontSize: 13, color: C.o, background: C.o + "14", border: `1px solid ${C.o}55`, borderRadius: 12, padding: "12px 14px", lineHeight: 1.6 }}>
            {mode === "coach"
              ? `${athleteName} n'a pas donné son accord au partage de ses données avec son staff : ses pros ne voient aucune de ses données, quels que soient leurs droits. L'accord se donne depuis son profil.`
              : "Tu n'as pas donné ton accord au partage de tes données avec ton staff : tes pros ne voient aucune de tes données, quels que soient leurs droits."}
            {mode === "athlete" && (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() =>
                    setConsent.mutate([{ purpose: "staff_sharing", granted: true }], {
                      onSuccess: () => toast.success("Accord enregistré", { description: "Ton staff voit tes données selon ses droits." }),
                      onError: (e) => toast.error("Échec de l'enregistrement", { description: e.message }),
                    })
                  }
                  disabled={setConsent.isPending}
                  style={btnStyle("primary", "sm", setConsent.isPending)}
                >
                  Donner mon accord
                </button>
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <div style={{ fontSize: 13, color: C.tx3 }}>Chargement…</div>
        ) : active.length === 0 ? (
          <div style={{ ...ORDI_CARD, padding: "16px 22px", fontSize: 13, color: C.tx3 }}>Aucun professionnel pour l'instant.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {active.map((l) => (
              <StaffLinkCard key={l.id} link={l} manage={mode === "coach"} mode={mode} athleteFirstName={athleteFirstName} isNew={newIds?.has(l.id) ?? false} />
            ))}
          </div>
        )}
      </div>

      {invitations.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SectionHead
            n={n(1)}
            title={`Invitations en attente · ${invitations.length}`}
            hint="Un lien ne sert qu'une fois et reste valable 14 jours. Envoie-le par SMS, e-mail ou messagerie."
          />
          <div style={{ ...ORDI_CARD, overflow: "hidden" }}>
            {invitations.map((inv, i) => {
              const byMe = inv.invited_by === user?.id;
              const by = byMe ? "toi" : inv.invited_by_role === "athlete" ? (mode === "athlete" ? "toi" : first) : "le coach";
              return (
                <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "14px 22px", borderTop: i ? `1px solid ${C.brd}` : "none" }}>
                  <Avatar dashed size={40}><LinkIcon /></Avatar>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: C.tx }}>{professionLabel(inv.profession)}</div>
                    <div style={{ fontSize: 12.5, color: C.tx3 }}>Invité par {by} · expire le {frDate(inv.expires_at)}</div>
                  </div>
                  {copied === inv.id ? (
                    <span style={btnStyle("success", "sm")}><CheckIcon />Lien copié</span>
                  ) : (
                    <button
                      onClick={async () => { if (await copyText(staffInviteUrl(inv.token))) { setCopied(inv.id); toast.success("Lien copié"); } }}
                      style={btnStyle("ghost", "sm")}
                    >
                      Copier le lien
                    </button>
                  )}
                  <button onClick={() => cancel.mutate(inv.id)} style={btnStyle("ghost", "sm")}>Annuler</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {revoked.length > 0 && (
        <section>
          <button
            onClick={() => setShowRevoked((v) => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", fontSize: 12.5, color: C.tx3 }}
          >
            {showRevoked ? "▾" : "▸"} Accès retirés · {revoked.length}
          </button>
          {showRevoked && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
              {revoked.map((l) => <StaffLinkCard key={l.id} link={l} manage={false} mode={mode} athleteFirstName={athleteFirstName} />)}
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
