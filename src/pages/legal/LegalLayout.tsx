import { Link } from "react-router-dom";
import {
  COMPANY,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_ROUTES,
  LEGAL_VERSION,
  hasLegalPlaceholders,
} from "@/lib/legal";

/**
 * Chrome commun aux trois documents légaux publics.
 *
 * Ces pages sont volontairement accessibles sans authentification : les
 * programmes partenaires (Garmin, COROS) exigent une URL de politique de
 * confidentialité consultable par leur équipe de validation, qui n'a pas de
 * compte. Elles doivent donc rester hors de `ProtectedRoute`.
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
  warn: "#FF5A33",
};

/** Titre de section numéroté. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 800,
          color: S.ac,
          margin: "0 0 12px",
          letterSpacing: "-0.2px",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Paragraphe de corps de texte. */
export function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 14, lineHeight: 1.7, color: S.tx2, margin: "0 0 12px" }}>{children}</p>
  );
}

/** Liste à puces. */
export function UL({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ margin: "0 0 12px", paddingLeft: 20 }}>
      {items.map((it, i) => (
        <li key={i} style={{ fontSize: 14, lineHeight: 1.7, color: S.tx2, marginBottom: 6 }}>
          {it}
        </li>
      ))}
    </ul>
  );
}

/** Tableau simple à deux ou trois colonnes. */
export function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div style={{ overflowX: "auto", margin: "0 0 16px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  color: S.tx,
                  fontWeight: 700,
                  borderBottom: "1px solid " + S.brdL,
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td
                  key={j}
                  style={{
                    padding: "8px 10px",
                    color: S.tx2,
                    lineHeight: 1.6,
                    borderBottom: "1px solid " + S.brd,
                    verticalAlign: "top",
                  }}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Encart mis en avant (information importante, pas un avertissement d'erreur). */
export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 6,
        background: "rgba(255,201,51,0.08)",
        border: "1px solid rgba(255,201,51,0.25)",
        margin: "0 0 16px",
        fontSize: 13,
        lineHeight: 1.7,
        color: S.tx2,
      }}
    >
      {children}
    </div>
  );
}

export default function LegalLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const incomplete = hasLegalPlaceholders();

  return (
    <div style={{ minHeight: "100vh", background: S.bg, padding: "0 16px 64px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {/* En-tête */}
        <header style={{ padding: "32px 0 24px", borderBottom: "1px solid " + S.brd, marginBottom: 32 }}>
          <Link
            to="/login"
            style={{
              fontSize: 26,
              fontWeight: 900,
              color: S.tx,
              letterSpacing: "-1px",
              textDecoration: "none",
            }}
          >
            Agon
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: S.tx, margin: "20px 0 6px", letterSpacing: "-0.5px" }}>
            {title}
          </h1>
          {subtitle && <div style={{ fontSize: 14, color: S.tx2, lineHeight: 1.6 }}>{subtitle}</div>}
          <div style={{ fontSize: 12, color: S.tx3, marginTop: 10 }}>
            Version {LEGAL_VERSION} — en vigueur depuis le {LEGAL_EFFECTIVE_DATE}
          </div>
        </header>

        {/*
          Bandeau d'incomplétude. Un document légal publié avec des champs
          d'identité non renseignés expose à une sanction et sera rejeté par les
          programmes partenaires : mieux vaut un avertissement visible qu'une
          omission silencieuse.
        */}
        {incomplete && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 6,
              background: "rgba(255,90,51,0.10)",
              border: "1px solid rgba(255,90,51,0.35)",
              marginBottom: 28,
              fontSize: 13,
              lineHeight: 1.6,
              color: S.tx,
            }}
          >
            <strong style={{ color: S.warn }}>Document en cours de finalisation.</strong> Les
            informations d'identification de l'éditeur ne sont pas encore renseignées. Pour toute
            question, écrivez à{" "}
            <a href={`mailto:${COMPANY.contactEmail}`} style={{ color: S.ac }}>
              {COMPANY.contactEmail}
            </a>
            .
          </div>
        )}

        <main>{children}</main>

        {/* Pied de page — navigation croisée entre les trois documents */}
        <footer
          style={{
            marginTop: 48,
            paddingTop: 20,
            borderTop: "1px solid " + S.brd,
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            fontSize: 13,
          }}
        >
          <Link to={LEGAL_ROUTES.privacy} style={{ color: S.tx2, textDecoration: "none" }}>
            Confidentialité
          </Link>
          <Link to={LEGAL_ROUTES.terms} style={{ color: S.tx2, textDecoration: "none" }}>
            CGU
          </Link>
          <Link to={LEGAL_ROUTES.notice} style={{ color: S.tx2, textDecoration: "none" }}>
            Mentions légales
          </Link>
          <Link to="/login" style={{ color: S.tx3, textDecoration: "none", marginLeft: "auto" }}>
            Retour à l'application
          </Link>
        </footer>
      </div>
    </div>
  );
}
