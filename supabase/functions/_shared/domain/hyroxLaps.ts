/**
 * HYROX (et toute séance spécifique enchaînant course et stations) : nommage
 * des tours et proposition de découpage.
 *
 * Décision 6 (brief P41) :
 * - nombre de tours de la montre = nombre de blocs prévus → chaque tour prend
 *   le nom, l'exercice, la distance / les répétitions du bloc, statut
 *   `proposed` jusqu'à validation ;
 * - sinon on garde les tours de l'athlète, et Agon PROPOSE à la demande
 *   (`proposeLaps`) un découpage d'après la série seconde par seconde ;
 * - jamais de tour « Transition » automatique.
 *
 * Pur, sans dépendance au front : les types de séance (`EnergyStep`, blocs
 * Classique) sont décrits ici par leur forme minimale.
 */

import type { ActivityStream, WatchLap } from "../activityFiles/stream.ts";

// ── Séance prévue (forme minimale) ───────────────────────────────────────────

interface Duration {
  kind: "time" | "distance" | "calories" | "lap_button";
  value?: number;
}
export type PlanStep =
  | { type: "interval"; id: string; role: string; duration: Duration; equipment?: string; notes?: string }
  | { type: "group"; id: string; role: string; repeat: number; children: PlanStep[]; rest_between?: PlanStep }
  | {
    type: "exercise";
    id: string;
    role: string;
    exercise_id: string;
    exercise_name: string;
    reps_min?: number;
    reps_max?: number;
    weight_kg?: number;
    duration?: Duration;
  };
export interface PlanClassiqueItem {
  id: string;
  name: string;
  exercise_id?: string;
  prescription?: string;
}
export type PlanBlock =
  | { id: string; title: string; kind?: "classique"; items: PlanClassiqueItem[] }
  | { id: string; title: string; kind: "wod"; steps: PlanStep[] };

// ── Blocs attendus ───────────────────────────────────────────────────────────

export type ExpectedKind = "run" | "station" | "rest";

export interface ExpectedBlock {
  /** Référence stable dans la séance (`planned_block_ref`) : id + répétition. */
  ref: string;
  kind: ExpectedKind;
  name: string;
  exerciseId: string | null;
  distanceM: number | null;
  reps: number | null;
  loadKg: number | null;
  durationS: number | null;
}

/** Une station au nom de course (« Course », « Run », « Running ») est une course. */
const RUN_NAME = /\b(course|run|running|footing|jog)\b/i;

const ROLE_NAMES: Record<string, string> = {
  warmup: "Échauffement",
  cooldown: "Retour au calme",
  recovery: "Récupération",
  rest: "Repos",
};

export function distanceLabel(m: number): string {
  return m >= 1000 && m % 100 === 0 ? `${(m / 1000).toLocaleString("fr-FR")} km` : `${Math.round(m)} m`;
}

/**
 * Lit une prescription libre de bloc Classique : « 500 m », « 1 km »,
 * « 15 m », « 10 reps », « 100 wall balls », « 4 x 250 m », « 3 × 10 reps »,
 * « 5 séries · 8 reps », « 2' », « 90 s », « 20 cal ».
 */
export function parsePrescription(text: string | null | undefined): {
  repeat: number;
  distanceM: number | null;
  reps: number | null;
  durationS: number | null;
} {
  const t = (text ?? "").toLowerCase().replace(",", ".");
  const out = { repeat: 1, distanceM: null as number | null, reps: null as number | null, durationS: null as number | null };
  const rep = t.match(/(\d+)\s*(?:x|×|séries?|series?|sets?|tours?)\b/) ?? t.match(/(\d+)\s*(?:x|×)/);
  if (rep) out.repeat = Math.max(1, Math.min(50, Number(rep[1])));
  const rest = rep ? t.slice((rep.index ?? 0) + rep[0].length) : t;
  const km = rest.match(/(\d+(?:\.\d+)?)\s*km\b/);
  const m = rest.match(/(\d+(?:\.\d+)?)\s*m\b(?!in)/);
  if (km) out.distanceM = Number(km[1]) * 1000;
  else if (m) out.distanceM = Number(m[1]);
  const reps = rest.match(/(\d+)\s*(?:reps?|rép\w*|répétitions?|wall ?balls?|burpees?|cal\b)/);
  if (reps) out.reps = Number(reps[1]);
  const minSec = rest.match(/(\d+)\s*'\s*(\d{1,2})\b/);
  const min = rest.match(/(\d+(?:\.\d+)?)\s*(?:'|min\b)/);
  const sec = rest.match(/(\d+)\s*(?:"|s\b|sec)/);
  if (minSec) out.durationS = Number(minSec[1]) * 60 + Number(minSec[2]);
  else if (min || sec) out.durationS = (min ? Number(min[1]) * 60 : 0) + (sec ? Number(sec[1]) : 0);
  if (!km && !m && !reps && !min && !sec && !minSec && rep === null) {
    const bare = rest.match(/^\s*(\d+)\s*$/);
    if (bare) out.reps = Number(bare[1]);
  }
  return out;
}

function stepBlocks(step: PlanStep, prefix: string, out: ExpectedBlock[]): void {
  if (step.type === "group") {
    const n = Math.max(1, Math.min(50, Math.round(step.repeat || 1)));
    for (let i = 1; i <= n; i++) {
      for (const c of step.children) stepBlocks(c, `${prefix}${step.id}#${i}/`, out);
      if (step.rest_between && i < n) stepBlocks(step.rest_between, `${prefix}${step.id}#${i}/`, out);
    }
    return;
  }
  const ref = `${prefix}${step.id}`;
  if (step.type === "exercise") {
    const isRun = RUN_NAME.test(step.exercise_name);
    const dist = step.duration?.kind === "distance" ? step.duration.value ?? null : null;
    out.push({
      ref,
      kind: isRun ? "run" : "station",
      name: dist && !isRun ? `${step.exercise_name} ${distanceLabel(dist)}` : step.exercise_name,
      exerciseId: step.exercise_id || null,
      distanceM: dist,
      reps: step.reps_max ?? step.reps_min ?? null,
      loadKg: step.weight_kg ?? null,
      durationS: step.duration?.kind === "time" ? step.duration.value ?? null : null,
    });
    return;
  }
  const rest = step.role === "rest" || step.role === "recovery";
  const dist = step.duration.kind === "distance" ? step.duration.value ?? null : null;
  out.push({
    ref,
    kind: rest ? "rest" : "run",
    name: ROLE_NAMES[step.role] ?? (dist ? `Course ${distanceLabel(dist)}` : "Course"),
    exerciseId: null,
    distanceM: dist,
    reps: null,
    loadKg: null,
    durationS: step.duration.kind === "time" ? step.duration.value ?? null : null,
  });
}

/** Aplatit une séance prévue (WOD `EnergyStep[]` ou blocs Classique) en suite de blocs attendus. */
export function flattenPlannedSession(session: {
  intervals?: PlanStep[] | null;
  classique_structure?: { blocks: PlanBlock[] } | null;
  format?: string | null;
}): ExpectedBlock[] {
  const out: ExpectedBlock[] = [];
  if (session.format === "classique" && session.classique_structure?.blocks?.length) {
    for (const b of session.classique_structure.blocks) {
      if (b.kind === "wod") {
        for (const s of b.steps) stepBlocks(s, `${b.id}/`, out);
        continue;
      }
      for (const it of b.items) {
        const p = parsePrescription(it.prescription);
        const isRun = RUN_NAME.test(it.name);
        for (let i = 1; i <= p.repeat; i++) {
          out.push({
            ref: p.repeat > 1 ? `${b.id}/${it.id}#${i}` : `${b.id}/${it.id}`,
            kind: isRun ? "run" : "station",
            name: p.distanceM && !isRun ? `${it.name} ${distanceLabel(p.distanceM)}` : it.name,
            exerciseId: it.exercise_id ?? null,
            distanceM: p.distanceM,
            reps: p.reps,
            loadKg: null,
            durationS: p.durationS,
          });
        }
      }
    }
    return out;
  }
  for (const s of session.intervals ?? []) stepBlocks(s, "", out);
  return out;
}

// ── Tours proposés ───────────────────────────────────────────────────────────

export interface ProposedLap {
  startS: number;
  endS: number;
  name: string | null;
  exerciseId: string | null;
  plannedBlockRef: string | null;
  /** Distance prévue d'une station (sled 15 m) : le GPS ne la mesure pas. */
  distanceOverrideM: number | null;
  reps: number | null;
  loadKg: number | null;
  origin: "watch" | "agon_proposal";
  status: "proposed" | "validated";
  needsReview: boolean;
}

const fromBlock = (b: ExpectedBlock) => ({
  name: b.name,
  exerciseId: b.exerciseId,
  plannedBlockRef: b.ref,
  distanceOverrideM: b.kind === "station" ? b.distanceM : null,
  reps: b.reps,
  loadKg: b.loadKg,
});

/** Blocs comptés pour le nommage : avec les repos, sinon sans (l'athlète ne « lape » pas toujours le repos). */
function countMatch(n: number, blocks: ExpectedBlock[]): ExpectedBlock[] | null {
  if (blocks.length === n) return blocks;
  const noRest = blocks.filter((b) => b.kind !== "rest");
  return noRest.length === n ? noRest : null;
}

/**
 * Tours à afficher pour une activité, avant toute modification humaine :
 * - sans séance prévue (ou sans bloc) → tours de la montre, tels quels ;
 * - autant de tours que de blocs → tours nommés d'après les blocs, `proposed` ;
 * - sinon → tours de la montre, et une proposition est disponible à la demande.
 */
export function lapsForActivity(
  watchLaps: readonly WatchLap[],
  blocks: readonly ExpectedBlock[] | null,
): { laps: ProposedLap[]; named: boolean; proposalAvailable: boolean } {
  const plain = (l: WatchLap): ProposedLap => ({
    startS: l.startS,
    endS: l.endS,
    name: null,
    exerciseId: null,
    plannedBlockRef: null,
    distanceOverrideM: null,
    reps: null,
    loadKg: null,
    origin: "watch",
    status: "validated",
    needsReview: false,
  });
  if (!blocks || blocks.length === 0) return { laps: watchLaps.map(plain), named: false, proposalAvailable: false };
  const match = countMatch(watchLaps.length, [...blocks]);
  if (match) {
    return {
      laps: watchLaps.map((l, i) => ({ ...plain(l), ...fromBlock(match[i]), status: "proposed" })),
      named: true,
      proposalAvailable: false,
    };
  }
  return { laps: watchLaps.map(plain), named: false, proposalAvailable: true };
}

// ── Proposition depuis la série ──────────────────────────────────────────────

/** Au-dessus : on court (7,2 km/h). En dessous : station, marche, transition. */
export const RUN_SPEED_MPS = 2;
/** Segment plus court : absorbé par ses voisins (arrêt au feu, pas chassé…). */
const MIN_SEGMENT_S = 10;
const SMOOTH_S = 5;

interface Segment {
  run: boolean;
  startS: number;
  endS: number;
}

/** Découpe la série en alternance course / non-course (vitesse lissée sur ±5 s). */
export function segmentStream(stream: ActivityStream): Segment[] {
  const { t, speed } = stream;
  if (t.length < 2) return [];
  const flags = t.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - SMOOTH_S); j <= Math.min(t.length - 1, i + SMOOTH_S); j++) {
      const v = speed?.[j] ?? null;
      if (v !== null) {
        s += v;
        n++;
      }
    }
    return n > 0 && s / n >= RUN_SPEED_MPS;
  });
  let segs: Segment[] = [];
  for (let i = 0; i < t.length; i++) {
    const end = i + 1 < t.length ? t[i + 1] : t[i] + 1;
    const last = segs[segs.length - 1];
    if (last && last.run === flags[i]) last.endS = end;
    else segs.push({ run: flags[i], startS: t[i], endS: end });
  }
  // Absorbe les segments trop courts, puis refusionne les voisins de même nature.
  let changed = true;
  while (changed && segs.length > 1) {
    changed = false;
    const i = segs.findIndex((s) => s.endS - s.startS < MIN_SEGMENT_S);
    if (i >= 0) {
      const target = i === 0 ? 1 : i - 1;
      segs[target] = {
        run: segs[target].run,
        startS: Math.min(segs[target].startS, segs[i].startS),
        endS: Math.max(segs[target].endS, segs[i].endS),
      };
      segs.splice(i, 1);
      changed = true;
    }
    const merged: Segment[] = [];
    for (const s of segs) {
      const last = merged[merged.length - 1];
      if (last && last.run === s.run) last.endS = s.endS;
      else merged.push({ ...s });
    }
    segs = merged;
  }
  return segs;
}

/**
 * Propose un découpage d'après la séance prévue : les blocs sont regroupés en
 * suites de même nature (course / non-course), alignées sur les segments de la
 * série par programmation dynamique (coût = secondes de nature contraire).
 * Plusieurs stations consécutives (sled push puis wall balls, sans course
 * entre les deux) se partagent leur segment : coupure au prorata, tours
 * marqués « à vérifier ». Appelée seulement à la demande de l'athlète.
 */
export function proposeLaps(stream: ActivityStream, blocks: readonly ExpectedBlock[]): ProposedLap[] {
  const expected = blocks.filter((b) => b.kind !== "rest");
  const t0 = stream.t[0] ?? 0;
  const tEnd = stream.t.length ? stream.t[stream.t.length - 1] + 1 : 0;
  if (expected.length === 0 || tEnd <= t0) return [];

  // Groupes de blocs consécutifs de même nature.
  const groups: Array<{ run: boolean; blocks: ExpectedBlock[] }> = [];
  for (const b of expected) {
    const run = b.kind === "run";
    const last = groups[groups.length - 1];
    if (last && last.run === run) last.blocks.push(b);
    else groups.push({ run, blocks: [b] });
  }

  const segs = segmentStream(stream);
  const G = groups.length;
  const S = segs.length;
  const ranges: Array<{ startS: number; endS: number; mismatch: number }> = [];

  if (S >= G) {
    // dp[g][s] : coût minimal pour placer les g premiers groupes sur les s premiers segments.
    const INF = Number.POSITIVE_INFINITY;
    const dp = Array.from({ length: G + 1 }, () => new Array<number>(S + 1).fill(INF));
    const cut = Array.from({ length: G + 1 }, () => new Array<number>(S + 1).fill(-1));
    dp[0][0] = 0;
    const cost = (g: number, from: number, to: number) => {
      let c = 0;
      for (let k = from; k < to; k++) if (segs[k].run !== groups[g].run) c += segs[k].endS - segs[k].startS;
      return c;
    };
    for (let g = 1; g <= G; g++) {
      for (let s = g; s <= S - (G - g); s++) {
        for (let p = g - 1; p < s; p++) {
          if (dp[g - 1][p] === INF) continue;
          const v = dp[g - 1][p] + cost(g - 1, p, s);
          if (v < dp[g][s]) {
            dp[g][s] = v;
            cut[g][s] = p;
          }
        }
      }
    }
    const bounds: Array<[number, number]> = [];
    let s = S;
    for (let g = G; g >= 1; g--) {
      const p = cut[g][s];
      bounds.unshift([p, s]);
      s = p;
    }
    for (let g = 0; g < G; g++) {
      const [a, b] = bounds[g];
      ranges.push({ startS: segs[a].startS, endS: segs[b - 1].endS, mismatch: cost(g, a, b) });
    }
  } else {
    // Moins de segments que de groupes : la série ne permet pas de les distinguer.
    const step = (tEnd - t0) / G;
    for (let g = 0; g < G; g++) {
      ranges.push({ startS: Math.round(t0 + g * step), endS: Math.round(t0 + (g + 1) * step), mismatch: Infinity });
    }
  }

  const laps: ProposedLap[] = [];
  for (let g = 0; g < G; g++) {
    const { startS, endS, mismatch } = ranges[g];
    const group = groups[g].blocks;
    const unsure = mismatch > 0.2 * (endS - startS) || group.length > 1;
    // Coupure au prorata de la distance prévue (courses), sinon parts égales.
    const weights = group.map((b) => (groups[g].run && b.distanceM ? b.distanceM : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let at = startS;
    group.forEach((b, i) => {
      const end = i === group.length - 1 ? endS : Math.round(at + ((endS - startS) * weights[i]) / total);
      laps.push({
        startS: at,
        endS: Math.max(end, at + 1),
        ...fromBlock(b),
        origin: "agon_proposal",
        status: "proposed",
        needsReview: unsure,
      });
      at = Math.max(end, at + 1);
    });
  }
  return laps;
}
