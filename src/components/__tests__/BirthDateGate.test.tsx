import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/api/client";
import { BirthDateRefused } from "@/api/profile";

// Pas de réseau : l'auth est remplacée par des valeurs fixes.
const auth = {
  profile: null as null | { role: string; birth_date: string | null; is_pending?: boolean },
  setMyBirthDate: vi.fn(),
  logout: vi.fn(),
};
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

import BirthDateGate from "../BirthDateGate";

function renderGate() {
  return render(
    <BirthDateGate>
      <div>APP</div>
    </BirthDateGate>,
  );
}

function fill(day: string) {
  fireEvent.change(screen.getByLabelText("Date de naissance"), { target: { value: day } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
}

beforeEach(() => {
  auth.profile = { role: "athlete", birth_date: null };
  auth.setMyBirthDate.mockReset();
  auth.logout.mockReset();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

describe("BirthDateGate (revue juridique C2)", () => {
  it("date connue : l'app s'affiche, aucune question", () => {
    auth.profile = { role: "athlete", birth_date: "1990-04-12" };
    renderGate();
    expect(screen.getByText("APP")).toBeInTheDocument();
    expect(screen.queryByText("Ta date de naissance")).not.toBeInTheDocument();
  });

  it("date inconnue : écran de saisie, l'app est masquée, pas de bouton pour passer (tous les rôles)", () => {
    for (const role of ["athlete", "coach", "coach_athlete", "staff"]) {
      auth.profile = { role, birth_date: null };
      const { unmount } = renderGate();
      expect(screen.getByText("Ta date de naissance")).toBeInTheDocument();
      expect(screen.queryByText("APP")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /plus tard|passer|ignorer/i })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("enregistre la date saisie ; le profil rechargé (date connue) ouvre l'app", async () => {
    auth.setMyBirthDate.mockImplementation(async (d: string) => { auth.profile = { role: "athlete", birth_date: d }; });
    const { rerender } = renderGate();
    fill("1990-04-12");
    await waitFor(() => expect(auth.setMyBirthDate).toHaveBeenCalledWith("1990-04-12"));
    rerender(<BirthDateGate><div>APP</div></BirthDateGate>);
    expect(screen.getByText("APP")).toBeInTheDocument();
  });

  it("refus de la règle d'âge : message affiché, l'app reste masquée", async () => {
    auth.setMyBirthDate.mockRejectedValue(new BirthDateRefused("Tu dois avoir au moins 15 ans pour utiliser Agon."));
    renderGate();
    fill("2015-01-01");
    expect(await screen.findByText("Tu dois avoir au moins 15 ans pour utiliser Agon.")).toBeInTheDocument();
    expect(screen.queryByText("APP")).not.toBeInTheDocument();
  });

  it("erreur réseau : message, on peut réessayer", async () => {
    auth.setMyBirthDate.mockRejectedValue(new ApiError("Date de naissance non enregistrée", { message: "Failed to fetch" }));
    renderGate();
    fill("1990-04-12");
    expect(await screen.findByText(/Enregistrement impossible/)).toBeInTheDocument();
    expect(screen.queryByText("APP")).not.toBeInTheDocument();
  });

  it("jamais bloquant pour une raison technique : fonction absente du serveur ou date déjà enregistrée", async () => {
    for (const code of ["PGRST202", "23505"]) {
      auth.setMyBirthDate.mockRejectedValue(new ApiError("Date de naissance non enregistrée", { message: "x", code }));
      const { unmount } = renderGate();
      fill("1990-04-12");
      expect(await screen.findByText("APP")).toBeInTheDocument();
      unmount();
    }
  });

  it("hors ligne : l'app s'ouvre, la question reviendra", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderGate();
    expect(screen.getByText("APP")).toBeInTheDocument();
  });

  it("« Se déconnecter » reste possible", () => {
    renderGate();
    fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    expect(auth.logout).toHaveBeenCalled();
  });
});
