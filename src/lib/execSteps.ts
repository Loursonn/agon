import type { EnergyGroup, EnergyInterval, EnergyStep, ExerciseInterval } from "@/types/energy";

/**
 * Liste à plat des pas d'une séance spécifique, telle que le minuteur la
 * parcourt : groupes déroulés × répétitions, « Tour n / m » sur chaque pas.
 *
 * Départ fixe (EMOM, `departure_every_s`) : chaque répétition dure exactement
 * N secondes. Les pas du tour sont suivis d'un pas « reste de la minute »
 * (`emom.gap`), dont le décompte réel est le temps qui reste au moment où
 * l'athlète y arrive ; si la minute s'écoule avant, le tour suivant démarre.
 */

export interface EmomInfo {
  /** Durée d'une répétition (s) : 60 pour un EMOM. */
  every: number;
  round: number;
  rounds: number;
  /** Pas « repos jusqu'à la minute suivante ». */
  gap?: true;
}

export interface FlatExecStep {
  step: EnergyInterval | ExerciseInterval;
  /** « Tour 3 / 8 », « Minute 7 / 12 » si le pas est dans un groupe répété. */
  roundLabel?: string;
  /** Profondeur d'imbrication. */
  depth: number;
  /** Présent dans un groupe à départ fixe (EMOM). */
  emom?: EmomInfo;
}

/** « Minute 7 / 12 » (départ toutes les 60 s), « Départ 3 / 10 » sinon. */
export function emomLabel(every: number, round: number, rounds: number): string {
  return `${every === 60 ? "Minute" : "Départ"} ${round} / ${rounds}`;
}

export function flattenExecSteps(steps: readonly EnergyStep[], depth = 0): FlatExecStep[] {
  const result: FlatExecStep[] = [];
  for (const step of steps) {
    if (step.type === "interval" || step.type === "exercise") {
      result.push({ step, depth });
      continue;
    }
    const group = step as EnergyGroup;
    const every = group.departure_every_s && group.departure_every_s > 0 ? group.departure_every_s : 0;
    for (let rep = 0; rep < group.repeat; rep++) {
      const emom: EmomInfo | undefined = every ? { every, round: rep + 1, rounds: group.repeat } : undefined;
      const roundLabel = emom
        ? emomLabel(every, rep + 1, group.repeat)
        : group.repeat > 1 ? `Tour ${rep + 1} / ${group.repeat}` : undefined;
      for (const child of group.children) {
        if (child.type === "interval" || child.type === "exercise") {
          result.push({ step: child, roundLabel, depth: depth + 1, ...(emom ? { emom } : {}) });
        } else {
          for (const n of flattenExecSteps([child], depth + 1)) {
            result.push({ ...n, roundLabel: roundLabel ?? n.roundLabel, ...(emom ? { emom } : {}) });
          }
        }
      }
      if (emom) {
        // La minute gouverne la récup : pas de rest_between en EMOM.
        result.push({
          step: {
            type: "interval", id: `${group.id}-emom-${rep + 1}`, role: "rest",
            duration: { kind: "time", value: every }, target: { kind: "none" },
            notes: rep < group.repeat - 1 ? (every === 60 ? "Repos jusqu'à la minute suivante" : "Repos jusqu'au départ suivant") : "Fin du dernier tour",
          },
          roundLabel, depth: depth + 1, emom: { ...emom, gap: true },
        });
      } else if (group.rest_between && rep < group.repeat - 1) {
        result.push({ step: group.rest_between, roundLabel, depth: depth + 1 });
      }
    }
  }
  return result;
}

/** Le pas `i` ouvre-t-il une répétition EMOM (le chrono de la minute part) ? */
export function isEmomRoundStart(flat: readonly FlatExecStep[], i: number): boolean {
  const cur = flat[i]?.emom;
  if (!cur || cur.gap) return false;
  const prev = flat[i - 1]?.emom;
  return !prev || prev.gap === true || prev.round !== cur.round;
}

/** Secondes restantes dans la répétition commencée à `startMs`. */
export function emomSecondsLeft(startMs: number, nowMs: number, every: number): number {
  return Math.max(0, every - Math.floor((nowMs - startMs) / 1000));
}

/** Index du premier pas après la répétition EMOM en cours (après son pas « reste »). */
export function emomNextRoundIndex(flat: readonly FlatExecStep[], i: number): number {
  for (let k = i; k < flat.length; k++) if (flat[k].emom?.gap) return k + 1;
  return flat.length;
}
