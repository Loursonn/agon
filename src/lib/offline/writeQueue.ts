/**
 * File d'attente des écritures hors ligne (phase 2), sans dépendance au
 * navigateur : le stockage, les exécutants et l'état du réseau sont injectés
 * (tests sans IndexedDB ni réseau). Branchement réel : `writes.ts`.
 *
 * Règles :
 * - une écriture = une opération `{ kind, key, args }` rejouable : chaque
 *   exécutant appelle une RPC idempotente (jour, séance), rejouer ne double
 *   rien ;
 * - même `key` = même cible : la nouvelle saisie remplace l'ancienne À SA
 *   PLACE (l'ordre d'envoi reste celui des premières saisies) ;
 * - envoi dans l'ordre, une à la fois, pour l'utilisateur connecté seulement ;
 * - coupure réseau ou serveur indisponible : on s'arrête et on réessaiera,
 *   sans jamais abandonner ; refus du serveur (séance supprimée, saisie
 *   invalide) : l'opération est abandonnée et signalée ; autre erreur : essais
 *   espacés (30 s, 1 min, 2 min… 30 min), abandon après
 *   `MAX_TRANSIENT_ATTEMPTS` (environ 2 h).
 */

export interface WriteOp<K extends string = string> {
  /** Id local de l'opération. */
  id: string;
  kind: K;
  /** Cible : deux opérations de même clé n'en font qu'une (la plus récente). */
  key: string;
  args: unknown;
  createdAt: number;
  /** Échecs « inconnus » déjà subis (pas les coupures réseau). */
  attempts: number;
  /** Pas de nouvel essai avant cette date (ms) après un échec « inconnu ». */
  nextAt?: number;
}

export interface WriteQueueStore {
  get(userId: string): Promise<WriteOp[]>;
  set(userId: string, ops: WriteOp[]): Promise<void>;
}

export type WriteErrorKind = "network" | "transient" | "permanent";

export const MAX_TRANSIENT_ATTEMPTS = 8;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 30 * 60_000;

/** Délai avant le n-ième nouvel essai (1 = premier échec). */
export function retryDelay(attempts: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), RETRY_MAX_MS);
}

// Messages de fetch coupé : Chrome, Firefox, Safari, Node.
const NETWORK_RE = /Failed to fetch|Load failed|NetworkError|fetch failed|Network request failed|ERR_INTERNET|ERR_NETWORK/i;

/**
 * On attend sans compter d'essai : jeton expiré / pas encore rafraîchi
 * (PGRST301-303), base injoignable ou en redémarrage (PGRST000-003, 08xxx,
 * 57P0x, 53xxx), requête annulée (57014), conflit à rejouer (40001, 40P01).
 */
function isWaitCode(code: string): boolean {
  return (
    /^PGRST(00[0-3]|30[1-3])$/.test(code) ||
    code.startsWith("08") || code.startsWith("53") || code.startsWith("57P") ||
    code === "57014" || code === "40001" || code === "40P01"
  );
}

/**
 * Refus définitifs : ligne introuvable (séance retirée), saisie invalide,
 * contrainte, exception levée par la RPC, RPC inconnue. Les droits refusés
 * (42501) restent « transitoires » : un jeton pas encore rafraîchi au retour
 * du réseau donne la même erreur, on réessaie avant d'abandonner.
 */
export function isPermanentCode(code: string): boolean {
  return (
    code === "P0001" || code === "P0002" || code === "22023" || code === "22P02" ||
    code === "PGRST202" || code === "UNKNOWN_KIND" || code.startsWith("23")
  );
}

/**
 * Coupure réseau / serveur indisponible (supabase-js : `TypeError: Failed to
 * fetch`, code vide), refus définitif du serveur, ou autre à réessayer.
 */
export function classifyWriteError(e: unknown, offline = false): WriteErrorKind {
  if (offline) return "network";
  const err = e as { message?: string; code?: string; network?: boolean } | null;
  if (!err) return "transient";
  if (err.network === true || NETWORK_RE.test(err.message ?? "")) return "network";
  const code = typeof err.code === "string" ? err.code : "";
  if (isWaitCode(code)) return "network";
  if (code && isPermanentCode(code)) return "permanent";
  return "transient";
}

export type MergeArgs = (kind: string, prev: unknown, next: unknown) => unknown;

/**
 * Ajoute `op`, ou remplace à sa place l'opération de même clé (ses arguments
 * fusionnés par `merge` si fourni). L'état des essais de la cible est gardé :
 * taper vite pendant une panne ne relance pas un essai à chaque saisie.
 */
export function coalesce(ops: readonly WriteOp[], op: WriteOp, merge?: MergeArgs): WriteOp[] {
  const i = ops.findIndex((o) => o.key === op.key);
  if (i === -1) return [...ops, op];
  const prev = ops[i];
  const next = [...ops];
  next[i] = {
    ...op,
    id: prev.id,
    createdAt: prev.createdAt,
    attempts: prev.attempts,
    nextAt: prev.nextAt,
    args: merge ? merge(op.kind, prev.args, op.args) : op.args,
  };
  return next;
}

export type SubmitResult<R = unknown> = { status: "sent"; result: R } | { status: "queued" };

export interface WriteQueueDeps<K extends string> {
  store: WriteQueueStore;
  executors: Record<K, (args: never) => Promise<unknown>>;
  isOnline: () => boolean;
  /**
   * Prêt à envoyer (session valide…), vérifié avant chaque passe d'envoi.
   * Par défaut toujours prêt.
   */
  ready?: () => Promise<boolean>;
  /** Fusion de deux saisies de même cible (par défaut : la nouvelle remplace). */
  merge?: MergeArgs;
  onSent?: (op: WriteOp<K>, result: unknown) => void;
  onDropped?: (op: WriteOp<K>, error: unknown) => void;
  /** Fin d'un envoi groupé qui a envoyé au moins une opération. */
  onFlushed?: (sent: number) => void;
  newId?: () => string;
  now?: () => number;
}

export interface WriteQueue<K extends string> {
  /** Utilisateur connecté (null = personne : rien n'est envoyé). */
  setUser(userId: string | null): Promise<void>;
  /**
   * Envoie tout de suite si possible ; sinon garde l'opération et renvoie
   * `queued`. Lève seulement un refus du serveur (à afficher à l'appelant).
   */
  submit<R = unknown>(kind: K, key: string, args: unknown): Promise<SubmitResult<R>>;
  /** Envoie les opérations en attente (une seule passe à la fois). */
  flush(): Promise<void>;
  /** Opérations en attente pour l'utilisateur connecté. */
  pending(): number;
  /** Clés en attente (une saisie de cette séance / ce jour attend-elle ?). */
  keys(): string[];
  subscribe(cb: () => void): () => void;
  /** Efface les saisies de l'utilisateur connecté (déconnexion). */
  clearCurrent(): Promise<void>;
}

export function createWriteQueue<K extends string>(deps: WriteQueueDeps<K>): WriteQueue<K> {
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => Date.now());
  let userId: string | null = null;
  let ops: WriteOp<K>[] = [];
  let flushing: Promise<void> | null = null;
  // Toutes les lectures / écritures du stockage passent l'une après l'autre.
  let chain: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  }

  async function save(): Promise<void> {
    if (userId) await deps.store.set(userId, ops);
    emit();
  }

  async function exec(op: WriteOp<K>): Promise<unknown> {
    const fn = deps.executors[op.kind] as ((args: unknown) => Promise<unknown>) | undefined;
    if (!fn) throw Object.assign(new Error(`Écriture inconnue : ${op.kind}`), { code: "UNKNOWN_KIND" });
    return fn(op.args);
  }

  async function enqueue(kind: K, key: string, args: unknown, failed = false): Promise<void> {
    await serial(async () => {
      const op: WriteOp<K> = { id: newId(), kind, key, args, createdAt: now(), attempts: 0 };
      if (failed) { op.attempts = 1; op.nextAt = now() + retryDelay(1); }
      ops = coalesce(ops, op, deps.merge) as WriteOp<K>[];
      await save();
    });
  }

  async function flushOnce(): Promise<void> {
    let sent = 0;
    if (!userId || ops.length === 0 || !deps.isOnline()) return;
    if ((ops[0].nextAt ?? 0) > now()) return;
    if (deps.ready && !(await deps.ready().catch(() => false))) return;
    for (;;) {
      const uid = userId;
      const op = ops[0];
      if (!uid || !op || !deps.isOnline() || (op.nextAt ?? 0) > now()) break;
      try {
        const result = await exec(op);
        await serial(async () => {
          if (userId !== uid) return;
          // L'opération a pu être remplacée (même clé) pendant l'envoi : on ne
          // retire que celle qu'on vient d'envoyer, telle qu'envoyée ; la
          // nouvelle version repart sans attendre.
          const i = ops.findIndex((o) => o.id === op.id);
          if (i === -1) return;
          if (ops[i].args === op.args) ops = ops.filter((_, j) => j !== i);
          else ops = ops.map((o, j) => (j === i ? { ...o, attempts: 0, nextAt: undefined } : o));
          await save();
        });
        sent++;
        deps.onSent?.(op, result);
      } catch (e) {
        const kind = classifyWriteError(e, !deps.isOnline());
        if (kind === "network") break;
        let dropped = false;
        await serial(async () => {
          if (userId !== uid) return;
          const i = ops.findIndex((o) => o.id === op.id);
          if (i === -1) return;
          const cur = ops[i];
          if (cur.args !== op.args) {
            // Remplacée pendant l'envoi : l'erreur visait l'ancienne version.
            ops = ops.map((o, j) => (j === i ? { ...o, attempts: 0, nextAt: undefined } : o));
          } else if (kind === "permanent" || cur.attempts + 1 >= MAX_TRANSIENT_ATTEMPTS) {
            ops = ops.filter((_, j) => j !== i);
            dropped = true;
          } else {
            const attempts = cur.attempts + 1;
            ops = ops.map((o, j) => (j === i ? { ...o, attempts, nextAt: now() + retryDelay(attempts) } : o));
          }
          await save();
        });
        if (dropped) deps.onDropped?.(op, e);
        else break; // on réessaiera plus tard (ordre gardé)
      }
    }
    if (sent > 0) deps.onFlushed?.(sent);
  }

  function flush(): Promise<void> {
    if (!flushing) {
      flushing = flushOnce().finally(() => { flushing = null; });
    }
    return flushing;
  }

  return {
    async setUser(next) {
      await serial(async () => {
        if (next === userId) return;
        const orphans = userId === null ? ops : [];
        userId = next;
        ops = next ? ((await deps.store.get(next)) as WriteOp<K>[]) : [];
        // Saisies faites avant que l'utilisateur soit connu (démarrage) : elles
        // sont à lui, on les garde.
        if (next && orphans.length > 0) {
          for (const o of orphans) ops = coalesce(ops, o, deps.merge) as WriteOp<K>[];
          await save();
        } else {
          emit();
        }
      });
    },

    async submit<R>(kind: K, key: string, args: unknown): Promise<SubmitResult<R>> {
      // Des saisies attendent déjà : on passe derrière elles (ordre gardé).
      if (!userId || !deps.isOnline() || ops.length > 0) {
        await enqueue(kind, key, args);
        void flush();
        return { status: "queued" };
      }
      try {
        const fn = deps.executors[kind] as (a: unknown) => Promise<unknown>;
        return { status: "sent", result: (await fn(args)) as R };
      } catch (e) {
        const k = classifyWriteError(e, !deps.isOnline());
        if (k === "permanent") throw e;
        await enqueue(kind, key, args, k === "transient");
        return { status: "queued" };
      }
    },

    flush,

    pending: () => ops.length,

    keys: () => ops.map((o) => o.key),

    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    async clearCurrent() {
      await serial(async () => {
        ops = [];
        await save();
      });
    },
  };
}
