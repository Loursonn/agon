#!/usr/bin/env node
/**
 * Démo montre pour « Léa Démo » (données 100 % fictives) :
 * - une course « Seuil 4×6 min » (série seconde par seconde, 11 tours de la montre) ;
 * - une séance HYROX 4 × (1 km course + 25 m sled push + 20 wall balls), 12 tours,
 *   rattachée à une séance prévue HYROX (tours nommés d'après le plan) ;
 * - 7 jours de santé : résumé du jour (sommeil, VFC, FC repos, stress, Body Battery,
 *   SpO2, respiration) et séries de la journée.
 *
 * Additif et rejouable : upserts sur des identifiants « demo-… », rien n'est supprimé.
 * Usage : node scripts/seed-demo-montre.mjs   (Léa Démo doit exister : scripts/seed-demo.mjs)
 * Aussi appelé à la fin de scripts/seed-demo.mjs.
 *
 * Lit VITE_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env (jamais commité).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const HYROX_SPORT_ID = "1e2976fa-abf3-4c9a-bd9f-b1636ead5bf0";
const EX_SLED_PUSH = "a731d594-0f6a-4a13-a100-5bd936bc8641";
const EX_WALL_BALL = "ae686c4b-a401-4940-8ae4-d22fcd9aa371";
const EX_RUN = "4a7e0000-0000-4000-8000-000000000003";
const DEVICE = "Forerunner 265";
const UTC_OFFSET_S = 3600;

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** Aléatoire reproductible (mêmes courbes à chaque rejeu). */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

async function must(p, label) {
  const { data, error } = await p;
  if (error) throw new Error(`${label} : ${error.message}`);
  return data;
}

/** Série seconde par seconde à partir de blocs { secs, speed, hr, cadence }. */
function buildStream(blocks, seed) {
  const r = rng(seed);
  const t = [], hr = [], speed = [], dist = [], alt = [], cadence = [];
  const laps = [];
  let h = 95, d = 0;
  for (const b of blocks) {
    const start = t.length;
    for (let i = 0; i < b.secs; i++) {
      const k = t.length;
      t.push(k);
      h += (b.hr - h) / 25 + (r() - 0.5) * 1.2;
      hr.push(Math.round(h));
      const v = b.speed > 0 ? Math.max(0, b.speed + (r() - 0.5) * 0.25) : 0;
      speed.push(Math.round(v * 1000) / 1000);
      d += v;
      dist.push(Math.round(d * 100) / 100);
      alt.push(Math.round((42 + 6 * Math.sin(k / 420) + 2 * Math.sin(k / 77)) * 100) / 100);
      cadence.push(b.cadence ? Math.round(b.cadence + (r() - 0.5) * 4) : b.speed > 0 ? 60 : null);
    }
    laps.push({ startS: start, endS: t.length, trigger: "manual", intensity: b.intensity ?? "active", watch: null });
  }
  return {
    stream: {
      t, timer: t.slice(), hr, speed, dist, alt, cadence,
      power: null, lat: null, lon: null, vosc: null, stance: null, vratio: null, stepLen: null, temp: null,
    },
    laps,
  };
}

function detail(startedAt, sport, built) {
  return {
    source: "fit",
    started_at: startedAt.toISOString(),
    utc_offset_s: UTC_OFFSET_S,
    sport,
    stream: built.stream,
    laps: built.laps,
    sets: [],
    splits: [],
    watch_time_in_zone: [],
    device: { manufacturer: 1, product: null, productName: DEVICE },
  };
}

async function upsertActivity(sb, ATH, { externalId, startedAt, sport, built }) {
  const s = built.stream;
  const n = s.t.length;
  const hrs = s.hr.filter((x) => x !== null);
  const distance = s.dist[n - 1];
  const row = {
    athlete_id: ATH, source: "garmin", external_id: externalId, started_at: startedAt.toISOString(),
    local_date: ymd(new Date(startedAt.getTime() + UTC_OFFSET_S * 1000)), sport, duration_s: n,
    distance_m: distance, elevation_gain_m: 18, avg_hr: Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length),
    max_hr: Math.max(...hrs), avg_pace_s_per_km: distance > 0 ? Math.round(n / (distance / 1000)) : null,
    calories: Math.round(n * 0.2), device_name: DEVICE,
  };
  const a = await must(
    sb.from("provider_activities").upsert(row, { onConflict: "athlete_id,source,external_id" }).select("id").single(),
    `activité ${externalId}`,
  );
  await must(sb.rpc("activity_detail_upsert", { p_activity: a.id, p_detail: detail(startedAt, sport, built) }), `détail ${externalId}`);
  return a.id;
}

/** Course seuil 4×6 min rattachée à la dernière séance « Seuil » faite. */
async function seedRun(sb, ATH, COACH) {
  const asg = await must(
    sb.from("energy_session_assignments").select("id, scheduled_date, energy_sessions!inner(name)")
      .eq("athlete_id", ATH).eq("status", "completed").eq("energy_sessions.name", "Seuil 4×6 min")
      .order("scheduled_date", { ascending: false }).limit(1),
    "séance seuil",
  );
  const day = asg[0]?.scheduled_date ?? ymd(addDays(new Date(), -2));
  const blocks = [{ secs: 720, speed: 2.9, hr: 138, cadence: 166, intensity: "warmup" }];
  for (let i = 0; i < 4; i++) {
    blocks.push({ secs: 360, speed: 4.0, hr: 172, cadence: 180 });
    blocks.push({ secs: 120, speed: 2.6, hr: 145, cadence: 162, intensity: "recovery" });
  }
  blocks.push({ secs: 600, speed: 2.7, hr: 140, cadence: 164, intensity: "cooldown" });
  const startedAt = new Date(`${day}T17:30:00Z`);
  return upsertActivity(sb, ATH, { externalId: `demo-run-${day}`, startedAt, sport: "running", built: buildStream(blocks, 41) });
}

/** Séance HYROX prévue (créée si absente) + activité de 12 tours, deux jours avant aujourd'hui. */
async function seedHyrox(sb, ATH, COACH) {
  const name = "HYROX simulation 4 tours";
  let es = (await must(sb.from("energy_sessions").select("id").eq("athlete_id", ATH).eq("name", name).limit(1), "séance HYROX"))[0];
  if (!es) {
    es = await must(sb.from("energy_sessions").insert({
      name, session_kind: "specifique", sport_id: HYROX_SPORT_ID, structure_type: "fractionne", format: "wod",
      created_by: COACH, athlete_id: ATH, total_duration_s: 30 * 60,
      intervals: [{
        type: "group", id: crypto.randomUUID(), role: "work", repeat: 4, children: [
          { type: "exercise", id: crypto.randomUUID(), role: "work", exercise_id: EX_RUN, exercise_name: "Course", duration: { kind: "distance", value: 1000 } },
          { type: "exercise", id: crypto.randomUUID(), role: "work", exercise_id: EX_SLED_PUSH, exercise_name: "Sled Push", duration: { kind: "distance", value: 25 }, weight_kg: 102 },
          { type: "exercise", id: crypto.randomUUID(), role: "work", exercise_id: EX_WALL_BALL, exercise_name: "Wall balls", reps_min: 20, reps_max: 20, weight_kg: 6 },
        ],
      }],
      notes: "Enchaîner sans pause. Wall balls par séries de 10 si besoin.",
    }).select("id").single(), "séance HYROX");
  }
  const day = ymd(addDays(new Date(), -2));
  const existing = (await must(
    sb.from("energy_session_assignments").select("id").eq("athlete_id", ATH).eq("energy_session_id", es.id).eq("scheduled_date", day),
    "planning HYROX",
  ))[0];
  if (!existing) {
    await must(sb.from("energy_session_assignments").insert({
      athlete_id: ATH, coach_id: COACH, energy_session_id: es.id, scheduled_date: day, status: "completed", rpe_score: 8, actual_duration_min: 31,
    }), "planning HYROX");
  }
  const blocks = [];
  for (let i = 0; i < 4; i++) {
    blocks.push({ secs: 270 + i * 6, speed: 3.7 - i * 0.05, hr: 168, cadence: 178 });
    blocks.push({ secs: 70 + i * 4, speed: 0.36, hr: 176, cadence: null });
    blocks.push({ secs: 55 + i * 3, speed: 0, hr: 172, cadence: null });
  }
  const startedAt = new Date(`${day}T07:15:00Z`);
  return upsertActivity(sb, ATH, { externalId: `demo-hyrox-${day}`, startedAt, sport: "hyrox", built: buildStream(blocks, 77) });
}

/** 7 jours de santé fictifs (nuit datée au jour du réveil). */
async function seedHealth(sb, ATH) {
  const r = rng(2031);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  let days = 0;
  for (let k = 7; k >= 1; k--) {
    const day = ymd(addDays(today, -k + 1));
    const merge = (kind, fields) => must(sb.rpc("provider_daily_merge", {
      p_athlete: ATH, p_source: "garmin", p_day: day, p_kind: kind, p_fields: fields, p_raw: null,
    }), `santé ${kind}`);
    const intraday = (measure, offsets, values) => must(sb.rpc("provider_intraday_merge", {
      p_athlete: ATH, p_source: "garmin", p_day: day, p_measure: measure, p_offsets: offsets, p_values: values,
      p_utc_offset_s: UTC_OFFSET_S,
    }), `séries ${measure}`);

    const deep = 70 + Math.round(r() * 40), rem = 85 + Math.round(r() * 30), awake = 10 + Math.round(r() * 15);
    const light = 230 + Math.round(r() * 40);
    const bedtime = -(60 + Math.round(r() * 50)) * 60; // 22 h 10 – 23 h (veille)
    const total = deep + rem + light;
    const wake = bedtime + (total + awake) * 60;
    const active = 450 + Math.round(r() * 450);
    await merge("dailies", {
      resting_hr: 46 + Math.round(r() * 5), hr_min: 44 + Math.round(r() * 3), hr_max: 150 + Math.round(r() * 30),
      hr_avg: 62 + Math.round(r() * 6), steps: 7000 + Math.round(r() * 7000), distance_m: 6000 + Math.round(r() * 5000),
      active_kcal: active, bmr_kcal: 1580, total_kcal: active + 1580,
      intensity_moderate_min: 20 + Math.round(r() * 30), intensity_vigorous_min: 10 + Math.round(r() * 40),
      stress_avg: 25 + Math.round(r() * 15), stress_max: 80 + Math.round(r() * 15),
      stress_rest_min: 600, stress_low_min: 300, stress_medium_min: 120, stress_high_min: 30,
      body_battery_charged: 55 + Math.round(r() * 25), body_battery_drained: 50 + Math.round(r() * 25),
    });
    await merge("sleeps", {
      sleep_total_min: total, sleep_deep_min: deep, sleep_rem_min: rem, sleep_light_min: light, sleep_awake_min: awake,
      sleep_start_at: new Date(Date.parse(`${day}T00:00:00Z`) + (bedtime - UTC_OFFSET_S) * 1000).toISOString(),
      sleep_end_at: new Date(Date.parse(`${day}T00:00:00Z`) + (wake - UTC_OFFSET_S) * 1000).toISOString(),
      sleep_score: 70 + Math.round(r() * 22),
      sleep_subscores: { stress: { qualifierKey: "GOOD" }, remPercentage: { value: Math.round((rem / total) * 100) } },
    });
    await merge("hrv", { hrv_ms: 48 + Math.round(r() * 14), hrv_peak_5min_ms: 70 + Math.round(r() * 20) });

    // Séries : FC chaque minute, stress / Body Battery toutes les 3 min, nuit (SpO2, respiration, VFC, phases).
    const hrO = [], hrV = [], stO = [], stV = [], bbO = [], bbV = [];
    let bb = 22 + Math.round(r() * 10);
    for (let s = 0; s < 86400; s += 60) {
      const asleep = s < wake;
      hrO.push(s);
      hrV.push(Math.round((asleep ? 50 : 72) + (r() - 0.5) * 8 + (s > 64800 && s < 68400 ? 70 : 0)));
      if (s % 180 === 0) {
        stO.push(s); stV.push(Math.max(0, Math.min(100, Math.round((asleep ? 12 : 32) + (r() - 0.5) * 20))));
        bb = Math.max(5, Math.min(100, bb + (asleep ? 0.35 + r() * 0.1 : -0.12 - r() * 0.04)));
        bbO.push(s); bbV.push(Math.round(bb));
      }
    }
    const nightO = [], spo2V = [], respV = [], hrvO = [], hrvV = [];
    for (let s = bedtime; s < wake; s += 60) {
      nightO.push(s);
      spo2V.push(Math.round(95 + (r() - 0.6) * 5));
      respV.push(Math.round((13.5 + (r() - 0.5) * 2) * 10) / 10);
      if ((s - bedtime) % 300 === 0) { hrvO.push(s); hrvV.push(Math.round(45 + r() * 25)); }
    }
    const stageO = [], stageV = [];
    const cycle = [[2, 0.45], [1, 0.25], [2, 0.1], [3, 0.2]];
    let at = bedtime;
    while (at < wake - 600) {
      for (const [code, share] of cycle) {
        if (at >= wake - 600) break;
        stageO.push(at); stageV.push(code);
        at += Math.round(90 * 60 * share);
      }
    }
    stageO.push(wake - 600); stageV.push(4);
    stageO.push(wake); stageV.push(0);

    await intraday("hr", hrO, hrV);
    await intraday("stress", stO, stV);
    await intraday("body_battery", bbO, bbV);
    await intraday("spo2", nightO, spo2V);
    await intraday("sleep_respiration", nightO, respV);
    await intraday("respiration", nightO, respV);
    await intraday("hrv", hrvO, hrvV);
    await intraday("sleep_stage", stageO, stageV);
    days++;
  }
  return days;
}

/** Zones FC à 3 niveaux (SV1 / SV2 fictifs) valides depuis un an. */
async function seedZones(sb, ATH) {
  const from = ymd(addDays(new Date(), -365));
  const has = await must(sb.from("hr_zone_models").select("id").eq("athlete_id", ATH).eq("status", "active").limit(1), "zones");
  if (has.length) return;
  await must(sb.from("hr_zone_models").insert({
    athlete_id: ATH, kind: "three", bounds: [158, 174], valid_from: from, status: "active", origin: "manual",
  }), "zones");
}

/** Ajoute (ou rafraîchit) la démo montre de Léa Démo. */
export async function seedWatchDemo(sb, ATH, COACH) {
  await seedZones(sb, ATH);
  const run = await seedRun(sb, ATH, COACH);
  const hyrox = await seedHyrox(sb, ATH, COACH);
  const days = await seedHealth(sb, ATH);
  console.log(`  montre : course ${run}, HYROX ${hyrox}, ${days} jours de santé`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const env = Object.fromEntries(
    fs.readFileSync(path.join(root, ".env"), "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
  const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const lea = (await must(sb.from("profiles").select("id, coach_id").eq("full_name", "Léa Démo").limit(2), "Léa Démo"));
  if (lea.length !== 1) throw new Error("Léa Démo introuvable (ou en double) : lancer scripts/seed-demo.mjs");
  const coach = (await must(sb.from("profiles").select("coach_code").eq("id", lea[0].coach_id).single(), "coach démo"));
  if (coach.coach_code !== "DEMO42") throw new Error("Le coach de Léa Démo n'est pas le coach démo : arrêt.");
  await seedWatchDemo(sb, lea[0].id, lea[0].coach_id);
}
