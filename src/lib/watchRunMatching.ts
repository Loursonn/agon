/**
 * Sorties de montre dans le volume de course — logique pure, testée.
 *
 * Trois sources disent « j'ai couru » :
 *  - les activités remontées par une montre ou importées d'un fichier
 *    (`provider_activities`) ;
 *  - la saisie manuelle en fin de séance énergie / spécifique
 *    (`energy_session_assignments.distance_km`, activité « course ») et les
 *    activités libres « course » ;
 *  - les km courus pendant une séance de muscu (`workout_logs.run_distance_km`).
 *
 * Une même sortie peut arriver par les deux premières : l'athlète court avec sa
 * montre, puis valide la séance prévue en tapant ses km. Elle ne doit compter
 * qu'une fois. Ce module décide quelles activités sont de la course, à quelle
 * séance prévue chacune se rattache, et produit la liste des km à sommer. C'est
 * la seule copie de ce calcul : le volume (athlète et coach), les km des retours
 * et l'indication « réalisée — montre » lisent tous son résultat.
 */

// ── Entrées ───────────────────────────────────────────────────────────────────

/** Activité de montre / fichier, telle que lue dans `provider_activities`. */
export interface WatchActivityInput {
  id: string;
  source: string;
  /** Date locale de l'athlète au départ (yyyy-MM-dd) */
  localDate: string;
  startedAt: string;
  sport: string | null;
  distanceM: number | null;
  durationS: number | null;
  /** Modèle de l'appareil (attribution « Garmin [modèle] ») */
  deviceName?: string | null;
}

/** Séance énergie / spécifique programmée (`energy_session_assignments`). */
export interface PlannedSessionInput {
  id: string;
  /** Date prévue (yyyy-MM-dd) */
  date: string;
  status: string | null;
  /** Activité déclarée en fin de séance (`course`, `velo`…), null si pas encore validée */
  activityType: string | null;
  sessionKind: string | null;
  label: string;
  plannedDistanceM: number | null;
  plannedDurationS: number | null;
  /** Km saisis à la main en fin de séance */
  manualKm: number | null;
  /** Durée saisie à la main en fin de séance */
  manualDurationMin: number | null;
}

/** Activité libre saisie par l'athlète (`asp:freesess`). */
export interface FreeSessionInput {
  id: string;
  date: string;
  sport: string | null;
  km: number | null;
  durationMin: number | null;
}

/** Km courus pendant une séance de muscu : jamais rapprochés (voir plus bas). */
export interface StrengthRunInput {
  date: string;
  km: number;
}

// ── Sorties ───────────────────────────────────────────────────────────────────

export type RunSource = "watch" | "manual";

/** Une ligne comptée dans le volume, après dédoublonnage. */
export interface RunEntry {
  date: string;
  km: number;
  /** Absent = saisie manuelle (compatibilité) */
  source?: RunSource;
}

/** Une activité de montre rattachée à une séance prévue. */
export interface RunMatch {
  plannedId: string;
  plannedLabel: string;
  activityId: string;
  activitySource: string;
  /** Modèle de l'appareil, si connu */
  activityDevice: string | null;
  date: string;
  /** Km mesurés par la montre (null si l'activité n'a pas de distance) */
  watchKm: number | null;
  watchDurationS: number | null;
  /** Km comptés dans le volume pour ce couple (montre, à défaut saisie) */
  countedKm: number | null;
  countedSource: RunSource | null;
}

export interface RunLedger {
  entries: RunEntry[];
  /** Rattachements montre ↔ séance prévue */
  matches: RunMatch[];
  /** Activités écartées comme doublon d'une autre activité (même départ ±2 min) */
  duplicateActivityIds: string[];
}

// ── (a) Quelles activités sont de la course ───────────────────────────────────

/*
  Les décodeurs (`supabase/functions/_shared/activityFiles/sports.ts`) ramènent
  déjà trail, tapis et course virtuelle à `running`. Les autres variantes sont
  celles que l'affichage connaît (`trail_running`, `treadmill_running`,
  `track_running`) et celles que la synchro Garmin écrira (types d'activité
  Garmin, en majuscules et avec soulignés) : on compare donc une forme réduite,
  sans casse ni séparateur.

  Exclus volontairement : la marche, la randonnée (allure et effort différents,
  et le coach ne les programme pas comme de la course) et `wheelchair_push_run`
  (ce n'est pas de la course à pied). Un sport inconnu (`null`) n'est pas
  compté : on ne sait pas ce que c'est.
*/
const RUNNING_KEYS = new Set([
  "running",
  "run",
  "trailrunning",
  "trailrun",
  "treadmillrunning",
  "treadmill",
  "indoorrunning",
  "trackrunning",
  "streetrunning",
  "virtualrun",
  "virtualrunning",
  "ultrarun",
  "ultrarunning",
  "obstaclerun",
]);

const sportKey = (sport: string) => sport.toLowerCase().replace(/[^a-z0-9]/g, "");

export function isRunningSport(sport: string | null | undefined): boolean {
  if (!sport) return false;
  return RUNNING_KEYS.has(sportKey(sport));
}

/*
  Une séance prévue est « de la course » si l'athlète l'a validée en « Course »,
  ou — tant qu'elle n'est pas validée — si son type est un type de course du
  module énergie (VMA, tempo, seuil, footing, fartlek). « Autre », personnalisé
  et spécifique (CrossFit, MetCon…) ne sont rattachés que si l'athlète a déclaré
  « Course » : mieux vaut une sortie non rattachée qu'une séance de vélo marquée
  « réalisée » par un footing.
*/
const RUNNING_SESSION_KINDS = new Set(["vo2", "tempo", "seuil", "footing", "fartlek"]);

export function isPlannedRun(p: PlannedSessionInput): boolean {
  if (p.status === "skipped") return false;
  if (p.activityType) return p.activityType === "course";
  return !!p.sessionKind && RUNNING_SESSION_KINDS.has(p.sessionKind);
}

/** Sport « course » des activités libres (`FreeActivityModal`). */
export const isFreeRun = (f: FreeSessionInput) => f.sport === "course";

// ── Doublons entre activités ──────────────────────────────────────────────────

/** Même écart que le rapprochement à l'import (décision 2026-10). */
const SAME_START_MS = 2 * 60 * 1000;

const SOURCE_RANK: Record<string, number> = { garmin: 0, coros: 0, file_import: 1, manual: 2 };

/**
 * Écarte la deuxième copie d'une même sortie (FIT importé puis synchro de la
 * montre, par exemple) : départs à moins de deux minutes. La base refuse déjà ce
 * doublon à l'insertion côté import, mais pas côté synchro — sans ce garde-fou,
 * une sortie compterait deux fois dans les km. Garde la copie de la montre, puis
 * celle qui a une distance.
 */
export function dedupeActivities(acts: WatchActivityInput[]): {
  kept: WatchActivityInput[];
  duplicateIds: string[];
} {
  const rank = (a: WatchActivityInput) =>
    (SOURCE_RANK[a.source] ?? 3) * 10 + (a.distanceM != null && a.distanceM > 0 ? 0 : 1);
  const sorted = [...acts].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  const kept: WatchActivityInput[] = [];
  const duplicateIds: string[] = [];
  for (const a of sorted) {
    const t = Date.parse(a.startedAt);
    const twin = kept.find((k) => {
      const tk = Date.parse(k.startedAt);
      return Number.isFinite(t) && Number.isFinite(tk) && Math.abs(t - tk) < SAME_START_MS;
    });
    if (twin) duplicateIds.push(a.id);
    else kept.push(a);
  }
  return { kept, duplicateIds };
}

// ── (b) Rattachement un pour un ───────────────────────────────────────────────

interface Ref {
  distanceM: number | null;
  durationS: number | null;
}

const relDiff = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b);
const positive = (n: number | null | undefined): n is number => n != null && Number.isFinite(n) && n > 0;

/**
 * Écart entre une activité et une référence (séance prévue ou activité libre),
 * de 0 (identiques) à 1. Moyenne des écarts relatifs de distance et de durée
 * disponibles ; 1 si aucune mesure n'est comparable — le couple reste possible
 * (même jour, même sport), mais passe après tout couple comparable.
 */
export function matchCost(activity: WatchActivityInput, ref: Ref): number {
  const diffs: number[] = [];
  if (positive(activity.distanceM) && positive(ref.distanceM)) diffs.push(relDiff(activity.distanceM, ref.distanceM));
  if (positive(activity.durationS) && positive(ref.durationS)) diffs.push(relDiff(activity.durationS, ref.durationS));
  return diffs.length ? diffs.reduce((s, d) => s + d, 0) / diffs.length : 1;
}

/**
 * Rapproche deux listes un pour un, à date égale : à chaque tour, le couple le
 * plus proche est retenu et ses deux membres sortent du jeu. Glouton plutôt
 * qu'optimal : il y a au plus deux ou trois sorties par jour, et la règle
 * « le plus proche d'abord » s'explique à un coach.
 */
function matchOneToOne<R extends { id: string; date: string }>(
  activities: WatchActivityInput[],
  refs: R[],
  refOf: (r: R) => Ref,
): Array<{ activity: WatchActivityInput; ref: R }> {
  const pairs: Array<{ activity: WatchActivityInput; ref: R; cost: number }> = [];
  for (const a of activities) {
    for (const r of refs) {
      if (r.date === a.localDate) pairs.push({ activity: a, ref: r, cost: matchCost(a, refOf(r)) });
    }
  }
  pairs.sort(
    (x, y) =>
      x.cost - y.cost ||
      x.activity.startedAt.localeCompare(y.activity.startedAt) ||
      x.activity.id.localeCompare(y.activity.id) ||
      x.ref.id.localeCompare(y.ref.id),
  );
  const usedA = new Set<string>();
  const usedR = new Set<string>();
  const out: Array<{ activity: WatchActivityInput; ref: R }> = [];
  for (const p of pairs) {
    if (usedA.has(p.activity.id) || usedR.has(p.ref.id)) continue;
    usedA.add(p.activity.id);
    usedR.add(p.ref.id);
    out.push({ activity: p.activity, ref: p.ref });
  }
  return out;
}

/** Référence d'une séance prévue : ce qui a été saisi, sinon ce qui était prévu. */
const plannedRef = (p: PlannedSessionInput): Ref => ({
  distanceM: positive(p.manualKm) ? p.manualKm * 1000 : p.plannedDistanceM,
  durationS: positive(p.manualDurationMin) ? p.manualDurationMin * 60 : p.plannedDurationS,
});

const freeRef = (f: FreeSessionInput): Ref => ({
  distanceM: positive(f.km) ? f.km * 1000 : null,
  durationS: positive(f.durationMin) ? f.durationMin * 60 : null,
});

const watchKmOf = (a: WatchActivityInput): number | null =>
  positive(a.distanceM) ? a.distanceM / 1000 : null;

// ── (c) Dédoublonnage et liste des km ─────────────────────────────────────────

/**
 * Construit la liste des km à sommer.
 *
 * Règle : une sortie rattachée à une séance (prévue ou libre) ne produit qu'une
 * ligne. La mesure de la montre l'emporte sur la saisie ; la saisie ne sert que
 * si l'activité n'a pas de distance (tapis sans capteur, fichier sans GPS).
 *
 * Pourquoi la montre : le champ « km » de fin de séance est pré-rempli avec la
 * distance *prévue* (`initialRunDistance`). Un athlète qui valide sans corriger
 * enregistre donc le plan, pas ce qu'il a couru ; la montre, elle, a mesuré. Et
 * une saisie se corrige à la main, une mesure de montre non : si les deux
 * divergent, c'est la saisie qui a le plus de chances d'être approximative.
 *
 * Les km courus en séance de muscu ne sont jamais rapprochés : c'est un
 * échauffement ou un finisher dans une séance enregistrée, à la montre, comme
 * « renforcement » — pas une sortie de course.
 */
export function buildRunLedger(input: {
  activities: WatchActivityInput[];
  planned: PlannedSessionInput[];
  free?: FreeSessionInput[];
  strength?: StrengthRunInput[];
}): RunLedger {
  const runs = input.activities.filter((a) => isRunningSport(a.sport));
  const { kept, duplicateIds } = dedupeActivities(runs);

  const plannedRuns = input.planned.filter(isPlannedRun);
  const plannedMatches = matchOneToOne(kept, plannedRuns, plannedRef);
  const matchedActivity = new Set(plannedMatches.map((m) => m.activity.id));
  const matchedPlanned = new Set(plannedMatches.map((m) => m.ref.id));

  const freeRuns = (input.free ?? []).filter(isFreeRun);
  const freeMatches = matchOneToOne(
    kept.filter((a) => !matchedActivity.has(a.id)),
    freeRuns,
    freeRef,
  );
  for (const m of freeMatches) matchedActivity.add(m.activity.id);
  const matchedFree = new Set(freeMatches.map((m) => m.ref.id));

  const entries: RunEntry[] = [];
  const push = (date: string, km: number | null, source: RunSource) => {
    if (positive(km)) entries.push({ date, km, source });
  };

  const matches: RunMatch[] = plannedMatches.map(({ activity, ref }) => {
    const watchKm = watchKmOf(activity);
    const manualKm = ref.activityType === "course" && positive(ref.manualKm) ? ref.manualKm : null;
    const countedKm = watchKm ?? manualKm;
    const countedSource: RunSource | null = watchKm != null ? "watch" : manualKm != null ? "manual" : null;
    if (countedSource) push(activity.localDate, countedKm, countedSource);
    return {
      plannedId: ref.id,
      plannedLabel: ref.label,
      activityId: activity.id,
      activitySource: activity.source,
      activityDevice: activity.deviceName ?? null,
      date: activity.localDate,
      watchKm,
      watchDurationS: positive(activity.durationS) ? activity.durationS : null,
      countedKm,
      countedSource,
    };
  });

  for (const { activity, ref } of freeMatches) {
    const watchKm = watchKmOf(activity);
    if (watchKm != null) push(activity.localDate, watchKm, "watch");
    else push(ref.date, ref.km, "manual");
  }

  // Saisies sans activité de montre en face
  for (const p of input.planned) {
    if (matchedPlanned.has(p.id)) continue;
    if (p.activityType === "course") push(p.date, p.manualKm, "manual");
  }
  for (const f of freeRuns) {
    if (!matchedFree.has(f.id)) push(f.date, f.km, "manual");
  }
  for (const s of input.strength ?? []) push(s.date, s.km, "manual");

  // Sorties de montre sans séance en face : elles comptent seules
  for (const a of kept) {
    if (!matchedActivity.has(a.id)) push(a.localDate, watchKmOf(a), "watch");
  }

  entries.sort((x, y) => x.date.localeCompare(y.date));
  return { entries, matches, duplicateActivityIds: duplicateIds };
}

// ── (d) Totaux par période ────────────────────────────────────────────────────

export interface KmSummary {
  km: number;
  /** Part mesurée par une montre ou un fichier importé */
  watchKm: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Km entre deux dates incluses (yyyy-MM-dd), et la part venue de la montre. */
export function summarizeKm(entries: RunEntry[], from: string, to: string): KmSummary {
  let km = 0;
  let watchKm = 0;
  for (const e of entries) {
    if (e.date < from || e.date > to) continue;
    km += e.km;
    if (e.source === "watch") watchKm += e.km;
  }
  return { km: round1(km), watchKm: round1(watchKm) };
}

/** Km par mois calendaire (clé yyyy-MM), mois sans course absents. */
export function kmByMonth(entries: RunEntry[]): Record<string, KmSummary> {
  const raw: Record<string, KmSummary> = {};
  for (const e of entries) {
    const k = e.date.slice(0, 7);
    const cur = (raw[k] ??= { km: 0, watchKm: 0 });
    cur.km += e.km;
    if (e.source === "watch") cur.watchKm += e.km;
  }
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, { km: round1(v.km), watchKm: round1(v.watchKm) }]),
  );
}
