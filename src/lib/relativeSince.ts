/**
 * Durée écoulée en français simple : « à l'instant », « il y a 5 min »,
 * « il y a 3 h », « hier », « il y a 4 j ». Une date absente ou illisible
 * donne `null` (l'appelant affiche « — » ou une autre phrase).
 */
export function relativeSince(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const min = Math.floor((now.getTime() - t) / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "hier";
  return `il y a ${d} j`;
}
