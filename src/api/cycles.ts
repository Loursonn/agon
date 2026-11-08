import type { Query, QueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/queryKeys";
import { type IsoDay, localIsoDay } from "@shared/domain/dates";
import { ApiError, check, db, unwrap, unwrapRows } from "./client";
import { deletePlannedWorkouts, invalidateWorkouts } from "./workouts";

/**
 * Périodisation d'un athlète : macrocycles → mésocycles → cycles → semaines
 * (`microcycles`). Un cycle peut aussi être « autonome » (sans mésocycle,
 * `athlete_id` renseigné).
 *
 * - Lectures : lèvent en cas d'erreur (une frise vide doit vouloir dire « pas
 *   de cycle », jamais « la requête a échoué »).
 * - Créer un cycle et changer ses dates : RPC atomiques `create_cycle` /
 *   `set_cycle_dates` (migration 20261109100000_planning_rpcs.sql). Elles
 *   régénèrent les semaines et ne touchent jamais une séance réelle (validée,
 *   commencée ou notée — même règle que `deletePlannedWorkouts`).
 * - Après toute écriture : `invalidateCycles(qc, athleteId)`, et rien d'autre.
 */

export type PeriodLevel = "macrocycles" | "mesocycles" | "cycles" | "microcycles";

export interface Macrocycle {
  id: string; athlete_id: string; coach_id: string;
  name: string; start_date: string; end_date: string; objective?: string | null;
}
export interface Mesocycle {
  id: string; macrocycle_id: string;
  name: string; start_date: string; end_date: string;
  objective?: string | null;
  volume_config?: { type?: string; weeks?: number[] } | null;
  intensity_config?: { zones?: string[]; distribution?: number[] } | null;
  frequency?: number | null; deload_week?: number | null;
}
export interface Cycle {
  id: string; mesocycle_id: string | null;
  athlete_id?: string; coach_id?: string;
  name: string; start_date: string; end_date: string;
  objective?: string | null;
}
export interface Microcycle {
  id: string; cycle_id: string;
  week_number: number; start_date: string; end_date: string; is_deload: boolean;
}

export interface CycleTree {
  macrocycles: Macrocycle[];
  mesocycles:  Mesocycle[];
  /** Cycles rattachés à un mésocycle, puis cycles autonomes. */
  cycles:      Cycle[];
  microcycles: Microcycle[];
}

// ── Clés React Query ──────────────────────────────────────────────────────────
// Les noms historiques sont gardés : des écrans hors planning (assistant IA,
// programmation, compétitions) invalident encore ces clés par leur nom.

export const cycleKeys = {
  timeline:      (aid: string, start: string, end: string) => ["timeline-data", aid, start, end] as const,
  timelineAll:   (aid: string) => ["timeline-data", aid] as const,
  summary:       (aid: string) => ["planning-summary", aid] as const,
  athleteCycles: (aid: string) => ["athlete-cycles", aid] as const,
  lastCycle:     (aid: string) => ["assistant-last-cycle", aid] as const,
  history:       (aid: string) => ["historique", aid] as const,
  microcycle:    (id: string | null | undefined) => ["microcycle", id] as const,
  endingSoon:    (coachId: string) => QK.coachDashboard.planningMargin(coachId),
  /** État d'écran (cycle sélectionné), jamais lu en base. */
  activeCycleId: (aid: string) => ["active-cycle-id", aid] as const,
};

// ── Lectures ──────────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;
const day = (v: unknown) => String(v ?? "").slice(0, 10);

/** Chevauchement tel que l'écrivait la frise (`start <= fin OU fin >= début`). */
function overlapsLoose(r: { start_date: string; end_date: string }, from?: string | null, to?: string | null) {
  if (!from || !to) return true;
  return r.start_date <= to || r.end_date >= from;
}

/**
 * Arbre complet d'un athlète. Avec `from`/`to`, macrocycles et cycles
 * autonomes sont filtrés comme le faisait la frise ; `withMicrocycles: false`
 * évite la lecture des semaines (Historique).
 */
export async function getCycleTree(
  athleteId: string,
  opts: { from?: IsoDay | null; to?: IsoDay | null; withMicrocycles?: boolean } = {},
): Promise<CycleTree> {
  const macros = unwrapRows<Macrocycle>(
    (await db().from("macrocycles").select("*").eq("athlete_id", athleteId).order("start_date")) as never,
    "Lecture des macrocycles impossible",
  ).filter((m) => overlapsLoose(m, opts.from, opts.to));

  let mesos: Mesocycle[] = [];
  let nested: Cycle[] = [];
  if (macros.length > 0) {
    mesos = unwrapRows<Mesocycle>(
      (await db().from("mesocycles").select("*").in("macrocycle_id", macros.map((m) => m.id)).order("start_date")) as never,
      "Lecture des mésocycles impossible",
    );
    if (mesos.length > 0) {
      nested = unwrapRows<Cycle>(
        (await db().from("cycles").select("*").in("mesocycle_id", mesos.map((m) => m.id)).order("start_date")) as never,
        "Lecture des cycles impossible",
      );
    }
  }
  const standalone = unwrapRows<Cycle>(
    (await db().from("cycles").select("*").eq("athlete_id", athleteId).is("mesocycle_id", null).order("start_date")) as never,
    "Lecture des cycles impossible",
  ).filter((c) => overlapsLoose(c, opts.from, opts.to));

  const cycles = [...nested, ...standalone];
  let micros: Microcycle[] = [];
  if (opts.withMicrocycles !== false && cycles.length > 0) {
    // Même ordre qu'avant : semaines des cycles rattachés, puis des autonomes.
    const read = async (ids: string[]) => ids.length === 0 ? [] : unwrapRows<Microcycle>(
      (await db().from("microcycles").select("*").in("cycle_id", ids).order("start_date")) as never,
      "Lecture des semaines impossible",
    );
    const [a, b] = await Promise.all([read(nested.map((c) => c.id)), read(standalone.map((c) => c.id))]);
    micros = [...a, ...b];
  }
  return { macrocycles: macros, mesocycles: mesos, cycles, microcycles: micros };
}

export interface CycleBrief { id: string; name: string; start_date: string; end_date: string; objective?: string | null }

/**
 * Cycles d'un athlète, par date de début croissante. Par défaut : ceux qui
 * portent son `athlete_id` ET ceux rattachés à ses mésocycles (dédoublonnés).
 * `direct: true` : seulement les premiers (plan actif de l'athlète).
 */
export async function listAthleteCycles(
  athleteId: string,
  opts: { direct?: boolean; newestFirst?: boolean } = {},
): Promise<CycleBrief[]> {
  // `newestFirst` : même ORDER BY que l'ancien choix du cycle ouvert côté
  // athlète (start_date desc) — à dates égales, le même cycle reste choisi.
  const direct = unwrapRows<CycleBrief>(
    (await db().from("cycles").select("id, name, start_date, end_date, objective")
      .eq("athlete_id", athleteId).order("start_date", { ascending: !opts.newestFirst })) as never,
    "Lecture des cycles impossible",
  );
  let nested: CycleBrief[] = [];
  if (!opts.direct) {
    const macros = unwrapRows<{ id: string }>(
      (await db().from("macrocycles").select("id").eq("athlete_id", athleteId)) as never,
      "Lecture des macrocycles impossible",
    );
    if (macros.length > 0) {
      const mesos = unwrapRows<{ id: string }>(
        (await db().from("mesocycles").select("id").in("macrocycle_id", macros.map((m) => m.id))) as never,
        "Lecture des mésocycles impossible",
      );
      if (mesos.length > 0) {
        nested = unwrapRows<CycleBrief>(
          (await db().from("cycles").select("id, name, start_date, end_date, objective")
            .in("mesocycle_id", mesos.map((m) => m.id)).order("start_date")) as never,
          "Lecture des cycles impossible",
        );
      }
    }
  }
  const seen = new Set<string>();
  return [...direct, ...nested]
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    // Tri stable : à dates égales, l'ordre renvoyé par la base est gardé.
    .sort((a, b) => (opts.newestFirst ? -1 : 1) * a.start_date.localeCompare(b.start_date));
}

/** Dernier cycle commencé (date de début la plus récente), ou `null`. */
export async function getLatestCycle(athleteId: string): Promise<CycleBrief | null> {
  const all = await listAthleteCycles(athleteId);
  return all.length > 0 ? all[all.length - 1] : null;
}

/** Macrocycle / mésocycle couvrant `today` (le plus récent s'il y en a plusieurs). */
export async function getCurrentMacrocycle(athleteId: string, today: IsoDay = localIsoDay()): Promise<Macrocycle | null> {
  const rows = unwrapRows<Macrocycle>(
    (await db().from("macrocycles").select("id, athlete_id, coach_id, name, start_date, end_date, objective")
      .eq("athlete_id", athleteId).lte("start_date", today).gte("end_date", today)
      .order("start_date", { ascending: false }).limit(1)) as never,
    "Lecture du macrocycle impossible",
  );
  return rows[0] ?? null;
}

export async function getCurrentMesocycle(macrocycleId: string, today: IsoDay = localIsoDay()): Promise<Mesocycle | null> {
  const rows = unwrapRows<Mesocycle>(
    (await db().from("mesocycles").select("id, macrocycle_id, name, objective, start_date, end_date, frequency")
      .eq("macrocycle_id", macrocycleId).lte("start_date", today).gte("end_date", today)
      .order("start_date", { ascending: false }).limit(1)) as never,
    "Lecture du mésocycle impossible",
  );
  return rows[0] ?? null;
}

/** Cycles d'un mésocycle / mésocycles d'un macrocycle, par date de début. */
export async function listMesocycleCycles(mesocycleId: string): Promise<CycleBrief[]> {
  return unwrapRows<CycleBrief>(
    (await db().from("cycles").select("id, name, start_date, end_date")
      .eq("mesocycle_id", mesocycleId).order("start_date")) as never,
    "Lecture des cycles impossible",
  );
}

export async function listMacrocycleMesocycles(macrocycleId: string): Promise<{ id: string; start_date: string; end_date: string }[]> {
  return unwrapRows<{ id: string; start_date: string; end_date: string }>(
    (await db().from("mesocycles").select("id, start_date, end_date")
      .eq("macrocycle_id", macrocycleId).order("start_date")) as never,
    "Lecture des mésocycles impossible",
  );
}

/** Semaines d'un cycle, par numéro. */
export async function listCycleMicrocycles(cycleId: string): Promise<Pick<Microcycle, "id" | "week_number" | "start_date" | "end_date">[]> {
  return unwrapRows<Pick<Microcycle, "id" | "week_number" | "start_date" | "end_date">>(
    (await db().from("microcycles").select("id, week_number, start_date, end_date")
      .eq("cycle_id", cycleId).order("week_number")) as never,
    "Lecture des semaines impossible",
  );
}

/** Semaine d'une séance (numéro + cycle), ou `null`. */
export async function getMicrocycle(id: string): Promise<{ week_number: number; cycle_id: string } | null> {
  const row = unwrap<Raw>(
    (await db().from("microcycles").select("week_number, cycle_id").eq("id", id).maybeSingle()) as never,
    "Lecture de la semaine impossible",
  );
  return row ? { week_number: Number(row.week_number), cycle_id: String(row.cycle_id) } : null;
}

export interface CycleEndingRow { id: string; athlete_id: string; name: string; start_date: string; end_date: string }

/** Cycles commencés qui finissent entre `today` et `until` (accueil coach). */
export async function listCyclesEndingSoon(athleteIds: readonly string[], today: IsoDay, until: IsoDay): Promise<CycleEndingRow[]> {
  if (athleteIds.length === 0) return [];
  const rows = unwrapRows<Raw>(
    (await db().from("cycles").select("id, athlete_id, name, start_date, end_date")
      .in("athlete_id", [...athleteIds])
      .lte("start_date", today)
      .gte("end_date", today)
      .lte("end_date", until)
      .order("end_date", { ascending: true })) as never,
    "Lecture des cycles impossible",
  );
  return rows.map((r) => ({
    id: String(r.id), athlete_id: String(r.athlete_id), name: String(r.name ?? ""),
    start_date: day(r.start_date), end_date: day(r.end_date),
  }));
}

// ── Écritures ─────────────────────────────────────────────────────────────────


export interface CycleSessionInput {
  sessionId: string;
  sessionName: string;
  /** 0 = lundi … 6 = dimanche. */
  dayOfWeek: number;
}

export interface CreatedCycle {
  cycle: Cycle;
  /** Nombre de semaines créées. */
  weeks: number;
  /** Nombre de séances posées ou rattachées. */
  sessions: number;
}

/**
 * Crée un cycle, une semaine par semaine ISO couverte et, pour chaque séance
 * donnée, une séance prévue par semaine (`lundi + dayOfWeek`). Atomique. Une
 * séance déjà RÉALISÉE ce jour-là n'est pas repassée en « prévue » (c'était le
 * cas avec l'ancien upsert de « créer un cycle depuis le bloc »).
 */
export async function createCycle(p: {
  athleteId: string;
  name: string;
  start: IsoDay;
  end: IsoDay;
  mesocycleId?: string | null;
  /** Numéro de la semaine allégée (1-based), `0`/absent = aucune. */
  deloadWeek?: number | null;
  sessions?: CycleSessionInput[];
}): Promise<CreatedCycle> {
  const res = unwrap<{ cycle: Cycle; weeks: number; sessions: number }>(
    (await db().rpc("create_cycle", {
      p_athlete: p.athleteId,
      p_name: p.name,
      p_start: p.start,
      p_end: p.end,
      p_mesocycle: p.mesocycleId ?? null,
      p_deload_week: p.deloadWeek ? p.deloadWeek : null,
      p_sessions: (p.sessions ?? []).map((s) => ({
        session_id: s.sessionId, session_name: s.sessionName, day_of_week: s.dayOfWeek,
      })),
    })) as never,
    "Création du cycle impossible",
  );
  if (!res?.cycle?.id) throw new ApiError("Création du cycle impossible", { message: "réponse vide" });
  return { cycle: res.cycle, weeks: Number(res.weeks ?? 0), sessions: Number(res.sessions ?? 0) };
}

/**
 * Nouvelles dates d'un cycle, semaines régénérées (gardées si encore
 * couvertes, renumérotées 1..n). Atomique.
 * - `mesocycleId` : `undefined` = inchangé, `null` = détacher.
 * - `dropPlanned` (défaut oui) : retire les séances prévues sans trace des
 *   semaines qui sortent. `false` : elles sont seulement détachées.
 * - `trimAfterEnd` : si la fin recule, retire les séances prévues sans trace
 *   entre la nouvelle et l'ancienne fin.
 */
export async function setCycleDates(p: {
  cycleId: string;
  start: IsoDay;
  end: IsoDay;
  mesocycleId?: string | null;
  dropPlanned?: boolean;
  trimAfterEnd?: boolean;
}): Promise<Cycle> {
  const row = unwrap<Cycle>(
    (await db().rpc("set_cycle_dates", {
      p_cycle: p.cycleId,
      p_start: p.start,
      p_end: p.end,
      p_mesocycle: p.mesocycleId ?? null,
      p_change_mesocycle: p.mesocycleId !== undefined,
      p_drop_planned: p.dropPlanned !== false,
      p_trim_after_end: p.trimAfterEnd === true,
    })) as never,
    "Modification des dates du cycle impossible",
  );
  if (!row?.id) throw new ApiError("Modification des dates du cycle impossible", { message: "réponse vide", code: "P0002" });
  return row;
}

export async function createMacrocycle(p: { athleteId: string; coachId: string; name: string; start: IsoDay; end: IsoDay }): Promise<Macrocycle> {
  const row = unwrap<Macrocycle>(
    (await db().from("macrocycles").insert({
      athlete_id: p.athleteId, coach_id: p.coachId, name: p.name, start_date: p.start, end_date: p.end,
    }).select("*").single()) as never,
    "Création du macrocycle impossible",
  );
  return row!;
}

export async function createMesocycle(p: { macrocycleId: string; name: string; start: IsoDay; end: IsoDay }): Promise<Mesocycle> {
  const row = unwrap<Mesocycle>(
    (await db().from("mesocycles").insert({
      macrocycle_id: p.macrocycleId, name: p.name, start_date: p.start, end_date: p.end,
    }).select("*").single()) as never,
    "Création du mésocycle impossible",
  );
  return row!;
}

export async function createMicrocycle(p: { cycleId: string; weekNumber: number; start: IsoDay; end: IsoDay; isDeload: boolean }): Promise<void> {
  check(
    await db().from("microcycles").insert({
      cycle_id: p.cycleId, week_number: p.weekNumber, start_date: p.start, end_date: p.end, is_deload: p.isDeload,
    }),
    "Création de la semaine impossible",
  );
}

/** Champs modifiables directement (hors dates d'un cycle : `setCycleDates`). */
export interface PeriodPatch {
  name?: string;
  objective?: string | null;
  start_date?: IsoDay;
  end_date?: IsoDay;
  macrocycle_id?: string;
  mesocycle_id?: string | null;
  volume_config?: unknown;
  intensity_config?: unknown;
  frequency?: number | null;
  deload_week?: number | null;
  is_deload?: boolean;
}

/**
 * Modifie une période (nom, objectif, dates sans régénération des semaines,
 * parent, réglages du méso, semaine allégée).
 */
export async function updatePeriod(level: PeriodLevel, id: string, patch: PeriodPatch): Promise<void> {
  check(
    await db().from(level as never).update(patch as never).eq("id", id),
    "Modification impossible",
  );
}

/**
 * Supprime un cycle (ses semaines suivent, clé étrangère). `removePlanned` :
 * retire d'abord les séances prévues sans trace de ses semaines ; les séances
 * réelles restent, détachées. Sans `removePlanned`, toutes ses séances restent
 * (détachées), comme le faisait la frise.
 */
export async function deleteCycle(cycleId: string, opts: { removePlanned?: boolean } = {}): Promise<void> {
  if (opts.removePlanned) {
    const micros = unwrapRows<{ id: string }>(
      (await db().from("microcycles").select("id").eq("cycle_id", cycleId)) as never,
      "Lecture des semaines impossible",
    );
    await deletePlannedWorkouts({ microcycleIds: micros.map((m) => m.id) });
  }
  check(await db().from("cycles").delete().eq("id", cycleId), "Suppression du cycle impossible");
}

/**
 * Supprime un macrocycle / mésocycle / semaine ; les niveaux inférieurs
 * suivent (clés étrangères en cascade), les séances restent (détachées).
 */
export async function deletePeriod(level: Exclude<PeriodLevel, "cycles">, id: string): Promise<void> {
  check(await db().from(level).delete().eq("id", id), "Suppression impossible");
}

// ── Invalidation : LA seule liste ─────────────────────────────────────────────

/** Requêtes qui lisent la périodisation d'un athlète (id dans la clé). */
const ATHLETE_SCOPED = new Set<string>([
  "timeline-data", "planning-summary", "athlete-cycles", "assistant-last-cycle", "historique",
  "cycle-sessions", "micro-days", "micro-stats", "calendar-events", "cal", "activePlan",
  "workout-logs-week",
]);
/** Requêtes de périodisation sans id d'athlète dans la clé : toujours invalidées. */
const GLOBAL = new Set<string>([
  "active-cycle", "athlete-cycles-list", "cal-range", "microcycle", "microcycles-nav",
]);

function keyHas(key: unknown, needle: string): boolean {
  if (key === needle) return true;
  if (Array.isArray(key)) return key.some((k) => keyHas(k, needle));
  return false;
}

/**
 * Rafraîchit tout ce qui affiche la périodisation d'un athlète (frise,
 * résumé, listes de cycles, assistant, historique, plan actif, accueil coach)
 * ET ses séances (une opération de planification en pose ou en retire).
 */
export function invalidateCycles(qc: QueryClient, athleteId: string): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({
      predicate: (q: Query) => {
        const head = q.queryKey[0];
        if (typeof head !== "string") return false;
        if (GLOBAL.has(head)) return true;
        return ATHLETE_SCOPED.has(head) && keyHas(q.queryKey, athleteId);
      },
    }),
    invalidateWorkouts(qc, { athleteId }),
  ]).then(() => undefined);
}
