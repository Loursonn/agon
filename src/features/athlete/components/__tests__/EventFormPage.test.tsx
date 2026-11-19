import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import type { Competition } from "@/types/planning";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { EventFormPage } from "../EventFormPage";

const comp: Competition = {
  id: "c1", athlete_id: "a", coach_id: "k", name: "10 km de Boulogne", type: "competition", date: "2026-12-06",
  date_end: null, location: "Boulogne", notes: null, priority: "B", created_at: "2026-10-01T00:00:00Z",
};

function setup(existing: Competition = comp) {
  const db = fakeDb({ competitions: [{ ...existing } as unknown as Row] });
  setDbForTests(db.db);
  const onClose = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { networkMode: "always" } } });
  render(
    <QueryClientProvider client={qc}>
      <EventFormPage athleteId="a" coachId="k" coachName={null} existing={existing} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { ...db, onClose };
}

afterEach(() => { setDbForTests(null); toast.success.mockReset(); toast.error.mockReset(); });

describe("EventFormPage · modifier une compétition", () => {
  it("pré-remplit le formulaire, sans choix du type", () => {
    setup();
    expect(screen.getByText("Modifier la compétition")).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveValue("10 km de Boulogne");
    expect(screen.getByLabelText("Date")).toHaveValue("2026-12-06");
    expect(screen.getByLabelText("Lieu")).toHaveValue("Boulogne");
    expect(screen.getByRole("button", { name: /B\s*Importante/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Stage")).toBeNull();
  });

  it("enregistre nom, date, priorité et lieu sur la même ligne", async () => {
    const { tables, onClose } = setup();
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Semi de Boulogne" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-12-13" } });
    fireEvent.click(screen.getByRole("button", { name: /A\s*Objectif/ }));
    fireEvent.change(screen.getByLabelText("Lieu"), { target: { value: "" } });
    fireEvent.click(screen.getByText("Enregistrer"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(tables.competitions).toHaveLength(1);
    expect(tables.competitions[0]).toMatchObject({
      id: "c1", name: "Semi de Boulogne", date: "2026-12-13", priority: "A", location: null, date_end: null, type: "competition",
    });
    expect(toast.success).toHaveBeenCalledWith("Compétition modifiée");
  });

  it("« Retirer » la date de fin repasse la compétition sur un jour", async () => {
    const { tables, onClose } = setup({ ...comp, date_end: "2026-12-07" });
    expect(screen.getByLabelText("Date de fin")).toHaveValue("2026-12-07");
    fireEvent.click(screen.getByText("Retirer"));
    fireEvent.click(screen.getByText("Enregistrer"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(tables.competitions[0].date_end).toBeNull();
  });
});
