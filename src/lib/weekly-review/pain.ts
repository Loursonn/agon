import { addDays, isIsoDay, type IsoDay } from "@shared/domain/dates";
import type { WellnessEntry } from "@shared/domain/wellness";
import { painText } from "@/lib/painZones";

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
 * - blessures déclarées (`medical_entries`, par l'athlète, le coach ou le
 *   staff) datées de la semaine, sinon créées dans la semaine.
 * Les séances n'ont pas de champ douleur (seulement un commentaire libre) :
 * elles ne comptent pas.
 */

export type PainSource = "wellness" | "blessure";

export interface PainReport {
  day: IsoDay;
  source: PainSource;
  /** « Douleur : genou 6/10, lombaires 3/10 », « Douleur 5/10 », « Entorse cheville · cheville gauche · 6/10 ». */
  text: string;
  /** Commentaire de l'athlète, tel quel ; null s'il n'en a pas laissé. */
  comment: string | null;
}

/** Ce qu'on lit d'une blessure (`medical_entries`). */
export interface InjuryLike {
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

  for (const e of input.injuries ?? []) {
    const day = injuryDay(e);
    if (!day || !inWeek(day) || e.pain_level === 0) continue;
    const parts = [e.title.trim() || "Blessure"];
    if (e.zone?.trim()) parts.push(e.zone.trim());
    if (e.pain_level != null) parts.push(`${e.pain_level}/10`);
    out.push({ day, source: "blessure", text: parts.join(" · "), comment: e.notes?.trim() || null });
  }

  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.source === "wellness" ? -1 : 1));
}

/** Questions douleur de la review : seulement si une douleur a été saisie dans la semaine. */
export function painRequired(reports: readonly PainReport[] | null | undefined): boolean {
  return (reports?.length ?? 0) > 0;
}
