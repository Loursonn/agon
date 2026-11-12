import { describe, expect, it } from "vitest";
import { competitionAfter, eventTag, upcomingEvents } from "../athleteEvents";
import type { Competition, LifeEvent } from "@/types/planning";

const comp = (o: Partial<Competition>): Competition => ({
  id: "c", coach_id: "k", athlete_id: "a", name: "10 km", type: "competition", date: "2026-11-22",
  location: null, notes: null, priority: "B", created_at: "2026-01-01T00:00:00Z", ...o,
});
const life = (o: Partial<LifeEvent>): LifeEvent => ({
  id: "l", athlete_id: "a", date_start: "2026-11-18", date_end: "2026-11-20", title: "Déplacement",
  created_at: "2026-01-01T00:00:00Z", ...o,
});
const NOW = Date.parse("2026-11-08T12:00:00Z");

describe("upcomingEvents", () => {
  it("mêle compétitions et événements, par date, sans le passé", () => {
    const items = upcomingEvents(
      [comp({ id: "c1" }), comp({ id: "old", date: "2026-10-01" })],
      [life({ id: "l1" }), life({ id: "past", date_start: "2026-11-01", date_end: "2026-11-07" })],
      "2026-11-08", NOW,
    );
    expect(items.map((i) => i.id)).toEqual(["l1", "c1"]);
  });
  it("garde un événement en cours et une compétition sur plusieurs jours", () => {
    const items = upcomingEvents(
      [comp({ id: "c", date: "2026-11-07", date_end: "2026-11-08" })],
      [life({ id: "l", date_start: "2026-11-06", date_end: "2026-11-08" })],
      "2026-11-08", NOW,
    );
    expect(items.map((i) => i.id)).toEqual(["l", "c"]);
    expect(items[1].end).toBe("2026-11-08");
  });
  it("« Nouveau » pendant 24 h", () => {
    const [a, b] = upcomingEvents([comp({ id: "n", created_at: "2026-11-08T02:00:00Z" })], [life({ created_at: "2026-11-07T11:00:00Z" })], "2026-11-08", NOW);
    expect(a.isNew).toBe(false);
    expect(b.isNew).toBe(true);
  });
  it("ancienne ligne sans type : autre, indisponible", () => {
    const [i] = upcomingEvents([], [life({})], "2026-11-08", NOW);
    expect(i).toMatchObject({ source: "life", kind: "autre", unavailable: true });
  });
});

describe("eventTag", () => {
  it("compétition, indisponible, type", () => {
    const [c] = upcomingEvents([comp({})], [], "2026-11-08", NOW);
    expect(eventTag(c)).toBe("Compétition B");
    const [u] = upcomingEvents([], [life({ kind: "voyage", unavailable: true })], "2026-11-08", NOW);
    expect(eventTag(u)).toBe("Indisponible");
    const [v] = upcomingEvents([], [life({ kind: "examen", unavailable: false })], "2026-11-08", NOW);
    expect(eventTag(v)).toBe("Examen");
  });
});

describe("competitionAfter", () => {
  it("compétition suivante, ou rien", () => {
    const list = [comp({ id: "b", date: "2026-12-05" }), comp({ id: "a", date: "2026-11-22" }), comp({ id: "z", date: "2026-10-01" })];
    expect(competitionAfter(list, "a", "2026-11-08")?.id).toBe("b");
    expect(competitionAfter(list, "b", "2026-11-08")).toBeNull();
    expect(competitionAfter(list, null, "2026-11-08")).toBeNull();
  });
});
