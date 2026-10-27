import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/errors";
import { LEGAL_ROUTES } from "@/lib/legal";
import {
  CONSENT_COPY,
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
  const { logout } = useAuth();
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

  if (hasValidCoreConsent(consents)) return <>{children}</>;

  const coreChecked = !!checked.health_data;
  // Un compte déjà consentant mais sur une version antérieure du document :
  // le message doit dire que le texte a changé, pas accueillir l'utilisateur
  // comme un nouveau venu.
  const isUpdate = !!consents?.some((c) => c.purpose === "health_data" && c.granted);

  async function submit() {
    setSubmitError("");
    try {
      await setConsent.mutateAsync(
        GATE_PURPOSES.map((p) => ({ purpose: p, granted: !!checked[p] })),
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
          {GATE_PURPOSES.map((p) => {
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
