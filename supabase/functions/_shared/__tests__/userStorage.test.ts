/**
 * Purge Storage à la suppression d'un compte (delete-account, pending-athlete).
 */
import { describe, expect, it } from "vitest";
import { purgeUserStorage, type StorageAdmin } from "../userStorage";

function admin(objects: Array<{ bucket_id: string; object_name: string }> | null, o: { listError?: string; removeError?: string } = {}) {
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const a: StorageAdmin = {
    rpc: async (fn, args) => {
      expect(fn).toBe("list_user_storage_objects");
      expect(args).toEqual({ target_user: "u1" });
      return { data: objects, error: o.listError ? { message: o.listError } : null };
    },
    storage: {
      from: (bucket) => ({
        remove: async (paths) => {
          removed.push({ bucket, paths });
          return { error: o.removeError ? { message: o.removeError } : null };
        },
      }),
    },
  };
  return { a, removed };
}

describe("purgeUserStorage", () => {
  it("supprime par bucket, fiches (docs) comprises, et ignore les buckets publics de l'app", async () => {
    const { a, removed } = admin([
      { bucket_id: "docs", object_name: "c/athletes/u1/fiche.pdf" },
      { bucket_id: "medical", object_name: "u1/irm.png" },
      { bucket_id: "docs", object_name: "u1/x.pdf" },
      { bucket_id: "exercise-images", object_name: "squat.png" },
    ]);
    expect(await purgeUserStorage(a, "u1")).toEqual([]);
    expect(removed).toEqual([
      { bucket: "docs", paths: ["c/athletes/u1/fiche.pdf", "u1/x.pdf"] },
      { bucket: "medical", paths: ["u1/irm.png"] },
    ]);
  });

  it("supprime les photos d'exercices d'énergie que la base lui renvoie", async () => {
    const { a, removed } = admin([{ bucket_id: "energy-exercise-photos", object_name: "u1/1700000000000.jpg" }]);
    expect(await purgeUserStorage(a, "u1")).toEqual([]);
    expect(removed).toEqual([{ bucket: "energy-exercise-photos", paths: ["u1/1700000000000.jpg"] }]);
  });

  it("découpe par lots de 100", async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ bucket_id: "test-media", object_name: `u1/${i}.jpg` }));
    const { a, removed } = admin(many);
    await purgeUserStorage(a, "u1");
    expect(removed.map((r) => r.paths.length)).toEqual([100, 100, 50]);
  });

  it("signale les erreurs sans lever (liste illisible, fichier récalcitrant)", async () => {
    expect(await purgeUserStorage(admin(null, { listError: "refusé" }).a, "u1")).toEqual(["liste des fichiers: refusé"]);
    const { a } = admin([{ bucket_id: "medical", object_name: "u1/a" }], { removeError: "indisponible" });
    expect(await purgeUserStorage(a, "u1")).toEqual(["medical: indisponible"]);
  });
});
