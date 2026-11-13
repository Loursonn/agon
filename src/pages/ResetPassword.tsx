import { useEffect, useState } from "react";
import { getSession, onAuthChange, signOut, updatePassword } from "@/api/auth";
import { errorMessage } from "@/lib/errors";
import { Link } from "react-router-dom";
import { CircleCheck } from "lucide-react";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { C } from "@/lib/theme";
import { AUTH_INPUT } from "./auth/authStyles";
import { AuthButton, AuthError, AuthField, AuthLogo, AuthScreen, AuthTitle } from "./auth/AuthUi";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState<string | null>(null);
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
    getSession().then((session) => { setHasSession(!!session); setEmail(session?.user?.email ?? null); }, () => setHasSession(false));
    return onAuthChange((_e, session) => {
      if (session) { setHasSession(true); setEmail(session.user?.email ?? null); }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Le mot de passe doit contenir au moins 6 caractères."); return; }
    if (password !== confirm) { setError("Les deux mots de passe ne correspondent pas."); return; }
    setLoading(true);
    let updErr: { message: string } | null = null;
    try {
      await updatePassword(password);
    } catch (err) {
      updErr = { message: errorMessage(err) };
    }
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
    await signOut("global").catch(() => {});
    setDone(true);
  }

  const mismatch = !!confirm && password !== confirm;
  const expired = hasSession === false && !error ? "Lien invalide ou expiré — refais une demande depuis la page de connexion." : null;
  return (
    <form onSubmit={handleSubmit}>
      <AuthScreen
        top={<AuthLogo size="small" subtitle="Réinitialisation du mot de passe" />}
        footer={done
          ? <Link to="/login" style={{ textDecoration: "none" }}><AuthButton type="button">Se connecter</AuthButton></Link>
          : <AuthButton disabled={loading || hasSession === false || mismatch}>{loading ? "Enregistrement…" : "Enregistrer le mot de passe"}</AuthButton>}
      >
        {done ? (
          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 14 }}>
            <CircleCheck size={40} color={C.g} strokeWidth={1.5} />
            <AuthTitle title="Mot de passe modifié" text="Reconnecte-toi avec ton nouveau mot de passe." />
          </div>
        ) : (
          <>
            <div style={{ marginTop: 12 }}>
              <AuthTitle title="Nouveau mot de passe" text={email ? <>Choisis un mot de passe pour <strong style={{ color: C.tx }}>{email}</strong>.</> : "Choisis ton nouveau mot de passe."} />
            </div>
            <AuthField label="Nouveau mot de passe" hint="6 caractères minimum.">
              <PasswordInput aria-label="Nouveau mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" placeholder="••••••••" iconColor={C.tx2} style={AUTH_INPUT} />
            </AuthField>
            <AuthField label="Confirmer" error={mismatch ? "Les deux mots de passe ne sont pas identiques." : null}>
              <PasswordInput aria-label="Confirmer" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} autoComplete="new-password" placeholder="••••••••" iconColor={C.tx2} style={{ ...AUTH_INPUT, borderColor: mismatch ? C.r : AUTH_INPUT.border as string }} />
            </AuthField>
            {(error || expired) && <AuthError>{error || expired}</AuthError>}
          </>
        )}
      </AuthScreen>
    </form>
  );
}
