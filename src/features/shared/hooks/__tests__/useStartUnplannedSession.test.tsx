import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError } from "@/api/client";

const api = vi.hoisted(() => ({
  listSessionLogsBetween: vi.fn(),
  planWorkout: vi.fn(),
  moveWorkoutToDayByAthlete: vi.fn(),
}));
const writes = vi.hoisted(() => ({ submitWrite: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() }));

vi.mock("@/api/workouts", () => ({
  listSessionLogsBetween: api.listSessionLogsBetween,
  planWorkout: api.planWorkout,
  moveWorkoutToDayByAthlete: api.moveWorkoutToDayByAthlete,
  invalidateWorkouts: () => Promise.resolve(),
}));
vi.mock("@/lib/offline/writes", () => ({ submitWrite: writes.submitWrite, QUEUED_TOAST: "en file" }));
vi.mock("sonner", () => ({ toast }));

import { useStartUnplannedSession } from "../useStartUnplannedSession";

const INPUT = {
  athleteId: "A", coachId: "C", sessionId: "S", sessionName: "Haut",
  scheduledDate: "2026-11-09", weekMondayISO: "2026-11-09",
};
const networkError = () => new ApiError("x", { message: "TypeError: Failed to fetch", code: "" });

function setup(seed?: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { mutations: { networkMode: "always" } } });
  seed?.(qc);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useStartUnplannedSession(), { wrapper });
}

beforeEach(() => {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
  Object.values(api).forEach((f) => f.mockReset());
  writes.submitWrite.mockReset();
  Object.values(toast).forEach((f) => f.mockReset());
});
afterEach(() => vi.restoreAllMocks());

describe("useStartUnplannedSession", () => {
  it("en ligne : séance créée tout de suite, sans passer par la file", async () => {
    api.listSessionLogsBetween.mockResolvedValue([]);
    api.planWorkout.mockImplementation(async (p: { id: string }) => ({ id: p.id, session_name: "Haut", status: "planned" }));
    const { result } = setup();
    let out: { action: string; queued?: boolean } | undefined;
    await act(async () => { out = await result.current.mutateAsync(INPUT); });
    expect(api.planWorkout).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "S", date: "2026-11-09", byAthlete: true }));
    expect(writes.submitWrite).not.toHaveBeenCalled();
    expect(out).toMatchObject({ action: "insert" });
    expect(out?.queued).toBeUndefined();
  });

  it("coupure pendant la création : mise en file avec le même id", async () => {
    api.listSessionLogsBetween.mockResolvedValue([]);
    api.planWorkout.mockRejectedValue(networkError());
    writes.submitWrite.mockResolvedValue({ status: "queued" });
    const { result } = setup();
    let out: { id: string; queued?: boolean } | undefined;
    await act(async () => { out = await result.current.mutateAsync(INPUT); });
    const sentId = api.planWorkout.mock.calls[0][0].id;
    expect(writes.submitWrite).toHaveBeenCalledWith("workout.plan", expect.objectContaining({ logId: sentId }));
    expect(out).toMatchObject({ id: sentId, queued: true });
  });

  it("en ligne, place prise par une séance annulée par le coach : refus clair", async () => {
    api.listSessionLogsBetween.mockResolvedValue([]);
    api.planWorkout.mockResolvedValue({ id: "X", session_name: "Haut", status: "skipped" });
    const { result } = setup();
    await act(async () => { await result.current.mutateAsync(INPUT).catch(() => {}); });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("annulé"));
    expect(writes.submitWrite).not.toHaveBeenCalled();
  });

  it("hors ligne, séance du jour annulée (cache) : refus, rien en file", async () => {
    api.listSessionLogsBetween.mockRejectedValue(networkError());
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const { result } = setup((qc) => qc.setQueryData(["workout-log-detail", "X"], {
      id: "X", athlete_id: "A", session_id: "S", status: "skipped", scheduled_date: "2026-11-09",
    }));
    await act(async () => { await result.current.mutateAsync(INPUT).catch(() => {}); });
    expect(writes.submitWrite).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("annulé"));
  });

  it("hors ligne, place libre : en file, sans essai réseau", async () => {
    api.listSessionLogsBetween.mockRejectedValue(networkError());
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    writes.submitWrite.mockResolvedValue({ status: "queued" });
    const { result } = setup();
    await act(async () => { await result.current.mutateAsync(INPUT); });
    expect(api.planWorkout).not.toHaveBeenCalled();
    expect(writes.submitWrite).toHaveBeenCalledWith("workout.plan", expect.anything());
  });

  it("erreur serveur (pas réseau) : pas de mise en file", async () => {
    api.listSessionLogsBetween.mockResolvedValue([]);
    api.planWorkout.mockRejectedValue(new ApiError("x", { message: "non", code: "23502" }));
    const { result } = setup();
    await act(async () => { await result.current.mutateAsync(INPUT).catch(() => {}); });
    expect(writes.submitWrite).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Impossible de démarrer cette séance");
  });
});
