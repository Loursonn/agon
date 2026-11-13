import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import LegalLayout, { Callout, P, Section, UL } from "./LegalLayout";
import { COMPANY, LEGAL_ROUTES } from "@/lib/legal";
import { useAuth } from "@/hooks/useAuth";
import { signIn } from "@/api/auth";
import { errorMessage } from "@/lib/errors";
import { useDeleteAccount } from "@/features/shared/hooks/useDeleteAccount";

/**
 * Suppression du compte — page publique.
 *
 * Exigence Google Play : une URL web, lisible sans installer l'app ni se
 * connecter, qui explique comment demander la suppression du compte et des
 * données. Elle reste donc hors de `ProtectedRoute`, comme les autres
 * documents légaux.
 *
 * Aucune logique de suppression propre : une fois connecté, l'utilisateur
 * passe par `useDeleteAccount`, le même parcours que depuis son profil
 * (Edge Function `delete-account`, mot de confirmation revérifié côté serveur,
 * identité tirée du seul jeton de session).
 */

const C = {
  s1: "#1E1A16",
  s2: "#27221D",
  brd: "rgba(231,211,168,0.18)",
  tx: "#FFFFFF",
  tx2: "#B9AE9C",
  tx3: "#7D7468",
  ac: "#FFC933",
  r: "#FF5A33",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 6,
  border: "1px solid " + C.brd,
  background: C.s2,
  color: C.tx,
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const Mail = () => (
  <a href={`mailto:${COMPANY.contactEmail}`} style={{ color: C.ac }}>
    {COMPANY.contactEmail}
  </a>
);

export default function AccountDeletion() {
  return (
    <LegalLayout
      title="Supprimer votre compte"
      subtitle="Comment supprimer votre compte Agon et l'ensemble de vos données, depuis l'application ou depuis cette page."
    >
      <Section title="1. Depuis l'application">
        <P>
          Ouvrez votre <strong>profil</strong>, section <strong>Confidentialité</strong>, puis
          « Supprimer mon compte et mes données ». La suppression est immédiate et définitive.
        </P>
      </Section>

      <Section title="2. Depuis cette page">
        <P>
          Connectez-vous ci-dessous avec les identifiants de votre compte Agon, puis confirmez. Le
          parcours est le même que dans l'application.
        </P>
        <DeletionPanel />
      </Section>

      <Section title="3. Ce qui est supprimé">
        <UL
          items={[
            "Votre compte de connexion et votre profil (nom, e-mail, date de naissance, rôle).",
            "Vos séances, charges, séries, records, tests et programmes reçus.",
            "Votre bien-être, votre poids, vos mensurations, votre nutrition et vos blessures déclarées.",
            "Les activités et données de santé importées depuis une montre (Garmin, COROS, fichiers importés). Les accès accordés à ces services sont révoqués chez le fournisseur.",
            "Vos photos et fichiers déposés.",
            "Vos accords (consentements) et les accès donnés à votre coach, co-coach ou staff.",
          ]}
        />
        <P>
          Si vous êtes coach, les comptes de vos athlètes ne sont pas supprimés : ils gardent leurs
          données et ne sont simplement plus rattachés à vous.
        </P>
      </Section>

      <Section title="4. Ce qui est conservé, et pourquoi">
        <UL
          items={[
            <>
              <strong>Une trace anonyme de la suppression</strong> (date, rôle, version de l'accord
              en vigueur), sans nom ni e-mail ni identifiant : elle prouve que la demande a été
              exécutée.
            </>,
            <>
              <strong>Les sauvegardes techniques</strong> de la base, qui s'effacent d'elles-mêmes
              au bout de <strong>30 jours</strong> au plus. Elles ne sont utilisées qu'en cas de
              panne et ne sont jamais consultées pour retrouver un compte supprimé.
            </>,
          ]}
        />
        <P>
          Les données détenues par Garmin ou COROS sur leurs propres services ne sont pas
          concernées : leur suppression se demande auprès d'eux.
        </P>
      </Section>

      <Section title="5. Vous n'avez plus accès à votre compte">
        <P>
          Mot de passe oublié : utilisez « Mot de passe oublié » sur la{" "}
          <Link to="/login" style={{ color: C.ac }}>
            page de connexion
          </Link>
          , puis revenez ici.
        </P>
        <P>
          Plus d'accès à votre adresse e-mail : écrivez à <Mail /> depuis une adresse où nous
          pouvons vous répondre, en indiquant le nom et l'e-mail du compte. Nous vérifions que la
          demande vient bien de vous, puis supprimons le compte dans un délai d'un mois au plus.
        </P>
        <P>
          Plus de détails dans la{" "}
          <Link to={LEGAL_ROUTES.privacy} style={{ color: C.ac }}>
            politique de confidentialité
          </Link>
          .
        </P>
      </Section>
    </LegalLayout>
  );
}

/** Connexion puis confirmation, ou lien vers l'app une fois supprimé. */
function DeletionPanel() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const deleted = params.get("fait") === "1";

  return (
    <div
      style={{
        background: C.s1,
        border: "1px solid " + C.brd,
        borderRadius: 8,
        padding: 18,
        margin: "0 0 16px",
      }}
    >
      {loading ? (
        <div style={{ fontSize: 13, color: C.tx3 }}>Chargement…</div>
      ) : deleted && !user ? (
        <div style={{ fontSize: 14, color: C.tx }}>
          Votre compte et vos données ont été supprimés.
        </div>
      ) : user ? (
        <ConfirmDeletion email={user.email ?? ""} />
      ) : (
        <SignInForm />
      )}
    </div>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      // La session ouverte est reprise par AuthProvider, qui fait basculer le
      // panneau sur la confirmation.
      await signIn(email.trim(), password);
    } catch (err) {
      const msg = errorMessage(err, "Connexion impossible");
      setError(/invalid login credentials/i.test(msg) ? "E-mail ou mot de passe incorrect." : msg);
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>Connexion</div>
      <input
        type="email"
        autoComplete="email"
        placeholder="E-mail"
        aria-label="E-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        style={input}
      />
      <input
        type="password"
        autoComplete="current-password"
        placeholder="Mot de passe"
        aria-label="Mot de passe"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        style={input}
      />
      {error && <div style={{ fontSize: 13, color: C.r }}>{error}</div>}
      <button
        type="submit"
        disabled={pending}
        style={{
          padding: "11px 0",
          borderRadius: 6,
          border: "none",
          background: C.ac,
          color: "#0E0C0A",
          fontSize: 14,
          fontWeight: 700,
          cursor: pending ? "wait" : "pointer",
          fontFamily: "inherit",
        }}
      >
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}

function ConfirmDeletion({ email }: { email: string }) {
  const [word, setWord] = useState("");
  const del = useDeleteAccount();
  const ready = word.trim().toUpperCase() === "SUPPRIMER";

  const submit = () => {
    del.mutate(undefined, {
      onSuccess: (r) => {
        if (r.warnings?.length) console.warn("delete-account warnings:", r.warnings);
        // Rechargement complet : aucun état ne doit survivre à un compte supprimé.
        window.location.href = "/suppression-compte?fait=1";
      },
      onError: (e) => toast.error("Suppression impossible", { description: e.message }),
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, color: C.tx2 }}>
        Connecté en tant que <strong style={{ color: C.tx }}>{email}</strong>
      </div>
      <Callout>
        Cette action est <strong style={{ color: C.r }}>irréversible</strong>. Si vous voulez
        garder une copie de vos données, téléchargez d'abord votre export depuis votre profil
        (section Confidentialité).
      </Callout>
      <label htmlFor="confirm-delete" style={{ fontSize: 13, color: C.tx3 }}>
        Tapez <strong style={{ color: C.tx }}>SUPPRIMER</strong> pour confirmer
      </label>
      <input
        id="confirm-delete"
        value={word}
        onChange={(e) => setWord(e.target.value)}
        autoComplete="off"
        style={input}
      />
      <button
        onClick={submit}
        disabled={!ready || del.isPending}
        style={{
          padding: "11px 0",
          borderRadius: 6,
          border: "1px solid " + C.r + "55",
          background: ready ? C.r : "transparent",
          color: ready ? "#0E0C0A" : C.r,
          fontSize: 14,
          fontWeight: 700,
          cursor: ready && !del.isPending ? "pointer" : "not-allowed",
          opacity: ready ? 1 : 0.6,
          fontFamily: "inherit",
        }}
      >
        {del.isPending ? "Suppression…" : "Supprimer définitivement mon compte"}
      </button>
    </div>
  );
}
