import { IMPORT_PROMPT, IMPORT_PROMPT_FILENAME } from "./importPrompt";

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
