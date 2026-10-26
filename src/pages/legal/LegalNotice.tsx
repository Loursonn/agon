import LegalLayout, { Section, P, UL } from "./LegalLayout";
import { COMPANY, HOSTING, LEGAL_ROUTES } from "@/lib/legal";

/**
 * Mentions légales.
 *
 * Obligation de l'article 6 III de la loi pour la confiance dans l'économie
 * numérique (LCEN) : tout éditeur de service en ligne doit publier son
 * identité et celle de son hébergeur. En entreprise individuelle, le nom et le
 * prénom de la personne physique doivent apparaître — un nom commercial seul ne
 * suffit pas.
 */

const ACCENT = "#FFC933";

export default function LegalNotice() {
  return (
    <LegalLayout
      title="Mentions légales"
      subtitle="Informations relatives à l'éditeur et à l'hébergeur du site, conformément à la loi du 21 juin 2004."
    >
      <Section title="Éditeur du site">
        <UL
          items={[
            <>
              <strong>Nom commercial :</strong> {COMPANY.brand}
            </>,
            <>
              <strong>Éditeur :</strong> {COMPANY.legalName}
            </>,
            <>
              <strong>Forme juridique :</strong> {COMPANY.legalForm}
            </>,
            <>
              <strong>SIREN :</strong> {COMPANY.siren}
            </>,
            <>
              <strong>Siège :</strong> {COMPANY.address}
            </>,
            <>
              <strong>Contact :</strong>{" "}
              <a href={`mailto:${COMPANY.contactEmail}`} style={{ color: ACCENT }}>
                {COMPANY.contactEmail}
              </a>
            </>,
            <>
              <strong>TVA :</strong> {COMPANY.vat}
            </>,
            <>
              <strong>Responsable de la publication :</strong> {COMPANY.legalName}
            </>,
          ]}
        />
      </Section>

      <Section title="Hébergement">
        <P>L'application web est hébergée par :</P>
        <UL
          items={[
            <>
              <strong>{HOSTING.name}</strong>
            </>,
            <>{HOSTING.address}</>,
            <>
              <a href={HOSTING.website} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT }}>
                {HOSTING.website}
              </a>
            </>,
          ]}
        />
        <P>
          La base de données, l'authentification et les fichiers sont hébergés par{" "}
          <strong>Supabase Inc.</strong> dans l'Union européenne —{" "}
          <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT }}>
            supabase.com
          </a>
          .
        </P>
      </Section>

      <Section title="Propriété intellectuelle">
        <P>
          L'ensemble des éléments du site — structure, code source, textes, charte graphique,
          marque, base d'exercices — est protégé par le droit de la propriété intellectuelle et
          demeure la propriété de l'éditeur. Toute reproduction ou représentation, totale ou
          partielle, sans autorisation écrite préalable, est interdite.
        </P>
      </Section>

      <Section title="Données personnelles et cookies">
        <P>
          Le traitement des données personnelles est décrit dans la{" "}
          <a href={LEGAL_ROUTES.privacy} style={{ color: ACCENT }}>
            politique de confidentialité
          </a>
          .
        </P>
        <P>
          Le site n'utilise <strong>aucun cookie publicitaire ni traceur de mesure d'audience</strong>.
          Le seul stockage local est le jeton de session strictement nécessaire au maintien de votre
          connexion, exempté de consentement au titre de l'article 82 de la loi Informatique et
          Libertés.
        </P>
      </Section>

      <Section title="Avertissement">
        <P>
          Agon est un outil de suivi sportif et <strong>ne constitue pas un dispositif médical</strong>.
          Les informations qu'il affiche ne remplacent pas l'avis d'un professionnel de santé. Voir
          les{" "}
          <a href={LEGAL_ROUTES.terms} style={{ color: ACCENT }}>
            conditions générales d'utilisation
          </a>
          .
        </P>
      </Section>

      <Section title="Signaler un contenu">
        <P>
          Pour signaler un contenu illicite ou faire valoir un droit, écrivez à{" "}
          <a href={`mailto:${COMPANY.contactEmail}`} style={{ color: ACCENT }}>
            {COMPANY.contactEmail}
          </a>{" "}
          en précisant l'URL concernée et le motif. Les signalements sont traités dans les
          meilleurs délais.
        </P>
      </Section>
    </LegalLayout>
  );
}
