import LegalLayout, { Section, P, UL, Table, Callout } from "./LegalLayout";
import { COMPANY, HOSTING, RETENTION, SUBPROCESSORS, LEGAL_ROUTES } from "@/lib/legal";

/**
 * Politique de confidentialité.
 *
 * Document central du dossier de conformité : son URL est un champ obligatoire
 * du formulaire de demande Garmin Connect Developer Program, et son contenu est
 * revu manuellement par leur équipe.
 *
 * Deux points structurent la rédaction :
 *
 * 1. Les données d'entraînement et de bien-être relèvent de l'article 9 du
 *    RGPD (données de santé). Leur traitement est interdit par défaut : la
 *    seule base légale praticable ici est le consentement explicite
 *    (art. 9.2.a), pas l'intérêt légitime ni l'exécution du contrat. D'où le
 *    mécanisme de consentement séparé à l'inscription.
 *
 * 2. Le partage au coach est la finalité principale, pas un effet de bord. Il
 *    doit être annoncé sans ambiguïté, car c'est précisément le point que les
 *    programmes partenaires vérifient avant d'autoriser un tableau de bord
 *    multi-utilisateurs.
 */

const ACCENT = "#FFC933";

function Mail() {
  return (
    <a href={`mailto:${COMPANY.contactEmail}`} style={{ color: ACCENT }}>
      {COMPANY.contactEmail}
    </a>
  );
}

export default function PrivacyPolicy() {
  return (
    <LegalLayout
      title="Politique de confidentialité"
      subtitle="Comment Agon collecte, utilise et protège vos données — en particulier vos données de santé et d'entraînement."
    >
      <Callout>
        <strong>L'essentiel.</strong> Agon sert à partager votre entraînement avec votre coach :
        c'est la raison même du service, donc vos données d'entraînement et de bien-être sont
        visibles par le coach auquel vous êtes rattaché. Rien n'est vendu, rien n'est cédé à des
        annonceurs, et aucune donnée n'est utilisée pour entraîner un modèle d'intelligence
        artificielle. Vous pouvez à tout moment retirer votre consentement et supprimer
        définitivement votre compte depuis l'application.
      </Callout>

      <Section title="1. Qui est responsable de vos données">
        <P>
          Le responsable du traitement, au sens de l'article 4.7 du Règlement général sur la
          protection des données (RGPD), est :
        </P>
        <UL
          items={[
            <>
              <strong>{COMPANY.legalName}</strong>, exerçant sous le nom commercial{" "}
              <strong>{COMPANY.brand}</strong>
            </>,
            <>{COMPANY.legalForm}, SIREN {COMPANY.siren}</>,
            <>{COMPANY.address}</>,
            <>
              Contact pour toute question relative à vos données : <Mail />
            </>,
          ]}
        />
        <P>
          Aucun délégué à la protection des données n'a été désigné, cette désignation n'étant pas
          obligatoire au regard de la taille de la structure. Les demandes sont traitées
          directement à l'adresse ci-dessus.
        </P>
      </Section>

      <Section title="2. Quelles données nous collectons">
        <P>
          Nous ne collectons que des données que vous nous fournissez, ou que vous nous autorisez
          expressément à récupérer auprès d'un service tiers. Aucune collecte n'a lieu à votre
          insu.
        </P>

        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", margin: "0 0 8px" }}>
          2.1 Données de compte
        </h3>
        <UL
          items={[
            "Adresse email et mot de passe (stocké sous forme de hachage irréversible, jamais en clair).",
            "Nom et prénom.",
            "Rôle dans l'application : coach ou athlète, et le rattachement entre les deux.",
            "Préférences d'affichage et paramètres du compte.",
          ]}
        />

        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", margin: "16px 0 8px" }}>
          2.2 Données d'entraînement et de santé
        </h3>
        <P>
          Ces données relèvent de l'article 9 du RGPD : ce sont des{" "}
          <strong>données concernant la santé</strong>, soumises à une protection renforcée. Nous
          ne les traitons qu'avec votre consentement explicite, recueilli séparément à
          l'inscription.
        </P>
        <UL
          items={[
            "Séances réalisées : exercices, charges, répétitions, séries, repos, difficulté perçue (RIR/RPE).",
            "Records personnels et maximums estimés.",
            "Bien-être quotidien : fatigue, qualité et durée du sommeil, stress, énergie, courbatures par zone.",
            "Poids de corps et mesures corporelles que vous saisissez.",
            "Blessures et zones douloureuses que vous déclarez, avec leurs dates.",
            "Données de nutrition que vous saisissez.",
            "Commentaires et retours échangés avec votre coach.",
          ]}
        />

        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", margin: "16px 0 8px" }}>
          2.3 Données issues d'une montre ou d'un service connecté
        </h3>
        <P>
          Si — et seulement si — vous connectez volontairement un compte Garmin Connect ou COROS,
          nous récupérons les données que ce service nous transmet. Cette connexion est facultative :
          l'application fonctionne sans elle, et vous pouvez la révoquer à tout moment depuis votre
          profil, ce qui interrompt immédiatement toute nouvelle récupération.
        </P>
        <UL
          items={[
            "Activités : type, date, durée, distance, allure, vitesse, dénivelé, calories, tracé GPS lorsqu'il est fourni.",
            "Fréquence cardiaque : moyenne, maximale, zones, et série temporelle lorsqu'elle est fournie.",
            "Données quotidiennes : pas, dépense énergétique, fréquence cardiaque de repos, variabilité cardiaque.",
            "Sommeil : durée, phases, score lorsqu'il est fourni.",
            "Indicateurs calculés par le fabricant : VO2max estimée, charge d'entraînement, statut de récupération, selon le modèle de montre.",
          ]}
        />
        <P>
          Vous pouvez également importer vous-même des fichiers d'activité (formats FIT, TCX, GPX)
          ou une archive d'export fournie par un service tiers. Dans ce cas, c'est vous qui
          transmettez le fichier : aucune connexion automatique n'est établie avec ce service.
        </P>

        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", margin: "16px 0 8px" }}>
          2.4 Données techniques
        </h3>
        <UL
          items={[
            "Journaux de connexion : date, heure, adresse IP, type de navigateur. Conservés pour la sécurité du service.",
            "Jeton de session, stocké localement dans votre navigateur pour vous maintenir connecté.",
          ]}
        />
        <P>
          Nous n'utilisons <strong>aucun cookie publicitaire</strong>, aucun traceur tiers et aucun
          outil de mesure d'audience comportementale. Le seul stockage local est celui strictement
          nécessaire à votre session, qui ne requiert pas de consentement.
        </P>
      </Section>

      <Section title="3. Pourquoi nous les traitons, et sur quelle base légale">
        <Table
          headers={["Finalité", "Données concernées", "Base légale"]}
          rows={[
            [
              "Créer et gérer votre compte, vous authentifier",
              "Données de compte",
              "Exécution du contrat (art. 6.1.b)",
            ],
            [
              "Vous permettre de suivre votre programme et d'enregistrer vos séances",
              "Données d'entraînement et de santé",
              "Consentement explicite (art. 9.2.a)",
            ],
            [
              "Permettre à votre coach de suivre votre progression, d'adapter votre programme et de prévenir le surentraînement ou la blessure",
              "Données d'entraînement, de bien-être, de blessure, données de montre connectée",
              "Consentement explicite (art. 9.2.a)",
            ],
            [
              "Récupérer automatiquement les données de votre montre",
              "Données du service connecté",
              "Consentement explicite et spécifique, donné service par service (art. 9.2.a)",
            ],
            [
              "Générer une proposition de programme assistée par intelligence artificielle, à la demande du coach",
              "Historique d'entraînement, objectifs, contraintes et blessures déclarées",
              "Consentement explicite (art. 9.2.a)",
            ],
            [
              "Assurer la sécurité du service, prévenir les abus",
              "Journaux techniques",
              "Intérêt légitime (art. 6.1.f)",
            ],
            [
              "Répondre à vos demandes et conserver la preuve de votre consentement",
              "Email, horodatage et version du consentement",
              "Obligation légale (art. 6.1.c)",
            ],
          ]}
        />
        <P>
          Nous ne faisons <strong>aucune prospection commerciale</strong>, aucun profilage
          publicitaire et aucune décision entièrement automatisée produisant des effets juridiques
          à votre égard. Les propositions générées par intelligence artificielle sont des
          suggestions soumises à la validation de votre coach, qui reste seul décideur.
        </P>
      </Section>

      <Section title="4. Qui peut voir vos données">
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", margin: "0 0 8px" }}>
          4.1 Votre coach
        </h3>
        <P>
          C'est la finalité même du service. Le coach auquel vous êtes rattaché accède à vos
          séances, vos charges, votre bien-être, votre poids, vos blessures déclarées et, si vous
          avez connecté une montre, aux données qu'elle transmet. Un coach ne voit{" "}
          <strong>que</strong> les athlètes qui lui sont rattachés : cette restriction est
          appliquée au niveau de la base de données elle-même, et non seulement dans l'interface.
        </P>
        <P>
          Si vous mettez fin à la relation de coaching depuis votre profil, l'accès du coach à vos
          données cesse immédiatement.
        </P>

        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", margin: "16px 0 8px" }}>
          4.2 Nos prestataires techniques
        </h3>
        <P>
          Ces tiers agissent sur nos instructions, dans le cadre d'un contrat conforme à l'article
          28 du RGPD, et n'ont pas le droit d'utiliser vos données à leurs propres fins :
        </P>
        <Table
          headers={["Prestataire", "Rôle", "Localisation"]}
          rows={SUBPROCESSORS.filter((s) => s.role === "subprocessor").map((s) => [
            <a key={s.name} href={s.privacyUrl} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT }}>
              {s.name}
            </a>,
            s.purpose,
            <>
              {s.location}
              {s.transferMechanism && (
                <div style={{ fontSize: 11, color: "#7D7468", marginTop: 2 }}>{s.transferMechanism}</div>
              )}
            </>,
          ])}
        />
        <P>
          Concernant l'intelligence artificielle : lorsqu'une analyse, une synthèse ou une
          proposition de programme est demandée, les données nécessaires sont transmises à l'API
          Google Gemini. Ces données{" "}
          <strong>ne sont pas utilisées pour entraîner les modèles de Google</strong>, conformément
          aux conditions de l'API payante. Aucune donnée issue d'un service tiers dont les
          conditions l'interdisent n'est transmise à ce traitement.
        </P>

        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", margin: "16px 0 8px" }}>
          4.3 Les services que vous connectez
        </h3>
        <P>
          Lorsque vous connectez une montre, le fabricant du service agit comme{" "}
          <strong>responsable de traitement indépendant</strong>, et non comme notre prestataire :
          il décide seul de ses propres traitements, et sa politique de confidentialité s'applique
          en parallèle de celle-ci. Pour exercer vos droits sur les données qu'il détient, c'est à
          lui qu'il faut vous adresser.
        </P>
        <Table
          headers={["Service", "Ce que nous récupérons", "Sa politique"]}
          rows={SUBPROCESSORS.filter((s) => s.role === "independent").map((s) => [
            s.name,
            s.purpose,
            <a key={s.name} href={s.privacyUrl} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT }}>
              Consulter
            </a>,
          ])}
        />

        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", margin: "16px 0 8px" }}>
          4.4 Autorités
        </h3>
        <P>
          Nous pouvons être contraints de communiquer des données sur réquisition judiciaire ou
          administrative. Nous ne le ferons que dans la stricte mesure exigée par la loi.
        </P>
        <P>
          <strong>
            Nous ne vendons, ne louons et ne cédons vos données à aucun tiers, dans aucune
            circonstance.
          </strong>
        </P>
      </Section>

      <Section title="5. Où vos données sont stockées">
        <P>
          La base de données et les fichiers sont hébergés par Supabase dans l'Union européenne.
          L'application web est distribuée par {HOSTING.name} ({HOSTING.address}).
        </P>
        <P>
          Certains prestataires sont établis hors de l'Union européenne. Ces transferts sont
          encadrés par les clauses contractuelles types adoptées par la Commission européenne, et
          le cas échéant par le Data Privacy Framework. Le détail figure au tableau de la section
          4.2.
        </P>
      </Section>

      <Section title="6. Combien de temps nous les conservons">
        <Table
          headers={["Catégorie", "Durée de conservation"]}
          rows={RETENTION.map((r) => [r.data, r.duration])}
        />
        <P>
          À la suppression de votre compte, vos données sont effacées de la base de production
          immédiatement. Elles peuvent subsister jusqu'à 30 jours dans les sauvegardes chiffrées,
          puis disparaissent par rotation automatique.
        </P>
        <P>
          Seule exception : la preuve de votre consentement (email, date, version du document
          accepté) est conservée 5 ans, car la loi nous impose de pouvoir démontrer que ce
          consentement a bien été recueilli.
        </P>
      </Section>

      <Section title="7. Vos droits">
        <P>
          Le RGPD vous confère les droits suivants, que vous pouvez exercer gratuitement et à tout
          moment :
        </P>
        <UL
          items={[
            <>
              <strong>Accès</strong> — obtenir une copie de toutes vos données. Disponible
              directement depuis votre profil, au format JSON, sans intervention de notre part.
            </>,
            <>
              <strong>Rectification</strong> — corriger une donnée inexacte. La plupart sont
              modifiables directement dans l'application.
            </>,
            <>
              <strong>Effacement (« droit à l'oubli »)</strong> — supprimer définitivement votre
              compte et l'ensemble de vos données. Disponible depuis votre profil.
            </>,
            <>
              <strong>Portabilité</strong> — récupérer vos données dans un format structuré et
              lisible par machine, pour les transférer ailleurs.
            </>,
            <>
              <strong>Retrait du consentement</strong> — à tout moment, sans justification. Le
              retrait n'a pas d'effet rétroactif sur les traitements déjà effectués, mais arrête
              les traitements futurs. Retirer votre consentement au traitement de vos données de
              santé rend l'application inutilisable : nous vous proposerons alors de supprimer
              votre compte.
            </>,
            <>
              <strong>Limitation et opposition</strong> — demander le gel d'un traitement, ou vous
              opposer à un traitement fondé sur l'intérêt légitime.
            </>,
          ]}
        />
        <P>
          Pour les droits qui ne sont pas automatisés dans l'application, écrivez à <Mail />. Nous
          répondons dans un délai d'un mois, prolongeable de deux mois pour les demandes
          complexes, auquel cas nous vous en informons.
        </P>
        <P>
          Si notre réponse ne vous satisfait pas, vous pouvez saisir la Commission nationale de
          l'informatique et des libertés (CNIL), 3 place de Fontenoy, 75334 Paris Cedex 07, ou en
          ligne sur{" "}
          <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT }}>
            cnil.fr
          </a>
          .
        </P>
      </Section>

      <Section title="8. Comment nous les protégeons">
        <UL
          items={[
            "Chiffrement en transit (HTTPS/TLS) sur l'ensemble des échanges, et chiffrement au repos de la base de données.",
            "Cloisonnement appliqué au niveau de la base de données : chaque requête est filtrée par des règles d'accès serveur, de sorte qu'un utilisateur ne peut techniquement pas lire les données d'un autre, même en détournant l'application.",
            "Mots de passe stockés sous forme de hachage à sens unique, jamais en clair, jamais consultables par nous.",
            "Jetons d'accès aux services connectés chiffrés en base, isolés des données applicatives.",
            "Journalisation des accès et limitation du nombre de requêtes pour détecter les abus.",
          ]}
        />
        <P>
          En cas de violation de données susceptible d'engendrer un risque élevé pour vos droits,
          nous notifierons la CNIL dans les 72 heures et vous informerons directement.
        </P>
      </Section>

      <Section title="9. Mineurs">
        <P>
          Le service n'est pas destiné aux personnes de moins de 15 ans. Si vous avez entre 15 et
          18 ans, l'accord de votre représentant légal est requis. Si nous apprenons qu'un compte a
          été créé par un enfant de moins de 15 ans sans cet accord, nous le supprimons.
        </P>
      </Section>

      <Section title="10. Modifications">
        <P>
          Cette politique peut évoluer. Chaque version porte un numéro et une date, affichés en
          tête de page. En cas de changement substantiel — nouvelle finalité, nouveau destinataire,
          nouvelle catégorie de données — nous vous en informons dans l'application et vous
          redemandons votre consentement. Continuer à utiliser le service après une modification
          mineure vaut acceptation de celle-ci.
        </P>
        <P>
          Voir aussi nos{" "}
          <a href={LEGAL_ROUTES.terms} style={{ color: ACCENT }}>
            conditions générales d'utilisation
          </a>{" "}
          et nos{" "}
          <a href={LEGAL_ROUTES.notice} style={{ color: ACCENT }}>
            mentions légales
          </a>
          .
        </P>
      </Section>
    </LegalLayout>
  );
}
