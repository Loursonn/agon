import { useEffect, useRef, useState } from "react";
import { AgonMark } from "@/features/shared/components/AgonMark";
import { Link, useLocation } from "react-router-dom";
import { legalSlug } from "./legalSlug";
import {
  COMPANY,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_ROUTES,
  LEGAL_VERSION,
  hasLegalPlaceholders,
} from "@/lib/legal";
import { C } from "@/lib/theme";

/**
 * Chrome commun aux trois documents légaux publics.
 *
 * Ces pages sont volontairement accessibles sans authentification : les
 * programmes partenaires (Garmin, COROS) exigent une URL de politique de
 * confidentialité consultable par leur équipe de validation, qui n'a pas de
 * compte. Elles doivent donc rester hors de `ProtectedRoute`.
 */

const S = {
  bg: C.bg,
  s1: C.s1,
  s2: C.s2,
  brd: "rgba(231,211,168,0.10)",
  brdL: "rgba(231,211,168,0.18)",
  tx: C.tx,
  tx2: C.tx2,
  tx3: C.tx3,
  ac: C.ac,
  warn: C.r,
};

/** Titre de section numéroté. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section id={legalSlug(title)} style={{ marginBottom: 32, scrollMarginTop: 16 }}>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 500,
          color: S.tx,
          margin: "0 0 12px",
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

const TABS = [
  { to: LEGAL_ROUTES.terms, label: "CGU" },
  { to: LEGAL_ROUTES.privacy, label: "Confidentialité" },
  { to: LEGAL_ROUTES.notice, label: "Mentions" },
];

/** Sommaire construit depuis les titres de section (planche AccesPagesSimples, écran 03). */
function Summary({ root }: { root: React.RefObject<HTMLElement> }) {
  const [items, setItems] = useState<Array<{ id: string; num: string; title: string }>>([]);
  const [all, setAll] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    const hs = Array.from(root.current?.querySelectorAll("section[id] > h2") ?? []);
    setItems(hs.map((h, i) => {
      const text = (h.textContent ?? "").trim();
      const m = /^(\d+(?: bis)?)\.\s*/.exec(text);
      return { id: (h.parentElement as HTMLElement).id, num: m ? m[1]! : String(i + 1), title: m ? text.slice(m[0].length) : text };
    }));
    setAll(false);
  }, [root, pathname]);
  if (items.length < 3) return null;
  const shown = all ? items : items.slice(0, 6);
  return (
    <nav aria-label="Sommaire" style={{ background: S.s1, border: "1px solid " + S.brd, borderRadius: 14, padding: "14px 16px", marginBottom: 28 }}>
      <div style={{ fontFamily: "var(--agon-font-data)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: S.tx2, marginBottom: 8 }}>Sommaire</div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {shown.map((it) => (
          <li key={it.id}>
            <a href={`#${it.id}`} style={{ display: "flex", gap: 12, padding: "6px 0", color: S.tx, textDecoration: "none", fontSize: 14 }}>
              <span style={{ fontFamily: "var(--agon-font-data)", color: S.ac, minWidth: 18 }}>{it.num}</span>{it.title}
            </a>
          </li>
        ))}
      </ol>
      {!all && items.length > 6 && (
        <button type="button" onClick={() => setAll(true)} style={{ background: "none", border: "none", padding: "6px 0 0", color: S.tx2, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          + {items.length - 6} autres sections
        </button>
      )}
    </nav>
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
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  return (
    <div style={{ minHeight: "100vh", background: S.bg, padding: "0 16px 64px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {/* En-tête : logo, « Informations légales », onglets (planche AccesPagesSimples) */}
        <header style={{ padding: "28px 0 20px", marginBottom: 24 }}>
          <Link to="/login" style={{ display: "inline-flex", alignItems: "center", gap: 10, color: S.tx, textDecoration: "none" }}>
            <AgonMark size={24} />
            <span style={{ fontFamily: "var(--agon-font-display)", fontSize: 12, letterSpacing: "0.32em", textTransform: "uppercase" }}>Agon</span>
          </Link>
          <div style={{ fontSize: 13, color: S.tx2, margin: "18px 0 10px" }}>Informations légales</div>
          <nav role="tablist" style={{ display: "flex", gap: 4, padding: 3, borderRadius: 11, background: S.s2, marginBottom: 22 }}>
            {TABS.map((t) => {
              const on = pathname === t.to;
              return (
                <Link key={t.to} to={t.to} role="tab" aria-selected={on} style={{ flex: 1, textAlign: "center", padding: "7px 0", borderRadius: 8, fontSize: 13, textDecoration: "none", color: on ? S.tx : S.tx3, background: on ? S.s1 : "transparent", border: on ? `1px solid ${S.brdL}` : "1px solid transparent" }}>
                  {t.label}
                </Link>
              );
            })}
          </nav>
          <h1 style={{ fontFamily: "var(--agon-font-display)", fontStretch: "125%", textTransform: "uppercase", fontWeight: 300, letterSpacing: "0.06em", fontSize: 24, lineHeight: 1.15, color: S.tx, margin: "0 0 8px" }}>
            {title}
          </h1>
          {subtitle && <div style={{ fontSize: 14, color: S.tx2, lineHeight: 1.6 }}>{subtitle}</div>}
          <div style={{ fontFamily: "var(--agon-font-data)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: S.tx3, marginTop: 10 }}>
            Version {LEGAL_VERSION} · en vigueur depuis le {LEGAL_EFFECTIVE_DATE}
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

        <Summary root={mainRef} />
        <main ref={mainRef}>{children}</main>

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
          <Link to={LEGAL_ROUTES.deletion} style={{ color: S.tx2, textDecoration: "none" }}>
            Supprimer mon compte
          </Link>
          <Link to="/login" style={{ color: S.tx3, textDecoration: "none", marginLeft: "auto" }}>
            Retour à l'application
          </Link>
        </footer>
      </div>
    </div>
  );
}
