/**
 * Staff autour des athlètes — domaines, métiers, grilles par défaut.
 *
 * Miroir côté client de `staff_domains()` / `staff_default_permissions()`
 * (migration 20261031120000_staff_core.sql). La base reste la seule
 * autorité : ces valeurs ne servent qu'à pré-cocher et à afficher.
 */

export const STAFF_DOMAINS = [
  "seances",
  "fiches",
  "planification",
  "logs",
  "wellness",
  "medical",
  "nutrition",
  "tests",
  "commentaires",
] as const;
export type StaffDomain = (typeof STAFF_DOMAINS)[number];

export type StaffLevel = "none" | "read" | "write";
export type StaffPermissions = Record<StaffDomain, StaffLevel>;

export const STAFF_PROFESSIONS = [
  "kine",
  "osteo",
  "coach_adjoint",
  "nutritionniste",
  "prepa_mentale",
  "medecin",
  "autre",
] as const;
export type StaffProfession = (typeof STAFF_PROFESSIONS)[number];

export const PROFESSION_LABEL: Record<StaffProfession, string> = {
  kine: "Kiné",
  osteo: "Ostéo",
  coach_adjoint: "Coach adjoint",
  nutritionniste: "Nutritionniste",
  prepa_mentale: "Préparateur mental",
  medecin: "Médecin",
  autre: "Autre",
};

export const DOMAIN_LABEL: Record<StaffDomain, string> = {
  seances: "Séances",
  fiches: "Fiches",
  planification: "Planification",
  logs: "Séances réalisées",
  wellness: "Bien-être",
  medical: "Médical",
  nutrition: "Nutrition",
  tests: "Tests",
  commentaires: "Commentaires",
};

export const DOMAIN_HINT: Record<StaffDomain, string> = {
  seances: "Programme et séances prévues",
  fiches: "Fiches attribuées, ajout dans ta banque",
  planification: "Saisons, cycles, compétitions",
  logs: "Charges, RPE, records",
  wellness: "Sommeil, fatigue, stress, habitudes",
  medical: "Antécédents, blessures, pièces jointes",
  nutrition: "Stratégie, journal, poids, mensurations",
  tests: "Tests de performance",
  commentaires: "Commentaires sur les fiches, retours",
};

/** Domaines où l'écriture existe en V1. Ailleurs, « écriture » = lecture. */
export const WRITABLE_V1: ReadonlySet<StaffDomain> = new Set<StaffDomain>(["medical", "fiches", "commentaires"]);

/** Données de santé sensibles (badge dans la grille des droits). Tous les domaines exigent l'accord staff de l'athlète. */
export const HEALTH_DOMAINS: ReadonlySet<StaffDomain> = new Set<StaffDomain>(["medical", "nutrition", "wellness"]);

export const LEVEL_LABEL: Record<StaffLevel, string> = {
  none: "Aucun",
  read: "Lecture",
  write: "Écriture",
};

const g = (
  seances: StaffLevel, fiches: StaffLevel, planification: StaffLevel, logs: StaffLevel,
  wellness: StaffLevel, medical: StaffLevel, nutrition: StaffLevel, tests: StaffLevel,
  commentaires: StaffLevel,
): StaffPermissions => ({ seances, fiches, planification, logs, wellness, medical, nutrition, tests, commentaires });

/** Grille par défaut du métier (spec §4). */
export const DEFAULT_PERMISSIONS: Record<StaffProfession, StaffPermissions> = {
  //                  séances  fiches   planif   logs     wellness medical  nutri    tests    comm.
  kine:           g("read",  "write", "read",  "read",  "read",  "write", "none",  "read",  "write"),
  osteo:          g("read",  "write", "read",  "read",  "read",  "write", "none",  "read",  "write"),
  coach_adjoint:  g("write", "write", "write", "read",  "read",  "read",  "read",  "write", "write"),
  nutritionniste: g("none",  "write", "read",  "read",  "read",  "none",  "write", "none",  "write"),
  prepa_mentale:  g("none",  "write", "read",  "none",  "read",  "none",  "none",  "none",  "write"),
  medecin:        g("read",  "read",  "read",  "read",  "read",  "write", "read",  "read",  "write"),
  autre:          g("none",  "none",  "none",  "none",  "none",  "none",  "none",  "none",  "write"),
};

/** Lit une grille venue de la base (JSON libre) en grille complète. */
export function toPermissions(raw: unknown): StaffPermissions {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as StaffPermissions;
  for (const d of STAFF_DOMAINS) {
    const v = src[d];
    out[d] = v === "read" || v === "write" ? v : "none";
  }
  return out;
}

export function canRead(p: StaffPermissions | null | undefined, d: StaffDomain): boolean {
  return !!p && (p[d] === "read" || p[d] === "write");
}

export function canWrite(p: StaffPermissions | null | undefined, d: StaffDomain): boolean {
  return !!p && p[d] === "write";
}

export function professionLabel(p: string | null | undefined): string {
  return p && p in PROFESSION_LABEL ? PROFESSION_LABEL[p as StaffProfession] : "Professionnel";
}

/** Résumé court d'une grille : « Médical, Fiches (écriture) · Séances, Tests (lecture) ». */
export function summarizePermissions(p: StaffPermissions): string {
  const w = STAFF_DOMAINS.filter((d) => p[d] === "write").map((d) => DOMAIN_LABEL[d]);
  const r = STAFF_DOMAINS.filter((d) => p[d] === "read").map((d) => DOMAIN_LABEL[d]);
  const parts: string[] = [];
  if (w.length) parts.push(`${w.join(", ")} (écriture)`);
  if (r.length) parts.push(`${r.join(", ")} (lecture)`);
  return parts.join(" · ") || "Aucun accès";
}

export function staffInviteUrl(token: string): string {
  return `${window.location.origin}/staff-invite/${token}`;
}
