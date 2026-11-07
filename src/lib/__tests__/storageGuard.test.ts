import { describe, it, expect, beforeEach, vi } from "vitest";

// Faux client Supabase : chaque test pousse la réponse de la prochaine lecture.
const reads: Array<{ data?: unknown; error?: unknown; throws?: boolean }> = [];
const upserts: Array<{ key: string; value: unknown }> = [];

vi.mock("@/integrations/supabase/client", () => {
  const select = () => {
    const q = {
      eq: () => q,
      maybeSingle: async () => {
        const r = reads.shift() ?? { data: null, error: null };
        if (r.throws) throw new Error("network");
        return { data: r.data ?? null, error: r.error ?? null };
      },
    };
    return q;
  };
  return {
    supabase: {
      from: () => ({
        select,
        upsert: async (row: { key: string; value: unknown }) => {
          upserts.push({ key: row.key, value: row.value });
          return { error: null };
        },
      }),
    },
  };
});

import {
  sLoad, sLoadResult, sSave, isKeyLoadFailed, isKeyNotLoadedError, _resetLoadGuard,
} from "@/lib/storage";

const AID = "athlete-1";
const KEY = "asp:wh";

describe("garde de lecture app_data (P1)", () => {
  beforeEach(() => {
    reads.length = 0;
    upserts.length = 0;
    _resetLoadGuard();
  });

  it("clé absente → défaut légitime, écriture autorisée", async () => {
    reads.push({ data: null });
    expect(await sLoad(KEY, {}, AID)).toEqual({});
    expect(isKeyLoadFailed(KEY, AID)).toBe(false);
    await sSave(KEY, { "20261107": { score: 80 } }, AID);
    expect(upserts).toHaveLength(1);
  });

  it("lecture en erreur → défaut renvoyé MAIS écriture bloquée (l'historique n'est pas écrasé)", async () => {
    reads.push({ error: { message: "500", code: "PGRST000" } });
    expect(await sLoad(KEY, {}, AID)).toEqual({});
    expect(isKeyLoadFailed(KEY, AID)).toBe(true);
    const err = await sSave(KEY, { "20261107": { score: 80 } }, AID).catch((e) => e);
    expect(isKeyNotLoadedError(err)).toBe(true);
    expect(upserts).toHaveLength(0);
  });

  it("exception réseau (fetch qui lève) → même blocage", async () => {
    reads.push({ throws: true });
    const r = await sLoadResult(KEY, AID);
    expect(r.ok).toBe(false);
    await expect(sSave(KEY, {}, AID)).rejects.toSatisfy(isKeyNotLoadedError);
    expect(upserts).toHaveLength(0);
  });

  it("relecture réussie → écriture débloquée", async () => {
    reads.push({ error: { message: "timeout" } });
    await sLoad(KEY, {}, AID);
    expect(isKeyLoadFailed(KEY, AID)).toBe(true);
    reads.push({ data: { value: { "20261101": { score: 60 } } } });
    const r = await sLoadResult(KEY, AID);
    expect(r).toEqual({ ok: true, value: { "20261101": { score: 60 } } });
    expect(isKeyLoadFailed(KEY, AID)).toBe(false);
    await sSave(KEY, { "20261101": { score: 60 }, "20261107": { score: 80 } }, AID);
    expect(upserts).toHaveLength(1);
  });

  it("le blocage est par athlète ET par clé", async () => {
    reads.push({ error: { message: "x" } });
    await sLoad(KEY, {}, AID);
    await sSave("asp:wlog", { a: 1 }, AID);        // autre clé : OK
    await sSave(KEY, { a: 1 }, "athlete-2");        // autre athlète : OK
    expect(upserts).toHaveLength(2);
    await expect(sSave(KEY, { a: 1 }, AID)).rejects.toSatisfy(isKeyNotLoadedError);
  });

  it("sLoad renvoie la valeur en base telle quelle (y compris null stocké)", async () => {
    reads.push({ data: { value: [1, 2] } });
    expect(await sLoad(KEY, [], AID)).toEqual([1, 2]);
    reads.push({ data: { value: null } });
    expect(await sLoad(KEY, [], AID)).toBeNull();
  });

  it("sans athlète : défaut, aucun blocage", async () => {
    expect(await sLoad(KEY, { x: 1 }, null)).toEqual({ x: 1 });
    expect(isKeyLoadFailed(KEY, null)).toBe(false);
  });
});
