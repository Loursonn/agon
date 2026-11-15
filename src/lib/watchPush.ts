/**
 * État du bouton « Envoyer sur ma montre » d'une séance prévue (Garmin).
 *
 * Mêmes règles que le serveur (`provider-garmin-push-workout`) : rien sans
 * montre Garmin connectée, rien pour une séance faite, commencée ou passée,
 * et l'envoi coupé ou la permission « Workout Import » absente renvoient vers
 * l'écran Montres au lieu d'envoyer.
 */
export type WatchPushState =
  /** Pas de bouton (pas de Garmin, séance faite ou passée et jamais envoyée). */
  | "hidden"
  /** Séance faite ou passée mais déjà sur la montre : simple mention. */
  | "sent_only"
  /** Prête à partir. */
  | "ready"
  /** Déjà sur la montre : le bouton la renvoie. */
  | "sent"
  /** L'athlète a coupé l'envoi des séances (ou il n'est pas encore ouvert pour lui). */
  | "off"
  /** Garmin connecté sans la permission « Workout Import ». */
  | "no_permission"
  /** Garmin demande de reconnecter le compte. */
  | "reauth";

export interface WatchPushInput {
  connection: { status: string; pushWorkouts: boolean; grantedScopes: readonly string[] } | undefined;
  /** Statut de la séance Agon (`planned`, `in_progress`, `completed`, `skipped`…). */
  sessionStatus: string | null | undefined;
  /** Jour de la séance, `YYYY-MM-DD`. */
  date: string | null | undefined;
  today: string;
  /** La séance est déjà dans le calendrier Garmin (`provider_workout_pushes.status = sent`). */
  sent: boolean;
}

export function watchPushState({ connection, sessionStatus, date, today, sent }: WatchPushInput): WatchPushState {
  if (!connection) return "hidden";
  const upcoming = sessionStatus === "planned" && !!date && date.slice(0, 10) >= today;
  if (!upcoming) return sent && connection.status === "active" ? "sent_only" : "hidden";
  if (connection.status === "needs_reauth") return "reauth";
  if (connection.status !== "active") return "hidden";
  if (!connection.pushWorkouts) return "off";
  // Liste vide = permissions inconnues : le serveur les relit, on laisse essayer.
  if (connection.grantedScopes.length > 0 && !connection.grantedScopes.includes("WORKOUT_IMPORT")) return "no_permission";
  return sent ? "sent" : "ready";
}
