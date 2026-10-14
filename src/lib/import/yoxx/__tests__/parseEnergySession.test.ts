import { describe, it, expect } from "vitest";
import { parseEnergySession, parseDuration, parseTarget } from "../parseEnergySession";
import { parseTime } from "../common";
import type { EnergyGroup, EnergyInterval } from "@/types/energy";

function ids() {
  let i = 0;
  return () => `id${++i}`;
}
const parse = (t: string) => parseEnergySession(t, { genId: ids() });

describe("parseTime", () => {
  it.each([
    ["10'", 600], ["1'30", 90], ["1'30\"", 90], ["30\"", 30], ["30s", 30], ["10min", 600],
    ["1h", 3600], ["1h20", 4800], ["10:00", 600], ["1:30:00", 5400], ["30’’", 30], ["4’40", 280],
  ])("%s → %d s", (raw, s) => expect(parseTime(raw)).toBe(s));

  it.each(["", "abc", "1'75", "10:75"])("%s → null", (raw) => expect(parseTime(raw)).toBeNull());
});

describe("parseDuration", () => {
  it("distance / calories / temps / lap", () => {
    expect(parseDuration("400m")).toEqual({ kind: "distance", value: 400 });
    expect(parseDuration("1,5km")).toEqual({ kind: "distance", value: 1500 });
    expect(parseDuration("1.5 km")).toEqual({ kind: "distance", value: 1500 });
    expect(parseDuration("15cal")).toEqual({ kind: "calories", value: 15 });
    expect(parseDuration("15 kcal")).toEqual({ kind: "calories", value: 15 });
    expect(parseDuration("10 min")).toEqual({ kind: "time", value: 600 });
    expect(parseDuration("LAP")).toEqual({ kind: "lap_button" });
    expect(parseDuration("vite")).toBeNull();
  });
});

describe("parseTarget", () => {
  const ok = (raw: string) => {
    const r = parseTarget(raw);
    if (r.kind !== "ok") throw new Error(`${raw} → ${r.kind}`);
    return r.target;
  };
  it("toutes les cibles de l'app", () => {
    expect(ok("Z2")).toEqual({ kind: "hr_zone", zone: 2 });
    expect(ok("zone 4")).toEqual({ kind: "hr_zone", zone: 4 });
    expect(ok("80-85% FCmax")).toEqual({ kind: "hr_pct", min: 80, max: 85 });
    expect(ok("150-160bpm")).toEqual({ kind: "hr_bpm", min: 150, max: 160 });
    expect(ok("4'40-4'50/km")).toEqual({ kind: "pace", unit: "min_per_km", min_s_per_unit: 280, max_s_per_unit: 290 });
    expect(ok("6'00 - 7'00 /km")).toEqual({ kind: "pace", unit: "min_per_km", min_s_per_unit: 360, max_s_per_unit: 420 });
    expect(ok("12 km/h")).toEqual({ kind: "pace", unit: "kmh", min_s_per_unit: 300, max_s_per_unit: 300 });
    expect(ok("95-100% VMA")).toEqual({ kind: "pace_test_pct", test_metric: "VMA", min: 95, max: 100 });
    expect(ok("98%VC")).toEqual({ kind: "pace_test_pct", test_metric: "VC", min: 98, max: 98 });
    expect(ok("90% Allure 10K")).toEqual({ kind: "pace_test_pct", test_metric: "Allure 10K", min: 90, max: 90 });
    expect(ok("250-280W")).toEqual({ kind: "power", min: 250, max: 280 });
    expect(ok("90% FTP")).toEqual({ kind: "power_test_pct", test_metric: "FTP", min: 90, max: 90 });
    expect(ok("110% PMA")).toEqual({ kind: "power_test_pct", test_metric: "PMA", min: 110, max: 110 });
    expect(ok("170-180spm")).toEqual({ kind: "cadence", min: 170, max: 180, unit: "spm" });
    expect(ok("85-90 rpm")).toEqual({ kind: "cadence", min: 85, max: 90, unit: "rpm" });
    expect(ok("chrono 1:37-1:40")).toEqual({ kind: "text", value: "1:37-1:40" });
    expect(ok('"footing très lent"')).toEqual({ kind: "text", value: "footing très lent" });
    expect(ok("« footing »")).toEqual({ kind: "text", value: "footing" });
  });
  it("RPE → consigne, inconnu → texte libre, erreurs explicites", () => {
    expect(parseTarget("RPE 8")).toEqual({ kind: "rpe", label: "RPE 8" });
    expect(parseTarget("footing très lent").kind).toBe("loose");
    expect(parseTarget("Z7").kind).toBe("error");
    expect(parseTarget("90%").kind).toBe("error");
    expect(parseTarget("90% XYZ").kind).toBe("error");
    expect(parseTarget("chrono vite").kind).toBe("error");
  });
});

const CAPTURE = `
SÉANCE ÉNERGÉTIQUE : 6 x 400 + 4 x 200
TYPE : VO2

ÉCHAUFFEMENT 10' @ Z2 | + qlq accel
ÉCHAUFFEMENT 5' [Autre] | Pogo jump bilatéraux (3x15 intention de raideur total)
GROUPE x6
  EFFORT 400m [Course] @ chrono 1:37-1:40
  RÉCUP 1' [Course] @ 6'00-7'00/km
FIN
EFFORT 1'
GROUPE x2
  EFFORT 200m @ chrono 0:46-0:48
  RÉCUP 30" @ 6'00-7'00/km
FIN
`;

describe("parseEnergySession — séance de la capture", () => {
  const { session, issues } = parse(CAPTURE);

  it("sans aucune erreur", () => expect(issues).toEqual([]));

  it("en-têtes", () => {
    expect(session.name).toBe("6 x 400 + 4 x 200");
    expect(session.session_kind).toBe("vo2");
    expect(session.custom_kind).toBeNull();
    expect(session.structure_type).toBe("fractionne");
  });

  it("structure", () => {
    expect(session.intervals.map((s) => s.type)).toEqual(["interval", "interval", "group", "interval", "group"]);
    const warm = session.intervals[0] as EnergyInterval;
    expect(warm).toMatchObject({ role: "warmup", duration: { kind: "time", value: 600 }, target: { kind: "hr_zone", zone: 2 }, notes: "+ qlq accel" });
    expect(warm.equipment).toBeUndefined();
    expect((session.intervals[1] as EnergyInterval).equipment).toBe("autre");

    const g = session.intervals[2] as EnergyGroup;
    expect(g.repeat).toBe(6);
    expect(g.children).toHaveLength(2);
    expect(g.children[0]).toMatchObject({
      role: "work", equipment: "course", duration: { kind: "distance", value: 400 }, target: { kind: "text", value: "1:37-1:40" },
    });
    expect(g.children[1]).toMatchObject({
      role: "recovery", duration: { kind: "time", value: 60 }, target: { kind: "pace", min_s_per_unit: 360, max_s_per_unit: 420 },
    });
    expect((session.intervals[4] as EnergyGroup).repeat).toBe(2);
  });
});

describe("parseEnergySession — groupes imbriqués, départ fixe, consignes, matériel par défaut", () => {
  const { session, issues } = parse(`
\`\`\`
SÉANCE ÉNERGÉTIQUE : 2 × (10 × 30/30)
TYPE : VO2
MATÉRIEL : Course
CONSIGNE : Terrain plat, pas de descente.

ÉCHAUFFEMENT 15' @ Z1 | Footing facile
GROUPE x2 | Allure IDENTIQUE sur les 20 reps
  GROUPE ×10
    EFFORT 30" @ RPE 8
    RÉCUP 30" @ "footing très lent"
  FIN
  REPOS 3'
FIN
GROUPE x5 départ 4'30
  EFFORT 1000m @ 95-98% VC
FIN
RETOUR AU CALME 10' @ Z1
\`\`\`
`);

  it("pas d'erreur, juste l'info RPE", () => {
    expect(issues.map((i) => i.level)).toEqual(["info"]);
    expect(issues[0].line).toBe(11);
  });

  it("consigne de séance", () => expect(session.notes).toBe("Terrain plat, pas de descente."));

  it("imbrication + consigne de groupe + RPE en consigne", () => {
    const outer = session.intervals[1] as EnergyGroup;
    expect(outer.instructions).toBe("Allure IDENTIQUE sur les 20 reps");
    const inner = outer.children[0] as EnergyGroup;
    expect(inner.repeat).toBe(10);
    expect(inner.children[0]).toMatchObject({ role: "work", notes: "RPE 8", target: { kind: "none" } });
    expect(outer.children[1]).toMatchObject({ role: "rest", duration: { kind: "time", value: 180 } });
  });

  it("matériel par défaut sauf repos passif", () => {
    expect((session.intervals[0] as EnergyInterval).equipment).toBe("course");
    const outer = session.intervals[1] as EnergyGroup;
    expect((outer.children[1] as EnergyInterval).equipment).toBeUndefined();
  });

  it("départ fixe + retour au calme", () => {
    const g = session.intervals[2] as EnergyGroup;
    expect(g.departure_every_s).toBe(270);
    expect(session.intervals[3]).toMatchObject({ role: "cooldown", duration: { kind: "time", value: 600 } });
  });
});

describe("parseEnergySession — erreurs : on importe tout ce qui est possible", () => {
  const { session, issues } = parse(`SÉANCE ÉNERGÉTIQUE : Test erreurs
TYPE : Côtes
STRUCTURE : continu
SPRINT 10x100m
EFFORT vite @ Z2
EFFORT 400m @ 4.40
EFFORT 400m @ Z9 | garder la forme
EFFORT 3' [Trottinette]
GROUPE
  EFFORT 1'
FIN
FIN
GROUPE x3
  EFFORT 1'`);

  const byLine = (l: number) => issues.filter((i) => i.line === l);

  it("type perso", () => {
    expect(session.session_kind).toBe("custom");
    expect(session.custom_kind).toBe("Côtes");
    expect(byLine(2)[0].level).toBe("info");
    expect(session.structure_type).toBe("continu");
  });

  it("ligne inconnue → zone À SAISIR à sa place", () => {
    expect(byLine(4)[0].level).toBe("error");
    expect(session.intervals[0]).toMatchObject({ role: "open", target: { kind: "text", value: "⚠ À SAISIR" }, notes: "SPRINT 10x100m" });
    expect(byLine(4)[0].stepId).toBe(session.intervals[0].id);
  });

  it("durée illisible → étape gardée, durée à saisir", () => {
    expect(byLine(5)[0].level).toBe("error");
    expect(session.intervals[1]).toMatchObject({ role: "work", duration: { kind: "lap_button" }, target: { kind: "hr_zone", zone: 2 } });
    expect((session.intervals[1] as EnergyInterval).notes).toContain("À SAISIR durée : vite");
  });

  it("cible sans unité → texte libre + avertissement", () => {
    expect(byLine(6)[0].level).toBe("warning");
    expect(session.intervals[2]).toMatchObject({ target: { kind: "text", value: "4.40" } });
  });

  it("cible invalide → à saisir, consigne conservée", () => {
    expect(byLine(7)[0].level).toBe("error");
    expect(session.intervals[3]).toMatchObject({ target: { kind: "text", value: "⚠ À SAISIR : Z9" }, notes: "garder la forme" });
  });

  it("matériel inconnu → Autre", () => {
    expect(byLine(8)[0].level).toBe("warning");
    expect((session.intervals[4] as EnergyInterval).equipment).toBe("autre");
  });

  it("groupe sans répétitions, FIN en trop, groupe non fermé", () => {
    expect(byLine(9)[0].level).toBe("error");
    expect((session.intervals[5] as EnergyGroup).repeat).toBe(1);
    expect(byLine(12)[0].level).toBe("warning");
    expect(byLine(13)[0].message).toContain("jamais fermé");
    expect((session.intervals[6] as EnergyGroup).children).toHaveLength(1);
  });
});

describe("parseEnergySession — cas limites", () => {
  it("titre/type absents → valeurs par défaut + avertissements", () => {
    const { session, issues } = parse("EFFORT 45' [Course] @ Z2");
    expect(session.name).toBe("Séance importée");
    expect(session.session_kind).toBe("autre");
    expect(session.structure_type).toBe("continu");
    expect(issues.filter((i) => i.level === "warning")).toHaveLength(2);
  });

  it("refuse une séance muscu avec un message clair", () => {
    const { session, issues } = parse("SÉANCE MUSCU : FullBody 1\nA1 Squat : 3x5");
    expect(session.intervals).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("MUSCU");
  });

  it("texte vide → erreur « aucune étape »", () => {
    const { issues } = parse("");
    expect(issues.some((i) => i.message.includes("Aucune étape"))).toBe(true);
  });
});
