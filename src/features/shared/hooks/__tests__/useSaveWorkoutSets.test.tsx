import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError } from "@/api/client";
import { loadDraft, workoutDraftKey } from "@/lib/localDraft";

const api = vi.hoisted(() => ({
  patchWorkoutEntries: vi.fn(),
  sendEntriesKeepalive: vi.fn(),
}));
const writes = vi.hoisted(() => ({
  submitWrite: vi.fn(),
  pendingWrites: vi.fn(() => 0),
}));

vi.mock("@/api/workouts", () => ({
  patchWorkoutEntries: api.patchWorkoutEntries,
  sendEntriesKeepalive: api.sendEntriesKeepalive,
  currentAccessToken: () => Promise.resolve("tok"),
  onAccessTokenChange: () => () => {},
  invalidateWorkouts: () => Promise.resolve(),
  isWorkoutNotFound: (e: unknown) => (e as { code?: string })?.code === "P0002",
}));
vi.mock("@/lib/offline/writes", () => ({
  submitWrite: writes.submitWrite,
  pendingWrites: writes.pendingWrites,
  QUEUED_TOAST: "en file",
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), dismiss: vi.fn(), success: vi.fn() } }));

import { useSaveWorkoutSets } from "../useSaveWorkoutSets";

const MODS = { comment: "x", sessionSets: { e1: [{ kg: 50, reps: 5, done: true }] } } as never;
const networkError = () => new ApiError("Saisie non enregistrée", { message: "TypeError: Failed to fetch", code: "" });

function setup() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSaveWorkoutSets("L1", "A"), { wrapper });
}

const flushPromises = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

let online = true;
beforeEach(() => {
  online = true;
  vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => online);
  api.patchWorkoutEntries.mockReset();
  writes.submitWrite.mockReset();
  writes.pendingWrites.mockReset().mockReturnValue(0);
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("useSaveWorkoutSets — hors ligne", () => {
  it("en ligne : envoi direct, brouillon marqué synchronisé", async () => {
    api.patchWorkoutEntries.mockResolvedValue({});
    const { result } = setup();
    act(() => result.current.flushNow(MODS));
    await flushPromises();
    expect(api.patchWorkoutEntries).toHaveBeenCalledWith("L1", MODS);
    expect(writes.submitWrite).not.toHaveBeenCalled();
    expect(loadDraft(workoutDraftKey("A", "L1"))?.synced).toBe(true);
  });

  it("coupure réseau au premier essai : en file avec la saisie COMPLÈTE", async () => {
    api.patchWorkoutEntries.mockRejectedValue(networkError());
    writes.submitWrite.mockResolvedValue({ status: "queued" });
    const { result } = setup();
    act(() => result.current.flushNow(MODS));
    await flushPromises();
    expect(writes.submitWrite).toHaveBeenCalledWith("workout.entries", { athleteId: "A", logId: "L1", patch: MODS });
    // Le brouillon reste « non synchronisé » : filet de sécurité.
    expect(loadDraft(workoutDraftKey("A", "L1"))?.synced).toBe(false);
  });

  it("navigateur hors ligne : directement en file, sans essai réseau", async () => {
    online = false;
    writes.submitWrite.mockResolvedValue({ status: "queued" });
    const { result } = setup();
    act(() => result.current.flushNow(MODS));
    await flushPromises();
    expect(api.patchWorkoutEntries).not.toHaveBeenCalled();
    expect(writes.submitWrite).toHaveBeenCalledTimes(1);
  });

  it("des saisies attendent déjà : on passe par la file (ordre gardé)", async () => {
    writes.pendingWrites.mockReturnValue(2);
    writes.submitWrite.mockResolvedValue({ status: "sent", result: {} });
    const { result } = setup();
    act(() => result.current.flushNow(MODS));
    await flushPromises();
    expect(api.patchWorkoutEntries).not.toHaveBeenCalled();
    expect(writes.submitWrite).toHaveBeenCalledTimes(1);
    expect(loadDraft(workoutDraftKey("A", "L1"))?.synced).toBe(true);
  });

  it("saisie abandonnée pendant l'envoi (séance validée) : pas remise en file", async () => {
    let reject!: (e: unknown) => void;
    api.patchWorkoutEntries.mockReturnValue(new Promise((_, r) => { reject = r; }));
    const { result } = setup();
    act(() => result.current.flushNow(MODS));
    act(() => result.current.discardPending());
    reject(networkError());
    await flushPromises();
    expect(writes.submitWrite).not.toHaveBeenCalled();
  });

  it("séance supprimée (P0002) : ni file ni nouvel essai", async () => {
    vi.useFakeTimers();
    try {
      api.patchWorkoutEntries.mockRejectedValue(new ApiError("x", { message: "Séance introuvable", code: "P0002" }));
      const { result } = setup();
      act(() => result.current.flushNow(MODS));
      await flushPromises();
      await act(async () => { vi.advanceTimersByTime(120_000); });
      expect(api.patchWorkoutEntries).toHaveBeenCalledTimes(1);
      expect(writes.submitWrite).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keepalive hors ligne : rangé dans la file, pas d'envoi keepalive", () => {
    online = false;
    writes.submitWrite.mockResolvedValue({ status: "queued" });
    const { result } = setup();
    act(() => result.current.save(MODS));
    act(() => result.current.flushNow(undefined, { keepalive: true }));
    expect(writes.submitWrite).toHaveBeenCalledWith("workout.entries", { athleteId: "A", logId: "L1", patch: MODS });
    expect(api.sendEntriesKeepalive).not.toHaveBeenCalled();
  });
});
