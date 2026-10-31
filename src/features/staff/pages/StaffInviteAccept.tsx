/**
 * Acceptation d'une invitation staff — route publique /staff-invite/:token.
 *
 * Trois cas :
 *  - pas de compte : « Je suis un professionnel » → crée un compte staff
 *    (gratuit), puis accepte ;
 *  - compte existant (pro, ou coach en double casquette) : connexion, puis
 *    acceptation ;
 *  - déjà connecté : acceptation en un clic.
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/errors";
import { C } from "@/lib/theme";
import { PasswordInput } from "@/components/ui/PasswordInput";
import {
  PROFESSION_LABEL,
  STAFF_PROFESSIONS,
  professionLabel,
  type StaffProfession,
} from "../lib/staffPermissions";
import { acceptStaffInvitation, useStaffInvitationPreview } from "../hooks/useMyStaffLinks";

const input: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 4, border: "1px solid " + C.brdL,
  background: C.s2, color: C.tx, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
};
const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: C.tx2, marginBottom: 4, display: "block" };
const primary: React.CSSProperties = {
  width: "100%", padding: "12px 0", borderRadius: 4, border: "none", background: C.ac, color: "#0E0C0A",
  fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: C.tx, letterSpacing: "-1px" }}>Agon</div>
        </div>
        <div style={{ background: C.s1, border: "1px solid " + C.brd, borderRadius: 6, padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}

export default function StaffInviteAccept() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, profile, loading, login, registerStaff, logout } = useAuth();
  const { data: inv, isLoading, isError } = useStaffInvitationPreview(token);

  const [tab, setTab] = useState<"signup" | "login">("signup");
  const [profession, setProfession] = useState<StaffProfession | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (isLoading || loading) {
    return <Shell><div style={{ color: C.tx3, fontSize: 13, textAlign: "center" }}>Chargement…</div></Shell>;
  }

  if (isError || !inv || inv.status !== "valid") {
    const msg = !inv || isError
      ? "Ce lien d'invitation est introuvable."
      : inv.status === "used"
        ? "Ce lien d'invitation a déjà été utilisé."
        : "Ce lien d'invitation a expiré.";
    return (
      <Shell>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.tx, marginBottom: 8 }}>Invitation indisponible</div>
        <div style={{ fontSize: 13, color: C.tx2, lineHeight: 1.6 }}>{msg} Demande un nouveau lien à la personne qui t'a invité.</div>
      </Shell>
    );
  }

  const pickedProfession = profession ?? inv.profession;
  const intro = (
    <>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.ac, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
        Invitation · {professionLabel(inv.profession)}
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.tx, marginBottom: 6 }}>
        Rejoindre le staff de {inv.athlete_name}
      </div>
      <div style={{ fontSize: 12.5, color: C.tx2, lineHeight: 1.6, marginBottom: 16 }}>
        {inv.invited_by_role === "athlete"
          ? `${inv.athlete_name} t'invite à suivre sa préparation sur Agon.`
          : `${inv.inviter_name ?? "Son coach"} t'invite à suivre ${inv.athlete_name} sur Agon.`}
        {inv.coach_name && <> Coach principal : <b style={{ color: C.tx }}>{inv.coach_name}</b>.</>}
        {" "}Tu verras uniquement ce que le coach t'ouvre. Le compte professionnel est gratuit.
      </div>
    </>
  );

  async function accept() {
    await acceptStaffInvitation(token);
    navigate("/staff", { replace: true });
  }

  async function run(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // ── Déjà connecté ──────────────────────────────────────────────────────────
  if (user) {
    return (
      <Shell>
        {intro}
        <div style={{ fontSize: 12.5, color: C.tx2, background: C.s2, borderRadius: 4, padding: "10px 12px", marginBottom: 14 }}>
          Connecté en tant que <b style={{ color: C.tx }}>{profile?.full_name ?? user.email}</b>
          {profile?.role && profile.role !== "staff" && " — ton espace coach ne change pas, tu auras en plus un espace Staff."}
        </div>
        {error && <div style={{ fontSize: 13, color: C.r, marginBottom: 10 }}>{error}</div>}
        <button style={{ ...primary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => run(accept)}>
          {busy ? "Validation…" : "Accepter l'invitation"}
        </button>
        <button
          onClick={() => logout()}
          style={{ width: "100%", marginTop: 10, padding: "10px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
        >
          Ce n'est pas moi — changer de compte
        </button>
      </Shell>
    );
  }

  // ── Pas connecté ───────────────────────────────────────────────────────────
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (tab === "signup") {
      const fullName = String(form.get("fullName") ?? "").trim();
      if (password !== String(form.get("confirm") ?? "")) {
        setError("Les mots de passe ne correspondent pas");
        return;
      }
      run(async () => {
        await registerStaff(email, password, fullName, pickedProfession);
        await accept();
      });
    } else {
      run(async () => {
        await login(email, password);
        await accept();
      });
    }
  }

  return (
    <Shell>
      {intro}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, background: C.s2, borderRadius: 4, padding: 3 }}>
        {(["signup", "login"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setError(""); }}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 3, border: "none", fontFamily: "inherit", cursor: "pointer",
              background: tab === t ? C.s1 : "transparent", color: tab === t ? C.tx : C.tx3, fontSize: 12, fontWeight: tab === t ? 700 : 500,
            }}
          >
            {t === "signup" ? "Je suis un professionnel" : "J'ai déjà un compte"}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {tab === "signup" && (
          <>
            <div>
              <span style={label}>Nom complet</span>
              <input name="fullName" required placeholder="Prénom Nom" style={input} />
            </div>
            <div>
              <span style={label}>Métier</span>
              <select
                value={pickedProfession}
                onChange={(e) => setProfession(e.target.value as StaffProfession)}
                style={input}
              >
                {STAFF_PROFESSIONS.map((p) => <option key={p} value={p}>{PROFESSION_LABEL[p]}</option>)}
              </select>
            </div>
          </>
        )}
        <div>
          <span style={label}>Email</span>
          <input name="email" type="email" required autoComplete="email" style={input} />
        </div>
        <div>
          <span style={label}>Mot de passe</span>
          <PasswordInput variant="shadcn" name="password" required minLength={6} placeholder="••••••••" />
        </div>
        {tab === "signup" && (
          <div>
            <span style={label}>Confirmer le mot de passe</span>
            <PasswordInput variant="shadcn" name="confirm" required minLength={6} placeholder="••••••••" />
          </div>
        )}
        {error && <div style={{ fontSize: 13, color: C.r }}>{error}</div>}
        <button type="submit" disabled={busy} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Un instant…" : tab === "signup" ? "Créer mon compte et accepter" : "Me connecter et accepter"}
        </button>
      </form>
    </Shell>
  );
}
