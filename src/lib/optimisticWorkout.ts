/**
 * Mise à jour optimiste du cache React Query des séances muscu quand une
 * saisie part en file d'attente hors ligne (hors ligne phase 2).
 *
 * L'écran doit se comporter comme si la saisie était enregistrée : statut
 * « validée », RPE, distance, saisie fusionnée. On ne connaît pas la forme
 * exacte de chaque requête (liste de `WorkoutLog`, semaine, calendrier…) :
 * on cherche, dans les données, les objets qui portent l'id de la séance ET un
 * champ `status`, et on ne modifie que les champs qu'ils ont déjà. Rien n'est
 * ajouté à une forme qui ne le connaît pas.
 *
 * Mêmes règles que les RPC (migration 20261108100000_workout_rpcs.sql) :
 * - `completed_at` n'est jamais écrasé (COALESCE) ;
 * - distance / RPE de fin de séance : `null` ne remplace rien ;
 * - saisie : `mergeEntries` (fusion de premier niveau, jamais `coachOverride`).
 */
import type { QueryClient } from "@tanstack/react-query";
import { mergeEntries } from "@shared/domain/athleteMods";

export interface OptimisticWorkoutPatch {
  status?: string;
  /** Posé seulement si la séance n'en a pas déjà un. */
  completedAt?: string;
  /** `undefined` = ne pas toucher ; `null` = retirer (RPE seulement). */
  rpe?: number | null;
  /** `null` / `undefined` = ne pas toucher (COALESCE). */
  runKm?: number | null;
  /** Saisie complète de la séance, fusionnée comme le fait le serveur. */
  mods?: object | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const MAX_DEPTH = 6;

function applyPatch(o: Obj, p: OptimisticWorkoutPatch, createMods: boolean): Obj {
  const next: Obj = { ...o };
  if (p.status !== undefined && "status" in o) next.status = p.status;
  if (p.completedAt !== undefined && "completed_at" in o && !o.completed_at) next.completed_at = p.completedAt;
  if (p.rpe !== undefined) {
    if ("rpe_score" in o) next.rpe_score = p.rpe;
    if ("rpe" in o) next.rpe = p.rpe;
  }
  if (p.runKm != null && "run_distance_km" in o) next.run_distance_km = p.runKm;
  if (p.mods && "athlete_modifications" in o) {
    const cur = o.athlete_modifications;
    // Liste lue sans la saisie (`null`) : on la laisse sans saisie, sauf pour
    // le détail de la séance (lu avec la saisie, `null` = rien saisi).
    if (isObj(cur) || createMods) next.athlete_modifications = mergeEntries(cur, p.mods);
  }
  return next;
}

/**
 * Renvoie `data` avec la séance `logId` mise à jour partout où elle apparaît
 * (même référence si rien ne change, pour ne pas réveiller les écrans).
 */
export function patchWorkoutInData<T>(
  data: T,
  logId: string,
  patch: OptimisticWorkoutPatch,
  opts: { createMods?: boolean } = {},
): T {
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > MAX_DEPTH) return v;
    if (Array.isArray(v)) {
      let changed = false;
      const out = v.map((x) => {
        const y = walk(x, depth + 1);
        if (y !== x) changed = true;
        return y;
      });
      return changed ? out : v;
    }
    if (!isObj(v)) return v;
    if (v.id === logId && "status" in v) return applyPatch(v, patch, !!opts.createMods);
    let changed = false;
    const out: Obj = {};
    for (const [k, x] of Object.entries(v)) {
      const y = walk(x, depth + 1);
      if (y !== x) changed = true;
      out[k] = y;
    }
    return changed ? out : v;
  };
  return walk(data, 0) as T;
}

/** Retire la séance d'une liste (rappel « séance non terminée » une fois validée). */
export function removeWorkoutFromList<T>(data: T, logId: string): T {
  if (!Array.isArray(data)) return data;
  const out = data.filter((x) => !(isObj(x) && x.id === logId));
  return (out.length === data.length ? data : out) as T;
}

function keyHas(key: unknown, needle: string): boolean {
  if (key === needle) return true;
  return Array.isArray(key) && key.some((k) => keyHas(k, needle));
}

/**
 * Applique la mise à jour à toutes les requêtes de l'athlète en cache (et au
 * détail de la séance). À n'appeler QUE quand la saisie est en file : en
 * ligne, on invalide (`invalidateWorkouts`) et le serveur fait foi.
 * La file invalide tout une fois vidée (`writes.ts`), ce qui remplace ces
 * valeurs locales par celles du serveur.
 */
export function applyOptimisticWorkout(
  qc: QueryClient,
  p: { athleteId: string | null | undefined; logId: string },
  patch: OptimisticWorkoutPatch,
): void {
  const { athleteId, logId } = p;
  for (const q of qc.getQueryCache().getAll()) {
    const k = q.queryKey;
    if (q.state.data === undefined) continue;
    const isDetail = k[0] === "workout-log-detail" && k[1] === logId;
    if (!isDetail && !(athleteId && keyHas(k, athleteId))) continue;
    let next = patchWorkoutInData(q.state.data, logId, patch, { createMods: isDetail });
    if (patch.status === "completed" && k[k.length - 1] === "unfinished") next = removeWorkoutFromList(next, logId);
    if (next !== q.state.data) qc.setQueryData(k, next);
  }
}

/** Première séance en cache qui vérifie `pred` (recherche dans toutes les formes). */
export function findWorkoutInData(data: unknown, pred: (o: Obj) => boolean): Obj[] {
  const found: Obj[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > MAX_DEPTH) return;
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    if (!isObj(v)) return;
    if (typeof v.id === "string" && pred(v)) { found.push(v); return; }
    Object.values(v).forEach((x) => walk(x, depth + 1));
  };
  walk(data, 0);
  return found;
}

/**
 * Id de la séance (athlète, séance-type, date) d'après le cache seulement —
 * utile hors ligne, quand la liste ne peut pas être relue. La plus récente si
 * aucune date n'est donnée ; `null` si le téléphone ne la connaît pas.
 */
export function findCachedWorkoutLogId(
  qc: QueryClient,
  p: { athleteId: string; sessionId: string; scheduledDate?: string },
): string | null {
  const matches: Obj[] = [];
  for (const q of qc.getQueryCache().getAll()) {
    if (q.state.data === undefined) continue;
    const k = q.queryKey;
    if (!keyHas(k, p.athleteId) && k[0] !== "workout-log-detail") continue;
    matches.push(...findWorkoutInData(q.state.data, (o) =>
      o.athlete_id === p.athleteId &&
      o.session_id === p.sessionId &&
      typeof o.scheduled_date === "string" &&
      (!p.scheduledDate || o.scheduled_date === p.scheduledDate),
    ));
  }
  if (matches.length === 0) return null;
  matches.sort((a, b) => String(b.scheduled_date).localeCompare(String(a.scheduled_date)));
  return String(matches[0].id);
}

/**
 * La saisie `draft` est-elle déjà entièrement en base (`server`) ? Alors le
 * brouillon local, même marqué « non synchronisé » (envoi parti par la file
 * hors ligne, ou keepalive dont la réponse n'est jamais revenue), n'a rien à
 * apporter : on ne le restaure pas.
 */
export function draftAlreadyOnServer(server: unknown, draft: unknown): boolean {
  if (!isObj(draft)) return true;
  const merged = mergeEntries(server, draft);
  return stableJson(stripOverride(merged)) === stableJson(stripOverride(isObj(server) ? server : null));
}

function stripOverride(o: Obj | null): Obj | null {
  if (!o) return null;
  const { coachOverride: _drop, ...rest } = o;
  void _drop;
  return rest;
}

/** JSON à clés triées (l'ordre des clés n'est pas garanti par jsonb). */
function stableJson(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    isObj(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x,
  );
}
