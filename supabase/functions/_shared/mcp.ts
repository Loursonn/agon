/**
 * Client MCP minimal, transport « streamable HTTP ».
 *
 * COROS n'expose pas une API REST mais un serveur MCP : un unique endpoint
 * `/mcp` qui parle JSON-RPC 2.0. Les SDK MCP existants supposent Node et
 * tirent un arbre de dépendances dont une Edge Function n'a pas besoin — ici
 * trois méthodes suffisent (`initialize`, `notifications/initialized`,
 * `tools/call`), alors elles sont écrites à la main.
 *
 * Deux particularités du transport, qui sont la raison d'être de ce fichier :
 *
 *   - **La réponse peut être du JSON ou du SSE.** Le serveur choisit ; le
 *     client doit annoncer qu'il accepte les deux et savoir lire les deux. Un
 *     client qui ne fait que `res.json()` marche en test et casse le jour où le
 *     serveur décide de streamer.
 *   - **La session est portée par un en-tête.** `initialize` peut renvoyer
 *     `Mcp-Session-Id` ; il doit être renvoyé sur chaque appel suivant, sinon
 *     le serveur répond 404 sur une session qu'il ne reconnaît plus.
 *
 * Ce module ne connaît rien de COROS : il ne sait pas quels outils existent ni
 * ce qu'ils renvoient. C'est voulu — les noms d'outils et le format de leurs
 * réponses appartiennent à `coros.ts`.
 */

/*
  Version du protocole annoncée. Figée volontairement plutôt que « la plus
  récente » : une montée de version du protocole change le contrat, et doit
  être un changement de code constaté, pas un glissement silencieux.
*/
export const MCP_PROTOCOL_VERSION = "2025-06-18";

export interface McpTextContent {
  type: string;
  text?: string;
}

export interface McpToolResult {
  /** Les blocs renvoyés par l'outil, dans l'ordre. */
  content: McpTextContent[];
  /** Concaténation des blocs textuels — ce que lit un appelant qui veut la prose. */
  text: string;
  /** Posé par le serveur quand l'outil a échoué *fonctionnellement*. */
  isError: boolean;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

/**
 * Extrait les réponses JSON-RPC d'un corps, qu'il soit JSON ou SSE.
 *
 * Exporté pour être testable sans serveur : c'est la partie du transport la
 * plus facile à écrire de travers, parce qu'un flux SSE contient des lignes
 * `event:`, des commentaires `:`, des `data:` éventuellement répartis sur
 * plusieurs lignes pour un seul message, et des blocs séparés par une ligne
 * vide.
 */
export function parseRpcBody(contentType: string, body: string): JsonRpcResponse[] {
  const isSse = contentType.toLowerCase().includes("text/event-stream");

  if (!isSse) {
    const trimmed = body.trim();
    if (!trimmed) return [];
    const parsed = JSON.parse(trimmed) as JsonRpcResponse | JsonRpcResponse[];
    // Une requête unique peut recevoir une réponse unique ou un tableau
    // (JSON-RPC permet les lots) : les deux se ramènent à une liste.
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  const out: JsonRpcResponse[] = [];
  let data: string[] = [];

  const flush = () => {
    if (data.length === 0) return;
    const joined = data.join("\n");
    data = [];
    if (!joined.trim() || joined.trim() === "[DONE]") return;
    try {
      const parsed = JSON.parse(joined) as JsonRpcResponse | JsonRpcResponse[];
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      /*
        Un bloc SSE illisible est ignoré plutôt que fatal : le flux peut porter
        des événements de service (pings, journalisation) qui ne sont pas du
        JSON-RPC, et s'arrêter dessus ferait échouer un appel par ailleurs
        réussi.
      */
    }
  };

  for (const rawLine of body.split(/\r\n|\r|\n/)) {
    const line = rawLine;
    if (line === "") {
      flush();
      continue;
    }
    if (line.startsWith(":")) continue; // commentaire / keep-alive
    const sep = line.indexOf(":");
    const field = sep === -1 ? line : line.slice(0, sep);
    let value = sep === -1 ? "" : line.slice(sep + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") data.push(value);
  }
  flush();

  return out;
}

/**
 * Choisit le nom réel d'un outil parmi ceux que le serveur annonce.
 *
 * Nos noms d'outils viennent de la documentation, pas d'une réponse observée —
 * `/mcp` exige un jeton, et il a fallu écrire la synchronisation avant qu'un
 * athlète soit connecté. Un nom documenté de travers ferait échouer la
 * synchronisation par une erreur MCP opaque ; chercher un motif dans la liste
 * réellement publiée permet de survivre à un renommage, et de le constater
 * dans les journaux.
 *
 * Renvoie `null` plutôt que de deviner quand rien ne correspond : mieux vaut
 * un « outil introuvable » explicite qu'un appel au mauvais outil.
 */
export function resolveTool(
  available: Array<{ name: string }>,
  preferred: string,
  pattern: RegExp,
): string | null {
  const names = available.map((t) => t.name);
  if (names.includes(preferred)) return preferred;

  const lower = preferred.toLowerCase();
  const caseOnly = names.find((n) => n.toLowerCase() === lower);
  if (caseOnly) return caseOnly;

  return names.find((n) => pattern.test(n)) ?? null;
}

/** Erreur renvoyée par le serveur MCP, distinguée d'une panne de transport. */
export class McpError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
    this.name = "McpError";
  }
}

export interface McpClientOptions {
  /** Hôte du serveur, sans chemin (`https://mcpeu.coros.com`). */
  host: string;
  /** Jeton d'accès OAuth. */
  accessToken: string;
  /** Chemin du endpoint MCP. */
  path?: string;
  /** Nom annoncé au serveur, utile de l'autre côté pour le diagnostic. */
  clientName?: string;
}

/**
 * Session MCP. À créer une fois par exécution, pas une fois par outil :
 * `initialize` est un aller-retour réseau, et certains serveurs comptent les
 * sessions.
 */
export class McpClient {
  private readonly endpoint: string;
  private readonly accessToken: string;
  private readonly clientName: string;
  private sessionId: string | null = null;
  private nextId = 1;
  private initialized = false;

  constructor(opts: McpClientOptions) {
    this.endpoint = `${opts.host.replace(/\/+$/, "")}${opts.path ?? "/mcp"}`;
    this.accessToken = opts.accessToken;
    this.clientName = opts.clientName ?? "Agon";
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      // Les deux, parce que le serveur choisit. Annoncer seulement
      // `application/json` fait répondre 406 à certaines implémentations.
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${this.accessToken}`,
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    };
    if (this.sessionId) h["Mcp-Session-Id"] = this.sessionId;
    return h;
  }

  private async send(payload: unknown, expectResponse: boolean): Promise<JsonRpcResponse | null> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    });

    /*
      Capté dès la première réponse : `initialize` est le seul appel qui
      l'émet, et sans lui tous les suivants échoueraient.
    */
    const session = res.headers.get("mcp-session-id");
    if (session) this.sessionId = session;

    const text = await res.text();

    if (!res.ok) {
      /*
        Le jeton n'apparaît jamais dans le message : il est dans l'en-tête, pas
        dans le corps, mais un 401 est justement le cas où on est tenté de tout
        journaliser pour comprendre.
      */
      throw new McpError(
        `MCP ${res.status} sur ${this.endpoint} : ${text.slice(0, 300)}`,
        res.status,
      );
    }

    // Une notification ne reçoit pas de réponse (202 avec corps vide).
    if (!expectResponse) return null;

    const messages = parseRpcBody(res.headers.get("content-type") ?? "", text);
    const answer = messages.find((m) => m.error !== undefined || m.result !== undefined);
    if (!answer) {
      throw new McpError(`MCP réponse sans résultat : ${text.slice(0, 300)}`);
    }
    if (answer.error) {
      throw new McpError(
        `MCP erreur ${answer.error.code ?? ""} : ${answer.error.message ?? "sans message"}`.trim(),
        answer.error.code,
      );
    }
    return answer;
  }

  /** Ouvre la session. Idempotent : les appels suivants ne refont rien. */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.send({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: this.clientName, version: "1.0.0" },
      },
    }, true);

    /*
      Obligatoire par la spec : le serveur peut refuser les appels d'outils
      avant de l'avoir reçue. Envoyée sans `id` — c'est une notification, et
      lui en donner un ferait attendre une réponse qui ne vient jamais.
    */
    await this.send({ jsonrpc: "2.0", method: "notifications/initialized" }, false);

    this.initialized = true;
  }

  /** Liste les outils. Utile une fois, pour confronter la doc au réel. */
  async listTools(): Promise<Array<{ name: string; description?: string }>> {
    await this.initialize();
    const answer = await this.send({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "tools/list",
      params: {},
    }, true);
    const result = answer?.result as { tools?: Array<{ name: string; description?: string }> };
    return result?.tools ?? [];
  }

  /**
   * Appelle un outil.
   *
   * `isError` est renvoyé plutôt que levé : un outil qui répond « aucune
   * activité sur cette période » est un échec fonctionnel, pas une panne, et
   * l'appelant doit pouvoir continuer.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    await this.initialize();

    const answer = await this.send({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "tools/call",
      params: { name, arguments: args },
    }, true);

    const result = (answer?.result ?? {}) as {
      content?: McpTextContent[];
      isError?: boolean;
    };
    const content = Array.isArray(result.content) ? result.content : [];

    return {
      content,
      text: content
        .filter((c) => typeof c.text === "string")
        .map((c) => c.text as string)
        .join("\n"),
      isError: result.isError === true,
    };
  }
}
