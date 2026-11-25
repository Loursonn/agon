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

let comps: unknown[] = [];
vi.mock("@/features/shared/hooks/useCompetitionList", () => ({ useCompetitionList: () => ({ data: comps }) }));

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

  it("objectif : éteint par défaut, compétition A proposée, l'athlète en choisit une autre", () => {
    comps = [
      { id: "b", name: "Trail des Lacs", date: "2026-12-20", priority: "B" },
      { id: "a", name: "HYROX Paris", date: "2027-05-24", priority: "A" },
      { id: "x", name: "Passée", date: "2026-10-01", priority: "A" },
    ];
    render(<SessionShareSheet variants={[{ key: "done", build: (o, p) => card(true, o, p) }]} day="2026-11-25" onClose={() => {}} />);
    const toggle = screen.getByRole("switch", { name: "Mon objectif" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByRole("radiogroup", { name: "Compétition visée" })).toBeNull();
    fireEvent.click(toggle);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["J-25 · Trail des Lacs", "J-180 · HYROX Paris"]);
    expect(radios[1].getAttribute("aria-checked")).toBe("true");
    fireEvent.click(radios[0]);
    expect(screen.getAllByRole("radio")[0].getAttribute("aria-checked")).toBe("true");
    comps = [];
  });

  it("sans compétition à venir : pas d'interrupteur objectif", () => {
    comps = [{ id: "x", name: "Passée", date: "2026-10-01", priority: "A" }];
    render(<SessionShareSheet variants={[{ key: "planned", build: (o, p) => card(false, o, p) }]} day="2026-11-25" onClose={() => {}} />);
    expect(screen.queryByRole("switch", { name: "Mon objectif" })).toBeNull();
    comps = [];
  });
});
