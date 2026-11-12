#!/usr/bin/env node
/**
 * Rattrapage P41 lot B : range en tables (activity_streams / laps / sets) le
 * détail des activités Garmin déjà reçues, depuis le brut (FIT de préférence,
 * sinon échantillons JSON) de provider_raw_records + bucket provider-raw.
 *
 * Idempotent (activity_detail_upsert). À blanc par défaut : décode tout et
 * affiche des compteurs, sans rien écrire. `--apply` pour écrire.
 * N'affiche aucune donnée d'athlète (seulement des nombres).
 *
 * Lit VITE_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env (jamais commité).
 * Node ≥ 23 (lecture directe des .ts partagés).
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  garminDetailFromRaw,
  rawDownloader,
  refreshGarminActivityDetail,
} from "../supabase/functions/_shared/providers/activityDetail.ts";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env"), "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const apply = process.argv.includes("--apply");
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const download = rawDownloader(sb);

const { data: acts, error } = await sb.from("provider_activities")
  .select("id, athlete_id, external_id").eq("source", "garmin");
if (error) throw error;

const counts = { activities: acts.length, fit: 0, json: 0, none: 0, stored: 0, errors: 0 };
for (const a of acts) {
  try {
    const d = await garminDetailFromRaw(sb, download, a.athlete_id, a.external_id);
    if (!d) {
      counts.none++;
      continue;
    }
    counts[d.source === "fit" ? "fit" : "json"]++;
    console.log(`  ${d.source.padEnd(11)} points=${d.stream.t.length} tours=${d.laps.length} séries=${d.sets.length}`);
    if (apply) {
      const r = await refreshGarminActivityDetail(sb, a.athlete_id, a.external_id, download);
      if (r === "stored") counts.stored++;
    }
  } catch (e) {
    counts.errors++;
    console.log(`  erreur : ${String(e instanceof Error ? e.message : e).slice(0, 120)}`);
  }
}
console.log(apply ? "APPLIQUÉ" : "À BLANC", JSON.stringify(counts));
