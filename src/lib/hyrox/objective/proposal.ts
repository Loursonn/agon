/**
 * Run moyen proposé pour construire un objectif (docs/HYROX_OBJECTIF_CONCEPTION.md
 * §2.5), dans cet ordre : le plan de la course, l'objectif de saison de la
 * division, sinon le plus récent entre la dernière course de la même catégorie
 * (run moyen réalisé) et le dernier bilan de tests validé (allure HYROX tirée
 * de la vitesse critique). Pur et testé.
 */
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { raceCategory } from "../categories";
import { runFromCS } from "../tests/chrono";
import { raceRunAvg } from "./model";

export type RunSource = "plan" | "saison" | "derniere_course" | "tests";

export interface RunProposal {
  runAvgS: number;
  source: RunSource;
  /** « Dernière course : HYROX Paris (16/09) ». */
  label: string;
}

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/** Sexe et niveau du moteur de tests pour une catégorie de course (duo mixte : allure de la femme). */
function testDivision(category: string): { sex: "H" | "F"; category: "Open" | "Pro" } {
  return { sex: /^(doubles_)?men/.test(category) ? "H" : "F", category: /_pro$/.test(category) ? "Pro" : "Open" };
}

/** Allure HYROX (s/km) d'une analyse de tests stockée, `null` sans vitesse critique. */
export function runFromAnalysis(outputs: unknown, category: string): number | null {
  const running = (outputs as { scores?: { running?: { cs_kmh?: unknown; dprime_m?: unknown } } } | null)?.scores?.running;
  const cs = num(running?.cs_kmh);
  if (!cs) return null;
  return runFromCS(cs, num(running?.dprime_m), testDivision(category)).pace_s_per_km;
}

export function proposeRun(input: {
  category: string;
  plan?: { run_avg_s?: number | null } | null;
  seasonGoal?: { run_avg_s: number; season: string } | null;
  races: readonly HyroxResult[];
  analyses: ReadonlyArray<{ date: string; validated_at: string | null; outputs: unknown }>;
  /** Jour de la course visée : on ne propose rien de postérieur. */
  day: string;
}): RunProposal | null {
  const { category, day } = input;
  const planRun = num(input.plan?.run_avg_s);
  if (planRun) return { runAvgS: planRun, source: "plan", label: "Plan de la course" };
  if (input.seasonGoal) {
    const s = input.seasonGoal.season;
    return { runAvgS: input.seasonGoal.run_avg_s, source: "saison", label: `Objectif de saison ${s.slice(2, 4)}/${s.slice(5, 7)}` };
  }
  const race = [...input.races]
    .filter((r) => r.status === "finished" && r.date <= day && raceCategory(r) === category && raceRunAvg(r) != null)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const test = [...input.analyses]
    .filter((a) => a.validated_at && a.date <= day && runFromAnalysis(a.outputs, category) != null)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const fromRace: RunProposal | null = race
    ? { runAvgS: raceRunAvg(race) as number, source: "derniere_course", label: `Dernière course : ${race.event_name} (${ddmm(race.date)})` }
    : null;
  const fromTest: RunProposal | null = test
    ? { runAvgS: runFromAnalysis(test.outputs, category) as number, source: "tests", label: `Bilan de tests du ${ddmm(test.date)}` }
    : null;
  if (fromRace && fromTest) return test.date > race.date ? fromTest : fromRace;
  return fromRace ?? fromTest;
}
