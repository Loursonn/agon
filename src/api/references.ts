import type { QueryClient } from "@tanstack/react-query";
import { check, db, unwrap, unwrapRows } from "./client";
import { isFcZoneKey, normalizeMetricName, type FcZoneKey } from "@shared/domain/performance";

/**
 * Références de performance (`performance_logs`) : VMA, FC max, seuils,
 * bornes de zones FC, données personnalisées — et leur historique.
 *
 * - Une mesure = une ligne ; une seule référence active par métrique (index
 *   unique partiel). Les noms sont canoniques (`normalizeMetricName`, et un
 *   trigger SQL fait de même pour tout ce qui écrit en base).
 * - Définir une référence et enregistrer les zones FC passent par des RPC
 *   atomiques (migration 20261108120000) : plus de « désactiver puis insérer »
 *   en deux requêtes, plus de 6 lignes par clic sur « Enregistrer les zones ».
 * - Toute écriture appelle `invalidateReferences` côté hook : séances énergie,
 *   profil sportif, accueil coach et validations se mettent à jour tout de
 *   suite (avant : jusqu'à 5 min ou un rechargement).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface PerformanceLog {
  id: string;
  athlete_id: string;
  metric_type: string;
  metric_name: string;
  value: number;
  unit: string;
  custom_unit: string | null;
  date: string;
  test_session_id: string | null;
  is_active_reference: boolean;
  /** null = en attente (saisie de l'athlète), false = rejetée par le coach. */
  coach_validated: boolean | null;
  notes: string | null;
  created_by: string | null;
  created_at: string | null;
}

export interface ActiveReference {
  id: string;
  value: number;
  unit: string;
  date: string;
  metricType: string;
}

/** Référence active par nom de métrique canonique. */
export type ActiveReferences = Record<string, ActiveReference>;

export interface RecentMeasurement {
  id: string;
  athleteId: string;
  metricName: string;
  value: number;
  unit: string;
  date: string;
  coachValidated: boolean | null;
}

export interface PerformanceReview {
  id: string;
  athleteId: string;
  coachId: string;
  performanceLogId: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string | null;
  athleteName: string | null;
  metricName: string | null;
  value: number | null;
  unit: string | null;
  date: string | null;
  testTitle: string | null;
}

// ── Clés React Query ─────────────────────────────────────────────────────────

export const referenceKeys = {
  all: (athleteId: string) => ["references", athleteId] as const,
  active: (athleteId: string) => ["references", athleteId, "active"] as const,
  history: (athleteId: string) => ["references", athleteId, "history"] as const,
  reviews: (athleteId: string) => ["references", athleteId, "reviews"] as const,
  /** Validations adressées à un coach, tous athlètes confondus. */
  coachReviews: (coachId: string) => ["references", "reviews", coachId] as const,
  /** Dernières mesures de plusieurs athlètes (accueil coach). */
  recent: (athleteIds: string[], limit: number) =>
    ["references", "recent", [...athleteIds].sort().join(","), limit] as const,
};

/**
 * Tout ce qui dépend des références d'un athlète : ses références et
 * mesures, les mesures récentes vues par le coach, les validations en
 * attente, et les résultats de tests qui en créent (trigger SQL).
 */
export function invalidateReferences(qc: QueryClient, athleteId: string): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: referenceKeys.all(athleteId) }),
    qc.invalidateQueries({ queryKey: ["references", "recent"] }),
    qc.invalidateQueries({ queryKey: ["references", "reviews"] }),
    qc.invalidateQueries({ queryKey: ["athleteTestResults", athleteId] }),
    qc.invalidateQueries({ queryKey: ["athleteCurrentValues", athleteId] }),
    qc.invalidateQueries({ queryKey: ["categoryTestSeries", athleteId] }),
  ]);
}

// ── Lectures ─────────────────────────────────────────────────────────────────

const LOG_COLUMNS =
  "id, athlete_id, metric_type, metric_name, value, unit, custom_unit, date, test_session_id, is_active_reference, coach_validated, notes, created_by, created_at";

function toLog(row: Record<string, unknown>): PerformanceLog {
  return {
    ...(row as unknown as PerformanceLog),
    value: Number(row.value),
    is_active_reference: row.is_active_reference === true,
    coach_validated: (row.coach_validated as boolean | null | undefined) ?? null,
  };
}

/** Références actives d'un athlète, par nom canonique. */
export async function getActiveReferences(athleteId: string): Promise<ActiveReferences> {
  const rows = unwrapRows(
    await db()
      .from("performance_logs")
      .select("id, metric_name, metric_type, value, unit, date")
      .eq("athlete_id", athleteId)
      .eq("is_active_reference", true),
    "Références non chargées",
  );
  const out: ActiveReferences = {};
  for (const r of rows) {
    out[normalizeMetricName(r.metric_name)] = {
      id: r.id,
      value: Number(r.value),
      unit: r.unit,
      date: r.date,
      metricType: r.metric_type,
    };
  }
  return out;
}

/** Valeurs seules (module énergie : `refs.VMA`, `refs.FCmax`, `refs.FCzone_Z1_max`…). */
export function referenceValues(refs: ActiveReferences): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, r] of Object.entries(refs)) out[k] = r.value;
  return out;
}

/** Bornes de zones FC enregistrées (absentes = calcul automatique). */
export function storedFcZones(refs: ActiveReferences): Partial<Record<FcZoneKey, number>> {
  const out: Partial<Record<FcZoneKey, number>> = {};
  for (const [k, r] of Object.entries(refs)) if (isFcZoneKey(k)) out[k] = r.value;
  return out;
}

/** Toutes les mesures d'un athlète, la plus récente d'abord. */
export async function getMeasurements(athleteId: string): Promise<PerformanceLog[]> {
  const rows = unwrapRows(
    await db()
      .from("performance_logs")
      .select(LOG_COLUMNS)
      .eq("athlete_id", athleteId)
      .order("date", { ascending: false }),
    "Performances non chargées",
  );
  return rows.map((r) => toLog(r as unknown as Record<string, unknown>));
}

/** Historique groupé par métrique (ordre : la plus récente mesure d'abord). */
export function groupMeasurements(logs: PerformanceLog[]): Record<string, PerformanceLog[]> {
  const out: Record<string, PerformanceLog[]> = {};
  for (const l of logs) (out[normalizeMetricName(l.metric_name)] ??= []).push(l);
  return out;
}

/**
 * Dernières mesures de plusieurs athlètes (accueil coach « Records & tests »),
 * sans les bornes de zones FC : ce sont des réglages, pas des performances.
 */
export async function getRecentMeasurements(athleteIds: string[], limit = 8): Promise<RecentMeasurement[]> {
  if (athleteIds.length === 0) return [];
  const rows = unwrapRows(
    await db()
      .from("performance_logs")
      .select("id, athlete_id, metric_name, metric_type, value, unit, date, coach_validated")
      .in("athlete_id", athleteIds)
      .neq("metric_type", "zone")
      .order("date", { ascending: false })
      .limit(limit),
    "Dernières performances non chargées",
  );
  return rows
    .filter((r) => !isFcZoneKey(r.metric_name))
    .map((r) => ({
      id: r.id,
      athleteId: r.athlete_id,
      metricName: r.metric_name,
      value: Number(r.value),
      unit: r.unit,
      date: r.date,
      coachValidated: r.coach_validated ?? null,
    }));
}

/**
 * Mesures envoyées par les athlètes à valider : celles d'un athlète (ses deux
 * coachs les voient), ou celles adressées à un coach. 4 requêtes au total,
 * quel que soit le nombre de notifications (avant : 2 à 3 par notification).
 */
export async function getPerformanceReviews(
  scope: { athleteId: string } | { coachId: string },
  limit = 20,
): Promise<PerformanceReview[]> {
  let q = db().from("performance_notifications").select("id, athlete_id, coach_id, performance_log_id, status, created_at");
  q = "athleteId" in scope ? q.eq("athlete_id", scope.athleteId) : q.eq("coach_id", scope.coachId);
  const notifs = unwrapRows(await q.order("created_at", { ascending: false }).limit(limit), "Validations non chargées");
  if (notifs.length === 0) return [];

  const logIds = [...new Set(notifs.map((n) => n.performance_log_id))];
  const athleteIds = [...new Set(notifs.map((n) => n.athlete_id))];
  const [logs, athletes] = await Promise.all([
    db().from("performance_logs").select("id, metric_name, value, unit, date, test_session_id").in("id", logIds),
    db().from("profiles").select("id, full_name").in("id", athleteIds),
  ]);
  const logRows = unwrapRows(logs, "Mesures à valider non chargées");
  const athleteRows = unwrapRows(athletes, "Athlètes non chargés");
  const testIds = [...new Set(logRows.map((l) => l.test_session_id).filter((x): x is string => !!x))];
  const tests = testIds.length
    ? unwrapRows(await db().from("test_sessions").select("id, title").in("id", testIds), "Tests non chargés")
    : [];

  const logById = new Map(logRows.map((l) => [l.id, l]));
  const nameById = new Map(athleteRows.map((a) => [a.id, a.full_name as string | null]));
  const testById = new Map(tests.map((t) => [t.id, t.title as string | null]));
  return notifs.map((n) => {
    const log = logById.get(n.performance_log_id);
    return {
      id: n.id,
      athleteId: n.athlete_id,
      coachId: n.coach_id,
      performanceLogId: n.performance_log_id,
      status: (n.status ?? "pending") as PerformanceReview["status"],
      createdAt: n.created_at,
      athleteName: nameById.get(n.athlete_id) ?? null,
      metricName: log?.metric_name ?? null,
      value: log ? Number(log.value) : null,
      unit: log?.unit ?? null,
      date: log?.date ?? null,
      testTitle: log?.test_session_id ? testById.get(log.test_session_id) ?? null : null,
    };
  });
}

// ── Écritures ────────────────────────────────────────────────────────────────

export interface NewMeasurement {
  athleteId: string;
  metricName: string;
  metricType: string;
  value: number;
  unit: string;
  customUnit?: string | null;
  /** "YYYY-MM-DD" */
  date: string;
  notes?: string | null;
  createdBy?: string | null;
  /** Saisie de l'athlète : prévient son coach référent pour validation. */
  notifyCoach?: boolean;
}

/**
 * Ajoute une mesure (non active). Le nom est normalisé (« FC Max » → « FCmax »).
 * `notified` dit si le coach a bien été prévenu : la notification est
 * secondaire, son échec ne fait pas croire que la mesure est perdue.
 */
export async function addMeasurement(m: NewMeasurement): Promise<{ log: PerformanceLog; notified: boolean }> {
  const metricName = normalizeMetricName(m.metricName);
  if (!metricName) throw new Error("Nom de métrique manquant");
  if (!Number.isFinite(m.value)) throw new Error("Valeur invalide");
  const row = unwrap(
    await db()
      .from("performance_logs")
      .insert({
        athlete_id: m.athleteId,
        metric_type: m.metricType,
        metric_name: metricName,
        value: m.value,
        unit: m.unit,
        custom_unit: m.customUnit ?? null,
        date: m.date,
        notes: m.notes ?? null,
        is_active_reference: false,
        created_by: m.createdBy ?? null,
      })
      .select(LOG_COLUMNS)
      .single(),
    "Performance non enregistrée",
  );
  if (!row) throw new Error("Performance non enregistrée");
  const log = toLog(row as unknown as Record<string, unknown>);

  let notified = false;
  if (m.notifyCoach) {
    try {
      const profile = unwrap(
        await db().from("profiles").select("coach_id").eq("id", m.athleteId).maybeSingle(),
        "Coach introuvable",
      );
      if (profile?.coach_id) {
        check(
          await db().from("performance_notifications").insert({
            coach_id: profile.coach_id,
            athlete_id: m.athleteId,
            performance_log_id: log.id,
            status: "pending",
          }),
          "Coach non prévenu",
        );
        notified = true;
      }
    } catch {
      notified = false;
    }
  }
  return { log, notified };
}

export interface ReferenceInput {
  athleteId: string;
  metricName: string;
  value: number;
  unit?: string | null;
  /** "YYYY-MM-DD" ; défaut : aujourd'hui (côté base). */
  date?: string | null;
  /** Ignoré si c'est l'athlète qui écrit (la base laisse « en attente »). */
  validated?: boolean;
}

/** Nouvelle référence active (l'ancienne est gardée dans l'historique). Renvoie son id. */
export async function setReference(r: ReferenceInput): Promise<string> {
  if (!Number.isFinite(r.value)) throw new Error("Valeur invalide");
  const id = unwrap(
    await db().rpc("set_performance_reference", {
      p_athlete: r.athleteId,
      p_metric: normalizeMetricName(r.metricName),
      p_value: r.value,
      p_unit: r.unit ?? null,
      p_date: r.date ?? null,
      p_validated: r.validated ?? true,
    }),
    "Référence non enregistrée",
  );
  return id as string;
}

/**
 * Enregistre les bornes de zones FC en une écriture ; une borne inchangée ne
 * crée pas de ligne. Renvoie le nombre de bornes réellement modifiées.
 */
export async function saveFcZones(athleteId: string, zones: Partial<Record<FcZoneKey, number>> | Record<string, number>): Promise<number> {
  for (const [k, v] of Object.entries(zones)) {
    if (!isFcZoneKey(k)) throw new Error(`Zone FC inconnue : ${k}`);
    if (!Number.isFinite(v) || (v as number) < 0) throw new Error(`Valeur invalide pour ${k}`);
  }
  const n = unwrap(await db().rpc("save_fc_zones", { p_athlete: athleteId, p_zones: zones }), "Zones FC non enregistrées");
  return Number(n ?? 0);
}

/**
 * Fait d'une mesure existante la référence active de sa métrique.
 * `metricName` : le nom de la ligne tel qu'en base (la RPC vérifie qu'il correspond).
 */
export async function activateReference(athleteId: string, logId: string, metricName: string): Promise<void> {
  check(
    await db().rpc("set_active_performance_reference", {
      p_performance_log_id: logId,
      p_athlete_id: athleteId,
      p_metric_name: metricName,
    }),
    "Référence non mise à jour",
  );
}

export async function deleteMeasurement(id: string): Promise<void> {
  check(await db().from("performance_logs").delete().eq("id", id), "Suppression impossible");
}

/**
 * Le coach valide (la mesure devient la référence active) ou rejette une
 * mesure envoyée par l'athlète — notification, validation et activation en
 * une transaction.
 */
export async function reviewMeasurement(notificationId: string, logId: string, approve: boolean): Promise<void> {
  check(
    await db().rpc("review_performance_notification", { p_notification: notificationId, p_log: logId, p_approve: approve }),
    approve ? "Validation impossible" : "Rejet impossible",
  );
}
