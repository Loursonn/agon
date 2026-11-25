// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ShareCard } from "@/lib/share/sessionShare";

vi.mock("@/features/shared/context/AthleteContext", () => ({
  useOptionalAthleteContext: () => ({ athleteId: "lea", athleteProfile: { first_name: "Léa", full_name: "Léa Démo" } }),
}));
vi.mock("@/features/shared/hooks/useCoCoach", () => ({ useAthleteCoaches: () => ({ data: null }) }));
vi.mock("@/features/shared/hooks/useCompetitionList", () => ({ useCompetitionList: () => ({ data: [] }) }));
// jsdom ne dessine pas : image factice, prête tout de suite.
vi.mock("../sessionShareCanvas", () => ({
  drawSessionShare: () => true,
  sessionShareBlob: () => Promise.resolve(new Blob(["png"], { type: "image/png" })),
  loadSessionShareFonts: () => Promise.resolve(),
  shareFileName: () => "seance.png",
}));

const { SessionShareSheet } = await import("../SessionShareSheet");

const card: ShareCard = { kind: "muscu", done: false, accent: "#FC3", kicker: "Musculation", who: null, title: "Squat", stats: [], sections: [], coach: null };

function setup(coarse: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: coarse }) as unknown as typeof window.matchMedia;
  URL.createObjectURL = vi.fn(() => "blob:apercu");
  URL.revokeObjectURL = vi.fn();
  const share = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { share, canShare: () => true });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<SessionShareSheet variants={[{ key: "planned", build: () => card }]} day="2026-11-25" onClose={() => {}} />);
  return { share, click };
}

afterEach(() => vi.restoreAllMocks());

describe("SessionShareSheet : enregistrer", () => {
  it("téléphone : « Enregistrer » ouvre la feuille du système (→ Photos), aperçu en image pour l'appui long", async () => {
    const { share, click } = setup(true);
    const img = await screen.findByRole("img", { name: "Aperçu de l'image à partager" });
    expect(img.getAttribute("src")).toBe("blob:apercu");
    expect(screen.getByText(/Enregistrer l'image/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0][0].files[0].name).toBe("seance.png");
    expect(click).not.toHaveBeenCalled();
  });

  it("ordinateur : « Enregistrer » télécharge l'image", async () => {
    const { share, click } = setup(false);
    await screen.findByRole("img", { name: "Aperçu de l'image à partager" });
    expect(screen.queryByText(/Enregistrer l'image/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(share).not.toHaveBeenCalled();
  });
});
