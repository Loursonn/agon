import LegalLayout, { Section, P, UL, Callout } from "./LegalLayout";
import { COMPANY, LEGAL_ROUTES } from "@/lib/legal";
import { C } from "@/lib/theme";

/**
 * Conditions générales d'utilisation.
 *
 * Exigées par le programme développeur Garmin et par COROS Partner. Deux
 * clauses sont indispensables au-delà du formalisme habituel :
 *
 * - l'avertissement sur la nature non médicale du service, puisque l'app
 *   manipule des données de santé et affiche des recommandations d'entraînement ;
 * - la répartition des responsabilités entre coach et plateforme, l'éditeur ne
 *   prescrivant aucun programme et n'étant pas partie au contrat de coaching.
 */

const ACCENT = C.ac;

export default function Terms() {
  return (
    <LegalLayout
      title="Conditions générales d'utilisation"
      subtitle="Les règles d'utilisation d'Agon. En créant un compte, vous les acceptez."
    >
      <Callout>
        <strong>Agon n'est pas un dispositif médical.</strong> L'application ne fournit aucun
        diagnostic, aucun traitement et aucun avis médical. Les programmes, charges et indicateurs
        affichés sont des outils de suivi sportif. Consultez un professionnel de santé avant de
        reprendre ou d'intensifier une activité physique, et arrêtez immédiatement en cas de
        douleur. Les indicateurs calculés (charge d'entraînement, feu du matin…) sont des repères
        pour le suivi, pas un diagnostic.
      </Callout>

      <Section title="1. Objet">
        <P>
          Les présentes conditions régissent l'accès et l'utilisation d'Agon, application de suivi
          de préparation physique éditée par {COMPANY.legalName} ({COMPANY.legalForm}, SIREN{" "}
          {COMPANY.siren}), ci-après « l'Éditeur ».
        </P>
        <P>
          Agon met en relation technique des coachs sportifs et leurs athlètes : le coach construit
          et assigne des programmes, l'athlète les exécute et enregistre ses résultats, les deux
          consultent les statistiques issues de ces données.
        </P>
      </Section>

      <Section title="2. Accès au service">
        <P>
          L'accès nécessite la création d'un compte. Deux rôles existent : <strong>coach</strong> et{" "}
          <strong>athlète</strong>. Un athlète rejoint un coach au moyen d'un code d'invitation que
          celui-ci lui transmet. Un même utilisateur peut cumuler les deux rôles.
        </P>
        <P>
          Un athlète peut aussi être suivi par un second coach (co-coach), qui dispose des mêmes
          accès que son coach référent, et par des professionnels de son staff (kiné, ostéopathe,
          nutritionniste, préparateur mental, médecin, coach adjoint), invités par lien. Un
          professionnel du staff n'accède aux données de l'athlète qu'avec l'accord de celui-ci et
          dans les seuls domaines que le coach lui ouvre.
        </P>
        <P>
          Vous devez avoir au moins 15 ans : votre date de naissance est demandée à l'inscription,
          qui est refusée en dessous de cet âge. Entre 15 et 18 ans, vous pouvez utiliser Agon et
          consentir seul au traitement de vos données ; nous vous invitons à en parler avec vos
          parents. Les fonctions d'intelligence artificielle sont réservées aux 18 ans et plus.
        </P>
        <P>
          Vous êtes responsable de la confidentialité de votre mot de passe et de toute activité
          réalisée depuis votre compte. Signalez sans délai tout accès non autorisé à{" "}
          <a href={`mailto:${COMPANY.contactEmail}`} style={{ color: ACCENT }}>
            {COMPANY.contactEmail}
          </a>
          .
        </P>
      </Section>

      <Section title="3. Vos engagements">
        <P>Vous vous engagez à :</P>
        <UL
          items={[
            "Fournir des informations exactes, notamment concernant votre poids, vos blessures et votre état de forme — un coach qui s'appuie sur des données fausses peut vous proposer une charge inadaptée.",
            "N'utiliser le service que pour votre propre suivi, ou celui des athlètes qui vous ont mandaté.",
            "Ne pas tenter d'accéder aux données d'un autre utilisateur, ni de contourner les contrôles d'accès.",
            "Ne pas extraire massivement le contenu de l'application par des moyens automatisés.",
            "Ne pas publier de contenu illicite, diffamatoire ou portant atteinte aux droits d'un tiers dans les champs libres (commentaires, retours, noms de séances).",
          ]}
        />
        <P>
          Le non-respect de ces engagements peut entraîner la suspension ou la suppression du
          compte, après mise en demeure sauf urgence ou gravité.
        </P>
      </Section>

      <Section title="4. Relation coach / athlète">
        <P>
          L'Éditeur fournit un outil : il n'est <strong>pas partie</strong> au contrat de coaching
          qui vous lie à votre coach. Il ne prescrit aucun programme, ne valide pas les
          qualifications des coachs et n'intervient pas dans leurs choix d'entraînement.
        </P>
        <P>
          Le coach est seul responsable des programmes qu'il assigne et des conseils qu'il donne.
          Les litiges relatifs à la prestation de coaching, à sa facturation ou à sa qualité se
          règlent directement entre le coach et l'athlète.
        </P>
        <P>
          En rejoignant un coach, l'athlète accepte que ses données d'entraînement et de bien-être
          lui soient accessibles. Il peut mettre fin à ce rattachement à tout moment depuis son
          profil, ce qui coupe immédiatement cet accès.
        </P>
        <P>
          <strong>Engagements du coach.</strong> Le coach, et le co-coach, accèdent à des données de
          santé de leurs athlètes. Pour l'usage qu'ils en font dans leur activité, ils en sont
          responsables au sens du RGPD. Ils s'engagent à :
        </P>
        <UL
          items={[
            "n'utiliser ces données que pour accompagner l'athlète concerné, et les garder confidentielles ;",
            "ne les communiquer à personne, ni les exporter hors d'Agon, sans l'accord de l'athlète ;",
            "s'ils créent le compte d'un athlète avant sa première connexion, l'en avoir informé, n'y saisir que le nécessaire, et supprimer le compte s'il n'est pas utilisé ;",
            "s'ils relient leur assistant d'intelligence artificielle (article 5), l'utiliser sur un compte qui leur est propre et, quand leur offre le permet, régler ce compte pour que leurs données ne servent pas à entraîner les modèles ;",
            "nous signaler sans délai toute utilisation anormale de leur compte ou de leur clé d'assistant.",
          ]}
        />
      </Section>

      <Section title="4 bis. Professionnels du staff">
        <P>
          Un professionnel du staff accède aux données d'un athlète avec l'accord de celui-ci, dans
          les domaines que le coach lui ouvre. Il est responsable de l'usage qu'il en fait dans sa
          propre activité, et prend les mêmes engagements que le coach. Un professionnel de santé
          reste tenu au secret professionnel : ce qu'il écrit dans Agon est visible de l'athlète,
          de son coach et de son co-coach, et il ne doit y écrire que ce que l'athlète a accepté de
          partager avec eux. Agon n'est pas un outil de dossier patient : il ne doit pas y déposer
          de documents issus de ses soins.
        </P>
      </Section>

      <Section title="5. Génération assistée par intelligence artificielle">
        <P>
          Le coach peut demander la génération d'une proposition de programme par un modèle
          d'intelligence artificielle, pour un athlète de 18 ans ou plus qui l'a accepté. Cette proposition est une <strong>suggestion</strong> : elle
          n'est jamais appliquée automatiquement et doit être relue, corrigée et validée par le
          coach, qui en assume la responsabilité.
        </P>
        <P>
          Un modèle d'intelligence artificielle peut produire des résultats inexacts ou inadaptés.
          L'Éditeur ne garantit ni la pertinence ni la sécurité des contenus générés.
        </P>
        <P>
          Le coach peut aussi relier son propre assistant d'intelligence artificielle (Claude,
          édité par Anthropic) à Agon au moyen d'une clé qu'il génère. Cet assistant agit pour le
          compte du coach, sur son abonnement personnel et sous sa responsabilité : il ne lit les
          données d'un athlète que si celui-ci a donné son accord « intelligence artificielle », et
          n'inscrit rien dans Agon sans la demande du coach. Le coach garde sa clé confidentielle
          et peut la révoquer à tout moment.
        </P>
      </Section>

      <Section title="6. Services connectés et import de fichiers">
        <P>
          Vous pouvez connecter un compte Garmin Connect ou COROS afin que vos activités soient
          récupérées automatiquement, ou importer vous-même des fichiers d'activité. Ces
          fonctionnalités sont facultatives.
        </P>
        <P>
          L'utilisation de ces services reste soumise aux conditions de leurs fournisseurs
          respectifs. L'Éditeur ne contrôle ni leur disponibilité, ni l'exactitude ni l'exhaustivité
          des données transmises, et ne peut être tenu responsable d'une interruption, d'une
          modification ou d'un arrêt décidé par le fournisseur.
        </P>
        <P>
          Selon le service, les données ne remontent qu'à partir de la date de connexion :
          l'historique antérieur peut ne pas être disponible. Vous pouvez le compléter par un
          import de fichier.
        </P>
        <P>
          Vous pouvez révoquer une connexion à tout moment depuis votre profil. La révocation
          interrompt immédiatement toute nouvelle récupération.
        </P>
      </Section>

      <Section title="7. Disponibilité et évolutions">
        <P>
          Le service est fourni « en l'état », sans garantie de disponibilité continue. Des
          interruptions peuvent survenir pour maintenance, mise à jour ou pour une cause extérieure
          (défaillance d'un hébergeur, d'un réseau, d'un service tiers).
        </P>
        <P>
          L'Éditeur peut faire évoluer les fonctionnalités. Si une évolution dégrade
          significativement un usage existant, elle est annoncée dans l'application. En cas
          d'arrêt définitif du service, vous êtes prévenu au moins 30 jours à l'avance pour
          pouvoir exporter vos données.
        </P>
        <P>
          Il vous appartient de conserver une copie de vos données importantes. La fonction d'export
          disponible dans votre profil permet de le faire à tout moment.
        </P>
      </Section>

      <Section title="8. Responsabilité">
        <P>
          L'Éditeur est responsable des dommages directs résultant d'un manquement qui lui est
          imputable. Sa responsabilité ne saurait être engagée pour :
        </P>
        <UL
          items={[
            "Les choix d'entraînement du coach et leur exécution par l'athlète : l'Éditeur ne prescrit aucun programme. Une blessure qui résulterait d'une erreur propre à l'application (calcul ou affichage faux, par exemple) reste à sa charge.",
            "Les conséquences de données inexactes que vous avez saisies.",
            "Une indisponibilité ou une défaillance d'un service tiers connecté.",
            "Une perte de données causée par la suppression de votre compte à votre initiative.",
            "Pour les utilisateurs qui agissent à titre professionnel (coachs, professionnels du staff) : les dommages indirects, tels que la perte d'exploitation ou le préjudice commercial.",
          ]}
        />
        <P>
          Aucune clause ne limite la responsabilité de l'Éditeur en cas de faute lourde, de dol, ou
          d'atteinte à la vie ou à l'intégrité physique, conformément au droit applicable.
        </P>
      </Section>

      <Section title="9. Propriété intellectuelle">
        <P>
          L'application, son code, sa charte graphique, sa marque et sa base d'exercices sont la
          propriété de l'Éditeur. Votre compte vous donne un droit d'usage personnel et non
          exclusif, limité à la durée du compte. Toute reproduction ou réutilisation en dehors de
          cet usage est interdite.
        </P>
        <P>
          Vous conservez la propriété des contenus que vous créez : programmes construits,
          commentaires, données saisies. Vous accordez à l'Éditeur le droit strictement technique de
          les héberger et de les afficher aux personnes autorisées, aux seules fins de fournir le
          service.
        </P>
        <P>
          Un athlète garde l'accès, pour son usage personnel, aux programmes et séances qui lui ont
          été assignés, y compris après la fin de son rattachement à son coach. Un coach qui rend
          public un contenu dans Agon (exercice, séance) autorise les autres utilisateurs à
          l'utiliser dans l'application ; il garantit en avoir les droits, et n'y publie aucune
          photo d'une personne sans son accord.
        </P>
      </Section>

      <Section title="10. Données personnelles">
        <P>
          Le traitement de vos données est décrit dans notre{" "}
          <a href={LEGAL_ROUTES.privacy} style={{ color: ACCENT }}>
            politique de confidentialité
          </a>
          , qui fait partie intégrante des présentes conditions. Vos données d'entraînement et de
          bien-être étant des données de santé, leur traitement repose sur votre consentement
          explicite, que vous pouvez retirer à tout moment.
        </P>
      </Section>

      <Section title="11. Résiliation">
        <P>
          Vous pouvez supprimer votre compte à tout moment depuis votre profil, sans préavis ni
          justification. La suppression est <strong>définitive et irréversible</strong> : les
          données sont effacées, pas archivées. Elles peuvent subsister au plus 30 jours dans les
          sauvegardes techniques de la base, qui ne servent qu'à restaurer le service après un
          incident (voir la politique de confidentialité).
        </P>
        <P>
          L'Éditeur peut suspendre ou résilier un compte en cas de manquement grave aux présentes
          conditions, ou en cas d'arrêt du service, avec un préavis raisonnable permettant
          l'export des données.
        </P>
      </Section>

      <Section title="12. Modification des conditions">
        <P>
          Les présentes conditions peuvent être modifiées. Chaque version porte un numéro et une
          date. Toute modification substantielle est notifiée dans l'application au moins 15 jours
          avant son entrée en vigueur, sauf si elle est imposée par la loi ou par la sécurité du
          service ; si elle porte sur vos données de santé, votre accord vous est redemandé. Si
          vous refusez la nouvelle version, vous pouvez exporter vos données et supprimer votre
          compte.
        </P>
      </Section>

      <Section title="13. Droit applicable et litiges">
        <P>
          Les présentes conditions sont soumises au droit français. En cas de litige, les parties
          rechercheront une solution amiable avant toute action contentieuse.
        </P>
        <P>
          Conformément à l'article L.612-1 du Code de la consommation, un consommateur peut
          recourir gratuitement à un médiateur de la consommation. À défaut d'accord, le litige
          relève des tribunaux français compétents.
        </P>
      </Section>
    </LegalLayout>
  );
}
