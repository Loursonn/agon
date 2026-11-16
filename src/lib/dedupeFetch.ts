/**
 * `fetch` qui fusionne les lectures identiques EN COURS.
 *
 * Au démarrage, plusieurs écrans et hooks demandent la même chose au même
 * moment (programme `asp:prog`, compétitions, événements de vie…) : autant de
 * requêtes identiques vers la base (plan gratuit, mémoire saturée). Ici, une
 * lecture (GET/HEAD) déjà partie et pas encore revenue est réutilisée : chaque
 * appelant reçoit sa propre copie de la réponse (`clone`).
 *
 * Rien n'est gardé en cache : dès que la réponse est arrivée, la lecture
 * suivante repart vers le serveur. Les écritures ne sont jamais fusionnées,
 * et une lecture partie avant une écriture n'est jamais réutilisée après.
 * Une requête annulable (`signal`) n'est pas fusionnée : l'annulation d'un
 * appelant couperait la lecture des autres.
 */

type FetchFn = typeof fetch;

/** En-têtes qui changent la réponse : deux lectures ne sont fusionnées que s'ils sont identiques. */
const VARY = ["authorization", "apikey", "accept", "accept-profile", "prefer", "range"];

function urlOf(input: string | URL): string {
  return typeof input === "string" ? input : input.href;
}

export function createDedupeFetch(base: FetchFn = (input, init) => fetch(input, init)): FetchFn & { inflight(): number } {
  const inflight = new Map<string, Promise<Response>>();

  const dedupe = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // supabase-js appelle fetch(url, init) ; un objet Request (rare) passe tel quel.
    const isRequest = typeof input === "object" && !(input instanceof URL);
    const method = (init?.method ?? "GET").toUpperCase();
    if (isRequest || (method !== "GET" && method !== "HEAD") || init?.signal) {
      if (method === "GET" || method === "HEAD") return base(input, init);
      // Écriture (ou RPC) : une lecture partie AVANT elle pourrait renvoyer
      // l'état d'avant. Les lectures suivantes repartent donc vers le serveur,
      // au départ de l'écriture comme à son retour.
      inflight.clear();
      const w = base(input, init);
      const clear = () => inflight.clear();
      w.then(clear, clear);
      return w;
    }
    const headers = new Headers(init?.headers);
    const key = [method, urlOf(input as string | URL), ...VARY.map((h) => headers.get(h) ?? "")].join("\n");
    let p = inflight.get(key);
    if (!p) {
      p = base(input, init);
      inflight.set(key, p);
      const done = () => { if (inflight.get(key) === p) inflight.delete(key); };
      p.then(done, done);
    }
    // L'original n'est jamais lu : chaque appelant lit sa copie.
    return p.then((r) => r.clone());
  }) as FetchFn & { inflight(): number };
  dedupe.inflight = () => inflight.size;
  return dedupe;
}

export const dedupeFetch = createDedupeFetch();
