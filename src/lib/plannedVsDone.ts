/**
 * Planning d'une semaine, prévu face au réalisé — logique pure, testée.
 *
 * Entrées : séances prévues (énergie / spécifique / HYROX, muscu, tests),
 * activités de montre ou de fichier, liens de rapprochement
 * (`activity_plan_links`, calculés en base) et résumés de temps par zone.
 *
 * Règles :
 * - un lien `auto` ou `confirmed` rattache UNE activité à UNE séance prévue ;
 *   la séance compte comme réalisée (montre) ; `auto` reste « à confirmer » ;
 * - un lien `rejected` est ignoré : l'activité redevient une séance libre ;
 * - une activité sans lien actif est une séance libre de son jour ;
 * - une activité marquée doublon par le serveur n'est pas dans les liens et
 *   apparaît libre : l'affichage la regroupe via `dedupeActivities` si besoin.
 */

export type PlannedKind = "energy" | "workout" | "test";
export type PlanLinkStatus = "auto" | "confirmed" | "rejected";

export interface PlannedInput {
  kind: PlannedKind;
  id: string;
  date: string;
  label: string;
  /** Statut de la séance prévue (`planned`, `completed`, `skipped`, `missed`…). */
  status: string;
  /** RPE saisi dans Agon (`rpe_score`), `null` si absent. */
  agonRpe?: number | null;
}

export interface ActivityInput {
  id: string;
  date: string;
  startedAt: string;
  source: string;
  sport: string | null;
  distanceM: number | null;
  durationS: number | null;
  deviceName: string | null;
  /** Effort ressenti noté dans Strava (archive), `null` si absent. */
  rpe?: number | null;
  /** Carte du planning (P34) : titre de la sortie, allure et FC moyennes. */
  title?: string | null;
  avgPaceSPerKm?: number | null;
  avgHr?: number | null;
  /** Le fichier (courbes) est arrivé. `false` juste après la montre = « Synchro en cours ». */
  hasStream?: boolean;
}

export interface LinkInput {
  id: string;
  activityId: string;
  plannedKind: PlannedKind;
  plannedId: string;
  status: PlanLinkStatus;
}

export interface ZoneSummaryInput {
  activityId: string;
  seconds: number[];
}

export interface DoneActivity extends ActivityInput {
  /** Parts de temps par zone (0-100), `null` sans FC ou sans bornes. */
  zoneShares: number[] | null;
}

export interface PlannedItem extends PlannedInput {
  /** Activité rattachée (lien actif), sinon `null`. */
  activity: DoneActivity | null;
  linkId: string | null;
  linkStatus: Exclude<PlanLinkStatus, "rejected"> | null;
  /** Réalisée : validée par l'athlète OU activité rattachée. */
  done: boolean;
  /** RPE retenu pour la séance : celui d'Agon, sinon celui de la sortie rattachée. */
  rpe: EffectiveRpe | null;
}

export interface EffectiveRpe {
  value: number;
  source: "agon" | "strava";
}

/**
 * RPE d'une séance (décision P42) : celui saisi dans Agon l'emporte toujours ;
 * à défaut, l'effort ressenti noté dans Strava sur la sortie rattachée.
 * Calculé à la lecture, jamais recopié dans `rpe_score` : une écriture miroir
 * ferait passer l'RPE Strava pour une saisie de l'athlète, et un lien refusé
 * plus tard laisserait une valeur orpheline.
 */
export function effectiveRpe(agon: number | null | undefined, activity: number | null | undefined): EffectiveRpe | null {
  const ok = (v: number | null | undefined): v is number => typeof v === "number" && v >= 1 && v <= 10;
  if (ok(agon)) return { value: agon, source: "agon" };
  if (ok(activity)) return { value: activity, source: "strava" };
  return null;
}

export interface PlannedVsDoneDay {
  date: string;
  planned: PlannedItem[];
  /** Activités sans séance prévue (ou refusées), par heure de départ. */
  free: DoneActivity[];
}

const shares = (seconds: number[] | undefined): number[] | null => {
  if (!seconds) return null;
  const total = seconds.reduce((a, b) => a + b, 0);
  return total > 0 ? seconds.map((s) => Math.round((s / total) * 1000) / 10) : null;
};

/** Jours de `from` à `to` inclus (yyyy-MM-dd), en UTC pour éviter les décalages d'heure d'été. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end && out.length < 400; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function buildPlannedVsDone(input: {
  from: string;
  to: string;
  planned: PlannedInput[];
  activities: ActivityInput[];
  links: LinkInput[];
  zoneSummaries: ZoneSummaryInput[];
}): PlannedVsDoneDay[] {
  const zones = new Map(input.zoneSummaries.map((z) => [z.activityId, z.seconds]));
  const acts = new Map<string, DoneActivity>(
    input.activities.map((a) => [a.id, { ...a, zoneShares: shares(zones.get(a.id)) }]),
  );
  const active = input.links.filter((l) => l.status !== "rejected" && acts.has(l.activityId));
  const byPlanned = new Map(active.map((l) => [`${l.plannedKind}:${l.plannedId}`, l]));
  const linkedActs = new Set(active.map((l) => l.activityId));

  const days = new Map<string, PlannedVsDoneDay>(
    daysBetween(input.from, input.to).map((d) => [d, { date: d, planned: [], free: [] }]),
  );

  for (const p of input.planned) {
    const day = days.get(p.date);
    if (!day) continue;
    const l = byPlanned.get(`${p.kind}:${p.id}`);
    const activity = l ? acts.get(l.activityId) ?? null : null;
    day.planned.push({
      ...p,
      activity,
      linkId: l?.id ?? null,
      linkStatus: l ? (l.status as "auto" | "confirmed") : null,
      done: p.status === "completed" || activity !== null,
      rpe: effectiveRpe(p.agonRpe, activity?.rpe),
    });
  }
  for (const a of acts.values()) {
    if (linkedActs.has(a.id)) continue;
    days.get(a.date)?.free.push(a);
  }
  for (const d of days.values()) {
    d.free.sort((x, y) => x.startedAt.localeCompare(y.startedAt));
  }
  return [...days.values()];
}
