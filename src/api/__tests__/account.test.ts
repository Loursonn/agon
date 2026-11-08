import { describe, it, expect, afterEach, vi } from "vitest";
import { fakeDb, type FakeRpc, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  AccountError, accountKeys, claimAthleteAccount, coachCodeExists, createInvitation, createPendingAthlete,
  deleteAccount, ensureCoachCode, generateCoachCode, getClaimInfo, getClaimToken, getCoachRoster, getConsents,
  invalidateAccount, invitationIsValid, linkToCoachByCode, pickFreeCoachCode, readOwnRows, recordConsents,
  registerAthleteWithCode, registerAthleteWithInvitation, registerCoach, serverReason, setOwnCoach,
} from "@/api/account";
import type { Profile } from "@/api/profile";

type Invoked = Array<{ fn: string; body: unknown }>;

/** fakeDb + `functions.invoke` + `auth` minimal. */
function world(
  tables: Record<string, Row[]> = {},
  o: {
    rpcs?: Record<string, FakeRpc>;
    failOn?: { table: string; op: string };
    fn?: (name: string, body: unknown) => { data: unknown; error: { message: string } | null };
    user?: { id: string } | null;
  } = {},
) {
  const base = fakeDb(tables, o.failOn, o.rpcs ?? {});
  const invoked: Invoked = [];
  const signIns: unknown[] = [];
  const db = {
    ...base.db,
    functions: {
      invoke: (fn: string, opts: { body: unknown }) => {
        invoked.push({ fn, body: opts.body });
        return Promise.resolve(o.fn?.(fn, opts.body) ?? { data: null, error: null });
      },
    },
    auth: {
      signUp: () => Promise.resolve({ data: { user: o.user === undefined ? { id: "new" } : o.user, session: null }, error: null }),
      signInWithPassword: (a: unknown) => (signIns.push(a), Promise.resolve({ data: { session: {}, user: {} }, error: null })),
    },
  };
  setDbForTests(db);
  return { tables: base.tables, invoked, signIns };
}

const raise = (message: string): FakeRpc => () => { throw new Error(message); };

afterEach(() => setDbForTests(null));

describe("api/account — consentements", () => {
  it("getConsents lit la vue et lève si elle est illisible", async () => {
    world({ current_consents: [
      { user_id: "u", purpose: "health_data", granted: true, doc_version: "2026-10-31", decided_at: "t" },
      { user_id: "x", purpose: "health_data", granted: true, doc_version: "2026-10-31", decided_at: "t" },
    ] });
    expect(await getConsents("u")).toEqual([{ purpose: "health_data", granted: true, docVersion: "2026-10-31", decidedAt: "t" }]);
    world({}, { failOn: { table: "current_consents", op: "select" } });
    await expect(getConsents("u")).rejects.toThrow(/Lecture des consentements impossible/);
  });

  it("recordConsents ajoute une ligne par décision, retrait compris (journal append-only)", async () => {
    const { tables } = world({ user_consents: [{ id: "old", user_id: "u", purpose: "ai_programming", granted: true }] });
    await recordConsents("u", [
      { purpose: "ai_programming", granted: false, docVersion: "v2", statement: "texte" },
      { purpose: "staff_sharing", granted: true, docVersion: "v2", statement: "autre" },
    ]);
    expect(tables.user_consents).toHaveLength(3);
    expect(tables.user_consents[0]).toMatchObject({ id: "old", granted: true });
    expect(tables.user_consents[1]).toMatchObject({ user_id: "u", purpose: "ai_programming", granted: false, doc_version: "v2", statement: "texte" });
  });

  it("invalidateAccount couvre le compte et le bandeau « accord staff »", async () => {
    const qc = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
    await invalidateAccount(qc as never, "u");
    const keys = qc.invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(keys).toEqual([["account", "u"], ["staff", "consent", "u"]]);
    expect(accountKeys.consents("u").slice(0, 2)).toEqual(["account", "u"]);
  });
});

describe("api/account — code coach et inscription", () => {
  it("generateCoachCode : 6 caractères sans ambiguïté (ni O, 0, I, 1)", () => {
    const code = generateCoachCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(generateCoachCode(() => 0)).toBe("AAAAAA");
  });

  it("pickFreeCoachCode retire tant que le code est pris ; une vérification en panne ne bloque pas", async () => {
    let n = 0;
    world({}, { rpcs: { coach_code_exists: () => ++n < 3 } });
    await pickFreeCoachCode();
    expect(n).toBe(3);
    world({}, { failOn: { table: "coach_code_exists", op: "rpc" } });
    expect(await pickFreeCoachCode()).toMatch(/^[A-Z2-9]{6}$/);
  });

  it("coachCodeExists normalise le code et lève si l'appel échoue", async () => {
    const seen: unknown[] = [];
    world({}, { rpcs: { coach_code_exists: (a) => (seen.push(a.p_code), true) } });
    expect(await coachCodeExists(" demo42 ")).toBe(true);
    expect(seen).toEqual(["DEMO42"]);
    world({}, { failOn: { table: "coach_code_exists", op: "rpc" } });
    await expect(coachCodeExists("X")).rejects.toThrow(/Vérification du code coach impossible/);
  });

  it("registerCoach : profil coach avec code ; coach-athlète = son propre coach", async () => {
    const { tables } = world({}, { rpcs: { coach_code_exists: () => false } });
    await registerCoach("a@b.c", "pw", "Agon Démo", true);
    expect(tables.profiles[0]).toMatchObject({ id: "new", role: "coach_athlete", full_name: "Agon Démo", coach_id: "new" });
    expect(tables.profiles[0].coach_code).toMatch(/^[A-Z2-9]{6}$/);
  });

  it("registerAthleteWithCode : code inconnu refusé AVANT de créer le compte", async () => {
    const { tables } = world({}, { rpcs: { coach_code_exists: () => false } });
    await expect(registerAthleteWithCode("a@b.c", "pw", "Léa", "zzz")).rejects.toThrow("Code coach invalide — vérifie auprès de ton coach");
    expect(tables.profiles ?? []).toHaveLength(0);
  });

  it("registerAthleteWithCode : rattachement par la RPC, message d'origine si elle refuse", async () => {
    const linked: unknown[] = [];
    const { tables } = world({}, { rpcs: { coach_code_exists: () => true, link_to_coach_by_code: (a) => (linked.push(a.p_code), "coach") } });
    await registerAthleteWithCode("a@b.c", "pw", "Léa Démo", "demo42");
    expect(tables.profiles[0]).toEqual(expect.objectContaining({ id: "new", role: "athlete", full_name: "Léa Démo" }));
    expect(tables.profiles[0].coach_id).toBeUndefined();
    expect(linked).toEqual(["DEMO42"]);

    world({}, { rpcs: { coach_code_exists: () => true, link_to_coach_by_code: raise("Code coach invalide") } });
    await expect(registerAthleteWithCode("a@b.c", "pw", "Léa", "X"))
      .rejects.toThrow("Compte créé, mais le rattachement au coach a échoué : Code coach invalide");
  });

  it("registerAthleteWithInvitation : lien invalide (ou vérification en panne) refusé", async () => {
    world({}, { rpcs: { invitation_is_valid: () => false } });
    await expect(registerAthleteWithInvitation("a@b.c", "pw", "Léa", "t")).rejects.toThrow("Lien d'invitation invalide ou déjà utilisé");
    world({}, { failOn: { table: "invitation_is_valid", op: "rpc" } });
    expect(await invitationIsValid("t")).toBe(false);
    world({}, { rpcs: { invitation_is_valid: () => true, redeem_invitation: raise("déjà rattaché") } });
    await expect(registerAthleteWithInvitation("a@b.c", "pw", "Léa", "t"))
      .rejects.toThrow("Compte créé, mais le lien d'invitation n'a pas pu être utilisé : déjà rattaché");
  });

  it("linkToCoachByCode : AccountError dont `reason` garde le message du serveur", async () => {
    world({}, { rpcs: { link_to_coach_by_code: raise("Tu ne peux pas entrer ton propre code coach") } });
    const e = await linkToCoachByCode("abc").catch((x) => x);
    expect(e).toBeInstanceOf(AccountError);
    expect(serverReason(e)).toBe("Tu ne peux pas entrer ton propre code coach");
  });

  it("setOwnCoach : seulement null ou soi-même (jamais un autre coach en direct)", async () => {
    const { tables } = world({ profiles: [{ id: "u", coach_id: "c" }] });
    await setOwnCoach("u", null);
    expect(tables.profiles[0].coach_id).toBeNull();
    await setOwnCoach("u", "u");
    expect(tables.profiles[0].coach_id).toBe("u");
    await expect(setOwnCoach("u", "autre")).rejects.toThrow(/passer par le code coach/);
    expect(tables.profiles[0].coach_id).toBe("u");
  });

  it("ensureCoachCode : code tiré et enregistré ; rien si déjà là ou pas coach", async () => {
    const { tables } = world({ profiles: [{ id: "c", role: "coach", coach_code: null }] });
    const p = await ensureCoachCode({ id: "c", role: "coach", coach_code: null } as Profile);
    expect(p.coach_code).toMatch(/^[A-Z2-9]{6}$/);
    expect(tables.profiles[0].coach_code).toBe(p.coach_code);
    const athlete = { id: "a", role: "athlete", coach_code: null } as Profile;
    expect(await ensureCoachCode(athlete)).toBe(athlete);
  });

  it("createInvitation renvoie le jeton", async () => {
    // fakeDb ne génère pas le jeton (valeur par défaut de la colonne) : réponse fixée.
    setDbForTests({
      from: () => ({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { token: "tok" }, error: null }) }) }) }),
    });
    expect(await createInvitation("c")).toBe("tok");
  });
});

describe("api/account — roster du coach", () => {
  const p = (id: string, o: Row = {}) => ({ id, role: "athlete", full_name: id, coach_hidden: false, ...o });

  it("fusionne ses athlètes (avec leur co-coach) et ceux qu'il co-coache (masquage de sa liaison), triés", async () => {
    world({
      profiles: [p("Zoé", { coach_id: "c" }), p("Bob", { coach_id: "c" }), p("Léa", { coach_id: "autre" }), p("Max", { coach_id: "x" })],
      athlete_co_coaches: [
        { athlete_id: "Bob", co_coach_id: "cc" },
        { athlete_id: "Léa", co_coach_id: "c", hidden: true },
      ],
    });
    const roster = await getCoachRoster("c");
    expect(roster.map((a) => a.id)).toEqual(["Bob", "Léa", "Zoé"]);
    expect(roster[0]).toMatchObject({ co_coach_id: "cc" });
    expect(roster[1]).toMatchObject({ co_coached_by_me: true, co_coach_id: "c", coach_hidden: true });
    expect(roster[2]).toMatchObject({ co_coach_id: null });
  });

  it("lève si une lecture échoue (avant : liste vide silencieuse)", async () => {
    world({ profiles: [p("Bob", { coach_id: "c" })] }, { failOn: { table: "athlete_co_coaches", op: "select" } });
    await expect(getCoachRoster("c")).rejects.toThrow(/co-coach/);
  });

  it("athlète pré-créé : message de la fonction serveur repris", async () => {
    const { invoked } = world({}, { fn: () => ({ data: { error: "Quota atteint" }, error: null }) });
    await expect(createPendingAthlete("Léa", "Démo")).rejects.toThrow("Quota atteint");
    expect(invoked).toEqual([{ fn: "pending-athlete", body: { action: "create", firstName: "Léa", lastName: "Démo" } }]);
    world({}, { fn: () => ({ data: { athleteId: "a1" }, error: null }) });
    expect(await createPendingAthlete("Léa", "Démo")).toBe("a1");
  });
});

describe("api/account — lien de première connexion, export, suppression", () => {
  it("getClaimToken / getClaimInfo : null quand le compte est déjà réclamé", async () => {
    world({ athlete_claims: [{ athlete_id: "a", token: "tok" }] }, {
      rpcs: { get_claim_info: (a) => (a.p_token === "tok" ? [{ first_name: "Léa", last_name: "Démo", coach_name: "Agon Démo", coach_code: "DEMO42" }] : []) },
    });
    expect(await getClaimToken("a")).toBe("tok");
    expect(await getClaimToken("b")).toBeNull();
    expect(await getClaimInfo("tok")).toMatchObject({ first_name: "Léa" });
    expect(await getClaimInfo("autre")).toBeNull();
  });

  it("claimAthleteAccount active puis connecte ; refus du serveur affiché tel quel", async () => {
    const w = world({}, { fn: () => ({ data: { ok: true }, error: null }) });
    await claimAthleteAccount("tok", "lea@demo.fr", "pw");
    expect(w.invoked[0]).toEqual({ fn: "claim-athlete", body: { token: "tok", email: "lea@demo.fr", password: "pw" } });
    expect(w.signIns).toEqual([{ email: "lea@demo.fr", password: "pw" }]);
    const w2 = world({}, { fn: () => ({ data: { error: "Email déjà utilisé" }, error: null }) });
    await expect(claimAthleteAccount("tok", "x@y.z", "pw")).rejects.toThrow("Email déjà utilisé");
    expect(w2.signIns).toEqual([]);
  });

  it("readOwnRows lit une table quelconque et lève si elle est illisible", async () => {
    world({ habits: [{ athlete_id: "a", name: "Eau" }, { athlete_id: "b", name: "Autre" }] });
    expect(await readOwnRows("habits", "athlete_id", "a")).toEqual([{ athlete_id: "a", name: "Eau" }]);
    world({}, { failOn: { table: "habits", op: "select" } });
    await expect(readOwnRows("habits", "athlete_id", "a")).rejects.toThrow(/Lecture de habits impossible/);
  });

  it("deleteAccount envoie le mot de confirmation, jamais un identifiant", async () => {
    const w = world({}, { fn: () => ({ data: { success: true, warnings: [] }, error: null }) });
    expect(await deleteAccount()).toEqual({ success: true, warnings: [] });
    expect(w.invoked).toEqual([{ fn: "delete-account", body: { confirm: "SUPPRIMER" } }]);
    world({}, { fn: () => ({ data: { success: false }, error: null }) });
    await expect(deleteAccount()).rejects.toThrow("La suppression n'a pas abouti");
  });
});
