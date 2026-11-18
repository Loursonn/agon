import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "coach" } }) }));

import { MorphoObservationsPanel } from "../MorphoObservationsPanel";

afterEach(() => setDbForTests(null));

describe("MorphoObservationsPanel", () => {
  it("enregistre une observation à l'œil et un muscle long", async () => {
    const db = fakeDb({ morpho_observations: [] } as never);
    setDbForTests(db.db);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { networkMode: "always" } } });
    render(<QueryClientProvider client={qc}><MorphoObservationsPanel athleteId="a" /></QueryClientProvider>);

    const cage = (await screen.findByText("Cage thoracique")).closest("div")!.parentElement!.parentElement!;
    fireEvent.click(within(cage).getByText("Étroite"));
    await waitFor(() => expect(db.tables.morpho_observations[0]).toMatchObject({ athlete_id: "a", cage: "etroite" }));

    fireEvent.click(screen.getByText("Bas du corps"));
    const ischios = screen.getByText(/^Ischios ·/).closest("div")!.parentElement!.parentElement!;
    fireEvent.click(within(ischios).getByText("Long"));
    await waitFor(() => expect(db.tables.morpho_observations[0]).toMatchObject({ cage: "etroite", muscles: { ischios: "long" } }));
  });
});
