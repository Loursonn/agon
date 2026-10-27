/**
 * Le transport MCP n'est testé que sur ses deux parties pures : la lecture du
 * corps de réponse et la résolution du nom d'un outil.
 *
 * Ce sont aussi les deux seules qui peuvent être fausses silencieusement. Un
 * en-tête de session oublié produit un 404 immédiat ; un flux SSE mal découpé
 * produit « réponse sans résultat » sur un appel qui a pourtant réussi, et on
 * cherche du côté du serveur.
 */
import { describe, expect, it } from "vitest";
import { parseRpcBody, resolveTool } from "../mcp";

describe("parseRpcBody — réponse JSON", () => {
  it("lit une réponse unique", () => {
    const out = parseRpcBody("application/json", '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}');
    expect(out).toHaveLength(1);
    expect(out[0].result).toEqual({ ok: true });
  });

  it("lit un lot", () => {
    const out = parseRpcBody(
      "application/json; charset=utf-8",
      '[{"id":1,"result":1},{"id":2,"result":2}]',
    );
    expect(out.map((m) => m.result)).toEqual([1, 2]);
  });

  it("rend une liste vide sur un corps vide", () => {
    expect(parseRpcBody("application/json", "   ")).toEqual([]);
  });
});

describe("parseRpcBody — flux SSE", () => {
  it("extrait le message d'un bloc événementiel", () => {
    const body = [
      "event: message",
      'data: {"jsonrpc":"2.0","id":1,"result":{"content":[]}}',
      "",
    ].join("\n");
    const out = parseRpcBody("text/event-stream", body);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(1);
  });

  it("recolle un data réparti sur plusieurs lignes", () => {
    /*
      Autorisé par la spec SSE et pratiqué par les serveurs qui coupent sur une
      taille de tampon : chaque ligne `data:` est un fragment, et le message
      n'existe qu'une fois les fragments joints par des retours à la ligne.
    */
    const body = [
      "event: message",
      'data: {"jsonrpc":"2.0","id":7,',
      'data:  "result":{"isError":false}}',
      "",
    ].join("\n");
    const out = parseRpcBody("text/event-stream", body);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(7);
    expect(out[0].result).toEqual({ isError: false });
  });

  it("ignore les commentaires de maintien de connexion", () => {
    const body = [
      ": ping",
      "",
      "event: message",
      'data: {"id":2,"result":"ok"}',
      "",
      ": ping",
      "",
    ].join("\n");
    expect(parseRpcBody("text/event-stream", body).map((m) => m.result)).toEqual(["ok"]);
  });

  it("ignore un bloc illisible sans perdre les autres", () => {
    /*
      Un flux peut porter des événements de service qui ne sont pas du JSON-RPC.
      S'arrêter dessus ferait échouer un appel par ailleurs réussi — c'est la
      raison du `catch` silencieux dans l'implémentation.
    */
    const body = [
      "data: pas du json",
      "",
      'data: {"id":3,"result":"ok"}',
      "",
    ].join("\n");
    expect(parseRpcBody("text/event-stream", body).map((m) => m.result)).toEqual(["ok"]);
  });

  it("lit plusieurs messages successifs", () => {
    const body = [
      'data: {"id":1,"result":"a"}',
      "",
      'data: {"id":2,"result":"b"}',
      "",
    ].join("\n");
    expect(parseRpcBody("text/event-stream", body).map((m) => m.result)).toEqual(["a", "b"]);
  });

  it("supporte les fins de ligne CRLF", () => {
    const body = 'event: message\r\ndata: {"id":9,"result":"ok"}\r\n\r\n';
    expect(parseRpcBody("text/event-stream", body).map((m) => m.result)).toEqual(["ok"]);
  });

  it("lit le dernier bloc même sans ligne vide finale", () => {
    const body = 'data: {"id":4,"result":"ok"}';
    expect(parseRpcBody("text/event-stream", body).map((m) => m.result)).toEqual(["ok"]);
  });
});

describe("resolveTool", () => {
  const tools = [
    { name: "querySportRecords" },
    { name: "queryActivityFitFileDownloadUrls" },
    { name: "getDailyHealthSummary" },
  ];

  it("préfère le nom exact", () => {
    expect(resolveTool(tools, "querySportRecords", /sport/i)).toBe("querySportRecords");
  });

  it("rattrape une différence de casse", () => {
    expect(resolveTool(tools, "querysportrecords", /jamais/)).toBe("querySportRecords");
  });

  it("retombe sur le motif quand le nom documenté n'existe pas", () => {
    // Le nom de l'outil de données quotidiennes vient de la documentation et
    // n'a jamais été observé : le motif est ce qui sauve la synchronisation.
    expect(resolveTool(tools, "queryDailyActivity", /daily|sleep/i)).toBe(
      "getDailyHealthSummary",
    );
  });

  it("rend null plutôt que de deviner", () => {
    expect(resolveTool(tools, "queryMenstrualCycle", /menstrual/i)).toBeNull();
  });

  it("rend null sur une liste vide", () => {
    expect(resolveTool([], "querySportRecords", /sport/i)).toBeNull();
  });
});
