import { describe, it, expect, afterEach, vi } from "vitest";
import { fakeDb, type FakeRpc, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  AccountError, accountKeys, claimAthleteAccount, coachCodeExists, coachPreviewByCode, createPendingAthlete,
  deleteAccount, ensureCoachCode, generateCoachCode, getClaimInfo, getClaimToken, getCoachRoster, getConsents,
  invalidateAccount, linkToCoachByCode, pickFreeCoachCode, readOwnRows, recordConsents,
  registerAthleteWithCode, registerCoach, registerStaff, reportClientBuild,
  coachInvitationLink, coachInvitationStatus, createCoachInvitation, getCoachInvitation, revokeCoachInvitation, serverReason, setCoachAthlete, setOwnCoach,
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

  const TOKEN = "t".repeat(64);
  const invitation = (status = "valide", email = "a@b.c") => () => [{ email, inviter_name: "Agon Démo", status }];

  it("registerCoach : invitation vérifiée, profil créé par la RPC register_coach", async () => {
    const asked: Record<string, unknown>[] = [];
    const w = world({}, { rpcs: { get_coach_invitation: invitation(), register_coach: (a) => (asked.push(a), "ABC234") } });
    await registerCoach(" A@B.c ", "motdepasse", "Agon Démo", "1990-04-12", true, TOKEN);
    expect(asked).toEqual([{ p_token: TOKEN, p_full_name: "Agon Démo", p_birth_date: "1990-04-12", p_coach_athlete: true }]);
    expect(w.signUps).toHaveLength(1);
    expect(w.tables.profiles ?? []).toHaveLength(0); // plus d'insertion directe
  });

  it("registerCoach : sans invitation valable ou avec un autre e-mail, refusé AVANT de créer le compte", async () => {
    let w = world({}, { rpcs: { get_coach_invitation: () => [] } });
    await expect(registerCoach("a@b.c", "motdepasse", "Coach", "1990-04-12", false, TOKEN)).rejects.toThrow("sur invitation");
    await expect(registerCoach("a@b.c", "motdepasse", "Coach", "1990-04-12", false, "")).rejects.toThrow("sur invitation");
    w = world({}, { rpcs: { get_coach_invitation: invitation("expiree") } });
    await expect(registerCoach("a@b.c", "motdepasse", "Coach", "1990-04-12", false, TOKEN)).rejects.toThrow("expiré");
    w = world({}, { rpcs: { get_coach_invitation: invitation("valide", "autre@b.c") } });
    await expect(registerCoach("a@b.c", "motdepasse", "Coach", "1990-04-12", false, TOKEN)).rejects.toThrow("autre@b.c");
    expect(w.signUps).toEqual([]);
  });

  it("registerAthleteWithCode : code inconnu refusé AVANT de créer le compte", async () => {
    const { tables } = world({}, { rpcs: { coach_code_exists: () => false } });
    await expect(registerAthleteWithCode("a@b.c", "motdepasse", "Léa", "1998-04-12", "zzz")).rejects.toThrow("Code coach invalide — vérifie auprès de ton coach");
    expect(tables.profiles ?? []).toHaveLength(0);
  });

  it("registerAthleteWithCode : profil et rattachement par la RPC register_athlete, message d'origine si elle refuse", async () => {
    const asked: Record<string, unknown>[] = [];
    const { tables } = world({}, { rpcs: { coach_code_exists: () => true, register_athlete: (a) => (asked.push(a), "coach") } });
    await registerAthleteWithCode("a@b.c", "motdepasse", "Léa Démo", "1998-04-12", "demo42");
    expect(asked).toEqual([{ p_coach_code: "DEMO42", p_full_name: "Léa Démo", p_birth_date: "1998-04-12" }]);
    expect(tables.profiles ?? []).toHaveLength(0);

    world({}, { rpcs: { coach_code_exists: () => true, register_athlete: raise("Code coach invalide — vérifie auprès de ton coach") } });
    await expect(registerAthleteWithCode("a@b.c", "motdepasse", "Léa", "1998-04-12", "X"))
      .rejects.toThrow("Code coach invalide — vérifie auprès de ton coach");
  });

  it("coachPreviewByCode : nom du coach, code normalisé, null si inconnu", async () => {
    const asked: unknown[] = [];
    world({}, { rpcs: { coach_preview_by_code: (a) => (asked.push(a.p_code), a.p_code === "DEMO42" ? "Agon Démo" : null) } });
    expect(await coachPreviewByCode(" demo42 ")).toBe("Agon Démo");
    expect(await coachPreviewByCode("zzzzzz")).toBeNull();
    expect(asked).toEqual(["DEMO42", "ZZZZZZ"]);
  });

  it("setCoachAthlete : passe le choix à la RPC et renvoie le rôle", async () => {
    const asked: unknown[] = [];
    world({}, { rpcs: { set_coach_athlete: (a) => (asked.push(a.p_enabled), a.p_enabled ? "coach_athlete" : "coach") } });
    expect(await setCoachAthlete(true)).toBe("coach_athlete");
    expect(await setCoachAthlete(false)).toBe("coach");
    expect(asked).toEqual([true, false]);
  });

  it("âge minimum : moins de 15 ans ou date absente refusés AVANT de créer le compte (tous les parcours)", async () => {
    const future = "2099-01-01";
    const today = new Date();
    const young = `${today.getFullYear() - 14}-01-01`;
    const w = world({}, { rpcs: { coach_code_exists: () => true } });
    const msg = "Tu dois avoir au moins 15 ans pour utiliser Agon.";
    await expect(registerCoach("a@b.c", "motdepasse", "Coach", young, false, TOKEN)).rejects.toThrow(msg);
    await expect(registerAthleteWithCode("a@b.c", "motdepasse", "Léa", young, "DEMO42")).rejects.toThrow(msg);
    await expect(registerStaff("a@b.c", "motdepasse", "Kiné", young, "kine", TOKEN)).rejects.toThrow(msg);
    await expect(claimAthleteAccount("tok", "a@b.c", "motdepasse", young)).rejects.toThrow(msg);
    await expect(registerCoach("a@b.c", "motdepasse", "Coach", "", false, TOKEN)).rejects.toThrow("Indique ta date de naissance.");
    await expect(registerStaff("a@b.c", "motdepasse", "Kiné", future, "kine", TOKEN)).rejects.toThrow("Date de naissance invalide.");
    expect(w.signUps).toEqual([]);
    expect(w.invoked).toEqual([]);
    expect(w.tables.profiles ?? []).toHaveLength(0);
  });

  it("registerStaff : profil staff par la RPC register_staff, avec l'invitation staff", async () => {
    const asked: Record<string, unknown>[] = [];
    const { tables } = world({}, { rpcs: { register_staff: (a) => (asked.push(a), "new") } });
    await registerStaff("k@b.c", "motdepasse", "Kiné Démo", "1985-06-01", "kine", TOKEN);
    expect(asked).toEqual([{ p_token: TOKEN, p_full_name: "Kiné Démo", p_birth_date: "1985-06-01", p_profession: "kine" }]);
    expect(tables.profiles ?? []).toHaveLength(0);
  });

  it("invitations coach : état, lien, création et révocation par RPC", async () => {
    expect(coachInvitationStatus({ usedAt: null, revokedAt: null, expiresAt: "2026-11-20T00:00:00Z" }, Date.parse("2026-11-16T00:00:00Z"))).toBe("valide");
    expect(coachInvitationStatus({ usedAt: null, revokedAt: null, expiresAt: "2026-11-10T00:00:00Z" }, Date.parse("2026-11-16T00:00:00Z"))).toBe("expiree");
    expect(coachInvitationStatus({ usedAt: "2026-11-12T00:00:00Z", revokedAt: null, expiresAt: "2026-11-10T00:00:00Z" })).toBe("utilisee");
    expect(coachInvitationStatus({ usedAt: null, revokedAt: "2026-11-12T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z" })).toBe("revoquee");
    expect(coachInvitationLink("https://agon-training.com", "abc")).toBe("https://agon-training.com/coach-invite/abc");
    const revoked: unknown[] = [];
    world({}, { rpcs: {
      create_coach_invitation: (a) => [{ id: "i1", token: TOKEN, email: String(a.p_email).trim().toLowerCase(), expires_at: "2026-11-23T00:00:00Z" }],
      revoke_coach_invitation: (a) => (revoked.push(a.p_id), null),
    } });
    const inv = await createCoachInvitation(" Coach@B.c ");
    expect(inv).toMatchObject({ id: "i1", token: TOKEN, email: "coach@b.c" });
    await revokeCoachInvitation("i1");
    expect(revoked).toEqual(["i1"]);
    world({}, { rpcs: { get_coach_invitation: invitation("utilisee") } });
    expect(await getCoachInvitation(TOKEN)).toEqual({ email: "a@b.c", inviterName: "Agon Démo", status: "utilisee" });
    expect(await getCoachInvitation("court")).toBeNull();
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
    await claimAthleteAccount("tok", "lea@demo.fr", "motdepasse", "1998-04-12");
    expect(w.invoked[0]).toEqual({
      fn: "claim-athlete", body: { token: "tok", email: "lea@demo.fr", password: "motdepasse", birthDate: "1998-04-12" },
    });
    expect(w.signIns).toEqual([{ email: "lea@demo.fr", password: "motdepasse" }]);
    const w2 = world({}, { fn: () => ({ data: { error: "Email déjà utilisé" }, error: null }) });
    await expect(claimAthleteAccount("tok", "x@y.z", "motdepasse", "1998-04-12")).rejects.toThrow("Email déjà utilisé");
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
