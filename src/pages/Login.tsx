import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type Tab = "login" | "register";
type RegisterRole = "coach" | "athlete" | null;

export default function Login() {
  const { login, registerCoach, registerAthleteWithCode } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("login");
  const [registerRole, setRegisterRole] = useState<RegisterRole>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [isCoachAthlete, setIsCoachAthlete] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await login(form.get("email") as string, form.get("password") as string);
      navigate("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const email = new FormData(e.currentTarget).get("email") as string;
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (resetErr) { setError(resetErr.message); return; }
    setForgotSent(true);
  }

  async function handleRegisterCoach(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const password = form.get("password") as string;
    const confirm = form.get("confirm") as string;
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas");
      setLoading(false);
      return;
    }
    try {
      await registerCoach(form.get("email") as string, password, form.get("fullName") as string, isCoachAthlete);
      setRegistered(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterAthlete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const password = form.get("password") as string;
    const confirm = form.get("confirm") as string;
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas");
      setLoading(false);
      return;
    }
    try {
      await registerAthleteWithCode(
        form.get("email") as string,
        password,
        form.get("fullName") as string,
        form.get("coachCode") as string,
      );
      setRegistered(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const S = {
    bg: "#0E0C0A", s1: "#1E1A16", s2: "#27221D",
    brd: "rgba(231,211,168,0.10)", brdL: "rgba(231,211,168,0.18)",
    tx: "#FFFFFF", tx2: "#B9AE9C", tx3: "#7D7468",
    ac: "#FFC933", acS: "rgba(255,201,51,0.12)",
    coach: "#FFC933", coachS: "rgba(255,201,51,0.12)",
    g: "#66F03C", r: "#FF5A33",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 4,
    border: "1px solid " + S.brdL, background: S.s2, color: S.tx,
    fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: S.tx2, marginBottom: 4, display: "block" };
  const btnPrimary = (color = S.ac): React.CSSProperties => ({
    width: "100%", padding: "12px 0", borderRadius: 4, border: "none",
    background: color, color: "#fff", fontSize: 14, fontWeight: 700,
    cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1,
  });

  if (registered) {
    return (
      <div style={{ minHeight: "100vh", background: S.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
        <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: S.tx, marginBottom: 8 }}>Compte créé !</div>
          <div style={{ fontSize: 14, color: S.tx2, marginBottom: 24, lineHeight: 1.6 }}>
            Vérifie ta boîte mail et clique sur le lien de confirmation, puis reviens te connecter.
          </div>
          <button onClick={() => { setRegistered(false); setTab("login"); setRegisterRole(null); }}
            style={{ ...btnPrimary(), maxWidth: 200 }}>
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: S.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: S.tx, letterSpacing: "-1px" }}>Agon</div>
          <div style={{ fontSize: 13, color: S.tx3, marginTop: 4 }}>Suivi de préparation physique</div>
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", background: S.s1, borderRadius: 4, padding: 3, marginBottom: 20, border: "1px solid " + S.brd }}>
          {(["login", "register"] as Tab[]).map(t => (
            <button key={t} onClick={() => { setTab(t); setRegisterRole(null); setForgot(false); setForgotSent(false); setError(""); }}
              style={{ flex: 1, padding: "9px 0", borderRadius: 4, border: "none", background: tab === t ? S.s2 : "transparent", color: tab === t ? S.tx : S.tx3, fontSize: 13, fontWeight: tab === t ? 700 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
              {t === "login" ? "Connexion" : "Créer un compte"}
            </button>
          ))}
        </div>

        <div style={{ background: S.s1, borderRadius: 6, padding: 24, border: "1px solid " + S.brd }}>

          {/* ---- CONNEXION ---- */}
          {tab === "login" && !forgot && (
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input name="email" type="email" required placeholder="ton@email.com" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Mot de passe</label>
                <input name="password" type="password" required placeholder="••••••••" style={inputStyle} />
              </div>
              {error && <div style={{ fontSize: 13, color: S.r, padding: "8px 10px", borderRadius: 4, background: S.r + "15" }}>{error}</div>}
              <button type="submit" style={btnPrimary()} disabled={loading}>
                {loading ? "Connexion…" : "Se connecter"}
              </button>
              <button type="button" onClick={() => { setForgot(true); setForgotSent(false); setError(""); }}
                style={{ background: "none", border: "none", color: S.tx3, fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: 0, textDecoration: "underline" }}>
                Mot de passe oublié ?
              </button>
            </form>
          )}

          {/* ---- MOT DE PASSE OUBLIÉ ---- */}
          {tab === "login" && forgot && (
            forgotSent ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: S.g, marginBottom: 12 }}>✓</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: S.tx, marginBottom: 8 }}>Email envoyé !</div>
                <div style={{ fontSize: 13, color: S.tx2, lineHeight: 1.6, marginBottom: 20 }}>
                  Vérifie ta boîte mail et clique sur le lien pour créer un nouveau mot de passe.
                  Pense à vérifier tes spams.
                </div>
                <button onClick={() => { setForgot(false); setForgotSent(false); }}
                  style={{ ...btnPrimary(), maxWidth: 220 }}>
                  Retour à la connexion
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgot} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <button type="button" onClick={() => { setForgot(false); setError(""); }}
                  style={{ background: "none", border: "none", color: S.tx3, fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: 0 }}>
                  ← Retour
                </button>
                <div style={{ fontSize: 15, fontWeight: 700, color: S.tx }}>Mot de passe oublié</div>
                <div style={{ fontSize: 12, color: S.tx2, lineHeight: 1.5 }}>
                  Entre ton email : tu recevras un lien pour créer un nouveau mot de passe.
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input name="email" type="email" required placeholder="ton@email.com" style={inputStyle} />
                </div>
                {error && <div style={{ fontSize: 13, color: S.r, padding: "8px 10px", borderRadius: 4, background: S.r + "15" }}>{error}</div>}
                <button type="submit" style={btnPrimary()} disabled={loading}>
                  {loading ? "Envoi…" : "Envoyer le lien de réinitialisation"}
                </button>
              </form>
            )
          )}

          {/* ---- INSCRIPTION — choix du rôle ---- */}
          {tab === "register" && !registerRole && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: S.tx, marginBottom: 4 }}>Tu es… ?</div>
              <button onClick={() => setRegisterRole("coach")}
                style={{ padding: "16px", borderRadius: 6, border: "1.5px solid " + S.coach + "50", background: S.coachS, color: S.coach, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>Coach</div>
                <div style={{ fontSize: 12, fontWeight: 400, color: S.tx2 }}>Tu crées les programmes et suis tes athlètes</div>
              </button>
              <button onClick={() => setRegisterRole("athlete")}
                style={{ padding: "16px", borderRadius: 6, border: "1.5px solid " + S.ac + "50", background: S.acS, color: S.ac, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>Athlète</div>
                <div style={{ fontSize: 12, fontWeight: 400, color: S.tx2 }}>Tu exécutes ton programme et suis ta progression</div>
              </button>
            </div>
          )}

          {/* ---- INSCRIPTION COACH ---- */}
          {tab === "register" && registerRole === "coach" && (
            <form onSubmit={handleRegisterCoach} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <button type="button" onClick={() => { setRegisterRole(null); setError(""); }}
                style={{ background: "none", border: "none", color: S.tx3, fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: 0, marginBottom: 4 }}>
                ← Retour
              </button>
              <div style={{ fontSize: 15, fontWeight: 700, color: S.coach, marginBottom: 4 }}>Compte Coach</div>
              <div>
                <label style={labelStyle}>Nom complet</label>
                <input name="fullName" required placeholder="Hugo Dupont" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input name="email" type="email" required placeholder="coach@example.com" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Mot de passe</label>
                <input name="password" type="password" required placeholder="••••••••" minLength={6} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Confirmer le mot de passe</label>
                <input name="confirm" type="password" required placeholder="••••••••" minLength={6} style={inputStyle} />
              </div>
              {/* Option coach-athlète */}
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 12px", borderRadius: 4, background: S.s2, border: "1px solid " + (isCoachAthlete ? S.ac : S.brd) }}>
                <input type="checkbox" checked={isCoachAthlete} onChange={e => setIsCoachAthlete(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: S.ac, cursor: "pointer" }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: S.tx }}>Je suis aussi mon propre athlète</div>
                  <div style={{ fontSize: 11, color: S.tx3 }}>Tu pourras aussi utiliser la vue athlète pour toi-même</div>
                </div>
              </label>
              {error && <div style={{ fontSize: 13, color: S.r, padding: "8px 10px", borderRadius: 4, background: S.r + "15" }}>{error}</div>}
              <button type="submit" style={btnPrimary(S.coach)} disabled={loading}>
                {loading ? "Création…" : "Créer mon compte coach"}
              </button>
            </form>
          )}

          {/* ---- INSCRIPTION ATHLÈTE ---- */}
          {tab === "register" && registerRole === "athlete" && (
            <form onSubmit={handleRegisterAthlete} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <button type="button" onClick={() => { setRegisterRole(null); setError(""); }}
                style={{ background: "none", border: "none", color: S.tx3, fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: 0, marginBottom: 4 }}>
                ← Retour
              </button>
              <div style={{ fontSize: 15, fontWeight: 700, color: S.ac, marginBottom: 4 }}>Compte Athlète</div>
              <div>
                <label style={labelStyle}>Code coach</label>
                <input name="coachCode" required placeholder="Ex : HUGO42" maxLength={6}
                  style={{ ...inputStyle, textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700, fontSize: 16 }} />
                <div style={{ fontSize: 11, color: S.tx3, marginTop: 4 }}>Demande ce code à ton coach</div>
              </div>
              <div>
                <label style={labelStyle}>Ton prénom / nom</label>
                <input name="fullName" required placeholder="Prénom Nom" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input name="email" type="email" required placeholder="toi@example.com" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Mot de passe</label>
                <input name="password" type="password" required placeholder="••••••••" minLength={6} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Confirmer le mot de passe</label>
                <input name="confirm" type="password" required placeholder="••••••••" minLength={6} style={inputStyle} />
              </div>
              {error && <div style={{ fontSize: 13, color: S.r, padding: "8px 10px", borderRadius: 4, background: S.r + "15" }}>{error}</div>}
              <button type="submit" style={btnPrimary()} disabled={loading}>
                {loading ? "Création…" : "Rejoindre mon coach"}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
