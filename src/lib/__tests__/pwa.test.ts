import { describe, it, expect } from "vitest";
import { shouldRegisterServiceWorker } from "../pwa";

describe("shouldRegisterServiceWorker", () => {
  const base = { prod: true, hasServiceWorker: true };

  it("en production, navigateur compatible", () => {
    expect(shouldRegisterServiceWorker(base)).toBe(true);
  });
  it("jamais en npm run dev", () => {
    expect(shouldRegisterServiceWorker({ ...base, prod: false })).toBe(false);
  });
  it("jamais sans support service worker", () => {
    expect(shouldRegisterServiceWorker({ ...base, hasServiceWorker: false })).toBe(false);
  });
  it("jamais dans l'app native Capacitor", () => {
    expect(shouldRegisterServiceWorker({ ...base, capacitor: { isNativePlatform: () => true } })).toBe(false);
  });
  it("Capacitor chargé dans un navigateur web : SW gardé", () => {
    expect(shouldRegisterServiceWorker({ ...base, capacitor: { isNativePlatform: () => false } })).toBe(true);
  });
});
