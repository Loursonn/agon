import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import WeightliftingTracker from "@/components/WeightliftingTracker.jsx";

const C = {
  bg: "#0E0C0A", s1: "#1E1A16", s2: "#27221D",
  brd: "rgba(255,255,255,0.06)", brdL: "rgba(255,255,255,0.1)",
  tx: "#F2F2F4", tx2: "#9194A0", tx3: "#555866",
  ac: "#FFC933", acS: "rgba(123,111,255,0.12)",
  g: "#66F03C", r: "#FF5A33",
};

export default function AthleteDashboard() {
  const { user, profile, linkToCoach } = useAuth();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showChangeCoach, setShowChangeCoach] = useState(false);

  if (!user) return null;

  async function handleLink() {
    if (!code.trim() || loading) return;
    setLoading(true);
    setMsg("");
    try {
      await linkToCoach(code.trim());
      setMsg("Coach rejoint !");
      setCode("");
      setTimeout(() => setShowChangeCoach(false), 1500);
    } catch (e: any) {
      setMsg(e.message || "Code invalide");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Bandeau coach — toujours visible */}
      <div style={{ background: C.s1, borderBottom: "1px solid " + C.brd, padding: "10px 16px" }}>
        {!showChangeCoach ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, color: C.tx3 }}>
              {profile?.coach_id ? "Coach assigné" : "Aucun coach assigné"}
            </div>
            <button
              onClick={() => { setShowChangeCoach(true); setMsg(""); }}
              style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid " + C.ac + "50", background: C.acS, color: C.ac, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              {profile?.coach_id ? "Changer de coach" : "Rejoindre un coach"}
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: C.tx3, marginBottom: 8 }}>
              {profile?.coach_id ? "Entrer le code du nouveau coach" : "Entrer le code coach"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="Code coach (ex: R4BL7M)"
                maxLength={6}
                autoFocus
                style={{ flex: 1, padding: "8px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none", letterSpacing: "0.1em" }}
              />
              <button
                onClick={handleLink}
                disabled={loading || !code.trim()}
                style={{ padding: "8px 16px", borderRadius: 4, border: "none", background: code.trim() ? C.ac : C.s2, color: code.trim() ? "#fff" : C.tx3, fontSize: 13, fontWeight: 600, cursor: code.trim() ? "pointer" : "default", fontFamily: "inherit" }}
              >
                {loading ? "..." : "Valider"}
              </button>
              <button
                onClick={() => { setShowChangeCoach(false); setMsg(""); setCode(""); }}
                style={{ padding: "8px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
              >
                Annuler
              </button>
            </div>
            {msg && (
              <div style={{ fontSize: 12, marginTop: 6, color: msg === "Coach rejoint !" ? C.g : C.r }}>{msg}</div>
            )}
          </div>
        )}
      </div>

      <WeightliftingTracker
        athleteId={user.id}
        defaultMode="athlete"
        canToggleMode={false}
        userName={profile?.full_name}
        athleteProfile={profile}
      />
    </div>
  );
}
