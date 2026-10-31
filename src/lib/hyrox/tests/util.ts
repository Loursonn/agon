/** Petits outils numériques du moteur Tests HYROX. */

/** Nombre fini ou null (jamais NaN ni Infinity). */
export function num(x: unknown): number | null {
  if (x === undefined || x === null || x === "") return null;
  const v = typeof x === "number" ? x : parseFloat(String(x).replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

/** Positif strict ou null. */
export function pos(x: unknown): number | null {
  const v = num(x);
  return v != null && v > 0 ? v : null;
}

/** Régression linéaire y = a + b·x. null si moins de 2 points ou x constants. */
export function linreg(points: ReadonlyArray<readonly [number, number]>): { a: number; b: number; r2: number; n: number } | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of points) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  if (!(sxx > 0)) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b, r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 1, n };
}

/** Interpolation linéaire par morceaux (extrapolation sur les segments extrêmes). */
export function lin(x: number, xs: ReadonlyArray<number>, ys: ReadonlyArray<number>): number {
  let i = 1;
  while (i < xs.length - 1 && x > xs[i]) i++;
  return ys[i - 1] + ((x - xs[i - 1]) * (ys[i] - ys[i - 1])) / (xs[i] - xs[i - 1]);
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

/**
 * « m:ss » ou « h:mm:ss » depuis des secondes. « — » si inconnu.
 * floor : secondes tronquées (prédictions de course, comme l'outil de référence).
 */
export function fmtTime(s: number | null | undefined, opts: { floor?: boolean } = {}): string {
  if (s == null || !Number.isFinite(s)) return "—";
  const r = opts.floor ? Math.floor(s) : Math.round(s);
  const h = Math.floor(r / 3600), m = Math.floor((r % 3600) / 60), sec = r % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** « h:mm » arrondi à la minute (chronos HYROX). */
export function fmtHm(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "—";
  const m = Math.round(s / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** Allure « m:ss » par km depuis une vitesse en km/h. */
export function fmtPace(kmh: number | null | undefined): string {
  if (kmh == null || !(kmh > 0)) return "—";
  const s = 3600 / kmh, m = Math.floor(s / 60), r = Math.round(s - m * 60);
  return r === 60 ? `${m + 1}:00` : `${m}:${String(r).padStart(2, "0")}`;
}

/** Nombre à la française : virgule décimale. */
export function fr(x: number | null | undefined, digits = 1): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return x.toFixed(digits).replace(".", ",");
}

/** « m:ss » -> secondes (accepte aussi un nombre de secondes). */
export function parseTime(x: unknown): number | null {
  if (x === undefined || x === null || x === "") return null;
  const s = String(x).trim();
  if (s.includes(":")) {
    const parts = s.split(":").map(p => parseFloat(p.replace(",", ".")));
    if (parts.some(p => !Number.isFinite(p))) return null;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  return num(s);
}

/** Indice de symétrie : côté faible / côté fort. */
export function lsi(a: number | null, b: number | null): number | null {
  if (a == null || b == null || Math.max(a, b) <= 0) return null;
  return Math.min(a, b) / Math.max(a, b);
}

export function minNullable(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}
