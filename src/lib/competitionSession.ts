/**
 * Compétition = séance à remplir le jour J (demande d'Hugo, 15/11/2026).
 *
 * Le jour d'une compétition ou d'un match, la compétition elle-même se
 * remplit comme une séance : résultat libre, lien, RPE, bilan (ressenti) et
 * douleur de fin de séance. Elle se lie à une activité de la montre du jour
 * (rapprochement `activity_plan_links`, type `competition`, calculé en base).
 *
 * Le jour J il y a souvent deux activités : l'échauffement, puis la course,
 * en général la plus longue. La course proposée d'office est celle dont la
 * durée est la plus proche du chrono quand il est connu (HYROX), sinon la
 * plus longue ; l'autre reste une activité du jour, comptée à part.
 *
 * Pur et testé. Même règle qu'en base (`planned_sessions_of_day`).
 */
import { pickRaceActivity } from "@/lib/hyrox/raceWatch";

/** Types de compétition qui se remplissent comme une séance (pas stage, off, autre). */
export const COMPETITION_SESSION_TYPES: ReadonlySet<string> = new Set(["competition", "match"]);

export const RESULT_TEXT_MAX = 200;
export const RESULT_URL_MAX = 500;

export interface CompetitionSessionLike {
  type: string;
  date: string;
  cancelled_at?: string | null;
  cancelled?: boolean;
  athlete_comment?: string | null;
  result_text?: string | null;
  result_url?: string | null;
  rpe_score?: number | null;
}

/** Compétition ou match maintenu : une séance à remplir dès le jour J. */
export function isCompetitionSession(c: CompetitionSessionLike): boolean {
  return COMPETITION_SESSION_TYPES.has(c.type) && !c.cancelled_at && !c.cancelled;
}

/** Quelque chose a été saisi (bilan, résultat ou RPE). */
export function competitionSessionFilled(c: CompetitionSessionLike): boolean {
  return !!(c.athlete_comment?.trim() || c.result_text?.trim() || c.result_url?.trim() || c.rpe_score);
}

/** Jour J passé, séance vide : reste « à remplir ». */
export function competitionSessionToFill(c: CompetitionSessionLike, today: string): boolean {
  return c.date < today && !competitionSessionFilled(c);
}

/** « 12e / 80 · RPE 9 » ; null si rien. */
export function competitionSessionSummary(c: CompetitionSessionLike): string | null {
  const parts = [c.result_text?.trim() || null, c.rpe_score ? `RPE ${c.rpe_score}` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Lien saisi par l'athlète : vide → null ; « results.hyrox.com/… » → https://… ;
 * `"invalid"` si ce n'est pas une adresse web (espaces, autre protocole, trop long).
 */
export function toResultUrl(raw: string): string | null | "invalid" {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  if (withScheme.length > RESULT_URL_MAX || /\s/.test(withScheme)) return "invalid";
  try {
    const u = new URL(withScheme);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !u.hostname.includes(".")) return "invalid";
    return withScheme;
  } catch {
    return "invalid";
  }
}

export interface DayActivityLike {
  id: string;
  durationS: number | null;
  startedAt: string | null;
}

/**
 * Activité proposée d'office comme la course : la plus proche du chrono si
 * on le connaît (au moins 80 % du chrono), sinon la plus longue du jour.
 */
export function proposedRaceActivity<T extends DayActivityLike>(candidates: readonly T[], chronoS: number | null = null): T | null {
  if (chronoS != null && chronoS > 0) {
    const near = pickRaceActivity(candidates, chronoS);
    if (near) return near;
  }
  let best: T | null = null;
  for (const c of candidates) {
    if (c.durationS == null || c.durationS <= 0) continue;
    if (!best || c.durationS > (best.durationS as number)) best = c;
  }
  return best;
}

export type DayActivityRole = "course" | "echauffement" | "autre";

export const DAY_ACTIVITY_ROLE_LABEL: Record<DayActivityRole, string> = {
  course: "Course",
  echauffement: "Échauffement",
  autre: "Autre activité",
};

/**
 * Rôle de chaque activité du jour face à la course retenue : celles parties
 * avant sont l'échauffement, celles d'après (retour au calme…) « autre ».
 * Sans course retenue, aucune n'est l'échauffement.
 */
export function dayActivityRoles<T extends DayActivityLike>(candidates: readonly T[], raceId: string | null): Map<string, DayActivityRole> {
  const out = new Map<string, DayActivityRole>();
  const race = raceId ? candidates.find((c) => c.id === raceId) ?? null : null;
  for (const c of candidates) {
    if (race && c.id === race.id) out.set(c.id, "course");
    else if (race?.startedAt && c.startedAt && c.startedAt < race.startedAt) out.set(c.id, "echauffement");
    else out.set(c.id, "autre");
  }
  return out;
}
