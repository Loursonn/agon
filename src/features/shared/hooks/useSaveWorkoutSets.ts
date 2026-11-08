import { useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AthleteModifications } from "../types/athlete";
import { saveDraft, markDraftSynced, workoutDraftKey } from "@/lib/localDraft";
import {
  currentAccessToken,
  invalidateWorkouts,
  isWorkoutNotFound,
  onAccessTokenChange,
  patchWorkoutEntries,
  sendEntriesKeepalive,
} from "@/api/workouts";
import { classifyWriteError } from "@/lib/offline/writeQueue";
import { pendingWrites, QUEUED_TOAST, submitWrite } from "@/lib/offline/writes";

const DEBOUNCE_MS = 600;
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];
// Limite navigateur des requêtes `keepalive` : 64 Ko pour TOUTES celles en vol.
const KEEPALIVE_MAX_BYTES = 60_000;
const SAVE_ERROR_TOAST = "workout-save-error";
const SAVE_QUEUED_TOAST = "workout-save-queued";

const browserOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

export interface SaveWorkoutSets {
  /** Écriture différée (600 ms) — pour la frappe et les clics en rafale. */
  save: (modifications: AthleteModifications) => void;
  /**
   * Écriture immédiate, sans debounce, de la saisie en attente (ou de
   * `modifications` si fourni).
   *
   * À utiliser dès que la page peut disparaître (passage en arrière-plan,
   * démontage). Le debounce s'appuie sur setTimeout, or les navigateurs
   * mobiles gèlent les timers d'un onglet caché : un `save()` déclenché sur
   * `visibilitychange` n'était jamais exécuté si le système tuait l'onglet
   * ensuite, et la séance était perdue.
   *
   * `keepalive` : envoi qui survit à la fermeture de la page (`pagehide`).
   */
  flushNow: (modifications?: AthleteModifications, opts?: { keepalive?: boolean }) => void;
  /** Oublie la saisie en attente (ex. séance validée avec ces mêmes données). */
  discardPending: () => void;
}

interface PendingEntry {
  id: string;
  aid: string | null | undefined;
  mods: AthleteModifications;
}

/**
 * Envoi `keepalive` (fermeture / mise en arrière-plan) : passe par la RPC
 * `patch_workout_entries`, qui fusionne la saisie sans toucher l'adaptation du
 * coach (l'ancien PATCH réécrivait toute la colonne). Best effort : la réponse
 * peut ne jamais revenir → la saisie reste « en attente » et le brouillon local
 * « non synchronisé » (renvoyé plus tard).
 */
function sendKeepalive(entry: PendingEntry, token: string | null): void {
  sendEntriesKeepalive({ logId: entry.id, mods: entry.mods, token, maxBytes: KEEPALIVE_MAX_BYTES });
}

export function useSaveWorkoutSets(workoutLogId: string | undefined, athleteId?: string | null): SaveWorkoutSets {
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const retryAttemptRef = useRef(0);
  // Saisie pas encore CONFIRMÉE par le serveur. Elle n'est retirée qu'au succès
  // de son envoi (avant, elle était vidée avant l'envoi : un envoi raté sans
  // saisie derrière était perdu).
  const pendingRef = useRef<PendingEntry | null>(null);
  const inFlightRef = useRef(false);
  // Incrémenté par `discardPending` : un envoi parti AVANT l'abandon ne doit
  // ni se remettre en file ni se relancer ensuite.
  const epochRef = useRef(0);
  // Id figée dans un ref : au démontage (ou au changement de séance) la purge
  // doit viser la séance d'origine. Sans ça, naviguer d'une séance à l'autre
  // en moins de 600 ms faisait atterrir les séries de la séance A sur l'id B.
  const idRef = useRef(workoutLogId);
  const athleteRef = useRef(athleteId);
  athleteRef.current = athleteId;
  const tokenRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  // Jeton tenu à jour pour l'envoi keepalive (pagehide ne laisse pas le temps
  // d'un `await getSession()`).
  useEffect(() => {
    mountedRef.current = true;
    let alive = true;
    currentAccessToken()
      .then((t) => { if (alive) tokenRef.current = t; })
      .catch(() => {});
    const unsubscribe = onAccessTokenChange((t) => { tokenRef.current = t; });
    return () => { alive = false; mountedRef.current = false; unsubscribe(); };
  }, []);

  // Déclaré via ref pour que `write` puisse relancer `flushNow` sans cycle de deps.
  const flushRef = useRef<() => void>(() => {});

  const scheduleRetry = useCallback(() => {
    clearTimeout(retryTimerRef.current);
    if (!mountedRef.current) return;
    const d = RETRY_DELAYS_MS[Math.min(retryAttemptRef.current++, RETRY_DELAYS_MS.length - 1)];
    retryTimerRef.current = setTimeout(() => flushRef.current(), d);
  }, []);

  // Écriture volontairement hors `useMutation` : `flushNow` est appelé pendant
  // le démontage, moment où l'observateur React Query est déjà détaché et où
  // `mutate` peut ne rien déclencher. Ici l'appel réseau part quoi qu'il
  // arrive — c'est précisément le filet de sécurité de fin de séance.
  const write = useCallback(
    async (entry: PendingEntry) => {
      inFlightRef.current = true;
      const epoch = epochRef.current;
      let outcome: "sent" | "queued" | "missing" | "refused" | "retry" = "retry";
      // File hors ligne : la saisie est COMPLÈTE (toute la séance) — la file
      // remplace une saisie de même séance par la plus récente, et le serveur
      // fusionne les clés de premier niveau (`patch_workout_entries`).
      const viaQueue = async (): Promise<"sent" | "queued"> => {
        const r = await submitWrite("workout.entries", { athleteId: entry.aid!, logId: entry.id, patch: entry.mods });
        return r.status;
      };
      // En ligne mais derrière d'autres saisies en attente : la file envoie
      // tout de suite, pas de toast « pas de réseau ».
      const behindOthers = !browserOffline() && pendingWrites() > 0;
      try {
        if (entry.aid && (browserOffline() || pendingWrites() > 0)) {
          // Hors ligne, ou d'autres saisies attendent déjà : on passe derrière
          // elles. Un envoi direct pourrait sinon être écrasé ensuite par une
          // saisie plus ancienne de la même séance restée dans la file.
          outcome = await viaQueue();
        } else {
          try {
            // Fusion côté serveur (RPC) : l'adaptation du coach posée pendant la
            // séance n'est plus écrasée. Une séance disparue (supprimée
            // entre-temps) lève « introuvable » au lieu de réussir en silence.
            await patchWorkoutEntries(entry.id, entry.mods);
            outcome = "sent";
          } catch (e) {
            const kind = classifyWriteError(e, browserOffline());
            if (isWorkoutNotFound(e)) outcome = "missing";
            else if (kind === "permanent") outcome = "refused";
            // Coupure réseau : en file plutôt que de boucler. Pas si la saisie a
            // été abandonnée pendant l'envoi (séance validée entre-temps avec la
            // saisie complète) : elle passerait APRÈS la validation et
            // remettrait une version plus ancienne des séries.
            else if (kind === "network" && entry.aid && epochRef.current === epoch) outcome = await viaQueue();
          }
        }
      } catch (e) {
        // submitWrite ne lève qu'un refus définitif du serveur.
        outcome = isWorkoutNotFound(e) ? "missing" : "refused";
      } finally {
        inFlightRef.current = false;
      }

      if (outcome === "sent" || outcome === "queued") {
        retryAttemptRef.current = 0;
        clearTimeout(retryTimerRef.current);
        toast.dismiss(SAVE_ERROR_TOAST);
        if (outcome === "sent") {
          if (entry.aid) markDraftSynced(workoutDraftKey(entry.aid, entry.id), entry.mods);
          toast.dismiss(SAVE_QUEUED_TOAST);
          void invalidateWorkouts(qc, { athleteId: entry.aid, logId: entry.id });
        } else {
          // Gardée sur le téléphone : le brouillon local reste « non
          // synchronisé » (filet si la file est perdue) ; l'écran garde sa
          // saisie locale. Pas d'invalidation : hors ligne elle ne servirait à
          // rien, et la file rafraîchit tout une fois vidée.
          if (!behindOthers) toast.info(QUEUED_TOAST, { id: SAVE_QUEUED_TOAST });
        }
        if (pendingRef.current === entry) {
          pendingRef.current = null;
        } else if (pendingRef.current) {
          // Saisie plus récente arrivée pendant l'envoi : on l'envoie à son tour.
          flushRef.current();
        }
        return;
      }

      if (outcome === "missing" || outcome === "refused") {
        // Séance supprimée (ou saisie refusée) : réessayer ne servirait à rien.
        // Le brouillon local reste « non synchronisé ».
        if (pendingRef.current === entry) pendingRef.current = null;
        toast.error(
          outcome === "missing"
            ? "Saisie non enregistrée — séance introuvable"
            : "Saisie non enregistrée — refusée par le serveur",
          { id: SAVE_ERROR_TOAST },
        );
        return;
      }

      // Échec serveur (5xx, droits pas encore rafraîchis…) : la saisie reste en
      // attente et sera renvoyée (délai croissant, retour du réseau, retour au
      // premier plan, prochain montage). Abandonnée entre-temps : rien à faire.
      if (epochRef.current !== epoch) return;
      toast.error("Saisie non enregistrée — nouvel essai automatique", { id: SAVE_ERROR_TOAST });
      scheduleRetry();
    },
    [qc, scheduleRetry],
  );

  const flushNow = useCallback(
    (modifications?: AthleteModifications, opts?: { keepalive?: boolean }) => {
      clearTimeout(timerRef.current);
      if (modifications) {
        const id = idRef.current;
        if (!id) return;
        pendingRef.current = { id, aid: athleteRef.current, mods: modifications };
        if (athleteRef.current) saveDraft(workoutDraftKey(athleteRef.current, id), modifications);
      }
      const entry = pendingRef.current;
      if (!entry) return;
      if (opts?.keepalive) {
        // Hors ligne, ou des saisies attendent dans la file : on y range aussi
        // la plus récente (sinon une saisie plus ancienne de la file, envoyée
        // au retour du réseau, écraserait celle partie en keepalive).
        if (entry.aid && (browserOffline() || pendingWrites() > 0)) {
          void submitWrite("workout.entries", { athleteId: entry.aid, logId: entry.id, patch: entry.mods }).catch(() => {});
        }
        if (!browserOffline()) sendKeepalive(entry, tokenRef.current);
        return;
      }
      if (inFlightRef.current) return; // relancé à la fin de l'envoi en cours
      void write(entry);
    },
    [write],
  );
  flushRef.current = () => flushNow();

  const save = useCallback(
    (modifications: AthleteModifications) => {
      if (!workoutLogId) return;
      pendingRef.current = { id: workoutLogId, aid: athleteRef.current, mods: modifications };
      // Brouillon local écrit de façon SYNCHRONE : si l'app est tuée avant
      // l'envoi (ou hors ligne), la saisie est retrouvée à la réouverture.
      if (athleteRef.current) saveDraft(workoutDraftKey(athleteRef.current, workoutLogId), modifications);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => flushNow(), DEBOUNCE_MS);
    },
    [workoutLogId, flushNow],
  );

  const discardPending = useCallback(() => {
    epochRef.current++;
    clearTimeout(timerRef.current);
    clearTimeout(retryTimerRef.current);
    pendingRef.current = null;
  }, []);

  // Nouvel essai dès que le réseau revient ou que l'app repasse au premier plan.
  useEffect(() => {
    const retryNow = () => { if (pendingRef.current) flushRef.current(); };
    const onVisible = () => { if (document.visibilityState === "visible") retryNow(); };
    window.addEventListener("online", retryNow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", retryNow);
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(retryTimerRef.current);
    };
  }, []);

  // Au changement de séance et au démontage : on écrit ce qui reste en attente
  // pour la séance qu'on quitte, puis on repart propre. Le cleanup s'exécute
  // avant la mise à jour de idRef, donc il vise bien l'ancienne id.
  useEffect(() => {
    idRef.current = workoutLogId;
    return () => { flushNow(); };
  }, [workoutLogId, flushNow]);

  return { save, flushNow, discardPending };
}
