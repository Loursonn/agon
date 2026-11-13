import { describe, it, expect } from "vitest";
import { deepLinkPath, publicWebOrigin } from "../native";

describe("deepLinkPath", () => {
  it("lien d'invitation du site public", () => {
    expect(deepLinkPath("https://agon-training.com/invite/abc123")).toBe("/invite/abc123");
  });
  it("garde la requête et l'ancre", () => {
    expect(deepLinkPath("https://www.agon-training.com/athlete/profil?coros=ok#x")).toBe("/athlete/profil?coros=ok#x");
  });
  it("racine", () => {
    expect(deepLinkPath("https://agon-training.com")).toBe("/");
  });
  it("refuse un autre hôte", () => {
    expect(deepLinkPath("https://evil.example/invite/abc")).toBeNull();
    expect(deepLinkPath("https://agon-training.com.evil.example/x")).toBeNull();
  });
  it("refuse http et les URL invalides", () => {
    expect(deepLinkPath("http://agon-training.com/invite/abc")).toBeNull();
    expect(deepLinkPath("pas une url")).toBeNull();
  });
});

describe("publicWebOrigin", () => {
  it("natif : site public, jamais localhost", () => {
    expect(publicWebOrigin(true)).toBe("https://agon-training.com");
  });
  it("web : origine courante", () => {
    expect(publicWebOrigin(false)).toBe(window.location.origin);
  });
});

describe("openAuthorization", () => {
  it("web : redirection complète vers l'URL du serveur", async () => {
    const { openAuthorization } = await import("../native");
    const went: string[] = [];
    await openAuthorization("https://coros.example/authorize?state=s", false, (u) => went.push(u));
    expect(went).toEqual(["https://coros.example/authorize?state=s"]);
  });
});
