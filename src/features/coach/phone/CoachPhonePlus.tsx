import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { C, alpha } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { useAppUpdates } from "@/features/shared/hooks/useAppUpdates";
import { useHasStaffLinks } from "@/features/staff/hooks/useMyStaffLinks";
import { CARD, Chevron, DISPLAY, KICKER, MONO, PhoneButton, PhonePage, Section, rowLine } from "./phoneUi";

function fmtShort(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Partage le code coach (feuille de partage du téléphone, sinon copie). */
export async function shareCoachCode(code: string) {
  const text = `Rejoins-moi sur Agon : à l'inscription, entre le code coach ${code}.`;
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: "Agon", text });
      return;
    }
  } catch {
    return; // partage annulé
  }
  try {
    await navigator.clipboard.writeText(code);
    toast.success("Code copié");
  } catch {
    toast.error("Copie impossible");
  }
}

/**
 * Onglet « Plus » du coach sur téléphone (planche CoachTelPlus) : code coach,
 * nouveautés, outils (fiches, banques en lecture), paramètres, déconnexion.
 */
export default function CoachPhonePlus() {
  const navigate = useNavigate();
  const { user, profile, athletes, logout } = useAuth();
  const { notes, reads, unseen } = useAppUpdates(user?.id);
  const { hasLinks: isStaffElsewhere } = useHasStaffLinks();
  const code = profile?.coach_code ?? null;
  const latest = notes.slice(0, 3);
  const isCertified = !!profile?.is_certified_coach;
  const isAdmin = !!profile?.is_admin;

  const tools: Array<{ label: string; sub?: string; to: string; show: boolean }> = [
    { label: "Fiches", to: "/coach/fiches", show: true },
    { label: "Banque d’exercices", sub: "Lecture seule", to: "/coach/library", show: true },
    { label: "Banque de tests", to: "/coach/tests", show: true },
    { label: "Paramètres", sub: "Compte, notifications, montres", to: "/coach/settings", show: true },
    { label: "Espace pro (staff)", to: "/staff", show: isStaffElsewhere },
    { label: "Avis athlètes", to: "/coach/avis", show: isCertified || isAdmin },
    { label: "Roadmap", to: "/coach/roadmap", show: isCertified || isAdmin },
    { label: "Coachs", to: "/coach/coaches", show: isCertified },
  ];

  return (
    <PhonePage>
      <div style={{ display: "flex", alignItems: "center", height: 28 }}><span style={KICKER}>Coach</span></div>
      <h1 style={{ margin: 0, ...DISPLAY, fontSize: 22 }}>Plus</h1>

      <div style={{ ...CARD, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span aria-hidden style={{
          width: 44, height: 44, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center",
          border: `1px solid ${C.ac}`, color: C.ac, ...MONO, fontSize: 14,
        }}>{(profile?.full_name || "?").charAt(0).toUpperCase()}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{profile?.full_name || "Coach"}</div>
          <div style={{ fontSize: 12, color: C.tx2 }}>Coach · {athletes.length} athlète{athletes.length > 1 ? "s" : ""}</div>
        </div>
        {(profile?.role === "coach" || profile?.role === "coach_athlete") && (
          <button type="button" onClick={() => navigate("/athlete")} style={{
            height: 34, padding: "0 12px", borderRadius: 10, border: `1px solid ${alpha(C.ac, 0.45)}`, background: "transparent",
            color: C.ac, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
          }}>Mode athlète</button>
        )}
      </div>

      {code && (
        <div style={{ padding: "12px 14px", borderRadius: 14, border: `1px dashed ${C.brdL}`, display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <span style={{ ...KICKER, color: C.tx2 }}>Ton code coach</span>
            <div style={{ ...MONO, fontSize: 22, letterSpacing: "0.12em", color: C.ac, marginTop: 2 }}>{code}</div>
            <div style={{ fontSize: 12, color: C.tx3 }}>Ton athlète l’entre à l’inscription pour te rejoindre.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <PhoneButton style={{ flex: 1, height: 38 }} onClick={() => {
              navigator.clipboard?.writeText(code).then(() => toast.success("Code copié"), () => toast.error("Copie impossible"));
            }}>Copier</PhoneButton>
            <PhoneButton style={{ flex: 1, height: 38, color: C.ac, borderColor: alpha(C.ac, 0.55) }} onClick={() => void shareCoachCode(code)}>Partager</PhoneButton>
          </div>
        </div>
      )}

      <Section n={1} title="Nouveautés" right={unseen.length > 0 ? <span style={{ ...MONO, fontSize: 11, color: C.ac }}>{unseen.length} NON LUE{unseen.length > 1 ? "S" : ""}</span> : undefined}>
        <div style={{ ...CARD, padding: "2px 14px" }}>
          {latest.map((n, i) => {
            const isNew = !reads[n.id];
            return (
              <button key={n.id} type="button" onClick={() => navigate("/coach/nouveautes")} style={{
                display: "block", width: "100%", textAlign: "left", padding: "12px 0", background: "none", border: "none",
                boxShadow: rowLine(i), color: C.tx, fontFamily: "inherit", cursor: "pointer",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: n.kind === "fix" ? C.b : C.ac }}>
                    {n.kind === "fix" ? "Correctif" : "Nouveauté"}
                  </span>
                  <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{fmtShort(n.date)}</span>
                  {isNew && <span aria-label="Non lue" style={{ width: 7, height: 7, borderRadius: "50%", background: C.ac }} />}
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, marginTop: 3 }}>{n.title}</div>
                <div style={{ fontSize: 12, color: C.tx2, marginTop: 2 }}>{n.summary}</div>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => navigate("/coach/nouveautes")} style={{ alignSelf: "flex-start", background: "none", border: "none", padding: "0 2px", color: C.ac, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
          Toutes les nouveautés ›
        </button>
      </Section>

      <Section n={2} title="Outils">
        <div style={{ ...CARD, padding: "2px 14px" }}>
          {tools.filter((t) => t.show).map((t, i) => (
            <button key={t.to} type="button" onClick={() => navigate(t.to)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "13px 0", background: "none",
              border: "none", boxShadow: rowLine(i), color: C.tx, fontFamily: "inherit", cursor: "pointer",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14 }}>{t.label}</div>
                {t.sub && <div style={{ fontSize: 12, color: C.tx3 }}>{t.sub}</div>}
              </div>
              <Chevron />
            </button>
          ))}
        </div>
      </Section>

      <PhoneButton danger onClick={() => void logout()} style={{ width: "100%" }}>Se déconnecter</PhoneButton>
      <div style={{ fontSize: 11.5, color: C.tx3, textAlign: "center" }}>Agon{notes[0] ? ` · version du ${new Date(notes[0].date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}` : ""}</div>
    </PhonePage>
  );
}
