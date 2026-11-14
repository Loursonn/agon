import type { Competition, LifeEvent, LifeEventKind } from "@/types/planning";
import { LIFE_EVENT_LABEL } from "@/types/planning";

/**
 * « Mes événements » de l'accueil athlète (planche Ath1Evenement) :
 * compétitions et événements de vie à venir dans une seule liste.
 */
export type AthleteEventItem =
  | { source: "competition"; id: string; title: string; start: string; end: string; priority: string; isNew: boolean }
  | { source: "life"; id: string; title: string; start: string; end: string; kind: LifeEventKind; unavailable: boolean; isNew: boolean };

/** Un événement ajouté depuis moins de 24 h est « Nouveau ». */
const NEW_MS = 24 * 3_600_000;

export function upcomingEvents(
  competitions: readonly Competition[],
  lifeEvents: readonly LifeEvent[],
  today: string,
  now: number = Date.now(),
): AthleteEventItem[] {
  const fresh = (createdAt: string) => {
    const t = Date.parse(createdAt);
    return Number.isFinite(t) && now - t >= 0 && now - t < NEW_MS;
  };
  const items: AthleteEventItem[] = [];
  for (const c of competitions) {
    const end = c.date_end ?? c.date;
    if (end < today) continue;
    items.push({ source: "competition", id: c.id, title: c.name, start: c.date, end, priority: c.priority, isNew: fresh(c.created_at) });
  }
  for (const e of lifeEvents) {
    if (e.date_end < today) continue;
    items.push({
      source: "life", id: e.id, title: e.title, start: e.date_start, end: e.date_end,
      kind: e.kind ?? "autre", unavailable: e.unavailable ?? true, isNew: fresh(e.created_at),
    });
  }
  return items.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.title.localeCompare(b.title));
}

/** Étiquette en couleur sous le nom : « Compétition B », « Indisponible », « Voyage ». */
export function eventTag(item: AthleteEventItem): string {
  if (item.source === "competition") return `Compétition ${item.priority}`.trim();
  return item.unavailable ? "Indisponible" : LIFE_EVENT_LABEL[item.kind];
}

/** Compétition à venir après `afterId` (ligne « Puis » de « Prochaine compétition »). */
export function competitionAfter<T extends Pick<Competition, "id" | "date">>(
  competitions: readonly T[],
  afterId: string | null | undefined,
  today: string,
): T | null {
  if (!afterId) return null;
  const upcoming = competitions.filter((c) => c.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const i = upcoming.findIndex((c) => c.id === afterId);
  return i >= 0 ? upcoming[i + 1] ?? null : null;
}
