import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { MensurationsDrawer } from "../MensurationsDrawer";

function setup(tables: Record<string, Row[]>, initialNew: boolean) {
  const db = fakeDb(tables);
  setDbForTests(db.db);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { networkMode: "always" } } });
  render(<QueryClientProvider client={qc}><MensurationsDrawer athleteId="a" initialNew={initialNew} onClose={() => {}} /></QueryClientProvider>);
  return db;
}

afterEach(() => { setDbForTests(null); localStorage.clear(); });

describe("MensurationsDrawer : biométrie et MyJump", () => {
  it("la saisie enregistre taille, envergure et les deux mesures MyJump", async () => {
    const { tables } = setup({ measurement_logs: [], test_sessions: [] }, true);
    expect(screen.getByText("Mesures MyJump (cm)")).toBeInTheDocument();
    expect(screen.getByText("Tour de taille")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Taille (debout)"), { target: { value: "178.5" } });
    fireEvent.change(screen.getByLabelText("Envergure"), { target: { value: "182" } });
    fireEvent.change(screen.getByLabelText("Longueur du membre inférieur"), { target: { value: "96" } });
    fireEvent.change(screen.getByLabelText("Hauteur de départ"), { target: { value: "51" } });
    fireEvent.click(screen.getByText("Enregistrer"));
    await waitFor(() => expect(tables.measurement_logs).toHaveLength(1));
    expect(tables.measurement_logs[0]).toMatchObject({ height_cm: 178.5, wingspan_cm: 182, leg_length_cm: 96, jump_start_height_cm: 51 });
  });

  it("l'historique affiche les dernières valeurs, « — » si jamais mesuré", async () => {
    setup({ measurement_logs: [
      { id: "m1", athlete_id: "a", date: "2026-09-01", created_at: "2026-09-01T10:00:00Z", photos: {}, leg_length_cm: 96 },
      { id: "m2", athlete_id: "a", date: "2026-11-01", created_at: "2026-11-01T10:00:00Z", photos: {}, height_cm: 179 },
    ] }, false);
    const summary = await screen.findByTestId("biometry-summary");
    expect(within(summary).getByText("179 cm")).toBeInTheDocument();
    expect(within(summary).getByText("96 cm")).toBeInTheDocument();
    expect(within(summary).getAllByText("—")).toHaveLength(2);
  });
});
