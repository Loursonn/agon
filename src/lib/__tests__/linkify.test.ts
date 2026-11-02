import { describe, expect, it } from "vitest";
import { linkify } from "../linkify";

describe("linkify", () => {
  it("texte sans lien", () => {
    expect(linkify("Descends lentement")).toEqual([{ type: "text", text: "Descends lentement" }]);
  });

  it("URL au milieu, ponctuation finale exclue", () => {
    expect(linkify("Vidéo : https://youtu.be/dQw4w9WgXcQ. Bon courage")).toEqual([
      { type: "text", text: "Vidéo : " },
      { type: "link", text: "https://youtu.be/dQw4w9WgXcQ", href: "https://youtu.be/dQw4w9WgXcQ" },
      { type: "text", text: ". Bon courage" },
    ]);
  });

  it("www. → https, plusieurs liens", () => {
    const parts = linkify("www.youtube.com/watch?v=abc et (http://a.fr/x)");
    expect(parts.filter((p) => p.type === "link").map((p) => p.type === "link" && p.href))
      .toEqual(["https://www.youtube.com/watch?v=abc", "http://a.fr/x"]);
  });

  it("jamais javascript:", () => {
    expect(linkify("javascript:alert(1)").every((p) => p.type === "text")).toBe(true);
  });
});
