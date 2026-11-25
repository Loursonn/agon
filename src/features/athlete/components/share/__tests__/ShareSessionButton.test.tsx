import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ShareSessionButton } from "../ShareSessionButton";


describe("ShareSessionButton", () => {
  it("ne déclenche pas la carte en dessous et passe la séance au parent (tiroir)", () => {
    const onCard = vi.fn();
    const onOpen = vi.fn();
    render(
      <div onClick={onCard}>
        <ShareSessionButton target={{ kind: "workout", id: "w1" }} onOpen={onOpen} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Partager ma séance" }));
    expect(onOpen).toHaveBeenCalledWith({ kind: "workout", id: "w1" });
    expect(onCard).not.toHaveBeenCalled();
  });

  it("séance d'énergie : même icône, cible énergie", () => {
    const onOpen = vi.fn();
    render(<ShareSessionButton target={{ kind: "energy", id: "e1" }} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Partager ma séance" }));
    expect(onOpen).toHaveBeenCalledWith({ kind: "energy", id: "e1" });
  });
});
