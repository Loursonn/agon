import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { CompetitionActions } from "../CompetitionActions";

const row = (o: Partial<Row> = {}): Row => ({
  id: "c1", athlete_id: "a", coach_id: "k", name: "HYROX Paris", type: "competition", date: "2026-12-01",
  location: null, notes: null, priority: "A", athlete_comment: null, cancelled_at: null, created_at: "2026-10-01T00:00:00Z", ...o,
});

function setup(tables: Record<string, Row[]>, comp = { id: "c1", athlete_id: "a", name: "HYROX Paris", cancelled_at: null as string | null }) {
  const db = fakeDb(tables);
  setDbForTests(db.db);
  const onDone = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { networkMode: "always" } } });
  render(<QueryClientProvider client={qc}><CompetitionActions comp={comp} onDone={onDone} /></QueryClientProvider>);
  return { ...db, onDone };
}

afterEach(() => { setDbForTests(null); toast.success.mockReset(); toast.error.mockReset(); });

describe("CompetitionActions", () => {
  it("annuler demande confirmation, puis annule", async () => {
    const { tables, onDone } = setup({ competitions: [row()] });
    fireEvent.click(screen.getByText("Annuler la compétition"));
    expect(screen.getByText(/Elle reste visible, barrée/)).toBeInTheDocument();
    expect(tables.competitions[0].cancelled_at).toBeNull();
    fireEvent.click(screen.getByText("Oui, annuler"));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("cancelled"));
    expect(tables.competitions[0].cancelled_at).toBeTruthy();
  });

  it("« Garder » referme sans rien changer", () => {
    const { tables } = setup({ competitions: [row()] });
    fireEvent.click(screen.getByText("Annuler la compétition"));
    fireEvent.click(screen.getByText("Garder"));
    expect(screen.queryByText(/Elle reste visible/)).toBeNull();
    expect(tables.competitions[0].cancelled_at).toBeNull();
  });

  it("annulée : « Rétablir » sans confirmation", async () => {
    const { tables, onDone } = setup(
      { competitions: [row({ cancelled_at: "2026-11-10T10:00:00Z" })] },
      { id: "c1", athlete_id: "a", name: "HYROX Paris", cancelled_at: "2026-11-10T10:00:00Z" },
    );
    fireEvent.click(screen.getByText("Rétablir"));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("restored"));
    expect(tables.competitions[0].cancelled_at).toBeNull();
  });

  it("supprimer annonce ce qui est rattaché, puis supprime", async () => {
    const { tables, onDone } = setup({
      competitions: [row({ athlete_comment: "Dur mais bien" })],
      hyrox_results: [{ id: "r1", competition_id: "c1" }],
      hyrox_race_plans: [],
    });
    fireEvent.click(screen.getByText("Supprimer"));
    expect(await screen.findByText(/Le résultat HYROX est gardé/)).toBeInTheDocument();
    expect(screen.getByText(/Le bilan écrit par l’athlète sera perdu/)).toBeInTheDocument();
    const confirm = screen.getAllByText("Supprimer").at(-1)!;
    fireEvent.click(confirm);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("deleted"));
    expect(tables.competitions).toHaveLength(0);
  });

  it("suppression simple (faute de frappe) : pas d'avertissement", async () => {
    setup({ competitions: [row()], hyrox_results: [], hyrox_race_plans: [] });
    fireEvent.click(screen.getByText("Supprimer"));
    expect(await screen.findByText(/C'est définitif/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Vérification/)).toBeNull());
    expect(screen.queryByText(/gardé/)).toBeNull();
  });
});
