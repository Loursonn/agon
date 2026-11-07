/**
 * Parcours des fenêtres de dates, sans serveur COROS.
 *
 * La propriété vérifiée partout : `processedThrough` ne couvre que des jours
 * listés et téléchargés en entier. Une erreur arrête le parcours au bord de la
 * dernière fenêtre complète, jamais au-delà.
 */
import { describe, expect, it } from "vitest";
import type { FitListing, FitWindow } from "../../_shared/coros";
import { type IngestOutcome, type SweepDeps, sweepFitWindows } from "../sweep";

/** Un fichier par jour listé dans `files` (jour → nombre de fichiers). */
function harness(opts: {
  files?: Record<string, number>;
  quota?: number;
  failList?: (r: FitWindow) => FitListing | Error | null;
  failIngest?: (url: string) => IngestOutcome | null;
  time?: number;
  perCall?: number;
} = {}) {
  const files = opts.files ?? {};
  const perCall = opts.perCall ?? 10;
  let quota = opts.quota ?? 50;
  let ticks = opts.time ?? Infinity;
  const listed: FitWindow[] = [];
  const ingested: string[] = [];
  let exhausted = false;

  const deps: SweepDeps = {
    async list(r) {
      listed.push(r);
      const forced = opts.failList?.(r);
      if (forced instanceof Error) throw forced;
      if (forced) return forced;
      const urls: string[] = [];
      for (const [day, n] of Object.entries(files)) {
        if (day >= r.from && day <= r.to) for (let i = 0; i < n; i++) urls.push(`https://cdn/${day}-${i}.fit`);
      }
      // COROS rend au plus `perCall` URL par appel : au-delà, la liste est tronquée.
      const page = urls.slice(0, perCall);
      return page.length ? { kind: "urls", urls: page } : { kind: "empty" };
    },
    async quotaRemaining() {
      return quota;
    },
    async reserve(n) {
      if (n > quota) return false;
      quota -= n;
      return true;
    },
    async exhaustQuota() {
      exhausted = true;
      quota = 0;
    },
    async ingest(url) {
      ingested.push(url);
      return opts.failIngest?.(url) ?? { kind: "ok", imported: 1, duplicates: 0, rejected: [] };
    },
    hasTime() {
      return ticks-- > 0;
    },
  };
  return { deps, listed, ingested, get exhausted() { return exhausted; }, get quota() { return quota; } };
}

const OPTS = { span: 30, perCall: 10, budget: 50 };

describe("sweepFitWindows — cas nominaux", () => {
  it("période vide : couverte entièrement, sans consommer de quota", async () => {
    const h = harness();
    const r = await sweepFitWindows(h.deps, "2026-01-01", "2026-03-31", OPTS);
    expect(r).toMatchObject({ stop: "done", processedThrough: "2026-03-31", used: 0 });
  });

  it("télécharge chaque fichier une fois et couvre la plage", async () => {
    const h = harness({ files: { "2026-11-02": 1, "2026-11-05": 2 } });
    const r = await sweepFitWindows(h.deps, "2026-11-01", "2026-11-07", OPTS);
    expect(r).toMatchObject({ stop: "done", processedThrough: "2026-11-07", imported: 3, used: 3 });
    expect(h.ingested).toHaveLength(3);
  });
});

describe("sweepFitWindows — liste tronquée à 10 par appel", () => {
  it("resserre la fenêtre au lieu de prendre les 10 premiers et sauter le reste", async () => {
    const files: Record<string, number> = {};
    for (let d = 1; d <= 15; d++) files[`2026-10-${String(d).padStart(2, "0")}`] = 1;
    const h = harness({ files });
    const r = await sweepFitWindows(h.deps, "2026-10-01", "2026-10-30", OPTS);
    expect(r.stop).toBe("done");
    expect(r.imported).toBe(15);
    expect(new Set(h.ingested).size).toBe(15);
    expect(r.processedThrough).toBe("2026-10-30");
  });

  it("un seul jour avec 10 fichiers ou plus : accepté, mais signalé", async () => {
    const h = harness({ files: { "2026-10-05": 12 } });
    const r = await sweepFitWindows(h.deps, "2026-10-05", "2026-10-05", OPTS);
    expect(r.imported).toBe(10);
    expect(r.warnings[0]).toMatch(/2026-10-05.*maximum par appel/);
  });
});

describe("sweepFitWindows — erreurs (C2)", () => {
  it("panne de transport : arrêt, rien au-delà de la dernière fenêtre complète", async () => {
    const h = harness({
      failList: (r) => (r.from >= "2026-02-01" ? new Error("ECONNRESET") : null),
    });
    const r = await sweepFitWindows(h.deps, "2026-01-01", "2026-03-31", { ...OPTS, span: 31 });
    expect(r.stop).toBe("error");
    expect(r.processedThrough).toBe("2026-01-31");
    expect(r.error).toMatch(/injoignable.*ECONNRESET/);
  });

  it("refus COROS en prose : erreur lisible, curseur non avancé", async () => {
    const h = harness({ failList: () => ({ kind: "error", reason: "Invalid parameter startDate", quota: false }) });
    const r = await sweepFitWindows(h.deps, "2026-01-01", "2026-01-31", OPTS);
    expect(r).toMatchObject({ stop: "error", processedThrough: null });
    expect(r.error).toMatch(/refusé la liste.*Invalid parameter/);
  });

  it("quota signalé par COROS : arrêt et journée marquée épuisée", async () => {
    const h = harness({ failList: () => ({ kind: "error", reason: "quota exceeded", quota: true }) });
    const r = await sweepFitWindows(h.deps, "2026-01-01", "2026-01-31", OPTS);
    expect(r.stop).toBe("quota");
    expect(h.exhausted).toBe(true);
  });

  it("téléchargement en échec : la fenêtre n'est pas comptée comme traitée", async () => {
    const h = harness({
      files: { "2026-01-10": 1, "2026-02-10": 1 },
      failIngest: (u) => (u.includes("2026-02-10") ? { kind: "retry", reason: "téléchargement refusé (503)" } : null),
    });
    const r = await sweepFitWindows(h.deps, "2026-01-01", "2026-03-31", { ...OPTS, span: 31 });
    expect(r.stop).toBe("error");
    expect(r.processedThrough).toBe("2026-01-31");
    expect(r.imported).toBe(1);
  });

  it("429 au téléchargement : quota épuisé, pas de trou", async () => {
    const h = harness({
      files: { "2026-01-10": 1 },
      failIngest: () => ({ kind: "retry", reason: "téléchargement refusé (429)", quota: true }),
    });
    const r = await sweepFitWindows(h.deps, "2026-01-01", "2026-01-31", OPTS);
    expect(r).toMatchObject({ stop: "quota", processedThrough: null });
    expect(h.exhausted).toBe(true);
  });

  it("fichier illisible (refus définitif) : nommé, mais la fenêtre avance", async () => {
    const h = harness({
      files: { "2026-01-10": 1 },
      failIngest: () => ({ kind: "ok", imported: 0, duplicates: 0, rejected: [{ name: "x.fit", reason: "pas un FIT" }] }),
    });
    const r = await sweepFitWindows(h.deps, "2026-01-01", "2026-01-31", OPTS);
    expect(r).toMatchObject({ stop: "done", processedThrough: "2026-01-31" });
    expect(r.rejected).toHaveLength(1);
  });
});

describe("sweepFitWindows — quota et budget (C3)", () => {
  it("s'arrête avant le quota et reprendra au même bord", async () => {
    const files: Record<string, number> = {};
    for (let d = 1; d <= 28; d++) files[`2026-02-${String(d).padStart(2, "0")}`] = 2; // 56 fichiers
    const h = harness({ files, quota: 50 });
    const r = await sweepFitWindows(h.deps, "2026-02-01", "2026-02-28", OPTS);
    expect(r.stop).toBe("quota");
    expect(r.used).toBeLessThanOrEqual(50);
    expect(h.ingested.length).toBe(r.used);
    // Le bord est le dernier jour dont tous les fichiers ont été pris.
    const lastDay = r.processedThrough!;
    expect(h.ingested.every((u) => u.slice(12, 22) <= lastDay)).toBe(true);
    expect(h.ingested.filter((u) => u.slice(12, 22) <= lastDay)).toHaveLength(Object.entries(files).filter(([d]) => d <= lastDay).length * 2);
  });

  it("quota déjà consommé par le bouton manuel : le cron n'en prend que le reste", async () => {
    const h = harness({ files: { "2026-02-01": 3, "2026-02-02": 3 }, quota: 4 });
    const r = await sweepFitWindows(h.deps, "2026-02-01", "2026-02-02", OPTS);
    expect(r).toMatchObject({ stop: "quota", processedThrough: "2026-02-01", used: 3 });
  });

  it("budget manuel de 10 : arrêt « budget », pas « quota »", async () => {
    const h = harness({ files: { "2026-02-01": 6, "2026-02-02": 6 } });
    const r = await sweepFitWindows(h.deps, "2026-02-01", "2026-02-02", { ...OPTS, budget: 10 });
    expect(r).toMatchObject({ stop: "budget", processedThrough: "2026-02-01", used: 6 });
  });

  it("quota à zéro : les périodes vides avancent quand même (lister est gratuit)", async () => {
    const h = harness({ files: { "2026-03-20": 1 }, quota: 0 });
    const r = await sweepFitWindows(h.deps, "2026-03-01", "2026-03-31", OPTS);
    expect(r.stop).toBe("quota");
    expect(r.processedThrough).toBe("2026-03-19");
    expect(h.ingested).toHaveLength(0);
  });
});

describe("sweepFitWindows — temps", () => {
  it("s'arrête proprement avant d'être coupé", async () => {
    // Une seule fenêtre avant l'échéance.
    const h = harness({ time: 1 });
    const r = await sweepFitWindows(h.deps, "2026-01-01", "2026-12-31", { ...OPTS, span: 30 });
    expect(r.stop).toBe("deadline");
    expect(r.processedThrough).toBe("2026-01-30");
  });
});
