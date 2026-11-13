/**
 * Socle juridique de l'application.
 *
 * Centralise tout ce qui est cité à la fois par les pages légales publiques et
 * par le mécanisme de consentement : identité du responsable de traitement,
 * version des documents, liste des sous-traitants.
 *
 * Pourquoi un seul fichier : le consentement RGPD doit être horodaté *et*
 * versionné. Si le texte de la politique change de façon substantielle, il faut
 * pouvoir prouver quelle version l'utilisateur a acceptée, et lui redemander son
 * accord. Avoir la version à côté du texte évite qu'elles divergent.
 */

/**
 * Version des documents légaux, au format `AAAA-MM-JJ`.
 *
 * À incrémenter à CHAQUE modification substantielle de la politique de
 * confidentialité ou des CGU (nouvelle finalité, nouveau sous-traitant,
 * nouvelle catégorie de données). Un changement de version invalide les
 * consentements précédents : l'utilisateur est re-sollicité au prochain accès.
 *
 * Les corrections purement rédactionnelles (typo, reformulation) ne doivent PAS
 * l'incrémenter, sinon on harcèle les utilisateurs pour rien.
 */
export const LEGAL_VERSION = "2026-11-13";

/**
 * Plus ancienne version sous laquelle l'accord socle (`health_data`) reste
 * valable.
 *
 * Distincte de LEGAL_VERSION : une nouvelle version n'oblige à revalider
 * l'accord socle que si elle change ce à quoi il porte. Le 31 octobre 2026
 * ajoute le partage avec le staff, qui a son propre accord facultatif
 * (`staff_sharing`) : l'accord socle du 30 octobre reste valable, seul
 * l'accord staff est demandé. À aligner sur LEGAL_VERSION quand une version
 * change le traitement couvert par l'accord socle.
 *
 * 13 novembre 2026 : nouvelles catégories de données de santé couvertes par
 * l'accord socle (photos du corps, composition corporelle, douleur et maladie
 * du matin, bilan hebdomadaire, feu du matin, copie intégrale Garmin) : tous
 * les utilisateurs sont re-sollicités.
 */
export const CORE_CONSENT_SINCE = "2026-11-13";

/**
 * Plus ancienne version sous laquelle une réponse à l'accord IA
 * (`ai_programming`) compte encore comme une réponse.
 *
 * Le texte du 30 octobre 2026 nomme l'assistant Claude du coach en plus de
 * Gemini. Une décision prise sous l'ancien texte (Gemini seul) ne porte pas sur
 * Claude : l'athlète est re-sollicité par `ConsentGate`. Même valeur que
 * `AI_ASSISTANT_SINCE` côté serveur (`supabase/functions/_shared/coachApiOps.ts`),
 * vérifiée par un test.
 */
export const AI_CONSENT_SINCE = "2026-10-30";

/** Date d'entrée en vigueur affichée en tête des documents. */
export const LEGAL_EFFECTIVE_DATE = "13 novembre 2026";

/**
 * Marqueur des champs que seul Hugo peut renseigner (données d'état civil et
 * d'immatriculation). Tant qu'il reste présent, les pages légales affichent un
 * bandeau d'avertissement : un document incomplet soumis à Garmin ou à la CNIL
 * est pire qu'un document absent.
 */
export const TODO = "[À COMPLÉTER]";

/** Vrai si au moins un champ d'identité reste à renseigner. */
export function hasLegalPlaceholders(): boolean {
  return Object.values(COMPANY).some((v) => typeof v === "string" && v.includes(TODO));
}

/**
 * Responsable de traitement au sens de l'article 4.7 du RGPD.
 *
 * Forme retenue : entrepreneur individuel. En EI il n'y a pas de personne
 * morale distincte, donc la loi impose d'afficher les nom et prénom de la
 * personne physique — pas seulement un nom commercial.
 */
export const COMPANY = {
  /** Nom commercial / marque. */
  brand: "Agon",
  /** Forme juridique. */
  legalForm: "Entrepreneur individuel (EI)",
  /** Nom et prénom de l'entrepreneur — obligatoire en EI (art. R.123-237 C. com.). */
  legalName: "Hugo TANGUY",
  /**
   * Numéro SIREN à 9 chiffres, groupés par trois comme l'imprime l'INSEE.
   * Les formulaires qui n'acceptent que des chiffres attendent `940221187`.
   */
  siren: "940 221 187",
  /** Adresse du siège — obligatoire en mentions légales. */
  address: "36 Chemin de Charlemagne, 33133 Galgon, France",
  /** Téléphone de l'éditeur — obligatoire en mentions légales (art. 6 III LCEN). */
  phone: "06 68 20 33 05",
  /** Email de contact pour l'exercice des droits RGPD. */
  contactEmail: "prep.hugoo@gmail.com",
  /** Site web public — champ obligatoire du formulaire Garmin. */
  websiteUrl: "https://agon-training.com",
  /** Numéro de TVA intracommunautaire, ou mention de franchise. */
  vat: "Non assujetti à la TVA (franchise en base, art. 293 B du CGI)",
} as const;

/** URLs publiques des documents légaux, relatives à la racine du site. */
export const LEGAL_ROUTES = {
  privacy: "/confidentialite",
  terms: "/cgu",
  notice: "/mentions-legales",
  /** Exigence Google Play : URL web publique de suppression du compte. */
  deletion: "/suppression-compte",
} as const;

/** Hébergeur — à citer en mentions légales (art. 6 III LCEN). */
export const HOSTING = {
  name: "Vercel Inc.",
  address: "440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis",
  /** Téléphone de l'hébergeur — exigé par l'art. 6 III LCEN. */
  phone: "+1 559 288 7060",
  website: "https://vercel.com",
} as const;

/**
 * Rôle d'un tiers vis-à-vis des données.
 *
 * La distinction n'est pas cosmétique : un sous-traitant agit sur nos
 * instructions et relève de l'article 28 (contrat obligatoire), tandis qu'un
 * responsable indépendant décide seul de ses traitements — c'est le cas de
 * Garmin, qui refuse explicitement le statut de sous-traitant. Les deux doivent
 * être cités, mais l'utilisateur doit savoir à qui s'adresser.
 */
export type ProcessorRole = "subprocessor" | "independent";

export interface Subprocessor {
  name: string;
  purpose: string;
  /** Localisation du traitement, pour la question des transferts hors UE. */
  location: string;
  /**
   * Mécanisme de transfert si hors Union européenne. Seulement pour un
   * sous-traitant : un responsable indépendant (Garmin, COROS) encadre ses
   * propres transferts, et Agon n'a signé aucune clause type avec lui.
   */
  transferMechanism?: string;
  role: ProcessorRole;
  privacyUrl: string;
  /** Vrai si le tiers n'est sollicité qu'après activation explicite. */
  optional?: boolean;
}

/**
 * Liste exhaustive des tiers qui touchent à des données personnelles.
 *
 * Doit rester à jour : le formulaire Garmin exige la déclaration des tiers
 * pratiquant du traitement IA/ML, et le RGPD exige l'information de
 * l'utilisateur sur les destinataires.
 */
export const SUBPROCESSORS: Subprocessor[] = [
  {
    name: "Supabase Inc.",
    purpose: "Hébergement de la base de données, authentification, stockage des fichiers",
    location: "Union européenne (Irlande)",
    transferMechanism:
      "Société américaine : un accès depuis les États-Unis (support) reste possible, encadré par les clauses contractuelles types de l'accord de traitement Supabase",
    role: "subprocessor",
    privacyUrl: "https://supabase.com/privacy",
  },
  {
    name: "Vercel Inc.",
    purpose: "Hébergement et distribution de l'application web",
    location: "États-Unis",
    transferMechanism: "Data Privacy Framework (Vercel est certifié) et accord de traitement Vercel",
    role: "subprocessor",
    privacyUrl: "https://vercel.com/legal/privacy-policy",
  },
  {
    name: "GitHub Inc.",
    purpose:
      "Stockage des sauvegardes de la base, chiffrées avant envoi : GitHub ne détient pas la clé et ne peut pas les lire. Gardées 30 jours.",
    location: "États-Unis",
    transferMechanism: "Data Privacy Framework (GitHub, filiale de Microsoft, est couvert) ; données chiffrées de bout en bout",
    role: "subprocessor",
    privacyUrl: "https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement",
  },
  {
    name: "Google Ireland Ltd. (Gemini API)",
    purpose:
      "Analyses, synthèses et visualisations des données d'entraînement, et génération assistée de programmes. Traitement par intelligence artificielle.",
    location: "Union européenne / États-Unis",
    transferMechanism:
      "Data Privacy Framework (Google LLC est certifié) et accord de traitement de Google pour les services payants",
    role: "subprocessor",
    privacyUrl: "https://ai.google.dev/gemini-api/terms",
  },
  {
    name: "Garmin International, Inc.",
    purpose:
      "Récupération des données d'activité et de santé enregistrées par votre montre, après connexion volontaire de votre compte Garmin Connect.",
    location: "États-Unis",
    role: "independent",
    privacyUrl: "https://www.garmin.com/privacy/connect/",
    optional: true,
  },
  {
    name: "COROS (Shenzhen Coros Sports Technology)",
    purpose:
      "Récupération des données d'activité enregistrées par votre montre, après connexion volontaire de votre compte COROS.",
    location: "Union européenne (point d'accès UE) / Chine",
    role: "independent",
    privacyUrl: "https://www.coros.com/privacy-policy",
    optional: true,
  },
];

/**
 * Durées de conservation, exprimées en clair pour affichage.
 *
 * Le RGPD interdit la conservation indéfinie : chaque catégorie doit avoir une
 * durée ou un critère de détermination.
 */
export const RETENTION = [
  { data: "Compte et profil", duration: "Jusqu'à suppression du compte, puis 30 jours de sauvegarde" },
  { data: "Séances, charges, séries réalisées", duration: "Durée de vie du compte" },
  { data: "Blessures déclarées", duration: "Durée de vie du compte, ou jusqu'à ce que vous ou l'auteur de l'entrée la supprimiez" },
  { data: "Données de bien-être, bilans hebdomadaires, poids, mensurations, photos du corps, blessures", duration: "Durée de vie du compte" },
  { data: "Données importées depuis une montre connectée, et copie intégrale des données Garmin", duration: "Durée de vie du compte, ou suppression immédiate à la déconnexion du service ou au retrait de l'accord" },
  { data: "Retours sur l'application", duration: "Durée de vie du compte" },
  { data: "Journaux techniques de connexion", duration: "Selon les réglages de nos hébergeurs (quelques jours aujourd'hui), 12 mois au plus" },
  { data: "Liens avec les professionnels de votre staff, et leurs droits", duration: "Durée de vie du compte (un accès retiré est conservé comme historique, sans plus aucune lecture possible)" },
  { data: "Historique de vos accords (preuve du consentement)", duration: "Durée de vie du compte, retraits compris ; à la suppression du compte, seule une trace anonyme (date, rôle, version) est gardée" },
  { data: "Sauvegardes automatiques de la base", duration: "30 jours au plus, puis effacement par rotation automatique" },
] as const;
