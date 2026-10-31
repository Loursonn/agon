/**
 * Outils de validation des propositions de l'assistant IA d'un coach.
 *
 * Chaque erreur nomme le chemin du champ fautif (`ops[2].steps[0].target.min`)
 * pour que l'assistant corrige seul et renvoie. Module pur, partagé par
 * `coachApiOps.ts` et `coachApiEnergy.ts`.
 */

export type Obj = Record<string, unknown>;

export function isObj(v: unknown): v is Obj {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Erreur de validation, avec le chemin du champ fautif. */
export class Invalid extends Error {}

export function fail(path: string, msg: string): never {
  throw new Invalid(`${path} : ${msg}`);
}

export function onlyKeys(o: Obj, allowed: readonly string[], path: string) {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) fail(`${path}.${k}`, `champ inconnu (attendus : ${allowed.join(", ")})`);
  }
}

/**
 * Texte libre : sans caractères de contrôle, borné. Ce texte sera affiché au
 * coach puis, s'il applique, à l'athlète — il ne doit rien contenir qu'un
 * humain n'ait pas pu taper.
 */
export function cleanText(v: unknown, max: number, path: string): string {
  if (typeof v !== "string") fail(path, "texte attendu");
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (s.length > max) fail(path, `${max} caractères maximum (reçu ${s.length})`);
  return s;
}

export function reqText(v: unknown, max: number, path: string): string {
  const s = cleanText(v, max, path);
  if (!s) fail(path, "ne peut pas être vide");
  return s;
}

export function int(v: unknown, min: number, max: number, path: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    fail(path, `entier entre ${min} et ${max} attendu`);
  }
  return v;
}

export function num(v: unknown, min: number, max: number, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
    fail(path, `nombre entre ${min} et ${max} attendu`);
  }
  return Math.round(v * 100) / 100;
}

export function id(v: unknown, path: string): string {
  if (typeof v !== "string" || !v || v.length > 64) fail(path, "identifiant attendu");
  return v;
}

/** Valeur prise dans une liste fermée. */
export function oneOf<T extends string>(v: unknown, list: readonly T[], path: string): T {
  if (typeof v !== "string" || !list.includes(v as T)) fail(path, `${list.join(", ")} attendu`);
  return v as T;
}
