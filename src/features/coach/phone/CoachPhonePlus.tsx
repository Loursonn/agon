import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { C, alpha } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { useAppUpdates } from "@/features/shared/hooks/useAppUpdates";
import { useHasStaffLinks } from "@/features/staff/hooks/useMyStaffLinks";
import type { ReactNode } from "react";
import { CARD, Chevron, DISPLAY, KICKER, MONO, PhoneButton, PhonePage, Section, Tag, rowLine } from "./phoneUi";

const ic = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "square" as const };
const ICONS: Record<string, ReactNode> = {
  fiches: <svg {...ic}><path d="M6 3H14L19 8V21H6Z" /><path d="M14 3V8H19M9 13H16M9 17H14" /></svg>,
  library: <svg {...ic}><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></svg>,
  tests: <svg {...ic}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>,
  settings: <svg {...ic}><circle cx="12" cy="12" r="3" /><path d="M12 2V5M12 19V22M2 12H5M19 12H22M4.9 4.9L7 7M17 17L19.1 19.1M4.9 19.1L7 17M17 7L19.1 4.9" /></svg>,
  reviews: <svg {...ic}><path d="M4 5H20V16H9L5 20V16H4Z" /></svg>,
  staff: <svg {...ic}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20C3.5 15.5 14.5 15.5 15.5 20" /><path d="M18 8V14M15 11H21" /></svg>,
  other: <svg {...ic}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>,
};

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

  const tools: Array<{ label: string; sub?: string; to: string; show: boolean; icon: keyof typeof ICONS }> = [
    { label: "Fiches", to: "/coach/fiches", show: true, icon: "fiches" },
    { label: "Banque d’exercices", sub: "Lecture seule", to: "/coach/library", show: true, icon: "library" },
    { label: "Banque de tests", to: "/coach/tests", show: true, icon: "tests" },
    { label: "Reviews de la semaine", sub: "Bilans du dimanche", to: "/coach/reviews", show: true, icon: "reviews" },
    { label: "Paramètres", sub: "Compte, notifications, montres", to: "/coach/settings", show: true, icon: "settings" },
    { label: "Espace pro (staff)", to: "/staff", show: isStaffElsewhere, icon: "staff" },
    { label: "Avis athlètes", to: "/coach/avis", show: isCertified || isAdmin, icon: "other" },
    { label: "Roadmap", to: "/coach/roadmap", show: isCertified || isAdmin, icon: "other" },
    { label: "Coachs", to: "/coach/coaches", show: isCertified, icon: "other" },
  ];

  return (
    <PhonePage>
      <div style={{ display: "flex", alignItems: "center", height: 28 }}><span style={KICKER}>Coach</span></div>
      <h1 style={{ margin: 0, ...DISPLAY, fontSize: 22 }}>Plus</h1>

      <div style={{ ...CARD, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
        <span aria-hidden style={{
          width: 44, height: 44, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center",
          border: `1px solid ${C.ac}`, color: C.ac, ...MONO, fontSize: 12,
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
        <div style={{ padding: 14, borderRadius: 14, border: `1px dashed ${C.brdL}`, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <span style={{ ...KICKER, color: C.tx2 }}>Ton code coach</span>
            <div style={{ ...MONO, fontSize: 30, letterSpacing: "0.14em", color: C.ac, lineHeight: 1.2, marginTop: 2 }}>{code}</div>
            <div style={{ fontSize: 12, color: C.tx2, marginTop: 2 }}>Ton athlète l’entre à l’inscription pour te rejoindre.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <PhoneButton style={{ flex: 1, borderRadius: 12, fontSize: 14, color: C.tx }} onClick={() => {
              navigator.clipboard?.writeText(code).then(() => toast.success("Code copié"), () => toast.error("Copie impossible"));
            }}>
              <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4V16H8" /></svg>
              Copier
            </PhoneButton>
            <PhoneButton primary style={{ flex: 1, borderRadius: 12, fontSize: 14 }} onClick={() => void shareCoachCode(code)}>
              <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square"><path d="M12 15V3M7 8L12 3L17 8" /><path d="M5 12V20H19V12" /></svg>
              Partager
            </PhoneButton>
          </div>
        </div>
      )}

      <Section n={1} title="Nouveautés" right={unseen.length > 0 ? <span style={{ ...MONO, fontSize: 11, color: C.ac }}>{unseen.length} NON LUE{unseen.length > 1 ? "S" : ""}</span> : undefined}>
        <div style={{ ...CARD, padding: "0 14px" }}>
          {latest.map((n, i) => {
            const isNew = !reads[n.id];
            return (
              <button key={n.id} type="button" onClick={() => navigate("/coach/nouveautes")} style={{
                display: "flex", flexDirection: "column", gap: 5, width: "100%", textAlign: "left", padding: "12px 0", background: "none", border: "none",
                boxShadow: rowLine(i), color: C.tx, fontFamily: "inherit", cursor: "pointer",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {n.kind === "fix" ? <Tag>Correctif</Tag> : <Tag color={C.ac} filled>Nouveauté</Tag>}
                  <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{fmtShort(n.date)}</span>
                  <span style={{ flex: 1 }} />
                  {isNew && <span aria-label="Non lue" style={{ width: 8, height: 8, borderRadius: "50%", background: C.ac }} />}
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.35 }}>{n.title}</div>
                <div style={{ fontSize: 12.5, color: C.tx2, lineHeight: 1.45 }}>{n.summary}</div>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => navigate("/coach/nouveautes")} style={{ alignSelf: "flex-start", background: "none", border: "none", padding: "0 2px", marginTop: -4, color: C.ac, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer" }}>
          Toutes les nouveautés ›
        </button>
      </Section>

      <Section n={2} title="Outils">
        <div style={{ ...CARD, padding: "0 14px" }}>
          {tools.filter((t) => t.show).map((t, i) => (
            <button key={t.to} type="button" onClick={() => navigate(t.to)} style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", minHeight: 52, padding: "8px 0", background: "none",
              border: "none", boxShadow: rowLine(i), color: C.tx, fontFamily: "inherit", cursor: "pointer",
            }}>
              <span aria-hidden style={{ width: 34, height: 34, flex: "none", borderRadius: 10, background: C.s2, color: C.tx2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {ICONS[t.icon]}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14 }}>{t.label}</div>
                {t.sub && <div style={{ fontSize: 11.5, color: C.tx3 }}>{t.sub}</div>}
              </div>
              <Chevron />
            </button>
          ))}
        </div>
      </Section>

      <PhoneButton danger onClick={() => void logout()} style={{ width: "100%", height: 48, borderRadius: 12, fontSize: 14, borderColor: C.r }}>
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"><path d="M10 4H4V20H10" /><path d="M15 8L19 12L15 16M19 12H9" /></svg>
        Se déconnecter
      </PhoneButton>
      <div style={{ fontSize: 11.5, color: C.tx3, textAlign: "center" }}>Agon{notes[0] ? ` · version du ${new Date(notes[0].date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}` : ""}</div>
    </PhonePage>
  );
}
