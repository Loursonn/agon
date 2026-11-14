/**
 * Séance en cours, mode « un bloc à la fois » (maquette « Séance en cours ») :
 * quelle série la zone de saisie du bas propose-t-elle ?
 *
 * - Exercices seuls : le premier exercice qui a une série ni faite ni passée,
 *   et sa première série restante.
 * - Superset (exercices liés par `supersetWithNext`) : tour par tour,
 *   ex. 1 → ex. 2 → récup → ex. 1… On prend le membre qui a le moins de
 *   séries traitées ; à égalité, le premier de la chaîne.
 * - `skip` (exercice libre, clusters) : jamais proposé dans la zone du bas,
 *   l'athlète le valide dans sa carte.
 */

export interface FocusExercise {
  id: string;
  supersetWithNext?: boolean;
  skip?: boolean;
  /** Séries prescrites (le tableau de saisie peut en avoir plus : séries bonus). */
  nbSets: number;
}

export interface FocusSet {
  done?: boolean;
  skipped?: boolean;
}

export interface PendingSet {
  exId: string;
  setIdx: number;
  /** Membres de la chaîne (superset) ; un seul id pour un exercice seul. */
  chain: string[];
}

type SetsById = Record<string, readonly FocusSet[] | undefined>;

const handled = (s: FocusSet | undefined) => !!s && (!!s.done || !!s.skipped);

function rows(ex: FocusExercise, sets: SetsById): number {
  return Math.max(ex.nbSets, sets[ex.id]?.length ?? 0);
}

function firstOpen(ex: FocusExercise, sets: SetsById): number {
  const arr = sets[ex.id] ?? [];
  const n = rows(ex, sets);
  for (let i = 0; i < n; i++) if (!handled(arr[i])) return i;
  return -1;
}

function handledCount(ex: FocusExercise, sets: SetsById): number {
  return (sets[ex.id] ?? []).filter(handled).length;
}

/** Chaînes de superset dans l'ordre du bloc. */
export function supersetChains(exs: readonly FocusExercise[]): FocusExercise[][] {
  const out: FocusExercise[][] = [];
  let cur: FocusExercise[] = [];
  exs.forEach((e, i) => {
    cur.push(e);
    if (!e.supersetWithNext || i === exs.length - 1) {
      out.push(cur);
      cur = [];
    }
  });
  return out;
}

/** Prochaine série à proposer dans un bloc ; null si tout est traité (ou seulement des exercices `skip`). */
export function nextPendingSet(exs: readonly FocusExercise[], sets: SetsById): PendingSet | null {
  for (const chain of supersetChains(exs)) {
    const ids = chain.map((e) => e.id);
    const open = chain.filter((e) => !e.skip && firstOpen(e, sets) >= 0);
    if (open.length === 0) continue;
    let pick = open[0];
    for (const e of open) if (handledCount(e, sets) < handledCount(pick, sets)) pick = e;
    return { exId: pick.id, setIdx: firstOpen(pick, sets), chain: ids };
  }
  return null;
}

/** Bloc où reprendre : le premier qui a encore une série à traiter (exercices `skip` compris), sinon le dernier. */
export function firstPendingBloc(blocs: readonly (readonly FocusExercise[])[], sets: SetsById): number {
  for (let i = 0; i < blocs.length; i++) {
    if (blocs[i].some((e) => firstOpen(e, sets) >= 0)) return i;
  }
  return Math.max(0, blocs.length - 1);
}

/** Valeur ± d'une charge ou de reps saisies en texte (« 67,5 ») ; jamais négative. */
export function stepValue(raw: string, step: number): string {
  const n = parseFloat(String(raw ?? "").replace(",", "."));
  const next = Math.max(0, (Number.isFinite(n) ? n : 0) + step);
  return String(Math.round(next * 100) / 100);
}
