/**
 * Saisie énergie de l'athlète et file hors ligne : gardée → l'écran la montre
 * (cache optimiste) sans invalidation ; envoyée → rafraîchissement ; séance
 * retirée par le coach (P0002) → retour en arrière + message.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";

const { submitWrite, toast } = vi.hoisted(() => ({
  submitWrite: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/offline/writes", () => ({
  submitWrite,
  QUEUED_TOAST: "GARDÉE",
  notifyQueued: () => toast.info("GARDÉE", { id: "write-queued" }),
}));
vi.mock("sonner", () => ({ toast }));

import { ApiError } from "@/api/client";
import { energyKeys } from "@/api/energy";
import { planningKeys } from "@/api/planning";
import { useCompleteEnergyAssignment, useUpsertEnergyRpe } from "../useEnergyAssignments";

const AID = "ath-1";
const row = (over: Record<string, unknown> = {}) => ({
  id: "e1", athlete_id: AID, energy_session_id: "s1", scheduled_date: "2026-11-08",
  status: "planned", block_logs: {}, rpe_score: null, created_at: "", updated_at: "", ...over,
});

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

const listKey = energyKeys.assignments(AID);
const rangeKey = energyKeys.assignments(AID, { from: "2026-11-01", to: "2026-11-30" });
const calKey = planningKeys.calendar(AID, "2026-11-01", "2026-11-30");
const planKey = planningKeys.activePlan(AID, 0);

function seed() {
  qc.setQueryData(listKey, [row(), row({ id: "e2" })]);
  qc.setQueryData(rangeKey, [row()]);
  qc.setQueryData(calKey, [
    { id: "e1", type: "energy", date: "2026-11-08", title: "VMA", status: "planned", rpe: null, partial: false, raw: row() },
    { id: "w1", type: "workout", date: "2026-11-08", title: "Muscu", status: "planned" },
  ]);
  qc.setQueryData(planKey, {
    mesocycle: null, cycle: null, pastCycles: [], weekSessionCount: 1,
    weekDays: [{ date: "2026-11-08", dow: 6, tests: [], competitions: [], sessions: [
      { id: "e1", sessionName: "VMA", scheduledDate: "2026-11-08", status: "planned", kind: "energy" },
    ] }],
  });
}

const input = {
  id: "e1", athleteId: AID,
  block_logs: { b1: { done: true } }, notes: "ok", actual_duration_min: 42,
  activity_type: "course" as const, distance_km: 9, rpe_score: 6,
};

type Row = ReturnType<typeof row> & Record<string, unknown>;
const list = (k: readonly unknown[]) => qc.getQueryData<Row[]>(k)!;

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  seed();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  qc.clear();
});

describe("useCompleteEnergyAssignment", () => {
  it("gardée hors ligne : toutes les listes montrent la séance validée, toast « gardée », pas d'invalidation", async () => {
    submitWrite.mockResolvedValue({ status: "queued" });
    const inval = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCompleteEnergyAssignment(), { wrapper });

    await act(() => result.current.mutateAsync(input));

    expect(submitWrite).toHaveBeenCalledWith("energy.complete", {
      athleteId: AID, id: "e1",
      input: { block_logs: { b1: { done: true } }, notes: "ok", actual_duration_min: 42, activity_type: "course", distance_km: 9, rpe_score: 6 },
    });
    const e1 = list(listKey)[0];
    expect(e1).toMatchObject({ status: "completed", block_logs: { b1: { done: true } }, notes: "ok", actual_duration_min: 42, activity_type: "course", distance_km: 9, rpe_score: 6 });
    expect(list(listKey)[1].status).toBe("planned");
    expect(list(rangeKey)[0].status).toBe("completed");

    const cal = qc.getQueryData<Array<{ id: string; status?: string; rpe?: number | null; raw?: Row }>>(calKey)!;
    expect(cal[0]).toMatchObject({ status: "completed", rpe: 6 });
    expect(cal[0].raw?.status).toBe("completed");
    expect(cal[1].status).toBe("planned");

    const plan = qc.getQueryData<{ weekDays: Array<{ sessions: Array<{ status: string }> }> }>(planKey)!;
    expect(plan.weekDays[0].sessions[0].status).toBe("completed");

    expect(toast.info).toHaveBeenCalledWith("GARDÉE", expect.anything());
    expect(toast.success).not.toHaveBeenCalled();
    expect(inval).not.toHaveBeenCalled();
    // Pour l'écran, la saisie est faite (phase RPE, brouillon purgé…).
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("envoyée : rafraîchit les séances de l'athlète et confirme", async () => {
    submitWrite.mockResolvedValue({ status: "sent", result: row({ status: "completed" }) });
    const { result } = renderHook(() => useCompleteEnergyAssignment(), { wrapper });

    await act(() => result.current.mutateAsync(input));

    expect(toast.success).toHaveBeenCalledWith("Séance validée !");
    expect(toast.info).not.toHaveBeenCalled();
    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(calKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(planKey)?.isInvalidated).toBe(true);
  });

  it("séance retirée par le coach (P0002) : retour en arrière, message, rafraîchissement", async () => {
    submitWrite.mockRejectedValue(new ApiError("Validation de la séance impossible", { message: "Séance introuvable", code: "P0002" }));
    const { result } = renderHook(() => useCompleteEnergyAssignment(), { wrapper });

    act(() => result.current.mutate(input));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(list(listKey)[0].status).toBe("planned");
    expect(list(rangeKey)[0].status).toBe("planned");
    expect(qc.getQueryData<Array<{ status?: string }>>(calKey)![0].status).toBe("planned");
    expect(qc.getQueryData<{ weekDays: Array<{ sessions: Array<{ status: string }> }> }>(planKey)!.weekDays[0].sessions[0].status).toBe("planned");
    expect(toast.error).toHaveBeenCalledWith("Cette séance n'existe plus : ton coach l'a retirée.");
    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(true);
  });

  it("autre refus (saisie invalide) : retour en arrière et message d'échec", async () => {
    submitWrite.mockRejectedValue(new ApiError("Validation de la séance impossible", { message: "Durée invalide", code: "22023" }));
    const { result } = renderHook(() => useCompleteEnergyAssignment(), { wrapper });

    act(() => result.current.mutate(input));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(list(listKey)[0].status).toBe("planned");
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Validation échouée"));
  });
});

describe("useUpsertEnergyRpe", () => {
  it("gardé hors ligne : RPE visible partout, toast « gardée », pas d'invalidation", async () => {
    submitWrite.mockResolvedValue({ status: "queued" });
    const inval = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpsertEnergyRpe(), { wrapper });

    await act(() => result.current.mutateAsync({ id: "e1", athleteId: AID, rpe_score: 8 }));

    expect(submitWrite).toHaveBeenCalledWith("energy.rpe", { athleteId: AID, id: "e1", rpe: 8 });
    expect(list(listKey)[0].rpe_score).toBe(8);
    expect(list(listKey)[0].status).toBe("planned");
    expect(qc.getQueryData<Array<{ rpe?: number | null }>>(calKey)![0].rpe).toBe(8);
    expect(toast.info).toHaveBeenCalledWith("GARDÉE", expect.anything());
    expect(inval).not.toHaveBeenCalled();
  });

  it("envoyé : rafraîchit et confirme", async () => {
    submitWrite.mockResolvedValue({ status: "sent", result: row({ rpe_score: 8 }) });
    const { result } = renderHook(() => useUpsertEnergyRpe(), { wrapper });

    await act(() => result.current.mutateAsync({ id: "e1", athleteId: AID, rpe_score: 8 }));

    expect(toast.success).toHaveBeenCalledWith("RPE enregistré");
    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(true);
  });

  it("séance retirée (P0002) : RPE retiré de l'écran et message", async () => {
    submitWrite.mockRejectedValue(new ApiError("Enregistrement du RPE impossible", { message: "Séance introuvable", code: "P0002" }));
    const { result } = renderHook(() => useUpsertEnergyRpe(), { wrapper });

    act(() => result.current.mutate({ id: "e1", athleteId: AID, rpe_score: 8 }));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(list(listKey)[0].rpe_score).toBeNull();
    expect(toast.error).toHaveBeenCalledWith("Cette séance n'existe plus : ton coach l'a retirée.");
  });
});
