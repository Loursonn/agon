/**
 * Curseur, recouvrement, lecture des réponses et paramètres de dates.
 *
 * Chaque cas ici correspond à une façon de perdre une sortie sans le savoir :
 * curseur avancé sur une journée pas finie (C1), erreur prise pour une liste
 * vide (C2), paramètre de date mal nommé ignoré par le serveur (C4), refus
 * passager pris pour une révocation (C5).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDateArgs,
  classifyFitListing,
  CorosSchemaError,
  CorosTokenError,
  isRefreshRejected,
  lastSettledDay,
  nextSyncedThrough,
  planSync,
  refreshTokens,
  resolveDateArgs,
} from "../coros";

afterEach(() => {
  vi.unstubAllGlobals();
});

// ───────────────────────────── C1 : curseur ──────────────────────────────────

describe("lastSettledDay", () => {
  const night = new Date("2026-11-07T03:40:00Z");

  it("fuseau inconnu : jamais la veille UTC, qui n'est pas finie aux Amériques", () => {
    // Le 6 novembre se termine le 7 à 12:00 UTC en UTC−12.
    expect(lastSettledDay(night)).toBe("2026-11-05");
    expect(lastSettledDay(new Date("2026-11-07T12:00:00Z"))).toBe("2026-11-06");
  });

  it("fuseau connu (Paris, UTC+1) : la veille locale", () => {
    expect(lastSettledDay(night, 3600)).toBe("2026-11-06");
  });

  it("fuseau connu (New York, UTC−5) : à 3 h 40 UTC il est 22 h 40 la veille", () => {
    expect(lastSettledDay(night, -5 * 3600)).toBe("2026-11-05");
  });

  it("un décalage invraisemblable est ignoré", () => {
    expect(lastSettledDay(night, 99 * 3600)).toBe("2026-11-05");
    expect(lastSettledDay(night, Number.NaN)).toBe("2026-11-05");
  });
});

describe("planSync", () => {
  const base = { historyStart: "2025-11-07", today: "2026-11-07", settled: "2026-11-06", rescanDays: 2 };

  it("régime établi : relit les deux derniers jours terminés + hier + aujourd'hui, pas de rattrapage", () => {
    const plan = planSync({ ...base, syncedThrough: "2026-11-05" });
    expect(plan.recent).toEqual({ from: "2026-11-04", to: "2026-11-07" });
    expect(plan.backfill).toBeNull();
  });

  it("première synchronisation : la fenêtre récente d'abord, puis tout l'historique jusqu'à elle", () => {
    const plan = planSync({ ...base, syncedThrough: null });
    expect(plan.recent.from).toBe("2026-11-04");
    expect(plan.backfill).toEqual({ from: "2025-11-07", to: "2026-11-03" });
  });

  it("après une nuit en panne : le trou est rattrapé", () => {
    const plan = planSync({ ...base, syncedThrough: "2026-10-30" });
    expect(plan.backfill).toEqual({ from: "2026-10-31", to: "2026-11-03" });
  });

  it("ne relit pas avant le début de l'historique", () => {
    const plan = planSync({ ...base, historyStart: "2026-11-06", syncedThrough: null });
    expect(plan.recent.from).toBe("2026-11-06");
    expect(plan.backfill).toBeNull();
  });
});

describe("nextSyncedThrough", () => {
  const base = { historyStart: "2025-11-07", today: "2026-11-07", settled: "2026-11-06", rescanDays: 2 };

  it("ne dépasse jamais le dernier jour terminé, même si aujourd'hui a été lu", () => {
    const plan = planSync({ ...base, syncedThrough: "2026-11-05" });
    expect(nextSyncedThrough(plan, { backfillThrough: null, recentThrough: "2026-11-07" })).toBe("2026-11-06");
  });

  it("n'avance pas si la fenêtre récente a échoué", () => {
    const plan = planSync({ ...base, syncedThrough: "2026-11-05" });
    expect(nextSyncedThrough(plan, { backfillThrough: null, recentThrough: null })).toBe("2026-11-05");
  });

  it("rattrapage partiel : avance jusqu'à la dernière fenêtre complète, pas au-delà", () => {
    const plan = planSync({ ...base, syncedThrough: null });
    expect(nextSyncedThrough(plan, { backfillThrough: "2026-01-15", recentThrough: "2026-11-07" })).toBe("2026-01-15");
  });

  it("fenêtre récente lue mais rattrapage incomplet : pas de saut par-dessus le trou", () => {
    const plan = planSync({ ...base, syncedThrough: "2026-10-01" });
    expect(nextSyncedThrough(plan, { backfillThrough: null, recentThrough: "2026-11-07" })).toBe("2026-10-01");
  });

  it("rattrapage terminé et fenêtre récente lue : jusqu'au dernier jour terminé", () => {
    const plan = planSync({ ...base, syncedThrough: "2026-10-01" });
    expect(nextSyncedThrough(plan, { backfillThrough: "2026-11-03", recentThrough: "2026-11-07" })).toBe("2026-11-06");
  });

  it("rien de couvert à la première synchronisation : reste null", () => {
    const plan = planSync({ ...base, syncedThrough: null });
    expect(nextSyncedThrough(plan, { backfillThrough: null, recentThrough: null })).toBeNull();
  });

  it("ne recule jamais", () => {
    const plan = planSync({ ...base, syncedThrough: "2026-11-06", settled: "2026-11-05" });
    expect(nextSyncedThrough(plan, { backfillThrough: null, recentThrough: "2026-11-07" })).toBe("2026-11-06");
  });
});

// ─────────────────────── C2 : vide ou erreur ? ───────────────────────────────

describe("classifyFitListing", () => {
  it("des URL dans une réponse normale", () => {
    const r = classifyFitListing({ isError: false, text: "1. https://cdn.coros.com/a.fit\n2. https://cdn.coros.com/b.fit" });
    expect(r).toEqual({ kind: "urls", urls: ["https://cdn.coros.com/a.fit", "https://cdn.coros.com/b.fit"] });
  });

  it("une vraie réponse vide", () => {
    expect(classifyFitListing({ isError: false, text: "No activities found in this period." }).kind).toBe("empty");
    expect(classifyFitListing({ isError: false, text: "" }).kind).toBe("empty");
    expect(classifyFitListing({ isError: true, text: "No FIT files found for the given dates" }).kind).toBe("empty");
  });

  it("le quota, même sans isError, est une erreur signalée comme telle", () => {
    const r = classifyFitListing({ isError: false, text: "Daily download quota exceeded (50 files / 24h)." });
    expect(r).toMatchObject({ kind: "error", quota: true });
  });

  it("un paramètre refusé est une erreur, pas une liste vide", () => {
    expect(classifyFitListing({ isError: true, text: "Invalid parameter startDate" })).toMatchObject({ kind: "error", quota: false });
    expect(classifyFitListing({ isError: false, text: "Error: missing required field endDate" })).toMatchObject({ kind: "error" });
  });

  it("isError sans message ressemblant à du vide : erreur", () => {
    expect(classifyFitListing({ isError: true, text: "" })).toMatchObject({ kind: "error", reason: "erreur sans message" });
    expect(classifyFitListing({ isError: true, text: "No data: invalid token" }).kind).toBe("error");
  });
});

// ───────────────────── C4 : paramètres publiés ───────────────────────────────

describe("resolveDateArgs", () => {
  it("lit les noms documentés quand le schéma les publie", () => {
    const spec = resolveDateArgs({
      name: "queryActivityFitFileDownloadUrls",
      inputSchema: {
        type: "object",
        properties: { startDate: { type: "string", description: "YYYY-MM-DD" }, endDate: { type: "string" }, limit: { type: "integer" } },
        required: ["startDate", "endDate"],
      },
    });
    expect(spec).toMatchObject({ start: "startDate", end: "endDate", format: "iso", limitKey: "limit" });
    expect(buildDateArgs(spec, "2026-11-01", "2026-11-07", 10)).toEqual({ startDate: "2026-11-01", endDate: "2026-11-07", limit: 10 });
  });

  it("s'adapte à un autre nom et au format compact entier (habitude des API COROS)", () => {
    const spec = resolveDateArgs({
      name: "t",
      inputSchema: { properties: { startDay: { type: "integer", description: "yyyyMMdd" }, endDay: { type: "integer" } } },
    });
    expect(spec).toMatchObject({ start: "startDay", end: "endDay", format: "int", limitKey: null });
    expect(buildDateArgs(spec, "2026-11-01", "2026-11-07", 10)).toEqual({ startDay: 20261101, endDay: 20261107 });
  });

  it("format compact en chaîne, détecté par le motif", () => {
    const spec = resolveDateArgs({
      name: "t",
      inputSchema: { properties: { start_date: { type: "string", pattern: "^\\d{8}$" }, end_date: { type: "string", pattern: "^\\d{8}$" } } },
    });
    expect(buildDateArgs(spec, "2026-11-01", "2026-11-07")).toEqual({ start_date: "20261101", end_date: "20261107" });
  });

  it("n'envoie pas de `limit` que le schéma ne publie pas", () => {
    const spec = resolveDateArgs({ name: "t", inputSchema: { properties: { from: { type: "string" }, to: { type: "string" } } } });
    expect(buildDateArgs(spec, "2026-11-01", "2026-11-07", 10)).toEqual({ from: "2026-11-01", to: "2026-11-07" });
  });

  it("erreur explicite si le schéma n'est pas publié", () => {
    expect(() => resolveDateArgs({ name: "t" })).toThrow(CorosSchemaError);
    expect(() => resolveDateArgs({ name: "t", inputSchema: { properties: {} } })).toThrow(/ne publie pas/);
  });

  it("erreur explicite si les paramètres de dates sont absents", () => {
    expect(() => resolveDateArgs({ name: "t", inputSchema: { properties: { activityId: { type: "string" } } } }))
      .toThrow(/introuvables.*activityId/);
  });

  it("erreur explicite sur un paramètre obligatoire inconnu", () => {
    expect(() =>
      resolveDateArgs({
        name: "t",
        inputSchema: { properties: { startDate: {}, endDate: {}, userId: {} }, required: ["startDate", "endDate", "userId"] },
      })
    ).toThrow(/userId/);
  });

  it("outil « un jour » : accepté pour les données quotidiennes, refusé pour les FIT", () => {
    const tool = { name: "queryDailyActivity", inputSchema: { properties: { date: { type: "string" } }, required: ["date"] } };
    expect(() => resolveDateArgs(tool)).toThrow(/introuvables/);
    const spec = resolveDateArgs(tool, { allowSingleDay: true });
    expect(buildDateArgs(spec, "2026-11-06", "2026-11-06")).toEqual({ date: "2026-11-06" });
    expect(() => buildDateArgs(spec, "2026-11-01", "2026-11-06")).toThrow(/un jour/);
  });

  it("refuse de deviner un horodatage", () => {
    expect(() =>
      resolveDateArgs({ name: "t", inputSchema: { properties: { startTime: { type: "integer" }, endTime: { type: "integer" } } } })
    ).toThrow(/horodatage/);
  });
});

// ─────────────────── C5 : refus définitif ou passager ────────────────────────

const meta = {
  issuer: "https://mcpeu.coros.com",
  authorization_endpoint: "https://mcpeu.coros.com/oauth2/authorize",
  token_endpoint: "https://mcpeu.coros.com/oauth2/token",
};

function stubToken(body: string, status: number) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: status < 300, status, text: () => Promise.resolve(body) }));
}

async function refreshError(): Promise<unknown> {
  try {
    await refreshTokens(meta, { refreshToken: "r", clientId: "c" });
  } catch (e) {
    return e;
  }
  throw new Error("aurait dû échouer");
}

describe("isRefreshRejected", () => {
  it("invalid_grant : reconnexion nécessaire", async () => {
    stubToken('{"error":"invalid_grant","error_description":"expired"}', 400);
    const e = await refreshError();
    expect(e).toBeInstanceOf(CorosTokenError);
    expect(isRefreshRejected(e)).toBe(true);
  });

  it("invalid_grant en texte brut aussi", async () => {
    stubToken("invalid_grant", 400);
    expect(isRefreshRejected(await refreshError())).toBe(true);
  });

  it("5xx : passager", async () => {
    stubToken("<html>Bad gateway</html>", 502);
    expect(isRefreshRejected(await refreshError())).toBe(false);
  });

  it("429 / temporarily_unavailable : passager", async () => {
    stubToken('{"error":"temporarily_unavailable"}', 429);
    expect(isRefreshRejected(await refreshError())).toBe(false);
  });

  it("panne réseau : passager", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(isRefreshRejected(await refreshError())).toBe(false);
  });

  it("réponse 200 illisible : erreur nommée, passagère", async () => {
    stubToken("<html>maintenance</html>", 200);
    const e = await refreshError();
    expect(String(e)).toMatch(/illisible/);
    expect(isRefreshRejected(e)).toBe(false);
  });
});
