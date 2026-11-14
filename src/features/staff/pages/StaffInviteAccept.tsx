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
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/errors";
import { localIsoDay } from "@shared/domain/dates";
import { MIN_AGE, OLDEST_BIRTH_DATE } from "@/lib/age";
import { C } from "@/lib/theme";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { DISPLAY, KICK, MONO } from "@/features/shared/components/ordi/OrdiUi";
import { btnStyle, frDate } from "@/features/shared/components/ordi/ordiStyles";
import {
  permissionLists,
  PROFESSION_LABEL,
  STAFF_PROFESSIONS,
  professionLabel,
  type StaffProfession,
} from "../lib/staffPermissions";
import { addSelfAsCoCoach } from "@/features/shared/hooks/useCoCoach";
import { toast } from "sonner";
import { acceptStaffInvitation, useStaffInvitationPreview } from "../hooks/useMyStaffLinks";

const input: React.CSSProperties = {
  width: "100%", height: 42, padding: "0 12px", borderRadius: 10, border: "1px solid " + C.brdL,
  background: C.s2, color: C.tx, fontSize: 13.5, fontFamily: "inherit", boxSizing: "border-box",
};
const pair: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 };
const label: React.CSSProperties = { fontSize: 12, color: C.tx2, marginBottom: 6, display: "block" };
const primary: React.CSSProperties = { ...btnStyle("primary", "lg"), width: "100%", height: 48, fontSize: 14 };

/** Page centrée 960 px, logo au-dessus (planche CoachOrdiBStaffInvitation). */
function Shell({ children, wide = false, footer }: { children: React.ReactNode; wide?: boolean; footer?: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.tx, display: "flex", justifyContent: "center", padding: "64px 16px 72px", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: wide ? 960 : 440, display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/brand/agon-symbole-favicon-marbre.svg" alt="" style={{ width: 34, height: 34 }} />
          <span style={{ ...DISPLAY, fontWeight: 400, fontSize: 20, letterSpacing: "0.24em" }}>Agon</span>
        </div>
        <div style={{ width: "100%", background: C.s1, border: "1px solid " + C.brd, borderRadius: 18, padding: wide ? "36px 40px" : 24, boxSizing: "border-box" }}>
          {children}
        </div>
        {footer && <div style={{ fontSize: 12.5, color: C.tx3, textAlign: "center" }}>{footer}</div>}
      </div>
    </div>
  );
}

export default function StaffInviteAccept() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, profile, loading, login, registerStaff, logout, refreshAthletes } = useAuth();
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
      <Shell footer={<>Déjà un compte ? <Link to="/login" style={{ color: C.ac, textDecoration: "none" }}>Me connecter</Link></>}>
        <div style={{ fontSize: 16, fontWeight: 600, color: C.tx, marginBottom: 8 }}>Invitation indisponible</div>
        <div style={{ fontSize: 13, color: C.tx2, lineHeight: 1.6 }}>{msg} Demande un nouveau lien à la personne qui t'a invité.</div>
      </Shell>
    );
  }

  const pickedProfession = profession ?? inv.profession;
  const lists = inv.permissions ? permissionLists(inv.permissions) : null;
  const shared = inv.permissions ? new Set([...lists!.write, ...lists!.read]) : null;
  const notShared = inv.permissions
    ? [...["Séances", "Planification", "Séances réalisées", "Bien-être", "Blessures", "Nutrition", "Tests", "Fiches", "Commentaires"].filter((d) => !shared!.has(d)), "données des montres"]
    : null;
  const intro = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <span style={{ ...KICK, color: C.ac }}>Invitation · {professionLabel(inv.profession)}</span>
      <h1 style={{ ...DISPLAY, margin: 0, fontWeight: 500, fontSize: 26, lineHeight: 1.2, letterSpacing: "0.05em" }}>
        Rejoindre le staff de {inv.athlete_name}
      </h1>
      <div style={{ fontSize: 15, color: C.tx, lineHeight: 1.55 }}>
        {inv.invited_by_role === "athlete"
          ? `${inv.athlete_name} t'invite à suivre sa préparation en tant que ${professionLabel(inv.profession).toLowerCase()}.`
          : `${inv.inviter_name ?? "Son coach"} t'invite à suivre ${inv.athlete_name} en tant que ${professionLabel(inv.profession).toLowerCase()}.`}
      </div>
      <div style={{ fontSize: 13.5, color: C.tx2, lineHeight: 1.55 }}>
        {inv.coach_name && inv.invited_by_role === "athlete" && <>Coach principal : <b style={{ color: C.tx, fontWeight: 500 }}>{inv.coach_name}</b>. </>}
        Tu verras uniquement ce que son coach t'ouvre. Le compte professionnel est gratuit.
      </div>
      {lists && (
        <div style={{ marginTop: 8 }}>
          <span style={KICK}>Ce que tu pourras faire</span>
          <div style={{ marginTop: 10 }}>
            {[
              { k: "Écrire", c: C.ac, v: lists.write },
              { k: "Consulter", c: C.b, v: lists.read },
              { k: "Non partagé", c: C.tx3, v: notShared ?? [] },
            ].filter((r) => r.v.length).map((r) => (
              <div key={r.k} style={{ display: "flex", gap: 14, padding: "12px 0", borderTop: "1px solid " + C.brd }}>
                <span style={{ width: 86, flex: "none", fontSize: 12.5, color: r.c }}>{r.k}</span>
                <span style={{ fontSize: 13.5, color: r.k === "Non partagé" ? C.tx3 : C.tx2, lineHeight: 1.5 }}>{r.v.join(", ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ fontSize: 12.5, color: C.tx3, lineHeight: 1.55 }}>
        Le coach peut ajuster ces droits à tout moment ; {inv.athlete_name.split(" ")[0]} en est informé(e) et peut retirer ton accès.
      </div>
      {inv.expires_at && (
        <div style={{ ...MONO, fontSize: 11, letterSpacing: "0.06em", color: C.tx3 }}>
          Lien valable jusqu'au {frDate(inv.expires_at)} · une seule fois
        </div>
      )}
    </div>
  );
  const twoCols = (right: React.ReactNode) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 44 }}>
      {intro}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{right}</div>
    </div>
  );

  async function accept() {
    try {
      await acceptStaffInvitation(token);
    } catch (e) {
      // Coach-athlète qui ouvre sa propre invitation : il ne peut pas être son
      // propre staff, mais il peut être co-coach de lui-même (double coach,
      // en duo avec son coach). On fait ça à la place, et on range l'invitation.
      const own = /propre staff/i.test(errorMessage(e));
      if (!own || !user || profile?.role !== "coach_athlete" || !profile.coach_code) throw e;
      await addSelfAsCoCoach(user.id, profile.coach_code, token);
      await refreshAthletes();
      toast.success("Tu es maintenant co-coach de ton entraînement", {
        description: "En duo avec ton coach : ton programme est dans ton espace coach.",
      });
      navigate("/coach/athletes", { replace: true });
      return;
    }
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
      <Shell wide>
        {twoCols(<>
        <div style={{ fontSize: 13, color: C.tx2, background: C.s2, borderRadius: 10, padding: "12px 14px" }}>
          Connecté en tant que <b style={{ color: C.tx }}>{profile?.full_name ?? user.email}</b>
          {profile?.role && profile.role !== "staff" && " — ton espace coach ne change pas, tu auras en plus un espace Staff."}
        </div>
        {error && <div style={{ fontSize: 13, color: C.r }}>{error}</div>}
        <button style={{ ...primary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => run(accept)}>
          {busy ? "Validation…" : "Accepter l'invitation"}
        </button>
        <button
          onClick={() => logout(window.location.pathname + window.location.search)}
          style={{ ...btnStyle("ghost", "lg"), width: "100%" }}
        >
          Ce n'est pas moi — changer de compte
        </button>
        </>)}
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
      const birthDate = String(form.get("birthDate") ?? "");
      if (password !== String(form.get("confirm") ?? "")) {
        setError("Les mots de passe ne correspondent pas");
        return;
      }
      run(async () => {
        await registerStaff(email, password, fullName, birthDate, pickedProfession);
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
    <Shell wide footer="Tu es déjà coach sur Agon ? Connecte-toi : ton espace coach ne change pas, tu auras en plus un espace Staff.">
      {twoCols(<>
      <div style={{ display: "flex", gap: 2, background: C.s2, borderRadius: 10, padding: 3 }}>
        {(["signup", "login"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setError(""); }}
            style={{
              flex: 1, height: 34, borderRadius: 8, border: "none", fontFamily: "inherit", cursor: "pointer",
              background: tab === t ? C.s1 : "transparent", color: tab === t ? C.tx : C.tx3, fontSize: 13, fontWeight: tab === t ? 500 : 400,
            }}
          >
            {t === "signup" ? "Je suis un professionnel" : "J'ai déjà un compte"}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {tab === "signup" && (
          <div style={pair}>
            <div>
              <span style={label}>Nom complet</span>
              <input name="fullName" required placeholder="Prénom Nom" style={input} />
            </div>
            <div>
              <span style={label}>Date de naissance</span>
              <input name="birthDate" type="date" required min={OLDEST_BIRTH_DATE} max={localIsoDay()}
                style={{ ...input, colorScheme: "dark" }} aria-label="Date de naissance" title={`Agon est réservé aux personnes de ${MIN_AGE} ans et plus.`} />
            </div>
          </div>
        )}
        <div>
          <span style={label}>E-mail</span>
          <input name="email" type="email" required autoComplete="email" style={input} />
        </div>
        <div style={tab === "signup" ? pair : undefined}>
          <div>
            <span style={label}>Mot de passe</span>
            <PasswordInput variant="shadcn" name="password" required minLength={8} placeholder="••••••••" />
          </div>
          {tab === "signup" && (
            <div>
              <span style={label}>Confirmer le mot de passe</span>
              <PasswordInput variant="shadcn" name="confirm" required minLength={8} placeholder="••••••••" />
            </div>
          )}
        </div>
        {tab === "signup" && (
          <div>
            <span style={label}>Métier</span>
            <select value={pickedProfession} onChange={(e) => setProfession(e.target.value as StaffProfession)} style={input}>
              {STAFF_PROFESSIONS.map((p) => <option key={p} value={p}>{PROFESSION_LABEL[p]}</option>)}
            </select>
          </div>
        )}
        {error && <div style={{ fontSize: 13, color: C.r }}>{error}</div>}
        <button type="submit" disabled={busy} style={{ ...primary, marginTop: 6, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Un instant…" : tab === "signup" ? "Créer mon compte et accepter" : "Me connecter et accepter"}
        </button>
        {tab === "signup" && (
          <div style={{ fontSize: 12, color: C.tx3, textAlign: "center", lineHeight: 1.5 }}>
            En créant ton compte, tu acceptes les <a href="/cgu" style={{ color: C.tx2 }}>conditions d'utilisation</a> et la <a href="/confidentialite" style={{ color: C.tx2 }}>politique de confidentialité</a>.
          </div>
        )}
      </form>
      </>)}
    </Shell>
  );
}
