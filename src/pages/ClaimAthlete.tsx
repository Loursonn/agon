import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { claimAthleteAccount } from "@/api/account";
import { errorMessage } from "@/lib/errors";
import { LEGAL_ROUTES } from "@/lib/legal";
import { initials } from "@/lib/initials";
import { C, alpha } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { localIsoDay } from "@shared/domain/dates";
import { MIN_AGE, OLDEST_BIRTH_DATE } from "@/lib/age";
import { useClaimInfo } from "@/features/shared/hooks/useAthleteClaimLink";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { AuthButton, AuthError, AuthField, AuthLogo, AuthScreen, AuthTitle } from "@/pages/auth/AuthUi";
import { AUTH_INPUT } from "@/pages/auth/authStyles";

/**
 * Première connexion d'un athlète dont le coach a déjà préparé le compte.
 * Prénom et nom sont déjà connus : il choisit son email et son
 * mot de passe, et donne sa date de naissance (âge minimum 15 ans, vérifié par
 * l'API puis par l'Edge Function `claim-athlete`). Le consentement RGPD est recueilli par ConsentGate à la
 * première connexion, comme pour toute inscription.
 */
const link = { background: "none", border: "none", padding: 0, color: C.ac, fontSize: "inherit", fontFamily: "inherit", cursor: "pointer", textDecoration: "none" } as const;

function Check({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ width: 20, height: 20, accentColor: C.ac, cursor: "pointer", marginTop: 1, flexShrink: 0 }} />
      <span>{children}</span>
    </label>
  );
}

export default function ClaimAthlete() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { data: info, isLoading } = useClaimInfo(token);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const mismatch = !!confirm && password !== confirm;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const birthDate = String(form.get("birthDate") ?? "");
    if (mismatch) return;
    setLoading(true);
    try {
      await claimAthleteAccount(token, email, password, birthDate);
      navigate("/");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (isLoading) {
    return (
      <AuthScreen top={<div style={{ marginTop: 28 }}><AuthLogo /></div>}>
        <div style={{ textAlign: "center", fontSize: 14, color: C.tx2 }}>Chargement…</div>
      </AuthScreen>
    );
  }

  if (!info) {
    return (
      <AuthScreen top={<div style={{ marginTop: 28 }}><AuthLogo /></div>}>
        <AuthTitle
          title="Lien invalide"
          text={<>Ce lien est incorrect ou a déjà été utilisé. Si tu as déjà activé ton compte,{" "}
            <Link to="/login" style={{ color: C.ac }}>connecte-toi</Link> ; sinon demande un nouveau lien à ton coach.</>}
        />
      </AuthScreen>
    );
  }

  const fullName = [info.first_name, info.last_name].filter(Boolean).join(" ");
  const coachName = info.coach_name?.trim() || "";

  return (
    <form onSubmit={handleSubmit}>
      <AuthScreen
        top={<AuthLogo size="small" />}
        footer={<AuthButton disabled={loading || !acceptTerms || mismatch}>{loading ? "Création…" : "Créer mon compte"}</AuthButton>}
      >
        <AuthTitle
          title={coachName ? `${coachName} t’invite` : "Tu es invité(e)"}
          text="Crée ton compte athlète pour recevoir tes séances."
        />
        {coachName && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, background: alpha(C.ac, 0.06), border: `1px solid ${alpha(C.ac, 0.25)}` }}>
            <span style={{ width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: alpha(C.ac, 0.14), color: C.ac, ...MONO, fontSize: 15, flex: "none" }}>{initials(coachName)}</span>
            <span style={{ fontSize: 16, fontWeight: 500 }}>{coachName}</span>
          </div>
        )}
        <AuthField label="Prénom et nom">
          <input aria-label="Prénom et nom" value={fullName} readOnly style={{ ...AUTH_INPUT, color: C.tx2 }} />
        </AuthField>
        <AuthField label="Date de naissance" hint={`Agon est réservé aux personnes de ${MIN_AGE} ans et plus.`}>
          <input aria-label="Date de naissance" name="birthDate" type="date" required min={OLDEST_BIRTH_DATE} max={localIsoDay()} style={{ ...AUTH_INPUT, colorScheme: "dark" }} />
        </AuthField>
        <AuthField label="E-mail">
          <input aria-label="E-mail" name="email" type="email" required autoComplete="email" placeholder="ton@email.fr" style={AUTH_INPUT} />
        </AuthField>
        <AuthField label="Mot de passe" hint="8 caractères minimum.">
          <PasswordInput aria-label="Mot de passe" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" iconColor={C.tx2} style={AUTH_INPUT} />
        </AuthField>
        <AuthField label="Confirmer le mot de passe" error={mismatch ? "Les deux mots de passe ne sont pas identiques." : null}>
          <PasswordInput aria-label="Confirmer le mot de passe" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" iconColor={C.tx2} style={{ ...AUTH_INPUT, ...(mismatch ? { borderColor: C.r } : null) }} />
        </AuthField>
        <Check on={acceptTerms} onChange={setAcceptTerms}>
          <span style={{ fontSize: 13, color: C.tx2, lineHeight: 1.5 }}>
            J’ai lu et j’accepte les <Link to={LEGAL_ROUTES.terms} target="_blank" style={{ color: C.ac }}>CGU</Link> et la{" "}
            <Link to={LEGAL_ROUTES.privacy} target="_blank" style={{ color: C.ac }}>politique de confidentialité</Link>.
          </span>
        </Check>
        {error && <AuthError>{error}</AuthError>}
        <div style={{ textAlign: "center", fontSize: 13, color: C.tx2 }}>
          Déjà un compte ? <Link to="/login" style={link}>Me connecter</Link>
        </div>
      </AuthScreen>
    </form>
  );
}
