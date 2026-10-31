/**
 * Ce que l'API coach laisse lire à l'assistant IA d'un coach.
 *
 * Même principe que `aiGuard.ts` : on expose des champs nommés, retypés et
 * bornés, jamais le JSON brut d'`app_data`. Un champ ajouté demain dans l'app
 * ne part pas chez un tiers sans que quelqu'un l'ait ajouté ici exprès.
 *
 * Exclu volontairement : tout texte libre écrit par l'athlète (ressenti,
 * commentaires de séance, note d'interruption de sommeil, commentaire de
 * blessure, commentaire de compétition, note de résultat de test). Seule
 * exception : le titre des événements de son calendrier (examens, voyages…),
 * dont le texte de consentement le prévient. Ce sont les champs où une donnée de santé non prévue peut se
 * glisser — un diagnostic, un traitement, un cycle — et l'athlète a consenti
 * à l'analyse de ses données d'entraînement, pas de ses confidences.
 *
 * Module pur, testé par vitest.
 */
import { cleanText, type ExerciceParamsShape, isWeekRecord, type ProgSessionShape } from "./coachApiOps.ts";

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
}

/** Nombre dans une plage, sinon null — jamais un zéro inventé. */
function num(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 100) / 100;
}

/** Libellé court issu d'une liste (zone, type, sport) : borné, sans saut de ligne. */
function label(v: unknown, max = 40): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\r\n`$]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && DATE.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
}

function inRange(d: unknown, from: string, to: string): d is string {
  return isIsoDate(d) && d >= from && d <= to;
}

function hm(v: unknown): string | null {
  const o = obj(v);
  const h = num(o.h, 0, 23);
  const m = num(o.m, 0, 59);
  return h === null || m === null ? null : `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ─────────────────────────────── Période ────────────────────────────────────

export const MAX_DAYS = 90;
export const DEFAULT_DAYS = 28;

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Période demandée, bornée à 90 jours. `today` au format AAAA-MM-JJ. */
export function parsePeriod(
  fromRaw: string | null,
  toRaw: string | null,
  today: string,
): { ok: true; from: string; to: string } | { ok: false; error: string } {
  const to = toRaw ?? today;
  if (!isIsoDate(to)) return { ok: false, error: "to : date AAAA-MM-JJ attendue" };
  const from = fromRaw ?? addDays(to, -(DEFAULT_DAYS - 1));
  if (!isIsoDate(from)) return { ok: false, error: "from : date AAAA-MM-JJ attendue" };
  if (from > to) return { ok: false, error: "from doit précéder to" };
  if (addDays(from, MAX_DAYS - 1) < to) return { ok: false, error: `${MAX_DAYS} jours maximum par requête` };
  return { ok: true, from, to };
}

// ─────────────────────────────── Programme ──────────────────────────────────

const PARAM_KEYS = [
  "nb_series", "cluster", "reps", "reps_max", "reps_mode", "charge_unit", "charge", "rir", "tempo", "manual_rm",
] as const;

function pickParams(p: unknown): Obj {
  const o = obj(p);
  const out: Obj = {};
  for (const k of PARAM_KEYS) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

function readParams(p: unknown): Obj | Record<string, Obj> {
  if (!isWeekRecord(p)) return pickParams(p);
  const out: Record<string, Obj> = {};
  for (const [k, v] of Object.entries(p as Record<string, ExerciceParamsShape>)) {
    if (/^\d+$/.test(k) && v) out[k] = pickParams(v);
  }
  return out;
}

/**
 * Programme `asp:prog` sous la forme que les propositions réutilisent : mêmes
 * ids, mêmes noms de champs, mêmes paramètres. L'assistant lit ici ce qu'il
 * citera dans ses opérations.
 *
 * `prochaine_occurrence` : numéro de la prochaine fois que la séance aura lieu
 * — c'est la valeur à passer dans `a_partir_de` pour qu'une modification
 * vaille à partir de maintenant.
 */
export function readProgram(prog: unknown, nextOccurrence: Map<string, number>) {
  const sessions = Array.isArray(prog) ? (prog as ProgSessionShape[]) : [];
  return sessions.map((s) => ({
    id: s.id,
    name: label(s.name, 80),
    short: label(s.short, 8),
    day_of_week: typeof s.day_of_week === "number" ? s.day_of_week : null,
    recurrence: s.recurrence === "once" ? "once" : "weekly",
    prochaine_occurrence: nextOccurrence.get(s.id) ?? 1,
    blocs: (s.blocs ?? []).map((b) => ({
      id: b.id,
      name: label(b.name, 80),
      category: label(b.category),
      instructions: typeof b.instructions === "string" ? cleanText(b.instructions.slice(0, 1000), 1000, "instructions") : null,
      exercices: (b.exercices ?? []).map((e) => ({
        id: e.id,
        exercise_name: label(e.exercise_name, 80),
        dans_bibliotheque: !!e.exercise_id,
        mode: e.mode,
        libre_text: typeof e.libre_text === "string" ? cleanText(e.libre_text.slice(0, 500), 500, "libre_text") : null,
        comment: typeof e.comment === "string" ? cleanText(e.comment.slice(0, 500), 500, "comment") : null,
        params: e.mode === "methode" ? null : readParams(e.params),
      })),
    })),
  }));
}

// ─────────────────────────────── Synthèse ───────────────────────────────────

export interface SummaryInput {
  athlete: { id: string; first_name: string | null; full_name: string | null };
  from: string;
  to: string;
  /** Valeurs `app_data` par clé : asp:goals, asp:bw, asp:wh, asp:wlog, asp:injuries. */
  appData: Record<string, unknown>;
  prog: unknown;
  workoutLogs: Array<{
    scheduled_date: string;
    session_id: string | null;
    session_name: string | null;
    status: string;
    rpe_score: number | null;
    duration_s: number | null;
    athlete_modifications: unknown;
  }>;
  prs: Array<{ date: string; exercise_ref: string; kg: number }>;
  activities: Array<Record<string, unknown>>;
  dailies: Array<Record<string, unknown>>;
  /** Compétitions à partir du début de la période (`competitions`). */
  competitions?: Array<{ id?: string; date: string; name: string | null; type: string | null; priority: string | null; location: string | null }>;
  /** Tests planifiés (`test_sessions`). */
  tests?: Array<{ id?: string; date: string; title: string | null; type: string | null; completed: boolean | null; results_structured: unknown }>;
  /** Événements saisis par l'athlète (`athlete_life_events`). */
  lifeEvents?: Array<{ date_start: string; date_end: string; title: string | null }>;
  /** Thèmes du jour posés par le coach (`day_themes`). */
  dayThemes?: Array<{ date: string; label: string | null; intensity: string | null; dominante: string | null }>;
  /** Séances énergétiques planifiées (`energy_session_assignments`). */
  energyLogs?: Array<{
    energy_session_id?: string;
    scheduled_date: string;
    status: string;
    rpe_score: number | null;
    actual_duration_min: number | null;
    distance_km: number | null;
    energy_sessions: {
      name: string | null;
      session_kind: string | null;
      total_duration_s: number | null;
      total_distance_m: number | null;
    } | null;
  }>;
}

/** Prénom seul : l'assistant n'a pas besoin du nom de famille pour analyser. */
export function firstName(a: { first_name: string | null; full_name: string | null }): string {
  return label(a.first_name, 40) ?? label((a.full_name ?? "").split(" ")[0], 40) ?? "Athlète";
}

function exerciseNames(prog: unknown): Map<string, string> {
  const names = new Map<string, string>();
  for (const s of Array.isArray(prog) ? (prog as ProgSessionShape[]) : []) {
    for (const b of s.blocs ?? []) for (const e of b.exercices ?? []) {
      const n = label(e.exercise_name, 80);
      if (n) names.set(e.id, n);
    }
  }
  return names;
}

function performedSets(mods: unknown, names: Map<string, string>) {
  const sets = obj(obj(mods).sessionSets);
  const out: Array<{ exercice: string; series: Array<{ kg: number | null; reps: number | null; rir: number | null; faite: boolean }> }> = [];
  for (const [exId, rows] of Object.entries(sets)) {
    const name = names.get(exId);
    // Exercice retiré du programme depuis : on ne sait plus ce que c'était,
    // et un nom deviné serait une donnée fausse.
    if (!name || !Array.isArray(rows)) continue;
    out.push({
      exercice: name,
      series: rows.slice(0, 30).map((r) => {
        const o = obj(r);
        return {
          kg: num(o.kg, 0, 1000),
          reps: num(o.reps, 0, 200),
          rir: num(o.rir, 0, 10),
          faite: o.done === true && o.skipped !== true,
        };
      }),
    });
  }
  return out;
}

/** `results_structured.variables` : nombres seulement, clés bornées. */
function testValues(raw: unknown): Record<string, number> | null {
  const vars = obj(obj(raw).variables);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(vars).slice(0, 30)) {
    const key = label(k, 40);
    const n = num(v, -1_000_000, 1_000_000);
    if (key && n !== null) out[key] = n;
  }
  return Object.keys(out).length ? out : null;
}

export function buildSummary(input: SummaryInput) {
  const { from, to, appData } = input;
  const goals = obj(appData["asp:goals"]);
  const bw = obj(appData["asp:bw"]);
  const wh = obj(appData["asp:wh"]);
  const wlog = obj(appData["asp:wlog"]);
  const injuries = Array.isArray(appData["asp:injuries"]) ? (appData["asp:injuries"] as unknown[]) : [];
  const names = exerciseNames(input.prog);

  return {
    athlete: { id: input.athlete.id, prenom: firstName(input.athlete) },
    periode: { du: from, au: to },
    echelles: {
      fatigue_sommeil_stress_energie_courbatures: "1 à 5",
      score_bien_etre: "0 à 100",
      rpe: "1 à 10",
      rir: "répétitions en réserve",
    },
    objectifs: {
      seances_par_semaine: num(goals.sessionsPerWeek, 1, 14),
      sommeil_cible_h: num(goals.sleepTarget, 0, 24),
      coucher: hm(goals.sleepBedtime),
      lever: hm(goals.sleepWakeup),
      poids_cible_kg: num(bw.target, 20, 400),
    },
    bien_etre: Object.entries(wh)
      .filter(([d]) => inRange(d, from, to))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => {
        const w = obj(v);
        return {
          date,
          score: num(w.score, 0, 100),
          fatigue: num(w.fatigue, 1, 5),
          sommeil: num(w.sommeil, 1, 5),
          stress: num(w.stress, 1, 5),
          energie: num(w.energie, 1, 5),
          courbatures: num(w.doms, 1, 5),
          sommeil_h: num(w.sleepDur, 0, 24),
        };
      }),
    poids: Object.entries(wlog)
      .filter(([d]) => inRange(d, from, to))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, kg]) => ({ date, kg: num(kg, 20, 400) }))
      .filter((p) => p.kg !== null),
    blessures: injuries
      .map((raw) => {
        const i = obj(raw);
        return {
          zones: (Array.isArray(i.zones) ? i.zones : []).map((z) => label(z)).filter(Boolean).slice(0, 10),
          type: label(i.type),
          intensite: num(i.intensity, 0, 10),
          statut: label(i.status, 20),
          debut: isIsoDate(i.date_start) ? i.date_start : null,
          fin: isIsoDate(i.date_end) ? i.date_end : null,
        };
      })
      // Blessures qui recouvrent la période, ou encore ouvertes.
      .filter((i) => (!i.debut || i.debut <= to) && (!i.fin || i.fin >= from)),
    seances: input.workoutLogs
      .filter((l) => inRange(l.scheduled_date, from, to))
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
      .map((l) => ({
        date: l.scheduled_date,
        // Pour retirer une séance prévue (remove_placement).
        session_id: l.session_id,
        nom: label(l.session_name, 80),
        statut: label(l.status, 20),
        rpe: num(l.rpe_score, 1, 10),
        duree_min: l.duration_s === null ? null : num(Math.round(l.duration_s / 60), 0, 600),
        forme: num(obj(l.athlete_modifications).sessionForme, 1, 5),
        exercices: performedSets(l.athlete_modifications, names),
      })),
    // Événements de la période : ce qui contraint ou rythme le planning.
    evenements: {
      competitions: (input.competitions ?? [])
        .filter((c) => inRange(c.date, from, to))
        .map((c) => ({ id: c.id ?? null, date: c.date, nom: label(c.name, 80), type: label(c.type, 20), priorite: label(c.priority, 2), lieu: label(c.location, 80) })),
      // Les suivantes, pour périodiser vers elles.
      competitions_a_venir: (input.competitions ?? [])
        .filter((c) => isIsoDate(c.date) && c.date > to)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 5)
        .map((c) => ({ id: c.id ?? null, date: c.date, nom: label(c.name, 80), type: label(c.type, 20), priorite: label(c.priority, 2) })),
      tests: (input.tests ?? [])
        .filter((t) => inRange(t.date, from, to))
        .map((t) => ({
          id: t.id ?? null,
          date: t.date,
          titre: label(t.title, 80),
          type: label(t.type, 20),
          fait: t.completed === true,
          // Valeurs mesurées seulement ; la note libre de l'athlète reste chez lui.
          resultats: testValues(t.results_structured),
        })),
      // Titre écrit par l'athlète, transmis en clair (consentement du 30/10/2026).
      vie: (input.lifeEvents ?? [])
        .filter((e) => isIsoDate(e.date_start) && isIsoDate(e.date_end) && e.date_start <= to && e.date_end >= from)
        .map((e) => ({ du: e.date_start, au: e.date_end, titre: label(e.title, 80) })),
    },
    // Ce que le coach avait prévu pour chaque jour : à comparer avec ce qui a
    // été fait. La note du thème n'est pas transmise.
    themes_du_jour: (input.dayThemes ?? [])
      .filter((t) => inRange(t.date, from, to))
      .map((t) => ({
        date: t.date,
        label: label(t.label),
        intensite: label(t.intensity, 20),
        dominante: label(t.dominante, 20),
      })),
    // Ni les notes de l'athlète ni ses validations de blocs : texte libre.
    seances_energie: (input.energyLogs ?? [])
      .filter((l) => inRange(l.scheduled_date, from, to))
      .map((l) => {
        const e = l.energy_sessions ?? { name: null, session_kind: null, total_duration_s: null, total_distance_m: null };
        return {
          date: l.scheduled_date,
          energy_session_id: l.energy_session_id ?? null,
          nom: label(e.name, 80),
          type: label(e.session_kind, 20),
          statut: label(l.status, 20),
          duree_prevue_min: e.total_duration_s == null ? null : num(Math.round(Number(e.total_duration_s) / 60), 0, 2000),
          distance_prevue_km: e.total_distance_m == null ? null : num(Number(e.total_distance_m) / 1000, 0, 1000),
          rpe: num(l.rpe_score, 1, 10),
          duree_min: num(l.actual_duration_min, 0, 2000),
          distance_km: num(l.distance_km, 0, 1000),
        };
      }),
    records: input.prs
      .filter((p) => inRange(p.date, from, to))
      .map((p) => ({ date: p.date, exercice: label(p.exercise_ref, 80), kg: num(p.kg, 0, 1000) })),
    montre: {
      activites: input.activities
        .filter((a) => inRange(a.local_date, from, to))
        .map((a) => ({
          date: a.local_date as string,
          sport: label(a.sport),
          duree_min: a.duration_s == null ? null : num(Math.round(Number(a.duration_s) / 60), 0, 2000),
          distance_km: a.distance_m == null ? null : num(Number(a.distance_m) / 1000, 0, 1000),
          fc_moy: num(a.avg_hr, 20, 250),
          fc_max: num(a.max_hr, 20, 250),
          denivele_m: num(a.elevation_gain_m, 0, 20000),
          source: label(a.source, 20),
        })),
      journees: input.dailies
        .filter((d) => inRange(d.day, from, to))
        .map((d) => ({
          date: d.day as string,
          sommeil_min: num(d.sleep_total_min, 0, 1440),
          sommeil_score: num(d.sleep_score, 0, 100),
          fc_repos: num(d.resting_hr, 20, 200),
          vfc_ms: num(d.hrv_ms, 0, 500),
          stress: num(d.stress_avg, 0, 100),
          pas: num(d.steps, 0, 200000),
          charge: num(d.training_load, 0, 10000),
          source: label(d.source, 20),
        })),
    },
  };
}

// ─────────────────────────────── Périodisation ──────────────────────────────

export interface PeriodisationInput {
  macros: Array<{ id: string; name: string; start_date: string; end_date: string; objective: string | null }>;
  mesos: Array<{
    id: string; macrocycle_id: string; name: string; start_date: string; end_date: string; objective: string | null;
    frequency: number | null; deload_week: number | null; volume_config: unknown; intensity_config: unknown;
  }>;
  cycles: Array<{ id: string; mesocycle_id: string | null; name: string; start_date: string; end_date: string; objective: string | null }>;
  micros: Array<{ id: string; cycle_id: string; week_number: number; start_date: string; end_date: string; is_deload: boolean }>;
  competitions: Array<{ id: string; date: string; name: string | null; type: string | null; priority: string | null; location: string | null }>;
  tests: Array<{ id: string; date: string; title: string | null; type: string | null; completed: boolean | null }>;
}

/**
 * Arbre de la périodisation de l'athlète, avec les ids qu'une planification
 * cite pour modifier ou supprimer. Textes du coach seulement (noms,
 * objectifs) : le commentaire de l'athlète sur une compétition n'y est pas.
 */
export function buildPeriodisation(input: PeriodisationInput) {
  const byStart = <T extends { start_date: string }>(a: T, b: T) => a.start_date.localeCompare(b.start_date);
  const cycle = (c: PeriodisationInput["cycles"][number]) => ({
    id: c.id,
    nom: label(c.name, 80),
    du: c.start_date,
    au: c.end_date,
    objectif: label(c.objective, 500),
    semaines: input.micros
      .filter((w) => w.cycle_id === c.id)
      .sort((a, b) => a.week_number - b.week_number)
      .map((w) => ({ numero: w.week_number, du: w.start_date, au: w.end_date, decharge: w.is_deload === true })),
  });
  return {
    macrocycles: [...input.macros].sort(byStart).map((m) => ({
      id: m.id,
      nom: label(m.name, 80),
      du: m.start_date,
      au: m.end_date,
      objectif: label(m.objective, 500),
      mesocycles: input.mesos.filter((x) => x.macrocycle_id === m.id).sort(byStart).map((x) => ({
        id: x.id,
        nom: label(x.name, 80),
        du: x.start_date,
        au: x.end_date,
        objectif: label(x.objective, 500),
        frequence: num(x.frequency, 1, 14),
        semaine_decharge: num(x.deload_week, 1, 53),
        volume: label(obj(x.volume_config).type, 20),
        zones: (Array.isArray(obj(x.intensity_config).zones) ? obj(x.intensity_config).zones as unknown[] : [])
          .map((z) => label(z, 4)).filter(Boolean),
        cycles: input.cycles.filter((c) => c.mesocycle_id === x.id).sort(byStart).map(cycle),
      })),
    })),
    // Cycles posés seuls (« créer un cycle depuis le bloc »).
    cycles_hors_mesocycle: input.cycles.filter((c) => !c.mesocycle_id).sort(byStart).map(cycle),
    competitions: [...input.competitions].sort((a, b) => a.date.localeCompare(b.date)).map((c) => ({
      id: c.id, date: c.date, nom: label(c.name, 80), type: label(c.type, 20), priorite: label(c.priority, 2), lieu: label(c.location, 80),
    })),
    tests: [...input.tests].sort((a, b) => a.date.localeCompare(b.date)).map((t) => ({
      id: t.id, date: t.date, titre: label(t.title, 80), type: label(t.type, 20), fait: t.completed === true,
    })),
  };
}
