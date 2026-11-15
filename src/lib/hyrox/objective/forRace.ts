/**
 * Objectif d'une course et écart à cet objectif, en un appel, pour les écrans
 * (analyse de course, Ma saison) : le plan de la course s'il existe, sinon
 * l'objectif construit sur le run moyen du jour. Pur et testé.
 */
import type { HyroxRacePlan, HyroxResult } from "@/features/shared/types/hyrox";
import { planForRace } from "../racePlan";
import { raceObjective, type RaceObjective } from "./model";
import { raceVsObjective, type RaceVsObjective } from "./vsObjective";

export interface RaceObjectiveView {
  objective: RaceObjective;
  vs: RaceVsObjective;
}

export function objectiveForRace(race: HyroxResult, plans: readonly HyroxRacePlan[]): RaceObjectiveView | null {
  const plan = planForRace(race, plans);
  const objective = raceObjective(race, plan);
  return objective ? { objective, vs: raceVsObjective(race, objective.segments) } : null;
}
