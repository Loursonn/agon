import { describe, expect, it } from "vitest";
import {
  NOTICE_DAYS,
  retentionNotice,
  runRetention,
  type RetentionCandidate,
  type RetentionDeps,
  type RetentionNotice,
} from "../accountRetention";

const NOW = new Date("2029-11-14T09:00:00Z");

function deps(list: RetentionCandidate[], opts: { mailer?: boolean; failDelete?: string; emails?: Record<string, string | null> } = {}) {
  const log: string[] = [];
  const sent: Array<{ to: string; notice: RetentionNotice }> = [];
  const notices: Array<{ userId: string; purgeAfter: Date }> = [];
  const d: RetentionDeps = {
    candidates: async () => list,
    deleteAccount: async (id) => {
      if (id === opts.failDelete) throw new Error("boom");
      log.push(`delete ${id}`);
      return { warnings: id === "w" ? ["garmin: timeout"] : [] };
    },
    emailOf: async (id) => (opts.emails && id in opts.emails ? opts.emails[id] : `${id}@example.org`),
    sendNotice: opts.mailer === false ? null : async (to, notice) => {
      log.push(`mail ${to}`);
      sent.push({ to, notice });
    },
    recordNotice: async (userId, _at, purgeAfter) => {
      log.push(`notice ${userId}`);
      notices.push({ userId, purgeAfter });
    },
    cancelNotice: async (id) => {
      log.push(`cancel ${id}`);
    },
    now: () => NOW,
  };
  return { d, log, sent, notices };
}

const ALL: RetentionCandidate[] = [
  { user_id: "p1", action: "supprimer_pre_cree" },
  { user_id: "i1", action: "prevenir" },
  { user_id: "i2", action: "supprimer_inactif" },
  { user_id: "r1", action: "annuler_preavis" },
];

describe("runRetention", () => {
  it("aperçu (par défaut) : compte, n'écrit rien", async () => {
    const { d, log } = deps(ALL);
    const r = await runRetention(d, { apply: false });
    expect(log).toEqual([]);
    expect(r.mode).toBe("apercu");
    expect(r.vises).toEqual({ supprimer_pre_cree: 1, prevenir: 1, supprimer_inactif: 1, annuler_preavis: 1 });
    expect(r.supprimes).toBe(0);
  });

  it("appliqué : annulations, puis suppressions, puis préavis (e-mail avant enregistrement)", async () => {
    const { d, log } = deps(ALL);
    const r = await runRetention(d, { apply: true });
    expect(log).toEqual(["cancel r1", "delete p1", "delete i2", "mail i1@example.org", "notice i1"]);
    expect(r).toMatchObject({ mode: "applique", supprimes: 2, prevenus: 1, preavisAnnules: 1, erreurs: 0 });
  });

  it("préavis : suppression prévue 30 jours plus tard, date dans l'e-mail", async () => {
    const { d, sent, notices } = deps([{ user_id: "i1", action: "prevenir" }]);
    await runRetention(d, { apply: true });
    expect(notices[0].purgeAfter.getTime() - NOW.getTime()).toBe(NOTICE_DAYS * 86_400_000);
    expect(sent[0].notice.subject).toBe("Votre compte Agon sera supprimé le 14 décembre 2029");
  });

  it("sans service d'e-mail : aucun préavis, donc aucun inactif nouvellement visé n'est touché", async () => {
    const { d, log } = deps([{ user_id: "i1", action: "prevenir" }, { user_id: "p1", action: "supprimer_pre_cree" }], { mailer: false });
    const r = await runRetention(d, { apply: true });
    expect(log).toEqual(["delete p1"]);
    expect(r.sansServiceMail).toBe(1);
    const apercu = await runRetention(deps([{ user_id: "i1", action: "prevenir" }], { mailer: false }).d, { apply: false });
    expect(apercu.sansServiceMail).toBe(1);
  });

  it("adresse absente ou de compte pré-créé (.invalid) : pas d'e-mail, pas de préavis enregistré", async () => {
    const { d, log } = deps([{ user_id: "a", action: "prevenir" }, { user_id: "b", action: "prevenir" }], {
      emails: { a: null, b: "pending-b@pending.invalid" },
    });
    const r = await runRetention(d, { apply: true });
    expect(log).toEqual([]);
    expect(r.erreurs).toBe(2);
  });

  it("plafond par passage : le reste attend le passage suivant", async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ user_id: `p${i}`, action: "supprimer_pre_cree" as const }));
    const { d, log } = deps(many);
    const r = await runRetention(d, { apply: true, maxDeletions: 3 });
    expect(log).toEqual(["delete p0", "delete p1", "delete p2"]);
    expect(r).toMatchObject({ supprimes: 3, reportes: 2 });
  });

  it("une suppression qui échoue n'arrête pas le passage ; avertissements comptés", async () => {
    const { d, log } = deps([
      { user_id: "x", action: "supprimer_pre_cree" },
      { user_id: "w", action: "supprimer_inactif" },
    ], { failDelete: "x" });
    const r = await runRetention(d, { apply: true });
    expect(log).toEqual(["delete w"]);
    expect(r).toMatchObject({ supprimes: 1, erreurs: 1, avertissements: 1 });
  });

  it("le rapport ne contient que des nombres", async () => {
    const r = await runRetention(deps(ALL).d, { apply: true });
    const text = JSON.stringify(r);
    for (const id of ["p1", "i1", "i2", "r1", "example.org"]) expect(text).not.toContain(id);
  });
});

describe("retentionNotice", () => {
  it("dit quand, comment garder le compte, comment récupérer ses données", () => {
    const n = retentionNotice(new Date("2029-12-14T09:00:00Z"));
    expect(n.text).toContain("le 14 décembre 2029");
    expect(n.text).toContain("Connectez-vous simplement avant cette date : https://agon-training.com");
    expect(n.text).toContain("« Télécharger toutes mes données »");
    expect(n.text).toContain("https://agon-training.com/confidentialite");
  });
});
