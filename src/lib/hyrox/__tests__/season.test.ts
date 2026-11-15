import { describe, expect, it } from "vitest";
import { groupBySeason, seasonFromKey, seasonOf } from "../season";

describe("saisons HYROX (bascule au 15 août)", () => {
  it("14 août : saison précédente ; 15 août : nouvelle saison", () => {
    expect(seasonOf("2026-08-14")?.label).toBe("Saison 25/26");
    expect(seasonOf("2026-08-15")).toEqual({ key: "2026-27", label: "Saison 26/27", start: "2026-08-15", end: "2027-08-14" });
    expect(seasonOf("2027-07-31")?.key).toBe("2026-27");
    expect(seasonOf("2027-08-14")?.key).toBe("2026-27");
  });
  it("ancien format YYYYMMDD et 29 février", () => {
    expect(seasonOf("20260904")?.key).toBe("2026-27");
    expect(seasonOf("2028-02-29")?.key).toBe("2027-28");
  });
  it("date illisible : null", () => {
    expect(seasonOf("")).toBeNull();
    expect(seasonOf("2026-13-01")).toBeNull();
  });
  it("clé", () => {
    expect(seasonFromKey("2026-27")?.label).toBe("Saison 26/27");
    expect(seasonFromKey("2026-28")).toBeNull();
    expect(seasonFromKey("1999-00")?.label).toBe("Saison 99/00");
  });
  it("regroupe et trie, la plus récente d'abord", () => {
    const g = groupBySeason([{ date: "2026-06-01" }, { date: "2026-09-04" }, { date: "2026-11-01" }, { date: "2025-10-10" }]);
    expect(g.map((x) => x.season.key)).toEqual(["2026-27", "2025-26"]);
    expect(g[0].items.map((x) => x.date)).toEqual(["2026-11-01", "2026-09-04"]);
    expect(g[1].items).toHaveLength(2);
  });
});
