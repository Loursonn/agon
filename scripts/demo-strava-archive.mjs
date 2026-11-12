#!/usr/bin/env node
/**
 * Archive Strava FICTIVE de « Léa Démo » (P42 lot E), et vérification de
 * l'import fusionné. Jamais une vraie archive, jamais un vrai athlète.
 *
 * Contenu (3 derniers mois) : 30 sorties —
 *   - 5 déjà présentes « via Garmin » (résumé seul, sans courbe) : l'archive
 *     doit les compléter (titre, RPE, courbe FIT), pas les dupliquer ;
 *   - 3 sans fichier (saisies à la main dans Strava) : résumé seul ;
 *   - 2 en GPX, le reste en .fit.gz (moitié « montre Garmin », moitié autre) ;
 *   - 1 séance de muscu notée RPE 4 dans Strava, un jour où Léa a déjà saisi
 *     RPE 8 dans Agon : l'RPE d'Agon doit rester 8.
 *
 * Usage :
 *   node --experimental-transform-types scripts/demo-strava-archive.mjs --write [fichier.zip]
 *   node --experimental-transform-types scripts/demo-strava-archive.mjs --import   (écrit en base : Léa Démo seulement)
 *
 * `--import` : sorties Garmin fictives, puis l'archive importée DEUX fois avec
 * le même code que le navigateur (décodeurs @shared, merge_provider_activities),
 * puis contrôles : aucun doublon, 2e import 100 % « déjà complète », courbes
 * de meilleure qualité gardées, RPE d'Agon intact, IA exclue des sorties Garmin.
 * Rejouable. Lit VITE_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const UTC_OFFSET_S = 3600;
const RPE_DAY = "2026-10-21";
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => d.toISOString().slice(0, 10);

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// ─────────────────────────────── Plan des 30 sorties ─────────────────────────

const GARMIN = new Set([1, 6, 11, 16, 21]);
const NO_FILE = new Set([4, 9]);
const GPX = new Set([7, 19]);

export function plan(today = new Date()) {
  const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const out = [];
  for (let i = 0; i < 29; i++) {
    const day = new Date(base.getTime() - (88 - i * 3) * 86_400_000);
    const ride = i % 5 === 3;
    const start = new Date(day.getTime() + (ride ? 16 : 6) * 3_600_000 + 30 * 60_000);
    const kind = NO_FILE.has(i) ? "none" : GPX.has(i) ? "gpx" : "fit";
    out.push({
      i,
      stravaId: String(990_000_000 + i),
      start,
      type: NO_FILE.has(i) ? "Weight Training" : ride ? "Ride" : "Run",
      sport: NO_FILE.has(i) ? "training" : ride ? "cycling" : "running",
      durationS: NO_FILE.has(i) ? 3600 : ride ? 3600 : 1800 + (i % 4) * 600,
      speed: ride ? 7.5 : 2.8 + (i % 3) * 0.2,
      kind,
      garmin: GARMIN.has(i),
      manufacturer: GARMIN.has(i) || i % 2 === 0 ? 1 : 294,
      name: NO_FILE.has(i) ? "Renfo démo" : ride ? `Vélo démo ${i}` : `Footing démo ${i}`,
      description: i % 4 === 0 ? `Sortie fictive n° ${i}, "facile", jambes OK\nRAS` : "",
      rpe: 3 + (i % 6),
      gear: ride ? "Vélo démo" : i < 15 ? "Chaussures démo A" : "Chaussures démo B",
      commute: ride && i === 8,
    });
  }
  // La séance de muscu « déjà notée dans Agon » (RPE 8) : Strava dit 4.
  out.push({
    i: 29, stravaId: String(990_000_029), start: new Date(`${RPE_DAY}T16:30:00Z`), type: "Weight Training",
    sport: "training", durationS: 3600, speed: 0, kind: "none", garmin: false, manufacturer: 294,
    name: "Muscu démo", description: "", rpe: 4, gear: "", commute: false,
  });
  return out;
}

// ─────────────────────────────── Fichiers ────────────────────────────────────

const FIT_EPOCH_MS = 631_065_600_000;
const fitTs = (ms) => Math.round((ms - FIT_EPOCH_MS) / 1000);

/** FIT minimal mais conforme : file_id, records 1 Hz, lap, session, activity. */
function fitFile(a) {
  const bytes = [];
  const sizes = { 0: 1, 2: 1, 0x84: 2, 0x86: 4 };
  const def = (local, global, fields) => {
    bytes.push(0x40 | local, 0, 0, global & 0xff, global >> 8, fields.length);
    for (const [num, type] of fields) bytes.push(num, sizes[type], type);
  };
  const data = (local, fields, values) => {
    bytes.push(local);
    fields.forEach(([, type], k) => {
      const v = Math.max(0, Math.round(values[k]));
      for (let b = 0; b < sizes[type]; b++) bytes.push((v >>> (8 * b)) & 0xff);
    });
  };
  const U8 = 0x02, U16 = 0x84, U32 = 0x86, EN = 0x00;
  const t0 = a.start.getTime();
  const r = rng(Number(a.stravaId) % 100_000);

  const fileId = [[0, EN], [1, U16], [2, U16], [4, U32]];
  def(0, 0, fileId);
  data(0, fileId, [4, a.manufacturer, 3113, fitTs(t0)]);

  const rec = [[253, U32], [3, U8], [5, U32], [6, U16], [2, U16]];
  def(1, 20, rec);
  let d = 0, hr = 100, max = 0, sum = 0;
  for (let s = 0; s < a.durationS; s++) {
    const v = a.speed * (0.95 + r() * 0.1);
    d += v;
    hr += ((s < 300 ? 130 : 150) - hr) / 30 + (r() - 0.5);
    max = Math.max(max, hr);
    sum += hr;
    data(1, rec, [fitTs(t0 + s * 1000), hr, d * 100, v * 1000, (40 + 5 * Math.sin(s / 300) + 500) * 5]);
  }
  const lap = [[253, U32], [2, U32], [7, U32], [8, U32], [9, U32]];
  def(2, 19, lap);
  data(2, lap, [fitTs(t0 + a.durationS * 1000), fitTs(t0), a.durationS * 1000, a.durationS * 1000, d * 100]);
  const ses = [[253, U32], [2, U32], [5, EN], [7, U32], [8, U32], [9, U32], [11, U16], [16, U8], [17, U8], [22, U16], [23, U16]];
  def(3, 18, ses);
  data(3, ses, [fitTs(t0 + a.durationS * 1000), fitTs(t0), a.sport === "cycling" ? 2 : 1, a.durationS * 1000,
    a.durationS * 1000, d * 100, a.durationS * 0.2, sum / a.durationS, max, 25, 24]);
  const act = [[253, U32], [5, U32]];
  def(4, 34, act);
  data(4, act, [fitTs(t0 + a.durationS * 1000), fitTs(t0 + a.durationS * 1000) + UTC_OFFSET_S]);

  const out = new Uint8Array(12 + bytes.length);
  out[0] = 12; out[1] = 0x20; out[3] = 0x08;
  new DataView(out.buffer).setUint32(4, bytes.length, true);
  out.set([0x2e, 0x46, 0x49, 0x54], 8);
  out.set(bytes, 12);
  return out;
}

function gpxFile(a) {
  const r = rng(Number(a.stravaId) % 100_000);
  let lat = 45.18, pts = "";
  for (let s = 0; s < a.durationS; s += 5) {
    lat += (a.speed * 5 * (0.95 + r() * 0.1)) / 111_320;
    pts += `<trkpt lat="${lat.toFixed(6)}" lon="5.720000"><ele>${(210 + 4 * Math.sin(s / 200)).toFixed(1)}</ele>` +
      `<time>${new Date(a.start.getTime() + s * 1000).toISOString()}</time></trkpt>\n`;
  }
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
 <trk><name>${a.name}</name><type>running</type><trkseg>
${pts} </trkseg></trk>
</gpx>`);
}

const HEADER = ["Activity ID", "Activity Date", "Activity Name", "Activity Type", "Activity Description",
  "Elapsed Time", "Distance", "Max Heart Rate", "Relative Effort", "Commute", "Activity Private Note",
  "Activity Gear", "Filename", "Athlete Weight", "Bike Weight", "Elapsed Time", "Moving Time", "Distance",
  "Max Speed", "Average Speed", "Elevation Gain", "Elevation Loss", "Average Heart Rate", "Calories",
  "Perceived Exertion", "Commute"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const stravaDate = (d) => {
  const h = d.getUTCHours();
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${h % 12 || 12}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${h < 12 ? "AM" : "PM"}`;
};
const q = (v) => `"${String(v).replace(/"/g, '""')}"`;

function fileName(a) {
  return a.kind === "fit" ? `activities/${a.stravaId}.fit.gz` : a.kind === "gpx" ? `activities/${a.stravaId}.gpx` : "";
}

function csv(acts) {
  const rows = acts.map((a) => {
    const dist = a.kind === "none" ? 0 : a.durationS * a.speed;
    return [a.stravaId, stravaDate(a.start), a.name, a.type, a.description, a.durationS, (dist / 1000).toFixed(2),
      a.kind === "none" ? "" : 165, 40, a.commute ? "true" : "false", "NOTE PRIVÉE — NE PAS IMPORTER", a.gear,
      fileName(a), 58, "", a.durationS, a.durationS, dist.toFixed(1), (a.speed * 1.3).toFixed(2), a.speed.toFixed(2),
      a.kind === "none" ? "" : 25, a.kind === "none" ? "" : 24, a.kind === "none" ? "" : 140, Math.round(a.durationS * 0.2),
      a.rpe, a.commute ? "1.0" : "0.0"].map(q).join(",");
  });
  return Buffer.from([HEADER.map(q).join(","), ...rows].join("\n"));
}

/** Zip (deflate) écrit à la main : en-têtes locaux, répertoire central, fin. */
function zip(members) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const m of members) {
    const name = Buffer.from(m.name);
    const data = zlib.deflateRawSync(m.bytes);
    const crc = zlib.crc32(m.bytes);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(m.bytes.length, 22);
    local.writeUInt16LE(name.length, 26); name.copy(local, 30);
    locals.push(local, data);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(m.bytes.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42); name.copy(central, 46);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const size = centrals.reduce((n, c) => n + c.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(members.length, 8); end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

export function buildArchive(acts) {
  const members = [{ name: "activities.csv", bytes: csv(acts) }, { name: "profile.csv", bytes: Buffer.from("fictif\n") }];
  for (const a of acts) {
    if (a.kind === "fit") members.push({ name: fileName(a), bytes: zlib.gzipSync(fitFile(a)) });
    if (a.kind === "gpx") members.push({ name: fileName(a), bytes: gpxFile(a) });
  }
  return zip(members);
}

// ─────────────────────────────── Import et contrôles ─────────────────────────

async function must(p, label) {
  const { data, error } = await p;
  if (error) throw new Error(`${label} : ${error.message}`);
  return data;
}

/** Sorties « Garmin » fictives (résumé seul), déjà là avant l'archive. */
async function seedGarmin(sb, ATH, acts) {
  for (const a of acts.filter((x) => x.garmin)) {
    const start = new Date(a.start.getTime() + 40_000);
    const local = new Date(start.getTime() + UTC_OFFSET_S * 1000);
    await must(sb.rpc("merge_provider_activity", {
      p_athlete: ATH, p_source: "garmin", p_tag: "garmin",
      p_activity: {
        external_id: `demo-strava-garmin-${a.i}`, started_at: start.toISOString(), local_date: ymd(local),
        sport: a.sport, duration_s: a.durationS - 20, distance_m: Math.round(a.durationS * a.speed), avg_hr: 141,
        device_name: "Forerunner 265", origin_quality: "fit",
      },
    }), `Garmin fictif ${a.i}`);
  }
}

async function importArchive(sb, ATH, bytes) {
  const { openStravaArchive } = await import(`${ROOT}/supabase/functions/_shared/activityFiles/stravaArchive.ts`);
  const { bytesSource } = await import(`${ROOT}/supabase/functions/_shared/activityFiles/archive.ts`);
  const { detailPayload } = await import(`${ROOT}/supabase/functions/_shared/activityFiles/stream.ts`);
  const lib = await import(`${ROOT}/src/lib/activityImport.ts`);
  const report = lib.emptyReport();
  const { scan, items } = await openStravaArchive(bytesSource(new Uint8Array(bytes)), {
    withDetail: true, utcOffsetAt: () => UTC_OFFSET_S,
  });
  report.files = scan.files;
  report.csvError = scan.csvError;
  let batch = [];
  const flush = async () => {
    if (batch.length === 0) return;
    const res = await must(sb.rpc("merge_provider_activities", {
      p_athlete: ATH, p_source: "file_import", p_tag: "strava_archive",
      p_activities: batch.map((b) => lib.mergePayload(b.activity)),
    }), "fusion");
    for (let k = 0; k < batch.length; k++) {
      const r = lib.parseMergeResult(res[k]);
      lib.countResult(report, batch[k].name, r);
      if (lib.wantsDetail(batch[k].detail, r)) {
        await must(sb.rpc("activity_detail_upsert", { p_activity: r.id, p_detail: detailPayload(batch[k].detail) }), "courbe");
        report.detailsSaved++;
      }
    }
    batch = [];
  };
  for await (const it of items()) {
    if (it.kind === "rejected") report.rejected.push(it);
    else batch.push(it);
    if (batch.length >= 25) await flush();
  }
  await flush();
  return report;
}

async function verify(sb, ATH, acts, second) {
  const { sportsCompatible } = await import(`${ROOT}/supabase/functions/_shared/activityDedup.ts`);
  const from = ymd(new Date(Math.min(...acts.map((a) => a.start.getTime())) - 86_400_000));
  const rows = await must(sb.from("provider_activities")
    .select("id, source, external_id, started_at, sport, title, rpe, sources, origin_quality, ai_allowed, strava_activity_id, gear, commute")
    .eq("athlete_id", ATH).gte("local_date", from).order("started_at"), "lecture");
  const strava = rows.filter((r) => r.strava_activity_id?.startsWith("99000"));
  const streams = await must(sb.from("activity_streams").select("activity_id, normalized_from")
    .in("activity_id", strava.map((r) => r.id)), "courbes");
  const sq = new Map(streams.map((s) => [s.activity_id, s.normalized_from]));
  let dups = 0;
  for (let k = 1; k < rows.length; k++) {
    for (let j = k - 1; j >= 0 && Date.parse(rows[k].started_at) - Date.parse(rows[j].started_at) <= 120_000; j--) {
      if (sportsCompatible(rows[k].sport, rows[j].sport)) dups++;
    }
  }
  const wl = await must(sb.from("workout_logs").select("rpe_score").eq("athlete_id", ATH).eq("scheduled_date", RPE_DAY), "muscu");
  const byId = new Map(strava.map((r) => [r.strava_activity_id, r]));
  const g = acts.filter((a) => a.garmin).map((a) => byId.get(a.stravaId));
  const checks = [
    ["30 sorties de l'archive en base, une ligne chacune", strava.length === 30, `${strava.length}`],
    ["aucun doublon (±2 min, sport compatible)", dups === 0, `${dups}`],
    ["2e import : 100 % déjà complètes", second.created === 0 && second.merged === 0 && second.unchanged === 30 && second.rejected.length === 0,
      lib(second)],
    ["5 sorties Garmin complétées (source garmin, titre Strava, courbe FIT)",
      g.every((r) => r && r.source === "garmin" && r.sources.includes("strava_archive") && r.title && sq.get(r.id) === "fit"),
      g.map((r) => `${r?.source}/${sq.get(r?.id)}`).join(" ")],
    ["2 GPX : courbe GPX", acts.filter((a) => a.kind === "gpx").every((a) => sq.get(byId.get(a.stravaId)?.id) === "gpx"), ""],
    ["3 sans fichier : résumé seul, sans courbe",
      acts.filter((a) => a.kind === "none").every((a) => byId.get(a.stravaId)?.origin_quality === "summary" && !sq.has(byId.get(a.stravaId)?.id)), ""],
    [`RPE d'Agon intact le ${RPE_DAY} (8), RPE Strava gardé sur la sortie (4)`,
      wl.length > 0 && wl.every((w) => w.rpe_score === 8) && byId.get("990000029")?.rpe === 4,
      `${wl.map((w) => w.rpe_score).join(",")} / ${byId.get("990000029")?.rpe}`],
    ["IA exclue des sorties de montre Garmin", strava.filter((r) => !r.ai_allowed).length >= 15,
      `${strava.filter((r) => !r.ai_allowed).length} exclues`],
    ["note privée absente", !JSON.stringify(rows).includes("NOTE PRIVÉE"), ""],
  ];
  for (const [name, ok, detail] of checks) console.log(`${ok ? "OK  " : "ÉCHEC"} ${name}${detail ? ` (${detail})` : ""}`);
  return checks.every((c) => c[1]);
}

const lib = (r) => `${r.created} nouvelles · ${r.merged} complétées · ${r.unchanged} déjà complètes · ${r.rejected.length} erreurs`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const acts = plan();
  const archive = buildArchive(acts);
  const mode = process.argv[2];
  if (mode === "--write") {
    const out = process.argv[3] ?? path.join(os.tmpdir(), "lea-demo-strava-export.zip");
    fs.writeFileSync(out, archive);
    console.log(`archive fictive : ${out} (${Math.round(archive.length / 1024)} ko, ${acts.length} sorties)`);
  } else if (mode === "--import") {
    const env = Object.fromEntries(
      fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    );
    const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const lea = await must(sb.from("profiles").select("id, coach_id").eq("full_name", "Léa Démo").limit(2), "Léa Démo");
    if (lea.length !== 1) throw new Error("Léa Démo introuvable (ou en double) : lancer scripts/seed-demo.mjs");
    const coach = await must(sb.from("profiles").select("coach_code").eq("id", lea[0].coach_id).single(), "coach démo");
    if (coach.coach_code !== "DEMO42") throw new Error("Le coach de Léa Démo n'est pas le coach démo : arrêt.");
    const ATH = lea[0].id;
    await seedGarmin(sb, ATH, acts);
    const first = await importArchive(sb, ATH, archive);
    console.log(`1er import : ${lib(first)} · ${first.detailsSaved} courbes`);
    const second = await importArchive(sb, ATH, archive);
    console.log(`2e import  : ${lib(second)} · ${second.detailsSaved} courbes`);
    const ok = await verify(sb, ATH, acts, second);
    process.exit(ok ? 0 : 1);
  } else {
    console.log("usage : --write [fichier.zip] | --import");
  }
}
