/**
 * « 03 — Leviers · quoi travailler » (planche HyroxAnaCoachOrdi) : priorités
 * de `stationPriorities` (formule inchangée), plus un levier tiré de la
 * montre — la course juste après une station qui coûte cher. Chaque levier
 * porte une raison calculée et une proposition de travail. Règles fixes, sans
 * IA. Pur et testé.
 */
import { STATION_META, type HyroxResult, type StationKey } from "@/features/shared/types/hyrox";
import { shares, stationPriorities, type RefLookup } from "./calc";
import { GAIN_THRESHOLD_S, runCostAfter, type RaceWatchAnalysis } from "./raceWatch";
import { HYROX_WORK_PROPOSALS, runAfterProposal } from "./workProposals";
import { EXCESS_WARN_S, STATION_BEFORE } from "./runPacing";

/** Poids du levier « Course après {station} » (validé par défaut, prompt §9 Q4). */
export const RUN_AFTER_STATION_WEIGHT = 0.6;
/** Surcoût minimal (s/km au-delà de l'habituel du niveau) pour proposer « Course après {station} ». */
export const RUN_AFTER_MIN_EXCESS = EXCESS_WARN_S;

export interface RaceLever {
  /** Clé de station, `roxzone`, ou `run_after_<station>`. */
  key: string;
  /** Station concernée (picto), `null` pour la Roxzone. */
  station: StationKey | null;
  label: string;
  reason: string;
  /** Secondes perdues vs la médiane (ou, pour la course, surcoût vs l'habituel du niveau). */
  gainS: number;
  weight: number;
  /** Score de priorité (`stationPriorities`) ; sert à trier et à dessiner la barre. */
  score: number;
  proposal: string;
  /** Levier tiré de la montre (pastille « INDICE MONTRE »). */
  watch: boolean;
}

const clock = (s: number) => {
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
};
const comma = (x: number) => String(x).replace(".", ",");

/** Article + nom de station pour les phrases (« les fentes »). */
export const STATION_NAME: Record<StationKey, string> = {
  ski: "SkiErg", sled_push: "Sled push", sled_pull: "Sled pull", bbj: "Burpees",
  row: "Rameur", farmers: "Farmers", lunges: "Fentes", wall_balls: "Wall balls",
};

export function raceLevers(input: {
  race: HyroxResult;
  refs: RefLookup;
  /** Croisement avec la montre (FC, cadence) ; `null` sans montre. */
  analysis: RaceWatchAnalysis | null;
  /** Récupération moyenne en Roxzone (bpm en 60 s), si mesurée. */
  roxzoneRecoveryBpm?: number | null;
  /** Médianes des runs au niveau de l'athlète (« habituel » du coût de chaque station). */
  levelP50?: ((seg: string) => number | null) | null;
}): RaceLever[] {
  const { race, refs, analysis } = input;
  const rows = stationPriorities(race, refs).filter((p) => p.gain_s >= GAIN_THRESHOLD_S);
  const segs = analysis?.segments ?? [];
  const stationHr = segs.filter((s) => s.kind === "station" && s.avgHr != null);
  const hottest = stationHr.length ? stationHr.reduce((m, s) => ((s.avgHr as number) > (m.avgHr as number) ? s : m)) : null;
  // Cadence de croisière : médiane des runs 2 à 7 (le run 1 ne sert jamais de référence).
  const cruiseCads = segs
    .filter((s) => s.kind === "run" && s.key !== "run_1" && s.key !== "run_8" && s.avgCadence != null)
    .map((s) => s.avgCadence as number)
    .sort((a, b) => a - b);
  const cruiseCad = cruiseCads.length >= 3 ? cruiseCads[Math.floor(cruiseCads.length / 2)] : null;
  const nextRunCadDrop = (k: StationKey): number | null => {
    const runKey = Object.entries(STATION_BEFORE).find(([, st]) => st === k)?.[0];
    const next = runKey ? segs.find((s) => s.key === runKey) : undefined;
    if (cruiseCad == null || next?.avgCadence == null) return null;
    const d = cruiseCad - next.avgCadence;
    return d >= 4 ? d : null;
  };

  const levers: RaceLever[] = rows.map((p) => {
    if (p.key === "roxzone") {
      const pct = shares(race).roxzone;
      const rec = input.roxzoneRecoveryBpm;
      return {
        key: "roxzone", station: null, label: "Roxzone",
        reason: [pct != null ? `${comma(pct)} % du chrono` : null, rec != null ? `récupération −${rec} bpm en 60 s` : null]
          .filter(Boolean).join(" · ") || `${clock(p.athlete_s)} · médiane ${clock(p.ref_s)}`,
        gainS: Math.round(p.gain_s), weight: p.weight, score: p.score, proposal: HYROX_WORK_PROPOSALS.roxzone, watch: false,
      };
    }
    const k = p.key;
    const drop = nextRunCadDrop(k);
    const reason = hottest?.key === k
      ? `FC moy. ${hottest.avgHr} bpm, la plus haute de la course`
      : drop != null
        ? `Cadence du run suivant −${drop} pas/min`
        : `${clock(p.athlete_s)} · médiane ${clock(p.ref_s)}`;
    return {
      key: k, station: k, label: STATION_META[k].label, reason,
      gainS: Math.round(p.gain_s), weight: p.weight, score: p.score, proposal: HYROX_WORK_PROPOSALS[k], watch: false,
    };
  });

  // Levier montre : course après la station la plus coûteuse, si elle n'est pas déjà citée.
  if (analysis && segs.some((s) => s.avgHr != null || s.avgCadence != null)) {
    // Sans l'habituel du niveau, on ne peut pas dire si la station coûte plus que d'ordinaire : pas de levier.
    const costs = Object.values(runCostAfter(analysis, input.levelP50 ?? null));
    const worst = costs
      .filter((c) => c.excessS != null && c.excessS >= RUN_AFTER_MIN_EXCESS && !levers.some((l) => l.key === c.station))
      .sort((a, b) => (b.excessS as number) - (a.excessS as number))[0];
    if (worst) {
      const k = worst.station;
      const excess = worst.excessS as number;
      levers.push({
        key: `run_after_${k}`, station: k, label: `Course après ${STATION_NAME[k].toLowerCase()}`,
        reason: `Run ${worst.run.slice(4)} : +${worst.costS} s/km vs ta croisière, habituel ${worst.usualS != null && worst.usualS >= 0 ? "+" : "−"}${Math.abs(worst.usualS ?? 0)}${worst.special ? " · run 8, parcours parfois différent" : ""}`,
        gainS: excess, weight: RUN_AFTER_STATION_WEIGHT, score: excess * RUN_AFTER_STATION_WEIGHT,
        proposal: runAfterProposal(k), watch: true,
      });
    }
  }
  return levers.sort((a, b) => b.score - a.score);
}
