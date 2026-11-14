/**
 * Page « Mes seuils et mes zones » (planche Ath2Zones) : calculs d'affichage.
 * Pur et testé.
 */

export interface RestingDay {
  day: string;
  restingHr: number | null;
  attribution: string;
}

/** Moyenne des 7 dernières nuits avec une FC de repos (arrondie), et sa source. */
export function restingHrAverage(days: readonly RestingDay[], nights = 7): { bpm: number; nights: number; source: string } | null {
  const ok = days.filter((d) => d.restingHr != null && d.restingHr > 0).sort((a, b) => b.day.localeCompare(a.day)).slice(0, nights);
  if (!ok.length) return null;
  const bpm = Math.round(ok.reduce((s, d) => s + d.restingHr!, 0) / ok.length);
  return { bpm, nights: ok.length, source: ok[0].attribution };
}

const LABELS_3 = ["Facile · sous SV1", "Moyen · SV1 → SV2", "Dur · SV2 et plus"];
const LABELS_5 = ["Récupération", "Endurance", "Tempo", "Seuil", "Maximal"];

export interface ZoneRow {
  zone: number;
  label: string;
  /** « moins de 152 », « 152 – 171 », « 172 – 194 » (ou « 172 et plus » sans FC max). */
  range: string;
}

/** `bounds` = bornes basses des zones 2..N. */
export function zoneRows(bounds: readonly number[], fcMax: number | null): ZoneRow[] {
  const n = bounds.length + 1;
  const labels = n === 3 ? LABELS_3 : n === 5 ? LABELS_5 : null;
  return Array.from({ length: n }, (_, i) => {
    const lo = i === 0 ? null : bounds[i - 1];
    const hi = i === n - 1 ? fcMax : bounds[i] - 1;
    const range = lo == null ? `moins de ${bounds[0]}` : hi == null ? `${lo} et plus` : `${lo} – ${hi}`;
    return { zone: i + 1, label: labels?.[i] ?? `Zone ${i + 1}`, range };
  });
}

/** Barre de 100 bpm à la FC max (ou dernière borne + 20) : largeur de chaque zone et position d'une borne, en %. */
export function zoneBarScale(bounds: readonly number[], fcMax: number | null): { min: number; max: number; widths: number[]; at: (bpm: number) => number } {
  const min = 100;
  const max = Math.max(fcMax ?? 0, (bounds[bounds.length - 1] ?? min) + 20);
  const at = (bpm: number) => Math.min(100, Math.max(0, ((bpm - min) / (max - min)) * 100));
  const edges = [min, ...bounds, max].map(at);
  return { min, max, widths: edges.slice(1).map((e, i) => e - edges[i]), at };
}
