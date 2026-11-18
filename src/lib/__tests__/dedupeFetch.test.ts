import { describe, expect, it, vi } from "vitest";
import { createDedupeFetch } from "../dedupeFetch";

/** fetch simulé : chaque appel renvoie une promesse qu'on résout à la main. */
function fakeFetch() {
  const calls: { url: string; init?: RequestInit; resolve: (body: string) => void }[] = [];
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((res) => {
      calls.push({ url: String(input), init, resolve: (body) => res(new Response(body)) });
    }));
  return { fn: fn as unknown as typeof fetch, calls };
}

const auth = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } });

describe("dedupeFetch", () => {
  it("deux lectures identiques en cours → une seule requête, chacun lit sa copie", async () => {
    const f = fakeFetch();
    const d = createDedupeFetch(f.fn);
    const a = d("https://x/rest/v1/app_data?key=eq.asp%3Aprog", auth("t"));
    const b = d("https://x/rest/v1/app_data?key=eq.asp%3Aprog", auth("t"));
    expect(f.calls).toHaveLength(1);
    f.calls[0].resolve('[{"value":1}]');
    expect(await (await a).text()).toBe('[{"value":1}]');
    expect(await (await b).text()).toBe('[{"value":1}]');
    expect(d.inflight()).toBe(0);
  });

  it("rien n'est gardé : une lecture après la réponse repart vers le serveur", async () => {
    const f = fakeFetch();
    const d = createDedupeFetch(f.fn);
    const a = d("https://x/a", auth("t"));
    f.calls[0].resolve("1");
    await (await a).text();
    void d("https://x/a", auth("t"));
    expect(f.calls).toHaveLength(2);
  });

  it("URL, jeton ou en-têtes différents → requêtes séparées", () => {
    const f = fakeFetch();
    const d = createDedupeFetch(f.fn);
    void d("https://x/a", auth("t"));
    void d("https://x/b", auth("t"));
    void d("https://x/a", auth("u"));
    void d("https://x/a", { headers: { Authorization: "Bearer t", Accept: "application/vnd.pgrst.object+json" } });
    expect(f.calls).toHaveLength(4);
  });

  it("les écritures ne sont jamais fusionnées", () => {
    const f = fakeFetch();
    const d = createDedupeFetch(f.fn);
    void d("https://x/a", { method: "POST", body: "{}" });
    void d("https://x/a", { method: "POST", body: "{}" });
    expect(f.calls).toHaveLength(2);
  });

  it("une lecture partie avant une écriture n'est pas réutilisée après", async () => {
    const f = fakeFetch();
    const d = createDedupeFetch(f.fn);
    const before = d("https://x/a", auth("t"));
    const w = d("https://x/a", { method: "PATCH", body: "{}" });
    void d("https://x/a", auth("t")); // pendant l'écriture : nouvelle lecture
    expect(f.calls).toHaveLength(3);
    f.calls[1].resolve("ok");
    await w;
    void d("https://x/a", auth("t")); // après l'écriture : encore une nouvelle
    expect(f.calls).toHaveLength(4);
    f.calls[0].resolve("vieux");
    expect(await (await before).text()).toBe("vieux");
  });

  it("une lecture annulable (signal) passe telle quelle", () => {
    const f = fakeFetch();
    const d = createDedupeFetch(f.fn);
    const c = new AbortController();
    void d("https://x/a", { signal: c.signal });
    void d("https://x/a", { signal: c.signal });
    expect(f.calls).toHaveLength(2);
  });

  it("une erreur réseau est rendue à chaque appelant, puis oubliée", async () => {
    const fn = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    const d = createDedupeFetch(fn as unknown as typeof fetch);
    const a = d("https://x/a");
    const b = d("https://x/a");
    await expect(a).rejects.toThrow("Failed to fetch");
    await expect(b).rejects.toThrow("Failed to fetch");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(d.inflight()).toBe(0);
  });
});
