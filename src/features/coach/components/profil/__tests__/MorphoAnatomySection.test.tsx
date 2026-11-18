import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "coach" } }) }));

import { MorphoAnatomySection } from "../MorphoAnatomySection";

afterEach(() => setDbForTests(null));

function setup(tables: Record<string, Record<string, unknown>[]>) {
  const db = fakeDb(tables as never);
  setDbForTests(db.db);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { networkMode: "always" } } });
  render(<QueryClientProvider client={qc}><MorphoAnatomySection athleteId="a" /></QueryClientProvider>);
  return db;
}

describe("MorphoAnatomySection", () => {
  it("affiche le profil de leviers et les conseils par mouvement", async () => {
    const { tables } = setup({
      measurement_logs: [{
        id: "m1", athlete_id: "a", date: "2026-11-18", created_at: "2026-11-18T08:00:00Z", photos: {},
        height_cm: 176, wingspan_cm: 182, arm_length_cm: 34, forearm_length_cm: 28, leg_standing_cm: 90, shank_length_cm: 42,
      }],
      morpho_observations: [],
    });
    expect(await screen.findByText("Jambes longues")).toBeInTheDocument();
    expect(screen.getByText("Fémurs longs")).toBeInTheDocument();
    expect(screen.getByText("Squat")).toBeInTheDocument();
    expect(screen.getAllByText("À adapter").length).toBeGreaterThan(0);
    expect(tables.morpho_observations).toEqual([]);
  });
});
