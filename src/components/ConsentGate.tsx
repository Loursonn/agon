import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/errors";
import { AI_CONSENT_SINCE, LEGAL_ROUTES } from "@/lib/legal";
import {
  CONSENT_COPY,
  hasDecided,
  hasDecidedSince,
  hasValidCoreConsent,
  useConsents,
  useSetConsent,
  type ConsentPurpose,
} from "@/features/shared/hooks/useConsent";

/**
 * Barrière de consentement.
 *
 * Interposée entre l'authentification et l'application : tant que le
 * consentement socle (`health_data`) n'est pas accordé dans sa version
 * courante, aucune donnée de santé n'est affichée ni saisie.
 *
 * Pourquoi une barrière et non une simple bannière : les données
 * d'entraînement relèvent de l'article 9 du RGPD. Leur traitement est interdit
 * *par défaut*. Une bannière qu'on peut ignorer laisserait l'application
 * fonctionner sans base légale.
 *
 * Les comptes créés avant la mise en place du mécanisme passent ici au premier
 * accès : le RGPD interdit de présumer leur consentement, donc aucun backfill
 * n'a été fait en base.
 *
 * Accord staff (`staff_sharing`, facultatif) : demandé aux athlètes seulement
 * (rôles athlete et coach_athlete), avec les autres cases à l'inscription. Un
 * athlète déjà inscrit qui n'a jamais répondu voit un écran court qui ne pose
 * que cette question : ses autres accords restent valables. Oui ou non, la
 * réponse est enregistrée et la question n'est plus posée ; elle reste
 * modifiable dans le profil.
 *
 * Accord IA (`ai_programming`, facultatif) : même mécanisme, pour les mêmes
 * rôles. Le texte du 30 octobre 2026 nomme l'assistant Claude du coach ; une
 * réponse donnée sous l'ancien texte (Gemini seul) ne porte pas sur lui et vaut
 * absence de réponse (`AI_CONSENT_SINCE`). L'athlète voit alors un écran court
 * qui ne pose que cette question, avant celui du staff s'il manque aussi. Oui et
 * non ont le même poids, les deux sont enregistrés, et un refus ne ferme rien.
 */

const S = {
  bg: "#0E0C0A",
  s1: "#1E1A16",
  s2: "#27221D",
  brd: "rgba(231,211,168,0.10)",
  brdL: "rgba(231,211,168,0.18)",
  tx: "#FFFFFF",
  tx2: "#B9AE9C",
  tx3: "#7D7468",
  ac: "#FFC933",
  r: "#FF5A33",
};

/** Finalités proposées à l'inscription. Les montres sont demandées au moment
 *  de la connexion du service, pas avant : demander un accord pour un service
 *  que l'utilisateur n'a pas encore choisi n'est pas un consentement éclairé. */
const GATE_PURPOSES: ConsentPurpose[] = ["health_data", "ai_programming"];

/** Seuls les athlètes ont des données à partager avec un staff ou à confier à l'IA. */
const isAthleteRole = (role: string | undefined) => role === "athlete" || role === "coach_athlete";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: S.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 520 }}>{children}</div>
    </div>
  );
}

export default function ConsentGate({ children }: { children: React.ReactNode }) {
  const { logout, profile } = useAuth();
  const { data: consents, isLoading, isError, error, refetch } = useConsents();
  const setConsent = useSetConsent();

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [submitError, setSubmitError] = useState("");

  // Pendant le chargement, on n'affiche rien de l'application : afficher le
  // contenu puis le masquer reviendrait à traiter la donnée sans base légale,
  // même brièvement.
  if (isLoading) {
    return (
      <Centered>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div
            style={{
              width: 28,
              height: 28,
              border: "2.5px solid rgba(231,211,168,0.2)",
              borderTopColor: S.ac,
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </Centered>
    );
  }

  /*
    Échec de lecture : on refuse l'accès plutôt que de présumer le
    consentement. Mais on offre une reprise explicite, pour qu'une coupure
    réseau ne devienne pas un verrouillage définitif.
  */
  if (isError) {
    return (
      <Centered>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: S.tx, marginBottom: 8 }}>
            Impossible de vérifier tes préférences
          </div>
          <div style={{ fontSize: 13, color: S.tx2, lineHeight: 1.6, marginBottom: 20 }}>
            {errorMessage(error, "Erreur réseau")}
          </div>
          <button
            onClick={() => refetch()}
            style={{
              padding: "12px 24px",
              borderRadius: 4,
              border: "none",
              background: S.ac,
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Réessayer
          </button>
        </div>
      </Centered>
    );
  }

  const athlete = isAthleteRole(profile?.role);
  const askStaff = athlete && !hasDecided(consents, "staff_sharing");
  const askAi = athlete && !hasDecidedSince(consents, "ai_programming", AI_CONSENT_SINCE);

  if (hasValidCoreConsent(consents)) {
    // Une question à la fois : l'accord IA d'abord, puis le staff s'il manque.
    if (askAi) {
      return <AiProgrammingStep isUpdate={hasDecided(consents, "ai_programming")} />;
    }
    return askStaff ? <StaffSharingStep /> : <>{children}</>;
  }

  // Une réponse staff déjà donnée n'est pas reposée (ni écrasée par une case vide).
  const purposes: ConsentPurpose[] = askStaff ? [...GATE_PURPOSES, "staff_sharing"] : GATE_PURPOSES;
  const coreChecked = !!checked.health_data;
  // Un compte déjà consentant mais sur une version antérieure du document :
  // le message doit dire que le texte a changé, pas accueillir l'utilisateur
  // comme un nouveau venu.
  const isUpdate = !!consents?.some((c) => c.purpose === "health_data" && c.granted);

  async function submit() {
    setSubmitError("");
    try {
      await setConsent.mutateAsync(
        purposes.map((p) => ({ purpose: p, granted: !!checked[p] })),
      );
    } catch (err) {
      setSubmitError(errorMessage(err));
    }
  }

  return (
    <Centered>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: S.tx, letterSpacing: "-1px" }}>Agon</div>
      </div>

      <div style={{ background: S.s1, borderRadius: 6, padding: 24, border: "1px solid " + S.brd }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: S.tx, marginBottom: 8 }}>
          {isUpdate ? "Nos conditions ont évolué" : "Avant de commencer"}
        </div>
        <div style={{ fontSize: 13, color: S.tx2, lineHeight: 1.7, marginBottom: 20 }}>
          {isUpdate ? (
            <>
              Nous avons mis à jour notre politique de confidentialité. Comme elle porte sur des
              données de santé, la loi nous impose de recueillir à nouveau ton accord.
            </>
          ) : (
            <>
              Agon traite des données de santé : entraînement, fatigue, sommeil, poids, blessures.
              La loi nous impose de recueillir ton accord explicite avant de les traiter, et de te
              laisser le retirer à tout moment.
            </>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          {purposes.map((p) => {
            const copy = CONSENT_COPY[p];
            const on = !!checked[p];
            return (
              <label
                key={p}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  cursor: "pointer",
                  padding: "12px 14px",
                  borderRadius: 4,
                  background: S.s2,
                  border: "1px solid " + (on ? S.ac : S.brd),
                }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => setChecked((c) => ({ ...c, [p]: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: S.ac, cursor: "pointer", marginTop: 2, flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: S.tx, lineHeight: 1.5 }}>
                    {copy.label}
                    {copy.required && <span style={{ color: S.r }}> *</span>}
                  </div>
                  <div style={{ fontSize: 11, color: S.tx3, marginTop: 4, lineHeight: 1.5 }}>
                    {copy.detail}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div style={{ fontSize: 11, color: S.tx3, lineHeight: 1.6, marginBottom: 16 }}>
          * Obligatoire pour utiliser l'application. Détail des traitements, des destinataires et
          de tes droits dans la{" "}
          <Link to={LEGAL_ROUTES.privacy} style={{ color: S.ac }}>
            politique de confidentialité
          </Link>{" "}
          et les{" "}
          <Link to={LEGAL_ROUTES.terms} style={{ color: S.ac }}>
            CGU
          </Link>
          . Tu peux modifier ou retirer ces accords à tout moment depuis ton profil.
        </div>

        {submitError && (
          <div
            style={{
              fontSize: 13,
              color: S.r,
              padding: "8px 10px",
              borderRadius: 4,
              background: S.r + "15",
              marginBottom: 12,
            }}
          >
            {submitError}
          </div>
        )}

        <button
          onClick={submit}
          disabled={!coreChecked || setConsent.isPending}
          style={{
            width: "100%",
            padding: "12px 0",
            borderRadius: 4,
            border: "none",
            background: coreChecked ? S.ac : S.s2,
            color: coreChecked ? "#fff" : S.tx3,
            fontSize: 14,
            fontWeight: 700,
            cursor: coreChecked && !setConsent.isPending ? "pointer" : "not-allowed",
            fontFamily: "inherit",
            opacity: setConsent.isPending ? 0.7 : 1,
          }}
        >
          {setConsent.isPending ? "Enregistrement…" : "Continuer"}
        </button>

        {/*
          Refuser doit être aussi accessible qu'accepter (art. 7.3 RGPD). On ne
          supprime pas le compte ici : l'utilisateur pourrait changer d'avis, et
          une suppression déclenchée par un refus serait disproportionnée.
        */}
        <button
          onClick={() => logout()}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "10px 0",
            borderRadius: 4,
            border: "1px solid " + S.brdL,
            background: "transparent",
            color: S.tx2,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Refuser et me déconnecter
        </button>
      </div>
    </Centered>
  );
}

/** Écran court pour un athlète déjà inscrit : seul l'accord staff est demandé. */
function StaffSharingStep() {
  return (
    <OptionalConsentStep
      purpose="staff_sharing"
      kicker="NOUVEAU"
      title="Ton staff dans Agon"
      intro={
        <>
          Ton coach peut maintenant ouvrir l'accès à tes données à des professionnels qui
          t'accompagnent : kiné, ostéo, nutritionniste, préparateur mental… Tu peux aussi en ajouter
          toi-même. Comme il s'agit de données de santé, ils ne voient rien sans ton accord.
        </>
      }
      footer="Ta réponse ne change rien à tes autres accords. Tu peux la modifier à tout moment depuis ton profil."
      emphasizeAccept
    />
  );
}

/**
 * Écran court pour un athlète déjà inscrit : seul l'accord IA est demandé,
 * parce qu'il n'a jamais répondu ou qu'il a répondu sous l'ancien texte.
 * Accepter et refuser ont exactement le même style : rien ne pousse vers le oui.
 */
function AiProgrammingStep({ isUpdate }: { isUpdate: boolean }) {
  return (
    <OptionalConsentStep
      purpose="ai_programming"
      kicker={isUpdate ? "TEXTE MIS À JOUR" : "ACCORD FACULTATIF"}
      title="L'IA dans ton suivi"
      intro={
        isUpdate ? (
          <>
            Le texte de l'accord sur l'intelligence artificielle a changé : en plus de Google
            Gemini, il nomme maintenant l'assistant Claude (Anthropic) de ton coach. Ta réponse
            précédente portait sur l'ancien texte, la question t'est donc reposée.
          </>
        ) : (
          <>
            Ton coach peut s'appuyer sur des outils d'intelligence artificielle, Google Gemini et
            son assistant Claude (Anthropic), pour analyser tes données d'entraînement et préparer
            son travail. Rien ne leur est transmis sans ton accord.
          </>
        )
      }
      footer="Si tu refuses, tu continues d'utiliser Agon normalement. Ta réponse ne change rien à tes autres accords et reste modifiable à tout moment depuis ton profil, rubrique Confidentialité."
    />
  );
}

/**
 * Une seule question facultative, posée après l'inscription. Les deux boutons
 * enregistrent la réponse (art. 7.3 RGPD : refuser aussi simple qu'accepter) ;
 * une fois enregistrée, `ConsentGate` ne repose plus la question.
 */
function OptionalConsentStep({
  purpose,
  kicker,
  title,
  intro,
  footer,
  emphasizeAccept = false,
}: {
  purpose: ConsentPurpose;
  kicker: string;
  title: string;
  intro: React.ReactNode;
  footer: string;
  /** Faux : « J'accepte » et « Je refuse » ont le même style. */
  emphasizeAccept?: boolean;
}) {
  const setConsent = useSetConsent();
  const [submitError, setSubmitError] = useState("");
  const copy = CONSENT_COPY[purpose];

  async function answer(granted: boolean) {
    setSubmitError("");
    try {
      await setConsent.mutateAsync([{ purpose, granted }]);
    } catch (err) {
      setSubmitError(errorMessage(err));
    }
  }

  const btn = (primary: boolean): React.CSSProperties => ({
    flex: 1,
    minWidth: 140,
    padding: "12px 0",
    borderRadius: 4,
    border: primary ? "none" : "1px solid " + S.brdL,
    background: primary ? S.ac : "transparent",
    color: primary ? "#000" : S.tx,
    fontSize: 14,
    fontWeight: 700,
    cursor: setConsent.isPending ? "wait" : "pointer",
    fontFamily: "inherit",
    opacity: setConsent.isPending ? 0.7 : 1,
  });

  return (
    <Centered>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: S.tx, letterSpacing: "-1px" }}>Agon</div>
      </div>

      <div style={{ background: S.s1, borderRadius: 6, padding: 24, border: "1px solid " + S.brd }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: S.ac, letterSpacing: "0.5px", marginBottom: 6 }}>{kicker}</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: S.tx, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: S.tx2, lineHeight: 1.7, marginBottom: 16 }}>{intro}</div>

        <div style={{ padding: "12px 14px", borderRadius: 4, background: S.s2, border: "1px solid " + S.brd, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: S.tx, lineHeight: 1.5 }}>{copy.label}</div>
          <div style={{ fontSize: 11, color: S.tx3, marginTop: 4, lineHeight: 1.5 }}>{copy.detail}</div>
        </div>

        <div style={{ fontSize: 11, color: S.tx3, lineHeight: 1.6, marginBottom: 16 }}>
          {footer} Détail dans la{" "}
          <Link to={LEGAL_ROUTES.privacy} style={{ color: S.ac }}>
            politique de confidentialité
          </Link>
          .
        </div>

        {submitError && (
          <div style={{ fontSize: 13, color: S.r, padding: "8px 10px", borderRadius: 4, background: S.r + "15", marginBottom: 12 }}>
            {submitError}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => answer(false)} disabled={setConsent.isPending} style={btn(false)}>
            Je refuse
          </button>
          <button onClick={() => answer(true)} disabled={setConsent.isPending} style={btn(emphasizeAccept)}>
            J'accepte
          </button>
        </div>
      </div>
    </Centered>
  );
}
