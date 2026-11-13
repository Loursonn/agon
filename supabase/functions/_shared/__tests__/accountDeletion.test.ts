import { describe, expect, it } from "vitest";
import { deleteAccount, type DeletionAdmin } from "../accountDeletion";

type Call = [string, ...unknown[]];

/** Client service_role simulé : journalise chaque appel, dans l'ordre. */
function fakeAdmin(opts: {
  role?: string;
  connections?: Array<{ provider: string; external_user_id: string | null }>;
  connError?: { message: string; code?: string };
  disconnectError?: string;
  deleteError?: string;
  objects?: Array<{ bucket_id: string; object_name: string }>;
} = {}) {
  const calls: Call[] = [];
  const result = (data: unknown, error: unknown = null) => ({ data, error });

  function filter(table: string, op: string, data: unknown, error: unknown = null) {
    const filters: unknown[] = [];
    const chain = {
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return chain;
      },
      maybeSingle() {
        calls.push([`${op} ${table}`, ...filters]);
        return Promise.resolve(result(data, error));
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        calls.push([`${op} ${table}`, ...filters]);
        return Promise.resolve(result(data, error)).then(resolve, reject);
      },
    };
    return chain;
  }

  const admin = {
    from(table: string) {
      return {
        select: () => {
          if (table === "profiles") return filter(table, "select", { role: opts.role ?? "athlete" });
          if (table === "current_consents") return filter(table, "select", { granted: true, doc_version: "2026-11-13" });
          if (table === "provider_connections") return filter(table, "select", opts.connections ?? [], opts.connError ?? null);
          return filter(table, "select", null);
        },
        insert: (row: Record<string, unknown>) => {
          calls.push([`insert ${table}`, row]);
          return Promise.resolve(result(null));
        },
        delete: () => filter(table, "delete", null),
      };
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push([`rpc ${fn}`, args]);
      return Promise.resolve(result(opts.objects ?? []));
    },
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          calls.push([`remove ${bucket}`, paths]);
          return Promise.resolve({ error: null });
        },
      }),
    },
    functions: {
      invoke: (name: string, o: { body: unknown }) => {
        calls.push([`invoke ${name}`, o.body]);
        return Promise.resolve({ error: opts.disconnectError ? { message: opts.disconnectError } : null });
      },
    },
    auth: {
      admin: {
        deleteUser: (id: string) => {
          calls.push(["deleteUser", id]);
          return Promise.resolve({ error: opts.deleteError ? { message: opts.deleteError } : null });
        },
      },
    },
  } as unknown as DeletionAdmin;
  return { admin, calls };
}

describe("deleteAccount", () => {
  it("journal anonyme, fichiers, montres, compte : dans cet ordre", async () => {
    const { admin, calls } = fakeAdmin({
      connections: [{ provider: "garmin", external_user_id: "g1" }],
      objects: [{ bucket_id: "docs", object_name: "u1/fiche.pdf" }],
    });
    expect(await deleteAccount(admin, "u1", "user")).toEqual({ warnings: [] });
    const ops = calls.map((c) => c[0]);
    expect(ops).toEqual([
      "select profiles",
      "select current_consents",
      "insert account_deletions",
      "rpc list_user_storage_objects",
      "remove docs",
      "select provider_connections",
      "invoke provider-disconnect",
      "delete provider_webhook_inbox",
      "deleteUser",
    ]);
  });

  it("le journal ne porte aucun identifiant, et dit qui a lancé la suppression", async () => {
    const { admin, calls } = fakeAdmin({ role: "coach" });
    await deleteAccount(admin, "u1", "retention");
    const row = calls.find((c) => c[0] === "insert account_deletions")?.[1];
    expect(row).toEqual({ role: "coach", consent_version: "2026-11-13", had_core_consent: true, initiated_by: "retention" });
    expect(JSON.stringify(row)).not.toContain("u1");
  });

  it("révocation des montres : connexions lues par athlete_id", async () => {
    const { admin, calls } = fakeAdmin();
    await deleteAccount(admin, "u1", "user");
    expect(calls.find((c) => c[0] === "select provider_connections")).toEqual(["select provider_connections", ["athlete_id", "u1"]]);
  });

  it("un fournisseur injoignable n'empêche pas la suppression : avertissement", async () => {
    const { admin, calls } = fakeAdmin({
      connections: [{ provider: "coros", external_user_id: null }],
      disconnectError: "timeout",
    });
    expect(await deleteAccount(admin, "u1", "user")).toEqual({ warnings: ["coros: timeout"] });
    expect(calls.at(-1)).toEqual(["deleteUser", "u1"]);
  });

  it("connexions illisibles : signalé ; table absente (42P01) : silencieux", async () => {
    expect((await deleteAccount(fakeAdmin({ connError: { message: "refusé" } }).admin, "u1", "user")).warnings)
      .toEqual(["lecture des connexions: refusé"]);
    expect((await deleteAccount(fakeAdmin({ connError: { message: "x", code: "42P01" } }).admin, "u1", "user")).warnings)
      .toEqual([]);
  });

  it("échec de la suppression du compte auth : lève", async () => {
    await expect(deleteAccount(fakeAdmin({ deleteError: "boom" }).admin, "u1", "user")).rejects.toThrow("Suppression impossible : boom");
  });
});
