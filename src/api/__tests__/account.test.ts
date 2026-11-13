import { describe, it, expect, afterEach, vi } from "vitest";
import { fakeDb, type FakeRpc, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  AccountError, accountKeys, claimAthleteAccount, coachCodeExists, coachPreviewByCode, createPendingAthlete,
  deleteAccount, ensureCoachCode, generateCoachCode, getClaimInfo, getClaimToken, getCoachRoster, getConsents,
  invalidateAccount, linkToCoachByCode, pickFreeCoachCode, readOwnRows, recordConsents,
  registerAthleteWithCode, registerCoach, registerStaff, reportClientBuild, serverReason, setOwnCoach,
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
  const signUps: unknown[] = [];
  const db = {
    ...base.db,
    functions: {
      invoke: (fn: string, opts: { body: unknown }) => {
        invoked.push({ fn, body: opts.body });
        return Promise.resolve(o.fn?.(fn, opts.body) ?? { data: null, error: null });
      },
    },
    auth: {
      signUp: (a: unknown) => (signUps.push(a), Promise.resolve({ data: { user: o.user === undefined ? { id: "new" } : o.user, session: null }, error: null })),
      signInWithPassword: (a: unknown) => (signIns.push(a), Promise.resolve({ data: { session: {}, user: {} }, error: null })),
    },
  };
  setDbForTests(db);
  return { tables: base.tables, invoked, signIns, signUps };
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
    await registerCoach("a@b.c", "pw", "Agon Démo", "1990-04-12", true);
    expect(tables.profiles[0]).toMatchObject({
      id: "new", role: "coach_athlete", full_name: "Agon Démo", coach_id: "new", birth_date: "1990-04-12",
    });
    expect(tables.profiles[0].coach_code).toMatch(/^[A-Z2-9]{6}$/);
  });

  it("registerAthleteWithCode : code inconnu refusé AVANT de créer le compte", async () => {
    const { tables } = world({}, { rpcs: { coach_code_exists: () => false } });
    await expect(registerAthleteWithCode("a@b.c", "pw", "Léa", "1998-04-12", "zzz")).rejects.toThrow("Code coach invalide — vérifie auprès de ton coach");
    expect(tables.profiles ?? []).toHaveLength(0);
  });

  it("registerAthleteWithCode : rattachement par la RPC, message d'origine si elle refuse", async () => {
    const linked: unknown[] = [];
    const { tables } = world({}, { rpcs: { coach_code_exists: () => true, link_to_coach_by_code: (a) => (linked.push(a.p_code), "coach") } });
    await registerAthleteWithCode("a@b.c", "pw", "Léa Démo", "1998-04-12", "demo42");
    expect(tables.profiles[0]).toEqual(expect.objectContaining({ id: "new", role: "athlete", full_name: "Léa Démo", birth_date: "1998-04-12" }));
    expect(tables.profiles[0].coach_id).toBeUndefined();
    expect(linked).toEqual(["DEMO42"]);

    world({}, { rpcs: { coach_code_exists: () => true, link_to_coach_by_code: raise("Code coach invalide") } });
    await expect(registerAthleteWithCode("a@b.c", "pw", "Léa", "1998-04-12", "X"))
      .rejects.toThrow("Compte créé, mais le rattachement au coach a échoué : Code coach invalide");
  });

  it("coachPreviewByCode : nom du coach, code normalisé, null si inconnu", async () => {
    const asked: unknown[] = [];
    world({}, { rpcs: { coach_preview_by_code: (a) => (asked.push(a.p_code), a.p_code === "DEMO42" ? "Agon Démo" : null) } });
    expect(await coachPreviewByCode(" demo42 ")).toBe("Agon Démo");
    expect(await coachPreviewByCode("zzzzzz")).toBeNull();
    expect(asked).toEqual(["DEMO42", "ZZZZZZ"]);
  });

  it("âge minimum : moins de 15 ans ou date absente refusés AVANT de créer le compte (tous les parcours)", async () => {
    const future = "2099-01-01";
    const today = new Date();
    const young = `${today.getFullYear() - 14}-01-01`;
    const w = world({}, { rpcs: { coach_code_exists: () => true } });
    const msg = "Tu dois avoir au moins 15 ans pour utiliser Agon.";
    await expect(registerCoach("a@b.c", "pw", "Coach", young)).rejects.toThrow(msg);
    await expect(registerAthleteWithCode("a@b.c", "pw", "Léa", young, "DEMO42")).rejects.toThrow(msg);
    await expect(registerStaff("a@b.c", "pw", "Kiné", young, "kine")).rejects.toThrow(msg);
    await expect(claimAthleteAccount("tok", "a@b.c", "pw", young)).rejects.toThrow(msg);
    await expect(registerCoach("a@b.c", "pw", "Coach", "")).rejects.toThrow("Indique ta date de naissance.");
    await expect(registerStaff("a@b.c", "pw", "Kiné", future, "kine")).rejects.toThrow("Date de naissance invalide.");
    expect(w.signUps).toEqual([]);
    expect(w.invoked).toEqual([]);
    expect(w.tables.profiles ?? []).toHaveLength(0);
  });

  it("registerStaff : profil staff avec date de naissance et métier", async () => {
    const { tables } = world();
    await registerStaff("k@b.c", "pw", "Kiné Démo", "1985-06-01", "kine");
    expect(tables.profiles[0]).toMatchObject({ id: "new", role: "staff", full_name: "Kiné Démo", birth_date: "1985-06-01", profession: "kine" });
  });

  it("linkToCoachByCode : AccountError dont `reason` garde le message du serveur", async () => {
    world({}, { rpcs: { link_to_coach_by_code: raise("Tu ne peux pas entrer ton propre code coach") } });
    const e = await linkToCoachByCode("abc").catch((x) => x);
    expect(e).toBeInstanceOf(AccountError);
    expect(serverReason(e)).toBe("Tu ne peux pas entrer ton propre code coach");
  });

  it("setOwnCoach : par la RPC set_own_coach, seulement null ou soi-même", async () => {
    const calls: unknown[] = [];
    const set_own_coach: FakeRpc = (a, t) => {
      calls.push(a.p_coach);
      t.profiles[0].coach_id = a.p_coach;
      return a.p_coach;
    };
    const { tables } = world({ profiles: [{ id: "u", coach_id: "c" }] }, { rpcs: { set_own_coach } });
    await setOwnCoach("u", null);
    expect(tables.profiles[0].coach_id).toBeNull();
    await setOwnCoach("u", "u");
    expect(tables.profiles[0].coach_id).toBe("u");
    await expect(setOwnCoach("u", "autre")).rejects.toThrow(/passer par le code coach/);
    expect(calls).toEqual([null, "u"]);
    expect(tables.profiles[0].coach_id).toBe("u");
  });

  it("setOwnCoach : refus de la RPC remonté, sans écriture directe", async () => {
    const { tables } = world({ profiles: [{ id: "u", coach_id: "c" }] }, { rpcs: { set_own_coach: raise("Seul un coach peut être son propre coach") } });
    await expect(setOwnCoach("u", "u")).rejects.toThrow(/Seul un coach/);
    expect(tables.profiles[0].coach_id).toBe("c");
  });

  it("setOwnCoach : refus de la RPC remonté, pas d'écriture directe", async () => {
    const base = fakeDb({ profiles: [{ id: "u", coach_id: "c" }] });
    setDbForTests({
      ...base.db,
      rpc: () => Promise.resolve({ data: null, error: { message: "refusé", code: "42501" } }),
    });
    await expect(setOwnCoach("u", null)).rejects.toThrow();
    expect(base.tables.profiles[0].coach_id).toBe("c");
  });

  it("reportClientBuild : appelle la RPC report_client_build avec le build", async () => {
    const seen: unknown[] = [];
    const report_client_build: FakeRpc = (a) => { seen.push(a.p_build); return null; };
    world({}, { rpcs: { report_client_build } });
    await reportClientBuild("abc123");
    expect(seen).toEqual(["abc123"]);
  });

  it("reportClientBuild : refus de la RPC remonté", async () => {
    setDbForTests({ rpc: () => Promise.resolve({ data: null, error: { message: "Non connecté", code: "42501" } }) });
    await expect(reportClientBuild("abc")).rejects.toThrow(/Non connecté/);
  });

  it("ensureCoachCode : code tiré et enregistré ; rien si déjà là ou pas coach", async () => {
    const { tables } = world({ profiles: [{ id: "c", role: "coach", coach_code: null }] });
    const p = await ensureCoachCode({ id: "c", role: "coach", coach_code: null } as Profile);
    expect(p.coach_code).toMatch(/^[A-Z2-9]{6}$/);
    expect(tables.profiles[0].coach_code).toBe(p.coach_code);
    const athlete = { id: "a", role: "athlete", coach_code: null } as Profile;
    expect(await ensureCoachCode(athlete)).toBe(athlete);
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
    await claimAthleteAccount("tok", "lea@demo.fr", "pw", "1998-04-12");
    expect(w.invoked[0]).toEqual({
      fn: "claim-athlete", body: { token: "tok", email: "lea@demo.fr", password: "pw", birthDate: "1998-04-12" },
    });
    expect(w.signIns).toEqual([{ email: "lea@demo.fr", password: "pw" }]);
    const w2 = world({}, { fn: () => ({ data: { error: "Email déjà utilisé" }, error: null }) });
    await expect(claimAthleteAccount("tok", "x@y.z", "pw", "1998-04-12")).rejects.toThrow("Email déjà utilisé");
    expect(w2.signIns).toEqual([]);
  });

  it("readOwnRows lit une table quelconque et lève si elle est illisible", async () => {
    world({ habits: [{ athlete_id: "a", name: "Eau" }, { athlete_id: "b", name: "Autre" }] });
    expect(await readOwnRows("habits", "athlete_id", "a")).toEqual([{ athlete_id: "a", name: "Eau" }]);
    world({}, { failOn: { table: "habits", op: "select" } });
    await expect(readOwnRows("habits", "athlete_id", "a")).rejects.toThrow(/Lecture de habits impossible/);
  });

  it("readOwnRows transmet la liste de colonnes (secrets écartés côté requête)", async () => {
    const selected: string[] = [];
    const base = fakeDb({ coach_api_keys: [{ id: "k", coach_id: "c" }] });
    setDbForTests({
      ...base.db,
      from: (t: string) => {
        const q = base.db.from(t);
        return { ...q, select: (cols: string) => (selected.push(cols), q.select(cols)) };
      },
    });
    await readOwnRows("coach_api_keys", "coach_id", "c", "id, name");
    await readOwnRows("coach_api_keys", "coach_id", "c");
    expect(selected).toEqual(["id, name", "*"]);
  });

  it("deleteAccount envoie le mot de confirmation, jamais un identifiant", async () => {
    const w = world({}, { fn: () => ({ data: { success: true, warnings: [] }, error: null }) });
    expect(await deleteAccount()).toEqual({ success: true, warnings: [] });
    expect(w.invoked).toEqual([{ fn: "delete-account", body: { confirm: "SUPPRIMER" } }]);
    world({}, { fn: () => ({ data: { success: false }, error: null }) });
    await expect(deleteAccount()).rejects.toThrow("La suppression n'a pas abouti");
  });
});
