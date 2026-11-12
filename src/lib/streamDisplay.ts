import { STREAM_MEASURES, type ActivityStream, type StreamMeasure } from "@shared/activityFiles/stream";

/** Plafond de points envoyés à un graphique (2 points par seau). */
export const DISPLAY_MAX_POINTS = 3000;

/** Positions et distance cumulée : point réel, pas de min / max. */
const POSITION = new Set<StreamMeasure>(["lat", "lon", "dist"]);

/**
 * Série allégée pour l'affichage : au plus `max` points, sans perdre les pics.
 *
 * La série est coupée en seaux de même nombre de points ; chaque seau donne
 * deux points (son premier et son dernier instant). Pour chaque mesure, l'un
 * porte le minimum du seau et l'autre le maximum, dans l'ordre où ils sont
 * arrivés : un pic de FC ou un creux d'allure reste visible. Les mesures sans
 * aucune valeur restent `null` (« — »). Latitude / longitude ne sont pas des
 * courbes : on garde le point réel (premier et dernier du seau).
 */
export function downsampleStream(stream: ActivityStream, max = DISPLAY_MAX_POINTS): ActivityStream {
  const n = stream.t.length;
  if (n <= max) return stream;
  const buckets = Math.max(1, Math.floor(max / 2));
  const size = Math.ceil(n / buckets);

  const out = { t: [] as number[], timer: stream.timer ? ([] as Array<number | null>) : null } as ActivityStream;
  for (const m of STREAM_MEASURES) out[m] = stream[m] ? [] : null;

  for (let a = 0; a < n; a += size) {
    const b = Math.min(n, a + size) - 1;
    out.t.push(stream.t[a]);
    if (b !== a) out.t.push(stream.t[b]);
    if (out.timer && stream.timer) {
      out.timer.push(stream.timer[a]);
      if (b !== a) out.timer.push(stream.timer[b]);
    }
    for (const m of STREAM_MEASURES) {
      const col = stream[m];
      const dst = out[m];
      if (!col || !dst) continue;
      if (b === a) {
        dst.push(col[a]);
        continue;
      }
      if (POSITION.has(m)) {
        dst.push(col[a], col[b]);
        continue;
      }
      let iMin = -1;
      let iMax = -1;
      for (let i = a; i <= b; i++) {
        const v = col[i];
        if (v === null || v === undefined) continue;
        if (iMin < 0 || v < (col[iMin] as number)) iMin = i;
        if (iMax < 0 || v > (col[iMax] as number)) iMax = i;
      }
      if (iMin < 0) dst.push(null, null);
      else if (iMin <= iMax) dst.push(col[iMin], col[iMax]);
      else dst.push(col[iMax], col[iMin]);
    }
  }
  return out;
}
