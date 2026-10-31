// Tests de la migration 20261101130000_hyrox_tests.sql dans PGlite (Postgres en WASM), sans Docker.
// Rejoue les migrations dont elle dépend sur un Supabase minimal (rôles, auth.uid(), storage),
// puis contrôle le seed, l'idempotence et la RLS (admin, coach, athlète, autre coach).
// Rien n'est envoyé à la base de production.
//
// Lancer depuis la racine du repo :
//   npm i --no-save @electric-sql/pglite@0.2.17
//   node supabase/tests/hyrox_tests_pglite.mjs supabase/migrations 32 24
// (32 = lignes de grille v1, 24 = règles v1 ; à changer si GRID_SET_V1 change)
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const M = process.argv[2];
const read = f => fs.readFileSync(`${M}/${f}`, "utf8");
const db = new PGlite();
let ok = 0, ko = 0;
const check = (label, cond, extra = "") => { if (cond) { ok++; console.log("  ✓", label); } else { ko++; console.log("  ✗", label, extra); } };
const expectErr = async (label, fn, re) => { try { await fn(); ko++; console.log("  ✗", label, "(pas d'erreur)"); } catch (e) { const m = String(e.message); if (!re || re.test(m)) { ok++; console.log("  ✓", label, "→", m.slice(0, 90)); } else { ko++; console.log("  ✗", label, m); } } };

// ── Environnement Supabase minimal
await db.exec(`
CREATE ROLE anon NOLOGIN; CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(name, '/') $$; CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text, coach_id uuid, is_admin boolean NOT NULL DEFAULT false,
  gender text, age int, weight_kg numeric, height_cm numeric, created_at timestamptz DEFAULT now());
CREATE TABLE public.competitions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
`);
const run = async f => { try { await db.exec(read(f)); console.log("ok   ", f); } catch (e) { console.log("FAIL ", f, e.message, "@", e.position); process.exit(2); } };
for (const f of ["20260427120300_rls_corrections.sql"]) {
  // seul is_coach_of nous intéresse
  const s = read(f); const i = s.indexOf("CREATE OR REPLACE FUNCTION public.is_coach_of"); const j = s.indexOf("GRANT EXECUTE ON FUNCTION public.is_coach_of(uuid) TO authenticated;");
  await db.exec(s.slice(i, j + 70)); console.log("ok    is_coach_of");
}
for (const f of ["20260419_energy_test_performance.sql", "20260430100000_test_definitions.sql", "20260512000000_test_presets_categories.sql",
  "20260513000000_test_session_sync_trigger.sql", "20260514000000_test_presets_coach_editable.sql", "20260515000000_test_fill_mode.sql",
  "20260516000000_test_scale5.sql", "20260519000000_test_extrapolation.sql", "20261013200000_hyrox_module.sql"]) await run(f);
await db.exec("GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;");
await run("20261101130000_hyrox_tests.sql");
console.log("Rejeu (idempotence)"); await run("20261101130000_hyrox_tests.sql");
await db.exec("GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;");

const one = async (q, p) => (await db.query(q, p)).rows[0];
console.log("\nSeed et presets");
check("1 version active (v1)", (await one("select count(*)::int n from hyrox_test_grid_versions where active")).n === 1);
const g = await one("select count(*)::int n from hyrox_test_grids where version='v1'"); check(`grilles v1 : ${g.n} lignes`, g.n === Number(process.argv[3]));
const r = await one("select count(*)::int n, count(*) filter (where to_recalibrate)::int rc from hyrox_work_axes_rules where version='v1'"); check(`règles v1 : ${r.n} (dont ${r.rc} à recaler)`, r.n === Number(process.argv[4]) && r.rc === 4);
check("params scoring + running + axes", (await one("select (select count(*) from hyrox_test_params where version='v1')::int a, (select count(*) from hyrox_axes_params)::int b")).a === 2);
const p = await one("select count(*) filter (where battery='hyrox_v3')::int v3, count(*) filter (where battery='hyrox_legacy')::int leg, count(*) filter (where category='hyrox')::int tot from test_definitions");
check(`presets : ${p.v3} v3, ${p.leg} anciens gardés, ${p.tot} au total`, p.v3 === 21 && p.leg === 10 && p.tot === 31);
const vars = await one("select count(*)::int n from test_variables v join test_definitions d on d.id=v.test_definition_id where d.battery='hyrox_v3'");
check(`variables v3 : ${vars.n}`, vars.n > 60);
check("w1 : 12 tronçons + rpe + FC par sled", (await one("select count(*)::int n from test_variables where test_definition_id='00000000-0000-0000-0000-0000000000e4'")).n === 14);

// ── Comptes
const U = { admin: "a0000000-0000-0000-0000-000000000001", coach: "c0000000-0000-0000-0000-000000000001", ath: "b0000000-0000-0000-0000-000000000001",
  coach2: "c0000000-0000-0000-0000-000000000002", ath2: "b0000000-0000-0000-0000-000000000002" };
await db.exec(`insert into profiles(id, role, coach_id, is_admin, gender) values
 ('${U.admin}','coach',null,true,'male'), ('${U.coach}','coach',null,false,'male'), ('${U.ath}','athlete','${U.coach}',false,'male'),
 ('${U.coach2}','coach',null,false,'female'), ('${U.ath2}','athlete','${U.coach2}',false,'female');`);
const as = async (who, q, params) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${U[who]}', false);`);
  try { return await db.query(q, params); } finally { await db.exec("reset role;"); }
};
const ins = `insert into hyrox_test_analyses(athlete_id, kind, date, inputs, profile, outputs, algo_version, grid_version) values ($1,'bilan','2026-11-02','{"dead_hang_s":75}','{"sex":"H","category":"Open"}','{"x":1}','hyrox-tests@1.0.0','v1') returning id`;

console.log("\nRLS analyses");
const a1 = (await as("coach", ins, [U.ath])).rows[0].id; check("le coach crée l'analyse de son athlète", !!a1);
await expectErr("l'athlète ne crée pas d'analyse", () => as("ath", ins, [U.ath]), /row-level security/);
await expectErr("un autre coach ne crée pas d'analyse pour cet athlète", () => as("coach2", ins, [U.ath]), /row-level security/);
check("l'athlète ne voit pas une analyse non validée", (await as("ath", "select * from hyrox_test_analyses")).rows.length === 0);
check("un autre coach ne la voit pas", (await as("coach2", "select * from hyrox_test_analyses")).rows.length === 0);
check("l'admin la voit", (await as("admin", "select * from hyrox_test_analyses")).rows.length === 1);
await expectErr("analyse figée : inputs non modifiables", () => as("coach", "update hyrox_test_analyses set inputs='{}' where id=$1", [a1]), /figée/);
await expectErr("validation sans axes validés refusée", () => as("coach", "update hyrox_test_analyses set validated_at=now() where id=$1", [a1]), /check/i);
await as("coach", "insert into hyrox_test_axes_drafts(analysis_id, context, axes_plan) values ($1, '{\"pain\":true}', '{\"draft\":1}')", [a1]);
check("le coach écrit le brouillon", (await as("coach", "select * from hyrox_test_axes_drafts")).rows.length === 1);
check("l'athlète ne voit jamais le brouillon", (await as("ath", "select * from hyrox_test_axes_drafts")).rows.length === 0);
await expectErr("l'athlète n'écrit pas de brouillon", () => as("ath", "update hyrox_test_axes_drafts set context='{}' where analysis_id=$1 returning 1", [a1]).then(r => { if (!r.rows.length) throw new Error("row-level security: 0 ligne"); }), /row-level/);
const upd = await as("ath", "update hyrox_test_analyses set validated_at=now(), axes_validated='{}' where id=$1 returning id", [a1]);
check("l'athlète ne se valide pas lui-même", upd.rows.length === 0);
await as("coach", "update hyrox_test_analyses set validated_at=now(), validated_by=$2, axes_validated='{\"principal1\":\"Course\"}', target_s=5400 where id=$1", [a1, U.coach]);
const seen = (await as("ath", "select axes_validated from hyrox_test_analyses")).rows;
check("après validation, l'athlète voit l'analyse et les axes validés", seen.length === 1 && seen[0].axes_validated.principal1 === "Course");
const a2 = (await as("coach", ins.replace("returning id", "returning id").replace("'v1') returning", "'v1') returning"), [U.ath])).rows[0].id;
await as("coach", "select 1"); 
const re = await as("coach", "insert into hyrox_test_analyses(athlete_id, kind, date, inputs, profile, outputs, algo_version, grid_version, recalculated_from) select athlete_id, kind, date, inputs, profile, '{\"x\":2}', algo_version, grid_version, id from hyrox_test_analyses where id=$1 returning id", [a1]);
check("recalcul = nouvelle ligne, l'ancienne reste", re.rows.length === 1 && (await as("admin", "select count(*)::int n from hyrox_test_analyses")).rows[0].n === 3);

console.log("\nRLS grilles");
await expectErr("un coach n'écrit pas les grilles", () => as("coach", "insert into hyrox_test_grid_versions(version) values ('v2')"), /row-level security/);
check("tout authentifié lit les règles", (await as("ath", "select count(*)::int n from hyrox_work_axes_rules")).rows[0].n > 0);
await as("admin", "insert into hyrox_test_grid_versions(version, active) values ('v2', false)");
check("l'admin crée une version v2", true);
await expectErr("deux versions actives refusées", () => as("admin", "update hyrox_test_grid_versions set active=true where version='v2'"), /unique|duplicate/i);
await expectErr("grille à 3 bornes refusée", () => as("admin", "insert into hyrox_test_grids(version, metric_key, axis, thresholds, direction, source) values ('v2','vma','cardio',ARRAY[1,2,3],'higher','ma méthode')"), /check/i);

console.log("\nProfil et courses");
await db.exec(`update profiles set hyrox_category='pro' where id='${U.ath}'`);
await expectErr("catégorie inconnue refusée", () => db.exec(`update profiles set hyrox_category='elite' where id='${U.ath}'`), /check/i);
await db.exec(`insert into hyrox_results(athlete_id, date, event_name, division, total_s, top_pct_overall, roxzone_top_pct, roxzone_cause) values ('${U.ath}','2026-10-01','HYROX Paris','men',5400,30,55,'orga')`);
check("course avec top % et cause Roxzone", true);

console.log("\nSynchro des saisies (trigger existant)");
await db.exec(`insert into test_sessions(athlete_id, date, title, completed, results_structured) values ('${U.ath}','2026-11-07','Wall balls 5 min', true, '{"variables":{"min_1":22,"min_2":19,"total":86,"no_reps":3}}')`);
const sv = await one(`select count(*)::int n from athlete_test_values v join athlete_test_results r on r.id=v.result_id where r.athlete_id='${U.ath}'`);
check(`une séance « Wall balls 5 min » remplie alimente athlete_test_values (${sv.n} valeurs)`, sv.n === 4);

console.log(`\n${ok} OK, ${ko} KO`);
process.exit(ko ? 1 : 0);
