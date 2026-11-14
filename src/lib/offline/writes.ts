/**
 * Écritures athlète gardées sur le téléphone sans réseau (hors ligne phase 2).
 *
 * Seules ces saisies passent par la file : fin de séance muscu, RPE, saisie
 * des séries, séance énergie, wellness, nutrition, pesée. Chacune appelle une
 * RPC idempotente (même jour / même séance = même résultat), donc la rejouer
 * au retour du réseau ne double rien. Une séance déplacée par le coach garde
 * son id : la saisie s'y enregistre, fusionnée avec l'adaptation du coach.
 * Une séance supprimée (P0002) : saisie abandonnée, l'athlète est prévenu.
 *
 * Séance libre démarrée sans réseau (`workout.plan`) : id choisi sur le
 * téléphone, création rejouable (`planWorkout` avec id). Mise en file AVANT
 * les saisies de cette séance ; si le serveur avait déjà une séance à cette
 * place (même séance-type, même jour), les saisies suivantes sont redirigées
 * vers elle (`cascade`). Création refusée : ses saisies sont retirées avec elle.
 *
 * Après l'envoi depuis la file (`onSent`) : brouillon local des séries marqué
 * synchronisé, records de la séance calculés (comme une validation en direct).
 *
 * Plusieurs onglets : la file stockée fait foi, modifiée sous `navigator.locks`
 * et annoncée aux autres onglets par `BroadcastChannel` (voir `writeQueue.ts`).
 *
 * Appel : `submitWrite(kind, args)` → `{ status: "sent", result }` ou
 * `{ status: "queued" }` (l'écran garde la saisie et affiche « en attente »).
 * Lève seulement un refus définitif du serveur.
 */
import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { createStore, del, get, set, type UseStore } from "idb-keyval";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { IsoDay } from "@shared/domain/dates";
import type { NutritionDailyLog } from "@shared/domain/nutrition";
import type { RecordSet } from "@shared/domain/performance";
import { writeAppData } from "@/api/appData";
import { db } from "@/api/client";
import { completeEnergyAssignment, setEnergyRpe, type CompleteEnergyInput } from "@/api/energy";
import { saveDay } from "@/api/nutrition";
import { computeRecordsFromSession, invalidateRecords } from "@/api/records";
import { saveWeight } from "@/api/profile";
import { saveWellnessForm } from "@/api/wellness";
import {
  completeWorkout, currentAccessToken, patchWorkoutEntries, planWorkout, setWorkoutRpe, type WorkoutLog,
} from "@/api/workouts";
import { markDraftSynced, workoutDraftKey } from "@/lib/localDraft";
import { readStoredAuthUserId } from "./offlineCache";
import { newRecordsMessage } from "./sessionRecords";
import {
  createWriteQueue, isPermanentCode,
  type QueueBus, type QueueCascade, type QueueLock, type SubmitResult, type WriteOp, type WriteQueue, type WriteQueueStore,
} from "./writeQueue";

export interface WriteArgs {
  /**
   * Séance libre créée sans réseau : `logId` choisi sur le téléphone
   * (`crypto.randomUUID()`), création rejouable sans doublon.
   */
  "workout.plan": {
    athleteId: string; logId: string; coachId: string | null;
    sessionId: string; sessionName: string; date: IsoDay;
  };
  /**
   * `draftLogId` : id de la séance tel que l'écran le connaît (brouillon local),
   * gardé quand une séance libre a reçu l'id d'une séance déjà en base.
   */
  "workout.entries": { athleteId: string; logId: string; patch: object; draftLogId?: string };
  "workout.complete": {
    athleteId: string; logId: string; mods?: object | null; runKm?: number | null; rpe?: number | null;
    draftLogId?: string;
    /** Séries faites rattachées à un record, préparées à la validation (records calculés à l'envoi). */
    recordSets?: RecordSet[];
    /** Jour de la validation (date des records), pas celui de l'envoi. */
    recordDay?: IsoDay;
  };
  "workout.rpe": { athleteId: string; logId: string; rpe: number | null };
  "energy.complete": { athleteId: string; id: string; input: CompleteEnergyInput };
  "energy.rpe": { athleteId: string; id: string; rpe: number | null };
  "wellness.day": { athleteId: string; day: IsoDay; form: unknown };
  "nutrition.day": { athleteId: string; day: IsoDay; log: NutritionDailyLog };
  "weight.day": { athleteId: string; day: IsoDay; kg: number };
  /**
   * Liste complète des activités libres (`asp:freesess`, écrite par l'athlète
   * seul) : la plus récente remplace, comme l'écriture directe d'avant, mais
   * gardée sur le téléphone sans réseau au lieu d'être perdue.
   */
  "freeSessions.set": { athleteId: string; sessions: unknown[] };
}
export type WriteKind = keyof WriteArgs;

/** Exécutant de chaque saisie (exporté pour les tests de scénario). */
export const EXECUTORS: { [K in WriteKind]: (a: WriteArgs[K]) => Promise<unknown> } = {
  "workout.plan": (a) => planWorkout({
    id: a.logId, athleteId: a.athleteId, coachId: a.coachId, sessionId: a.sessionId,
    sessionName: a.sessionName, date: a.date, byAthlete: true,
  }),
  "workout.entries": (a) => patchWorkoutEntries(a.logId, a.patch),
  "workout.complete": (a) => completeWorkout({ logId: a.logId, mods: a.mods, runKm: a.runKm, rpe: a.rpe }),
  "workout.rpe": (a) => setWorkoutRpe(a.logId, a.rpe),
  "energy.complete": (a) => completeEnergyAssignment(a.id, a.input),
  "energy.rpe": (a) => setEnergyRpe(a.id, a.rpe),
  "wellness.day": (a) => saveWellnessForm(a.athleteId, a.form, a.day),
  "nutrition.day": (a) => saveDay(a.athleteId, a.day, a.log),
  "weight.day": (a) => saveWeight(a.athleteId, a.day, a.kg),
  "freeSessions.set": (a) => writeAppData(a.athleteId, "asp:freesess", a.sessions),
};

/**
 * Deux validations énergie de la même séance : fusion comme la RPC (un champ
 * vide garde la valeur précédente, blocs fusionnés bloc par bloc). Sinon une
 * 2ᵉ validation sans saisie (aperçu Programme) effacerait la première.
 * Les autres saisies sont complètes : la plus récente remplace.
 */
export function mergeWriteArgs(kind: string, prev: unknown, next: unknown): unknown {
  if (kind !== "energy.complete") return next;
  const p = prev as WriteArgs["energy.complete"];
  const n = next as WriteArgs["energy.complete"];
  const input: CompleteEnergyInput = { ...p.input };
  for (const [k, v] of Object.entries(n.input) as [keyof CompleteEnergyInput, unknown][]) {
    if (k === "block_logs" || v == null || (typeof v === "string" && v.trim() === "")) continue;
    (input as Record<string, unknown>)[k] = v;
  }
  if (n.input.block_logs) input.block_logs = { ...(p.input.block_logs ?? {}), ...n.input.block_logs };
  return { ...n, input };
}

/** Une cible = une clé : deux saisies de même clé n'en font qu'une (la dernière). */
export function writeKey<K extends WriteKind>(kind: K, args: WriteArgs[K]): string {
  const a = args as Record<string, unknown>;
  const target = (a.logId ?? a.id ?? (a.day !== undefined ? `${a.athleteId}:${a.day}` : a.athleteId)) as string;
  return `${kind}:${target}`;
}

// [libellé, féminin ?] pour accorder « non enregistré(e) ».
const LABELS: Record<WriteKind, [string, boolean]> = {
  "workout.plan": ["Séance ajoutée", true],
  "workout.entries": ["Saisie de séance", true],
  "workout.complete": ["Fin de séance", true],
  "workout.rpe": ["RPE de séance", false],
  "energy.complete": ["Séance énergie", true],
  "energy.rpe": ["RPE de séance énergie", false],
  "wellness.day": ["Wellness", false],
  "nutrition.day": ["Nutrition", true],
  "weight.day": ["Pesée", true],
  "freeSessions.set": ["Activité libre", true],
};

/** Toast quand une saisie part en file d'attente (même texte partout). */
export const QUEUED_TOAST = "Pas de réseau : saisie gardée sur le téléphone, envoi automatique au retour du réseau.";

/** Toast « saisie gardée » : un seul à l'écran même si plusieurs saisies partent en file. */
export function notifyQueued(): void {
  toast.info(QUEUED_TOAST, { id: "write-queued" });
}

/** Message affiché quand une saisie gardée est refusée au retour du réseau. */
export function droppedMessage(kind: string, error: unknown): string {
  const [label, fem] = LABELS[kind as WriteKind] ?? ["Une saisie", true];
  const saved = fem ? "non enregistrée" : "non enregistré";
  const code = (error as { code?: string } | null)?.code;
  if (code === "P0002" && (kind.startsWith("workout.") || kind.startsWith("energy."))) {
    return `${label} ${saved} : la séance n'existe plus (ton coach l'a retirée).`;
  }
  if (code && isPermanentCode(code)) return `${label} ${saved} : le serveur l'a ${fem ? "refusée" : "refusé"}.`;
  return `${label} ${saved} : envoi impossible après plusieurs essais.`;
}

// ── Stockage IndexedDB (mémoire si indisponible : navigation privée…) ────────

let idbStore: UseStore | null = null;
let idbFailed = false;
const memory = new Map<string, WriteOp[]>();

/**
 * false = IndexedDB indisponible (navigation privée…) : la file ne vit qu'en
 * mémoire et serait perdue au rechargement. Les écrans gardent alors leur
 * brouillon local comme filet.
 */
export function queueIsDurable(): boolean {
  return !idbFailed && idb() !== null;
}

function idb(): UseStore | null {
  if (idbStore) return idbStore;
  try {
    idbStore = typeof indexedDB !== "undefined" ? createStore("agon-writes", "ops") : null;
  } catch {
    idbStore = null;
  }
  return idbStore;
}

const store: WriteQueueStore = {
  async get(userId) {
    const s = idb();
    // Dernière écriture IndexedDB ratée : la mémoire est plus récente.
    if (!s || idbFailed) return memory.get(userId) ?? [];
    try { return ((await get<WriteOp[]>(userId, s)) ?? []).filter((o) => o && typeof o.kind === "string"); }
    catch { return memory.get(userId) ?? []; }
  },
  async set(userId, ops) {
    memory.set(userId, ops);
    const s = idb();
    if (!s) return;
    try {
      await (ops.length ? set(userId, ops, s) : del(userId, s));
      idbFailed = false;
    } catch (e) {
      // Quota, connexion IndexedDB perdue (Safari) : la file reste en mémoire,
      // les écrans gardent leur brouillon (`queueIsDurable()`).
      idbFailed = true;
      console.error("[writes] stockage local", e);
    }
  },
};

// ── Plusieurs onglets ────────────────────────────────────────────────────────

/** `navigator.locks` (Safari ≥ 15.4) ; sans lui, relire-fusionner réduit déjà la fenêtre. */
const lock: QueueLock | undefined =
  typeof navigator !== "undefined" && navigator.locks?.request
    ? (name, fn) => navigator.locks.request(name, fn)
    : undefined;

function createBus(): QueueBus | undefined {
  if (typeof BroadcastChannel === "undefined") return undefined;
  try {
    const ch = new BroadcastChannel("agon-writes");
    return {
      post: (userId) => { try { ch.postMessage({ userId }); } catch { /* onglet en fermeture */ } },
      subscribe: (cb) => {
        const on = (e: MessageEvent) => { const u = (e.data as { userId?: unknown } | null)?.userId; if (typeof u === "string") cb(u); };
        ch.addEventListener("message", on);
        return () => ch.removeEventListener("message", on);
      },
    };
  } catch {
    return undefined;
  }
}

// ── Suites d'un envoi depuis la file ─────────────────────────────────────────

// Séance libre créée hors ligne que le serveur a fusionnée avec une séance
// existante : id local → id serveur, gardé sur l'appareil (l'écran ouvert sur
// l'id local continue d'écrire au bon endroit, même après rechargement).
const ALIAS_KEY = "agon:workout-id-alias";

function readAliases(): Record<string, string> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(ALIAS_KEY) : null;
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function rememberIdAlias(localId: string, serverId: string): void {
  try {
    localStorage.setItem(ALIAS_KEY, JSON.stringify({ ...readAliases(), [localId]: serverId }));
  } catch {
    /* stockage bloqué : seules les saisies déjà en file sont redirigées */
  }
}

/** Id réel d'une séance (id local remplacé par celui du serveur si besoin). */
export function resolveWorkoutId(id: string): string {
  return readAliases()[id] ?? id;
}

const argLogId = (o: WriteOp): string | undefined => (o.args as { logId?: unknown } | null)?.logId as string | undefined;

/**
 * Séance libre envoyée : si le serveur en avait déjà une à cette place, les
 * saisies suivantes de la séance locale vont vers elle (même clé, même
 * cible). Refusée : ses saisies ne peuvent plus aboutir, elles sont retirées
 * avec elle (un seul message, celui de la séance).
 */
export const workoutPlanCascade: QueueCascade<WriteKind> = (op, outcome) => {
  if (op.kind !== "workout.plan") return null;
  const localId = (op.args as WriteArgs["workout.plan"]).logId;
  if (!outcome.ok) return (o) => (argLogId(o) === localId ? null : o);
  const serverId = (outcome.result as WorkoutLog | null)?.id;
  if (!serverId || serverId === localId) return null;
  // L'écran peut rester sur l'id local : les saisies suivantes suivront.
  rememberIdAlias(localId, serverId);
  return (o) => {
    if (o.kind === "workout.plan" || argLogId(o) !== localId) return o;
    const prev = o.args as { logId: string; draftLogId?: string };
    const args = { ...prev, logId: serverId, draftLogId: prev.draftLogId ?? localId };
    return { ...o, args, key: writeKey(o.kind, args as never) };
  };
};

/**
 * Brouillon local des séries : « synchronisé » une fois la saisie partie de la
 * file, s'il n'a pas changé depuis (`markDraftSynced` compare la valeur).
 */
export function markSentDraft(kind: string, args: unknown): void {
  if (kind !== "workout.entries" && kind !== "workout.complete") return;
  const a = args as { athleteId?: string; logId?: string; draftLogId?: string; patch?: object; mods?: object | null };
  const value = kind === "workout.entries" ? a.patch : a.mods;
  const id = a.draftLogId ?? a.logId;
  if (!a.athleteId || !id || !value) return;
  markDraftSynced(workoutDraftKey(a.athleteId, id), value);
}

/**
 * Validation partie de la file : records calculés comme en direct (relecture
 * des records actuels au moment de l'envoi). Le toast « nouveau record »
 * s'affiche quel que soit l'écran ouvert (les toasts sont globaux) : c'est
 * la seule façon pour l'athlète de l'apprendre. Best effort : une erreur ici
 * ne remet pas en cause la validation, déjà enregistrée.
 */
async function recordsAfterQueuedCompletion(a: WriteArgs["workout.complete"]): Promise<void> {
  if (!a.athleteId || !a.recordSets?.length) return;
  try {
    const found = await computeRecordsFromSession(a.athleteId, a.recordSets, a.recordDay ? { date: a.recordDay } : {});
    if (found.length === 0) return;
    if (queryClient) void invalidateRecords(queryClient, a.athleteId);
    toast.success(newRecordsMessage(found));
  } catch (e) {
    console.error("[writes] records après envoi", e);
  }
}

function onQueuedSent(op: WriteOp<WriteKind>): void {
  markSentDraft(op.kind, op.args);
  if (op.kind === "workout.complete") void recordsAfterQueuedCompletion(op.args as WriteArgs["workout.complete"]);
}

// ── File unique de l'app ─────────────────────────────────────────────────────

let queue: WriteQueue<WriteKind> | null = null;
let queryClient: QueryClient | null = null;

function isOnline(): boolean {
  return onlineManager.isOnline() && (typeof navigator === "undefined" || navigator.onLine !== false);
}

function safeLocalStorage(): Storage | null {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}

function getQueue(): WriteQueue<WriteKind> {
  if (!queue) {
    queue = createWriteQueue<WriteKind>({
      store,
      executors: EXECUTORS as Record<WriteKind, (a: never) => Promise<unknown>>,
      isOnline,
      merge: mergeWriteArgs,
      lock,
      bus: createBus(),
      cascade: workoutPlanCascade,
      onSent: onQueuedSent,
      // Jeton valide (rafraîchi si besoin) avant de rejouer : sinon refus « droits ».
      ready: async () => !!(await currentAccessToken()),
      // Rafraîchit les écrans une fois la file vidée (avant, l'écran garde la
      // saisie locale le temps que tout parte).
      onFlushed: () => {
        if (queue && queue.pending() === 0) void queryClient?.invalidateQueries();
      },
      onDropped: (op, e) => {
        console.error("[writes] saisie abandonnée", op.kind, e);
        toast.error(droppedMessage(op.kind, e), { duration: 8000 });
        // L'écran montrait la saisie comme faite : on relit le serveur.
        void queryClient?.invalidateQueries();
      },
    });
  }
  return queue;
}

/**
 * Envoie la saisie, ou la garde sur le téléphone sans réseau.
 * Lève seulement un refus définitif (séance retirée, saisie invalide).
 */
export function submitWrite<K extends WriteKind>(kind: K, args: WriteArgs[K]): Promise<SubmitResult> {
  const w = prepareWrite(kind, args);
  return getQueue().submit(kind, w.key, w.args);
}

/**
 * Clé et arguments d'une saisie avant mise en file : une séance libre déjà
 * fusionnée par le serveur avec une autre (id local → id serveur) reçoit ses
 * saisies sur l'id serveur, le brouillon reste sous l'id local.
 */
export function prepareWrite<K extends WriteKind>(kind: K, args: WriteArgs[K]): { key: string; args: WriteArgs[K] } {
  let a = args;
  const logId = (args as { logId?: unknown }).logId;
  if (kind !== "workout.plan" && typeof logId === "string") {
    const real = resolveWorkoutId(logId);
    if (real !== logId) {
      const prev = args as unknown as { draftLogId?: string };
      a = { ...args, logId: real, draftLogId: prev.draftLogId ?? logId } as WriteArgs[K];
    }
  }
  return { key: writeKey(kind, a), args: a };
}

/** Saisies en attente d'envoi pour l'utilisateur connecté. */
export function pendingWrites(): number {
  return queue?.pending() ?? 0;
}

export function usePendingWrites(): number {
  return useSyncExternalStore(
    (cb) => getQueue().subscribe(cb),
    () => getQueue().pending(),
    () => 0,
  );
}

/**
 * Une saisie de cette séance / ce jour attend-elle encore le réseau ?
 * (`target` = id de séance, ou `athleteId:jour`.)
 */
export function hasPendingWrite(target: string, kinds?: readonly WriteKind[]): boolean {
  return (queue?.keys() ?? []).some((k) => {
    const i = k.indexOf(":");
    return k.slice(i + 1) === target && (!kinds || kinds.includes(k.slice(0, i) as WriteKind));
  });
}

export const PENDING_WRITE_CODE = "PENDING_WRITE";

/**
 * Annuler une validation qui n'est pas encore partie : refusé (sinon la file
 * revaliderait la séance juste après). Lève une erreur `PENDING_WRITE`.
 */
export function assertNoPendingValidation(target: string): void {
  if (hasPendingWrite(target, ["workout.complete", "workout.rpe", "energy.complete", "energy.rpe"])) {
    throw Object.assign(new Error(PENDING_VALIDATION_MESSAGE), { code: PENDING_WRITE_CODE });
  }
}

export const PENDING_VALIDATION_MESSAGE = "Validation pas encore envoyée : attends le retour du réseau pour l'annuler.";

export const isPendingWriteError = (e: unknown) => (e as { code?: string } | null)?.code === PENDING_WRITE_CODE;

/**
 * Déconnexion : les saisies non envoyées de CE compte sont effacées (après
 * confirmation). Celles d'un autre compte du téléphone restent à lui.
 */
export async function clearPendingWrites(): Promise<void> {
  await getQueue().clearCurrent();
}

/** « 3 saisies en attente d'envoi » */
export function pendingLabel(n: number): string {
  return n > 1 ? `${n} saisies en attente d'envoi` : "1 saisie en attente d'envoi";
}

/** Texte de confirmation de déconnexion, ou null si rien n'attend. */
export function logoutWarning(n = pendingWrites()): string | null {
  if (n <= 0) return null;
  const s = n > 1 ? "s" : "";
  return `${n} saisie${s} pas encore envoyée${s} ${n > 1 ? "seront perdues" : "sera perdue"}. Se déconnecter quand même ?`;
}

let started = false;

/**
 * À appeler une fois au démarrage : suit l'utilisateur, renvoie les saisies
 * au retour du réseau / au retour sur l'app / toutes les 30 s s'il en reste,
 * puis rafraîchit les écrans.
 */
export function startWriteQueue(qc: QueryClient): void {
  if (started) return;
  started = true;
  queryClient = qc;
  const q = getQueue();
  const flush = () => q.flush();

  const stored = readStoredAuthUserId(safeLocalStorage(), import.meta.env.VITE_SUPABASE_URL);
  if (stored) void q.setUser(stored).then(flush);

  try {
    db().auth.onAuthStateChange((event, session) => {
      const id = session?.user?.id;
      // Hors ligne, INITIAL_SESSION peut arriver sans session alors qu'elle
      // existe encore : on ne change d'utilisateur que sur un id connu.
      if (event === "SIGNED_OUT") void q.setUser(null);
      else if (id) void q.setUser(id).then(flush);
    });
  } catch (e) {
    console.error("[writes] abonnement auth", e);
  }

  onlineManager.subscribe((online) => { if (online) void flush(); });
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => void flush());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void flush();
    });
    window.setInterval(() => { if (q.pending() > 0) void flush(); }, 30_000);
  }
}
