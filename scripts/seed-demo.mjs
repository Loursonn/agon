#!/usr/bin/env node
/**
 * Jeu de démo Agon : un coach « Agon Démo » + une athlète « Léa Démo » avec un bloc en cours,
 * une kiné « Sam Démo » dans le staff de Léa (droits par défaut du métier, invitée par le coach),
 * des séances faites et à faire, wellness, retour hebdo, fiche, événements, compétition, tests, HYROX, nutrition,
 * séances de montre (course, HYROX) et 7 jours de santé (scripts/seed-demo-montre.mjs).
 *
 * Sert aussi de compte de relecture pour l'App Store et Google Play (P13) : les deux comptes sont
 * permanents, avec un mot de passe fixe, et le script se rejoue sans changer leurs identifiants.
 *
 * Usage :
 *   DEMO_PASSWORD=… node scripts/seed-demo.mjs                 # crée les comptes s'ils n'existent pas, sinon
 *                                                              # efface leurs données et les recrée (dates relatives
 *                                                              # à aujourd'hui) ; mot de passe et identifiants inchangés
 *   DEMO_PASSWORD=… node scripts/seed-demo.mjs --set-password  # idem, et remplace le mot de passe des comptes existants
 *   node scripts/seed-demo.mjs --link athlete [--app http://localhost:5173]   # lien magique de connexion
 *   node scripts/seed-demo.mjs --link coach
 *   node scripts/seed-demo.mjs --link staff
 *   node scripts/seed-demo.mjs --seulement-staff  # ajoute seulement Sam Démo au staff de Léa, sans mot de passe
 *                                                 # ni effacement (coach et Léa intacts) ; ne fait rien si c'est déjà fait
 *   node scripts/seed-demo.mjs --delete   # supprime les trois comptes démo et leurs données
 *
 * Mot de passe : uniquement par la variable d'environnement DEMO_PASSWORD, le même pour les trois
 * comptes. Il est stocké dans le gestionnaire de mots de passe d'Hugo ; il n'est jamais affiché par
 * le script ni écrit dans le repo (pas dans .env.example, pas dans un commit, pas dans un ticket).
 * Il sert aussi au script à ouvrir la session de l'athlète démo pour les RPC santé.
 *
 * Idempotent : relancé, le script repart d'un compte vide (suppression du profil, qui efface en
 * cascade toutes les données, comme delete-account) puis recrée le jeu de démo. Rien n'est dupliqué,
 * et ce qu'un relecteur a saisi entre-temps disparaît.
 *
 * Écrit dans la base de production : ne jamais le lancer sans l'accord d'Hugo.
 *
 * Lit VITE_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env (jamais commité).
 * Les données santé (wellness, poids, palier, objectif) passent par les RPC avec la session de l'athlète démo ;
 * `weight_set_goal` doit être appliquée en base (migration 20261110110000).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { seedWatchDemo } from "./seed-demo-montre.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env"), "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.VITE_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!URL_ || !KEY || !ANON) { console.error("VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY manquants dans .env"); process.exit(1); }
const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const COACH_EMAIL = "demo.coach@agon-demo.fr";
const ATHLETE_EMAIL = "lea.demo@agon-demo.fr";
const STAFF_EMAIL = "kine.demo@agon-demo.fr";
const PASSWORD = process.env.DEMO_PASSWORD || "";
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

/* ---------- dates ---------- */
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymdCompact = (d) => ymd(d).replace(/-/g, "");
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = new Date(); today.setHours(12, 0, 0, 0);
const dow = (today.getDay() + 6) % 7; // 0 = lundi
const monday = addDays(today, -dow);
const mondayOf = (w) => addDays(monday, 7 * w); // w = 0 cette semaine, -1 semaine dernière…

/* ---------- helpers ---------- */
async function must(p, label) {
  const { data, error } = await p;
  if (error) { console.error(`✗ ${label}:`, error.message || error); throw new Error(label); }
  return data;
}
const uuid = () => crypto.randomUUID();
const rnd = (a, b) => a + Math.random() * (b - a);
const round = (x, s = 0.5) => Math.round(x / s) * s;

async function findUser(email) {
  const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (data?.users || []).find((u) => (u.email || "").toLowerCase() === email);
}

/* =========================================================== */
/** Efface les données et le profil d'un compte démo ; le compte de connexion reste. */
async function wipeData(u) {
    // tables sans cascade possible : on nettoie explicitement par athlete_id / coach_id
    const byAth = ["app_data", "workout_logs", "energy_session_assignments", "weekly_retours", "day_themes", "competitions",
      "athlete_life_events", "doc_schedule", "doc_comments", "doc_assignments", "athlete_test_values", "athlete_test_results", "test_sessions",
      "provider_intraday", "provider_moveiq", "provider_dailies", "provider_activities", "hr_zone_models",
      "performance_logs", "medical_entries", "exercise_pr_logs", "hyrox_results", "measurement_logs", "microcycles", "cycles", "user_consents"];
    for (const t of byAth) {
      const col = t === "user_consents" ? "user_id" : t === "microcycles" ? null : "athlete_id";
      if (!col) continue;
      await sb.from(t).delete().eq(col, u.id);
    }
    const { data: docs } = await sb.from("docs").select("id,file_path").eq("coach_id", u.id);
    for (const d of docs || []) { if (d.file_path) await sb.storage.from("docs").remove([d.file_path]); }
    await sb.from("docs").delete().eq("coach_id", u.id);
    await sb.from("energy_sessions").delete().eq("created_by", u.id);
    // Le profil part en dernier : sa suppression efface en cascade tout le reste (séries, santé,
    // montre, ce qu'un relecteur a saisi…), comme pour un vrai compte.
    await sb.from("profiles").delete().eq("id", u.id);
}

async function remove() {
  for (const email of [STAFF_EMAIL, ATHLETE_EMAIL, COACH_EMAIL]) {
    const u = await findUser(email);
    if (!u) continue;
    await wipeData(u);
    const { error } = await sb.auth.admin.deleteUser(u.id);
    if (error) console.error("deleteUser", email, error.message); else console.log("supprimé", email);
  }
}

/**
 * Compte démo stable : réutilisé s'il existe (données effacées, mot de passe gardé sauf
 * --set-password), créé sinon. Renvoie l'identifiant, inchangé d'un lancement à l'autre.
 */
async function ensureAccount(email, metadata) {
  const existing = await findUser(email);
  if (!existing) {
    const created = await must(sb.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: metadata }), "createUser " + email);
    console.log("créé", email);
    return created.user.id;
  }
  await wipeData(existing);
  if (args.includes("--set-password")) {
    await must(sb.auth.admin.updateUserById(existing.id, { password: PASSWORD }), "mot de passe " + email);
    console.log("mot de passe remplacé", email);
  }
  console.log("réutilisé", email);
  return existing.id;
}

async function link(role) {
  const email = role === "coach" ? COACH_EMAIL : role === "staff" ? STAFF_EMAIL : ATHLETE_EMAIL;
  const app = argVal("--app") || "http://localhost:5173";
  const { data, error } = await sb.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: app } });
  if (error) { console.error(error.message); process.exit(1); }
  // Lien direct (sans e-mail) : ouvre une session puis redirige vers l'app
  console.log(data.properties.action_link);
}

/* =========================================================== */
async function seed() {
  if (!PASSWORD) { console.error("DEMO_PASSWORD manquant (gestionnaire de mots de passe d'Hugo)."); process.exit(1); }
  // Vérifié avant tout effacement : un mauvais mot de passe ne doit pas laisser un jeu à moitié recréé.
  if (!args.includes("--set-password") && (await findUser(ATHLETE_EMAIL))) {
    const probe = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await probe.auth.signInWithPassword({ email: ATHLETE_EMAIL, password: PASSWORD });
    if (error) { console.error("✗ DEMO_PASSWORD ne correspond pas au compte démo existant. Relancer avec --set-password pour le remplacer."); process.exit(1); }
  }

  /* --- comptes (athlète d'abord : ses données référencent le coach) --- */
  const ATH = await ensureAccount(ATHLETE_EMAIL, { full_name: "Léa Démo", role: "athlete" });
  const COACH = await ensureAccount(COACH_EMAIL, { full_name: "Agon Démo", role: "coach" });
  const STAFF = await ensureAccount(STAFF_EMAIL, { full_name: "Sam Démo", role: "staff" });
  console.log("coach", COACH, "| athlète", ATH, "| staff", STAFF);

  await must(sb.from("profiles").insert({ id: COACH, role: "coach", full_name: "Agon Démo", first_name: "Agon", last_name: "Démo", coach_code: "DEMO42", booking_url: "https://calendly.com/agon-demo/point-hebdo", is_pending: false }), "profile coach");
  await must(sb.from("profiles").insert({
    id: ATH, role: "athlete", full_name: "Léa Démo", first_name: "Léa", last_name: "Démo", coach_id: COACH, gender: "female",
    birth_date: "1998-04-12", height_cm: 171, weight_kg: 78.4, base_metabolism: 1580, is_hyrox_athlete: true, hyrox_category: "open",
    home_hidden_sections: [], is_pending: false
  }), "profile athlète");

  /* --- consentements --- */
  const V = "2026-10-31";
  await must(sb.from("user_consents").insert([
    { user_id: ATH, purpose: "health_data", granted: true, doc_version: V, statement: "J'accepte le traitement de mes données de santé et leur partage avec mon coach." },
    { user_id: ATH, purpose: "ai_programming", granted: true, doc_version: V, statement: "Mon coach peut utiliser l'assistance IA pour préparer mes programmes." },
    { user_id: ATH, purpose: "staff_sharing", granted: true, doc_version: V, statement: "Mon coach peut partager mes données avec son staff." },
    { user_id: COACH, purpose: "health_data", granted: true, doc_version: V, statement: "J'accepte le traitement des données de santé de mes athlètes." },
  ]), "consents");

  /* --- cycle + microcycles (3 semaines passées, 3 à venir) --- */
  const cycleStart = mondayOf(-3), cycleEnd = addDays(mondayOf(3), 6);
  const cycle = await must(sb.from("cycles").insert({ athlete_id: ATH, coach_id: COACH, name: "Bloc Force 2", start_date: ymd(cycleStart), end_date: ymd(cycleEnd), objective: "Force bas du corps + seuil" }).select().single(), "cycle");
  const micro = {};
  for (let w = -3; w <= 3; w++) {
    const m = await must(sb.from("microcycles").insert({ cycle_id: cycle.id, week_number: w + 4, start_date: ymd(mondayOf(w)), end_date: ymd(addDays(mondayOf(w), 6)), is_deload: w === 3 }).select().single(), "microcycle " + w);
    micro[w] = m.id;
  }

  /* --- exercices existants --- */
  const names = ["Back squat", "Fentes marchés sac", "Soulevé de terre trap-bar", "Leg curl machine", "Hip thrust unilatéral", "Développé couché", "Traction lestee", "Développé militaire", "Rowing cable assis", "Élévation latérale", "Pont fessier haltère"];
  const exRows = await must(sb.from("exercises").select("id,name").in("name", names), "exercises");
  const ex = Object.fromEntries(exRows.map((r) => [r.name, r.id]));
  const missing = names.filter((n) => !ex[n]); if (missing.length) throw new Error("exercices absents : " + missing.join(", "));

  const P = (nb, reps, charge, rir = 2, tempo = "", unit = "kg") => ({ nb_series: nb, reps: { mode: "global", value: reps }, reps_mode: { mode: "global", value: "EC" }, charge_unit: unit, charge: { mode: "global", value: charge }, rir: { mode: "global", value: rir }, tempo: { mode: "global", value: tempo } });
  const E = (name, label, params, extra = {}) => ({ id: uuid(), exercise_id: ex[name], exercise_name: label || name, mode: "classique", sort_order: 0, params, ...extra });
  const B = (name, exos, extra = {}) => ({ id: uuid(), name, series_mode: "fixe", timing_mode: "repos", timing_repos_min: 2, timing_repos_sec: 0, sort_order: 0, exercices: exos.map((e, i) => ({ ...e, sort_order: i })), ...extra });

  const docId = uuid(); // fiche attachée à la séance bas du corps
  const sBas = { id: "demo-bas", name: "Bas du corps · Force", short: "BAS", recurrence: "weekly", multi_semaine: false, fiches: [{ id: uuid(), doc_id: docId }], blocs: [
    B("A", [E("Back squat", "Squat barre", P(4, 8, 80, 2, "3010"), { comment: "Descends bien sous la parallèle, genoux dans l'axe." })], { category: "Force", instructions: "Échauffement : 2 séries à vide puis 50 %." }),
    B("B", [E("Fentes marchés sac", "Fente bulgare", P(3, 10, 20, 2)), E("Soulevé de terre trap-bar", "Soulevé de terre trap-bar", P(3, 8, 90, 2, "2010"))], { category: "Hypertrophie" }),
    B("C", [E("Leg curl machine", "Leg curl", P(3, 12, 35, 1)), E("Hip thrust unilatéral", "Hip thrust unilatéral", P(3, 12, 30, 1))], { category: "Hypertrophie", timing_mode: "repos", timing_repos_min: 1, timing_repos_sec: 30 }),
  ] };
  const sHaut = { id: "demo-haut", name: "Haut du corps · Hypertrophie", short: "HAUT", recurrence: "weekly", multi_semaine: false, blocs: [
    B("A", [E("Développé couché", null, P(4, 8, 55, 2, "3010")), E("Traction lestee", "Tractions lestées", P(4, 6, 5, 2))], { category: "Force" }),
    B("B", [E("Développé militaire", null, P(3, 10, 27.5, 2)), E("Rowing cable assis", "Rowing câble assis", P(3, 12, 40, 1))], { category: "Hypertrophie" }),
    B("C", [E("Élévation latérale", null, P(3, 15, 8, 0))], { category: "Hypertrophie", timing_mode: "repos", timing_repos_min: 1, timing_repos_sec: 0 }),
  ] };
  const sMob = { id: "demo-mob", name: "Gainage & mobilité", short: "MOB", recurrence: "weekly", multi_semaine: false, blocs: [
    B("A", [E("Pont fessier haltère", null, P(3, 15, 20, 1)), E("Hip thrust unilatéral", "Hip thrust unilatéral", P(2, 12, 20, 2))], { category: "Mixte" }),
  ] };
  [sBas, sHaut, sMob].forEach((s) => s.blocs.forEach((b, i) => (b.sort_order = i)));
  const exIds = (s) => s.blocs.flatMap((b) => b.exercices.map((e) => e.id));

  /* --- workout_logs : passé complété, hier non clôturé, aujourd'hui prévu --- */
  const sets = (s, wk) => {
    const out = {};
    s.blocs.forEach((b) => b.exercices.forEach((e) => {
      const base = e.params.charge.value; const n = e.params.nb_series; const reps = e.params.reps.value;
      out[e.id] = Array.from({ length: n }, (_, i) => ({ done: true, kg: round(base * (1 + 0.025 * (wk + 3)) + (i === n - 1 ? -2.5 : 0), 1.25), reps: reps - (i === n - 1 ? 1 : 0), rir: 2 }));
    }));
    return out;
  };
  const logs = [];
  const logRow = (s, date, w, status, extra = {}) => ({ id: uuid(), athlete_id: ATH, coach_id: COACH, session_id: s.id, session_name: s.name, scheduled_date: ymd(date), original_scheduled_date: ymd(date), status, microcycle_id: micro[w], week_number: w + 4, ...extra });
  for (let w = -3; w <= -1; w++) {
    const mon = mondayOf(w);
    logs.push(logRow(sHaut, mon, w, "completed", { completed_at: addDays(mon, 0).toISOString(), rpe_score: 7, athlete_modifications: { sessionSets: sets(sHaut, w), sessionForme: 4, sessionComment: "Bonnes sensations." } }));
    logs.push(logRow(sBas, addDays(mon, 2), w, "completed", { completed_at: addDays(mon, 2).toISOString(), rpe_score: 8, athlete_modifications: { sessionSets: sets(sBas, w), sessionForme: 4, sessionComment: "Squat lourd mais propre." } }));
    logs.push(logRow(sMob, addDays(mon, 4), w, "completed", { completed_at: addDays(mon, 4).toISOString(), rpe_score: 4, athlete_modifications: { sessionSets: sets(sMob, w), sessionForme: 4 } }));
  }
  // cette semaine
  const thisMon = mondayOf(0);
  const planThis = (s, d, extra = {}) => { const date = addDays(thisMon, d); const past = ymd(date) < ymd(today); return logRow(s, date, 0, past ? "completed" : "planned", past ? { completed_at: date.toISOString(), rpe_score: 7, athlete_modifications: { sessionSets: sets(s, 0), sessionForme: 4 } } : extra); };
  // lundi haut (fait), hier gainage non clôturé (bandeau), aujourd'hui bas du corps (à faire), jeudi haut, samedi course (énergie)
  if (dow >= 1) logs.push(planThis(sHaut, 0));
  const yesterday = addDays(today, -1);
  if (dow >= 1) logs.push({ ...logRow(sMob, yesterday, 0, "planned", { athlete_modifications: { sessionSets: { [exIds(sMob)[0]]: [{ done: true, kg: 20, reps: 15, rir: 1 }, { done: true, kg: 20, reps: 15, rir: 1 }, { done: false }] } } }) });
  logs.push(logRow(sBas, today, 0, "planned"));
  if (dow < 3) logs.push(logRow(sHaut, addDays(thisMon, 3), 0, "planned")); else if (dow < 5) logs.push(logRow(sHaut, addDays(thisMon, 5), 0, "planned"));
  // semaines suivantes
  for (let w = 1; w <= 2; w++) { const mon = mondayOf(w); logs.push(logRow(sHaut, mon, w, "planned")); logs.push(logRow(sBas, addDays(mon, 2), w, "planned")); logs.push(logRow(sMob, addDays(mon, 4), w, "planned")); }
  await must(sb.from("workout_logs").insert(logs), "workout_logs");

  /* --- app_data --- */
  const wh = {}, wlog = {};
  for (let i = 20; i >= 0; i--) {
    const d = addDays(today, -i); const k = ymdCompact(d);
    const f = Math.round(rnd(3, 5)), so = Math.round(rnd(3, 5)), st = Math.round(rnd(2, 4)), en = Math.round(rnd(3, 5)), dm = Math.round(rnd(2, 4));
    const w = { fatigue: f, sommeil: so, stress: st, energie: en, doms: dm, domsZones: [], domsPoints: [], coucher: { h: 23, m: 10 }, reveil: { h: 6, m: 45 }, sleepDur: 7.3, poids: Math.round((78.2 + rnd(-0.4, 0.4)) * 10) / 10, score: Math.round((f + so + st + en + dm) / 25 * 100), injComment: null, sleepInterrupt: null, sleepInterruptNote: null, date: k };
    wh[k] = w; wlog[k] = w.poids;
  }
  const todayW = { ...wh[ymdCompact(today)], fatigue: 4, sommeil: 4, stress: 3, energie: 4, doms: 3, score: 72, poids: 78.4 };
  wh[ymdCompact(today)] = todayW; wlog[ymdCompact(today)] = 78.4;
  const nlog = {}; for (let i = 13; i >= 1; i--) { const d = addDays(today, -i); const act = Math.round(rnd(350, 650)); const zone = (1580 + act) * 1.075; const kcal = Math.round(zone + rnd(-90, 90)); nlog[ymd(d)] = { active_calories: act, total_calories_consumed: kcal, glucides_consumed: Math.round(kcal * 0.5 / 4), lipides_consumed: Math.round(kcal * 0.25 / 9), proteines_consumed: Math.round(kcal * 0.25 / 4) }; }
  nlog[ymd(today)] = { active_calories: 420, total_calories_consumed: 2160, glucides_consumed: 270, lipides_consumed: 60, proteines_consumed: 135 };
  const freeDate = addDays(thisMon, -3); // vendredi dernier
  const appData = [
    ["asp:prog", [sBas, sHaut, sMob]],
    ["asp:goals", { sessionsPerWeek: 3, sleepTarget: 8 }],
    ["asp:freesess", [{ id: "free_" + Date.now(), name: "Course", sport: "course", sportEmoji: "CO", date: ymd(freeDate), duration: 42, distance_km: 8.2, intensity: 6, note: "Footing tranquille avec Max", completed: true, exercises: [] }]],
    ["asp:nutrition_strategy", { strategy: "prise_de_masse", can_track_calories: true, calorie_mode: "active", deficit_mode: "range", nap: 1.5, total_calories_coach: 2850, total_calories_min: 2750, total_calories_max: 2950, tdee_ref: 2650, target_weight: 80, surplus_deficit_min: 5, surplus_deficit_max: 10, weekly_target_kg: 0.25, macros_glucides: 360, macros_lipides: 80, macros_proteines: 160, macros_glucides_pct: 50, macros_lipides_pct: 25, macros_proteines_pct: 25 }],
    ["asp:nutrition_log", nlog],
  ];
  await must(sb.from("app_data").upsert(appData.map(([key, value]) => ({ athlete_id: ATH, key, value })), { onConflict: "athlete_id,key" }), "app_data");

  /* --- santé (wellness, poids, palier, objectif) : par les RPC, comme l'app ---
     Les RPC contrôlent auth.uid() : on les appelle donc avec la session de l'athlète
     (clé publique + mot de passe du compte de démo), pas avec la clé service. */
  const asAthlete = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await asAthlete.auth.signInWithPassword({ email: ATHLETE_EMAIL, password: PASSWORD });
  if (login.error) {
    console.error("✗ connexion athlète démo : DEMO_PASSWORD ne correspond pas au compte existant. Relancer avec --set-password pour le remplacer.");
    throw new Error("connexion athlète démo");
  }
  const rpc = (fn, args) => must(asAthlete.rpc(fn, args), fn);
  for (const k of Object.keys(wh).sort()) {
    const day = `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
    await rpc("wellness_set_day", { p_athlete: ATH, p_day: day, p_entry: wh[k] });
    await rpc("weight_set_day", { p_athlete: ATH, p_day: day, p_kg: wlog[k] });
  }
  // Palier franchi il y a 30 jours : pose aussi la référence (asp:bw.current = 79.6) ; puis l'objectif.
  await rpc("weight_record_milestone", { p_athlete: ATH, p_day: ymd(addDays(today, -30)), p_kg: 79.6 });
  await rpc("weight_set_goal", { p_athlete: ATH, p_target_kg: 77 });

  /* --- retours hebdo, thèmes, compétitions, événements --- */
  await must(sb.from("weekly_retours").insert([
    { athlete_id: ATH, coach_id: COACH, week_start: ymd(mondayOf(-1)), comment: "Bonne régularité cette semaine, 3 séances sur 3. On monte un peu les charges sur le squat, garde ton RIR à 2. Pense à ton wellness le matin 👍" },
    { athlete_id: ATH, coach_id: COACH, week_start: ymd(mondayOf(-2)), comment: "Semaine solide. Le seuil de samedi était bien tenu, on garde cette allure.", athlete_reaction: "fire", reacted_at: addDays(mondayOf(-1), 1).toISOString() },
  ]), "weekly_retours");
  const themes = [["#ff5a33", "hard", "volume", "Haut du corps", 0], ["#ffc933", "hard", "force", "Bas du corps · Force", 2], ["#33b5ff", "moyen", "seuil", "Seuil 4×6", 5], ["#7d7468", "repos", "mixte", "Repos", 6]];
  await must(sb.from("day_themes").insert(themes.map(([color, intensity, dominante, label, d]) => ({ athlete_id: ATH, coach_id: COACH, date: ymd(addDays(thisMon, d)), label, intensity, dominante, color }))), "day_themes");
  await must(sb.from("competitions").insert([
    { coach_id: COACH, athlete_id: ATH, name: "10 km de Lyon", type: "competition", date: ymd(addDays(today, 26)), location: "Lyon", priority: "A", notes: "Objectif : sous 44 min." },
    { coach_id: COACH, athlete_id: ATH, name: "Semi-marathon de Nantes", type: "competition", date: ymd(addDays(today, -24)), location: "Nantes", priority: "B", athlete_comment: "1h41, bien géré, un peu juste sur les 5 derniers km." },
  ]), "competitions");
  await must(sb.from("athlete_life_events").insert([
    { athlete_id: ATH, title: "Grosse semaine de taf", date_start: ymd(addDays(today, 20)), date_end: ymd(addDays(today, 24)) },
  ]), "life_events");

  /* --- séance énergie (seuil) + VMA --- */
  const step = (role, min, target) => ({ type: "interval", id: uuid(), role, duration: { kind: "time", value: min * 60 }, target: target || null });
  const es = await must(sb.from("energy_sessions").insert({
    name: "Seuil 4×6 min", session_kind: "seuil", structure_type: "fractionne", created_by: COACH, athlete_id: ATH, modality: "course",
    intervals: [step("warmup", 12, { kind: "pace_test_pct", test_metric: "VMA", min: 60, max: 65 }), { type: "group", id: uuid(), role: "work", repeat: 4, children: [step("work", 6, { kind: "pace_test_pct", test_metric: "VMA", min: 85, max: 88 }), step("recovery", 2, { kind: "pace_test_pct", test_metric: "VMA", min: 55, max: 60 })] }, step("cooldown", 10, { kind: "pace_test_pct", test_metric: "VMA", min: 55, max: 60 })],
    total_duration_s: 54 * 60, notes: "Allure régulière sur les 4 blocs, pas de départ trop rapide.",
  }).select().single(), "energy_session");
  const ea = [];
  for (let w = -3; w <= -1; w++) ea.push({ athlete_id: ATH, coach_id: COACH, energy_session_id: es.id, scheduled_date: ymd(addDays(mondayOf(w), 5)), status: "completed", microcycle_id: micro[w], rpe_score: 7, activity_type: "course", distance_km: round(11 + rnd(-0.4, 0.6), 0.1), actual_duration_min: 54 });
  ea.push({ athlete_id: ATH, coach_id: COACH, energy_session_id: es.id, scheduled_date: ymd(addDays(thisMon, 5)), status: dow > 5 ? "completed" : "planned", microcycle_id: micro[0] });
  ea.push({ athlete_id: ATH, coach_id: COACH, energy_session_id: es.id, scheduled_date: ymd(addDays(mondayOf(1), 5)), status: "planned", microcycle_id: micro[1] });
  await must(sb.from("energy_session_assignments").insert(ea), "energy_assignments");
  await must(sb.from("performance_logs").insert({ athlete_id: ATH, metric_type: "reference", metric_name: "VMA", value: 16.5, unit: "km/h", date: ymd(addDays(today, -40)), is_active_reference: true, coach_validated: true, created_by: COACH, notes: "Demi-Cooper piste" }), "performance_logs");

  /* --- tests --- */
  const defs = await must(sb.from("test_definitions").select("id,name").in("id", ["00000000-0000-0000-0000-0000000000a2", "00000000-0000-0000-0000-0000000000a4"]), "test_definitions");
  const defName = (id) => defs.find((d) => d.id === id)?.name;
  await must(sb.from("test_sessions").insert([
    { athlete_id: ATH, coach_id: COACH, type: "endurance", title: defName("00000000-0000-0000-0000-0000000000a2") || "Demi-Cooper", description: "6 min à allure max sur piste, après 15 min d'échauffement.", date: ymd(addDays(today, dow <= 3 ? 4 - dow : 11 - dow)), completed: false },
    { athlete_id: ATH, coach_id: COACH, type: "puissance", title: defName("00000000-0000-0000-0000-0000000000a4") || "Squat Jump", description: "3 essais, meilleur retenu.", date: ymd(addDays(today, -35)), completed: true, results_structured: { variables: { hauteur: 34 }, comment: "Bonne détente, +2 cm vs septembre." } },
    { athlete_id: ATH, coach_id: COACH, type: "endurance", title: defName("00000000-0000-0000-0000-0000000000a2") || "Demi-Cooper", description: "6 min à allure max sur piste.", date: ymd(addDays(today, -40)), completed: true, results_structured: { variables: { distance: 1650 }, comment: "Régulier, dernière minute en accélération." } },
  ]), "test_sessions");
  await must(sb.from("exercise_pr_logs").insert([
    { athlete_id: ATH, exercise_ref: "Squat barre", kg: 120, date: ymd(addDays(today, -6)), source: "computed", source_reps: 6, source_kg: 100 },
    { athlete_id: ATH, exercise_ref: "Squat barre", kg: 115, date: ymd(addDays(today, -34)), source: "computed", source_reps: 8, source_kg: 92.5 },
    { athlete_id: ATH, exercise_ref: "Tractions lestées", kg: 12.5, date: ymd(addDays(today, -8)), source: "manual" },
    { athlete_id: ATH, exercise_ref: "Développé couché", kg: 72.5, date: ymd(addDays(today, -15)), source: "computed", source_reps: 8, source_kg: 60 },
  ]), "pr_logs");

  /* --- fiche (image générée) + banque + commentaires --- */
  let filePath = null;
  try {
    const png = path.join(root, "scripts", "fiche-demo.png");
    filePath = `${COACH}/athletes/${ATH}/${docId}.png`;
    const up = await sb.storage.from("docs").upload(filePath, fs.readFileSync(png), { contentType: "image/png", upsert: true });
    if (up.error) { console.warn("upload fiche :", up.error.message); filePath = null; }
  } catch (e) { console.warn("fiche image non générée :", e.message); }
  if (filePath) {
    await must(sb.from("docs").insert({ id: docId, coach_id: COACH, athlete_id: ATH, uploaded_by: COACH, title: "Mobilité hanches · 10 min", description: "À faire avant chaque séance bas du corps.", category: "mobilite", kind: "image", file_path: filePath, mime_type: "image/png", file_size: fs.statSync(path.join(root, "scripts", "fiche-demo.png")).size }), "doc");
    await must(sb.from("doc_assignments").insert([{ doc_id: docId, athlete_id: ATH, assigned_by: COACH, source: "programme", coach_note: "Avant chaque séance bas du corps." }, { doc_id: docId, athlete_id: ATH, assigned_by: COACH, source: "manuel", coach_note: "À lire avant mercredi." }]), "doc_assignments");
    await must(sb.from("doc_comments").insert({ doc_id: docId, athlete_id: ATH, author_id: COACH, body: "Tu peux me filmer ton 90/90 ? Je veux vérifier la hanche droite." }), "doc_comment");
    const bankId = uuid(); const bankPath = `${COACH}/banque/${bankId}.png`;
    const up2 = await sb.storage.from("docs").upload(bankPath, fs.readFileSync(path.join(root, "scripts", "fiche-demo.png")), { contentType: "image/png", upsert: true });
    if (!up2.error) await must(sb.from("docs").insert({ id: bankId, coach_id: COACH, uploaded_by: COACH, title: "Placement de la barre au squat", description: "Repères techniques.", category: "education", kind: "image", file_path: bankPath, mime_type: "image/png", is_self_service: true }), "doc banque");
  }

  /* --- médical, HYROX, mensurations --- */
  await must(sb.from("medical_entries").insert({ athlete_id: ATH, kind: "blessure", title: "Entorse cheville gauche", zone: "Cheville gauche", date: ymd(addDays(today, -120)), status: "gueri", injury_type: "traumatique", training_impact: "adapte", days_off: 10, declared_by: "athlete", created_by: ATH }), "medical");
  await must(sb.from("hyrox_results").insert({ athlete_id: ATH, date: ymd(addDays(today, -60)), format: "solo", division: "women", status: "finished", source: "manual", event_name: "HYROX Paris", venue: "Paris", total_s: 4368, run_1_s: 268, run_2_s: 292, run_3_s: 300, run_4_s: 298, run_5_s: 305, run_6_s: 310, run_7_s: 312, run_8_s: 305, ski_s: 262, sled_push_s: 215, sled_pull_s: 262, bbj_s: 300, row_s: 270, farmers_s: 138, lunges_s: 250, wall_balls_s: 355, roxzone_total_s: 216, penalties_s: 0, created_by: ATH }), "hyrox");
  await must(sb.from("measurement_logs").insert({ athlete_id: ATH, date: ymd(addDays(today, -2)), weight_kg: 78.4, bras_g: 31, bras_d: 31.5, epaules: 108, poitrine: 94, taille: 74, hanche: 98, cuisse_g: 58, cuisse_d: 58.5, mollet_g: 37, mollet_d: 37, photos: {} }), "measurements");


  /* --- montre : course, HYROX, 7 jours de santé (fictifs) --- */
  await seedWatchDemo(sb, ATH, COACH);

  /* --- staff : Sam Démo, kiné de Léa ---
     Comme dans l'app : le coach invite (session du coach, le trigger fixe invited_by et la grille),
     puis le compte staff accepte par la RPC (seule voie de création d'un lien athlete_staff).
     Le profil de Léa a été recréé plus haut : l'ancien lien et les anciennes invitations sont
     partis en cascade, rien n'est dupliqué. */
  await must(sb.from("profiles").insert({ id: STAFF, role: "staff", full_name: "Sam Démo", first_name: "Sam", last_name: "Démo", profession: "kine", birth_date: "1991-03-08", is_pending: false }), "profile staff");
  const asCoach = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  if ((await asCoach.auth.signInWithPassword({ email: COACH_EMAIL, password: PASSWORD })).error) throw new Error("connexion coach démo");
  // Grille par défaut du kiné : onglets en écriture (fiches, médical, commentaires), en lecture
  // (séances, planning, wellness, tests) et verrouillés (nutrition) — tout ce que l'espace staff montre.
  const inv = await must(asCoach.from("staff_invitations").insert({
    athlete_id: ATH, email: STAFF_EMAIL, profession: "kine", invited_by: COACH, invited_by_role: "coach",
    permissions: { seances: "read", fiches: "write", planification: "read", logs: "read", wellness: "read", medical: "write", nutrition: "none", tests: "read", commentaires: "write" },
  }).select("token").single(), "invitation staff");
  const asStaff = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  if ((await asStaff.auth.signInWithPassword({ email: STAFF_EMAIL, password: PASSWORD })).error) throw new Error("connexion staff démo");
  await must(asStaff.rpc("accept_staff_invitation", { p_token: inv.token }), "acceptation staff");

  console.log("\n✓ Démo créée : coach Agon Démo (code DEMO42) + athlète Léa Démo + kiné Sam Démo (staff de Léa).");
  console.log("  Aujourd'hui :", ymd(today), "| séance du jour : Bas du corps · Force | hier : Gainage non clôturé");
  console.log("  Connexion : node scripts/seed-demo.mjs --link athlete");
}

/* =========================================================== */
/**
 * Session d'un compte démo sans mot de passe : lien magique généré côté serveur, puis vérifié
 * côté client (comme un clic sur le lien). Le jeton ne sort jamais du processus.
 */
async function sessionOf(email) {
  const gen = await must(sb.auth.admin.generateLink({ type: "magiclink", email }), "lien magique " + email);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.verifyOtp({ token_hash: gen.properties.hashed_token, type: "magiclink" });
  if (error) throw new Error("session " + email + " : " + error.message);
  return client;
}

/**
 * --seulement-staff : ajoute seulement la kiné « Sam Démo » au staff de Léa, sans toucher au coach
 * ni à Léa (leurs données restent). Aucun mot de passe : le compte staff est créé avec un mot de
 * passe aléatoire jamais affiché (connexion par --link staff), les sessions coach et staff passent
 * par lien magique. Idempotent : si le lien actif existe déjà, ne fait rien.
 */
async function seedStaffOnly() {
  const coachU = await findUser(COACH_EMAIL), athU = await findUser(ATHLETE_EMAIL);
  if (!coachU || !athU) { console.error("✗ Comptes démo coach / athlète absents : lancer d'abord le seed complet."); process.exit(1); }
  const ath = await must(sb.from("profiles").select("id,coach_id").eq("id", athU.id).maybeSingle(), "profil athlète");
  if (!ath || ath.coach_id !== coachU.id) { console.error("✗ Léa Démo n'est pas rattachée au coach démo."); process.exit(1); }

  let staffU = await findUser(STAFF_EMAIL);
  if (!staffU) {
    const created = await must(sb.auth.admin.createUser({
      email: STAFF_EMAIL, password: crypto.randomBytes(24).toString("base64url"), email_confirm: true,
      user_metadata: { full_name: "Sam Démo", role: "staff" },
    }), "createUser " + STAFF_EMAIL);
    staffU = created.user;
    console.log("créé", STAFF_EMAIL);
  } else console.log("réutilisé", STAFF_EMAIL);
  const STAFF = staffU.id;

  const prof = await must(sb.from("profiles").select("id,role").eq("id", STAFF).maybeSingle(), "profil staff");
  if (!prof) {
    await must(sb.from("profiles").insert({ id: STAFF, role: "staff", full_name: "Sam Démo", first_name: "Sam", last_name: "Démo", profession: "kine", birth_date: "1991-03-08", is_pending: false }), "profile staff");
    console.log("profil staff créé");
  } else if (prof.role !== "staff") { console.error("✗ Le compte", STAFF_EMAIL, "a un profil", prof.role, ": arrêt."); process.exit(1); }

  const linked = await must(sb.from("athlete_staff").select("id,status").eq("athlete_id", athU.id).eq("staff_id", STAFF).maybeSingle(), "lien staff");
  if (linked?.status === "active") { console.log("✓ Sam Démo est déjà dans le staff de Léa Démo : rien à faire."); return; }

  // Invitation en attente réutilisée, sinon créée par le coach (même grille que le seed complet).
  const asCoach = await sessionOf(COACH_EMAIL);
  const pending = await must(asCoach.from("staff_invitations").select("token").eq("athlete_id", athU.id).eq("email", STAFF_EMAIL)
    .is("used_at", null).gt("expires_at", new Date().toISOString()).limit(1), "invitations en attente");
  const token = pending[0]?.token ?? (await must(asCoach.from("staff_invitations").insert({
    athlete_id: athU.id, email: STAFF_EMAIL, profession: "kine", invited_by: coachU.id, invited_by_role: "coach",
    permissions: { seances: "read", fiches: "write", planification: "read", logs: "read", wellness: "read", medical: "write", nutrition: "none", tests: "read", commentaires: "write" },
  }).select("token").single(), "invitation staff")).token;
  const asStaff = await sessionOf(STAFF_EMAIL);
  await must(asStaff.rpc("accept_staff_invitation", { p_token: token }), "acceptation staff");
  console.log("✓ Sam Démo (kiné) ajoutée au staff de Léa Démo. Connexion : node scripts/seed-demo.mjs --link staff");
}

const mode = args.includes("--delete") ? "delete" : args.includes("--link") ? "link" : args.includes("--seulement-staff") ? "staff" : "seed";
if (mode === "delete") await remove();
else if (mode === "link") await link(argVal("--link"));
else if (mode === "staff") await seedStaffOnly();
else await seed();
