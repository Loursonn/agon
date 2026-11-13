import { describe, expect, it } from "vitest";
import { relativeSince } from "../relativeSince";

const now = new Date("2026-11-13T12:00:00Z");

describe("relativeSince", () => {
  it("couvre minutes, heures, hier et jours", () => {
    expect(relativeSince("2026-11-13T11:59:50Z", now)).toBe("à l'instant");
    expect(relativeSince("2026-11-13T11:55:00Z", now)).toBe("il y a 5 min");
    expect(relativeSince("2026-11-13T09:00:00Z", now)).toBe("il y a 3 h");
    expect(relativeSince("2026-11-12T10:00:00Z", now)).toBe("hier");
    expect(relativeSince("2026-11-09T12:00:00Z", now)).toBe("il y a 4 j");
  });
  it("renvoie null sans date valide", () => {
    expect(relativeSince(null, now)).toBeNull();
    expect(relativeSince("nope", now)).toBeNull();
  });
});
