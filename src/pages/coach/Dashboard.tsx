import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, Profile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AthleteProfileForm from "@/components/coach/AthleteProfileForm";

const C = {
  bg: "#0E0C0A", s1: "#1E1A16", s2: "#27221D",
  brd: "rgba(255,255,255,0.06)", brdL: "rgba(255,255,255,0.1)",
  tx: "#F2F2F4", tx2: "#9194A0", tx3: "#555866",
  ac: "#FFC933", acS: "rgba(123,111,255,0.12)",
  coach: "#FFC933", coachS: "rgba(212,83,142,0.12)",
  g: "#66F03C", r: "#FF5A33",
};

export default function CoachDashboard() {
  const { user, profile, athletes } = useAuth();
  const navigate = useNavigate();
  const [copyMsg, setCopyMsg] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [editingAthlete, setEditingAthlete] = useState<Profile | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  async function handleRemoveAthlete(athleteId: string) {
    if (removing) return;
    setRemoving(true);
    await supabase.rpc("unlink_athlete", { athlete_id: athleteId });
    window.location.reload();
  }

  const isCoachAthlete = profile?.role === "coach" || profile?.role === "coach_athlete";

  async function handleCopyCode() {
    if (!profile?.coach_code) return;
    await navigator.clipboard.writeText(profile.coach_code);
    setCopyMsg("Code copié !");
    setTimeout(() => setCopyMsg(""), 2500);
  }

  // ── Accueil coach — sélection d'athlète ──
  return (
    <>
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <div style={{ padding: "20px 16px", maxWidth: 480, margin: "0 auto" }}>

            {/* Code coach */}
            <div style={{ background: C.s1, borderRadius: 6, padding: 16, border: "1px solid " + C.brd, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                Ton code coach
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: C.coach, letterSpacing: "0.2em", flex: 1 }}>
                  {profile?.coach_code || "------"}
                </div>
                <button onClick={handleCopyCode}
                  style={{ padding: "6px 14px", borderRadius: 4, border: "1px solid " + C.coach + "50", background: C.coachS, color: C.coach, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Copier
                </button>
              </div>
              <div style={{ fontSize: 11, color: C.tx3, marginTop: 6 }}>Donne ce code à tes athlètes lors de leur inscription</div>
              {copyMsg && <div style={{ fontSize: 12, color: C.g, marginTop: 6 }}>{copyMsg}</div>}
            </div>

            {/* Liste séances */}
            <div style={{ background: C.s1, borderRadius: 6, padding: 16, border: "1px solid " + C.brd, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
                Choisir un athlète
              </div>

              {athletes.length === 0 && !isCoachAthlete && (
                <div style={{ textAlign: "center", padding: "20px 0", color: C.tx3, fontSize: 13 }}>
                  Aucun athlète pour l'instant.<br />
                  <span style={{ fontSize: 12 }}>Partage ton code pour qu'ils s'inscrivent.</span>
                </div>
              )}

              {athletes.map(a => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <button onClick={() => navigate("/coach/" + a.id)}
                    style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, padding: "12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: C.coach + "25", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: C.coach, flexShrink: 0 }}>
                      {a.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{a.full_name}</div>
                      <div style={{ fontSize: 11, color: C.tx3 }}>
                        {a.age ? `${a.age} ans` : ""}{a.age && a.height_cm ? " · " : ""}{a.height_cm ? `${a.height_cm} cm` : ""}
                        {!a.age && !a.height_cm ? "Profil non renseigné" : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 18, color: C.tx3 }}>›</div>
                  </button>
                  <button onClick={() => setConfirmRemove(a.id)}
                    style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 4, border: "1px solid " + C.r + "40", background: "rgba(239,75,75,0.08)", color: C.r, fontSize: 16, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}
                    title="Retirer cet athlète">
                    ×
                  </button>
                </div>
              ))}

              {isCoachAthlete && (
                <button onClick={() => navigate("/coach/" + user!.id)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px", borderRadius: 4, border: "1px solid " + C.ac + "40", background: C.acS, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: C.ac + "25", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: C.ac, flexShrink: 0 }}>
                    {profile?.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>Moi — {profile?.full_name}</div>
                    <div style={{ fontSize: 11, color: C.ac }}>Mon programme personnel</div>
                  </div>
                  <div style={{ fontSize: 18, color: C.tx3 }}>›</div>
                </button>
              )}
            </div>

            {/* Déconnexion */}
            <button onClick={() => setShowLogoutConfirm(true)}
              style={{ width: "100%", marginTop: 8, padding: "12px", borderRadius: 6, border: "1px solid rgba(239,75,75,0.3)", background: "rgba(239,75,75,0.1)", color: "#FF5A33", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg><span>Déconnexion</span>
            </button>
          </div>
    </div>

    {/* Confirmation déconnexion */}
    {showLogoutConfirm && (
      <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        onClick={() => setShowLogoutConfirm(false)}>
        <div style={{ background: C.s1, borderRadius: 6, padding: 24, maxWidth: 320, width: "100%", border: "1px solid " + C.brd }}
          onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Se déconnecter ?</div>
          <div style={{ fontSize: 13, color: C.tx3, marginBottom: 20 }}>Êtes-vous sûr de vouloir vous déconnecter ?</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setShowLogoutConfirm(false)}
              style={{ flex: 1, padding: "12px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Annuler
            </button>
            <button onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}
              style={{ flex: 1, padding: "12px 0", borderRadius: 4, border: "none", background: C.rV, color: "#0E0C0A", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Déconnecter
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Confirmation retrait athlète */}
    {confirmRemove && (() => {
      const a = athletes.find(x => x.id === confirmRemove);
      return (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => !removing && setConfirmRemove(null)}>
          <div style={{ background: C.s1, borderRadius: 6, padding: 24, maxWidth: 340, width: "100%", border: "1px solid " + C.brd }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Retirer l'athlète ?</div>
            <div style={{ fontSize: 13, color: C.tx3, marginBottom: 20 }}>
              <span style={{ fontWeight: 600, color: C.tx }}>{a?.full_name}</span> sera dissocié de ton compte. Il pourra se rattacher à un autre coach.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmRemove(null)} disabled={removing}
                style={{ flex: 1, padding: "12px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 13, fontWeight: 600, cursor: removing ? "default" : "pointer", fontFamily: "inherit" }}>
                Annuler
              </button>
              <button onClick={() => handleRemoveAthlete(confirmRemove)} disabled={removing}
                style={{ flex: 1, padding: "12px 0", borderRadius: 4, border: "none", background: removing ? C.s2 : C.r, color: removing ? C.tx3 : "#fff", fontSize: 13, fontWeight: 700, cursor: removing ? "default" : "pointer", fontFamily: "inherit" }}>
                {removing ? "Retrait…" : "Retirer"}
              </button>
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}
