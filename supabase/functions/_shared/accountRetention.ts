/**
 * Purge des comptes (art. 5.1.e RGPD) : déroulé d'un passage, sans dépendance
 * à supabase-js (testable). Les règles « qui est visé » sont en SQL :
 * `account_retention_candidates()` (migration `purge_comptes`). Ici : quoi
 * faire de chaque compte visé, avec quels garde-fous. Voir docs/PURGE_COMPTES.md.
 *
 * Garde-fous :
 *   - rien n'est écrit sans `apply` (le secret RETENTION_ENABLED=true ET la
 *     demande explicite du cron) : sinon le passage ne fait que compter ;
 *   - un compte inactif n'est jamais supprimé sans préavis enregistré 30 jours
 *     plus tôt ; sans service d'e-mail configuré, aucun préavis ne part, donc
 *     aucun compte inactif n'est supprimé ;
 *   - au plus `maxDeletions` suppressions par passage (une erreur de règle ne
 *     peut pas vider la base d'un coup) ;
 *   - le rapport ne contient que des nombres, jamais d'identifiant ni d'e-mail.
 */

export type RetentionAction = "supprimer_pre_cree" | "prevenir" | "supprimer_inactif" | "annuler_preavis";

export interface RetentionCandidate {
  user_id: string;
  action: RetentionAction;
}

export interface RetentionNotice {
  subject: string;
  text: string;
}

export interface RetentionDeps {
  candidates(): Promise<RetentionCandidate[]>;
  deleteAccount(userId: string): Promise<{ warnings: string[] }>;
  emailOf(userId: string): Promise<string | null>;
  /** `null` : aucun service d'e-mail configuré. */
  sendNotice: ((to: string, notice: RetentionNotice) => Promise<void>) | null;
  recordNotice(userId: string, notifiedAt: Date, purgeAfter: Date): Promise<void>;
  cancelNotice(userId: string): Promise<void>;
  now(): Date;
}

export interface RetentionReport {
  mode: "apercu" | "applique";
  vises: Record<RetentionAction, number>;
  supprimes: number;
  prevenus: number;
  preavisAnnules: number;
  /** Comptes inactifs non prévenus faute de service d'e-mail. */
  sansServiceMail: number;
  /** Suppressions reportées au passage suivant (plafond atteint). */
  reportes: number;
  erreurs: number;
  avertissements: number;
}

export const NOTICE_DAYS = 30;
export const MAX_DELETIONS_PER_RUN = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Date lisible en français, fuseau de Paris (« 14 décembre 2029 »). */
export function frenchDate(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(d);
}

/** Texte du préavis envoyé 30 jours avant la suppression d'un compte inactif. */
export function retentionNotice(purgeAfter: Date, appUrl = "https://agon-training.com"): RetentionNotice {
  const date = frenchDate(purgeAfter);
  return {
    subject: "Votre compte Agon sera supprimé le " + date,
    text: [
      "Bonjour,",
      "",
      "Vous n'avez pas utilisé votre compte Agon depuis plus de 3 ans. Pour ne pas garder vos données plus longtemps que nécessaire, nous supprimerons ce compte le " + date + ", avec tout ce qu'il contient : séances, charges, bien-être, blessures, mesures, données de montre et fichiers.",
      "",
      "Vous voulez le garder ? Connectez-vous simplement avant cette date : " + appUrl,
      "La suppression est alors annulée, il n'y a rien d'autre à faire.",
      "",
      "Vous voulez récupérer vos données avant ? Une fois connecté, ouvrez la rubrique Confidentialité et choisissez « Télécharger toutes mes données ».",
      "",
      "Sans connexion de votre part, la suppression sera définitive : nous ne pourrons pas récupérer le compte ensuite.",
      "",
      "L'équipe Agon",
      "",
      "Vous recevez ce message une seule fois, parce qu'un compte Agon est ouvert à cette adresse. Politique de confidentialité : " + appUrl + "/confidentialite",
    ].join("\n"),
  };
}

export async function runRetention(
  deps: RetentionDeps,
  options: { apply: boolean; maxDeletions?: number; appUrl?: string },
): Promise<RetentionReport> {
  const max = options.maxDeletions ?? MAX_DELETIONS_PER_RUN;
  const list = await deps.candidates();
  const report: RetentionReport = {
    mode: options.apply ? "applique" : "apercu",
    vises: { supprimer_pre_cree: 0, prevenir: 0, supprimer_inactif: 0, annuler_preavis: 0 },
    supprimes: 0,
    prevenus: 0,
    preavisAnnules: 0,
    sansServiceMail: 0,
    reportes: 0,
    erreurs: 0,
    avertissements: 0,
  };
  for (const c of list) report.vises[c.action]++;
  if (!options.apply) {
    report.sansServiceMail = deps.sendNotice ? 0 : report.vises.prevenir;
    return report;
  }

  // Annulations d'abord : quelqu'un qui est revenu ne doit plus rien risquer.
  for (const c of list.filter((x) => x.action === "annuler_preavis")) {
    try {
      await deps.cancelNotice(c.user_id);
      report.preavisAnnules++;
    } catch {
      report.erreurs++;
    }
  }

  for (const c of list.filter((x) => x.action === "supprimer_pre_cree" || x.action === "supprimer_inactif")) {
    if (report.supprimes >= max) {
      report.reportes++;
      continue;
    }
    try {
      const { warnings } = await deps.deleteAccount(c.user_id);
      report.supprimes++;
      report.avertissements += warnings.length;
    } catch {
      report.erreurs++;
    }
  }

  const prevenir = list.filter((x) => x.action === "prevenir");
  if (!deps.sendNotice) {
    report.sansServiceMail = prevenir.length;
    return report;
  }
  for (const c of prevenir) {
    try {
      const email = await deps.emailOf(c.user_id);
      if (!email || email.endsWith(".invalid")) {
        report.erreurs++;
        continue;
      }
      const notifiedAt = deps.now();
      const purgeAfter = new Date(notifiedAt.getTime() + NOTICE_DAYS * DAY_MS);
      // E-mail d'abord : un préavis enregistré mais jamais reçu ouvrirait la
      // porte à une suppression sans prévenir.
      await deps.sendNotice(email, retentionNotice(purgeAfter, options.appUrl));
      await deps.recordNotice(c.user_id, notifiedAt, purgeAfter);
      report.prevenus++;
    } catch {
      report.erreurs++;
    }
  }
  return report;
}
