import { describe, expect, it } from "vitest";
import type { Query } from "@tanstack/react-query";
import { FOCUS_REFETCH_MIN_AGE_MS, refetchOnFocusIfOld } from "../queryCache";

const q = (dataUpdatedAt: number, isInvalidated = false) => ({ state: { dataUpdatedAt, isInvalidated } }) as unknown as Query;

describe("refetchOnFocusIfOld", () => {
  const now = () => 1_000_000_000;
  it("donnée récente : pas de relecture au retour sur l'onglet", () => {
    expect(refetchOnFocusIfOld(() => true, now)(q(now() - 60_000))).toBe(false);
  });
  it("donnée de plus de 5 min ou invalidée : relue", () => {
    expect(refetchOnFocusIfOld(() => true, now)(q(now() - FOCUS_REFETCH_MIN_AGE_MS))).toBe(true);
    expect(refetchOnFocusIfOld(() => true, now)(q(now() - 1000, true))).toBe(true);
  });
  it("saisies en attente d'envoi : jamais de relecture", () => {
    expect(refetchOnFocusIfOld(() => false, now)(q(0))).toBe(false);
  });
});
