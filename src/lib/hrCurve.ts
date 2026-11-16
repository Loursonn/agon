/**
 * Mini-courbe de fréquence cardiaque d'une activité (compétition liée à une
 * sortie de montre, demande d'Hugo du 16/11/2026) : la série seconde par
 * seconde ramenée à quelques centaines de points, moyenne par tranche de
 * temps. Les trous de capteur restent des trous (jamais 0).
 *
 * Pur et testé. Données de montre : affichées, jamais envoyées à une IA.
 */
import type { ActivityStream } from "@shared/activityFiles/stream";

export interface HrPoint {
  /** Secondes depuis le départ (milieu de la tranche). */
  t: number;
  /** FC moyenne de la tranche (bpm), `null` si le capteur n'a rien donné. */
  hr: number | null;
}

export interface HrCurve {
  points: HrPoint[];
  avgHr: number;
  maxHr: number;
  minHr: number;
  durationS: number;
}

/** Courbe FC réduite à `maxPoints` tranches ; `null` sans FC exploitable. */
export function hrCurve(stream: Pick<ActivityStream, "t" | "hr"> | null | undefined, maxPoints = 240): HrCurve | null {
  const t = stream?.t;
  const hr = stream?.hr;
  if (!t || !hr || t.length === 0) return null;
  let sum = 0, n = 0, max = -Infinity, min = Infinity;
  for (const v of hr) {
    if (v == null || !Number.isFinite(v) || v <= 0) continue;
    sum += v; n++;
    if (v > max) max = v;
    if (v < min) min = v;
  }
  if (n === 0) return null;
  const start = t[0];
  const durationS = Math.max(0, t[t.length - 1] - start);
  const buckets = Math.max(1, Math.min(maxPoints, t.length));
  const width = Math.max(1, durationS / buckets);
  const acc = Array.from({ length: buckets }, () => ({ s: 0, n: 0 }));
  for (let i = 0; i < t.length; i++) {
    const v = hr[i];
    if (v == null || !Number.isFinite(v) || v <= 0) continue;
    const b = Math.min(buckets - 1, Math.floor((t[i] - start) / width));
    acc[b].s += v; acc[b].n++;
  }
  const points = acc.map((a, i) => ({
    t: Math.round(i * width + width / 2),
    hr: a.n ? Math.round(a.s / a.n) : null,
  }));
  return { points, avgHr: Math.round(sum / n), maxHr: Math.round(max), minHr: Math.round(min), durationS };
}
