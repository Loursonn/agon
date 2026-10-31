// coach-api — API de l'assistant IA personnel d'un coach (Claude).
//
// Lecture des données des athlètes qui l'ont accepté, et propositions :
// déposées pour que le coach les applique d'un clic dans Agon, ou appliquées
// tout de suite quand le coach l'a demandé à son assistant. Chaque
// application garde l'état d'avant et s'annule (POST /drafts/:id/annuler).
//
// Deux façons de s'authentifier :
//  - la clé `agon_…` de l'assistant, pour toutes les routes ;
//  - la session Supabase du coach, depuis l'app, pour appliquer et annuler
//    seulement (l'application se fait ici, au même endroit que pour
//    l'assistant, et le journal d'annulation n'est écrit que par le serveur).
//
// Documentation pour les coachs : docs/API_COACH.md.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AI_ASSISTANT_SINCE, type DraftKind, type DraftOp, type PlanState, normName, validateDraft, type ProgSessionShape } from "../_shared/coachApiOps.ts";
import { ApplyConflict, applyDraft, parseUndo, UndoConflict, undoSteps } from "../_shared/coachApiApply.ts";
import { buildPeriodisation, buildSummary, firstName, parsePeriod, readProgram, type SummaryInput } from "../_shared/coachApiRead.ts";

const RATE_LIMIT_PER_MINUTE = 60;
const MAX_BODY_BYTES = 100_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", ...extra },
  });

/** Erreur destinée à l'appelant : un code stable, et une phrase pour corriger. */
const fail = (status: number, error: string, message: string, extra: Record<string, string> = {}) =>
  json({ error, message }, status, extra);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^agon_[A-Za-z0-9]{32,64}$/;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Date du jour à Paris : c'est le calendrier des athlètes, pas celui d'UTC. */
function todayParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

interface Caller {
  /** Null quand l'appel vient de l'app (session du coach). */
  keyId: string | null;
  coachId: string;
  via: "api" | "app";
}

interface AllowedAthlete {
  id: string;
  first_name: string | null;
  full_name: string | null;
}

/**
 * Athlètes du coach dont les données peuvent partir chez son assistant IA :
 * rattachés à lui, et ayant accepté le traitement IA sous un texte qui nomme
 * cet assistant (`doc_version >= AI_ASSISTANT_SINCE`). Un accord donné sous
 * l'ancien texte, qui ne nommait que Google Gemini, ne compte pas.
 *
 * Les autres n'existent pas pour l'API — même leur prénom ne sort pas.
 */
async function allowedAthletes(admin: SupabaseClient, coachId: string): Promise<Map<string, AllowedAthlete>> {
  const { data: athletes, error } = await admin
    .from("profiles")
    .select("id, first_name, full_name")
    // Un coach-athlète qui se coache lui-même (coach_id = lui) est aussi son
    // propre athlète : visible s'il a donné l'accord, comme les autres.
    .eq("coach_id", coachId);
  if (error) throw new Error("profiles: " + error.message);
  const ids = (athletes ?? []).map((a) => a.id as string);
  if (ids.length === 0) return new Map();

  const { data: consents, error: cErr } = await admin
    .from("current_consents")
    .select("user_id, doc_version")
    .in("user_id", ids)
    .eq("purpose", "ai_programming")
    .eq("granted", true)
    .gte("doc_version", AI_ASSISTANT_SINCE);
  if (cErr) throw new Error("current_consents: " + cErr.message);

  const ok = new Set((consents ?? []).map((c) => c.user_id as string));
  return new Map(
    (athletes ?? []).filter((a) => ok.has(a.id as string)).map((a) => [a.id as string, a as AllowedAthlete]),
  );
}

/**
 * Trace l'accès avant de servir. Si la trace ne peut pas être écrite, on ne
 * sert pas : une transmission qu'on ne peut pas retrouver ensuite est une
 * transmission qu'on ne pourra pas déclarer à l'athlète qui le demande.
 */
async function logAccess(admin: SupabaseClient, caller: Caller, route: string, athleteId: string | null) {
  // Le journal trace ce que l'assistant a lu ; le coach dans l'app n'est pas
  // un tiers.
  if (!caller.keyId) return;
  const { error } = await admin.from("coach_api_access_log").insert({
    key_id: caller.keyId,
    coach_id: caller.coachId,
    athlete_id: athleteId,
    route,
  });
  if (error) throw new Error("access_log: " + error.message);
}

async function appData(admin: SupabaseClient, athleteId: string, keys: string[]) {
  const { data, error } = await admin
    .from("app_data")
    .select("key, value")
    .eq("athlete_id", athleteId)
    .in("key", keys);
  if (error) throw new Error("app_data: " + error.message);
  const values: Record<string, unknown> = {};
  for (const row of data ?? []) values[row.key as string] = row.value;
  return { values };
}

/**
 * Prochaine occurrence de chaque séance : le nombre de fois qu'elle a été
 * planifiée avant aujourd'hui (hors séances sautées), plus un. Même compte
 * que `fetchOccurrencesForSessions` côté app.
 */
async function nextOccurrences(admin: SupabaseClient, athleteId: string, sessionIds: string[], today: string) {
  const out = new Map<string, number>();
  await Promise.all(sessionIds.map(async (sid) => {
    const { count, error } = await admin
      .from("workout_logs")
      .select("id", { count: "exact", head: true })
      .eq("athlete_id", athleteId)
      .eq("session_id", sid)
      .neq("status", "skipped")
      .lt("scheduled_date", today);
    if (error) throw new Error("workout_logs: " + error.message);
    out.set(sid, (count ?? 0) + 1);
  }));
  return out;
}

/** Bibliothèque visible du coach : exercices publics et les siens. */
async function library(admin: SupabaseClient, coachId: string) {
  const { data, error } = await admin
    .from("exercises")
    .select("id, name")
    .or(`is_public.eq.true,created_by.eq.${coachId}`)
    .limit(5000);
  if (error) throw new Error("exercises: " + error.message);
  const map = new Map<string, { id: string; name: string }>();
  for (const e of data ?? []) {
    const k = normName(e.name as string);
    if (k && !map.has(k)) map.set(k, { id: e.id as string, name: e.name as string });
  }
  return map;
}

/**
 * Séances énergétiques qu'une semaine peut placer chez cet athlète : la
 * banque du coach (les siennes et les publiques) et les copies déjà faites
 * pour lui. Jamais celles d'un autre athlète.
 */
async function energyForAthlete(admin: SupabaseClient, coachId: string, athleteId: string) {
  const { data, error } = await admin
    .from("energy_sessions")
    .select("id, name")
    .is("archived_at", null)
    .or(`athlete_id.eq.${athleteId},and(athlete_id.is.null,or(is_public.eq.true,created_by.eq.${coachId}))`)
    .limit(5000);
  if (error) throw new Error("energy_sessions: " + error.message);
  return new Map((data ?? []).map((e) => [e.id as string, { name: e.name as string }]));
}

/**
 * Périodisation, compétitions et tests de l'athlète. `dates` : jours cités
 * par des retraits du planning, dont on charge aussi les placements.
 */
async function planState(admin: SupabaseClient, athleteId: string, dates: string[] = []): Promise<PlanState> {
  const q = async <T>(p: PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string) => {
    const { data, error } = await p;
    if (error) throw new Error(`${what}: ${error.message}`);
    return data ?? [];
  };
  const macros = await q(admin.from("macrocycles").select("id, name, start_date, end_date, objective").eq("athlete_id", athleteId).limit(200), "macrocycles");
  const mesos = macros.length === 0 ? [] : await q(
    admin.from("mesocycles")
      .select("id, macrocycle_id, name, start_date, end_date, objective, frequency, deload_week, volume_config, intensity_config")
      .in("macrocycle_id", macros.map((m) => m.id)).limit(500),
    "mesocycles",
  );
  const cycleCols = "id, mesocycle_id, name, start_date, end_date, objective";
  const [direct, viaMeso] = await Promise.all([
    q(admin.from("cycles").select(cycleCols).eq("athlete_id", athleteId).limit(500), "cycles"),
    mesos.length === 0 ? [] : q(admin.from("cycles").select(cycleCols).in("mesocycle_id", mesos.map((m) => m.id)).limit(500), "cycles"),
  ]);
  const cycles = [...new Map([...direct, ...viaMeso].map((c) => [c.id, c])).values()];
  const micros = cycles.length === 0 ? [] : await q(
    admin.from("microcycles").select("id, cycle_id, week_number, start_date, end_date, is_deload")
      .in("cycle_id", cycles.map((c) => c.id)).limit(3000),
    "microcycles",
  );
  const [competitions, tests, placements, energyPlacements, themes] = await Promise.all([
    q(admin.from("competitions").select("id, name, date, type, priority, location").eq("athlete_id", athleteId).order("date").limit(500), "competitions"),
    q(admin.from("test_sessions").select("id, title, date, type, completed").eq("athlete_id", athleteId).order("date").limit(500), "test_sessions"),
    dates.length === 0 ? [] : q(
      admin.from("workout_logs").select("session_id, scheduled_date, status, microcycle_id").eq("athlete_id", athleteId).in("scheduled_date", dates),
      "workout_logs",
    ),
    dates.length === 0 ? [] : q(
      admin.from("energy_session_assignments").select("energy_session_id, scheduled_date, status, microcycle_id").eq("athlete_id", athleteId).in("scheduled_date", dates),
      "energy_session_assignments",
    ),
    dates.length === 0 ? [] : q(admin.from("day_themes").select("date").eq("athlete_id", athleteId).in("date", dates), "day_themes"),
  ]);
  return {
    macros, mesos, cycles, micros,
    competitions, tests: tests.map((t) => ({ ...t, completed: t.completed === true })),
    placements: placements.map((p) => ({ session_id: p.session_id, date: p.scheduled_date, status: p.status, microcycle_id: p.microcycle_id })),
    energyPlacements: energyPlacements.map((p) => ({ energy_session_id: p.energy_session_id, date: p.scheduled_date, status: p.status, microcycle_id: p.microcycle_id })),
    themeDates: themes.map((t) => t.date),
  } as unknown as PlanState;
}

/** Jours cités par les retraits d'une planification (avant validation). */
function removalDates(raw: unknown): string[] {
  const ops = (raw as { ops?: unknown } | null)?.ops;
  if (!Array.isArray(ops)) return [];
  const out = new Set<string>();
  for (const o of ops.slice(0, 50)) {
    const r = o as { op?: unknown; date?: unknown } | null;
    if (typeof r?.op === "string" && r.op.startsWith("remove_") && typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
      out.add(r.date);
    }
  }
  return [...out];
}

// ─────────────────────────────── Routes ─────────────────────────────────────

async function getAthletes(admin: SupabaseClient, caller: Caller) {
  const allowed = await allowedAthletes(admin, caller.coachId);
  await logAccess(admin, caller, "GET /athletes", null);
  return json({
    athletes: [...allowed.values()].map((a) => ({ id: a.id, prenom: firstName(a) })),
    note: "Seuls apparaissent les athlètes qui ont accepté le traitement de leurs données par l'assistant IA de leur coach.",
  });
}

async function getProgram(admin: SupabaseClient, caller: Caller, athleteId: string) {
  await logAccess(admin, caller, "GET /athletes/:id/program", athleteId);
  const { values } = await appData(admin, athleteId, ["asp:prog"]);
  const prog = Array.isArray(values["asp:prog"]) ? (values["asp:prog"] as ProgSessionShape[]) : [];
  const next = await nextOccurrences(admin, athleteId, prog.map((s) => s.id), todayParis());
  return json({
    athlete_id: athleteId,
    sessions: readProgram(prog, next),
  });
}

async function getSummary(admin: SupabaseClient, caller: Caller, athlete: AllowedAthlete, url: URL) {
  const period = parsePeriod(url.searchParams.get("from"), url.searchParams.get("to"), todayParis());
  if (!period.ok) return fail(400, "periode_invalide", period.error);
  const { from, to } = period;

  await logAccess(admin, caller, "GET /athletes/:id/summary", athlete.id);

  const [{ values }, logs, prs, acts, days, themes, energy, comps, tests, life] = await Promise.all([
    appData(admin, athlete.id, ["asp:goals", "asp:bw", "asp:wh", "asp:wlog", "asp:injuries", "asp:prog"]),
    admin.from("workout_logs")
      .select("scheduled_date, session_id, session_name, status, rpe_score, duration_s, athlete_modifications")
      .eq("athlete_id", athlete.id).gte("scheduled_date", from).lte("scheduled_date", to)
      .order("scheduled_date").limit(500),
    admin.from("exercise_pr_logs")
      .select("date, exercise_ref, kg")
      .eq("athlete_id", athlete.id).gte("date", from).lte("date", to)
      .order("date").limit(500),
    // Vues `ai_provider_*` uniquement : elles excluent déjà les sources que
    // nous nous interdisons de transmettre à une IA (Garmin, décision du
    // 27/10/2026). Lire les tables brutes contournerait cette garantie.
    admin.from("ai_provider_activities")
      .select("local_date, sport, duration_s, distance_m, avg_hr, max_hr, elevation_gain_m, source")
      .eq("athlete_id", athlete.id).gte("local_date", from).lte("local_date", to)
      .order("local_date").limit(500),
    admin.from("ai_provider_dailies")
      .select("day, sleep_total_min, sleep_score, resting_hr, hrv_ms, stress_avg, steps, training_load, source")
      .eq("athlete_id", athlete.id).gte("day", from).lte("day", to)
      .order("day").limit(500),
    admin.from("day_themes")
      .select("date, label, intensity, dominante")
      .eq("athlete_id", athlete.id).gte("date", from).lte("date", to)
      .order("date").limit(500),
    admin.from("energy_session_assignments")
      .select("energy_session_id, scheduled_date, status, rpe_score, actual_duration_min, distance_km, energy_sessions(name, session_kind, total_duration_s, total_distance_m)")
      .eq("athlete_id", athlete.id).gte("scheduled_date", from).lte("scheduled_date", to)
      .order("scheduled_date").limit(500),
    // Pas `athlete_comment` ni `notes` : texte libre.
    admin.from("competitions")
      .select("id, date, name, type, priority, location")
      .eq("athlete_id", athlete.id).gte("date", from)
      .order("date").limit(100),
    // Pas `results_note` ni `description`.
    admin.from("test_sessions")
      .select("id, date, title, type, completed, results_structured")
      .eq("athlete_id", athlete.id).gte("date", from).lte("date", to)
      .order("date").limit(200),
    admin.from("athlete_life_events")
      .select("date_start, date_end, title")
      .eq("athlete_id", athlete.id).lte("date_start", to).gte("date_end", from)
      .order("date_start").limit(100),
  ]);
  for (const r of [logs, prs, acts, days, themes, energy, comps, tests, life]) if (r.error) throw new Error(r.error.message);

  return json(buildSummary({
    athlete,
    from,
    to,
    appData: values,
    prog: values["asp:prog"],
    workoutLogs: logs.data ?? [],
    prs: prs.data ?? [],
    activities: acts.data ?? [],
    dailies: days.data ?? [],
    dayThemes: themes.data ?? [],
    energyLogs: (energy.data ?? []) as unknown as SummaryInput["energyLogs"],
    competitions: comps.data ?? [],
    tests: tests.data ?? [],
    lifeEvents: life.data ?? [],
  }));
}

async function getPeriodisation(admin: SupabaseClient, caller: Caller, athleteId: string) {
  await logAccess(admin, caller, "GET /athletes/:id/periodisation", athleteId);
  const st = await planState(admin, athleteId);
  return json(buildPeriodisation(st as unknown as Parameters<typeof buildPeriodisation>[0]));
}

/** Banque de tests du coach (les siens et ceux d'Agon), pour nommer un test. */
async function getTests(admin: SupabaseClient, caller: Caller, url: URL) {
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q && (q.length < 2 || q.length > 60)) return fail(400, "recherche_invalide", "q : entre 2 et 60 caractères");
  let query = admin
    .from("test_definitions")
    .select("name, category, kind")
    .or(`is_global.eq.true,created_by.eq.${caller.coachId}`)
    .order("name")
    .limit(q ? 20 : 100);
  if (q) query = query.ilike("name", "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%");
  const { data, error } = await query;
  if (error) throw new Error("test_definitions: " + error.message);
  return json({ tests: (data ?? []).map((t) => ({ nom: t.name, categorie: t.category, type: t.kind })) });
}

async function getExercices(admin: SupabaseClient, caller: Caller, url: URL) {
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 60) return fail(400, "recherche_invalide", "q : entre 2 et 60 caractères");
  // Les jokers de LIKE sont échappés : la recherche porte sur le texte tapé.
  const pattern = "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
  const { data, error } = await admin
    .from("exercises")
    .select("name")
    .or(`is_public.eq.true,created_by.eq.${caller.coachId}`)
    .ilike("name", pattern)
    .order("name")
    .limit(20);
  if (error) throw new Error("exercises: " + error.message);
  return json({ exercices: (data ?? []).map((e) => e.name) });
}

/** Banque de séances énergétiques du coach, pour en placer une dans une semaine. */
async function getEnergyBank(admin: SupabaseClient, caller: Caller, url: URL) {
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q && (q.length < 2 || q.length > 60)) return fail(400, "recherche_invalide", "q : entre 2 et 60 caractères");
  let query = admin
    .from("energy_sessions")
    .select("id, name, session_kind, total_duration_s, total_distance_m")
    .is("archived_at", null)
    .is("athlete_id", null)
    .or(`is_public.eq.true,created_by.eq.${caller.coachId}`)
    .order("created_at", { ascending: false })
    .limit(q ? 20 : 50);
  if (q) query = query.ilike("name", "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%");
  const { data, error } = await query;
  if (error) throw new Error("energy_sessions: " + error.message);
  return json({
    seances: (data ?? []).map((e) => ({
      id: e.id,
      nom: e.name,
      type: e.session_kind,
      duree_min: e.total_duration_s ? Math.round(Number(e.total_duration_s) / 60) : null,
      distance_km: e.total_distance_m ? Math.round(Number(e.total_distance_m) / 10) / 100 : null,
    })),
  });
}

async function postDraft(admin: SupabaseClient, caller: Caller, athleteId: string, req: Request) {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return fail(413, "corps_trop_long", "100 Ko maximum");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail(400, "json_invalide", "Le corps de la requête doit être du JSON.");
  }

  await logAccess(admin, caller, "POST /athletes/:id/drafts", athleteId);

  // `appliquer: true` : le coach a demandé à son assistant d'écrire
  // directement. Retiré avant la validation, qui n'accepte que la proposition.
  let applyNow = false;
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "appliquer" in raw) {
    const r = raw as Record<string, unknown>;
    if (typeof r.appliquer !== "boolean") return fail(400, "proposition_invalide", "appliquer : true ou false attendu");
    applyNow = r.appliquer;
    const { appliquer: _drop, ...rest } = r;
    raw = rest;
  }

  const kind = (raw as { kind?: unknown } | null)?.kind;
  const { values } = await appData(admin, athleteId, ["asp:prog", "asp:goals"]);
  const prog = Array.isArray(values["asp:prog"]) ? (values["asp:prog"] as ProgSessionShape[]) : [];

  const result = validateDraft(raw, {
    prog,
    newId: () => crypto.randomUUID(),
    library: kind === "programme" || kind === "semaine" || kind === "plan" ? await library(admin, caller.coachId) : undefined,
    today: todayParis(),
    energy: kind === "semaine" || kind === "plan" ? await energyForAthlete(admin, caller.coachId, athleteId) : undefined,
    plan: kind === "plan" ? await planState(admin, athleteId, removalDates(raw)) : undefined,
  });
  if (!result.ok) return fail(400, "proposition_invalide", result.error);

  const draft = result.value;
  if (applyNow && draft.kind === "axe") {
    return fail(400, "proposition_invalide", "appliquer : un axe de travail est un texte pour le coach, il ne s'applique pas");
  }
  // Empreinte du contenu visé, pour prévenir le coach s'il a changé avant
  // qu'il applique. Pas `updated_at` : l'éditeur de programmation ne le tient
  // pas à jour (voir migration 20261030110000). Une semaine n'en a pas : elle
  // ne modifie rien d'existant, elle ajoute.
  const target = draft.kind === "programme" || draft.kind === "planning"
    ? "asp:prog"
    : draft.kind === "objectifs"
    ? "asp:goals"
    : null;
  const base = target ? await sha256Hex(JSON.stringify(values[target] ?? null)) : null;

  const { data, error } = await admin
    .from("coach_api_drafts")
    .insert({
      coach_id: caller.coachId,
      athlete_id: athleteId,
      key_id: caller.keyId,
      kind: draft.kind,
      title: draft.title,
      body: draft.body,
      ops: draft.ops,
      base_hash: base,
    })
    .select("id, athlete_id, kind, title, status, created_at, ops")
    .single();
  if (error) throw new Error("coach_api_drafts: " + error.message);

  if (applyNow) {
    const applied = await applyStored(admin, caller, data as StoredDraft);
    if (applied.status !== 200) {
      // La proposition reste en attente : le coach peut la voir et cliquer.
      return applied;
    }
    return json({ ...(await applied.json()), id: data.id, ops: draft.ops }, 201);
  }

  return json({
    ...data,
    message: "Proposition déposée. Elle n'est appliquée que si le coach la valide dans Agon.",
  }, 201);
}

interface StoredDraft {
  id: string;
  athlete_id: string;
  kind: DraftKind;
  ops: DraftOp[];
}

/** L'athlète est-il encore celui de ce coach ? (et, pour l'assistant, d'accord) */
async function canWriteFor(admin: SupabaseClient, caller: Caller, athleteId: string): Promise<boolean> {
  if (caller.via === "api") return (await allowedAthletes(admin, caller.coachId)).has(athleteId);
  const { data } = await admin.from("profiles").select("coach_id").eq("id", athleteId).maybeSingle();
  return data?.coach_id === caller.coachId;
}

/**
 * Applique une proposition en attente. Réservation atomique d'abord : deux
 * clics, ou l'app et l'assistant en même temps, n'appliquent qu'une fois.
 */
async function applyStored(admin: SupabaseClient, caller: Caller, draft: StoredDraft): Promise<Response> {
  if (!(await canWriteFor(admin, caller, draft.athlete_id))) {
    return fail(404, "athlete_introuvable", "Athlète inconnu ou non disponible.");
  }
  const { data: claimed, error: cErr } = await admin
    .from("coach_api_drafts")
    .update({ status: "applied", decided_at: new Date().toISOString(), applied_via: caller.via })
    .eq("id", draft.id).eq("coach_id", caller.coachId).eq("status", "pending")
    .select("id");
  if (cErr) throw new Error("coach_api_drafts: " + cErr.message);
  if (!claimed || claimed.length === 0) return fail(409, "deja_traitee", "Cette proposition a déjà été appliquée, écartée ou annulée.");

  if (draft.kind === "axe") return json({ status: "applied", message: "Axe de travail retenu." });

  try {
    const res = await applyDraft({
      db: admin, athleteId: draft.athlete_id, coachId: caller.coachId, kind: draft.kind, ops: draft.ops, today: todayParis(),
    });
    const { error: uErr } = await admin.from("coach_api_drafts").update({ undo: res.undo }).eq("id", draft.id);
    if (uErr) console.error("coach-api undo journal:", uErr.message);
    return json({
      status: "applied",
      ...(res.goals ? { goals: res.goals } : {}),
      message: "Appliqué dans Agon. Annulable : POST /drafts/" + draft.id + "/annuler.",
    });
  } catch (e) {
    await admin.from("coach_api_drafts").update({ status: "pending", decided_at: null, applied_via: null }).eq("id", draft.id);
    if (e instanceof ApplyConflict) {
      return fail(409, "ne_s_applique_plus", `${e.message}. Rien n'a été modifié.`);
    }
    throw e;
  }
}

async function postApply(admin: SupabaseClient, caller: Caller, draftId: string) {
  const { data, error } = await admin
    .from("coach_api_drafts")
    .select("id, athlete_id, kind, ops")
    .eq("id", draftId).eq("coach_id", caller.coachId)
    .maybeSingle();
  if (error) throw new Error("coach_api_drafts: " + error.message);
  if (!data) return fail(404, "proposition_introuvable", "Proposition inconnue.");
  await logAccess(admin, caller, "POST /drafts/:id/appliquer", data.athlete_id as string);
  return applyStored(admin, caller, data as StoredDraft);
}

/**
 * Annule une proposition appliquée : rejoue son journal à l'envers. Refuse
 * (409) si le programme ou les objectifs ont changé depuis, sauf
 * `{ "forcer": true }` — le coach l'a confirmé en connaissance de cause.
 */
async function postUndo(admin: SupabaseClient, caller: Caller, draftId: string, req: Request) {
  let force = false;
  const text = await req.text();
  if (text.trim()) {
    try {
      force = (JSON.parse(text) as { forcer?: unknown })?.forcer === true;
    } catch {
      return fail(400, "json_invalide", "Le corps de la requête doit être du JSON.");
    }
  }
  const { data, error } = await admin
    .from("coach_api_drafts")
    .select("id, athlete_id, kind, status, undo")
    .eq("id", draftId).eq("coach_id", caller.coachId)
    .maybeSingle();
  if (error) throw new Error("coach_api_drafts: " + error.message);
  if (!data) return fail(404, "proposition_introuvable", "Proposition inconnue.");
  if (data.status !== "applied") return fail(409, "pas_appliquee", "Seule une proposition appliquée s'annule.");
  if (!(await canWriteFor(admin, caller, data.athlete_id as string))) {
    return fail(404, "athlete_introuvable", "Athlète inconnu ou non disponible.");
  }
  await logAccess(admin, caller, "POST /drafts/:id/annuler", data.athlete_id as string);

  const { data: claimed, error: cErr } = await admin
    .from("coach_api_drafts")
    .update({ status: "undone", undone_at: new Date().toISOString() })
    .eq("id", draftId).eq("status", "applied")
    .select("id");
  if (cErr) throw new Error("coach_api_drafts: " + cErr.message);
  if (!claimed || claimed.length === 0) return fail(409, "pas_appliquee", "Seule une proposition appliquée s'annule.");

  try {
    const report = await undoSteps(admin, data.athlete_id as string, caller.coachId, parseUndo(data.undo), force);
    return json({
      status: "undone",
      conserves: report.kept,
      message: report.kept > 0
        ? `Annulé. ${report.kept} élément(s) déjà réalisé(s) par l'athlète sont restés en place.`
        : "Annulé : tout est revenu comme avant.",
    });
  } catch (e) {
    await admin.from("coach_api_drafts").update({ status: "applied", undone_at: null }).eq("id", draftId);
    if (e instanceof UndoConflict) {
      const what = e.keys.map((k) => (k === "asp:goals" ? "les objectifs" : "le programme")).join(" et ");
      return fail(409, "modifie_depuis", `${what} ont été modifiés depuis. Annuler effacerait ces modifications : renvoie avec { "forcer": true } si le coach le confirme.`);
    }
    throw e;
  }
}

async function getDrafts(admin: SupabaseClient, caller: Caller, url: URL) {
  const status = url.searchParams.get("status");
  if (status && !["pending", "applied", "rejected", "undone"].includes(status)) {
    return fail(400, "statut_invalide", "status : pending, applied, rejected ou undone");
  }
  // Un athlète qui a retiré son accord sort aussi de ce qui a été proposé
  // pour lui : relire ces propositions serait encore traiter ses données.
  const allowed = await allowedAthletes(admin, caller.coachId);
  const athleteId = url.searchParams.get("athlete_id");
  if (athleteId && !allowed.has(athleteId)) return fail(404, "athlete_introuvable", "Athlète inconnu ou non disponible.");
  const ids = athleteId ? [athleteId] : [...allowed.keys()];
  if (ids.length === 0) return json({ drafts: [] });

  await logAccess(admin, caller, "GET /drafts", athleteId);

  let q = admin
    .from("coach_api_drafts")
    .select("id, athlete_id, kind, title, body, status, applied_via, created_at, decided_at, undone_at")
    .eq("coach_id", caller.coachId)
    .in("athlete_id", ids)
    .order("created_at", { ascending: false })
    .limit(50);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error("coach_api_drafts: " + error.message);
  return json({ drafts: data ?? [] });
}

// ─────────────────────────────── Entrée ─────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const url = new URL(req.url);
    const path = url.pathname.replace(/^.*?\/coach-api/, "").replace(/\/+$/, "") || "/";
    const seg = path.split("/").filter(Boolean);
    const route = `${req.method} /${seg.map((s, i) => (i === 1 && (seg[0] === "athletes" || seg[0] === "drafts") ? ":id" : s)).join("/")}`;
    const appRoute = route === "POST /drafts/:id/appliquer" || route === "POST /drafts/:id/annuler";

    // ── Authentification ──
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    let caller: Caller;

    if (KEY.test(token)) {
      const { data: k, error: kErr } = await admin
        .from("coach_api_keys")
        .select("id, coach_id, revoked_at")
        .eq("key_hash", await sha256Hex(token))
        .maybeSingle();
      if (kErr) throw new Error("coach_api_keys: " + kErr.message);
      if (!k || k.revoked_at) return fail(401, "cle_invalide", "Clé inconnue ou révoquée.");
      caller = { keyId: k.id as string, coachId: k.coach_id as string, via: "api" };
    } else if (appRoute && token) {
      // Depuis l'app : la session du coach connecté.
      const { data: u, error: uErr } = await admin.auth.getUser(token);
      if (uErr || !u?.user) return fail(401, "session_invalide", "Session expirée : reconnecte-toi.");
      caller = { keyId: null, coachId: u.user.id, via: "app" };
    } else {
      return fail(401, "cle_invalide", "En-tête attendu : Authorization: Bearer agon_…");
    }

    // Un compte qui n'est plus coach perd l'accès, même avec une clé valide.
    const { data: profile } = await admin.from("profiles").select("role").eq("id", caller.coachId).maybeSingle();
    // « coach_athlete » : un coach qui s'entraîne aussi. C'est un coach.
    if (profile?.role !== "coach" && profile?.role !== "coach_athlete") return fail(403, "compte_non_coach", "Ce compte n'est pas (ou plus) un compte coach.");

    // ── Débit (clé de l'assistant seulement) ──
    if (caller.keyId) {
      const { data: hits, error: hErr } = await admin.rpc("coach_api_hit", { p_key: caller.keyId });
      if (hErr) throw new Error("coach_api_hit: " + hErr.message);
      if ((hits as number) > RATE_LIMIT_PER_MINUTE) {
        return fail(429, "trop_de_requetes", `${RATE_LIMIT_PER_MINUTE} requêtes par minute maximum.`, { "Retry-After": "60" });
      }
      await admin.from("coach_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", caller.keyId);
    }

    // ── Routage ──
    if (route === "POST /drafts/:id/appliquer" || route === "POST /drafts/:id/annuler") {
      if (!UUID.test(seg[1])) return fail(404, "proposition_introuvable", "Proposition inconnue.");
      return route.endsWith("appliquer")
        ? await postApply(admin, caller, seg[1])
        : await postUndo(admin, caller, seg[1], req);
    }
    if (caller.via === "app") return fail(403, "reserve_assistant", "Route réservée à la clé de l'assistant.");

    if (route === "GET /athletes") return await getAthletes(admin, caller);
    if (route === "GET /exercices") return await getExercices(admin, caller, url);
    if (route === "GET /drafts") return await getDrafts(admin, caller, url);
    if (route === "GET /seances-energie") return await getEnergyBank(admin, caller, url);
    if (route === "GET /tests") return await getTests(admin, caller, url);

    if (seg[0] === "athletes" && seg.length === 3) {
      const athleteId = seg[1];
      const allowed = UUID.test(athleteId) ? await allowedAthletes(admin, caller.coachId) : new Map();
      const athlete = allowed.get(athleteId);
      // Même réponse pour « pas ton athlète » et « n'a pas accepté » : la
      // différence révélerait la décision de l'athlète à qui ne la connaît pas.
      if (!athlete) return fail(404, "athlete_introuvable", "Athlète inconnu ou non disponible.");

      if (route === "GET /athletes/:id/summary") return await getSummary(admin, caller, athlete, url);
      if (route === "GET /athletes/:id/program") return await getProgram(admin, caller, athleteId);
      if (route === "GET /athletes/:id/periodisation") return await getPeriodisation(admin, caller, athleteId);
      if (route === "POST /athletes/:id/drafts") return await postDraft(admin, caller, athleteId, req);
    }

    return fail(404, "route_inconnue", "Routes : GET /athletes, GET /athletes/:id/summary, GET /athletes/:id/program, GET /athletes/:id/periodisation, POST /athletes/:id/drafts, GET /drafts, POST /drafts/:id/appliquer, POST /drafts/:id/annuler, GET /exercices?q=, GET /seances-energie?q=, GET /tests?q=");
  } catch (e) {
    console.error("coach-api:", e instanceof Error ? e.message : e);
    return fail(500, "erreur_serveur", "Erreur interne. Réessaie plus tard.");
  }
});
