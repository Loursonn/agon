// Banc local de 20261115230000_rls_microcycles_fast.sql dans PGlite (Postgres en WASM), sans Docker
// ni prod : fonctions et policies exactes de la prod (lues dans supabase/tests/ci/schema.sql) sur des
// tables réduites aux colonnes utiles, données fictives aléatoires de toutes les formes (dont les
// cycles « mixtes »). Pour chaque graine : ce que chaque utilisateur voit, modifie et peut insérer,
// avant puis après la migration, doit être identique ; puis supabase/tests/rls_microcycles_equivalence.sql
// est rejoué sur la même base. Si schema.sql contient déjà la migration, le retour arrière
// (supabase/rollback/20261115230000_…) remet d'abord l'état « avant ».
// Usage, depuis la racine du dépôt :
//   npm i --no-save --no-package-lock --prefix supabase/tests @electric-sql/pglite@0.2.17
//   node supabase/tests/rls_microcycles_pglite.mjs 1 23      (graines 1 à 23)
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const MIG = "supabase/migrations/20261115230000_rls_microcycles_fast.sql";
const ROLLBACK = "supabase/rollback/20261115230000_rls_microcycles_fast.sql";
const TEST = "supabase/tests/rls_microcycles_equivalence.sql";
const SCHEMA = readFileSync("supabase/tests/ci/schema.sql", "utf8");

// Fonctions et policies de la prod, texte exact.
function extract() {
  const out = [];
  for (const f of ["is_coach_of", "is_co_coach_of", "i_am_coach", "i_am_staff", "can_coach_athlete",
                   "cycle_athlete_id", "mesocycle_athlete_id",
                   "rls_linked_to", "mesocycle_athlete_id_fast", "cycle_athlete_id_fast", "cycle_is_mixed"]) {
    const m = SCHEMA.match(new RegExp(`CREATE OR REPLACE FUNCTION "public"\\."${f}"\\([\\s\\S]*?\\n\\$\\$;\\n`));
    if (m) out.push(m[0]);
    else if (!f.includes("_fast") && f !== "rls_linked_to" && f !== "cycle_is_mixed") throw new Error(`fonction ${f} absente de schema.sql`);
  }
  const pol = /CREATE POLICY "[^"]+" ON "public"\."(cycles|macrocycles|mesocycles|microcycles)"[\s\S]*?;\n(?=\n|$)/g;
  const pols = SCHEMA.match(pol) ?? [];
  if (pols.length !== 20) throw new Error(`20 policies attendues, ${pols.length} trouvées`);
  return out.concat(pols).join("\n");
}
const migrated = /FUNCTION "public"\."cycle_athlete_id_fast"/.test(SCHEMA);

const [from = "1", to = from] = process.argv.slice(2);
let failed = 0;
for (let g = Number(from); g <= Number(to); g++) failed += await run(g);
console.log(failed ? `${failed} graine(s) en échec` : "toutes les graines : 0 écart");
process.exit(failed ? 1 : 0);

async function run(seedArg) {
let seed = seedArg;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rand() * a.length)];
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const base = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text, coach_id uuid, is_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now());
CREATE TABLE public.athlete_co_coaches(athlete_id uuid PRIMARY KEY, co_coach_id uuid, added_by uuid, added_by_role text);
CREATE TABLE public.athlete_staff(athlete_id uuid, staff_id uuid, status text DEFAULT 'active', permissions jsonb,
  profession text, added_by uuid, added_by_role text);
CREATE TABLE public.user_consents(user_id uuid, purpose text, granted boolean, doc_version text, statement text,
  seq bigint GENERATED ALWAYS AS IDENTITY);
CREATE VIEW public.current_consents AS SELECT DISTINCT ON (user_id, purpose) user_id, purpose, granted
  FROM public.user_consents ORDER BY user_id, purpose, seq DESC;
CREATE TABLE public.macrocycles(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, athlete_id uuid NOT NULL, coach_id uuid,
  name text NOT NULL, start_date date NOT NULL, end_date date NOT NULL);
CREATE TABLE public.mesocycles(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  macrocycle_id uuid NOT NULL REFERENCES public.macrocycles(id) ON DELETE CASCADE,
  name text NOT NULL, start_date date NOT NULL, end_date date NOT NULL);
CREATE TABLE public.cycles(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mesocycle_id uuid REFERENCES public.mesocycles(id) ON DELETE CASCADE, athlete_id uuid, coach_id uuid,
  name text NOT NULL, start_date date NOT NULL, end_date date NOT NULL);
CREATE TABLE public.microcycles(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_id uuid NOT NULL REFERENCES public.cycles(id) ON DELETE CASCADE, week_number smallint NOT NULL,
  start_date date NOT NULL, end_date date NOT NULL);
-- staff_can : corps de la prod, consentements réduits à une table.
CREATE FUNCTION public.staff_can(athlete_uuid uuid, domain text, level text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT athlete_uuid IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.athlete_staff s WHERE s.athlete_id = athlete_uuid AND s.staff_id = auth.uid()
         AND s.status = 'active'
         AND CASE level WHEN 'read' THEN s.permissions->>domain IN ('read','write')
                        WHEN 'write' THEN s.permissions->>domain = 'write' ELSE false END)
    AND EXISTS (SELECT 1 FROM public.current_consents c WHERE c.user_id = athlete_uuid
         AND c.purpose = 'staff_sharing' AND c.granted);
$$;
`;

const db = new PGlite();
await db.exec(base);
await db.exec(extract());
await db.exec(`
ALTER TABLE public.macrocycles ENABLE ROW LEVEL SECURITY; ALTER TABLE public.mesocycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cycles ENABLE ROW LEVEL SECURITY; ALTER TABLE public.microcycles ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public, auth TO anon, authenticated;`);

// ── Données fictives : 12 utilisateurs, liens aléatoires, cycles de toutes les formes ──────
const N = 12, users = [...Array(N)].map((_, i) => uid(i + 1));
const q = [];
users.forEach((u, i) => {
  const role = pick(["athlete", "athlete", "athlete", "coach", "coach_athlete"]);
  const coach = rand() < 0.7 ? pick(users) : null;
  q.push(`INSERT INTO profiles(id, role, coach_id, is_admin, created_at) VALUES ('${u}', '${role}', ${coach ? `'${coach}'` : "NULL"}, ${i === 0}, now() + interval '${i} min');`);
});
for (let k = 0; k < 6; k++) q.push(`INSERT INTO athlete_co_coaches(athlete_id, co_coach_id) VALUES ('${pick(users)}', '${pick(users)}') ON CONFLICT DO NOTHING;`);
for (let k = 0; k < 8; k++) q.push(`INSERT INTO athlete_staff(athlete_id, staff_id, status, permissions) VALUES ('${pick(users)}', '${pick(users)}', '${pick(["active", "active", "revoked"])}', '{"planification": "${pick(["read", "write", "none"])}"}');`);
users.forEach((u) => { if (rand() < 0.6) q.push(`INSERT INTO user_consents(user_id, purpose, granted) VALUES ('${u}', 'staff_sharing', ${rand() < 0.8});`); });
const macros = [], mesos = [];
for (let k = 0; k < 8; k++) { const id = uid(1000 + k); macros.push(id); q.push(`INSERT INTO macrocycles(id, athlete_id, name, start_date, end_date) VALUES ('${id}', '${pick(users)}', 'm', '2030-01-01', '2030-06-01');`); }
for (let k = 0; k < 12; k++) { const id = uid(2000 + k); mesos.push(id); q.push(`INSERT INTO mesocycles(id, macrocycle_id, name, start_date, end_date) VALUES ('${id}', '${pick(macros)}', 'm', '2030-01-01', '2030-03-01');`); }
const cycles = [];
for (let k = 0; k < 40; k++) {
  const id = uid(3000 + k); cycles.push(id);
  const meso = rand() < 0.7 ? pick(mesos) : null, ath = rand() < 0.6 ? pick(users) : null;
  q.push(`INSERT INTO cycles(id, mesocycle_id, athlete_id, name, start_date, end_date) VALUES ('${id}', ${meso ? `'${meso}'` : "NULL"}, ${ath ? `'${ath}'` : "NULL"}, 'c', '2030-01-01', '2030-02-01');`);
}
cycles.forEach((c, k) => q.push(`INSERT INTO microcycles(cycle_id, week_number, start_date, end_date) VALUES ('${c}', 1, '2030-01-01', '2030-01-08');`));
await db.exec(q.join("\n"));

// ── Visibilité réelle et décisions d'écriture, par utilisateur ─────────────────────────────
async function snapshot() {
  const res = {};
  for (const u of [...users, null, uid(9999)]) {
    const claims = u ? JSON.stringify({ sub: u, role: "authenticated" }) : '{"role":"anon"}';
    const tx = db;
    await db.exec("BEGIN");
    const r = await (async () => {
      await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [claims]);
      await tx.exec(`SET LOCAL ROLE ${u ? "authenticated" : "anon"}`);
      const out = {};
      for (const t of ["cycles", "microcycles", "mesocycles", "macrocycles"])
        out[t] = (await tx.query(`SELECT id FROM public.${t} ORDER BY id`)).rows.map((x) => x.id).join(",");
      // écritures : UPDATE / DELETE touchent les lignes autorisées (comptées puis annulées)
      for (const t of ["cycles", "microcycles"]) {
        out[t + ":upd"] = (await tx.query(`WITH x AS (UPDATE public.${t} SET start_date = start_date RETURNING id) SELECT string_agg(id::text, ',' ORDER BY id) s FROM x`)).rows[0].s;
      }
      // INSERT : un microcycle par cycle, accepté ou refusé par la RLS
      const ins = [];
      for (const c of cycles) {
        try {
          await tx.exec(`SAVEPOINT s`);
          await tx.query(`INSERT INTO public.microcycles(cycle_id, week_number, start_date, end_date) VALUES ($1, 2, '2030-01-01', '2030-01-08')`, [c]);
          ins.push(c);
          await tx.exec(`ROLLBACK TO SAVEPOINT s`);
        } catch (e) {
          await tx.exec(`ROLLBACK TO SAVEPOINT s`);
          if (!/row-level security/.test(e.message)) throw e;
        }
      }
      out["microcycles:ins"] = ins.join(",");
      const cins = [];
      for (const [m, a] of [[null, u], ...mesos.map((m) => [m, null]), ...mesos.slice(0, 4).map((m) => [m, u])]) {
        try {
          await tx.exec(`SAVEPOINT s`);
          await tx.query(`INSERT INTO public.cycles(mesocycle_id, athlete_id, name, start_date, end_date) VALUES ($1, $2, 'x', '2030-01-01', '2030-02-01')`, [m, a]);
          cins.push(`${m}/${a}`);
          await tx.exec(`ROLLBACK TO SAVEPOINT s`);
        } catch (e) {
          await tx.exec(`ROLLBACK TO SAVEPOINT s`);
          if (!/row-level security/.test(e.message)) throw e;
        }
      }
      out["cycles:ins"] = cins.join(",");
      return out;
    })();
    await db.exec("ROLLBACK");
    res[u ?? "anon"] = r;
  }
  return res;
}

if (migrated) await db.exec(readFileSync(ROLLBACK, "utf8"));
const before = await snapshot();
await db.exec(readFileSync(MIG, "utf8"));
const after = await snapshot();

let diffs = 0, cells = 0, nonEmpty = 0;
for (const u of Object.keys(before)) {
  for (const k of Object.keys(before[u] ?? {})) {
    cells++;
    if ((before[u][k] ?? "") !== "" ) nonEmpty++;
    if ((before[u][k] ?? "") !== (after[u]?.[k] ?? "")) { diffs++; console.log("ÉCART", u, k); }
  }
}
console.log(`graine ${seedArg} : ${cells} comparaisons (${nonEmpty} non vides), ${diffs} écart(s)`);

// Le test SQL du dépôt, tel quel, sur cette base (migration appliquée).
const r = await db.exec(readFileSync(TEST, "utf8").replace(/^ROLLBACK;\s*$/m, ""));
const ko = r[r.length - 1].rows.filter((row) => !row.ok);
for (const row of ko) console.log("KO ", row.label);
await db.exec("ROLLBACK");
await db.close();
return diffs || ko.length ? 1 : 0;
}
