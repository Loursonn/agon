// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

let sleep: unknown = null;
window.scrollTo = () => {};
vi.mock("@/features/athlete/hooks/useWatchSleep", () => ({ useWatchSleep: () => ({ data: sleep }) }));
vi.mock("@/features/athlete/hooks/useYesterdayWorkout", () => ({ useYesterdayWorkout: () => ({ data: null }) }));
vi.mock("@/features/athlete/components/wellness/WellnessTrendCard", () => ({ WellnessTrendCard: () => null }));
vi.mock("@/features/shared/context/AthleteContext", () => ({ useOptionalAthleteContext: () => ({ athleteId: "lea" }) }));

const { WellnessFlow } = await import("../WellnessFlow");

describe("Wellness · nuit", () => {
  it("sans montre : saisie coucher / réveil", () => {
    sleep = null;
    const { unmount } = render(<WellnessFlow existing={null} onSave={() => {}} sleepTarget={8} weightLog={null} onClose={() => {}} />);
    expect(screen.getByText("Coucher")).toBeTruthy();
    expect(screen.queryByText("Corriger")).toBeNull();
    unmount();
  });

  it("montre reliée : nuit mesurée, attribution, « Corriger » rend la saisie", () => {
    sleep = { hours: 7.5, start: { h: 23, m: 10 }, end: { h: 6, m: 50 }, attribution: "Garmin Forerunner 265" };
    render(<WellnessFlow existing={null} onSave={() => {}} sleepTarget={8} weightLog={null} onClose={() => {}} />);
    expect(screen.queryByText("Coucher")).toBeNull();
    expect(screen.getByText(/23:10 → 06:50 · Garmin Forerunner 265/)).toBeTruthy();
    expect(screen.getByText("7 h 30")).toBeTruthy();
    fireEvent.click(screen.getByText("Corriger"));
    expect(screen.getByText("Coucher")).toBeTruthy();
  });
});
