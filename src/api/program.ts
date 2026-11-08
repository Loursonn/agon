import type { QueryClient } from "@tanstack/react-query";
import type { Bloc, ProgSession } from "@/features/coach/components/programmation/types";
import { planDayChange } from "@/lib/planningProjection";
import { localIsoDay, type IsoDay } from "@shared/domain/dates";
import { ApiError, check, db, unwrap, unwrapRows } from "./client";

/**
 * Programme de musculation et banques du coach.
 *
 * Stockage inchangé (`app_data`, lu et écrit aussi par coach-api) :
 * - `asp:prog` (clé de l'athlète) : `ProgSession[]`. Écrit UNIQUEMENT par
 *   `saveProgram` / `addProgramSessions`, via la RPC `program_save_sessions`
 *   (migration 20261109110000) : seules les séances changées partent, et une
 *   séance modifiée ailleurs entre-temps (co-coach, assistant) n'est jamais
 *   écrasée — refus `isProgramConflict`, l'écran recharge.
 * - `asp:session-bank` / `asp:bloc-bank` (clés sur l'id du coach) : banques
 *   privées du coach. Un seul auteur, un seul objet : upsert direct.
 *
 * Les lectures lèvent en cas d'erreur ; `[]` seulement si rien n'a été écrit.
 */

export type { Bloc, ProgSession };

const PROG_KEY = "asp:prog";
const SESSION_BANK_KEY = "asp:session-bank";
const BLOC_BANK_KEY = "asp:bloc-bank";

// ── Clés React Query ─────────────────────────────────────────────────────────

/** Préfixe `['program', id]` : id de l'athlète (programme) ou du coach (banques). */
export const programKeys = {
  all: (ownerId: string) => ["program", ownerId] as const,
  sessions: (athleteId: string) => ["program", athleteId, "sessions"] as const,
  sessionBank: (coachId: string) => ["program", coachId, "session-bank"] as const,
  blocBank: (coachId: string) => ["program", coachId, "bloc-bank"] as const,
};

/**
 * Clés des cycles lus par l'écran Programmation. Elles appartiennent au
 * planning (invalidées par la frise, les tiroirs de cycle et coach-api) :
 * gardées telles quelles tant que le planning n'a pas son module.
 */
export const programCycleKeys = {
  list: (athleteId: string) => ["athlete-cycles-list", athleteId] as const,
  weeks: (cycleId: string) => ["microcycles-nav", cycleId] as const,
};

/** Tout ce qui lit le programme d'un athlète : programme, banques (coach-athlète), Retours. */
export function invalidateProgram(qc: QueryClient, ownerId: string): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: programKeys.all(ownerId) }),
    qc.invalidateQueries({ queryKey: ["weeklyRetours", ownerId] }),
    qc.invalidateQueries({ queryKey: ["monthlyRetours", ownerId] }),
  ]).then(() => undefined);
}

// ── Lectures ─────────────────────────────────────────────────────────────────

async function readArray<T>(ownerId: string, key: string, what: string): Promise<T[]> {
  const row = unwrap(
    await db().from("app_data").select("value").eq("athlete_id", ownerId).eq("key", key).maybeSingle(),
    what,
  );
  const v = row?.value ?? null;
  if (v === null) return [];
  if (!Array.isArray(v)) throw new ApiError(what, { message: "valeur inattendue" });
  return v as unknown as T[];
}

/** Séances du programme de l'athlète (ordre du coach). */
export function getProgram(athleteId: string): Promise<ProgSession[]> {
  return readArray<ProgSession>(athleteId, PROG_KEY, "Programmation non chargée");
}

export function getSessionBank(coachId: string): Promise<ProgSession[]> {
  return readArray<ProgSession>(coachId, SESSION_BANK_KEY, "Banque de séances non chargée");
}

export function getBlocBank(coachId: string): Promise<Bloc[]> {
  return readArray<Bloc>(coachId, BLOC_BANK_KEY, "Banque de blocs non chargée");
}

// ── Écriture du programme ────────────────────────────────────────────────────

/** Ce qui part à la RPC : les séances changées, et leur version lue. */
export interface ProgramDiff {
  upsert: ProgSession[];
  /** id → séance telle que lue, pour chaque séance modifiée ou supprimée. */
  base: Record<string, ProgSession>;
  remove: string[];
  /** Nouvel ordre ; null = inchangé (ou inconnu). */
  order: string[] | null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Différence entre le programme lu (`base`, le cache) et celui voulu (`next`).
 * `base` absent (lecture jamais aboutie) : tout est envoyé comme création,
 * rien n'est supprimé ni réordonné — la RPC refuse alors d'écraser une séance
 * existante différente au lieu de réécrire le programme. `null` = rien à faire.
 */
export function diffProgram(base: ProgSession[] | undefined, next: ProgSession[]): ProgramDiff | null {
  const ids = next.map((s) => s.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new ApiError("Enregistrement du programme impossible", { message: "séance sans identifiant ou en double" });
  }
  const before = new Map((base ?? []).map((s) => [s.id, s]));
  const out: ProgramDiff = { upsert: [], base: {}, remove: [], order: null };
  for (const s of next) {
    const old = before.get(s.id);
    if (old && same(old, s)) continue;
    out.upsert.push(s);
    if (old) out.base[s.id] = old;
  }
  if (base) {
    const kept = new Set(ids);
    for (const s of base) {
      if (kept.has(s.id)) continue;
      out.remove.push(s.id);
      out.base[s.id] = s;
    }
    const baseOrder = base.map((s) => s.id).filter((id) => kept.has(id));
    const nextOrder = ids.filter((id) => before.has(id));
    if (!same(baseOrder, nextOrder)) out.order = ids;
  }
  if (out.upsert.length === 0 && out.remove.length === 0 && out.order === null) return null;
  return out;
}

/** SQLSTATE renvoyé quand une séance a changé ailleurs depuis la lecture. */
export const PROGRAM_CONFLICT = "40001";
export const isProgramConflict = (e: unknown) => e instanceof ApiError && e.code === PROGRAM_CONFLICT;

type UntypedRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{
  data: unknown;
  error: { message: string; code?: string } | null;
}>;

async function saveSessions(athleteId: string, d: ProgramDiff): Promise<ProgSession[]> {
  // `program_save_sessions` n'est pas encore dans les types générés (migration 20261109110000).
  const client = db() as unknown as { rpc: UntypedRpc };
  const saved = unwrap(
    await client.rpc("program_save_sessions", {
      p_athlete: athleteId,
      p_upsert: d.upsert,
      p_base: d.base,
      p_remove: d.remove,
      p_order: d.order,
    }),
    "Enregistrement du programme impossible",
  );
  if (!Array.isArray(saved)) throw new ApiError("Enregistrement du programme impossible", { message: "réponse inattendue" });
  return saved as ProgSession[];
}

/**
 * Enregistre le programme voulu (`next`) à partir de celui lu (`base`) : seules
 * les séances changées partent. Renvoie le programme tel qu'enregistré (avec
 * ce que d'autres ont ajouté entre-temps). Lève `isProgramConflict` si une
 * séance touchée a été modifiée ailleurs.
 */
export async function saveProgram(athleteId: string, base: ProgSession[] | undefined, next: ProgSession[]): Promise<ProgSession[]> {
  const d = diffProgram(base, next);
  if (!d) return next;
  return saveSessions(athleteId, d);
}

/** Ajoute des séances à la fin du programme d'un athlète, sans relire ni réécrire le reste. */
export function addProgramSessions(athleteId: string, sessions: ProgSession[]): Promise<ProgSession[]> {
  return saveSessions(athleteId, { upsert: sessions, base: {}, remove: [], order: null });
}

/**
 * Clone profond avec nouveaux ids (séance, blocs, exercices) : aucune
 * collision avec les workout_logs / le glisser-déposer de l'athlète source.
 */
export function cloneProgSession(session: ProgSession, newId: () => string = () => crypto.randomUUID()): ProgSession {
  return {
    ...session,
    id: newId(),
    blocs: session.blocs.map((b) => ({
      ...b,
      id: newId(),
      exercices: b.exercices.map((e) => ({ ...e, id: newId() })),
    })),
  };
}

// ── Banques du coach ─────────────────────────────────────────────────────────

export async function saveSessionBank(coachId: string, sessions: ProgSession[]): Promise<void> {
  check(
    await db().from("app_data").upsert({ athlete_id: coachId, key: SESSION_BANK_KEY, value: sessions as never }),
    "Enregistrement de la banque de séances impossible",
  );
}

export async function saveBlocBank(coachId: string, blocs: Bloc[]): Promise<void> {
  check(
    await db().from("app_data").upsert({ athlete_id: coachId, key: BLOC_BANK_KEY, value: blocs as never }),
    "Enregistrement de la banque de blocs impossible",
  );
}

// ── Cycles (lecture, pour l'écran Programmation) ─────────────────────────────

export interface CycleLite {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

/** Tous les cycles de l'athlète (passés, en cours, futurs), du plus ancien au plus récent. */
export async function listAthleteCycles(athleteId: string): Promise<CycleLite[]> {
  return unwrapRows(
    await db().from("cycles").select("id, name, start_date, end_date").eq("athlete_id", athleteId).order("start_date", { ascending: true }),
    "Cycles non chargés",
  ) as CycleLite[];
}

export interface CycleWeek {
  id: string;
  start_date: string;
  end_date: string;
}

/** Semaines (microcycles) d'un cycle, dans l'ordre. */
export async function listCycleWeeks(cycleId: string): Promise<CycleWeek[]> {
  return unwrapRows(
    await db().from("microcycles").select("id, start_date, end_date").eq("cycle_id", cycleId).order("start_date"),
    "Semaines du cycle non chargées",
  ) as CycleWeek[];
}

// ── Jour d'une séance ────────────────────────────────────────────────────────

/**
 * Le coach change le jour d'une séance du programme : ses occurrences à venir
 * suivent (même semaine, nouveau jour). Les séances déplacées par l'athlète et
 * celles déjà faites gardent leur date (`planDayChange`).
 * `null` : aucune occurrence à venir, rien n'a bougé.
 */
export async function rescheduleSessionDay(p: {
  athleteId: string;
  sessionId: string;
  /** 0 = lundi … 6 = dimanche. */
  newDay: number;
  today?: IsoDay;
}): Promise<{ moved: number; failed: number; keptByAthlete: number } | null> {
  const logs = unwrapRows(
    await db()
      .from("workout_logs")
      .select("id, status, rescheduled_by_athlete, microcycle_id, microcycles(start_date)")
      .eq("athlete_id", p.athleteId)
      .eq("session_id", p.sessionId)
      .gte("scheduled_date", p.today ?? localIsoDay()),
    "Séances à venir non chargées",
  ) as unknown as { id: string; status: string; rescheduled_by_athlete: boolean | null; microcycles: { start_date: string } | null }[];
  if (logs.length === 0) return null;

  const { updates, keptByAthlete } = planDayChange(
    logs.map((l) => ({
      id: l.id,
      status: l.status,
      rescheduled_by_athlete: !!l.rescheduled_by_athlete,
      week_start: l.microcycles?.start_date ?? null,
    })),
    p.newDay,
  );
  // Une par une : une date déjà prise (conflit d'unicité) n'empêche pas les autres.
  const results = await Promise.all(
    updates.map((u) => db().from("workout_logs").update({ scheduled_date: u.scheduled_date }).eq("id", u.id)),
  );
  const failed = results.filter((r) => r.error).length;
  return { moved: updates.length - failed, failed, keptByAthlete };
}
