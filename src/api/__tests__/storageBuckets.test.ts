import { afterEach, describe, expect, it } from "vitest";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import { ENERGY_IMAGE_BUCKET, uploadEnergySessionImage } from "@/api/energy";
import { getMeasurementPhotoUrls, PHOTO_URL_TTL_S } from "@/api/profile";

/** Faille S6 : rien de personnel dans un bucket public, photos du corps par URL signée courte. */
function setup() {
  const calls: Array<{ bucket: string; op: string; arg?: unknown }> = [];
  const storage = {
    from: (bucket: string) => ({
      upload: async (p: string) => (calls.push({ bucket, op: "upload", arg: p }), { data: { path: p }, error: null }),
      getPublicUrl: (p: string) => (calls.push({ bucket, op: "public" }), { data: { publicUrl: `https://pub/${bucket}/${p}` } }),
      createSignedUrls: async (ps: string[], ttl: number) => (
        calls.push({ bucket, op: "signed", arg: ttl }),
        { data: ps.map((p) => ({ path: p, signedUrl: `https://signe/${p}` })), error: null }
      ),
    }),
  };
  setDbForTests({ ...fakeDb({}).db, storage });
  return calls;
}

afterEach(() => setDbForTests(null));

describe("buckets de stockage", () => {
  it("illustration de séance : bucket public dédié, jamais test-media", async () => {
    const calls = setup();
    const url = await uploadEnergySessionImage("coach1", new File(["x"], "a.png", { type: "image/png" }));
    expect(ENERGY_IMAGE_BUCKET).toBe("energy-exercise-photos");
    expect(calls.every((c) => c.bucket === ENERGY_IMAGE_BUCKET)).toBe(true);
    expect(url).toMatch(/^https:\/\/pub\/energy-exercise-photos\/coach1\/sessions\//);
  });

  it("photos du corps : URL signée de 10 minutes, jamais d'URL publique", async () => {
    const calls = setup();
    const out = await getMeasurementPhotoUrls(["ath/mensurations/m1/face.jpg"]);
    expect(out["ath/mensurations/m1/face.jpg"]).toBe("https://signe/ath/mensurations/m1/face.jpg");
    expect(calls).toEqual([{ bucket: "test-media", op: "signed", arg: PHOTO_URL_TTL_S }]);
    expect(PHOTO_URL_TTL_S).toBeLessThanOrEqual(900);
  });
});
