import { IMPORT_PROMPT, IMPORT_PROMPT_FILENAME } from "./importPrompt";
import { COACH_API_PROMPT, COACH_API_PROMPT_FILENAME } from "./coachApiPrompt";

/**
 * Nouveautés de l'app, affichées aux coachs (accueil + page Nouveautés).
 * Entrée la plus récente EN TÊTE. `id` unique et stable (sert d'accusé de
 * lecture en base : app_update_reads.update_id) — ne jamais le modifier.
 * Rédaction : pour un coach, l'utilité concrète avant tout, pas de jargon.
 */

export interface ReleaseNoteSection {
  title: string;
  /** Une phrase par point : ce que ça permet, où le trouver */
  points: string[];
}

/** Texte prêt à l'emploi joint à une nouveauté (copier / télécharger). */
export interface ReleaseNoteResource {
  label: string;
  description?: string;
  text: string;
  /** Nom du fichier proposé au téléchargement (.md) */
  filename?: string;
}

/** feature = nouvelle fonctionnalité, fix = correction de bug */
export type ReleaseNoteKind = "feature" | "fix";

export interface ReleaseNote {
  id: string;
  date: string; // yyyy-MM-dd
  kind: ReleaseNoteKind;
  title: string;
  summary: string;
  sections: ReleaseNoteSection[];
  resources?: ReleaseNoteResource[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: "2026-11-02-assistant-ia-claude",
    date: "2026-11-02",
    kind: "feature",
    title: "Branche ton assistant IA sur les données de tes athlètes",
    summary:
      "Ton assistant Claude peut maintenant lire les données des athlètes qui l'acceptent, t'en faire des analyses et des synthèses, et te proposer des axes de travail ou des modifications. Il ne change jamais rien seul : c'est toi qui appliques.",
    sections: [
      {
        title: "Démarrer",
        points: [
          "Paramètres → Assistant IA (Claude) → Générer une clé. Elle ne s'affiche qu'une fois : copie-la et donne-la à ton assistant avec le mode d'emploi ci-dessous.",
          "Une clé se révoque en un clic au même endroit ; l'assistant perd l'accès immédiatement.",
        ],
      },
      {
        title: "Ce que tu verras",
        points: [
          "Tu discutes avec ton assistant : il lit les données (y compris compétitions, tests et événements du calendrier de l'athlète), te montre ses analyses et ses propositions dans la discussion, et n'inscrit rien sans ton accord.",
          "Dis-lui « dépose » : la proposition t'attend dans Agon, tu l'appliques d'un clic. Dis-lui « fais-le » : il l'inscrit lui-même directement.",
          "Un badge « Claude » en haut de la fiche d'un athlète quand une proposition t'attend. Chacune dit ce qu'elle change, en clair, avec le nom des séances et des exercices.",
          "Appliquer ou Écarter : rien ne change pour l'athlète tant que tu n'as pas appliqué. Si le programme a bougé depuis la proposition, tu es prévenu avant.",
          "Les axes de travail sont des textes : tu les retiens ou tu les écartes, et tu construis toi-même.",
        ],
      },
      {
        title: "Revenir en arrière",
        points: [
          "Tout ce que l'assistant inscrit s'annule : badge « Claude » → « Inscrit dans Agon » → Annuler. Tout revient comme avant.",
          "Tu peux aussi lui demander d'annuler. Ce que l'athlète a déjà réalisé (une séance faite) reste toujours en place.",
          "Si tu as retouché le programme depuis, Agon te prévient avant d'annuler : sinon tes retouches seraient effacées aussi.",
        ],
      },
      {
        title: "Construire une semaine ensemble",
        points: [
          "Tu bâtis la semaine d'un athlète en discussion avec ton assistant : thème de chaque jour, séances de muscu et d'énergie, existantes ou nouvelles. Quand elle te va, il la dépose et tu l'appliques d'un clic.",
          "L'aperçu montre la semaine jour par jour et le contenu des séances créées. Elle ajoute sans rien supprimer ; si un jour avait déjà un thème, l'ancien apparaît barré.",
          "La semaine passée, demande-lui le bilan : il compare ce qui était prévu à ce qui a été fait (séances, RPE, charges, durées, bien-être).",
        ],
      },
      {
        title: "Périodiser ensemble",
        points: [
          "Ton assistant planifie aussi la saison : macrocycles, mésocycles, cycles avec leurs semaines de décharge, compétitions et tests. Il part des compétitions, des tests et des événements de l'athlète, et te présente le plan avant de le déposer.",
          "Il peut répartir une séance hebdomadaire sur tout un cycle, déplacer un cycle, ou retirer du planning ce qui ne tient plus (séance, thème du jour).",
          "Tout un plan s'applique en un clic, et s'annule en un clic, suppressions comprises. Ce que l'athlète a réalisé ne part jamais : seul le prévu est retiré, et une séance retirée passe en « sautée ».",
        ],
      },
      {
        title: "Fiches et habitudes",
        points: [
          "Ton assistant donne à l'athlète une fiche de ta banque, avec ton mot, ou la rattache à une séance. Il peut aussi fabriquer une fiche (PDF) : elle arrive dans ta banque avec l'étiquette « claude », et aucun athlète ne la voit tant que tu ne l'as pas donnée.",
          "Il crée des habitudes pour l'athlète (et active le suivi des habitudes si besoin). Celles que l'athlète s'est données restent à lui : ton assistant n'en voit que l'assiduité, jamais le nom.",
          "Comme le reste, tout s'annule en un clic. Une habitude que l'athlète a déjà cochée reste en place.",
        ],
      },
      {
        title: "Qui est concerné",
        points: [
          "Seuls les athlètes qui ont accepté le traitement par l'IA sous le nouveau texte sont visibles par ton assistant. Tes athlètes reverront l'écran de consentement à leur prochaine connexion : c'est normal, le texte nomme désormais ton assistant.",
          "Ton assistant ne reçoit ni le nom de famille, ni ce que l'athlète écrit librement sur ses séances (ressenti, commentaires), ni les données Garmin. Il voit le titre des événements que l'athlète ajoute à son calendrier : le texte de consentement le lui dit.",
        ],
      },
    ],
    resources: [
      {
        label: "Mode d'emploi pour ton assistant IA",
        description: "À donner à Claude Code sur ton ordinateur, avec ta clé. Claude dans le navigateur (claude.ai) ne peut pas appeler l'API.",
        text: COACH_API_PROMPT,
        filename: COACH_API_PROMPT_FILENAME,
      },
    ],
  },
  {
    id: "2026-10-31-athletes-masques-et-pre-creation",
    date: "2026-10-31",
    kind: "feature",
    title: "Masque tes athlètes en pause et prépare un nouvel athlète avant sa première connexion",
    summary:
      "Deux nouveautés dans la page Athlètes : tu peux masquer les athlètes que tu ne suis qu'en pré-saison, et créer un athlète toi-même pour le programmer avant même qu'il ne se connecte.",
    sections: [
      {
        title: "Masquer un athlète",
        points: [
          "Dans Athlètes, le bouton œil barré à droite de chaque ligne masque l'athlète. Il disparaît de ta liste, du sélecteur d'athlète, de l'accueil et des alertes.",
          "Les athlètes masqués restent dans la section repliée « Masqués » en bas de la page, d'où tu peux les rouvrir ou les réafficher d'un clic.",
          "Ton athlète ne voit aucun changement de son côté : le masquage est un simple confort pour toi.",
        ],
      },
      {
        title: "Créer un athlète avant sa première connexion",
        points: [
          "Le bouton + en haut de la page Athlètes demande juste un prénom et un nom, puis crée sa page comme celle des autres : tu peux construire son programme tout de suite.",
          "Tant qu'il ne s'est pas connecté, une petite icône bleue en forme de deux maillons apparaît à côté de son nom (dans sa page et dans la liste). Un clic copie le lien à lui envoyer.",
          "Avec ce lien, il retrouve son prénom, son nom et ton code coach déjà remplis : il n'a plus qu'à choisir son email et son mot de passe, et tout ce que tu as préparé est là.",
          "Le lien ne marche qu'une seule fois. Si tu supprimes un athlète encore en attente, son lien est supprimé avec lui.",
        ],
      },
    ],
  },
  {
    id: "2026-10-31-staff-v1",
    date: "2026-10-31",
    kind: "feature",
    title: "Le staff de tes athlètes : kiné, ostéo, nutritionniste… dans l'app",
    summary:
      "Tu peux maintenant ouvrir l'accès d'un athlète aux professionnels qui le suivent : kiné, ostéo, coach adjoint, nutritionniste, préparateur mental, médecin. Tu choisis ce que chacun voit et ce qu'il peut modifier ; tu restes le coach principal.",
    sections: [
      {
        title: "Ajouter un professionnel",
        points: [
          "Fiche athlète → onglet Staff → « Ajouter un professionnel » : choisis le métier, les droits se pré-cochent (un kiné voit le médical et les séances, un nutritionniste la nutrition…), puis ajuste-les.",
          "Tu obtiens un lien d'invitation à envoyer par SMS ou email. Le pro crée son compte gratuit (ou se connecte) et l'accès s'ouvre aussitôt. Le lien sert une fois et expire après 14 jours.",
          "Case « Peut modifier mes contenus » : sinon le pro ne modifie que ce qu'il a lui-même créé.",
          "« Appliquer à tous » recopie les droits d'un pro sur tous les athlètes qu'il suit chez toi.",
        ],
      },
      {
        title: "Ce que fait le professionnel",
        points: [
          "Il a son propre espace : la liste de ses athlètes avec leur coach, et pour chacun seulement les onglets que tu as ouverts.",
          "Il peut écrire dans le médical (blessures, suivi), déposer des fiches et commenter. Ses fiches arrivent dans ta banque, à son nom.",
          "Le reste (programme, planification, séances réalisées, tests) est en lecture seule pour l'instant.",
          "Tu peux couper son accès à tout moment ; lui aussi peut se retirer.",
        ],
      },
      {
        title: "Le planning de l'athlète, vu par le pro",
        points: [
          "Onglet Programme : la semaine de l'athlète en grand, chaque séance écrite en entier (blocs, exercices, séries × reps, charge, RIR, consignes). Vue Mois pour prendre du recul. Sur ordinateur, 7 colonnes ; sur téléphone, un jour sous l'autre.",
          "Un pro qui a les fiches en écriture pose une fiche sur un ou plusieurs jours, avec une consigne (« 2 séries avant la séance »). L'athlète la voit ces jours-là dans son programme, toi dans ton planning.",
          "Une fiche peut être faite de photos prises au téléphone : elles sont compressées, et plusieurs photos deviennent un seul PDF, une page par photo.",
        ],
      },
      {
        title: "Côté athlète",
        points: [
          "Dans son profil, « Mon staff » liste chaque professionnel avec son métier et ce qu'il voit. Il est prévenu des ajouts et peut retirer un accès.",
          "Il peut aussi inviter lui-même son kiné ou son ostéo : les droits habituels du métier s'appliquent, tu les ajustes ensuite.",
          "Rien n'est partagé sans son accord : à sa prochaine ouverture, l'app lui pose la question une fois (accepter ou refuser). Tant qu'il n'a pas accepté, ses pros ne voient aucune de ses données. Il peut changer d'avis dans son profil.",
        ],
      },
      {
        title: "Tu es toi-même kiné ou préparateur pour un autre coach ?",
        points: [
          "Accepte son invitation avec ton compte actuel : un bouton « Staff » apparaît en haut de ton espace coach pour passer de l'un à l'autre.",
        ],
      },
    ],
  },
  {
    id: "2026-11-01-garmin-hors-ia",
    date: "2026-11-01",
    kind: "feature",
    title: "Les données des montres Garmin ne passeront jamais par l'IA",
    summary:
      "En préparation du dépôt du dossier Garmin, les données venant d'une montre Garmin sont désormais écartées de tout traitement par intelligence artificielle. Rien ne nous y obligeait : c'est une garantie que nous nous donnons pour pouvoir l'annoncer à Garmin de façon vérifiable.",
    sections: [
      {
        title: "Ce que ça change concrètement",
        points: [
          "Le générateur de programme, la barre de chat et les analyses automatiques continuent de fonctionner exactement comme avant.",
          "Ils s'appuient sur ce qui est saisi dans Agon et sur les fichiers que l'athlète importe lui-même — plus sur ce qu'une montre Garmin remonte.",
          "Tu continues de voir toutes les données Garmin dans l'app : l'exclusion porte sur l'IA, pas sur l'affichage.",
        ],
      },
      {
        title: "Pourquoi se restreindre sans y être obligé",
        points: [
          "Le formulaire Garmin demande la liste des tiers qui traitent les données de la montre, l'IA comprise. C'est le champ qui fait refuser les dossiers.",
          "Promettre un usage raisonnable ne vaut rien si rien ne l'empêche. Ici c'est la base de données elle-même qui bloque : une donnée Garmin ne peut pas être marquée comme utilisable par l'IA, même par erreur de programmation.",
          "Un athlète qui a accepté l'IA ne lève pas cette règle non plus. C'est une décision que nous prenons vis-à-vis de Garmin, pas la sienne à porter.",
        ],
      },
    ],
  },
  {
    id: "2026-10-31-refus-ia-respecte-generateur",
    date: "2026-10-31",
    kind: "fix",
    title: "Le refus de l'IA par un athlète bloque vraiment le générateur",
    summary:
      "Un athlète qui avait refusé le traitement de ses données par l'IA pouvait quand même voir un programme généré pour lui. Sa décision est maintenant vérifiée au moment de la génération, et plus seulement affichée dans son profil.",
    sections: [
      {
        title: "Ce qui ne marchait pas",
        points: [
          "Le générateur IA et l'édition par conversation ne regardaient pas si l'athlète concerné avait accepté le traitement par IA. La case décochée dans son profil n'empêchait rien.",
          "Corrigé : chaque demande indique désormais de quel athlète il s'agit, et elle est refusée s'il n'a pas donné son accord.",
        ],
      },
      {
        title: "Ce que tu verras",
        points: [
          "Si l'athlète a refusé, un message te le dit en clair et t'indique où il peut l'activer : son profil, section Confidentialité, sur l'accord qui mentionne l'API Google Gemini. Tu n'as pas à deviner la cause.",
          "Un accord donné puis retiré reprend effet immédiatement sur le générateur — aucune génération ne part entre-temps.",
          "Lance le générateur depuis la fiche de l'athlète concerné : sans athlète sélectionné, la demande est refusée plutôt que traitée au hasard.",
        ],
      },
    ],
  },
  {
    id: "2026-10-30-vue-sorties-enregistrees",
    date: "2026-10-30",
    kind: "feature",
    title: "Les sorties de montre s'affichent, avec la provenance de chaque chiffre",
    summary:
      "Les sorties remontées par une montre ou importées depuis un fichier étaient enregistrées mais invisibles. Elles apparaissent maintenant dans l'onglet Historique de chaque athlète, et dans son profil côté athlète : durée, distance, allure, dénivelé, fréquence cardiaque, calories.",
    sections: [
      {
        title: "Ce que ça change pour toi",
        points: [
          "Onglet Historique d'un athlète : la liste de ses sorties réelles arrive au-dessus de ses séances programmées. Tu vois ce qu'il a fait, pas seulement ce qui était prévu.",
          "Un récapitulatif des quatre dernières semaines par sport — nombre de sorties, temps total, distance totale. Trois chiffres, pas un graphique de plus.",
          "Les sorties réelles et les séances programmées restent deux blocs séparés. Un écart entre les deux n'est pas une erreur : la montre enregistre ce qui a été fait, le programme dit ce qui était demandé.",
        ],
      },
      {
        title: "D'où viennent les chiffres",
        points: [
          "Chaque sortie s'ouvre d'un clic sur l'origine de ses mesures : lue dans le fichier, ou reconstituée — et comment.",
          "Un GPX n'a ni durée de mouvement ni dénivelé mesuré : la ligne dépliée le dit, au lieu de laisser croire qu'Agon se trompe face à l'application du fabricant.",
          "Les sauts de GPS écartés du calcul de distance sont indiqués : c'est souvent ce qui explique quelques centaines de mètres d'écart.",
          "Une mesure absente affiche un tiret, jamais un zéro. Une allure à 0:00 aurait le même poids visuel qu'une vraie mesure, alors qu'elle ne mesure rien.",
        ],
      },
      {
        title: "À savoir",
        points: [
          "Tu peux voir une liste plus courte que ton athlète, sans message d'erreur : une source dont il a retiré le consentement disparaît immédiatement de ton côté. C'est voulu.",
          "Les sports inconnus d'Agon s'affichent quand même, avec le nom que la montre a transmis — rien n'est rangé dans « Autre ».",
        ],
      },
    ],
  },
  {
    id: "2026-10-29-import-fichiers-activite",
    date: "2026-10-29",
    kind: "feature",
    title: "Tes athlètes peuvent importer leur historique de montre",
    summary:
      "Un athlète dépose l'archive de son export Strava ou Garmin — ou simplement des fichiers .fit, .tcx et .gpx — et ses sorties entrent dans Agon : durée, distance, dénivelé, fréquence cardiaque, allure. C'est le seul moyen de récupérer un historique ancien : les montres connectées ne donnent que les dernières semaines.",
    sections: [
      {
        title: "Ce que ça change pour toi",
        points: [
          "Un nouvel athlète arrive avec son passé : plusieurs années de sorties peuvent entrer en une fois, au lieu de repartir d'une page blanche.",
          "Une montre non reliée n'est plus un trou dans le suivi — Polar, Suunto, Apple Watch, Decathlon : tout ce qui sait exporter un fichier d'activité est lisible.",
          "Les chiffres viennent du fichier de la montre, pas d'une saisie à la main : même source, même traitement et mêmes règles que pour la synchronisation COROS.",
        ],
      },
      {
        title: "Ce que l'athlète voit",
        points: [
          "Dans son profil, section « Montres & services connectés » : une zone où glisser son archive ou ses fichiers.",
          "L'avancement fichier par fichier — une archive de plusieurs centaines de sorties prend un moment, et l'écran le dit au lieu de paraître figé.",
          "Un compte rendu complet : les sorties ajoutées, celles déjà connues, et le détail des fichiers qui n'ont pas pu être lus, avec la raison. Pas de « tout va bien » quand il manque quelque chose.",
          "Une sortie déjà remontée par sa montre n'est pas dupliquée, même si le fichier déposé est d'un autre format — c'est l'heure de départ et le sport qui font le rapprochement, pas le nom du fichier.",
        ],
      },
      {
        title: "Les limites, dites franchement",
        points: [
          "Un GPX ne contient ni durée de mouvement ni dénivelé mesuré : la durée inclut alors les pauses et le dénivelé est reconstitué à partir des altitudes. L'écart avec l'application d'origine est normal, et chaque chiffre indique d'où il vient.",
          "Un fichier qui n'a jamais été enregistré pendant une sortie — un parcours préparé à l'avance, sans horodatage — est refusé : le compter comme une séance fausserait la charge d'entraînement.",
          "Les fichiers sont lus sur l'appareil de l'athlète et ne sont pas conservés : seules les valeurs des sorties sont enregistrées.",
        ],
      },
    ],
  },
  {
    id: "2026-10-28-recuperation-automatique-coros",
    date: "2026-10-28",
    kind: "feature",
    title: "Les séances COROS remontent automatiquement",
    summary: "Chaque nuit, Agon récupère les séances des athlètes qui ont relié leur montre COROS : durée, distance, dénivelé, fréquence cardiaque, allure, calories. L'athlète peut aussi déclencher la récupération à la main.",
    sections: [
      {
        title: "Ce que ça change pour toi",
        points: [
          "Les sorties de tes athlètes apparaissent sans qu'ils aient à saisir quoi que ce soit, le lendemain matin au plus tard.",
          "Les chiffres sont lus dans le fichier d'activité de la montre, pas dans un résumé en texte : une durée est une durée, pas une phrase interprétée.",
          "La durée retenue exclut les pauses. Sur du fractionné, c'est ce qui donne une allure juste plutôt qu'une moyenne diluée par les temps d'arrêt.",
          "Le jour d'une séance est son jour local : une sortie à 23 h le lundi reste au lundi, et s'aligne donc sur la séance que tu avais programmée.",
        ],
      },
      {
        title: "Ce que l'athlète voit",
        points: [
          "Dans son profil : la date de dernière synchronisation, et jusqu'où son historique a été récupéré.",
          "Un bouton « Synchroniser maintenant » s'il ne veut pas attendre la nuit.",
          "Un compte rendu honnête après chaque synchronisation : les séances importées, celles déjà connues, et les fichiers qui n'ont pas pu être lus. Pas de « tout va bien » quand il manque quelque chose.",
          "Si COROS cesse d'accepter l'autorisation, il voit « Reconnexion nécessaire » et un bouton pour la rétablir — au lieu d'une synchronisation qui s'arrête en silence.",
        ],
      },
      {
        title: "Les limites, dites franchement",
        points: [
          "COROS n'autorise que 50 fichiers par athlète et par 24 h. Un athlète qui relie sa montre avec un an d'historique le verra se remplir sur plusieurs jours, par tranches, en remontant le temps.",
          "Le sommeil, la VFC et la fréquence cardiaque de repos sont conservés tels que COROS les formule, sans en extraire de chiffre : deviner un nombre dans une phrase donnerait une valeur d'apparence fiable, impossible à distinguer d'une vraie mesure.",
          "Les données COROS ne sont toujours pas transmises à l'IA : leurs conditions d'utilisation doivent encore être relues sur ce point.",
          "Si un athlète retire son accord, la récupération s'arrête dès la nuit suivante — l'accord est revérifié à chaque passage, pas seulement au moment où il relie sa montre.",
        ],
      },
    ],
  },
  {
    id: "2026-10-28-connexion-montre-coros",
    date: "2026-10-28",
    kind: "feature",
    title: "Connexion d'une montre COROS",
    summary: "Tes athlètes peuvent relier leur compte COROS depuis leur profil. La connexion, l'accord et la déconnexion sont en place ; la récupération automatique des séances suit.",
    sections: [
      {
        title: "Ce que l'athlète voit",
        points: [
          "Un panneau « Montres & services connectés » dans son profil, avec un bouton pour relier son compte COROS.",
          "Il choisit la région de son compte COROS (Europe par défaut). Se tromper n'a aucune conséquence : l'autorisation échoue et il recommence.",
          "Il donne son accord au moment de la connexion, avec le texte exact de ce qu'il autorise — pas une case cochée des semaines plus tôt pour une montre qu'il n'avait pas encore reliée.",
          "Il peut se déconnecter au même endroit, en un clic. L'accès est révoqué chez COROS, et ses séances déjà importées restent dans son historique.",
        ],
      },
      {
        title: "Ce qui reste à venir",
        points: [
          "La récupération automatique des séances arrive ensuite : elle lira les fichiers d'activité de la montre, pas les résumés en texte de COROS, pour que les chiffres ne dépendent pas d'une phrase qui peut changer de formulation.",
          "COROS limite les téléchargements à 50 fichiers par athlète et par jour. Un historique d'un an se remplira donc sur plusieurs jours, progressivement.",
          "Les données COROS ne sont pas transmises à l'IA pour l'instant : leurs conditions d'utilisation doivent encore être relues sur ce point précis.",
          "Garmin suit la même mécanique, dès que leur programme développeur valide notre dossier.",
        ],
      },
    ],
  },
  {
    id: "2026-10-28-garde-fou-ia-et-retrait-consentement",
    date: "2026-10-28",
    kind: "fix",
    title: "Un retrait d'accord pouvait rester sans effet",
    summary: "Correction d'un défaut du registre des consentements : dans certains cas, retirer un accord ne changeait rien. Et l'IA ne reçoit plus que des champs décidés par le serveur.",
    sections: [
      {
        title: "Ce qui ne marchait pas",
        points: [
          "Le registre retenait la décision la plus récente d'après son horodatage. Deux décisions enregistrées dans la même opération portaient la même heure à la microseconde près, et la plus récente devenait indéterminable.",
          "Conséquence : un accord retiré juste après avoir été donné pouvait rester considéré comme accordé. Le sens de l'erreur était le plus gênant possible, puisque c'est le refus qui pouvait être ignoré.",
          "Corrigé : le registre est désormais ordonné par ordre d'arrivée et non par l'heure. Un retrait prend effet, toujours.",
        ],
      },
      {
        title: "L'IA ne reçoit plus que ce que le serveur a validé",
        points: [
          "Les phrases de synthèse de « Mon profil » envoyaient à l'IA ce que le navigateur lui transmettait, sans contrôle. Désormais le serveur ne laisse passer qu'une liste fixe de chiffres connus.",
          "Une valeur impossible (un poids de 900 kg, une fatigue de 42 sur 5) est écartée au lieu d'être transmise : une donnée fausse envoyée à l'IA ressort en conseil faux.",
          "Une valeur manquante reste manquante et ne devient pas zéro — plus de « ton sommeil est tombé à 0 h » sur une donnée simplement absente.",
        ],
      },
      {
        title: "Pour la suite des montres",
        points: [
          "Les données de montre ne pourront atteindre l'IA que par une porte unique, qui vérifie à la fois les conditions du fabricant et ton accord. Sans accord, rien ne part — et en cas de doute technique, rien ne part non plus.",
          "Les réponses brutes des fabricants ne sont jamais transmises à l'IA : seuls des champs identifiés un par un le sont, pour ne pas envoyer des données qu'on n'a pas demandées.",
        ],
      },
    ],
  },
  {
    id: "2026-10-28-socle-montres-connectees",
    date: "2026-10-28",
    kind: "feature",
    title: "Le socle technique des montres connectées est posé",
    summary: "Rien de visible encore : c'est la plomberie qui recevra les séances Garmin et COROS. Elle est construite pour que les promesses faites à l'athlète soient tenues par la base de données elle-même, pas par la vigilance du code.",
    sections: [
      {
        title: "Ce que ça prépare",
        points: [
          "Les tables qui accueilleront les activités (durée, distance, fréquence cardiaque, allure, dénivelé) et les données quotidiennes (sommeil, VFC, fréquence cardiaque de repos, pas).",
          "Tu verras l'état de la montre de chaque athlète : connectée, à reconnecter, ou déconnectée. Sans ça, un athlète dont l'autorisation a expiré ressemble à un athlète qui a décroché.",
          "L'historique est prévu dès le départ : à la connexion d'une montre COROS, on peut remonter les semaines passées, pas seulement enregistrer les suivantes.",
        ],
      },
      {
        title: "Ce qui est garanti par construction",
        points: [
          "Un athlète qui retire son accord disparaît du tableau de bord immédiatement, sans aucune manipulation de notre part — la base revérifie son accord à chaque consultation.",
          "Une montre ne peut pas être connectée sans accord : la base refuse l'opération, même si un bout de code oubliait de vérifier.",
          "Retirer son accord coupe la synchronisation tout de suite, même si le fabricant de la montre est injoignable à cet instant.",
          "Les autorisations d'accès aux montres sont stockées chiffrées dans un coffre séparé, illisible depuis l'application.",
        ],
      },
      {
        title: "Et l'IA",
        points: [
          "Chaque donnée importée sait si les conditions de son fabricant permettent de l'envoyer à une IA. Celles de COROS sont marquées « non » en attendant une relecture de leurs conditions.",
          "Une donnée venant d'une source dont les règles ne sont pas encore tranchées est traitée comme interdite, jamais comme autorisée par défaut.",
        ],
      },
      {
        title: "Ce qu'il reste avant la vraie connexion",
        points: [
          "COROS : l'autorisation se code sans dossier à déposer, c'est le prochain chantier.",
          "Garmin : le dossier est prêt, il attend la publication de nos mentions légales complètes.",
          "Strava : abandonné côté API — leurs conditions interdisent de montrer les données d'un athlète à son coach. L'import de fichiers prendra le relais.",
        ],
      },
    ],
  },
  {
    id: "2026-10-27-conformite-donnees-sante",
    date: "2026-10-27",
    kind: "feature",
    title: "Agon se met en règle pour brancher les montres Garmin et COROS",
    summary: "Politique de confidentialité, CGU, consentement explicite au traitement des données de santé : les fondations exigées par Garmin et COROS avant d'accepter notre demande d'accès à leurs API.",
    sections: [
      {
        title: "Pourquoi maintenant",
        points: [
          "Garmin et COROS n'ouvrent leur API qu'aux applications qui publient une politique de confidentialité et recueillent un consentement explicite : sans ça, la demande est refusée d'office.",
          "Les données d'entraînement et de wellness sont des données de santé au sens du RGPD : leur traitement exige un consentement explicite, distinct et révocable. C'est ce qui est mis en place.",
        ],
      },
      {
        title: "Ce que tu verras",
        points: [
          "Trois pages publiques accessibles sans compte : Politique de confidentialité, CGU, Mentions légales.",
          "À l'inscription, une case à cocher pour accepter les CGU et la politique de confidentialité — obligatoire pour créer le compte.",
          "À la première connexion après cette mise à jour, un écran demande ton consentement au traitement des données de santé et, séparément, aux suggestions par IA. Tu peux refuser l'IA et continuer à utiliser Agon normalement.",
          "Si nos conditions évoluent, l'écran revient pour recueillir un consentement à jour : un accord donné sur une ancienne version ne vaut pas pour la nouvelle.",
        ],
      },
      {
        title: "Un panneau « Confidentialité & données »",
        points: [
          "Dans tes paramètres (et dans le profil de l'athlète) : un endroit unique pour gérer tes accords, récupérer tes données et supprimer ton compte.",
          "« Télécharger toutes mes données » produit un fichier JSON contenant tout ce qu'Agon détient à ton sujet, réutilisable ailleurs.",
          "Un accord facultatif se retire d'un seul clic, aussi simplement qu'il a été donné — c'est ce qu'exige le RGPD.",
          "La suppression de compte demande de taper SUPPRIMER : elle efface les données, les fichiers déposés et révoque les accès aux montres connectées.",
        ],
      },
      {
        title: "Ce qui change sous le capot",
        points: [
          "La suppression de compte efface réellement toutes les données associées, y compris les fichiers déposés. Auparavant, le compte était désactivé mais les données restaient en base.",
          "Un coach qui part ne détruit plus les programmes de ses athlètes : les plans sont conservés, seule l'attribution au coach est retirée.",
          "Les fonctions d'IA refusent désormais les appels non authentifiés : notre quota Gemini n'est plus consommable depuis l'extérieur.",
        ],
      },
    ],
  },
  {
    id: "2026-10-26-fiabilite-profil-athlete",
    date: "2026-10-26",
    kind: "fix",
    title: "Le profil de l'athlète ne recharge plus le nom de son coach en boucle",
    summary: "Dans « Mon profil » côté athlète, le bloc « Mon coach » relançait une requête à chaque rafraîchissement de l'écran. Corrigé : le nom est lu une seule fois.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Le bloc « Mon coach » du profil athlète ne déclenche plus de requête répétée : l'app est plus légère sur les connexions mobiles lentes.",
          "Rien à faire de ton côté, et rien ne change à l'écran : seul le comportement interne est corrigé.",
        ],
      },
    ],
  },
  {
    id: "2026-10-26-theme-du-jour-raccourcis",
    date: "2026-10-26",
    kind: "feature",
    title: "Thème du jour : tes thèmes récents en un clic, et ta propre couleur",
    summary: "Repose « Seuil » ou « Jambes lourdes » sans le retaper, choisis une couleur hors palette, et retrouve la couleur du jour dans la barre de semaine de l'athlète.",
    sections: [
      {
        title: "Ce qui change dans l'éditeur",
        points: [
          "« Tes thèmes récents » en haut du formulaire : tes derniers thèmes, tous athlètes confondus, sans doublon. Un clic reprend le libellé, les raccourcis et la couleur.",
          "Une 11e pastille ouvre le sélecteur de couleur du téléphone : tu n'es plus limité aux 10 couleurs proposées.",
          "Une couleur reprise d'un thème récent ne se fait plus écraser si tu cliques ensuite sur une intensité.",
        ],
      },
      {
        title: "Côté athlète",
        points: [
          "Dans sa barre « Cette semaine », chaque jour qui a un thème porte un liseré de ta couleur : il repère ses jours durs d'un coup d'œil.",
          "Le libellé complet reste à un tap, dans la fiche du jour.",
        ],
      },
    ],
  },
  {
    id: "2026-10-26-point-hebdo-reservation",
    date: "2026-10-26",
    kind: "feature",
    title: "Tes athlètes réservent leur point hebdo sans passer par toi",
    summary: "Colle ton lien Calendly une fois dans tes réglages : chaque athlète voit « Réserver mon point hebdo » dans son profil et choisit son créneau dans tes disponibilités.",
    sections: [
      {
        title: "À faire une seule fois",
        points: [
          "Paramètres → « Lien de réservation du point hebdo » : colle l'adresse de ta page Calendly, par exemple https://calendly.com/ton-compte/30min, puis Enregistre.",
          "Tant que le champ est vide, l'entrée reste invisible chez tes athlètes : rien ne s'affiche avant que tu sois prêt.",
          "Pour retirer la réservation, vide le champ et enregistre.",
        ],
      },
      {
        title: "Côté athlète",
        points: [
          "Son profil affiche « Réserver mon point hebdo » ; il choisit son créneau sans quitter l'app.",
          "Son nom et son e-mail sont déjà remplis : deux taps et c'est réservé.",
          "Dès la réservation, il reçoit l'invitation avec le lien Meet par mail — et toi aussi, via Calendly.",
        ],
      },
    ],
  },
  {
    id: "2026-10-26-theme-du-jour",
    date: "2026-10-26",
    kind: "feature",
    title: "Donne un thème à une journée, l'athlète le lit avant sa séance",
    summary: "« Jambes lourdes », « Seuil », « Repos complet » : une intention posée sur une date, visible dans ton calendrier et sur l'accueil de l'athlète.",
    sections: [
      {
        title: "Comment le poser",
        points: [
          "Dans le planning, clique un jour : « Thème du jour » est en tête du détail, avant les séances.",
          "Un libellé libre de 40 caractères max, et deux séries de raccourcis si tu veux aller vite : intensité (Hard, Moyen, Easy, Récup active, Repos) et dominante (Force, Puissance-vitesse, Volume, Aérobie, Seuil, Spécifique HYROX, Technique, Mixte).",
          "Dix couleurs au choix. Cliquer une intensité en propose une, mais ta couleur reste la tienne si tu l'as déjà choisie.",
          "Une note facultative pour ce que l'athlète doit garder en tête ce jour-là.",
        ],
      },
      {
        title: "Où il apparaît",
        points: [
          "Dans ton calendrier mensuel : une pastille colorée à côté du numéro du jour, sans rien chasser de la case.",
          "Chez l'athlète : un bandeau sur son accueil, dans la fiche d'une journée, et une pastille sur chaque jour de sa semaine.",
          "Les jours de repos aussi : « Repos complet » est une consigne, pas une absence de consigne.",
          "La couleur du texte s'adapte au fond choisi, pour que la pastille reste lisible même en jaune.",
        ],
      },
    ],
  },
  {
    id: "2026-10-26-blessures-detaillees",
    date: "2026-10-26",
    kind: "feature",
    title: "Blessures détaillées, déclarables par l'athlète comme par toi",
    summary: "Une gêne se déclare en dix secondes depuis le profil de l'athlète, et tu vois ce qui change la séance de demain : douleur, impact, mécanisme.",
    sections: [
      {
        title: "Ce que l'athlète peut faire",
        points: [
          "« Déclarer une gêne ou une blessure » dans son profil : un nom suffit, tout le reste est facultatif.",
          "Un encart lui explique qu'une petite gêne compte et que la déclarer ne veut pas dire tout changer au programme.",
          "Il peut préciser s'il le souhaite : douleur sur 10, impact sur l'entraînement, type, mécanisme, contexte, jours d'arrêt, avis médical, retour prévu.",
        ],
      },
      {
        title: "Ce que tu vois",
        points: [
          "Les mêmes champs dans les antécédents du profil athlète : tu peux déclarer et compléter toi aussi.",
          "La mention « Déclarée par l'athlète » ou « par le coach » sur chaque ligne, pour savoir d'où vient l'info.",
          "Le détail affiché dans Retours, sous le bloc Blessures, avec le statut en cours ou guéri.",
        ],
      },
      {
        title: "Un seul endroit, une seule vérité",
        points: [
          "Les badges « blessure active » (en-tête athlète, profil, Retours) lisent désormais les mêmes blessures déclarées que la fiche.",
          "Fini le badge qui dit une chose et la fiche une autre : seule une blessure au statut « en cours » l'allume.",
        ],
      },
    ],
  },
  {
    id: "2026-10-25-alertes-wellness",
    date: "2026-10-25",
    kind: "feature",
    title: "Alertes wellness comparées à l'habitude de l'athlète",
    summary: "L'accueil signale les athlètes qui s'écartent de leur propre habitude, au lieu d'un seuil identique pour tout le monde.",
    sections: [
      {
        title: "Ce que tu vois",
        points: [
          "Une carte « Alertes wellness » sur l'accueil, qui n'apparaît que s'il y a quelque chose à signaler.",
          "Un athlète par ligne, les rouges avant les orange, avec l'écart en clair : « Fraîcheur musculaire 2/5 (habitude 4,1) ».",
          "Un clic ouvre directement le détail wellness de l'athlète dans Retours.",
        ],
      },
      {
        title: "Comment c'est calculé",
        points: [
          "Chaque saisie est comparée à la moyenne et à la dispersion des 28 jours précédents de ce même athlète.",
          "Sous 7 saisies dans la fenêtre, rien n'est signalé : l'habitude n'est pas encore fiable.",
          "Orange dès qu'un item ou le score global décroche nettement ; rouge si l'écart est franc ou s'il se répète deux saisies de suite.",
          "Un athlète qui dort mal tous les jours n'est donc plus signalé en continu, et une baisse nette chez un athlète régulier ne passe plus inaperçue.",
        ],
      },
    ],
  },
  {
    id: "2026-10-25-equivalences-allure",
    date: "2026-10-25",
    kind: "feature",
    title: "Équivalences d'allure partout",
    summary: "Sous chaque allure, la même intensité est rappelée dans les autres unités : km/h, min/km, temps sur la répétition, temps au tour, % VMA.",
    sections: [
      {
        title: "Ce que tu vois",
        points: [
          "Sous une cible d'allure, une petite ligne grise : « 23 km/h · 2'37/km · 400 m en 1'03 · tour de piste 1'03 · 105 % VMA ».",
          "Le « % VMA » n'apparaît que si l'athlète a une VMA en performance de référence active.",
          "Présent côté coach (aperçu de séance, détail du déroulé) et côté athlète (déroulé, exécution pas à pas, validation d'étape).",
        ],
      },
      {
        title: "Saisie",
        points: [
          "Dans l'éditeur d'intervalle, le menu d'unité propose en plus « Temps au tour (400 m) » et, si l'étape est sur une distance, « Temps sur X m ».",
          "Tu saisis le temps que tu as en tête, l'app convertit : les équivalences s'affichent en direct sous les champs.",
          "À l'import, « chrono 1:37-1:40 » sur une étape de 400 m devient une vraie cible d'allure au lieu d'un texte libre.",
        ],
      },
    ],
  },
  {
    id: "2026-10-24-iso-secondes-runs-hyrox",
    date: "2026-10-24",
    kind: "fix",
    title: "Isométrie en secondes, runs HYROX en « /run »",
    summary: "Un exercice en iso s'affiche partout « 4 × 30 s » avec un badge Iso, et les runs HYROX sont exprimés par run (1 km).",
    sections: [
      {
        title: "Isométrie",
        points: [
          "Synthèse, détail du jour, aperçus et Retours affichent « 4 × 30 s » et un badge « Iso » au lieu de « 4 × 30 ».",
          "Côté athlète, la saisie d'une série iso se fait en secondes (« s ») et non plus en reps.",
          "Dans l'éditeur, le choix EC / ISO est aussi disponible quand les répétitions sont réglées série par série.",
        ],
      },
      {
        title: "HYROX",
        points: [
          "Chaque run fait 1 km : temps affichés « 4:32 /run », moyenne « moy. … /run » et axes des graphiques en « min/run ».",
        ],
      },
    ],
  },
  {
    id: "2026-10-24-planning-synchro-athlete",
    date: "2026-10-24",
    kind: "fix",
    title: "Le planning montre exactement ce que voit l'athlète",
    summary: "Fini les séances fantômes : quand l'athlète déplace ou démarre une séance un autre jour, ton planning suit, avec la mention « Choix de l'athlète ».",
    sections: [
      {
        title: "Planning coach",
        points: [
          "Une séance déplacée par l'athlète n'apparaît plus en double à son ancienne date.",
          "Elle porte le badge « Déplacé par l'athlète · prévu lun. 19 oct. » dans la case du jour et dans le détail.",
          "Dans le détail d'une séance, un encart « Choix de l'athlète » regroupe les exercices ajoutés, séries en plus, séries sautées et commentaires.",
          "« Changer de jour » sur une séance garde les séances que l'athlète a déjà déplacées et t'indique combien ont été conservées.",
        ],
      },
      {
        title: "Côté athlète",
        points: [
          "Faire aujourd'hui une séance prévue un autre jour de la semaine la déplace au lieu d'en créer une deuxième.",
          "Sur l'accueil, l'aperçu d'un jour liste les vrais exercices de la séance, et « Démarrer » ouvre directement l'écran de séance.",
        ],
      },
    ],
  },
  {
    id: "2026-10-20-competitions-defilement",
    date: "2026-10-20",
    kind: "feature",
    title: "Toutes les compétitions d'un coup d'œil + défilement libre",
    summary: "Liste complète des compétitions depuis l'accueil athlète, niveaux renommés « Importance A/B/C », et colonnes de la vue évolutive détachables.",
    sections: [
      {
        title: "Compétitions",
        points: [
          "Sur l'accueil athlète, « Toutes → » (ou un clic sur la prochaine compétition) ouvre la liste complète : à venir avec le compte à rebours, puis passées avec leur bilan.",
          "Les niveaux A, B, C s'affichent désormais « Importance A », « Importance B », « Importance C » partout dans l'app.",
        ],
      },
      {
        title: "Vue Prévu / Réalisé / Séance +1",
        points: [
          "Les trois colonnes défilent toujours ensemble par défaut.",
          "Clique sur l'icône 🔗 en haut d'une colonne pour la faire défiler seule ; reclique pour la relier à nouveau.",
        ],
      },
    ],
  },
  {
    id: "2026-10-20-retour-video",
    date: "2026-10-20",
    kind: "feature",
    title: "Demander un retour vidéo sur un exercice",
    summary: "Coche « Retour vidéo demandé » sur un exercice : l'athlète voit un bandeau dans sa séance et te confirme l'envoi.",
    sections: [
      {
        title: "Côté coach",
        points: [
          "Dans le réglage d'un exercice (Programmation ou Séance +1 dans Retours), coche « Retour vidéo demandé » et ajoute si besoin une consigne (ex. dernière série, vue de profil).",
          "La demande vaut à partir de la séance où tu la coches et pour les suivantes, jusqu'à ce que tu la décoches.",
          "Dans Retours, tu vois pour chaque séance si la vidéo a été envoyée ou non.",
        ],
      },
      {
        title: "Côté athlète",
        points: [
          "Un bandeau « Retour vidéo demandé » s'affiche en haut de la séance, avec la consigne sous l'exercice concerné.",
          "L'athlète t'envoie la vidéo comme d'habitude (WhatsApp, Instagram…) puis coche « Vidéo envoyée », même après avoir validé la séance.",
        ],
      },
    ],
  },
  {
    id: "2026-10-20-retours-evolutif",
    date: "2026-10-20",
    kind: "feature",
    title: "Adapter la séance suivante depuis Retours",
    summary: "Clique sur une séance dans Retours pour voir le prévu, le réalisé et préparer la séance d'après, sans aller dans Programmation.",
    sections: [
      {
        title: "Dans Retours",
        points: [
          "Clique sur une séance muscu (vue semaine) ou sur « Évolution » (vue mois, détail des séances) : tu vois Prévu, Réalisé et Séance +1 côte à côte.",
          "Ce que tu modifies dans « Séance +1 » s'applique à la prochaine fois que l'athlète fait cette séance, et aux suivantes tant que tu ne les changes pas.",
          "Si la séance suivante a déjà une adaptation ponctuelle faite depuis le Planning, un bandeau te le signale : tu peux la garder ou l'écraser.",
        ],
      },
      {
        title: "Progression séance par séance",
        points: [
          "Chaque séance est numérotée selon le nombre de fois où elle est planifiée (n°1, n°2, n°3…), même si le mode multi-semaines n'est pas activé.",
          "Une séance programmée deux fois dans la même semaine progresse donc à chaque fois, et la numérotation continue d'un cycle à l'autre.",
        ],
      },
      {
        title: "Dans Programmation",
        points: [
          "Le bouton « évolutif » est retiré : la vue est désormais dans Retours.",
          "Le bouton « Placer dans le planning » a maintenant son icône calendrier (il était invisible).",
        ],
      },
    ],
  },
  {
    id: "2026-10-18-deconnexion-appareil",
    date: "2026-10-18",
    kind: "fix",
    title: "Déconnexion limitée à l'appareil utilisé",
    summary: "Se déconnecter sur un appareil ne te déconnecte plus de tous les autres (téléphone, ordinateur…).",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Le bouton Déconnexion (coach et athlète) ne ferme que la session de l'appareil sur lequel tu cliques.",
          "Après un changement de mot de passe, toutes les sessions restent fermées par sécurité.",
        ],
      },
    ],
  },
  {
    id: "2026-10-18-accueil-assiduite-evenements",
    date: "2026-10-18",
    kind: "feature",
    title: "Accueil personnalisable, assiduité juste, événements visibles",
    summary: "Choisis ce que chaque athlète voit sur son accueil, l'assiduité compte enfin toutes les séances prescrites, et les événements de l'athlète s'affichent quand tu ouvres un jour du planning.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Profil athlète → Général → « Accueil de l'athlète » : coche les sections visibles sur sa page Aujourd'hui. Masquer ne supprime rien. Par défaut tout est affiché sauf l'Alimentation.",
          "Séance du jour, Message du coach et Jour de compétition restent toujours visibles.",
          "Assiduité (7 j / 30 j / 3 mois) = séances réalisées / séances prescrites, muscu ET énergie / spécifique. Les séances retirées ou déplacées ne comptent plus comme manquées, et la séance du jour ne compte qu'une fois faite.",
          "Planification → Mois : en cliquant sur un jour, les événements de l'athlète (déplacement, vacances, horaires…) apparaissent en haut du détail.",
        ],
      },
    ],
  },
  {
    id: "2026-10-18-profil-athlete-volume-course",
    date: "2026-10-18",
    kind: "feature",
    title: "Profil athlète refait + volume de course à pied",
    summary: "Antécédents médicaux détaillés avec photos et PDF, km de course calculés chaque semaine, et un tuto pour récupérer les données Strava de tes athlètes.",
    sections: [
      {
        title: "Antécédents médicaux",
        points: [
          "Chaque antécédent a sa fiche : type, zone, date, diagnostic du médecin, traitement, statut (guéri / en cours) et notes.",
          "Photos (radio, IRM, ordonnance) compressées automatiquement et comptes rendus PDF, 10 Mo max par fichier.",
          "Tu peux aussi les ajouter ou les corriger : Profil athlète → Général.",
        ],
      },
      {
        title: "Volume de course à pied",
        points: [
          "En fin de séance énergie ou spécifique, l'athlète indique l'activité faite et les km courus (pré-remplis avec la distance prévue).",
          "En fin de séance de muscu, un champ facultatif « J'ai couru pendant la séance » ; les activités libres « Course » comptent aussi.",
          "Km de la semaine, des 7 derniers jours et graphique des 8 dernières semaines : dans le profil de l'athlète, dans Profil athlète → Général, et une tuile « Course à pied » dans Retours.",
        ],
      },
      {
        title: "Profil côté athlète",
        points: [
          "Identité modifiable, poids avec les 3 dernières pesées et ton poids cible en repère.",
          "Vidéo + étapes pour télécharger ses données Strava et te transférer l'e-mail reçu (ton adresse est affichée avec un bouton copier).",
          "Les cartes Volume programme, Wellness, Poids 30 jours et Records ont été retirées du profil.",
        ],
      },
    ],
  },
  {
    id: "2026-10-18-competition-dans-le-planning",
    date: "2026-10-18",
    kind: "feature",
    title: "La compétition devient un jour du planning",
    summary: "Ajoute une compétition directement sur un jour : elle s'affiche comme un jour de compétition, chez toi comme chez l'athlète, et il y laisse son bilan.",
    sections: [
      {
        title: "Côté coach",
        points: [
          "Planification → Mois : clique sur un jour → « Ajouter une compétition ce jour » (date déjà remplie).",
          "Le jour de compétition ressort en rouge dans le calendrier, avec le nom de la compétition en tête du jour.",
          "En ouvrant le jour, tu vois la compétition en haut, les séances éventuelles dessous, et le bilan de l'athlète dès qu'il l'a rempli (lecture seule).",
        ],
      },
      {
        title: "Côté athlète",
        points: [
          "« Cette semaine » et Programme : le jour est marqué « Jour de compétition », avec la compétition en tête du jour.",
          "L'athlète peut aussi poser lui-même une compétition depuis Programme (bouton « Compétition » sur chaque jour).",
          "Le bilan se remplit dès le jour J. Tant qu'il n'est pas rempli, la compétition reste affichée « Compétition à commenter » sur Aujourd'hui.",
        ],
      },
    ],
  },
  {
    id: "2026-10-18-bilan-competition",
    date: "2026-10-18",
    kind: "fix",
    title: "Bilans de compétition : enregistrés et lisibles",
    summary: "Tes athlètes peuvent de nouveau enregistrer leur retour après une compétition, et tu le retrouves directement dans leur planification.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Côté athlète : le retour sur une compétition passée s'enregistre sans « Erreur lors de l'enregistrement ».",
          "Planification de l'athlète → Compétitions : le retour de l'athlète s'affiche sous chaque compétition passée (ou « Pas encore de retour »).",
          "Dans la timeline, cliquer sur une compétition affiche aussi le retour de l'athlète.",
        ],
      },
    ],
  },
  {
    id: "2026-10-15-coach-athlete-se-retirer",
    date: "2026-10-15",
    kind: "fix",
    title: "Coach-athlète : changer de coach librement",
    summary: "Tu te coaches toi-même ? Tu peux maintenant rejoindre un autre coach, ou te retirer de tes propres athlètes.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Mode athlète, Profil → « Mon coach » : nouveaux boutons « Rejoindre un autre coach » (avec son code) et « Ne plus me coacher ».",
          "Page Athlètes : une croix sur ta ligne « Mon programme personnel » te retire de tes athlètes ; « + M'ajouter comme athlète » te remet quand tu veux.",
          "Ton historique et ta programmation sont conservés : un nouveau coach les retrouve tels quels.",
          "Tu n'apparais plus en double dans ta liste d'athlètes.",
          "Dès que tu n'es plus ton propre athlète (autre coach ou aucun), ta programmation perso disparaît de ton espace coach : c'est ton coach qui la gère.",
        ],
      },
    ],
  },
  {
    id: "2026-10-14-suppression-seances",
    date: "2026-10-14",
    kind: "feature",
    title: "Supprimer une séance de tes banques",
    summary: "Musculation, énergétique ou spécifique : tu peux maintenant retirer n'importe quelle séance de tes banques, même déjà programmée.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Icône corbeille sur chaque séance : Programmation de l'athlète (Énergie et Spécifique), fenêtres « Depuis la banque » et « Importer une séance », et menu ⋯ de la Bibliothèque.",
          "Une séance déjà programmée chez un athlète pouvait être impossible à supprimer (message d'erreur) : c'est corrigé.",
          "Rien n'est perdu côté athlète : une séance déjà programmée reste dans son calendrier, avec ses retours (RPE, ressentis). Elle disparaît seulement de tes banques.",
          "Une confirmation est toujours demandée avant de supprimer.",
        ],
      },
    ],
  },
  {
    id: "2026-10-14-import-mode-emploi",
    date: "2026-10-14",
    kind: "feature",
    title: "Mode d'emploi : importer une séance écrite",
    summary: "Tu écris tes séances dans tes notes, sur Word ou sur papier ? Une IA les met au bon format et Agon les crée pour toi, en 5 minutes.",
    sections: [
      {
        title: "Ce dont tu as besoin",
        points: [
          "Un compte gratuit sur Claude (claude.ai) ou ChatGPT (chatgpt.com), sur ordinateur ou téléphone.",
          "Ta séance, sous n'importe quelle forme : texte copié de tes notes, tableau Excel, ou simple photo d'une feuille.",
          "Le prompt Agon ci-dessous : c'est le « mode d'emploi » qui explique à l'IA comment écrire la séance pour l'app.",
        ],
      },
      {
        title: "Pas à pas (la première fois)",
        points: [
          "1. Clique sur « Copier » sous « Prompt Agon » en bas de cette carte.",
          "2. Ouvre Claude ou ChatGPT, démarre une nouvelle conversation et colle le prompt (Cmd+V sur Mac, Ctrl+V sur PC).",
          "3. Juste après, colle ta séance (ou ajoute la photo avec le trombone 📎), puis envoie.",
          "4. L'IA répond avec un bloc de texte qui commence par « SÉANCE … : ». Copie-le en entier (bouton « Copier » en haut du bloc).",
          "5. Dans Agon, va à l'endroit où créer la séance : Programmation de l'athlète (Muscu, Énergie ou Spécifique), Banque de séances, Banque énergétique ou catalogue Spécifique. Clique « Importer un texte ».",
          "6. Colle le texte à gauche. À droite, l'aperçu montre ce qui va être créé et le rapport liste ce qui manque (« À SAISIR »). Pour les exercices proposés au choix, vérifie celui de ta bibliothèque.",
          "7. Clique « Importer », vérifie la séance dans l'éditeur, complète les zones « À SAISIR » si besoin, puis enregistre.",
        ],
      },
      {
        title: "Pour aller plus vite ensuite",
        points: [
          "Sur Claude : crée un Projet « Agon » et colle le prompt dans les instructions du projet (ou ajoute le fichier .md téléchargé ci-dessous). Ensuite, dans ce projet, tu n'as plus qu'à coller tes séances, sans recopier le prompt.",
          "Sur ChatGPT : même principe avec un « GPT » personnalisé ou un Projet, en y collant le prompt.",
          "Tu peux envoyer plusieurs séances d'un coup : l'IA renvoie un bloc par séance, à importer une par une.",
          "Si l'IA ne connaît pas une valeur (allure, charge…), elle l'écrit entre guillemets : tu la complètes ensuite dans l'éditeur. Rien n'est jamais bloquant.",
        ],
      },
    ],
    resources: [
      {
        label: "Prompt Agon (format d'import des séances)",
        description: "À coller dans Claude ou ChatGPT avant ta séance, ou à ajouter une fois pour toutes dans un Projet.",
        text: IMPORT_PROMPT,
        filename: IMPORT_PROMPT_FILENAME,
      },
    ],
  },
  {
    id: "2026-10-14-import-specifique",
    date: "2026-10-14",
    kind: "feature",
    title: "Import des séances spécifiques (HYROX, CrossFit…)",
    summary: "Les séances spécifiques s'importent aussi par texte : blocs classiques et WOD, stations en distance.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "« Importer un texte » est disponible sur les séances spécifiques (éditeur, catalogue Spécifique, Programmation de l'athlète) : blocs CLASSIQUE (exercices, prescriptions, repos) et WOD (course, groupes, EMOM avec départ fixe).",
          "Dans un WOD, une étape exercice peut désormais se donner en distance ou en calories : « Sled Push 50 m », « Row 500 m », « SkiErg 20 cal ».",
          "Charges reconnues : 24 kg, deux kettlebells (2x24kg), % du 1RM, poids du corps.",
          "Le sport et la qualité physique écrits dans le texte sont reliés à ta liste (ou créés), et les exercices reliés à ta bibliothèque.",
          "Les longues consignes et prescriptions s'affichent en entier dans l'éditeur et l'aperçu.",
        ],
      },
    ],
  },
  {
    id: "2026-10-14-import-texte",
    date: "2026-10-14",
    kind: "feature",
    title: "Nouveau : importer une séance écrite",
    summary: "Colle une séance rédigée au format texte YOXX : elle est créée automatiquement, en musculation comme en énergétique.",
    sections: [
      {
        title: "Comment ça marche",
        points: [
          "Bouton « Importer un texte » dans la Programmation de l'athlète (Muscu et Énergie), la Banque de séances, la Bibliothèque et la Banque énergétique.",
          "Musculation : blocs, supersets, séries × reps, charges (kg, %1RM, PDC), RIR, tempo, méthodes et une ligne par semaine sont reconnus.",
          "Énergétique : intervalles, durées, cibles (zones, % FCmax, allure, % VMA, watts…), groupes répétés et consigne de séance.",
          "Rien n'est bloquant : un rapport liste ce qui reste à compléter (« À SAISIR ») avec un lien direct vers l'endroit concerné.",
          "Un exercice au nom identique est relié à ta bibliothèque ; un nom proche te propose un choix ; sinon il est créé.",
        ],
      },
      {
        title: "Pour tes athlètes",
        points: [
          "La consigne d'une séance énergétique s'affiche désormais dans leur programme.",
        ],
      },
    ],
  },
  {
    id: "2026-10-14-ameliorations",
    date: "2026-10-14",
    kind: "fix",
    title: "Séances plus claires et corrections",
    summary: "Supersets visibles partout, commentaires sur tous les exercices, annulation de validation fiable.",
    sections: [
      {
        title: "Pour tes athlètes",
        points: [
          "Les supersets apparaissent dans l'aperçu de la séance (Programme) : l'athlète voit avant de commencer quels exercices s'enchaînent sans repos.",
          "L'athlète peut commenter chaque exercice, y compris dans un superset et les exercices libres : tu reçois ses retours sur tous les blocs.",
          "Annuler la validation d'une séance (bouton « Rouvrir » en musculation, « Annuler » en énergie) remet la séance à faire partout : accueil, programme, calendrier.",
          "Le « J'aime » de la citation du jour fonctionne : le compteur est commun à tous les athlètes.",
          "Un œil permet d'afficher le mot de passe à la connexion et à l'inscription.",
          "L'icône Agon s'affiche quand l'app est ajoutée à l'écran d'accueil d'un iPhone (supprimer puis réajouter le raccourci).",
        ],
      },
      {
        title: "Pour toi",
        points: [
          "Cette carte « Nouveautés » : chaque mise à jour de l'app est résumée ici. Clique « J'ai vu » pour la ranger ; l'historique reste dans le menu Nouveautés.",
        ],
      },
    ],
  },
  {
    id: "2026-10-14-fiches",
    date: "2026-10-14",
    kind: "feature",
    title: "Nouveau : les Fiches",
    summary: "Une banque de PDF et d'images (mobilité, pacing, nutrition…) à rattacher aux séances et à partager avec tes athlètes.",
    sections: [
      {
        title: "Ta banque de fiches",
        points: [
          "Menu « Fiches » : importe tes PDF ou images par glisser-déposer, classe-les par catégorie et retrouve-les avec la recherche.",
          "Crée des variantes d'une même fiche (V1, V2, « Prog S5 »…) pour faire évoluer un document sans le dupliquer.",
          "Coche « Libre-service » pour qu'une fiche soit consultable par tous tes athlètes ; archive-la pour la retirer sans casser les séances où elle est rattachée.",
        ],
      },
      {
        title: "Dans la programmation",
        points: [
          "Bouton « + Fiche » sur une séance ou un bloc : l'athlète voit un lien 📄 au bon moment, pendant sa séance.",
          "« Varier selon la semaine » : une variante différente en S1-S2 puis en S3-S4, sans rien refaire chaque semaine.",
          "Les fiches suivent quand tu enregistres une séance dans la banque ou la duplique vers un autre athlète (les fiches personnelles ne sont pas copiées).",
        ],
      },
      {
        title: "Pour chaque athlète",
        points: [
          "Onglet « Fiches » de l'athlète : ce qu'il a reçu, ce qu'il a ouvert (vu / non vu) et ses commentaires.",
          "Importe une fiche personnelle (ex. pacing individualisé) visible uniquement par lui, ou attribue une fiche de la banque avec une note.",
          "L'athlète peut t'envoyer captures d'écran, photos ou PDF depuis Programme → Fiches → Mes ajouts (images compressées automatiquement).",
        ],
      },
    ],
  },
];
