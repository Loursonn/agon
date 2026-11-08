import { describe, it, expect, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  dayThemeKeys, deleteDayTheme, getDayTheme, invalidateDayThemes, listDayThemes, listRecentDayThemes, upsertDayTheme,
} from "@/api/dayThemes";

afterEach(() => setDbForTests(null));

const theme = (date: string, o: Record<string, unknown> = {}) => ({
  id: `t-${date}`, athlete_id: "a", coach_id: "c", date, label: "Seuil", intensity: null, dominante: null,
  color: "#3b82f6", note: "", kind: "libre", created_at: "", updated_at: `${date}T10:00:00Z`, ...o,
});

describe("lectures", () => {
  it("plage de dates, jour précis (null si rien), récents du coach", async () => {
    const { db } = fakeDb({
      day_themes: [theme("2026-11-03"), theme("2026-11-10"), theme("2026-11-20"), theme("2026-11-04", { athlete_id: "b", coach_id: "autre" })],
    });
    setDbForTests(db);
    expect((await listDayThemes("a", "2026-11-01", "2026-11-15")).map((t) => t.date)).toEqual(["2026-11-03", "2026-11-10"]);
    expect((await getDayTheme("a", "2026-11-10"))?.id).toBe("t-2026-11-10");
    expect(await getDayTheme("a", "2026-11-11")).toBeNull();
    expect((await listRecentDayThemes("c", 2)).map((t) => t.date)).toEqual(["2026-11-20", "2026-11-10"]);
  });

  it("lève si la lecture échoue", async () => {
    setDbForTests(fakeDb({}, { table: "day_themes", op: "select" }).db);
    await expect(listDayThemes("a", "2026-11-01", "2026-11-15")).rejects.toThrow(/thèmes/);
  });
});

describe("écritures", () => {
  it("upsert normalisé : intensité inconnue → null, note coupée, un seul thème par jour", async () => {
    const { db, tables } = fakeDb({ day_themes: [theme("2026-11-10")] });
    setDbForTests(db);
    const saved = await upsertDayTheme({
      athleteId: "a", coachId: "c", date: "2026-11-10", label: "  Vitesse  ",
      intensity: "pas-un-code", note: `  ${"x".repeat(600)}  `,
    });
    expect(tables.day_themes).toHaveLength(1);
    expect(saved.intensity).toBeNull();
    expect(saved.note).toHaveLength(500);
    expect(saved.date).toBe("2026-11-10");
  });

  it("suppression du jour", async () => {
    const { db, tables } = fakeDb({ day_themes: [theme("2026-11-10"), theme("2026-11-11")] });
    setDbForTests(db);
    await deleteDayTheme("a", "2026-11-10");
    expect(tables.day_themes.map((t) => t.date)).toEqual(["2026-11-11"]);
  });
});

describe("invalidateDayThemes", () => {
  it("tous les thèmes de l'athlète + raccourcis récents, pas les autres athlètes", async () => {
    const qc = new QueryClient();
    const mine = [dayThemeKeys.range("a", "x", "y"), dayThemeKeys.day("a", "2026-11-10"), dayThemeKeys.recent("c")];
    const other = dayThemeKeys.day("b", "2026-11-10");
    for (const k of [...mine, other]) qc.setQueryData(k, 1);
    await invalidateDayThemes(qc, "a");
    for (const k of mine) expect(qc.getQueryState(k)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(other)?.isInvalidated).toBe(false);
  });
});
