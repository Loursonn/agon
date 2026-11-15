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
    id: "2026-11-16-douleur-de-seance",
    date: "2026-11-16",
    kind: "feature",
    title: "Douleur pendant la séance",
    summary: "En fin de séance, votre athlète dit s'il a eu mal : zone, note sur 10 et commentaire. La douleur devient une blessure déclarée, visible dans son profil, sur la séance dans Retours et dans sa weekly review.",
    sections: [
      {
        title: "Côté athlète",
        points: [
          "Après la validation d'une séance de muscu, d'énergie ou HYROX, avec le RPE : « Une douleur pendant la séance ? ». Non par défaut : la question ne bloque jamais la validation.",
          "S'il répond Oui : il touche la zone sur la même carte que le wellness du matin, la note de 0 à 10, et peut laisser un commentaire.",
          "La douleur rejoint ses blessures en cours ; il la clôture depuis son profil quand c'est passé.",
        ],
      },
      {
        title: "Côté coach",
        points: [
          "Chaque douleur de séance est une blessure déclarée : elle allume « blessure active » et apparaît dans le profil santé, en cours jusqu'à ce que l'athlète ou vous la clôturiez.",
          "Pas de doublon : si une blessure est déjà en cours sur la même zone, sa note de douleur est mise à jour.",
          "Dans Retours, la séance porte une pastille rouge « Douleur » ; le détail du jour donne les zones, les notes et le commentaire de l'athlète.",
        ],
      },
      {
        title: "Weekly review",
        points: [
          "Une douleur de séance déclenche les questions douleur de la weekly review, comme une douleur au wellness ou une blessure, et y est rappelée avec le nom de la séance.",
        ],
      },
    ],
  },
  {
    id: "2026-11-16-chargement-plus-rapide",
    date: "2026-11-16",
    kind: "fix",
    title: "L'app se charge plus vite",
    summary:
      "Sur un réseau mobile moyen, la fiche d'un athlète s'ouvre en 8 s au lieu de 13 s, et en moins de 3 s quand vous revenez dessus. Côté athlète, l'écran Aujourd'hui gagne 2 à 3 secondes à l'ouverture.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "L'app télécharge en même temps ce qu'elle téléchargeait l'un après l'autre (votre profil, vos accords, l'écran d'arrivée).",
          "Les graphiques et les fenêtres rarement ouvertes (bilan de bloc, frise, synthèse) ne sont chargés qu'au moment où vous les ouvrez.",
          "Rien ne change dans ce qui est affiché.",
        ],
      },
    ],
  },
  {
    id: "2026-11-16-fiches-categorie-test",
    date: "2026-11-16",
    kind: "feature",
    title: "Fiches : une catégorie « Test »",
    summary: "Rangez à part les fiches qui accompagnent vos tests : protocole, consignes de passation.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Dans Fiches, un nouveau filtre « Test » regroupe les fiches de vos tests (saut, biométrie, bilan…).",
          "Pour y ranger une fiche : ouvrez-la et choisissez la catégorie « Test ». Elle reste dans votre banque, sans être liée à un athlète tant que vous ne la donnez pas.",
          "Votre assistant Claude peut aussi déposer directement ses fiches de test dans cette catégorie.",
        ],
      },
    ],
  },
  {
    id: "2026-11-16-assistant-retire-ses-fiches",
    date: "2026-11-16",
    kind: "fix",
    title: "Assistant Claude : il retire de nouveau ses fiches",
    summary: "Une fiche déposée par votre assistant puis retouchée dans Agon ne lui était plus « connue » : il ne pouvait plus la retirer.",
    sections: [
      {
        title: "Ce qui est corrigé",
        points: [
          "Votre assistant reconnaît toujours les fiches qu'il a déposées, même si vous avez changé leurs tags ou leur catégorie : il peut retirer un doublon tant qu'aucun athlète ne l'a reçu.",
          "Quand une fiche est la vôtre (importée par vous dans Agon), il vous le dit clairement au lieu de répondre qu'elle n'existe pas.",
        ],
      },
    ],
  },
  {
    id: "2026-11-15-badge-modifs-athlete",
    date: "2026-11-15",
    kind: "fix",
    title: "Le badge « modifs » de la fiche athlète compte juste",
    summary: "Le badge orange en haut à droite ne compte plus que ce que votre athlète a vraiment changé, et vous montre quoi.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Avant, il comptait toutes les séances où l'athlète avait saisi ses charges, depuis toujours. Maintenant : les séances qu'il a déplacées (et les séries ou exercices qu'il a ajoutés), sur les 4 dernières semaines et à venir.",
          "Un clic sur le badge ouvre la liste : la séance, ce qui a changé (déplacée du mardi au jeudi…), par qui et quand. Les nouvelles ont un point orange.",
          "Une fois la liste refermée, elles sont vues : le badge disparaît jusqu'à la prochaine modification. « Tout voir dans Retours » mène à la liste complète.",
        ],
      },
    ],
  },
  {
    id: "2026-11-15-accueil-records-athletes",
    date: "2026-11-15",
    kind: "fix",
    title: "Accueil : records et tests de vos athlètes seulement",
    summary: "Si vous vous entraînez aussi dans Agon, vos propres mesures ne se mélangent plus à celles de vos athlètes sur l'accueil.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Le bloc « Records & tests » et la tuile « Tests à venir » ne montrent plus que vos athlètes, y compris ceux que vous suivez en co-coach.",
          "Vos propres résultats restent dans votre programme personnel.",
        ],
      },
    ],
  },
  {
    id: "2026-11-15-seance-hebdo-concrete-cycle",
    date: "2026-11-15",
    kind: "fix",
    title: "Planning : une séance hebdomadaire est posée sur tout le cycle",
    summary: "Une séance créée ou modifiée avec un jour (ex. lundi) n'apparaît plus en « prévu » : elle est posée chaque semaine du cycle.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Dans Programmation, quand vous créez ou modifiez une séance récurrente avec son jour, elle est posée tout de suite chaque semaine du cycle, à partir d'aujourd'hui. Votre athlète la voit dans son planning.",
          "Changer le jour déplace les séances à venir. Les séances faites, commencées ou déplacées par votre athlète restent où elles sont, et rien n'est supprimé.",
          "Une séance ajoutée en cours de cycle ne s'affiche plus « manquée » sur les semaines déjà passées.",
        ],
      },
    ],
  },
  {
    id: "2026-11-15-programmer-test-vue-semaine",
    date: "2026-11-15",
    kind: "fix",
    title: "Planning : trouver un test plus vite dans la vue Semaine",
    summary: "Les tests ne sont plus alignés sur une seule ligne : ils sont rangés par dominante, avec une recherche.",
    sections: [
      {
        title: "Vue Semaine",
        points: [
          "Onglet Tests du bandeau « Programmer » : les tests sont rangés par dominante (bilan articulaire, endurance, explosivité, vitesse, HYROX…). Une pastille par dominante pour n'afficher qu'elle.",
          "La recherche ignore les accents et trouve aussi une dominante : « explosivite » ou « hyrox » suffit.",
          "Les tests HYROX apparaissent aussi dans la colonne de la vue Mois.",
        ],
      },
      {
        title: "Sur téléphone",
        points: [
          "« Ajouter » sur un jour libre du planning propose maintenant Séance ou Test : même recherche et même rangement par dominante.",
        ],
      },
    ],
  },
  {
    id: "2026-11-16-hyrox-no-reps-wall-balls",
    date: "2026-11-16",
    kind: "feature",
    title: "HYROX : les no reps aux wall balls",
    summary: "Notez les no reps d'une course aux wall balls : cible ratée et pas sous la parallèle.",
    sections: [
      {
        title: "Saisir",
        points: [
          "Dans la saisie ou la modification d'une course : deux cases, « cible ratée » et « pas sous la parallèle ». Laissées vides, elles restent non renseignées.",
          "Votre athlète peut les remplir depuis son téléphone. Les résultats officiels ne les donnent pas : « Coller mon résultat » les laisse vides.",
        ],
      },
      {
        title: "Lire",
        points: [
          "Le débrief de la course les affiche sous la frise, à côté du temps des wall balls.",
          "« Comparer » ajoute une ligne no reps avant / après : moins, c'est mieux.",
        ],
      },
    ],
  },
  {
    id: "2026-11-16-hyrox-fc-montre-recalee",
    date: "2026-11-16",
    kind: "feature",
    title: "HYROX : la FC de la montre recalée sur la course",
    summary: "Liez une course à l'activité de la montre et calez la FC sur les temps officiels, station par station.",
    sections: [
      {
        title: "Lier la montre à la course",
        points: [
          "Dans l'analyse d'une course, onglet Course : l'activité de montre du même jour est proposée d'office ; vous pouvez en choisir une autre.",
          "Votre athlète peut faire la même chose depuis son téléphone.",
        ],
      },
      {
        title: "Recaler à la seconde",
        points: [
          "La montre et le chrono officiel ne démarrent jamais en même temps : l'app propose le décalage (cadence des runs ou montée de FC au départ).",
          "Ajustez avec le curseur ou les boutons ±1 s / ±10 s, la frise se met à jour en direct, puis enregistrez.",
        ],
      },
      {
        title: "Lire la FC par segment",
        points: [
          "FC moyenne et maximale de chaque run, station et Roxzone, et ce que fait la FC du début à la fin de chaque station.",
          "En Roxzone : la FC redescend-elle avant le run suivant ?",
        ],
      },
    ],
  },
  {
    id: "2026-11-15-energie-noter-seance",
    date: "2026-11-15",
    kind: "feature",
    title: "Séances d'énergie : « Noter ma séance » refait côté athlète",
    summary:
      "L'écran où l'athlète note sa séance d'énergie est plus clair et ne bloque plus : il s'ouvre en bas de l'écran du téléphone, avec le nom de la séance et ce qui était prévu.",
    sections: [
      {
        title: "Ce qui change pour vos athlètes",
        points: [
          "Chaque bloc est nommé par son contenu (« 20 min à Z1 », « 6 min à 4:08–4:17/km ») au lieu de « Bloc 1 », « Bloc 2 ».",
          "Tous les blocs sont comptés faits : l'athlète décoche seulement ce qu'il n'a pas fait. Le bouton « Valider la séance » n'est plus grisé.",
          "La note par bloc reste possible, repliée derrière « + note ». La durée réelle est préremplie (prévu ou temps du minuteur) et se règle par 5 minutes.",
          "Vous recevez les mêmes informations qu'avant : blocs faits ou non, notes, durée, activité et distance.",
        ],
      },
    ],
  },
  {
    id: "2026-11-15-weekly-review-douleur-de-la-semaine",
    date: "2026-11-15",
    kind: "fix",
    title: "Weekly review : la douleur n'est demandée qu'aux athlètes qui en ont eu",
    summary:
      "Avant, la question douleur dépendait du feu du matin : un athlète en orange sans aucune douleur devait quand même en décrire une. Maintenant, elle n'apparaît que si l'athlète a signalé une douleur pendant la semaine, et on lui rappelle ce qu'il avait noté.",
    sections: [
      {
        title: "Ce qui change pour vos athlètes",
        points: [
          "La question « Ta douleur » apparaît seulement si une douleur a été signalée dans la semaine : dans le wellness du matin (même une gêne de 1 à 3 sur 10) ou en déclarant une blessure.",
          "Au-dessus de la question, l'athlète retrouve ce qu'il a signalé : le jour, la zone, la note et son commentaire.",
          "Le feu du matin ne décide plus de cette question.",
        ],
      },
    ],
  },
  {
    id: "2026-11-15-hyrox-debrief-saison",
    date: "2026-11-15",
    kind: "feature",
    title: "HYROX : débrief de course et « Ma saison »",
    summary: "L'onglet HYROX devient plus visuel : chaque course a son débrief, et vos athlètes voient leur saison d'un coup d'œil.",
    sections: [
      {
        title: "Débrief de course",
        points: [
          "En haut de l'analyse : la course segment par segment, en vert ce qui est fort (top 35 % de la catégorie), en orange ce qui est à travailler.",
          "Trois colonnes : points forts, ce qui a coûté le plus de temps, et où gagner du temps avec le chrono possible.",
          "Ce qui a bougé depuis la course précédente du même format : chrono, stations, runs, Roxzone et position.",
        ],
      },
      {
        title: "Côté athlète",
        points: [
          "Trois onglets : Ma saison, Courses, Tests. Stations, runs et radar sont regroupés dans Ma saison.",
          "Ma saison : la dernière course en grand, la courbe du chrono (solo et duo séparés), les progrès, le profil des stations et ce qui fera gagner du temps.",
          "Sur téléphone, une course s'ouvre sur son débrief : ce qui a marché, ce qui a coûté, quoi travailler.",
        ],
      },
      {
        title: "Évolution",
        points: [
          "Les positions par station deviennent une carte de couleurs, course par course, avec ce qui a progressé et ce qui stagne.",
        ],
      },
      {
        title: "Comparer deux courses",
        points: [
          "Nouvel onglet « Comparer » dans chaque course : choisissez n'importe quelle autre course de l'athlète, elles s'affichent côte à côte.",
          "Chrono, position, runs, stations et Roxzone ligne à ligne, avec ce qui a progressé et ce qui a reculé. Le run 1 (départ) s'affiche sans être jugé.",
          "Solo contre duo, open contre pro : c'est indiqué clairement, et seules les mesures comparables sont jugées.",
          "Toujours possible aussi depuis la liste : cochez deux courses puis « Comparer ».",
        ],
      },
    ],
  },
  {
    id: "2026-11-15-planification-plus-rapide",
    date: "2026-11-15",
    kind: "fix",
    title: "La planification s'ouvre plus vite",
    summary:
      "Le serveur vérifiait de façon coûteuse qui a le droit de voir chaque semaine d'un cycle. Les règles et la confidentialité restent exactement les mêmes, mais le calcul est bien plus léger : la planification et le programme de vos athlètes se chargent plus vite.",
    sections: [],
  },
  {
    id: "2026-11-15-hyrox-calculs-justes",
    date: "2026-11-15",
    kind: "fix",
    title: "HYROX : runs, positions et points faibles calculés plus justement",
    summary:
      "Le run 1 ne sert plus de référence, les positions se lisent dans toute la catégorie, et une station n'est « point faible » que si elle l'est vraiment. Le duo se compare enfin au duo.",
    sections: [
      {
        title: "Runs",
        points: [
          "Le run 1 change d'une course à l'autre (départ, longueur) : il s'affiche mais ne sert plus de point de comparaison.",
          "L'allure de croisière est la médiane des runs 2 à 7. Le coût d'une station se lit sur le run qui suit, à côté du ralentissement habituel des athlètes du même niveau au même endroit.",
          "Le run 8 compte (il suit les fentes) mais il est signalé : l'arrivée est parfois différente.",
        ],
      },
      {
        title: "Positions et points forts / faibles",
        points: [
          "Le « top x % » place maintenant chaque temps dans toute la catégorie (ex. tous les hommes open), et non plus seulement parmi les athlètes du même chrono. Le gain possible reste mesuré face à la médiane du niveau.",
          "Point fort = top 35 %, point faible = les 35 % les plus lents ; entre les deux, la station est dans la norme. Le radar ne cite plus trois « points faibles » d'office.",
          "Positions calculées sur tous les percentiles des références HYROX (p1 à p90), plus précises.",
        ],
      },
      {
        title: "Solo, duo, relais",
        points: [
          "Une course saisie « Doubles » se compare aux duos, même si la division indique Men ou Women.",
          "Dans l'analyse, « Comparer à la catégorie » change les médianes et positions (open, pro, duo, mixte, relais), et une carte donne le chrono équivalent au même rang dans chaque catégorie.",
          "Dans l'Évolution, solo, duo et relais ont chacun leur courbe.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-biometrie-taille-envergure-myjump",
    date: "2026-11-14",
    kind: "feature",
    title: "Biométrie : taille, envergure, segments et mesures MyJump",
    summary:
      "La saisie Mensurations / Photos de vos athlètes enregistre maintenant aussi leur taille debout, leur envergure, la longueur de leur cuisse, de leur jambe et de leur bras, et les deux longueurs que l'app MyJump demande : longueur du membre inférieur et hauteur de départ.",
    sections: [
      {
        title: "Côté athlète",
        points: [
          "Dans Tests › Mensurations / photos (ou depuis une mesure biométrique que vous avez planifiée), trois nouveaux blocs : « Biométrie », « Segments » et « Mesures MyJump ».",
          "Chaque champ dit comment prendre la mesure, par exemple : accroupi genoux à 90°, du haut de la hanche au sol.",
          "Pas besoin de tout remesurer à chaque fois : les dernières valeurs restent affichées en haut, prêtes à recopier dans MyJump.",
        ],
      },
      {
        title: "Côté coach",
        points: [
          "Profil sportif › Biométrie : les dernières valeurs (taille, envergure, segments, longueur du membre inférieur, hauteur de départ) et leur date, au-dessus de l'évolution des mensurations.",
          "Chaque nouvelle mesure a sa pastille dans l'évolution, comme les tours.",
          "L'ancien champ « Taille » des mensurations s'appelle maintenant « Tour de taille », pour ne plus le confondre avec la taille debout.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-feu-du-matin-signaux-repetes",
    date: "2026-11-14",
    kind: "feature",
    title: "Feu du matin : un signal qui se répète passe au rouge",
    summary:
      "Le feu regarde maintenant les 2-3 derniers jours : un signal isolé met le feu à l'orange, le même signal deux jours de suite le passe au rouge. Une phrase dit toujours pourquoi.",
    sections: [
      {
        title: "Les signaux suivis",
        points: [
          "Douleur à 4/10 ou plus (de 1 à 3, c'est une gêne : elle ne compte pas).",
          "Envie de s'entraîner à 2/5 ou moins, ou nettement sous l'habitude de l'athlète.",
          "Fatigue : récupération à 2/5 ou moins, ou nettement sous l'habitude.",
          "FC de repos au-dessus de l'habitude, VFC sous sa zone ou anormalement au-dessus (avec une montre reliée).",
        ],
      },
      {
        title: "Orange, puis rouge",
        points: [
          "Un signal un seul jour : feu orange, à surveiller.",
          "Le même signal deux jours de suite ou plus : feu rouge, avec « depuis 2 jours », « depuis 3 jours ».",
          "Un jour sans saisie ou sans mesure ne compte pas et coupe la série.",
          "La phrase sous le feu explique la couleur, sur l'accueil de l'athlète comme dans Retours et le wellness de l'athlète.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-date-naissance-ia",
    date: "2026-11-14",
    kind: "feature",
    title: "Date de naissance : rappel avant le 21 novembre pour garder l'IA",
    summary:
      "Les analyses par IA sont réservées aux 18 ans et plus. À partir du 22 novembre, un athlète sans date de naissance n'y aura plus accès tant qu'il ne l'aura pas renseignée.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "À sa prochaine connexion, l'athlète sans date de naissance la renseigne en une fois ; s'il a accepté l'IA, un message lui rappelle de le faire avant le 21 novembre.",
          "Sur la fiche de ton athlète (Profil, bloc Identité), une petite mention t'indique s'il doit encore la renseigner : tu peux l'inviter à ouvrir l'app.",
          "Dès que la date est saisie (18 ans ou plus), l'IA reprend sans rien à refaire.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-ia-echelles-forme",
    date: "2026-11-14",
    kind: "fix",
    title: "Synthèse IA : la forme et le stress lus dans le bon sens",
    summary:
      "Dans « Ce qu'on retient » du profil athlète, l'IA prenait parfois une forme de 4 sur 5 pour de la fatigue. Elle sait maintenant que 5 veut dire très en forme et très détendu.",
    sections: [],
  },
  {
    id: "2026-11-14-energie-durees-longues",
    date: "2026-11-14",
    kind: "fix",
    title: "Séances d'énergie : les durées longues tiennent à l'écran",
    summary:
      "Un chrono ou une durée de plusieurs dizaines de minutes (« 45:00 », « 1:20:00 ») débordait de sa zone. Les chiffres s'ajustent maintenant à la place disponible, sur téléphone comme sur ordinateur.",
    sections: [
      {
        title: "Ce qui est corrigé",
        points: [
          "Minuteur de l'athlète : le chrono reste dans l'anneau et l'allure visée sur une ligne, même pour un bloc d'1 h 20.",
          "Lecture de la séance et séance faite sur la montre (prévu / fait) : les cibles et les durées longues restent dans leur colonne.",
          "Éditeur de séance : le résumé d'un bloc s'affiche en entier au lieu d'être coupé par « … », et les durées sous le profil ne sont plus tronquées.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-garmin-seances-sur-la-montre-pour-tous",
    date: "2026-11-14",
    kind: "feature",
    title: "Garmin : vos séances arrivent sur la montre de vos athlètes",
    summary:
      "Pour chaque athlète qui a relié sa montre Garmin, les séances que vous programmez pour les 7 prochains jours partent dans son calendrier Garmin Connect, puis sur sa montre à la synchronisation.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Séances d'énergie et de musculation : allures, zones de fréquence cardiaque et charges sont calculées par Agon pour l'athlète.",
          "Vous modifiez, déplacez ou supprimez une séance : la montre suit dans les 10 minutes. Une séance déjà faite ou commencée n'est jamais retirée.",
          "L'athlète peut couper l'envoi dans Montres. S'il n'a pas autorisé l'import de séances chez Garmin, l'écran lui explique comment le faire.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-garmin-envoyer-sur-ma-montre",
    date: "2026-11-14",
    kind: "feature",
    title: "Garmin : l'athlète envoie une séance sur sa montre en un appui",
    summary:
      "Sur une séance prévue, l'athlète qui a une montre Garmin voit « Envoyer sur ma montre ». La séance part tout de suite dans son calendrier Garmin Connect, même si elle est dans plus de 7 jours.",
    sections: [
      {
        title: "Côté athlète",
        points: [
          "Le bouton est en haut de la séance d'énergie et de la séance de musculation, tant qu'elle est prévue et pas encore commencée.",
          "Une séance déjà envoyée affiche « Sur ta montre » : un appui la renvoie, utile si elle a été effacée du calendrier Garmin.",
          "Une séance envoyée à l'avance reste à jour : si vous la modifiez ou la déplacez, la montre suit ; si vous la supprimez, elle disparaît de la montre.",
          "Si l'envoi des séances est coupé dans Montres, le bouton l'indique et y renvoie, sans rien envoyer.",
        ],
      },
    ],
  },
  {
    id: "2026-11-15-hyrox-coller-resultat",
    date: "2026-11-15",
    kind: "feature",
    title: "HYROX : « Coller mon résultat » remplit toute la course",
    summary:
      "Dans HYROX › Courses, vos athlètes collent la page de leur résultat results.hyrox.com : la course, la date, la division, le chrono officiel, les classements et les 17 temps se remplissent seuls. Plus rien à taper.",
    sections: [
      {
        title: "Comment ça marche",
        points: [
          "L'athlète ouvre son résultat sur results.hyrox.com, copie toute la page (sur téléphone aussi), puis touche « Coller mon résultat ».",
          "La fiche s'ouvre pré-remplie : il vérifie et enregistre. Ce qu'Agon n'a pas trouvé est signalé en orange, à compléter.",
          "La date et la compétition sont reprises du calendrier de l'athlète quand la course y figure.",
          "Une capture d'écran du résultat marche aussi : copier son texte depuis Photos, puis coller.",
        ],
      },
      {
        title: "Contrôles",
        points: [
          "Si la somme des temps ne correspond pas au chrono officiel, Agon le signale avant l'enregistrement.",
          "Une course déjà enregistrée n'est pas créée deux fois : Agon propose de la mettre à jour.",
          "Agon ne va jamais lire le site HYROX lui-même : seul le texte collé par l'athlète est utilisé.",
        ],
      },
    ],
  },
  {
    id: "2026-11-15-hyrox-analyse-course",
    date: "2026-11-15",
    kind: "feature",
    title: "HYROX : l'analyse de course en un clic, le plan de course et l'évolution",
    summary:
      "Dans HYROX › Courses, « Analyse › » ouvre directement l'analyse complète d'une course. Vous pouvez préparer un plan de course, comparer la course à ce plan, et voir les leviers qui font gagner le plus de temps.",
    sections: [
      {
        title: "Analyse d'une course",
        points: [
          "Le haut de page donne le chrono, la position dans le niveau (top x %), l'écart au record et l'écart au plan de course.",
          "« Comparer à » : course précédente, plan de course ou médiane du niveau. Le tableau des 17 segments, la frise et les écarts suivent ce choix.",
          "« Où gagner du temps » classe les stations par gain possible, avec la raison (FC, cadence, Roxzone) et une proposition de travail.",
          "« Ajouter au programme » copie la proposition et ouvre la programmation de l'athlète, pour la coller dans une séance.",
        ],
      },
      {
        title: "Plan de course",
        points: [
          "Onglet « Plan de course » : entrez un chrono cible, Agon le répartit sur les 17 segments selon la médiane du niveau. Chaque objectif reste modifiable.",
          "Le plan est lié à une compétition : l'analyse de cette course le reprend automatiquement.",
        ],
      },
      {
        title: "Évolution (remplace Bilan)",
        points: [
          "Le bouton « Évolution » montre le chrono course après course (simulations comprises, filtre « Officielles » possible), la part du temps par bloc et la position par station.",
          "Une estimation du prochain chrono s'affiche quand l'athlète a des tests récents, avec sa fourchette et sa fiabilité.",
        ],
      },
      {
        title: "Côté athlète",
        points: [
          "Toucher une course ouvre son analyse. L'onglet Gains propose « En parler à » son coach : le message arrive dans le commentaire de la course.",
        ],
      },
    ],
  },
  {
    id: "2026-11-15-hyrox-references-completes",
    date: "2026-11-15",
    kind: "fix",
    title: "HYROX : positions et médianes calculées sur toutes les références",
    summary:
      "Une partie des références HYROX n'était pas lue : certaines positions (top x %), certains profils et certaines médianes manquaient ou étaient faux. Tout est maintenant pris en compte.",
    sections: [],
  },
  {
    id: "2026-11-15-acces-base-plus-rapide",
    date: "2026-11-15",
    kind: "fix",
    title: "Pages plus rapides : les contrôles d'accès allégés",
    summary:
      "Le serveur vérifiait qui a le droit de voir chaque donnée de façon très coûteuse. Même règles, même confidentialité, mais calculées bien plus vite : les fiches athlètes, le planning et les séances s'ouvrent plus vite, surtout aux heures chargées.",
    sections: [],
  },
  {
    id: "2026-11-14-wellness-poids-virgule",
    date: "2026-11-14",
    kind: "fix",
    title: "Wellness : le poids se tape avec une virgule",
    summary: "Sur téléphone, l'athlète peut écrire 72,4 kg dans son wellness du matin : la virgule n'efface plus la pesée.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Le champ Poids du wellness ouvre le clavier chiffres avec la virgule et garde la décimale (72,4).",
          "La pesée arrive bien dans la courbe de poids de l'athlète, comme avant.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-wellness-carte-douleur",
    date: "2026-11-14",
    kind: "feature",
    title: "Wellness : la douleur a sa propre carte du corps",
    summary:
      "Le matin, l'athlète répond « Douleur : oui / non ». Si oui, il touche la zone sur un 2ᵉ corps (genou, cheville, lombaires…), distinct de celui des courbatures, et la note de 0 à 10.",
    sections: [
      {
        title: "Côté athlète",
        points: [
          "Deux cartes séparées : courbatures (muscles sollicités la veille) et douleur (articulations, dos, tendons), pour ne plus confondre les deux.",
          "Une note de 0 à 10 par zone, avec les repères sous l'échelle : 0 aucune, 1 à 3 gêne, 4 douleur, 10 insupportable. Plusieurs zones possibles.",
        ],
      },
      {
        title: "Côté coach",
        points: [
          "Dans les Retours, le détail du jour affiche une pastille par zone douloureuse (« Douleur genou · 6/10 »), à côté des courbatures.",
          "La note « Blessé / malade » reprend les zones et leurs notes ; le feu du matin compte la zone la plus douloureuse.",
          "Les douleurs saisies avant aujourd'hui restent affichées telles quelles, sans zone.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-citation-sans-jaime",
    date: "2026-11-14",
    kind: "fix",
    title: "Accueil plus léger : la citation du jour sans « J'aime »",
    summary:
      "La citation du jour reste sur l'accueil de vos athlètes, sans bouton « J'aime » ni compteur. L'accueil s'ouvre plus vite et sollicite moins le serveur.",
    sections: [],
  },
  {
    id: "2026-11-14-competitions-annuler-supprimer",
    date: "2026-11-14",
    kind: "feature",
    title: "Annuler ou supprimer une compétition, bascule coach / athlète plus visible",
    summary: "Une compétition annulée reste visible, barrée, mais ne compte plus dans les décomptes. Une compétition saisie par erreur se supprime. Sur téléphone, passer du mode coach au mode athlète se fait en un geste.",
    sections: [
      {
        title: "Compétitions",
        points: [
          "Annuler : la compétition reste dans la liste et le calendrier, barrée, avec qui l'a annulée. Elle sort de la prochaine compétition, des J-x, de la frise et de ce que lit l'assistant. « Rétablir » la remet.",
          "Supprimer : pour une faute de frappe. La confirmation prévient si un résultat HYROX, un plan de course ou un bilan de l'athlète y est rattaché (les résultats sont gardés, le bilan est perdu).",
          "Où : Planning › Compétitions (icônes à droite de chaque ligne), en ouvrant une compétition depuis le calendrier, et sur téléphone en touchant la compétition dans le planning de l'athlète.",
          "L'athlète peut aussi annuler ou supprimer ses compétitions, depuis « Mes compétitions » (bouton ⋯).",
        ],
      },
      {
        title: "Coach qui s'entraîne aussi",
        points: [
          "Côté athlète, la pastille « Mode coach » en haut de chaque page est plus lisible, et une carte « Passer à ton espace coach » ouvre l'onglet Profil.",
          "Côté coach sur téléphone, une pastille « Athlète » est à côté de « Bonjour » sur l'accueil (le bouton reste aussi dans Plus).",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-ia-claude",
    date: "2026-11-14",
    kind: "feature",
    title: "Analyses IA de vos athlètes : nouveau moteur, données mieux protégées",
    summary:
      "Les phrases d'analyse que vos athlètes lisent dans « Mon profil » sont maintenant rédigées par Claude (Anthropic). Leurs données ne servent jamais à entraîner les modèles.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Les analyses rédigées par l'IA s'appuient toujours sur les chiffres de l'athlète : poids, sommeil, fatigue, assiduité, records.",
          "Les données envoyées ne servent pas à entraîner les modèles et sont effacées au bout de 30 jours au plus.",
          "Rien ne change pour vos athlètes : ceux qui ont accepté l'IA gardent leurs analyses, les autres gardent leurs statistiques sans texte rédigé.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-onglets-fiche-athlete-ecran-moyen",
    date: "2026-11-14",
    kind: "fix",
    title: "Onglets de la fiche athlète visibles en entier",
    summary: "Sur un écran d'ordinateur moyen (environ 1100 px de large), « Historique » était coupé au bord et la barre d'onglets défilait sur le côté. Tous les onglets tiennent maintenant sur une ligne.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Sur un écran de moins de 1280 px, « Profil athlète » devient « Profil » et « Coachs & staff » devient « Staff ». Survole l'onglet pour lire le nom complet.",
          "Sur un grand écran, rien ne change.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-staff-cycle-en-cours",
    date: "2026-11-14",
    kind: "feature",
    title: "Ton staff voit où en est l'athlète dans son cycle",
    summary: "Sur l'accueil d'un kiné, d'un ostéo ou d'un nutritionniste, chaque athlète affiche maintenant son cycle en cours et la semaine du jour, par exemple « HYROX PARIS · S1 / 5 ».",
    sections: [
      {
        title: "Qui le voit",
        points: [
          "Seulement les pros à qui tu as ouvert la planification, en lecture ou en écriture : c'est déjà le cas par défaut pour tous les métiers sauf « Autre ».",
          "Si tu fermes la planification, ou si l'athlète n'a pas donné son accord au partage avec son staff, le badge n'apparaît pas.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-avis-app-etoiles",
    date: "2026-11-14",
    kind: "fix",
    title: "Avis sur l'app : les étoiles sont de retour",
    summary: "Dans le formulaire « Donne ton avis » de l'athlète, les cinq étoiles de la note étaient devenues des boutons vides, et l'écran de remerciement n'avait plus d'icône. Elles s'affichent de nouveau et se remplissent en or jusqu'à la note choisie.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Tes athlètes voient à nouveau les cinq étoiles pour noter l'app.",
          "Après l'envoi, une coche verte confirme que l'avis est bien parti.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-pastille-importance-competitions",
    date: "2026-11-14",
    kind: "fix",
    title: "Liste des compétitions : importance lisible",
    summary: "Dans Planning › Compétitions, la pastille d'importance affiche la lettre (A, B, C) au lieu d'un texte qui débordait.",
    sections: [
      {
        title: "Planning",
        points: [
          "Survole la pastille pour lire l'importance en toutes lettres.",
          "Sur un écran étroit, « + Thème » et le thème du jour restent sur une ligne dans l'en-tête de chaque jour.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-invitation-staff-finitions",
    date: "2026-11-14",
    kind: "fix",
    title: "Page d'invitation du staff plus nette",
    summary: "La page qu'ouvre un kiné, un ostéo ou un nutritionniste quand tu l'invites dans le staff d'un athlète a été relue écran par écran.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Les champs mot de passe et métier ont enfin le même aspect que les autres champs du formulaire.",
          "Sur téléphone, la page respire : la carte prend toute la largeur et les deux onglets tiennent sur une ligne.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-vue-athlete-ordinateur",
    date: "2026-11-14",
    kind: "fix",
    title: "« Vue athlète » lisible sur ordinateur",
    summary: "L'aperçu de ce que voit ton athlète tenait dans une bande étroite : sur ordinateur, le programme de la semaine s'y écrasait (« Cette semaine » écrit à la verticale). Il prend maintenant toute la largeur, comme l'app de l'athlète sur ordinateur.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Sur ordinateur, l'aperçu montre les écrans de l'athlète en grand ; sur tablette et téléphone, il garde le format téléphone.",
          "Alimentation : sur un écran moyen, les glucides, lipides et protéines passent sous l'anneau du jour au lieu d'être tassés.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-staff-semaine-entiere",
    date: "2026-11-14",
    kind: "feature",
    title: "Ton staff voit toute la semaine d'un coup",
    summary: "Dans l'onglet Programme de l'espace staff, les 7 jours tiennent à l'écran sans défiler sur le côté.",
    sections: [
      {
        title: "Pour ton staff",
        points: [
          "Sur ordinateur, l'onglet Programme affiche la semaine entière ; le détail des accès s'ouvre avec le bouton « Tes accès ».",
          "Les séances de la semaine sont plus lisibles : titre sur toute la largeur, statut juste en dessous, couleurs des tests et compétitions comme dans le reste d'Agon.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-competitions-semaine-ordinateur",
    date: "2026-11-14",
    kind: "fix",
    title: "Compétitions lisibles dans la semaine sur ordinateur",
    summary: "Côté athlète, sur ordinateur, une compétition dans la vue semaine du Programme s'écrivait lettre par lettre à la verticale. Elle s'affiche maintenant en carte horizontale : type, nom, importance A/B/C, compte à rebours (J-21) et lieu.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "La carte compétition tient dans la colonne du jour, sans couper les mots.",
          "Les périodes « Indisponible » s'affichent sur deux lignes au lieu d'être écrasées.",
          "Le bouton « Compétition » du menu + a retrouvé sa bordure rouge.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-theme-du-jour-menu-rapide",
    date: "2026-11-14",
    kind: "feature",
    title: "Thème du jour en un clic",
    summary: "Dans le planning, clique sur l'en-tête d'un jour : un petit menu s'ouvre sur place, sans panneau sur le côté.",
    sections: [
      {
        title: "Dans le planning (semaine et mois)",
        points: [
          "Choisis Hard, Moyen, Easy, Récup active ou Repos : c'est enregistré tout de suite.",
          "« Ajouter un commentaire » te laisse écrire un mot sur la journée ; ton athlète le lit sous le thème de son jour.",
          "« Retirer le thème » l'efface, et « Plus d'options… » ouvre le panneau complet (nom, dominante, couleur).",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-blessures-et-staff-lisibles",
    date: "2026-11-14",
    kind: "feature",
    title: "Blessures et espace staff plus lisibles",
    summary: "Une blessure en cours se repère d'un coup d'œil, et ton staff retrouve fiches et commentaires dans le même style que le reste d'Agon.",
    sections: [
      {
        title: "Blessures",
        points: [
          "Une blessure en cours apparaît sur une carte rouge avec une pastille « En cours » ; une fois guérie, la carte redevient neutre avec une pastille verte.",
        ],
      },
      {
        title: "Pour ton staff",
        points: [
          "Dans la fiche d'un athlète, les fiches s'affichent avec une icône à la couleur de leur catégorie, et les commentaires sont plus faciles à lire.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-analyse-course-hyrox-montre",
    date: "2026-11-14",
    kind: "feature",
    title: "Analyse de course HYROX : la montre se lit mieux",
    summary: "La frise d'une course HYROX sépare la fréquence cardiaque, l'allure et la cadence, et l'évolution de ton athlète se lit d'un coup d'œil.",
    sections: [
      {
        title: "Sur ordinateur",
        points: [
          "La frise de course montre les 17 segments en tête (R1 à R8 et les pictos des stations), puis trois pistes alignées : FC par zone, allure des runs et cadence, avec les départs des runs en repère.",
          "Le bilan HYROX devient « Évolution HYROX » : chrono de chaque course (le plus rapide en haut), où passe le temps et position par station, rangés en trois parties.",
        ],
      },
      {
        title: "Sur le téléphone de ton athlète",
        points: [
          "L'analyse de course s'ouvre sur le chrono en grand, le rang et le profil, puis une frise lisible : cases numérotées, pictos des stations et durée de la course.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-coach-telephone-et-staff-peps",
    date: "2026-11-14",
    kind: "feature",
    title: "Agon sur ton téléphone et l'espace staff passent au nouveau style",
    summary: "Les écrans coach sur téléphone et l'espace de ton staff (kiné, coach adjoint, nutri) prennent le style « peps » : plus lisibles d'un coup d'œil.",
    sections: [
      {
        title: "Sur ton téléphone",
        points: [
          "Wellness : un feu vert, orange ou rouge en tête, puis des tuiles avec l'historique de 28 jours.",
          "Santé : les mesures hors de sa normale passent en tuiles avec leur courbe, les autres restent en liste avec une petite courbe.",
          "Tests, fiches et banque d'exercices sont rangés par groupes de couleur, avec une vignette par fiche et par exercice.",
          "« Modifier une séance » : boutons − / + plus grands et dernier résultat rappelé sous l'exercice.",
        ],
      },
      {
        title: "Pour ton staff",
        points: [
          "Son accueil montre ses athlètes et ce qui est à surveiller côte à côte.",
          "Dans l'espace d'un athlète, il voit tous les onglets : ceux que tu ne partages pas restent grisés avec un cadenas.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-app-athlete-nouveau-style",
    date: "2026-11-14",
    kind: "feature",
    title: "L'app de tes athlètes prend le nouveau style",
    summary: "Sur téléphone comme sur ordinateur, tes athlètes retrouvent des couleurs franches et des écrans plus lisibles.",
    sections: [
      {
        title: "Sur téléphone",
        points: [
          "Fiches : la fiche que tu viens d'envoyer s'affiche en grande carte avec ton mot, et chaque fiche porte la couleur de sa catégorie.",
          "Aperçu d'une séance depuis le Programme : chaque bloc garde sa couleur, comme dans ta programmation.",
          "Santé : les phases de sommeil (profond, léger, paradoxal, éveil) en une barre colorée, et un état Normal / Bas / Haut plus visible.",
        ],
      },
      {
        title: "Sur ordinateur",
        points: [
          "En-tête plus compact sur toutes les pages, avec le nom et les initiales de l'athlète en haut à droite.",
          "Alimentation : le suivi du jour sur deux colonnes, calories actives et enregistrement à droite.",
          "HYROX utilise toute la largeur de l'écran et les fiches s'ouvrent à côté de la liste.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-vue-coach-ordinateur-relookee",
    date: "2026-11-14",
    kind: "feature",
    title: "Ton espace coach sur ordinateur prend le nouveau style",
    summary: "Accueil, menu, fiche athlète, tests, fiches et banque : des couleurs franches pour repérer d'un coup d'œil ce qui demande ton attention.",
    sections: [
      {
        title: "Accueil et menu",
        points: [
          "En-tête avec la citation du jour et deux tuiles colorées : séances manquées hier et tests de la semaine.",
          "Chaque athlète du jour affiche son wellness dans une pastille de couleur et l'état de sa séance (en cours, terminée, RPE).",
          "Les alertes (blessure, séance manquée, wellness en baisse) ressortent en cartes colorées.",
        ],
      },
      {
        title: "Fiche athlète",
        points: [
          "Planning semaine : chaque jour a son en-tête coloré selon son thème, et chaque séance sa couleur de type.",
          "Retours : tuiles chiffrées colorées, colonnes des jours à la couleur du wellness, statut de chaque séance en pastille (faite, manquée, déplacée).",
          "Santé : les mesures de la montre et le wellness déclaré côte à côte, sur toute la largeur de l'écran.",
        ],
      },
      {
        title: "Tests, fiches et banque",
        points: [
          "Chaque catégorie a sa couleur, reprise dans les titres, les filtres et les cartes.",
          "Banque d'exercices : recherche et filtres sur une seule ligne, chaque type d'exercice a sa couleur (Musculaire en or, Haltérophilie en rose, Pliométrie en orange, Mobilité en turquoise).",
        ],
      },
      {
        title: "Avis, paramètres et HYROX",
        points: [
          "Avis athlètes : chaque retour en carte, type en pastille (bug en rouge, idée en or), filtres regroupés en haut à droite.",
          "Course HYROX : en-tête orange avec le nom de la course en grand et le chrono, temps course / stations / roxzone en tuiles.",
          "Ajuster les tours d'une séance HYROX : la barre d'outils passe au-dessus du graphique et le tour choisi s'édite dans un panneau à droite du graphique.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-seance-energie-athlete-telephone",
    date: "2026-11-14",
    kind: "feature",
    title: "Séances d'énergie : plus lisibles pour tes athlètes, avec un minuteur plein écran",
    summary: "Sur son téléphone, ton athlète lit ta séance de course, de vélo ou de rameur en quelques secondes, puis la suit en plein écran pendant l'effort.",
    sections: [
      {
        title: "Avant la séance",
        points: [
          "Durée et distance en une ligne, puis le profil de la séance en barres colorées par zone.",
          "Chaque bloc se lit comme une phrase (« 2 × (5 × 400 m, récup 1 min 30 s trot) ») avec une seule cible en grand : allure, watts ou zone.",
          "Tes consignes restent repliées sous « Consignes du coach », le détail complet est toujours accessible.",
        ],
      },
      {
        title: "Pendant la séance",
        points: [
          "Chrono géant à la couleur de la zone visée, bleu pendant les récups, et le bloc suivant toujours affiché.",
          "Un bloc en distance se termine au bouton (« 400 m fait »), comme le bouton tour d'une montre ; les départs fixes partent à l'heure.",
          "Pause, « Passer » et « Terminer » à portée de pouce ; à la fin, la durée réelle est reprise dans la notation.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-direction-peps",
    date: "2026-11-14",
    kind: "feature",
    title: "Un style plus net, partout",
    summary: "Les écrans coach et athlète passent au style « peps » : couleurs franches en aplat, plus de halos ni de dégradés.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Cartes, alertes et séances prennent la couleur de leur type en aplat léger, sans halo lumineux.",
          "Un seul bouton principal or par écran ; les autres boutons ont un contour fin et un texte blanc.",
          "Les libellés discrets sont un peu plus clairs, donc plus faciles à lire.",
          "Les graphiques à 5 zones de fréquence cardiaque vont maintenant du vert au rouge.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-comptes-pre-crees-6-mois",
    date: "2026-11-14",
    kind: "feature",
    title: "Athlètes créés par toi et jamais activés : supprimés après 6 mois sans séance",
    summary: "Pour ne pas garder des données sans raison (RGPD), un athlète que tu as créé toi-même et qui n'a jamais activé son compte est supprimé au bout de 6 mois, seulement si aucune séance ne lui a été programmée ou modifiée pendant ces 6 mois.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Tu programmes encore pour un athlète sans application ? Rien ne change : chaque séance créée ou modifiée repousse l'échéance de 6 mois.",
          "Un athlète que tu as créé puis oublié disparaît de ta liste après 6 mois sans séance, avec ses données.",
          "Les comptes que tes athlètes ont activés ne sont pas concernés par cette règle.",
        ],
      },
    ],
  },
  {
    id: "2026-11-14-date-de-naissance-anciens-comptes",
    date: "2026-11-14",
    kind: "feature",
    title: "Date de naissance demandée aux comptes qui n'en ont pas",
    summary: "Les comptes créés avant le contrôle d'âge saisissent leur date de naissance au prochain lancement, une seule fois. Elle permet de réserver les analyses par intelligence artificielle aux 18 ans et plus, comme l'exigent Google (Gemini) et Anthropic (Claude).",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Un écran court demande la date de naissance avant d'ouvrir l'app, à toi comme à tes athlètes. Il ne revient plus une fois la date enregistrée.",
          "Tant qu'un athlète n'a pas donné sa date, l'accord pour l'intelligence artificielle ne lui est pas proposé ; le reste de l'app fonctionne normalement.",
          "Un athlète de moins de 18 ans qui avait accepté l'IA voit cet accord retiré automatiquement à la saisie de sa date.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-nouveautes-relookees",
    date: "2026-11-13",
    kind: "fix",
    title: "Page Nouveautés plus lisible",
    summary: "Les nouveautés non vues ressortent mieux et « J'ai vu » ne prend plus toute l'attention.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Chaque nouveauté non vue porte une pastille « Non vue » et un contour doré.",
          "Les points de détail sont listés plus clairement, avec une puce par point.",
          "Un professionnel qui ouvre un lien d'invitation expiré peut maintenant se connecter directement depuis la page.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-charte-finale-couleurs",
    date: "2026-11-13",
    kind: "fix",
    title: "Couleurs et boutons harmonisés",
    summary: "Menus, fenêtres et listes déroulantes prennent exactement l'or et les fonds du reste de l'app. Les boutons de suppression sont désormais bordés de rouge au lieu d'être pleins, comme partout ailleurs.",
    sections: [],
  },
  {
    id: "2026-11-13-ecrans-alignes-maquettes",
    date: "2026-11-13",
    kind: "feature",
    title: "Santé, HYROX, Paramètres : les écrans suivent les nouvelles maquettes",
    summary: "Plusieurs pages ont été complétées pour coller aux maquettes : santé de l'athlète plus complète, analyse de course HYROX plus détaillée, Paramètres et Avis athlètes plus lisibles.",
    sections: [
      {
        title: "Santé d'un athlète",
        points: [
          "Retours › Santé ajoute « Wellness déclaré » (la note du jour, les réponses qui contredisent la montre) et « Ressenti et mesuré » sur 28 jours, en sommeil, énergie ou sérénité.",
          "Sur téléphone, « Détails sur 28 jours » ouvre directement la mesure qui sort de la normale.",
        ],
      },
      {
        title: "HYROX",
        points: [
          "Analyse d'une course : fil d'Ariane, position course et stations, cadence qui chute, tableau des segments avec la position et le coût sur le run suivant.",
          "Onglet Gains : une cascade montre le chrono actuel, ce que chaque station peut faire gagner, et le chrono possible.",
          "Bilan : la part du temps en course, stations et Roxzone par course, et la position de l'athlète station par station.",
        ],
      },
      {
        title: "Ailleurs",
        points: [
          "Paramètres : « Données et confidentialité » ouvert, export en un clic, zone de suppression du compte clairement signalée, date de dernière utilisation de ta clé d'assistant IA.",
          "Avis athlètes : initiales, page concernée en clair, compteur de nouveaux retours.",
          "Éditeur de séance énergétique : la VMA et les seuils de l'athlète utilisés pour l'estimation s'affichent sous le profil.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-mot-de-passe-8-caracteres",
    date: "2026-11-13",
    kind: "fix",
    title: "Mot de passe : 8 caractères minimum",
    summary: "Pour les nouveaux comptes et les changements de mot de passe, il faut désormais 8 caractères au lieu de 6. Les mots de passe déjà choisis restent valables.",
    sections: [],
  },
  {
    id: "2026-11-13-blessures-sans-soins",
    date: "2026-11-13",
    kind: "feature",
    title: "Blessures : Agon garde le sportif, pas le médical",
    summary: "La section « Antécédents médicaux » devient « Blessures ». On y suit la blessure sportive (zone, douleur, impact sur l'entraînement, arrêt, retour, notes) ; diagnostic, traitement, antécédents et documents médicaux ne sont plus enregistrés dans Agon.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Chaque blessure garde sa zone, sa date, son statut, son détail (type, mécanisme, contexte, douleur, impact, jours d'arrêt, retour prévu) et ses notes.",
          "Les champs « Diagnostic du médecin », « Traitement », « Vu par », les allergies et traitements en cours, et l'ajout de photos ou PDF médicaux sont retirés.",
          "Les quelques diagnostics et traitements déjà saisis ont été recopiés dans les notes de la blessure concernée : rien n'est perdu.",
          "Pourquoi : ces informations relèvent du soin et imposent un hébergement médical certifié. Le suivi médical reste chez le médecin ou le kiné de l'athlète.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-banque-grille-exercices",
    date: "2026-11-13",
    kind: "feature",
    title: "Banque : nouvelle grille d'exercices",
    summary: "La banque d'exercices s'affiche en grande grille sur ordinateur, avec la couleur du type sur chaque carte.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Jusqu'à 4 exercices par ligne sur ordinateur, avec l'aperçu vidéo et « Voir la vidéo ».",
          "Chaque carte montre « Officiel » ou « Communauté », le type d'exercice (clic pour le changer), le muscle principal et le matériel.",
          "Une légende des types en haut de la grille.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-affichage-ordi-corrige",
    date: "2026-11-13",
    kind: "fix",
    title: "Affichage ordinateur : petites corrections",
    summary: "Planning, Retours, Wellness, Profil sportif et Fiches s'affichent plus proprement sur ordinateur.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Planning en semaine : le type de séance n'est plus coupé, une coche verte indique une séance réalisée.",
          "Retours : les chiffres de la semaine occupent toute la largeur.",
          "Wellness : la période affichée suit le choix 7 j / 28 j / 3 mois.",
          "Profil sportif : le titre n'apparaît plus deux fois.",
          "Fiches : 3 fiches par ligne, titres moins coupés.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-droits-seances-resserres",
    date: "2026-11-13",
    kind: "fix",
    title: "Séances : droits d'écriture resserrés",
    summary: "Une séance énergie destinée à un athlète ne peut être créée que par son coach (référent ou co-coach), et une séance de votre banque reste à votre nom. Un athlète ne peut plus supprimer lui-même une séance de son programme.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Une séance énergie se crée dans votre banque, pour vous-même, ou pour un athlète que vous suivez (référent ou co-coach) : plus pour l'athlète d'un autre coach.",
          "Vos athlètes voient, remplissent et valident leurs séances comme avant ; seule la suppression leur est retirée. Vous gardez la main pour supprimer depuis le planning.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-documents-legaux-revus",
    date: "2026-11-13",
    kind: "feature",
    title: "Conditions d'utilisation et confidentialité revues",
    summary: "Les conditions d'utilisation et la politique de confidentialité ont été relues en entier. À votre prochaine connexion, vous et vos athlètes serez invités à accepter la nouvelle version.",
    sections: [
      {
        title: "Ce qui change pour vous",
        points: [
          "Vos engagements de coach sont écrits noir sur blanc : les données de vos athlètes servent seulement à les accompagner, restent confidentielles et ne sortent pas d'Agon sans leur accord.",
          "Si vous créez le compte d'un athlète avant sa première connexion, prévenez-le et n'y saisissez que le nécessaire.",
          "Les analyses par intelligence artificielle sont réservées aux athlètes de 18 ans et plus : l'accord n'est plus proposé aux 15-17 ans.",
          "Les professionnels de santé de votre staff ne doivent pas déposer de documents issus de leurs soins (comptes rendus, ordonnances) : Agon n'est pas un dossier patient.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-banque-ordi",
    date: "2026-11-13",
    kind: "feature",
    title: "Banque : onglets aux couleurs des types",
    summary: "Dans la Banque, les onglets Musculaire, Énergétique et Spécifique reprennent les couleurs de la Programmation, et les sous-onglets (Exercices, Méthodes, Blocs, Séances) deviennent des pastilles.",
    sections: [],
  },
  {
    id: "2026-11-13-fiches-ordi",
    date: "2026-11-13",
    kind: "feature",
    title: "Fiches : rubriques numérotées",
    summary: "Vos fiches sont rangées en rubriques numérotées par catégorie, avec une pastille verte pour celles en libre-service.",
    sections: [],
  },
  {
    id: "2026-11-13-tests-ordi",
    date: "2026-11-13",
    kind: "feature",
    title: "Banque de tests : rubriques numérotées",
    summary: "La banque de tests est rangée en rubriques numérotées par catégorie (bilan articulaire, endurance, force…), vos tests personnalisés à la fin.",
    sections: [],
  },
  {
    id: "2026-11-13-wellness-nuit-montre",
    date: "2026-11-13",
    kind: "feature",
    title: "Wellness : la nuit vient de la montre",
    summary: "Si l'athlète a relié une montre qui mesure son sommeil, le wellness du matin affiche sa nuit (durée, coucher, réveil, modèle de la montre) au lieu de lui demander ses heures. Il peut toujours corriger à la main.",
    sections: [],
  },
  {
    id: "2026-11-13-retours-ordi",
    date: "2026-11-13",
    kind: "feature",
    title: "Retours : rubriques numérotées",
    summary: "Sous le calendrier des Retours, les rubriques sont numérotées comme sur les autres pages : modifications du planning par l'athlète, séries par muscle, blessures.",
    sections: [],
  },
  {
    id: "2026-11-13-analyse-course-hyrox",
    date: "2026-11-13",
    kind: "feature",
    title: "Analyse de course HYROX : le résultat officiel croisé avec la montre",
    summary: "Dans HYROX › Courses, ouvrez une course puis « Analyse de course ». Les temps officiels sont placés sur une frise, avec la fréquence cardiaque et la cadence de la montre si l'athlète a enregistré la course. Même écran pour vous et pour l'athlète.",
    sections: [
      {
        title: "Ce que vous y trouvez",
        points: [
          "Course : la frise des 17 segments avec la FC, jusqu'à 3 constats chiffrés, et ce que dit la montre (course compromise après chaque station, dérive cardiaque, récupération en Roxzone, temps au-dessus de SV2).",
          "Runs : l'allure de chaque km comparée au run 1, avec la station juste avant, pour voir laquelle coûte le plus.",
          "Gains : combien de temps l'athlète gagnerait en revenant à la médiane de son niveau, station par station.",
          "Partager : une image prête pour les réseaux (chrono, record, rang, stations, « Coaché par »), fond sombre ou clair, FC masquable. Elle est créée sur le téléphone, rien n'est envoyé.",
          "Les constats sont des règles calculées par Agon, sans IA. Sans montre ce jour-là, seuls les temps sont analysés.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-programmation-ordi",
    date: "2026-11-13",
    kind: "feature",
    title: "Programmation : nouveau look sur ordinateur",
    summary: "La page Programmation d'un athlète reprend le style des autres pages.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Le cycle en cours s'affiche dans un bandeau doré avec la semaine en cours.",
          "Les onglets Musculation, Énergétique et Spécifique ont chacun leur couleur.",
          "Les cartes de séance sont plus lisibles : jour et code de la séance en pastilles, la séance ouverte ressort en doré.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-logo-agon",
    date: "2026-11-13",
    kind: "fix",
    title: "Le vrai logo Agon à la connexion",
    summary: "Sur la page de connexion, le premier lancement et les pages légales, le logo s'affichait comme un simple cercle doré. C'est maintenant le symbole Agon.",
    sections: [],
  },
  {
    id: "2026-11-13-athletes-ordi",
    date: "2026-11-13",
    kind: "feature",
    title: "Liste des athlètes rafraîchie",
    summary: "La page Athlètes prend le style des autres pages sur ordinateur.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Votre code coach est mis en avant en haut de page, avec un bouton pour le copier.",
          "Chaque athlète a sa carte : « 2 coachs » ou « Co-coach » en pastille, et les athlètes en attente de première connexion ressortent en orange avec le lien à leur envoyer.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-editeur-energie-cartes",
    date: "2026-11-13",
    kind: "feature",
    title: "Séance d'énergie : des blocs en cartes",
    summary: "L'éditeur de séance d'énergie se remplit bloc par bloc, et s'enregistre directement au bon jour.",
    sections: [
      {
        title: "Les blocs",
        points: [
          "Ajoutez un échauffement, des intervalles, une récup ou un retour au calme : chaque bloc est une carte que vous dépliez pour régler répétitions, effort (durée ou distance), cible (allure, FC, zone ou watts) et récup entre les répétitions.",
          "Glissez une carte pour changer l'ordre, dupliquez-la ou supprimez-la d'un clic.",
          "Les séances déjà créées s'ouvrent telles quelles. Un bloc plus complexe (groupe dans un groupe, départ fixe) s'ouvre dans l'éditeur détaillé.",
        ],
      },
      {
        title: "Enregistrer",
        points: [
          "Choisissez la date directement dans l'éditeur : la séance arrive au planning de l'athlète.",
          "« Garder aussi une copie dans ma banque » pour la réutiliser avec d'autres athlètes, ou « Ma banque seulement » pour la programmer plus tard.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-tuto-import-strava",
    date: "2026-11-13",
    kind: "feature",
    title: "Vos athlètes importent eux-mêmes leur historique Strava",
    summary: "Dans Profil › Montres et données, le tutoriel « Importer mon historique Strava » a une nouvelle vidéo de 30 secondes et des étapes simples : demander l'archive sur Strava, la télécharger depuis l'e-mail, la décompresser, puis glisser le dossier dans la zone d'import. Plus besoin de vous transférer l'e-mail de Strava.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "L'athlète fait tout depuis un ordinateur, en 5 étapes, et ses sorties arrivent directement dans son historique.",
          "Conseil donné dans le tuto : glisser le dossier plutôt que le choisir, l'ordinateur ne sélectionnant pas toujours tous les fichiers.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-seance-hyrox-coach",
    date: "2026-11-13",
    kind: "feature",
    title: "Séance HYROX : revenir à la proposition d'Agon",
    summary: "Sur l'onglet Séance d'une simulation HYROX, vous pouvez repartir du découpage proposé par Agon à tout moment.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "« Revenir à la proposition d'Agon » à côté de « Modifier les tours » : le découpage d'Agon s'ouvre en modification, rien n'est enregistré tant que vous ne cliquez pas sur « Enregistrer ».",
          "Le graphique indique combien de tours sont posés et s'ils l'ont été automatiquement.",
          "En zoom sur un tour, la mini-courbe dessous montre où se situe le tour dans la séance.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-import-export-garmin",
    date: "2026-11-13",
    kind: "feature",
    title: "Historique Garmin d'avant la connexion",
    summary: "L'archive d'export du compte Garmin se dépose comme l'archive Strava : toutes les sorties passées entrent dans Agon.",
    sections: [
      {
        title: "Comment faire",
        points: [
          "L'athlète demande l'export de ses données sur son compte Garmin (Gestion des données → Exporter vos données) et reçoit un zip par e-mail.",
          "Il le dépose dans Montres › Importer mes fichiers, ou toi depuis sa fiche : les sorties sont lues sur l'appareil, rien n'est envoyé.",
          "Une sortie déjà reçue par la connexion Garmin est complétée, jamais dupliquée, et reste attribuée à sa montre Garmin.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-sante-modele-montre",
    date: "2026-11-13",
    kind: "fix",
    title: "Santé : le modèle de la montre est indiqué",
    summary: "Les mesures de la nuit (sommeil, VFC, Body Battery…) disent maintenant de quelle montre elles viennent.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Dans Retours › Santé, « Mesuré par la montre » devient « Mesuré par Garmin Forerunner 265 » (le modèle de l'athlète).",
          "Même chose sur la page Santé de l'athlète : chaque mesure porte le nom de la montre qui l'a prise.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-wellness-coach",
    date: "2026-11-13",
    kind: "feature",
    title: "Retours : un onglet Wellness complet",
    summary: "Dans les Retours d'un athlète, l'onglet Wellness résume la forme du jour en une page, puis détaille ce qui l'explique.",
    sections: [
      {
        title: "Vue d'ensemble",
        points: [
          "Le feu du matin avec sa phrase, puis quatre tuiles : VFC de nuit, FC de repos, ressenti sur 7 jours et courbatures.",
          "« Ce matin » : les réponses du jour (récupération, sommeil, sérénité, énergie, fraîcheur, envie, douleur, malade).",
        ],
      },
      {
        title: "Détails",
        points: [
          "Les critères du feu cochés un par un, et ce qu'il manque pour passer au rouge.",
          "Les courbes de VFC et de FC de repos avec la zone habituelle de l'athlète.",
          "Une grille des 6 questions jour par jour, avec les jours sous l'habitude entourés.",
          "Les alertes, les courbatures après chaque séance et la carte des zones sur 7 jours.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-import-fichiers-caches-mac",
    date: "2026-11-13",
    kind: "fix",
    title: "Import d'historique : plus de fausses erreurs sur Mac",
    summary: "En important un dossier d'activités copié depuis un Mac (archive Strava dézippée, disque externe), des centaines d'erreurs « contenu compressé illisible » s'affichaient sur des fichiers commençant par « ._ ». Ce sont des fichiers cachés créés par macOS, pas des activités : ils sont maintenant ignorés sans bruit.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Les fichiers « ._… », « .DS_Store » et le dossier « __MACOSX » ne sont plus lus ni comptés comme erreurs.",
          "Vos vraies activités étaient déjà importées correctement : rien à refaire.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-seance-retour-commentaires-tours",
    date: "2026-11-13",
    kind: "feature",
    title: "Séance de montre : l'athlète corrige son retour et commente ses tours HYROX",
    summary: "Sur l'onglet Séance d'une activité, l'athlète peut modifier sa difficulté ressentie et son commentaire, et laisser un mot sur un tour HYROX ; vous le voyez à une bulle dorée.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "« Modifier mon retour » sous le retour de l'athlète : difficulté de 1 à 10 et commentaire, comme en fin de séance.",
          "Tableau des tours HYROX : une bulle par tour. Dorée, elle contient le commentaire de l'athlète (passez la souris ou cliquez pour le lire).",
          "Les stations s'appellent « Sled push 1 », « Wall balls 2 »… : la distance reste dans la colonne Prévu.",
          "Minuteur EMOM : « Ensuite » annonce le repos jusqu'à la minute suivante au lieu d'une durée fixe.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-planning-semaine",
    date: "2026-11-13",
    kind: "feature",
    title: "Planning : la semaine en pleine largeur",
    summary: "À l'ordinateur, le planning s'ouvre sur la semaine : sept grandes colonnes, la banque de séances en bandeau au-dessus, et la charge de la semaine juste en dessous.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Chaque jour est une colonne haute avec ses séances en cartes : musculation, énergie, spécifique, test, compétition.",
          "La banque passe en bandeau : choisissez Musculation, Énergie, Spécifique ou Tests, faites défiler les cartes et glissez-en une sur un jour.",
          "Sous la semaine : séances, volume de course, zones et charge, avec le rapport aigu / chronique.",
          "Le mois reste disponible dans l'onglet « Mois », et c'est toujours la vue par défaut au téléphone.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-editeur-energie-ordi",
    date: "2026-11-13",
    kind: "feature",
    title: "Éditeur de séance d'énergie remis en page",
    summary: "À l'ordinateur, l'éditeur de séance d'énergie suit maintenant trois temps : le profil de la séance en haut, les blocs au centre, l'enregistrement à droite.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Le sport (course, vélo, natation, rameur…) se choisit d'un clic dans la carte du titre.",
          "En haut, la durée et la distance estimées avec le profil de la séance, mis à jour à chaque bloc.",
          "À droite, la consigne pour l'athlète et les boutons d'enregistrement restent visibles pendant que vous construisez les blocs.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-profil-sportif-ordi",
    date: "2026-11-13",
    kind: "feature",
    title: "Profil sportif : seuils et références en un coup d'œil",
    summary: "Le profil sportif d'un athlète s'ouvre sur ses seuils (fréquences cardiaques, seuils de zones), puis ses zones et un tableau de références avec la date et l'origine de chaque valeur.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "En haut, les seuils clés en grand : FC max, FC seuil, FC de repos et les deux seuils de ses zones.",
          "Les références (VMA, vitesse critique, FTP…) sont rangées en tableau : valeur, date, et si elle vient d'un test, de vous ou de l'athlète.",
          "Un crayon sur chaque ligne pour corriger une valeur sans changer de page.",
          "Biométrie, records et profils par catégorie restent plus bas, comme avant.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-staff-ordi",
    date: "2026-11-13",
    kind: "feature",
    title: "Coachs & staff : nouvelle page à l'ordinateur",
    summary: "La page Coachs & staff d'un athlète est plus claire : coachs, professionnels, droits et invitations sont réunis et se règlent sans quitter la page.",
    sections: [
      {
        title: "Pour vous",
        points: [
          "Chaque professionnel a sa carte : métier, date d'ajout et ce qu'il peut écrire ou seulement consulter.",
          "Régler les droits ouvre une grille sur deux colonnes ; les lignes changées sont signalées avant d'enregistrer.",
          "Retirer un accès demande une confirmation et rappelle que ce qu'il a créé reste dans votre banque.",
          "Les invitations en attente montrent leur date d'expiration et se copient en un clic.",
        ],
      },
      {
        title: "Pour le professionnel invité",
        points: [
          "La page d'invitation affiche ce qu'il pourra faire avant de créer son compte, et jusqu'à quand le lien est valable.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-suppression-photos-seances",
    date: "2026-11-13",
    kind: "fix",
    title: "Suppression de compte : les photos des séances partent aussi",
    summary: "Quand un compte est supprimé, les photos d'exercices qu'il avait ajoutées aux séances d'énergie sont maintenant effacées.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Les photos ajoutées dans l'éditeur de séances d'énergie sont effacées avec le compte de leur auteur.",
          "Une photo encore utilisée par une séance qui reste (bibliothèque, séance d'un autre athlète) est gardée, pour ne pas casser cette séance.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-telephone-energie-corrections",
    date: "2026-11-13",
    kind: "fix",
    title: "Séances d'énergie sur téléphone et charges à virgule",
    summary: "La banque énergétique et l'éditeur de séance d'énergie ne dépassent plus de l'écran du téléphone.",
    sections: [
      {
        title: "Ce qui est corrigé",
        points: [
          "Banque énergétique et création d'une séance d'énergie : les boutons passent à la ligne au lieu de sortir de l'écran.",
          "Les charges s'écrivent avec une virgule (« 27,5 kg ») dans le résumé des séances, côté staff et athlète.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-athlete-emom-minuteur",
    date: "2026-11-13",
    kind: "feature",
    title: "Séance spécifique : le minuteur gère l'EMOM",
    summary: "Quand un bloc a un départ fixe (« départ toutes les 1:00 »), le minuteur de l'athlète affiche « Minute 7 / 12 » et décompte la minute : ses exercices faits, il récupère jusqu'à la minute suivante, qui part toute seule.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "En haut du minuteur : « EMOM · 12 min » et la minute en cours.",
          "L'athlète tape « Fait » quand ses répétitions sont faites : le reste de la minute devient sa récup.",
          "S'il n'a pas fini à temps, la minute suivante démarre quand même, comme en salle.",
          "Départ toutes les 2:00 ou autre : même principe, affiché « Départ 3 / 10 ».",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-athlete-indispo-semaine",
    date: "2026-11-13",
    kind: "feature",
    title: "Semaine de l'athlète : indisponibilités et compétitions sur plusieurs jours",
    summary: "Dans le Programme de l'athlète, ses vacances, stages ou examens apparaissent sur chaque jour concerné, marqués « Indisponible » quand il ne peut pas s'entraîner. Une compétition sur plusieurs jours s'affiche sur chacun d'eux.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Un événement saisi avec « Je ne peux pas m'entraîner » est hachuré « Indisponible » ; sinon il s'affiche simplement.",
          "Sur ordinateur, « Déplacer » ouvre un petit panneau à côté de la séance au lieu d'un volet en bas d'écran.",
          "Premier lancement : chaque bulle d'aide pointe ce qu'elle explique (séance du jour, onglet Programme, onglet Tests).",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-activite-libre-hors-ligne",
    date: "2026-11-13",
    kind: "fix",
    title: "Activités libres gardées sans réseau",
    summary: "Une activité libre (footing, vélo…) ajoutée par un athlète sans réseau n'est plus perdue : elle part toute seule au retour du réseau.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Avant, l'athlète voyait « Sauvegarde échouée » et l'activité disparaissait au prochain chargement.",
          "Maintenant, comme pour le wellness ou la pesée, l'activité est gardée sur le téléphone et vous arrive dès que le réseau revient.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-coach-telephone-fiches-banque",
    date: "2026-11-13",
    kind: "feature",
    title: "Fiches et banque d'exercices sur téléphone",
    summary: "Depuis « Plus » sur votre téléphone : lisez et partagez vos fiches, et retrouvez un exercice de la banque pour montrer sa vidéo à un athlète.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Fiches : rangées par catégorie, avec recherche. Vous voyez à qui chaque fiche est partagée et si elle a été lue.",
          "Partagez une fiche à un ou plusieurs athlètes en une fois, avec un mot facultatif. Ceux qui l'ont déjà sont grisés.",
          "Banque d'exercices en lecture : recherche, type, muscle, équipement, niveau ; chaque exercice montre sa vidéo, ses consignes et ses muscles.",
          "Les reviews de la semaine sont aussi accessibles depuis « Plus » et l'onglet « Review » de chaque athlète.",
          "Importer ou modifier une fiche ou un exercice reste sur ordinateur.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-coach-telephone",
    date: "2026-11-13",
    kind: "feature",
    title: "L'espace coach sur téléphone",
    summary: "Sur téléphone, l'espace coach a maintenant ses propres écrans : l'essentiel de la journée, vos athlètes et leur suivi, à une main. Sur ordinateur, rien ne change.",
    sections: [
      {
        title: "Ce que vous trouvez sur téléphone",
        points: [
          "Accueil : ce qui est à traiter, les séances d'hier faites ou non avec les retours, celles du jour et les prochaines compétitions.",
          "Athlètes : recherche, filtres Alerte et Compétition, ajout d'un athlète et partage de votre code coach.",
          "Fiche d'un athlète : planning de la semaine, programmation, retours, wellness, santé (montre) et tests.",
          "Planning : touchez une séance pour la déplacer, la dupliquer, la passer en repos, la retirer ou la modifier.",
          "Modifier une séance : séries, répétitions, charge, RIR, tempo et repos, pour ce jour seulement ou à partir de cette séance.",
          "Tests : saisissez un résultat ou faites passer un test prévu depuis votre téléphone.",
          "Plus : nouveautés, outils, paramètres et mode athlète.",
        ],
      },
      {
        title: "Restent sur ordinateur",
        points: [
          "Les banques, l'import de texte, la gestion des co-coachs et le détail des retours séance par séance.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-weekly-review",
    date: "2026-11-13",
    kind: "feature",
    title: "Weekly review : le bilan de la semaine de chaque athlète",
    summary: "Chaque dimanche, l'athlète fait le point sur sa semaine depuis son téléphone. Le lundi, tu lis toutes les reviews sur une seule page et tu réponds.",
    sections: [
      {
        title: "Côté athlète",
        points: [
          "Ouverte du dimanche matin au lundi soir, avec un rappel sur l'accueil.",
          "Le bilan se remplit tout seul : séances faites sur prévues, durée, distance, RPE moyen, séance la plus dure et moyenne du wellness.",
          "L'athlète note sa semaine de 1 à 5 (note, énergie, motivation, charge de vie, nutrition), dit s'il a tenu ses engagements, répond à 3 questions et prend 3 engagements pour la semaine suivante.",
          "Si son feu est orange ou rouge, on lui demande aussi sa douleur (zone et niveau de 0 à 10).",
          "Sa review est enregistrée au fur et à mesure : il peut s'arrêter et reprendre plus tard.",
        ],
      },
      {
        title: "Côté coach",
        points: [
          "Menu « Reviews » : une ligne par athlète (reçue, en attente, non faite), avec le feu, la note, les séances et la douleur.",
          "Onglet « Review » de l'athlète : sa review complète et ta réponse, qui reste ton retour de la semaine, visible sur son accueil.",
          "Le co-coach voit la même chose. Un membre du staff avec l'accès « bien-être » la lit, sans pouvoir la modifier.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-retirer-activite-montre",
    date: "2026-11-13",
    kind: "feature",
    title: "Retirer une activité de montre supprimée",
    summary: "Une sortie supprimée dans Garmin Connect ou COROS restait dans Agon. Vous pouvez maintenant la retirer depuis la liste des sorties de l'athlète.",
    sections: [
      {
        title: "Comment faire",
        points: [
          "Ouvrez la sortie dans la liste des activités, puis « Retirer d'Agon » et confirmez. L'athlète peut le faire aussi.",
          "La courbe, les tours et les zones partent avec elle. La séance prévue à laquelle elle était rattachée reste, avec ce que l'athlète y a saisi.",
          "Une séance enregistrée dans Agon ne peut pas être retirée de cette façon.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-coach-retours-sante",
    date: "2026-11-13",
    kind: "feature",
    title: "Retours › Santé : le ressenti face à la montre",
    summary: "Dans Retours, l'onglet Santé met face à face ce que l'athlète déclare le matin (sommeil, énergie, sérénité) et ce que mesure sa montre, puis toutes les mesures de la nuit.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "« Écart » quand l'athlète se dit en forme alors que sa montre mesure nettement moins bien que d'habitude (ou l'inverse) ; « Cohérent » sinon.",
          "En dessous, les mesures de la montre (sommeil, VFC, FC de repos, stress…) sur le jour, 7 ou 28 jours, comparées à sa propre moyenne.",
          "Rien ne s'affiche si l'athlète n'a pas de montre reliée ou n'a pas rempli son wellness.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-coach-parametres-mode-athlete",
    date: "2026-11-13",
    kind: "feature",
    title: "Paramètres : activez ou coupez le mode coach-athlète",
    summary: "Dans Paramètres, l'interrupteur « Je m'entraîne aussi » vous ajoute à votre liste d'athlètes et ouvre votre propre espace athlète. Coupé, vous restez uniquement coach et vos séances passées sont gardées.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Sur ordinateur, la page Paramètres passe sur 2 colonnes : profil, code, point hebdo et mode à gauche ; assistant IA et données à droite.",
          "Couper le mode vous retire aussi de la liste d'un autre coach qui vous suivait.",
          "Pour vos professionnels (kiné, nutri…) : leur accueil liste leurs athlètes avec leurs droits et une colonne « À surveiller » (blessures en cours) ; sur la fiche d'un athlète, leurs accès restent affichés à droite.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-photos-privees",
    date: "2026-11-13",
    kind: "fix",
    title: "Photos de mensurations : accès protégé",
    summary: "Les photos du corps déposées avec les mensurations ne sont plus accessibles par un simple lien : seuls l'athlète et son coach les ouvrent, par un lien temporaire.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Les photos de mensurations s'ouvrent par un lien valable 10 minutes, réservé à l'athlète et à son coach (référent ou co-coach).",
          "Vous pouvez maintenant déposer ou remplacer les photos de mensurations de vos athlètes.",
          "Les images d'illustration des séances énergie sont rangées à part ; celles déjà posées s'affichent comme avant.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-confidentialite-v2026-11-13",
    date: "2026-11-13",
    kind: "feature",
    title: "Politique de confidentialité et CGU mises à jour",
    summary: "La politique de confidentialité liste maintenant toutes les données que l'app garde. Vos athlètes et vous serez invités à accepter à nouveau l'accord sur les données de santé à votre prochaine connexion.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Nouvelles données nommées : envie, douleur et maladie du matin, bilan hebdomadaire, photos du corps, masse grasse, tests et HYROX, habitudes, données détaillées des montres (stress, SpO2, Body Battery…) et copie intégrale des données Garmin.",
          "Ce qui ne part jamais vers une IA est écrit noir sur blanc : montres, photos, douleur, maladie, bilan hebdomadaire, feu du matin, charge.",
          "Durée des sauvegardes (30 jours au plus) et sort de l'historique des accords à la suppression d'un compte.",
          "CGU : co-coach et staff, assistant IA du coach, indicateurs présentés comme des repères et non un diagnostic.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-feu-du-matin",
    date: "2026-11-13",
    kind: "feature",
    title: "Feu du matin : vert, orange ou rouge, calculé",
    summary: "Chaque matin, un feu résume l'état de l'athlète à partir de sa VFC et de sa FC de repos (montre), de ses ressentis et de sa charge des 7 derniers jours, toujours comparés à ses propres habitudes.",
    sections: [
      {
        title: "Comment il se décide",
        points: [
          "Orange dès qu'un signal apparaît : charge des 7 jours plus de 10 % au-dessus du prévu, km +7 %, sortie non prévue au-dessus du plafond, monotonie au-dessus de 2, VFC sous sa zone habituelle, FC de repos au-dessus de l'habitude, 2 ressentis nettement bas, douleur au-dessus de 3/10.",
          "Rouge quand la charge monte et que la VFC est sous la zone, avec au moins 2 signes parmi : FC de repos haute, wellness sous l'habitude, envie à 2/5 ou moins, sommeil en baisse. Rouge aussi si l'athlète se dit malade.",
          "VFC : moyenne des 7 dernières nuits (5 au moins), zone habituelle = moyenne ± 0,5 écart-type des 4 semaines d'avant. L'alerte VFC s'active au 14e jour de mesure.",
          "Une seule marque de montre à la fois : après un changement de montre, l'habitude repart de zéro. Les scores des marques (Body Battery, readiness…) ne comptent jamais, et ces données ne passent par aucune IA.",
          "Sans montre, le feu ne passe au rouge que si l'athlète est malade.",
        ],
      },
      {
        title: "Où le voir",
        points: [
          "Retours d'un athlète : le feu du jour en haut, avec tous les signaux.",
          "L'athlète le voit sur son accueil, sous son score wellness.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-charge-yoxx",
    date: "2026-11-13",
    kind: "feature",
    title: "Charge d'entraînement : points YOXX, prévu face au réalisé",
    summary: "La charge de chaque séance se compte en points (1 point = 1 minute en zone 1), pour la course, les ergos, les séances mixtes et la musculation, prévue et réalisée.",
    sections: [
      {
        title: "Comment c'est compté",
        points: [
          "Course et ergos : minutes en zone 1 × 1, en zone 2 × 2, en zone 3 × 3. Les zones viennent du modèle de zones FC que vous avez fixé à la date de la séance (5 et 7 zones sont ramenées à 3).",
          "En course, un tour plus rapide que le seuil 1 est classé à l'allure : zone 2 jusqu'à la vitesse critique, zone 3 au-delà.",
          "Séances mixtes, spécifiques, HYROX : la FC de toute la séance ; leurs km comptent à part (« compromised »).",
          "Musculation : séries dures selon le RIR (0-1 : 1 · 2-3 : 0,75 · 4-5 : 0,4) et le type d'exercice (bas du corps lourd × 1,5, autre polyarticulaire × 1, isolation × 0,5), × 6.",
          "Sans montre : la séance validée compte comme prévue (au prorata de la durée corrigée).",
        ],
      },
      {
        title: "Où la voir",
        points: [
          "Planning › Mois : sous le calendrier, la semaine en cours : séances, km, zones, charge sur 6 semaines (prévu en pointillé), monotonie, séance la plus coûteuse.",
          "Charge aiguë (7 j) face à la chronique (4 semaines précédentes) et leur ratio, avec la zone 0,8–1,3 : pour le contexte, il ne déclenche aucune alerte.",
          "Planning › Résumé : la charge hebdomadaire de chaque mésocycle passe aux points YOXX, prévus et réalisés.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-vitesse-critique",
    date: "2026-11-13",
    kind: "feature",
    title: "Vitesse critique : une seule, et une proposition tirée des courses",
    summary: "Le profil sportif affiche la vitesse critique retenue (test ou saisie, la plus récente) et en propose une nouvelle à partir des courses de l'athlète.",
    sections: [
      {
        title: "Profil sportif › Vitesse",
        points: [
          "Sous les références : la VC retenue, sa source (test ou saisie) et sa date, avec la vitesse au seuil 1 qui en découle.",
          "Si les meilleurs efforts de 3, 6 et 12 min des courses des 90 derniers jours donnent une VC différente, elle vous est proposée : « Utiliser » l'enregistre, sinon rien ne change.",
          "La même VC sert aux tests HYROX et, bientôt, à la charge d'entraînement (zones 2 et 3).",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-coach-nouveautes-repliees",
    date: "2026-11-13",
    kind: "feature",
    title: "Nouveautés : celles déjà vues se replient",
    summary: "Sur cette page, les nouveautés que vous avez déjà vues n'affichent plus que leur titre. « Voir le détail » les rouvre.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Le titre indique combien de nouveautés restent à voir.",
          "Une nouveauté pas encore vue porte l'étiquette « Non vue » et le bouton « J'ai vu ».",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-athlete-ordi-accueil",
    date: "2026-11-13",
    kind: "feature",
    title: "Athlète sur ordinateur : onglets en haut, accueil sur 3 colonnes",
    summary: "Sur ordinateur, l'app athlète met ses onglets dans la barre du haut et l'accueil range ses rubriques sur 3 colonnes : tout tient sur un écran.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Wellness et retour du coach à gauche, semaine, événements et nutrition au centre, test et compétition à droite.",
          "En dessous : les séances du jour et la tendance de forme.",
          "Programme : la semaine s'affiche en 7 colonnes, une par jour.",
          "Santé : les mesures passent sur 4 colonnes. Profil : les rubriques sur 2 colonnes.",
          "Wellness : tout tient sur une page, les questions et le corps à gauche, la forme du jour, la nuit et la tendance sur 7 ou 28 jours à droite.",
          "Tests : la liste à gauche, le détail du test choisi à droite. Alimentation : objectif, série et poids sur une seule rangée.",
          "Sur téléphone, rien ne change.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-acces-inscription",
    date: "2026-11-13",
    kind: "feature",
    title: "Inscription en 3 étapes, votre nom s'affiche au code",
    summary: "Un athlète qui s'inscrit choisit son rôle, entre votre code coach puis crée son compte. Dès le 6ᵉ caractère du code, il voit « Coach trouvé » avec votre nom avant de confirmer.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Fini les inscriptions chez le mauvais coach : le nom s'affiche avant de valider.",
          "Connexion, mot de passe oublié, nouveau mot de passe, accord sur les données de santé et page introuvable reprennent le style de l'app.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-athlete-seance-en-cours-precedent",
    date: "2026-11-13",
    kind: "feature",
    title: "Athlète : la dernière fois, sous les yeux pendant la séance",
    summary: "Pendant une séance de musculation, la zone de saisie affiche la charge de la dernière fois, l'écart avec aujourd'hui et le RIR que vous avez prescrit.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Au-dessus des boutons charge et reps : « Précédent 115 × 3 · Écart +5 kg · RIR visé 2 ».",
          "Sous le bloc en cours, « À suivre » liste les exercices des blocs suivants ; une tape ouvre le bloc.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-athlete-seance-specifique",
    date: "2026-11-13",
    kind: "feature",
    title: "Athlète : nouveau minuteur des séances spécifiques",
    summary: "Pendant une séance HYROX ou spécifique, l'athlète voit un minuteur plein écran : tour en cours, exercice en cours et le suivant.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Effort en orange, récup en bleu : pendant la récup, le prochain exercice passe au premier plan pour se préparer.",
          "En bas, les exercices du tour : ceux déjà faits sont barrés.",
          "Format classique : l'athlète coche chaque élément, ou tout le bloc d'un coup. Un bloc WOD se lance avec son bouton « Minuteur ».",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-athlete-premier-lancement",
    date: "2026-11-13",
    kind: "feature",
    title: "Athlète : accueil au premier lancement",
    summary: "Un nouvel athlète est accueilli en 3 écrans : à quoi sert Agon, lier sa montre s'il le souhaite, et son premier wellness en 3 tapes.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Montré une seule fois, après l'accord sur les données de santé. « Passer » mène directement à l'accueil.",
          "Ensuite, 3 bulles d'aide sur Aujourd'hui : séance du jour, Programme, Tests.",
          "Vos athlètes déjà inscrits ne voient rien de nouveau.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-athlete-saisie-test",
    date: "2026-11-13",
    kind: "feature",
    title: "Athlète : nouvelle saisie des tests",
    summary: "Votre athlète saisit son résultat sur un écran clair, note son ressenti de 1 à 5, laisse un mot et voit tout de suite s'il bat son record.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Le clavier s'adapte à la valeur : nombre, allure (min ’ s /km), durée (min : s) ou échelle de 1 à 5.",
          "Son record s'affiche sous la case ; s'il le bat, « Nouveau record » en grand avec l'écart.",
          "Il peut corriger la date s'il a fait le test un autre jour : le résultat suit.",
          "Dans le détail du test, chaque résultat montre son ressenti et son commentaire.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-athlete-evenements",
    date: "2026-11-13",
    kind: "feature",
    title: "Athlète : un seul formulaire pour ses événements",
    summary: "Compétition, stage, voyage, examen ou autre : votre athlète ajoute tout au même endroit, et vous le voyez sur son planning.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Compétition : priorité A (tout vise ce jour), B (on allège avant) ou C (rien ne change), lieu et date de fin si elle dure plusieurs jours.",
          "Hors compétition : du / au, lieu, et « Indisponible pour m’entraîner » quand il ne peut pas s’entraîner ces jours-là.",
          "Sur son accueil, « Mes événements » montre aussi ses compétitions, et « Prochaine compétition » annonce la suivante.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-athlete-sante-montre",
    date: "2026-11-13",
    kind: "feature",
    title: "Athlète : page Santé (nuit et récupération de la montre)",
    summary: "Depuis son wellness, votre athlète ouvre « Santé » : sommeil, VFC, FC de repos, stress, Body Battery, SpO2, respiration, chacun comparé à sa propre moyenne.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Une carte par mesure : valeur de la nuit, état Normal / Bas / Haut par rapport à ses 28 derniers jours, courbe sur 7 ou 28 jours.",
          "Toucher une mesure ouvre son détail : plus bas, moyenne, plus haut, nuits de suite hors de la zone habituelle et une explication simple.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-athlete-seuils-montres",
    date: "2026-11-13",
    kind: "feature",
    title: "Athlète : seuils, zones et montres en clair",
    summary: "Dans son Profil, votre athlète voit ses seuils (SV1, SV2, FC max, FC de repos) et une page « Montres et données ».",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "« Mes seuils et mes zones » : qui les a fixés, les 4 seuils, le modèle choisi et une barre de 100 bpm à la FC max.",
          "« Montres et données » : une carte par montre, l'accord de partage et l'import de l'historique (archive Strava ou export Garmin).",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-hyrox-confirmer-seance",
    date: "2026-11-13",
    kind: "feature",
    title: "HYROX : l'athlète confirme sa séance et commente une station",
    summary: "Au téléphone, « Valider » ouvre « C'est bien cette séance » : votre athlète vérifie reps, distances et charges station par station, et peut laisser un mot.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Chaque station montre prévu → fait et la charge ; un écart s'affiche « À corriger ».",
          "Les courses sont résumées en une ligne, les stations conformes au prévu sont repliées quand une autre demande l'attention.",
          "Les commentaires apparaissent sous la station dans le détail des tours, au téléphone comme sur ordinateur.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-wellness-seance-hier",
    date: "2026-11-13",
    kind: "feature",
    title: "Courbatures rattachées à la séance de la veille",
    summary: "Quand votre athlète note des courbatures le matin, l'app lui montre sa séance de la veille et vous dit après quelle séance elles sont apparues.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Dans son wellness, l'athlète voit une carte « Séance d'hier » (nom, exercices, séries, RPE) juste avant son bilan.",
          "Dans le détail d'un jour (Retours), sous les zones du corps : « Après la séance de la veille : … ».",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-seance-hyrox-tours",
    date: "2026-11-13",
    kind: "feature",
    title: "Séance HYROX : tableau des tours allégé, temps saisi à la main sur téléphone",
    summary: "La page d'une séance HYROX va à l'essentiel, et ajuster un tour au téléphone se fait au clavier.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Sous le tableau des tours, seule la ligne Total reste : les sous-totaux Course / Sled push / Wall balls sont retirés.",
          "Au téléphone, « Ajuster les tours » : début, fin et coupe d'un tour se tapent en minutes et secondes.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-seances-sur-la-montre-garmin",
    date: "2026-11-13",
    kind: "feature",
    title: "Les séances partent sur la montre Garmin de l'athlète",
    summary: "Une séance programmée dans Agon arrive dans le calendrier Garmin Connect de l'athlète, puis sur sa montre, avec les allures, zones et charges calculées par Agon.",
    sections: [
      {
        title: "Ce qui part sur la montre",
        points: [
          "Course, vélo, natation, rameur, muscu, HYROX et séances spécifiques des 7 prochains jours, envoyées automatiquement.",
          "Les cibles viennent d'Agon : zones de FC en bpm, % VMA en allure, % FC max en bpm, % FTP en watts, % RM en kg avec le record de l'athlète.",
          "S'il manque une donnée (VMA, 1RM…), la consigne part en texte : aucun chiffre n'est inventé.",
          "HYROX et spécifique : format course, chaque atelier est une étape validée au bouton Tour, avec sa consigne.",
          "Une séance déplacée, modifiée ou supprimée est mise à jour sur la montre. Une séance faite ou commencée n'est jamais retirée.",
        ],
      },
      {
        title: "Côté coach",
        points: [
          "Éditeur de séance énergie : nouveau choix du sport (course par défaut), c'est l'activité lancée sur la montre.",
          "Banque d'exercices › Modifier les caractéristiques : « Équivalent Garmin », proposé depuis le nom de l'exercice, à valider ou corriger. Sans équivalent, la montre affiche le nom Agon.",
        ],
      },
      {
        title: "Côté athlète",
        points: [
          "Profil › Services connectés › Garmin : « Envoyer mes séances sur ma montre », activé par défaut, désactivable à tout moment.",
          "Aujourd'hui : la mention « Sur ta montre » sur chaque séance envoyée.",
          "L'athlète doit avoir autorisé l'import de séances au moment de connecter Garmin ; sinon l'écran lui dit quoi faire.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-athlete-tests-profil-hyrox-look",
    date: "2026-11-13",
    kind: "feature",
    title: "App athlète : Tests, Profil, Alimentation et courses HYROX plus lisibles",
    summary: "Quatre écrans de l'athlète reprennent le nouveau style de l'app, sans rien changer à leurs données.",
    sections: [
      {
        title: "Ce que voit l'athlète",
        points: [
          "Tests : chaque valeur porte le picto de sa dominante, et l'historique se lit comme une frise.",
          "Profil : poids du jour en grand avec les trois dernières pesées ; le tuto Strava s'ouvre d'un toucher.",
          "HYROX › Courses : toutes les courses dans une seule liste, une case à cocher pour en comparer deux.",
          "Alimentation : total du jour en anneau, une barre par macro, et la série en cours à côté du poids.",
        ],
      },
    ],
  },
  {
    id: "2026-11-13-wellness-nouvelle-saisie",
    date: "2026-11-13",
    kind: "feature",
    title: "Wellness du matin : nouvelle saisie",
    summary: "Vos athlètes notent leurs courbatures par zone du corps et indiquent leur envie de s'entraîner, une douleur éventuelle et s'ils sont malades.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Corps : l'athlète touche une zone (ischios, quadriceps, lombaires…) et choisit légère, marquée ou intense. Plus de points à placer à la main.",
          "Nouvelle ligne « Envie de t'entraîner » de 1 à 5. Elle ne change pas le score de forme, qui reste calculé sur les 5 notes habituelles.",
          "Douleur autre que les courbatures de 0 à 10, et « Malade ou fiévreux·se ? ». Une douleur ou une maladie apparaît dans votre rubrique Blessé / malade.",
          "Dans vos Retours, le détail du jour montre les zones notées avec leur intensité, la douleur et l'envie.",
        ],
      },
    ],
  },
  {
    id: "2026-11-12-deplacer-seance-manquee",
    date: "2026-11-12",
    kind: "feature",
    title: "Replacer une séance manquée",
    summary: "Une séance prévue et pas faite peut être replacée à aujourd'hui ou à un jour suivant, par vous ou par l'athlète.",
    sections: [
      {
        title: "Comment",
        points: [
          "Vous : planning → cliquez le jour → « Déplacer » sur la séance manquée, choisissez le nouveau jour. Le glisser-déposer marche aussi.",
          "L'athlète : Programme → menu ⋯ de la séance manquée → choix du jour. Vous voyez le changement dans votre planning.",
          "L'athlète peut aussi « Passer en repos » une séance pas encore commencée : elle est retirée de sa journée.",
          "Une séance réalisée, commencée ou notée ne peut pas être déplacée : rien de ce que l'athlète a saisi n'est perdu.",
          "Le menu de l'athlète ne montre plus la liste « activités importées » : ses sorties de montre et ses fichiers apparaissent dans ses séances et dans votre planning.",
        ],
      },
    ],
  },
  {
    id: "2026-11-12-zones-fc-coach",
    date: "2026-11-12",
    kind: "feature",
    title: "Zones de fréquence cardiaque : 3, 5 ou 7 zones",
    summary: "Vous choisissez le modèle de zones de chaque athlète, il s'applique à toutes ses séances à partir du jour du changement.",
    sections: [
      {
        title: "Où le trouver",
        points: [
          "Fiche de l'athlète → Profil sportif → « Zones de fréquence cardiaque ».",
          "3 zones : vous saisissez SV1 et SV2. 5 zones : les bornes habituelles. 7 zones : bornes proposées depuis la FC max (et la FC repos si connue), ajustables une à une.",
          "Un changement compte à partir d'aujourd'hui : les séances passées gardent leurs zones. « Appliquer aussi aux séances passées » sert à corriger une erreur de saisie.",
          "Les SV1 / SV2 trouvés par un test vous sont proposés : vous les acceptez ou les refusez. L'historique des changements reste consultable.",
          "Vos athlètes voient leurs zones dans Profil → « Mes seuils et zones FC », sans pouvoir les modifier.",
        ],
      },
    ],
  },
  {
    id: "2026-11-12-app-athlete-nouveau-look",
    date: "2026-11-12",
    kind: "feature",
    title: "App athlète : nouveau look sur téléphone",
    summary: "Les pages de vos athlètes prennent le style des nouvelles maquettes : grand titre, date en haut, barre du bas plus nette.",
    sections: [
      {
        title: "Ce qui change pour vos athlètes",
        points: [
          "Chaque page (Aujourd'hui, Programme, Tests, HYROX, Alimentation, Profil) a son propre en-tête avec la date ; le menu reste accessible par la petite icône à côté de la date.",
          "Aujourd'hui : la citation est mise en avant sous « Bonjour », votre retour de la semaine se lit avec quatre réponses en mots (Bien reçu, Motivé, À fond, Merci).",
          "La séance du jour se déplie pour montrer les exercices, puis « Démarrer la séance ». La prochaine compétition affiche le compte à rebours en grand, et la courbe de forme est plus lisible.",
          "Fin de séance : pourcentage réalisé en grand, séries faites / passées, forme de 1 à 5 en couleur, commentaire et kilomètres courus, puis « Terminer ».",
        ],
      },
    ],
  },
  {
    id: "2026-11-12-accueil-coach",
    date: "2026-11-12",
    kind: "feature",
    title: "Accueil plus clair",
    summary: "Votre accueil suit un ordre fixe et numéroté, et une seule nouveauté s'affiche à la fois.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "En haut : la date, « Bonjour », la citation du jour, puis les séances manquées hier et les tests à venir.",
          "Une seule nouveauté à la fois : « J'ai vu » passe à la suivante, et le lien indique combien il en reste.",
          "Les rubriques sont numérotées dans l'ordre (Aujourd'hui, Blessé / malade, À traiter, Alertes wellness…) ; celles qui sont vides disparaissent.",
        ],
      },
    ],
  },
  {
    id: "2026-11-12-fiches-athlete-ordinateur",
    date: "2026-11-12",
    kind: "feature",
    title: "Fiches : lecture à côté de la liste sur ordinateur",
    summary: "Quand un athlète ouvre ses fiches sur ordinateur, la fiche s'affiche à droite de la liste au lieu de prendre tout l'écran.",
    sections: [
      {
        title: "Ce qui change pour l'athlète",
        points: [
          "Programme › Fiches sur ordinateur : la liste à gauche, la fiche ouverte à droite, avec votre note et les commentaires.",
          "Sur téléphone, rien ne change : la fiche s'ouvre en plein écran.",
        ],
      },
    ],
  },
  {
    id: "2026-11-12-hyrox-fiches-athlete",
    date: "2026-11-12",
    kind: "feature",
    title: "HYROX et fiches plus lisibles sur téléphone",
    summary: "Les courses HYROX de vos athlètes s'affichent en cartes sur téléphone, et leurs fiches mettent en avant la dernière que vous avez envoyée.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "HYROX › Courses : sur téléphone, une carte par course avec le chrono, la course, les stations, la Roxzone et le rang. On coche deux cartes pour les comparer. Sur ordinateur, le tableau reste le même.",
          "Programme › Fiches : la fiche nouvelle est en tête avec votre mot et un bouton « Lire la fiche ». La recherche et les filtres par catégorie marchent sur toutes ses fiches.",
          "La bibliothèque en libre accès s'appelle maintenant « Bibliothèque du coach ».",
          "HYROX › Radar : le classement se fait défiler sur le côté au lieu d'être écrasé.",
        ],
      },
    ],
  },
  {
    id: "2026-11-12-tests-athlete-dominante",
    date: "2026-11-12",
    kind: "feature",
    title: "Tests de l'athlète rangés par dominante",
    summary: "Dans l'onglet Tests, vos athlètes retrouvent leurs valeurs rangées par dominante (force, endurance, explosivité, HYROX…), avec l'évolution de chaque test.",
    sections: [
      {
        title: "Ce qui change pour l'athlète",
        points: [
          "Chaque valeur montre le dernier résultat, sa date et l'écart avec le test précédent (vert si c'est mieux).",
          "Toucher une valeur ouvre son détail : dernier résultat, record, progrès depuis le premier test et une courbe où chaque point porte sa valeur et sa date.",
          "Pour la VMA, les allures à 100, 90, 80 et 70 % sont calculées automatiquement.",
        ],
      },
    ],
  },
  {
    id: "2026-11-12-seance-en-cours",
    date: "2026-11-12",
    kind: "feature",
    title: "Séance en cours : un bloc à la fois, saisie au pouce",
    summary: "Pendant la séance, l'athlète voit un seul bloc et saisit chaque série depuis une zone en bas de l'écran, avec la récup qui démarre seule.",
    sections: [
      {
        title: "Ce qui change pour l'athlète",
        points: [
          "Un seul bloc à l'écran ; les flèches passent au bloc précédent ou suivant. « Toute la séance » réaffiche tout, comme avant.",
          "En bas : la série à faire, charge et répétitions déjà remplies avec ce que vous avez prescrit, boutons − / + et un gros bouton « Valider la série ».",
          "Après chaque série validée, il indique combien de répétitions il avait encore en réserve (0 à 4+, au demi près) ; votre consigne est entourée d'or. Il peut passer.",
          "La récup se lance seule, seulement après une série validée, avec un compte à rebours dans la même zone.",
          "En superset, la zone enchaîne exercice 1 puis exercice 2 avant la récup.",
          "La fin de séance montre la part des séries faites, la forme du jour, un mot pour vous et les km courus.",
        ],
      },
    ],
  },
  {
    id: "2026-11-12-programme-athlete-semaine",
    date: "2026-11-12",
    kind: "feature",
    title: "Le Programme de vos athlètes, plus lisible",
    summary: "La semaine se lit jour par jour, chaque séance dans la couleur de son type, et l'athlète peut démarrer la séance du jour en un tap.",
    sections: [
      {
        title: "Ce qui change pour l'athlète",
        points: [
          "En haut, le plan en cours tient sur une carte : son nom, la semaine (S4 / 7) et la part des séances faites.",
          "Sous le titre de la semaine, le compte des séances faites (« 2 / 4 faites »).",
          "Le bouton ⋯ d'une séance ouvre « Déplacer au » avec les deux semaines à venir, puis « Voir le détail ». Vous voyez toujours le changement dans votre planning.",
          "Les cycles terminés sont rangés tout en bas, repliés.",
        ],
      },
    ],
  },
  {
    id: "2026-11-12-wellness-deux-ecrans",
    date: "2026-11-12",
    kind: "feature",
    title: "Le wellness du matin en deux écrans",
    summary: "Vos athlètes remplissent leur wellness plus vite : un écran pour la nuit et les cinq notes, un écran pour le corps, puis le bilan.",
    sections: [
      {
        title: "Ce qui change pour l'athlète",
        points: [
          "Premier écran : heures de coucher et de réveil, puis les cinq notes sur une seule page ; le score de forme s'affiche dès la dernière réponse.",
          "Aucune note n'est cochée d'avance : chaque ligne demande une vraie réponse.",
          "Second écran : courbatures sur la silhouette, blessure ou maladie avec un mot pour vous, poids à jeun.",
          "Les réponses envoyées restent les mêmes : rien ne change de votre côté.",
        ],
      },
    ],
  },
  {
    id: "2026-11-12-accueil-athlete",
    date: "2026-11-12",
    kind: "feature",
    title: "L'accueil de vos athlètes, réorganisé",
    summary: "Sur le téléphone, la journée se lit de haut en bas : wellness, votre retour, la semaine et le thème du jour, ses événements, la nutrition, puis les séances.",
    sections: [
      {
        title: "Ce qui change pour l'athlète",
        points: [
          "Le wellness du matin tient en une carte : le score, le niveau et un conseil ; le détail des cinq notes se déplie d'un tap.",
          "La semaine prend la couleur du thème que vous avez posé chaque jour (dur, moyen, facile, récup, repos) et le thème du jour s'affiche juste dessous.",
          "Chaque séance montre d'abord son nom ; « Aperçu » déplie la liste des exercices avec séries, répétitions et charge, puis le bouton pour démarrer.",
          "Le bloc « Hier » disparaît de l'accueil : la séance faite et le wellness d'hier restent dans le Programme et le Profil.",
        ],
      },
    ],
  },
  {
    id: "2026-11-12-couleurs-par-type",
    date: "2026-11-12",
    kind: "feature",
    title: "Une couleur par type de séance, partout",
    summary: "Musculation en or, énergie en bleu, HYROX en orange, tests en rose, compétitions en rouge : chaque type garde sa couleur dans le planning, les séances et l'app de vos athlètes.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Les types de blocs ont aussi leur couleur fixe : mouvement principal en or, hypertrophie en rose, besoin individuel en bleu, muscles associés en turquoise, gainage en orange. Vos blocs existants prennent la nouvelle teinte la plus proche.",
          "Les boutons sont plus sobres : l'action principale en or plein, les autres en contour.",
          "Les stations HYROX ont chacune leur picto (SkiErg, sled push, rameur, wall balls…), au-dessus du graphique et dans le tableau des tours.",
        ],
      },
    ],
  },
  {
    id: "2026-11-12-onglet-seance-cartes-planning",
    date: "2026-11-12",
    kind: "feature",
    title: "Chaque séance de montre a son onglet Séance",
    summary: "Ouvrez une séance enregistrée par la montre : courbes, temps par zone, tours modifiables. Dans le planning, la séance réalisée remplace la séance prévue.",
    sections: [
      {
        title: "L'onglet Séance",
        points: [
          "Allure (ou vitesse à vélo), fréquence cardiaque colorée selon les zones SV1 / SV2 et altitude sur un même graphique. Cliquez un tour pour zoomer dessus.",
          "Temps passé dans chaque zone, ressenti de l'athlète et tableau des tours avec un total.",
          "« Modifier les tours » : couper un tour, fusionner, déplacer une limite à la seconde près, renommer. Les tours de la montre restent récupérables.",
          "HYROX : Agon découpe la séance d'après celle que vous avez programmée. L'athlète vérifie, corrige les reps et la charge, puis valide.",
          "Sans SV1 / SV2 saisis, les zones ne s'affichent pas : un lien mène au test « Seuils ventilatoires ».",
        ],
      },
      {
        title: "Dans le planning",
        points: [
          "Une activité de montre qui ressemble à la séance prévue du jour s'affiche « À confirmer » : « C'est bien cette séance » la valide, « Ce n'est pas cette séance » la laisse en séance libre.",
          "Une fois confirmée, une seule carte « Réalisée » : distance, durée, allure, barre des zones et montre utilisée.",
          "Une activité sans séance prévue apparaît en « Séance libre » ; on peut l'associer plus tard à une séance du jour.",
          "Dans votre planning du mois, une icône montre marque les séances concernées. Le détail du jour montre les cartes complètes.",
        ],
      },
    ],
  },
  {
    id: "2026-11-12-archive-strava-fusion",
    date: "2026-11-12",
    kind: "feature",
    title: "Tout l'historique Strava d'un athlète, sans doublon",
    summary: "L'archive Strava d'un athlète s'importe en entier, et une même sortie venue de plusieurs sources n'apparaît plus qu'une fois, complétée par chacune.",
    sections: [
      {
        title: "Importer l'archive Strava",
        points: [
          "L'athlète demande son archive à Strava (Paramètres > Mon compte > Télécharger ou supprimer votre compte), puis la dépose dans Agon telle quelle : le fichier .zip complet.",
          "Vous pouvez aussi la déposer pour lui, depuis sa fiche > Données.",
          "Agon reprend le titre, la description, l'effort ressenti, le matériel et les trajets. La note privée Strava n'est jamais importée.",
          "Les sorties saisies à la main dans Strava (sans fichier) arrivent aussi, avec leur durée et leur distance.",
        ],
      },
      {
        title: "Une sortie = une seule ligne",
        points: [
          "Une sortie déjà reçue de la montre n'est plus écartée ni doublée : l'archive la complète (titre, effort ressenti, courbe plus précise).",
          "La courbe la plus précise est gardée (fichier montre avant GPX), et les tours que vous avez modifiés à la main ne sont jamais touchés.",
          "Déposer deux fois la même archive ne change rien : le compte rendu affiche « déjà complètes ».",
        ],
      },
      {
        title: "Effort ressenti et matériel",
        points: [
          "L'effort ressenti noté dans Agon reste prioritaire ; celui de Strava ne sert que s'il n'y en a pas.",
          "Les kilomètres par paire de chaussures et par vélo s'affichent sous la liste des sorties.",
          "L'historique ancien est classé en zones avec les seuils actuels de l'athlète.",
        ],
      },
    ],
  },
  {
    id: "2026-11-09-mise-a-jour-automatique",
    date: "2026-11-09",
    kind: "feature",
    title: "Agon se met à jour tout seul",
    summary: "L'application installée sur le téléphone récupère maintenant la dernière version dès qu'elle est ouverte, sans rien perdre de ce qui est en cours de saisie.",
    sections: [
      {
        title: "Toujours à jour",
        points: [
          "En rouvrant Agon, la nouvelle version se charge automatiquement : plus besoin de fermer l'application ou de vider quoi que ce soit.",
          "Rien n'est rechargé pendant qu'un athlète saisit sa séance ou tant que des saisies attendent le réseau : la mise à jour attend la fin.",
        ],
      },
    ],
  },
  {
    id: "2026-11-09-mobile-pc-et-hors-ligne",
    date: "2026-11-09",
    kind: "feature",
    title: "Agon sur téléphone pour les coachs, sur ordinateur pour les athlètes",
    summary: "L'espace coach s'utilise maintenant sur téléphone, l'espace athlète sur ordinateur, et une séance libre se démarre même sans réseau.",
    sections: [
      {
        title: "Coach sur téléphone",
        points: [
          "Le menu s'ouvre en tiroir sur le côté et se referme dès que vous choisissez une page : l'écran reste en pleine largeur.",
          "Les pages larges (planning, grilles) défilent dans leur zone sans décaler tout l'écran. Certains écrans détaillés seront encore améliorés.",
        ],
      },
      {
        title: "Athlète sur ordinateur",
        points: [
          "Navigation sur le côté et contenu centré : plus de petite colonne de téléphone perdue au milieu de l'écran.",
        ],
      },
      {
        title: "Sans réseau",
        points: [
          "Vos athlètes peuvent démarrer une séance libre sans connexion : elle est créée dès le retour du réseau, avec toute la saisie.",
          "Les records battus pendant une séance validée sans réseau sont calculés à l'envoi.",
        ],
      },
      {
        title: "Inscription",
        points: [
          "La date de naissance est demandée à l'inscription : Agon est réservé aux 15 ans et plus.",
        ],
      },
    ],
  },
  {
    id: "2026-11-08-saisies-sans-reseau",
    date: "2026-11-08",
    kind: "feature",
    title: "Vos athlètes peuvent saisir sans réseau",
    summary: "À la salle sans connexion, la fin de séance, le RPE, la séance énergie, le wellness, la nutrition et la pesée sont gardés sur le téléphone puis envoyés tout seuls au retour du réseau.",
    sections: [
      {
        title: "Côté athlète",
        points: [
          "Sans réseau, la saisie est gardée sur le téléphone : l'écran la montre tout de suite et un bandeau indique combien de saisies attendent d'être envoyées.",
          "Dès que le réseau revient, tout part automatiquement, dans l'ordre, sans rien refaire.",
          "Si vous avez déplacé la séance entre-temps, la saisie s'y enregistre et votre adaptation du jour est gardée. Si vous l'avez supprimée, l'athlète est prévenu que sa saisie n'a pas pu être enregistrée.",
          "Se déconnecter avec des saisies pas encore envoyées demande une confirmation avant de les perdre.",
        ],
      },
      {
        title: "Côté coach",
        points: [
          "Sans réseau, l'espace coach se consulte mais ne se modifie pas : un bandeau « Hors ligne : modifications désactivées » le signale, et rien n'est perdu en silence.",
        ],
      },
    ],
  },
  {
    id: "2026-11-08-plus-de-pertes",
    date: "2026-11-08",
    kind: "fix",
    title: "Plus aucune modification perdue en silence",
    summary: "Quand une sauvegarde échoue, l'app le dit au lieu d'afficher « enregistré ». Et deux personnes qui travaillent en même temps ne s'effacent plus.",
    sections: [
      {
        title: "Programmation et planning",
        points: [
          "Deux coachs (ou un coach et l'assistant) qui modifient le même programme ne s'effacent plus leurs changements.",
          "Créer un cycle ou changer ses dates se fait d'un bloc : plus de cycle sans semaines, plus de « semaine 1 » en double, les semaines allégées restent marquées.",
          "Une séance déjà réalisée n'est plus remise en « prévue » quand tu crées un cycle depuis le bloc.",
        ],
      },
      {
        title: "Séances énergie, tests, poids",
        points: [
          "Si tu supprimes une séance énergie pendant que l'athlète la valide, il voit une erreur au lieu de « Séance validée ! ».",
          "Annuler la validation d'une course la retire bien du volume de course.",
          "Modifier un résultat de test ne peut plus effacer ses valeurs.",
          "La pesée du jour et les paliers de poids ne s'écrasent plus d'un appareil à l'autre.",
        ],
      },
      {
        title: "Ailleurs",
        points: [
          "Accueil : « X a enregistré une séance » s'affiche de nouveau dans l'activité récente.",
          "Banque d'exercices : fusionner deux exercices garde la vidéo et les consignes du doublon ; un exercice créé depuis la recherche t'appartient (tu peux le modifier).",
          "Le compte « J-x » avant une compétition et la séance du jour côté pro ne se trompent plus de jour après minuit.",
          "Activer HYROX sur un athlète affiche l'onglet tout de suite.",
        ],
      },
    ],
  },
  {
    id: "2026-11-08-alerte-blesse-malade",
    date: "2026-11-08",
    kind: "feature",
    title: "Athlète blessé ou malade : alerte sur ton accueil",
    summary: "Quand un athlète répond « blessé / malade » dans son wellness, tu le vois tout de suite, avec son commentaire.",
    sections: [
      {
        title: "Où le voir",
        points: [
          "Accueil : une section « Blessé / malade » liste les athlètes qui l'ont signalé aujourd'hui ou hier, avec leur commentaire.",
          "Retours : un encart rouge reprend les jours signalés de la semaine ou du mois affiché.",
          "Aucune fiche blessure n'est créée automatiquement : c'est toi qui décides.",
        ],
      },
    ],
  },
  {
    id: "2026-11-08-donnees-fiabilisees",
    date: "2026-11-08",
    kind: "fix",
    title: "Wellness, RPE, nutrition et records : des chiffres justes partout",
    summary: "Plusieurs informations ne s'affichaient pas ou étaient fausses. Elles reviennent, calculées de la même façon chez toi et chez l'athlète.",
    sections: [
      {
        title: "Wellness",
        points: [
          "Le wellness du jour s'affiche de nouveau sur ton accueil, et les alertes wellness se déclenchent.",
          "Un seul score et 5 niveaux partout (Optimal, Bon, Modéré, Fatigué, Surmenage) ; un score absent s'affiche « — », plus jamais 0.",
          "Les libellés du calendrier des Retours correspondent enfin aux bonnes notes.",
          "Deux appareils ne s'effacent plus mutuellement la saisie du jour.",
        ],
      },
      {
        title: "Séances",
        points: [
          "Le RPE réapparaît dans la timeline, les cartes de cycle et la charge du mésocycle ; plus d'erreur au 2ᵉ RPE.",
          "Ton adaptation d'une séance n'est plus effacée quand l'athlète enregistre ses séries.",
          "Les déplacements de séance faits par l'athlète réapparaissent dans les Retours.",
          "Une charge prescrite en % RM est convertie en kg pour l'athlète (case vide s'il n'a pas de 1RM), au lieu d'afficher « 75 kg ».",
          "Les nouveaux records sont détectés quand l'athlète valide sa séance.",
        ],
      },
      {
        title: "Références et records",
        points: [
          "La FC max ou la FC repos saisie par l'athlète sert enfin à ses séances d'énergie.",
          "Changer une VMA ou une FC met tout à jour immédiatement, sans recharger.",
          "Une seule formule de 1RM, arrondie à 0,5 kg ; le 1RM est retrouvé même quand l'exercice porte un autre nom que le record.",
          "L'accueil « Records & tests » n'affiche plus les zones FC comme des records.",
        ],
      },
      {
        title: "Nutrition",
        points: [
          "La nutrition s'affiche dans les Retours, avec un respect de la stratégie calculé correctement.",
          "La stratégie que tu enregistres apparaît tout de suite.",
          "Une saisie de l'athlète après minuit n'est plus rangée la veille.",
        ],
      },
    ],
  },
  {
    id: "2026-11-07-cycles-seances-gardees",
    date: "2026-11-07",
    kind: "fix",
    title: "Modifier un cycle ne supprime plus les séances faites par ton athlète",
    summary:
      "Raccourcir, déplacer ou supprimer un cycle pouvait effacer des séances déjà réalisées, avec leurs charges. Elles sont maintenant toujours gardées.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Planning : raccourcir, déplacer ou supprimer un cycle ne retire que les séances encore à faire. Une séance réalisée, commencée ou notée (RPE) reste dans l'historique de l'athlète.",
          "Ouvrir la fiche d'un athlète ne modifie plus jamais ses séances en arrière-plan : une séance qu'il a rouverte ne repasse plus en « réalisée » toute seule.",
        ],
      },
    ],
  },
  {
    id: "2026-11-07-sorties-montre-volume",
    date: "2026-11-07",
    kind: "feature",
    title: "Les sorties de la montre comptent dans le volume de course",
    summary:
      "Une sortie enregistrée par la montre de ton athlète (ou importée depuis un fichier) compte maintenant dans ses km de la semaine et se rattache à la séance prévue du jour.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Volume de course (profil sportif, retours) : les km de la montre sont inclus, avec la part qui vient de la montre.",
          "Retours : une séance prévue faite avec la montre affiche « Réalisée — 10,2 km montre ».",
          "Si ton athlète saisit aussi la sortie à la main, elle ne compte qu'une fois : c'est la mesure de la montre qui est retenue.",
          "Le statut de la séance ne change pas tout seul : ton athlète la valide toujours, avec son RPE.",
        ],
      },
      {
        title: "Montres connectées",
        points: [
          "Synchronisation COROS fiabilisée : plus de sortie oubliée quand elle est faite après la synchro de la nuit.",
          "Quand un athlète déconnecte sa montre, les sorties qu'elle avait envoyées sont supprimées. Celles importées à la main par fichier restent.",
        ],
      },
    ],
  },
  {
    id: "2026-11-07-fiabilite-securite",
    date: "2026-11-07",
    kind: "fix",
    title: "App plus rapide, saisies protégées, données mieux verrouillées",
    summary:
      "Changer de page ne recharge plus toute l'app, les saisies de séance de tes athlètes ne se perdent plus en cas de coupure réseau, et l'accès aux données est resserré.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "Navigation : passer d'une page à l'autre ne recharge plus toutes les données. La sidebar et la barre d'onglets restent en place.",
          "Côté athlète : la séance en cours, la séance énergie et le wellness sont gardés sur le téléphone jusqu'à l'envoi. Fermer l'app ou perdre le réseau ne fait plus rien perdre.",
          "Un échec réseau à l'ouverture ne peut plus effacer l'historique wellness ou poids d'un athlète.",
          "Retours hebdo et mensuels : les tests de la période s'affichent de nouveau.",
          "Sécurité : les profils coach ne sont plus visibles sans être connecté, et un coach ne voit plus que les fichiers (tests, captures) de ses propres athlètes.",
          "Rejoindre un coach se fait toujours avec son code, mais la vérification passe maintenant par le serveur.",
          "Supprimer son compte efface aussi les fiches et photos de commentaires.",
        ],
      },
    ],
  },
  {
    id: "2026-11-02-videos-assistant",
    date: "2026-11-02",
    kind: "feature",
    title: "Assistant IA : vidéos de démo sur les exercices",
    summary:
      "Ton assistant peut poser la vidéo YouTube de démo d'un exercice : l'athlète l'ouvre avec le bouton vidéo pendant sa séance.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "L'assistant propose la vidéo d'un exercice de la banque ; elle s'applique et s'annule comme ses autres propositions.",
          "La banque est commune : la vidéo vaut pour tous les athlètes qui ont cet exercice. Réservé aux coachs certifiés, et une vidéo existante n'est remplacée que si tu le demandes.",
          "Les liens écrits dans une consigne d'exercice sont maintenant cliquables côté athlète (ouverture dans un nouvel onglet).",
        ],
      },
    ],
  },
  {
    id: "2026-11-02-double-coach",
    date: "2026-11-02",
    kind: "feature",
    title: "Double coach : coacher un athlète à deux",
    summary:
      "Un athlète peut avoir deux coachs. Les deux ont les mêmes droits : ils voient, créent et modifient tous ses entraînements.",
    sections: [
      {
        title: "Comment ça marche",
        points: [
          "Fiche athlète → onglet « Coachs & staff » : entre le code coach de ton collègue, il a accès tout de suite.",
          "L'athlète peut aussi ajouter son 2e coach : menu ≡ → « Ajouter un 2e coach », ou Profil → « Mes coachs ».",
          "Programmes, planning, séances énergie, fiches, tests, retours : ce que l'un modifie, l'autre le voit aussitôt. Alertes et retours de l'athlète arrivent chez les deux.",
          "Ta banque reste privée : seul ce qui est attribué à l'athlète commun est partagé.",
          "Tu restes le coach référent : toi seul retires le co-coach (il peut aussi partir de lui-même). Dans ta liste, un badge « 2 COACHS » ou « CO-COACH » signale ces athlètes.",
        ],
      },
    ],
  },
  {
    id: "2026-11-01-semaine-tests-calendrier",
    date: "2026-11-01",
    kind: "feature",
    title: "Tests HYROX : la semaine de tests se programme en un clic",
    summary:
      "Depuis l'onglet « Semaine de tests » d'un athlète, un bouton pose les séances 1 à 5 de la batterie dans son calendrier.",
    sections: [
      {
        title: "Ce qui change",
        points: [
          "« Programmer la semaine de tests » : tu choisis le lundi, les séances tombent sur lun · mar · jeu · ven · dim, et tu peux changer le jour de chaque séance avant de valider.",
          "L'aperçu liste chaque test à sa date ; un test déjà dans le calendrier ce jour-là n'est pas doublé.",
          "L'athlète voit ses tests à faire dans son calendrier et « Prévu le … » dans son onglet Tests ; un test saisi un autre jour reprend le test prévu au lieu d'en créer un deuxième.",
          "« Annuler la semaine » retire les tests pas encore faits, jamais un résultat saisi. La Semaine 1 (sleds 3 × 50 m) se programme à part, dans le bloc d'entraînement.",
        ],
      },
    ],
  },
  {
    id: "2026-11-01-accueil-athlete-corrections",
    date: "2026-11-01",
    kind: "fix",
    title: "Accueil athlète : quatre corrections avant la vidéo de présentation",
    summary:
      "Le lien « Retour du coach » menait à une page introuvable, les conseils de forme lisaient le wellness à l'envers, la carte « Hier » cochait une séance non faite, et deux suppressions se faisaient sans confirmation.",
    sections: [
      {
        title: "Ce qui ne marchait pas",
        points: [
          "Taper « Retour du coach » (accueil ou menu profil) envoyait l'athlète sur une page introuvable. La carte se déplie maintenant sur place pour lire la note en entier.",
          "Les conseils de « Tendance de forme » avaient été écrits pour une échelle de 1 à 10, alors que le wellness va de 1 à 5 (5 = le mieux). Résultat : « Bonne récupération » s'affichait quand l'athlète était épuisé, et les alertes fatigue, stress et courbatures n'apparaissaient jamais. Les seuils sont alignés sur le bilan du wellness : alerte à 2 ou moins.",
          "La carte « Hier » affichait la première séance prévue avec une coche verte, même quand rien n'avait été fait. Elle ne montre plus qu'une séance réellement clôturée.",
          "Supprimer un événement (« Mes événements ») ou une activité libre se faisait d'un seul tap, sans retour possible. Une confirmation s'affiche maintenant.",
        ],
      },
    ],
  },
  {
    id: "2026-11-01-series-par-muscle",
    date: "2026-11-01",
    kind: "feature",
    title: "Séries par muscle et par semaine : visibles pendant que tu programmes",
    summary:
      "Chaque exercice a maintenant des muscles principaux et secondaires, que tu vois et modifies directement dans ta séance. Sous tes séances, un tableau te donne le volume de chaque muscle semaine par semaine, et la vue Retours utilise le même calcul.",
    sections: [
      {
        title: "Les muscles d'un exercice",
        points: [
          "Dans la Banque, un exercice peut avoir 2 muscles principaux (facultatif pour le 2e) et autant de muscles secondaires que tu veux.",
          "Dans une séance, les muscles de l'exercice s'affichent sous ses paramètres. Ouvre l'exercice pour les changer : un clic = principal, un 2e clic = secondaire, un 3e = retiré.",
          "Ce que tu changes dans la séance ne vaut que pour cet exercice dans ce programme : la Banque n'est pas modifiée. « Revenir à la banque » remet les valeurs d'origine.",
        ],
      },
      {
        title: "Le volume par muscle",
        points: [
          "Un muscle principal compte 1 série, un muscle secondaire 0,5 : il faut 2 séries pour en faire 1.",
          "Sous tes séances (onglet Musculation), un tableau montre les séries de chaque muscle pour chaque semaine du cycle, avec le total de la semaine. Coche « Détail des sous-muscles » pour séparer dos, épaules, mollets et avant-bras.",
          "Le calcul suit la progression de tes séances : si tu passes de 3 à 5 séries d'une semaine à l'autre, le tableau le reflète. Il part des séances placées dans le calendrier.",
          "Dans Retours, la carte « Séries par muscle » reprend ce tableau avec, pour chaque case, les séries des séances terminées sur celles prévues. Elle remplace l'ancienne carte qui affichait des chiffres faux.",
        ],
      },
    ],
  },
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
