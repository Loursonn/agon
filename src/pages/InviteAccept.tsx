import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage } from "@/lib/errors";
import { useAuth } from "@/hooks/useAuth";
import { localIsoDay } from "@shared/domain/dates";
import { MIN_AGE, OLDEST_BIRTH_DATE } from "@/lib/age";
import { LEGAL_ROUTES } from "@/lib/legal";
import { invitationCoachName, invitationIsValid } from "@/api/account";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { C, alpha } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { initials } from "@/lib/initials";
import { AUTH_INPUT } from "./auth/authStyles";
import { AuthButton, AuthError, AuthField, AuthLogo, AuthScreen, AuthTitle } from "./auth/AuthUi";

/**
 * Lien d'invitation (planche AccesPagesSimples, écran 02) : « Agon Démo
 * t'invite ». Le coach est déjà connu, pas de code à saisir.
 */
export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const { registerAthlete } = useAuth();
  const navigate = useNavigate();
  const [coachName, setCoachName] = useState<string | null | undefined>(undefined);
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) { setCoachName(null); return; }
    let alive = true;
    // Le nom du coach seulement si le lien peut encore servir à s'inscrire.
    Promise.all([invitationCoachName(token), invitationIsValid(token)])
      .then(([n, valid]) => { if (alive) setCoachName(valid ? n : null); }, () => { if (alive) setCoachName(null); });
    return () => { alive = false; };
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Les deux mots de passe ne sont pas identiques."); return; }
    setLoading(true);
    try {
      await registerAthlete(email, password, fullName, birthDate, token!);
      navigate("/");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const mismatch = !!confirm && password !== confirm;
  const ready = !!coachName && acceptTerms && !!fullName.trim() && !!birthDate && !!email && password.length >= 6 && !mismatch && !loading;
  const name = coachName ?? "Ton coach";

  return (
    <form onSubmit={handleSubmit}>
      <AuthScreen
        top={<AuthLogo size="small" />}
        footer={
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <AuthButton disabled={!ready}>{loading ? "Création…" : "Créer mon compte"}</AuthButton>
            <div style={{ textAlign: "center", fontSize: 13, color: C.tx2 }}>
              Déjà un compte ? <Link to="/login" style={{ color: C.ac, textDecoration: "none" }}>Me connecter</Link>
            </div>
          </div>
        }
      >
        <div style={{ marginTop: 12 }}>
          <AuthTitle title={`${name} t’invite`} text="Crée ton compte athlète pour recevoir tes séances." />
        </div>
        {coachName === null && (
          <AuthError>
            Ce lien d’invitation n’est plus valable. Demande le code coach à ton coach, puis{" "}
            <Link to="/login" style={{ color: C.ac }}>crée ton compte avec le code</Link>.
          </AuthError>
        )}
        {coachName && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, background: C.s1, border: `1px solid ${C.brd}` }}>
            <span style={{ width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: alpha(C.ac, 0.14), color: C.ac, ...MONO, fontSize: 15, flex: "none" }}>{initials(coachName)}</span>
            <span style={{ fontSize: 16, fontWeight: 500 }}>{coachName}</span>
          </div>
        )}
        <AuthField label="Prénom et nom">
          <input aria-label="Prénom et nom" required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Prénom Nom" style={AUTH_INPUT} />
        </AuthField>
        <AuthField label="Date de naissance" hint={`${MIN_AGE} ans minimum.`}>
          <input aria-label="Date de naissance" type="date" required min={OLDEST_BIRTH_DATE} max={localIsoDay()} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} style={{ ...AUTH_INPUT, colorScheme: "dark" }} />
        </AuthField>
        <AuthField label="E-mail">
          <input aria-label="E-mail" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ton@email.fr" style={AUTH_INPUT} />
        </AuthField>
        <AuthField label="Mot de passe" hint="6 caractères minimum.">
          <PasswordInput aria-label="Mot de passe" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" iconColor={C.tx2} style={AUTH_INPUT} />
        </AuthField>
        <AuthField label="Confirmer le mot de passe" error={mismatch ? "Les deux mots de passe ne sont pas identiques." : null}>
          <PasswordInput aria-label="Confirmer le mot de passe" required minLength={6} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" iconColor={C.tx2} style={AUTH_INPUT} />
        </AuthField>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} style={{ width: 20, height: 20, accentColor: C.ac, cursor: "pointer", marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: C.tx2, lineHeight: 1.5 }}>
            J’accepte les <Link to={LEGAL_ROUTES.terms} target="_blank" style={{ color: C.ac }}>CGU</Link> et la{" "}
            <Link to={LEGAL_ROUTES.privacy} target="_blank" style={{ color: C.ac }}>politique de confidentialité</Link>.
          </span>
        </label>
        {error && <AuthError>{error}</AuthError>}
      </AuthScreen>
    </form>
  );
}
