import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const S = {
  bg: "#0E0C0A", s1: "#1E1A16", s2: "#27221D",
  brd: "rgba(255,255,255,0.06)", brdL: "rgba(255,255,255,0.1)",
  tx: "#F2F2F4", tx2: "#9194A0", tx3: "#555866",
  ac: "#FFC933", g: "#66F03C", r: "#FF5A33",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 4,
  border: "1px solid " + S.brdL, background: S.s2, color: S.tx,
  fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = { fontSize: 12, color: S.tx2, marginBottom: 4, display: "block" };

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    // Le lien de récupération Supabase crée la session via le hash de l'URL.
    // Un lien expiré arrive avec ?error / #error_description à la place.
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    const linkError = url.searchParams.get("error_description") ?? hashParams.get("error_description");
    if (linkError) {
      setError("Lien invalide ou expiré — refais une demande depuis la page de connexion.");
      setHasSession(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => setHasSession(!!session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) setHasSession(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Le mot de passe doit contenir au moins 6 caractères."); return; }
    if (password !== confirm) { setError("Les deux mots de passe ne correspondent pas."); return; }
    setLoading(true);
    const { error: updErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updErr) {
      setError(
        updErr.message.includes("session")
          ? "Lien invalide ou expiré — refais une demande depuis la page de connexion."
          : updErr.message.includes("different from the old")
            ? "Le nouveau mot de passe doit être différent de l'ancien."
            : "Erreur : " + updErr.message,
      );
      return;
    }
    // Déconnecte cette session de récupération : l'utilisateur se reconnecte sur l'app
    await supabase.auth.signOut();
    setDone(true);
  }

  return (
    <div style={{ minHeight: "100vh", background: S.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: S.tx, letterSpacing: "-1px" }}>Agon</div>
          <div style={{ fontSize: 13, color: S.tx3, marginTop: 4 }}>Réinitialisation du mot de passe</div>
        </div>

        {done ? (
          <div style={{ background: S.s1, borderRadius: 6, padding: 24, border: "1px solid " + S.brd, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: S.g, marginBottom: 16 }}>✓</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: S.g, marginBottom: 8 }}>Mot de passe modifié !</div>
            <div style={{ fontSize: 14, color: S.tx2, lineHeight: 1.6 }}>
              Vous pouvez fermer cette page puis vous reconnecter sur l'app avec votre nouveau mot de passe.
            </div>
          </div>
        ) : (
          <div style={{ background: S.s1, borderRadius: 6, padding: 24, border: "1px solid " + S.brd }}>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>Nouveau mot de passe</label>
                <input
                  type={showPwd ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required minLength={6} placeholder="••••••••" style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Confirmer le nouveau mot de passe</label>
                <input
                  type={showPwd ? "text" : "password"} value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required minLength={6} placeholder="••••••••" style={inputStyle}
                />
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: S.tx2 }}>
                <input
                  type="checkbox" checked={showPwd}
                  onChange={(e) => setShowPwd(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: S.ac, cursor: "pointer" }}
                />
                Afficher les mots de passe
              </label>

              {hasSession === false && !error && (
                <div style={{ fontSize: 13, color: S.r, padding: "8px 10px", borderRadius: 4, background: S.r + "15" }}>
                  Lien invalide ou expiré — refais une demande depuis la page de connexion.
                </div>
              )}
              {error && (
                <div style={{ fontSize: 13, color: S.r, padding: "8px 10px", borderRadius: 4, background: S.r + "15" }}>{error}</div>
              )}

              <button
                type="submit" disabled={loading || hasSession === false}
                style={{
                  width: "100%", padding: "12px 0", borderRadius: 4, border: "none",
                  background: S.ac, color: "#fff", fontSize: 14, fontWeight: 700,
                  cursor: loading || hasSession === false ? "not-allowed" : "pointer",
                  fontFamily: "inherit", opacity: loading || hasSession === false ? 0.6 : 1,
                }}
              >
                {loading ? "Enregistrement…" : "Valider le nouveau mot de passe"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
