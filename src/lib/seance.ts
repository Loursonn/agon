/**
 * Onglet « Séance » d'une activité de montre (P33) : mise en forme et calculs
 * purs du graphique, du tableau des tours et du mode « Modifier les tours ».
 *
 * Règles d'affichage (brief P40) :
 * - une mesure absente s'affiche « — », jamais 0 ;
 * - les 3 couleurs de zone sont les mêmes partout (graphique, barre, tableau,
 *   carte du planning) : `zoneColor` ;
 * - l'allure est en min'ss par km, la durée en m:ss (h:mm:ss au-delà d'une heure).
 */

import type { ActivityStream } from "@shared/activityFiles/stream";
import type { ExpectedBlock } from "@shared/domain/hyroxLaps";
import { token } from "@/lib/theme";

export const DASH = "—";

// ── Couleurs ────────────────────────────────────────────────────────────────

/** Zone 1 (sous SV1) · Zone 2 (SV1 → SV2) · Zone 3 (au-dessus de SV2). */
export const ZONE_COLORS_3 = [token("--agon-zone-1"), token("--agon-zone-2"), token("--agon-zone-3")];
/**
 * Couleurs des zones, du froid au chaud, cohérentes avec les 3 zones
 * (vert / orange / rouge). Un seul endroit dans le code.
 * - 5 zones : bleu, vert, or, orange, rouge ;
 * - 7 zones : bleu, turquoise, vert, or, orange, rouge, rose.
 */
export const ZONE_COLORS_5 = [token("--agon-info"), token("--agon-zone-1"), token("--agon-accent"), token("--agon-zone-2"), token("--agon-zone-3")];
export const ZONE_COLORS_7 = [
  token("--agon-info"), token("--agon-cadence"), token("--agon-zone-1"), token("--agon-accent"),
  token("--agon-zone-2"), token("--agon-zone-3"), token("--agon-amethyste-vif"),
];

export const SERIES_COLORS = {
  pace: token("--agon-info"),
  cadence: token("--agon-cadence"),
  altitude: token("--agon-pierre"),
  power: token("--agon-amethyste"),
} as const;

/** Couleur de la zone `zone` (1..n) dans un modèle à `n` zones. */
export function zoneColor(zone: number | null | undefined, n = 3): string {
  if (!zone || zone < 1) return token("--agon-pierre");
  if (n <= 3) return ZONE_COLORS_3[Math.min(zone, 3) - 1];
  if (n === 5) return ZONE_COLORS_5[Math.min(zone, 5) - 1];
  if (n === 7) return ZONE_COLORS_7[Math.min(zone, 7) - 1];
  // Autre nombre de zones : réparties sur la suite à 7 couleurs.
  const i = Math.round(((zone - 1) / Math.max(1, n - 1)) * (ZONE_COLORS_7.length - 1));
  return ZONE_COLORS_7[Math.min(ZONE_COLORS_7.length - 1, Math.max(0, i))];
}

// ── Formats ────────────────────────────────────────────────────────────────

const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** 2890 → « 48:10 » ; 3725 → « 1:02:05 ». */
export function fmtClock(s: number | null | undefined): string {
  if (!ok(s) || s < 0) return DASH;
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Lecture d'un temps tapé « 20:30 », « 1:02:05 » ou « 90 » (secondes). `null` si illisible. */
export function parseClock(text: string): number | null {
  const parts = text.trim().split(":").map((p) => p.trim());
  if (parts.length === 0 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

/** 390 s/km → « 6'30 ». */
export function fmtPace(sPerKm: number | null | undefined): string {
  if (!ok(sPerKm) || sPerKm <= 0) return DASH;
  const t = Math.round(sPerKm);
  return `${Math.floor(t / 60)}'${String(t % 60).padStart(2, "0")}`;
}

/** Vitesse en km/h depuis une allure (s/km) : 133 → « 27,1 ». Pour le vélo. */
export function fmtSpeedFromPace(sPerKm: number | null | undefined): string {
  if (!ok(sPerKm) || sPerKm <= 0) return DASH;
  return (3600 / sPerKm).toFixed(1).replace(".", ",");
}

/** Allure (« 4'36 ») ou vitesse (« 27,1 ») selon le sport. */
export function fmtPaceOrSpeed(sPerKm: number | null | undefined, speed: boolean): string {
  return speed ? fmtSpeedFromPace(sPerKm) : fmtPace(sPerKm);
}

/** 7400 m → « 7,4 » (1 décimale) ; `digits` = 2 → « 7,40 ». */
export function fmtKm(m: number | null | undefined, digits = 1): string {
  if (!ok(m)) return DASH;
  return (m / 1000).toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Entier arrondi ou « — ». */
export function fmtInt(v: number | null | undefined): string {
  return ok(v) ? Math.round(v).toLocaleString("fr-FR") : DASH;
}

/** « 18 / 17 » ; « — » si les deux manquent. */
export function fmtUpDown(up: number | null | undefined, down: number | null | undefined): string {
  if (!ok(up) && !ok(down)) return DASH;
  return `${fmtInt(up)} / ${fmtInt(down)}`;
}

/** 1533 s → « 25 min 33 s ». */
export function fmtMinSec(s: number | null | undefined): string {
  if (!ok(s)) return DASH;
  const t = Math.round(s);
  return `${Math.floor(t / 60)} min ${String(t % 60).padStart(2, "0")} s`;
}

/** Distance d'un bloc prévu : « 500 m », « 1 km », « 1,5 km ». */
export function fmtMeters(m: number | null | undefined): string {
  if (!ok(m)) return DASH;
  if (m >= 1000) return `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km`;
  return `${Math.round(m).toLocaleString("fr-FR")} m`;
}

const DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const DAYS_LONG = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « 18 h 30 » (heure locale du navigateur). */
export function fmtHour(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${d.getHours()} h ${String(d.getMinutes()).padStart(2, "0")}`;
}

/** « mar. 10 nov. · 18 h 30 ». */
export function fmtStart(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${fmtHour(iso)}`;
}

/** Jour « YYYY-MM-DD » → « mardi 10 novembre ». */
export function fmtDayLong(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${DAYS_LONG[date.getUTCDay()]} ${d} ${MONTHS_LONG[m - 1]}`;
}

/** Jour « YYYY-MM-DD » → « MAR. 10 » (carte du planning). */
export function fmtDayShort(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${DAYS[date.getUTCDay()].toUpperCase()} ${d}`;
}

// ── Sport ─────────────────────────────────────────────────────────────────

export type SportFamily = "run" | "hyrox" | "bike" | "row" | "other";

export function sportFamily(sport: string | null | undefined): SportFamily {
  const s = (sport ?? "").toLowerCase();
  if (s.includes("hyrox")) return "hyrox";
  if (s.includes("run") || s === "walking" || s === "hiking") return "run";
  if (s.includes("cycl") || s.includes("bik")) return "bike";
  if (s.includes("row")) return "row";
  return "other";
}

/** Libellé court de la pastille d'en-tête : « Course », « HYROX », « Vélo »… */
export function sportBadge(sport: string | null | undefined): string {
  switch (sportFamily(sport)) {
    case "run": return sport === "walking" ? "Marche" : sport === "hiking" ? "Randonnée" : "Course";
    case "hyrox": return "HYROX";
    case "bike": return "Vélo";
    case "row": return "Rameur";
    default: return "Activité";
  }
}

// ── Série : allure et axes ────────────────────────────────────────────────

/** En dessous (≈ 16'40/km), pas d'allure : arrêt, station HYROX, marche lente. */
export const MIN_PACE_SPEED = 1;

/** Allure (s/km) de chaque point ; `null` à l'arrêt ou dans une station. */
export function paceSeries(
  speed: ReadonlyArray<number | null> | null,
  t: readonly number[],
  stationRanges: ReadonlyArray<{ startS: number; endS: number }> = [],
): Array<number | null> | null {
  if (!speed) return null;
  return speed.map((v, i) => {
    if (!ok(v) || v < MIN_PACE_SPEED) return null;
    const ti = t[i];
    if (stationRanges.some((r) => ti >= r.startS && ti < r.endS)) return null;
    return 1000 / v;
  });
}

/** Bornes d'un axe : 2ᵉ et 98ᵉ centiles (un pic isolé n'écrase pas la courbe), avec une marge. */
export function robustDomain(
  values: ReadonlyArray<number | null> | null,
  opts: { pad?: number; minSpan?: number } = {},
): [number, number] | null {
  if (!values) return null;
  const v = values.filter(ok).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const q = (p: number) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  let lo = q(0.02);
  let hi = q(0.98);
  const minSpan = opts.minSpan ?? 1;
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const pad = (hi - lo) * (opts.pad ?? 0.08);
  return [lo - pad, hi + pad];
}

/** Indice du point le plus proche de `x` dans `xs` (croissant). */
export function nearestIndex(xs: readonly number[], x: number): number {
  if (xs.length === 0) return -1;
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  return Math.abs(xs[hi] - x) < Math.abs(xs[lo] - x) ? hi : lo;
}

/**
 * Chemin SVG d'une série : une coupure à chaque valeur absente (la courbe
 * s'interrompt, elle ne descend jamais à 0). Seuls les points de [x0, x1] (plus
 * un de chaque côté) sont tracés.
 */
export function linePath(
  xs: readonly number[],
  ys: ReadonlyArray<number | null>,
  sx: (x: number) => number,
  sy: (y: number) => number,
  range?: { x0: number; x1: number },
): string {
  let d = "";
  let pen = false;
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i++) {
    if (range) {
      const next = xs[i + 1];
      const prev = xs[i - 1];
      if (next !== undefined && next < range.x0) continue;
      if (prev !== undefined && prev > range.x1) break;
    }
    const y = ys[i];
    if (!ok(y)) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${sx(xs[i]).toFixed(1)},${sy(y).toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** Aire (altitude) : fermée sur la ligne de base `baseY`, coupée sur les trous. */
export function areaPath(
  xs: readonly number[],
  ys: ReadonlyArray<number | null>,
  sx: (x: number) => number,
  sy: (y: number) => number,
  baseY: number,
): string {
  let d = "";
  let run: string[] = [];
  let firstX = 0;
  let lastX = 0;
  const flush = () => {
    if (run.length > 1) d += `M${firstX.toFixed(1)},${baseY}L${run.join("L")}L${lastX.toFixed(1)},${baseY}Z`;
    run = [];
  };
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const y = ys[i];
    if (!ok(y)) {
      flush();
      continue;
    }
    const px = sx(xs[i]);
    if (run.length === 0) firstX = px;
    lastX = px;
    run.push(`${px.toFixed(1)},${sy(y).toFixed(1)}`);
  }
  flush();
  return d;
}

/** Suites de points consécutifs de même zone : couleur de la courbe de FC et bande des zones. */
export interface ZoneRun {
  from: number;
  to: number;
  zone: number | null;
}

export function zoneRuns(zones: ReadonlyArray<number | null> | null): ZoneRun[] {
  if (!zones || zones.length === 0) return [];
  const out: ZoneRun[] = [];
  let start = 0;
  for (let i = 1; i <= zones.length; i++) {
    if (i === zones.length || zones[i] !== zones[start]) {
      out.push({ from: start, to: i - 1, zone: zones[start] });
      start = i;
    }
  }
  return out;
}

/** Abscisse de chaque point : temps (s) ou distance (m). Distance absente → temps. */
export function xAxisValues(stream: Pick<ActivityStream, "t" | "dist">, axis: "time" | "distance"): number[] {
  if (axis === "distance" && stream.dist && stream.dist.some(ok)) {
    let last = 0;
    return stream.dist.map((d) => (ok(d) ? (last = Math.max(last, d)) : last));
  }
  return [...stream.t];
}

/** Abscisse (temps ou distance) d'un instant donné en secondes. */
export function xAtTime(stream: Pick<ActivityStream, "t" | "dist">, xs: readonly number[], tS: number): number {
  const i = nearestIndex(stream.t, tS);
  return i < 0 ? tS : xs[i];
}

/** Graduations « jolies » d'un axe [a, b]. */
export function niceTicks(a: number, b: number, count = 5): number[] {
  if (!(b > a)) return [a];
  const raw = (b - a) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw * 0.75) ?? raw; // ≈ count graduations, un peu plus plutôt que moitié moins
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

// ── Tours ─────────────────────────────────────────────────────────────────

/** Noms affichés : un nom répété (« Sled push ») est numéroté « Sled push 1 », « Sled push 2 »… */
export function displayLapNames(laps: ReadonlyArray<{ name: string | null }>, fallback = "Tour"): string[] {
  const count = new Map<string, number>();
  for (const l of laps) {
    const k = l.name?.trim();
    if (k) count.set(k, (count.get(k) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return laps.map((l, i) => {
    const k = l.name?.trim();
    if (!k) return `${fallback} ${i + 1}`;
    if ((count.get(k) ?? 0) < 2 || /\d$/.test(k)) return k;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return `${k} ${n}`;
  });
}

export type LapKind = "run" | "station" | "rest" | "transition";

/** Nature d'un tour : bloc prévu d'abord, sinon d'après son nom. */
export function lapKind(
  lap: { name: string | null; plannedBlockRef: string | null },
  blocks: readonly ExpectedBlock[] | null,
): LapKind {
  const b = lap.plannedBlockRef ? blocks?.find((x) => x.ref === lap.plannedBlockRef) : undefined;
  const name = (lap.name ?? "").toLowerCase();
  if (/transition|roxzone/.test(name)) return "transition";
  if (b) return b.kind;
  if (/r[ée]cup|repos/.test(name)) return "rest";
  if (/course|run|footing|échauffement|retour au calme|^\d[\d\s]*m\b/.test(name)) return "run";
  return blocks?.length ? "station" : "run";
}

/** Prévu d'un bloc : « 500 m », « 10 reps », « 2:00 ». */
export function plannedLabel(b: ExpectedBlock | undefined | null): string {
  if (!b) return DASH;
  if (b.kind === "station" && b.reps) return `${b.reps} reps`;
  if (b.distanceM) return fmtMeters(b.distanceM);
  if (b.reps) return `${b.reps} reps`;
  if (b.durationS) return fmtClock(b.durationS);
  return DASH;
}

/**
 * Rythme d'une station : « 23,7 m/min » (distance) ou « 3,2 s/rep » (reps).
 * `null` si ni distance ni reps.
 */
export function stationRhythm(durationS: number, distanceM: number | null, reps: number | null): string | null {
  if (!(durationS > 0)) return null;
  if (reps && reps > 0) return `${(durationS / reps).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s/rep`;
  if (distanceM && distanceM > 0) {
    return `${((distanceM / durationS) * 60).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m/min`;
  }
  return null;
}

/** Résumé d'une séance prévue : « 4 × (500 m course + 15 m sled push + 10 wall balls) ». */
export function summarizeBlocks(blocks: readonly ExpectedBlock[] | null): string | null {
  if (!blocks?.length) return null;
  const label = (b: ExpectedBlock) => {
    const base = b.name.replace(/\s+\d+(?:[.,]\d+)?\s*k?m$/i, "").trim();
    const lower = base.charAt(0).toLowerCase() + base.slice(1);
    if (b.kind === "run") return b.distanceM ? `${fmtMeters(b.distanceM)} course` : "course";
    if (b.distanceM) return `${fmtMeters(b.distanceM)} ${lower}`;
    if (b.reps) return `${b.reps} ${lower}`;
    if (b.durationS) return `${fmtClock(b.durationS)} ${lower}`;
    return lower;
  };
  const items = blocks.filter((b) => b.kind !== "rest").map(label);
  const n = items.length;
  for (let p = 1; p <= n / 2; p++) {
    if (n % p !== 0) continue;
    const head = items.slice(0, p);
    if (items.every((v, i) => v === head[i % p])) return `${n / p} × (${head.join(" + ")})`;
  }
  return items.join(" + ");
}

// ── Mode « Modifier les tours » (purs, testés) ─────────────────────────────

export interface EditableLap {
  startS: number;
  endS: number;
  name: string | null;
}

/** Coupe le tour qui contient `atS` en deux. Rien si `atS` est trop près d'une limite (< 2 s). */
export function cutLapAt<T extends EditableLap>(laps: readonly T[], atS: number, make: (half: T, part: 0 | 1) => T): T[] {
  const t = Math.round(atS);
  const i = laps.findIndex((l) => t > l.startS && t < l.endS);
  if (i < 0) return [...laps];
  const l = laps[i];
  if (t - l.startS < 2 || l.endS - t < 2) return [...laps];
  const a = make({ ...l, endS: t }, 0);
  const b = make({ ...l, startS: t }, 1);
  return [...laps.slice(0, i), a, b, ...laps.slice(i + 1)];
}

/** Fusionne le tour `i` avec le suivant (le nom du premier est gardé). */
export function mergeWithNext<T extends EditableLap>(laps: readonly T[], i: number): T[] {
  if (i < 0 || i >= laps.length - 1) return [...laps];
  const merged = { ...laps[i], endS: laps[i + 1].endS };
  return [...laps.slice(0, i), merged, ...laps.slice(i + 2)];
}

/** Déplace la limite entre le tour `i` et le suivant ; bornée pour garder 1 s à chacun. */
export function moveBoundary<T extends EditableLap>(laps: readonly T[], i: number, toS: number): T[] {
  if (i < 0 || i >= laps.length - 1) return [...laps];
  const lo = laps[i].startS + 1;
  const hi = laps[i + 1].endS - 1;
  const t = Math.round(Math.min(hi, Math.max(lo, toS)));
  const out = [...laps];
  out[i] = { ...laps[i], endS: t };
  out[i + 1] = { ...laps[i + 1], startS: t };
  return out;
}

/** Modifie début ou fin d'un tour (saisie précise) : ses voisins suivent. */
export function setLapBounds<T extends EditableLap>(laps: readonly T[], i: number, startS: number, endS: number): T[] {
  let out = [...laps];
  if (i > 0) out = moveBoundary(out, i - 1, startS);
  if (i < out.length - 1) out = moveBoundary(out, i, endS);
  return out;
}

/** Indice du tour qui contient l'instant `tS` (le dernier si au-delà). */
export function lapIndexAt(laps: ReadonlyArray<{ startS: number; endS: number }>, tS: number): number {
  for (let i = 0; i < laps.length; i++) if (tS >= laps[i].startS && tS < laps[i].endS) return i;
  return laps.length && tS >= laps[laps.length - 1].endS ? laps.length - 1 : -1;
}

/** Partie [fromS, toS] d'une série (zoom sur un tour : on repart de la série complète). */
export function sliceStream(stream: ActivityStream, fromS: number, toS: number): ActivityStream {
  let a = 0;
  while (a < stream.t.length && stream.t[a] < fromS) a++;
  let b = a;
  while (b < stream.t.length && stream.t[b] <= toS) b++;
  const out = { ...stream, t: stream.t.slice(a, b), timer: stream.timer ? stream.timer.slice(a, b) : null } as ActivityStream;
  for (const k of Object.keys(stream) as Array<keyof ActivityStream>) {
    if (k === "t" || k === "timer") continue;
    const col = stream[k] as Array<number | null> | null;
    (out as Record<string, unknown>)[k] = col ? col.slice(a, b) : null;
  }
  return out;
}
