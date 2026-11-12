import { attributionOf } from "@/lib/activityDetail";
import { sportLabel } from "@/lib/activityDisplay";
import type { DoneActivity, PlannedItem, PlannedKind, PlannedVsDoneDay } from "@/lib/plannedVsDone";
import { DASH, fmtClock, fmtKm, fmtPaceOrSpeed, sportBadge, sportFamily } from "@/lib/seance";

/**
 * Carte du planning (P34) : une seule carte par séance, coach et athlète.
 * - `planned`   : prévue, rien de la montre
 * - `syncing`   : la montre a fini, Agon attend le fichier
 * - `toConfirm` : Agon a rapproché une activité (lien auto), à valider
 * - `done`      : réalisée (lien confirmé), remplace la carte prévue
 * - `free`      : activité sans séance prévue
 */
export type PlanningCardState = "planned" | "syncing" | "toConfirm" | "done" | "free";

export interface PlanningCardModel {
  key: string;
  state: PlanningCardState;
  date: string;
  /** Pastille de sport (« Course », « HYROX », « Vélo »…). */
  badge: string;
  title: string;
  /** Activité de la montre, si elle existe (ouvre l'onglet Séance). */
  activityId: string | null;
  linkId: string | null;
  planned: { kind: PlannedKind; id: string } | null;
  /** « 7,4 km · 48:10 » ; « — » si rien. */
  summary: string;
  /** Allure « 6'30 » (course) ou vitesse « 27,1 » (vélo), `null` si absente. */
  pace: string | null;
  paceUnit: "/km" | "km/h" | null;
  /** « Garmin Forerunner 265 » : obligatoire dès qu'une donnée Garmin s'affiche. */
  attribution: string | null;
  /** Marque seule (« Garmin ») pour une colonne étroite. */
  brand: string | null;
  /** « mar. 18 h 34 » : départ de l'activité proposée. */
  startLabel: string | null;
  zoneShares: number[] | null;
}

/** Au-delà, une activité sans fichier n'est plus « en cours de synchro » : on montre son résumé. */
export const SYNC_WINDOW_MS = 3 * 3600 * 1000;
const SYNCED_SOURCES = new Set(["garmin", "coros"]);

/** Montre connectée, fichier pas encore arrivé, activité finie depuis moins de 3 h. */
export function isSyncing(a: Pick<DoneActivity, "source" | "hasStream" | "startedAt" | "durationS">, now: number): boolean {
  if (a.hasStream !== false || !SYNCED_SOURCES.has(a.source)) return false;
  const end = Date.parse(a.startedAt) + (a.durationS ?? 0) * 1000;
  return Number.isFinite(end) && now - end < SYNC_WINDOW_MS;
}

const DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

/** « mar. 18 h 34 » (heure locale). */
export function fmtStartShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${DAYS[d.getDay()]} ${d.getHours()} h ${String(d.getMinutes()).padStart(2, "0")}`;
}

function activityFields(a: DoneActivity) {
  const bike = sportFamily(a.sport) === "bike";
  const parts = [a.distanceM ? `${fmtKm(a.distanceM)} km` : null, a.durationS ? fmtClock(a.durationS) : null].filter(Boolean);
  const pace = a.avgPaceSPerKm && a.distanceM ? fmtPaceOrSpeed(a.avgPaceSPerKm, bike) : null;
  const attribution = attributionOf(a.source, a.deviceName);
  return {
    summary: parts.length ? parts.join(" · ") : DASH,
    pace: pace && pace !== DASH ? pace : null,
    paceUnit: pace && pace !== DASH ? (bike ? ("km/h" as const) : ("/km" as const)) : null,
    attribution,
    brand: attribution.split(" ")[0],
    startLabel: fmtStartShort(a.startedAt),
    zoneShares: a.zoneShares,
  };
}

const KIND_BADGE: Record<PlannedKind, string> = { energy: "Énergie", workout: "Muscu", test: "Test" };

/** Carte d'une séance prévue (avec ou sans activité rattachée). */
export function plannedCard(p: PlannedItem, now: number): PlanningCardModel {
  const a = p.activity;
  const base = {
    key: `${p.kind}:${p.id}`,
    date: p.date,
    title: p.label,
    linkId: p.linkId,
    planned: { kind: p.kind, id: p.id },
  };
  if (!a) {
    return {
      ...base, state: "planned", badge: KIND_BADGE[p.kind], activityId: null, summary: DASH, pace: null, paceUnit: null,
      attribution: null, brand: null, startLabel: null, zoneShares: null,
    };
  }
  const state: PlanningCardState = isSyncing(a, now) ? "syncing" : p.linkStatus === "confirmed" ? "done" : "toConfirm";
  return { ...base, state, badge: sportBadge(a.sport), activityId: a.id, ...activityFields(a) };
}

/** Carte d'une activité libre (sans séance prévue, ou rattachement refusé). */
export function freeCard(a: DoneActivity, now: number): PlanningCardModel {
  const fam = sportFamily(a.sport);
  const title = a.title?.trim() || `${fam === "run" ? "Course" : fam === "bike" ? "Vélo" : sportLabel(a.sport)} libre`;
  return {
    key: `activity:${a.id}`,
    state: isSyncing(a, now) ? "syncing" : "free",
    date: a.date,
    badge: "Séance libre",
    title,
    activityId: a.id,
    linkId: null,
    planned: null,
    ...activityFields(a),
  };
}

/** Cartes « montre » d'un jour : séances avec activité rattachée, puis activités libres. */
export function watchCardsOfDay(day: PlannedVsDoneDay | undefined, now: number): PlanningCardModel[] {
  if (!day) return [];
  return [
    ...day.planned.filter((p) => p.activity).map((p) => plannedCard(p, now)),
    ...day.free.map((a) => freeCard(a, now)),
  ];
}

/**
 * Séances du jour auxquelles une activité libre peut être associée : toutes
 * celles sans activité rattachée, même validées dans Agon (on y ajoute la montre).
 */
export function associableOf(day: PlannedVsDoneDay | undefined): PlannedItem[] {
  return day ? day.planned.filter((p) => !p.activity) : [];
}
