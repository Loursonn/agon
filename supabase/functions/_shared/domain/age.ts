/**
 * Âge minimum pour utiliser Agon (15 ans, annoncé par les CGU et la politique
 * de confidentialité, §9 « Mineurs »).
 *
 * Pur, sans dépendance : importé par le front (`@shared/domain/age`, via
 * `src/lib/age.ts`) et par l'Edge Function `claim-athlete`. Le même contrôle
 * existe en base (trigger `enforce_min_age_on_signup`, migration
 * 20261109160000) : celui-ci sert à prévenir AVANT de créer le compte
 * d'authentification.
 *
 * Né un 29 février : on a 15 ans le 1er mars les années non bissextiles
 * (même règle que `current_date - interval '15 years'` en SQL).
 */

export const MIN_AGE = 15;

export const MIN_AGE_MESSAGE = "Tu dois avoir au moins 15 ans pour utiliser Agon.";
export const INVALID_BIRTH_DATE_MESSAGE = "Date de naissance invalide.";
export const MISSING_BIRTH_DATE_MESSAGE = "Indique ta date de naissance.";

/** Plus ancienne date de naissance acceptée (au-delà : faute de frappe). */
export const OLDEST_BIRTH_DATE = "1900-01-01";

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" existant → [année, mois, jour] ; sinon null (2010-02-30, texte…). */
function parse(day: unknown): [number, number, number] | null {
  if (typeof day !== "string") return null;
  const m = ISO.exec(day.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return [y, mo, d];
}

/** Âge en années révolues au jour `today` ; null si une date est invalide ou si la naissance est après `today`. */
export function ageOn(birthDate: string, today: string): number | null {
  const b = parse(birthDate);
  const t = parse(today);
  if (!b || !t) return null;
  let age = t[0] - b[0];
  if (t[1] < b[1] || (t[1] === b[1] && t[2] < b[2])) age--;
  return age < 0 ? null : age;
}

/** A-t-on au moins `min` ans au jour `today` (dates "YYYY-MM-DD") ? Faux pour toute date invalide ou future. */
export function isOldEnough(birthDate: string, today: string, min: number = MIN_AGE): boolean {
  const age = ageOn(birthDate, today);
  return age !== null && age >= min;
}

/**
 * Contrôle de la date saisie à l'inscription. Renvoie le message à afficher,
 * ou null si la date est acceptée.
 */
export function birthDateError(birthDate: unknown, today: string, min: number = MIN_AGE): string | null {
  if (birthDate === null || birthDate === undefined || (typeof birthDate === "string" && birthDate.trim() === "")) {
    return MISSING_BIRTH_DATE_MESSAGE;
  }
  if (typeof birthDate !== "string") return INVALID_BIRTH_DATE_MESSAGE;
  const day = birthDate.trim();
  if (!parse(day) || day < OLDEST_BIRTH_DATE) return INVALID_BIRTH_DATE_MESSAGE;
  const age = ageOn(day, today);
  if (age === null) return INVALID_BIRTH_DATE_MESSAGE; // née après aujourd'hui
  return age >= min ? null : MIN_AGE_MESSAGE;
}
