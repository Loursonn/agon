// coach-api — API de l'assistant IA personnel d'un coach (Claude).
//
// Lecture des données des athlètes qui l'ont accepté, et dépôt de
// propositions que le coach applique ou écarte dans Agon. Aucune écriture
// directe dans les données d'un athlète, aucune suppression.
//
// Documentation pour les coachs : docs/API_COACH.md.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AI_ASSISTANT_SINCE, normName, validateDraft, type ProgSessionShape } from "../_shared/coachApiOps.ts";
import { buildSummary, firstName, parsePeriod, readProgram, type SummaryInput } from "../_shared/coachApiRead.ts";

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
  keyId: string;
  coachId: string;
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
    .eq("coach_id", coachId)
    .neq("id", coachId);
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

  const [{ values }, logs, prs, acts, days, themes, energy] = await Promise.all([
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
      .select("scheduled_date, status, rpe_score, actual_duration_min, distance_km, energy_sessions(name, session_kind, total_duration_s, total_distance_m)")
      .eq("athlete_id", athlete.id).gte("scheduled_date", from).lte("scheduled_date", to)
      .order("scheduled_date").limit(500),
  ]);
  for (const r of [logs, prs, acts, days, themes, energy]) if (r.error) throw new Error(r.error.message);

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
  }));
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

  const kind = (raw as { kind?: unknown } | null)?.kind;
  const { values } = await appData(admin, athleteId, ["asp:prog", "asp:goals"]);
  const prog = Array.isArray(values["asp:prog"]) ? (values["asp:prog"] as ProgSessionShape[]) : [];

  const result = validateDraft(raw, {
    prog,
    newId: () => crypto.randomUUID(),
    library: kind === "programme" || kind === "semaine" ? await library(admin, caller.coachId) : undefined,
    today: todayParis(),
    energy: kind === "semaine" ? await energyForAthlete(admin, caller.coachId, athleteId) : undefined,
  });
  if (!result.ok) return fail(400, "proposition_invalide", result.error);

  const draft = result.value;
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
    .select("id, kind, title, status, created_at")
    .single();
  if (error) throw new Error("coach_api_drafts: " + error.message);

  return json({
    ...data,
    ops: draft.ops,
    message: "Proposition déposée. Elle n'est appliquée que si le coach la valide dans Agon.",
  }, 201);
}

async function getDrafts(admin: SupabaseClient, caller: Caller, url: URL) {
  const status = url.searchParams.get("status");
  if (status && !["pending", "applied", "rejected"].includes(status)) {
    return fail(400, "statut_invalide", "status : pending, applied ou rejected");
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
    .select("id, athlete_id, kind, title, body, status, created_at, decided_at")
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

    // ── Clé ──
    const auth = req.headers.get("Authorization") ?? "";
    const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!KEY.test(key)) {
      return fail(401, "cle_invalide", "En-tête attendu : Authorization: Bearer agon_…");
    }
    const { data: k, error: kErr } = await admin
      .from("coach_api_keys")
      .select("id, coach_id, revoked_at")
      .eq("key_hash", await sha256Hex(key))
      .maybeSingle();
    if (kErr) throw new Error("coach_api_keys: " + kErr.message);
    if (!k || k.revoked_at) return fail(401, "cle_invalide", "Clé inconnue ou révoquée.");

    // Un compte qui n'est plus coach perd l'accès, même avec une clé valide.
    const { data: profile } = await admin.from("profiles").select("role").eq("id", k.coach_id).maybeSingle();
    if (profile?.role !== "coach") return fail(403, "compte_non_coach", "Cette clé appartient à un compte qui n'est plus coach.");

    const caller: Caller = { keyId: k.id as string, coachId: k.coach_id as string };

    // ── Débit ──
    const { data: hits, error: hErr } = await admin.rpc("coach_api_hit", { p_key: caller.keyId });
    if (hErr) throw new Error("coach_api_hit: " + hErr.message);
    if ((hits as number) > RATE_LIMIT_PER_MINUTE) {
      return fail(429, "trop_de_requetes", `${RATE_LIMIT_PER_MINUTE} requêtes par minute maximum.`, { "Retry-After": "60" });
    }
    await admin.from("coach_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", caller.keyId);

    // ── Routage ──
    const url = new URL(req.url);
    const path = url.pathname.replace(/^.*?\/coach-api/, "").replace(/\/+$/, "") || "/";
    const seg = path.split("/").filter(Boolean);
    const route = `${req.method} /${seg.map((s, i) => (i === 1 && seg[0] === "athletes" ? ":id" : s)).join("/")}`;

    if (route === "GET /athletes") return await getAthletes(admin, caller);
    if (route === "GET /exercices") return await getExercices(admin, caller, url);
    if (route === "GET /drafts") return await getDrafts(admin, caller, url);
    if (route === "GET /seances-energie") return await getEnergyBank(admin, caller, url);

    if (seg[0] === "athletes" && seg.length === 3) {
      const athleteId = seg[1];
      const allowed = UUID.test(athleteId) ? await allowedAthletes(admin, caller.coachId) : new Map();
      const athlete = allowed.get(athleteId);
      // Même réponse pour « pas ton athlète » et « n'a pas accepté » : la
      // différence révélerait la décision de l'athlète à qui ne la connaît pas.
      if (!athlete) return fail(404, "athlete_introuvable", "Athlète inconnu ou non disponible.");

      if (route === "GET /athletes/:id/summary") return await getSummary(admin, caller, athlete, url);
      if (route === "GET /athletes/:id/program") return await getProgram(admin, caller, athleteId);
      if (route === "POST /athletes/:id/drafts") return await postDraft(admin, caller, athleteId, req);
    }

    return fail(404, "route_inconnue", "Routes : GET /athletes, GET /athletes/:id/summary, GET /athletes/:id/program, POST /athletes/:id/drafts, GET /drafts, GET /exercices?q=, GET /seances-energie?q=");
  } catch (e) {
    console.error("coach-api:", e instanceof Error ? e.message : e);
    return fail(500, "erreur_serveur", "Erreur interne. Réessaie plus tard.");
  }
});
