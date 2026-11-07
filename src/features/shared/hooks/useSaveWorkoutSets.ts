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

const DEBOUNCE_MS = 600;
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];
// Limite navigateur des requêtes `keepalive` : 64 Ko pour TOUTES celles en vol.
const KEEPALIVE_MAX_BYTES = 60_000;
const SAVE_ERROR_TOAST = "workout-save-error";

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
      let ok = false;
      let missing = false;
      try {
        // Fusion côté serveur (RPC) : l'adaptation du coach posée pendant la
        // séance n'est plus écrasée. Une séance disparue (supprimée
        // entre-temps) lève « introuvable » au lieu de réussir en silence.
        await patchWorkoutEntries(entry.id, entry.mods);
        ok = true;
      } catch (e) {
        ok = false;
        missing = isWorkoutNotFound(e);
      } finally {
        inFlightRef.current = false;
      }

      if (ok) {
        retryAttemptRef.current = 0;
        clearTimeout(retryTimerRef.current);
        if (entry.aid) markDraftSynced(workoutDraftKey(entry.aid, entry.id), entry.mods);
        toast.dismiss(SAVE_ERROR_TOAST);
        void invalidateWorkouts(qc, { athleteId: entry.aid, logId: entry.id });
        if (pendingRef.current === entry) {
          pendingRef.current = null;
        } else if (pendingRef.current) {
          // Saisie plus récente arrivée pendant l'envoi : on l'envoie à son tour.
          flushRef.current();
        }
        return;
      }

      if (missing) {
        // Séance supprimée (ou inaccessible) : réessayer ne servirait à rien.
        // Le brouillon local reste « non synchronisé ».
        if (pendingRef.current === entry) pendingRef.current = null;
        toast.error("Saisie non enregistrée — séance introuvable", { id: SAVE_ERROR_TOAST });
        return;
      }

      // Échec réseau / serveur : la saisie reste en attente et sera renvoyée
      // (délai croissant, retour du réseau, retour au premier plan, prochain montage).
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
        sendKeepalive(entry, tokenRef.current);
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
