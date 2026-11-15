import { addDays, isIsoDay, type IsoDay } from "@shared/domain/dates";
import type { PainLevels, WellnessEntry } from "@shared/domain/wellness";
import { painSummary, painText } from "@/lib/painZones";

/**
 * Douleurs saisies pendant la semaine d'une weekly review (retour d'Hugo du
 * 15/11) : la review ne pose les questions douleur que si l'athlète a déclaré
 * au moins une douleur dans la semaine, quel que soit son feu. Un athlète en
 * feu orange sans douleur n'est pas questionné. Les douleurs retrouvées sont
 * rappelées au-dessus des questions, pour qu'il se souvienne de ce qu'il avait.
 *
 * Sources où une douleur se saisit :
 * - wellness du matin : note de douleur 0-10 (carte douleur par zones depuis
 *   le 14/11, note seule avant), et le commentaire « blessé / malade » des
 *   anciennes saisies ;
 * - douleur de séance : question de fin de séance (muscu, énergie, HYROX ;
 *   ajoutée le 15/11). Chaque « oui » est une blessure déclarée ou le suivi
 *   d'une blessure en cours (`injury_followups`) : on lit les suivis de la
 *   semaine, une ligne par séance, « séance : <nom> » ;
 * - blessures déclarées (`medical_entries`, par l'athlète, le coach ou le
 *   staff) datées de la semaine, sinon créées dans la semaine. Une blessure
 *   née d'une séance n'est pas répétée : sa ligne « séance » suffit.
 * Le commentaire libre de séance n'est pas lu : la douleur a sa propre question.
 */

export type PainSource = "wellness" | "seance" | "blessure";

export interface PainReport {
  day: IsoDay;
  source: PainSource;
  /** « Douleur : genou 6/10, lombaires 3/10 », « Douleur 5/10 », « Entorse cheville · cheville gauche · 6/10 ». */
  text: string;
  /** Commentaire de l'athlète, tel quel ; null s'il n'en a pas laissé. */
  comment: string | null;
  /** Douleur de séance : nom de la séance. */
  sessionName?: string;
}

/** Suivi de blessure venu d'une fin de séance (`injury_followups`). */
export interface SessionPainLike {
  /** Blessure suivie. */
  entryId: string;
  /** Séance d'origine (null si supprimée depuis). */
  sessionId: string | null;
  day: string;
  /** Nom de la séance (null si supprimée). */
  name: string | null;
  zone: string | null;
  level: number;
  note: string | null;
}

/** Même jour : wellness du matin, puis séances, puis blessures. */
const ORDER: Record<PainSource, number> = { wellness: 0, seance: 1, blessure: 2 };

/** Ce qu'on lit d'une blessure (`medical_entries`). */
export interface InjuryLike {
  id?: string;
  title: string;
  zone: string | null;
  /** Jour de la blessure, "YYYY-MM-DD" (null si non renseigné). */
  date: string | null;
  pain_level: number | null;
  notes: string | null;
  created_at: string;
}

/**
 * Le commentaire « blessé / malade » d'un wellness, s'il a été écrit par
 * l'athlète. Depuis le 14/11 il est recomposé à partir des réponses
 * (« Malade ou fiévreux·se · Douleur : … ») : il répète alors la note, on ne le
 * remontre pas.
 */
function wellnessComment(note: string | null): string | null {
  const t = note?.trim();
  if (!t) return null;
  if (/^(Malade ou fiévreux·se|Douleur\b)/.test(t)) return null;
  return t;
}

function injuryDay(e: InjuryLike): IsoDay | null {
  const d = (e.date ?? "").slice(0, 10);
  if (isIsoDay(d)) return d;
  const c = (e.created_at ?? "").slice(0, 10);
  return isIsoDay(c) ? c : null;
}

/** Douleurs de la semaine (lundi `weekStart` → dimanche), dans l'ordre des jours. */
export function weekPainReports(input: {
  weekStart: IsoDay;
  wellness: readonly WellnessEntry[];
  injuries?: readonly InjuryLike[];
  sessions?: readonly SessionPainLike[];
}): PainReport[] {
  const end = addDays(input.weekStart, 6);
  const inWeek = (d: IsoDay) => d >= input.weekStart && d <= end;
  const out: PainReport[] = [];

  for (const e of input.wellness) {
    if (e.archived || !inWeek(e.day) || e.pain == null || e.pain <= 0) continue;
    const levels = Object.fromEntries(Object.entries(e.painLevels ?? {}).filter(([, v]) => v > 0));
    out.push({
      day: e.day,
      source: "wellness",
      text: painText(e.pain, levels) ?? `Douleur ${e.pain}/10`,
      comment: wellnessComment(e.injuryNote),
    });
  }

  // Une ligne par séance : « Genou 6/10, lombaires 3/10 ».
  const bySession = new Map<string, { day: IsoDay; name: string | null; levels: PainLevels; note: string | null }>();
  const fromSession = new Set<string>();
  for (const s of input.sessions ?? []) {
    const day = s.day.slice(0, 10);
    if (!isIsoDay(day) || !inWeek(day) || !(s.level > 0)) continue;
    fromSession.add(`${s.entryId}:${day}`);
    const key = s.sessionId ? `s:${s.sessionId}` : `e:${s.entryId}:${day}`;
    const cur = bySession.get(key) ?? { day, name: s.name, levels: {}, note: null };
    cur.levels[s.zone?.trim() || "Douleur"] = s.level;
    cur.note = cur.note ?? (s.note?.trim() || null);
    bySession.set(key, cur);
  }
  for (const s of bySession.values()) {
    const summary = painSummary(s.levels);
    out.push({
      day: s.day,
      source: "seance",
      sessionName: s.name?.trim() || "Séance",
      text: summary.charAt(0).toUpperCase() + summary.slice(1),
      comment: s.note,
    });
  }

  for (const e of input.injuries ?? []) {
    const day = injuryDay(e);
    if (!day || !inWeek(day) || e.pain_level === 0) continue;
    if (e.id && fromSession.has(`${e.id}:${day}`)) continue;
    const parts = [e.title.trim() || "Blessure"];
    if (e.zone?.trim()) parts.push(e.zone.trim());
    if (e.pain_level != null) parts.push(`${e.pain_level}/10`);
    out.push({ day, source: "blessure", text: parts.join(" · "), comment: e.notes?.trim() || null });
  }

  // Tri stable : deux douleurs du même jour et de même origine gardent leur ordre.
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : ORDER[a.source] - ORDER[b.source]));
}

/** Questions douleur de la review : seulement si une douleur a été saisie dans la semaine. */
export function painRequired(reports: readonly PainReport[] | null | undefined): boolean {
  return (reports?.length ?? 0) > 0;
}
