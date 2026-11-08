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
import { db } from "@/api/client";
import { completeEnergyAssignment, setEnergyRpe, type CompleteEnergyInput } from "@/api/energy";
import { saveDay } from "@/api/nutrition";
import { saveWeight } from "@/api/profile";
import { saveWellnessForm } from "@/api/wellness";
import { completeWorkout, currentAccessToken, patchWorkoutEntries, setWorkoutRpe } from "@/api/workouts";
import { readStoredAuthUserId } from "./offlineCache";
import {
  createWriteQueue, isPermanentCode, type SubmitResult, type WriteOp, type WriteQueue, type WriteQueueStore,
} from "./writeQueue";

export interface WriteArgs {
  "workout.entries": { athleteId: string; logId: string; patch: object };
  "workout.complete": { athleteId: string; logId: string; mods?: object | null; runKm?: number | null; rpe?: number | null };
  "workout.rpe": { athleteId: string; logId: string; rpe: number | null };
  "energy.complete": { athleteId: string; id: string; input: CompleteEnergyInput };
  "energy.rpe": { athleteId: string; id: string; rpe: number | null };
  "wellness.day": { athleteId: string; day: IsoDay; form: unknown };
  "nutrition.day": { athleteId: string; day: IsoDay; log: NutritionDailyLog };
  "weight.day": { athleteId: string; day: IsoDay; kg: number };
}
export type WriteKind = keyof WriteArgs;

const EXECUTORS: { [K in WriteKind]: (a: WriteArgs[K]) => Promise<unknown> } = {
  "workout.entries": (a) => patchWorkoutEntries(a.logId, a.patch),
  "workout.complete": (a) => completeWorkout({ logId: a.logId, mods: a.mods, runKm: a.runKm, rpe: a.rpe }),
  "workout.rpe": (a) => setWorkoutRpe(a.logId, a.rpe),
  "energy.complete": (a) => completeEnergyAssignment(a.id, a.input),
  "energy.rpe": (a) => setEnergyRpe(a.id, a.rpe),
  "wellness.day": (a) => saveWellnessForm(a.athleteId, a.form, a.day),
  "nutrition.day": (a) => saveDay(a.athleteId, a.day, a.log),
  "weight.day": (a) => saveWeight(a.athleteId, a.day, a.kg),
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
  const target = (a.logId ?? a.id ?? `${a.athleteId}:${a.day}`) as string;
  return `${kind}:${target}`;
}

// [libellé, féminin ?] pour accorder « non enregistré(e) ».
const LABELS: Record<WriteKind, [string, boolean]> = {
  "workout.entries": ["Saisie de séance", true],
  "workout.complete": ["Fin de séance", true],
  "workout.rpe": ["RPE de séance", false],
  "energy.complete": ["Séance énergie", true],
  "energy.rpe": ["RPE de séance énergie", false],
  "wellness.day": ["Wellness", false],
  "nutrition.day": ["Nutrition", true],
  "weight.day": ["Pesée", true],
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
    if (!s) return memory.get(userId) ?? [];
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
  return getQueue().submit(kind, writeKey(kind, args), args);
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
