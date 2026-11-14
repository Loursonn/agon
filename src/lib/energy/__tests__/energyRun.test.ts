import { describe, it, expect } from "vitest";
import type { EnergyGroup, EnergyInterval, EnergyStep, EnergyTarget } from "@/types/energy";
import {
  aimedSeconds, doneLabel, endsByButton, flattenRun, fmtChrono, fmtDist, fmtDur, fmtPace, mainTarget,
  profileBars, readBlocks, repLabel, roundRemaining, runNext, runPause, runResume, runStart, runTick, sessionElapsed,
  sessionLine, sessionRemaining, stepPhrase, stepRemaining, stepTint,
} from "../energyRun";

const iv = (
  id: string, role: EnergyInterval["role"], duration: EnergyInterval["duration"],
  target: EnergyTarget = { kind: "none" }, notes?: string,
): EnergyInterval => ({ type: "interval", id, role, duration, target, ...(notes ? { notes } : {}) });

const group = (id: string, repeat: number, children: EnergyStep[], rest?: EnergyInterval, extra: Partial<EnergyGroup> = {}): EnergyGroup => ({
  type: "group", id, role: "work", repeat, children, ...(rest ? { rest_between: rest } : {}), ...extra,
});

// Léa Démo, « Fractionné VMA » (planche EnergieTel).
const VMA = { VMA: 17.06 };
const fractionne: EnergyStep[] = [
  iv("wu", "warmup", { kind: "time", value: 900 }, { kind: "hr_zone", zone: 1 }, "footing"),
  group("series", 2, [
    group("reps", 5,
      [iv("400", "work", { kind: "distance", value: 400 }, { kind: "pace_test_pct", test_metric: "VMA", min: 95, max: 95 })],
      iv("r", "recovery", { kind: "time", value: 90 }, { kind: "none" }, "trot")),
  ], iv("rs", "recovery", { kind: "time", value: 180 }, { kind: "none" }, "de trot")),
  iv("cd", "cooldown", { kind: "time", value: 600 }, { kind: "hr_zone", zone: 1 }),
];

describe("formats", () => {
  it("durées en toutes lettres", () => {
    expect(fmtDur(696)).toBe("11 min 36 s");
    expect(fmtDur(45)).toBe("45 s");
    expect(fmtDur(900)).toBe("15 min");
    expect(fmtDur(3900)).toBe("1 h 05 min");
    expect(fmtDur(null)).toBe("—");
  });
  it("chrono, allure, distance", () => {
    expect(fmtChrono(52)).toBe("0:52");
    expect(fmtChrono(3725)).toBe("1:02:05");
    expect(fmtPace(222)).toBe("3:42");
    expect(fmtPace(0)).toBe("—");
    expect(fmtDist(400)).toBe("400 m");
    expect(fmtDist(1500)).toBe("1,5 km");
    expect(sessionLine(3120, 10100)).toBe("52 min · 10,1 km");
    expect(sessionLine(3120, null)).toBe("52 min · —");
  });
});

describe("cible principale", () => {
  const w = (target: EnergyTarget) => iv("x", "work", { kind: "time", value: 60 }, target);
  it("% VMA → allure quand la VMA est connue, sinon le pourcentage", () => {
    const t = w({ kind: "pace_test_pct", test_metric: "VMA", min: 95, max: 95 });
    expect(mainTarget(t, VMA)).toEqual({ value: "3:42", unit: "/km", secondary: "95 % VMA" });
    expect(mainTarget(t, null)).toEqual({ value: "95", unit: " % VMA", secondary: null });
  });
  it("allure en fourchette, la plus rapide d'abord", () => {
    expect(mainTarget(w({ kind: "pace", min_s_per_unit: 255, max_s_per_unit: 265, unit: "min_per_km" }))?.value).toBe("4:15–4:25");
  });
  it("vélo en watts avec le % de la puissance test en petit", () => {
    expect(mainTarget(w({ kind: "power_test_pct", test_metric: "PMA", min: 88, max: 88 }), { PMA: 261 }))
      .toEqual({ value: "230", unit: " W", secondary: "88 % PMA" });
  });
  it("rameur : temps au 500 m", () => {
    expect(mainTarget(w({ kind: "x_per_y", x_kind: "time", y_kind: "distance", x_value: 105, y_value: 500 })))
      .toEqual({ value: "1:45", unit: "/500 m", secondary: null });
  });
  it("sans cible → null", () => {
    expect(mainTarget(w({ kind: "none" }))).toBeNull();
  });
});

describe("teinte (5 zones)", () => {
  it("zone FC, % VMA, récup, sans cible", () => {
    expect(stepTint(fractionne[0] as EnergyInterval)).toEqual({ kind: "zone", zone: 1 });
    const rep = flattenRun(fractionne).find((f) => f.step.id === "400")!;
    expect(stepTint(rep.step, VMA)).toEqual({ kind: "zone", zone: 5 });
    expect(stepTint(iv("r", "recovery", { kind: "time", value: 60 }, { kind: "hr_zone", zone: 3 }))).toEqual({ kind: "recup" });
    expect(stepTint(iv("l", "work", { kind: "time", value: 60 }))).toEqual({ kind: "libre" });
  });
  it("88 % PMA → zone 3 ; 230 W avec FTP 250 → zone 4", () => {
    expect(stepTint(iv("b", "work", { kind: "time", value: 480 }, { kind: "power_test_pct", test_metric: "PMA", min: 88, max: 88 }))).toEqual({ kind: "zone", zone: 3 });
    expect(stepTint(iv("b", "work", { kind: "time", value: 480 }, { kind: "power", min: 230, max: 230 }), { FTP: 250 })).toEqual({ kind: "zone", zone: 4 });
  });
});

describe("lecture", () => {
  it("chaque bloc lu comme une phrase, une cible", () => {
    const b = readBlocks(fractionne, VMA);
    expect(b.map((x) => x.title)).toEqual(["1 · Échauffement", "2 · Effort", "3 · Retour au calme"]);
    expect(b[0].phrase).toBe("15 min footing");
    expect(b[1].phrase).toBe("2 × (5 × 400 m, récup 1 min 30 s trot), 3 min de trot entre les séries");
    expect(b[1].target).toEqual({ value: "3:42", unit: "/km", secondary: "95 % VMA" });
    expect(b[1].tints).toEqual([{ kind: "zone", zone: 5 }, { kind: "recup" }]);
  });
  it("départ fixe dans la phrase", () => {
    const b = readBlocks([group("d", 6, [iv("w", "work", { kind: "distance", value: 200 })], undefined, { departure_every_s: 180 })]);
    expect(b[0].phrase).toBe("6 × 200 m, départ toutes les 3 min");
  });
  it("profil : une barre par pas, largeurs qui somment à 1", () => {
    const bars = profileBars(fractionne, VMA);
    expect(bars).toHaveLength(1 + 2 * (5 + 4) + 1 + 1);
    expect(bars.reduce((a, x) => a + x.width, 0)).toBeCloseTo(1, 6);
    expect(Math.max(...bars.map((x) => x.height))).toBeGreaterThan(bars[0].height);
  });
});

describe("liste à plat et libellés", () => {
  const flat = flattenRun(fractionne);
  it("répétitions imbriquées, récup entre (pas après la dernière)", () => {
    expect(flat).toHaveLength(21);
    expect(repLabel(flat[1])).toBe("Série 1 · 1 / 5");
    expect(repLabel(flat[0])).toBeNull();
    expect(flat[10].step.id).toBe("rs");
  });
  it("bloc en distance : fini au bouton, temps visé", () => {
    const rep = flat[1].step;
    expect(endsByButton(rep)).toBe(true);
    expect(doneLabel(rep)).toBe("400 m fait");
    expect(aimedSeconds(rep, VMA)).toBe(89);
    expect(endsByButton(flat[0].step)).toBe(false);
  });
  it("phrases courtes pour « Ensuite »", () => {
    expect(stepPhrase(flat[2].step)).toBe("récup 1 min 30 s trot");
    expect(stepPhrase(flat[1].step, VMA)).toBe("400 m à 3:42/km");
  });
});

describe("minuteur", () => {
  const flat = flattenRun(fractionne);
  const T0 = 1_000_000;

  it("un pas chronométré s'enchaîne tout seul, le 400 m attend le bouton", () => {
    let s = runStart(flat, T0);
    expect(stepRemaining(flat, s, T0 + 60_000)).toBe(840);
    s = runTick(flat, s, T0 + 900_000 + 30_000);
    expect(s.index).toBe(1);
    expect(s.stepStartMs).toBe(T0 + 900_000);
    s = runTick(flat, s, T0 + 2_000_000);
    expect(s.index).toBe(1);
    expect(stepRemaining(flat, s, T0 + 2_000_000)).toBeNull();
    s = runNext(flat, s, T0 + 990_000);
    expect(s.index).toBe(2);
  });

  it("la pause gèle le chrono et la reprise décale les repères", () => {
    let s = runStart(flat, T0);
    s = runPause(s, T0 + 10_000);
    expect(runTick(flat, s, T0 + 5_000_000)).toBe(s);
    expect(stepRemaining(flat, s, T0 + 5_000_000)).toBe(890);
    s = runResume(s, T0 + 70_000);
    expect(stepRemaining(flat, s, T0 + 70_000)).toBe(890);
    expect(sessionElapsed(s, T0 + 70_000)).toBe(10);
  });

  it("fin de séance après le dernier pas", () => {
    let s = runStart(flat, T0);
    for (let i = 0; i < flat.length; i++) s = runNext(flat, s, T0 + i * 1000);
    expect(s.finished).toBe(true);
    expect(sessionRemaining(flat, s, T0)).toBe(0);
  });

  it("départ fixe : la répétition suivante part à l'heure", () => {
    const f = flattenRun([group("d", 3, [iv("w", "work", { kind: "distance", value: 200 })], undefined, { departure_every_s: 180 })]);
    expect(f.map((x) => x.emom?.gap ?? false)).toEqual([false, true, false, true, false, true]);
    let s = runStart(f, T0);
    // 200 m fait en 40 s → repos jusqu'au départ suivant : 140 s.
    s = runNext(f, s, T0 + 40_000);
    expect(stepRemaining(f, s, T0 + 40_000)).toBe(140);
    s = runTick(f, s, T0 + 181_000);
    expect(s.index).toBe(2);
    expect(s.roundStartMs).toBe(T0 + 180_000);
    // Pas fini à temps : le départ suivant part quand même.
    s = runTick(f, s, T0 + 361_000);
    expect(s.index).toBe(4);
  });

  it("bloc « jusqu'au bouton » : pas de décompte", () => {
    const f = flattenRun([iv("wu", "warmup", { kind: "lap_button" }, { kind: "hr_zone", zone: 1 })]);
    const s = runStart(f, T0);
    expect(stepRemaining(f, s, T0 + 999_000)).toBeNull();
    expect(doneLabel(f[0].step)).toBe("Tour fait");
    expect(runTick(f, s, T0 + 999_000).index).toBe(0);
  });
});

describe("départ fixe : temps avant le départ suivant", () => {
  it("décompte de la répétition en cours", () => {
    const f = flattenRun([group("d", 2, [iv("w", "work", { kind: "distance", value: 200 })], undefined, { departure_every_s: 180 })]);
    const s = runStart(f, 0);
    expect(roundRemaining(f, s, 40_000)).toBe(140);
    expect(roundRemaining(flattenRun(fractionne), runStart(flattenRun(fractionne), 0), 1000)).toBeNull();
  });
});
