// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HyroxResult } from "@/features/shared/types/hyrox";

// Résultat FABRIQUÉ (athlète de démo, temps inventés), mise en page de results.hyrox.com.
const SEGS: [string, string][] = [
  ["Running 1", "00:04:28"], ["1000m SkiErg", "00:04:22"], ["Running 2", "00:04:52"], ["50m Sled Push", "00:03:35"],
  ["Running 3", "00:05:00"], ["50m Sled Pull", "00:04:22"], ["Running 4", "00:04:58"], ["80m Burpee Broad Jump", "00:05:00"],
  ["Running 5", "00:05:05"], ["1000m Row", "00:04:30"], ["Running 6", "00:05:10"], ["200m Farmers Carry", "00:02:18"],
  ["Running 7", "00:05:12"], ["100m Sandbag Lunges", "00:04:10"], ["Running 8", "00:05:05"], ["Wall Balls", "00:05:55"],
  ["Roxzone Time", "00:03:36"],
];
const page = (overall: string) => [
  "Athlete\tDémo, Léa (FRA)", "Age Group\t30-34", "Race\t2026 Bordeaux", "Division\tHYROX - Saturday",
  "*Penalty\t–", "Disqual Reason\t–", "Rank (M/W)\t412", "Rank (AG)\t61", `Overall Time\t${overall}`,
  "Workout summary", "Split\tTime\tPlace", ...SEGS.map(([l, t]) => `${l}\t${t}\t–`),
].join("\n");

let races: Partial<HyroxResult>[] = [];
const create = vi.fn(async (_payload: Record<string, unknown>) => ({}));
const update = vi.fn(async (_payload: Record<string, unknown>) => ({}));

vi.mock("@/features/shared/hooks/hyrox/useHyroxResults", () => ({
  useHyroxResults: () => ({ data: races, isLoading: false }),
  useCreateHyroxResult: () => ({ mutateAsync: create, isPending: false }),
  useUpdateHyroxResult: () => ({ mutateAsync: update, isPending: false }),
  useDeleteHyroxResult: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/api/competitions", () => ({
  competitionKeys: { list: (id: string) => ["competitions", id, "list"] },
  listCompetitions: async () => [
    { id: "c-bdx", name: "HYROX Bordeaux", location: null, date: "2026-03-13", date_end: "2026-03-15", cancelled_at: null },
  ],
}));
vi.mock("@/features/shared/context/AthleteContext", () => ({ useAthleteContext: () => ({ athleteId: "lea" }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "lea" } }) }));
vi.mock("react-router-dom", () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useLocation: () => ({ pathname: "/athlete/hyrox" }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

const { default: RacesView } = await import("../RacesView");

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><RacesView /></QueryClientProvider>);
}

async function pasteAndRead(text: string) {
  fireEvent.click(screen.getByRole("button", { name: /Coller mon résultat/ }));
  fireEvent.change(screen.getByLabelText("Texte du résultat"), { target: { value: text } });
  // Laisse le calendrier se charger avant la lecture.
  await waitFor(() => new Promise((r) => setTimeout(r, 0)));
  fireEvent.click(screen.getByRole("button", { name: "Lire le résultat" }));
}

describe("Coller mon résultat", () => {
  beforeEach(() => {
    races = [{ id: "old", date: "2025-10-04", event_name: "HYROX Nice", total_s: 4500, division: "women" }];
    create.mockClear();
    update.mockClear();
  });

  it("pré-remplit toute la fiche et enregistre la course comme importée", async () => {
    renderView();
    await pasteAndRead(page("01:17:31"));
    expect(await screen.findByText("Pré-rempli depuis ton résultat HYROX.")).toBeTruthy();
    expect(screen.queryByText(/À compléter/)).toBeNull();
    expect(screen.getByDisplayValue("HYROX Bordeaux")).toBeTruthy();
    expect(screen.getByDisplayValue("2026-03-14")).toBeTruthy();
    expect(screen.getByDisplayValue("1:17:31")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0]).toMatchObject({
      athlete_id: "lea", date: "2026-03-14", event_name: "HYROX Bordeaux", venue: "Bordeaux", competition_id: "c-bdx",
      format: "solo", division: "women", age_group: "30-34", is_official: true, status: "finished",
      total_s: 4651, run_1_s: 268, row_s: 270, wall_balls_s: 355, roxzone_total_s: 216, penalties_s: 0,
      rank_overall: 412, rank_age_group: 61, source: "import",
    });
  });

  it("alerte quand la somme des temps ne colle pas au chrono officiel", async () => {
    renderView();
    await pasteAndRead(page("01:15:00"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/ne colle pas au chrono officiel/);
    expect(alert.textContent).toMatch(/2 min 38 s de trop/);
  });

  it("ne crée pas de doublon : propose de mettre à jour la course existante", async () => {
    races = [{ id: "r-bdx", date: "2026-03-14", event_name: "HYROX Bordeaux", total_s: 4651, division: "women", competition_id: null } as Partial<HyroxResult>];
    renderView();
    await pasteAndRead(page("01:17:31"));
    expect(await screen.findByText(/Cette course est déjà dans Agon/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mettre à jour cette course" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mettre à jour" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0]).toMatchObject({ id: "r-bdx", rank_overall: 412, source: "import" });
    expect(create).not.toHaveBeenCalled();
  });

  it("signale ce qui manque quand le texte est partiel", async () => {
    races = [];
    renderView();
    await pasteAndRead(SEGS.slice(0, 4).map(([l, t]) => `${l}\t${t}`).join("\n"));
    expect((await screen.findByText(/À compléter/)).textContent).toMatch(/Date, Événement, Division, Temps total, 13 temps de segment/);
  });

  it("explique quand rien n'est reconnu", async () => {
    renderView();
    await pasteAndRead("Bravo pour ta course !");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Aucun temps reconnu/);
  });
});
