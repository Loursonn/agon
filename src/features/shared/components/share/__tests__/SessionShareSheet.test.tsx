// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ShareCard, ShareOptions } from "@/lib/share/sessionShare";

vi.mock("@/features/shared/context/AthleteContext", () => ({
  useOptionalAthleteContext: () => ({ athleteId: "lea", athleteProfile: { first_name: "Léa", full_name: "Léa Démo" } }),
}));
vi.mock("@/features/shared/hooks/useCoCoach", () => ({
  useAthleteCoaches: () => ({ data: { referent: { id: "c", full_name: "Agon Démo" }, coCoach: null } }),
}));

const { SessionShareSheet } = await import("../SessionShareSheet");

const card = (done: boolean, opts: ShareOptions, people: { athleteFirstName: string | null; coach: string | null }): ShareCard => ({
  kind: "muscu", done, accent: "#FC3", kicker: done ? "Faite" : "Musculation",
  who: opts.showName ? people.athleteFirstName : null, title: "Squat", stats: [], sections: [],
  coach: opts.showCoach ? people.coach : null,
});

describe("SessionShareSheet", () => {
  it("prévue / faite, options, coach en prénom + initiale, Plus tard en fin de séance", () => {
    const planned = vi.fn((o: ShareOptions, p: { athleteFirstName: string | null; coach: string | null }) => card(false, o, p));
    const done = vi.fn((o: ShareOptions, p: { athleteFirstName: string | null; coach: string | null }) => card(true, o, p));
    const onClose = vi.fn();
    render(
      <SessionShareSheet
        variants={[{ key: "planned", build: planned }, { key: "done", build: done }]}
        initial="done" day="2026-11-25" hasLoads celebrate onClose={onClose}
      />,
    );
    expect(screen.getByText("Bravo !")).toBeTruthy();
    // Faite d'abord, avec le coach « Agon D. » et le prénom.
    expect(done).toHaveBeenLastCalledWith({ showName: true, showLoads: true, showCoach: true }, { athleteFirstName: "Léa", coach: "Agon D." });
    expect(screen.getByRole("radio", { name: "Faite" }).getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByRole("switch", { name: "Les charges" }));
    expect(done).toHaveBeenLastCalledWith(expect.objectContaining({ showLoads: false }), expect.anything());

    fireEvent.click(screen.getByRole("radio", { name: "Prévue" }));
    expect(planned).toHaveBeenLastCalledWith(expect.objectContaining({ showLoads: false }), expect.anything());

    fireEvent.click(screen.getByText("Plus tard"));
    expect(onClose).toHaveBeenCalled();
  });

  it("une seule version : pas de sélecteur ; pas de charges hors musculation", () => {
    render(
      <SessionShareSheet variants={[{ key: "planned", build: (o, p) => card(false, o, p) }]} day={null} onClose={() => {}} />,
    );
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("switch", { name: "Les charges" })).toBeNull();
    expect(screen.getByRole("switch", { name: "Mon coach" })).toBeTruthy();
    expect(screen.getByText("Partager ma séance")).toBeTruthy();
  });

  it("une carte qui ne se construit pas n'empêche pas d'ouvrir la feuille", () => {
    render(
      <SessionShareSheet variants={[{ key: "done", build: () => { throw new Error("boom"); } }]} day={null} onClose={() => {}} />,
    );
    expect(screen.getByText("Aperçu indisponible")).toBeTruthy();
  });
});
