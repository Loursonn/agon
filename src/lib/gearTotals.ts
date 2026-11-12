/**
 * Kilométrage par matériel (chaussures, vélo), à partir du champ « matériel »
 * des sorties (archive Strava, P42). Décision d'Hugo du 2026-11-12 : suivi
 * des km par paire. Calcul pur, à la lecture : rien n'est stocké en double.
 *
 * Même nom à la casse et aux espaces près = même paire.
 */
export interface GearTotal {
  /** Nom tel qu'écrit dans la sortie la plus récente. */
  name: string;
  distanceM: number;
  outings: number;
  /** Jour de la première et de la dernière sortie (« YYYY-MM-DD »). */
  firstDate: string;
  lastDate: string;
}

export interface GearOuting {
  gear: string | null | undefined;
  distanceM: number | null | undefined;
  localDate: string;
}

const key = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export function gearTotals(outings: GearOuting[]): GearTotal[] {
  const byKey = new Map<string, GearTotal>();
  for (const o of outings) {
    const name = o.gear?.trim();
    if (!name) continue;
    const k = key(name);
    const t = byKey.get(k) ?? { name, distanceM: 0, outings: 0, firstDate: o.localDate, lastDate: o.localDate };
    t.outings++;
    t.distanceM += o.distanceM && o.distanceM > 0 ? o.distanceM : 0;
    if (o.localDate < t.firstDate) t.firstDate = o.localDate;
    if (o.localDate >= t.lastDate) {
      t.lastDate = o.localDate;
      t.name = name;
    }
    byKey.set(k, t);
  }
  return [...byKey.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.distanceM - a.distanceM);
}
