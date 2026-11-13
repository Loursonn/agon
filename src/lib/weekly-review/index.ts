import { addDays, type IsoDay } from "@shared/domain/dates";
import { WELLNESS_ITEMS, type WellnessEntry, type WellnessItem } from "@shared/domain/wellness";
import type { Light } from "@shared/domain/wellnessLight";
import type { PlannedVsDoneDay } from "@/lib/plannedVsDone";

/**
 * Weekly review de l'athlète (P22) : calculs purs, sans React ni réseau.
 *
 * Semaine = lundi → dimanche. La review s'ouvre le dimanche et se ferme le
 * lundi soir (même règle que `weekly_review_open` en base, heure de Paris).
 * Le bilan automatique (bloc 1) est recalculé tant que la review est en
 * brouillon, puis figé dans `auto` à l'envoi. Aucune IA.
 */

export const REVIEW_PARAMS = {
  /** Jours de wellness minimum pour afficher une moyenne (sinon « — »). */
  minWellnessDays: 3,
  engagements: 3,
  maxText: 500,
} as const;

// ── Réponses de l'athlète (colonne `answers`) ─────────────────────────────────

export const FEEL_KEYS = ["note", "energie", "motivation", "vie", "nutrition"] as const;
export type FeelKey = (typeof FEEL_KEYS)[number];

export const FEEL_LABEL: Record<FeelKey, string> = {
  note: "Ta semaine",
  energie: "Énergie",
  motivation: "Motivation",
  vie: "Charge de vie hors sport",
  nutrition: "Nutrition",
};

/** Sens des curseurs, pour l'athlète. */
export const FEEL_HINT: Record<FeelKey, [string, string]> = {
  note: ["difficile", "excellente"],
  energie: ["à plat", "au top"],
  motivation: ["aucune", "à fond"],
  vie: ["très chargée", "légère"],
  nutrition: ["à revoir", "au top"],
};

export type KeptStatus = "kept" | "partly" | "missed";
export const KEPT_LABEL: Record<KeptStatus, string> = { kept: "Tenu", partly: "En partie", missed: "Pas tenu" };

export type StuckCause = "moi" | "programme" | "vie";
export const STUCK_LABEL: Record<StuckCause, string> = { moi: "Moi", programme: "Programme", vie: "Vie" };

export type PainKind = "douleur" | "blessure";

export interface KeptCommitment {
  text: string;
  status: KeptStatus | null;
  why?: string;
}

export interface ReviewPain {
  zone?: string;
  kind?: PainKind | null;
  level?: number | null;
}

export interface ReviewAnswers {
  feel?: Partial<Record<FeelKey, number | null>>;
  kept?: KeptCommitment[];
  worked?: string;
  stuck?: string;
  stuckCause?: StuckCause | null;
  change?: string;
  next?: string[];
  pain?: ReviewPain | null;
  coachNote?: string;
}

// ── Fenêtre ───────────────────────────────────────────────────────────────────

/** Lundi de la semaine d'un jour. */
export function mondayOfDay(day: IsoDay): IsoDay {
  return addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
}

/** Même règle que `weekly_review_open` : du dimanche (lundi + 6) au lundi suivant (lundi + 7). */
export function isReviewOpen(weekStart: IsoDay, today: IsoDay): boolean {
  return mondayOfDay(weekStart) === weekStart && today >= addDays(weekStart, 6) && today <= addDays(weekStart, 7);
}

/** Semaine à revoir aujourd'hui (dimanche : celle qui finit, lundi : celle d'hier), sinon `null`. */
export function openReviewWeek(today: IsoDay): IsoDay | null {
  const monday = mondayOfDay(today);
  if (today === monday) return addDays(monday, -7);
  if (today === addDays(monday, 6)) return monday;
  return null;
}

/** Dernière semaine dont la review est due ou en cours (pour le coach). */
export function lastReviewWeek(today: IsoDay): IsoDay {
  return openReviewWeek(today) ?? addDays(mondayOfDay(today), -7);
}

export type ReviewState = "received" | "draft" | "waiting" | "missed" | "upcoming";

export const REVIEW_STATE_LABEL: Record<ReviewState, string> = {
  received: "Reçue",
  draft: "En cours",
  waiting: "En attente",
  missed: "Non faite",
  upcoming: "À venir",
};

/**
 * État d'une review pour le coach. `draft` n'arrive que côté athlète : le coach
 * ne lit pas les brouillons (RLS), il voit « En attente ».
 */
export function reviewState(
  weekStart: IsoDay,
  today: IsoDay,
  row: { status: "draft" | "submitted" } | null,
): ReviewState {
  if (row?.status === "submitted") return "received";
  if (today < addDays(weekStart, 6)) return "upcoming";
  if (today > addDays(weekStart, 7)) return "missed";
  return row?.status === "draft" ? "draft" : "waiting";
}

// ── Bloc 1 : bilan automatique ───────────────────────────────────────────────

export interface WorkoutExtra {
  /** Durée saisie par Agon (secondes). */
  durationS: number | null;
  /** Commentaire de l'athlète sur la séance. */
  notes: string | null;
}

export interface HardestSession {
  date: IsoDay;
  label: string;
  rpe: number;
  comment: string | null;
}

export interface WeekSummary {
  weekStart: IsoDay;
  sessions: { done: number; planned: number };
  /** Minutes (séances faites + activités libres), `null` si aucune durée connue. */
  durationMin: number | null;
  /** Kilomètres, `null` si aucune distance connue. */
  distanceKm: number | null;
  rpeAvg: number | null;
  hardest: HardestSession | null;
  wellness: {
    days: number;
    /** Moyenne sur 5 de chaque item, `null` si moins de `minWellnessDays` saisies. */
    items: Record<WellnessItem, number | null>;
    envie: number | null;
    painMax: number | null;
    sickDays: number;
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

function mean(xs: readonly number[], min = 1): number | null {
  return xs.length >= min ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

export function summarizeWeek(input: {
  weekStart: IsoDay;
  days: readonly PlannedVsDoneDay[];
  workouts?: Readonly<Record<string, WorkoutExtra>>;
  wellness: readonly WellnessEntry[];
}): WeekSummary {
  const end = addDays(input.weekStart, 6);
  const inWeek = (d: string) => d >= input.weekStart && d <= end;
  const days = input.days.filter((d) => inWeek(d.date));
  const workouts = input.workouts ?? {};

  let planned = 0, done = 0, seconds = 0, hasDuration = false, meters = 0, hasDistance = false;
  const rpes: number[] = [];
  let hardest: HardestSession | null = null;

  for (const day of days) {
    for (const p of day.planned) {
      planned += 1;
      if (!p.done) continue;
      done += 1;
      const extra = p.kind === "workout" ? workouts[p.id] : undefined;
      const dur = p.activity?.durationS ?? extra?.durationS ?? null;
      if (dur != null && dur > 0) { seconds += dur; hasDuration = true; }
      if (p.activity?.distanceM != null && p.activity.distanceM > 0) { meters += p.activity.distanceM; hasDistance = true; }
      if (p.rpe) {
        rpes.push(p.rpe.value);
        if (!hardest || p.rpe.value > hardest.rpe) {
          const note = extra?.notes?.trim();
          hardest = { date: day.date, label: p.label, rpe: p.rpe.value, comment: note ? note : null };
        }
      }
    }
    for (const a of day.free) {
      if (a.durationS != null && a.durationS > 0) { seconds += a.durationS; hasDuration = true; }
      if (a.distanceM != null && a.distanceM > 0) { meters += a.distanceM; hasDistance = true; }
    }
  }

  const entries = input.wellness.filter((e) => inWeek(e.day) && !e.archived);
  const min = REVIEW_PARAMS.minWellnessDays;
  const items = Object.fromEntries(
    WELLNESS_ITEMS.map((k) => [k, mean(entries.map((e) => e.items[k]).filter((v): v is number => v != null), min)]),
  ) as Record<WellnessItem, number | null>;
  const pains = entries.map((e) => e.pain).filter((v): v is number => v != null);

  return {
    weekStart: input.weekStart,
    sessions: { done, planned },
    durationMin: hasDuration ? Math.round(seconds / 60) : null,
    distanceKm: hasDistance ? round1(meters / 1000) : null,
    rpeAvg: mean(rpes),
    hardest,
    wellness: {
      days: entries.length,
      items,
      envie: mean(entries.map((e) => e.envie).filter((v): v is number => v != null), min),
      painMax: pains.length > 0 ? Math.max(...pains) : null,
      sickDays: entries.filter((e) => e.sick === true).length,
    },
  };
}

// ── Saisie ────────────────────────────────────────────────────────────────────

/** Bloc 6 : la douleur n'est demandée que si le feu du moment est orange ou rouge. */
export function painRequired(light: Light | null | undefined): boolean {
  return light === "orange" || light === "red";
}

/** Bloc 3 : les engagements de la semaine passée, repris de la review d'avant. */
export function commitmentsToReview(previous: ReviewAnswers | null | undefined): KeptCommitment[] {
  return (previous?.next ?? [])
    .map((t) => t.trim())
    .filter((t) => t !== "")
    .slice(0, REVIEW_PARAMS.engagements)
    .map((text) => ({ text, status: null }));
}

/**
 * Réponses de départ : brouillon existant, sinon les engagements de la semaine
 * d'avant à évaluer. Un brouillon sans `kept` (créé avant que la review
 * précédente soit lue) récupère les engagements.
 */
export function initialAnswers(draft: ReviewAnswers | null | undefined, previous: ReviewAnswers | null | undefined): ReviewAnswers {
  const base: ReviewAnswers = { ...(draft ?? {}) };
  if (!base.kept || base.kept.length === 0) base.kept = commitmentsToReview(previous);
  return base;
}

export interface MissingField {
  key: string;
  label: string;
}

/** Ce qui manque avant « Envoyer ». Vide = la review peut partir. */
export function missingFields(a: ReviewAnswers, opts: { painRequired: boolean }): MissingField[] {
  const out: MissingField[] = [];
  for (const k of FEEL_KEYS) {
    const v = a.feel?.[k];
    if (v == null) out.push({ key: `feel.${k}`, label: FEEL_LABEL[k] });
  }
  (a.kept ?? []).forEach((c, i) => {
    if (!c.status) out.push({ key: `kept.${i}`, label: `Engagement ${i + 1}` });
  });
  if (!a.worked?.trim()) out.push({ key: "worked", label: "Ce qui a marché" });
  if (!a.stuck?.trim()) out.push({ key: "stuck", label: "Ce qui a coincé" });
  if (!a.change?.trim()) out.push({ key: "change", label: "Ce que tu changes" });
  if (!(a.next ?? []).some((t) => t.trim() !== "")) out.push({ key: "next", label: "Au moins un engagement" });
  if (opts.painRequired && (a.pain?.level == null || !a.pain?.zone?.trim())) {
    out.push({ key: "pain", label: "Ta douleur (zone et niveau)" });
  }
  return out;
}

/** Nettoie avant l'envoi : textes coupés, engagements vides retirés, douleur retirée si non demandée. */
export function cleanAnswers(a: ReviewAnswers, opts: { painRequired: boolean }): ReviewAnswers {
  const cut = (s: string | undefined) => (s ?? "").trim().slice(0, REVIEW_PARAMS.maxText);
  const out: ReviewAnswers = {
    feel: { ...(a.feel ?? {}) },
    kept: (a.kept ?? []).map((c) => ({ text: cut(c.text), status: c.status, ...(c.why?.trim() ? { why: cut(c.why) } : {}) })),
    worked: cut(a.worked),
    stuck: cut(a.stuck),
    stuckCause: a.stuckCause ?? null,
    change: cut(a.change),
    next: (a.next ?? []).map(cut).filter((t) => t !== "").slice(0, REVIEW_PARAMS.engagements),
  };
  if (opts.painRequired && a.pain) out.pain = { zone: cut(a.pain.zone), kind: a.pain.kind ?? null, level: a.pain.level ?? null };
  if (a.coachNote?.trim()) out.coachNote = cut(a.coachNote);
  return out;
}

// ── Affichage ─────────────────────────────────────────────────────────────────

/** « 1 h 25 », « 45 min », « — ». */
export function formatDuration(min: number | null): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

export function formatNumber(v: number | null, unit = ""): string {
  if (v == null) return "—";
  const s = String(v).replace(".", ",");
  return unit ? `${s} ${unit}` : s;
}
