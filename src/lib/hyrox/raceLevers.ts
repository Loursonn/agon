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

/** Poids du levier « Course après {station} » (validé par défaut, prompt §9 Q4). */
export const RUN_AFTER_STATION_WEIGHT = 0.6;
/** Coût minimal (s/km vs allure fraîche) pour proposer « Course après {station} ». */
export const RUN_AFTER_MIN_COST = 20;

export interface RaceLever {
  /** Clé de station, `roxzone`, ou `run_after_<station>`. */
  key: string;
  /** Station concernée (picto), `null` pour la Roxzone. */
  station: StationKey | null;
  label: string;
  reason: string;
  /** Secondes perdues vs la médiane (ou vs l'allure fraîche pour la course). */
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
}): RaceLever[] {
  const { race, refs, analysis } = input;
  const rows = stationPriorities(race, refs).filter((p) => p.gain_s >= GAIN_THRESHOLD_S);
  const segs = analysis?.segments ?? [];
  const stationHr = segs.filter((s) => s.kind === "station" && s.avgHr != null);
  const hottest = stationHr.length ? stationHr.reduce((m, s) => ((s.avgHr as number) > (m.avgHr as number) ? s : m)) : null;
  const run1Cad = segs.find((s) => s.key === "run_1")?.avgCadence ?? null;
  const nextRunCadDrop = (k: StationKey): number | null => {
    const i = segs.findIndex((s) => s.key === k);
    const next = i >= 0 ? segs.slice(i + 1).find((s) => s.kind === "run") : undefined;
    if (run1Cad == null || next?.avgCadence == null) return null;
    const d = run1Cad - next.avgCadence;
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
    const cost = runCostAfter(analysis);
    const worst = (Object.entries(cost) as Array<[StationKey, number]>)
      .filter(([k, c]) => c >= RUN_AFTER_MIN_COST && !levers.some((l) => l.key === k))
      .sort((a, b) => b[1] - a[1])[0];
    if (worst) {
      const [k, c] = worst;
      const i = segs.findIndex((s) => s.key === k);
      const run = segs.slice(i + 1).find((s) => s.kind === "run");
      levers.push({
        key: `run_after_${k}`, station: k, label: `Course après ${STATION_NAME[k].toLowerCase()}`,
        reason: `${run ? run.label : "Run suivant"} : +${c} s/km vs allure fraîche`,
        gainS: c, weight: RUN_AFTER_STATION_WEIGHT, score: c * RUN_AFTER_STATION_WEIGHT,
        proposal: runAfterProposal(k), watch: true,
      });
    }
  }
  return levers.sort((a, b) => b.score - a.score);
}
