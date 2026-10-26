import { describe, it, expect } from "vitest";
import {
  CALENDLY_ORIGIN,
  CALENDLY_SCHEDULED_EVENT,
  isCalendlyUrl,
  normalizeBookingUrl,
  bookingUrlError,
  buildCalendlyEmbedUrl,
  buildCalendlyFallbackUrl,
  isCalendlyScheduledMessage,
} from "../booking";

const HUGO = "https://calendly.com/prep-hugoo/30min";

describe("isCalendlyUrl", () => {
  it("accepte une URL Calendly https avec un chemin", () => {
    expect(isCalendlyUrl(HUGO)).toBe(true);
    expect(isCalendlyUrl("https://calendly.com/prep-hugoo")).toBe(true);
  });

  it("accepte un sous-domaine Calendly (comptes entreprise)", () => {
    expect(isCalendlyUrl("https://acme.calendly.com/coach/30min")).toBe(true);
  });

  it("refuse http — l'URL part dans un iframe", () => {
    expect(isCalendlyUrl("http://calendly.com/prep-hugoo/30min")).toBe(false);
  });

  it("refuse un hôte qui ressemble à Calendly sans en être", () => {
    expect(isCalendlyUrl("https://notcalendly.com/prep-hugoo")).toBe(false);
    expect(isCalendlyUrl("https://calendly.com.evil.net/prep-hugoo")).toBe(false);
    expect(isCalendlyUrl("https://evil.net/calendly.com/prep-hugoo")).toBe(false);
  });

  it("refuse la racine sans compte : aucun créneau derrière", () => {
    expect(isCalendlyUrl("https://calendly.com")).toBe(false);
    expect(isCalendlyUrl("https://calendly.com/")).toBe(false);
  });

  it("refuse ce qui n'est pas une URL", () => {
    expect(isCalendlyUrl("")).toBe(false);
    expect(isCalendlyUrl("   ")).toBe(false);
    expect(isCalendlyUrl("calendly.com/prep-hugoo")).toBe(false);
    expect(isCalendlyUrl(null)).toBe(false);
    expect(isCalendlyUrl(undefined)).toBe(false);
    expect(isCalendlyUrl(42)).toBe(false);
  });
});

describe("normalizeBookingUrl", () => {
  it("laisse une URL propre intacte", () => {
    expect(normalizeBookingUrl(HUGO)).toBe(HUGO);
  });

  it("retire les espaces autour", () => {
    expect(normalizeBookingUrl("  " + HUGO + "  ")).toBe(HUGO);
  });

  it("retire le slash final", () => {
    expect(normalizeBookingUrl(HUGO + "/")).toBe(HUGO);
  });

  it("retire le hash, que Calendly ignore", () => {
    expect(normalizeBookingUrl(HUGO + "#top")).toBe(HUGO);
  });

  it("garde les query params posés par le coach", () => {
    expect(normalizeBookingUrl(HUGO + "?month=2026-11")).toBe(HUGO + "?month=2026-11");
  });

  it("rend null sur une URL invalide", () => {
    expect(normalizeBookingUrl("https://evil.net/x")).toBeNull();
    expect(normalizeBookingUrl("")).toBeNull();
    expect(normalizeBookingUrl(null)).toBeNull();
  });
});

describe("bookingUrlError", () => {
  it("ne signale rien sur un champ vide — le lien est facultatif", () => {
    expect(bookingUrlError("")).toBeNull();
    expect(bookingUrlError("   ")).toBeNull();
  });

  it("ne signale rien sur une URL valide", () => {
    expect(bookingUrlError(HUGO)).toBeNull();
  });

  it("signale une URL invalide avec un exemple", () => {
    const err = bookingUrlError("https://doodle.com/x");
    expect(err).toBeTruthy();
    expect(err).toContain("calendly.com");
  });
});

describe("buildCalendlyEmbedUrl", () => {
  it("ajoute les params d'embed demandés", () => {
    const out = buildCalendlyEmbedUrl({ url: HUGO });
    const params = new URL(out!).searchParams;
    expect(params.get("embed_type")).toBe("Inline");
    expect(params.get("hide_gdpr_banner")).toBe("1");
  });

  it("préremplit nom et email de l'athlète", () => {
    const out = buildCalendlyEmbedUrl({
      url: HUGO,
      name: "Test Athlete",
      email: "test@example.com",
    });
    const params = new URL(out!).searchParams;
    expect(params.get("name")).toBe("Test Athlete");
    expect(params.get("email")).toBe("test@example.com");
  });

  it("normalise les espaces du nom et ignore les champs vides", () => {
    const out = buildCalendlyEmbedUrl({
      url: HUGO,
      name: "  Test   Athlete  ",
      email: "   ",
    });
    const params = new URL(out!).searchParams;
    expect(params.get("name")).toBe("Test Athlete");
    expect(params.has("email")).toBe(false);
  });

  it("pose embed_domain quand il est fourni — requis pour les postMessage", () => {
    const out = buildCalendlyEmbedUrl({ url: HUGO, embedDomain: "app.agon.fr" });
    expect(new URL(out!).searchParams.get("embed_domain")).toBe("app.agon.fr");
  });

  it("n'écrase pas les query params du coach", () => {
    const out = buildCalendlyEmbedUrl({ url: HUGO + "?month=2026-11" });
    const params = new URL(out!).searchParams;
    expect(params.get("month")).toBe("2026-11");
    expect(params.get("embed_type")).toBe("Inline");
  });

  it("garde le chemin du coach", () => {
    const out = buildCalendlyEmbedUrl({ url: HUGO });
    expect(new URL(out!).pathname).toBe("/prep-hugoo/30min");
  });

  it("rend null si le coach n'a pas de lien valide", () => {
    expect(buildCalendlyEmbedUrl({ url: null })).toBeNull();
    expect(buildCalendlyEmbedUrl({ url: "" })).toBeNull();
    expect(buildCalendlyEmbedUrl({ url: "https://evil.net/x" })).toBeNull();
  });
});

describe("buildCalendlyFallbackUrl", () => {
  it("rend l'URL nue, sans params d'embed", () => {
    const out = buildCalendlyFallbackUrl(HUGO);
    expect(out).toBe(HUGO);
    expect(out).not.toContain("embed_type");
  });

  it("rend null sur un lien absent ou invalide", () => {
    expect(buildCalendlyFallbackUrl(null)).toBeNull();
    expect(buildCalendlyFallbackUrl("https://evil.net/x")).toBeNull();
  });
});

describe("isCalendlyScheduledMessage", () => {
  it("accepte la confirmation venue de Calendly", () => {
    expect(
      isCalendlyScheduledMessage({
        origin: CALENDLY_ORIGIN,
        data: { event: CALENDLY_SCHEDULED_EVENT, payload: {} },
      }),
    ).toBe(true);
  });

  it("accepte un sous-domaine Calendly", () => {
    expect(
      isCalendlyScheduledMessage({
        origin: "https://acme.calendly.com",
        data: { event: CALENDLY_SCHEDULED_EVENT },
      }),
    ).toBe(true);
  });

  it("refuse le bon event depuis une autre origine", () => {
    expect(
      isCalendlyScheduledMessage({
        origin: "https://evil.net",
        data: { event: CALENDLY_SCHEDULED_EVENT },
      }),
    ).toBe(false);
  });

  it("refuse les autres events Calendly", () => {
    expect(
      isCalendlyScheduledMessage({
        origin: CALENDLY_ORIGIN,
        data: { event: "calendly.date_and_time_selected" },
      }),
    ).toBe(false);
    expect(
      isCalendlyScheduledMessage({
        origin: CALENDLY_ORIGIN,
        data: { event: "calendly.profile_page_viewed" },
      }),
    ).toBe(false);
  });

  it("refuse un payload malformé", () => {
    expect(isCalendlyScheduledMessage({ origin: CALENDLY_ORIGIN, data: null })).toBe(false);
    expect(isCalendlyScheduledMessage({ origin: CALENDLY_ORIGIN, data: "scheduled" })).toBe(false);
    expect(isCalendlyScheduledMessage({ origin: CALENDLY_ORIGIN, data: {} })).toBe(false);
    expect(isCalendlyScheduledMessage({ origin: CALENDLY_ORIGIN })).toBe(false);
  });

  it("refuse une origine absente ou illisible", () => {
    expect(isCalendlyScheduledMessage({ data: { event: CALENDLY_SCHEDULED_EVENT } })).toBe(false);
    expect(
      isCalendlyScheduledMessage({ origin: "null", data: { event: CALENDLY_SCHEDULED_EVENT } }),
    ).toBe(false);
  });
});
