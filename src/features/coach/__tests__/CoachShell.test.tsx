import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Pas de réseau : l'auth, les nouveautés et les liens staff sont des valeurs fixes.
const logout = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "c1" }, profile: { role: "coach", full_name: "Agon Démo" }, logout }),
}));
vi.mock("@/features/shared/hooks/useAppUpdates", () => ({ useAppUpdates: () => ({ unseen: [] }) }));
vi.mock("@/features/staff/hooks/useMyStaffLinks", () => ({ useHasStaffLinks: () => ({ hasLinks: false }) }));
vi.mock("@/features/coach/components/CommandPalette", () => ({ CommandPalette: () => null }));
vi.mock("@/features/shared/components/OfflineBanner", () => ({
  default: ({ variant }: { variant?: string }) => <div data-testid="offline-banner">{variant}</div>,
}));

import CoachShell from "../CoachShell";

function setWidth(w: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: w });
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/coach"]}>
      <Routes>
        <Route path="/coach" element={<CoachShell />}>
          <Route index element={<div>Accueil coach</div>} />
          <Route path="athletes" element={<div>Page athlètes</div>} />
        </Route>
        <Route path="/athlete" element={<div>Espace athlète</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => setWidth(1024));

describe("CoachShell responsive", () => {
  it("PC : la sidebar est affichée sans tiroir, barre du haut complète", () => {
    setWidth(1280);
    renderShell();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Athlètes")).toBeInTheDocument();
    expect(screen.getByText("Mode Athlète")).toBeInTheDocument();
    expect(screen.getByTestId("offline-banner")).toHaveTextContent("coach");
    expect(screen.getByText("Accueil coach")).toBeInTheDocument();
  });

  it("mobile : la navigation est dans un tiroir qui se referme après un choix", async () => {
    setWidth(375);
    renderShell();
    // Fermé au départ : la nav n'est pas rendue
    expect(screen.queryByText("Athlètes")).toBeNull();
    // Logo compact dans la barre du haut
    expect(screen.getAllByAltText("Agon").length).toBeGreaterThan(0);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Menu" })); });
    const drawer = await screen.findByRole("dialog");
    fireEvent.click(within(drawer).getByText("Athlètes"));

    expect(await screen.findByText("Page athlètes")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("mobile : Mode Athlète et déconnexion restent accessibles", async () => {
    setWidth(375);
    renderShell();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Menu" })); });
    const drawer = await screen.findByRole("dialog");
    fireEvent.click(within(drawer).getByText("Déconnexion"));
    expect(logout).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Mode Athlète"));
    expect(await screen.findByText("Espace athlète")).toBeInTheDocument();
  });
});
