import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  draftKey, saveDraft, loadDraft, clearDraft, markDraftSynced, pruneOldDrafts,
  workoutDraftKey, energyDraftKey, wellnessDraftKey,
} from "@/lib/localDraft";

describe("localDraft", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("préfixe les clés par l'athlète (pas de fuite entre comptes)", () => {
    expect(workoutDraftKey("a1", "log1")).toBe("agon:draft:a1:workout:log1");
    expect(workoutDraftKey("a1", "log1")).not.toBe(workoutDraftKey("a2", "log1"));
    expect(energyDraftKey("a1", "x")).toBe(draftKey("a1", "energy", "x"));
    expect(wellnessDraftKey("a1", "20261107")).toBe("agon:draft:a1:wellness:20261107");
  });

  it("aller-retour save → load, non synchronisé par défaut", () => {
    const k = workoutDraftKey("a1", "log1");
    expect(saveDraft(k, { sessionSets: { e1: [{ kg: "80" }] } })).toBe(true);
    const d = loadDraft<{ sessionSets: unknown }>(k);
    expect(d?.value).toEqual({ sessionSets: { e1: [{ kg: "80" }] } });
    expect(d?.synced).toBe(false);
    expect(typeof d?.updatedAt).toBe("number");
  });

  it("clearDraft supprime le brouillon", () => {
    const k = draftKey("a1", "s", "1");
    saveDraft(k, 1);
    clearDraft(k);
    expect(loadDraft(k)).toBeNull();
  });

  it("markDraftSynced ne marque que si la valeur n'a pas changé depuis l'envoi", () => {
    const k = draftKey("a1", "s", "1");
    saveDraft(k, { v: 1 });
    markDraftSynced(k, { v: 0 }); // valeur envoyée ≠ brouillon actuel (saisie plus récente)
    expect(loadDraft(k)?.synced).toBe(false);
    markDraftSynced(k, { v: 1 });
    expect(loadDraft(k)?.synced).toBe(true);
    // Nouvelle saisie → redevient non synchronisé
    saveDraft(k, { v: 2 });
    expect(loadDraft(k)?.synced).toBe(false);
  });

  it("ignore un brouillon trop ancien", () => {
    const k = draftKey("a1", "s", "1");
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now - 3 * 24 * 3600 * 1000);
    saveDraft(k, 1);
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(loadDraft(k, { maxAgeMs: 24 * 3600 * 1000 })).toBeNull();
    expect(loadDraft(k, { maxAgeMs: 7 * 24 * 3600 * 1000 })?.value).toBe(1);
  });

  it("JSON corrompu → null, sans lever", () => {
    const k = draftKey("a1", "s", "1");
    localStorage.setItem(k, "{pas du json");
    expect(loadDraft(k)).toBeNull();
    localStorage.setItem(k, JSON.stringify({ foo: 1 }));
    expect(loadDraft(k)).toBeNull();
  });

  it("localStorage qui lève (navigation privée, quota) → aucune exception", () => {
    const k = draftKey("a1", "s", "1");
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("QuotaExceeded"); });
    vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new Error("SecurityError"); });
    vi.spyOn(localStorage, "removeItem").mockImplementation(() => { throw new Error("SecurityError"); });
    expect(saveDraft(k, 1)).toBe(false);
    expect(loadDraft(k)).toBeNull();
    expect(() => clearDraft(k)).not.toThrow();
    expect(() => markDraftSynced(k, 1)).not.toThrow();
  });

  it("pruneOldDrafts supprime les vieux brouillons Agon et seulement eux", () => {
    const now = Date.now();
    localStorage.setItem("autre:cle", "x");
    vi.spyOn(Date, "now").mockReturnValue(now - 30 * 24 * 3600 * 1000);
    saveDraft(draftKey("a1", "s", "old"), 1);
    vi.spyOn(Date, "now").mockReturnValue(now);
    saveDraft(draftKey("a1", "s", "new"), 2);
    pruneOldDrafts(14 * 24 * 3600 * 1000, true);
    expect(localStorage.getItem(draftKey("a1", "s", "old"))).toBeNull();
    expect(loadDraft(draftKey("a1", "s", "new"))?.value).toBe(2);
    expect(localStorage.getItem("autre:cle")).toBe("x");
  });
});
