/**
 * Propositions de travail des « Leviers » de l'analyse de course (coach).
 * Textes fixes, sans IA : une proposition par station, la Roxzone, et la
 * course juste après une station (« compromised running »).
 * Les 4 premiers viennent de la planche validée le 13/11 ; les autres sont
 * écrits dans le même style (à relire par Hugo).
 */
import type { StationKey } from "@/features/shared/types/hyrox";

export const HYROX_WORK_PROPOSALS: Record<StationKey | "roxzone", string> = {
  wall_balls: "2 séances / semaine : 3 × 30 wall balls juste après 1 km au seuil",
  roxzone: "Répéter les transitions : 6 × (entrée de station + sortie en courant) en fin de séance",
  sled_push: "1 séance / semaine : sled lourd 4 × 25 m + force jambes (squat, fentes)",
  sled_pull: "1 séance / semaine : sled pull lourd 4 × 25 m + tirages (rowing barre, tractions)",
  ski: "2 × / semaine : 4 × 250 m de SkiErg à allure course, 1 min de récupération",
  row: "2 × / semaine : 4 × 250 m de rameur à allure course, 1 min de récupération",
  bbj: "1 séance / semaine : 4 × 20 burpees broad jumps à rythme régulier, 1 min de récupération",
  farmers: "1 séance / semaine : 4 × 50 m de farmers carry lourd + gainage (planche, suitcase carry)",
  lunges: "1 séance / semaine : 4 × 25 m de fentes avec sac + 400 m de course juste après",
};

/** Bloc de station enchaîné avant le km de course, pour le levier « Course après {station} ». */
const STATION_BLOCK: Record<StationKey, string> = {
  ski: "250 m de SkiErg",
  sled_push: "25 m de sled push",
  sled_pull: "25 m de sled pull",
  bbj: "20 burpees broad jumps",
  row: "250 m de rameur",
  farmers: "100 m de farmers carry",
  lunges: "50 m de fentes",
  wall_balls: "30 wall balls",
};

/** « Compromised running 2 × / semaine : 50 m de fentes + 1 km à allure course » */
export const runAfterProposal = (station: StationKey): string =>
  `Compromised running 2 × / semaine : ${STATION_BLOCK[station]} + 1 km à allure course`;
