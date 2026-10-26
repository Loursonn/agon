/**
 * errorMessage — ce qu'on affiche à l'utilisateur quand quelque chose casse.
 * Le cas qui compte vraiment est le dernier : avec `catch (e: any)` + `e.message`
 * l'écran affichait « undefined ».
 */
import { describe, it, expect } from "vitest";
import { errorMessage } from "@/lib/errors";

describe("errorMessage", () => {
  it("rend le message d'une Error", () => {
    expect(errorMessage(new Error("Code invalide"))).toBe("Code invalide");
  });

  it("rend une string jetée telle quelle", () => {
    expect(errorMessage("boom")).toBe("boom");
  });

  it("lit le champ message d'un objet (erreurs PostgREST)", () => {
    expect(errorMessage({ message: "duplicate key", code: "23505" })).toBe("duplicate key");
  });

  it("retombe sur le fallback quand il n'y a rien d'exploitable", () => {
    expect(errorMessage(undefined)).toBe("Erreur inconnue");
    expect(errorMessage(null)).toBe("Erreur inconnue");
    expect(errorMessage({})).toBe("Erreur inconnue");
    expect(errorMessage(new Error(""))).toBe("Erreur inconnue");
    expect(errorMessage("   ")).toBe("Erreur inconnue");
    expect(errorMessage({ message: 42 })).toBe("Erreur inconnue");
  });

  it("accepte un fallback explicite", () => {
    expect(errorMessage(null, "Code invalide")).toBe("Code invalide");
  });
});
