#!/usr/bin/env node
/**
 * Rattrapage P41 lot G : range en tables la santé Garmin déjà reçue, depuis le
 * brut de provider_raw_records :
 * - champs du jour étendus (provider_daily_merge, liste blanche) ;
 * - séries de la journée (provider_intraday_merge) ;
 * - activités détectées Move IQ (provider_moveiq).
 *
 * Rejoue les résumés dans l'ordre de réception (le plus récent l'emporte, comme
 * à la réception). Idempotent. À blanc par défaut : décode tout et affiche des
 * compteurs, sans rien écrire. `--apply` pour écrire (met à jour des lignes
 * existantes de provider_dailies : accord d'Hugo requis).
 * N'affiche aucune donnée d'athlète (seulement des nombres).
 *
 * Lit VITE_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env (jamais commité).
 * Node ≥ 23 (lecture directe des .ts partagés).
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  HEALTH_DAILY_TYPES,
  mapGarminDaily,
  mapGarminIntraday,
  mapGarminMoveIQ,
} from "../supabase/functions/_shared/providers/garminHealth.ts";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env"), "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const apply = process.argv.includes("--apply");
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const types = [...HEALTH_DAILY_TYPES, "moveIQActivities"];
const counts = { records: 0, daily: 0, noDay: 0, series: 0, points: 0, moveiq: 0, errors: 0 };
const byType = {};
const PAGE = 500;

for (let from = 0; ; from += PAGE) {
  const { data, error } = await sb.from("provider_raw_records")
    .select("id, athlete_id, summary_type, payload")
    .eq("source", "garmin").in("summary_type", types)
    .order("received_at", { ascending: true }).order("id", { ascending: true })
    .range(from, from + PAGE - 1);
  if (error) throw error;
  for (const r of data) {
    counts.records++;
    byType[r.summary_type] = (byType[r.summary_type] ?? 0) + 1;
    const e = r.payload ?? {};
    try {
      if (r.summary_type === "moveIQActivities") {
        const m = mapGarminMoveIQ(e);
        if (!m) continue;
        counts.moveiq++;
        if (apply) {
          const { error: err } = await sb.from("provider_moveiq")
            .upsert({ athlete_id: r.athlete_id, ...m }, { onConflict: "athlete_id,source,external_id" });
          if (err) throw err;
        }
        continue;
      }
      const d = mapGarminDaily(r.summary_type, e);
      if (!d) {
        counts.noDay++;
        continue;
      }
      counts.daily++;
      if (apply) {
        const { error: err } = await sb.rpc("provider_daily_merge", {
          p_athlete: r.athlete_id, p_source: "garmin", p_day: d.day, p_kind: d.kind, p_fields: d.fields, p_raw: d.raw,
        });
        if (err) throw err;
      }
      for (const s of mapGarminIntraday(r.summary_type, e)) {
        counts.series++;
        counts.points += s.offsets.length;
        if (apply) {
          const { error: err } = await sb.rpc("provider_intraday_merge", {
            p_athlete: r.athlete_id, p_source: "garmin", p_day: s.day, p_measure: s.measure,
            p_offsets: s.offsets, p_values: s.values, p_utc_offset_s: s.utcOffsetS,
          });
          if (err) throw err;
        }
      }
    } catch (err) {
      counts.errors++;
      console.log(`  erreur (${r.summary_type}) : ${String(err?.message ?? err).slice(0, 120)}`);
    }
  }
  if (data.length < PAGE) break;
}
console.log("par type", JSON.stringify(byType));
console.log(apply ? "APPLIQUÉ" : "À BLANC", JSON.stringify(counts));
