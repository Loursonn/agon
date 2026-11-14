import LegalLayout, { Section, P, UL, Table, Callout } from "./LegalLayout";
import { COMPANY, HOSTING, RETENTION, SUBPROCESSORS, LEGAL_ROUTES } from "@/lib/legal";
import { C } from "@/lib/theme";

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

const ACCENT = C.ac;

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
        annonceurs, et ni Agon ni Google (pour les analyses par intelligence artificielle d'Agon)
        n'utilisent vos données pour entraîner un modèle. Vous pouvez à tout moment retirer votre consentement et supprimer
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
          Aucun délégué à la protection des données n'a été désigné : cette désignation n'est
          obligatoire que pour un traitement de données de santé à grande échelle (article 37 du
          RGPD), ce qui n'est pas le cas d'Agon aujourd'hui. Les demandes sont traitées
          directement à l'adresse ci-dessus.
        </P>
      </Section>

      <Section title="2. Quelles données nous collectons">
        <P>
          Nous ne collectons que des données que vous nous fournissez, ou que vous nous autorisez
          expressément à récupérer auprès d'un service tiers. Aucune collecte n'a lieu à votre
          insu.
        </P>

        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.tx, margin: "0 0 8px" }}>
          2.1 Données de compte
        </h3>
        <UL
          items={[
            "Adresse email et mot de passe (stocké sous forme de hachage irréversible, jamais en clair).",
            "Nom et prénom.",
            "Date de naissance, demandée à la création du compte pour vérifier l'âge minimum (15 ans).",
            "Genre, si vous le renseignez (il sert à certains calculs et barèmes de tests).",
            "Rôle dans l'application : coach, athlète ou professionnel du staff, et le rattachement entre eux.",
            "Pour un professionnel du staff : son métier, les athlètes qu'il accompagne et les droits qui lui sont ouverts.",
            "Préférences d'affichage et paramètres du compte.",
          ]}
        />

        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.tx, margin: "16px 0 8px" }}>
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
            "Tests et évaluations : résultats, mesures, vidéos ou photos jointes ; courses et tests HYROX (temps, stations, analyses) ; compétitions.",
            "Bien-être du matin : récupération, qualité et durée du sommeil, sérénité, énergie, fraîcheur musculaire, envie de vous entraîner, courbatures par zone et par intensité (et la séance de la veille à laquelle vous les rattachez), douleur éventuelle de 0 à 10, si vous êtes malade ou fiévreux, poids.",
            "Bilan hebdomadaire : ressenti de la semaine (1 à 5), engagements, réponses libres, douleur éventuelle (zone, type, niveau de 0 à 10), message au coach, et un résumé chiffré de la semaine figé à l'envoi. Votre coach et votre staff ne le voient qu'une fois envoyé, jamais à l'état de brouillon.",
            "Taille, poids de corps, masse grasse, métabolisme de base, et mensurations que vous saisissez.",
            "Photos du corps (face, côté, dos, jambes) que vous déposez avec vos mensurations. Dans l'application, seuls vous et votre coach les voient.",
            "Blessures sportives et zones douloureuses que vous, votre coach ou votre staff déclarez : zone, dates, type, mécanisme, contexte, douleur, impact sur l'entraînement, jours d'arrêt, date de retour, statut et notes. Agon ne recueille ni diagnostic, ni traitement, ni antécédents médicaux, ni documents médicaux.",
            "Fichiers joints à vos tests (photos, vidéos, PDF) et captures d'écran de votre montre.",
            "Habitudes que vous suivez, et événements de votre calendrier (examens, voyages…) que vous ajoutez.",
            "Données de nutrition que vous saisissez.",
            "Commentaires et retours échangés avec votre coach.",
            "Contenus déposés par les professionnels de votre staff : blessures saisies, fiches, commentaires.",
          ]}
        />

        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.tx, margin: "16px 0 8px" }}>
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
            "Données quotidiennes : pas, étages, dépense énergétique, temps d'activité, fréquence cardiaque de repos, variabilité cardiaque de nuit.",
            "Sommeil : durée, phases, heures de coucher et de lever, score lorsqu'il est fourni.",
            "Stress, Body Battery, respiration, saturation en oxygène (SpO2), variation de température cutanée, lorsque la montre les mesure.",
            "Composition corporelle et tension artérielle, si vous les enregistrez dans le service connecté (balance, tensiomètre).",
            "Indicateurs calculés par le fabricant : VO2max estimée, âge sportif, charge d'entraînement, statut de récupération, selon le modèle de montre.",
          ]}
        />
        <P>
          Pour Garmin, nous conservons en plus une <strong>copie intégrale</strong> de ce que le
          service nous transmet (le contenu complet de chaque résumé, les échantillons seconde par
          seconde d'une activité — fréquence cardiaque, allure, cadence, puissance, altitude,
          position GPS — et le fichier d'origine de la montre), y compris les types de données que
          l'application n'affiche pas encore (nutrition, hydratation…). Cette copie sert à
          recalculer ou corriger vos données sans vous redemander de synchroniser. Seul vous y avez
          accès (elle figure dans l'export de vos données) ; votre coach ne la lit pas. Elle est
          supprimée quand vous déconnectez Garmin, retirez votre accord ou supprimez votre compte.
        </P>
        <P>
          Agon affiche ces mesures telles quelles, avec leur source. Les scores propres au fabricant
          (Body Battery, score de sommeil, statut de récupération…) ne servent à aucun calcul
          d'Agon.
        </P>
        <P>
          Vous pouvez également importer vous-même des fichiers d'activité (formats FIT, TCX, GPX)
          ou une archive d'export fournie par un service tiers. Dans ce cas, c'est vous qui
          transmettez le fichier : aucune connexion automatique n'est établie avec ce service.
        </P>

        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.tx, margin: "16px 0 8px" }}>
          2.4 Indicateurs calculés par Agon
        </h3>
        <P>
          À partir des données ci-dessus, Agon calcule des indicateurs pour vous et votre coach :
          charge d'entraînement (prévue et réalisée, sur la semaine et sur 4 semaines), vitesse
          critique, et un <strong>feu du matin</strong> (vert, orange ou rouge) qui compare votre
          variabilité cardiaque, votre fréquence cardiaque de repos, vos ressentis et votre charge à
          vos propres habitudes. Ces indicateurs sont recalculés à chaque affichage et ne sont pas
          conservés à part, sauf le feu de la semaine, figé dans votre bilan hebdomadaire quand vous
          l'envoyez. Ce sont des repères pour votre coach, pas un diagnostic médical.
        </P>

        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.tx, margin: "16px 0 8px" }}>
          2.5 Données techniques
        </h3>
        <UL
          items={[
            "Journaux de connexion : date, heure, adresse IP, type de navigateur. Conservés pour la sécurité du service.",
            "Jeton de session, stocké localement dans votre navigateur pour vous maintenir connecté.",
            "Version de l'application que vous utilisez, pour savoir qui doit mettre à jour et corriger les problèmes propres à une version.",
            "Retours que vous nous envoyez sur l'application (votre message, la page où vous étiez, votre navigateur).",
          ]}
        />
        <P>
          Les polices de caractères sont servies par Agon lui-même. Certains contenus viennent de
          services tiers, qui reçoivent alors votre adresse IP : les vidéos d'exercices (YouTube, en
          mode « sans cookie », chargées seulement quand vous lancez la vidéo) et, si votre coach en a
          configuré une, sa page de prise de rendez-vous (Calendly, ouverte à votre demande).
          Chacun de ces services applique sa propre politique de confidentialité.
        </P>
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
              "Permettre à votre coach de suivre votre progression, d'adapter votre programme et votre charge d'entraînement",
              "Données d'entraînement, de bien-être, de blessure, données de montre connectée",
              "Consentement explicite (art. 9.2.a)",
            ],
            [
              "Permettre aux professionnels ajoutés par votre coach ou par vous (kiné, ostéopathe, nutritionniste…) de vous accompagner",
              "Les seuls domaines que votre coach leur ouvre : programme, planification, séances réalisées, bien-être, blessures, nutrition, tests, fiches, commentaires",
              "Consentement explicite et spécifique, facultatif (art. 9.2.a)",
            ],
            [
              "Récupérer automatiquement les données de votre montre",
              "Données du service connecté",
              "Consentement explicite et spécifique, donné service par service (art. 9.2.a)",
            ],
            [
              "Produire par intelligence artificielle des analyses, des synthèses et des visualisations de vos données d'entraînement, et proposer à votre coach des axes de travail — via l'API Google Gemini utilisée par Agon, ou via l'assistant Claude de votre coach",
              "Historique d'entraînement, moyennes de bien-être (récupération, sommeil, stress, énergie), poids, objectifs, blessures déclarées ; pour l'assistant Claude, également vos compétitions, tests et les titres des événements de votre calendrier. Jamais les données Garmin ou COROS (voir 4.3)",
              "Consentement explicite (art. 9.2.a), proposé seulement à partir de 18 ans",
            ],
            [
              "Améliorer l'application et corriger ses défauts à partir de vos retours et de la version utilisée",
              "Retours sur l'application, version installée",
              "Intérêt légitime (art. 6.1.f)",
            ],
            [
              "Assurer la sécurité du service, prévenir les abus",
              "Journaux techniques",
              "Intérêt légitime (art. 6.1.f)",
            ],
            [
              "Répondre à vos demandes et conserver la preuve de votre consentement",
              "Email, horodatage et version du consentement",
              "Obligation légale (art. 6.1.c, avec les art. 5.2 et 7.1)",
            ],
          ]}
        />
        <P>
          Nous ne faisons <strong>aucune prospection commerciale</strong>, aucun profilage
          publicitaire et aucune décision entièrement automatisée produisant des effets juridiques
          à votre égard (article 22 du RGPD). Le feu du matin et la charge d'entraînement évaluent
          automatiquement votre état de forme : c'est un profilage au sens de l'article 4.4, mais
          il ne décide de rien ; c'est votre coach qui décide. Les propositions générées par
          intelligence artificielle sont des suggestions soumises à la validation de votre coach,
          qui reste seul décideur.
        </P>
      </Section>

      <Section title="4. Qui peut voir vos données">
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.tx, margin: "0 0 8px" }}>
          4.1 Votre coach
        </h3>
        <P>
          C'est la finalité même du service. Le coach auquel vous êtes rattaché, et votre
          co-coach si vous en avez un, accèdent à vos séances, vos charges, votre bien-être, vos
          bilans hebdomadaires une fois envoyés, votre poids, vos mensurations et photos du corps,
          vos blessures (y compris celles que saisissent les professionnels de
          votre staff) et, si vous avez connecté une montre, aux données qu'elle transmet. Un
          coach ne voit{" "}
          <strong>que</strong> les athlètes qui lui sont rattachés : cette restriction est
          appliquée au niveau de la base de données elle-même, et non seulement dans l'interface.
        </P>
        <P>
          Si vous mettez fin à la relation de coaching depuis votre profil, l'accès du coach à vos
          données cesse immédiatement.
        </P>
        <P>
          Votre coach utilise ces données pour sa propre activité de coaching : pour cet usage, il
          en est lui-même responsable. Nos conditions d'utilisation l'obligent à les garder
          confidentielles, à ne les utiliser que pour vous accompagner et à ne les communiquer à
          personne sans votre accord. Si votre coach a créé votre compte avant votre première
          connexion, il s'engage à vous en avoir informé et à n'y avoir saisi que le nécessaire.
        </P>
        <P>
          Si vous l'avez accepté (accord « intelligence artificielle », réservé aux 18 ans et plus,
          révocable dans votre profil), votre coach peut aussi faire lire vos données d'entraînement par son assistant
          d'intelligence artificielle personnel, <strong>Claude, édité par Anthropic</strong>, au
          moyen d'une clé qu'il génère dans Agon. Cet assistant reçoit votre prénom, vos séances et
          charges réalisées, votre bien-être, votre poids, vos blessures déclarées (zones et dates),
          vos compétitions et tests, les données de montre autorisées, ainsi que les dates et titres
          des événements que vous ajoutez à votre calendrier (examens, voyages…) — jamais vos
          commentaires libres sur vos séances, votre ressenti ou vos blessures. Il aide votre coach à
          planifier et à périodiser votre entraînement, et peut l'inscrire dans Agon (séances,
          cycles, compétitions, tests, fiches, habitudes) — uniquement à la demande de votre coach,
          qui décide. Il ne supprime jamais ce que vous avez déjà réalisé ou renseigné.
        </P>
        <P>
          Anthropic n'est pas notre prestataire : vos données passent par le compte personnel de
          votre coach, et leur usage — notamment pour l'entraînement des modèles — dépend des
          réglages de ce compte, que nous ne contrôlons pas. Chaque lecture est journalisée : sur
          simple demande, nous pouvons vous indiquer quand vos données ont été transmises à cet
          assistant. Un accord donné avant le 30 octobre 2026, sous un texte qui ne nommait que
          Google Gemini, ne vaut pas pour cet assistant.
        </P>

        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.tx, margin: "16px 0 8px" }}>
          4.2 Les professionnels de votre staff
        </h3>
        <P>
          Votre coach, ou vous-même, pouvez ajouter à votre staff des professionnels qui vous
          accompagnent : kiné, ostéopathe, nutritionniste, préparateur mental, médecin, coach
          adjoint. Un professionnel n'accède à vos données que si vous l'avez accepté (accord
          « staff », facultatif, modifiable dans votre profil), et seulement dans les domaines que
          votre coach lui ouvre, en lecture ou en écriture : programme, planification, séances
          réalisées, bien-être, blessures, nutrition, tests, fiches, commentaires.
          Comme pour votre coach, ces restrictions sont appliquées par la base de données
          elle-même. <strong>Sans votre accord, aucun professionnel ne voit vos données</strong>,
          même s'il a été ajouté à votre staff.
        </P>
        <P>
          Dans « Mon staff », vous voyez à tout moment vos professionnels, leur métier et leurs
          droits, et vous êtes informé de chaque ajout et de chaque changement de droits. Vous
          pouvez retirer l'accès d'un professionnel, ou retirer votre accord pour tous : l'accès
          cesse immédiatement.
        </P>
        <P>
          Dans les domaines ouverts en écriture, un professionnel peut déclarer des blessures
          dans votre suivi, déposer des fiches et commenter. Ces contenus restent rattachés à votre
          suivi et à la bibliothèque de votre coach, avec le nom de leur auteur, et votre coach
          les voit. Chaque professionnel est responsable de l'usage qu'il fait de vos données dans
          sa propre activité ; les professionnels de santé restent tenus au secret professionnel.
        </P>

        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.tx, margin: "16px 0 8px" }}>
          4.3 Nos prestataires techniques
        </h3>
        <P>
          Ces tiers agissent sur nos instructions, dans le cadre de l'accord de traitement de
          chacun (article 28 du RGPD), et n'ont pas le droit d'utiliser vos données à leurs propres
          fins :
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
                <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>{s.transferMechanism}</div>
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
          conditions l'interdisent n'est transmise à ce traitement, et aucune donnée d'un
          utilisateur de moins de 18 ans : l'accord « intelligence artificielle » ne lui est pas
          proposé.
        </P>
        <P>
          <strong>Ne sont jamais transmis à une intelligence artificielle</strong>, ni à Gemini ni à
          l'assistant de votre coach : les données de vos montres Garmin et COROS et leur copie
          intégrale, vos photos du corps, la douleur et la maladie déclarées le matin, votre bilan
          hebdomadaire, le feu du matin et la charge calculée.
        </P>

        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.tx, margin: "16px 0 8px" }}>
          4.4 Les services que vous connectez
        </h3>
        <P>
          Lorsque vous connectez une montre, le fabricant du service agit comme{" "}
          <strong>responsable de traitement indépendant</strong>, et non comme notre prestataire :
          il décide seul de ses propres traitements, et sa politique de confidentialité s'applique
          en parallèle de celle-ci. Pour exercer vos droits sur les données qu'il détient, c'est à
          lui qu'il faut vous adresser. Les échanges avec ce service ont lieu à votre demande ;
          il encadre lui-même ses éventuels transferts hors de l'Union européenne.
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

        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.tx, margin: "16px 0 8px" }}>
          4.5 Autorités
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
          La base de données et les fichiers sont hébergés par Supabase dans l'Union européenne
          (Irlande).
          L'application web est distribuée par {HOSTING.name} ({HOSTING.address}).
        </P>
        <P>
          Certains prestataires sont établis hors de l'Union européenne, ou sont des sociétés
          américaines. Ces transferts sont encadrés par le Data Privacy Framework (décision
          d'adéquation de la Commission européenne du 10 juillet 2023) ou par les clauses
          contractuelles types adoptées par la Commission. Le détail figure au tableau de la
          section 4.3.
        </P>
      </Section>

      <Section title="6. Combien de temps nous les conservons">
        <Table
          headers={["Catégorie", "Durée de conservation"]}
          rows={RETENTION.map((r) => [r.data, r.duration])}
        />
        <P>
          À la suppression de votre compte, vos données sont effacées de la base de production
          immédiatement. Elles peuvent subsister jusqu'à 30 jours dans les sauvegardes chiffrées
          automatiques de la base, qui ne servent qu'à restaurer le service après un incident,
          puis disparaissent par rotation automatique.
        </P>
        <P>
          Si un coach supprime son compte, ses athlètes gardent toutes leurs données : ils sont
          seulement détachés de lui. Les documents que ce coach avait créés (fiches, bibliothèque)
          partent avec son compte.
        </P>
        <P>
          Tant que votre compte existe, l'historique de vos accords (date, version du document,
          accord ou retrait) est conservé, y compris après un retrait, pour pouvoir démontrer
          qu'ils ont bien été recueillis. Quand vous supprimez votre compte, cet historique est
          effacé avec lui : nous ne gardons qu'une trace anonyme de la suppression (date, rôle,
          version des documents en vigueur), sans nom, sans e-mail ni identifiant.
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
              compte et l'ensemble de vos données. Disponible depuis votre profil, ou sans
              l'application sur la page{" "}
              <a href={LEGAL_ROUTES.deletion} style={{ color: ACCENT }}>
                Supprimer votre compte
              </a>
              .
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
              votre compte. Retirer votre accord « staff » coupe immédiatement l'accès de tous vos
              professionnels, sans autre effet sur l'application.
            </>,
            <>
              <strong>Limitation et opposition</strong> — demander le gel d'un traitement, ou vous
              opposer à un traitement fondé sur l'intérêt légitime.
            </>,
            <>
              <strong>Directives après votre décès</strong> — définir ce que deviennent vos données
              après votre mort (article 85 de la loi Informatique et Libertés), en nous écrivant.
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
          En cas de violation de données, nous la consignons dans un registre interne. Si elle
          présente un risque pour vos droits, nous la notifions à la CNIL dans les 72 heures ; si
          ce risque est élevé, nous vous en informons aussi directement, sans tarder.
        </P>
      </Section>

      <Section title="9. Mineurs">
        <P>
          Le service n'est pas destiné aux personnes de moins de 15 ans. Votre date de naissance
          est demandée à la création du compte : l'inscription est refusée en dessous de 15 ans.
          À partir de 15 ans, vous pouvez consentir seul au traitement de vos données (article 45
          de la loi Informatique et Libertés) ; nous vous invitons à en parler avec vos parents.
          Les analyses par intelligence artificielle sont réservées aux 18 ans et plus. Si nous
          apprenons qu'un compte a été créé par une personne de moins de 15 ans, nous le
          supprimons.
        </P>
      </Section>

      <Section title="10. Modifications">
        <P>
          Cette politique peut évoluer. Chaque version porte un numéro et une date, affichés en
          tête de page. En cas de changement substantiel — nouvelle finalité, nouveau destinataire,
          nouvelle catégorie de données — nous vous en informons dans l'application et vous
          demandons votre consentement pour ce qui change. Continuer à utiliser le service après une modification
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
