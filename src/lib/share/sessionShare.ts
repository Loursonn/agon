/**
 * Partage d'une séance en story 9:16 (maquette « Partage de séance » du canvas,
 * validée par Hugo le 25/11/2026). Modèle commun aux trois types de séance :
 * les constructeurs (`buildMuscuShare`, `buildEnergyShare`) le remplissent,
 * `layoutShareCard` le met en page, le canvas le dessine. Rien n'est envoyé :
 * l'image est créée sur le téléphone.
 */

export type ShareKind = "muscu" | "energie" | "specifique";

/** Pastille d'une ligne : lettre de bloc (« A », « B1 »), point de station, rond de course, coche. */
export interface ShareBadge {
  text?: string;
  color: string;
  shape: "chip" | "dot" | "ring" | "check" | "miss";
}

/** Série faite (« 125×3 ») ; `strong` = mise en avant (record). */
export interface SharePill {
  text: string;
  strong?: boolean;
}

export interface ShareRow {
  badge?: ShareBadge;
  title: string;
  /** Petite ligne sous le titre (consigne courte, dose). Retirée en premier quand la place manque. */
  sub?: string | null;
  right?: string | null;
  rightSub?: string | null;
  rightSubColor?: string;
  /** Séries réalisées (muscu faite). Passent à la ligne autant qu'il faut. */
  pills?: SharePill[];
  /** Résumé des séries quand la place manque (« 5 séries · 120 → 125 kg × 3 »). */
  pillsSummary?: string;
  /** Badge or à droite du titre (« Record »). */
  tag?: string | null;
  /** Barre de proportion sous le titre (temps d'un segment HYROX), 0..1. */
  bar?: { value: number; color: string } | null;
  /** Ligne non faite : grisée. */
  dim?: boolean;
}

export interface ProfileBarSpec {
  /** Part de la largeur (somme ≈ 1). */
  width: number;
  /** Hauteur relative 0..1. */
  height: number;
  color: string;
  /** Petit texte au-dessus de la barre (allure d'une répétition). */
  label?: string | null;
}

export type ShareSection =
  | { type: "rows"; label?: string | null; right?: string | null; rows: ShareRow[] }
  | { type: "note"; label: string; text: string }
  | { type: "profile"; label: string; right?: string | null; bars: ProfileBarSpec[]; axis?: [string, string, string] | null }
  | { type: "zones"; label: string; zones: Array<{ label: string; value: string; share: number; color: string }> };

export interface ShareStat {
  value: string;
  unit?: string | null;
  label: string;
  color?: string;
}

export interface ShareCard {
  kind: ShareKind;
  done: boolean;
  /** Couleur du type de séance (bandeau du haut, accents). */
  accent: string;
  /** « Musculation · mar. 25 nov. » / « Faite · mar. 25 nov. » */
  kicker: string;
  /** « Séance de Léa » ; `null` = prénom masqué. */
  who: string | null;
  title: string;
  meta?: string | null;
  /** Gros chiffre (13,2 km, 33:56). */
  hero?: { value: string; unit?: string | null; caption?: string | null } | null;
  stats: ShareStat[];
  sections: ShareSection[];
  /** Commentaire de l'athlète, cité en bas (retiré si la place manque). */
  quote?: string | null;
  /** « Hugo T. » ; `null` = coach masqué. */
  coach: string | null;
  /** Coin bas droit (« Ma séance du jour », « 1 record »). */
  footerRight?: string | null;
}

/** Options choisies par l'athlète avant de partager. */
export interface ShareOptions {
  showName: boolean;
  showLoads: boolean;
  showCoach: boolean;
}

export const DEFAULT_SHARE_OPTIONS: ShareOptions = { showName: true, showLoads: true, showCoach: true };

/** « Hugo Tanguy » → « Hugo T. » ; « Hugo » → « Hugo » ; vide → null. */
export function coachLabel(fullName: string | null | undefined): string | null {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : null;
  return last ? `${first} ${last.charAt(0).toLocaleUpperCase("fr-FR")}.` : first;
}

/** Prénom de l'athlète (prénom saisi, sinon premier mot du nom complet). */
export function firstNameOf(firstName: string | null | undefined, fullName: string | null | undefined): string | null {
  const f = (firstName ?? "").trim();
  if (f) return f;
  const w = (fullName ?? "").trim().split(/\s+/)[0];
  return w || null;
}

const DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « 2026-11-25 » → « mer. 25 nov. » ; date illisible → null. */
export function shareDayLabel(day: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? "");
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Kicker du haut : « Musculation · mar. 25 nov. » avant, « Faite · mar. 25 nov. » après. */
export function shareKicker(typeLabel: string, done: boolean, day: string | null | undefined): string {
  const d = shareDayLabel(day);
  return [done ? "Faite" : typeLabel, d].filter(Boolean).join(" · ");
}

/** Nombre au format français, sans zéro inutile (« 12,5 », « 120 »). */
export function nf(v: number, digits = 1): string {
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return r.toLocaleString("fr-FR", { maximumFractionDigits: digits }).replace(/[\u202f\u00a0]/g, " ");
}
