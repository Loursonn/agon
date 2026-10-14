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

export interface ReleaseNote {
  id: string;
  date: string; // yyyy-MM-dd
  title: string;
  summary: string;
  sections: ReleaseNoteSection[];
  resources?: ReleaseNoteResource[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: "2026-10-14-import-mode-emploi",
    date: "2026-10-14",
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
