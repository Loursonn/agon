// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AthleteOnboarding } from "../AthleteOnboarding";
import { TodayTips } from "../today/TodayTips";
import { pendingTip } from "@/lib/onboarding";

const markOnboarded = vi.fn(() => Promise.resolve());
vi.mock("@/api/profile", () => ({ markOnboarded: () => markOnboarded() }));
vi.mock("@/features/shared/components/ConnectedServicesSection", () => ({ ProviderCards: () => <div>cartes montres</div> }));

beforeEach(() => { localStorage.clear(); markOnboarded.mockClear(); });

describe("AthleteOnboarding", () => {
  it("bienvenue → montre → wellness court, puis bulles d'aide", async () => {
    const save = vi.fn(() => Promise.resolve(true));
    const done = vi.fn();
    render(<AthleteOnboarding uid="u1" firstName="Léa" coachName="Agon Démo" saveWellness={save} onDone={done} />);
    expect(screen.getByText("Agon Démo voit tes retours et ajuste ton programme.")).toBeTruthy();
    fireEvent.click(screen.getByText("Commencer"));
    expect(screen.getByText("cartes montres")).toBeTruthy();
    fireEvent.click(screen.getByText("Plus tard"));
    const valider = screen.getByText("Valider") as HTMLButtonElement;
    expect(valider.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Récupération 4 sur 5"));
    fireEvent.click(screen.getByLabelText("Sommeil 3 sur 5"));
    fireEvent.click(screen.getByLabelText("Énergie 5 sur 5"));
    await act(async () => { fireEvent.click(screen.getByText("Valider")); });
    expect(save).toHaveBeenCalledWith({ fatigue: 4, sommeil: 3, energie: 5 });
    expect(done).toHaveBeenCalled();
    expect(markOnboarded).toHaveBeenCalled();
    expect(pendingTip("u1")).toBe(0);
  });

  it("« Passer » : fini tout de suite, sans bulles", () => {
    const done = vi.fn();
    render(<AthleteOnboarding uid="u2" firstName="Léa" coachName={null} saveWellness={vi.fn()} onDone={done} />);
    fireEvent.click(screen.getByText("Passer"));
    expect(done).toHaveBeenCalled();
    expect(markOnboarded).toHaveBeenCalled();
    expect(pendingTip("u2")).toBeNull();
  });

  it("reprend à l'étape enregistrée (retour de l'autorisation COROS)", () => {
    localStorage.setItem("agon:onboarding:u3", "1");
    render(<AthleteOnboarding uid="u3" firstName="Léa" coachName={null} saveWellness={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByText("Lie ta montre")).toBeTruthy();
  });
});

describe("TodayTips", () => {
  it("3 bulles puis plus rien", () => {
    localStorage.setItem("agon:tips:u1", "0");
    render(<TodayTips uid="u1" />);
    expect(screen.getByText("Ta séance du jour")).toBeTruthy();
    fireEvent.click(screen.getByText("Suivant"));
    expect(screen.getByText("Ton programme")).toBeTruthy();
    fireEvent.click(screen.getByText("Suivant"));
    fireEvent.click(screen.getByText("Compris"));
    expect(screen.queryByText("Astuce", { exact: false })).toBeNull();
  });
});
