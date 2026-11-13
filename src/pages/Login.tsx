import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CircleCheck, Dumbbell, Users } from "lucide-react";
import { errorMessage } from "@/lib/errors";
import { LEGAL_ROUTES } from "@/lib/legal";
import { localIsoDay } from "@shared/domain/dates";
import { MIN_AGE, OLDEST_BIRTH_DATE } from "@/lib/age";
import { useAuth } from "@/hooks/useAuth";
import { resendSignupEmail, sendPasswordReset } from "@/api/auth";
import { coachPreviewByCode, normalizeCoachCode } from "@/api/account";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { C, alpha } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { initials } from "@/lib/initials";
import { AUTH_INPUT } from "./auth/authStyles";
import { AuthButton, AuthError, AuthField, AuthLogo, AuthScreen, AuthTitle, LegalLinks } from "./auth/AuthUi";
import { publicWebOrigin } from "@/lib/native";

type Tab = "login" | "register";
type Role = "athlete" | "coach";
/** Inscription : 1 rôle → 2 code du coach (athlète) → 3 compte. */
type Step = 1 | 2 | 3;

const link = { background: "none", border: "none", padding: 0, color: C.ac, fontSize: 13, cursor: "pointer", fontFamily: "inherit" } as const;

/**
 * Connexion et inscription (planche AccesConnexion). Inscription en 3 étapes :
 * rôle, code du coach (vérifié dès le 6ᵉ caractère, le coach trouvé s'affiche),
 * compte. L'accord sur les données de santé est demandé à la première
 * connexion (ConsentGate), après la confirmation de l'e-mail.
 */
export default function Login() {
  const { login, registerCoach, registerAthleteWithCode } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Connexion / mot de passe oublié
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [forgot, setForgot] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  // Inscription
  const [step, setStep] = useState<Step>(1);
  const [role, setRole] = useState<Role | null>(null);
  const [isCoachAthlete, setIsCoachAthlete] = useState(false);
  const [code, setCode] = useState("");
  const [coach, setCoach] = useState<{ code: string; name: string | null } | null>(null);
  const [checking, setChecking] = useState(false);
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [confirm, setConfirm] = useState("");
  /*
    Acceptation contractuelle des CGU et de la politique. Distincte du
    consentement au traitement des données de santé (art. 9 RGPD), recueilli
    par ConsentGate à la première connexion.
  */
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [resent, setResent] = useState(false);

  // Code vérifié dès le 6ᵉ caractère.
  useEffect(() => {
    const c = normalizeCoachCode(code);
    if (c.length !== 6) { setCoach(null); return; }
    let alive = true;
    setChecking(true);
    coachPreviewByCode(c)
      .then((name) => { if (alive) setCoach({ code: c, name }); })
      .catch(() => { if (alive) setCoach(null); })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [code]);

  const switchTab = (t: Tab) => { setTab(t); setStep(1); setForgot(false); setForgotSent(false); setError(""); };

  async function run(fn: () => Promise<void>) {
    setError("");
    setLoading(true);
    try { await fn(); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); }
  }

  const handleLogin = (e: FormEvent) => { e.preventDefault(); void run(async () => { await login(email, password); navigate("/"); }); };
  const handleForgot = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => { await sendPasswordReset(email, `${publicWebOrigin()}/reset-password`); setForgotSent(true); });
  };
  const handleRegister = (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Les deux mots de passe ne sont pas identiques."); return; }
    void run(async () => {
      if (role === "coach") await registerCoach(email, password, fullName, birthDate, isCoachAthlete);
      else await registerAthleteWithCode(email, password, fullName, birthDate, normalizeCoachCode(code));
      setRegistered(true);
    });
  };

  const tabs = (
    <div style={{ display: "flex", padding: 3, borderRadius: 12, background: C.s1, border: `1px solid ${C.brd}` }}>
      {(["login", "register"] as Tab[]).map((t) => (
        <button key={t} type="button" aria-pressed={tab === t} onClick={() => switchTab(t)}
          style={{ flex: 1, height: 40, borderRadius: 10, border: "none", background: tab === t ? C.s2 : "transparent", color: tab === t ? C.tx : C.tx3, fontSize: 14, fontWeight: tab === t ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>
          {t === "login" ? "Connexion" : "Inscription"}
        </button>
      ))}
    </div>
  );

  // ── E-mail à confirmer ──
  if (registered) {
    return (
      <AuthScreen top={<AuthLogo size="small" />} footer={<AuthButton type="button" onClick={() => { setRegistered(false); switchTab("login"); }}>Se connecter</AuthButton>}>
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 14 }}>
          <CircleCheck size={40} color={C.g} strokeWidth={1.5} />
          <AuthTitle title="Compte créé" text={<>On t’a envoyé un e-mail à <strong style={{ color: C.tx }}>{email}</strong>. Touche le lien de confirmation, puis reviens te connecter.</>} />
          {error && <AuthError>{error}</AuthError>}
          <div>
            <button type="button" disabled={resent || loading} style={{ ...link, opacity: resent ? 0.6 : 1 }}
              onClick={() => void run(async () => { await resendSignupEmail(email); setResent(true); })}>
              {resent ? "E-mail renvoyé" : "Renvoyer l’e-mail"}
            </button>
          </div>
        </div>
      </AuthScreen>
    );
  }

  // ── Connexion ──
  if (tab === "login" && !forgot) {
    return (
      <form onSubmit={handleLogin}>
        <AuthScreen
          top={<div style={{ marginTop: 28 }}><AuthLogo subtitle="Suivi de préparation physique" /></div>}
          footer={<LegalLinks />}
        >
          {tabs}
          <AuthField label="E-mail">
            <input aria-label="E-mail" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ton@email.fr" style={AUTH_INPUT} />
          </AuthField>
          <AuthField label="Mot de passe" hint={
            <button type="button" style={link} onClick={() => { setForgot(true); setForgotSent(false); setError(""); }}>Mot de passe oublié ?</button>
          }>
            <PasswordInput aria-label="Mot de passe" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" iconColor={C.tx2} style={AUTH_INPUT} />
          </AuthField>
          {error && <AuthError>{error}</AuthError>}
          <AuthButton disabled={loading}>{loading ? "Connexion…" : "Se connecter"}</AuthButton>
          <div style={{ textAlign: "center", fontSize: 13, color: C.tx2 }}>
            Pas encore de compte ? <button type="button" style={link} onClick={() => switchTab("register")}>Créer un compte</button>
          </div>
        </AuthScreen>
      </form>
    );
  }

  // ── Mot de passe oublié ──
  if (tab === "login" && forgot) {
    return (
      <form onSubmit={handleForgot}>
        <AuthScreen
          top={<BackRow label="Mot de passe oublié" onBack={() => { setForgot(false); setError(""); }} />}
          footer={!forgotSent && <AuthButton disabled={loading}>{loading ? "Envoi…" : "Recevoir le lien"}</AuthButton>}
        >
          <AuthTitle title="Nouveau mot de passe" text="Entre ton e-mail : tu reçois un lien pour en créer un nouveau." />
          <AuthField label="E-mail">
            <input aria-label="E-mail" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ton@email.fr" style={AUTH_INPUT} disabled={forgotSent} />
          </AuthField>
          {error && <AuthError>{error}</AuthError>}
          {forgotSent && (
            <div role="status" style={{ display: "flex", gap: 12, padding: 14, borderRadius: 14, background: alpha(C.g, 0.08), border: `1px solid ${alpha(C.g, 0.35)}` }}>
              <CircleCheck size={20} color={C.g} strokeWidth={1.75} style={{ flex: "none", marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 500 }}>Lien envoyé</div>
                <div style={{ fontSize: 12.5, color: C.tx2, marginTop: 3, lineHeight: 1.45 }}>Regarde ta boîte mail (et les indésirables). Le lien ouvre la page « Nouveau mot de passe ».</div>
                <button type="button" style={{ ...link, marginTop: 10 }} onClick={() => { setForgot(false); setForgotSent(false); }}>Retour à la connexion</button>
              </div>
            </div>
          )}
        </AuthScreen>
      </form>
    );
  }

  const steps = role === "coach" ? 2 : 3;
  const stepNo = role === "coach" && step === 3 ? 2 : step;
  const kicker = `Inscription · ${stepNo} / ${steps}`;
  const back = () => { setError(""); setStep(step === 3 && role === "athlete" ? 2 : 1); };

  // ── Inscription 1 : rôle ──
  if (step === 1) {
    const card = (r: Role, title: string, text: string, Icon: typeof Dumbbell) => {
      const on = role === r;
      return (
        <button key={r} type="button" aria-pressed={on} onClick={() => setRole(r)}
          style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: 16, borderRadius: 16, textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: C.tx,
            background: on ? alpha(C.ac, 0.1) : C.s1, border: on ? `1.5px solid ${C.ac}` : `1px solid ${alpha(C.tx, 0.18)}` }}>
          <span style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", background: alpha(C.ac, 0.12), color: C.ac }}>
            <Icon size={20} strokeWidth={1.75} />
          </span>
          <span>
            <span style={{ display: "block", fontSize: 17, fontWeight: 500 }}>{title}</span>
            <span style={{ display: "block", fontSize: 13, color: C.tx2, marginTop: 3, lineHeight: 1.45 }}>{text}</span>
          </span>
        </button>
      );
    };
    return (
      <AuthScreen
        top={<>{tabs}</>}
        footer={<AuthButton type="button" disabled={!role} onClick={() => setStep(role === "coach" ? 3 : 2)}>Continuer</AuthButton>}
      >
        <AuthTitle kicker={kicker} title="Tu es…" text="Choisis ton rôle. Tu ne pourras pas le changer ensuite." />
        {card("athlete", "Athlète", "Tu suis ton programme et ta progression, sur ton téléphone.", Dumbbell)}
        {card("coach", "Coach", "Tu crées les programmes et suis tes athlètes, sur ordinateur.", Users)}
        <div style={{ fontSize: 12.5, color: C.tx3, lineHeight: 1.5 }}>Coach qui s’entraîne aussi ? Choisis « Coach » : une case « Je m’entraîne aussi » t’attend à l’étape suivante.</div>
        <div style={{ textAlign: "center", fontSize: 13, color: C.tx2 }}>
          Déjà un compte ? <button type="button" style={link} onClick={() => switchTab("login")}>Me connecter</button>
        </div>
      </AuthScreen>
    );
  }

  // ── Inscription 2 : code du coach (athlète) ──
  if (step === 2) {
    const c = normalizeCoachCode(code);
    const found = coach && coach.code === c && coach.name;
    const unknown = coach && coach.code === c && !coach.name;
    return (
      <AuthScreen
        top={<BackRow label={kicker} onBack={back} />}
        footer={<AuthButton type="button" disabled={!found} onClick={() => setStep(3)}>C’est mon coach · Continuer</AuthButton>}
      >
        <AuthTitle title="Ton coach" text="Entre le code à 6 caractères que ton coach t’a donné." />
        <AuthField label="Code coach" error={unknown ? "Code inconnu : vérifie auprès de ton coach." : null}>
          <label style={{ position: "relative", display: "flex", gap: 8 }}>
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} aria-hidden style={{
                flex: 1, height: 56, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", ...MONO, fontSize: 22,
                background: C.s1, border: `1px solid ${i === Math.min(c.length, 5) && !found ? C.ac : alpha(C.tx, 0.18)}`, color: C.tx,
              }}>{c[i] ?? ""}</span>
            ))}
            <input aria-label="Code coach" value={c} maxLength={6} autoCapitalize="characters" autoComplete="off" autoFocus
              onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6))}
              style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", fontSize: 16 }} />
          </label>
        </AuthField>
        {checking && <div style={{ fontSize: 12.5, color: C.tx3 }}>Vérification…</div>}
        {found && (
          <div role="status" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 14, background: alpha(C.g, 0.06), border: `1px solid ${alpha(C.g, 0.35)}` }}>
            <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.g }}>Coach trouvé</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: alpha(C.ac, 0.14), color: C.ac, ...MONO, fontSize: 15, flex: "none" }}>{initials(coach.name!)}</span>
              <span style={{ fontSize: 16, fontWeight: 500 }}>{coach.name}</span>
            </div>
            <div style={{ fontSize: 12.5, color: C.tx2, lineHeight: 1.45 }}>{coach.name} verra tes séances, ton wellness et tes tests.</div>
            <div style={{ fontSize: 12, color: C.tx3 }}>Ce n’est pas ton coach ? Vérifie le code.</div>
          </div>
        )}
      </AuthScreen>
    );
  }

  // ── Inscription 3 : compte ──
  const ready = acceptTerms && !!fullName.trim() && !!birthDate && !!email && password.length >= 6 && !!confirm && !loading;
  return (
    <form onSubmit={handleRegister}>
      <AuthScreen
        top={<BackRow label={kicker} onBack={back} />}
        footer={<AuthButton disabled={!ready}>{loading ? "Création…" : role === "coach" ? "Créer mon compte coach" : `Rejoindre ${coach?.name ?? "mon coach"}`}</AuthButton>}
      >
        <AuthTitle title="Ton compte" />
        <AuthField label="Prénom et nom">
          <input aria-label="Prénom et nom" required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Prénom Nom" style={AUTH_INPUT} />
        </AuthField>
        <AuthField label="Date de naissance" hint={`Agon est réservé aux personnes de ${MIN_AGE} ans et plus.`}>
          <input id="birthDate" aria-label="Date de naissance" type="date" required min={OLDEST_BIRTH_DATE} max={localIsoDay()} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} style={{ ...AUTH_INPUT, colorScheme: "dark" }} />
        </AuthField>
        <AuthField label="E-mail">
          <input aria-label="E-mail" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ton@email.fr" style={AUTH_INPUT} />
        </AuthField>
        <AuthField label="Mot de passe" hint="6 caractères minimum.">
          <PasswordInput aria-label="Mot de passe" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" iconColor={C.tx2} style={AUTH_INPUT} />
        </AuthField>
        <AuthField label="Confirmer le mot de passe" error={confirm && password !== confirm ? "Les deux mots de passe ne sont pas identiques." : null}>
          <PasswordInput aria-label="Confirmer le mot de passe" required minLength={6} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" iconColor={C.tx2} style={AUTH_INPUT} />
        </AuthField>
        {role === "coach" && (
          <Check on={isCoachAthlete} onChange={setIsCoachAthlete}>
            <span style={{ display: "block", fontSize: 14, color: C.tx }}>Je m’entraîne aussi</span>
            <span style={{ display: "block", fontSize: 12, color: C.tx3, marginTop: 2 }}>Tu auras aussi la vue athlète pour toi-même.</span>
          </Check>
        )}
        <Check on={acceptTerms} onChange={setAcceptTerms}>
          <span style={{ fontSize: 13, color: C.tx2, lineHeight: 1.5 }}>
            J’ai lu et j’accepte les <Link to={LEGAL_ROUTES.terms} target="_blank" style={{ color: C.ac }}>CGU</Link> et la{" "}
            <Link to={LEGAL_ROUTES.privacy} target="_blank" style={{ color: C.ac }}>politique de confidentialité</Link>.
          </span>
        </Check>
        {error && <AuthError>{error}</AuthError>}
      </AuthScreen>
    </form>
  );
}

function BackRow({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button type="button" aria-label="Retour" onClick={onBack} style={{ width: 34, height: 34, boxSizing: "border-box", border: `1px solid ${alpha(C.tx, 0.18)}`, borderRadius: 10, background: "transparent", color: C.tx, cursor: "pointer", fontSize: 18, lineHeight: 1, flex: "none" }}>‹</button>
      <span style={{ flex: 1, textAlign: "center", ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx2 }}>{label}</span>
      <span style={{ width: 34, flex: "none" }} />
    </div>
  );
}

function Check({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ width: 20, height: 20, accentColor: C.ac, cursor: "pointer", marginTop: 1, flexShrink: 0 }} />
      <span>{children}</span>
    </label>
  );
}
