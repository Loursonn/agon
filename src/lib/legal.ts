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
export const LEGAL_VERSION = "2026-10-26";

/** Date d'entrée en vigueur affichée en tête des documents. */
export const LEGAL_EFFECTIVE_DATE = "26 octobre 2026";

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
} as const;

/** Hébergeur — à citer en mentions légales (art. 6 III LCEN). */
export const HOSTING = {
  name: "Vercel Inc.",
  address: "340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis",
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
  /** Mécanisme de transfert si hors Union européenne. */
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
    location: "Union européenne (région eu-central-1)",
    role: "subprocessor",
    privacyUrl: "https://supabase.com/privacy",
  },
  {
    name: "Vercel Inc.",
    purpose: "Hébergement et distribution de l'application web",
    location: "États-Unis",
    transferMechanism: "Clauses contractuelles types + Data Privacy Framework",
    role: "subprocessor",
    privacyUrl: "https://vercel.com/legal/privacy-policy",
  },
  {
    name: "Google Ireland Ltd. (Gemini API)",
    purpose:
      "Analyses, synthèses et visualisations des données d'entraînement, et génération assistée de programmes. Traitement par intelligence artificielle.",
    location: "Union européenne / États-Unis",
    transferMechanism: "Clauses contractuelles types",
    role: "subprocessor",
    privacyUrl: "https://ai.google.dev/gemini-api/terms",
  },
  {
    name: "Garmin International, Inc.",
    purpose:
      "Récupération des données d'activité et de santé enregistrées par votre montre, après connexion volontaire de votre compte Garmin Connect.",
    location: "États-Unis",
    transferMechanism: "Clauses contractuelles types",
    role: "independent",
    privacyUrl: "https://www.garmin.com/privacy/connect/",
    optional: true,
  },
  {
    name: "COROS (Shenzhen Coros Sports Technology)",
    purpose:
      "Récupération des données d'activité enregistrées par votre montre, après connexion volontaire de votre compte COROS.",
    location: "Union européenne (point d'accès UE) / Hong-Kong",
    transferMechanism: "Clauses contractuelles types",
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
  { data: "Données de bien-être, poids, blessures", duration: "Durée de vie du compte" },
  { data: "Données importées depuis une montre connectée", duration: "Durée de vie du compte, ou suppression immédiate à la déconnexion du service" },
  { data: "Journaux techniques de connexion", duration: "12 mois" },
  { data: "Preuve du consentement", duration: "5 ans après son retrait (obligation de preuve)" },
] as const;
