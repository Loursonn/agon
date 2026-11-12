import { describe, expect, it } from "vitest";
import { buildPlannedVsDone, daysBetween } from "@/lib/plannedVsDone";

const act = (id: string, date: string, startedAt: string) => ({
  id, date, startedAt, source: "garmin", sport: "running", distanceM: 10000, durationS: 3000, deviceName: null,
});

describe("buildPlannedVsDone", () => {
  const week = buildPlannedVsDone({
    from: "2026-11-09",
    to: "2026-11-11",
    planned: [
      { kind: "energy", id: "footing", date: "2026-11-09", label: "Footing", status: "planned" },
      { kind: "workout", id: "muscu", date: "2026-11-09", label: "Muscu A", status: "completed" },
      { kind: "energy", id: "vma", date: "2026-11-10", label: "VMA", status: "planned" },
      { kind: "test", id: "test", date: "2026-11-11", label: "Test", status: "planned" },
    ],
    activities: [
      act("course", "2026-11-09", "2026-11-09T07:00:00Z"),
      act("refusee", "2026-11-10", "2026-11-10T18:00:00Z"),
      act("libre", "2026-11-10", "2026-11-10T08:00:00Z"),
    ],
    links: [
      { id: "l1", activityId: "course", plannedKind: "energy", plannedId: "footing", status: "auto" },
      { id: "l2", activityId: "refusee", plannedKind: "energy", plannedId: "vma", status: "rejected" },
    ],
    zoneSummaries: [{ activityId: "course", seconds: [600, 1800, 600] }],
  });

  it("une ligne par jour, même vide", () => {
    expect(week.map((d) => d.date)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(week[2].free).toEqual([]);
  });

  it("séance prévue + son activité + zones ; lien auto = à confirmer", () => {
    const footing = week[0].planned[0];
    expect(footing.activity?.id).toBe("course");
    expect(footing.linkStatus).toBe("auto");
    expect(footing.done).toBe(true);
    expect(footing.activity?.zoneShares).toEqual([20, 60, 20]);
    expect(week[0].free).toEqual([]);
  });

  it("validée sans montre = réalisée, sans activité", () => {
    expect(week[0].planned[1]).toMatchObject({ done: true, activity: null, linkStatus: null });
  });

  it("refusée : l'activité redevient libre, la séance n'est pas réalisée", () => {
    expect(week[1].planned[0]).toMatchObject({ id: "vma", done: false, activity: null });
    expect(week[1].free.map((a) => a.id)).toEqual(["libre", "refusee"]);
  });

  it("jours hors plage ignorés", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toEqual(["2026-03-28", "2026-03-29", "2026-03-30"]);
  });
});

describe("effectiveRpe (P42)", () => {
  it("l'RPE d'Agon l'emporte, sinon celui de Strava, sinon rien", async () => {
    const { effectiveRpe } = await import("@/lib/plannedVsDone");
    expect(effectiveRpe(7, 4)).toEqual({ value: 7, source: "agon" });
    expect(effectiveRpe(null, 4)).toEqual({ value: 4, source: "strava" });
    expect(effectiveRpe(undefined, null)).toBeNull();
    expect(effectiveRpe(0, 11)).toBeNull();
  });

  it("buildPlannedVsDone : RPE Strava de la sortie rattachée si la séance n'en a pas", async () => {
    const { buildPlannedVsDone } = await import("@/lib/plannedVsDone");
    const days = buildPlannedVsDone({
      from: "2026-10-03", to: "2026-10-03",
      planned: [
        { kind: "energy", id: "p1", date: "2026-10-03", label: "Footing", status: "planned", agonRpe: null },
        { kind: "workout", id: "p2", date: "2026-10-03", label: "Muscu", status: "completed", agonRpe: 8 },
      ],
      activities: [
        { id: "a1", date: "2026-10-03", startedAt: "2026-10-03T07:00:00Z", source: "garmin", sport: "running",
          distanceM: 8000, durationS: 2800, deviceName: null, rpe: 5 },
        { id: "a2", date: "2026-10-03", startedAt: "2026-10-03T18:00:00Z", source: "file_import", sport: "training",
          distanceM: null, durationS: 3600, deviceName: null, rpe: 3 },
      ],
      links: [
        { id: "l1", activityId: "a1", plannedKind: "energy", plannedId: "p1", status: "auto" },
        { id: "l2", activityId: "a2", plannedKind: "workout", plannedId: "p2", status: "confirmed" },
      ],
      zoneSummaries: [],
    });
    expect(days[0].planned.map((p) => p.rpe)).toEqual([
      { value: 5, source: "strava" },
      { value: 8, source: "agon" },
    ]);
  });
});
