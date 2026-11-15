/**
 * Import d'un résultat HYROX collé par l'athlète (page de résultat de
 * results.hyrox.com, copiée en entier ou en partie, ou texte d'une capture
 * d'écran).
 *
 * Agon ne va jamais chercher la page lui-même : HYROX interdit l'extraction
 * de sa base de résultats (mises en demeure d'octobre 2026). C'est l'athlète
 * qui copie son propre résultat et le colle ici.
 *
 * Formats reconnus :
 * - copie d'ordinateur : « libellé ⇥ valeur » sur une ligne ;
 * - copie de téléphone : libellé puis valeur sur la ligne suivante ;
 * - texte d'une capture (colonnes) : tous les libellés, puis tous les temps.
 *
 * Seul le tableau « Workout summary » donne les temps des segments ; le
 * tableau « Race replay » (« 1000m SkiErg In », « Rox Out »…) est ignoré.
 *
 * Pur et testé. Aucune lecture en base ici.
 */

import { parseMmSs } from "@/lib/time";
import {
  RACE_ORDER,
  type HyroxDivision,
  type HyroxFormat,
  type HyroxResult,
  type HyroxStatus,
  type SegmentKey,
} from "@/features/shared/types/hyrox";
import type { Competition } from "@/types/planning";

export type ImportedGender = "men" | "women" | "mixed";

export interface ParsedHyroxPage {
  /** Temps par segment (8 runs, 8 stations, Roxzone), en secondes. Absent = non trouvé. */
  segments: Partial<Record<SegmentKey, number>>;
  /** Chrono officiel (« Overall Time ») ; null si absent du texte. */
  officialTotalS: number | null;
  /** « HYROX Bordeaux » (d'après « Race 2026 Bordeaux »). */
  eventName: string | null;
  /** « Bordeaux ». */
  venue: string | null;
  year: number | null;
  /** Jour de la vague (0 = dimanche … 6 = samedi), d'après « HYROX PRO - Saturday ». */
  weekday: number | null;
  /** Libellé brut de la division (« HYROX PRO DOUBLES - Saturday »). */
  divisionText: string | null;
  format: HyroxFormat | null;
  pro: boolean;
  adaptive: boolean;
  /** Seulement si le texte le dit (« Men », « Women », « Mixed ») ; la page officielle ne le dit pas. */
  gender: ImportedGender | null;
  ageGroup: string | null;
  /** « Rank (M/W) » : rang parmi les hommes ou les femmes. */
  rankOverall: number | null;
  rankAgeGroup: number | null;
  /** Pénalités en secondes ; 0 si la page indique « – » ; null si absent. */
  penaltiesS: number | null;
  status: HyroxStatus | null;
}

/** Écart toléré entre la somme des 17 temps et le chrono officiel (arrondis à la seconde de chaque segment). */
export const SUM_TOLERANCE_S = 20;

// ── Lecture du texte ─────────────────────────────────────────────────────────

const TIME_RE = /(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)/;
const TIME_LINE_RE = /^\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?\b/;
/** Ligne qui ne contient qu'un temps, suivi éventuellement de la place (« 00:04:06 7 », « 00:03:47 – »). */
const TIME_ONLY_RE = /^(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)(?:\s+(?:\d+|[-–—]))?$/;

const SEGMENT_LABELS: [RegExp, SegmentKey][] = [
  [/^(?:running|run|laufen|course)\s*1$/i, "run_1"],
  [/^(?:running|run|laufen|course)\s*2$/i, "run_2"],
  [/^(?:running|run|laufen|course)\s*3$/i, "run_3"],
  [/^(?:running|run|laufen|course)\s*4$/i, "run_4"],
  [/^(?:running|run|laufen|course)\s*5$/i, "run_5"],
  [/^(?:running|run|laufen|course)\s*6$/i, "run_6"],
  [/^(?:running|run|laufen|course)\s*7$/i, "run_7"],
  [/^(?:running|run|laufen|course)\s*8$/i, "run_8"],
  [/^(?:1\s*000\s*m\s*)?ski\s*-?\s*erg$/i, "ski"],
  [/^(?:50\s*m\s*)?sled\s*push$/i, "sled_push"],
  [/^(?:50\s*m\s*)?sled\s*pull$/i, "sled_pull"],
  [/^(?:80\s*m\s*)?burpees?\s*broad\s*jumps?$/i, "bbj"],
  [/^(?:1\s*000\s*m\s*)?row(?:ing)?$/i, "row"],
  [/^(?:200\s*m\s*)?farmers?'?\s*carry$/i, "farmers"],
  [/^(?:100\s*m\s*)?(?:sandbag\s*)?lunges?$/i, "lunges"],
  [/^(?:100\s*)?wall\s*balls?$/i, "wall_balls"],
  [/^roxzone(?:\s*time)?$/i, "roxzone_total"],
];

const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
};

/** « 00:04:06 » → 246 ; « 4:06 » → 246 ; « 1:05:28 » → 3928. */
const toSeconds = (raw: string): number | null => parseMmSs(raw);

function segmentKeyOf(label: string): SegmentKey | null {
  const clean = label.replace(/\s+/g, " ").trim();
  if (!clean || /\b(?:in|out)$/i.test(clean)) return null;
  for (const [re, key] of SEGMENT_LABELS) if (re.test(clean)) return key;
  return null;
}

/** Sépare « libellé ⇥ valeur » (tabulation ou 2 espaces et plus). */
function splitField(line: string): [string, string] | null {
  const m = line.match(/^(.+?)(?:\t+|\s{2,})(.+)$/);
  return m ? [m[1].trim(), m[2].trim()] : null;
}

const EMPTY_VALUE = /^[-–—]?$/;

/**
 * Lit le texte collé. Renvoie `null` si rien d'utile n'est reconnu
 * (ni temps de segment, ni chrono officiel).
 */
export function parseResultPage(raw: string): ParsedHyroxPage | null {
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/\u00a0/g, " ").trim()).filter(Boolean);
  const out: ParsedHyroxPage = {
    segments: {}, officialTotalS: null, eventName: null, venue: null, year: null, weekday: null,
    divisionText: null, format: null, pro: false, adaptive: false, gender: null, ageGroup: null,
    rankOverall: null, rankAgeGroup: null, penaltiesS: null, status: null,
  };
  let replayTotalS: number | null = null;
  // Libellés de segment sans temps sur leur ligne (texte de capture en colonnes).
  const pendingLabels: SegmentKey[] = [];
  const looseTimes: number[] = [];
  let inReplay = false;

  /** Valeur d'un champ : sur la même ligne, ou sur la ligne suivante si le libellé est seul. */
  const valueOf = (i: number, label: RegExp): string | null => {
    const line = lines[i];
    const f = splitField(line);
    if (f && label.test(f[0])) return f[1];
    if (label.test(line)) return lines[i + 1] ?? null;
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^race\s*replay/i.test(line)) inReplay = true;
    if (/^workout\s*summary/i.test(line)) inReplay = false;

    // ── Champs de l'en-tête ──
    const race = valueOf(i, /^(?:race|event|course)$/i);
    if (race && out.year == null) {
      const m = race.match(/^(\d{4})\s+(.+)$/);
      if (m) {
        out.year = Number(m[1]);
        const name = m[2].replace(/^hyrox\s+/i, "").trim();
        out.venue = name.split(/\s+[-–]\s+/)[0].trim() || null;
        out.eventName = `HYROX ${name}`;
        continue;
      }
    }
    const division = valueOf(i, /^division$/i);
    if (division && out.divisionText == null && /hyrox/i.test(division)) {
      readDivision(division, out);
      continue;
    }
    const ag = valueOf(i, /^age\s*group$/i);
    if (ag && out.ageGroup == null && /^(?:\d{2}\s*[-–]\s*\d{2}|\d{2}\+|U\d{2})$/i.test(ag)) {
      out.ageGroup = ag.replace(/\s*[-–]\s*/, "-");
      continue;
    }
    const rankMW = valueOf(i, /^rank\s*\((?:m\/w|m\/f|h\/f|overall|gender)\)$/i);
    if (rankMW != null && out.rankOverall == null) {
      if (/^\d+$/.test(rankMW)) out.rankOverall = Number(rankMW);
      continue;
    }
    const rankAG = valueOf(i, /^rank\s*\((?:ag|age\s*group)\)$/i);
    if (rankAG != null && out.rankAgeGroup == null) {
      if (/^\d+$/.test(rankAG)) out.rankAgeGroup = Number(rankAG);
      continue;
    }
    const overall = valueOf(i, /^(?:overall|finish|net)\s*time$/i);
    if (overall != null && out.officialTotalS == null) {
      const t = overall.match(TIME_LINE_RE);
      if (t) { out.officialTotalS = toSeconds(t[0]); continue; }
      if (/^dnf$/i.test(overall)) { out.status = "dnf"; continue; }
      if (/^(?:dsq|dq)$/i.test(overall)) { out.status = "dq"; continue; }
    }
    const penalty = valueOf(i, /^\*?\s*penalt(?:y|ies)$/i);
    if (penalty != null && out.penaltiesS == null) {
      const t = penalty.match(TIME_LINE_RE);
      out.penaltiesS = t ? toSeconds(t[0]) : EMPTY_VALUE.test(penalty) ? 0 : null;
      continue;
    }
    const dq = valueOf(i, /^disqual(?:ification)?\s*reason$/i);
    if (dq != null) {
      if (!EMPTY_VALUE.test(dq)) out.status = "dq";
      continue;
    }

    // ── Temps des segments ──
    const tm = line.match(TIME_RE);
    const label = tm ? line.slice(0, tm.index).trim() : line;
    if (/^total$/i.test(label) && tm) {
      replayTotalS ??= toSeconds(tm[1]);
      continue;
    }
    if (inReplay) continue;
    const key = segmentKeyOf(label);
    if (key) {
      if (out.segments[key] != null) continue;
      if (tm) {
        const s = toSeconds(tm[1]);
        if (s != null) out.segments[key] = s;
      } else {
        // Temps sur la ligne suivante (copie de téléphone) ?
        const t = lines[i + 1]?.match(TIME_ONLY_RE);
        if (t) {
          const s = toSeconds(t[1]);
          if (s != null) out.segments[key] = s;
          i++;
        } else {
          pendingLabels.push(key);
        }
      }
      continue;
    }
    const loose = pendingLabels.length > 0 ? line.match(TIME_ONLY_RE) : null;
    if (loose) {
      const s = toSeconds(loose[1]);
      if (s != null) looseTimes.push(s);
    }
  }

  // Texte en colonnes : libellés dans l'ordre, puis temps dans le même ordre.
  if (pendingLabels.length > 0 && looseTimes.length >= pendingLabels.length) {
    pendingLabels.forEach((key, idx) => {
      if (out.segments[key] == null) out.segments[key] = looseTimes[idx];
    });
  }

  out.officialTotalS ??= replayTotalS;
  const found = Object.keys(out.segments).length;
  if (found === 0 && out.officialTotalS == null) return null;
  return out;
}

function readDivision(text: string, out: ParsedHyroxPage): void {
  out.divisionText = text;
  const up = text.toUpperCase();
  out.pro = /\bPRO\b/.test(up);
  out.adaptive = /\bADAPTIVE\b/.test(up);
  out.format = /\bRELAY\b/.test(up) ? "relay" : /\bDOUBLES?\b/.test(up) ? "doubles" : "solo";
  out.gender = /\bMIXED\b/.test(up) ? "mixed" : /\bWOMEN\b|\bFEMMES?\b/.test(up) ? "women" : /\bMEN\b|\bHOMMES?\b/.test(up) ? "men" : null;
  const day = text.match(/[-–]\s*([A-Za-zé]+)\s*$/);
  const wd = day ? WEEKDAYS[day[1].toLowerCase()] : undefined;
  out.weekday = wd ?? null;
}

// ── Calculs ──────────────────────────────────────────────────────────────────

/** Somme des 17 temps (8 runs, 8 stations, Roxzone) ; null s'il en manque un. */
export function segmentsSum(segments: Partial<Record<SegmentKey, number | null>>): number | null {
  const keys: SegmentKey[] = [...RACE_ORDER, "roxzone_total"];
  let sum = 0;
  for (const k of keys) {
    const v = segments[k];
    if (v == null) return null;
    sum += v;
  }
  return sum;
}

/**
 * Écart (somme des temps − chrono officiel) quand il dépasse la tolérance des
 * arrondis ; null si tout colle ou si on ne peut pas comparer.
 */
export function sumMismatch(
  segments: Partial<Record<SegmentKey, number | null>>,
  totalS: number | null,
  penaltiesS = 0,
): number | null {
  const sum = segmentsSum(segments);
  if (sum == null || totalS == null || totalS <= 0) return null;
  const gap = sum + penaltiesS - totalS;
  return Math.abs(gap) > SUM_TOLERANCE_S ? gap : null;
}

/** Genre déduit des courses précédentes de l'athlète (la page officielle ne l'indique pas). */
export function genderFromRaces(races: Pick<HyroxResult, "division">[]): "men" | "women" | null {
  for (const r of races) {
    if (/(^|_)women/.test(r.division)) return "women";
    if (/(^|_)men/.test(r.division)) return "men";
  }
  return null;
}

/** Division Agon d'après la page ; `guessed` si le genre vient d'ailleurs que du texte. */
export function divisionFor(
  p: Pick<ParsedHyroxPage, "format" | "pro" | "adaptive" | "gender">,
  fallback: "men" | "women" | null,
): { division: HyroxDivision; guessed: boolean } {
  if (p.adaptive) return { division: "adaptive", guessed: false };
  const g = p.gender ?? fallback ?? "men";
  // La page officielle ne donne pas le genre : celui des courses précédentes vaut pour le solo,
  // pas pour un duo ou un relais (qui peuvent être mixtes).
  const guessed = p.gender == null && (fallback == null || p.format === "doubles" || p.format === "relay");
  if (p.format === "doubles") {
    if (g === "mixed") return { division: "doubles_mixed", guessed };
    return { division: (p.pro ? `doubles_${g}_pro` : `doubles_${g}`) as HyroxDivision, guessed };
  }
  if (p.format === "relay") return { division: `relay_${g}` as HyroxDivision, guessed };
  if (g === "mixed") return { division: p.pro ? "men_pro" : "men", guessed: true };
  return { division: (p.pro ? `${g}_pro` : g) as HyroxDivision, guessed };
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Jour de la semaine (0 = dimanche) d'une date "YYYY-MM-DD". */
function weekdayOf(day: string): number {
  return new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))).getUTCDay();
}

function addDays(day: string, n: number): string {
  const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + n));
  return d.toISOString().slice(0, 10);
}

/**
 * Compétition du calendrier de l'athlète qui correspond au résultat : même
 * année, ville dans le nom ou le lieu, déjà passée (aujourd'hui compris), non
 * annulée. Sur plusieurs jours, la date prise est celle du jour de la vague.
 */
export function matchCompetition(
  comps: Pick<Competition, "id" | "name" | "location" | "date" | "date_end" | "cancelled_at">[],
  p: Pick<ParsedHyroxPage, "venue" | "year" | "weekday">,
  today: string,
): { competitionId: string; date: string } | null {
  if (!p.venue) return null;
  const venue = norm(p.venue);
  if (!venue) return null;
  const hits = comps.filter((c) => {
    if (c.cancelled_at || c.date > today) return false;
    if (p.year != null && Number(c.date.slice(0, 4)) !== p.year) return false;
    return norm(`${c.name} ${c.location ?? ""}`).includes(venue);
  });
  if (hits.length === 0) return null;
  const c = hits.reduce((a, b) => (b.date > a.date ? b : a));
  let date = c.date;
  if (p.weekday != null && c.date_end && c.date_end > c.date) {
    for (let d = c.date; d <= c.date_end; d = addDays(d, 1)) {
      if (weekdayOf(d) === p.weekday) { date = d; break; }
    }
  }
  return { competitionId: c.id, date: date > today ? today : date };
}

/**
 * Course déjà enregistrée qui correspond au résultat collé : même chrono (à
 * 2 s près) et même date, ou même chrono et même événement la même année.
 */
export function findDuplicateRace<R extends Pick<HyroxResult, "id" | "date" | "event_name" | "total_s">>(
  races: R[],
  p: Pick<ParsedHyroxPage, "officialTotalS" | "eventName" | "year">,
  date: string | null,
): R | null {
  if (p.officialTotalS == null) return null;
  const total = p.officialTotalS;
  return races.find((r) => {
    if (Math.abs(r.total_s - total) > 2) return false;
    if (date && r.date === date) return true;
    return p.eventName != null && norm(r.event_name) === norm(p.eventName)
      && (p.year == null || Number(r.date.slice(0, 4)) === p.year);
  }) ?? null;
}

// ── Vers le formulaire ───────────────────────────────────────────────────────

export interface RaceImport {
  date: string | null;
  competitionId: string | null;
  eventName: string | null;
  venue: string | null;
  format: HyroxFormat | null;
  division: HyroxDivision;
  /** La page indiquait la division (pro, duo, relais…). */
  divisionFound: boolean;
  divisionGuessed: boolean;
  ageGroup: string | null;
  status: HyroxStatus;
  totalS: number | null;
  segments: Partial<Record<SegmentKey, number>>;
  penaltiesS: number | null;
  rankOverall: number | null;
  rankAgeGroup: number | null;
  /** Champs à compléter ou vérifier, dans l'ordre du formulaire. */
  missing: string[];
}

/** Prépare la fiche pré-remplie. Le total est le chrono officiel, sinon la somme des temps. */
export function toRaceImport(
  p: ParsedHyroxPage,
  ctx: { fallbackGender: "men" | "women" | null; match: { competitionId: string; date: string } | null },
): RaceImport {
  const { division, guessed } = divisionFor(p, ctx.fallbackGender);
  const sum = segmentsSum(p.segments);
  const totalS = p.officialTotalS ?? sum;
  const missing: string[] = [];
  if (!ctx.match) missing.push("Date");
  if (!p.eventName) missing.push("Événement");
  if (guessed || !p.divisionText) missing.push("Division");
  if (totalS == null) missing.push("Temps total");
  const absent = [...RACE_ORDER, "roxzone_total" as const].filter((k) => p.segments[k] == null);
  if (absent.length > 0) missing.push(absent.length === 17 ? "Temps des segments" : `${absent.length} temps de segment`);
  return {
    date: ctx.match?.date ?? null,
    competitionId: ctx.match?.competitionId ?? null,
    eventName: p.eventName,
    venue: p.venue,
    format: p.format,
    division,
    divisionFound: p.divisionText != null,
    divisionGuessed: guessed || !p.divisionText,
    ageGroup: p.ageGroup,
    status: p.status ?? "finished",
    totalS,
    segments: p.segments,
    penaltiesS: p.penaltiesS,
    rankOverall: p.rankOverall,
    rankAgeGroup: p.rankAgeGroup,
    missing,
  };
}

/** Durée dans une phrase : « 9 s », « 1 min 07 s ». */
export function durationPhrase(s: number): string {
  const a = Math.abs(Math.round(s));
  if (a < 60) return `${a} s`;
  return `${Math.floor(a / 60)} min ${String(a % 60).padStart(2, "0")} s`;
}
