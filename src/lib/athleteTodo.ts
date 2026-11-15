/**
 * Fenêtre « À faire » de l'athlète (idée d'Hugo du 2026-11-14, choix du 15/11) :
 * à la première ouverture de l'app du jour, s'il reste quelque chose à faire,
 * une fenêtre le liste. Fermée, elle ne revient que le lendemain.
 *
 * Contenu retenu : wellness du jour, séance pas terminée, retour du coach sans
 * réaction, fiche jamais ouverte, compétition passée sans bilan, weekly review
 * (seulement si le coach l'a activée pour cet athlète).
 */

export type TodoKind = "wellness" | "unfinished" | "retour" | "fiche" | "competition" | "weekly_review";

export interface TodoItem {
  kind: TodoKind;
  /** Identifiant de l'objet visé (séance, compétition) quand il y en a un. */
  targetId?: string;
  title: string;
  detail?: string;
}

export interface TodoInput {
  wellnessDone: boolean;
  /** Séances avec des saisies mais jamais clôturées, la plus récente d'abord. */
  unfinished: { id: string; sessionName: string }[];
  unreadRetours: number;
  unseenFiches: number;
  /** Compétitions passées sans bilan de l'athlète. */
  uncommentedComps: { id: string; name: string }[];
  /** null : pas de weekly review ouverte aujourd'hui ou désactivée par le coach. */
  weeklyReview: { started: boolean; submitted: boolean; lastDay: boolean } | null;
}

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/** Liste ordonnée : d'abord ce qui se fait en une minute, puis le reste. */
export function buildTodoItems(i: TodoInput): TodoItem[] {
  const items: TodoItem[] = [];
  if (!i.wellnessDone) {
    items.push({ kind: "wellness", title: "Remplis ton wellness du jour", detail: "Sommeil, fatigue, douleurs : 1 minute." });
  }
  const wr = i.weeklyReview;
  if (wr && !wr.submitted) {
    items.push({
      kind: "weekly_review",
      title: wr.started ? "Termine ta weekly review" : "Ta weekly review t'attend",
      detail: wr.lastDay ? "Dernier jour : elle se ferme ce soir." : "Ton bilan de la semaine, en 5 minutes.",
    });
  }
  const last = i.unfinished[0];
  if (last) {
    const more = i.unfinished.length - 1;
    items.push({
      kind: "unfinished", targetId: last.id,
      title: "Termine ta séance",
      detail: more > 0 ? `${last.sessionName} (+ ${more} autre${more > 1 ? "s" : ""})` : last.sessionName,
    });
  }
  if (i.unreadRetours > 0) {
    items.push({
      kind: "retour",
      title: plural(i.unreadRetours, "Ton coach t'a fait un retour", `Ton coach t'a fait ${i.unreadRetours} retours`),
      detail: "Lis-le et réagis.",
    });
  }
  if (i.unseenFiches > 0) {
    items.push({
      kind: "fiche",
      title: plural(i.unseenFiches, "Une nouvelle fiche à lire", `${i.unseenFiches} nouvelles fiches à lire`),
    });
  }
  const comp = i.uncommentedComps[0];
  if (comp) {
    items.push({
      kind: "competition", targetId: comp.id,
      title: "Raconte ta compétition",
      detail: i.uncommentedComps.length > 1 ? `${comp.name} (+ ${i.uncommentedComps.length - 1})` : comp.name,
    });
  }
  return items;
}

// ── Une fois par jour ───────────────────────────────────────────────────────

const shownKey = (uid: string) => `agon:todo-shown:${uid}`;

/** Jour (AAAA-MM-JJ) où la fenêtre a été montrée pour la dernière fois sur cet appareil. */
export function lastTodoShownDay(uid: string): string | null {
  try { return localStorage.getItem(shownKey(uid)); } catch { return null; }
}

export function markTodoShown(uid: string, day: string): void {
  try { localStorage.setItem(shownKey(uid), day); } catch { /* stockage indisponible : elle reviendra */ }
}

/** Montrer la fenêtre ? Seulement s'il y a quelque chose et pas déjà vue aujourd'hui. */
export function shouldShowTodo(lastShown: string | null, today: string, items: readonly TodoItem[]): boolean {
  return items.length > 0 && lastShown !== today;
}
